import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

const CLI_PATH = join(import.meta.dir, '..', 'src', 'cli.ts');

const SAMPLE_VUE = `<template>
  <div class="hello">{{ msg }}</div>
</template>

<script setup lang="ts">
const msg = 'Hello'
</script>

<style scoped>
.hello { color: red; }
</style>`;

let tempDir: string;

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'vue-to-tsx-cli-'));
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('CLI', () => {
  test('--help prints usage information', async () => {
    const proc = Bun.spawn(['bun', 'run', CLI_PATH, '--help'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const code = await proc.exited;
    const stdout = await new Response(proc.stdout).text();

    expect(code).toBe(0);
    expect(stdout).toContain('vue-to-tsx');
    expect(stdout).toContain('--out-dir');
    expect(stdout).toContain('--llm');
    expect(stdout).toContain('--dry-run');
    expect(stdout).toContain('--help');
  });

  test('exits with error when no patterns given', async () => {
    const proc = Bun.spawn(['bun', 'run', CLI_PATH], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const code = await proc.exited;
    const stderr = await new Response(proc.stderr).text();

    expect(code).not.toBe(0);
    expect(stderr).toContain('No input files');
  });

  test('converts a .vue file and writes output', async () => {
    const inputPath = join(tempDir, 'Hello.vue');
    await Bun.write(inputPath, SAMPLE_VUE);

    const proc = Bun.spawn(['bun', 'run', CLI_PATH, inputPath], {
      stdout: 'pipe',
      stderr: 'pipe',
      cwd: tempDir,
    });
    const code = await proc.exited;
    const stdout = await new Response(proc.stdout).text();

    expect(code).toBe(0);
    expect(stdout).toContain('Done');

    const tsxFile = Bun.file(join(tempDir, 'Hello.tsx'));
    expect(await tsxFile.exists()).toBe(true);

    const tsxContent = await tsxFile.text();
    expect(tsxContent).toContain('defineComponent');
  });

  test('--dry-run does not write files', async () => {
    const subDir = join(tempDir, 'dryrun');
    await Bun.write(join(subDir, 'Dry.vue'), SAMPLE_VUE);

    const proc = Bun.spawn(['bun', 'run', CLI_PATH, '--dry-run', join(subDir, 'Dry.vue')], {
      stdout: 'pipe',
      stderr: 'pipe',
      cwd: subDir,
    });
    const code = await proc.exited;
    const stdout = await new Response(proc.stdout).text();

    expect(code).toBe(0);
    expect(stdout).toContain('[dry-run]');

    const tsxFile = Bun.file(join(subDir, 'Dry.tsx'));
    expect(await tsxFile.exists()).toBe(false);
  });

  test('--out-dir writes to specified directory', async () => {
    const inputDir = join(tempDir, 'outdir-input');
    const outputDir = join(tempDir, 'outdir-output');
    await Bun.write(join(inputDir, 'Widget.vue'), SAMPLE_VUE);

    const proc = Bun.spawn(
      ['bun', 'run', CLI_PATH, '--out-dir', outputDir, join(inputDir, 'Widget.vue')],
      {
        stdout: 'pipe',
        stderr: 'pipe',
        cwd: tempDir,
      },
    );
    const code = await proc.exited;

    expect(code).toBe(0);

    const tsxFile = Bun.file(join(outputDir, 'Widget.tsx'));
    expect(await tsxFile.exists()).toBe(true);
  });
});
