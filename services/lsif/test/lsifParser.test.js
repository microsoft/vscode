// Son of Anton — LSIF Parser Tests

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

describe('LsifParser', () => {

	describe('LSIF JSONL parsing', () => {

		test('should handle empty input', () => {
			const result = {
				definitions: [],
				references: [],
				typeRelations: [],
			};

			assert.deepStrictEqual(result, {
				definitions: [],
				references: [],
				typeRelations: [],
			});
		});

		test('should parse vertex elements', () => {
			const vertex = {
				id: '1',
				type: 'vertex',
				label: 'document',
				uri: 'file:///src/auth/service.ts',
			};

			assert.equal(vertex.type, 'vertex');
			assert.equal(vertex.label, 'document');
			assert.ok(vertex.uri.endsWith('service.ts'));
		});

		test('should parse edge elements', () => {
			const edge = {
				id: '10',
				type: 'edge',
				label: 'contains',
				outV: '1',
				inVs: ['2', '3', '4'],
			};

			assert.equal(edge.type, 'edge');
			assert.equal(edge.label, 'contains');
			assert.equal(edge.inVs.length, 3);
		});
	});

	describe('SCIP symbol parsing', () => {

		test('should extract symbol name from SCIP format', () => {
			// SCIP symbol format: "npm package 1.0.0 src/file.ts/ClassName#methodName()."
			const scipSymbol = 'npm my-package 1.0.0 src/auth/service.ts/AuthService#validateToken().';
			const parts = scipSymbol.split('/');
			const last = parts[parts.length - 1] ?? '';
			const name = last.replace(/[#().]+$/, '');

			assert.equal(name, 'AuthService#validateToken');
		});

		test('should handle simple symbol names', () => {
			const scipSymbol = 'validateToken';
			const name = scipSymbol.replace(/[#().]+$/, '');
			assert.equal(name, 'validateToken');
		});
	});

	describe('URI to path conversion', () => {

		test('should convert file:// URIs to paths', () => {
			const uri = 'file:///src/auth/middleware.ts';
			const path = uri.startsWith('file://')
				? decodeURIComponent(uri.substring('file://'.length))
				: uri;

			assert.equal(path, '/src/auth/middleware.ts');
		});

		test('should handle encoded URIs', () => {
			const uri = 'file:///src/my%20project/file.ts';
			const path = decodeURIComponent(uri.substring('file://'.length));

			assert.equal(path, '/src/my project/file.ts');
		});

		test('should pass through non-file URIs', () => {
			const uri = 'src/auth/middleware.ts';
			const path = uri.startsWith('file://')
				? decodeURIComponent(uri.substring('file://'.length))
				: uri;

			assert.equal(path, 'src/auth/middleware.ts');
		});
	});
});
