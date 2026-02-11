import type { ImportInfo } from "../types";

/** Known auto-imports: map of identifier to source module */
const VUE_AUTO_IMPORTS: Record<string, string> = {
  // Reactivity
  ref: "vue",
  computed: "vue",
  reactive: "vue",
  readonly: "vue",
  watch: "vue",
  watchEffect: "vue",
  watchPostEffect: "vue",
  watchSyncEffect: "vue",
  // Refs
  toRef: "vue",
  toRefs: "vue",
  isRef: "vue",
  unref: "vue",
  shallowRef: "vue",
  triggerRef: "vue",
  customRef: "vue",
  shallowReactive: "vue",
  shallowReadonly: "vue",
  toRaw: "vue",
  markRaw: "vue",
  isReactive: "vue",
  isReadonly: "vue",
  isProxy: "vue",
  // Lifecycle
  onMounted: "vue",
  onUpdated: "vue",
  onUnmounted: "vue",
  onBeforeMount: "vue",
  onBeforeUpdate: "vue",
  onBeforeUnmount: "vue",
  onActivated: "vue",
  onDeactivated: "vue",
  onErrorCaptured: "vue",
  onServerPrefetch: "vue",
  // Dependency Injection
  provide: "vue",
  inject: "vue",
  // Utilities
  nextTick: "vue",
  h: "vue",
  defineAsyncComponent: "vue",
  withModifiers: "vue",
  // Types used as values
  PropType: "vue",
  // Vue Router
  useRoute: "vue-router",
  useRouter: "vue-router",
};

/**
 * Detect auto-imported identifiers used in script body or template JSX
 * that have no explicit import.
 */
export function detectAutoImports(
  scriptBody: string,
  templateJsx: string,
  existingImports: ImportInfo[],
): ImportInfo[] {
  // Build set of already-imported identifiers
  const alreadyImported = new Set<string>();
  for (const imp of existingImports) {
    if (imp.defaultImport) alreadyImported.add(imp.defaultImport);
    for (const named of imp.namedImports) {
      alreadyImported.add(named.local);
    }
  }

  const combined = scriptBody + "\n" + templateJsx;

  // Group missing imports by source module
  const missing = new Map<string, string[]>();

  for (const [identifier, source] of Object.entries(VUE_AUTO_IMPORTS)) {
    if (alreadyImported.has(identifier)) continue;

    const re = new RegExp(`\\b${identifier}\\b`);
    if (re.test(combined)) {
      const list = missing.get(source);
      if (list) {
        list.push(identifier);
      } else {
        missing.set(source, [identifier]);
      }
    }
  }

  // Convert to ImportInfo[]
  const result: ImportInfo[] = [];
  for (const [source, identifiers] of missing) {
    result.push({
      source,
      namedImports: identifiers.map((id) => ({ imported: id, local: id })),
      typeOnly: false,
    });
  }

  return result;
}
