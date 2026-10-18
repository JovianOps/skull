# skull

An MCP (Model Context Protocol) server for Claude Desktop that provides codebase analysis, bug detection, and improvement suggestions.

## Quick Start

### Prerequisites
- [Claude Desktop](https://claude.ai/download)
- Node.js 20+
- npm

### Install as Claude Desktop Extension

1. Build the server:
```bash
npm install
npm run build
```

2. In Claude Desktop: **Settings → Extensions → Install Extension…**
   - Select `skull.mcpb`
   - Click "Install"

3. In a conversation with Claude, use tools:
   - `analyze_codebase` — get project health metrics
   - `find_bugs` — scan for common bug patterns
   - `suggest_improvements` — get refactoring suggestions
   - Access resources via `@skull/project/structure`, `@skull/project/dependencies`, `@skull/project/metrics`

### Manual Configuration

Add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "skull": {
      "command": "node",
      "args": ["/path/to/skull/dist/index.js"]
    }
  }
}
```

## Tools

### `analyze_codebase`
Analyze a project directory for overall health, structure, and complexity metrics.

**Input:**
- `path` (string, required): Absolute path to project root

### `find_bugs`
Scan source files for common bug patterns (null derefs, unused vars, security issues).

**Input:**
- `path` (string, required): Absolute path to file or directory

### `suggest_improvements`
Get improvement suggestions for a source file.

**Input:**
- `path` (string, required): Absolute path to source file

## Development

```bash
npm install        # install deps
npm run dev        # run in dev mode with tsx
npm test           # run tests
npm run build      # compile to dist/
```

## Architecture

- **src/index.ts** — MCP server entry point, tool/resource registration
- **src/analysis.ts** — Bug detection and codebase analysis logic
- **src/resources.ts** — File tree and dependency extraction

## License

MIT
