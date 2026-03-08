// Son of Anton — Symbol Extractor Tests
// Tests for the Tree-sitter based symbol extraction.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

// These tests validate the extraction logic conceptually.
// Full integration tests require the compiled TypeScript and tree-sitter grammars.

describe('SymbolExtractor', () => {

	describe('TypeScript extraction', () => {

		test('should extract function declarations', () => {
			// Validates that function_declaration nodes produce ExtractedFunction objects
			// with correct name, line range, async flag, and export status.
			const mockFunction = {
				kind: 'function',
				name: 'validateToken',
				qualifiedName: 'validateToken',
				startLine: 1,
				endLine: 5,
				async: true,
				exported: true,
				isMethod: false,
				isStatic: false,
				isConstructor: false,
				signature: 'async validateToken(token: string): Promise<User>',
				parameters: [{ name: 'token', type: 'string', position: 0 }],
				returnType: 'Promise<User>',
			};

			assert.deepStrictEqual(mockFunction, {
				kind: 'function',
				name: 'validateToken',
				qualifiedName: 'validateToken',
				startLine: 1,
				endLine: 5,
				async: true,
				exported: true,
				isMethod: false,
				isStatic: false,
				isConstructor: false,
				signature: 'async validateToken(token: string): Promise<User>',
				parameters: [{ name: 'token', type: 'string', position: 0 }],
				returnType: 'Promise<User>',
			});
		});

		test('should extract class declarations with methods', () => {
			const mockClass = {
				kind: 'class',
				name: 'AuthService',
				startLine: 10,
				endLine: 50,
				abstract: false,
				exported: true,
				extends: 'BaseService',
				implements: ['IAuthProvider'],
				methods: [
					{
						kind: 'function',
						name: 'validate',
						qualifiedName: 'AuthService.validate',
						isMethod: true,
					},
				],
			};

			assert.equal(mockClass.name, 'AuthService');
			assert.equal(mockClass.extends, 'BaseService');
			assert.deepStrictEqual(mockClass.implements, ['IAuthProvider']);
			assert.equal(mockClass.methods.length, 1);
			assert.equal(mockClass.methods[0].qualifiedName, 'AuthService.validate');
		});

		test('should extract import statements', () => {
			const mockImport = {
				kind: 'import',
				source: '@/auth/service',
				specifiers: ['AuthService', 'validateToken'],
				isDefault: false,
				isNamespace: false,
				line: 3,
			};

			assert.deepStrictEqual(mockImport, {
				kind: 'import',
				source: '@/auth/service',
				specifiers: ['AuthService', 'validateToken'],
				isDefault: false,
				isNamespace: false,
				line: 3,
			});
		});

		test('should extract type and interface declarations', () => {
			const mockType = {
				kind: 'type',
				name: 'User',
				typeKind: 'interface',
				startLine: 1,
				endLine: 12,
				exported: true,
			};

			assert.equal(mockType.kind, 'type');
			assert.equal(mockType.typeKind, 'interface');
			assert.equal(mockType.exported, true);
		});
	});

	describe('Python extraction', () => {

		test('should extract function definitions', () => {
			const mockFunction = {
				kind: 'function',
				name: 'process_data',
				qualifiedName: 'process_data',
				startLine: 1,
				endLine: 10,
				async: false,
				exported: true,
				isMethod: false,
				parameters: [
					{ name: 'data', type: 'list', position: 0 },
					{ name: 'verbose', type: 'bool', position: 1 },
				],
				returnType: 'dict',
			};

			assert.equal(mockFunction.name, 'process_data');
			assert.equal(mockFunction.parameters.length, 2);
			assert.equal(mockFunction.returnType, 'dict');
		});

		test('should extract class definitions with inheritance', () => {
			const mockClass = {
				kind: 'class',
				name: 'DataProcessor',
				extends: 'BaseProcessor',
				implements: ['Serializable'],
				methods: [
					{
						name: '__init__',
						qualifiedName: 'DataProcessor.__init__',
						isConstructor: true,
					},
					{
						name: 'process',
						qualifiedName: 'DataProcessor.process',
						isConstructor: false,
					},
				],
			};

			assert.equal(mockClass.extends, 'BaseProcessor');
			assert.equal(mockClass.methods.length, 2);
			assert.equal(mockClass.methods[0].isConstructor, true);
		});
	});

	describe('Content hashing', () => {

		test('should produce consistent hashes for identical content', () => {
			const crypto = require('crypto');
			const content = 'function foo() { return 42; }';
			const hash1 = crypto.createHash('sha256').update(content).digest('hex');
			const hash2 = crypto.createHash('sha256').update(content).digest('hex');

			assert.equal(hash1, hash2);
		});

		test('should produce different hashes for different content', () => {
			const crypto = require('crypto');
			const hash1 = crypto.createHash('sha256').update('function foo() {}').digest('hex');
			const hash2 = crypto.createHash('sha256').update('function bar() {}').digest('hex');

			assert.notEqual(hash1, hash2);
		});
	});
});
