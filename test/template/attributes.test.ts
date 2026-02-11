import { describe, expect, test } from "bun:test";
import { parseSFC } from "../../src/parser";
import { generateAttributes, formatAttributes } from "../../src/template/attributes";
import type { ElementNode } from "../../src/types";
import type { JsxContext } from "../../src/types";

function makeCtx(classMap?: Map<string, string>): JsxContext {
  return {
    indent: 0,
    classMap: classMap ?? new Map(),
    warnings: [],
    fallbacks: [],
    componentName: "TestComponent",
    usedContextMembers: new Set(),
    refIdentifiers: new Set(),
    propIdentifiers: new Set(),
    hasVFor: false,
    usedBuiltins: new Set(),
  };
}

function getFirstElement(template: string): ElementNode {
  const sfc = parseSFC(`<template>${template}</template>`);
  const ast = sfc.templateAst!;
  for (const child of ast.children) {
    if (child.type === 1) return child as ElementNode;
  }
  throw new Error("No element node found");
}

function attrsFor(template: string, classMap?: Map<string, string>): string {
  const el = getFirstElement(template);
  const result = generateAttributes(el, makeCtx(classMap));
  return formatAttributes(result);
}

describe("generateAttributes", () => {
  describe("static attributes", () => {
    test("simple attribute", () => {
      expect(attrsFor('<div id="app"></div>')).toBe(' id="app"');
    });

    test("multiple attributes", () => {
      expect(attrsFor('<input type="text" placeholder="name" />')).toBe(
        ' type="text" placeholder="name"',
      );
    });

    test("boolean attribute", () => {
      expect(attrsFor("<input disabled />")).toBe(" disabled");
    });

    test("no attributes", () => {
      expect(attrsFor("<div></div>")).toBe("");
    });

    test("static class preserved as-is", () => {
      expect(attrsFor('<div class="foo bar"></div>')).toBe(' class="foo bar"');
    });

    test("static single class preserved as-is", () => {
      expect(attrsFor('<div class="foo"></div>')).toBe(' class="foo"');
    });

    test("ref attribute", () => {
      expect(attrsFor('<div ref="myRef"></div>')).toBe(" ref={myRef}");
    });
  });

  describe("v-bind directives", () => {
    test(':prop="expr"', () => {
      expect(attrsFor('<div :id="myId"></div>')).toBe(" id={myId}");
    });

    test(':style="expr"', () => {
      expect(attrsFor('<div :style="styleObj"></div>')).toBe(" style={styleObj}");
    });

    test(':key="expr"', () => {
      expect(attrsFor('<div :key="item.id"></div>')).toBe(" key={item.id}");
    });

    test('v-bind="obj" spread', () => {
      const el = getFirstElement('<div v-bind="attrs"></div>');
      const result = generateAttributes(el, makeCtx());
      expect(result.spreads).toEqual(["{...attrs}"]);
      expect(formatAttributes(result)).toBe(" {...attrs}");
    });

    test(":class with object literal passes through as-is", () => {
      expect(attrsFor(`<div :class="{ active: isActive }"></div>`)).toBe(
        " class={{ active: isActive }}",
      );
    });

    test(':ref="expr"', () => {
      expect(attrsFor('<div :ref="dynamicRef"></div>')).toBe(" ref={dynamicRef}");
    });
  });

  describe("v-on directives", () => {
    test('@click="handler"', () => {
      expect(attrsFor('<button @click="handleClick"></button>')).toBe(" onClick={handleClick}");
    });

    test('@click="handler($event)"', () => {
      expect(attrsFor('<button @click="handler($event)"></button>')).toBe(
        " onClick={($event) => handler($event)}",
      );
    });

    test('@input="onInput"', () => {
      expect(attrsFor('<input @input="onInput" />')).toBe(" onInput={onInput}");
    });

    test('@custom-event="handler"', () => {
      expect(attrsFor('<div @custom-event="handler"></div>')).toBe(" onCustomEvent={handler}");
    });
  });

  describe("control-flow directives are skipped", () => {
    test("v-if is skipped", () => {
      expect(attrsFor('<div v-if="show" class="test"></div>')).toBe(' class="test"');
    });

    test("v-for is skipped", () => {
      expect(attrsFor('<div v-for="item in items" :key="item.id"></div>')).toBe(" key={item.id}");
    });

    test("v-show is skipped", () => {
      expect(attrsFor('<div v-show="visible"></div>')).toBe("");
    });
  });
});
