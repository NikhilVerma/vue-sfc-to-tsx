import { describe, expect, test } from 'bun:test';
import { extractStyles, getStyleFilename } from '../../src/style/index';
import type { StyleBlock } from '../../src/types';

describe('extractStyles', () => {
  test('returns null when no scoped styles exist', () => {
    const styles: StyleBlock[] = [
      { content: '.foo { color: red; }', scoped: false, lang: undefined },
    ];
    expect(extractStyles(styles, 'MyComponent')).toBeNull();
  });

  test('returns null for empty styles array', () => {
    expect(extractStyles([], 'MyComponent')).toBeNull();
  });

  test('extracts scoped styles and builds class map', () => {
    const styles: StyleBlock[] = [
      {
        content: '.hello { color: red; }\n.world { font-size: 14px; }',
        scoped: true,
        lang: undefined,
      },
    ];
    const result = extractStyles(styles, 'MyComponent');

    expect(result).not.toBeNull();
    expect(result!.css).toContain('.hello');
    expect(result!.css).toContain('.world');
    expect(result!.classMap.get('hello')).toBe('styles.hello');
    expect(result!.classMap.get('world')).toBe('styles.world');
  });

  test('uses bracket notation for hyphenated class names', () => {
    const styles: StyleBlock[] = [
      {
        content: '.btn-primary { background: blue; }',
        scoped: true,
        lang: undefined,
      },
    ];
    const result = extractStyles(styles, 'MyComponent');

    expect(result).not.toBeNull();
    expect(result!.classMap.get('btn-primary')).toBe('styles["btn-primary"]');
  });

  test('removes :deep() pseudo-selector', () => {
    const styles: StyleBlock[] = [
      {
        content: '.parent :deep(.child) { color: red; }',
        scoped: true,
        lang: undefined,
      },
    ];
    const result = extractStyles(styles, 'MyComponent');

    expect(result).not.toBeNull();
    expect(result!.css).not.toContain(':deep');
    expect(result!.css).toContain('.parent .child');
  });

  test('removes ::v-deep pseudo-selector', () => {
    const styles: StyleBlock[] = [
      {
        content: '.parent ::v-deep .child { color: red; }',
        scoped: true,
        lang: undefined,
      },
    ];
    const result = extractStyles(styles, 'MyComponent');

    expect(result).not.toBeNull();
    expect(result!.css).not.toContain('::v-deep');
    expect(result!.css).toContain('.parent .child');
  });

  test('removes :slotted() pseudo-selector', () => {
    const styles: StyleBlock[] = [
      {
        content: ':slotted(.foo) { color: red; }',
        scoped: true,
        lang: undefined,
      },
    ];
    const result = extractStyles(styles, 'MyComponent');

    expect(result).not.toBeNull();
    expect(result!.css).not.toContain(':slotted');
    expect(result!.css).toContain('.foo');
  });

  test('removes ::v-slotted() pseudo-selector', () => {
    const styles: StyleBlock[] = [
      {
        content: '::v-slotted(.bar) { margin: 0; }',
        scoped: true,
        lang: undefined,
      },
    ];
    const result = extractStyles(styles, 'MyComponent');

    expect(result).not.toBeNull();
    expect(result!.css).not.toContain('::v-slotted');
    expect(result!.css).toContain('.bar');
  });

  test('removes :global() wrapper but keeps inner selector', () => {
    const styles: StyleBlock[] = [
      {
        content: ':global(.app-title) { font-weight: bold; }',
        scoped: true,
        lang: undefined,
      },
    ];
    const result = extractStyles(styles, 'MyComponent');

    expect(result).not.toBeNull();
    expect(result!.css).not.toContain(':global');
    expect(result!.css).toContain('.app-title');
  });

  test('combines multiple scoped style blocks', () => {
    const styles: StyleBlock[] = [
      { content: '.a { color: red; }', scoped: true, lang: undefined },
      { content: '.b { color: blue; }', scoped: false, lang: undefined },
      { content: '.c { color: green; }', scoped: true, lang: undefined },
    ];
    const result = extractStyles(styles, 'MyComponent');

    expect(result).not.toBeNull();
    expect(result!.css).toContain('.a');
    expect(result!.css).toContain('.c');
    expect(result!.css).not.toContain('.b');
    expect(result!.classMap.has('a')).toBe(true);
    expect(result!.classMap.has('c')).toBe(true);
    expect(result!.classMap.has('b')).toBe(false);
  });

  test('handles multiple class selectors in compound rules', () => {
    const styles: StyleBlock[] = [
      {
        content: '.container .header, .container .footer { padding: 10px; }',
        scoped: true,
        lang: undefined,
      },
    ];
    const result = extractStyles(styles, 'MyComponent');

    expect(result).not.toBeNull();
    expect(result!.classMap.has('container')).toBe(true);
    expect(result!.classMap.has('header')).toBe(true);
    expect(result!.classMap.has('footer')).toBe(true);
  });
});

describe('getStyleFilename', () => {
  test('returns component name with .module.css extension', () => {
    expect(getStyleFilename('MyComponent')).toBe('MyComponent.module.css');
  });

  test('works with simple names', () => {
    expect(getStyleFilename('App')).toBe('App.module.css');
  });
});
