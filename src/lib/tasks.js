export const STORAGE_KEY = 'shixu.tasks.v1'
export const TITLE_LIMIT = 100
export const NOTES_LIMIT = 1000

export function validateFields(title, notes = '') {
  if (typeof title !== 'string' || !title.trim()) throw new Error('请填写任务标题。')
  if (title.trim().length > TITLE_LIMIT) throw new Error(`标题最多 ${TITLE_LIMIT} 个字符。`)
  if (typeof notes !== 'string' || notes.length > NOTES_LIMIT) throw new Error(`备注最多 ${NOTES_LIMIT} 个字符。`)
  return { title: title.trim(), notes: notes.trim() }
}

export function createTask(title, notes = '') {
  return {
    id: crypto.randomUUID(),
    ...validateFields(title, notes),
    completed: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export function editTask(tasks, id, title, notes = '') {
  const fields = validateFields(title, notes)
  if (!tasks.some(task => task.id === id)) throw new Error('这项任务已不存在，请刷新后重试。')
  return tasks.map(task => task.id === id ? { ...task, ...fields, updatedAt: new Date().toISOString() } : task)
}

export function toggleTask(tasks, id) {
  return tasks.map(task => task.id === id ? { ...task, completed: !task.completed, updatedAt: new Date().toISOString() } : task)
}

export function deleteTask(tasks, id) {
  return tasks.filter(task => task.id !== id)
}

// 同一套校验用于浏览器存储和备份导入，避免损坏的数据覆盖现有任务。
export function parseTasks(text) {
  let data
  try { data = JSON.parse(text) } catch { throw new Error('数据不是有效的 JSON 文件。') }
  if (data?.version !== 1 || !Array.isArray(data.tasks)) throw new Error('不支持的数据格式，请选择拾序导出的备份。')
  const ids = new Set()
  return data.tasks.map(task => {
    if (!task || typeof task.id !== 'string' || !task.id || ids.has(task.id)
      || typeof task.completed !== 'boolean'
      || typeof task.createdAt !== 'string' || !Number.isFinite(Date.parse(task.createdAt))
      || typeof task.updatedAt !== 'string' || !Number.isFinite(Date.parse(task.updatedAt))) {
      throw new Error('任务数据不完整或包含重复编号，未导入任何任务。')
    }
    ids.add(task.id)
    return { id: task.id, ...validateFields(task.title, task.notes), completed: task.completed, createdAt: task.createdAt, updatedAt: task.updatedAt }
  })
}

export function serializeTasks(tasks) {
  return JSON.stringify({ version: 1, tasks }, null, 2)
}

export function loadTasks(storage) {
  const text = storage.getItem(STORAGE_KEY)
  return text === null ? [] : parseTasks(text)
}

export function saveTasks(storage, tasks) {
  storage.setItem(STORAGE_KEY, serializeTasks(tasks))
}

export function mergeTasks(current, incoming) {
  const ids = new Set(current.map(task => task.id))
  return [...incoming.filter(task => !ids.has(task.id)), ...current]
}
