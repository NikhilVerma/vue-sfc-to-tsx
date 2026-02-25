import { describe, expect, test } from "bun:test";
import { mergeImports, generateImportStatements, addVueImport } from "../../src/script/imports";
import type { ImportInfo } from "../../src/types";

describe("mergeImports", () => {
  test("merges imports from same source", () => {
    const existing: ImportInfo[] = [
      { source: "vue", namedImports: [{ imported: "ref", local: "ref" }], typeOnly: false },
    ];
    const additional: ImportInfo[] = [
      {
        source: "vue",
        namedImports: [{ imported: "computed", local: "computed" }],
        typeOnly: false,
      },
    ];

    const result = mergeImports(existing, additional);

    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("vue");
    expect(result[0].namedImports).toHaveLength(2);
    expect(result[0].namedImports).toContainEqual({ imported: "ref", local: "ref" });
    expect(result[0].namedImports).toContainEqual({ imported: "computed", local: "computed" });
  });

  test("deduplicates named imports", () => {
    const existing: ImportInfo[] = [
      { source: "vue", namedImports: [{ imported: "ref", local: "ref" }], typeOnly: false },
    ];
    const additional: ImportInfo[] = [
      { source: "vue", namedImports: [{ imported: "ref", local: "ref" }], typeOnly: false },
    ];

    const result = mergeImports(existing, additional);

    expect(result).toHaveLength(1);
    expect(result[0].namedImports).toHaveLength(1);
  });

  test("keeps different sources separate", () => {
    const existing: ImportInfo[] = [
      { source: "vue", namedImports: [{ imported: "ref", local: "ref" }], typeOnly: false },
    ];
    const additional: ImportInfo[] = [
      {
        source: "lodash",
        namedImports: [{ imported: "debounce", local: "debounce" }],
        typeOnly: false,
      },
    ];

    const result = mergeImports(existing, additional);

    expect(result).toHaveLength(2);
  });

  test("keeps type-only and non-type-only from same source separate", () => {
    const existing: ImportInfo[] = [
      { source: "./types", namedImports: [{ imported: "Foo", local: "Foo" }], typeOnly: true },
    ];
    const additional: ImportInfo[] = [
      { source: "./types", namedImports: [{ imported: "bar", local: "bar" }], typeOnly: false },
    ];

    const result = mergeImports(existing, additional);

    expect(result).toHaveLength(2);
    const typeOnly = result.find((r) => r.typeOnly);
    const nonTypeOnly = result.find((r) => !r.typeOnly);
    expect(typeOnly!.namedImports).toContainEqual({ imported: "Foo", local: "Foo" });
    expect(nonTypeOnly!.namedImports).toContainEqual({ imported: "bar", local: "bar" });
  });

  test("merges default imports", () => {
    const existing: ImportInfo[] = [
      { source: "vue", namedImports: [{ imported: "ref", local: "ref" }], typeOnly: false },
    ];
    const additional: ImportInfo[] = [
      { source: "vue", defaultImport: "Vue", namedImports: [], typeOnly: false },
    ];

    const result = mergeImports(existing, additional);

    expect(result).toHaveLength(1);
    expect(result[0].defaultImport).toBe("Vue");
    expect(result[0].namedImports).toHaveLength(1);
  });
});

describe("generateImportStatements", () => {
  test("generates basic named imports", () => {
    const imports: ImportInfo[] = [
      { source: "vue", namedImports: [{ imported: "ref", local: "ref" }], typeOnly: false },
    ];

    const result = generateImportStatements(imports);

    expect(result).toBe("import { ref } from 'vue'");
  });

  test("generates type-only imports", () => {
    const imports: ImportInfo[] = [
      { source: "./types", namedImports: [{ imported: "Foo", local: "Foo" }], typeOnly: true },
    ];

    const result = generateImportStatements(imports);

    expect(result).toBe("import type { Foo } from './types'");
  });

  test("generates default + named imports", () => {
    const imports: ImportInfo[] = [
      {
        source: "vue",
        defaultImport: "Vue",
        namedImports: [{ imported: "ref", local: "ref" }],
        typeOnly: false,
      },
    ];

    const result = generateImportStatements(imports);

    expect(result).toBe("import Vue, { ref } from 'vue'");
  });

  test("generates namespace imports", () => {
    const imports: ImportInfo[] = [
      { source: "./utils", namespaceImport: "utils", namedImports: [], typeOnly: false },
    ];

    const result = generateImportStatements(imports);

    expect(result).toBe("import * as utils from './utils'");
  });

  test("generates aliased imports", () => {
    const imports: ImportInfo[] = [
      { source: "vue", namedImports: [{ imported: "ref", local: "myRef" }], typeOnly: false },
    ];

    const result = generateImportStatements(imports);

    expect(result).toBe("import { ref as myRef } from 'vue'");
  });

  test("sorts vue first, then alphabetically", () => {
    const imports: ImportInfo[] = [
      {
        source: "lodash",
        namedImports: [{ imported: "debounce", local: "debounce" }],
        typeOnly: false,
      },
      { source: "vue", namedImports: [{ imported: "ref", local: "ref" }], typeOnly: false },
      { source: "axios", namedImports: [], defaultImport: "axios", typeOnly: false },
    ];

    const result = generateImportStatements(imports);
    const lines = result.split("\n");

    expect(lines[0]).toContain("from 'vue'");
    expect(lines[1]).toContain("from 'axios'");
    expect(lines[2]).toContain("from 'lodash'");
  });
});

describe("mergeImports keeps two type-only imports from same source separate when one has default", () => {
  test("import type Default + import type { Named } stay separate", () => {
    const existing: ImportInfo[] = [
      {
        source: "~/components/shared/Foo.vue",
        defaultImport: "Foo",
        namedImports: [],
        typeOnly: true,
      },
    ];
    const additional: ImportInfo[] = [
      {
        source: "~/components/shared/Foo.vue",
        namedImports: [{ imported: "FooBar", local: "FooBar" }],
        typeOnly: true,
      },
    ];

    const result = mergeImports(existing, additional);

    expect(result).toHaveLength(2);
    const withDefault = result.find((r) => r.defaultImport === "Foo");
    expect(withDefault).toBeDefined();
    expect(withDefault!.namedImports).toHaveLength(0);
    const withNamed = result.find((r) => r.namedImports.some((n) => n.imported === "FooBar"));
    expect(withNamed).toBeDefined();
    expect(withNamed!.defaultImport).toBeUndefined();
  });

  test("two named type-only imports from same source still merge", () => {
    const existing: ImportInfo[] = [
      {
        source: "~/types",
        namedImports: [{ imported: "Foo", local: "Foo" }],
        typeOnly: true,
      },
    ];
    const additional: ImportInfo[] = [
      {
        source: "~/types",
        namedImports: [{ imported: "Bar", local: "Bar" }],
        typeOnly: true,
      },
    ];

    const result = mergeImports(existing, additional);
    expect(result).toHaveLength(1);
    expect(result[0].namedImports).toHaveLength(2);
  });
});

describe("mergeImports type-only separation", () => {
  test("keeps type-only and non-type-only imports from same source separate", () => {
    const existing: ImportInfo[] = [
      {
        source: "./types",
        defaultImport: "Foo",
        namedImports: [],
        typeOnly: false,
      },
    ];
    const additional: ImportInfo[] = [
      {
        source: "./types",
        namedImports: [{ imported: "Bar", local: "Bar" }],
        typeOnly: true,
      },
    ];

    const result = mergeImports(existing, additional);

    // Should produce two separate imports, not merge them
    expect(result).toHaveLength(2);
    // One with default import (non-type-only)
    const nonType = result.find((r) => !r.typeOnly);
    expect(nonType).toBeDefined();
    expect(nonType!.defaultImport).toBe("Foo");
    // One with named type import
    const typeOnly = result.find((r) => r.typeOnly);
    expect(typeOnly).toBeDefined();
    expect(typeOnly!.namedImports).toContainEqual({ imported: "Bar", local: "Bar" });
  });

  test("still merges two non-type-only imports from same source", () => {
    const existing: ImportInfo[] = [
      { source: "vue", namedImports: [{ imported: "ref", local: "ref" }], typeOnly: false },
    ];
    const additional: ImportInfo[] = [
      {
        source: "vue",
        namedImports: [{ imported: "computed", local: "computed" }],
        typeOnly: false,
      },
    ];

    const result = mergeImports(existing, additional);
    expect(result).toHaveLength(1);
    expect(result[0].namedImports).toHaveLength(2);
  });

  test("still merges two type-only imports from same source", () => {
    const existing: ImportInfo[] = [
      { source: "./types", namedImports: [{ imported: "Foo", local: "Foo" }], typeOnly: true },
    ];
    const additional: ImportInfo[] = [
      { source: "./types", namedImports: [{ imported: "Bar", local: "Bar" }], typeOnly: true },
    ];

    const result = mergeImports(existing, additional);
    expect(result).toHaveLength(1);
    expect(result[0].namedImports).toHaveLength(2);
    expect(result[0].typeOnly).toBe(true);
  });
});

describe("addVueImport", () => {
  test("adds to existing vue import", () => {
    const imports: ImportInfo[] = [
      { source: "vue", namedImports: [{ imported: "ref", local: "ref" }], typeOnly: false },
    ];

    addVueImport(imports, "defineComponent");

    expect(imports[0].namedImports).toHaveLength(2);
    expect(imports[0].namedImports).toContainEqual({
      imported: "defineComponent",
      local: "defineComponent",
    });
  });

  test("creates vue import if none exists", () => {
    const imports: ImportInfo[] = [];

    addVueImport(imports, "defineComponent");

    expect(imports).toHaveLength(1);
    expect(imports[0].source).toBe("vue");
    expect(imports[0].namedImports).toEqual([
      { imported: "defineComponent", local: "defineComponent" },
    ]);
  });

  test("does not duplicate existing import", () => {
    const imports: ImportInfo[] = [
      { source: "vue", namedImports: [{ imported: "ref", local: "ref" }], typeOnly: false },
    ];

    addVueImport(imports, "ref");

    expect(imports[0].namedImports).toHaveLength(1);
  });
});
