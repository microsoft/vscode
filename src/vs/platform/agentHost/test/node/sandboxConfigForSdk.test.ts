/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentHostSandboxKey, type ISandboxConfigValue } from '../../common/sandboxConfigSchema.js';
import { AgentSandboxEnabledValue } from '../../../sandbox/common/settings.js';
import { buildSandboxConfigForSdk, type CopilotSandboxConfig, type IAgentSandboxFileSystemSetting } from '../../node/copilot/sandboxConfigForSdk.js';

/**
 * Build the host-side `sandbox` root-config bag (the shape the workbench
 * forwarder dispatches in a `RootConfigChanged` action) for the given
 * `enabled` enum + optional per-OS filesystem rules and network host lists.
 *
 * Mirrors the per-OS dispatch in the Copilot extension's
 * `buildSandboxConfigForCLI` tests — the SDK helper consumes the same fields
 * but receives them via the host root bag instead of the per-OS keyed
 * object.
 */
function sandbox(
	platform: NodeJS.Platform,
	enabled: AgentSandboxEnabledValue | undefined,
	fs?: IAgentSandboxFileSystemSetting,
	hosts?: { allowedHosts?: readonly string[]; blockedHosts?: readonly string[] },
	allowNetwork?: boolean,
): ISandboxConfigValue | undefined {
	if (!enabled && !fs && !hosts) {
		return undefined;
	}
	const cfg: ISandboxConfigValue = {};
	if (enabled !== undefined) {
		cfg[platform === 'win32' ? AgentHostSandboxKey.WindowsEnabled : AgentHostSandboxKey.Enabled] = enabled;
	}
	if (fs) {
		const fsKey = platform === 'win32'
			? AgentHostSandboxKey.WindowsFileSystem
			: platform === 'darwin'
				? AgentHostSandboxKey.MacFileSystem
				: AgentHostSandboxKey.LinuxFileSystem;
		cfg[fsKey] = fs as Record<string, unknown>;
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
	hasFileSystemPolicy?: boolean;
	readwritePaths?: string[];
	readonlyPaths?: string[];
	deniedPaths?: string[];
	allowOutbound?: boolean;
	allowBypass?: boolean;
}): CopilotSandboxConfig {
	const hasFileSystemPolicy = options?.hasFileSystemPolicy === true
		|| options?.readwritePaths !== undefined
		|| options?.readonlyPaths !== undefined
		|| options?.deniedPaths !== undefined;
	return {
		enabled: true,
		...(options?.allowBypass !== undefined ? { allowBypass: options.allowBypass } : {}),
		...(hasFileSystemPolicy || options?.allowOutbound !== undefined
			? {
				userPolicy: {
					...(hasFileSystemPolicy
						? {
							filesystem: {
								...(options?.deniedPaths?.length ? { deniedPaths: options.deniedPaths } : {}),
								...(options?.readonlyPaths?.length ? { readonlyPaths: options.readonlyPaths } : {}),
								...(options?.readwritePaths?.length ? { readwritePaths: options.readwritePaths } : {}),
							},
						}
						: {}),
					...(options?.allowOutbound !== undefined
						? { network: { allowOutbound: options.allowOutbound } }
						: {}),
				},
			}
			: {}),
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

		test('prefers the Windows-specific enable setting', () => {
			const cfg: ISandboxConfigValue = {
				[AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.Off,
				[AgentHostSandboxKey.WindowsEnabled]: AgentSandboxEnabledValue.On,
			};
			assert.deepStrictEqual(buildSandboxConfigForSdk('win32', cfg), expectedSandboxConfig());
		});

		test('does not fall back to the non-Windows enable setting on Windows', () => {
			assert.strictEqual(buildSandboxConfigForSdk('win32', {
				[AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On,
			}), undefined);
		});
	});

	suite('filesystem policy', () => {
		test('selects the OS-specific slice from the per-OS filesystem keys', () => {
			const cfg: ISandboxConfigValue = {
				[AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On,
				[AgentHostSandboxKey.WindowsEnabled]: AgentSandboxEnabledValue.On,
				[AgentHostSandboxKey.LinuxFileSystem]: { allowWrite: ['/linux'] },
				[AgentHostSandboxKey.MacFileSystem]: { allowWrite: ['/mac'] },
				[AgentHostSandboxKey.WindowsFileSystem]: { allowWrite: ['C:\\windows'] },
			};
			assert.deepStrictEqual(buildSandboxConfigForSdk('linux', cfg)?.userPolicy?.filesystem, expectedSandboxConfig({ readwritePaths: ['/linux'] }).userPolicy?.filesystem);
			assert.deepStrictEqual(buildSandboxConfigForSdk('darwin', cfg)?.userPolicy?.filesystem, expectedSandboxConfig({ readwritePaths: ['/mac'] }).userPolicy?.filesystem);
			assert.deepStrictEqual(buildSandboxConfigForSdk('win32', cfg)?.userPolicy?.filesystem, expectedSandboxConfig({ readwritePaths: ['C:\\windows'] }).userPolicy?.filesystem);
		});

		test('maps each setting to the corresponding SDK list', () => {
			const fs: IAgentSandboxFileSystemSetting = {
				allowWrite: ['/work'],
				allowRead: ['/read'],
				denyWrite: ['/readonly'],
				denyRead: ['/secret'],
			};
			assert.deepStrictEqual(buildSandboxConfigForSdk('darwin', sandbox('darwin', AgentSandboxEnabledValue.On, fs)), expectedSandboxConfig({
				readwritePaths: ['/work'],
				readonlyPaths: ['/readonly', '/read'],
				deniedPaths: ['/secret'],
			}));
		});

		test('does not add defaults for an empty filesystem policy', () => {
			assert.deepStrictEqual(buildSandboxConfigForSdk('darwin', sandbox('darwin', AgentSandboxEnabledValue.On, {})), expectedSandboxConfig({ hasFileSystemPolicy: true }));
		});

		test('denyRead wins over every other setting for the same path', () => {
			const fs: IAgentSandboxFileSystemSetting = {
				allowRead: ['/p'],
				allowWrite: ['/p'],
				denyWrite: ['/p'],
				denyRead: ['/p'],
			};
			assert.deepStrictEqual(buildSandboxConfigForSdk('darwin', sandbox('darwin', AgentSandboxEnabledValue.On, fs))?.userPolicy?.filesystem, expectedSandboxConfig({ deniedPaths: ['/p'] }).userPolicy?.filesystem);
		});

		test('denyWrite wins over allowWrite / allowRead for the same path', () => {
			const fs: IAgentSandboxFileSystemSetting = {
				allowRead: ['/p'],
				allowWrite: ['/p'],
				denyWrite: ['/p'],
			};
			assert.deepStrictEqual(buildSandboxConfigForSdk('darwin', sandbox('darwin', AgentSandboxEnabledValue.On, fs))?.userPolicy?.filesystem, expectedSandboxConfig({ readonlyPaths: ['/p'] }).userPolicy?.filesystem);
		});

		test('allowWrite wins over allowRead for the same path', () => {
			const fs: IAgentSandboxFileSystemSetting = {
				allowRead: ['/p'],
				allowWrite: ['/p'],
			};
			assert.deepStrictEqual(buildSandboxConfigForSdk('darwin', sandbox('darwin', AgentSandboxEnabledValue.On, fs))?.userPolicy?.filesystem, expectedSandboxConfig({ readwritePaths: ['/p'] }).userPolicy?.filesystem);
		});

		test('keeps distinct paths in their own lists when settings overlap on some paths', () => {
			const fs: IAgentSandboxFileSystemSetting = {
				allowWrite: ['/work', '/shared'],
				denyWrite: ['/shared'],
			};
			assert.deepStrictEqual(buildSandboxConfigForSdk('darwin', sandbox('darwin', AgentSandboxEnabledValue.On, fs))?.userPolicy?.filesystem, expectedSandboxConfig({
				readwritePaths: ['/work'],
				readonlyPaths: ['/shared'],
			}).userPolicy?.filesystem);
		});
	});

	suite('network hosts', () => {
		test('drops host lists without adding a network policy', () => {
			for (const platform of ['darwin', 'linux'] as const) {
				assert.strictEqual(buildSandboxConfigForSdk(platform, sandbox(platform, AgentSandboxEnabledValue.On, undefined, { allowedHosts: ['github.com'], blockedHosts: ['evil.example'] }))?.userPolicy?.network, undefined, platform);
			}
		});

		test('allows all outbound network through the separate allowNetwork policy', () => {
			for (const platform of ['darwin', 'linux'] as const) {
				assert.deepStrictEqual(buildSandboxConfigForSdk(platform, sandbox(platform, AgentSandboxEnabledValue.On, undefined, { allowedHosts: ['a.example'], blockedHosts: ['b.example'] }, true))?.userPolicy?.network, {
					allowOutbound: true,
				}, platform);
			}
		});

		test('ignores empty host lists', () => {
			assert.strictEqual(buildSandboxConfigForSdk('linux', sandbox('linux', AgentSandboxEnabledValue.On, undefined, { allowedHosts: [], blockedHosts: [] }))?.userPolicy?.network, undefined);
		});
	});
});
