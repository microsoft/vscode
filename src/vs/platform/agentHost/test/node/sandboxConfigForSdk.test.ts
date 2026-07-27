/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentHostSandboxKey, type ISandboxConfigValue } from '../../common/sandboxConfigSchema.js';
import { AgentSandboxEnabledValue } from '../../../sandbox/common/settings.js';
import { buildSandboxConfigForSdk, type IAgentSandboxFileSystemSetting } from '../../node/copilot/sandboxConfigForSdk.js';

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
): ISandboxConfigValue | undefined {
	if (!enabled && !fs && !hosts) {
		return undefined;
	}
	const cfg: ISandboxConfigValue = {};
	if (enabled !== undefined) {
		cfg[AgentHostSandboxKey.Enabled] = enabled;
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
	return cfg;
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

		test('enables sandbox for `on` on non-Windows platforms', () => {
			for (const platform of ['darwin', 'linux'] as const) {
				assert.deepStrictEqual(buildSandboxConfigForSdk(platform, sandbox(platform, AgentSandboxEnabledValue.On)), {
					enabled: true,
					allowBypass: true,
					userPolicy: { filesystem: {}, network: { allowOutbound: false } },
				});
			}
		});

		test('enables sandbox and outbound network for `allowNetwork` on non-Windows platforms', () => {
			for (const platform of ['darwin', 'linux'] as const) {
				assert.deepStrictEqual(buildSandboxConfigForSdk(platform, sandbox(platform, AgentSandboxEnabledValue.AllowNetwork)), {
					enabled: true,
					allowBypass: true,
					userPolicy: { filesystem: {}, network: { allowOutbound: true } },
				});
			}
		});

		test('ignores the enable settings on Windows', () => {
			// The sandbox is not supported on Windows, so the enable settings are ignored.
			assert.strictEqual(buildSandboxConfigForSdk('win32', sandbox('win32', AgentSandboxEnabledValue.On)), undefined);
			assert.strictEqual(buildSandboxConfigForSdk('win32', sandbox('win32', AgentSandboxEnabledValue.AllowNetwork)), undefined);
		});
	});

	suite('filesystem policy', () => {
		test('selects the OS-specific slice from the per-OS filesystem keys', () => {
			const cfg: ISandboxConfigValue = {
				[AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On,
				[AgentHostSandboxKey.LinuxFileSystem]: { allowWrite: ['/linux'] },
				[AgentHostSandboxKey.MacFileSystem]: { allowWrite: ['/mac'] },
			};
			assert.deepStrictEqual(buildSandboxConfigForSdk('linux', cfg)?.userPolicy.filesystem, { readwritePaths: ['/linux'] });
			assert.deepStrictEqual(buildSandboxConfigForSdk('darwin', cfg)?.userPolicy.filesystem, { readwritePaths: ['/mac'] });
			// Windows is ignored entirely.
			assert.strictEqual(buildSandboxConfigForSdk('win32', cfg), undefined);
		});

		test('maps each setting to the corresponding SDK list', () => {
			const fs: IAgentSandboxFileSystemSetting = {
				allowWrite: ['/work'],
				allowRead: ['/read'],
				denyWrite: ['/readonly'],
				denyRead: ['/secret'],
			};
			assert.deepStrictEqual(buildSandboxConfigForSdk('darwin', sandbox('darwin', AgentSandboxEnabledValue.On, fs)), {
				enabled: true,
				allowBypass: true,
				userPolicy: {
					filesystem: {
						readwritePaths: ['/work'],
						readonlyPaths: ['/readonly', '/read'],
						deniedPaths: ['/secret'],
					},
					network: { allowOutbound: false },
				},
			});
		});

		test('omits filesystem lists that are empty', () => {
			assert.deepStrictEqual(buildSandboxConfigForSdk('darwin', sandbox('darwin', AgentSandboxEnabledValue.On, {})), {
				enabled: true,
				allowBypass: true,
				userPolicy: { filesystem: {}, network: { allowOutbound: false } },
			});
		});

		test('denyRead wins over every other setting for the same path', () => {
			const fs: IAgentSandboxFileSystemSetting = {
				allowRead: ['/p'],
				allowWrite: ['/p'],
				denyWrite: ['/p'],
				denyRead: ['/p'],
			};
			assert.deepStrictEqual(buildSandboxConfigForSdk('darwin', sandbox('darwin', AgentSandboxEnabledValue.On, fs))?.userPolicy.filesystem, {
				deniedPaths: ['/p'],
			});
		});

		test('denyWrite wins over allowWrite / allowRead for the same path', () => {
			const fs: IAgentSandboxFileSystemSetting = {
				allowRead: ['/p'],
				allowWrite: ['/p'],
				denyWrite: ['/p'],
			};
			assert.deepStrictEqual(buildSandboxConfigForSdk('darwin', sandbox('darwin', AgentSandboxEnabledValue.On, fs))?.userPolicy.filesystem, {
				readonlyPaths: ['/p'],
			});
		});

		test('allowWrite wins over allowRead for the same path', () => {
			const fs: IAgentSandboxFileSystemSetting = {
				allowRead: ['/p'],
				allowWrite: ['/p'],
			};
			assert.deepStrictEqual(buildSandboxConfigForSdk('darwin', sandbox('darwin', AgentSandboxEnabledValue.On, fs))?.userPolicy.filesystem, {
				readwritePaths: ['/p'],
			});
		});

		test('keeps distinct paths in their own lists when settings overlap on some paths', () => {
			const fs: IAgentSandboxFileSystemSetting = {
				allowWrite: ['/work', '/shared'],
				denyWrite: ['/shared'],
			};
			assert.deepStrictEqual(buildSandboxConfigForSdk('darwin', sandbox('darwin', AgentSandboxEnabledValue.On, fs))?.userPolicy.filesystem, {
				readwritePaths: ['/work'],
				readonlyPaths: ['/shared'],
			});
		});
	});

	suite('network hosts', () => {
		test('drops host lists and keeps outbound closed when sandbox is `on` (host lists disabled on all platforms)', () => {
			for (const platform of ['darwin', 'linux'] as const) {
				assert.deepStrictEqual(buildSandboxConfigForSdk(platform, sandbox(platform, AgentSandboxEnabledValue.On, undefined, { allowedHosts: ['github.com'], blockedHosts: ['evil.example'] }))?.userPolicy.network, {
					allowOutbound: false,
				}, platform);
			}
		});

		test('ignores host lists when sandbox is `allowNetwork` (allow all)', () => {
			for (const platform of ['darwin', 'linux'] as const) {
				assert.deepStrictEqual(buildSandboxConfigForSdk(platform, sandbox(platform, AgentSandboxEnabledValue.AllowNetwork, undefined, { allowedHosts: ['a.example'], blockedHosts: ['b.example'] }))?.userPolicy.network, {
					allowOutbound: true,
				}, platform);
			}
		});

		test('ignores empty host lists', () => {
			assert.deepStrictEqual(buildSandboxConfigForSdk('linux', sandbox('linux', AgentSandboxEnabledValue.On, undefined, { allowedHosts: [], blockedHosts: [] }))?.userPolicy.network, {
				allowOutbound: false,
			});
		});
	});
});
