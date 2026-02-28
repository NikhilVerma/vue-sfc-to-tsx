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
    usedComponents: new Set(),
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

    test("hyphenated prop name on component is camelCased", () => {
      expect(attrsFor('<Lineage :node-size="{ width: 200, height: 52 }"></Lineage>')).toBe(
        " nodeSize={{ width: 200, height: 52 }}",
      );
    });

    test("multiple hyphenated prop names on component are camelCased", () => {
      expect(attrsFor('<Lineage :children-node-size="{ width: 200 }" :gap="100"></Lineage>')).toBe(
        " childrenNodeSize={{ width: 200 }} gap={100}",
      );
    });

    test("hyphenated attribute on native HTML element stays kebab-case", () => {
      // data-* and aria-* on native elements should NOT be camelCased
      expect(attrsFor('<div :data-foo="bar"></div>')).toBe(" data-foo={bar}");
      expect(attrsFor('<div :aria-label="label"></div>')).toBe(" aria-label={label}");
    });

    test('v-bind="obj" spread', () => {
      const el = getFirstElement('<div v-bind="attrs"></div>');
      const result = generateAttributes(el, makeCtx());
      expect(result.spreads).toEqual(["{...attrs}"]);
      expect(formatAttributes(result)).toBe(" {...attrs}");
    });

    test("v-bind spread comes before explicit attrs so explicit attrs win", () => {
      expect(attrsFor('<div v-bind="attrs" class="foo"></div>')).toBe(' {...attrs} class="foo"');
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

    test("multi-statement handler without $event uses _ parameter", () => {
      expect(attrsFor(`<Comp @view-logs="emit('viewLogs', vm.id); closeDropdown();"></Comp>`)).toBe(
        ` onViewLogs={() => { emit('viewLogs', vm.id); closeDropdown(); }}`,
      );
    });

    test("multi-statement handler with $event keeps $event parameter", () => {
      expect(attrsFor(`<input @change="handleChange($event); log($event.target);" />`)).toBe(
        ` onChange={($event) => { handleChange($event); log($event.target); }}`,
      );
    });

    test("inline call without $event uses _ parameter", () => {
      expect(attrsFor(`<button @click="doSomething(item)"></button>`)).toBe(
        " onClick={() => doSomething(item)}",
      );
    });

    test("inline call with $event keeps $event parameter", () => {
      expect(attrsFor(`<input @input="handleInput($event.target.value)" />`)).toBe(
        " onInput={($event) => handleInput($event.target.value)}",
      );
    });

    test("@select.prevent with no handler calls preventDefault", () => {
      expect(attrsFor("<div @select.prevent></div>")).toBe(
        " onSelect={($event) => { $event.preventDefault() }}",
      );
    });

    test("@click.stop with no handler calls stopPropagation", () => {
      expect(attrsFor("<div @click.stop></div>")).toBe(
        " onClick={($event) => { $event.stopPropagation() }}",
      );
    });

    test("@click.prevent.stop chains both modifier calls", () => {
      expect(attrsFor("<div @click.prevent.stop></div>")).toBe(
        " onClick={($event) => { $event.preventDefault(); $event.stopPropagation() }}",
      );
    });

    test("@click.prevent with handler wraps in arrow function", () => {
      expect(attrsFor('<button @click.prevent="handleSubmit"></button>')).toBe(
        " onClick={($event) => { $event.preventDefault(); handleSubmit() }}",
      );
    });

    test("@click.prevent with $event expression preserves $event", () => {
      expect(attrsFor('<button @click.prevent="handleSubmit($event)"></button>')).toBe(
        " onClick={($event) => { $event.preventDefault(); handleSubmit($event) }}",
      );
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
