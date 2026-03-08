# Code Graph Indexing — Validation Results

## Date: 2026-03-08

## Pipeline Overview

| Layer | Service | Status | Description |
|-------|---------|--------|-------------|
| Tree-sitter | `services/indexer` | Implemented | AST parsing, symbol extraction, graph + embedding writes |
| LSIF/SCIP | `services/lsif` | Implemented | Cross-file reference resolution, type hierarchy |
| FalkorDB | `docker-compose.yml` | Configured | Graph database with indexed schema |
| Qdrant | `docker-compose.yml` | Configured | Vector database for semantic search |

## Completeness Checklist

### File discovery
- [x] Recursive directory scanning with configurable root path
- [x] Language-aware file filtering by extension
- [x] Skips non-source directories (`node_modules`, `.git`, `dist`, `build`, `out`, `__pycache__`, `target`)

### Symbol extraction (Tree-sitter)
- [x] Functions: name, qualified name, line range, parameters, return type, async flag, export status
- [x] Classes: name, line range, abstract flag, extends, implements, methods
- [x] Interfaces/types/enums: name, line range, kind, export status
- [x] Imports: source module, specifiers, default/namespace flags
- [x] Exports: symbol name, default flag
- [x] Arrow functions: detected as functions with correct metadata
- [x] Call sites: caller/callee resolution within file scope

### Language support
- [x] TypeScript / TSX
- [x] JavaScript / JSX / MJS / CJS
- [x] Python
- [ ] Rust (grammar package declared, extractor pending)
- [ ] C# (grammar package pending)
- [ ] C/C++ (grammar package pending)

### FalkorDB graph
- [x] File nodes with path, language, hash, line count
- [x] Function nodes with full metadata
- [x] Class nodes with extends/implements relationships
- [x] Type nodes (interface, type alias, enum)
- [x] Import nodes with source and specifiers
- [x] CONTAINS edges (File → Symbol)
- [x] EXPORTS edges (File → Symbol)
- [x] IMPORTS edges (File → File)
- [x] CALLS edges (Function → Function)
- [x] EXTENDS edges (Class → Class)
- [x] IMPLEMENTS edges (Class → Type)
- [x] HAS_METHOD edges (Class → Function)
- [x] RETURNS edges (Function → Type)
- [x] ACCEPTS edges (Function → Type)
- [x] REFERENCES edges (from LSIF/SCIP)
- [x] All indices created per schema

### LSIF/SCIP pipeline
- [x] Runner with tool discovery for TypeScript, Python, Rust, C#, C/C++
- [x] LSIF JSONL parser with vertex/edge graph reconstruction
- [x] SCIP JSON parser with symbol/occurrence extraction
- [x] Cross-reference graph writer (REFERENCES, CALLS edges)
- [x] Type hierarchy writer (EXTENDS, IMPLEMENTS edges)
- [x] Snapshot persistence for fast warm-start

### Qdrant embeddings
- [x] Collection auto-creation with cosine distance
- [x] Payload indices on filePath, chunkType, language, symbolName
- [x] Language-aware chunking (functions, classes, types, imports)
- [x] Class methods as separate chunks when > 10 lines
- [x] Merkle-tree hash-based skip for unchanged chunks
- [x] Batch embedding with configurable batch size
- [x] Mock embedding provider for development/testing
- [x] Pluggable embedding provider interface

### Incremental updates
- [x] Content hash tracking per file (SHA-256)
- [x] Chokidar file watcher with debounce
- [x] Re-parse only changed files
- [x] Delete old graph data before re-indexing a file
- [x] Skip re-embedding if chunk hash unchanged

### Error tolerance
- [x] Partial parse handling (Tree-sitter error recovery)
- [x] Per-file error catching (doesn't crash the indexer)
- [x] LSIF tool not-found handling (skips unavailable languages)
- [x] Database reconnection strategy (exponential backoff)

### HTTP API
**Indexer service (port 8080):**
- [x] `GET /health` — status, files indexed, last update, indexing flag
- [x] `GET /stats` — full stats including graph node/edge counts and Qdrant point count
- [x] `POST /reindex` — trigger full reindex (returns 409 if already running)
- [x] `POST /reindex/:path` — reindex a specific file

**LSIF service (port 8081):**
- [x] `GET /health` — status, pipeline running flag, last run time
- [x] `GET /stats` — full pipeline stats per language
- [x] `POST /run` — trigger full LSIF/SCIP pipeline
- [x] `POST /run/:language` — trigger pipeline for a specific language

## Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Full project parse (100K lines) | < 2s | Requires native tree-sitter bindings |
| Incremental update (single file) | < 200ms | With hash-based skip and debounce |
| Graph query (impact analysis) | < 500ms | Depends on FalkorDB index performance |
| Semantic search query | < 200ms | Depends on Qdrant HNSW performance |

## Sample Validation Queries

Once data is loaded, run these Cypher queries to validate the graph:

```cypher
-- Q1: What does this function call?
MATCH (f:Function {name: 'validateToken'})-[:CALLS]->(called:Function)
RETURN called.name, called.file

-- Q2: What calls this function? (impact analysis)
MATCH (caller:Function)-[:CALLS]->(f:Function {name: 'validateToken'})
RETURN caller.name, caller.file

-- Q3: Blast radius of changing a file
MATCH (f:File {path: '/src/auth/service.ts'})<-[:IMPORTS*1..3]-(dependent:File)
RETURN dependent.path

-- Q4: File exports
MATCH (f:File {path: '/src/auth/index.ts'})-[:EXPORTS]->(sym)
RETURN labels(sym)[0] AS type, sym.name

-- Q5: Module structural summary
MATCH (m:Module {name: 'auth'})<-[:BELONGS_TO]-(f:File)-[:CONTAINS]->(sym)
RETURN f.path, labels(sym)[0] AS type, sym.name, sym.exported

-- Q6: All implementations of an interface
MATCH (cls:Class)-[:IMPLEMENTS]->(iface:Type {name: 'IAuthProvider'})
RETURN cls.name, cls.file

-- Q7: Full call graph (2 levels)
MATCH path = (f:Function {name: 'handleRequest'})-[:CALLS*1..2]->(called:Function)
RETURN path

-- Q8: Unused exports
MATCH (f:File)-[:EXPORTS]->(sym)
WHERE NOT exists((sym)<-[:REFERENCES]-())
  AND NOT exists((sym)<-[:CALLS]-())
RETURN labels(sym)[0] AS type, sym.name, f.path

-- Q9: Circular file dependencies
MATCH path = (a:File)-[:IMPORTS*2..5]->(a)
RETURN [n IN nodes(path) | n.path] AS cycle

-- Q10: Function parameters with types
MATCH (f:Function {name: 'createUser'})-[:ACCEPTS]->(paramType:Type)
RETURN f.signature, paramType.name
```

## Integration Test Plan

### Prerequisites
```bash
docker compose up -d falkordb qdrant
```

### Step 1: Verify databases
```bash
# FalkorDB
docker compose exec falkordb redis-cli GRAPH.QUERY son-of-anton "RETURN 1"

# Qdrant
curl http://localhost:6333/readyz
```

### Step 2: Run indexer against test project
```bash
cd services/indexer && npm run build && \
PROJECT_PATH=/path/to/test-project \
FALKORDB_HOST=localhost \
QDRANT_HOST=localhost \
npm start
```

### Step 3: Verify graph data
```bash
# Count nodes
docker compose exec falkordb redis-cli GRAPH.QUERY son-of-anton \
  "MATCH (n) RETURN labels(n)[0] AS type, count(n) AS cnt"

# Count edges
docker compose exec falkordb redis-cli GRAPH.QUERY son-of-anton \
  "MATCH ()-[r]->() RETURN type(r) AS rel, count(r) AS cnt"
```

### Step 4: Verify Qdrant data
```bash
curl http://localhost:6333/collections/son-of-anton-code
```

### Step 5: Run LSIF pipeline
```bash
cd services/lsif && npm run build && \
PROJECT_PATH=/path/to/test-project \
FALKORDB_HOST=localhost \
npm start
```

### Step 6: Verify cross-references
```bash
# Check REFERENCES edges
docker compose exec falkordb redis-cli GRAPH.QUERY son-of-anton \
  "MATCH ()-[r:REFERENCES]->() RETURN count(r)"
```

## Architecture Compliance

| Requirement | Status |
|-------------|--------|
| Tier 1 modification (new files only) | Yes |
| TypeScript for production code | Yes |
| Services in `services/<name>/` | Yes |
| Each service has Dockerfile, package.json, health endpoint | Yes |
| Docker Compose integration | Yes |
| No Tier 3 (core VS Code) modifications | Correct |
| No telemetry | Correct |
| No secrets in source | Correct |
