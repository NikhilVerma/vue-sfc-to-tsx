import { defineComponent, ref } from 'vue'

export default defineComponent({
  setup() {
    const value = ref('test')
    const item = ref({ id: 1, name: 'Test', selected: false })

    return () => (
      <div>
        {/* TODO: vuetsx - Directive v-custom-directive cannot be deterministically converted to JSX */}
        {/* Original: v-custom-directive:arg.mod="value" */}
        <p>Custom directive</p>
        {/* TODO: vuetsx - Directive v-memo cannot be deterministically converted to JSX */}
        {/* Original: v-memo="[item.id, item.selected]" */}
        <div><span>{item.value.name}</span></div>
      </div>
    )
  }
})
