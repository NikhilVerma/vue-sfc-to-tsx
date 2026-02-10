import { describe, expect, test } from 'bun:test';
import { mergeImports, generateImportStatements, addVueImport } from '../../src/script/imports';
import type { ImportInfo } from '../../src/types';

describe('mergeImports', () => {
  test('merges imports from same source', () => {
    const existing: ImportInfo[] = [
      { source: 'vue', namedImports: [{ imported: 'ref', local: 'ref' }], typeOnly: false },
    ];
    const additional: ImportInfo[] = [
      { source: 'vue', namedImports: [{ imported: 'computed', local: 'computed' }], typeOnly: false },
    ];

    const result = mergeImports(existing, additional);

    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('vue');
    expect(result[0].namedImports).toHaveLength(2);
    expect(result[0].namedImports).toContainEqual({ imported: 'ref', local: 'ref' });
    expect(result[0].namedImports).toContainEqual({ imported: 'computed', local: 'computed' });
  });

  test('deduplicates named imports', () => {
    const existing: ImportInfo[] = [
      { source: 'vue', namedImports: [{ imported: 'ref', local: 'ref' }], typeOnly: false },
    ];
    const additional: ImportInfo[] = [
      { source: 'vue', namedImports: [{ imported: 'ref', local: 'ref' }], typeOnly: false },
    ];

    const result = mergeImports(existing, additional);

    expect(result).toHaveLength(1);
    expect(result[0].namedImports).toHaveLength(1);
  });

  test('keeps different sources separate', () => {
    const existing: ImportInfo[] = [
      { source: 'vue', namedImports: [{ imported: 'ref', local: 'ref' }], typeOnly: false },
    ];
    const additional: ImportInfo[] = [
      { source: 'lodash', namedImports: [{ imported: 'debounce', local: 'debounce' }], typeOnly: false },
    ];

    const result = mergeImports(existing, additional);

    expect(result).toHaveLength(2);
  });

  test('marks merged import as non-type-only if either is non-type-only', () => {
    const existing: ImportInfo[] = [
      { source: './types', namedImports: [{ imported: 'Foo', local: 'Foo' }], typeOnly: true },
    ];
    const additional: ImportInfo[] = [
      { source: './types', namedImports: [{ imported: 'bar', local: 'bar' }], typeOnly: false },
    ];

    const result = mergeImports(existing, additional);

    expect(result).toHaveLength(1);
    expect(result[0].typeOnly).toBe(false);
  });

  test('merges default imports', () => {
    const existing: ImportInfo[] = [
      { source: 'vue', namedImports: [{ imported: 'ref', local: 'ref' }], typeOnly: false },
    ];
    const additional: ImportInfo[] = [
      { source: 'vue', defaultImport: 'Vue', namedImports: [], typeOnly: false },
    ];

    const result = mergeImports(existing, additional);

    expect(result).toHaveLength(1);
    expect(result[0].defaultImport).toBe('Vue');
    expect(result[0].namedImports).toHaveLength(1);
  });
});

describe('generateImportStatements', () => {
  test('generates basic named imports', () => {
    const imports: ImportInfo[] = [
      { source: 'vue', namedImports: [{ imported: 'ref', local: 'ref' }], typeOnly: false },
    ];

    const result = generateImportStatements(imports);

    expect(result).toBe("import { ref } from 'vue'");
  });

  test('generates type-only imports', () => {
    const imports: ImportInfo[] = [
      { source: './types', namedImports: [{ imported: 'Foo', local: 'Foo' }], typeOnly: true },
    ];

    const result = generateImportStatements(imports);

    expect(result).toBe("import type { Foo } from './types'");
  });

  test('generates default + named imports', () => {
    const imports: ImportInfo[] = [
      {
        source: 'vue',
        defaultImport: 'Vue',
        namedImports: [{ imported: 'ref', local: 'ref' }],
        typeOnly: false,
      },
    ];

    const result = generateImportStatements(imports);

    expect(result).toBe("import Vue, { ref } from 'vue'");
  });

  test('generates namespace imports', () => {
    const imports: ImportInfo[] = [
      { source: './utils', namespaceImport: 'utils', namedImports: [], typeOnly: false },
    ];

    const result = generateImportStatements(imports);

    expect(result).toBe("import * as utils from './utils'");
  });

  test('generates aliased imports', () => {
    const imports: ImportInfo[] = [
      { source: 'vue', namedImports: [{ imported: 'ref', local: 'myRef' }], typeOnly: false },
    ];

    const result = generateImportStatements(imports);

    expect(result).toBe("import { ref as myRef } from 'vue'");
  });

  test('sorts vue first, then alphabetically', () => {
    const imports: ImportInfo[] = [
      { source: 'lodash', namedImports: [{ imported: 'debounce', local: 'debounce' }], typeOnly: false },
      { source: 'vue', namedImports: [{ imported: 'ref', local: 'ref' }], typeOnly: false },
      { source: 'axios', namedImports: [], defaultImport: 'axios', typeOnly: false },
    ];

    const result = generateImportStatements(imports);
    const lines = result.split('\n');

    expect(lines[0]).toContain("from 'vue'");
    expect(lines[1]).toContain("from 'axios'");
    expect(lines[2]).toContain("from 'lodash'");
  });
});

describe('addVueImport', () => {
  test('adds to existing vue import', () => {
    const imports: ImportInfo[] = [
      { source: 'vue', namedImports: [{ imported: 'ref', local: 'ref' }], typeOnly: false },
    ];

    addVueImport(imports, 'defineComponent');

    expect(imports[0].namedImports).toHaveLength(2);
    expect(imports[0].namedImports).toContainEqual({ imported: 'defineComponent', local: 'defineComponent' });
  });

  test('creates vue import if none exists', () => {
    const imports: ImportInfo[] = [];

    addVueImport(imports, 'defineComponent');

    expect(imports).toHaveLength(1);
    expect(imports[0].source).toBe('vue');
    expect(imports[0].namedImports).toEqual([{ imported: 'defineComponent', local: 'defineComponent' }]);
  });

  test('does not duplicate existing import', () => {
    const imports: ImportInfo[] = [
      { source: 'vue', namedImports: [{ imported: 'ref', local: 'ref' }], typeOnly: false },
    ];

    addVueImport(imports, 'ref');

    expect(imports[0].namedImports).toHaveLength(1);
  });
});
