/**
 * Thin abstraction over the Rust napi codegraph module.
 *
 * The napi binary is loaded dynamically so that:
 *   1. The MCP server still starts on platforms without a prebuilt binary —
 *      it falls back to placeholder responses with a warning.
 *   2. TypeScript can type-check without the binary being built yet.
 */

export interface SearchHit {
  symbol: string;
  file: string;
  kind: string;
  snippet: string;
  score: number;
}

export interface FileSummary {
  path: string;
  language: string;
  symbols: Array<{
    name: string;
    kind: string;
    docString?: string | null;
    start: number;
    end: number;
  }>;
}

export interface SymbolMatch {
  name: string;
  kind: string;
  file: string;
  start: number;
  end: number;
}

export interface Reference {
  fromFile: string;
  toSymbol: string;
  toFile: string;
  kind: string;
}

export interface IndexStats {
  files: number;
  symbols: number;
  edges: number;
  skippedUnchanged: number;
}

/** The subset of the Rust napi surface this server uses. */
export interface CodegraphEngine {
  init(dbPath: string): void;
  configureLocalEmbedder?(): void;
  configureProviderEmbedder?(
    endpoint: string,
    model: string,
    dims: number,
    apiKey?: string,
  ): void;
  indexWorkspace(root: string): Promise<IndexStats>;
  reindexFile(path: string): Promise<boolean>;
  embedAll(batchSize: number): Promise<number>;
  buildVectorIndex(): number;
  semanticSearch(
    query: string,
    limit: number,
    scope?: string[],
  ): Promise<SearchHit[]>;
  fileSummary(path: string): FileSummary;
  symbolLookup(query: string, limit: number): SymbolMatch[];
  dependencyTraversal(startFile: string, maxDepth: number): string[];
  impactAnalysis(targetFile: string, maxDepth: number): string[];
  findReferences(symbolName: string): Reference[];
}

export interface EngineConfig {
  dbPath: string;
  /** If set, automatically index this directory at startup. */
  indexRoot?: string;
  embedder?:
    | { kind: 'none' }
    | { kind: 'local' }
    | {
        kind: 'provider';
        endpoint: string;
        model: string;
        dims: number;
        apiKey?: string;
      };
}

let engine: CodegraphEngine | null = null;
let loadAttempted = false;
let loadError: unknown = null;

/**
 * Resolve and initialise the Rust engine. Safe to call multiple times — the
 * first call caches the result. Returns `null` if the binary can't be loaded;
 * callers should fall back to placeholder behaviour.
 */
export async function loadEngine(
  config: EngineConfig,
): Promise<CodegraphEngine | null> {
  if (loadAttempted) return engine;
  loadAttempted = true;

  try {
    // The napi binary is normally installed as an npm dependency. The
    // `CODEGRAPH_NAPI_PATH` env var lets dev workflows point at a local build
    // without packaging through npm.
    const candidates = [
      process.env['CODEGRAPH_NAPI_PATH'],
      '@son-of-anton/codegraph-napi',
    ].filter((c): c is string => typeof c === 'string' && c.length > 0);

    let mod: unknown = null;
    let lastErr: unknown = null;
    for (const c of candidates) {
      try {
        mod = await import(c);
        break;
      } catch (err) {
        lastErr = err;
      }
    }
    if (!mod) throw lastErr ?? new Error('napi module not found');

    engine = mod as CodegraphEngine;
    engine.init(config.dbPath);

    if (config.embedder?.kind === 'local' && engine.configureLocalEmbedder) {
      engine.configureLocalEmbedder();
    } else if (config.embedder?.kind === 'provider' && engine.configureProviderEmbedder) {
      engine.configureProviderEmbedder(
        config.embedder.endpoint,
        config.embedder.model,
        config.embedder.dims,
        config.embedder.apiKey,
      );
    }

    if (config.indexRoot) {
      const stats = await engine.indexWorkspace(config.indexRoot);
      console.error(
        `[codegraph] indexed ${stats.files} files, ${stats.symbols} symbols, ${stats.edges} edges (skipped ${stats.skippedUnchanged} unchanged)`,
      );
    }

    return engine;
  } catch (err) {
    loadError = err;
    engine = null;
    console.error(
      '[codegraph] napi backend unavailable, running in placeholder mode:',
      err,
    );
    return null;
  }
}

export function getEngine(): CodegraphEngine | null {
  return engine;
}

export function getLoadError(): unknown {
  return loadError;
}

export function placeholder(toolName: string, args: unknown): unknown {
  return {
    placeholder: true,
    tool: toolName,
    note: 'codegraph backend not loaded; tool returned a placeholder',
    args,
  };
}
