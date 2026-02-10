import { describe, expect, test } from 'bun:test';
import { parseSFC } from '../../src/parser';
import { processConditionalChain, processVFor, findDirective } from '../../src/template/control-flow';
import type { ElementNode, JsxContext, TemplateChildNode } from '../../src/types';

function makeCtx(): JsxContext {
  return {
    indent: 0,
    classMap: new Map(),
    warnings: [],
    fallbacks: [],
    componentName: 'Test',
  };
}

/** Simple mock renderElement that returns `<Tag />` */
function renderElement(node: ElementNode, _ctx: JsxContext): string {
  return `<${node.tag} />`;
}

function getChildren(template: string): TemplateChildNode[] {
  const parsed = parseSFC(`<template>${template}</template>`);
  return parsed.templateAst!.children;
}

describe('processConditionalChain', () => {
  test('v-if only (no else)', () => {
    const children = getChildren(`
      <div v-if="show">yes</div>
    `);
    // Find the element with v-if
    const idx = children.findIndex(
      (c) => c.type === 1 && findDirective(c as ElementNode, 'if'),
    );
    expect(idx).toBeGreaterThanOrEqual(0);

    const result = processConditionalChain(children, idx, makeCtx(), renderElement);
    expect(result.jsx).toBe('{show ? <div /> : null}');
    expect(result.consumed).toBe(1);
  });

  test('v-if / v-else', () => {
    const children = getChildren(`
      <div v-if="show">yes</div>
      <div v-else>no</div>
    `);
    const idx = children.findIndex(
      (c) => c.type === 1 && findDirective(c as ElementNode, 'if'),
    );

    const result = processConditionalChain(children, idx, makeCtx(), renderElement);
    expect(result.jsx).toBe('{show ? <div /> : <div />}');
    // consumed includes whitespace text node between elements
    expect(result.consumed).toBeGreaterThanOrEqual(2);
  });

  test('v-if / v-else-if / v-else', () => {
    const children = getChildren(`
      <div v-if="a">A</div>
      <div v-else-if="b">B</div>
      <div v-else>C</div>
    `);
    const idx = children.findIndex(
      (c) => c.type === 1 && findDirective(c as ElementNode, 'if'),
    );

    const result = processConditionalChain(children, idx, makeCtx(), renderElement);
    expect(result.jsx).toBe('{a ? <div /> : b ? <div /> : <div />}');
  });

  test('v-if / v-else-if (no else)', () => {
    const children = getChildren(`
      <div v-if="a">A</div>
      <div v-else-if="b">B</div>
    `);
    const idx = children.findIndex(
      (c) => c.type === 1 && findDirective(c as ElementNode, 'if'),
    );

    const result = processConditionalChain(children, idx, makeCtx(), renderElement);
    expect(result.jsx).toBe('{a ? <div /> : b ? <div /> : null}');
  });

  test('chain stops at non-conditional sibling', () => {
    const children = getChildren(`
      <div v-if="show">yes</div>
      <span>other</span>
    `);
    const idx = children.findIndex(
      (c) => c.type === 1 && findDirective(c as ElementNode, 'if'),
    );

    const result = processConditionalChain(children, idx, makeCtx(), renderElement);
    expect(result.jsx).toBe('{show ? <div /> : null}');
    // Should not consume the <span>
    // consumed = 1 (v-if) + whitespace nodes
  });

  test('multiple v-else-if branches', () => {
    const children = getChildren(`
      <div v-if="a">A</div>
      <div v-else-if="b">B</div>
      <div v-else-if="c">C</div>
      <div v-else>D</div>
    `);
    const idx = children.findIndex(
      (c) => c.type === 1 && findDirective(c as ElementNode, 'if'),
    );

    const result = processConditionalChain(children, idx, makeCtx(), renderElement);
    expect(result.jsx).toBe('{a ? <div /> : b ? <div /> : c ? <div /> : <div />}');
  });
});

describe('processVFor', () => {
  test('basic v-for with item in items', () => {
    const children = getChildren(`<div v-for="item in items">{{ item }}</div>`);
    const node = children.find((c) => c.type === 1) as ElementNode;

    const result = processVFor(node, makeCtx(), renderElement);
    expect(result).toBe('{items.map((item) => (<div />))}');
  });

  test('v-for with (item, index) in items', () => {
    const children = getChildren(`<div v-for="(item, index) in items">{{ item }}</div>`);
    const node = children.find((c) => c.type === 1) as ElementNode;

    const result = processVFor(node, makeCtx(), renderElement);
    expect(result).toBe('{items.map((item, index) => (<div />))}');
  });

  test('v-for with :key', () => {
    const children = getChildren(`<div v-for="item in items" :key="item.id">{{ item }}</div>`);
    const node = children.find((c) => c.type === 1) as ElementNode;

    const result = processVFor(node, makeCtx(), renderElement);
    expect(result).toBe('{items.map((item) => (<div />))}');
    // Note: key handling is delegated to renderElement in the real walker
  });

  test('v-for with v-if on same element', () => {
    const children = getChildren(`<div v-for="item in items" v-if="item.active">{{ item }}</div>`);
    const node = children.find((c) => c.type === 1) as ElementNode;

    const result = processVFor(node, makeCtx(), renderElement);
    expect(result).toBe('{items.map((item) => (item.active ? <div /> : null))}');
  });

  test('v-for with "of" syntax', () => {
    const children = getChildren(`<div v-for="item of items">{{ item }}</div>`);
    const node = children.find((c) => c.type === 1) as ElementNode;

    const result = processVFor(node, makeCtx(), renderElement);
    expect(result).toBe('{items.map((item) => (<div />))}');
  });
});
