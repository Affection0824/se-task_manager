<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import AppIcon from './components/AppIcon.vue'
import TaskCard from './components/TaskCard.vue'
import { createTask, editTask, setTaskStatus, deleteTask, loadTasks, saveTasks, serializeTasks, parseTasks, mergeTasks, STORAGE_KEY, STATUSES, PRIORITIES } from './lib/tasks.js'
import { THEME_KEY, loadTheme, saveTheme } from './lib/theme.js'

const tasks = ref([])
const storageError = ref('')
const readBlocked = ref(false)
const view = ref('board')
const activeStatus = ref('all')
const priorityFilter = ref('all')
const search = ref('')
const theme = ref(document.documentElement.dataset.theme || 'light')
const formDialog = ref(null)
const deleteDialog = ref(null)
const detailsDialog = ref(null)
const importInput = ref(null)
const boardElement = ref(null)
const editingId = ref(null)
const draft = ref({ title: '', description: '', status: 'todo', priority: 'medium' })
const formError = ref('')
const deleting = ref(null)
const detailId = ref(null)
const toast = ref('')
const draggedId = ref(null)
const dropTarget = ref(null)
const touchGhost = ref(null)
let toastTimer
let pointerDrag = null

const navigation = [{ id: 'all', label: '全部任务', icon: 'list' }, ...STATUSES]
const counts = computed(() => ({ all: tasks.value.length, ...Object.fromEntries(STATUSES.map(status => [status.id, tasks.value.filter(task => task.status === status.id).length])) }))
const progress = computed(() => tasks.value.length ? Math.round(counts.value.done / tasks.value.length * 100) : 0)
const filteredTasks = computed(() => tasks.value.filter(task => {
  const query = search.value.trim().toLocaleLowerCase()
  return (activeStatus.value === 'all' || task.status === activeStatus.value)
    && (priorityFilter.value === 'all' || task.priority === priorityFilter.value)
    && (!query || `${task.title} ${task.description}`.toLocaleLowerCase().includes(query))
}))
const columns = computed(() => STATUSES.map(status => ({ ...status, tasks: filteredTasks.value.filter(task => task.status === status.id) })))
const detail = computed(() => tasks.value.find(task => task.id === detailId.value))
const hasFilters = computed(() => !!search.value.trim() || priorityFilter.value !== 'all' || activeStatus.value !== 'all')
const today = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())
const statusLabel = id => STATUSES.find(status => status.id === id)?.label
const priorityLabel = id => PRIORITIES.find(priority => priority.id === id)?.label
const dateTime = value => new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))

function notify(message) {
  toast.value = message
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = '' }, 3200)
}
function readStorage() {
  try {
    tasks.value = loadTasks(window.localStorage)
    readBlocked.value = false
    storageError.value = ''
  } catch {
    readBlocked.value = true
    storageError.value = '无法读取本地任务，可能是浏览器限制或数据损坏。原数据已保留，请检查设置后重新读取。'
  }
}
function commit(nextTasks) {
  if (readBlocked.value) return false
  try {
    // 持久化成功后再更新视图，拖拽保存失败时卡片仍留在原列。
    saveTasks(window.localStorage, nextTasks)
    tasks.value = nextTasks
    storageError.value = ''
    return true
  } catch {
    storageError.value = '保存失败，可能是浏览器存储已满或被禁用。此次操作未生效，请检查设置后重试。'
    return false
  }
}
function resetFilters() { search.value = ''; priorityFilter.value = 'all'; activeStatus.value = 'all' }
function selectNavigation(status) { activeStatus.value = status; if (status !== 'all') view.value = 'list' }
function selectView(nextView) { view.value = nextView; activeStatus.value = 'all'; clearDrag() }
async function openCreate(status = 'todo') {
  editingId.value = null
  draft.value = { title: '', description: '', status, priority: 'medium' }
  formError.value = ''
  await nextTick()
  formDialog.value.showModal()
}
async function openEdit(task) {
  detailsDialog.value?.close()
  editingId.value = task.id
  draft.value = { title: task.title, description: task.description, status: task.status, priority: task.priority }
  formError.value = ''
  await nextTick()
  formDialog.value.showModal()
}
function submitTask() {
  formError.value = ''
  try {
    const next = editingId.value ? editTask(tasks.value, editingId.value, draft.value) : [createTask(draft.value), ...tasks.value]
    if (!commit(next)) { formError.value = '保存失败，请检查上方存储提示后重试。'; return }
    formDialog.value.close()
    resetFilters()
    notify(editingId.value ? '任务已更新' : '任务已添加')
  } catch (error) { formError.value = error.message }
}
function changeStatus(id, status) {
  try {
    const next = setTaskStatus(tasks.value, id, status)
    if (next === tasks.value) return
    if (commit(next)) notify(`任务已移至「${statusLabel(status)}」`)
  } catch (error) { notify(error.message) }
}
async function openDetails(task) {
  detailId.value = task.id
  await nextTick()
  detailsDialog.value.showModal()
}
async function openDelete(task) {
  detailsDialog.value?.close()
  deleting.value = task
  await nextTick()
  deleteDialog.value.showModal()
}
function confirmDelete() {
  if (deleting.value && commit(deleteTask(tasks.value, deleting.value.id))) {
    deleteDialog.value.close()
    notify('任务已删除')
  }
}
function toggleTheme() {
  const next = theme.value === 'dark' ? 'light' : 'dark'
  theme.value = next
  document.documentElement.dataset.theme = next
  try { saveTheme(window.localStorage, next) } catch { notify('主题已切换，但浏览器未能记住选择。') }
}
function exportData() {
  const url = URL.createObjectURL(new Blob([serializeTasks(tasks.value)], { type: 'application/json;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `拾序任务备份-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  notify('已导出任务备份')
}
async function importData(event) {
  const file = event.target.files?.[0]
  if (!file) return
  try {
    if (file.size > 2 * 1024 * 1024) throw new Error('备份文件不能超过 2 MB。')
    const incoming = parseTasks(await file.text())
    const merged = mergeTasks(tasks.value, incoming)
    const added = merged.length - tasks.value.length
    if (commit(merged)) {
      resetFilters()
      notify(added ? `已导入 ${added} 项任务，已有任务保持不变` : '备份中的任务已存在，无需重复导入')
    }
  } catch (error) { storageError.value = `导入失败：${error.message}` }
  finally { event.target.value = '' }
}
function syncStorage(event) {
  if (event.key === STORAGE_KEY || event.key === null) {
    readStorage()
    if (!readBlocked.value) notify('已同步其他窗口的任务变更')
  }
  if (event.key === THEME_KEY || event.key === null) {
    try { theme.value = loadTheme(window.localStorage); document.documentElement.dataset.theme = theme.value } catch { /* 保持当前主题 */ }
  }
}
function startDrag(event, task) {
  if (readBlocked.value) { event.preventDefault(); return }
  draggedId.value = task.id
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', task.id)
}
function dragOver(event, status) {
  if (!draggedId.value || readBlocked.value) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
  dropTarget.value = status
}
function dropTask(event, status) {
  event.preventDefault()
  if (draggedId.value && event.dataTransfer.getData('text/plain') === draggedId.value) changeStatus(draggedId.value, status)
  clearDrag()
}
function clearDrag() {
  if (pointerDrag?.element.hasPointerCapture(pointerDrag.pointerId)) pointerDrag.element.releasePointerCapture(pointerDrag.pointerId)
  pointerDrag = null
  draggedId.value = null
  dropTarget.value = null
  touchGhost.value = null
}
// 触屏用卡片右上方把手拖动；状态选择器同时提供键盘操作入口。
function startTouchDrag(event, task) {
  if (event.pointerType === 'mouse' || readBlocked.value) return
  event.preventDefault()
  pointerDrag = { pointerId: event.pointerId, id: task.id, title: task.title, x: event.clientX, y: event.clientY, element: event.currentTarget }
  event.currentTarget.setPointerCapture(event.pointerId)
}
function moveTouchDrag(event) {
  if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return
  if (!draggedId.value && Math.hypot(event.clientX - pointerDrag.x, event.clientY - pointerDrag.y) < 6) return
  event.preventDefault()
  draggedId.value = pointerDrag.id
  touchGhost.value = { title: pointerDrag.title, x: event.clientX, y: event.clientY }
  const board = boardElement.value
  const bounds = board?.getBoundingClientRect()
  if (bounds && event.clientX > bounds.right - 45) board.scrollLeft += 20
  else if (bounds && event.clientX < bounds.left + 45) board.scrollLeft -= 20
  dropTarget.value = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-column-status]')?.dataset.columnStatus || null
}
function endTouchDrag(event) {
  if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return
  if (event.type !== 'pointercancel' && draggedId.value && dropTarget.value) changeStatus(draggedId.value, dropTarget.value)
  clearDrag()
}
function escapeDrag(event) { if (event.key === 'Escape') clearDrag() }
readStorage()
onMounted(() => {
  window.addEventListener('storage', syncStorage)
  window.addEventListener('pointermove', moveTouchDrag, { passive: false })
  window.addEventListener('pointerup', endTouchDrag)
  window.addEventListener('pointercancel', endTouchDrag)
  window.addEventListener('keydown', escapeDrag)
})
onBeforeUnmount(() => {
  window.removeEventListener('storage', syncStorage)
  window.removeEventListener('pointermove', moveTouchDrag)
  window.removeEventListener('pointerup', endTouchDrag)
  window.removeEventListener('pointercancel', endTouchDrag)
  window.removeEventListener('keydown', escapeDrag)
  clearTimeout(toastTimer)
  clearDrag()
})
</script>

<template>
  <div class="app-shell">
    <a href="#main-content" class="skip-link">跳到任务区域</a>
    <aside class="sidebar">
      <a href="./" class="brand" aria-label="拾序首页"><span class="brand-symbol"><AppIcon name="check" :size="26" /></span><span><strong>拾序<span class="brand-dot">.</span></strong><small>让每件事，有着落</small></span></a>
      <div class="workspace-label">我的工作空间 <span>个人</span></div>
      <nav aria-label="任务导航" class="side-nav"><button v-for="item in navigation" :key="item.id" :class="{ selected: activeStatus === item.id }" :aria-current="activeStatus === item.id ? 'page' : undefined" :title="item.label" @click="selectNavigation(item.id)"><AppIcon :name="item.icon" /><span>{{ item.label }}</span><span class="nav-count">{{ counts[item.id] }}</span></button></nav>
      <div class="sidebar-bottom"><div class="little-note"><AppIcon name="leaf" :size="26" /><p>不必一下做完所有事。<br />今天，向前一小步。</p><span>ONE THING AT A TIME</span></div><div class="local-note"><span class="status-dot"></span>个人空间 · 本地存储</div><div class="course-label">软件工程课程实践 01</div></div>
    </aside>
    <div class="workspace">
      <header class="topbar"><div class="breadcrumb">我的工作空间 <span>/</span><strong>任务管理</strong></div><div class="topbar-right"><span class="private-badge"><AppIcon name="shield" :size="15" />仅保存在此浏览器</span><button class="theme-button" :aria-label="theme === 'dark' ? '切换浅色模式' : '切换深色模式'" :aria-pressed="theme === 'dark'" @click="toggleTheme"><AppIcon :name="theme === 'dark' ? 'sun' : 'moon'" :size="17" /><span>{{ theme === 'dark' ? '浅色模式' : '深色模式' }}</span></button><span class="avatar" aria-hidden="true">我</span></div></header>
      <main id="main-content" class="main-content">
        <div class="page-heading"><div><p class="date-label"><AppIcon name="calendar" :size="15" />{{ today }}</p><h1>把今天，<span>理清楚。</span></h1><p class="page-subtitle">从待办到完成，让每一份专注都看得见。</p></div><button class="btn btn-primary" :disabled="readBlocked" @click="openCreate()"><AppIcon name="plus" :size="18" />新建任务</button></div>
        <section class="stats-grid" aria-label="任务概览"><div class="stat-card"><div class="stat-top"><span>全部任务</span><AppIcon name="list" :size="18" /></div><div class="stat-bottom"><strong>{{ String(tasks.length).padStart(2, '0') }}</strong><span>每个想法，都有位置</span></div></div><div v-for="status in STATUSES" :key="status.id" class="stat-card" :class="`stat-${status.id}`"><div class="stat-top"><span>{{ status.label }}</span><AppIcon :name="status.icon" :size="18" /></div><div class="stat-bottom"><strong>{{ String(counts[status.id]).padStart(2, '0') }}</strong><span>{{ status.id === 'done' ? `${progress}% 已完成` : status.hint }}</span></div><div v-if="status.id === 'done'" class="progress-track" aria-hidden="true"><div :style="{ width: `${progress}%` }"></div></div></div></section>
        <div v-if="storageError" class="error-banner" role="alert"><AppIcon name="info" /><span>{{ storageError }}</span><button class="text-button" @click="readStorage">重新读取</button></div>
        <section class="task-section" aria-labelledby="tasks-heading">
          <div class="section-heading"><div class="flex items-center gap-3"><h2 id="tasks-heading">我的任务</h2><span class="total-chip">{{ tasks.length }}</span></div><div class="backup-actions"><button class="text-button" :disabled="readBlocked" @click="importInput.click()"><AppIcon name="upload" :size="16" />导入</button><button class="text-button" :disabled="readBlocked" @click="exportData"><AppIcon name="download" :size="16" />导出备份</button><input ref="importInput" type="file" accept=".json,application/json" class="hidden" aria-label="导入任务备份" @change="importData" /></div></div>
          <div class="toolbar"><div class="view-tabs" role="group" aria-label="切换视图"><button :class="{ active: view === 'board' }" :aria-pressed="view === 'board'" @click="selectView('board')"><AppIcon name="board" :size="16" />看板</button><button :class="{ active: view === 'list' }" :aria-pressed="view === 'list'" @click="selectView('list')"><AppIcon name="list" :size="16" />列表</button></div><div class="filter-controls"><select v-if="view === 'list'" v-model="activeStatus" aria-label="筛选状态"><option value="all">全部状态</option><option v-for="status in STATUSES" :key="status.id" :value="status.id">{{ status.label }}</option></select><select v-model="priorityFilter" aria-label="筛选优先级"><option value="all">全部优先级</option><option v-for="priority in PRIORITIES" :key="priority.id" :value="priority.id">{{ priority.label }}优先级（{{ priority.color }}）</option></select><div class="search-box"><AppIcon name="search" :size="16" /><input v-model="search" type="search" aria-label="搜索任务" placeholder="搜索标题或描述…" /></div></div></div>
          <div class="view-caption"><span v-if="view === 'board'"><AppIcon name="grip" :size="14" />拖动卡片切换状态，进度自动保存</span><span v-else>点击任务标题查看完整详情</span><button v-if="hasFilters" class="text-button" @click="resetFilters">清除筛选</button><span v-else class="priority-legend"><i class="high-dot"></i>高<i class="medium-dot"></i>中<i class="low-dot"></i>低</span></div>
          <div v-if="view === 'board'" ref="boardElement" class="board" aria-label="任务看板" :class="{ 'is-dragging': draggedId }">
            <section v-for="column in columns" :key="column.id" class="board-column" :class="[{ 'drop-target': dropTarget === column.id }, `column-${column.id}`]" :data-column-status="column.id" :aria-label="`${column.label}列`" @dragover="dragOver($event, column.id)" @drop="dropTask($event, column.id)">
              <div class="column-heading"><span class="column-dot"></span><h3>{{ column.label }}</h3><span class="column-count">{{ column.tasks.length }}</span><button class="icon-button" :aria-label="`在${column.label}列新建任务`" :disabled="readBlocked" @click="openCreate(column.id)"><AppIcon name="plus" :size="17" /></button></div>
              <div class="column-cards"><TaskCard v-for="task in column.tasks" :key="task.id" :task="task" board :disabled="readBlocked" :dragging="draggedId === task.id" @details="openDetails" @edit="openEdit" @delete="openDelete" @status="changeStatus" @dragstart="startDrag" @dragend="clearDrag" @touchstart="startTouchDrag" /><div v-if="!column.tasks.length" class="column-empty"><AppIcon :name="column.icon" :size="26" /><strong>{{ hasFilters ? '没有匹配的任务' : `暂无${column.label}任务` }}</strong><span>{{ draggedId ? '松开，将任务放在这里' : hasFilters ? '试试其他关键词或优先级' : column.hint }}</span></div></div>
              <button class="column-add" :disabled="readBlocked" @click="openCreate(column.id)"><AppIcon name="plus" :size="16" />添加任务</button>
            </section>
          </div>
          <div v-else class="list-view" aria-label="任务列表"><TaskCard v-for="task in filteredTasks" :key="task.id" :task="task" :disabled="readBlocked" @details="openDetails" @edit="openEdit" @delete="openDelete" @status="changeStatus" /><div v-if="!filteredTasks.length" class="list-empty"><span class="empty-symbol"><AppIcon name="leaf" :size="34" /></span><h3>{{ readBlocked ? '本地任务暂时无法读取' : hasFilters ? '没有找到匹配的任务' : '从一件小事开始' }}</h3><p>{{ readBlocked ? '请先处理上方的存储提示。' : hasFilters ? '试试其他关键词，或清除筛选。' : '把想到的事情写下来，让今天更有条理。' }}</p><button v-if="hasFilters" class="text-button" @click="resetFilters">清除筛选 <AppIcon name="arrow" :size="16" /></button><button v-else class="text-button" :disabled="readBlocked" @click="openCreate()">添加第一项任务 <AppIcon name="arrow" :size="16" /></button></div></div>
          <div class="list-footer"><span>共 {{ tasks.length }} 项任务 · 当前显示 {{ filteredTasks.length }} 项</span><span><AppIcon :name="storageError ? 'info' : 'shield'" :size="13" />{{ storageError ? '请检查存储提示' : '自动保存到此浏览器' }}</span></div>
        </section>
        <footer class="page-footer"><span>拾序 · 简单一点，专注一点。</span><span>课程实践 / 任务管理器</span></footer>
      </main>
    </div>
    <dialog ref="formDialog" class="modal" aria-labelledby="form-heading"><form novalidate @submit.prevent="submitTask"><div class="modal-heading"><div><p class="modal-eyebrow">{{ editingId ? 'EDIT TASK' : 'A SMALL STEP' }}</p><h2 id="form-heading">{{ editingId ? '修改任务' : '新建任务' }}</h2></div><button type="button" class="icon-button" aria-label="关闭任务窗口" @click="formDialog.close()"><AppIcon name="close" /></button></div><label for="task-title">任务标题 <span class="required">*</span></label><input id="task-title" v-model="draft.title" maxlength="100" required autofocus placeholder="这次想完成什么？" :aria-invalid="!!formError" :aria-describedby="formError ? 'form-error' : undefined" @input="formError = ''" /><div class="field-counter">{{ draft.title.length }} / 100</div><label for="task-description">描述 <span class="optional">选填</span></label><textarea id="task-description" v-model="draft.description" maxlength="1000" rows="4" placeholder="补充一点细节，方便之后开始……"></textarea><div class="field-counter">{{ draft.description.length }} / 1000</div><div class="form-grid"><div><label for="task-status">状态</label><select id="task-status" v-model="draft.status"><option v-for="status in STATUSES" :key="status.id" :value="status.id">{{ status.label }}</option></select></div><div><label for="task-priority">优先级</label><select id="task-priority" v-model="draft.priority" :class="`priority-${draft.priority}`"><option v-for="priority in PRIORITIES" :key="priority.id" :value="priority.id">{{ priority.label }}（{{ priority.color }}）</option></select></div></div><p v-if="formError" id="form-error" class="field-error" role="alert">{{ formError }}</p><div class="modal-actions"><button type="button" class="btn btn-secondary" @click="formDialog.close()">取消</button><button type="submit" class="btn btn-primary" :disabled="readBlocked">{{ editingId ? '保存修改' : '创建任务' }}</button></div></form></dialog>
    <dialog ref="detailsDialog" class="modal details-modal" aria-labelledby="detail-heading"><template v-if="detail"><div class="modal-heading"><p class="modal-eyebrow">TASK DETAILS</p><button class="icon-button" aria-label="关闭任务详情" @click="detailsDialog.close()"><AppIcon name="close" /></button></div><h2 id="detail-heading">{{ detail.title }}</h2><div class="detail-badges"><span class="status-badge" :class="`status-${detail.status}`">{{ statusLabel(detail.status) }}</span><span class="priority-badge" :class="`priority-${detail.priority}`"><i></i>{{ priorityLabel(detail.priority) }}优先级</span></div><h3>描述</h3><p class="full-description">{{ detail.description || '暂无描述' }}</p><dl class="detail-dates"><div><dt>创建时间</dt><dd>{{ dateTime(detail.createdAt) }}</dd></div><div><dt>更新时间</dt><dd>{{ dateTime(detail.updatedAt) }}</dd></div></dl><div class="modal-actions"><button class="btn btn-secondary" :disabled="readBlocked" @click="openDelete(detail)">删除任务</button><button class="btn btn-primary" :disabled="readBlocked" @click="openEdit(detail)"><AppIcon name="edit" :size="16" />修改任务</button></div></template><template v-else><h2 id="detail-heading">任务已不存在</h2><p>任务可能已被其他窗口删除。</p><button class="btn btn-secondary" @click="detailsDialog.close()">关闭</button></template></dialog>
    <dialog ref="deleteDialog" class="modal delete-modal" aria-labelledby="delete-heading" aria-describedby="delete-description"><div class="delete-symbol"><AppIcon name="trash" :size="26" /></div><h2 id="delete-heading">删除这项任务？</h2><p id="delete-description">“{{ deleting?.title }}”将被删除，此操作无法撤销。</p><p v-if="storageError" class="field-error" role="alert">{{ storageError }}</p><div class="modal-actions"><button class="btn btn-secondary" autofocus @click="deleteDialog.close()">保留任务</button><button class="btn btn-danger" :disabled="readBlocked" @click="confirmDelete">确认删除</button></div></dialog>
    <div v-if="touchGhost" class="touch-ghost" :style="{ left: `${touchGhost.x}px`, top: `${touchGhost.y}px` }" aria-hidden="true">{{ touchGhost.title }}</div>
    <div class="toast-container" role="status" aria-live="polite"><div v-if="toast" class="toast"><AppIcon name="check" :size="17" />{{ toast }}</div></div>
  </div>
</template>
