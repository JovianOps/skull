#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { analyzeCodebase, findBugs, suggestImprovements } from './analysis.js';
import { listProjectResources, readProjectResource } from './resources.js';

const server = new Server(
  {
    name: 'skull',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'analyze_codebase',
        description: 'Analyze a project directory for overall health, structure, and complexity metrics.',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Absolute path to the project root to analyze.',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'find_bugs',
        description: 'Scan source files for common bug patterns (null derefs, unused vars, etc.).',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Absolute path to a file or directory to scan.',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'suggest_improvements',
        description: 'Get improvement suggestions for a source file (refactoring, style, performance).',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Absolute path to the source file to analyze.',
            },
          },
          required: ['path'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const path = args?.path;

  if (!path || typeof path !== 'string') {
    throw new Error('path argument is required and must be a string');
  }

  try {
    switch (name) {
      case 'analyze_codebase':
        return {
          content: [{ type: 'text', text: JSON.stringify(await analyzeCodebase(path), null, 2) }],
        };
      case 'find_bugs':
        return {
          content: [{ type: 'text', text: JSON.stringify(await findBugs(path), null, 2) }],
        };
      case 'suggest_improvements':
        return {
          content: [{ type: 'text', text: JSON.stringify(await suggestImprovements(path), null, 2) }],
        };
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: await listProjectResources(),
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  return {
    contents: [await readProjectResource(uri)],
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('skull MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
