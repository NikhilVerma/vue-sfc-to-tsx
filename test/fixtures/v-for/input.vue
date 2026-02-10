<template>
  <div>
    <ul>
      <li v-for="item in items" :key="item.id">{{ item.name }}</li>
    </ul>
    <div v-for="(item, index) in items" :key="index">
      <span>{{ index }}: {{ item.name }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

interface Item {
  id: number
  name: string
}

const items = ref<Item[]>([
  { id: 1, name: 'First' },
  { id: 2, name: 'Second' },
])
</script>
