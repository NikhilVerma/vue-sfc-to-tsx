import { describe, expect, test } from 'bun:test';
import { parseSFC } from '../../src/parser';
import { templateToJsx, walkChildren } from '../../src/template/index';
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
    refIdentifiers: new Set(),
  };
}

function toJsx(template: string, classMap?: Map<string, string>): string {
  const sfc = parseSFC(`<template>${template}</template>`);
  return templateToJsx(sfc.templateAst!, makeCtx(classMap));
}

describe('walkChildren', () => {
  test('simple text', () => {
    const sfc = parseSFC(`<template><div>hello</div></template>`);
    const result = walkChildren(sfc.templateAst!.children, makeCtx());
    expect(result).toBe('<div>hello</div>');
  });

  test('interpolation', () => {
    expect(toJsx('<div>{{ msg }}</div>')).toBe('<div>{msg}</div>');
  });

  test('nested elements', () => {
    expect(toJsx('<div><span>text</span></div>')).toBe('<div><span>text</span></div>');
  });

  test('comment', () => {
    expect(toJsx('<div><!-- note --></div>')).toBe('<div>{/*  note  */}</div>');
  });

  test('multiple root elements wrapped in fragment', () => {
    expect(toJsx('<div>a</div><div>b</div>')).toBe('<><div>a</div><div>b</div></>');
  });

  test('single root element not wrapped', () => {
    expect(toJsx('<div>hello</div>')).toBe('<div>hello</div>');
  });

  test('empty template', () => {
    const sfc = parseSFC(`<template></template>`);
    const result = templateToJsx(sfc.templateAst!, makeCtx());
    expect(result).toBe('<></>');
  });
});

describe('v-if conditional chains', () => {
  test('v-if alone', () => {
    expect(toJsx('<div v-if="show">yes</div>')).toBe('{show ? <div>yes</div> : null}');
  });

  test('v-if / v-else', () => {
    const result = toJsx('<div v-if="show">yes</div><div v-else>no</div>');
    // Conditional chain is a single JSX output — no fragment wrapper needed
    expect(result).toBe('{show ? <div>yes</div> : <div>no</div>}');
  });

  test('v-if / v-else-if / v-else', () => {
    const result = toJsx(
      '<div v-if="a">A</div><div v-else-if="b">B</div><div v-else>C</div>',
    );
    expect(result).toBe('{a ? <div>A</div> : b ? <div>B</div> : <div>C</div>}');
  });
});

describe('v-for loops', () => {
  test('basic v-for', () => {
    const result = toJsx('<div v-for="item in items" :key="item.id">{{ item.name }}</div>');
    expect(result).toBe('{items.map((item) => (<div key={item.id}>{item.name}</div>))}');
  });

  test('v-for with index', () => {
    const result = toJsx(
      '<div v-for="(item, index) in items" :key="index">{{ item }}</div>',
    );
    expect(result).toBe(
      '{items.map((item, index) => (<div key={index}>{item}</div>))}',
    );
  });
});

describe('v-show', () => {
  test('v-show wraps element', () => {
    const result = toJsx('<div v-show="visible">content</div>');
    expect(result).toContain('v-show');
    expect(result).toContain('visible');
  });
});

describe('event handling in walker', () => {
  test('@click handler', () => {
    expect(toJsx('<button @click="handleClick">click</button>')).toBe(
      '<button onClick={handleClick}>click</button>',
    );
  });

  test('@click with inline expression', () => {
    const result = toJsx('<button @click="count++">click</button>');
    expect(result).toContain('onClick');
    expect(result).toContain('count++');
  });
});

describe('directives in walker', () => {
  test('v-html', () => {
    const result = toJsx('<div v-html="rawHtml"></div>');
    expect(result).toContain('innerHTML={rawHtml}');
  });

  test('v-text', () => {
    const result = toJsx('<div v-text="msg"></div>');
    expect(result).toContain('textContent={msg}');
  });
});

describe('dynamic component', () => {
  test('<component :is="x">', () => {
    expect(toJsx('<component :is="currentView" />')).toBe('<currentView />');
  });
});

describe('template fragments', () => {
  test('bare <template> becomes fragment', () => {
    const sfc = parseSFC(
      `<template><template><div>a</div><div>b</div></template></template>`,
    );
    const inner = sfc.templateAst!.children.find(
      (c) => c.type === 1 && (c as ElementNode).tag === 'template',
    );
    expect(inner).toBeDefined();
    const result = walkChildren([inner!], makeCtx());
    expect(result).toBe('<><div>a</div><div>b</div></>');
  });
});

describe('template globals rewriting', () => {
  test('$attrs in v-bind spread becomes attrs', () => {
    const result = toJsx('<div v-bind="$attrs" />');
    expect(result).toBe('<div {...attrs} />');
  });

  test('$attrs in expression becomes attrs', () => {
    const jsx = toJsx('<div :class="$attrs.class" />');
    expect(jsx).toContain('attrs.class');
    expect(jsx).not.toContain('$attrs');
  });

  test('$slots in v-if expression becomes slots', () => {
    const jsx = toJsx('<div v-if="$slots.header">has header</div>');
    expect(jsx).toContain('slots.header');
    expect(jsx).not.toContain('$slots');
  });

  test('$emit in event handler becomes emit', () => {
    const jsx = toJsx('<button @click="$emit(\'foo\')">click</button>');
    expect(jsx).toContain("emit('foo')");
    expect(jsx).not.toContain('$emit');
  });

  test('$props in expression becomes props', () => {
    const jsx = toJsx('<div :class="$props.active">text</div>');
    expect(jsx).toContain('props.active');
    expect(jsx).not.toContain('$props');
  });

  test('interpolation with $slots is rewritten', () => {
    const jsx = toJsx('<div>{{ $slots.default ? "yes" : "no" }}</div>');
    expect(jsx).toContain('slots.default');
    expect(jsx).not.toContain('$slots');
  });
});
