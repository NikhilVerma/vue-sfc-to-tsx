<template>
  <div>
    <Card>
      <template #header>
        <h2>Card Title</h2>
      </template>
      <p>Default slot content</p>
      <template #footer="{ year }">
        <span>Footer {{ year }}</span>
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
import Card from "./Card.vue";
</script>
