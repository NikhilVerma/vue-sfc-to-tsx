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
