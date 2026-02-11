import { describe, expect, test } from "bun:test";
import { parseSFC } from "../../src/parser";
import { templateToJsx, walkChildren } from "../../src/template/index";
import type { ElementNode } from "../../src/types";
import type { JsxContext } from "../../src/types";

function makeCtx(): JsxContext {
  return {
    indent: 0,
    classMap: new Map(),
    warnings: [],
    fallbacks: [],
    componentName: "TestComponent",
    usedContextMembers: new Set(),
    refIdentifiers: new Set(),
    propIdentifiers: new Set(),
    hasVFor: false,
  };
}

function toJsx(template: string): string {
  const sfc = parseSFC(`<template>${template}</template>`);
  return templateToJsx(sfc.templateAst!, makeCtx());
}

describe("slot outlet (<slot>)", () => {
  test("default slot", () => {
    const result = toJsx("<slot></slot>");
    expect(result).toBe("{slots.default?.()}");
  });

  test("named slot", () => {
    const result = toJsx('<slot name="header"></slot>');
    expect(result).toBe("{slots.header?.()}");
  });

  test("slot with fallback", () => {
    const result = toJsx("<slot>fallback content</slot>");
    expect(result).toContain("slots.default?.()");
    expect(result).toContain("fallback content");
    expect(result).toContain("??");
  });

  test("named slot with props", () => {
    const result = toJsx('<slot name="item" :item="item" :index="i"></slot>');
    expect(result).toContain("slots.item");
    expect(result).toContain("item: item");
    expect(result).toContain("index: i");
  });
});

describe("slot content on components", () => {
  test("component with v-slot default", () => {
    const result = toJsx('<MyComp v-slot="{ item }"><div>{{ item }}</div></MyComp>');
    expect(result).toContain("MyComp");
    expect(result).toContain("item");
  });

  test("component with named slot templates", () => {
    const result = toJsx(`
      <MyComp>
        <template v-slot:header>
          <h1>Title</h1>
        </template>
        <template v-slot:default>
          <p>Body</p>
        </template>
      </MyComp>
    `);
    expect(result).toContain("MyComp");
    expect(result).toContain("header");
    expect(result).toContain("Title");
    expect(result).toContain("Body");
  });
});
