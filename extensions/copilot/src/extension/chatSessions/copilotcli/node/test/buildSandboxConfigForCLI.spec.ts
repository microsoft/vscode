/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { buildSandboxConfigForCLI, IAgentSandboxFileSystemSetting } from '../copilotcliSessionService';

function fsFor(platform: NodeJS.Platform, setting: IAgentSandboxFileSystemSetting) {
	return platform === 'win32' ? { windows: setting } : platform === 'darwin' ? { mac: setting } : { linux: setting };
}

describe('buildSandboxConfigForCLI', () => {

	describe('enablement', () => {
		it('returns undefined when no setting is set', () => {
			expect(buildSandboxConfigForCLI('darwin', undefined, undefined)).toBeUndefined();
			expect(buildSandboxConfigForCLI('win32', undefined, undefined)).toBeUndefined();
		});

		it('returns undefined for `off`', () => {
			expect(buildSandboxConfigForCLI('darwin', 'off', undefined)).toBeUndefined();
			expect(buildSandboxConfigForCLI('win32', 'off', undefined)).toBeUndefined();
		});

		it('enables sandbox for `on` on non-Windows platforms', () => {
			for (const platform of ['darwin', 'linux'] as const) {
				expect(buildSandboxConfigForCLI(platform, 'on', undefined)).toEqual({
					enabled: true,
					allowBypass: true,
					userPolicy: { filesystem: {}, network: { allowOutbound: false } },
				});
			}
		});

		it('enables sandbox and outbound network for `allowNetwork` on non-Windows platforms', () => {
			for (const platform of ['darwin', 'linux'] as const) {
				expect(buildSandboxConfigForCLI(platform, 'allowNetwork', undefined)).toEqual({
					enabled: true,
					allowBypass: true,
					userPolicy: { filesystem: {}, network: { allowOutbound: true } },
				});
			}
		});

		it('ignores the enable setting on Windows', () => {
			// The sandbox is not supported on Windows, so the enable setting is ignored.
			expect(buildSandboxConfigForCLI('win32', 'on', undefined)).toBeUndefined();
			expect(buildSandboxConfigForCLI('win32', 'allowNetwork', undefined)).toBeUndefined();
		});
	});

	describe('filesystem policy', () => {
		it('selects the OS-specific slice from the fileSystem setting', () => {
			const setting = {
				linux: { allowWrite: ['/linux'] },
				mac: { allowWrite: ['/mac'] },
				windows: { allowWrite: ['C:\\win'] },
			};
			expect(buildSandboxConfigForCLI('linux', 'on', setting)?.userPolicy?.filesystem).toEqual({ readwritePaths: ['/linux'] });
			expect(buildSandboxConfigForCLI('darwin', 'on', setting)?.userPolicy?.filesystem).toEqual({ readwritePaths: ['/mac'] });
			// Windows is ignored entirely.
			expect(buildSandboxConfigForCLI('win32', 'on', setting)).toBeUndefined();
		});

		it('maps each setting to the corresponding SDK list', () => {
			const fs: IAgentSandboxFileSystemSetting = {
				allowWrite: ['/work'],
				allowRead: ['/read'],
				denyWrite: ['/readonly'],
				denyRead: ['/secret'],
			};
			expect(buildSandboxConfigForCLI('darwin', 'on', fsFor('darwin', fs))).toEqual({
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

		it('omits filesystem lists that are empty', () => {
			expect(buildSandboxConfigForCLI('darwin', 'on', { mac: {} })).toEqual({
				enabled: true,
				allowBypass: true,
				userPolicy: { filesystem: {}, network: { allowOutbound: false } },
			});
		});

		it('denyRead wins over every other setting for the same path', () => {
			const fs: IAgentSandboxFileSystemSetting = {
				allowRead: ['/p'],
				allowWrite: ['/p'],
				denyWrite: ['/p'],
				denyRead: ['/p'],
			};
			expect(buildSandboxConfigForCLI('darwin', 'on', fsFor('darwin', fs))?.userPolicy?.filesystem).toEqual({
				deniedPaths: ['/p'],
			});
		});

		it('denyWrite wins over allowWrite / allowRead for the same path', () => {
			const fs: IAgentSandboxFileSystemSetting = {
				allowRead: ['/p'],
				allowWrite: ['/p'],
				denyWrite: ['/p'],
			};
			expect(buildSandboxConfigForCLI('darwin', 'on', fsFor('darwin', fs))?.userPolicy?.filesystem).toEqual({
				readonlyPaths: ['/p'],
			});
		});

		it('allowWrite wins over allowRead for the same path', () => {
			const fs: IAgentSandboxFileSystemSetting = {
				allowRead: ['/p'],
				allowWrite: ['/p'],
			};
			expect(buildSandboxConfigForCLI('darwin', 'on', fsFor('darwin', fs))?.userPolicy?.filesystem).toEqual({
				readwritePaths: ['/p'],
			});
		});

		it('keeps distinct paths in their own lists when settings overlap on some paths', () => {
			const fs: IAgentSandboxFileSystemSetting = {
				allowWrite: ['/work', '/shared'],
				denyWrite: ['/shared'],
			};
			expect(buildSandboxConfigForCLI('darwin', 'on', fsFor('darwin', fs))?.userPolicy?.filesystem).toEqual({
				readwritePaths: ['/work'],
				readonlyPaths: ['/shared'],
			});
		});
	});

	describe('network hosts', () => {
		it('drops host lists and keeps outbound closed when sandbox is `on` (host lists disabled on all platforms)', () => {
			for (const platform of ['darwin', 'linux'] as const) {
				expect(buildSandboxConfigForCLI(platform, 'on', undefined, { allowedHosts: ['github.com'], blockedHosts: ['evil.example'] })?.userPolicy?.network).toEqual({
					allowOutbound: false,
				});
			}
		});

		it('ignores host lists when sandbox is `allowNetwork` (allow all)', () => {
			for (const platform of ['darwin', 'linux'] as const) {
				expect(buildSandboxConfigForCLI(platform, 'allowNetwork', undefined, { allowedHosts: ['a.example'], blockedHosts: ['b.example'] })?.userPolicy?.network).toEqual({
					allowOutbound: true,
				});
			}
		});

		it('ignores empty host lists', () => {
			expect(buildSandboxConfigForCLI('linux', 'on', undefined, { allowedHosts: [], blockedHosts: [] })?.userPolicy?.network).toEqual({
				allowOutbound: false,
			});
		});
	});
});

