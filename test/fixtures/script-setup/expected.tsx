import { defineComponent, ref } from 'vue'

export default defineComponent({
  setup(props, { slots, emit, expose }) {
    const count = ref(props.initialCount)

    function reset() {
      count.value = 0
    }

    return () => (
      <div>
        <h1>{props.title}</h1>
        <button onClick={() => emit('update', count.value)}>Count: {count.value}</button>
      </div>
    )
  }
})
