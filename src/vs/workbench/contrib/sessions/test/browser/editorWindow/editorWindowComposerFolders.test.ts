/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { autorun, constObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder, WorkbenchMode } from '../../../../../../platform/workspace/common/workspace.js';
import { EditorWindowComposerFoldersService } from '../../../browser/editorWindow/editorWindowComposerFolders.js';

suite('EditorWindowComposerFoldersService', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(folders: URI[], scope: { value: URI | undefined; readonly onDidChange?: Event<URI | undefined> } = { value: URI.file('/workspace') }, mode: { value: WorkbenchMode; readonly onDidChange?: Event<WorkbenchMode> } = { value: WorkbenchMode.Editor }): EditorWindowComposerFoldersService {
		return new EditorWindowComposerFoldersService(upcastPartial<IWorkspaceContextService>({
			onDidChangeWorkspaceFolders: Event.None,
			getWorkspace: () => upcastPartial<IWorkspace>({ folders: folders.map(uri => upcastPartial<IWorkspaceFolder>({ uri })) }),
			onDidChangeWorkbenchScope: scope.onDidChange ?? Event.None,
			getWorkbenchScope: () => scope.value,
			onDidChangeWorkbenchMode: mode.onDidChange ?? Event.None,
			getWorkbenchMode: () => mode.value,
		}));
	}

	test('offers the window\'s folders, or those of the provider set last, until each provider is disposed, also one set twice', () => {
		const service = createService([URI.file('/repo')]);
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
		const service = createService([URI.file('/repo')]);
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
		const service = createService([]);
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

	test('while the window is about all sessions (Agents mode), offers no folders, so composers create sessions anywhere, also with a provider; a window about its workspace keeps them', () => {
		const onDidChange = store.add(new Emitter<URI | undefined>());
		const scope: { value: URI | undefined; readonly onDidChange: Event<URI | undefined> } = { value: URI.file('/workspace'), onDidChange: onDidChange.event };
		const service = createService([URI.file('/repo')], scope);
		const provider = service.setComposerFolderOptions(() => ({ allowedFolders: constObservable([URI.file('/repo'), URI.file('/repo.worktrees/a')]) }));
		const options = service.getComposerFolderOptions();
		const read = () => ({ folders: options.allowedFolders?.get().map(folder => folder.path), elsewhere: service.toAllowedFolder(URI.file('/other'))?.path });
		const workspace = read();

		scope.value = undefined;
		onDidChange.fire(scope.value);
		const all = read();

		scope.value = URI.file('/workspace');
		onDidChange.fire(scope.value);
		const back = read();
		provider.dispose();

		assert.deepStrictEqual({ workspace, all, back }, {
			workspace: { folders: ['/repo', '/repo.worktrees/a'], elsewhere: undefined },
			all: { folders: [], elsewhere: '/other' },
			back: { folders: ['/repo', '/repo.worktrees/a'], elsewhere: undefined },
		});
	});

	test('in the Agents mode, offers the local folder the window is scoped to, or no folders while it is about all sessions or scoped to a remote workspace, also with a provider, following the scope and mode', () => {
		const onDidChangeScope = store.add(new Emitter<URI | undefined>());
		const onDidChangeMode = store.add(new Emitter<WorkbenchMode>());
		const scope: { value: URI | undefined; readonly onDidChange: Event<URI | undefined> } = { value: undefined, onDidChange: onDidChangeScope.event };
		const mode = { value: WorkbenchMode.Agents, onDidChange: onDidChangeMode.event };
		const service = createService([URI.file('/mounted')], scope, mode);
		const provider = service.setComposerFolderOptions(() => ({ allowedFolders: constObservable([URI.file('/repo')]) }));
		const options = service.getComposerFolderOptions();
		const read = () => options.allowedFolders?.get().map(folder => folder.path);
		const changeScope = (value: URI | undefined) => { scope.value = value; onDidChangeScope.fire(value); };
		const changeMode = (value: WorkbenchMode) => { mode.value = value; onDidChangeMode.fire(value); };

		const all = read();
		changeScope(URI.file('/picked'));
		const picked = read();
		changeMode(WorkbenchMode.Editor);
		const editor = read();
		changeMode(WorkbenchMode.Agents);
		changeScope(URI.from({ scheme: 'vscode-agent-host', authority: 'remote', path: '/picked' }));
		const remote = read();
		changeScope(undefined);
		const allAgain = read();
		provider.dispose();

		assert.deepStrictEqual({ all, picked, editor, remote, allAgain }, {
			all: [],
			picked: ['/picked'],
			// Scoped outside the mode, a window offers the provider's folders as before
			editor: ['/repo'],
			// A remote workspace is not one this window can start a session in: anywhere, as about all sessions
			remote: [],
			allAgain: [],
		});
	});

	test('leaving the Agents mode never offers the window\'s new scope as a folder before the mode change is announced, such as the file of a multi-root workspace', () => {
		const onDidChangeScope = store.add(new Emitter<URI | undefined>());
		const onDidChangeMode = store.add(new Emitter<WorkbenchMode>());
		const scope: { value: URI | undefined; readonly onDidChange: Event<URI | undefined> } = { value: URI.file('/alpha'), onDidChange: onDidChangeScope.event };
		const mode = { value: WorkbenchMode.Agents, onDidChange: onDidChangeMode.event };
		const service = createService([URI.file('/alpha'), URI.file('/beta')], scope, mode);
		const seen: string[][] = [];
		store.add(autorun(reader => seen.push((service.getComposerFolderOptions().allowedFolders?.read(reader) ?? []).map(folder => folder.path))));

		// As the window switches out of the mode: its state changes at once, and the scope is announced before the mode
		scope.value = URI.file('/multi.code-workspace');
		mode.value = WorkbenchMode.Editor;
		onDidChangeScope.fire(scope.value);
		onDidChangeMode.fire(mode.value);

		assert.deepStrictEqual(seen.filter((folders, index) => index === 0 || JSON.stringify(folders) !== JSON.stringify(seen[index - 1])), [['/alpha'], ['/alpha', '/beta']]);
	});
});
