/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentHostSandboxConfigKey, AgentHostSandboxKey, sandboxConfigSchema, type ISandboxConfigValue } from '../../common/sandboxConfigSchema.js';
import { getVSCodeSandboxReadRoots } from '../../common/vscodeSandboxPaths.js';
import { AgentSandboxEnabledValue, type IAgentSandboxUserConfiguredPaths } from '../../../sandbox/common/settings.js';
import { buildSandboxConfigForSdk, type SandboxConfig } from '../../node/copilot/sandboxConfigForSdk.js';

suite('VS Code sandbox read roots', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('grants the local harness its terminal output root', () => {
		const terminalOutputDirectory = URI.file('/cache/terminal-output');
		assert.deepStrictEqual(getVSCodeSandboxReadRoots({ terminalOutputDirectory }), [terminalOutputDirectory]);
	});

	test('grants only the current session attachments and an optional shell init root', () => {
		const sessionDataDirectory = URI.file('/data/agentSessionData/session-1');
		const shellInitDirectory = URI.file('/data/agentHost/shellInit/session-1');
		assert.deepStrictEqual(getVSCodeSandboxReadRoots({ sessionDataDirectory, shellInitDirectory }), [
			URI.file('/data/agentSessionData/session-1/attachments'),
			shellInitDirectory,
		]);
	});

	test('does not grant session storage or host internals by default', () => {
		assert.deepStrictEqual(getVSCodeSandboxReadRoots({}), []);
	});
});

/** Builds the host-side sandbox bag with Copilot user-configured paths. */
function sandbox(
	_platform: NodeJS.Platform,
	enabled: AgentSandboxEnabledValue | undefined,
	fs?: IAgentSandboxUserConfiguredPaths,
	hosts?: { allowedHosts?: readonly string[]; blockedHosts?: readonly string[] },
	allowNetwork?: boolean,
): ISandboxConfigValue | undefined {
	if (!enabled && !fs && !hosts) {
		return undefined;
	}
	const cfg: ISandboxConfigValue = {};
	if (enabled !== undefined) {
		cfg[AgentHostSandboxKey.Enabled] = enabled;
	}
	if (fs) {
		cfg[AgentHostSandboxKey.UserConfiguredPaths] = fs;
	}
	if (hosts?.allowedHosts?.length) {
		cfg[AgentHostSandboxKey.AllowedNetworkDomains] = [...hosts.allowedHosts];
	}
	if (hosts?.blockedHosts?.length) {
		cfg[AgentHostSandboxKey.DeniedNetworkDomains] = [...hosts.blockedHosts];
	}
	if (allowNetwork !== undefined) {
		cfg[AgentHostSandboxKey.AllowNetwork] = allowNetwork;
	}
	return cfg;
}

function expectedSandboxConfig(options?: {
	readwritePaths?: string[];
	readonlyPaths?: string[];
	deniedPaths?: string[];
	allowOutbound?: boolean;
	allowLocalNetwork?: boolean;
	allowedHosts?: string[];
	blockedHosts?: string[];
	allowBypass?: boolean;
	sandboxMcpServers?: boolean;
	sandboxLspServers?: boolean;
	allowDevToolAccess?: boolean;
}): SandboxConfig {
	return {
		enabled: true,
		addCurrentWorkingDirectory: true,
		...(options?.sandboxMcpServers !== undefined ? { sandboxMcpServers: options.sandboxMcpServers } : {}),
		...(options?.sandboxLspServers !== undefined ? { sandboxLspServers: options.sandboxLspServers } : {}),
		...(options?.allowDevToolAccess !== undefined ? { allowDevToolAccess: options.allowDevToolAccess } : {}),
		...(options?.allowBypass !== undefined ? { allowBypass: options.allowBypass } : {}),
		auth: {
			git: true,
			gh: true,
		},
		userPolicy: {
			...(options?.deniedPaths?.length || options?.readonlyPaths?.length || options?.readwritePaths?.length ? {
				filesystem: {
					...(options?.deniedPaths?.length ? { deniedPaths: options.deniedPaths } : {}),
					...(options?.readonlyPaths?.length ? { readonlyPaths: options.readonlyPaths } : {}),
					...(options?.readwritePaths?.length ? { readwritePaths: options.readwritePaths } : {}),
				},
			} : {}),
			...(options?.allowOutbound !== undefined || options?.allowLocalNetwork !== undefined || options?.allowedHosts?.length || options?.blockedHosts?.length ? {
				network: {
					...(options?.allowOutbound !== undefined ? { allowOutbound: options.allowOutbound } : {}),
					...(options?.allowLocalNetwork !== undefined ? { allowLocalNetwork: options.allowLocalNetwork } : {}),
					...(options?.allowedHosts?.length ? { allowedHosts: options.allowedHosts } : {}),
					...(options?.blockedHosts?.length ? { blockedHosts: options.blockedHosts } : {}),
				},
			} : {}),
		},
	};
}

suite('buildSandboxConfigForSdk', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('enablement', () => {
		test('returns undefined when no setting is set', () => {
			assert.strictEqual(buildSandboxConfigForSdk('darwin', undefined), undefined);
			assert.strictEqual(buildSandboxConfigForSdk('win32', undefined), undefined);
		});

		test('returns undefined when the bag is empty', () => {
			assert.strictEqual(buildSandboxConfigForSdk('darwin', {}), undefined);
			assert.strictEqual(buildSandboxConfigForSdk('win32', {}), undefined);
		});

		test('returns undefined for `off`', () => {
			assert.strictEqual(buildSandboxConfigForSdk('darwin', sandbox('darwin', AgentSandboxEnabledValue.Off)), undefined);
			assert.strictEqual(buildSandboxConfigForSdk('win32', sandbox('win32', AgentSandboxEnabledValue.Off)), undefined);
		});

		test('returns undefined for `off` when allowNetwork is set', () => {
			assert.strictEqual(buildSandboxConfigForSdk('darwin', sandbox('darwin', AgentSandboxEnabledValue.Off, undefined, undefined, true)), undefined);
			assert.strictEqual(buildSandboxConfigForSdk('win32', sandbox('win32', AgentSandboxEnabledValue.Off, undefined, undefined, true)), undefined);
		});

		test('enables sandbox for `on` on supported platforms', () => {
			for (const platform of ['darwin', 'linux', 'win32'] as const) {
				assert.deepStrictEqual(buildSandboxConfigForSdk(platform, sandbox(platform, AgentSandboxEnabledValue.On)), expectedSandboxConfig());
			}
		});

		test('enables outbound network through the separate allowNetwork policy', () => {
			for (const platform of ['darwin', 'linux', 'win32'] as const) {
				assert.deepStrictEqual(buildSandboxConfigForSdk(platform, sandbox(platform, AgentSandboxEnabledValue.On, undefined, undefined, true)), expectedSandboxConfig({ allowOutbound: true }));
			}
		});

		test('preserves an explicit outbound network restriction', () => {
			for (const platform of ['darwin', 'linux', 'win32'] as const) {
				assert.deepStrictEqual(buildSandboxConfigForSdk(platform, sandbox(platform, AgentSandboxEnabledValue.On, undefined, undefined, false)), expectedSandboxConfig({ allowOutbound: false }));
			}
		});

		test('keeps local network access independent of outbound access and sandbox enablement', () => {
			for (const platform of ['darwin', 'linux', 'win32'] as const) {
				for (const allowNetwork of [false, true]) {
					for (const allowLocalNetwork of [false, true]) {
						const config: ISandboxConfigValue = {
							[AgentHostSandboxKey.AllowNetwork]: allowNetwork,
							[AgentHostSandboxKey.AllowLocalNetwork]: allowLocalNetwork,
						};
						assert.deepStrictEqual([
							buildSandboxConfigForSdk(platform, { ...config, enabled: AgentSandboxEnabledValue.On })?.userPolicy?.network,
							buildSandboxConfigForSdk(platform, { ...config, enabled: AgentSandboxEnabledValue.Off }),
						], [{ allowOutbound: allowNetwork, allowLocalNetwork }, undefined]);
					}
				}
			}
		});

		test('maps the unsandboxed commands setting to SDK bypass', () => {
			assert.deepStrictEqual([
				buildSandboxConfigForSdk('linux', {
					[AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On,
					[AgentHostSandboxKey.AllowUnsandboxedCommands]: true,
				}),
				buildSandboxConfigForSdk('linux', {
					[AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On,
					[AgentHostSandboxKey.AllowUnsandboxedCommands]: false,
				}),
			], [
				expectedSandboxConfig({ allowBypass: true }),
				expectedSandboxConfig({ allowBypass: false }),
			]);
		});

		for (const key of [
			AgentHostSandboxKey.SandboxMcpServers,
			AgentHostSandboxKey.SandboxLspServers,
			AgentHostSandboxKey.AllowDevToolAccess,
			AgentHostSandboxKey.AllowLocalNetwork,
		] as const) {
			test(`omits absent ${key} and forwards explicit choices on every platform`, () => {
				for (const platform of ['linux', 'darwin', 'win32'] as const) {
					assert.deepStrictEqual([undefined, false, true].map(value => buildSandboxConfigForSdk(platform, {
						[AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On,
						[key]: value,
					})), [
						expectedSandboxConfig(),
						expectedSandboxConfig({ [key]: false }),
						expectedSandboxConfig({ [key]: true }),
					]);
				}
			});
		}

		test('uses the unified enable setting on Windows', () => {
			assert.deepStrictEqual(buildSandboxConfigForSdk('win32', {
				[AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On,
			}), expectedSandboxConfig());
		});

		test('does not serialize optional toggles when only enablement is supplied', () => {
			assert.deepStrictEqual(buildSandboxConfigForSdk('linux', { enabled: AgentSandboxEnabledValue.On }), {
				enabled: true,
				addCurrentWorkingDirectory: true,
				auth: { git: true, gh: true },
				userPolicy: {},
			});
		});

		test('defaults credential authentication to true and respects independent choices on every platform', () => {
			for (const platform of ['linux', 'darwin', 'win32'] as const) {
				for (const authenticateGit of [undefined, false, true]) {
					for (const authenticateGh of [undefined, false, true]) {
						const config: ISandboxConfigValue = {
							[AgentHostSandboxKey.AuthenticateGit]: authenticateGit,
							[AgentHostSandboxKey.AuthenticateGh]: authenticateGh,
						};
						assert.deepStrictEqual([
							buildSandboxConfigForSdk(platform, { ...config, enabled: AgentSandboxEnabledValue.On }),
							buildSandboxConfigForSdk(platform, { ...config, enabled: AgentSandboxEnabledValue.Off }),
						], [
							{ ...expectedSandboxConfig(), auth: { git: authenticateGit ?? true, gh: authenticateGh ?? true } },
							undefined,
						]);
					}
				}
			}
		});

		test('validates credential preferences as optional boolean host settings', () => {
			for (const key of [AgentHostSandboxKey.AuthenticateGit, AgentHostSandboxKey.AuthenticateGh]) {
				assert.deepStrictEqual([{}, { [key]: true }, { [key]: false }, { [key]: 'false' }, { [key]: null }]
					.map(config => sandboxConfigSchema.validate(AgentHostSandboxConfigKey.Sandbox, config)), [true, true, true, false, false]);
			}
		});

	});

	suite('filesystem policy', () => {
		test('validates the three optional path lists at the host boundary', () => {
			assert.deepStrictEqual([
				{},
				{ readwritePaths: [], readonlyPaths: ['./read'], deniedPaths: ['./private'] },
				{ readwritePaths: 'not-an-array' },
				{ readonlyPaths: [1] },
				{ deniedPaths: null },
			].map(paths => sandboxConfigSchema.validate(AgentHostSandboxConfigKey.Sandbox, { [AgentHostSandboxKey.UserConfiguredPaths]: paths })),
				[true, true, false, false, false]);
		});

		test('normalizes Windows paths before deduplication without mutating input', () => {
			const fs = {
				readwritePaths: ['C:/work', 'C:\\work', 'C:/private'],
				readonlyPaths: ['C:/read', 'C:\\private'],
				deniedPaths: ['C:/private'],
			};
			const original = JSON.stringify(fs);
			const result = buildSandboxConfigForSdk('win32', sandbox('win32', AgentSandboxEnabledValue.On, fs), ['C:/private', 'C:/work', 'C:/generated']);
			assert.deepStrictEqual({
				filesystem: result?.userPolicy?.filesystem,
				stored: JSON.stringify(fs),
			}, {
				filesystem: { deniedPaths: ['C:\\private'], readonlyPaths: ['C:\\read', 'C:\\generated'], readwritePaths: ['C:\\work'] },
				stored: original,
			});
		});

		test('ignores legacy per-OS paths without fallback or merging', () => {
			const cfg: ISandboxConfigValue = {
				[AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On,
				[AgentHostSandboxKey.LinuxFileSystem]: { allowWrite: ['/linux'] },
				[AgentHostSandboxKey.MacFileSystem]: { allowWrite: ['/mac'] },
				[AgentHostSandboxKey.WindowsFileSystem]: { allowWrite: ['C:\\windows'] },
			};
			for (const platform of ['linux', 'darwin', 'win32'] as const) {
				assert.deepStrictEqual([undefined, {}, { readwritePaths: ['workspace'] }].map(paths =>
					buildSandboxConfigForSdk(platform, { ...cfg, [AgentHostSandboxKey.UserConfiguredPaths]: paths })?.userPolicy?.filesystem),
					[undefined, undefined, { readwritePaths: ['workspace'] }]);
			}
		});

		test('maps each setting to the corresponding SDK list', () => {
			const fs: IAgentSandboxUserConfiguredPaths = {
				readwritePaths: ['/work'],
				readonlyPaths: ['/read'],
				deniedPaths: ['/secret'],
			};
			assert.deepStrictEqual(buildSandboxConfigForSdk('darwin', sandbox('darwin', AgentSandboxEnabledValue.On, fs)), expectedSandboxConfig({
				readwritePaths: ['/work'],
				readonlyPaths: ['/read'],
				deniedPaths: ['/secret'],
			}));
		});

		test('does not add defaults for an empty filesystem policy', () => {
			assert.deepStrictEqual(buildSandboxConfigForSdk('darwin', sandbox('darwin', AgentSandboxEnabledValue.On, {})), expectedSandboxConfig());
		});

		test('denied paths win over every other permission for the same path', () => {
			const fs: IAgentSandboxUserConfiguredPaths = {
				readonlyPaths: ['/p'],
				readwritePaths: ['/p'],
				deniedPaths: ['/p'],
			};
			assert.deepStrictEqual(buildSandboxConfigForSdk('darwin', sandbox('darwin', AgentSandboxEnabledValue.On, fs))?.userPolicy?.filesystem, expectedSandboxConfig({ deniedPaths: ['/p'] }).userPolicy?.filesystem);
		});

		test('read-only wins over read/write for the same path', () => {
			const fs: IAgentSandboxUserConfiguredPaths = {
				readonlyPaths: ['/p'],
				readwritePaths: ['/p'],
			};
			assert.deepStrictEqual(buildSandboxConfigForSdk('darwin', sandbox('darwin', AgentSandboxEnabledValue.On, fs))?.userPolicy?.filesystem, expectedSandboxConfig({ readonlyPaths: ['/p'] }).userPolicy?.filesystem);
		});

		test('deduplicates paths within each permission', () => {
			const fs: IAgentSandboxUserConfiguredPaths = {
				readwritePaths: ['/p', '/p'],
			};
			assert.deepStrictEqual(buildSandboxConfigForSdk('darwin', sandbox('darwin', AgentSandboxEnabledValue.On, fs))?.userPolicy?.filesystem, expectedSandboxConfig({ readwritePaths: ['/p'] }).userPolicy?.filesystem);
		});

		test('keeps distinct paths in their own lists when settings overlap on some paths', () => {
			const fs: IAgentSandboxUserConfiguredPaths = {
				readwritePaths: ['/work', '/shared'],
				readonlyPaths: ['/shared'],
			};
			assert.deepStrictEqual(buildSandboxConfigForSdk('darwin', sandbox('darwin', AgentSandboxEnabledValue.On, fs))?.userPolicy?.filesystem, expectedSandboxConfig({
				readwritePaths: ['/work'],
				readonlyPaths: ['/shared'],
			}).userPolicy?.filesystem);
		});
	});

	suite('network hosts', () => {
		test('forwards host lists as a network policy', () => {
			for (const platform of ['darwin', 'linux'] as const) {
				assert.deepStrictEqual(buildSandboxConfigForSdk(platform, sandbox(platform, AgentSandboxEnabledValue.On, undefined, { allowedHosts: ['github.com'], blockedHosts: ['evil.example'] }))?.userPolicy?.network, {
					allowedHosts: ['github.com'],
					blockedHosts: ['evil.example'],
				}, platform);
			}
		});

		test('allows all outbound network through the separate allowNetwork policy', () => {
			for (const platform of ['darwin', 'linux'] as const) {
				assert.deepStrictEqual(buildSandboxConfigForSdk(platform, sandbox(platform, AgentSandboxEnabledValue.On, undefined, { allowedHosts: ['a.example'], blockedHosts: ['b.example'] }, true))?.userPolicy?.network, {
					allowOutbound: true,
					allowedHosts: ['a.example'],
					blockedHosts: ['b.example'],
				}, platform);
			}
		});

		test('ignores empty host lists', () => {
			assert.deepStrictEqual(buildSandboxConfigForSdk('linux', sandbox('linux', AgentSandboxEnabledValue.On, undefined, { allowedHosts: [], blockedHosts: [] }))?.userPolicy?.network, undefined);
		});
	});

	suite('extraReadonlyPaths', () => {

		test('grants read access to host-generated paths', () => {
			assert.deepStrictEqual(buildSandboxConfigForSdk('linux', sandbox('linux', AgentSandboxEnabledValue.On), ['/data/shellInit/s1'])?.userPolicy?.filesystem, {
				readonlyPaths: ['/data/shellInit/s1'],
			});
		});

		test('keeps user denied paths winning over a host-generated path', () => {
			assert.deepStrictEqual(buildSandboxConfigForSdk('linux', sandbox('linux', AgentSandboxEnabledValue.On, { deniedPaths: ['/data/shellInit/s1'] }), ['/data/shellInit/s1'])?.userPolicy?.filesystem, {
				deniedPaths: ['/data/shellInit/s1'],
			});
		});

		test('does not downgrade a path the user already made readwrite', () => {
			assert.deepStrictEqual(buildSandboxConfigForSdk('linux', sandbox('linux', AgentSandboxEnabledValue.On, { readwritePaths: ['/work'] }), ['/work'])?.userPolicy?.filesystem, {
				readwritePaths: ['/work'],
			});
		});

		test('changes nothing when omitted or empty', () => {
			const base = buildSandboxConfigForSdk('linux', sandbox('linux', AgentSandboxEnabledValue.On, { readonlyPaths: ['/repo'] }));
			assert.deepStrictEqual(buildSandboxConfigForSdk('linux', sandbox('linux', AgentSandboxEnabledValue.On, { readonlyPaths: ['/repo'] }), []), base);
			assert.deepStrictEqual(buildSandboxConfigForSdk('linux', sandbox('linux', AgentSandboxEnabledValue.On, { readonlyPaths: ['/repo'] }), undefined), base);
		});

		test('stays undefined when sandboxing is off, regardless of extra paths', () => {
			assert.strictEqual(buildSandboxConfigForSdk('linux', sandbox('linux', AgentSandboxEnabledValue.Off), ['/data/shellInit/s1']), undefined);
		});
	});
});
