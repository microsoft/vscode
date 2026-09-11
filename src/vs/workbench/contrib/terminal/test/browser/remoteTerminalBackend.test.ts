/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { createRemoteShellLaunchConfigDto } from '../../browser/remoteTerminalBackend.js';

suite('RemoteTerminalBackend', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('should include extension ownership in the launch config DTO', () => {
		deepStrictEqual(createRemoteShellLaunchConfigDto({
			executable: '/bin/zsh',
			isFeatureTerminal: false,
			isExtensionOwnedTerminal: true,
		}), {
			name: undefined,
			executable: '/bin/zsh',
			args: undefined,
			cwd: undefined,
			env: undefined,
			useShellEnvironment: undefined,
			reconnectionProperties: undefined,
			type: undefined,
			isFeatureTerminal: false,
			isExtensionOwnedTerminal: true,
			forceShellIntegration: undefined,
			tabActions: undefined,
			shellIntegrationEnvironmentReporting: undefined,
		});
	});
});
