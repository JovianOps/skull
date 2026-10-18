import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { findBugs } from '../src/analysis.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

describe('findBugs', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skull-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('detects loose equality (== instead of ===)', async () => {
    const file = path.join(tmpDir, 'test.js');
    await fs.writeFile(file, 'const x = "1";\nif (x == 1) { console.log("match"); }\n');

    const bugs = await findBugs(file);
    expect(bugs.some(b => b.pattern === 'loose-equality')).toBe(true);
  });

  it('detects eval() usage', async () => {
    const file = path.join(tmpDir, 'eval-test.js');
    await fs.writeFile(file, 'const result = eval("1 + 2");\n');

    const bugs = await findBugs(file);
    expect(bugs.some(b => b.pattern === 'eval' && b.severity === 'high')).toBe(true);
  });

  it('detects hardcoded secrets', async () => {
    const file = path.join(tmpDir, 'secret-test.js');
    await fs.writeFile(file, 'const apiKey = "sk-abc123def456ghi789jkl";\n');

    const bugs = await findBugs(file);
    expect(bugs.some(b => b.pattern === 'hardcoded-secret')).toBe(true);
  });

  it('handles directory scanning', async () => {
    await fs.writeFile(path.join(tmpDir, 'a.js'), 'console.log("==");\n');
    await fs.mkdir(path.join(tmpDir, 'sub'));
    await fs.writeFile(path.join(tmpDir, 'sub', 'b.js'), 'var x = eval("test");\n');

    const bugs = await findBugs(tmpDir);
    expect(bugs.length).toBeGreaterThan(0);
    expect(bugs.some(b => b.pattern === 'eval')).toBe(true);
  });
});
