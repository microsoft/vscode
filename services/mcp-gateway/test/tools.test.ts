// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import { describe, test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { symbolLookup } from '../src/tools/symbolLookup';
import { findReferences } from '../src/tools/findReferences';
import { dependencyTraversal } from '../src/tools/dependencyTraversal';
import { impactAnalysis } from '../src/tools/impactAnalysis';
import { fileSummary } from '../src/tools/fileSummary';
import { projectOverview } from '../src/tools/projectOverview';
import { FalkorDBClient } from '../src/clients/falkordb';

// Mock FalkorDB client
function createMockDB(queryResults: Map<string, { headers: string[]; rows: Record<string, unknown>[][] }>): FalkorDBClient {
	const mockDB = {
		query: mock.fn(async (cypher: string) => {
			for (const [pattern, result] of queryResults) {
				if (cypher.includes(pattern)) {
					return result;
				}
			}
			return { headers: [], rows: [] };
		}),
		connect: mock.fn(async () => {}),
		disconnect: mock.fn(async () => {}),
		isHealthy: mock.fn(async () => true),
	};
	return mockDB as unknown as FalkorDBClient;
}

describe('symbol_lookup', () => {
	test('returns matching symbols by name', async () => {
		const db = createMockDB(new Map([
			['s.name', {
				headers: ['type', 'name', 'qualifiedName', 'file', 'startLine', 'endLine', 'signature', 'exported'],
				rows: [[{
					type: 'Function',
					name: 'validateToken',
					qualifiedName: 'AuthService.validateToken',
					file: '/src/auth/middleware.ts',
					startLine: 42,
					endLine: 78,
					signature: '(token: string) => Promise<User>',
					exported: true,
				}]],
			}],
		]));

		const results = await symbolLookup(db, { name: 'validateToken' });
		assert.deepStrictEqual(results, [{
			name: 'validateToken',
			qualifiedName: 'AuthService.validateToken',
			type: 'Function',
			file: '/src/auth/middleware.ts',
			startLine: 42,
			endLine: 78,
			signature: '(token: string) => Promise<User>',
			exported: true,
		}]);
	});

	test('returns empty array for non-existent symbols', async () => {
		const db = createMockDB(new Map());
		const results = await symbolLookup(db, { name: 'nonExistent' });
		assert.deepStrictEqual(results, []);
	});

	test('filters by type when provided', async () => {
		const db = createMockDB(new Map([
			[':Function', {
				headers: ['type', 'name', 'file', 'startLine', 'endLine'],
				rows: [[{
					type: 'Function',
					name: 'doSomething',
					file: '/src/utils.ts',
					startLine: 1,
					endLine: 10,
				}]],
			}],
		]));

		const results = await symbolLookup(db, { name: 'doSomething', type: 'function' });
		assert.equal(results.length, 1);
		assert.equal(results[0].type, 'Function');
	});
});

describe('find_references', () => {
	test('returns reference locations', async () => {
		const db = createMockDB(new Map([
			['REFERENCES', {
				headers: ['file', 'line', 'column', 'kind', 'context'],
				rows: [
					[{ file: '/src/routes/api.ts', line: 15, column: 8, kind: 'read', context: 'handleRequest' }],
					[{ file: '/src/test/auth.test.ts', line: 42, column: 3, kind: 'read', context: 'testAuth' }],
				],
			}],
		]));

		const results = await findReferences(db, { name: 'validateToken' });
		assert.equal(results.length, 2);
		assert.equal(results[0].file, '/src/routes/api.ts');
		assert.equal(results[1].file, '/src/test/auth.test.ts');
	});
});

describe('dependency_traversal', () => {
	test('returns dependency tree for a function', async () => {
		const db = createMockDB(new Map([
			['CALLS', {
				headers: ['name', 'type', 'file', 'relationship', 'depth'],
				rows: [
					[{ name: 'dbQuery', type: 'Function', file: '/src/db.ts', relationship: 'CALLS', depth: 1 }],
					[{ name: 'serialize', type: 'Function', file: '/src/utils.ts', relationship: 'CALLS', depth: 2 }],
				],
			}],
		]));

		const result = await dependencyTraversal(db, { function: 'handleRequest' });
		assert.equal(result.root, 'handleRequest');
		assert.equal(result.rootType, 'Function');
		assert.equal(result.dependencies.length, 2);
	});

	test('returns dependency tree for a file', async () => {
		const db = createMockDB(new Map([
			['IMPORTS', {
				headers: ['name', 'type', 'file', 'relationship', 'depth'],
				rows: [
					[{ name: '/src/db.ts', type: 'File', file: '/src/db.ts', relationship: 'IMPORTS', depth: 1 }],
				],
			}],
		]));

		const result = await dependencyTraversal(db, { file: '/src/app.ts' });
		assert.equal(result.rootType, 'File');
		assert.equal(result.dependencies.length, 1);
	});

	test('throws if neither file nor function provided', async () => {
		const db = createMockDB(new Map());
		await assert.rejects(
			() => dependencyTraversal(db, {}),
			{ message: 'Either file or function must be provided' }
		);
	});
});

describe('impact_analysis', () => {
	test('returns direct and transitive dependents', async () => {
		const db = createMockDB(new Map([
			['(dep)-[r]->(s)', {
				headers: ['name', 'type', 'file', 'relationship'],
				rows: [
					[{ name: 'handleRequest', type: 'Function', file: '/src/api.ts', relationship: 'CALLS' }],
				],
			}],
			['(dep)-[r1]->(mid)', {
				headers: ['name', 'type', 'file', 'relationship'],
				rows: [
					[{ name: 'appStart', type: 'Function', file: '/src/main.ts', relationship: 'CALLS' }],
				],
			}],
		]));

		const result = await impactAnalysis(db, { symbol: 'validateToken' });
		assert.equal(result.symbol, 'validateToken');
		assert.equal(result.directDependents.length, 1);
		assert.equal(result.transitiveDependents.length, 1);
		assert.equal(result.totalImpact, 2);
	});
});

describe('file_summary', () => {
	test('returns structural summary', async () => {
		const db = createMockDB(new Map([
			['f.language', {
				headers: ['language', 'lineCount'],
				rows: [[{ language: 'typescript', lineCount: 120 }]],
			}],
			['CONTAINS', {
				headers: ['type', 'name', 'startLine', 'endLine', 'exported', 'signature'],
				rows: [
					[{ type: 'Function', name: 'validateToken', startLine: 42, endLine: 78, exported: true, signature: '(token: string) => Promise<User>' }],
					[{ type: 'Class', name: 'AuthService', startLine: 10, endLine: 150, exported: true }],
				],
			}],
			['Import', {
				headers: ['source', 'specifiers'],
				rows: [[{ source: './db', specifiers: 'Database' }]],
			}],
			['dep:File', {
				headers: ['depPath'],
				rows: [[{ depPath: '/src/db.ts' }]],
			}],
		]));

		const result = await fileSummary(db, { path: '/src/auth/middleware.ts' });
		assert.equal(result.path, '/src/auth/middleware.ts');
		assert.equal(result.functions.length, 1);
		assert.equal(result.classes.length, 1);
	});
});

describe('project_overview', () => {
	test('returns high-level project structure', async () => {
		const db = createMockDB(new Map([
			['files, functions, classes, types', {
				headers: ['files', 'functions', 'classes', 'types'],
				rows: [[{ files: 150, functions: 800, classes: 50, types: 120 }]],
			}],
			['f.language AS language', {
				headers: ['language', 'count'],
				rows: [
					[{ language: 'typescript', count: 130 }],
					[{ language: 'python', count: 20 }],
				],
			}],
			['Module', {
				headers: ['name', 'path', 'entryPoint', 'fileCount'],
				rows: [[{ name: 'auth', path: '/src/auth/', entryPoint: '/src/auth/index.ts', fileCount: 12 }]],
			}],
			['index.ts', {
				headers: ['path'],
				rows: [[{ path: '/src/auth/index.ts' }]],
			}],
			['inDegree', {
				headers: ['name', 'type', 'file', 'inDegree'],
				rows: [[{ name: 'Database', type: 'Class', file: '/src/db.ts', inDegree: 42 }]],
			}],
		]));

		const result = await projectOverview(db);
		assert.equal(result.totalFiles, 150);
		assert.equal(result.totalFunctions, 800);
		assert.equal(result.languageBreakdown.typescript, 130);
		assert.equal(result.modules.length, 1);
		assert.equal(result.keyAbstractions.length, 1);
	});
});
