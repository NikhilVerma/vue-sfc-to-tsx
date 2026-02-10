import { defineComponent, ref, computed } from 'vue'
import styles from './Complex.module.css'

export default defineComponent({
  setup(props, { slots, emit }) {
    const items = ref<Item[]>([])

    const filteredItems = computed(() =>
      items.value.filter((i) => i.name.length > 0)
    )

    function removeItem(id: number) {
      items.value = items.value.filter((i) => i.id !== id)
      emit('remove', id)
    }

    return () => (
      <div class={styles.wrapper}>
        {props.showHeader ? <header><h1>{props.title}</h1></header> : null}
        <ul>
          {filteredItems.value.map((item) => (<li key={item.id} class={{[styles.active]: item.selected}}><span>{item.name}</span><button onClick={withModifiers(() => removeItem(item.id), ['stop'])}>Remove</button></li>))}
        </ul>
        {slots.footer?.({ count: items.value.length })}
        <p v-show={items.value.length === 0}>No items</p>
      </div>
    )
  }
})
