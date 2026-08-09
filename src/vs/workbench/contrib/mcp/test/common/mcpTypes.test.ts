/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { hash as objectHash } from '../../../../../base/common/hash.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { McpResourceURI, McpServerDefinition, McpServerLaunch, McpServerTransportType } from '../../common/mcpTypes.js';

suite('MCP Types', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('McpResourceURI - round trips', () => {
		const roundTrip = (uri: string) => {
			const from = McpResourceURI.fromServer({ label: '', id: 'my-id' }, uri);
			const to = McpResourceURI.toServer(from);
			assert.strictEqual(to.definitionId, 'my-id');
			assert.strictEqual(to.resourceURL.toString(), uri, `expected to round trip ${uri}`);
		};

		roundTrip('file:///path/to/file.txt');
		roundTrip('custom-scheme://my-path/to/resource.txt');
		roundTrip('custom-scheme://my-path');
		roundTrip('custom-scheme://my-path/');
		roundTrip('custom-scheme://my-path/?with=query&params=here');

		roundTrip('custom-scheme:///my-path');
		roundTrip('custom-scheme:///my-path/foo/?with=query&params=here');
	});

	suite('McpServerDefinition.equals', () => {
		const createBasicDefinition = (overrides?: Partial<McpServerDefinition>): McpServerDefinition => ({
			id: 'test-server',
			label: 'Test Server',
			cacheNonce: 'v1.0.0',
			launch: {
				type: McpServerTransportType.Stdio,
				cwd: undefined,
				command: 'test-command',
				args: [],
				env: {},
				envFile: undefined,
				sandbox: undefined
			},
			...overrides
		});

		const createHttpDefinition = (uri: URI, headers: [string, string][] = []): McpServerDefinition => createBasicDefinition({
			launch: {
				type: McpServerTransportType.HTTP,
				uri,
				headers
			}
		});

		test('returns true for identical definitions', () => {
			const def1 = createBasicDefinition();
			const def2 = createBasicDefinition();
			assert.strictEqual(McpServerDefinition.equals(def1, def2), true);
		});

		test('returns false when cacheNonce differs', () => {
			const def1 = createBasicDefinition({ cacheNonce: 'v1.0.0' });
			const def2 = createBasicDefinition({ cacheNonce: 'v2.0.0' });
			assert.strictEqual(McpServerDefinition.equals(def1, def2), false);
		});

		test('returns false when id differs', () => {
			const def1 = createBasicDefinition({ id: 'server-1' });
			const def2 = createBasicDefinition({ id: 'server-2' });
			assert.strictEqual(McpServerDefinition.equals(def1, def2), false);
		});

		test('returns false when label differs', () => {
			const def1 = createBasicDefinition({ label: 'Server A' });
			const def2 = createBasicDefinition({ label: 'Server B' });
			assert.strictEqual(McpServerDefinition.equals(def1, def2), false);
		});

		test('returns false when roots differ', () => {
			const def1 = createBasicDefinition({ roots: [URI.file('/path1')] });
			const def2 = createBasicDefinition({ roots: [URI.file('/path2')] });
			assert.strictEqual(McpServerDefinition.equals(def1, def2), false);
		});

		test('returns true when roots are both undefined', () => {
			const def1 = createBasicDefinition({ roots: undefined });
			const def2 = createBasicDefinition({ roots: undefined });
			assert.strictEqual(McpServerDefinition.equals(def1, def2), true);
		});

		test('returns false when launch differs', () => {
			const def1 = createBasicDefinition({
				launch: {
					type: McpServerTransportType.Stdio,
					cwd: undefined,
					command: 'command1',
					args: [],
					env: {},
					envFile: undefined,
					sandbox: undefined
				}
			});
			const def2 = createBasicDefinition({
				launch: {
					type: McpServerTransportType.Stdio,
					cwd: undefined,
					command: 'command2',
					args: [],
					env: {},
					envFile: undefined,
					sandbox: undefined
				}
			});
			assert.strictEqual(McpServerDefinition.equals(def1, def2), false);
		});

		test('returns true when equivalent HTTP URI cache state differs', () => {
			const uri1 = URI.parse('https://example.com/mcp');
			const uri2 = URI.parse('https://example.com/mcp');
			uri1.toString();

			assert.strictEqual(McpServerDefinition.equals(createHttpDefinition(uri1), createHttpDefinition(uri2)), true);
		});

		test('returns false when HTTP endpoint differs', () => {
			const def1 = createHttpDefinition(URI.parse('https://example.com/mcp-one'));
			const def2 = createHttpDefinition(URI.parse('https://example.com/mcp-two'));
			assert.strictEqual(McpServerDefinition.equals(def1, def2), false);
		});

		test('returns false when HTTP headers differ', () => {
			const uri = 'https://example.com/mcp';
			const def1 = createHttpDefinition(URI.parse(uri), [['X-Test-Header', 'one']]);
			const def2 = createHttpDefinition(URI.parse(uri), [['X-Test-Header', 'two']]);
			assert.strictEqual(McpServerDefinition.equals(def1, def2), false);
		});

		test('returns true when presentation origin URI cache state differs', () => {
			const uri1 = URI.file('/path/to/mcp.json');
			const uri2 = URI.file('/path/to/mcp.json');
			uri1.toString();

			const range = { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 };
			const def1 = createBasicDefinition({ presentation: { origin: { uri: uri1, range } } });
			const def2 = createBasicDefinition({ presentation: { origin: { uri: uri2, range } } });
			assert.strictEqual(McpServerDefinition.equals(def1, def2), true);
		});

		test('returns false when presentation origin URI differs', () => {
			const range = { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 };
			const def1 = createBasicDefinition({ presentation: { origin: { uri: URI.file('/path/to/one.json'), range } } });
			const def2 = createBasicDefinition({ presentation: { origin: { uri: URI.file('/path/to/two.json'), range } } });
			assert.strictEqual(McpServerDefinition.equals(def1, def2), false);
		});

		test('returns true when variable replacement folder URI cache state differs', () => {
			const uri1 = URI.file('/workspace');
			const uri2 = URI.file('/workspace');
			uri1.toString();

			const def1 = createBasicDefinition({
				variableReplacement: {
					target: ConfigurationTarget.USER,
					folder: { uri: uri1, name: 'workspace', index: 0 }
				}
			});
			const def2 = createBasicDefinition({
				variableReplacement: {
					target: ConfigurationTarget.USER,
					folder: { uri: uri2, name: 'workspace', index: 0 }
				}
			});
			assert.strictEqual(McpServerDefinition.equals(def1, def2), true);
		});

		test('returns false when variable replacement folder URI differs', () => {
			const def1 = createBasicDefinition({
				variableReplacement: {
					target: ConfigurationTarget.USER,
					folder: { uri: URI.file('/workspace/one'), name: 'workspace', index: 0 }
				}
			});
			const def2 = createBasicDefinition({
				variableReplacement: {
					target: ConfigurationTarget.USER,
					folder: { uri: URI.file('/workspace/two'), name: 'workspace', index: 0 }
				}
			});
			assert.strictEqual(McpServerDefinition.equals(def1, def2), false);
		});
	});

	suite('McpServerLaunch hashing', () => {
		const createHttpLaunch = (uri: URI): McpServerLaunch => ({
			type: McpServerTransportType.HTTP,
			uri,
			headers: [['X-Test-Header', 'value']]
		});

		test('returns the same asynchronous hash when HTTP URI cache state differs', async () => {
			const uri1 = URI.parse('https://example.com/mcp');
			const uri2 = URI.parse('https://example.com/mcp');
			uri1.toString();
			void uri1.fsPath;

			assert.strictEqual(await McpServerLaunch.hash(createHttpLaunch(uri1)), await McpServerLaunch.hash(createHttpLaunch(uri2)));
		});

		test('returns the same synchronous cache hash when HTTP URI cache state differs', () => {
			const uri1 = URI.parse('https://example.com/mcp');
			const uri2 = URI.parse('https://example.com/mcp');
			uri1.toString();
			void uri1.fsPath;

			assert.strictEqual(McpServerLaunch.hashForCache(createHttpLaunch(uri1)), McpServerLaunch.hashForCache(createHttpLaunch(uri2)));
		});

		test('preserves the existing synchronous hash for a fresh HTTP launch', () => {
			const launch = createHttpLaunch(URI.parse('https://example.com/mcp'));
			assert.strictEqual(McpServerLaunch.hashForCache(launch), objectHash(launch));
		});

		test('preserves the existing asynchronous hash for a fresh HTTP launch', async () => {
			const launch = createHttpLaunch(URI.parse('https://example.com/mcp'));
			const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(launch)));
			const existingHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');

			assert.strictEqual(await McpServerLaunch.hash(launch), existingHash);
		});

		test('does not populate URI caches while hashing', async () => {
			const uri = URI.parse('https://example.com/mcp');
			const launch = createHttpLaunch(uri);
			const initialUriState = JSON.stringify(uri);

			McpServerLaunch.hashForCache(launch);
			await McpServerLaunch.hash(launch);

			assert.strictEqual(JSON.stringify(uri), initialUriState);
		});
	});
});
