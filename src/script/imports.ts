import type { ImportInfo } from "../types";

/**
 * Merge two arrays of imports, combining imports from the same source module.
 */
export function mergeImports(existing: ImportInfo[], additional: ImportInfo[]): ImportInfo[] {
  const map = new Map<string, ImportInfo>();

  for (const imp of [...existing, ...additional]) {
    const key = imp.source;
    const current = map.get(key);
    if (!current) {
      map.set(key, {
        source: imp.source,
        defaultImport: imp.defaultImport,
        namedImports: [...imp.namedImports],
        namespaceImport: imp.namespaceImport,
        typeOnly: imp.typeOnly,
      });
    } else {
      // Merge default import
      if (imp.defaultImport && !current.defaultImport) {
        current.defaultImport = imp.defaultImport;
      }

      // Merge namespace import
      if (imp.namespaceImport && !current.namespaceImport) {
        current.namespaceImport = imp.namespaceImport;
      }

      // Merge named imports, dedup by imported name
      for (const named of imp.namedImports) {
        const exists = current.namedImports.some((n) => n.imported === named.imported);
        if (!exists) {
          current.namedImports.push(named);
        }
      }

      // If either import is not type-only, the merged result is not type-only
      if (!imp.typeOnly) {
        current.typeOnly = false;
      }
    }
  }

  return Array.from(map.values());
}

/**
 * Generate import statement strings from ImportInfo array.
 * Sorts: 'vue' first, then other packages alphabetically.
 */
export function generateImportStatements(imports: ImportInfo[]): string {
  const sorted = [...imports].sort((a, b) => {
    if (a.source === "vue") return -1;
    if (b.source === "vue") return 1;
    return a.source.localeCompare(b.source);
  });

  const lines: string[] = [];

  for (const imp of sorted) {
    const typePrefix = imp.typeOnly ? "type " : "";
    // Strip .vue extension from import paths (TSX files don't import .vue)
    const source = imp.source.replace(/\.vue$/, '');

    if (imp.namespaceImport) {
      lines.push(`import ${typePrefix}* as ${imp.namespaceImport} from '${source}'`);
      continue;
    }

    const parts: string[] = [];

    if (imp.defaultImport) {
      parts.push(imp.defaultImport);
    }

    if (imp.namedImports.length > 0) {
      const namedParts = imp.namedImports.map((n) =>
        n.imported === n.local ? n.imported : `${n.imported} as ${n.local}`,
      );
      parts.push(`{ ${namedParts.join(", ")} }`);
    }

    if (parts.length === 0) {
      // Side-effect import
      lines.push(`import '${source}'`);
    } else {
      lines.push(`import ${typePrefix}${parts.join(", ")} from '${source}'`);
    }
  }

  return lines.join("\n");
}

/**
 * Ensure a named export exists in the 'vue' import.
 * Mutates the imports array in place.
 * If typeOnly is true, adds to a type-only vue import.
 */
export function addVueImport(imports: ImportInfo[], name: string, typeOnly?: boolean): void {
  if (typeOnly) {
    let vueTypeImport = imports.find((i) => i.source === "vue" && i.typeOnly);
    if (!vueTypeImport) {
      vueTypeImport = { source: "vue", namedImports: [], typeOnly: true };
      imports.push(vueTypeImport);
    }
    const exists = vueTypeImport.namedImports.some((n) => n.imported === name);
    if (!exists) {
      vueTypeImport.namedImports.push({ imported: name, local: name });
    }
    return;
  }

  let vueImport = imports.find((i) => i.source === "vue" && !i.typeOnly);
  if (!vueImport) {
    vueImport = { source: "vue", namedImports: [], typeOnly: false };
    imports.push(vueImport);
  }

  const exists = vueImport.namedImports.some((n) => n.imported === name);
  if (!exists) {
    vueImport.namedImports.push({ imported: name, local: name });
  }
}
