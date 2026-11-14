/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder } from '../../../../../../platform/workspace/common/workspace.js';
import { EditorWindowComposerFoldersService } from '../../../browser/editorWindow/editorWindowComposerFolders.js';

suite('EditorWindowComposerFoldersService', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('offers the window\'s folders, or those of the provider set last, until each provider is disposed, also one set twice', () => {
		const service = new EditorWindowComposerFoldersService(upcastPartial<IWorkspaceContextService>({
			onDidChangeWorkspaceFolders: Event.None,
			getWorkspace: () => upcastPartial<IWorkspace>({ folders: [upcastPartial<IWorkspaceFolder>({ uri: URI.file('/repo') })] }),
		}));
		const folders = () => service.getComposerFolderOptions().allowedFolders?.get().map(folder => folder.path);
		const worktrees = () => ({ allowedFolders: constObservable([URI.file('/repo'), URI.file('/repo.worktrees/a')]) });
		const steps = [folders()];

		const first = service.setComposerFolderOptions(worktrees);
		const second = service.setComposerFolderOptions(worktrees);
		steps.push(folders());
		first.dispose();
		steps.push(folders());
		second.dispose();
		steps.push(folders());

		assert.deepStrictEqual(steps, [['/repo'], ['/repo', '/repo.worktrees/a'], ['/repo', '/repo.worktrees/a'], ['/repo']]);
	});
});
