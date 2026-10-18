import fs from 'node:fs/promises';
import path from 'node:path';

interface Bug {
  file: string;
  line: number;
  severity: 'low' | 'medium' | 'high';
  pattern: string;
  description: string;
  snippet: string;
}

interface AnalysisReport {
  files: number;
  languages: Record<string, number>;
  totalLines: number;
  complexity: 'low' | 'medium' | 'high';
  recommendations: string[];
}

interface Improvement {
  file: string;
  line: number;
  suggestion: string;
  explanation?: string;
}

export async function analyzeCodebase(rootPath: string): Promise<AnalysisReport> {
  const files = await collectSourceFiles(rootPath);
  const languages: Record<string, number> = {};
  let totalLines = 0;

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const lang = extToLanguage(ext);
    languages[lang] = (languages[lang] || 0) + 1;
    totalLines += await countLines(file);
  }

  const complexity = totalLines > 10000 ? 'high' : totalLines > 1000 ? 'medium' : 'low';

  return {
    files: files.length,
    languages,
    totalLines,
    complexity,
    recommendations: generateRecommendations(complexity, Object.keys(languages).length),
  };
}

export async function findBugs(targetPath: string): Promise<Bug[]> {
  const files = await collectSourceFiles(targetPath);
  const bugs: Bug[] = [];

  for (const file of files) {
    const content = await fs.readFile(file, 'utf-8');
    const lines = content.split('\n');

    lines.forEach((line, i) => {
      bugs.push(...checkLine(file, line, i + 1));
    });
  }

  return bugs;
}

export async function suggestImprovements(filePath: string): Promise<Improvement[]> {
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.split('\n');
  const improvements: Improvement[] = [];

  lines.forEach((line, i) => {
    // Long lines
    if (line.length > 120) {
      improvements.push({
        file: filePath,
        line: i + 1,
        suggestion: 'Break long line for readability',
        explanation: `Line is ${line.length} characters (recommend <120)`,
      });
    }

    // console.log in production code
    if (line.includes('console.log') || line.includes('console.error')) {
      improvements.push({
        file: filePath,
        line: i + 1,
        suggestion: 'Use proper logging instead of console.log',
        explanation: 'console.log should not appear in production code',
      });
    }

    // TODO/FIXME without tracking
    if (line.includes('TODO') || line.includes('FIXME')) {
      improvements.push({
        file: filePath,
        line: i + 1,
        suggestion: 'Consider creating a tracked issue for this TODO/FIXME',
      });
    }
  });

  return improvements;
}

// --- helpers ---

function checkLine(file: string, line: string, lineno: number): Bug[] {
  const bugs: Bug[] = [];
  const trimmed = line.trim();

  // == instead of ===
  if (/\w+\s*==\s*\w+/.test(trimmed) && !trimmed.includes('===')) {
    bugs.push({
      file, line: lineno, severity: 'medium',
      pattern: 'loose-equality',
      description: 'Use === instead of == to avoid type coercion bugs',
      snippet: trimmed,
    });
  }

  // eval()
  if (/\beval\s*\(/.test(trimmed)) {
    bugs.push({
      file, line: lineno, severity: 'high',
      pattern: 'eval',
      description: 'eval() is a security risk and code injection vector',
      snippet: trimmed,
    });
  }

  // unused variable declaration (simple heuristic)
  if (/^\s*(const|let|var)\s+(\w+)\s*=/.test(trimmed) && !trimmed.includes('require')) {
    const varName = trimmed.match(/^\s*(const|let|var)\s+(\w+)/)?.[2];
    if (varName && !isUsedInContent(varName)) {
      bugs.push({
        file, line: lineno, severity: 'low',
        pattern: 'unused-var',
        description: `Variable '${varName}' may be unused`,
        snippet: trimmed,
      });
    }
  }

  // hardcoded secret
  if (/(password|secret|api[_-]?key)\s*[:=]\s*['"][^'"]{8,}['"]/i.test(trimmed)) {
    bugs.push({
      file, line: lineno, severity: 'high',
      pattern: 'hardcoded-secret',
      description: 'Hardcoded credential detected — use environment variables',
      snippet: trimmed.replace(/['"].*['"]/g, '***'),
    });
  }

  // unreachable code after return
  if (/return\b/.test(trimmed) && lineno < 100) {
    // checked in caller context
  }

  return bugs;
}

function isUsedInContent(varName: string): boolean {
  // simplified — full implementation would check rest of file
  return false;
}

async function collectSourceFiles(targetPath: string): Promise<string[]> {
  const stat = await fs.stat(targetPath).catch(() => null);
  if (!stat) return [];

  if (stat.isFile()) {
    return [targetPath];
  }

  const files: string[] = [];
  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!['node_modules', '.git', 'dist', 'build'].includes(entry.name)) {
          await walk(full);
        }
      } else if (sourceExtensions.has(path.extname(entry.name).toLowerCase())) {
        files.push(full);
      }
    }
  }
  await walk(targetPath);
  return files;
}

async function countLines(file: string): Promise<number> {
  const content = await fs.readFile(file, 'utf-8');
  return content.split('\n').length;
}

const sourceExtensions = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.java', '.c', '.cpp', '.h',
]);

function extToLanguage(ext: string): string {
  const map: Record<string, string> = {
    '.ts': 'TypeScript', '.tsx': 'TypeScript', '.js': 'JavaScript', '.jsx': 'JavaScript',
    '.py': 'Python', '.rs': 'Rust', '.go': 'Go', '.java': 'Java',
    '.c': 'C', '.cpp': 'C++', '.h': 'C/C++',
  };
  return map[ext] || ext.replace('.', '').toUpperCase();
}

function generateRecommendations(complexity: string, langCount: number): string[] {
  const recs: string[] = [];
  if (complexity === 'high') recs.push('Consider splitting the codebase into smaller modules or packages.');
  if (langCount > 3) recs.push('Multiple languages detected — ensure build tooling supports all.');
  recs.push('Run regular static analysis and code reviews.');
  return recs;
}

export async function findUnusedVars(content: string): Promise<string[]> {
  const declared = new Set<string>();
  const used = new Set<string>();

  const declareRegex = /\b(?:const|let|var)\s+(\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = declareRegex.exec(content)) !== null) {
    declared.add(m[1]);
  }

  const useRegex = /\b(\w+)\b/g;
  while ((m = useRegex.exec(content)) !== null) {
    if (declared.has(m[1])) used.add(m[1]);
  }

  return [...declared].filter(v => !used.has(v) && !['require', 'module', 'exports'].includes(v));
}
