/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { constObservable, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionListDelegate, IActionListItem } from '../../../../../platform/actionWidget/browser/actionList.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IChat, SessionStatus } from '../../../../services/sessions/common/session.js';
import { INestedChatFolderInfo, INestedChatWorkspace, INestedChatWorkspaceSupport, NestedChatWorkspaceError } from '../../../../services/sessions/common/sessionsProvider.js';
import { NewChatInSessionWidget } from '../../browser/newChatInSessionWidget.js';
import { NestedChatWorkspaceControls } from '../../browser/nestedChatWorkspacePicker.js';

suite('Sessions - New Nested Session composer', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const repo = URI.file('/repo');
	const other = URI.file('/other');
	const git: INestedChatFolderInfo = { supportsWorktree: true, defaultBranch: 'main' };

	function support(sessionFolder: URI | undefined, multipleFolders = true): INestedChatWorkspaceSupport {
		return {
			sessionFolder,
			sessionFolders: sessionFolder ? [sessionFolder, other] : [other],
			multipleFolders,
			browseActions: [{ label: 'Browse...', icon: Codicon.folderOpened, providerId: 'p', run: async () => undefined }],
		};
	}

	/** Picks the list entry whose label matches, the way a user does in the action widget. */
	function createControls(value: IObservable<INestedChatWorkspaceSupport | undefined>, folderInfo: INestedChatFolderInfo = git) {
		let pick: string | undefined;
		const shown: string[][] = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IActionWidgetService, {
			isVisible: false,
			hide: () => { },
			updateItems: () => { },
			show: <T>(_user: string, _supportsPreview: boolean, items: readonly IActionListItem<T>[], delegate: IActionListDelegate<T>) => {
				shown.push(items.map(item => item.label ?? ''));
				const item = items.find(candidate => candidate.label === pick);
				if (item?.item) {
					delegate.onSelect(item.item);
				}
			},
		} as Partial<IActionWidgetService>);
		instantiationService.stub(ILabelService, {
			getUriBasenameLabel: (uri: URI) => uri.path.split('/').pop() ?? '',
			getUriLabel: (uri: URI) => uri.path,
		} as Partial<ILabelService>);
		const controls = store.add(instantiationService.createInstance(NestedChatWorkspaceControls, {
			support: value,
			resolveFolder: async () => folderInfo,
			getBranches: async () => ['main', 'release'],
		}));
		const container = mainWindow.document.createElement('div');
		controls.render(container);
		const trigger = () => container.querySelector<HTMLElement>('.nested-chat-folder-picker .action-label')!;
		return {
			controls, container, shown,
			async pickFolder(label: string) {
				pick = label;
				trigger().click();
				await new Promise(resolve => setTimeout(resolve, 0));
			},
			state() {
				const row = container.querySelector('.nested-chat-workspace-controls')!;
				const branch = container.querySelector('.nested-chat-branch-picker')!;
				return {
					visible: !row.classList.contains('hidden'),
					folder: trigger().textContent,
					canPickFolder: trigger().tabIndex === 0,
					worktreeOffered: !branch.classList.contains('hidden'),
				};
			},
		};
	}

	test('picker visibility and options per session', async () => {
		const ws = createControls(constObservable(support(repo)));
		const wl = createControls(constObservable(support(undefined)));
		const singleFolder = createControls(constObservable(support(repo, false)));
		const oldHostOrCloud = createControls(constObservable(undefined));
		await new Promise(resolve => setTimeout(resolve, 0));
		await ws.pickFolder('nothing');
		await wl.pickFolder('nothing');
		await singleFolder.pickFolder('nothing');
		assert.deepStrictEqual({
			ws: { ...ws.state(), items: ws.shown[0] },
			wl: { ...wl.state(), items: wl.shown[0] },
			singleFolder: { ...singleFolder.state(), items: singleFolder.shown[0] },
			oldHostOrCloud: oldHostOrCloud.state().visible,
		}, {
			ws: { visible: true, folder: 'repo', canPickFolder: true, worktreeOffered: true, items: ['repo', 'other', 'No Workspace', 'Browse...'] },
			wl: { visible: true, folder: 'No Workspace', canPickFolder: true, worktreeOffered: false, items: ['other', 'No Workspace', 'Browse...'] },
			singleFolder: { visible: true, folder: 'repo', canPickFolder: false, worktreeOffered: true, items: undefined },
			oldHostOrCloud: false,
		});
	});

	test('the selection maps to the requested workspace, and a new session starts over', async () => {
		const value = observableValue<INestedChatWorkspaceSupport | undefined>('support', support(repo));
		const h = createControls(value);
		const before = h.controls.getWorkspace();
		await h.pickFolder('No Workspace');
		const scratch = { workspace: h.controls.getWorkspace(), worktreeOffered: h.state().worktreeOffered };
		await h.pickFolder('other');
		const otherFolder = h.controls.getWorkspace();
		value.set(support(undefined), undefined);
		assert.deepStrictEqual({ before, scratch, otherFolder, afterSessionChange: h.controls.getWorkspace(), label: h.state().folder }, {
			before: undefined,
			scratch: { workspace: { kind: 'scratch' }, worktreeOffered: false },
			otherFolder: { kind: 'folder', folder: other, isolation: 'folder' },
			afterSessionChange: undefined,
			label: 'No Workspace',
		});
	});

	test('a non-Git folder offers no worktree', async () => {
		const h = createControls(constObservable(support(repo)), { supportsWorktree: false, defaultBranch: undefined });
		await new Promise(resolve => setTimeout(resolve, 0));
		assert.strictEqual(h.state().worktreeOffered, false);
	});

	suite('send', () => {

		type Send = (query: string, attachments?: undefined, background?: boolean) => Promise<boolean>;

		function chat(name: string, status = SessionStatus.Untitled): IChat {
			return { resource: URI.parse(`chat:/${name}`), status: constObservable(status) } as Partial<IChat> as IChat;
		}

		function createSend(workspace: INestedChatWorkspace | undefined, options: { placeholder?: IChat; refuse?: Error; supported?: boolean } = {}) {
			const placeholder = options.placeholder ?? chat('placeholder');
			const created = chat('created');
			const activeChat = observableValue<IChat>('activeChat', placeholder);
			const session = { sessionId: 's', activeChat };
			const calls: string[] = [];
			const owner = {
				send: Reflect.get(NewChatInSessionWidget.prototype, '_send') as Send,
				_sendInNewWorkspace: Reflect.get(NewChatInSessionWidget.prototype, '_sendInNewWorkspace'),
				_session: constObservable(session),
				_workspaceSupport: constObservable(options.supported === false ? undefined : support(repo)),
				_workspaceControls: { getWorkspace: () => workspace, reset: () => calls.push('reset') },
				sessionsService: {
					openNewChatInSession: async (_session: unknown, open: { workspace?: { workspace: INestedChatWorkspace } }) => {
						calls.push(`open ${open.workspace ? JSON.stringify(open.workspace.workspace) : 'default'}`);
						if (options.refuse) {
							throw options.refuse;
						}
						activeChat.set(created, undefined);
					},
				},
				sessionsManagementService: {
					createNewChatInSession: async () => { calls.push('create'); return created; },
					sendRequest: async (_session: unknown, target: IChat, request: { query: string; background?: boolean }) => { calls.push(`send ${target.resource.path} ${request.query}${request.background ? ' background' : ''}`); },
					deleteChat: async (_session: unknown, resource: URI, deleteOptions: unknown) => { calls.push(`delete ${resource.path} ${JSON.stringify(deleteOptions)}`); return true; },
				},
				notificationService: { error: (message: string) => calls.push(`error ${message}`) },
				logService: { error: () => { } },
			};
			return { send: (background?: boolean) => owner.send('hello', undefined, background), calls };
		}

		test('the default selection reuses the composer chat', async () => {
			const h = createSend(undefined);
			assert.deepStrictEqual({ sent: await h.send(), calls: h.calls }, { sent: true, calls: ['send /placeholder hello'] });
		});

		test('an old host keeps today\'s send', async () => {
			const h = createSend({ kind: 'scratch' }, { supported: false });
			assert.deepStrictEqual({ sent: await h.send(), calls: h.calls }, { sent: true, calls: ['send /placeholder hello'] });
		});

		test('another workspace creates the chat first, sends the draft there and drops the empty placeholder', async () => {
			const h = createSend({ kind: 'scratch' });
			assert.deepStrictEqual({ sent: await h.send(), calls: h.calls }, {
				sent: true,
				calls: ['open {"kind":"scratch"}', 'send /created hello', 'delete /placeholder {"skipConfirmation":true}', 'reset'],
			});
		});

		test('a background send keeps the composer chat', async () => {
			const h = createSend({ kind: 'scratch' });
			assert.deepStrictEqual({ sent: await h.send(true), calls: h.calls }, { sent: true, calls: ['create', 'send /created hello background', 'reset'] });
		});

		test('a refused creation keeps the draft and the placeholder and says why', async () => {
			const h = createSend({ kind: 'folder', folder: other, isolation: 'folder' }, { refuse: new NestedChatWorkspaceError('refused', 'Refused because.') });
			assert.deepStrictEqual({ sent: await h.send(), calls: h.calls }, {
				sent: false,
				calls: [`open ${JSON.stringify({ kind: 'folder', folder: other, isolation: 'folder' })}`, 'error Refused because.'],
			});
		});

		test('a placeholder that holds a turn is never dropped', async () => {
			const h = createSend({ kind: 'scratch' }, { placeholder: chat('placeholder', SessionStatus.Completed) });
			assert.deepStrictEqual(h.calls.length, 0);
			await h.send();
			assert.deepStrictEqual(h.calls, ['open {"kind":"scratch"}', 'send /created hello', 'reset']);
		});
	});
});
