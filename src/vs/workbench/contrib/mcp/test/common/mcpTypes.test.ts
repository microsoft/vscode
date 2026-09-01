/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { McpServerType } from '../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { getMcpCollectionProvenance, McpCollectionProvenance, McpResourceURI, McpServerDefinition, McpServerLaunch, McpServerTransportType } from '../../common/mcpTypes.js';
import * as assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';

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

		const createHttpDefinition = (uri: URI): McpServerDefinition => createBasicDefinition({
			launch: {
				type: McpServerTransportType.HTTP,
				uri,
				headers: []
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

		test('returns false when default cwd differs', () => {
			const def1 = createBasicDefinition({ defaultCwd: URI.file('/path1') });
			const def2 = createBasicDefinition({ defaultCwd: URI.file('/path2') });
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

		test('returns true when equivalent HTTP URI formatted cache state differs', () => {
			const uri1 = URI.parse('https://example.com/mcp');
			const uri2 = URI.parse('https://example.com/mcp');
			uri1.toString();

			assert.strictEqual(McpServerDefinition.equals(createHttpDefinition(uri1), createHttpDefinition(uri2)), true);
		});

		test('returns true when equivalent HTTP URI fsPath cache state differs', () => {
			const uri1 = URI.parse('https://example.com/mcp');
			const uri2 = URI.parse('https://example.com/mcp');
			void uri1.fsPath;

			assert.strictEqual(McpServerDefinition.equals(createHttpDefinition(uri1), createHttpDefinition(uri2)), true);
		});

		test('returns true when presentation origin URI cache state differs', () => {
			const uri1 = URI.file('/path/to/mcp.json');
			const uri2 = URI.file('/path/to/mcp.json');
			const range = { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 };
			uri1.toString();

			const def1 = createBasicDefinition({ presentation: { origin: { uri: uri1, range } } });
			const def2 = createBasicDefinition({ presentation: { origin: { uri: uri2, range } } });

			assert.strictEqual(McpServerDefinition.equals(def1, def2), true);
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

		test('returns false when HTTP endpoint differs', () => {
			const def1 = createHttpDefinition(URI.parse('https://example.com/mcp-one'));
			const def2 = createHttpDefinition(URI.parse('https://example.com/mcp-two'));

			assert.strictEqual(McpServerDefinition.equals(def1, def2), false);
		});

		test('returns false when presentation range differs', () => {
			const uri = URI.file('/path/to/mcp.json');
			const def1 = createBasicDefinition({
				presentation: {
					origin: {
						uri,
						range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }
					}
				}
			});
			const def2 = createBasicDefinition({
				presentation: {
					origin: {
						uri,
						range: { startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 1 }
					}
				}
			});

			assert.strictEqual(McpServerDefinition.equals(def1, def2), false);
		});

		test('returns false when variable replacement folder index differs', () => {
			const uri = URI.file('/workspace');
			const def1 = createBasicDefinition({
				variableReplacement: {
					target: ConfigurationTarget.USER,
					folder: { uri, name: 'workspace', index: 0 }
				}
			});
			const def2 = createBasicDefinition({
				variableReplacement: {
					target: ConfigurationTarget.USER,
					folder: { uri, name: 'workspace', index: 1 }
				}
			});

			assert.strictEqual(McpServerDefinition.equals(def1, def2), false);
		});
	});

	test('McpServerDefinition serializes default cwd as a URI', () => {
		const defaultCwd = URI.parse('vscode-remote://ssh-remote+linux/home/test/workspace');
		const definition: McpServerDefinition = {
			id: 'test-server',
			label: 'Test Server',
			cacheNonce: 'nonce',
			defaultCwd,
			launch: {
				type: McpServerTransportType.Stdio,
				cwd: undefined,
				command: 'test-command',
				args: [],
				env: {},
				envFile: undefined,
				sandbox: undefined
			},
		};

		const serialized = McpServerDefinition.toSerialized(definition);
		const deserialized = McpServerDefinition.fromSerialized(serialized);
		assert.deepStrictEqual({
			serialized: serialized.defaultCwd,
			deserialized: deserialized.defaultCwd?.toString(),
		}, {
			serialized: defaultCwd,
			deserialized: defaultCwd.toString(),
		});
	});

	test('McpServerDefinition preserves SSE transport when serialized', () => {
		const definition: McpServerDefinition = {
			id: 'test-server',
			label: 'Test Server',
			cacheNonce: 'nonce',
			launch: {
				type: McpServerTransportType.HTTP,
				transport: 'sse',
				uri: URI.parse('https://example.com/sse'),
				headers: [],
			},
		};

		const launch = McpServerDefinition.fromSerialized(McpServerDefinition.toSerialized(definition)).launch;
		assert.deepStrictEqual(launch.type === McpServerTransportType.HTTP ? {
			type: launch.type,
			transport: launch.transport,
		} : undefined, {
			type: McpServerTransportType.HTTP,
			transport: 'sse',
		});
	});

	test('McpServerLaunch converts persisted configurations', () => {
		assert.deepStrictEqual({
			local: McpServerLaunch.fromServerConfiguration({
				type: McpServerType.LOCAL,
				command: 'server',
				args: ['--port', '3000'],
				env: { TOKEN: 'value' },
				envFile: '.env',
				cwd: '/workspace',
			}, { network: { allowedDomains: ['example.com'] } }),
			remote: McpServerLaunch.fromServerConfiguration({
				type: McpServerType.REMOTE,
				transport: 'sse',
				url: 'https://example.com/mcp',
				headers: { Authorization: 'Bearer token' },
				oauth: { clientId: 'client' },
			}),
		}, {
			local: {
				type: McpServerTransportType.Stdio,
				command: 'server',
				args: ['--port', '3000'],
				env: { TOKEN: 'value' },
				envFile: '.env',
				cwd: '/workspace',
				sandbox: { network: { allowedDomains: ['example.com'] } },
			},
			remote: {
				type: McpServerTransportType.HTTP,
				transport: 'sse',
				uri: URI.parse('https://example.com/mcp'),
				headers: [['Authorization', 'Bearer token']],
				oauth: { clientId: 'client' },
			},
		});
	});

	test('maps configuration targets to collection provenance', () => {
		assert.deepStrictEqual([
			getMcpCollectionProvenance(ConfigurationTarget.USER),
			getMcpCollectionProvenance(ConfigurationTarget.USER_LOCAL),
			getMcpCollectionProvenance(ConfigurationTarget.USER_REMOTE),
			getMcpCollectionProvenance(ConfigurationTarget.WORKSPACE),
			getMcpCollectionProvenance(ConfigurationTarget.WORKSPACE_FOLDER),
			getMcpCollectionProvenance(undefined),
		], [
			McpCollectionProvenance.UserProfile,
			McpCollectionProvenance.UserProfile,
			McpCollectionProvenance.RemoteUser,
			McpCollectionProvenance.WorkspaceConfiguration,
			McpCollectionProvenance.WorkspaceFolderConfiguration,
			undefined,
		]);
	});
});
