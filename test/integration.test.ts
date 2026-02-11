import { describe, expect, test } from 'bun:test';
import { convert } from '../src/index';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const FIXTURES_DIR = join(import.meta.dir, 'fixtures');

function readFixture(name: string, file: string): string {
  return readFileSync(join(FIXTURES_DIR, name, file), 'utf-8');
}

function normalize(str: string): string {
  return str.replace(/\s+/g, ' ').trim();
}

describe('convert() end-to-end', () => {
  test('basic component produces valid TSX', async () => {
    const input = readFixture('basic', 'input.vue');
    const result = await convert(input, { componentName: 'Basic' });

    expect(result.warnings).toHaveLength(0);
    expect(result.tsx).toContain('defineComponent');
    expect(result.tsx).toContain('setup()');
    expect(result.tsx).toContain('return () =>');
    expect(result.tsx).toContain('{title}');
    expect(result.tsx).toContain('{message}');
    expect(result.tsx).toContain('id={spanId}');
    expect(result.tsx).toContain('<input type="text" placeholder="Enter name" />');
    expect(result.tsx).toContain('class="greeting"');
    expect(result.css).toBeNull(); // no scoped styles
    expect(result.cssFilename).toBeNull();
  });

  test('script-setup component with macros', async () => {
    const input = readFixture('script-setup', 'input.vue');
    const result = await convert(input, { componentName: 'ScriptSetup' });

    expect(result.tsx).toContain('defineComponent');
    expect(result.tsx).toContain('setup(props');
    expect(result.tsx).toContain('emit');
    expect(result.tsx).toContain('slots');
    expect(result.tsx).toContain('expose');
    expect(result.tsx).toContain('return () =>');
    // Should NOT contain defineProps/defineEmits/defineSlots/defineExpose (they're macros)
    expect(result.tsx).not.toContain('defineProps');
    expect(result.tsx).not.toContain('defineEmits');
    expect(result.tsx).not.toContain('defineSlots');
    expect(result.tsx).not.toContain('defineExpose');
    expect(result.tsx).not.toContain('withDefaults');
  });

  test('css-modules component generates CSS and classMap', async () => {
    const input = readFixture('css-modules', 'input.vue');
    const result = await convert(input, { componentName: 'CssModules' });

    expect(result.css).not.toBeNull();
    expect(result.cssFilename).toBe('CssModules.module.css');
    expect(result.css).toContain('.container');
    expect(result.css).toContain('.title');
    expect(result.css).toContain('.active');
    // TSX should import styles
    expect(result.tsx).toContain("import styles from './CssModules.module.css'");
    // TSX should use styles.xxx
    expect(result.tsx).toContain('styles.container');
    expect(result.tsx).toContain('styles.title');
    expect(result.tsx).toContain('styles.active');
  });

  test('conditionals component', async () => {
    const input = readFixture('conditionals', 'input.vue');
    const result = await convert(input, { componentName: 'Conditionals' });

    expect(result.tsx).toContain('defineComponent');
    // Should have ternary expressions for v-if/v-else
    expect(result.tsx).toContain('?');
    expect(result.tsx).toContain(':');
  });

  test('v-for component', async () => {
    const input = readFixture('v-for', 'input.vue');
    const result = await convert(input, { componentName: 'VFor' });

    expect(result.tsx).toContain('.map(');
    expect(result.tsx).toContain('=>');
  });

  test('events component', async () => {
    const input = readFixture('events', 'input.vue');
    const result = await convert(input, { componentName: 'Events' });

    expect(result.tsx).toContain('onClick');
  });

  test('slots component', async () => {
    const input = readFixture('slots', 'input.vue');
    const result = await convert(input, { componentName: 'Slots' });

    // Slot content is rendered as object with slot names
    expect(result.tsx).toContain('header');
    expect(result.tsx).toContain('footer');
    expect(result.tsx).toContain('default');
  });
});

describe('convert() error handling', () => {
  test('empty source', async () => {
    const result = await convert('', { componentName: 'Empty' });
    // Should not crash
    expect(result.tsx).toBeDefined();
  });

  test('template only (no script)', async () => {
    const result = await convert('<template><div>hi</div></template>', {
      componentName: 'NoScript',
    });
    expect(result.tsx).toContain('defineComponent');
    expect(result.tsx).toContain('<div>hi</div>');
  });

  test('no template', async () => {
    const result = await convert(
      `<script setup>\nconst x = 1\n</script>`,
      { componentName: 'NoTemplate' },
    );
    expect(result.tsx).toContain('defineComponent');
    expect(result.tsx).toContain('<></>');
  });

  test('component name from options', async () => {
    const result = await convert(
      '<template><div>test</div></template><style scoped>.foo{}</style>',
      { componentName: 'MyWidget' },
    );
    expect(result.cssFilename).toBe('MyWidget.module.css');
  });
});

describe('template globals and setup context', () => {
  test('$attrs in template adds attrs to setup context', async () => {
    const result = await convert(
      `<template><div v-bind="$attrs" /></template><script setup lang="ts">\nconst x = 1\n</script>`,
      { componentName: 'AttrsTest' },
    );
    expect(result.tsx).toContain('{...attrs}');
    expect(result.tsx).not.toContain('$attrs');
    expect(result.tsx).toMatch(/setup\([^)]*\{[^}]*attrs/);
  });

  test('$slots in template adds slots to setup context', async () => {
    const result = await convert(
      `<template><div v-if="$slots.header">has header</div></template><script setup lang="ts">\nconst x = 1\n</script>`,
      { componentName: 'SlotsTest' },
    );
    expect(result.tsx).toContain('slots.header');
    expect(result.tsx).not.toContain('$slots');
    expect(result.tsx).toMatch(/setup\([^)]*\{[^}]*slots/);
  });

  test('$emit in template adds emit to setup context', async () => {
    const result = await convert(
      `<template><button @click="$emit('foo')">click</button></template><script setup lang="ts">\nconst x = 1\n</script>`,
      { componentName: 'EmitTest' },
    );
    expect(result.tsx).toContain("emit('foo')");
    expect(result.tsx).not.toContain('$emit');
    expect(result.tsx).toMatch(/setup\([^)]*\{[^}]*emit/);
  });

  test('$t produces a warning', async () => {
    const result = await convert(
      `<template><div>{{ $t('hello') }}</div></template><script setup lang="ts">\nconst x = 1\n</script>`,
      { componentName: 'I18nTest' },
    );
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some(w => w.message.includes('$t'))).toBe(true);
  });

  test('$route produces a warning', async () => {
    const result = await convert(
      `<template><div>{{ $route.params.id }}</div></template><script setup lang="ts">\nconst x = 1\n</script>`,
      { componentName: 'RouteTest' },
    );
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some(w => w.message.includes('$route'))).toBe(true);
  });

  test('<slot> and $slots both use slots consistently', async () => {
    const result = await convert(
      `<template><div><slot /><div v-if="$slots.footer">footer present</div></div></template><script setup lang="ts">\nconst x = 1\n</script>`,
      { componentName: 'SlotConsistency' },
    );
    expect(result.tsx).toContain('slots.default');
    expect(result.tsx).toContain('slots.footer');
    expect(result.tsx).not.toContain('$slots');
    expect(result.tsx).toMatch(/setup\([^)]*\{[^}]*slots/);
  });
});

describe('defineModel integration', () => {
  test('single unnamed defineModel produces computed + props + emits', async () => {
    const input = `<template><div>{{ modelValue }}</div></template>
<script setup lang="ts">
const modelValue = defineModel<string>()
</script>`;
    const result = await convert(input, { componentName: 'ModelTest' });

    // Should not contain the raw defineModel macro
    expect(result.tsx).not.toContain('defineModel');
    // Should have computed import
    expect(result.tsx).toContain('computed');
    // Should generate computed get/set for modelValue
    expect(result.tsx).toContain('const modelValue = computed<string>({');
    expect(result.tsx).toContain('props.modelValue');
    expect(result.tsx).toContain("emit('update:modelValue'");
    // Should have emit in setup context
    expect(result.tsx).toMatch(/setup\([^)]*emit/);
  });

  test('named defineModel generates correct prop and emit names', async () => {
    const input = `<template><div>{{ visible }}</div></template>
<script setup lang="ts">
const visible = defineModel<boolean>("visible", { default: false })
</script>`;
    const result = await convert(input, { componentName: 'NamedModel' });

    expect(result.tsx).not.toContain('defineModel');
    expect(result.tsx).toContain('const visible = computed<boolean>({');
    expect(result.tsx).toContain('props.visible');
    expect(result.tsx).toContain("emit('update:visible'");
  });

  test('multiple defineModel calls generate multiple computeds', async () => {
    const input = `<template><div>{{ modelValue }} {{ visible }}</div></template>
<script setup lang="ts">
const modelValue = defineModel<string>()
const visible = defineModel<boolean>("visible")
</script>`;
    const result = await convert(input, { componentName: 'MultiModel' });

    expect(result.tsx).not.toContain('defineModel');
    expect(result.tsx).toContain('const modelValue = computed<string>({');
    expect(result.tsx).toContain('const visible = computed<boolean>({');
    expect(result.tsx).toContain("emit('update:modelValue'");
    expect(result.tsx).toContain("emit('update:visible'");
  });

  test('defineModel alongside defineProps and defineEmits', async () => {
    const input = `<template><div>{{ label }} {{ modelValue }}</div></template>
<script setup lang="ts">
const props = defineProps<{ label: string }>()
const emit = defineEmits<{ (e: 'click'): void }>()
const modelValue = defineModel<string>()
</script>`;
    const result = await convert(input, { componentName: 'MixedMacros' });

    expect(result.tsx).not.toContain('defineModel');
    expect(result.tsx).not.toContain('defineProps');
    expect(result.tsx).not.toContain('defineEmits');
    expect(result.tsx).toContain('const modelValue = computed<string>({');
    expect(result.tsx).toContain('defineComponent');
  });
});

describe('defineExpose integration', () => {
  test('emits expose() call in setup body', async () => {
    const input = `<template><div>test</div></template>
<script setup lang="ts">
import { ref } from 'vue'

const count = ref(0)

function scrollTo() {}
function clearSelection() {}

defineExpose({ scrollTo, clearSelection })
</script>`;
    const result = await convert(input, { componentName: 'ExposeTest' });

    expect(result.tsx).toContain('expose({ scrollTo, clearSelection })');
    expect(result.tsx).toMatch(/setup\([^)]*\{[^}]*expose/);
    expect(result.tsx).not.toContain('defineExpose');
  });
});

describe('side-effect imports and exports in setup', () => {
  test('side-effect imports hoisted to top level', async () => {
    const input = `<template><div>test</div></template>
<script setup lang="ts">
import { ref } from 'vue'
import './polyfill'

const count = ref(0)
</script>`;
    const result = await convert(input, { componentName: 'ImportTest' });

    // Side-effect import should be before export default defineComponent
    const importIdx = result.tsx.indexOf("import './polyfill'");
    const defineIdx = result.tsx.indexOf('export default defineComponent');
    expect(importIdx).toBeGreaterThan(-1);
    expect(defineIdx).toBeGreaterThan(importIdx);

    // Should not appear inside setup body
    const setupIdx = result.tsx.indexOf('setup(');
    const setupBody = result.tsx.slice(setupIdx);
    expect(setupBody).not.toContain("import './polyfill'");
  });

  test('export statements placed after defineComponent', async () => {
    const input = `<template><div>test</div></template>
<script setup lang="ts">
import { ref } from 'vue'

const count = ref(0)
export type { Foo } from './types'
</script>`;
    const result = await convert(input, { componentName: 'ExportTest' });

    // Export should be after the defineComponent closing
    const defineEnd = result.tsx.lastIndexOf('})');
    const exportIdx = result.tsx.indexOf("export type { Foo } from './types'");
    expect(exportIdx).toBeGreaterThan(defineEnd);

    // Should not appear inside setup body
    const setupIdx = result.tsx.indexOf('setup(');
    const returnIdx = result.tsx.indexOf('return () =>');
    const setupBody = result.tsx.slice(setupIdx, returnIdx);
    expect(setupBody).not.toContain('export type');
  });
});

describe('export declarations hoisted to module level', () => {
  test('multiline export type declarations are hoisted out of setup', async () => {
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
    const result = await convert(input, { componentName: 'TypeDeclTest' });

    // Type declarations should be AFTER defineComponent, at module level
    const defineEnd = result.tsx.lastIndexOf('})');
    const afterDefine = result.tsx.slice(defineEnd);
    expect(afterDefine).toContain('export type VirtualizedListItem =');
    expect(afterDefine).toContain('| number;');
    expect(afterDefine).toContain('export type DocumentGroupNode = {');
    expect(afterDefine).toContain('isDocumentNode: true;');

    // They should NOT be inside setup body
    const setupIdx = result.tsx.indexOf('setup(');
    const returnIdx = result.tsx.indexOf('return () =>');
    const setupBody = result.tsx.slice(setupIdx, returnIdx);
    expect(setupBody).not.toContain('export type');

    // expose should still work
    expect(result.tsx).toContain('expose({ scrollTo })');
  });

  test('multiline imports are properly extracted to top-level', async () => {
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
    const result = await convert(input, { componentName: 'MultiImport' });

    // Multiline imports should be at top level, before defineComponent
    const defineIdx = result.tsx.indexOf('export default defineComponent');
    const beforeDefine = result.tsx.slice(0, defineIdx);
    expect(beforeDefine).toContain('ClauseSchemaType');
    expect(beforeDefine).toContain('DBDocumentSchema');
    expect(beforeDefine).toContain('ParameterDefinitionSchemaType');
    expect(beforeDefine).toContain('StatementStatus');

    // Should NOT be inside setup
    const setupIdx = result.tsx.indexOf('setup(');
    const setupBody = result.tsx.slice(setupIdx);
    expect(setupBody).not.toContain('ClauseSchemaType');
    expect(setupBody).not.toContain('@nonfx/stance-schema');
  });
});

describe('root-level v-if chain without wrapper element', () => {
  test('single v-if/v-else-if chain as root produces valid JSX', async () => {
    const input = `<template>
  <FIcon v-if="status === 'a'" source="a" />
  <FIcon v-else-if="status === 'b'" source="b" />
  <FIcon v-else-if="status === 'c'" source="c" />
</template>
<script setup lang="ts">
const props = defineProps<{ status: string }>()
</script>`;
    const result = await convert(input, { componentName: 'StatusIcon' });

    // A bare {ternary} is invalid in `return () => (...)`.
    // It should be wrapped in a fragment: <>{ternary}</>
    expect(result.tsx).toContain('return () => (');
    expect(result.tsx).toMatch(/<>\{status/);  // Fragment wrapping the ternary
    expect(result.tsx).toContain('</>');
    // Should be a ternary expression
    expect(result.tsx).toContain('?');
    expect(result.tsx).toContain(': null');
  });

  test('v-if + v-else as only root elements produce valid JSX', async () => {
    const input = `<template>
  <div v-if="show">visible</div>
  <span v-else>hidden</span>
</template>
<script setup lang="ts">
const show = true
</script>`;
    const result = await convert(input, { componentName: 'Toggle' });

    expect(result.tsx).toContain('return () => (');
    expect(result.tsx).toMatch(/<>\{show/);
    expect(result.tsx).toContain('</>');
  });
});

describe('fixture comparison', () => {
  const fixtureNames = readdirSync(FIXTURES_DIR).filter((name) =>
    existsSync(join(FIXTURES_DIR, name, 'input.vue')),
  );

  for (const fixtureName of fixtureNames) {
    test(`fixture: ${fixtureName} produces output`, async () => {
      const input = readFixture(fixtureName, 'input.vue');
      const result = await convert(input, {
        componentName: fixtureName
          .split('-')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(''),
      });

      // Every fixture should produce non-empty TSX
      expect(result.tsx.length).toBeGreaterThan(0);
      // Every fixture should produce valid output containing defineComponent
      expect(result.tsx).toContain('defineComponent');

      // If there's an expected.module.css, verify CSS output exists
      if (existsSync(join(FIXTURES_DIR, fixtureName, 'expected.module.css'))) {
        expect(result.css).not.toBeNull();
        expect(result.cssFilename).not.toBeNull();
      }
    });
  }
});
