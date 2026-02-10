import { defineComponent, ref } from 'vue'
import styles from './CssModules.module.css'

export default defineComponent({
  setup() {
    const isActive = ref(true)
    const hasError = ref(false)

    return () => (
      <div class={styles.container}>
        <h1 class={styles.title}>Hello</h1>
        <p class={{[styles.active]: isActive.value, [styles["text-danger"]]: hasError.value}}>Dynamic</p>
      </div>
    )
  }
})
