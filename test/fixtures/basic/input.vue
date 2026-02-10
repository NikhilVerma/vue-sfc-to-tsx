<template>
  <div class="greeting">
    <h1>{{ title }}</h1>
    <p>{{ message }}</p>
    <span :id="spanId">static text</span>
    <input type="text" placeholder="Enter name" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const title = ref('Hello')
const message = ref('Welcome to Vue TSX')
const spanId = ref('my-span')
</script>
