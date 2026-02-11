import { defineComponent, ref } from "vue";

export default defineComponent({
  setup() {
    function _renderList(source: any, renderItem: (...args: any[]) => any): any[] {
      if (Array.isArray(source)) return source.map(renderItem as any);
      if (typeof source === "number")
        return Array.from({ length: source }, (_, i) => (renderItem as any)(i + 1, i));
      if (typeof source === "object" && source)
        return Object.keys(source).map((key, index) =>
          (renderItem as any)((source as any)[key], key, index),
        );
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
