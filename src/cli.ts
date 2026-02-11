#!/usr/bin/env bun
import { convert } from './index';
import { basename, join, resolve, dirname } from 'path';
import { watch as fsWatch } from 'fs';
import { Glob } from 'bun';

interface CliOptions {
  patterns: string[];
  outDir: string | null;
  llm: boolean;
  llmModel: string | null;
  dryRun: boolean;
  delete: boolean;
  watch: boolean;
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
  --llm-model <m>  LLM model to use (overrides env var and default)
  --dry-run        Show what would be written without writing files
  --delete         Delete original .vue files after successful conversion
  --watch, -w      Watch files for changes and re-convert on save
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
    llmModel: null,
    dryRun: false,
    delete: false,
    watch: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      opts.help = true;
    } else if (arg === '--llm') {
      opts.llm = true;
    } else if (arg === '--llm-model') {
      i++;
      if (!args[i]) {
        console.error('Error: --llm-model requires a model argument');
        process.exit(1);
      }
      opts.llmModel = args[i];
    } else if (arg === '--dry-run') {
      opts.dryRun = true;
    } else if (arg === '--delete') {
      opts.delete = true;
    } else if (arg === '--watch' || arg === '-w') {
      opts.watch = true;
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

  const stats = { converted: 0, deleted: 0, cssModules: 0, warnings: 0, fallbacks: 0, errors: 0 };

  for (const file of files) {
    await convertSingleFile(file, opts, stats);
  }

  const parts = [
    `${stats.converted} converted`,
    `${stats.cssModules} css module${stats.cssModules !== 1 ? 's' : ''}`,
    `${stats.deleted} deleted`,
    `${stats.warnings} warning${stats.warnings !== 1 ? 's' : ''}`,
    `${stats.fallbacks} fallback${stats.fallbacks !== 1 ? 's' : ''}`,
    `${stats.errors} error${stats.errors !== 1 ? 's' : ''}`,
  ];
  console.log(`\nDone: ${parts.join(', ')}.`);

  if (opts.watch) {
    watchFiles(files, opts);
  } else if (stats.errors > 0) {
    process.exit(1);
  }
}

interface ConvertStats {
  converted: number;
  deleted: number;
  cssModules: number;
  warnings: number;
  fallbacks: number;
  errors: number;
}

async function convertSingleFile(file: string, opts: CliOptions, stats: ConvertStats): Promise<boolean> {
  const componentName = componentNameFromFile(file);
  let source: string;
  try {
    source = await Bun.file(file).text();
  } catch {
    console.error(`Error reading ${file}: file not found`);
    stats.errors++;
    return false;
  }

  try {
    const result = await convert(source, {
      componentName,
      llm: opts.llm,
      ...(opts.llmModel ? { llmModel: opts.llmModel } : {}),
    });

    if (result.warnings.length > 0) {
      stats.warnings += result.warnings.length;
      for (const w of result.warnings) {
        console.warn(`  warn: ${file}: ${w.message}`);
      }
    }
    stats.fallbacks += result.fallbacks.length;

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
      if (opts.delete) {
        console.log(`[dry-run] would delete ${file}`);
      }
    } else {
      await Bun.write(tsxPath, result.tsx);
      if (cssPath && result.css) {
        await Bun.write(cssPath, result.css);
        stats.cssModules++;
      }
      console.log(`${file} → ${tsxPath}`);
      if (cssPath) {
        console.log(`${file} → ${cssPath}`);
      }
      if (opts.delete) {
        const { unlink } = await import('fs/promises');
        await unlink(file);
        stats.deleted++;
        console.log(`  deleted ${file}`);
      }
    }

    stats.converted++;
    return true;
  } catch (err: any) {
    stats.errors++;
    console.error(`Error converting ${file}: ${err.message}`);
    return false;
  }
}

function watchFiles(files: string[], opts: CliOptions) {
  console.log(`\n[watch] Watching ${files.length} file(s) for changes...`);

  const watchers: ReturnType<typeof fsWatch>[] = [];

  for (const file of files) {
    try {
      const watcher = fsWatch(file, async (_eventType) => {
        const name = basename(file);
        console.log(`[watch] Reconverting ${name}...`);
        const stats: ConvertStats = { converted: 0, deleted: 0, cssModules: 0, warnings: 0, fallbacks: 0, errors: 0 };
        try {
          await convertSingleFile(file, opts, stats);
        } catch (err: any) {
          console.error(`[watch] Error: ${err.message}`);
        }
      });
      watchers.push(watcher);
    } catch {
      // File may have been deleted; skip it
    }
  }

  process.on('SIGINT', () => {
    for (const w of watchers) w.close();
    console.log('\n[watch] Stopped.');
    process.exit(0);
  });
}

main();
