/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { homedir } from 'os';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { toAgentHostUri } from '../../common/agentHostUri.js';
import { getAttachedLocalPaths } from '../../common/attachedLocalPaths.js';
import { toHostSnapshotAttachmentMeta } from '../../common/meta/agentSnapshotAttachmentMeta.js';
import { MessageAttachmentKind, type MessageAttachment } from '../../common/state/protocol/state.js';
import { AgentHostSandboxConfigKey, AgentHostSandboxKey, sandboxConfigSchema, type ISandboxConfigValue } from '../../common/sandboxConfigSchema.js';
import { getVSCodeSandboxReadRoots } from '../../common/vscodeSandboxPaths.js';
import { AgentSandboxEnabledValue, type IAgentSandboxUserConfiguredPaths } from '../../../sandbox/common/settings.js';
import { buildSandboxConfigForSdk, resolveAttachedPathGrants, toSandboxFileSystemPath, type SandboxConfig } from '../../node/copilot/sandboxConfigForSdk.js';

suite('VS Code sandbox read roots', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('grants the local harness its terminal output root', () => {
		const terminalOutputDirectory = URI.file('/cache/terminal-output');
		assert.deepStrictEqual(getVSCodeSandboxReadRoots({ terminalOutputDirectory }), [terminalOutputDirectory]);
	});

	test('grants only the current session attachments and an optional shell init root', () => {
		const sessionDataDirectory = URI.file('/data/agentSessionData/session-1');
		const shellInitDirectory = URI.file('/data/agentHost/shellInit/session-1');
		assert.deepStrictEqual(getVSCodeSandboxReadRoots({ sessionDataDirectories: [sessionDataDirectory], shellInitDirectory }), [
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
	if (hosts?.allowedHosts !== undefined) {
		cfg[AgentHostSandboxKey.AllowedNetworkDomains] = [...hosts.allowedHosts];
	}
	if (hosts?.blockedHosts !== undefined) {
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
					...(options?.allowedHosts?.length || options?.blockedHosts?.length ? {
						allowedHosts: options.allowedHosts ?? [],
						blockedHosts: options.blockedHosts ?? [],
					} : {}),
				},
			} : {}),
		},
	};
}

suite('buildSandboxConfigForSdk', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('enablement', () => {
		test('defaults current working directory access on and preserves explicit denial on every platform', () => {
			assert.deepStrictEqual((['darwin', 'linux', 'win32'] as const).map(platform =>
				[undefined, false, true].map(value => buildSandboxConfigForSdk(platform, {
					enabled: AgentSandboxEnabledValue.On,
					...(value !== undefined ? { addCurrentWorkingDirectory: value } : {}),
				})?.addCurrentWorkingDirectory),
			), [[true, false, true], [true, false, true], [true, false, true]]);
		});

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

		test('forwards environment credentials independently of authentication on every platform', () => {
			const maskedCredentials = {
				envVars: { MY_API_TOKEN: { injectHosts: ['api.example.com', '*.example.org'] } },
				authenticategit: true,
				authenticategh: true,
			};
			for (const platform of ['linux', 'darwin', 'win32'] as const) {
				assert.deepStrictEqual([undefined, {}, maskedCredentials, { envVars: {} }].map(value => buildSandboxConfigForSdk(platform, {
					enabled: AgentSandboxEnabledValue.On,
					authenticateGit: false,
					authenticateGh: false,
					credentials: value,
				})), [undefined, {}, maskedCredentials.envVars, {}].map(envVars => ({
					...expectedSandboxConfig(),
					auth: { git: false, gh: false },
					...(envVars !== undefined ? { credentials: { envVars } } : {}),
				})));
				assert.strictEqual(buildSandboxConfigForSdk(platform, {
					enabled: AgentSandboxEnabledValue.Off,
					credentials: maskedCredentials,
				}), undefined);
			}
		});

		test('validates the credentials container and leaves map entries to the runtime', () => {
			assert.deepStrictEqual([
				{},
				{ envVars: {} },
				{ envVars: { MY_API_TOKEN: { injectHosts: ['api.example.com'] } } },
				null,
				[],
				{ envVars: null },
				{ envVars: [] },
				{ envVars: 'MY_API_TOKEN' },
			].map(maskedCredentials => sandboxConfigSchema.validate(AgentHostSandboxConfigKey.Sandbox, { credentials: maskedCredentials })),
				[true, true, true, false, false, false, false, false]);
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

		test('writes both host lists when either is non-empty', () => {
			assert.deepStrictEqual([
				buildSandboxConfigForSdk('linux', sandbox('linux', AgentSandboxEnabledValue.On, undefined, { allowedHosts: ['allowed.example'] }))?.userPolicy?.network,
				buildSandboxConfigForSdk('linux', sandbox('linux', AgentSandboxEnabledValue.On, undefined, { blockedHosts: ['blocked.example'] }))?.userPolicy?.network,
				buildSandboxConfigForSdk('linux', sandbox('linux', AgentSandboxEnabledValue.On, undefined, { allowedHosts: ['allowed.example'], blockedHosts: [] }))?.userPolicy?.network,
				buildSandboxConfigForSdk('linux', sandbox('linux', AgentSandboxEnabledValue.On, undefined, { allowedHosts: [], blockedHosts: ['blocked.example'] }))?.userPolicy?.network,
				buildSandboxConfigForSdk('linux', sandbox('linux', AgentSandboxEnabledValue.On, undefined, { allowedHosts: [], blockedHosts: [] }))?.userPolicy?.network,
				buildSandboxConfigForSdk('linux', sandbox('linux', AgentSandboxEnabledValue.On, undefined, { allowedHosts: [], blockedHosts: [] }, true))?.userPolicy?.network,
			], [
				{ allowedHosts: ['allowed.example'], blockedHosts: [] },
				{ allowedHosts: [], blockedHosts: ['blocked.example'] },
				{ allowedHosts: ['allowed.example'], blockedHosts: [] },
				{ allowedHosts: [], blockedHosts: ['blocked.example'] },
				undefined,
				{ allowOutbound: true },
			]);
		});

		test('omits empty host lists while preserving outbound and local network access', () => {
			assert.deepStrictEqual(buildSandboxConfigForSdk('linux', {
				[AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On,
				[AgentHostSandboxKey.AllowNetwork]: true,
				[AgentHostSandboxKey.AllowLocalNetwork]: true,
				[AgentHostSandboxKey.AllowedNetworkDomains]: [],
				[AgentHostSandboxKey.DeniedNetworkDomains]: [],
			})?.userPolicy?.network, {
				allowOutbound: true,
				allowLocalNetwork: true,
			});
		});
	});

	suite('extraReadonlyPaths', () => {

		test('suppresses extra grants only when managed readonly paths are present, including an empty list', () => {
			assert.deepStrictEqual((['linux', 'darwin', 'win32'] as const).map(platform =>
				[undefined, ['managed-reference'], []].map(readonlyPaths =>
					buildSandboxConfigForSdk(
						platform,
						sandbox(platform, AgentSandboxEnabledValue.On, { readonlyPaths: readonlyPaths ?? ['local-reference'] }),
						['host-generated'],
						{ enabled: true, ...(readonlyPaths !== undefined ? { readonlyPaths } : {}) },
					)?.userPolicy?.filesystem,
				),
			), Array.from({ length: 3 }, () => [
				{ readonlyPaths: ['local-reference', 'host-generated'] },
				{ readonlyPaths: ['managed-reference'] },
				undefined,
			]));
		});

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

	suite('attachedPaths', () => {
		const attach = (paths: string[], workingDirectory?: string) => ({ paths, ...(workingDirectory ? { workingDirectory } : {}) });

		test('grants attached files and folders read-only, exactly as attached', () => {
			assert.deepStrictEqual({
				filesystem: buildSandboxConfigForSdk('linux', sandbox('linux', AgentSandboxEnabledValue.On), ['/data/attachments'], undefined, attach(['/home/u/Desktop/mockup.txt', '/home/u/notes', '/home/u/notes']))?.userPolicy?.filesystem,
				grants: resolveAttachedPathGrants('linux', sandbox('linux', AgentSandboxEnabledValue.On), undefined, attach(['/home/u/Desktop/mockup.txt', '/home/u/notes'])),
			}, {
				filesystem: { readonlyPaths: ['/data/attachments', '/home/u/Desktop/mockup.txt', '/home/u/notes'] },
				grants: { granted: ['/home/u/Desktop/mockup.txt', '/home/u/notes'], blocked: [], containsWritable: [] },
			});
		});

		test('keeps paths that are, or are inside, a denied path denied', () => {
			const config = sandbox('linux', AgentSandboxEnabledValue.On, { deniedPaths: ['/home/u/secret', '/home/u/Desktop/private.txt'] });
			const attached = attach(['/home/u/secret', '/home/u/secret/key.txt', '/home/u/Desktop/private.txt', '/home/u/secretive.txt']);
			assert.deepStrictEqual({
				filesystem: buildSandboxConfigForSdk('linux', config, undefined, undefined, attached)?.userPolicy?.filesystem,
				grants: resolveAttachedPathGrants('linux', config, undefined, attached),
			}, {
				filesystem: { deniedPaths: ['/home/u/secret', '/home/u/Desktop/private.txt'], readonlyPaths: ['/home/u/secretive.txt'] },
				grants: { granted: ['/home/u/secretive.txt'], blocked: ['/home/u/secret', '/home/u/secret/key.txt', '/home/u/Desktop/private.txt'], containsWritable: [] },
			});
		});

		test('expands a home-relative denied path when checking attachments', () => {
			assert.deepStrictEqual(resolveAttachedPathGrants('linux', sandbox('linux', AgentSandboxEnabledValue.On, { deniedPaths: ['~/.ssh'] }), undefined, attach([`${homedir()}/.ssh/id_rsa`])), {
				granted: [],
				blocked: [`${homedir()}/.ssh/id_rsa`],
				containsWritable: [],
			});
		});

		test('respects a managed read-only list, including an empty one, and reports the attachments it blocks', () => {
			assert.deepStrictEqual([undefined, ['/managed'], []].map(readonlyPaths => {
				const policy = { enabled: true, ...(readonlyPaths ? { readonlyPaths } : {}) };
				const config = sandbox('linux', AgentSandboxEnabledValue.On, { readonlyPaths: readonlyPaths ?? [] });
				const attached = attach(['/home/u/Desktop/mockup.txt', '/managed/inside.txt']);
				return {
					filesystem: buildSandboxConfigForSdk('linux', config, undefined, policy, attached)?.userPolicy?.filesystem,
					grants: resolveAttachedPathGrants('linux', config, policy, attached),
				};
			}), [
				{ filesystem: { readonlyPaths: ['/home/u/Desktop/mockup.txt', '/managed/inside.txt'] }, grants: { granted: ['/home/u/Desktop/mockup.txt', '/managed/inside.txt'], blocked: [], containsWritable: [] } },
				{ filesystem: { readonlyPaths: ['/managed'] }, grants: { granted: [], blocked: ['/home/u/Desktop/mockup.txt'], containsWritable: [] } },
				{ filesystem: undefined, grants: { granted: [], blocked: ['/home/u/Desktop/mockup.txt', '/managed/inside.txt'], containsWritable: [] } },
			]);
		});

		test('never adds a read-only entry for a path that is already readable or writable', () => {
			const config = sandbox('linux', AgentSandboxEnabledValue.On, { readwritePaths: ['/scratch'], readonlyPaths: ['/docs'] });
			assert.deepStrictEqual([undefined, false].map(addCurrentWorkingDirectory =>
				buildSandboxConfigForSdk('linux', { ...config, ...(addCurrentWorkingDirectory !== undefined ? { addCurrentWorkingDirectory } : {}) }, undefined, undefined,
					attach(['/scratch/a.txt', '/docs/b.md', '/repo/src/c.ts', '/repo'], '/repo'))?.userPolicy?.filesystem,
			), [
				{ readonlyPaths: ['/docs'], readwritePaths: ['/scratch'] },
				{ readonlyPaths: ['/docs', '/repo/src/c.ts', '/repo'], readwritePaths: ['/scratch'] },
			]);
		});

		test('normalizes Windows paths and compares macOS and Windows paths case-insensitively', () => {
			assert.deepStrictEqual({
				win32: buildSandboxConfigForSdk('win32', sandbox('win32', AgentSandboxEnabledValue.On, { deniedPaths: ['C:/Secret'] }), undefined, undefined, attach(['c:/secret/a.txt', 'C:/Users/u/Desktop/b.txt']))?.userPolicy?.filesystem,
				darwin: resolveAttachedPathGrants('darwin', sandbox('darwin', AgentSandboxEnabledValue.On, { deniedPaths: ['/Users/u/Secret'] }), undefined, attach(['/users/u/secret/a.txt'])),
				linux: resolveAttachedPathGrants('linux', sandbox('linux', AgentSandboxEnabledValue.On, { deniedPaths: ['/home/u/Secret'] }), undefined, attach(['/home/u/secret/a.txt'])),
			}, {
				win32: { deniedPaths: ['C:\\Secret'], readonlyPaths: ['C:\\Users\\u\\Desktop\\b.txt'] },
				darwin: { granted: [], blocked: ['/users/u/secret/a.txt'], containsWritable: [] },
				linux: { granted: ['/home/u/secret/a.txt'], blocked: [], containsWritable: [] },
			});
		});

		test('does not grant a folder that contains a writable folder, so the writable folder stays writable', () => {
			const config = sandbox('linux', AgentSandboxEnabledValue.On, { readwritePaths: ['/scratch/out'] });
			const attached = { paths: ['/home/u', '/home/u/demo', '/home', '/scratch', '/data', '/home/u/Desktop/mockup.txt'], workingDirectory: '/home/u/demo', additionalWorkingDirectories: ['/data/extra'] };
			assert.deepStrictEqual({
				filesystem: buildSandboxConfigForSdk('linux', config, undefined, undefined, attached)?.userPolicy?.filesystem,
				grants: resolveAttachedPathGrants('linux', config, undefined, attached),
				withoutWorkingDirectoryGrant: resolveAttachedPathGrants('linux', { ...config, addCurrentWorkingDirectory: false }, undefined, attached).granted,
			}, {
				filesystem: { readonlyPaths: ['/home/u/Desktop/mockup.txt'], readwritePaths: ['/scratch/out'] },
				grants: { granted: ['/home/u/Desktop/mockup.txt'], blocked: [], containsWritable: ['/home/u', '/home', '/scratch', '/data'] },
				withoutWorkingDirectoryGrant: ['/home/u', '/home/u/demo', '/home', '/home/u/Desktop/mockup.txt'],
			});
		});

		test('resolves dot segments with the target platform rules before comparing and granting', () => {
			assert.deepStrictEqual({
				linux: resolveAttachedPathGrants('linux', sandbox('linux', AgentSandboxEnabledValue.On, { deniedPaths: ['/home/u/./secret/'] }), undefined,
					{ paths: ['/workspace/../outside.txt', '/workspace/./src/../a.ts', '/home/u/notes/../secret/key.txt', '/home/u/notes/./'], workingDirectory: '/workspace' }),
				win32: resolveAttachedPathGrants('win32', sandbox('win32', AgentSandboxEnabledValue.On), undefined,
					{ paths: ['C:\\work\\..\\out.txt', 'C:\\work\\src\\..\\a.ts'], workingDirectory: 'C:\\work' }),
			}, {
				linux: { granted: ['/outside.txt', '/home/u/notes'], blocked: ['/home/u/secret/key.txt'], containsWritable: [] },
				win32: { granted: ['C:\\out.txt'], blocked: [], containsWritable: [] },
			});
		});

		test('grants nothing when sandboxing is off', () => {
			assert.deepStrictEqual({
				config: buildSandboxConfigForSdk('linux', sandbox('linux', AgentSandboxEnabledValue.Off), undefined, undefined, attach(['/home/u/a.txt'])),
				grants: resolveAttachedPathGrants('linux', sandbox('linux', AgentSandboxEnabledValue.Off), undefined, attach(['/home/u/a.txt'])),
			}, { config: undefined, grants: { granted: [], blocked: [], containsWritable: [] } });
		});
	});
});

suite('getAttachedLocalPaths', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps local files and folders, unwraps client URIs, and ignores everything else', () => {
		const file = URI.file('/home/u/Desktop/mockup.txt');
		const folder = URI.file('/home/u/notes');
		const attachments: MessageAttachment[] = [
			{ type: MessageAttachmentKind.Resource, uri: file.toString(), label: 'mockup.txt', displayKind: 'file' },
			{ type: MessageAttachmentKind.Resource, uri: folder.toString(), label: 'notes', displayKind: 'directory' },
			{ type: MessageAttachmentKind.Resource, uri: file.toString(), label: 'mockup.txt', displayKind: 'selection', selection: { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } } } },
			{ type: MessageAttachmentKind.Resource, uri: toAgentHostUri(URI.file('/home/u/wrapped.txt'), 'my-server').toString(), label: 'wrapped.txt' },
			{ type: MessageAttachmentKind.Resource, uri: toAgentHostUri(URI.from({ scheme: 'git', path: '/home/u/repo/a.ts' }), 'my-server').toString(), label: 'a.ts' },
			{ type: MessageAttachmentKind.Resource, uri: 'untitled:Untitled-1', label: 'Untitled-1' },
			{ type: MessageAttachmentKind.Resource, uri: 'vscode-remote://ssh-remote+box/home/u/remote.txt', label: 'remote.txt' },
			{ type: MessageAttachmentKind.Resource, uri: URI.file('/data/attachments/snapshot.txt').toString(), label: 'snapshot', _meta: toHostSnapshotAttachmentMeta('text/plain') },
			{ type: MessageAttachmentKind.EmbeddedResource, data: 'aGk=', contentType: 'text/plain', label: 'inline' },
			{ type: MessageAttachmentKind.Simple, label: 'simple', modelRepresentation: 'text' },
		];
		assert.deepStrictEqual(getAttachedLocalPaths(attachments).map(uri => uri.toString()), [file, folder, file, URI.file('/home/u/wrapped.txt')].map(uri => uri.toString()));
	});

	test('resolves dot segments in attached URIs', () => {
		const attachments: MessageAttachment[] = [
			{ type: MessageAttachmentKind.Resource, uri: 'file:///workspace/../outside.txt', label: 'outside.txt', displayKind: 'file' },
			{ type: MessageAttachmentKind.Resource, uri: 'file:///home/u/./notes/', label: 'notes', displayKind: 'directory' },
		];
		assert.deepStrictEqual(getAttachedLocalPaths(attachments).map(uri => uri.path), ['/outside.txt', '/home/u/notes/']);
	});
});

suite('toSandboxFileSystemPath', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('uses the target platform syntax regardless of the host OS', () => {
		const uris = [
			URI.from({ scheme: 'file', path: '/home/u/Desktop/mockup.txt' }),
			URI.from({ scheme: 'file', path: '/C:/Users/u/notes' }),
			URI.from({ scheme: 'file', authority: 'server', path: '/share/a.txt' }),
		];
		assert.deepStrictEqual((['linux', 'darwin', 'win32'] as const).map(platform => uris.map(uri => toSandboxFileSystemPath(uri, platform))), [
			['/home/u/Desktop/mockup.txt', 'c:/Users/u/notes', '//server/share/a.txt'],
			['/home/u/Desktop/mockup.txt', 'c:/Users/u/notes', '//server/share/a.txt'],
			['\\home\\u\\Desktop\\mockup.txt', 'c:\\Users\\u\\notes', '\\\\server\\share\\a.txt'],
		]);
	});
});
