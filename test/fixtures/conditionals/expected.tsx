import { defineComponent, ref } from "vue";

export default defineComponent({
  setup() {
    const status = ref<"loading" | "error" | "success">("loading");
    const content = ref("Hello");
    const showLabel = ref(true);

    return () => (
      <div>
        {status.value === "loading" ? (
          <div>Loading...</div>
        ) : status.value === "error" ? (
          <div>Error occurred</div>
        ) : (
          <div>
            <p>{content.value}</p>
          </div>
        )}
        {showLabel.value ? <span>Label</span> : null}
      </div>
    );
  },
});
