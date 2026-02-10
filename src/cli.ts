#!/usr/bin/env bun
import { convert } from './index';
import { basename, join, resolve, dirname } from 'path';
import { Glob } from 'bun';

interface CliOptions {
  patterns: string[];
  outDir: string | null;
  llm: boolean;
  dryRun: boolean;
  help: boolean;
}

const HELP_TEXT = `
vue-to-tsx - Convert Vue SFCs to TSX + CSS Modules

Usage:
  vue-to-tsx [options] <glob...>

Arguments:
  <glob...>   Glob patterns for .vue files (e.g. "src/**/*.vue")

Options:
  --out-dir <dir>  Output directory (default: same directory as input)
  --llm            Enable LLM fallback for unconvertible patterns
  --dry-run        Show what would be written without writing files
  --help           Show this help message

Examples:
  vue-to-tsx src/**/*.vue
  vue-to-tsx --out-dir dist src/components/*.vue
  vue-to-tsx --dry-run --llm "src/**/*.vue"
`.trim();

function parseArgs(argv: string[]): CliOptions {
  const args = argv.slice(2); // skip bun and script path
  const opts: CliOptions = {
    patterns: [],
    outDir: null,
    llm: false,
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      opts.help = true;
    } else if (arg === '--llm') {
      opts.llm = true;
    } else if (arg === '--dry-run') {
      opts.dryRun = true;
    } else if (arg === '--out-dir') {
      i++;
      if (!args[i]) {
        console.error('Error: --out-dir requires a directory argument');
        process.exit(1);
      }
      opts.outDir = args[i];
    } else if (arg.startsWith('-')) {
      console.error(`Error: Unknown option "${arg}"`);
      process.exit(1);
    } else {
      opts.patterns.push(arg);
    }
  }

  return opts;
}

function componentNameFromFile(filePath: string): string {
  const name = basename(filePath, '.vue');
  // PascalCase: foo-bar → FooBar
  return name
    .split(/[-_]/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
}

async function findFiles(patterns: string[]): Promise<string[]> {
  const files: string[] = [];
  for (const pattern of patterns) {
    // If it looks like a direct file path (absolute or no glob chars), check if it exists
    if (!pattern.includes('*') && !pattern.includes('?') && !pattern.includes('{')) {
      const resolved = resolve(pattern);
      if (resolved.endsWith('.vue') && await Bun.file(resolved).exists()) {
        files.push(resolved);
      }
      continue;
    }
    const glob = new Glob(pattern);
    for await (const path of glob.scan({ cwd: process.cwd(), absolute: true })) {
      if (path.endsWith('.vue')) {
        files.push(path);
      }
    }
  }
  return [...new Set(files)].sort();
}

async function main() {
  const opts = parseArgs(process.argv);

  if (opts.help) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  if (opts.patterns.length === 0) {
    console.error('Error: No input files specified. Use --help for usage.');
    process.exit(1);
  }

  const files = await findFiles(opts.patterns);

  if (files.length === 0) {
    console.error('No .vue files found matching the given patterns.');
    process.exit(1);
  }

  let converted = 0;
  let warnings = 0;
  let errors = 0;

  for (const file of files) {
    const componentName = componentNameFromFile(file);
    const source = await Bun.file(file).text();

    try {
      const result = await convert(source, {
        componentName,
        llm: opts.llm,
      });

      if (result.warnings.length > 0) {
        warnings += result.warnings.length;
        for (const w of result.warnings) {
          console.warn(`  warn: ${file}: ${w.message}`);
        }
      }

      // Determine output paths
      const outBase = opts.outDir
        ? join(resolve(opts.outDir), basename(file, '.vue'))
        : join(dirname(file), basename(file, '.vue'));

      const tsxPath = `${outBase}.tsx`;
      const cssPath = result.cssFilename
        ? join(dirname(outBase), result.cssFilename)
        : null;

      if (opts.dryRun) {
        console.log(`[dry-run] ${file} → ${tsxPath}`);
        if (cssPath) {
          console.log(`[dry-run] ${file} → ${cssPath}`);
        }
      } else {
        await Bun.write(tsxPath, result.tsx);
        if (cssPath && result.css) {
          await Bun.write(cssPath, result.css);
        }
        console.log(`${file} → ${tsxPath}`);
        if (cssPath) {
          console.log(`${file} → ${cssPath}`);
        }
      }

      converted++;
    } catch (err: any) {
      errors++;
      console.error(`Error converting ${file}: ${err.message}`);
    }
  }

  console.log(
    `\nDone: ${converted} file(s) converted, ${warnings} warning(s), ${errors} error(s).`,
  );

  if (errors > 0) {
    process.exit(1);
  }
}

main();
