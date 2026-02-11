import { describe, expect, test } from 'bun:test';
import { extractMacros } from '../../src/script/macros';

describe('extractMacros', () => {
  test('extracts defineProps with type parameter', () => {
    const script = `
import { ref } from 'vue'
import type { UserProps } from './types'

const props = defineProps<UserProps>()
const count = ref(0)
`;
    const result = extractMacros(script);

    expect(result.props).not.toBeNull();
    expect(result.props!.type).toBe('UserProps');
    expect(result.body).toBe('const count = ref(0)');
    expect(result.imports).toHaveLength(2);
    expect(result.imports[0].source).toBe('vue');
    expect(result.imports[0].namedImports).toEqual([{ imported: 'ref', local: 'ref' }]);
    expect(result.imports[1].source).toBe('./types');
    expect(result.imports[1].typeOnly).toBe(true);
  });

  test('extracts defineProps with runtime argument', () => {
    const script = `
const props = defineProps({
  msg: String,
  count: { type: Number, default: 0 }
})
`;
    const result = extractMacros(script);

    expect(result.props).not.toBeNull();
    expect(result.props!.runtime).toContain('msg: String');
    expect(result.props!.type).toBeUndefined();
  });

  test('extracts withDefaults(defineProps<T>(), { ... })', () => {
    const script = `
const props = withDefaults(defineProps<{ msg?: string }>(), { msg: 'hello' })
`;
    const result = extractMacros(script);

    expect(result.props).not.toBeNull();
    expect(result.props!.type).toBe('{ msg?: string }');
    expect(result.props!.defaults).toBe("{ msg: 'hello' }");
    expect(result.body).toBe('');
  });

  test('extracts defineEmits with type parameter', () => {
    const script = `
const emit = defineEmits<{ (e: 'update', val: string): void }>()
`;
    const result = extractMacros(script);

    expect(result.emits).not.toBeNull();
    expect(result.emits!.type).toBe("{ (e: 'update', val: string): void }");
  });

  test('extracts defineEmits with runtime argument', () => {
    const script = `
const emit = defineEmits(['update', 'delete'])
`;
    const result = extractMacros(script);

    expect(result.emits).not.toBeNull();
    expect(result.emits!.runtime).toBe("['update', 'delete']");
  });

  test('extracts defineSlots with type parameter', () => {
    const script = `
const slots = defineSlots<{ default(props: { item: string }): any }>()
`;
    const result = extractMacros(script);

    expect(result.slots).not.toBeNull();
    expect(result.slots!.type).toBe('{ default(props: { item: string }): any }');
  });

  test('extracts defineExpose', () => {
    const script = `
defineExpose({ reset, validate })
`;
    const result = extractMacros(script);

    expect(result.expose).not.toBeNull();
    expect(result.expose!.runtime).toBe('{ reset, validate }');
  });

  test('extracts defineOptions', () => {
    const script = `
defineOptions({ name: 'MyComponent', inheritAttrs: false })
`;
    const result = extractMacros(script);

    expect(result.options).not.toBeNull();
    expect(result.options!.runtime).toBe("{ name: 'MyComponent', inheritAttrs: false }");
  });

  test('extracts all macros together', () => {
    const script = `
import { ref } from 'vue'
import type { UserProps } from './types'

const props = defineProps<UserProps>()
const emit = defineEmits<{ (e: 'update', val: string): void }>()

const count = ref(0)
`;
    const result = extractMacros(script);

    expect(result.props).not.toBeNull();
    expect(result.props!.type).toBe('UserProps');
    expect(result.emits).not.toBeNull();
    expect(result.emits!.type).toBe("{ (e: 'update', val: string): void }");
    expect(result.body).toBe('const count = ref(0)');
    expect(result.imports).toHaveLength(2);
  });

  test('handles script with no macros', () => {
    const script = `
import { ref } from 'vue'

const count = ref(0)
`;
    const result = extractMacros(script);

    expect(result.props).toBeNull();
    expect(result.emits).toBeNull();
    expect(result.slots).toBeNull();
    expect(result.expose).toBeNull();
    expect(result.options).toBeNull();
    expect(result.body).toBe('const count = ref(0)');
    expect(result.imports).toHaveLength(1);
  });

  test('handles inline type in defineProps', () => {
    const script = `
const props = defineProps<{ msg: string; count: number }>()
`;
    const result = extractMacros(script);

    expect(result.props).not.toBeNull();
    expect(result.props!.type).toBe('{ msg: string; count: number }');
  });

  test('handles multiline type in defineProps', () => {
    const script = `
const props = defineProps<{
  msg: string
  count: number
  items: Array<string>
}>()
`;
    const result = extractMacros(script);

    expect(result.props).not.toBeNull();
    expect(result.props!.type).toContain('msg: string');
    expect(result.props!.type).toContain('items: Array<string>');
  });

  test('parses default import', () => {
    const script = `
import MyComponent from './MyComponent.vue'

const x = 1
`;
    const result = extractMacros(script);

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0].defaultImport).toBe('MyComponent');
    expect(result.imports[0].source).toBe('./MyComponent.vue');
  });

  test('parses namespace import', () => {
    const script = `
import * as utils from './utils'
`;
    const result = extractMacros(script);

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0].namespaceImport).toBe('utils');
    expect(result.imports[0].source).toBe('./utils');
  });

  test('parses mixed default and named imports', () => {
    const script = `
import Vue, { ref, computed } from 'vue'
`;
    const result = extractMacros(script);

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0].defaultImport).toBe('Vue');
    expect(result.imports[0].namedImports).toEqual([
      { imported: 'ref', local: 'ref' },
      { imported: 'computed', local: 'computed' },
    ]);
  });

  test('parses aliased named imports', () => {
    const script = `
import { ref as myRef } from 'vue'
`;
    const result = extractMacros(script);

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0].namedImports).toEqual([{ imported: 'ref', local: 'myRef' }]);
  });

  describe('defineModel', () => {
    test('extracts single unnamed defineModel', () => {
      const script = `
const modelValue = defineModel<string>()
`;
      const result = extractMacros(script);

      expect(result.models).toHaveLength(1);
      expect(result.models[0].variableName).toBe('modelValue');
      expect(result.models[0].name).toBeNull();
      expect(result.models[0].type).toBe('string');
      expect(result.models[0].options).toBeUndefined();
      expect(result.body).toBe('');
    });

    test('extracts named defineModel', () => {
      const script = `
const visible = defineModel<boolean>("visible")
`;
      const result = extractMacros(script);

      expect(result.models).toHaveLength(1);
      expect(result.models[0].variableName).toBe('visible');
      expect(result.models[0].name).toBe('visible');
      expect(result.models[0].type).toBe('boolean');
      expect(result.models[0].options).toBeUndefined();
      expect(result.body).toBe('');
    });

    test('extracts named defineModel with options', () => {
      const script = `
const visible = defineModel<boolean>("visible", { default: false })
`;
      const result = extractMacros(script);

      expect(result.models).toHaveLength(1);
      expect(result.models[0].variableName).toBe('visible');
      expect(result.models[0].name).toBe('visible');
      expect(result.models[0].type).toBe('boolean');
      expect(result.models[0].options).toBe('{ default: false }');
      expect(result.body).toBe('');
    });

    test('extracts multiple defineModel calls', () => {
      const script = `
const modelValue = defineModel<string>()
const visible = defineModel<boolean>("visible", { default: false })
const title = defineModel<string>("title")
`;
      const result = extractMacros(script);

      expect(result.models).toHaveLength(3);
      expect(result.models[0].variableName).toBe('modelValue');
      expect(result.models[0].name).toBeNull();
      expect(result.models[1].variableName).toBe('visible');
      expect(result.models[1].name).toBe('visible');
      expect(result.models[1].options).toBe('{ default: false }');
      expect(result.models[2].variableName).toBe('title');
      expect(result.models[2].name).toBe('title');
      expect(result.body).toBe('');
    });

    test('extracts defineModel alongside defineProps and defineEmits', () => {
      const script = `
import { ref } from 'vue'

const props = defineProps<{ label: string }>()
const emit = defineEmits<{ (e: 'click'): void }>()
const modelValue = defineModel<string>()
const count = ref(0)
`;
      const result = extractMacros(script);

      expect(result.props).not.toBeNull();
      expect(result.props!.type).toBe('{ label: string }');
      expect(result.emits).not.toBeNull();
      expect(result.models).toHaveLength(1);
      expect(result.models[0].variableName).toBe('modelValue');
      expect(result.body).toBe('const count = ref(0)');
    });

    test('extracts defineModel with required option', () => {
      const script = `
const title = defineModel<string>("title", { required: true })
`;
      const result = extractMacros(script);

      expect(result.models).toHaveLength(1);
      expect(result.models[0].variableName).toBe('title');
      expect(result.models[0].name).toBe('title');
      expect(result.models[0].options).toBe('{ required: true }');
    });

    test('extracts defineModel without type parameter', () => {
      const script = `
const modelValue = defineModel()
`;
      const result = extractMacros(script);

      expect(result.models).toHaveLength(1);
      expect(result.models[0].variableName).toBe('modelValue');
      expect(result.models[0].name).toBeNull();
      expect(result.models[0].type).toBeUndefined();
    });

    test('returns empty models array when no defineModel present', () => {
      const script = `
const count = ref(0)
`;
      const result = extractMacros(script);

      expect(result.models).toEqual([]);
    });
  });
});
