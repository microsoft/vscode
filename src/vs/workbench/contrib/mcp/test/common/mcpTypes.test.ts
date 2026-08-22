/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { McpResourceURI, McpServerDefinition, McpServerLaunch, McpServerTransportHTTP, McpServerTransportType } from '../../common/mcpTypes.js';

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

		test('serializes nested HTTP launches without URI cache state', () => {
			const uri = URI.parse('https://example.com/mcp');
			uri.toString();
			void uri.fsPath;

			const serialized = McpServerDefinition.toSerialized(createHttpDefinition(uri));

			assert.strictEqual(serialized.launch.type, McpServerTransportType.HTTP);
			assert.strictEqual(JSON.stringify(serialized.launch).includes('"external"'), false);
			assert.strictEqual(JSON.stringify(serialized.launch).includes('"fsPath"'), false);
		});

		test('serializes variable replacement folders without URI cache state', () => {
			const cachedUri = URI.file('/workspace');
			const freshUri = URI.file('/workspace');
			cachedUri.toString();
			void cachedUri.fsPath;

			const createDefinition = (uri: URI) => createBasicDefinition({
				variableReplacement: {
					target: ConfigurationTarget.USER,
					folder: { uri, name: 'workspace', index: 0 }
				}
			});
			const cached = JSON.stringify(McpServerDefinition.toSerialized(createDefinition(cachedUri)).variableReplacement);
			const fresh = JSON.stringify(McpServerDefinition.toSerialized(createDefinition(freshUri)).variableReplacement);

			assert.strictEqual(cached, fresh);
			assert.strictEqual(cached.includes('"external"'), false);
			assert.strictEqual(cached.includes('"fsPath"'), false);
		});
	});

	suite('McpServerLaunch identity', () => {
		const createHttpLaunch = (overrides?: Partial<McpServerTransportHTTP>): McpServerTransportHTTP => ({
			type: McpServerTransportType.HTTP,
			uri: URI.parse('https://example.com/mcp'),
			headers: [],
			...overrides
		});
		const createMalformedHttpLaunch = (property: 'oauth' | 'authentication', value: unknown): McpServerTransportHTTP => {
			const launch = createHttpLaunch();
			Reflect.set(launch, property, value);
			return launch;
		};

		test('normalizes missing and undefined HTTP properties', async () => {
			const omitted = createHttpLaunch();
			const explicitUndefined = createHttpLaunch({
				oauth: undefined,
				authentication: undefined
			});

			assert.strictEqual(McpServerLaunch.equals(omitted, explicitUndefined), true);
			assert.strictEqual(await McpServerLaunch.hash(omitted), await McpServerLaunch.hash(explicitUndefined));
		});

		test('normalizes missing and undefined OAuth properties', async () => {
			const omitted = createHttpLaunch({ oauth: {} });
			const explicitUndefined = createHttpLaunch({
				oauth: {
					clientId: undefined,
					enterpriseManaged: undefined
				}
			});
			assert.strictEqual(McpServerLaunch.equals(omitted, explicitUndefined), true);
			assert.strictEqual(await McpServerLaunch.hash(omitted), await McpServerLaunch.hash(explicitUndefined));
		});

		test('round trips canonical HTTP properties without mutating the source', async () => {
			const launch = createHttpLaunch({
				oauth: {
					clientId: undefined,
					enterpriseManaged: true
				},
				authentication: undefined
			});
			launch.uri.toString();

			const serialized = McpServerLaunch.toSerialized(launch);
			const revived = McpServerLaunch.fromSerialized(serialized);
			assert.strictEqual(McpServerLaunch.equals(launch, revived), true);
			assert.strictEqual(await McpServerLaunch.hash(launch), await McpServerLaunch.hash(revived));
			assert.strictEqual(serialized.type, McpServerTransportType.HTTP);
			if (serialized.type !== McpServerTransportType.HTTP) {
				throw new Error('Expected an HTTP launch');
			}
			assert.deepStrictEqual(Object.keys(serialized).sort(), ['headers', 'oauth', 'type', 'uri']);
			assert.deepStrictEqual(Object.keys(serialized.oauth!).sort(), ['enterpriseManaged']);
			assert.strictEqual(JSON.stringify(serialized).includes('"external"'), false);
			assert.strictEqual(Object.hasOwn(launch, 'authentication'), true);
			assert.strictEqual(Object.hasOwn(launch.oauth!, 'clientId'), true);
		});

		test('preserves malformed HTTP authentication identity', async () => {
			const withUndefinedProvider = createMalformedHttpLaunch('authentication', { providerId: undefined, scopes: [] });
			const withoutProvider = createMalformedHttpLaunch('authentication', { scopes: [] });
			const serialized = McpServerLaunch.toSerialized(withUndefinedProvider);
			assert.strictEqual(McpServerLaunch.equals(withUndefinedProvider, withoutProvider), false);
			assert.notStrictEqual(await McpServerLaunch.hash(withUndefinedProvider), await McpServerLaunch.hash(withoutProvider));
			if (serialized.type !== McpServerTransportType.HTTP) {
				throw new Error('Expected an HTTP launch');
			}
			assert.strictEqual(Object.hasOwn(serialized.authentication!, 'providerId'), true);
		});

		test('does not coerce malformed HTTP OAuth arrays into records', async () => {
			const arrayValue = createMalformedHttpLaunch('oauth', []);
			const objectValue = createMalformedHttpLaunch('oauth', {});
			const serialized = McpServerLaunch.toSerialized(arrayValue);
			assert.strictEqual(McpServerLaunch.equals(arrayValue, objectValue), false);
			assert.notStrictEqual(await McpServerLaunch.hash(arrayValue), await McpServerLaunch.hash(objectValue));
			if (serialized.type !== McpServerTransportType.HTTP) {
				throw new Error('Expected an HTTP launch');
			}
			assert.strictEqual(Array.isArray(serialized.oauth), true);
		});

		test('preserves unknown HTTP properties', async () => {
			const left = createHttpLaunch();
			const right = createHttpLaunch();
			Reflect.set(left, 'futureProperty', { enabled: true });
			Reflect.set(right, 'futureProperty', { enabled: false });
			assert.strictEqual(McpServerLaunch.equals(left, right), false);
			assert.notStrictEqual(await McpServerLaunch.hash(left), await McpServerLaunch.hash(right));

			const serialized = McpServerLaunch.toSerialized(left);
			const revived = McpServerLaunch.fromSerialized(serialized);
			assert.deepStrictEqual(Reflect.get(serialized, 'futureProperty'), { enabled: true });
			assert.deepStrictEqual(Reflect.get(revived, 'futureProperty'), { enabled: true });
		});

		test('preserves __proto__ HTTP properties without changing prototypes', async () => {
			const launch = createHttpLaunch();
			const nestedValue = JSON.parse('{"__proto__":{"nested":true}}');
			Object.defineProperty(launch, '__proto__', {
				value: { topLevel: true },
				enumerable: true,
				configurable: true,
				writable: true
			});
			Reflect.set(launch, 'futureProperty', nestedValue);

			const serialized = McpServerLaunch.toSerialized(launch);
			const revived = McpServerLaunch.fromSerialized(serialized);
			const withoutUnknownProperties = createHttpLaunch();

			assert.strictEqual(Object.getPrototypeOf(serialized), Object.prototype);
			assert.strictEqual(Object.hasOwn(serialized, '__proto__'), true);
			assert.deepStrictEqual(Reflect.get(serialized, '__proto__'), { topLevel: true });
			const serializedNestedValue = Reflect.get(serialized, 'futureProperty');
			assert.strictEqual(Object.getPrototypeOf(serializedNestedValue), Object.prototype);
			assert.strictEqual(Object.hasOwn(serializedNestedValue, '__proto__'), true);
			assert.deepStrictEqual(Reflect.get(serializedNestedValue, '__proto__'), { nested: true });
			assert.strictEqual(Object.getPrototypeOf(revived), Object.prototype);
			assert.strictEqual(Object.hasOwn(revived, '__proto__'), true);
			assert.strictEqual(McpServerLaunch.equals(launch, revived), true);
			assert.strictEqual(McpServerLaunch.equals(launch, withoutUnknownProperties), false);
			assert.notStrictEqual(await McpServerLaunch.hash(launch), await McpServerLaunch.hash(withoutUnknownProperties));
		});

		test('does not revalidate trusted URI components during normalization', () => {
			const uri = URI.revive({
				scheme: 'https',
				authority: 'example.com',
				path: 'relative',
				query: '',
				fragment: ''
			});
			const launch = createHttpLaunch({ uri });

			const serialized = McpServerLaunch.toSerialized(launch);
			if (serialized.type !== McpServerTransportType.HTTP) {
				throw new Error('Expected an HTTP launch');
			}
			assert.deepStrictEqual(serialized.uri, uri);
		});

		test('preserves meaningful HTTP authentication identity', async () => {
			const base = createHttpLaunch();
			const pairs: [McpServerLaunch, McpServerLaunch][] = [
				[base, createHttpLaunch({ oauth: {} })],
				[createHttpLaunch({ oauth: { clientId: 'client-a' } }), createHttpLaunch({ oauth: { clientId: 'client-b' } })],
				[createHttpLaunch({ oauth: { enterpriseManaged: true } }), createHttpLaunch({ oauth: { enterpriseManaged: false } })],
				[
					createHttpLaunch({ authentication: { providerId: 'provider-a', scopes: ['scope'] } }),
					createHttpLaunch({ authentication: { providerId: 'provider-b', scopes: ['scope'] } })
				],
				[
					createHttpLaunch({ authentication: { providerId: 'provider', scopes: ['scope-a'] } }),
					createHttpLaunch({ authentication: { providerId: 'provider', scopes: ['scope-b'] } })
				]
			];

			for (const [left, right] of pairs) {
				assert.strictEqual(McpServerLaunch.equals(left, right), false);
				assert.notStrictEqual(await McpServerLaunch.hash(left), await McpServerLaunch.hash(right));
			}
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

		test('returns the same asynchronous hash when authentication property order differs', async () => {
			const uri = URI.parse('https://example.com/mcp');
			const left: McpServerTransportHTTP = {
				type: McpServerTransportType.HTTP,
				uri,
				headers: [],
				oauth: { clientId: 'client', enterpriseManaged: true },
				authentication: { providerId: 'provider', scopes: ['scope'] }
			};
			const right: McpServerTransportHTTP = {
				type: McpServerTransportType.HTTP,
				uri,
				headers: [],
				oauth: { enterpriseManaged: true, clientId: 'client' },
				authentication: { scopes: ['scope'], providerId: 'provider' }
			};

			assert.strictEqual(McpServerLaunch.equals(left, right), true);
			assert.strictEqual(await McpServerLaunch.hash(left), await McpServerLaunch.hash(right));
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

			await McpServerLaunch.hash(launch);

			assert.strictEqual(JSON.stringify(uri), initialUriState);
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
});
