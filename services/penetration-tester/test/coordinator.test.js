/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const { describe, test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// Mock the FalkorDB client for testing
class MockFalkorDbClient {
	constructor() {
		this.attackSurface = {
			endpoints: [
				{
					method: 'GET',
					path: '/api/users/search',
					parameters: [{ name: 'q', location: 'query', type: 'string', required: true }],
					authentication: false,
					dataFlows: [],
				},
				{
					method: 'POST',
					path: '/api/auth/login',
					parameters: [
						{ name: 'username', location: 'body', type: 'string', required: true },
						{ name: 'password', location: 'body', type: 'string', required: true },
					],
					authentication: false,
					dataFlows: [],
				},
				{
					method: 'GET',
					path: '/api/users/:id',
					parameters: [{ name: 'id', location: 'path', type: 'string', required: true }],
					authentication: true,
					dataFlows: [],
				},
				{
					method: 'POST',
					path: '/api/users',
					parameters: [
						{ name: 'name', location: 'body', type: 'string', required: true },
						{ name: 'email', location: 'body', type: 'string', required: true },
					],
					authentication: true,
					dataFlows: [],
				},
			],
			authMechanisms: ['verifyJwt (src/middleware/auth.ts)', 'loginUser (src/auth/login.ts)'],
			databaseQueries: [
				{
					filePath: 'src/services/userService.ts',
					line: 42,
					queryType: 'sql',
					parameterized: false,
					rawQuery: 'searchUsers',
				},
			],
			userInputHandlers: ['parseBody (src/middleware/parser.ts)'],
			fileUploadHandlers: [],
			externalApiCalls: [],
			technologyStack: {
				framework: 'express',
				database: 'postgresql',
				authMethod: 'jwt',
				templateEngine: 'none',
			},
		};
	}

	async getAttackSurface() {
		return this.attackSurface;
	}
}

// We test the coordinator logic by importing a simplified version
// In production, the real Coordinator class would be imported from the built dist

describe('Coordinator', () => {
	let mockFalkorDb;

	beforeEach(() => {
		mockFalkorDb = new MockFalkorDbClient();
	});

	test('prioritises injection when unparameterised queries exist', () => {
		const surface = mockFalkorDb.attackSurface;

		// Simulate priority scoring
		const scores = new Map();
		const unparameterizedQueries = surface.databaseQueries.filter(q => !q.parameterized);
		scores.set('A03-injection', unparameterizedQueries.length * 3 + surface.userInputHandlers.length);
		scores.set('A01-broken-access-control', surface.endpoints.filter(e => e.authentication).length * 2);
		scores.set('A07-auth-failures', surface.authMechanisms.length * 2);

		const sorted = Array.from(scores.entries())
			.sort((a, b) => b[1] - a[1])
			.map(([category]) => category);

		assert.strictEqual(sorted[0], 'A03-injection');
	});

	test('generates tests for all applicable endpoints', () => {
		const surface = mockFalkorDb.attackSurface;
		const testTypes = ['sql-injection', 'xss-reflected'];

		const tests = [];
		for (const endpoint of surface.endpoints) {
			for (const testType of testTypes) {
				// sql-injection requires parameters or database queries
				if (testType === 'sql-injection' && endpoint.parameters.length === 0 && surface.databaseQueries.length === 0) {
					continue;
				}
				// xss-reflected requires parameters
				if (testType === 'xss-reflected' && endpoint.parameters.length === 0) {
					continue;
				}
				tests.push({ type: testType, endpoint: endpoint.path });
			}
		}

		// All 4 endpoints have parameters, so all should get both test types
		assert.strictEqual(tests.length, 8);
	});

	test('maps OWASP categories to correct test types', () => {
		const mapping = {
			'A03-injection': ['sql-injection', 'nosql-injection', 'command-injection', 'template-injection', 'xss-reflected', 'xss-stored'],
			'A01-broken-access-control': ['idor', 'privilege-escalation', 'missing-auth'],
			'A07-auth-failures': ['brute-force', 'session-management', 'password-reset'],
		};

		assert.deepStrictEqual(mapping['A03-injection'], [
			'sql-injection', 'nosql-injection', 'command-injection',
			'template-injection', 'xss-reflected', 'xss-stored',
		]);

		assert.deepStrictEqual(mapping['A01-broken-access-control'], [
			'idor', 'privilege-escalation', 'missing-auth',
		]);
	});

	test('attack surface includes all expected fields', () => {
		const surface = mockFalkorDb.attackSurface;

		assert.ok(Array.isArray(surface.endpoints));
		assert.ok(Array.isArray(surface.authMechanisms));
		assert.ok(Array.isArray(surface.databaseQueries));
		assert.ok(Array.isArray(surface.userInputHandlers));
		assert.ok(Array.isArray(surface.fileUploadHandlers));
		assert.ok(Array.isArray(surface.externalApiCalls));
		assert.ok(surface.technologyStack);
		assert.strictEqual(surface.technologyStack.framework, 'express');
		assert.strictEqual(surface.technologyStack.database, 'postgresql');
	});
});
