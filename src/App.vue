<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import AppIcon from './components/AppIcon.vue'
import { createTask, editTask, toggleTask, deleteTask, loadTasks, saveTasks, serializeTasks, parseTasks, mergeTasks, STORAGE_KEY } from './lib/tasks.js'

const tasks = ref([])
const storageError = ref('')
const readBlocked = ref(false)
const activeFilter = ref('all')
const search = ref('')
const title = ref('')
const notes = ref('')
const showNotes = ref(false)
const formError = ref('')
const titleInput = ref(null)
const importInput = ref(null)
const editDialog = ref(null)
const deleteDialog = ref(null)
const editing = ref({ id: '', title: '', notes: '' })
const editError = ref('')
const deleting = ref(null)
const toast = ref('')
let toastTimer

const filters = [
  { id: 'all', label: '全部任务', icon: 'list' },
  { id: 'pending', label: '待完成', icon: 'circle' },
  { id: 'completed', label: '已完成', icon: 'done' },
]
const completedCount = computed(() => tasks.value.filter(task => task.completed).length)
const pendingCount = computed(() => tasks.value.length - completedCount.value)
const progress = computed(() => tasks.value.length ? Math.round(completedCount.value / tasks.value.length * 100) : 0)
const counts = computed(() => ({ all: tasks.value.length, pending: pendingCount.value, completed: completedCount.value }))
const filteredTasks = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  return tasks.value.filter(task => {
    const matchesStatus = activeFilter.value === 'all' || (activeFilter.value === 'completed' ? task.completed : !task.completed)
    return matchesStatus && (!query || `${task.title} ${task.notes}`.toLocaleLowerCase().includes(query))
  })
})
const today = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())
const emptyTitle = computed(() => search.value.trim() ? '没有找到匹配的任务' : activeFilter.value === 'completed' ? '完成的每一步，都值得记录' : activeFilter.value === 'pending' && tasks.value.length ? '待办已清空，做得不错' : '从一件小事开始')
const emptyText = computed(() => search.value.trim() ? '试试其他关键词，或清除搜索查看任务。' : activeFilter.value === 'completed' ? '勾选任务左侧的圆圈，它就会出现在这里。' : activeFilter.value === 'pending' && tasks.value.length ? '给自己一点休息时间，再出发。' : '把想到的事情写下来，让今天更有条理。')

function notify(message) {
  toast.value = message
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = '' }, 3500)
}

function readStorage() {
  try {
    tasks.value = loadTasks(window.localStorage)
    readBlocked.value = false
    storageError.value = ''
  } catch {
    readBlocked.value = true
    storageError.value = '无法读取本地任务，可能是浏览器限制或数据损坏。原数据已保留；请检查浏览器存储设置后重新读取。'
  }
}

function commit(nextTasks) {
  if (readBlocked.value) return false
  try {
    // 先写入成功再更新界面，避免把未保存的更改显示为成功。
    saveTasks(window.localStorage, nextTasks)
    tasks.value = nextTasks
    storageError.value = ''
    return true
  } catch {
    storageError.value = '保存失败，可能是浏览器存储已满或被禁用。此次操作未生效，请检查设置后重试。'
    return false
  }
}

function addTask() {
  formError.value = ''
  try {
    const task = createTask(title.value, notes.value)
    if (!commit([task, ...tasks.value])) return
    title.value = ''
    notes.value = ''
    showNotes.value = false
    activeFilter.value = 'all'
    search.value = ''
    notify('任务已添加')
    titleInput.value?.focus()
  } catch (error) { formError.value = error.message }
}

function focusNewTask() {
  titleInput.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  titleInput.value?.focus({ preventScroll: true })
}

function changeStatus(task) {
  if (commit(toggleTask(tasks.value, task.id))) notify(task.completed ? '已移回待完成' : '又完成了一件事，做得不错！')
}

async function openEdit(task) {
  editing.value = { id: task.id, title: task.title, notes: task.notes }
  editError.value = ''
  await nextTick()
  editDialog.value.showModal()
}

function saveEdit() {
  editError.value = ''
  try {
    if (!commit(editTask(tasks.value, editing.value.id, editing.value.title, editing.value.notes))) {
      editError.value = '无法保存，请检查浏览器存储设置后重试。'
      return
    }
    editDialog.value.close()
    notify('任务已更新')
  } catch (error) { editError.value = error.message }
}

async function openDelete(task) {
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
      activeFilter.value = 'all'
      search.value = ''
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
}
function formatDate(value) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(new Date(value))
}
readStorage()
onMounted(() => window.addEventListener('storage', syncStorage))
onBeforeUnmount(() => { window.removeEventListener('storage', syncStorage); clearTimeout(toastTimer) })
</script>

<template>
  <div class="app-shell">
    <a href="#main-content" class="skip-link">跳到任务列表</a>
    <aside class="sidebar">
      <a href="./" class="brand" aria-label="拾序首页">
        <span class="brand-symbol"><AppIcon name="check" :size="25" /></span>
        <span><strong>拾序<span class="brand-dot">.</span></strong><small>让每件事，有着落</small></span>
      </a>
      <div class="workspace-label">我的工作空间 <span>个人</span></div>
      <nav aria-label="任务导航" class="side-nav">
        <button v-for="filter in filters" :key="filter.id" :class="{ selected: activeFilter === filter.id }" :aria-current="activeFilter === filter.id ? 'page' : undefined" @click="activeFilter = filter.id; search = ''">
          <AppIcon :name="filter.icon" /><span>{{ filter.label }}</span><span class="nav-count">{{ counts[filter.id] }}</span>
        </button>
      </nav>
      <div class="sidebar-bottom">
        <div class="little-note">
          <AppIcon name="leaf" :size="25" />
          <p>不必一下做完所有事。<br />今天，向前一小步。</p>
          <span>ONE THING AT A TIME</span>
        </div>
        <div class="local-note"><span class="status-dot"></span>个人空间 · 本地存储</div>
        <div class="course-label">软件工程课程实践 01</div>
      </div>
    </aside>

    <div class="workspace">
      <header class="topbar">
        <div class="breadcrumb">我的工作空间 <span>/</span> <strong>任务管理</strong></div>
        <div class="topbar-right"><span class="private-badge"><AppIcon name="shield" :size="15" /> 仅保存在此浏览器</span><span class="avatar" aria-hidden="true">我</span></div>
      </header>
      <main id="main-content" class="main-content">
        <div class="page-heading">
          <div><p class="date-label"><AppIcon name="calendar" :size="15" />{{ today }}</p><h1>把今天，<span>理清楚。</span></h1><p class="page-subtitle">记录、专注、完成。按自己的节奏，一件一件来。</p></div>
          <button class="btn btn-primary new-task-button" :disabled="readBlocked" @click="focusNewTask"><AppIcon name="plus" :size="18" />新建任务</button>
        </div>

        <section class="stats-grid" aria-label="任务概览">
          <div class="stat-card"><div class="stat-top"><span>全部任务</span><span class="stat-icon"><AppIcon name="list" :size="18" /></span></div><div class="stat-bottom"><strong>{{ tasks.length.toString().padStart(2, '0') }}</strong><span>每个想法，都有位置</span></div></div>
          <div class="stat-card"><div class="stat-top"><span>待完成</span><span class="stat-icon amber"><AppIcon name="circle" :size="18" /></span></div><div class="stat-bottom"><strong>{{ pendingCount.toString().padStart(2, '0') }}</strong><span>留给下一步的行动</span></div></div>
          <div class="stat-card completed-stat"><div class="stat-top"><span>已完成</span><span class="stat-icon green"><AppIcon name="done" :size="18" /></span></div><div class="stat-bottom"><strong>{{ completedCount.toString().padStart(2, '0') }}</strong><span>{{ progress }}% 已完成</span></div><div class="progress-track" aria-hidden="true"><div :style="{ width: `${progress}%` }"></div></div></div>
        </section>

        <div v-if="storageError" class="error-banner" role="alert"><AppIcon name="info" /><span>{{ storageError }}</span><button class="text-button" @click="readStorage">重新读取</button></div>

        <section class="composer" aria-labelledby="new-task-title">
          <div class="section-eyebrow"><span class="tiny-plus">+</span><h2 id="new-task-title">记下一件要做的事</h2><span>让想法变成行动</span></div>
          <form novalidate @submit.prevent="addTask">
            <div class="composer-row"><label class="sr-only" for="new-title">任务标题（必填）</label><input id="new-title" ref="titleInput" v-model="title" class="new-title" placeholder="接下来，你想完成什么？" maxlength="100" required :disabled="readBlocked" :aria-invalid="!!formError" :aria-describedby="formError ? 'create-error' : 'title-hint'" @input="formError = ''" /><button class="btn btn-primary add-button" type="submit" :disabled="readBlocked"><AppIcon name="plus" :size="17" />添加任务</button></div>
            <div v-if="showNotes" class="notes-field"><label for="new-notes">任务备注 <span>选填</span></label><textarea id="new-notes" v-model="notes" placeholder="补充一点细节，方便之后开始……" maxlength="1000" rows="3"></textarea></div>
            <div class="composer-meta"><button class="text-button" type="button" :aria-expanded="showNotes" @click="showNotes = !showNotes"><AppIcon :name="showNotes ? 'close' : 'plus'" :size="14" />{{ showNotes ? '收起备注' : '添加备注' }}</button><span id="title-hint">标题必填 · 按 Enter 快速添加</span></div>
            <p v-if="formError" id="create-error" class="field-error" role="alert">{{ formError }}</p>
          </form>
        </section>

        <section class="task-section" aria-labelledby="list-heading">
          <div class="list-heading-row"><div class="flex items-center gap-3"><h2 id="list-heading">我的任务</h2><span class="total-chip">{{ tasks.length }}</span></div><div class="backup-actions"><button class="text-button" :disabled="readBlocked" @click="importInput.click()"><AppIcon name="upload" :size="16" />导入</button><button class="text-button" :disabled="readBlocked" @click="exportData"><AppIcon name="download" :size="16" />导出备份</button><input ref="importInput" type="file" accept=".json,application/json" class="hidden" aria-label="导入任务备份" @change="importData" /></div></div>
          <div class="list-toolbar"><div class="filter-tabs" role="group" aria-label="筛选任务"><button v-for="filter in filters" :key="filter.id" :class="{ active: activeFilter === filter.id }" :aria-pressed="activeFilter === filter.id" @click="activeFilter = filter.id">{{ filter.id === 'all' ? '全部' : filter.label }}<span>{{ counts[filter.id] }}</span></button></div><div class="search-box"><AppIcon name="search" :size="16" /><label for="task-search" class="sr-only">搜索任务</label><input id="task-search" v-model="search" type="search" placeholder="搜索任务…" /></div></div>

          <div class="task-panel">
            <ul v-if="filteredTasks.length" class="task-list" aria-label="任务列表">
              <li v-for="task in filteredTasks" :key="task.id" class="task-row" :class="{ 'is-complete': task.completed }">
                <button class="task-checkbox" role="checkbox" :aria-checked="task.completed" :aria-label="`${task.completed ? '标记未完成' : '标记完成'}：${task.title}`" :disabled="readBlocked" @click="changeStatus(task)"><AppIcon v-if="task.completed" name="check" :size="15" /></button>
                <div class="task-copy"><h3>{{ task.title }}</h3><p v-if="task.notes" class="task-notes">{{ task.notes }}</p><div class="task-meta"><span class="task-state" :class="{ finished: task.completed }">{{ task.completed ? '已完成' : '待完成' }}</span><span>创建于 {{ formatDate(task.createdAt) }}</span></div></div>
                <div class="task-actions"><button class="icon-button" :aria-label="`修改：${task.title}`" :title="`修改：${task.title}`" :disabled="readBlocked" @click="openEdit(task)"><AppIcon name="edit" :size="17" /></button><button class="icon-button danger-hover" :aria-label="`删除：${task.title}`" :title="`删除：${task.title}`" :disabled="readBlocked" @click="openDelete(task)"><AppIcon name="trash" :size="17" /></button></div>
              </li>
            </ul>
            <div v-else class="empty-state"><div class="empty-illustration" aria-hidden="true"><div class="empty-orbit"></div><div class="paper"><span class="paper-check"><AppIcon name="check" :size="17" /></span><i></i><i></i><i></i></div><span class="spark one">+</span><span class="spark two">·</span><span class="leaf-stamp"><AppIcon name="leaf" :size="20" /></span></div><h3>{{ readBlocked ? '本地任务暂时无法读取' : emptyTitle }}</h3><p>{{ readBlocked ? '请先处理上方提示，已有数据不会被覆盖。' : emptyText }}</p><button v-if="search.trim()" class="text-button green-text" @click="search = ''">清除搜索 <AppIcon name="arrow" :size="16" /></button><button v-else-if="!tasks.length && !readBlocked" class="text-button green-text" @click="focusNewTask">添加第一项任务 <AppIcon name="arrow" :size="16" /></button></div>
            <div class="list-footer"><span>{{ filteredTasks.length ? `显示 ${filteredTasks.length} 项任务` : '为重要的事，留一点空间' }}</span><span><AppIcon :name="storageError ? 'info' : 'shield'" :size="13" />{{ storageError ? '请检查存储提示' : '自动保存到此浏览器' }}</span></div>
          </div>
        </section>
        <footer class="page-footer"><span>拾序 · 简单一点，专注一点。</span><span>课程实践 / 任务管理器</span></footer>
      </main>
    </div>

    <dialog ref="editDialog" class="modal" aria-labelledby="edit-heading"><form novalidate @submit.prevent="saveEdit"><div class="modal-heading"><div><p class="modal-eyebrow">TASK DETAILS</p><h2 id="edit-heading">修改任务</h2></div><button type="button" class="icon-button" aria-label="关闭修改窗口" @click="editDialog.close()"><AppIcon name="close" /></button></div><label for="edit-title">任务标题 <span class="required">*</span></label><input id="edit-title" v-model="editing.title" maxlength="100" required autofocus :aria-invalid="!!editError" :aria-describedby="editError ? 'edit-error' : undefined" @input="editError = ''" /><div class="field-counter">{{ editing.title.length }} / 100</div><label for="edit-notes">备注 <span class="optional">选填</span></label><textarea id="edit-notes" v-model="editing.notes" maxlength="1000" rows="4" placeholder="补充任务的细节……"></textarea><p v-if="editError" id="edit-error" class="field-error" role="alert">{{ editError }}</p><div class="modal-actions"><button type="button" class="btn btn-secondary" @click="editDialog.close()">取消</button><button type="submit" class="btn btn-primary">保存修改</button></div></form></dialog>

    <dialog ref="deleteDialog" class="modal delete-modal" aria-labelledby="delete-heading" aria-describedby="delete-description"><div class="delete-symbol"><AppIcon name="trash" :size="25" /></div><h2 id="delete-heading">删除这项任务？</h2><p id="delete-description">“{{ deleting?.title }}”将被删除，此操作无法撤销。</p><p v-if="storageError" class="field-error" role="alert">{{ storageError }}</p><div class="modal-actions"><button class="btn btn-secondary" autofocus @click="deleteDialog.close()">保留任务</button><button class="btn btn-danger" @click="confirmDelete">确认删除</button></div></dialog>
    <div class="toast-container" role="status" aria-live="polite"><div v-if="toast" class="toast"><span class="toast-check"><AppIcon name="check" :size="14" /></span>{{ toast }}</div></div>
  </div>
</template>
