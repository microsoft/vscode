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

	test('the options a composer took before a provider was set follow the provider, its presentation too, and the window\'s folders again once it goes', () => {
		const service = new EditorWindowComposerFoldersService(upcastPartial<IWorkspaceContextService>({
			onDidChangeWorkspaceFolders: Event.None,
			getWorkspace: () => upcastPartial<IWorkspace>({ folders: [upcastPartial<IWorkspaceFolder>({ uri: URI.file('/repo') })] }),
		}));
		// Taken once, as a composer created during restore takes them
		const options = service.getComposerFolderOptions();
		const read = () => ({ folders: options.allowedFolders?.get().map(folder => folder.path), worktree: options.getFolderPresentation?.(URI.file('/repo.worktrees/a'))?.description });
		const before = read();

		const provider = service.setComposerFolderOptions(() => ({
			allowedFolders: constObservable([URI.file('/repo'), URI.file('/repo.worktrees/a')]),
			getFolderPresentation: folder => ({ label: folder.path, description: 'Worktree' }),
		}));
		const provided = read();
		provider.dispose();

		assert.deepStrictEqual({ before, provided, after: read() }, {
			before: { folders: ['/repo'], worktree: undefined },
			provided: { folders: ['/repo', '/repo.worktrees/a'], worktree: 'Worktree' },
			after: { folders: ['/repo'], worktree: undefined },
		});
	});

	test('retargets every registered composer, of the chat part and of the Chat view alike, until it is no longer registered', () => {
		const service = new EditorWindowComposerFoldersService(upcastPartial<IWorkspaceContextService>({ onDidChangeWorkspaceFolders: Event.None, getWorkspace: () => upcastPartial<IWorkspace>({ folders: [] }) }));
		const calls: string[] = [];
		const composer = (name: string) => ({ retargetFolder: (to: URI, from?: URI) => { calls.push(`${name} ${from?.path} -> ${to.path}`); return true; } });

		const chatPart = service.registerComposer(composer('chat part'));
		const chatView = service.registerComposer(composer('chat view'));
		service.retargetComposerFolders(URI.file('/repo.worktrees/a'), URI.file('/repo'));
		chatPart.dispose();
		service.retargetComposerFolders(URI.file('/repo'), URI.file('/repo.worktrees/a'));
		chatView.dispose();

		assert.deepStrictEqual(calls, ['chat part /repo -> /repo.worktrees/a', 'chat view /repo -> /repo.worktrees/a', 'chat view /repo.worktrees/a -> /repo']);
	});
});
