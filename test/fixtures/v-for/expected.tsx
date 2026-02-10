import { defineComponent, ref } from 'vue'

export default defineComponent({
  setup() {
    interface Item {
      id: number
      name: string
    }

    const items = ref<Item[]>([
      { id: 1, name: 'First' },
      { id: 2, name: 'Second' },
    ])

    return () => (
      <div>
        <ul>
          {items.value.map((item) => (<li key={item.id}>{item.name}</li>))}
        </ul>
        {items.value.map((item, index) => (<div key={index}><span>{index}: {item.name}</span></div>))}
      </div>
    )
  }
})
