import test from 'node:test'
import assert from 'node:assert/strict'
import { createTask, editTask, toggleTask, deleteTask, parseTasks, serializeTasks, loadTasks, saveTasks, mergeTasks, STORAGE_KEY } from '../src/lib/tasks.js'

test('标题必填，去除首尾空格并限制长度', () => {
  for (const title of ['', '  \n ', '字'.repeat(101), null]) assert.throws(() => createTask(title))
  assert.equal(createTask('  完成课程实践  ').title, '完成课程实践')
  assert.throws(() => createTask('任务', '字'.repeat(1001)))
})

test('新增、修改、完成、删除保持任务编号和其他任务不变', () => {
  const first = createTask('任务一', '旧备注')
  const second = createTask('任务二')
  const initial = [first, second]
  const edited = editTask(initial, first.id, '新标题', '新备注')
  assert.equal(edited[0].id, first.id)
  assert.equal(edited[0].createdAt, first.createdAt)
  assert.equal(edited[0].title, '新标题')
  assert.equal(edited[0].notes, '新备注')
  assert.equal(initial[0].title, '任务一')
  assert.throws(() => editTask(initial, first.id, '   '))
  assert.throws(() => editTask(initial, 'missing', '标题'))
  const completed = toggleTask(edited, first.id)
  assert.equal(completed[0].completed, true)
  assert.equal(toggleTask(completed, first.id)[0].completed, false)
  assert.deepEqual(deleteTask(completed, first.id), [second])
})

test('保存后重新读取，所有字段保持一致；空存储返回空列表', () => {
  const map = new Map()
  const storage = { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) }
  assert.deepEqual(loadTasks(storage), [])
  const tasks = [createTask('持久保存', '中文备注')]
  saveTasks(storage, tasks)
  assert.deepEqual(loadTasks(storage), tasks)
  assert.equal(map.has(STORAGE_KEY), true)
})

test('损坏的备份、错误字段和重复编号会被拒绝', () => {
  const task = createTask('完整任务')
  for (const data of ['not json', '{}', '{"version":2,"tasks":[]}', serializeTasks([task, task]), serializeTasks([{ ...task, completed: 'yes' }]), serializeTasks([{ ...task, createdAt: 'invalid' }]), serializeTasks([{ ...task, title: ' ' }])]) {
    assert.throws(() => parseTasks(data))
  }
})

test('存储不可用时抛出错误，让界面提示失败而不是显示已保存', () => {
  const storage = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('quota') } }
  assert.throws(() => loadTasks(storage), /blocked/)
  assert.throws(() => saveTasks(storage, [createTask('任务')]), /quota/)
})

test('导入合并保留当前版本，重复导入不产生副本', () => {
  const existing = createTask('最新标题')
  const incoming = createTask('来自备份')
  const merged = mergeTasks([existing], [{ ...existing, title: '旧标题' }, incoming])
  assert.deepEqual(merged, [incoming, existing])
  assert.deepEqual(mergeTasks(merged, [incoming]), merged)
  assert.deepEqual(parseTasks(serializeTasks(merged)), merged)
})
