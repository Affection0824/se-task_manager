import test from 'node:test'
import assert from 'node:assert/strict'
import { createTask, editTask, setTaskStatus, deleteTask, parseTasks, serializeTasks, loadTasks, saveTasks, mergeTasks, STORAGE_KEY, STATUSES, PRIORITIES } from '../src/lib/tasks.js'
import { loadTheme, saveTheme, THEME_KEY } from '../src/lib/theme.js'

const makeTask = (fields = {}) => createTask({ title: '课程实践', ...fields })
function memoryStorage(initial = []) {
  const map = new Map(initial)
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) }
}

test('标题必填，去除空格；描述可不填，长度有边界', () => {
  for (const title of ['', '  \n ', '字'.repeat(101), null]) assert.throws(() => makeTask({ title }))
  assert.equal(makeTask({ title: '  完成课程实践  ' }).title, '完成课程实践')
  assert.equal(makeTask().description, '')
  assert.equal(makeTask({ title: '字'.repeat(100) }).title.length, 100)
  assert.equal(makeTask({ description: '字'.repeat(1000) }).description.length, 1000)
  assert.throws(() => makeTask({ description: '字'.repeat(1001) }))
  assert.throws(() => makeTask({ description: {} }))
})

test('新任务默认待办、中优先级；三种状态和三档优先级均能持久化', () => {
  assert.equal(makeTask().status, 'todo')
  assert.equal(makeTask().priority, 'medium')
  const tasks = STATUSES.flatMap(status => PRIORITIES.map(priority => makeTask({ status: status.id, priority: priority.id })))
  const storage = memoryStorage()
  saveTasks(storage, tasks)
  assert.deepEqual(loadTasks(storage), tasks)
  for (const fields of [{ status: 'invalid' }, { priority: 'urgent' }, { status: null }, { priority: 1 }]) assert.throws(() => makeTask(fields))
})

test('编辑四个字段，保留编号、创建时间和其他任务；取消不污染原对象', () => {
  const first = makeTask({ title: '任务一', description: '原描述' })
  const second = makeTask({ title: '任务二' })
  const original = [first, second]
  const edited = editTask(original, first.id, { title: '新标题', description: '新描述', status: 'in_progress', priority: 'high' })
  assert.equal(edited[0].id, first.id)
  assert.equal(edited[0].createdAt, first.createdAt)
  assert.equal(edited[0].title, '新标题')
  assert.equal(edited[0].description, '新描述')
  assert.equal(edited[0].status, 'in_progress')
  assert.equal(edited[0].priority, 'high')
  assert.equal(edited[1], second)
  assert.equal(first.title, '任务一')
  assert.throws(() => editTask(original, first.id, { title: '   ' }))
  assert.throws(() => editTask(original, 'missing', { title: '标题' }))
})

test('拖拽对应的状态变更支持任意列往返，保留优先级与描述', () => {
  const task = makeTask({ priority: 'low', description: '完整描述' })
  let tasks = [task]
  for (const status of ['in_progress', 'done', 'todo', 'done', 'in_progress']) {
    tasks = setTaskStatus(tasks, task.id, status)
    assert.equal(tasks[0].status, status)
    assert.equal(tasks[0].priority, 'low')
    assert.equal(tasks[0].description, '完整描述')
    assert.equal(tasks[0].id, task.id)
  }
  assert.equal(setTaskStatus(tasks, task.id, 'in_progress'), tasks)
  assert.throws(() => setTaskStatus(tasks, task.id, 'invalid'))
  assert.throws(() => setTaskStatus(tasks, 'foreign-drag-id', 'todo'))
  assert.equal(task.status, 'todo')
})

test('删除仅影响目标任务，保存后不会因刷新复原', () => {
  const first = makeTask()
  const second = makeTask()
  const remaining = deleteTask([first, second], first.id)
  assert.deepEqual(remaining, [second])
  const storage = memoryStorage()
  saveTasks(storage, remaining)
  assert.deepEqual(loadTasks(storage), [second])
})

test('旧版数据迁移保留标题、备注、编号和日期；旧存储在读取时不会被覆盖', () => {
  const timestamp = '2026-09-22T08:00:00.000Z'
  const legacy = { version: 1, tasks: [false, true].map((completed, index) => ({ id: 'legacy-' + index, title: '旧任务' + index, notes: '保留旧备注', completed, createdAt: timestamp, updatedAt: timestamp })) }
  const raw = JSON.stringify(legacy)
  const storage = memoryStorage([[STORAGE_KEY, raw]])
  const tasks = loadTasks(storage)
  assert.equal(tasks[0].status, 'todo')
  assert.equal(tasks[1].status, 'done')
  for (const task of tasks) {
    assert.equal(task.priority, 'medium')
    assert.equal(task.description, '保留旧备注')
    assert.equal(task.createdAt, timestamp)
  }
  assert.equal(tasks[0].id, 'legacy-0')
  assert.equal(storage.getItem(STORAGE_KEY), raw)
  saveTasks(storage, tasks)
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).version, 2)
  assert.deepEqual(loadTasks(storage), tasks)
})

test('损坏的备份、错误字段、未知版本和重复编号均被拒绝', () => {
  const task = makeTask()
  const invalid = ['not json', '{}', '{"version":3,"tasks":[]}', serializeTasks([task, task]), serializeTasks([{ ...task, createdAt: 'invalid' }]), serializeTasks([{ ...task, title: ' ' }]), serializeTasks([{ ...task, status: 'ready' }]), serializeTasks([{ ...task, priority: undefined }])]
  invalid.push(JSON.stringify({ version: 1, tasks: [{ ...task, completed: 'yes' }] }))
  for (const data of invalid) assert.throws(() => parseTasks(data))
  const storage = memoryStorage([[STORAGE_KEY, 'broken data']])
  assert.throws(() => loadTasks(storage))
  assert.equal(storage.getItem(STORAGE_KEY), 'broken data')
})

test('存储失败会抛出错误，不会被当作已保存；空存储返回空列表', () => {
  const storage = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('quota') } }
  assert.deepEqual(loadTasks(memoryStorage()), [])
  assert.throws(() => loadTasks(storage), /blocked/)
  assert.throws(() => saveTasks(storage, [makeTask()]), /quota/)
})

test('导入合并保留当前版本，重复导入不产生副本', () => {
  const existing = makeTask({ title: '最新标题', status: 'in_progress', priority: 'high' })
  const incoming = makeTask({ title: '来自备份', priority: 'low' })
  const merged = mergeTasks([existing], [{ ...existing, title: '旧标题' }, incoming])
  assert.deepEqual(merged, [incoming, existing])
  assert.deepEqual(mergeTasks(merged, [incoming]), merged)
  assert.deepEqual(parseTasks(serializeTasks(merged)), merged)
})

test('深浅主题选择可持久化；未知值回退浅色，存储失败不静默', () => {
  const storage = memoryStorage()
  assert.equal(loadTheme(storage), 'light')
  saveTheme(storage, 'dark')
  assert.equal(loadTheme(storage), 'dark')
  saveTheme(storage, 'light')
  assert.equal(loadTheme(storage), 'light')
  storage.setItem(THEME_KEY, 'unknown')
  assert.equal(loadTheme(storage), 'light')
  assert.throws(() => saveTheme(storage, 'unknown'))
  assert.throws(() => saveTheme({ setItem() { throw new Error('blocked') } }, 'dark'), /blocked/)
})
