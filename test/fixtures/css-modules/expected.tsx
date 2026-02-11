import { defineComponent, ref } from "vue";
import "./CssModules.css";

export default defineComponent({
  setup() {
    const isActive = ref(true);
    const hasError = ref(false);

    return () => (
      <div class="container">
        <h1 class="title">Hello</h1>
        <p class={{ active: isActive.value, "text-danger": hasError.value }}>Dynamic</p>
      </div>
    );
  },
});
