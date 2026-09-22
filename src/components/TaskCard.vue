<script setup>
import AppIcon from './AppIcon.vue'
import { STATUSES, PRIORITIES } from '../lib/tasks.js'
const props = defineProps({ task: { type: Object, required: true }, board: Boolean, disabled: Boolean, dragging: Boolean })
const emit = defineEmits(['details', 'edit', 'delete', 'status', 'dragstart', 'dragend', 'touchstart'])
const formatDate = value => new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(new Date(value))
function requestStatus(event) {
  const nextStatus = event.target.value
  // 原生 select 会先改变显示值；由保存成功后的任务数据决定最终选项。
  event.target.value = props.task.status
  emit('status', props.task.id, nextStatus)
}
</script>

<template>
  <article class="task-card" :class="[{ 'list-card': !board, dragging, 'is-done': task.status === 'done' }, `priority-${task.priority}`]" :data-task-id="task.id" :aria-label="`任务：${task.title}`" :draggable="board && !disabled" @dragstart="$emit('dragstart', $event, task)" @dragend="$emit('dragend')">
    <div class="card-top"><span class="priority-badge" :class="`priority-${task.priority}`"><i></i>{{ PRIORITIES.find(item => item.id === task.priority)?.label }}优先级</span><span v-if="board" class="drag-grip" title="拖动卡片到其他列" aria-hidden="true" @pointerdown="$emit('touchstart', $event, task)"><AppIcon name="grip" :size="17" /></span></div>
    <div class="card-copy"><button class="task-title" @click="$emit('details', task)">{{ task.title }}</button><p v-if="task.description" class="task-description">{{ task.description }}</p><p v-else class="no-description">暂无描述</p></div>
    <div class="card-footer"><select :value="task.status" :aria-label="`状态：${task.title}`" :class="`status-${task.status}`" :disabled="disabled" @change="requestStatus" @dragstart.stop.prevent><option v-for="status in STATUSES" :key="status.id" :value="status.id">{{ status.label }}</option></select><span class="card-date">{{ formatDate(task.createdAt) }}</span><div class="card-actions"><button class="icon-button" :aria-label="`修改：${task.title}`" :disabled="disabled" @click="$emit('edit', task)"><AppIcon name="edit" :size="16" /></button><button class="icon-button danger-hover" :aria-label="`删除：${task.title}`" :disabled="disabled" @click="$emit('delete', task)"><AppIcon name="trash" :size="16" /></button></div></div>
  </article>
</template>
