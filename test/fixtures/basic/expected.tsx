import { defineComponent, ref } from "vue";

export default defineComponent({
  setup() {
    const title = ref("Hello");
    const message = ref("Welcome to Vue TSX");
    const spanId = ref("my-span");

    return () => (
      <div class="greeting">
        <h1>{title.value}</h1>
        <p>{message.value}</p>
        <span id={spanId.value}>static text</span>
        <input type="text" placeholder="Enter name" />
      </div>
    );
  },
});
