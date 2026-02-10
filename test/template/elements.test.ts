import { describe, expect, test } from 'bun:test';
import { parseSFC } from '../../src/parser';
import { generateElement, generateChildren } from '../../src/template/elements';
import type { ElementNode } from '../../src/types';
import type { JsxContext } from '../../src/types';

function makeCtx(classMap?: Map<string, string>): JsxContext {
  return {
    indent: 0,
    classMap: classMap ?? new Map(),
    warnings: [],
    fallbacks: [],
    componentName: 'TestComponent',
    usedContextMembers: new Set(),
  };
}

function getFirstElement(template: string): ElementNode {
  const sfc = parseSFC(`<template>${template}</template>`);
  const ast = sfc.templateAst!;
  // Find the first element node in children
  for (const child of ast.children) {
    if (child.type === 1) return child as ElementNode;
  }
  throw new Error('No element node found');
}

describe('generateElement', () => {
  test('simple div with text', () => {
    const el = getFirstElement('<div>hello</div>');
    const result = generateElement(el, makeCtx());
    expect(result).toBe('<div>hello</div>');
  });

  test('self-closing input', () => {
    const el = getFirstElement('<input type="text" />');
    const result = generateElement(el, makeCtx());
    expect(result).toBe('<input type="text" />');
  });

  test('self-closing br', () => {
    const el = getFirstElement('<br />');
    const result = generateElement(el, makeCtx());
    expect(result).toBe('<br />');
  });

  test('self-closing img with attributes', () => {
    const el = getFirstElement('<img src="logo.png" alt="logo" />');
    const result = generateElement(el, makeCtx());
    expect(result).toBe('<img src="logo.png" alt="logo" />');
  });

  test('empty div self-closes', () => {
    const el = getFirstElement('<div></div>');
    const result = generateElement(el, makeCtx());
    expect(result).toBe('<div />');
  });

  test('nested elements', () => {
    const el = getFirstElement('<div><span>text</span></div>');
    const result = generateElement(el, makeCtx());
    expect(result).toBe('<div><span>text</span></div>');
  });

  test('interpolation', () => {
    const el = getFirstElement('<div>{{ msg }}</div>');
    const result = generateElement(el, makeCtx());
    expect(result).toBe('<div>{msg}</div>');
  });

  test('text and interpolation mixed', () => {
    const el = getFirstElement('<span>Hello {{ name }}!</span>');
    const result = generateElement(el, makeCtx());
    expect(result).toBe('<span>Hello {name}!</span>');
  });

  test('comment node', () => {
    const el = getFirstElement('<div><!-- a comment --></div>');
    const result = generateElement(el, makeCtx());
    expect(result).toBe('<div>{/*  a comment  */}</div>');
  });

  test('template tag becomes fragment', () => {
    const sfc = parseSFC(`<template><template><div>a</div><div>b</div></template></template>`);
    const ast = sfc.templateAst!;
    // The inner <template> is a child element
    const inner = ast.children.find((c) => c.type === 1 && (c as ElementNode).tag === 'template');
    expect(inner).toBeDefined();
    const result = generateElement(inner as ElementNode, makeCtx());
    expect(result).toBe('<><div>a</div><div>b</div></>');
  });

  test('component :is dynamic component', () => {
    const el = getFirstElement('<component :is="currentView" />');
    const result = generateElement(el, makeCtx());
    expect(result).toBe('<currentView />');
  });

  test('component :is with children', () => {
    const el = getFirstElement('<component :is="comp">content</component>');
    const result = generateElement(el, makeCtx());
    expect(result).toBe('<comp>content</comp>');
  });

  test('component :is with other attributes', () => {
    const el = getFirstElement('<component :is="comp" class="wrapper" />');
    const result = generateElement(el, makeCtx());
    expect(result).toBe('<comp class="wrapper" />');
  });

  test('PascalCase component', () => {
    const el = getFirstElement('<MyButton>click me</MyButton>');
    const result = generateElement(el, makeCtx());
    expect(result).toBe('<MyButton>click me</MyButton>');
  });

  test('element with bound prop', () => {
    const el = getFirstElement('<div :id="myId">text</div>');
    const result = generateElement(el, makeCtx());
    expect(result).toBe('<div id={myId}>text</div>');
  });

  test('element with event handler', () => {
    const el = getFirstElement('<button @click="handleClick">click</button>');
    const result = generateElement(el, makeCtx());
    expect(result).toBe('<button onClick={handleClick}>click</button>');
  });
});

describe('generateChildren', () => {
  test('processes multiple children', () => {
    const sfc = parseSFC(`<template><div><span>a</span><span>b</span></div></template>`);
    const div = sfc.templateAst!.children.find(
      (c) => c.type === 1 && (c as ElementNode).tag === 'div',
    ) as ElementNode;
    const result = generateChildren(div.children, makeCtx());
    expect(result).toBe('<span>a</span><span>b</span>');
  });
});
