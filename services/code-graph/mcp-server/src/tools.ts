import type { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * The 6 MCP tool definitions exposed by the codegraph backend.
 *
 * Schema shapes match the orchestrator's expectations as described in
 * `plan.md`. Changes here are observable to anyone calling the MCP server.
 */
export const TOOLS: Tool[] = [
  {
    name: 'semantic_search',
    description:
      'Semantic search over indexed source symbols using vector embeddings. Returns top-K matches with code snippets.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural-language query, e.g. "where is the database connection opened".',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of hits to return.',
          default: 10,
        },
        scope: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional path prefixes; results outside these prefixes are filtered out.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'file_summary',
    description:
      "Return the symbol outline (functions, classes, types) of a single file.",
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute or repo-relative path.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'symbol_lookup',
    description: 'Find symbols by name. Exact matches rank first.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number', default: 20 },
      },
      required: ['query'],
    },
  },
  {
    name: 'dependency_traversal',
    description:
      'Walk outgoing call edges from a file up to N hops. Returns the set of files reachable.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        depth: { type: 'number', default: 3 },
      },
      required: ['path'],
    },
  },
  {
    name: 'impact_analysis',
    description:
      'Reverse traversal — which files would be affected if this file changed.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        depth: { type: 'number', default: 3 },
      },
      required: ['path'],
    },
  },
  {
    name: 'find_references',
    description: 'Find every edge that targets a symbol with the given name.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
      required: ['name'],
    },
  },
];
