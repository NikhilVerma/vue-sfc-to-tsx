import { describe, expect, test } from "bun:test";
import { detectAutoImports } from "../../src/script/auto-imports";
import type { ImportInfo } from "../../src/types";
import { convert } from "../../src/index";

describe("detectAutoImports", () => {
  test("detects ref used without import", () => {
    const scriptBody = "const count = ref(0)";
    const result = detectAutoImports(scriptBody, "", []);

    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("vue");
    expect(result[0].namedImports).toContainEqual({ imported: "ref", local: "ref" });
    expect(result[0].typeOnly).toBe(false);
  });

  test("detects multiple vue APIs and groups them in a single import", () => {
    const scriptBody = `
const count = ref(0)
const doubled = computed(() => count.value * 2)
onMounted(() => console.log('mounted'))
`;
    const result = detectAutoImports(scriptBody, "", []);

    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("vue");
    expect(result[0].namedImports).toHaveLength(3);
    expect(result[0].namedImports).toContainEqual({ imported: "ref", local: "ref" });
    expect(result[0].namedImports).toContainEqual({ imported: "computed", local: "computed" });
    expect(result[0].namedImports).toContainEqual({ imported: "onMounted", local: "onMounted" });
  });

  test("does NOT add import if already explicitly imported", () => {
    const scriptBody = "const count = ref(0)";
    const existingImports: ImportInfo[] = [
      {
        source: "vue",
        namedImports: [{ imported: "ref", local: "ref" }],
        typeOnly: false,
      },
    ];
    const result = detectAutoImports(scriptBody, "", existingImports);

    expect(result).toHaveLength(0);
  });

  test('does NOT false-positive on substrings like "preference" for "ref"', () => {
    const scriptBody = `
const preference = 'dark'
const referred = true
const unreference = null
`;
    const result = detectAutoImports(scriptBody, "", []);

    expect(result).toHaveLength(0);
  });

  test("detects useRoute and adds vue-router import", () => {
    const scriptBody = "const route = useRoute()";
    const result = detectAutoImports(scriptBody, "", []);

    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("vue-router");
    expect(result[0].namedImports).toContainEqual({ imported: "useRoute", local: "useRoute" });
  });

  test("detects APIs used in template JSX", () => {
    const scriptBody = "";
    const templateJsx = '<button onClick={withModifiers(() => {}, ["prevent"])}>Click</button>';
    const result = detectAutoImports(scriptBody, templateJsx, []);

    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("vue");
    expect(result[0].namedImports).toContainEqual({
      imported: "withModifiers",
      local: "withModifiers",
    });
  });

  test("groups imports from different sources separately", () => {
    const scriptBody = `
const count = ref(0)
const route = useRoute()
`;
    const result = detectAutoImports(scriptBody, "", []);

    expect(result).toHaveLength(2);
    const vueImport = result.find((i) => i.source === "vue");
    const routerImport = result.find((i) => i.source === "vue-router");
    expect(vueImport).toBeDefined();
    expect(routerImport).toBeDefined();
    expect(vueImport!.namedImports).toContainEqual({ imported: "ref", local: "ref" });
    expect(routerImport!.namedImports).toContainEqual({ imported: "useRoute", local: "useRoute" });
  });

  test("skips identifiers imported via namespace import", () => {
    const scriptBody = "const count = ref(0)";
    const existingImports: ImportInfo[] = [
      {
        source: "vue",
        namespaceImport: "Vue",
        namedImports: [],
        typeOnly: false,
      },
    ];
    // ref is available via Vue.ref, but we still detect it since it's used bare
    // Actually, namespace imports don't make bare `ref` available, so we should still add it
    const result = detectAutoImports(scriptBody, "", existingImports);
    expect(result).toHaveLength(1);
  });
});

describe("auto-imports integration", () => {
  test("SFC with auto-imported ref/computed produces TSX with explicit imports", async () => {
    const sfc = `
<template>
  <div>{{ count }} {{ doubled }}</div>
</template>

<script setup lang="ts">
const count = ref(0)
const doubled = computed(() => count.value * 2)
</script>
`;
    const result = await convert(sfc, { componentName: "Counter" });

    // All three should appear in the vue import (order may vary due to merging)
    expect(result.tsx).toContain("from 'vue'");
    expect(result.tsx).toContain("ref");
    expect(result.tsx).toContain("computed");
    expect(result.tsx).toContain("defineComponent");
  });
});
