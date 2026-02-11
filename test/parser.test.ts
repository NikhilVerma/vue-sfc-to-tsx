import { describe, expect, test } from "bun:test";
import { parseSFC } from "../src/parser";

describe("parseSFC", () => {
  test("parses a basic SFC with template, script setup, and style", () => {
    const source = `
<template>
  <div class="hello">{{ msg }}</div>
</template>

<script setup lang="ts">
const msg = 'Hello'
</script>

<style scoped>
.hello { color: red; }
</style>
`;
    const result = parseSFC(source);

    expect(result.errors).toHaveLength(0);
    expect(result.templateAst).not.toBeNull();
    expect(result.templateSource).toContain("{{ msg }}");
    expect(result.scriptSetup).not.toBeNull();
    expect(result.scriptSetup!.content).toContain("const msg = 'Hello'");
    expect(result.scriptSetup!.lang).toBe("ts");
    expect(result.scriptSetup!.setup).toBe(true);
    expect(result.styles).toHaveLength(1);
    expect(result.styles[0].scoped).toBe(true);
    expect(result.styles[0].content).toContain(".hello");
  });

  test("provides raw AST (not compiled)", () => {
    const source = `
<template>
  <div v-if="show">yes</div>
  <div v-else>no</div>
</template>
`;
    const result = parseSFC(source);
    const ast = result.templateAst!;

    // Raw AST should have the children as element nodes with directives
    // (not wrapped in IfNode as compileTemplate would produce)
    expect(ast.children.length).toBeGreaterThan(0);
  });

  test("handles SFC with regular script (non-setup)", () => {
    const source = `
<template><div /></template>
<script>
export default { name: 'Foo' }
</script>
`;
    const result = parseSFC(source);
    expect(result.script).not.toBeNull();
    expect(result.script!.setup).toBe(false);
    expect(result.scriptSetup).toBeNull();
  });

  test("handles SFC with no template", () => {
    const source = `
<script setup>
const x = 1
</script>
`;
    const result = parseSFC(source);
    expect(result.templateAst).toBeNull();
    expect(result.templateSource).toBeNull();
    expect(result.scriptSetup).not.toBeNull();
  });
});
