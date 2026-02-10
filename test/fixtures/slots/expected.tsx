import { defineComponent } from 'vue'
import Card from './Card.vue'

export default defineComponent({
  setup() {
    return () => (
      <div>
        <Card>
          {{
            header: () => (<h2>Card Title</h2>),
            default: () => (<p>Default slot content</p>),
            footer: ({ year }) => (<span>Footer {year}</span>),
          }}
        </Card>
      </div>
    )
  }
})
