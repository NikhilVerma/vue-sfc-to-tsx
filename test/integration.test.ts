import { describe, expect, test } from "bun:test";
import { convert } from "../src/index";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

const FIXTURES_DIR = join(import.meta.dir, "fixtures");

function readFixture(name: string, file: string): string {
  return readFileSync(join(FIXTURES_DIR, name, file), "utf-8");
}

function normalize(str: string): string {
  return str.replace(/\s+/g, " ").trim();
}

describe("convert() end-to-end", () => {
  test("basic component produces valid TSX", async () => {
    const input = readFixture("basic", "input.vue");
    const result = await convert(input, { componentName: "Basic" });

    expect(result.warnings).toHaveLength(0);
    expect(result.tsx).toContain("defineComponent");
    expect(result.tsx).toContain("setup()");
    expect(result.tsx).toContain("return () =>");
    expect(result.tsx).toContain("{title.value}");
    expect(result.tsx).toContain("{message.value}");
    expect(result.tsx).toContain("id={spanId.value}");
    expect(result.tsx).toContain('<input type="text" placeholder="Enter name" />');
    expect(result.tsx).toContain('class="greeting"');
    expect(result.css).toBeNull(); // no scoped styles
    expect(result.cssFilename).toBeNull();
  });

  test("script-setup component with macros", async () => {
    const input = readFixture("script-setup", "input.vue");
    const result = await convert(input, { componentName: "ScriptSetup" });

    expect(result.tsx).toContain("defineComponent");
    expect(result.tsx).toContain("setup(props");
    expect(result.tsx).toContain("emit");
    expect(result.tsx).toContain("slots");
    expect(result.tsx).toContain("expose");
    expect(result.tsx).toContain("return () =>");
    // Should NOT contain defineProps/defineEmits/defineSlots/defineExpose (they're macros)
    expect(result.tsx).not.toContain("defineProps");
    expect(result.tsx).not.toContain("defineEmits");
    expect(result.tsx).not.toContain("defineSlots");
    expect(result.tsx).not.toContain("defineExpose");
    expect(result.tsx).not.toContain("withDefaults");
  });

  test("css-modules component generates CSS and plain import", async () => {
    const input = readFixture("css-modules", "input.vue");
    const result = await convert(input, { componentName: "CssModules" });

    expect(result.css).not.toBeNull();
    expect(result.cssFilename).toBe("CssModules.css");
    expect(result.css).toContain(".container");
    expect(result.css).toContain(".title");
    expect(result.css).toContain(".active");
    // TSX should have side-effect import (no default import)
    expect(result.tsx).toContain("import './CssModules.css'");
    expect(result.tsx).not.toContain("styles.");
  });

  test("conditionals component", async () => {
    const input = readFixture("conditionals", "input.vue");
    const result = await convert(input, { componentName: "Conditionals" });

    expect(result.tsx).toContain("defineComponent");
    // Should have ternary expressions for v-if/v-else
    expect(result.tsx).toContain("?");
    expect(result.tsx).toContain(":");
  });

  test("v-for component", async () => {
    const input = readFixture("v-for", "input.vue");
    const result = await convert(input, { componentName: "VFor" });

    expect(result.tsx).toContain("_renderList(");
    expect(result.tsx).toContain("=>");
    // Should include the _renderList helper in setup body
    expect(result.tsx).toContain("function _renderList(");
  });

  test("events component", async () => {
    const input = readFixture("events", "input.vue");
    const result = await convert(input, { componentName: "Events" });

    expect(result.tsx).toContain("onClick");
  });

  test("slots component", async () => {
    const input = readFixture("slots", "input.vue");
    const result = await convert(input, { componentName: "Slots" });

    // Slot content is rendered as object with slot names
    expect(result.tsx).toContain("header");
    expect(result.tsx).toContain("footer");
    expect(result.tsx).toContain("default");
  });
});

describe("convert() error handling", () => {
  test("empty source", async () => {
    const result = await convert("", { componentName: "Empty" });
    // Should not crash
    expect(result.tsx).toBeDefined();
  });

  test("template only (no script)", async () => {
    const result = await convert("<template><div>hi</div></template>", {
      componentName: "NoScript",
    });
    expect(result.tsx).toContain("defineComponent");
    expect(result.tsx).toContain("<div>hi</div>");
  });

  test("no template", async () => {
    const result = await convert(`<script setup>\nconst x = 1\n</script>`, {
      componentName: "NoTemplate",
    });
    expect(result.tsx).toContain("defineComponent");
    expect(result.tsx).toContain("<></>");
  });

  test("component name from options", async () => {
    const result = await convert(
      "<template><div>test</div></template><style scoped>.foo{}</style>",
      { componentName: "MyWidget" },
    );
    expect(result.cssFilename).toBe("MyWidget.css");
  });
});

describe("template globals and setup context", () => {
  test("$attrs in template adds attrs to setup context", async () => {
    const result = await convert(
      `<template><div v-bind="$attrs" /></template><script setup lang="ts">\nconst x = 1\n</script>`,
      { componentName: "AttrsTest" },
    );
    expect(result.tsx).toContain("{...attrs}");
    expect(result.tsx).not.toContain("$attrs");
    expect(result.tsx).toMatch(/setup\([^)]*\{[^}]*attrs/);
  });

  test("$slots in template adds slots to setup context", async () => {
    const result = await convert(
      `<template><div v-if="$slots.header">has header</div></template><script setup lang="ts">\nconst x = 1\n</script>`,
      { componentName: "SlotsTest" },
    );
    expect(result.tsx).toContain("slots.header");
    expect(result.tsx).not.toContain("$slots");
    expect(result.tsx).toMatch(/setup\([^)]*\{[^}]*slots/);
  });

  test("$emit in template adds emit to setup context", async () => {
    const result = await convert(
      `<template><button @click="$emit('foo')">click</button></template><script setup lang="ts">\nconst x = 1\n</script>`,
      { componentName: "EmitTest" },
    );
    expect(result.tsx).toContain("emit('foo')");
    expect(result.tsx).not.toContain("$emit");
    expect(result.tsx).toMatch(/setup\([^)]*\{[^}]*emit/);
  });

  test("$t produces a warning", async () => {
    const result = await convert(
      `<template><div>{{ $t('hello') }}</div></template><script setup lang="ts">\nconst x = 1\n</script>`,
      { componentName: "I18nTest" },
    );
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.message.includes("$t"))).toBe(true);
  });

  test("$route produces a warning", async () => {
    const result = await convert(
      `<template><div>{{ $route.params.id }}</div></template><script setup lang="ts">\nconst x = 1\n</script>`,
      { componentName: "RouteTest" },
    );
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.message.includes("$route"))).toBe(true);
  });

  test("<slot> and $slots both use slots consistently", async () => {
    const result = await convert(
      `<template><div><slot /><div v-if="$slots.footer">footer present</div></div></template><script setup lang="ts">\nconst x = 1\n</script>`,
      { componentName: "SlotConsistency" },
    );
    expect(result.tsx).toContain("slots.default");
    expect(result.tsx).toContain("slots.footer");
    expect(result.tsx).not.toContain("$slots");
    expect(result.tsx).toMatch(/setup\([^)]*\{[^}]*slots/);
  });
});

describe("defineModel integration", () => {
  test("single unnamed defineModel produces computed + props + emits", async () => {
    const input = `<template><div>{{ modelValue }}</div></template>
<script setup lang="ts">
const modelValue = defineModel<string>()
</script>`;
    const result = await convert(input, { componentName: "ModelTest" });

    // Should not contain the raw defineModel macro
    expect(result.tsx).not.toContain("defineModel");
    // Should have computed import
    expect(result.tsx).toContain("computed");
    // Should generate computed get/set for modelValue
    expect(result.tsx).toContain("const modelValue = computed<string>({");
    expect(result.tsx).toContain("props.modelValue");
    expect(result.tsx).toContain("emit('update:modelValue'");
    // Should have emit in setup context
    expect(result.tsx).toMatch(/setup\([^)]*emit/);
  });

  test("named defineModel generates correct prop and emit names", async () => {
    const input = `<template><div>{{ visible }}</div></template>
<script setup lang="ts">
const visible = defineModel<boolean>("visible", { default: false })
</script>`;
    const result = await convert(input, { componentName: "NamedModel" });

    expect(result.tsx).not.toContain("defineModel");
    expect(result.tsx).toContain("const visible = computed<boolean>({");
    expect(result.tsx).toContain("props.visible");
    expect(result.tsx).toContain("emit('update:visible'");
  });

  test("multiple defineModel calls generate multiple computeds", async () => {
    const input = `<template><div>{{ modelValue }} {{ visible }}</div></template>
<script setup lang="ts">
const modelValue = defineModel<string>()
const visible = defineModel<boolean>("visible")
</script>`;
    const result = await convert(input, { componentName: "MultiModel" });

    expect(result.tsx).not.toContain("defineModel");
    expect(result.tsx).toContain("const modelValue = computed<string>({");
    expect(result.tsx).toContain("const visible = computed<boolean>({");
    expect(result.tsx).toContain("emit('update:modelValue'");
    expect(result.tsx).toContain("emit('update:visible'");
  });

  test("defineModel alongside defineProps and defineEmits", async () => {
    const input = `<template><div>{{ label }} {{ modelValue }}</div></template>
<script setup lang="ts">
const props = defineProps<{ label: string }>()
const emit = defineEmits<{ (e: 'click'): void }>()
const modelValue = defineModel<string>()
</script>`;
    const result = await convert(input, { componentName: "MixedMacros" });

    expect(result.tsx).not.toContain("defineModel");
    expect(result.tsx).not.toContain("defineProps");
    expect(result.tsx).not.toContain("defineEmits");
    expect(result.tsx).toContain("const modelValue = computed<string>({");
    expect(result.tsx).toContain("defineComponent");
  });
});

describe("type-based emits produce runtime emits option", () => {
  test("call signature form produces emits array", async () => {
    const input = `<template><div>test</div></template>
<script setup lang="ts">
const emit = defineEmits<{
  (e: 'update', val: string): void
  (e: 'delete', id: number): void
}>()
</script>`;
    const result = await convert(input, { componentName: "EmitCall" });

    expect(result.tsx).toContain("emits: ['update', 'delete']");
  });

  test("single call signature produces emits array", async () => {
    const input = `<template><div>test</div></template>
<script setup lang="ts">
const emit = defineEmits<{ (e: 'remapped', data: any): void }>()
</script>`;
    const result = await convert(input, { componentName: "EmitSingle" });

    expect(result.tsx).toContain("emits: ['remapped']");
  });

  test("shorthand form produces emits array", async () => {
    const input = `<template><div>test</div></template>
<script setup lang="ts">
const emit = defineEmits<{
  update: [val: string]
  delete: [id: number]
}>()
</script>`;
    const result = await convert(input, { componentName: "EmitShorthand" });

    expect(result.tsx).toContain("emits: ['update', 'delete']");
  });

  test("runtime emits still pass through unchanged", async () => {
    const input = `<template><div>test</div></template>
<script setup lang="ts">
const emit = defineEmits(['update', 'delete'])
</script>`;
    const result = await convert(input, { componentName: "EmitRuntime" });

    expect(result.tsx).toContain("emits: ['update', 'delete']");
  });
});

describe("defineExpose integration", () => {
  test("emits expose() call in setup body", async () => {
    const input = `<template><div>test</div></template>
<script setup lang="ts">
import { ref } from 'vue'

const count = ref(0)

function scrollTo() {}
function clearSelection() {}

defineExpose({ scrollTo, clearSelection })
</script>`;
    const result = await convert(input, { componentName: "ExposeTest" });

    expect(result.tsx).toContain("expose({ scrollTo, clearSelection })");
    expect(result.tsx).toMatch(/setup\([^)]*\{[^}]*expose/);
    expect(result.tsx).not.toContain("defineExpose");
  });
});

describe("side-effect imports and exports in setup", () => {
  test("side-effect imports hoisted to top level", async () => {
    const input = `<template><div>test</div></template>
<script setup lang="ts">
import { ref } from 'vue'
import './polyfill'

const count = ref(0)
</script>`;
    const result = await convert(input, { componentName: "ImportTest" });

    // Side-effect import should be before export default defineComponent
    const importIdx = result.tsx.indexOf("import './polyfill'");
    const defineIdx = result.tsx.indexOf("export default defineComponent");
    expect(importIdx).toBeGreaterThan(-1);
    expect(defineIdx).toBeGreaterThan(importIdx);

    // Should not appear inside setup body
    const setupIdx = result.tsx.indexOf("setup(");
    const setupBody = result.tsx.slice(setupIdx);
    expect(setupBody).not.toContain("import './polyfill'");
  });

  test("export statements placed after defineComponent", async () => {
    const input = `<template><div>test</div></template>
<script setup lang="ts">
import { ref } from 'vue'

const count = ref(0)
export type { Foo } from './types'
</script>`;
    const result = await convert(input, { componentName: "ExportTest" });

    // Export should be after the defineComponent closing
    const defineEnd = result.tsx.lastIndexOf("})");
    const exportIdx = result.tsx.indexOf("export type { Foo } from './types'");
    expect(exportIdx).toBeGreaterThan(defineEnd);

    // Should not appear inside setup body
    const setupIdx = result.tsx.indexOf("setup(");
    const returnIdx = result.tsx.indexOf("return () =>");
    const setupBody = result.tsx.slice(setupIdx, returnIdx);
    expect(setupBody).not.toContain("export type");
  });
});

describe("export declarations hoisted to module level", () => {
  test("multiline export type declarations are hoisted out of setup", async () => {
    const input = `<template><div>test</div></template>
<script setup lang="ts">
import { ref } from 'vue'

export type VirtualizedListItem =
    | string
    | number;

export type DocumentGroupNode = {
    id: string;
    isDocumentNode: true;
    index: number;
};

const count = ref(0)

function scrollTo() {}
defineExpose({ scrollTo })
</script>`;
    const result = await convert(input, { componentName: "TypeDeclTest" });

    // Type declarations should be AFTER defineComponent, at module level
    const defineEnd = result.tsx.lastIndexOf("})");
    const afterDefine = result.tsx.slice(defineEnd);
    expect(afterDefine).toContain("export type VirtualizedListItem =");
    expect(afterDefine).toContain("| number;");
    expect(afterDefine).toContain("export type DocumentGroupNode = {");
    expect(afterDefine).toContain("isDocumentNode: true;");

    // They should NOT be inside setup body
    const setupIdx = result.tsx.indexOf("setup(");
    const returnIdx = result.tsx.indexOf("return () =>");
    const setupBody = result.tsx.slice(setupIdx, returnIdx);
    expect(setupBody).not.toContain("export type");

    // expose should still work
    expect(result.tsx).toContain("expose({ scrollTo })");
  });

  test("multiline imports are properly extracted to top-level", async () => {
    const input = `<template><div>{{ x }}</div></template>
<script setup lang="ts">
import type {
    ClauseSchemaType,
    DBDocumentSchema,
    ParameterDefinitionSchemaType
} from "@nonfx/stance-schema";
import type { StatementStatus } from "@nonfx/types";

const x = 1
</script>`;
    const result = await convert(input, { componentName: "MultiImport" });

    // Multiline imports should be at top level, before defineComponent
    const defineIdx = result.tsx.indexOf("export default defineComponent");
    const beforeDefine = result.tsx.slice(0, defineIdx);
    expect(beforeDefine).toContain("ClauseSchemaType");
    expect(beforeDefine).toContain("DBDocumentSchema");
    expect(beforeDefine).toContain("ParameterDefinitionSchemaType");
    expect(beforeDefine).toContain("StatementStatus");

    // Should NOT be inside setup
    const setupIdx = result.tsx.indexOf("setup(");
    const setupBody = result.tsx.slice(setupIdx);
    expect(setupBody).not.toContain("ClauseSchemaType");
    expect(setupBody).not.toContain("@nonfx/stance-schema");
  });
});

describe("root-level v-if chain without wrapper element", () => {
  test("single v-if/v-else-if chain as root produces valid JSX", async () => {
    const input = `<template>
  <FIcon v-if="status === 'a'" source="a" />
  <FIcon v-else-if="status === 'b'" source="b" />
  <FIcon v-else-if="status === 'c'" source="c" />
</template>
<script setup lang="ts">
const props = defineProps<{ status: string }>()
</script>`;
    const result = await convert(input, { componentName: "StatusIcon" });

    // A bare {ternary} is invalid in `return () => (...)`.
    // It should be wrapped in a fragment: <>{ternary}</>
    expect(result.tsx).toContain("return () => (");
    expect(result.tsx).toMatch(/<>\{props\.status/); // Fragment wrapping the ternary
    expect(result.tsx).toContain("</>");
    // Should be a ternary expression
    expect(result.tsx).toContain("?");
    expect(result.tsx).toContain(": null");
  });

  test("v-if + v-else as only root elements produce valid JSX", async () => {
    const input = `<template>
  <div v-if="show">visible</div>
  <span v-else>hidden</span>
</template>
<script setup lang="ts">
const show = true
</script>`;
    const result = await convert(input, { componentName: "Toggle" });

    expect(result.tsx).toContain("return () => (");
    expect(result.tsx).toMatch(/<>\{show/);
    expect(result.tsx).toContain("</>");
  });
});

describe("ref .value unwrapping in JSX", () => {
  test("ref() variables get .value in template expressions", async () => {
    const input = `<template>
  <div>{{ count }}</div>
</template>
<script setup lang="ts">
import { ref } from 'vue'
const count = ref(0)
</script>`;
    const result = await convert(input, { componentName: "RefTest" });

    expect(result.tsx).toContain("{count.value}");
    expect(result.tsx).not.toMatch(/\{count\}(?!\.)/);
  });

  test("computed() variables get .value in template expressions", async () => {
    const input = `<template>
  <div>{{ doubled }}</div>
</template>
<script setup lang="ts">
import { ref, computed } from 'vue'
const count = ref(0)
const doubled = computed(() => count.value * 2)
</script>`;
    const result = await convert(input, { componentName: "ComputedTest" });

    expect(result.tsx).toContain("{doubled.value}");
  });

  test("ref used in attribute binding gets .value", async () => {
    const input = `<template>
  <DynamicScroller :items="visibleStatements" />
</template>
<script setup lang="ts">
import { computed } from 'vue'
const visibleStatements = computed(() => [])
</script>`;
    const result = await convert(input, { componentName: "AttrTest" });

    expect(result.tsx).toContain("items={visibleStatements.value}");
  });

  test("ref used in v-if condition gets .value", async () => {
    const input = `<template>
  <div v-if="isVisible">visible</div>
</template>
<script setup lang="ts">
import { ref } from 'vue'
const isVisible = ref(true)
</script>`;
    const result = await convert(input, { componentName: "VIfRef" });

    expect(result.tsx).toContain("isVisible.value ?");
  });

  test("ref with member access gets .value inserted", async () => {
    const input = `<template>
  <div>{{ items.length }}</div>
</template>
<script setup lang="ts">
import { ref } from 'vue'
const items = ref([])
</script>`;
    const result = await convert(input, { componentName: "MemberTest" });

    expect(result.tsx).toContain("{items.value.length}");
  });

  test("non-ref variables do NOT get .value", async () => {
    const input = `<template>
  <div>{{ label }}</div>
</template>
<script setup lang="ts">
const label = 'hello'
</script>`;
    const result = await convert(input, { componentName: "PlainTest" });

    expect(result.tsx).toContain("{label}");
    expect(result.tsx).not.toContain("label.value");
  });

  test("props do NOT get .value", async () => {
    const input = `<template>
  <div>{{ title }}</div>
</template>
<script setup lang="ts">
const props = defineProps<{ title: string }>()
</script>`;
    const result = await convert(input, { componentName: "PropsTest" });

    // Props are accessed via `props.title` or directly in template as `title`
    // but they are NOT refs
    expect(result.tsx).not.toContain("title.value");
  });

  test("shallowRef gets .value", async () => {
    const input = `<template>
  <div>{{ data }}</div>
</template>
<script setup lang="ts">
import { shallowRef } from 'vue'
const data = shallowRef(null)
</script>`;
    const result = await convert(input, { componentName: "ShallowTest" });

    expect(result.tsx).toContain("{data.value}");
  });

  test("does not double-unwrap already .value expressions in script", async () => {
    const input = `<template>
  <div>{{ count }}</div>
</template>
<script setup lang="ts">
import { ref } from 'vue'
const count = ref(0)
function increment() {
  count.value++
}
</script>`;
    const result = await convert(input, { componentName: "NoDouble" });

    // Template expression should get .value
    expect(result.tsx).toContain("{count.value}");
    // Script body should NOT have .value doubled
    expect(result.tsx).not.toContain("count.value.value");
  });

  test("defineModel variables get .value in template", async () => {
    const input = `<template>
  <div>{{ modelValue }}</div>
</template>
<script setup lang="ts">
const modelValue = defineModel<string>()
</script>`;
    const result = await convert(input, { componentName: "ModelRef" });

    // defineModel becomes computed, which is a ref — needs .value
    expect(result.tsx).toContain("{modelValue.value}");
  });

  test("multiple refs in one expression", async () => {
    const input = `<template>
  <div>{{ firstName + ' ' + lastName }}</div>
</template>
<script setup lang="ts">
import { ref } from 'vue'
const firstName = ref('John')
const lastName = ref('Doe')
</script>`;
    const result = await convert(input, { componentName: "MultiRef" });

    expect(result.tsx).toContain("firstName.value");
    expect(result.tsx).toContain("lastName.value");
  });
});

describe("ref .value does not apply to object keys", () => {
  test("object key in :style binding is not ref-unwrapped", async () => {
    const input = `<template>
  <div :style="{ paddingLeft: paddingLeft }">test</div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
const paddingLeft = computed(() => '24px')
</script>`;
    const result = await convert(input, { componentName: "ObjKeyTest" });

    // Key should stay as `paddingLeft`, value should get .value
    expect(result.tsx).toContain("paddingLeft: paddingLeft.value");
    // Should NOT have paddingLeft.value as key
    expect(result.tsx).not.toContain("paddingLeft.value:");
    expect(result.tsx).not.toContain("paddingLeft.value :");
  });

  test("ref in ternary expression still gets .value", async () => {
    const input = `<template>
  <div :class="isActive ? 'active' : 'inactive'">test</div>
</template>
<script setup lang="ts">
import { ref } from 'vue'
const isActive = ref(true)
</script>`;
    const result = await convert(input, { componentName: "TernaryTest" });

    expect(result.tsx).toContain("isActive.value ?");
  });

  test("object shorthand { refName } treats key correctly", async () => {
    const input = `<template>
  <div :style="{ color }">test</div>
</template>
<script setup lang="ts">
import { ref } from 'vue'
const color = ref('red')
</script>`;
    const result = await convert(input, { componentName: "ShorthandTest" });

    // Shorthand { color } in Vue becomes { color: color } in the expression
    // Key should not get .value, value should
    expect(result.tsx).not.toContain("color.value:");
  });
});

describe("non-scoped style extraction", () => {
  test("non-scoped lang=scss style is extracted as .module.scss", async () => {
    const input = `<template>
  <div class="f-doc-table">test</div>
</template>
<script setup lang="ts">
const x = 1
</script>
<style lang="scss">
.f-doc-table {
  display: grid !important;
  grid-template-columns: 60% 40%;
}
</style>`;
    const result = await convert(input, { componentName: "StyleTest" });

    // Non-scoped styles should still be extracted
    expect(result.css).not.toBeNull();
    expect(result.css).toContain(".f-doc-table");
    // SCSS stays as SCSS — filename should be .scss
    expect(result.cssFilename).toBe("StyleTest.scss");
    // Import in TSX should reference .scss (side-effect import)
    expect(result.tsx).toContain("import './StyleTest.scss'");
  });

  test("scoped styles produce a conversion warning", async () => {
    const input = `<template>
  <div class="foo">test</div>
</template>
<script setup lang="ts">
const x = 1
</script>
<style scoped>
.foo { color: red; }
</style>`;
    const result = await convert(input, { componentName: "ScopedWarn" });

    expect(result.css).not.toBeNull();
    expect(result.cssFilename).toBe("ScopedWarn.css");
    // Should warn about scoped styles
    expect(
      result.warnings.some((w) => w.message.includes("scoped") || w.message.includes("Scoped")),
    ).toBe(true);
  });

  test("plain CSS gets .module.css filename", async () => {
    const input = `<template><div class="bar">test</div></template>
<script setup lang="ts">const x = 1</script>
<style>.bar { color: red; }</style>`;
    const result = await convert(input, { componentName: "PlainCss" });

    expect(result.css).not.toBeNull();
    expect(result.cssFilename).toBe("PlainCss.css");
  });
});

describe("props accessible in template without prefix", () => {
  test("props used in template get props. prefix in JSX", async () => {
    const input = `<template>
  <FDiv
    :style="{ paddingLeft: paddingLeft }"
    :padding="compactStatementLayout ? 'none small none small' : 'none'"
  >
    <FDiv v-if="!compactStatementLayout" width="300px">&nbsp;</FDiv>
  </FDiv>
</template>
<script setup lang="ts">
const props = defineProps<{
    indent: number;
    compactStatementLayout: boolean;
}>();

const { indent } = toRefs(props);

const paddingLeft = computed(() => {
    return \`\${24 + indent.value * 16}px\`;
});
</script>`;
    const result = await convert(input, { componentName: "PropsPrefix" });

    // Props should be accessed via props.xxx in JSX
    expect(result.tsx).toContain("props.compactStatementLayout");
    // Should NOT have bare compactStatementLayout without props. prefix
    expect(result.tsx).not.toMatch(/[^.]compactStatementLayout\b(?!\s*[?:])/m);
  });

  test("props with runtime declaration get props. prefix", async () => {
    const input = `<template>
  <div>{{ label }}</div>
  <div v-if="visible">shown</div>
</template>
<script setup lang="ts">
const props = defineProps<{
  label: string;
  visible: boolean;
}>();
</script>`;
    const result = await convert(input, { componentName: "RuntimeProps" });

    expect(result.tsx).toContain("props.label");
    expect(result.tsx).toContain("props.visible");
  });

  test("type-based defineProps generates runtime props option", async () => {
    const input = `<template>
  <div>{{ label }}</div>
</template>
<script setup lang="ts">
const props = defineProps<{
  label: string;
  count: number;
  active?: boolean;
}>();
</script>`;
    const result = await convert(input, { componentName: "TypedProps" });

    expect(result.tsx).toContain("props: {");
    expect(result.tsx).toContain("label: { type: String, required: true }");
    expect(result.tsx).toContain("count: { type: Number, required: true }");
    expect(result.tsx).toContain("active: { type: Boolean, required: false }");
  });

  test("withDefaults merges defaults into runtime props", async () => {
    const input = `<template>
  <div>{{ msg }}</div>
</template>
<script setup lang="ts">
const props = withDefaults(defineProps<{ msg?: string; count?: number }>(), {
  msg: 'hello',
  count: 0
})
</script>`;
    const result = await convert(input, { componentName: "DefaultProps" });

    expect(result.tsx).toContain("props: {");
    expect(result.tsx).toContain("msg: { type: String, default: 'hello' }");
    expect(result.tsx).toContain("count: { type: Number, default: 0 }");
  });

  test("runtime defineProps passes through unchanged", async () => {
    const input = `<template>
  <div>{{ msg }}</div>
</template>
<script setup lang="ts">
const props = defineProps({
  msg: String,
  count: { type: Number, default: 0 }
})
</script>`;
    const result = await convert(input, { componentName: "RuntimeDefine" });

    // Runtime props should pass through as-is
    expect(result.tsx).toContain("msg: String");
    expect(result.tsx).toContain("type: Number, default: 0");
  });

  test("destructured props via toRefs do NOT get props. prefix", async () => {
    const input = `<template>
  <div>{{ indent }}</div>
</template>
<script setup lang="ts">
const props = defineProps<{ indent: number; label: string }>();
const { indent } = toRefs(props);
</script>`;
    const result = await convert(input, { componentName: "DestructuredProps" });

    // indent is destructured via toRefs so becomes a local ref
    expect(result.tsx).toContain("{indent.value}");
    expect(result.tsx).not.toContain("props.indent");
    // label is still a prop (not destructured)
    expect(result.tsx).not.toContain("indent.value.value");
  });

  test("complex prop types get PropType import", async () => {
    const input = `<template>
  <div>test</div>
</template>
<script setup lang="ts">
const props = defineProps<{
  items: string[];
  config: Record<string, any>;
}>();
</script>`;
    const result = await convert(input, { componentName: "ComplexProps" });

    expect(result.tsx).toContain("PropType");
    expect(result.tsx).toContain("Array as PropType<string[]>");
    expect(result.tsx).toContain("Object as PropType<Record<string, any>>");
  });
});

describe("fixture comparison", () => {
  const fixtureNames = readdirSync(FIXTURES_DIR).filter((name) =>
    existsSync(join(FIXTURES_DIR, name, "input.vue")),
  );

  for (const fixtureName of fixtureNames) {
    test(`fixture: ${fixtureName} produces output`, async () => {
      const input = readFixture(fixtureName, "input.vue");
      const result = await convert(input, {
        componentName: fixtureName
          .split("-")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(""),
      });

      // Every fixture should produce non-empty TSX
      expect(result.tsx.length).toBeGreaterThan(0);
      // Every fixture should produce valid output containing defineComponent
      expect(result.tsx).toContain("defineComponent");

      // If there's an expected.css, verify CSS output exists
      if (existsSync(join(FIXTURES_DIR, fixtureName, "expected.css"))) {
        expect(result.css).not.toBeNull();
        expect(result.cssFilename).not.toBeNull();
      }
    });
  }
});
