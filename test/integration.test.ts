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

  test("scoped CSS component generates CSS and plain import", async () => {
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

  test("shorthand form with quoted kebab-case event names", async () => {
    const input = `<template><div>test</div></template>
<script setup lang="ts">
const emit = defineEmits<{
  selectStatement: [statement: string]
  "select-node": [node: { selectedStatement: string; node: string }]
  mitigate: [data: { statement: string; clause: string }]
  "starmap-sector-clicked": [data: { starmapId: string; starmapFieldId: string; metadataName: string; title: string; clause: string }]
}>()
</script>`;
    const result = await convert(input, { componentName: "EmitKebab" });

    // Should only extract top-level event names, not nested object properties
    expect(result.tsx).toContain(
      "emits: ['selectStatement', 'select-node', 'mitigate', 'starmap-sector-clicked']",
    );
    // Should NOT contain nested property names as events
    expect(result.tsx).not.toContain("'selectedStatement'");
    expect(result.tsx).not.toContain("'starmapId'");
  });

  test("call signature form with kebab-case event names", async () => {
    const input = `<template><div>test</div></template>
<script setup lang="ts">
const emit = defineEmits<{
  (e: 'select-node', data: any): void
  (e: 'update:modelValue', val: string): void
}>()
</script>`;
    const result = await convert(input, { componentName: "EmitKebabCall" });

    expect(result.tsx).toContain("emits: ['select-node', 'update:modelValue']");
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

describe("Vue built-in components import", () => {
  test("Teleport is auto-imported from vue", async () => {
    const input = `<template>
  <Teleport to="body">
    <div>modal</div>
  </Teleport>
</template>
<script setup lang="ts">
const x = 1
</script>`;
    const result = await convert(input, { componentName: "TeleportTest" });

    expect(result.tsx).toContain("Teleport");
    expect(result.tsx).toMatch(/import\s*\{[^}]*Teleport[^}]*\}\s*from\s*'vue'/);
    expect(result.tsx).toContain("<Teleport");
  });

  test("KeepAlive is auto-imported from vue", async () => {
    const input = `<template>
  <KeepAlive>
    <div>cached</div>
  </KeepAlive>
</template>
<script setup lang="ts">
const x = 1
</script>`;
    const result = await convert(input, { componentName: "KeepAliveTest" });

    expect(result.tsx).toMatch(/import\s*\{[^}]*KeepAlive[^}]*\}\s*from\s*'vue'/);
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

  test("ref inside hyphenated attribute name in template literal is not unwrapped", async () => {
    const input = `<template>
  <FDialog :target="\`[data-qa-node-id='\${node.id}']\`" />
</template>
<script setup lang="ts">
import { ref } from 'vue'
const node = ref({ id: '123' })
</script>`;
    const result = await convert(input, { componentName: "HyphenAttr" });

    // node.id inside ${...} should get .value: node.value.id
    // But "node" inside the string "data-qa-node-id" should NOT get .value
    expect(result.tsx).toContain("node.value.id");
    expect(result.tsx).not.toContain("node.value-id");
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

describe("composable return values treated as refs", () => {
  test("useLocalStorage return value gets .value", async () => {
    const input = `<template>
  <button @click="() => (gotAiInfo = true)">got it</button>
</template>
<script setup lang="ts">
const gotAiInfo = useLocalStorage('ai-info', false)
</script>`;
    const result = await convert(input, { componentName: "ComposableRef" });

    expect(result.tsx).toContain("gotAiInfo.value = true");
    expect(result.tsx).not.toContain("gotAiInfo = true");
  });

  test("useXxx composable return value gets .value in template", async () => {
    const input = `<template>
  <div>{{ darkMode }}</div>
</template>
<script setup lang="ts">
const darkMode = useDark()
</script>`;
    const result = await convert(input, { componentName: "UseDark" });

    expect(result.tsx).toContain("{darkMode.value}");
  });

  test("non-use function is not treated as ref", async () => {
    const input = `<template>
  <div>{{ data }}</div>
</template>
<script setup lang="ts">
const data = fetchData()
</script>`;
    const result = await convert(input, { componentName: "NonUse" });

    // fetchData doesn't start with 'use', so not treated as ref
    expect(result.tsx).toContain("{data}");
    expect(result.tsx).not.toContain("data.value");
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

  test("plain CSS gets .css filename", async () => {
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

describe("PropType auto-imported for runtime props", () => {
  test("runtime defineProps using PropType gets PropType imported", async () => {
    const input = `<template>
  <div>test</div>
</template>
<script setup lang="ts">
const props = defineProps({
  items: { type: Array as PropType<string[]>, required: true },
  config: { type: Object as PropType<Record<string, any>>, default: () => ({}) }
})
</script>`;
    const result = await convert(input, { componentName: "PropTypeImport" });

    expect(result.tsx).toMatch(/import\s*\{[^}]*PropType[^}]*\}\s*from\s*'vue'/);
  });
});

describe("string literals not corrupted by .value or props. prefix", () => {
  test("string comparison with prop name is not prefixed", async () => {
    const input = `<template>
  <div v-if="statementType === 'statement'">match</div>
</template>
<script setup lang="ts">
const props = defineProps<{ statementType: string }>()
</script>`;
    const result = await convert(input, { componentName: "StringLit" });

    // The string 'statement' should NOT become 'props.statement'
    expect(result.tsx).toContain("=== 'statement'");
    expect(result.tsx).not.toContain("=== 'props.statement'");
    // But the identifier should get props. prefix
    expect(result.tsx).toContain("props.statementType");
  });

  test("string literal containing ref name is not unwrapped", async () => {
    const input = `<template>
  <div :class="status === 'default' ? 'a' : 'b'">test</div>
</template>
<script setup lang="ts">
import { ref } from 'vue'
const status = ref('default')
</script>`;
    const result = await convert(input, { componentName: "StringRef" });

    // 'default' the string should NOT become 'default.value' or similar
    expect(result.tsx).toContain("=== 'default'");
    // But status the identifier should get .value
    expect(result.tsx).toContain("status.value");
  });

  test("'status' in obj check is not prefixed", async () => {
    const input = `<template>
  <div v-if="'status' in item">has status</div>
</template>
<script setup lang="ts">
const props = defineProps<{ status: string }>()
const item = { status: 'ok' }
</script>`;
    const result = await convert(input, { componentName: "InCheck" });

    // 'status' the string literal should NOT become 'props.status'
    expect(result.tsx).toContain("'status' in item");
    expect(result.tsx).not.toContain("'props.status'");
  });
});

describe("duplicate class attributes merged", () => {
  test("static class and dynamic :class are merged", async () => {
    const input = `<template>
  <div class="base-class" :class="[isActive ? 'active' : '']">test</div>
</template>
<script setup lang="ts">
const isActive = true
</script>`;
    const result = await convert(input, { componentName: "DupClass" });

    // Should NOT have two separate class attributes
    const classMatches = result.tsx.match(/\bclass[=]/g);
    expect(classMatches?.length).toBe(1);
  });
});

describe(".vue import paths stripped", () => {
  test("import from ./Foo.vue becomes ./Foo", async () => {
    const input = `<template>
  <Foo />
</template>
<script setup lang="ts">
import Foo from './Foo.vue'
</script>`;
    const result = await convert(input, { componentName: "VueImport" });

    expect(result.tsx).not.toContain(".vue");
    expect(result.tsx).toContain("from './Foo'");
  });

  test("import from @/components/Bar.vue strips .vue", async () => {
    const input = `<template>
  <Bar />
</template>
<script setup lang="ts">
import Bar from '@/components/Bar.vue'
</script>`;
    const result = await convert(input, { componentName: "VueImport2" });

    expect(result.tsx).not.toContain(".vue");
    expect(result.tsx).toContain("from '@/components/Bar'");
  });
});

describe("pattern 2: async setup when body contains await", () => {
  test("top-level await in script setup produces async setup()", async () => {
    const input = `<template><div>test</div></template>
<script setup lang="ts">
const mainStore = useMainStore();
await mainStore.getConfig();
</script>`;
    const result = await convert(input, { componentName: "AsyncSetup" });

    expect(result.tsx).toContain("async setup()");
  });
});

describe("pattern 3: ref .value in negated object value position", () => {
  test(":class object value with negation gets .value correctly", async () => {
    const input = `<template>
  <div :class="{ 'cursor-pointer': !disabled, 'text-red-600': danger && !disabled }">text</div>
</template>
<script setup lang="ts">
import { ref } from 'vue'
const disabled = ref(false);
const danger = ref(false);
</script>`;
    const result = await convert(input, { componentName: "NegatedRef" });

    expect(result.tsx).toContain("!disabled.value");
    expect(result.tsx).not.toContain("!disabled:");
  });
});

describe("pattern 4: v-for with complex iterable expressions", () => {
  test("v-for with filter expression on iterable", async () => {
    const input = `<template>
  <div v-for="item in items.filter(i => i.active)" :key="item.id">{{ item.name }}</div>
</template>
<script setup lang="ts">
const items = ref([])
</script>`;
    const result = await convert(input, { componentName: "VForFilter" });

    expect(result.tsx).toContain("_renderList(items.value.filter(i => i.active)");
    expect(result.tsx).toContain("(item)");
    expect(result.tsx).not.toContain("item in items");
  });

  test("v-for with 'of' keyword", async () => {
    const input = `<template>
  <div v-for="item of items" :key="item.id">{{ item.name }}</div>
</template>
<script setup lang="ts">
const items = ref([])
</script>`;
    const result = await convert(input, { componentName: "VForOf" });

    expect(result.tsx).toContain("_renderList(items.value");
    expect(result.tsx).toContain("(item)");
    expect(result.tsx).not.toContain("item of items");
  });
});

describe("pattern 5: multiple JSX roots in slot content", () => {
  test("slot with multiple root elements wraps in fragment", async () => {
    const input = `<template>
  <MyComp>
    <template #stats>
      <CompA />
      <CompB />
    </template>
  </MyComp>
</template>
<script setup lang="ts">
</script>`;
    const result = await convert(input, { componentName: "MultiSlot" });

    // Multiple roots in a slot should be wrapped in <>...</>
    expect(result.tsx).toContain("<>");
    expect(result.tsx).toContain("CompA");
    expect(result.tsx).toContain("CompB");
    // Should not have bare JSX elements without fragment
    expect(result.tsx).not.toMatch(/=>\s*<CompA\s*\/><CompB/);
  });
});

describe("pattern 8: import type on JSX component", () => {
  test("type-only import used as JSX component becomes value import", async () => {
    const input = `<template>
  <StatementFuzzySearch />
</template>
<script setup lang="ts">
import type { HighlightMap } from "~/components/shared/StatementFuzzySearch";
import StatementFuzzySearch from "~/components/shared/StatementFuzzySearch";
</script>`;
    const result = await convert(input, { componentName: "TypeImport" });

    // Default import should NOT be type-only
    expect(result.tsx).not.toMatch(/import\s+type\s+StatementFuzzySearch/);
    expect(result.tsx).toContain("StatementFuzzySearch");
  });
});

describe("pattern 9: props. prefix not applied to loop variables", () => {
  test("v-for iterator variable shadows prop name", async () => {
    const input = `<template>
  <div v-for="type in types" :key="type">{{ type }}</div>
</template>
<script setup lang="ts">
const props = defineProps<{ type: string; types: string[] }>()
</script>`;
    const result = await convert(input, { componentName: "LoopVar" });

    // The loop variable 'type' should NOT get props. prefix inside the loop
    expect(result.tsx).toContain("(type)");
    expect(result.tsx).not.toContain("(props.type)");
  });
});

describe("pattern 10: root-level v-if/v-else with slot", () => {
  test("root slot + v-else produces ternary", async () => {
    const input = `<template>
  <slot v-if="hasLoaded" />
  <FDiv v-else align="middle-center" height="100%">
    <FIcon source="i-loader" size="x-large" loading />
  </FDiv>
</template>
<script setup lang="ts">
import { ref } from 'vue'
const hasLoaded = ref(false)
</script>`;
    const result = await convert(input, { componentName: "SlotElse" });

    // Should produce a ternary, not sequential rendering
    expect(result.tsx).toContain("hasLoaded.value ?");
    expect(result.tsx).toContain("slots.default");
    expect(result.tsx).toContain("FDiv");
  });
});

describe("R2 pattern 1: template literal inside object value", () => {
  test("ref in template literal inside object is not shorthand-expanded", async () => {
    const input = `<template>
  <div :style="{ height: \`\${totalSize}px\` }">text</div>
</template>
<script setup lang="ts">
import { ref } from 'vue'
const totalSize = ref(100)
</script>`;
    const result = await convert(input, { componentName: "TplInObj" });

    expect(result.tsx).toContain("`${totalSize.value}px`");
    expect(result.tsx).not.toContain("totalSize: totalSize.value");
  });
});

describe("R2 pattern 3: slot call not double-wrapped in braces", () => {
  test("slot in v-if ternary has no extra braces", async () => {
    const input = `<template>
  <slot v-if="hasLoaded" />
  <FDiv v-else>fallback</FDiv>
</template>
<script setup lang="ts">
import { ref } from 'vue'
const hasLoaded = ref(false)
</script>`;
    const result = await convert(input, { componentName: "SlotBraces" });

    // Should NOT have {slots.default?.()} with extra braces in ternary
    expect(result.tsx).not.toContain("{slots.default?.()}");
    expect(result.tsx).toContain("slots.default?.()");
    expect(result.tsx).toContain("hasLoaded.value ?");
  });
});

describe("R2 pattern 5: v-for 'of' keyword", () => {
  test("v-for with 'of' on template element", async () => {
    const input = `<template>
  <template v-for="doc of getDocs()" :key="doc.id">
    <div>{{ doc.name }}</div>
  </template>
</template>
<script setup lang="ts">
function getDocs() { return [] }
</script>`;
    const result = await convert(input, { componentName: "VForOf" });

    expect(result.tsx).toContain("_renderList(getDocs()");
    expect(result.tsx).toContain("(doc)");
    expect(result.tsx).not.toContain("doc of getDocs");
  });
});

describe("R2 pattern 10: unescaped double quotes in JSX attribute", () => {
  test("attribute value with double quotes uses expression syntax", async () => {
    const input = `<template>
  <Textarea placeholder='[{"type": "vendor"}]' />
</template>
<script setup lang="ts">
</script>`;
    const result = await convert(input, { componentName: "QuoteAttr" });

    // Should not produce unescaped double quotes inside a double-quoted attribute
    expect(result.tsx).not.toMatch(/placeholder="[^"]*"[^"]*"/);
    // Should use expression syntax with single quotes
    expect(result.tsx).toMatch(/placeholder=\{/);
  });
});

describe("R2 pattern 12: kebab-case slot scope keys quoted", () => {
  test("slot props with kebab-case names are quoted", async () => {
    const input = `<template>
  <slot name="filter" :toggle-filter="toggle" :selected-items="items"></slot>
</template>
<script setup lang="ts">
const toggle = () => {}
const items = []
</script>`;
    const result = await convert(input, { componentName: "SlotProps" });

    expect(result.tsx).toContain("'toggle-filter':");
    expect(result.tsx).toContain("'selected-items':");
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

describe("bug: type alias props not resolved", () => {
  test("type alias used in defineProps<TypeName>() generates runtime props", async () => {
    const input = `
<script setup lang="ts">
type Props = {
  count: number;
  label?: string;
};

const props = withDefaults(defineProps<Props>(), {
  label: "items",
});
</script>

<template>
  <span>{{ count }} {{ label }}</span>
</template>
`;
    const result = await convert(input, { componentName: "Test" });

    // Should generate runtime props option in defineComponent
    expect(result.tsx).toContain("props:");
    expect(result.tsx).toContain("count");
    expect(result.tsx).toContain("label");
    // Template should use props. prefix
    expect(result.tsx).toContain("props.count");
    expect(result.tsx).toContain("props.label");
    // Should NOT use bare name without props. prefix in JSX
    expect(result.tsx).not.toMatch(/\{count\}/);
    expect(result.tsx).not.toMatch(/\{label\}/);
    // Type alias should NOT appear inside setup()
    expect(result.tsx).not.toContain("type Props =");
  });

  test("interface used in defineProps<InterfaceName>() generates runtime props", async () => {
    const input = `
<script setup lang="ts">
interface Props {
  title: string;
  disabled?: boolean;
}

const props = defineProps<Props>();
</script>

<template>
  <button :disabled="disabled">{{ title }}</button>
</template>
`;
    const result = await convert(input, { componentName: "Test" });

    expect(result.tsx).toContain("props:");
    expect(result.tsx).toContain("props.title");
    expect(result.tsx).toContain("props.disabled");
    expect(result.tsx).not.toContain("interface Props");
  });
});

describe("--nuxt flag: auto-import components from #components", () => {
  test("unimported PascalCase components are imported from #components", async () => {
    const input = `
<script setup lang="ts">
import { ref } from "vue";
const count = ref(0);
</script>

<template>
  <FDiv>
    <FIconButton icon="plus" @click="count++" />
    <span>{{ count }}</span>
  </FDiv>
</template>
`;
    const result = await convert(input, { componentName: "Test", nuxt: true });

    expect(result.tsx).toContain("import { FDiv, FIconButton } from '#components'");
  });

  test("already-imported components are not duplicated in #components", async () => {
    const input = `
<script setup lang="ts">
import FDiv from "@/components/FDiv.vue";
</script>

<template>
  <FDiv><FButton /></FDiv>
</template>
`;
    const result = await convert(input, { componentName: "Test", nuxt: true });

    // FDiv is already imported — only FButton should come from #components
    expect(result.tsx).not.toMatch(/FDiv.*#components/);
    expect(result.tsx).toContain("import { FButton } from '#components'");
  });

  test("member-expression component tags use root name in #components import", async () => {
    const input = `
<script setup lang="ts">
import EmojiPickerPrimitive from "vue-frimousse";
</script>

<template>
  <EmojiPickerPrimitive.Search />
  <EmojiPickerPrimitive.ActiveEmoji />
  <FButton />
</template>
`;
    const result = await convert(input, { componentName: "Test", nuxt: true });

    // EmojiPickerPrimitive is already imported — dotted sub-components must not appear
    // in the #components import statement (they're not valid named import identifiers)
    expect(result.tsx).not.toMatch(/import\s*\{[^}]*EmojiPickerPrimitive\./);
    // The dotted names are still valid as JSX element tags in the output
    expect(result.tsx).toContain("<EmojiPickerPrimitive.Search");
    // Only truly unimported components go into #components
    expect(result.tsx).toContain("import { FButton } from '#components'");
  });

  test("without --nuxt flag no #components import is added", async () => {
    const input = `
<template><FDiv /></template>
`;
    const result = await convert(input, { componentName: "Test" });

    expect(result.tsx).not.toContain("#components");
  });
});

describe("bug: interface Props extends Base — hoisting and prop detection", () => {
  test("interface with extends is hoisted before defineComponent, not inside setup", async () => {
    const input = `
<script setup lang="ts">
import type { PrimitiveProps } from "reka-ui";

interface Props extends PrimitiveProps {
  variant?: "default" | "outline";
  size?: "sm" | "lg";
}

const props = withDefaults(defineProps<Props>(), { as: "button" });
</script>

<template>
  <div :variant="variant" :size="size" :as="as" />
</template>
`;
    const result = await convert(input, { componentName: "Button" });

    // Interface should be at module level, before defineComponent
    const defineComponentIdx = result.tsx.indexOf("defineComponent(");
    const interfaceIdx = result.tsx.indexOf("interface Props");
    expect(interfaceIdx).toBeGreaterThan(-1);
    expect(interfaceIdx).toBeLessThan(defineComponentIdx);

    // Props from inline body + defaults get props. prefix
    expect(result.tsx).toContain("props.variant");
    expect(result.tsx).toContain("props.size");
    expect(result.tsx).toContain("props.as");

    // Setup has type annotation
    expect(result.tsx).toContain("props: Props");

    // Interface should NOT be inside setup body
    const setupIdx = result.tsx.indexOf("setup(");
    const interfaceInSetupIdx = result.tsx.indexOf("interface Props", setupIdx);
    expect(interfaceInSetupIdx).toBe(-1);
  });
});

describe("bug: imported prop type — props. prefix and type annotation", () => {
  test("withDefaults defaults keys used as prop names when type is imported", async () => {
    const input = `
<script setup lang="ts">
import type { SidebarProps } from "./types";

const props = withDefaults(defineProps<SidebarProps>(), {
  side: "left",
  variant: "sidebar",
  collapsible: "offcanvas",
});
</script>

<template>
  <div :data-side="side" :data-variant="variant" :data-collapsible="collapsible" />
</template>
`;
    const result = await convert(input, { componentName: "Sidebar" });

    // Props with defaults should get props. prefix in JSX
    expect(result.tsx).toContain("props.side");
    expect(result.tsx).toContain("props.variant");
    expect(result.tsx).toContain("props.collapsible");
    // Type annotation on setup so TypeScript knows the prop shapes
    expect(result.tsx).toContain("props: SidebarProps");
  });

  test("unresolved prop type gets type annotation on setup even without defaults", async () => {
    const input = `
<script setup lang="ts">
import type { ButtonProps } from "./types";

const props = defineProps<ButtonProps>();
</script>

<template><button /></template>
`;
    const result = await convert(input, { componentName: "Button" });

    expect(result.tsx).toContain("props: ButtonProps");
  });
});

describe("bug: multiline union type prop missing props. prefix", () => {
  test("prop with type on next line after colon gets props. prefix in JSX", async () => {
    const input = `
<script setup lang="ts">
const props = defineProps<{
  align?:
    | "top-left"
    | "top-center"
    | "top-right";
  size: number;
}>();
</script>

<template>
  <div :align="align" :size="size" />
</template>
`;
    const result = await convert(input, { componentName: "Test" });

    expect(result.tsx).toContain("props.align");
    expect(result.tsx).toContain("props.size");
    expect(result.tsx).not.toMatch(/align=\{align\}/);
  });
});

describe("bug: emits variable aliased to non-'emit' name", () => {
  test("const emits = defineEmits() body references resolve via alias", async () => {
    const input = `
<script setup lang="ts">
import { useForwardPropsEmits } from "reka-ui";

const props = defineProps<{ open: boolean }>();
const emits = defineEmits<{ close: [] }>();
const forwarded = useForwardPropsEmits(props, emits);
</script>

<template><div /></template>
`;
    const result = await convert(input, { componentName: "Test" });

    // The body reference to 'emits' should be usable - either via alias or rewrite
    expect(result.tsx).toContain("useForwardPropsEmits(props, emits)");
    // An alias 'const emits = emit' should be injected
    expect(result.tsx).toContain("const emits = emit");
  });
});

describe("bug: useSlots() should be removed from setup body", () => {
  test("const slots = useSlots() is removed", async () => {
    const input = `
<script setup lang="ts">
import { useSlots } from "vue";
const slots = useSlots();
</script>

<template><slot /></template>
`;
    const result = await convert(input, { componentName: "Test" });

    expect(result.tsx).not.toContain("useSlots");
    expect(result.tsx).not.toContain("const slots =");
    // slots should still be in the setup context
    expect(result.tsx).toMatch(/setup\([^)]*\{[^}]*slots/);
  });

  test("useSlots import is removed when the only usage is stripped", async () => {
    const input = `
<script setup lang="ts">
import { useSlots } from "vue";
const slots = useSlots();
</script>

<template><slot /></template>
`;
    const result = await convert(input, { componentName: "Test" });

    // useSlots should not appear in imports either
    expect(result.tsx).not.toContain("useSlots");
  });
});

describe("bug: exported type alias props not resolved", () => {
  test("export type used in defineProps<TypeName>() generates runtime props and props. prefix", async () => {
    const input = `
<script setup lang="ts">
const props = withDefaults(defineProps<FDivProps>(), {
  variant: "block",
});

export type FDivProps = {
  variant?: "block" | "curved";
  size: number;
};
</script>

<template>
  <div :data-variant="variant">{{ size }}</div>
</template>
`;
    const result = await convert(input, { componentName: "FDiv" });

    // Runtime props generated from the exported type
    expect(result.tsx).toContain("props:");
    expect(result.tsx).toContain("variant");
    expect(result.tsx).toContain("size");
    // Template uses props. prefix
    expect(result.tsx).toContain("props.variant");
    expect(result.tsx).toContain("props.size");
    // Export preserved outside defineComponent
    expect(result.tsx).toContain("export type FDivProps");
  });
});

describe("bug: string union prop type uses Object instead of String", () => {
  test("string literal union prop type uses String as PropType<...>", async () => {
    const input = `
<script setup lang="ts">
const props = defineProps<{
  category: "fill" | "outline" | "transparent" | "packed"
  size?: "small" | "medium" | "large"
}>()
</script>

<template><div>{{ category }}</div></template>
`;
    const result = await convert(input, { componentName: "Test" });

    expect(result.tsx).toContain(
      'String as PropType<"fill" | "outline" | "transparent" | "packed">',
    );
    expect(result.tsx).toContain('String as PropType<"small" | "medium" | "large">');
    expect(result.tsx).not.toContain('Object as PropType<"fill"');
    expect(result.tsx).not.toContain('Object as PropType<"small"');
  });
});

describe("bug: named import dropped when namespace import exists from same module", () => {
  test("preserves named import alongside namespace import from same module", async () => {
    const input = `
<script setup lang="ts">
import { Icon } from "@/components/icons";
import * as Icons from "@/components/icons";
</script>

<template>
  <Icon :icon-node="Icons.home" />
</template>
`;
    const result = await convert(input, { componentName: "Test" });

    expect(result.tsx).toContain("import { Icon }");
    expect(result.tsx).toContain("import * as Icons");
  });
});
