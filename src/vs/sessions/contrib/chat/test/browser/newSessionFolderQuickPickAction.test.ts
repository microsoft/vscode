/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IQuickInputService, IQuickPickSeparator } from '../../../../../platform/quickinput/common/quickInput.js';
import { IChatWindow, IChatWindowService } from '../../../../../workbench/contrib/chatWindow/browser/chatWindow.js';
import { INewSessionComposerService } from '../../../../../workbench/contrib/sessions/browser/newSessionComposerService.js';
import { ISessionsService } from '../../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { ISessionWorkspace } from '../../../../../workbench/services/sessions/common/session.js';
import { IRecentWorkspace, ISessionsRecentWorkspacesService } from '../../../../../workbench/contrib/sessions/browser/sessionsRecentWorkspacesService.js';
import { buildFolderQuickPickItems, IFolderQuickPickItem } from '../../browser/newSessionFolderQuickPickAction.js';

function isSeparator(item: IFolderQuickPickItem | IQuickPickSeparator): item is IQuickPickSeparator {
	return (item as IQuickPickSeparator).type === 'separator';
}

function createResolvedRecent(uri: URI, providerId = 'local-1', checked = false): IRecentWorkspace {
	const name = uri.path.substring(1) || uri.path;
	const workspace: ISessionWorkspace = {
		uri,
		label: name,
		icon: Codicon.folder,
		folders: [{ root: uri, workingDirectory: uri, name, description: undefined }],
		requiresWorkspaceTrust: false,
		isVirtualWorkspace: false,
	};
	return { workspace, providerId, checked, source: 'agents' };
}

function createRecentWorkspacesService(recent: IRecentWorkspace[]): ISessionsRecentWorkspacesService {
	return upcastPartial<ISessionsRecentWorkspacesService>({
		_serviceBrand: undefined,
		onDidChangeRecentWorkspaces: Event.None,
		getRecentWorkspaces: () => recent,
	});
}

const labelService = upcastPartial<ILabelService>({ getUriLabel: (uri: URI) => uri.fsPath });

suite('New Session Folder Quick Pick', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('starts the new session in the picked folder in the chat window it runs in, leaving the main window\'s composer alone; in the main window, there', async () => {
		const picked: IFolderQuickPickItem = { label: 'repo-a', folderUri: URI.file('/repo-a'), providerId: 'provider-a' };
		const run = async (activeWindow: IChatWindow | undefined) => {
			const calls: unknown[] = [];
			const instantiationService = disposables.add(new TestInstantiationService());
			instantiationService.stub(ISessionsRecentWorkspacesService, createRecentWorkspacesService([]));
			instantiationService.stub(ILabelService, labelService);
			instantiationService.stub(IFileDialogService, upcastPartial<IFileDialogService>({}));
			instantiationService.stub(IQuickInputService, upcastPartial<IQuickInputService>({ pick: async () => picked as never }));
			instantiationService.stub(INewSessionComposerService, upcastPartial<INewSessionComposerService>({ notifyUserWorkspaceSelection: () => calls.push('main composer workspace selection') }));
			instantiationService.stub(ISessionsService, upcastPartial<ISessionsService>({
				openNewSession: async options => {
					calls.push({ mainWindow: { folderUri: options?.folderUri?.path, providerId: options?.providerId } });
					return { session: undefined, trustDeclined: false };
				},
			}));
			instantiationService.stub(IChatWindowService, upcastPartial<IChatWindowService>({
				activeWindow,
				openNewChat: async (window, options) => { calls.push({ chatWindow: window.windowId, options }); },
			}));
			await CommandsRegistry.getCommand('workbench.action.sessions.newSession.pickFolderQuickPick')!.handler(instantiationService);
			return calls;
		};

		assert.deepStrictEqual({
			chatWindow: await run(upcastPartial<IChatWindow>({ windowId: 7 })),
			mainWindow: await run(undefined),
		}, {
			chatWindow: [{ chatWindow: 7, options: { folder: { uri: picked.folderUri, providerId: 'provider-a' } } }],
			mainWindow: ['main composer workspace selection', { mainWindow: { folderUri: '/repo-a', providerId: 'provider-a' } }],
		});
	});

	test('lists the sessions\' own recents followed by VS Code\'s recents, then a Browse entry', () => {
		const ownRecentUri = URI.file('/repo-a');
		const vsCodeRecentUri = URI.file('/repo-b');

		const recentWorkspacesService = createRecentWorkspacesService([
			createResolvedRecent(ownRecentUri, 'provider-a'),
			createResolvedRecent(vsCodeRecentUri, 'provider-b'),
		]);

		const items = buildFolderQuickPickItems(recentWorkspacesService, labelService);

		const folderItems = items.filter((i): i is IFolderQuickPickItem => !isSeparator(i) && !i.browse);
		assert.deepStrictEqual(folderItems.map(i => i.folderUri?.toString()), [ownRecentUri.toString(), vsCodeRecentUri.toString()]);
		assert.deepStrictEqual(folderItems.map(i => i.providerId), ['provider-a', 'provider-b'], 'each item carries its recent entry\'s provider ID');

		const separators = items.filter(isSeparator);
		assert.strictEqual(separators.length, 2);

		const lastItem = items[items.length - 1];
		assert.ok(!isSeparator(lastItem) && lastItem.browse, 'last item is the Browse action');
	});

	test('always includes the Browse entry, even with no recents', () => {
		const recentWorkspacesService = createRecentWorkspacesService([]);

		const items = buildFolderQuickPickItems(recentWorkspacesService, labelService);

		assert.strictEqual(items.length, 1);
		assert.ok(!isSeparator(items[0]) && items[0].browse, 'the single item is the Browse action');
	});
});
