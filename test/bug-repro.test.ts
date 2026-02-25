/**
 * Bug reproduction tests for 4 known patterns.
 * Run with: bun test test/bug-repro.test.ts
 */
import { describe, test } from "bun:test";
import { convert } from "../src/index";

describe("Bug reproductions", () => {
  test("Pattern 1: v-for 'of' keyword not parsed", async () => {
    const vue = `<template>
  <template v-for="leftSideDocument of getAuditLeftSideDocuments(audit)">
    <div>{{ leftSideDocument }}</div>
  </template>
</template>
<script setup lang="ts">
</script>`;

    const result = await convert(vue, { componentName: "TestVForOf" });
    console.log("\n=== Pattern 1: v-for 'of' ===");
    console.log("TSX output:");
    console.log(result.tsx);
    console.log("Warnings:", result.warnings);
  });

  test("Pattern 2: withDefaults dropped when export type has template literal", async () => {
    const vue = `<template><div>test</div></template>
<script setup lang="ts">
export type FCounterStateProp = "primary" | "secondary" | \`custom, \${string}\`;

interface Props {
    size?: string;
    state?: string;
}

const props = withDefaults(defineProps<Props>(), {
    size: "small",
    state: "default"
});

type FCounterCategory = "fill" | "outline";
</script>`;

    const result = await convert(vue, { componentName: "TestWithDefaults" });
    console.log("\n=== Pattern 2: withDefaults with template literal export type ===");
    console.log("TSX output:");
    console.log(result.tsx);
    console.log("Warnings:", result.warnings);
  });

  test("Pattern 3: Multi-element scoped slot missing fragment", async () => {
    const vue = `<template>
<form.Field name="llmContext">
  <template #default="{ field }">
    <Textarea :model-value="field.state.value" @blur="field.handleBlur" />
    <FieldError v-if="isInvalid(field)" :errors="field.state.meta.errors" />
  </template>
</form.Field>
</template>
<script setup lang="ts">
</script>`;

    const result = await convert(vue, { componentName: "TestScopedSlot" });
    console.log("\n=== Pattern 3: Multi-element scoped slot ===");
    console.log("TSX output:");
    console.log(result.tsx);
    console.log("Warnings:", result.warnings);
  });

  test("Pattern 4: Type-only default + named import merged", async () => {
    const vue = `<script setup lang="ts">
import type { HighlightMap } from "~/components/shared/StatementFuzzySearch.vue";
</script>
<template>
  <StatementFuzzySearch />
</template>`;

    const result = await convert(vue, { componentName: "TestTypeOnlyImport" });
    console.log("\n=== Pattern 4: Type-only default + named import ===");
    console.log("TSX output:");
    console.log(result.tsx);
    console.log("Warnings:", result.warnings);
  });
});
