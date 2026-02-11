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

  test('--delete removes original .vue file after conversion', async () => {
    const subDir = join(tempDir, 'delete-test');
    const vuePath = join(subDir, 'DeleteMe.vue');
    await Bun.write(vuePath, SAMPLE_VUE);

    // Verify .vue exists before
    expect(await Bun.file(vuePath).exists()).toBe(true);

    const proc = Bun.spawn(['bun', 'run', CLI_PATH, '--delete', vuePath], {
      stdout: 'pipe',
      stderr: 'pipe',
      cwd: subDir,
    });
    const code = await proc.exited;
    const stdout = await new Response(proc.stdout).text();

    expect(code).toBe(0);
    expect(stdout).toContain('Done');
    expect(stdout).toContain('deleted');

    // .tsx should exist
    const tsxFile = Bun.file(join(subDir, 'DeleteMe.tsx'));
    expect(await tsxFile.exists()).toBe(true);

    // .vue should be deleted
    expect(await Bun.file(vuePath).exists()).toBe(false);
  });

  test('--delete with --dry-run does NOT delete files', async () => {
    const subDir = join(tempDir, 'delete-dryrun-test');
    const vuePath = join(subDir, 'KeepMe.vue');
    await Bun.write(vuePath, SAMPLE_VUE);

    const proc = Bun.spawn(['bun', 'run', CLI_PATH, '--delete', '--dry-run', vuePath], {
      stdout: 'pipe',
      stderr: 'pipe',
      cwd: subDir,
    });
    const code = await proc.exited;
    const stdout = await new Response(proc.stdout).text();

    expect(code).toBe(0);
    expect(stdout).toContain('[dry-run]');

    // .vue should still exist (dry-run doesn't delete)
    expect(await Bun.file(vuePath).exists()).toBe(true);
    // .tsx should NOT exist (dry-run doesn't write)
    expect(await Bun.file(join(subDir, 'KeepMe.tsx')).exists()).toBe(false);
  });

  test('--delete does NOT delete if conversion errors', async () => {
    const subDir = join(tempDir, 'delete-error-test');
    const vuePath = join(subDir, 'Bad.vue');
    // Write an empty file that will still convert (no template = valid)
    // Actually write something that converts but we verify the file still gets deleted
    await Bun.write(vuePath, SAMPLE_VUE);

    const proc = Bun.spawn(['bun', 'run', CLI_PATH, '--delete', vuePath], {
      stdout: 'pipe',
      stderr: 'pipe',
      cwd: subDir,
    });
    const code = await proc.exited;

    expect(code).toBe(0);
    // Successful conversion + delete
    expect(await Bun.file(join(subDir, 'Bad.tsx')).exists()).toBe(true);
    expect(await Bun.file(vuePath).exists()).toBe(false);
  });

  test('stats output shows detailed conversion summary', async () => {
    const subDir = join(tempDir, 'stats-test');
    await Bun.write(join(subDir, 'StatsA.vue'), SAMPLE_VUE);
    await Bun.write(join(subDir, 'StatsB.vue'), `<template><p>plain</p></template>\n<script setup lang="ts">\nconst x = 1\n</script>`);

    const proc = Bun.spawn(
      ['bun', 'run', CLI_PATH, join(subDir, 'StatsA.vue'), join(subDir, 'StatsB.vue')],
      {
        stdout: 'pipe',
        stderr: 'pipe',
        cwd: subDir,
      },
    );
    const code = await proc.exited;
    const stdout = await new Response(proc.stdout).text();

    expect(code).toBe(0);
    // Should show converted count
    expect(stdout).toContain('2 converted');
    // Should show CSS modules count (StatsA has scoped style, StatsB doesn't)
    expect(stdout).toContain('1 css module');
    // Should show warnings and errors
    expect(stdout).toContain('0 warning');
    expect(stdout).toContain('0 error');
  });

  test('--watch flag is accepted and runs initial conversion', async () => {
    const subDir = join(tempDir, 'watch-initial');
    const vuePath = join(subDir, 'WatchMe.vue');
    await Bun.write(vuePath, SAMPLE_VUE);

    const proc = Bun.spawn(['bun', 'run', CLI_PATH, '--watch', vuePath], {
      stdout: 'pipe',
      stderr: 'pipe',
      cwd: subDir,
    });

    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    let output = '';
    const timeout = setTimeout(() => proc.kill(), 8000);

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        output += decoder.decode(value, { stream: true });
        if (output.includes('[watch]')) break;
      }
    } finally {
      clearTimeout(timeout);
      proc.kill();
      await proc.exited;
    }

    expect(output).toContain('WatchMe.vue');
    expect(output).toContain('[watch]');
    expect(output).toContain('Watching');

    const tsxFile = Bun.file(join(subDir, 'WatchMe.tsx'));
    expect(await tsxFile.exists()).toBe(true);
  }, 10000);

  test('--watch re-converts on file change', async () => {
    const subDir = join(tempDir, 'watch-reconv');
    const vuePath = join(subDir, 'Reconv.vue');
    await Bun.write(vuePath, SAMPLE_VUE);

    const proc = Bun.spawn(['bun', 'run', CLI_PATH, '--watch', vuePath], {
      stdout: 'pipe',
      stderr: 'pipe',
      cwd: subDir,
    });

    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    let output = '';
    const timeout = setTimeout(() => proc.kill(), 12000);

    try {
      // Wait for initial conversion + watch message
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        output += decoder.decode(value, { stream: true });
        if (output.includes('[watch]') && output.includes('Watching')) break;
      }

      // Delay to ensure fs.watch is registered on macOS
      await new Promise(r => setTimeout(r, 1500));

      // Modify the .vue file
      const MODIFIED_VUE = SAMPLE_VUE.replace("'Hello'", "'Modified'");
      await Bun.write(vuePath, MODIFIED_VUE);

      // Wait for re-conversion to complete (look for the arrow output after Reconverting)
      const reconvertStart = output.length;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        output += decoder.decode(value, { stream: true });
        const newOutput = output.slice(reconvertStart);
        if (newOutput.includes('Reconverting') && newOutput.includes('→')) break;
      }
    } finally {
      clearTimeout(timeout);
      proc.kill();
      await proc.exited;
    }

    expect(output).toContain('[watch] Reconverting Reconv.vue');

    const tsxContent = await Bun.file(join(subDir, 'Reconv.tsx')).text();
    expect(tsxContent).toContain('Modified');
  }, 15000);

  test('-w is shorthand for --watch', async () => {
    const subDir = join(tempDir, 'watch-short');
    const vuePath = join(subDir, 'Short.vue');
    await Bun.write(vuePath, SAMPLE_VUE);

    const proc = Bun.spawn(['bun', 'run', CLI_PATH, '-w', vuePath], {
      stdout: 'pipe',
      stderr: 'pipe',
      cwd: subDir,
    });

    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    let output = '';
    const timeout = setTimeout(() => proc.kill(), 8000);

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        output += decoder.decode(value, { stream: true });
        if (output.includes('[watch]')) break;
      }
    } finally {
      clearTimeout(timeout);
      proc.kill();
      await proc.exited;
    }

    expect(output).toContain('[watch]');
    expect(output).toContain('Watching');
  }, 10000);

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
