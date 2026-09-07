/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { encodeHex, VSBuffer } from '../../../../../base/common/buffer.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INativeHostService, IOpenAgentsWindowOptions } from '../../../../../platform/native/common/native.js';
import { AgentsWindowOpenSource } from '../../../../../platform/window/common/window.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { OpenWorkspaceInAgentsWindowAction } from '../../electron-browser/agentSessions/agentSessionsActions.js';

suite('OpenWorkspaceInAgentsWindowAction', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('opens the Agents Window with the local folder and Dev Container preference', async () => {
		const store = disposables.add(new DisposableStore());
		const instantiationService = store.add(new TestInstantiationService());
		let workspaceFolderUri = URI.file('/workspace');
		const calls: IOpenAgentsWindowOptions[] = [];
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({
			getWorkspace: () => ({
				id: 'workspace',
				folders: [{
					uri: workspaceFolderUri,
					name: 'workspace',
					index: 0,
					toResource: relativePath => URI.joinPath(workspaceFolderUri, relativePath),
				}],
			}),
		}));
		instantiationService.stub(INativeHostService, upcastPartial<INativeHostService>({
			openAgentsWindow: async options => { calls.push(options ?? {}); },
		}));

		await instantiationService.invokeFunction(accessor => new OpenWorkspaceInAgentsWindowAction().run(accessor, {
			source: AgentsWindowOpenSource.TitleBar,
		}));
		const hostFolderUri = URI.file('/host/workspace');
		workspaceFolderUri = URI.from({
			scheme: Schemas.vscodeRemote,
			authority: `dev-container+${encodeHex(VSBuffer.fromString(hostFolderUri.fsPath))}`,
			path: '/workspaces/project',
		});
		await instantiationService.invokeFunction(accessor => new OpenWorkspaceInAgentsWindowAction().run(accessor, {
			source: AgentsWindowOpenSource.ChatTitleBar,
		}));

		assert.deepStrictEqual(calls.map(call => ({
			folderUri: URI.revive(call.folderUri)?.toString(),
			source: call.source,
		})), [{
			folderUri: URI.file('/workspace').toString(),
			source: AgentsWindowOpenSource.TitleBar,
		}, {
			folderUri: workspaceFolderUri.toString(),
			source: AgentsWindowOpenSource.ChatTitleBar,
		}]);
	});
});
