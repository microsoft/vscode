/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { bufferToStream, VSBuffer } from '../../../../../base/common/buffer.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IRequestContext } from '../../../../../base/parts/request/common/request.js';
import { isManagedSettingsUrl, MANAGED_SETTINGS_ORIGINAL_STATUS_HEADER } from '../../../../../platform/policy/common/copilotManagedSettings.js';
import { adaptManagedSettings, appendManagedSettingsClientIdentity, IManagedSettingsResponse, parseManagedSettingsCompatibilityError, restoreOriginalStatus } from '../../browser/managedSettings.js';

suite('adaptManagedSettings', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('restores a status rewritten to avoid console logging', () => {
		const context = (headers: Record<string, string>, statusCode: number): IRequestContext => ({
			res: { statusCode, headers },
			stream: bufferToStream(VSBuffer.fromString('{}')),
		});

		assert.deepStrictEqual({
			rewritten: restoreOriginalStatus(context({ [MANAGED_SETTINGS_ORIGINAL_STATUS_HEADER]: '404' }, 200)).res.statusCode,
			untouched: restoreOriginalStatus(context({}, 200)).res.statusCode,
			genuineError: restoreOriginalStatus(context({}, 466)).res.statusCode,
			malformedHeader: restoreOriginalStatus(context({ [MANAGED_SETTINGS_ORIGINAL_STATUS_HEADER]: 'nope' }, 200)).res.statusCode,
		}, {
			rewritten: 404,
			untouched: 200,
			genuineError: 466,
			malformedHeader: 200,
		});
	});

	test('recognizes the managed settings endpoint across deployments', () => {
		assert.deepStrictEqual({
			dotCom: isManagedSettingsUrl('https://api.github.com/copilot_internal/managed_settings'),
			withQuery: isManagedSettingsUrl('https://api.github.com/copilot_internal/managed_settings?client_id=vscode'),
			enterprise: isManagedSettingsUrl('https://api.contoso.ghe.com/copilot_internal/managed_settings'),
			otherEndpoint: isManagedSettingsUrl('https://api.github.com/copilot_internal/user'),
			otherHost: isManagedSettingsUrl('https://example.com/copilot_internal/managed_settings'),
			insecure: isManagedSettingsUrl('http://api.github.com/copilot_internal/managed_settings'),
			unparseable: isManagedSettingsUrl('not a url'),
		}, {
			dotCom: true,
			withQuery: true,
			enterprise: true,
			otherEndpoint: false,
			otherHost: false,
			insecure: false,
			unparseable: false,
		});
	});

	test('empty response yields an empty managed settings bag', () => {
		assert.deepStrictEqual(adaptManagedSettings({}), {
			managedSettings: {},
		});
	});

	test('appends client identity to the request url', () => {
		assert.deepStrictEqual({
			withRuntime: appendManagedSettingsClientIdentity('https://api.github.com/copilot_internal/managed_settings', {
				version: '1.132.0',
				copilotVersions: { runtime: '0.0.344', sdk: '0.1.0' },
			}),
			withoutRuntime: appendManagedSettingsClientIdentity('https://api.github.com/copilot_internal/managed_settings', { version: '1.132.0' }),
			preservesExistingQuery: appendManagedSettingsClientIdentity('https://api.github.com/copilot_internal/managed_settings?foo=bar', { version: '1.132.0' }),
			dropsStaleRuntimeVersion: appendManagedSettingsClientIdentity('https://api.github.com/copilot_internal/managed_settings?copilot_runtime_version=0.0.1', { version: '1.132.0' }),
			unparseableUrl: appendManagedSettingsClientIdentity('not a url', { version: '1.132.0' }),
		}, {
			withRuntime: 'https://api.github.com/copilot_internal/managed_settings?client_id=vscode&client_version=1.132.0&copilot_runtime_version=0.0.344',
			withoutRuntime: 'https://api.github.com/copilot_internal/managed_settings?client_id=vscode&client_version=1.132.0',
			preservesExistingQuery: 'https://api.github.com/copilot_internal/managed_settings?foo=bar&client_id=vscode&client_version=1.132.0',
			dropsStaleRuntimeVersion: 'https://api.github.com/copilot_internal/managed_settings?client_id=vscode&client_version=1.132.0',
			unparseableUrl: 'not a url',
		});
	});

	test('normalizes permissions into a dot-path managed setting', () => {
		assert.deepStrictEqual(adaptManagedSettings({
			permissions: { disableBypassPermissionsMode: 'disable' },
		}), {
			managedSettings: {
				'permissions.disableBypassPermissionsMode': 'disable',
			},
		});
	});

	test('parses the stable compatibility error and optional versions', () => {
		assert.deepStrictEqual(parseManagedSettingsCompatibilityError({
			error_code: 'client_update_required',
			client_id: 'vscode',
			client_version: '1.132.0',
			minimum_client_version: '1.133.0',
		}), {
			errorCode: 'client_update_required',
			clientVersion: '1.132.0',
			minimumClientVersion: '1.133.0',
		});
	});

	test('rejects an unrecognized compatibility error shape', () => {
		assert.strictEqual(parseManagedSettingsCompatibilityError({ error_code: 'unexpected' }), undefined);
	});

	test('carries enabledPlugins as a canonical JSON string under a single key', () => {
		const response: IManagedSettingsResponse = {
			enabledPlugins: {
				'assign-issue-to-copilot@agent-skills': true,
				'my-plugin@acme': false,
			},
		};
		assert.deepStrictEqual(adaptManagedSettings(response), {
			managedSettings: {
				enabledPlugins: '{"assign-issue-to-copilot@agent-skills":true,"my-plugin@acme":false}',
			},
		});
	});

	test('carries strictKnownMarketplaces as a canonical JSON string under a single key', () => {
		assert.deepStrictEqual(adaptManagedSettings({
			strictKnownMarketplaces: [{ source: 'github', repo: 'rwoll/markdown-review' }],
		}), {
			managedSettings: {
				strictKnownMarketplaces: '[{"source":"github","repo":"rwoll/markdown-review"}]',
			},
		});
	});

	test('carries an empty strictKnownMarketplaces array (lockdown) as a JSON string', () => {
		assert.deepStrictEqual(adaptManagedSettings({ strictKnownMarketplaces: [] }), {
			managedSettings: { strictKnownMarketplaces: '[]' },
		});
	});

	test('carries allowedMcpServers as a canonical JSON string under a single key', () => {
		assert.deepStrictEqual(adaptManagedSettings({
			allowedMcpServers: [
				{ serverName: 'github' },
				{ serverUrl: 'https://mcp.example.com/*' },
				{ serverCommand: ['npx', '-y', 'server'] },
			],
		}), {
			managedSettings: {
				allowedMcpServers: '[{"serverName":"github"},{"serverUrl":"https://mcp.example.com/*"},{"serverCommand":["npx","-y","server"]}]',
			},
		});
	});

	test('carries an empty allowedMcpServers array as a JSON string', () => {
		assert.deepStrictEqual(adaptManagedSettings({ allowedMcpServers: [] }), {
			managedSettings: { allowedMcpServers: '[]' },
		});
	});

	test('carries deniedMcpServers as a canonical JSON string under a single key', () => {
		assert.deepStrictEqual(adaptManagedSettings({
			deniedMcpServers: [
				{ serverName: 'blocked' },
				{ serverUrl: 'https://*.untrusted.example.com/*' },
			],
		}), {
			managedSettings: {
				deniedMcpServers: '[{"serverName":"blocked"},{"serverUrl":"https://*.untrusted.example.com/*"}]',
			},
		});
	});

	test('carries customization lockdown controls', () => {
		assert.deepStrictEqual(adaptManagedSettings({
			strictPluginOnlyCustomization: true,
			allowManagedMcpServersOnly: true,
			allowManagedHooksOnly: true,
			forceRemoteSettingsRefresh: true,
		}), {
			managedSettings: {
				strictPluginOnlyCustomization: true,
				allowManagedMcpServersOnly: true,
				allowManagedHooksOnly: true,
				forceRemoteSettingsRefresh: true,
			},
		});
	});

	test('flattens scalar telemetry leaves and carries resourceAttributes and headers as single JSON keys', () => {
		assert.deepStrictEqual(adaptManagedSettings({
			telemetry: {
				enabled: true,
				serviceName: 'acme-copilot',
				resourceAttributes: { 'deployment.environment': 'prod', 'service.namespace': 'acme' },
				headers: { 'x-api-key': 'secret' },
			},
		}), {
			managedSettings: {
				'telemetry.enabled': true,
				'telemetry.serviceName': 'acme-copilot',
				'telemetry.resourceAttributes': '{"deployment.environment":"prod","service.namespace":"acme"}',
				'telemetry.headers': '{"x-api-key":"secret"}',
			},
		});
	});

	test('encodes github marketplaces as a { name: shorthand } JSON dict', () => {
		assert.deepStrictEqual(adaptManagedSettings({
			extraKnownMarketplaces: {
				'a': { source: { source: 'github', repo: 'github/agent-skills' } },
				'b': { source: { source: 'github', repo: 'acme/things', ref: 'main' } },
			},
		}), {
			managedSettings: {
				extraKnownMarketplaces: '{"a":"github/agent-skills","b":"acme/things#main"}',
			},
		});
	});

	test('encodes git marketplaces as a { name: url } JSON dict', () => {
		assert.deepStrictEqual(adaptManagedSettings({
			extraKnownMarketplaces: {
				'a': { source: { source: 'git', url: 'https://example.com/repo.git' } },
				'b': { source: { source: 'git', url: 'ssh://git@host/path.git', ref: 'v1' } },
			},
		}), {
			managedSettings: {
				extraKnownMarketplaces: '{"a":"https://example.com/repo.git","b":"ssh://git@host/path.git#v1"}',
			},
		});
	});

	test('encodes mixed github + git marketplaces, dedups by name', () => {
		assert.deepStrictEqual(adaptManagedSettings({
			extraKnownMarketplaces: {
				'a': { source: { source: 'github', repo: 'a/b' } },
				'b': { source: { source: 'git', url: 'https://example.com/r.git' } },
			},
		}), {
			managedSettings: {
				extraKnownMarketplaces: '{"a":"a/b","b":"https://example.com/r.git"}',
			},
		});
	});

	test('handles a full populated response (all three structured settings together)', () => {
		assert.deepStrictEqual(adaptManagedSettings({
			enabledPlugins: { 'p@m': true },
			extraKnownMarketplaces: {
				'a': { source: { source: 'github', repo: 'a/b', ref: 'r' } },
			},
			strictKnownMarketplaces: [{ source: 'github', repo: 'a/b' }],
		}), {
			managedSettings: {
				strictKnownMarketplaces: '[{"source":"github","repo":"a/b"}]',
				enabledPlugins: '{"p@m":true}',
				extraKnownMarketplaces: '{"a":"a/b#r"}',
			},
		});
	});

	test('resilience: unknown scalar keys flatten into the bag alongside structured keys', () => {
		assert.deepStrictEqual(adaptManagedSettings({
			enabledPlugins: { 'p@m': true },
			strictKnownMarketplaces: [],
			joshsFakeSetting: true,
		} as IManagedSettingsResponse), {
			managedSettings: {
				strictKnownMarketplaces: '[]',
				joshsFakeSetting: true,
				enabledPlugins: '{"p@m":true}',
			},
		});
	});

	test('resilience: a server-sent own `__proto__` key is carried like any scalar, never applied to the prototype', () => {
		// JSON.parse (not an object literal) yields an OWN enumerable `__proto__` data property.
		// The scalar remainder must keep `{ ...rest }` semantics: copy it as data (so it flattens
		// to `__proto__.polluted`) rather than assigning through the inherited `__proto__` setter
		// (which would swap the prototype and instead surface the inherited `polluted` key).
		const response = JSON.parse('{"permissions":{"x":1},"__proto__":{"polluted":true}}') as IManagedSettingsResponse;
		assert.deepStrictEqual(adaptManagedSettings(response), {
			managedSettings: {
				'permissions.x': 1,
				'__proto__.polluted': true,
			},
		});
	});

	test('resilience: a primitive own `__proto__` scalar is dropped, never pollutes the result', () => {
		// The reviewer-flagged case. flattenManagedSettings only assigns at the bare `__proto__`
		// key when the value is a PRIMITIVE, where the inherited `__proto__` setter is a no-op, so
		// the value is simply dropped (no prototype mutation), matching the original `...rest`.
		const response = JSON.parse('{"permissions":{"x":1},"__proto__":true}') as IManagedSettingsResponse;
		assert.deepStrictEqual(adaptManagedSettings(response), {
			managedSettings: {
				'permissions.x': 1,
			},
		});
	});

	test('resilience: malformed marketplace entries are skipped, valid entries still processed', () => {
		const warnings: string[] = [];
		const result = adaptManagedSettings({
			extraKnownMarketplaces: {
				'good': { source: { source: 'github', repo: 'a/b' } },
				'bad-no-source': {} as IManagedSettingsResponse['extraKnownMarketplaces'] extends Record<string, infer V> ? V : never,
				'bad-unknown-type': { source: { source: 'ftp', url: 'ftp://x' } } as IManagedSettingsResponse['extraKnownMarketplaces'] extends Record<string, infer V> ? V : never,
			},
		} as IManagedSettingsResponse, msg => warnings.push(msg));
		assert.deepStrictEqual(result, {
			managedSettings: {
				extraKnownMarketplaces: '{"good":"a/b"}',
			},
		});
		assert.strictEqual(warnings.length, 2);
	});

	test('resilience: extraKnownMarketplaces github entry missing "repo" is skipped with a warning', () => {
		const warnings: string[] = [];
		const result = adaptManagedSettings({
			extraKnownMarketplaces: {
				'example-key': { source: { source: 'github' } } as IManagedSettingsResponse['extraKnownMarketplaces'] extends Record<string, infer V> ? V : never,
			},
		} as IManagedSettingsResponse, msg => warnings.push(msg));
		assert.deepStrictEqual(
			{ result, warned: warnings.length, mentionsRepo: warnings.some(w => w.includes('requires "repo"')) },
			{ result: { managedSettings: {} }, warned: 1, mentionsRepo: true }
		);
	});

	test('resilience: a marketplace string array (wrong format) is treated as missing, no throw', () => {
		assert.deepStrictEqual(adaptManagedSettings({
			extraKnownMarketplaces: ['https://plugins.acme.com'] as unknown as IManagedSettingsResponse['extraKnownMarketplaces'],
		} as IManagedSettingsResponse), {
			managedSettings: {},
		});
	});

	test('resilience: telemetry map keys that could pollute the prototype are dropped', () => {
		// JSON.parse yields an OWN enumerable `__proto__` data property on the nested map.
		const response = JSON.parse('{"telemetry":{"resourceAttributes":{"__proto__":"polluted","constructor":"x","service.namespace":"acme"}}}') as IManagedSettingsResponse;
		assert.deepStrictEqual(adaptManagedSettings(response), {
			managedSettings: {
				'telemetry.resourceAttributes': '{"service.namespace":"acme"}',
			},
		});
		assert.strictEqual(({} as Record<string, unknown>).polluted, undefined);
	});
});
