<template>
  <div>
    <div v-if="status === 'loading'">Loading...</div>
    <div v-else-if="status === 'error'">Error occurred</div>
    <div v-else>
      <p>{{ content }}</p>
    </div>
    <span v-if="showLabel">Label</span>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const status = ref<'loading' | 'error' | 'success'>('loading')
const content = ref('Hello')
const showLabel = ref(true)
</script>
