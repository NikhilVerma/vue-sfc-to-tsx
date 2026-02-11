<template>
  <div>
    <p v-custom-directive:arg.mod="value">Custom directive</p>
    <div v-memo="[item.id, item.selected]">
      <span>{{ item.name }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";

const value = ref("test");
const item = ref({ id: 1, name: "Test", selected: false });
</script>
