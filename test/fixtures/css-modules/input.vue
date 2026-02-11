<template>
  <div class="container">
    <h1 class="title">Hello</h1>
    <p :class="{ active: isActive, 'text-danger': hasError }">Dynamic</p>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";

const isActive = ref(true);
const hasError = ref(false);
</script>

<style scoped>
.container {
  padding: 20px;
}
.title {
  font-size: 24px;
}
.active {
  color: green;
}
.text-danger {
  color: red;
}
</style>
