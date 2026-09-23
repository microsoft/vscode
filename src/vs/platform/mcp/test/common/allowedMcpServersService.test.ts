/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { AllowedMcpServersService } from '../../common/allowedMcpServersService.js';
import { GalleryMcpServerStatus, IGalleryMcpServer, IInstallableMcpServer, mcpAccessConfig, mcpAllowedServersConfig, mcpDeniedServersConfig, McpAccessValue, TransportType } from '../../common/mcpManagement.js';
import { McpServerType } from '../../common/mcpPlatformTypes.js';
import { COPILOT_ALLOW_MANAGED_MCP_SERVERS_ONLY_CONFIG } from '../../../policy/common/copilotManagedSettings.js';
import { IConfigurationValue } from '../../../configuration/common/configuration.js';

suite('AllowedMcpServersService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(config: Record<string, unknown>, policy: Record<string, unknown> = {}): AllowedMcpServersService {
		const configurationService = new TestConfigurationService(config);
		const inspect = configurationService.inspect.bind(configurationService);
		configurationService.inspect = <T>(key: string): IConfigurationValue<T> => ({
			...inspect<T>(key),
			policyValue: policy[key] as T | undefined,
		});
		return disposables.add(new AllowedMcpServersService(configurationService));
	}

	test('allows any server when nothing is configured', () => {
		const service = createService({});
		assert.strictEqual(service.isServerAllowed({ name: 'github' }), true);
	});

	test('blocks all servers when access is None', () => {
		const service = createService({ [mcpAccessConfig]: McpAccessValue.None });
		const result = service.isServerAllowed({ name: 'github' });
		assert.notStrictEqual(result, true);
	});

	test('allowlist permits only matching servers', () => {
		const service = createService({ [mcpAllowedServersConfig]: [{ serverName: 'github' }] });
		assert.strictEqual(service.isServerAllowed({ name: 'github' }), true);

		const result = service.isServerAllowed({ name: 'gitlab' });
		assert.notStrictEqual(result, true);
		assert.ok(result !== true && result.value.includes('not in the list of servers allowed by your organization'));
	});

	test('denylist blocks a matching server even when it is also allowed', () => {
		const service = createService({
			[mcpAllowedServersConfig]: [{ serverName: 'github' }],
			[mcpDeniedServersConfig]: [{ serverName: 'github' }],
		});

		const result = service.isServerAllowed({ name: 'github' });
		assert.notStrictEqual(result, true);
		assert.ok(result !== true && result.value.includes('blocked by your organization'));
	});

	test('denylist blocks by remote URL wildcard even without an allowlist', () => {
		const service = createService({ [mcpDeniedServersConfig]: [{ serverUrl: 'https://*.untrusted.example.com/*' }] });

		const denied = service.isServerAllowed({ name: 's', url: 'https://api.untrusted.example.com/mcp' });
		assert.notStrictEqual(denied, true);
		assert.strictEqual(service.isServerAllowed({ name: 's', url: 'https://api.trusted.example.com/mcp' }), true);
	});

	suite('URL policy resolution', () => {
		test('preliminary checks do not defer incomplete variable markers', () => {
			const service = createService({
				[mcpAllowedServersConfig]: [{ serverUrl: 'https://trusted.example/mcp' }],
				[mcpDeniedServersConfig]: [{ serverUrl: 'https://blocked.example/*' }],
			});
			const fragments = ['${', '${input:host', '${outer{inner}'];
			assert.deepStrictEqual(
				fragments.map(fragment => ['trusted.example', 'blocked.example', 'other.example'].map(host => service.isAllowed({
					name: 'server',
					config: { type: McpServerType.REMOTE, url: `https://${host}/mcp#${fragment}` }
				}) === true)),
				fragments.map(() => [true, false, false])
			);
		});

		test('preliminary checks preserve balanced and nested variable deferral', () => {
			const service = createService({
				[mcpAllowedServersConfig]: [{ serverUrl: 'https://trusted.example/mcp' }],
				[mcpDeniedServersConfig]: [{ serverUrl: 'https://blocked.example/*' }],
			});
			const variables = ['${input:host}', '${input:${env:HOST}}', '${incomplete${env:HOST}'];
			assert.deepStrictEqual(
				variables.map(variable => service.isAllowed({
					name: 'server',
					config: { type: McpServerType.REMOTE, url: `https://blocked.example/${variable}` }
				}) === true),
				variables.map(() => true)
			);
		});

		for (const fragment of ['${', '${input:literal}']) {
			test(`enforces the resolved URL allowlist with fragment ${fragment}`, () => {
				const service = createService({
					[mcpAllowedServersConfig]: [{ serverUrl: 'https://trusted.example/mcp' }],
					[mcpDeniedServersConfig]: [{ serverUrl: 'https://blocked.example/*' }],
				});

				const result = service.isServerAllowed({ name: 'server', url: `https://attacker.example/mcp#${fragment}` });
				assert.strictEqual(result !== true && result.value.includes('not in the list of servers allowed by your organization'), true);
			});

			test(`enforces the resolved URL denylist with fragment ${fragment}`, () => {
				const service = createService({
					[mcpAllowedServersConfig]: [{ serverUrl: 'https://trusted.example/mcp' }],
					[mcpDeniedServersConfig]: [{ serverUrl: 'https://blocked.example/*' }],
				});

				const result = service.isServerAllowed({ name: 'server', url: `https://blocked.example/mcp#${fragment}` });
				assert.strictEqual(result !== true && result.value.includes('blocked by your organization'), true);
			});
		}

		test('enforces resolved URL denies without an allowlist', () => {
			const service = createService({ [mcpDeniedServersConfig]: [{ serverUrl: 'https://blocked.example/*' }] });
			const result = service.isServerAllowed({ name: 'server', url: 'https://blocked.example/mcp#${' });

			assert.strictEqual(result !== true && result.value.includes('blocked by your organization'), true);
		});

		test('preserves allowed URLs, name rules, and disabled access', () => {
			const identity = { name: 'server', url: 'https://trusted.example/mcp#${' };
			const allowedByUrl = createService({ [mcpAllowedServersConfig]: [{ serverUrl: 'https://trusted.example/mcp' }] });
			const allowedByName = createService({ [mcpAllowedServersConfig]: [{ serverName: identity.name }] });
			const deniedByName = createService({ [mcpDeniedServersConfig]: [{ serverName: identity.name }] });
			const disabled = createService({ [mcpAccessConfig]: McpAccessValue.None });

			assert.deepStrictEqual({
				ordinaryUrl: allowedByUrl.isServerAllowed({ ...identity, url: 'https://trusted.example/mcp' }) === true,
				literalFragment: allowedByUrl.isServerAllowed(identity) === true,
				allowedByName: allowedByName.isServerAllowed(identity) === true,
				deniedByName: deniedByName.isServerAllowed(identity) === true,
				disabled: disabled.isServerAllowed(identity) === true,
			}, {
				ordinaryUrl: true,
				literalFragment: true,
				allowedByName: true,
				deniedByName: false,
				disabled: false,
			});
		});

		test('preserves preliminary URL deferral without deferring names or disabled access', () => {
			const server: IInstallableMcpServer = {
				name: 'server',
				config: { type: McpServerType.REMOTE, url: 'https://${input:host}/mcp' },
			};
			const allowedByUrl = createService({ [mcpAllowedServersConfig]: [{ serverUrl: 'https://trusted.example/mcp' }] });
			const deniedByUrl = createService({ [mcpDeniedServersConfig]: [{ serverUrl: 'https://blocked.example/*' }] });
			const allowedByName = createService({ [mcpAllowedServersConfig]: [{ serverName: server.name }] });
			const allowedByOtherName = createService({ [mcpAllowedServersConfig]: [{ serverName: 'other' }] });
			const deniedByName = createService({ [mcpDeniedServersConfig]: [{ serverName: server.name }] });
			const disabled = createService({ [mcpAccessConfig]: McpAccessValue.None });

			assert.deepStrictEqual({
				allowedByUrl: allowedByUrl.isAllowed(server) === true,
				deniedByUrl: deniedByUrl.isAllowed(server) === true,
				allowedByName: allowedByName.isAllowed(server) === true,
				allowedByOtherName: allowedByOtherName.isAllowed(server) === true,
				deniedByName: deniedByName.isAllowed(server) === true,
				disabled: disabled.isAllowed(server) === true,
			}, {
				allowedByUrl: true,
				deniedByUrl: true,
				allowedByName: true,
				allowedByOtherName: false,
				deniedByName: false,
				disabled: false,
			});
		});
	});

	test('isAllowed matches an installable stdio server by its command', () => {
		const service = createService({ [mcpAllowedServersConfig]: [{ serverCommand: ['npx', '-y', 'server'] }] });

		const allowed: IInstallableMcpServer = { name: 'anything', config: { type: McpServerType.LOCAL, command: 'npx', args: ['-y', 'server'] } };
		assert.strictEqual(service.isAllowed(allowed), true);

		const blocked: IInstallableMcpServer = { name: 'anything', config: { type: McpServerType.LOCAL, command: 'npx', args: ['other'] } };
		assert.notStrictEqual(service.isAllowed(blocked), true);
	});

	test('preliminary command checks defer variable-dependent rules but not access or names', () => {
		const server: IInstallableMcpServer = {
			name: 'server',
			config: { type: McpServerType.LOCAL, command: 'node', args: ['${input:script}'] },
		};
		const allowedByCommand = createService({ [mcpAllowedServersConfig]: [{ serverCommand: ['node', 'allowed.js'] }] });
		const deniedByCommand = createService({ [mcpDeniedServersConfig]: [{ serverCommand: ['node', 'blocked.js'] }] });
		const deniedByName = createService({
			[mcpAllowedServersConfig]: [{ serverCommand: ['node', 'allowed.js'] }],
			[mcpDeniedServersConfig]: [{ serverName: server.name }],
		});
		const otherName = createService({ [mcpAllowedServersConfig]: [{ serverName: 'other' }] });
		const onlyUrl = createService({ [mcpAllowedServersConfig]: [{ serverUrl: 'https://trusted.example/mcp' }] });
		const disabled = createService({ [mcpAccessConfig]: McpAccessValue.None });
		assert.deepStrictEqual({
			allowedByCommand: allowedByCommand.isAllowed(server) === true,
			deniedByCommand: deniedByCommand.isAllowed(server) === true,
			deniedByName: deniedByName.isAllowed(server) === true,
			otherName: otherName.isAllowed(server) === true,
			onlyUrl: onlyUrl.isAllowed(server) === true,
			disabled: disabled.isAllowed(server) === true,
			incompleteLiteral: allowedByCommand.isAllowed({ name: 'server', config: { type: McpServerType.LOCAL, command: 'node', args: ['${'] } }) === true,
			resolvedDenied: deniedByCommand.isServerAllowed({ name: 'server', command: ['node', 'blocked.js'] }) === true,
		}, {
			allowedByCommand: true,
			deniedByCommand: true,
			deniedByName: false,
			otherName: false,
			onlyUrl: false,
			disabled: false,
			incompleteLiteral: false,
			resolvedDenied: false,
		});
	});

	test('isAllowed matches an installable remote server by its URL', () => {
		const service = createService({ [mcpAllowedServersConfig]: [{ serverUrl: 'https://mcp.example.com/*' }] });

		const allowed: IInstallableMcpServer = { name: 'anything', config: { type: McpServerType.REMOTE, url: 'https://mcp.example.com/api' } };
		assert.strictEqual(service.isAllowed(allowed), true);

		const blocked: IInstallableMcpServer = { name: 'anything', config: { type: McpServerType.REMOTE, url: 'https://other.example.org/api' } };
		assert.notStrictEqual(service.isAllowed(blocked), true);
	});

	test('isAllowed defers URL policies for installable remote servers with unresolved inputs', () => {
		const server: IInstallableMcpServer = {
			name: 'templated',
			config: { type: McpServerType.REMOTE, url: 'https://${input:environment}.example.com/mcp' }
		};
		const allowedByUrl = createService({ [mcpAllowedServersConfig]: [{ serverUrl: 'https://allowed.example.com/*' }] });
		const deniedByUrl = createService({ [mcpDeniedServersConfig]: [{ serverUrl: 'https://denied.example.com/*' }] });
		const allowedByDifferentName = createService({ [mcpAllowedServersConfig]: [{ serverName: 'different' }] });
		const deniedByName = createService({ [mcpDeniedServersConfig]: [{ serverName: server.name }] });

		assert.deepStrictEqual({
			allowedByUrl: allowedByUrl.isAllowed(server) === true,
			deniedByUrl: deniedByUrl.isAllowed(server) === true,
			allowedByDifferentName: allowedByDifferentName.isAllowed(server) === true,
			deniedByName: deniedByName.isAllowed(server) === true,
		}, {
			allowedByUrl: true,
			deniedByUrl: true,
			allowedByDifferentName: false,
			deniedByName: false,
		});
	});

	test('isAllowed normalizes gallery URL variables before applying policy', () => {
		const createGallery = (value?: string): IGalleryMcpServer => ({
			name: 'templated',
			displayName: 'Templated',
			description: '',
			version: '1.0.0',
			isLatest: true,
			status: GalleryMcpServerStatus.Active,
			publisher: 'test',
			configuration: {
				remotes: [{
					type: TransportType.STREAMABLE_HTTP,
					url: 'https://{environment}.example.com/mcp',
					variables: { environment: value === undefined ? { description: 'Environment' } : { value } }
				}]
			}
		});
		const allowedByUrl = createService({ [mcpAllowedServersConfig]: [{ serverUrl: 'https://allowed.example.com/*' }] });
		const deniedByUrl = createService({ [mcpDeniedServersConfig]: [{ serverUrl: 'https://denied.example.com/*' }] });

		assert.deepStrictEqual({
			interactiveAllowed: allowedByUrl.isAllowed(createGallery()) === true,
			fixedAllowed: allowedByUrl.isAllowed(createGallery('allowed')) === true,
			fixedDenied: deniedByUrl.isAllowed(createGallery('denied')) === true,
		}, {
			interactiveAllowed: true,
			fixedAllowed: true,
			fixedDenied: false,
		});
	});

	test('managed-only mode ignores user allow entries and uses the policy allowlist', () => {
		const service = createService({
			[COPILOT_ALLOW_MANAGED_MCP_SERVERS_ONLY_CONFIG]: true,
			[mcpAllowedServersConfig]: [{ serverName: 'user-server' }],
		}, {
			[mcpAllowedServersConfig]: [{ serverName: 'managed-server' }],
		});

		assert.strictEqual(service.isServerAllowed({ name: 'managed-server' }), true);
		assert.notStrictEqual(service.isServerAllowed({ name: 'user-server' }), true);
	});

	test('managed-only mode blocks all when no managed allowlist exists and preserves lower-layer denies', () => {
		const service = createService({
			[COPILOT_ALLOW_MANAGED_MCP_SERVERS_ONLY_CONFIG]: true,
			[mcpDeniedServersConfig]: [{ serverName: 'denied' }],
		});

		const denied = service.isServerAllowed({ name: 'denied' });
		assert.notStrictEqual(denied, true);
		assert.ok(denied !== true && denied.value.includes('blocked by your organization'));
		assert.notStrictEqual(service.isServerAllowed({ name: 'other' }), true);
	});
});
