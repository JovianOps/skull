import fs from 'node:fs/promises';
import type { Dirent, Stats } from 'node:fs';
import path from 'node:path';

interface ProjectResource {
  uri: string;
  name: string;
  mimeType: string;
  description?: string;
}

export async function listProjectResources(): Promise<ProjectResource[]> {
  return [
    {
      uri: 'skull://project/structure',
      name: 'Project Structure',
      mimeType: 'application/json',
      description: 'Tree view of the project directory',
    },
    {
      uri: 'skull://project/dependencies',
      name: 'Dependencies',
      mimeType: 'application/json',
      description: 'package.json, Cargo.toml, go.mod, etc.',
    },
    {
      uri: 'skull://project/metrics',
      name: 'Code Metrics',
      mimeType: 'application/json',
      description: 'Lines of code, file counts, complexity by language',
    },
  ];
}

export async function readProjectResource(uri: string): Promise<{ uri: string; text: string; mimeType: string }> {
  const root = process.cwd();

  switch (uri) {
    case 'skull://project/structure': {
      const tree = await buildFileTree(root);
      return { uri, text: JSON.stringify(tree, null, 2), mimeType: 'application/json' };
    }
    case 'skull://project/dependencies': {
      const deps = await extractDependencies(root);
      return { uri, text: JSON.stringify(deps, null, 2), mimeType: 'application/json' };
    }
    case 'skull://project/metrics': {
      const metrics = await computeMetrics(root);
      return { uri, text: JSON.stringify(metrics, null, 2), mimeType: 'application/json' };
    }
    default:
      throw new Error(`Unknown resource URI: ${uri}`);
  }
}

interface FileNode {
  name: string;
  path: string;
  type: 'file' |'directory';
  children?: FileNode[];
  size?: number;
}

async function buildFileTree(root: string): Promise<FileNode[]> {
  const rootStat = await fs.stat(root);
  return [await buildNode(root, rootStat, root, 3)];
}

async function buildNode(
  p: string,
  stat: Dirent | Stats,
  base: string,
  depth: number,
): Promise<FileNode> {
  const name = path.basename(p);
  const node: FileNode = {
    name,
    path: path.relative(base, p) || '.',
    type: stat.isDirectory() ? 'directory' : 'file',
  };

  if (stat.isDirectory() && depth > 0 && !['node_modules', '.git'].includes(name)) {
    try {
      const entries = await fs.readdir(p, { withFileTypes: true });
      node.children = [];
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        try {
          const childPath = path.join(p, entry.name);
          node.children.push(await buildNode(childPath, entry, base, depth - 1));
        } catch {
          // skip unreadable entries
        }
      }
    } catch {
      // permission denied etc
    }
  } else if (stat.isFile()) {
    node.size = 'size' in stat ? stat.size : 0;
  }

  return node;
}

async function extractDependencies(root: string): Promise<Record<string, unknown>> {
  const deps: Record<string, unknown> = {};

  try {
    const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf-8'));
    deps['npm'] = { ...pkg.dependencies, ...pkg.devDependencies };
  } catch {
    deps['npm'] = null;
  }

  try {
    const cargos = await fs.readFile(path.join(root, 'Cargo.toml'), 'utf-8');
    deps['cargo'] = cargos;
  } catch {
    deps['cargo'] = null;
  }

  try {
    const goMod = await fs.readFile(path.join(root, 'go.mod'), 'utf-8');
    deps['go'] = goMod;
  } catch {
    deps['go'] = null;
  }

  return deps;
}

async function computeMetrics(root: string): Promise<Record<string, unknown>> {
  const metrics: Record<string, unknown> = { files: 0, totalLines: 0, byLanguage: {} };
  let files = 0;
  let totalLines = 0;
  const byLanguage: Record<string, { files: number; lines: number }> = {};

  async function walk(dir: string, depth: number = 0) {
    if (depth > 5) return;
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (['node_modules', '.git', 'dist', 'build', '.venv'].includes(entry.name)) continue;
        await walk(full, depth + 1);
      } else if (entry.isFile()) {
        files++;
        const ext = path.extname(entry.name).toLowerCase();
        try {
          const content = await fs.readFile(full, 'utf-8');
          const lines = content.split('\n').length;
          totalLines += lines;

          const lang = extToLanguage(ext);
          if (!byLanguage[lang]) byLanguage[lang] = { files: 0, lines: 0 };
          byLanguage[lang].files++;
          byLanguage[lang].lines += lines;
        } catch {
          // binary file or unreadable
        }
      }
    }
  }

  await walk(root);
  metrics.files = files;
  metrics.totalLines = totalLines;
  metrics.byLanguage = byLanguage;
  return metrics;
}

function extToLanguage(ext: string): string {
  const map: Record<string, string> = {
    '.ts': 'TypeScript', '.tsx': 'TypeScript', '.js': 'JavaScript', '.jsx': 'JavaScript',
    '.py': 'Python', '.rs': 'Rust', '.go': 'Go', '.java': 'Java',
    '.c': 'C', '.cpp': 'C++', '.h': 'C/C++', '.lua': 'Lua',
  };
  return map[ext] || ext.replace('.', '').toUpperCase();
}
