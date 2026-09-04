/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { encodeHex, VSBuffer } from '../../../../../base/common/buffer.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { DevContainerAgentHostEnabledSettingId } from '../../../../common/devContainerAgentHostService.js';
import { resolveAgentsWindowFolderIntent } from '../../browser/agentsWindowOpenIntent.js';

suite('Agents Window open intent', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('resolves local and Dev Container editor workspaces', () => {
		const configurationService = (enabled: boolean) => new TestConfigurationService({
			[DevContainerAgentHostEnabledSettingId]: enabled,
		});
		const localFolder = URI.file('/workspace');
		const hostFolder = URI.file('/host/workspace');
		const devContainerFolder = URI.from({
			scheme: Schemas.vscodeRemote,
			authority: `dev-container+${encodeHex(VSBuffer.fromString(hostFolder.fsPath))}`,
			path: '/workspaces/project',
		});
		const resolve = (uri: URI | undefined, enabled: boolean) => {
			const result = resolveAgentsWindowFolderIntent(uri, configurationService(enabled));
			return {
				folderUri: result.folderUri?.toString(),
				preferDevContainer: result.preferDevContainer,
			};
		};

		assert.deepStrictEqual({
			local: resolve(localFolder, true),
			devContainerEnabled: resolve(devContainerFolder, true),
			devContainerDisabled: resolve(devContainerFolder, false),
			otherRemote: resolve(URI.parse('vscode-remote://ssh-remote+host/workspace'), true),
			invalidDevContainer: resolve(URI.parse('vscode-remote://dev-container+invalid/workspace'), true),
		}, {
			local: { folderUri: localFolder.toString(), preferDevContainer: false },
			devContainerEnabled: { folderUri: hostFolder.toString(), preferDevContainer: true },
			devContainerDisabled: { folderUri: hostFolder.toString(), preferDevContainer: false },
			otherRemote: { folderUri: undefined, preferDevContainer: false },
			invalidDevContainer: { folderUri: undefined, preferDevContainer: false },
		});
	});
});
