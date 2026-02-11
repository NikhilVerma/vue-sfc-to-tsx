import { describe, expect, test } from "bun:test";
import { extractStyles, getStyleFilename } from "../../src/style/index";
import type { StyleBlock } from "../../src/types";

describe("extractStyles", () => {
  test("extracts non-scoped styles too", () => {
    const styles: StyleBlock[] = [
      { content: ".foo { color: red; }", scoped: false, lang: undefined },
    ];
    const result = extractStyles(styles, "MyComponent");
    expect(result).not.toBeNull();
    expect(result!.css).toContain(".foo");
    expect(result!.classMap.size).toBe(0);
  });

  test("returns null for empty styles array", () => {
    expect(extractStyles([], "MyComponent")).toBeNull();
  });

  test("extracts scoped styles with empty classMap", () => {
    const styles: StyleBlock[] = [
      {
        content: ".hello { color: red; }\n.world { font-size: 14px; }",
        scoped: true,
        lang: undefined,
      },
    ];
    const result = extractStyles(styles, "MyComponent");

    expect(result).not.toBeNull();
    expect(result!.css).toContain(".hello");
    expect(result!.css).toContain(".world");
    expect(result!.classMap.size).toBe(0);
  });

  test("classMap is always empty", () => {
    const styles: StyleBlock[] = [
      {
        content: ".btn-primary { background: blue; }",
        scoped: true,
        lang: undefined,
      },
    ];
    const result = extractStyles(styles, "MyComponent");

    expect(result).not.toBeNull();
    expect(result!.classMap.size).toBe(0);
  });

  test("removes :deep() pseudo-selector", () => {
    const styles: StyleBlock[] = [
      {
        content: ".parent :deep(.child) { color: red; }",
        scoped: true,
        lang: undefined,
      },
    ];
    const result = extractStyles(styles, "MyComponent");

    expect(result).not.toBeNull();
    expect(result!.css).not.toContain(":deep");
    expect(result!.css).toContain(".parent .child");
  });

  test("removes ::v-deep pseudo-selector", () => {
    const styles: StyleBlock[] = [
      {
        content: ".parent ::v-deep .child { color: red; }",
        scoped: true,
        lang: undefined,
      },
    ];
    const result = extractStyles(styles, "MyComponent");

    expect(result).not.toBeNull();
    expect(result!.css).not.toContain("::v-deep");
    expect(result!.css).toContain(".parent .child");
  });

  test("removes :slotted() pseudo-selector", () => {
    const styles: StyleBlock[] = [
      {
        content: ":slotted(.foo) { color: red; }",
        scoped: true,
        lang: undefined,
      },
    ];
    const result = extractStyles(styles, "MyComponent");

    expect(result).not.toBeNull();
    expect(result!.css).not.toContain(":slotted");
    expect(result!.css).toContain(".foo");
  });

  test("removes ::v-slotted() pseudo-selector", () => {
    const styles: StyleBlock[] = [
      {
        content: "::v-slotted(.bar) { margin: 0; }",
        scoped: true,
        lang: undefined,
      },
    ];
    const result = extractStyles(styles, "MyComponent");

    expect(result).not.toBeNull();
    expect(result!.css).not.toContain("::v-slotted");
    expect(result!.css).toContain(".bar");
  });

  test("removes :global() wrapper but keeps inner selector", () => {
    const styles: StyleBlock[] = [
      {
        content: ":global(.app-title) { font-weight: bold; }",
        scoped: true,
        lang: undefined,
      },
    ];
    const result = extractStyles(styles, "MyComponent");

    expect(result).not.toBeNull();
    expect(result!.css).not.toContain(":global");
    expect(result!.css).toContain(".app-title");
  });

  test("combines all style blocks (scoped and non-scoped)", () => {
    const styles: StyleBlock[] = [
      { content: ".a { color: red; }", scoped: true, lang: undefined },
      { content: ".b { color: blue; }", scoped: false, lang: undefined },
      { content: ".c { color: green; }", scoped: true, lang: undefined },
    ];
    const result = extractStyles(styles, "MyComponent");

    expect(result).not.toBeNull();
    expect(result!.css).toContain(".a");
    expect(result!.css).toContain(".b");
    expect(result!.css).toContain(".c");
    expect(result!.classMap.size).toBe(0);
  });

  test("handles multiple class selectors in compound rules", () => {
    const styles: StyleBlock[] = [
      {
        content: ".container .header, .container .footer { padding: 10px; }",
        scoped: true,
        lang: undefined,
      },
    ];
    const result = extractStyles(styles, "MyComponent");

    expect(result).not.toBeNull();
    expect(result!.css).toContain(".container");
    expect(result!.css).toContain(".header");
    expect(result!.css).toContain(".footer");
    expect(result!.classMap.size).toBe(0);
  });
});

describe("SCSS style blocks", () => {
  test("SCSS content is preserved as-is (no conversion)", () => {
    const styles: StyleBlock[] = [
      {
        content: `// This is a comment
.foo { color: red; }
.bar {
  // another comment
  font-size: 14px;
  .nested { color: blue; }
}`,
        scoped: false,
        lang: "scss",
      },
    ];
    const result = extractStyles(styles, "MyComponent");

    expect(result).not.toBeNull();
    // SCSS content stays as SCSS — bundler (Vite) compiles it
    expect(result!.css).toContain("// This is a comment");
    expect(result!.css).toContain(".foo");
    expect(result!.css).toContain(".nested");
  });

  test("lang is detected from style blocks", () => {
    const styles: StyleBlock[] = [{ content: ".foo { color: red; }", scoped: false, lang: "scss" }];
    const result = extractStyles(styles, "MyComponent");

    expect(result).not.toBeNull();
    expect(result!.lang).toBe("scss");
  });

  test("lang is undefined for plain CSS", () => {
    const styles: StyleBlock[] = [
      { content: ".foo { color: red; }", scoped: false, lang: undefined },
    ];
    const result = extractStyles(styles, "MyComponent");

    expect(result).not.toBeNull();
    expect(result!.lang).toBeUndefined();
  });

  test("mixed lang blocks use first non-undefined lang", () => {
    const styles: StyleBlock[] = [
      { content: ".a {}", scoped: true, lang: undefined },
      { content: ".b {}", scoped: false, lang: "scss" },
    ];
    const result = extractStyles(styles, "MyComponent");

    expect(result).not.toBeNull();
    expect(result!.lang).toBe("scss");
  });
});

describe("scoped style warnings", () => {
  test("scoped styles produce a warning about plain CSS output", () => {
    const styles: StyleBlock[] = [
      { content: ".foo { color: red; }", scoped: true, lang: undefined },
    ];
    const result = extractStyles(styles, "MyComponent");

    expect(result).not.toBeNull();
    expect(result!.warnings.length).toBeGreaterThan(0);
    expect(result!.warnings[0]).toContain("Scoped");
    expect(result!.warnings[0]).toContain("plain CSS");
  });

  test("non-scoped styles do not produce scoped warning", () => {
    const styles: StyleBlock[] = [
      { content: ".foo { color: red; }", scoped: false, lang: undefined },
    ];
    const result = extractStyles(styles, "MyComponent");

    expect(result).not.toBeNull();
    expect(result!.warnings).toHaveLength(0);
  });
});

describe("getStyleFilename", () => {
  test("returns .css for plain CSS", () => {
    expect(getStyleFilename("MyComponent")).toBe("MyComponent.css");
    expect(getStyleFilename("MyComponent", undefined)).toBe("MyComponent.css");
  });

  test("returns .scss for SCSS", () => {
    expect(getStyleFilename("MyComponent", "scss")).toBe("MyComponent.scss");
  });

  test("returns .less for Less", () => {
    expect(getStyleFilename("MyComponent", "less")).toBe("MyComponent.less");
  });
});
