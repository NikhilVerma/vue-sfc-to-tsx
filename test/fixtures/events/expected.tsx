import { defineComponent, withModifiers } from 'vue'

export default defineComponent({
  setup() {
    const handleClick = () => {
      console.log('clicked')
    }

    const handleSubmit = () => {
      console.log('submitted')
    }

    const handleBoth = () => {
      console.log('both')
    }

    const onInput = (e: Event) => {
      console.log(e)
    }

    const doSomething = (e: MouseEvent) => {
      console.log(e)
    }

    return () => (
      <div>
        <button onClick={handleClick}>Click me</button>
        <button onClick={withModifiers(handleSubmit, ['prevent'])}>Submit</button>
        <button onClick={withModifiers(handleBoth, ['stop', 'prevent'])}>Stop &amp; Prevent</button>
        <input onInput={onInput} />
        <a onClick={($event) => doSomething($event)}>Link</a>
      </div>
    )
  }
})
