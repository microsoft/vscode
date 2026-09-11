/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import { createURITransformer } from '../../../base/common/uriTransformer.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { reviveRemoteShellLaunchConfig } from '../../node/remoteTerminalChannel.js';

suite('RemoteTerminalChannel', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('should restore extension ownership from the launch config DTO', () => {
		deepStrictEqual(reviveRemoteShellLaunchConfig(createURITransformer('test'), {
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
