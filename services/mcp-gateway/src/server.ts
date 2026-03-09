// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { FalkorDBClient } from './clients/falkordb';
import { QdrantClient } from './clients/qdrant';
import { symbolLookup } from './tools/symbolLookup';
import { findReferences } from './tools/findReferences';
import { dependencyTraversal } from './tools/dependencyTraversal';
import { impactAnalysis } from './tools/impactAnalysis';
import { semanticSearch } from './tools/semanticSearch';
import { fileSummary } from './tools/fileSummary';
import { projectOverview } from './tools/projectOverview';
import { memoryQuery, memoryRecord, memoryHistory } from './tools/memoryQuery';
import { specList, specRead, specSyncCheck } from './tools/specPipeline';
import { buildTargets, buildOrder, environmentRequirements, affectedTargets } from './tools/buildDag';

export function createMcpServer(db: FalkorDBClient, qdrant: QdrantClient): McpServer {
	const server = new McpServer({
		name: 'son-of-anton-code-graph',
		version: '1.0.0',
	});

	// --- symbol_lookup ---
	server.tool(
		'symbol_lookup',
		'Look up a symbol (function, class, type, module) by name. Returns definition location, type, signature, file path, and line range.',
		{
			name: z.string().describe('Symbol name to look up'),
			type: z.enum(['function', 'class', 'type', 'module']).optional()
				.describe('Filter by symbol type'),
		},
		async ({ name, type }) => {
			try {
				const results = await symbolLookup(db, { name, type });
				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify(results, null, 2),
					}],
				};
			} catch (error) {
				return errorResponse('symbol_lookup', error);
			}
		}
	);

	// --- find_references ---
	server.tool(
		'find_references',
		'Find all references to a symbol across the codebase. Returns file, line, column, and context for each reference.',
		{
			name: z.string().describe('Symbol name to find references for'),
			file: z.string().optional().describe('Limit to references of the symbol defined in this file'),
		},
		async ({ name, file }) => {
			try {
				const results = await findReferences(db, { name, file });
				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify(results, null, 2),
					}],
				};
			} catch (error) {
				return errorResponse('find_references', error);
			}
		}
	);

	// --- dependency_traversal ---
	server.tool(
		'dependency_traversal',
		'Traverse the dependency tree of a file or function. Shows what a symbol/file depends on (imports, calls) at configurable depth.',
		{
			file: z.string().optional().describe('File path to traverse dependencies for'),
			function: z.string().optional().describe('Function name to traverse call dependencies for'),
			depth: z.number().min(1).max(5).optional().describe('Traversal depth (default 2, max 5)'),
		},
		async (params) => {
			try {
				const results = await dependencyTraversal(db, {
					file: params.file,
					function: params.function,
					depth: params.depth,
				});
				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify(results, null, 2),
					}],
				};
			} catch (error) {
				return errorResponse('dependency_traversal', error);
			}
		}
	);

	// --- impact_analysis ---
	server.tool(
		'impact_analysis',
		'Analyze the downstream impact of changing a symbol. Returns all callers, test files, and documentation referencing this symbol, categorised as direct or transitive.',
		{
			symbol: z.string().describe('Symbol name to analyze impact for'),
			file: z.string().optional().describe('File where the symbol is defined (for disambiguation)'),
		},
		async ({ symbol, file }) => {
			try {
				const results = await impactAnalysis(db, { symbol, file });
				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify(results, null, 2),
					}],
				};
			} catch (error) {
				return errorResponse('impact_analysis', error);
			}
		}
	);

	// --- semantic_search ---
	server.tool(
		'semantic_search',
		'Search for code semantically using natural language. Results are ranked by a combination of semantic similarity and structural importance (PageRank-style).',
		{
			query: z.string().describe('Natural language search query'),
			maxResults: z.number().min(1).max(50).optional().describe('Maximum results to return (default 10)'),
			language: z.string().optional().describe('Filter results by programming language'),
		},
		async ({ query, maxResults, language }) => {
			try {
				// Placeholder embedding function — in production this calls the embedding model
				const embedQuery = async (text: string): Promise<number[]> => {
					// Generate a deterministic placeholder vector for testing.
					// In production, replace with a call to an embedding API.
					// Compute the hash of the text once, then use it to generate all dimensions.
					let hash = 0;
					for (let j = 0; j < text.length; j++) {
						hash = ((hash << 5) - hash + text.charCodeAt(j)) | 0;
					}
					const vector = new Array(384);
					for (let i = 0; i < 384; i++) {
						vector[i] = Math.sin(hash + i) * 0.5;
					}
					return vector;
				};

				const results = await semanticSearch(qdrant, db, { query, maxResults, language }, embedQuery);
				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify(results, null, 2),
					}],
				};
			} catch (error) {
				return errorResponse('semantic_search', error);
			}
		}
	);

	// --- file_summary ---
	server.tool(
		'file_summary',
		'Get a structural summary of a file: exports, classes, functions, imports, and dependencies.',
		{
			path: z.string().describe('Project-relative file path'),
		},
		async ({ path }) => {
			try {
				const results = await fileSummary(db, { path });
				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify(results, null, 2),
					}],
				};
			} catch (error) {
				return errorResponse('file_summary', error);
			}
		}
	);

	// --- project_overview ---
	server.tool(
		'project_overview',
		'Get a high-level overview of the project: modules, entry points, key abstractions, file count, and language breakdown.',
		{},
		async () => {
			try {
				const results = await projectOverview(db);
				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify(results, null, 2),
					}],
				};
			} catch (error) {
				return errorResponse('project_overview', error);
			}
		}
	);

	// --- memory_query ---
	server.tool(
		'memory_query',
		'Search long-term project memory by keyword, type, topic, or time range. Returns decisions, conventions, warnings, and preferences stored across sessions.',
		{
			type: z.enum(['Decision', 'Convention', 'Warning', 'Preference']).optional()
				.describe('Filter by memory entity type'),
			keyword: z.string().optional().describe('Search by keyword in content'),
			topic: z.string().optional().describe('Filter by topic tag'),
			currentOnly: z.boolean().optional().describe('Only return current (non-superseded) entries, default true'),
			since: z.number().optional().describe('Filter entries created after this timestamp'),
			limit: z.number().min(1).max(100).optional().describe('Maximum results (default 50)'),
		},
		async (params) => {
			try {
				const results = await memoryQuery(db, {
					type: params.type,
					keyword: params.keyword,
					topic: params.topic,
					currentOnly: params.currentOnly,
					since: params.since,
					limit: params.limit,
				});
				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify(results, null, 2),
					}],
				};
			} catch (error) {
				return errorResponse('memory_query', error);
			}
		}
	);

	// --- memory_record ---
	server.tool(
		'memory_record',
		'Record a new entry in long-term project memory. Only the orchestrator agent and humans can write. Creates temporal entries that track how project knowledge evolves.',
		{
			type: z.enum(['Decision', 'Convention', 'Warning', 'Preference'])
				.describe('Type of memory entity'),
			content: z.string().describe('The knowledge content to record'),
			source: z.string().describe('Source identifier (session ID or agent name)'),
			topics: z.array(z.string()).describe('Topic tags for categorization'),
			supersedesId: z.string().optional()
				.describe('ID of an existing entry this supersedes (marks old entry as outdated)'),
		},
		async ({ type, content, source, topics, supersedesId }) => {
			try {
				const result = await memoryRecord(db, {
					type,
					content,
					source,
					topics,
					supersedesId,
				});
				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify(result, null, 2),
					}],
				};
			} catch (error) {
				return errorResponse('memory_record', error);
			}
		}
	);

	// --- memory_history ---
	server.tool(
		'memory_history',
		'Show how knowledge about a specific topic has changed over time. Returns a chronological list of all memory entries (including superseded ones) for a topic.',
		{
			topic: z.string().describe('Topic to view history for'),
		},
		async ({ topic }) => {
			try {
				const results = await memoryHistory(db, { topic });
				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify(results, null, 2),
					}],
				};
			} catch (error) {
				return errorResponse('memory_history', error);
			}
		}
	);

	// --- spec_list ---
	server.tool(
		'spec_list',
		'List all features that have spec definitions in .son-of-anton/specs/. Returns feature names and which phases (requirements, design, tasks, properties) exist.',
		{},
		async () => {
			try {
				const projectPath = process.env['PROJECT_PATH'] ?? '/workspace';
				const results = await specList(projectPath);
				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify(results, null, 2),
					}],
				};
			} catch (error) {
				return errorResponse('spec_list', error);
			}
		}
	);

	// --- spec_read ---
	server.tool(
		'spec_read',
		'Read the content of a spec file (requirements, design, tasks, or properties) for a specific feature.',
		{
			feature: z.string().describe('Feature name (or slug)'),
			phase: z.enum(['requirements', 'design', 'tasks', 'properties'])
				.describe('Which spec phase to read'),
		},
		async ({ feature, phase }) => {
			try {
				const projectPath = process.env['PROJECT_PATH'] ?? '/workspace';
				const results = await specRead(projectPath, { feature, phase });
				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify(results, null, 2),
					}],
				};
			} catch (error) {
				return errorResponse('spec_read', error);
			}
		}
	);

	// --- spec_sync_check ---
	server.tool(
		'spec_sync_check',
		'Check if a changed file affects any spec for a feature. Returns warnings if the code change may put the spec out of sync.',
		{
			feature: z.string().describe('Feature name to check sync for'),
			changedFile: z.string().describe('Path of the changed file'),
		},
		async ({ feature, changedFile }) => {
			try {
				const projectPath = process.env['PROJECT_PATH'] ?? '/workspace';
				const results = await specSyncCheck(projectPath, { feature, changedFile });
				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify(results, null, 2),
					}],
				};
			} catch (error) {
				return errorResponse('spec_sync_check', error);
			}
		}
	);

	// --- build_targets ---
	server.tool(
		'build_targets',
		'List all build/run/test targets in the project with their commands, dependencies, and ecosystem. Answers "how do I build/test/run this project?"',
		{
			ecosystem: z.string().optional().describe('Filter targets by ecosystem (node, rust, python, docker, make, just, task)'),
		},
		async ({ ecosystem }) => {
			try {
				const results = await buildTargets({ ecosystem });
				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify(results, null, 2),
					}],
				};
			} catch (error) {
				return errorResponse('build_targets', error);
			}
		}
	);

	// --- build_order ---
	server.tool(
		'build_order',
		'Get the ordered list of targets that must run to reach a given target (topological sort of the build DAG). Answers "what do I need to run before X?"',
		{
			target: z.string().describe('Target name to get build order for'),
		},
		async ({ target }) => {
			try {
				const results = await buildOrder({ target });
				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify(results, null, 2),
					}],
				};
			} catch (error) {
				return errorResponse('build_order', error);
			}
		}
	);

	// --- environment_requirements ---
	server.tool(
		'environment_requirements',
		'Get all environment variables needed, which services must be running, and what must be built first for a given target. Answers "what do I need to set up to run X?"',
		{
			target: z.string().describe('Target name to get requirements for'),
		},
		async ({ target }) => {
			try {
				const results = await environmentRequirements({ target });
				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify(results, null, 2),
					}],
				};
			} catch (error) {
				return errorResponse('environment_requirements', error);
			}
		}
	);

	// --- affected_targets ---
	server.tool(
		'affected_targets',
		'Find which build/test targets need to re-run given a set of changed files. Analogous to "nx affected". Answers "what broke when I changed these files?"',
		{
			changedFiles: z.array(z.string()).describe('List of changed file paths'),
		},
		async ({ changedFiles }) => {
			try {
				const results = await affectedTargets({ changedFiles });
				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify(results, null, 2),
					}],
				};
			} catch (error) {
				return errorResponse('affected_targets', error);
			}
		}
	);

	return server;
}

function errorResponse(tool: string, error: unknown) {
	const message = error instanceof Error ? error.message : String(error);
	return {
		content: [{
			type: 'text' as const,
			text: JSON.stringify({
				error: true,
				tool,
				message: `${tool} failed: ${message}`,
				suggestion: 'Check that the graph database is running and has been indexed. Run the indexer service if you haven\'t already.',
			}, null, 2),
		}],
		isError: true,
	};
}
