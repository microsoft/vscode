/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CopilotCliConfigKey } from '../../../common/copilotCliConfig.js';
import type { IAgentConfigurationService } from '../../../node/agentConfigurationService.js';
import { isSupportedTarget, readLocalModelRootConfig, selectLocalModelProvider, type ILocalModelProviderSelectionInput } from '../../../node/copilot/localModelBridge/localModelProvider.js';

suite('localModelProvider selection', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('supports every shipped target, musl only with an explicit llama-server', () => {
		assert.deepStrictEqual({
			win32x64: isSupportedTarget('win32', 'x64', undefined, false),
			win32arm64: isSupportedTarget('win32', 'arm64', undefined, false),
			darwinArm64: isSupportedTarget('darwin', 'arm64', undefined, false),
			darwinX64: isSupportedTarget('darwin', 'x64', undefined, false),
			linuxGlibc: isSupportedTarget('linux', 'x64', 'glibc', false),
			linuxArm64Glibc: isSupportedTarget('linux', 'arm64', 'glibc', false),
			linuxMusl: isSupportedTarget('linux', 'x64', 'musl', false),
			linuxMuslWithPath: isSupportedTarget('linux', 'x64', 'musl', true),
			linuxArmhf: isSupportedTarget('linux', 'arm', 'glibc', true),
			freebsd: isSupportedTarget('freebsd', 'x64', undefined, true),
		}, {
			win32x64: true,
			win32arm64: true,
			darwinArm64: true,
			darwinX64: true,
			linuxGlibc: true,
			linuxArm64Glibc: true,
			linuxMusl: false,
			linuxMuslWithPath: true,
			linuxArmhf: false,
			freebsd: false,
		});
	});

	test('selects the shim only when enabled, local and supported', () => {
		const base: ILocalModelProviderSelectionInput = {
			enabled: true,
			isLocalAgentHost: true,
			platform: 'win32',
			arch: 'arm64',
			libc: undefined,
			llamaServerPath: undefined,
		};
		assert.deepStrictEqual({
			selected: selectLocalModelProvider(base),
			disabled: selectLocalModelProvider({ ...base, enabled: false }),
			remoteHost: selectLocalModelProvider({ ...base, isLocalAgentHost: false }),
			musl: selectLocalModelProvider({ ...base, platform: 'linux', arch: 'x64', libc: 'musl' }),
			muslWithPath: selectLocalModelProvider({ ...base, platform: 'linux', arch: 'x64', libc: 'musl', llamaServerPath: '/usr/local/bin/llama-server' }),
		}, {
			selected: 'shim',
			disabled: 'none',
			remoteHost: 'none',
			musl: 'none',
			muslWithPath: 'shim',
		});
	});

	test('reads the forwarded settings from root config with defaults', () => {
		const configuration = (values: Record<string, unknown>): Pick<IAgentConfigurationService, 'getRootValue'> => ({
			getRootValue: (_schema, key) => values[key] as never,
		});
		assert.deepStrictEqual({
			defaults: readLocalModelRootConfig(configuration({})),
			configured: readLocalModelRootConfig(configuration({
				[CopilotCliConfigKey.LocalModelEnabled]: true,
				[CopilotCliConfigKey.LocalModelUseInAuto]: true,
				[CopilotCliConfigKey.LocalModelAccountGate]: true,
				[CopilotCliConfigKey.LocalModelLlamaServerPath]: '  C:\\tools\\llama-server.exe ',
			})),
		}, {
			defaults: { enabled: false, useInAuto: false, accountGate: false, llamaServerPath: undefined },
			configured: { enabled: true, useInAuto: true, accountGate: true, llamaServerPath: 'C:\\tools\\llama-server.exe' },
		});
	});
});
