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
			getFolderSources: () => ({ recentFolders: [URI.file('/recent')], canOpenLocalFolder: true }),
			openLocalFolder: async () => URI.file('/opened'),
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
			ws: { visible: true, folder: 'repo', canPickFolder: true, worktreeOffered: true, items: ['repo', 'other', 'recent', 'No Workspace', 'Browse...', 'Open Folder...'] },
			wl: { visible: true, folder: 'No Workspace', canPickFolder: true, worktreeOffered: false, items: ['other', 'recent', 'No Workspace', 'Browse...', 'Open Folder...'] },
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
		// A folder update of the same session keeps the choice; a session switch resets (the widget calls `reset`).
		value.set({ ...support(repo), sessionFolders: [repo, other, URI.file('/third')] }, undefined);
		const afterFolderUpdate = h.controls.getWorkspace();
		value.set(support(undefined), undefined);
		h.controls.reset();
		assert.deepStrictEqual({ before, scratch, otherFolder, afterFolderUpdate, afterSessionChange: h.controls.getWorkspace(), label: h.state().folder }, {
			before: undefined,
			scratch: { workspace: { kind: 'scratch' }, worktreeOffered: false },
			otherFolder: { kind: 'folder', folder: other, isolation: 'folder' },
			afterFolderUpdate: { kind: 'folder', folder: other, isolation: 'folder' },
			afterSessionChange: undefined,
			label: 'No Workspace',
		});
	});

	test('Open Folder selects the folder picked in the dialog', async () => {
		const h = createControls(constObservable(support(repo)), { supportsWorktree: false, defaultBranch: undefined });
		await h.pickFolder('Open Folder...');
		await new Promise(resolve => setTimeout(resolve, 0));
		const workspace = h.controls.getWorkspace();
		assert.deepStrictEqual({ workspace: workspace?.kind === 'folder' ? `${workspace.folder.path} ${workspace.isolation}` : workspace, label: h.state().folder }, { workspace: '/opened folder', label: 'opened' });
	});

	test('a non-Git folder offers no worktree', async () => {
		const h = createControls(constObservable(support(repo)), { supportsWorktree: false, defaultBranch: undefined });
		await new Promise(resolve => setTimeout(resolve, 0));
		assert.strictEqual(h.state().worktreeOffered, false);
	});

	test('opening resolves the default folder once, and a host gaining support selects it', async () => {
		const value = observableValue<INestedChatWorkspaceSupport | undefined>('support', undefined);
		let resolves = 0;
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IActionWidgetService, { isVisible: false, hide: () => { } } as Partial<IActionWidgetService>);
		instantiationService.stub(ILabelService, { getUriBasenameLabel: (uri: URI) => uri.path.split('/').pop() ?? '' } as Partial<ILabelService>);
		const controls = store.add(instantiationService.createInstance(NestedChatWorkspaceControls, {
			support: value,
			resolveFolder: async () => { resolves++; return git; },
			getBranches: async () => [],
			getFolderSources: () => ({ recentFolders: [], canOpenLocalFolder: false }),
			openLocalFolder: async () => undefined,
		}));
		const unsupported = { resolves, workspace: controls.getWorkspace() };
		value.set(support(repo), undefined);
		value.set({ ...support(repo), sessionFolders: [repo] }, undefined);
		await new Promise(resolve => setTimeout(resolve, 0));
		assert.deepStrictEqual({ unsupported, resolves }, { unsupported: { resolves: 0, workspace: undefined }, resolves: 1 });
	});

	suite('send', () => {

		type Send = (query: string, attachments?: undefined, background?: boolean, userInteraction?: never) => Promise<boolean>;

		function chat(name: string, status = SessionStatus.Untitled): IChat {
			return { resource: URI.parse(`chat:/${name}`), status: constObservable(status) } as Partial<IChat> as IChat;
		}

		function createSend(initialWorkspace: INestedChatWorkspace | undefined, options: { placeholder?: IChat; refuse?: Error; supported?: boolean; failSend?: () => boolean; disposeDuringApply?: boolean } = {}) {
			let workspace = initialWorkspace;
			const placeholder = options.placeholder ?? chat('placeholder');
			const activeChat = observableValue<IChat>('activeChat', placeholder);
			const session = { sessionId: 's', activeChat, chats: constObservable([placeholder]) };
			const calls: string[] = [];
			const owner = {
				send: Reflect.get(NewChatInSessionWidget.prototype, '_send') as Send,
				_applyWorkspace: Reflect.get(NewChatInSessionWidget.prototype, '_applyWorkspace'),
				_appliedWorkspace: undefined as { chat: URI; workspace: INestedChatWorkspace } | undefined,
				_store: { isDisposed: false },
				_session: constObservable(session),
				_workspaceSupport: constObservable(options.supported === false ? undefined : support(repo)),
				_workspaceControls: { getWorkspace: () => workspace, reset: () => calls.push('reset') },
				sessionsService: {
					openNewChatInSession: async () => { calls.push('open composer chat'); },
				},
				sessionsManagementService: {
					applyNestedChatWorkspace: async (_session: unknown, target: IChat, applied: INestedChatWorkspace) => {
						calls.push(`apply ${target.resource.path} ${JSON.stringify(applied)}`);
						if (options.disposeDuringApply) {
							owner._store.isDisposed = true;
						}
						if (options.refuse) {
							throw options.refuse;
						}
					},
					sendRequest: async (_session: unknown, target: IChat, request: { query: string; background?: boolean; onDidCreateResponse?: unknown }) => {
						calls.push(`send ${target.resource.path} ${request.query}${request.background ? ' background' : ''}${request.onDidCreateResponse ? ' measured' : ''}`);
						if (options.failSend?.()) {
							throw new Error('send failed');
						}
					},
					createNewChatInSession: async () => { calls.push('create'); },
					deleteChat: async () => { calls.push('delete'); return true; },
				},
				notificationService: { error: (message: string) => calls.push(`error ${message}`) },
				logService: { error: () => { } },
			};
			const interaction = { handoff: () => calls.push('handoff'), cancel: (reason: string) => calls.push(`cancel ${reason}`), onDidCreateResponse: () => { } };
			const send = (background?: boolean) => owner.send.call(owner, 'hello', undefined, background, interaction as never);
			return {
				send, calls, chats: () => session.chats.get().length,
				sendWith: (next: INestedChatWorkspace) => { workspace = next; return send(); },
			};
		}

		test('the default selection sends to the composer chat as is', async () => {
			const h = createSend(undefined);
			assert.deepStrictEqual({ sent: await h.send(), calls: h.calls }, { sent: true, calls: ['handoff', 'send /placeholder hello measured'] });
		});

		test('an old host keeps today\'s send', async () => {
			const h = createSend({ kind: 'scratch' }, { supported: false });
			assert.deepStrictEqual({ sent: await h.send(), calls: h.calls }, { sent: true, calls: ['handoff', 'send /placeholder hello measured'] });
		});

		test('another workspace is applied to the composer chat, which then gets the request', async () => {
			const h = createSend({ kind: 'scratch' });
			assert.deepStrictEqual({ sent: await h.send(), calls: h.calls, chats: h.chats() }, {
				sent: true,
				calls: ['apply /placeholder {"kind":"scratch"}', 'handoff', 'send /placeholder hello measured', 'reset'],
				chats: 1,
			});
		});

		test('a background send applies the workspace, then opens a fresh composer chat', async () => {
			const h = createSend({ kind: 'scratch' });
			assert.deepStrictEqual({ sent: await h.send(true), calls: h.calls }, {
				sent: true,
				calls: ['apply /placeholder {"kind":"scratch"}', 'open composer chat', 'handoff', 'send /placeholder hello background measured', 'reset'],
			});
		});

		test('a refused workspace sends nothing, keeps the draft and says why', async () => {
			const folder = { kind: 'folder', folder: other, isolation: 'folder' } as const;
			const h = createSend(folder, { refuse: new NestedChatWorkspaceError('refused', 'Refused because.') });
			assert.deepStrictEqual({ sent: await h.send(), calls: h.calls }, {
				sent: false,
				calls: [`apply /placeholder ${JSON.stringify(folder)}`, 'error Refused because.', 'cancel error'],
			});
		});

		test('a failed send after the workspace was applied leaves one chat and restores the draft', async () => {
			const h = createSend({ kind: 'scratch' }, { failSend: () => true });
			assert.deepStrictEqual({ sent: await h.send(), calls: h.calls, chats: h.chats() }, {
				sent: false,
				calls: ['apply /placeholder {"kind":"scratch"}', 'handoff', 'send /placeholder hello measured', 'cancel error'],
				chats: 1,
			});
		});

		test('sending again after a failed send reuses the applied workspace, a different choice applies again', async () => {
			let fail = true;
			const worktree: INestedChatWorkspace = { kind: 'folder', folder: other, isolation: 'worktree', baseBranch: 'main' };
			const folder: INestedChatWorkspace = { kind: 'folder', folder: repo, isolation: 'folder' };
			const h = createSend(undefined, { failSend: () => fail });
			const results = [await h.sendWith(worktree), await h.sendWith(worktree), await h.sendWith(folder)];
			fail = false;
			results.push(await h.sendWith(folder));
			assert.deepStrictEqual({ results, applies: h.calls.filter(call => call.startsWith('apply') || call === 'reset') }, {
				results: [false, false, false, true],
				applies: [`apply /placeholder ${JSON.stringify(worktree)}`, `apply /placeholder ${JSON.stringify(folder)}`, 'reset'],
			});
		});

		test('a composer closed while the workspace is applied still sends, unmeasured, and creates nothing', async () => {
			const h = createSend({ kind: 'scratch' }, { disposeDuringApply: true });
			assert.deepStrictEqual({ sent: await h.send(true), calls: h.calls }, {
				sent: true,
				calls: ['apply /placeholder {"kind":"scratch"}', 'cancel cancelled', 'send /placeholder hello background'],
			});
		});

		test('a chat that already started never gets a workspace', async () => {
			const h = createSend({ kind: 'scratch' }, { placeholder: chat('placeholder', SessionStatus.Completed) });
			assert.deepStrictEqual({ sent: await h.send(), calls: h.calls.map(call => call.startsWith('error') ? 'error' : call) }, {
				sent: false,
				calls: ['error', 'cancel error'],
			});
		});
	});
});
