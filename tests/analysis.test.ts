import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { analyzePath, checkLine, Bug } from '../src/analysis.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

describe('analyzePath', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skull-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('analyzes a directory for bugs', async () => {
    await fs.writeFile(path.join(tmpDir, 'test.js'), 'const x = "1";\nif (x == 1) { console.log("match"); }\n');
    await fs.writeFile(path.join(tmpDir, 'eval-test.js'), 'const result = eval("1 + 2");\n');

    const report = await analyzePath(tmpDir);
    expect(report.files).toBe(2);
    expect(report.bugs.some(b => b.pattern === 'loose-equality')).toBe(true);
    expect(report.bugs.some(b => b.pattern === 'eval')).toBe(true);
    expect(report.bugs.length).toBeGreaterThan(0);
  });

  it('counts languages and lines', async () => {
    await fs.mkdir(path.join(tmpDir, 'sub'));
    await fs.writeFile(path.join(tmpDir, 'a.ts'), 'const a = 1;\n');
    await fs.writeFile(path.join(tmpDir, 'sub', 'b.py'), 'print("hello")\n');

    const report = await analyzePath(tmpDir);
    expect(report.languages.TypeScript).toBe(1);
    expect(report.languages.Python).toBe(1);
    expect(report.totalLines).toBeGreaterThanOrEqual(2);
  });

  it('skips excluded directories', async () => {
    await fs.mkdir(path.join(tmpDir, 'node_modules'));
    await fs.writeFile(path.join(tmpDir, 'node_modules', 'dep.js'), 'const x = eval("bad");\n');
    await fs.writeFile(path.join(tmpDir, 'app.js'), 'const y = 1;\n');

    const report = await analyzePath(tmpDir);
    expect(report.files).toBe(1);
    expect(report.bugs.some(b => b.pattern === 'eval')).toBe(false);
  });

  it('produces a summary', async () => {
    await fs.writeFile(path.join(tmpDir, 'bad.js'), 'const x = eval("test");\n');

    const report = await analyzePath(tmpDir);
    expect(report.summary.length).toBeGreaterThan(0);
    expect(report.summary.some(s => s.includes('high-severity'))).toBe(true);
  });
});

describe('checkLine', () => {
  it('detects loose equality (== instead of ===)', () => {
    const bugs = checkLine('test.js', 'if (x == 1) {', 1);
    expect(bugs.some(b => b.pattern === 'loose-equality' && b.severity === 'medium')).toBe(true);
  });

  it('detects eval() usage', () => {
    const bugs = checkLine('test.js', 'const result = eval("1 + 2");', 10);
    expect(bugs.some(b => b.pattern === 'eval' && b.severity === 'high')).toBe(true);
  });

  it('detects hardcoded secrets', () => {
    const bugs = checkLine('test.js', 'const apiKey = "sk-abc123def456ghi789jkl";', 5);
    expect(bugs.some(b => b.pattern === 'hardcoded-secret' && b.severity === 'high')).toBe(true);
  });

  it('detects untracked TODO/FIXME', () => {
    const bugs = checkLine('test.ts', '// TODO: fix this later', 3);
    expect(bugs.some(b => b.pattern === 'untracked-todo')).toBe(true);
  });

  it('ignores comments with ==', () => {
    const bugs = checkLine('test.js', '// see x == y', 1);
    expect(bugs.some(b => b.pattern === 'loose-equality')).toBe(false);
  });

  it('ignores == inside a trailing line comment', () => {
    const bugs = checkLine('test.js', 'x == y; // x == y', 1);
    expect(bugs.some(b => b.pattern === 'loose-equality')).toBe(false);
  });

  it('ignores === comparison (strict)', () => {
    const bugs = checkLine('test.js', 'if (x === 1) {', 1);
    expect(bugs.some(b => b.pattern === 'loose-equality')).toBe(false);
  });

  it('ignores != and !==', () => {
    const bugs = checkLine('test.js', 'if (x != 1) { if (y !== 2) {}', 1);
    expect(bugs.some(b => b.pattern === 'loose-equality')).toBe(false);
  });
});
