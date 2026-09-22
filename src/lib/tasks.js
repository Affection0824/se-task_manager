// 保留原存储键，读取时按数据版本迁移；首次成功保存才写入新版格式。
export const STORAGE_KEY = 'shixu.tasks.v1'
export const TITLE_LIMIT = 100
export const DESCRIPTION_LIMIT = 1000
export const STATUSES = [
  { id: 'todo', label: '待办', icon: 'circle', hint: '把想法，变成下一步' },
  { id: 'in_progress', label: '进行中', icon: 'progress', hint: '保持专注，稳步向前' },
  { id: 'done', label: '完成', icon: 'done', hint: '每一小步，都算数' },
]
export const PRIORITIES = [
  { id: 'high', label: '高', color: '红' },
  { id: 'medium', label: '中', color: '黄' },
  { id: 'low', label: '低', color: '绿' },
]

export function validateFields({ title, description = '', status = 'todo', priority = 'medium' }) {
  if (typeof title !== 'string' || !title.trim()) throw new Error('请填写任务标题。')
  if (title.trim().length > TITLE_LIMIT) throw new Error(`标题最多 ${TITLE_LIMIT} 个字符。`)
  if (typeof description !== 'string' || description.length > DESCRIPTION_LIMIT) throw new Error(`描述最多 ${DESCRIPTION_LIMIT} 个字符。`)
  if (!STATUSES.some(item => item.id === status)) throw new Error('请选择有效的任务状态。')
  if (!PRIORITIES.some(item => item.id === priority)) throw new Error('请选择有效的优先级。')
  return { title: title.trim(), description: description.trim(), status, priority }
}

export function createTask(fields) {
  const timestamp = new Date().toISOString()
  return { id: crypto.randomUUID(), ...validateFields(fields), createdAt: timestamp, updatedAt: timestamp }
}

export function editTask(tasks, id, fields) {
  const validated = validateFields(fields)
  if (!tasks.some(task => task.id === id)) throw new Error('这项任务已不存在，请刷新后重试。')
  return tasks.map(task => task.id === id ? { ...task, ...validated, updatedAt: new Date().toISOString() } : task)
}

export function setTaskStatus(tasks, id, status) {
  const task = tasks.find(item => item.id === id)
  if (!task) throw new Error('这项任务已不存在，请刷新后重试。')
  if (task.status === status) return tasks
  return editTask(tasks, id, { ...task, status })
}

export function deleteTask(tasks, id) {
  return tasks.filter(task => task.id !== id)
}

// 旧备份和已有 localStorage 数据使用相同的迁移和校验入口。
export function parseTasks(text) {
  let data
  try { data = JSON.parse(text) } catch { throw new Error('数据不是有效的 JSON 文件。') }
  if (![1, 2].includes(data?.version) || !Array.isArray(data.tasks)) throw new Error('不支持的数据格式，请选择拾序导出的备份。')
  const ids = new Set()
  return data.tasks.map(task => {
    if (!task || typeof task.id !== 'string' || !task.id || ids.has(task.id)
      || typeof task.createdAt !== 'string' || !Number.isFinite(Date.parse(task.createdAt))
      || typeof task.updatedAt !== 'string' || !Number.isFinite(Date.parse(task.updatedAt))) {
      throw new Error('任务数据不完整或包含重复编号，未导入任何任务。')
    }
    if (data.version === 1 && typeof task.completed !== 'boolean') throw new Error('旧版任务的完成状态无效。')
    if (data.version === 2 && (typeof task.status !== 'string' || typeof task.priority !== 'string')) throw new Error('任务缺少状态或优先级。')
    ids.add(task.id)
    const fields = data.version === 1
      ? { title: task.title, description: task.notes ?? '', status: task.completed ? 'done' : 'todo', priority: 'medium' }
      : task
    return { id: task.id, ...validateFields(fields), createdAt: task.createdAt, updatedAt: task.updatedAt }
  })
}

export function serializeTasks(tasks) {
  return JSON.stringify({ version: 2, tasks }, null, 2)
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
