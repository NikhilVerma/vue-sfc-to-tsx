<template>
  <div>
    <button @click="handleClick">Click me</button>
    <button @click.prevent="handleSubmit">Submit</button>
    <button @click.stop.prevent="handleBoth">Stop &amp; Prevent</button>
    <input @input="onInput" />
    <a @click="doSomething($event)">Link</a>
  </div>
</template>

<script setup lang="ts">
const handleClick = () => {
  console.log("clicked");
};

const handleSubmit = () => {
  console.log("submitted");
};

const handleBoth = () => {
  console.log("both");
};

const onInput = (e: Event) => {
  console.log(e);
};

const doSomething = (e: MouseEvent) => {
  console.log(e);
};
</script>
