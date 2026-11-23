/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { Workspace, WorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { isRecentFolder } from '../../../../../platform/workspaces/common/workspaces.js';
import { IWorkbenchEnvironmentService } from '../../../environment/common/environmentService.js';
import { TestContextService, TestFileService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { BrowserWorkspacesService } from '../../browser/workspacesService.js';

suite('BrowserWorkspacesService', () => {

	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	test('recents track the primary location while at an alternate location', async () => {
		const primary = URI.parse('vscode-vfs://host/primary');
		const alternate = URI.parse('vscode-vfs://host/alternate');
		const folder = new WorkspaceFolder({ uri: alternate, name: 'primary', index: 0 });

		const fileService = ds.add(new TestFileService());
		const uriIdentityService = ds.add(new UriIdentityService(fileService));
		const service = ds.add(new BrowserWorkspacesService(
			ds.add(new TestStorageService()),
			new TestContextService(new Workspace('id', [folder], false, null, () => false, undefined, primary)),
			new NullLogService(),
			fileService,
			{ remoteAuthority: undefined } as IWorkbenchEnvironmentService,
			uriIdentityService,
		));

		await timeout(0);
		const recents = (await service.getRecentlyOpened()).workspaces.filter(isRecentFolder).map(recent => recent.folderUri.toString());
		assert.deepStrictEqual(recents, [primary.toString()]);
	});
});
