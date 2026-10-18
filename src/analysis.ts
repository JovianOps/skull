import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';

export interface Bug {
  file: string;
  line: number;
  severity: 'low' | 'medium' | 'high';
  pattern: string;
  message: string;
  snippet: string;
}

export interface AnalysisReport {
  files: number;
  totalLines: number;
  languages: Record<string, number>;
  bugs: Bug[];
  summary: string[];
}

// --- public API ---

export async function analyzePath(target: string): Promise<AnalysisReport> {
  const files = await collectSourceFiles(target);
  const bugs: Bug[] = [];
  let totalLines = 0;
  const languages: Record<string, number> = {};

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const lang = extToLanguage(ext);
    languages[lang] = (languages[lang] || 0) + 1;

    const content = await fs.readFile(file, 'utf-8');
    totalLines += content.split('\n').length;

    bugs.push(...scanFile(file, content));
  }

  return {
    files: files.length,
    totalLines,
    languages,
    bugs,
    summary: generateSummary(bugs),
  };
}

// --- scanning logic ---

function scanFile(file: string, content: string): Bug[] {
  const bugs: Bug[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineno = i + 1;
    bugs.push(...checkLine(file, line, lineno));
  }

  return bugs.filter(b => b !== null);
}

function checkLine(file: string, line: string, lineno: number): Bug[] {
  const bugs: Bug[] = [];
  const trimmed = line.trim();

  // == instead of ===
  const eqMatch = trimmed.match(/\w+\s*==\s*\w+/);
  if (eqMatch && !trimmed.includes('===') && !trimmed.includes('!=')
    && !trimmed.startsWith('//') && !trimmed.startsWith('*')
    && !inString(trimmed, eqMatch)) {
    bugs.push(mkBug(file, lineno, 'medium', 'loose-equality',
      'Use === instead of == to avoid type coercion bugs', trimmed));
  }

  // eval()
  const evalMatch = trimmed.match(/\beval\s*\(/);
  if (evalMatch && !trimmed.startsWith('//') && !trimmed.startsWith('*')
    && !inString(trimmed, evalMatch)) {
    bugs.push(mkBug(file, lineno, 'high', 'eval',
      'eval() is a security risk and code injection vector', trimmed));
  }

  // hardcoded secrets
  const secretMatch = trimmed.match(/(password|secret|api[_-]?key|token)\s*[=:]\s*['"][^'"]{8,}['"]/i);
  if (secretMatch && !trimmed.startsWith('//') && !inString(trimmed, secretMatch)) {
    bugs.push(mkBug(file, lineno, 'high', 'hardcoded-secret',
      'Hardcoded credential detected — use environment variables',
      trimmed.replace(/['"][^'"]+['"]/g, '***')));
  }

  // TODO/FIXME without tracking reference
  const todoMatch = trimmed.match(/(TODO|FIXME)\s*:/);
  if (todoMatch && !trimmed.startsWith('*') && !inString(trimmed, todoMatch)) {
    bugs.push(mkBug(file, lineno, 'low', 'untracked-todo',
      'TODO/FIXME without a tracking reference — create an issue or ticket', trimmed));
  }

  return bugs;
}

/** Returns true if the regex match occurs inside a string literal. */
function inString(line: string, match: RegExpMatchArray): boolean {
  const before = line.substring(0, match.index);
  const quoteCount = (before.match(/['"]/g) || []).length;
  return quoteCount % 2 !== 0;
}

function mkBug(
  file: string, lineno: number, severity: Bug['severity'],
  pattern: string, message: string, snippet: string,
): Bug {
  return { file, line: lineno, severity, pattern, message, snippet: snippet.slice(0, 120) };
}

// --- helpers ---

export async function collectSourceFiles(target: string): Promise<string[]> {
  const stat = await fs.stat(target).catch(() => null);
  if (!stat) return [];
  if (stat.isFile()) return [target];

  const files: string[] = [];
  async function walk(dir: string, depth: number = 0) {
    if (depth > 8) return;
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (['node_modules', '.git', 'dist', 'build', '.venv', '__pycache__'].includes(entry.name)) continue;
        await walk(full, depth + 1);
      } else if (sourceExtensions.has(path.extname(entry.name).toLowerCase())) {
        files.push(full);
      }
    }
  }
  await walk(target);
  return files;
}

const sourceExtensions = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rs', '.go', '.java', '.c', '.cpp', '.h', '.hpp',
  '.php', '.rb', '.lua', '.sh', '.bash',
]);

function extToLanguage(ext: string): string {
  const map: Record<string, string> = {
    '.ts': 'TypeScript', '.tsx': 'TypeScript', '.js': 'JavaScript', '.jsx': 'JavaScript',
    '.mjs': 'JavaScript', '.cjs': 'JavaScript', '.py': 'Python', '.rs': 'Rust',
    '.go': 'Go', '.java': 'Java', '.c': 'C', '.cpp': 'C++', '.h': 'C/C++', '.hpp': 'C++',
    '.php': 'PHP', '.rb': 'Ruby', '.lua': 'Lua', '.sh': 'Shell', '.bash': 'Shell',
  };
  return map[ext] || ext.replace('.', '').toUpperCase();
}

function generateSummary(bugs: Bug[]): string[] {
  const summary: string[] = [];
  const bySeverity = { high: 0, medium: 0, low: 0 };
  const byPattern: Record<string, number> = {};

  for (const bug of bugs) {
    bySeverity[bug.severity]++;
    byPattern[bug.pattern] = (byPattern[bug.pattern] || 0) + 1;
  }

  if (bySeverity.high > 0) summary.push(`⚠️ ${bySeverity.high} high-severity issues`);
  if (bySeverity.medium > 0) summary.push(`⚡ ${bySeverity.medium} medium-severity issues`);
  if (bySeverity.low > 0) summary.push(`ℹ️ ${bySeverity.low} low-severity issues`);

  for (const [pattern, count] of Object.entries(byPattern)) {
    summary.push(`${count}× ${pattern}`);
  }

  return summary.length > 0 ? summary : ['✓ No issues found'];
}

// Export for testing
export { checkLine };
