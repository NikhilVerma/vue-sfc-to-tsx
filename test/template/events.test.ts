import { describe, expect, test } from "bun:test";
import { parseSFC } from "../../src/parser";
import { processEvent } from "../../src/template/events";
import type { DirectiveNode, ElementNode, JsxContext } from "../../src/types";

function makeCtx(): JsxContext {
  return {
    indent: 0,
    classMap: new Map(),
    warnings: [],
    fallbacks: [],
    componentName: "Test",
    usedContextMembers: new Set(),
    refIdentifiers: new Set(),
    propIdentifiers: new Set(),
    hasVFor: false,
    usedBuiltins: new Set(),
  };
}

const DIRECTIVE = 7;

function getEventDirective(template: string): DirectiveNode {
  const parsed = parseSFC(`<template>${template}</template>`);
  const el = parsed.templateAst!.children.find((c) => c.type === 1) as ElementNode;
  const dir = el.props.find((p): p is DirectiveNode => p.type === DIRECTIVE && p.name === "on");
  if (!dir) throw new Error("No event directive found");
  return dir;
}

describe("processEvent", () => {
  test('@click="handler" -> onClick={handler}', () => {
    const dir = getEventDirective(`<button @click="handler">click</button>`);
    const result = processEvent(dir, makeCtx());
    expect(result.name).toBe("onClick");
    expect(result.value).toBe("handler");
  });

  test('@click.prevent="handler" -> onClick with withModifiers', () => {
    const dir = getEventDirective(`<button @click.prevent="handler">click</button>`);
    const result = processEvent(dir, makeCtx());
    expect(result.name).toBe("onClick");
    expect(result.value).toBe("withModifiers(handler, ['prevent'])");
  });

  test('@click.stop.prevent="handler" -> multiple modifiers', () => {
    const dir = getEventDirective(`<button @click.stop.prevent="handler">click</button>`);
    const result = processEvent(dir, makeCtx());
    expect(result.name).toBe("onClick");
    expect(result.value).toBe("withModifiers(handler, ['stop', 'prevent'])");
  });

  test('@click.capture="handler" -> onClickCapture', () => {
    const dir = getEventDirective(`<button @click.capture="handler">click</button>`);
    const result = processEvent(dir, makeCtx());
    expect(result.name).toBe("onClickCapture");
    expect(result.value).toBe("handler");
  });

  test('@click.capture.prevent="handler" -> onClickCapture with withModifiers', () => {
    const dir = getEventDirective(`<button @click.capture.prevent="handler">click</button>`);
    const result = processEvent(dir, makeCtx());
    expect(result.name).toBe("onClickCapture");
    expect(result.value).toBe("withModifiers(handler, ['prevent'])");
  });

  test('inline expression @click="count++" wraps in arrow', () => {
    const dir = getEventDirective(`<button @click="count++">click</button>`);
    const result = processEvent(dir, makeCtx());
    expect(result.name).toBe("onClick");
    expect(result.value).toBe("() => count++");
  });

  test("inline expression with modifier", () => {
    const dir = getEventDirective(`<button @click.prevent="count++">click</button>`);
    const result = processEvent(dir, makeCtx());
    expect(result.name).toBe("onClick");
    expect(result.value).toBe("withModifiers(() => count++, ['prevent'])");
  });

  test("no handler value @click -> empty arrow", () => {
    const dir = getEventDirective(`<button @click>click</button>`);
    const result = processEvent(dir, makeCtx());
    expect(result.name).toBe("onClick");
    expect(result.value).toBe("() => {}");
  });

  test('member expression handler @click="obj.method"', () => {
    const dir = getEventDirective(`<button @click="obj.method">click</button>`);
    const result = processEvent(dir, makeCtx());
    expect(result.name).toBe("onClick");
    expect(result.value).toBe("obj.method");
  });

  test("@update:modelValue -> onUpdate:modelValue", () => {
    const dir = getEventDirective(`<input @update:modelValue="handler" />`);
    const result = processEvent(dir, makeCtx());
    expect(result.name).toBe("onUpdate:modelValue");
    expect(result.value).toBe("handler");
  });

  test('@keyup.enter="handler" -> onKeyup with withModifiers', () => {
    const dir = getEventDirective(`<input @keyup.enter="handler" />`);
    const result = processEvent(dir, makeCtx());
    expect(result.name).toBe("onKeyup");
    expect(result.value).toBe("withModifiers(handler, ['enter'])");
  });

  test(".once modifier is native (not in withModifiers)", () => {
    const dir = getEventDirective(`<button @click.once="handler">click</button>`);
    const result = processEvent(dir, makeCtx());
    expect(result.name).toBe("onClick");
    // .once is native, no withModifiers needed
    expect(result.value).toBe("handler");
  });

  test(".passive modifier is native", () => {
    const dir = getEventDirective(`<div @scroll.passive="handler">scroll</div>`);
    const result = processEvent(dir, makeCtx());
    expect(result.name).toBe("onScroll");
    expect(result.value).toBe("handler");
  });

  // --- Arrow function / function expression handlers should NOT be double-wrapped ---

  test("arrow function handler is not double-wrapped", () => {
    const dir = getEventDirective(
      `<input @input="(event: CustomEvent) => (showX = event.detail.value)" />`,
    );
    const result = processEvent(dir, makeCtx());
    expect(result.name).toBe("onInput");
    expect(result.value).toBe("(event: CustomEvent) => (showX = event.detail.value)");
  });

  test("simple arrow function is not double-wrapped", () => {
    const dir = getEventDirective(`<button @click="() => doSomething()">click</button>`);
    const result = processEvent(dir, makeCtx());
    expect(result.name).toBe("onClick");
    expect(result.value).toBe("() => doSomething()");
  });

  test("arrow function with single param is not double-wrapped", () => {
    const dir = getEventDirective(`<button @click="(e) => handle(e)">click</button>`);
    const result = processEvent(dir, makeCtx());
    expect(result.name).toBe("onClick");
    expect(result.value).toBe("(e) => handle(e)");
  });

  test("function expression is not double-wrapped", () => {
    const dir = getEventDirective(`<button @click="function(e) { handle(e) }">click</button>`);
    const result = processEvent(dir, makeCtx());
    expect(result.name).toBe("onClick");
    expect(result.value).toBe("function(e) { handle(e) }");
  });

  test("arrow function with modifier uses withModifiers correctly", () => {
    const dir = getEventDirective(`<button @click.prevent="(e) => handle(e)">click</button>`);
    const result = processEvent(dir, makeCtx());
    expect(result.name).toBe("onClick");
    expect(result.value).toBe("withModifiers((e) => handle(e), ['prevent'])");
  });
});
