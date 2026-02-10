<template>
  <div>
    <h1>{{ props.title }}</h1>
    <button @click="emit('update', count)">Count: {{ count }}</button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

interface Props {
  title: string
  initialCount?: number
}

const props = withDefaults(defineProps<Props>(), {
  initialCount: 0,
})
const emit = defineEmits<{
  (e: 'update', value: number): void
}>()
const slots = defineSlots<{
  default(props: { item: string }): any
}>()

defineExpose({ reset })

const count = ref(props.initialCount)

function reset() {
  count.value = 0
}
</script>
