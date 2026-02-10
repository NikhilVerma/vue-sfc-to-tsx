<template>
  <div class="wrapper">
    <header v-if="showHeader">
      <h1>{{ title }}</h1>
    </header>
    <ul>
      <li v-for="item in filteredItems" :key="item.id" :class="{ active: item.selected }">
        <span>{{ item.name }}</span>
        <button @click.stop="removeItem(item.id)">Remove</button>
      </li>
    </ul>
    <slot name="footer" :count="items.length" />
    <p v-show="items.length === 0">No items</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

interface Item {
  id: number
  name: string
  selected: boolean
}

const props = defineProps<{
  title: string
  showHeader?: boolean
}>()

const emit = defineEmits<{
  (e: 'remove', id: number): void
}>()

const items = ref<Item[]>([])

const filteredItems = computed(() =>
  items.value.filter((i) => i.name.length > 0)
)

function removeItem(id: number) {
  items.value = items.value.filter((i) => i.id !== id)
  emit('remove', id)
}
</script>

<style scoped>
.wrapper {
  padding: 16px;
}
.active {
  font-weight: bold;
}
</style>
