/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { AllowedMcpServersService } from '../../common/allowedMcpServersService.js';
import { GalleryMcpServerStatus, IGalleryMcpServer, IGalleryMcpServerConfiguration, IInstallableMcpServer, mcpAccessConfig, mcpAllowedServersConfig, mcpDeniedServersConfig, McpAccessValue, RegistryType, TransportType } from '../../common/mcpManagement.js';
import { McpServerType } from '../../common/mcpPlatformTypes.js';
import { COPILOT_ALLOW_MANAGED_MCP_SERVERS_ONLY_CONFIG } from '../../../policy/common/copilotManagedSettings.js';
import { IConfigurationValue } from '../../../configuration/common/configuration.js';
import { createEnvVarResolver } from '../../common/envVarResolution.js';

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

	suite('gallery command admission', () => {
		function gallery(configuration: IGalleryMcpServerConfiguration): IGalleryMcpServer {
			return {
				name: 'microsoft/playwright-mcp', displayName: 'Playwright', description: '', publisher: 'microsoft',
				version: '1.0.0', isLatest: true, status: GalleryMcpServerStatus.Active, configuration,
			};
		}

		for (const [registryType, command] of [
			[RegistryType.NODE, ['npx', '--registry', 'https://registry.example', 'server@1.2.3']],
			[RegistryType.PYTHON, ['uvx', '--index-url', 'https://registry.example', 'server@1.2.3']],
			[RegistryType.DOCKER, ['docker', 'run', '-i', '--rm', 'https://registry.example/server:1.2.3']],
			[RegistryType.NUGET, ['dnx', 'server@1.2.3', '--yes', '--source', 'https://registry.example']],
		] as const) {
			test(`uses installation's ${registryType} command, arguments, version and registry`, () => {
				const server = gallery({
					packages: [{
						registryType, identifier: 'server', version: '1.2.3', registryBaseUrl: 'https://registry.example', transport: { type: TransportType.STDIO },
					}]
				});
				const approved = createService({ [mcpAllowedServersConfig]: [{ serverCommand: command }] });
				const wrongVersion = createService({ [mcpAllowedServersConfig]: [{ serverCommand: command.map(part => part.replace('1.2.3', '2.0.0')) }] });
				const denied = createService({ [mcpAllowedServersConfig]: [{ serverCommand: command }], [mcpDeniedServersConfig]: [{ serverCommand: command }] });
				assert.deepStrictEqual([approved, wrongVersion, denied].map(service => service.isAllowed(server) === true), [true, false, false]);
			});
		}

		test('evaluates every package and remote candidate without authorizing a different final configuration', () => {
			const service = createService({ [mcpAllowedServersConfig]: [{ serverName: 'microsoft/playwright-mcp' }, { serverCommand: ['npx', '@playwright/mcp@latest'] }, { serverUrl: 'https://approved.example/mcp' }] });
			const configuration: IGalleryMcpServerConfiguration = {
				packages: [
					{ registryType: RegistryType.NODE, identifier: 'unapproved', transport: { type: TransportType.STDIO } },
					{ registryType: RegistryType.NODE, identifier: '@playwright/mcp', version: 'latest', transport: { type: TransportType.STDIO } },
				],
				remotes: [
					{ type: TransportType.STREAMABLE_HTTP, url: 'https://unapproved.example/mcp' },
					{ type: TransportType.STREAMABLE_HTTP, url: 'https://approved.example/mcp' },
				],
			};
			assert.deepStrictEqual([
				service.isAllowed(gallery(configuration)) === true,
				service.isAllowed(gallery({ packages: configuration.packages })) === true,
				service.isAllowed(gallery({ remotes: configuration.remotes })) === true,
				service.isAllowed(gallery({ packages: configuration.packages?.slice(0, 1), remotes: configuration.remotes?.slice(0, 1) })) === true,
				service.isServerAllowed({ name: 'microsoft/playwright-mcp', command: ['npx', 'unapproved'] }) === true,
				service.isServerAllowed({ name: 'microsoft/playwright-mcp', url: 'https://unapproved.example/mcp' }) === true,
			], [true, true, true, false, false, false]);
		});

		test('uses runtime and package arguments and defers only unresolved inputs', () => {
			const service = createService({ [mcpAllowedServersConfig]: [{ serverCommand: ['npx', '-y', 'server', '--mode', 'approved'] }] });
			const server = (value?: string) => gallery({
				packages: [{
					registryType: RegistryType.NODE, identifier: 'server', transport: { type: TransportType.STDIO },
					runtimeArguments: [{ type: 'positional', value: '-y' }],
					packageArguments: [{ type: 'named', name: '--mode', value, description: 'Mode' }],
				}]
			});
			assert.deepStrictEqual([
				service.isAllowed(server('approved')) === true,
				service.isAllowed(server('other')) === true,
				service.isAllowed(server()) === true,
				service.isServerAllowed({ name: 'server', command: ['npx', '-y', 'server', '--mode', 'other'] }) === true,
				service.isServerAllowed({ name: 'server', command: ['npx', '-y', 'server', '--mode', 'approved'] }) === true,
			], [true, false, true, false, true]);
		});

		test('reports invalid gallery configurations without admitting another candidate', () => {
			const service = createService({ [mcpAllowedServersConfig]: [{ serverCommand: ['npx', 'approved'] }] });
			const server = gallery({
				remotes: [{
					type: TransportType.STREAMABLE_HTTP,
					url: 'https://{host}/mcp',
					variables: { host: { description: 'URL host' } },
					headers: [{ name: 'X-Host', value: '{host}', variables: { host: { description: 'Header host' } } }],
				}],
				packages: [{ registryType: RegistryType.NODE, identifier: 'approved', transport: { type: TransportType.STDIO } }],
			});
			const result = service.isAllowed(server);
			assert.deepStrictEqual({
				allowed: result === true,
				invalidManifest: result !== true && result.value.includes('gallery&nbsp;configuration&nbsp;is&nbsp;invalid'),
				conflict: result !== true && result.value.includes('conflicting&nbsp;definitions'),
			}, { allowed: false, invalidManifest: true, conflict: true });
		});

		test('does not normalize executable wrappers or add npm arguments to satisfy a policy', () => {
			const server = gallery({
				packages: [{
					registryType: RegistryType.NODE, identifier: '@playwright/mcp', version: 'latest', transport: { type: TransportType.STDIO },
				}]
			});
			assert.deepStrictEqual([
				['npx', '@playwright/mcp@latest'],
				['npx', '-y', '@playwright/mcp@latest'],
				['cmd', '/c', 'npx', '@playwright/mcp@latest'],
			].map(serverCommand => createService({ [mcpAllowedServersConfig]: [{ serverCommand }] }).isAllowed(server) === true), [true, false, false]);
		});
	});

	test('expands policy values on the executing host and fails closed without the resolved values', () => {
		const service = createService({
			[mcpAllowedServersConfig]: [{ serverName: 'server' }, { serverCommand: ['${RUNTIME}', '${SCRIPT:-approved.js}'] }],
			[mcpDeniedServersConfig]: [{ serverCommand: ['${RUNTIME}', 'blocked.js'] }],
		});
		const values = service.getServerPolicyVariableValues();
		const resolve = createEnvVarResolver({ RUNTIME: '/remote/node' }, false);
		const policyValues = Object.fromEntries(values.map(value => [value, resolve(value)]));
		const identity = { name: 'server', command: ['/remote/node', 'approved.js'], policyValues };
		assert.deepStrictEqual({
			values,
			preliminary: service.isServerAllowedBeforeResolution({ name: 'server', command: ['${input:runtime}', '${input:script}'] }) === true,
			unresolved: service.isServerAllowed({ ...identity, policyValues: undefined }) === true,
			approved: service.isServerAllowed(identity) === true,
			otherHost: service.isServerAllowed({ ...identity, command: ['/local/node', 'approved.js'] }) === true,
			denied: service.isServerAllowed({ ...identity, command: ['/remote/node', 'blocked.js'] }) === true,
		}, {
			values: ['${RUNTIME}', '${SCRIPT:-approved.js}'],
			preliminary: true, unresolved: false, approved: true, otherHost: false, denied: false,
		});
	});

	test('explains why a matching name does not admit a nonmatching command or URL', () => {
		const service = createService({
			[mcpAllowedServersConfig]: [
				{ serverName: 'approved' },
				{ serverCommand: ['node', 'approved.js'] },
				{ serverUrl: 'https://approved.example/mcp' },
			],
		});
		const commandResult = service.isServerAllowed({ name: 'approved', command: ['node', 'other.js'] });
		const urlResult = service.isServerAllowed({ name: 'approved', url: 'https://other.example/mcp' });
		assert.deepStrictEqual({
			command: commandResult !== true && commandResult.value.includes('this allowlist contains command entries'),
			url: urlResult !== true && urlResult.value.includes('this allowlist contains URL entries'),
		}, { command: true, url: true });
	});

	test('defers unknown transport details without bypassing known name denials or final rules', () => {
		const allowlist = [
			{ serverName: 'approved' },
			{ serverCommand: ['node', 'approved.js'] },
			{ serverUrl: 'https://approved.example/mcp' },
		];
		const service = createService({ [mcpAllowedServersConfig]: allowlist });
		const denied = createService({ [mcpAllowedServersConfig]: allowlist, [mcpDeniedServersConfig]: [{ serverName: 'approved' }] });
		const unresolved = [
			{ name: 'approved', command: ['node', '${input:script}'] },
			{ name: 'approved', url: 'https://${input:host}/mcp' },
		];
		assert.deepStrictEqual({
			preliminary: unresolved.map(identity => service.isServerAllowedBeforeResolution(identity) === true),
			denied: unresolved.map(identity => denied.isServerAllowedBeforeResolution(identity) === true),
			resolved: [
				{ name: 'approved', command: ['node', 'other.js'] },
				{ name: 'approved', url: 'https://other.example/mcp' },
			].map(identity => service.isServerAllowed(identity) === true),
		}, { preliminary: [true, true], denied: [false, false], resolved: [false, false] });
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
