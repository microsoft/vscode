#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  type CodegraphEngine,
  type EngineConfig,
  loadEngine,
  placeholder,
} from './engine.js';
import { TOOLS } from './tools.js';

interface CliArgs {
  db: string;
  backend: 'embedded' | 'docker';
  indexRoot?: string;
  embedder: EngineConfig['embedder'];
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {
    db: process.env.CODE_GRAPH_DB ?? './codegraph.db',
    backend: 'embedded',
    embedder: { kind: 'none' },
  };

  for (const arg of argv) {
    if (arg.startsWith('--db=')) out.db = arg.slice('--db='.length);
    else if (arg.startsWith('--backend=')) {
      const v = arg.slice('--backend='.length);
      if (v === 'embedded' || v === 'docker') out.backend = v;
    } else if (arg.startsWith('--index-root=')) {
      out.indexRoot = arg.slice('--index-root='.length);
    } else if (arg === '--local-embedder') {
      out.embedder = { kind: 'local' };
    } else if (arg.startsWith('--provider-embedder=')) {
      // Format: --provider-embedder=ENDPOINT|MODEL|DIMS[|API_KEY]
      const parts = arg.slice('--provider-embedder='.length).split('|');
      if (parts.length >= 3) {
        out.embedder = {
          kind: 'provider',
          endpoint: parts[0]!,
          model: parts[1]!,
          dims: parseInt(parts[2]!, 10),
          apiKey: parts[3],
        };
      }
    }
  }
  return out;
}

async function dispatch(
  engine: CodegraphEngine,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case 'semantic_search': {
      const query = String(args['query'] ?? '');
      const limit = Number(args['limit'] ?? 10);
      const scope = Array.isArray(args['scope']) ? (args['scope'] as string[]) : undefined;
      return await engine.semanticSearch(query, limit, scope);
    }
    case 'file_summary':
      return engine.fileSummary(String(args['path']));
    case 'symbol_lookup': {
      const query = String(args['query'] ?? '');
      const limit = Number(args['limit'] ?? 20);
      return engine.symbolLookup(query, limit);
    }
    case 'dependency_traversal': {
      const path = String(args['path'] ?? '');
      const depth = Number(args['depth'] ?? 3);
      return engine.dependencyTraversal(path, depth);
    }
    case 'impact_analysis': {
      const path = String(args['path'] ?? '');
      const depth = Number(args['depth'] ?? 3);
      return engine.impactAnalysis(path, depth);
    }
    case 'find_references':
      return engine.findReferences(String(args['name'] ?? ''));
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Docker backend is not implemented on the napi side; we still load
  // placeholders so the server stays JSON-RPC compatible.
  const engine =
    args.backend === 'embedded'
      ? await loadEngine({
          dbPath: args.db,
          indexRoot: args.indexRoot,
          embedder: args.embedder,
        })
      : null;

  const server = new Server(
    { name: 'codegraph', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: toolArgs = {} } = req.params;

    if (!engine) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(placeholder(name, toolArgs), null, 2),
          },
        ],
      };
    }

    try {
      const result = await dispatch(engine, name, toolArgs as Record<string, unknown>);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: `tool ${name} failed: ${(err as Error).message}`,
          },
        ],
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(
    `[codegraph] mcp server ready (backend=${args.backend}, engine=${engine ? 'loaded' : 'placeholder'})`,
  );
}

main().catch((err) => {
  console.error('[codegraph] fatal:', err);
  process.exit(1);
});
