import { defineComponent, ref } from "vue";

export default defineComponent({
  setup() {
    function _renderList<T>(
      source: T[],
      renderItem: (item: T, index: number) => unknown,
    ): unknown[];
    function _renderList(
      source: number,
      renderItem: (value: number, index: number) => unknown,
    ): unknown[];
    function _renderList<T extends object>(
      source: T,
      renderItem: (value: T[keyof T], key: string, index: number) => unknown,
    ): unknown[];
    function _renderList(
      source: unknown,
      renderItem: (...args: Array<unknown>) => unknown,
    ): Array<unknown> {
      if (Array.isArray(source)) {
        return source.map((item, index) => renderItem(item, index, source));
      }
      if (typeof source === "number") {
        return Array.from({ length: source }, (_, i) =>
          (renderItem as (...args: Array<unknown>) => unknown)(i + 1, i),
        );
      }
      if (typeof source === "object" && source) {
        return Object.keys(source).map((key, index) =>
          renderItem((source as Record<string, unknown>)[key], key, index),
        );
      }
      return [];
    }

    interface Item {
      id: number;
      name: string;
    }

    const items = ref<Item[]>([
      { id: 1, name: "First" },
      { id: 2, name: "Second" },
    ]);

    return () => (
      <div>
        <ul>
          {_renderList(items.value, (item) => (
            <li key={item.id}>{item.name}</li>
          ))}
        </ul>
        {_renderList(items.value, (item, index) => (
          <div key={index}>
            <span>
              {index}: {item.name}
            </span>
          </div>
        ))}
      </div>
    );
  },
});
