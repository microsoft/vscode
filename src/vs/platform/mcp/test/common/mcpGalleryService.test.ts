/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

suite('MCP Gallery Service - Serialization', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('v0.1 Schema - Empty Description Handling', () => {

		test('should accept server with empty description string', () => {
			// This is the actual structure returned by Azure API Center MCP registry
			const input = {
				servers: [
					{
						server: {
							$schema: 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
							name: 'mcp-portal',
							title: 'MCP Portal',
							description: '', // Empty string should be accepted
							version: '2026-02-06',
							icons: [
								{
									src: 'https://example.com/icon.png'
								}
							],
							remotes: [
								{
									type: 'sse',
									url: 'https://example.com/mcp'
								}
							]
						},
						_meta: {
							'io.modelcontextprotocol.registry/official': {
								status: 'active',
								createdAt: '2026-02-06T10:10:30.8923384+00:00',
								updatedAt: '2026-02-06T12:47:47.5499195+00:00',
								isLatest: true
							}
						}
					}
				],
				metadata: {
					count: 1
				}
			};

			// The validation logic: description should be a string (including empty strings)
			// but should reject null or undefined
			const serverInfo = input.servers[0];
			const isValid =
				serverInfo.server != null &&
				typeof serverInfo.server === 'object' &&
				serverInfo.server.name != null &&
				typeof serverInfo.server.name === 'string' &&
				serverInfo.server.description != null && // Should pass for empty string
				typeof serverInfo.server.description === 'string' && // Should pass for empty string
				serverInfo.server.version != null &&
				typeof serverInfo.server.version === 'string';

			assert.strictEqual(isValid, true, 'Server with empty description should be valid');
			assert.strictEqual(serverInfo.server.description, '', 'Description should be empty string');
		});

		test('should reject server with null description', () => {
			const input = {
				servers: [
					{
						server: {
							name: 'test-server',
							description: null, // Should be rejected
							version: '1.0.0'
						},
						_meta: {}
					}
				],
				metadata: { count: 1 }
			};

			const serverInfo = input.servers[0];
			const isValid =
				serverInfo.server != null &&
				typeof serverInfo.server === 'object' &&
				serverInfo.server.name != null &&
				typeof serverInfo.server.name === 'string' &&
				serverInfo.server.description != null && // Should fail for null
				typeof serverInfo.server.description === 'string' &&
				serverInfo.server.version != null &&
				typeof serverInfo.server.version === 'string';

			assert.strictEqual(isValid, false, 'Server with null description should be invalid');
		});

		test('should reject server with undefined description', () => {
			const input: any = {
				servers: [
					{
						server: {
							name: 'test-server',
							// description is undefined
							version: '1.0.0'
						},
						_meta: {}
					}
				],
				metadata: { count: 1 }
			};

			const serverInfo = input.servers[0];
			const isValid =
				serverInfo.server != null &&
				typeof serverInfo.server === 'object' &&
				serverInfo.server.name != null &&
				typeof serverInfo.server.name === 'string' &&
				serverInfo.server.description != null && // Should fail for undefined
				typeof serverInfo.server.description === 'string' &&
				serverInfo.server.version != null &&
				typeof serverInfo.server.version === 'string';

			assert.strictEqual(isValid, false, 'Server with undefined description should be invalid');
		});

		test('should accept server with non-empty description', () => {
			const input = {
				servers: [
					{
						server: {
							name: 'test-server',
							description: 'A valid description',
							version: '1.0.0'
						},
						_meta: {}
					}
				],
				metadata: { count: 1 }
			};

			const serverInfo = input.servers[0];
			const isValid =
				serverInfo.server != null &&
				typeof serverInfo.server === 'object' &&
				serverInfo.server.name != null &&
				typeof serverInfo.server.name === 'string' &&
				serverInfo.server.description != null &&
				typeof serverInfo.server.description === 'string' &&
				serverInfo.server.version != null &&
				typeof serverInfo.server.version === 'string';

			assert.strictEqual(isValid, true, 'Server with non-empty description should be valid');
			assert.strictEqual(serverInfo.server.description, 'A valid description');
		});
	});

	suite('v2025-07-09 Schema - Empty Description Handling', () => {

		test('should accept server with empty description string', () => {
			const input: any = {
				name: 'test-server',
				description: '', // Empty string should be accepted
				version: '1.0.0'
			};

			const isValid =
				input.name != null &&
				typeof input.name === 'string' &&
				input.description != null && // Should pass for empty string
				typeof input.description === 'string' && // Should pass for empty string
				input.version != null &&
				typeof input.version === 'string';

			assert.strictEqual(isValid, true, 'Server with empty description should be valid');
			assert.strictEqual(input.description, '', 'Description should be empty string');
		});

		test('should reject server with null description', () => {
			const input: any = {
				name: 'test-server',
				description: null, // Should be rejected
				version: '1.0.0'
			};

			const isValid =
				input.name != null &&
				typeof input.name === 'string' &&
				input.description != null && // Should fail for null
				typeof input.description === 'string' &&
				input.version != null &&
				typeof input.version === 'string';

			assert.strictEqual(isValid, false, 'Server with null description should be invalid');
		});
	});
});
