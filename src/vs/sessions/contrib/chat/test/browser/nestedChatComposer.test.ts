/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { mainWindow } from '../../../../../base/browser/window.js';
import { IManagedHoverContentOrFactory } from '../../../../../base/browser/ui/hover/hover.js';
import { IHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegate.js';
import { getBaseLayerHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegate2.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { constObservable, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { createFileSystemProviderError, FileSystemProviderErrorCode } from '../../../../../platform/files/common/files.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem, IActionListOptions } from '../../../../../platform/actionWidget/browser/actionList.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { MockContextKeyService, MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IChat, SessionStatus } from '../../../../services/sessions/common/session.js';
import { INestedChatFolderInfo, INestedChatWorkspace, INestedChatWorkspaceSupport, NestedChatWorkspaceError } from '../../../../services/sessions/common/sessionsProvider.js';
import { NewChatInSessionWidget } from '../../browser/newChatInSessionWidget.js';
import { getNoWorkspaceChoicePresentation } from '../../browser/noWorkspaceChoice.js';
import { INestedChatWorkspaceHost, NestedChatWorkspaceControls } from '../../browser/nestedChatWorkspacePicker.js';

suite('Sessions - New Nested Session composer', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const repo = URI.file('/repo');
	const other = URI.file('/other');
	const git: INestedChatFolderInfo = { supportsWorktree: true, defaultBranch: 'main' };

	function support(sessionFolder: URI | undefined, multipleFolders = true): INestedChatWorkspaceSupport {
		return {
			sessionFolder,
			sessionFolderWorktree: undefined,
			multipleFolders,
			browseActions: [{ label: 'Browse...', icon: Codicon.folderOpened, providerId: 'p', run: async () => undefined }],
		};
	}

	/** Picks the list entry whose label matches, the way a user does in the action widget. */
	function createControls(value: IObservable<INestedChatWorkspaceSupport | undefined>, folderInfo: INestedChatFolderInfo = git, host: Partial<Pick<INestedChatWorkspaceHost, 'describeFolder' | 'describeNoWorkspace' | 'folderExists'>> & { recentFolders?: readonly URI[] } = {}) {
		let pick: string | undefined;
		const shown: string[][] = [];
		const accessibilityProviderKeys: string[][] = [];
		const lists: { rows: string[]; icons: (string | undefined)[]; options: { className: string | undefined; inlineDescription: boolean | undefined } }[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		const hoverDelegate: IHoverDelegate = { placement: 'element', delay: 500, showHover: () => undefined };
		const hovers = new Map<HTMLElement, { delegate: IHoverDelegate; content: IManagedHoverContentOrFactory }>();
		instantiationService.stub(IActionWidgetService, {
			isVisible: false,
			hide: () => { },
			updateItems: () => { },
			show: <T>(_user: string, _supportsPreview: boolean, items: readonly IActionListItem<T>[], delegate: IActionListDelegate<T>, _anchor: HTMLElement, _container: HTMLElement | undefined, _actionBarActions: unknown, accessibilityProvider: object | undefined, listOptions?: IActionListOptions) => {
				accessibilityProviderKeys.push(Object.keys(accessibilityProvider ?? {}));
				shown.push(items.map(item => item.label ?? ''));
				lists.push({
					rows: items.map(item => item.kind === ActionListItemKind.Separator ? '---' : `${item.label}${item.description ? ` · ${item.description}` : ''}`),
					icons: items.map(item => item.group?.icon?.id),
					options: { className: listOptions?.className, inlineDescription: listOptions?.inlineDescription },
				});
				const item = items.find(candidate => candidate.label === pick);
				if (item?.item) {
					delegate.onSelect(item.item);
				}
			},
		} as Partial<IActionWidgetService>);
		instantiationService.stub(IMenuService, { getMenuActions: () => [] });
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(IKeybindingService, new MockKeybindingService());
		instantiationService.stub(ICommandService, {});
		instantiationService.stub(ILabelService, {
			getUriBasenameLabel: (uri: URI) => uri.path.split('/').pop() ?? '',
			getUriLabel: (uri: URI) => uri.path,
		} as Partial<ILabelService>);
		const hoverService: Partial<IHoverService> = {
			setupDelayedHover: () => toDisposable(() => { }),
			setupManagedHover: (delegate, target, content) => {
				hovers.set(target, { delegate, content });
				return { dispose: () => hovers.delete(target), show: () => { }, hide: () => { }, update: () => { } };
			},
		};
		instantiationService.stub(IHoverService, hoverService);
		// Toolbar items set up their hovers through the base layer delegate.
		// A test may create several controls: the latest takes over the stub.
		(getBaseLayerHoverDelegate().setupManagedHover as Partial<sinon.SinonStub>).restore?.();
		const setupManagedHover = sinon.stub(getBaseLayerHoverDelegate(), 'setupManagedHover').callsFake((delegate, target, content) => hoverService.setupManagedHover!(delegate, target, content));
		store.add(toDisposable(() => setupManagedHover.restore()));
		const controls = store.add(instantiationService.createInstance(NestedChatWorkspaceControls, {
			support: value,
			resolveFolder: async () => folderInfo,
			getBranches: async () => ['main', 'release'],
			getFolderSources: () => ({ recentFolders: host.recentFolders ?? [URI.file('/recent')], canOpenLocalFolder: true }),
			describeNoWorkspace: host.describeNoWorkspace ?? (() => getNoWorkspaceChoicePresentation(false, undefined)),
			describeFolder: host.describeFolder ?? (() => undefined),
			folderExists: host.folderExists ?? (async () => true),
			openLocalFolder: async () => URI.file('/opened'),
		}));
		const row = mainWindow.document.createElement('div');
		controls.renderFolderPicker(row, hoverDelegate);
		const repositoryContainer = mainWindow.document.createElement('div');
		const repositoryControls = store.add(controls.renderRepositoryControls(repositoryContainer, hoverDelegate));
		const trigger = () => row.querySelector<HTMLElement>('.nested-chat-folder-picker .action-label')!;
		return {
			controls, shown, lists, accessibilityProviderKeys, trigger,
			tooltip() {
				const content = hovers.get(trigger().closest<HTMLElement>('.action-item')!)?.content;
				const resolved = typeof content === 'function' ? content() : content;
				const markdown = resolved && typeof resolved === 'object' ? Reflect.get(resolved, 'markdown') : undefined;
				return typeof markdown === 'function' ? markdown() : resolved;
			},
			hoverPresentation() {
				return Array.from(hovers, ([target, hover]) => ({
					nativeTitle: target.title,
					sharedDelegate: hover.delegate === hoverDelegate,
					placement: hover.delegate.placement,
				}));
			},
			async pickFolder(label: string) {
				pick = label;
				trigger().click();
				await new Promise(resolve => setTimeout(resolve, 0));
			},
			async pickIsolation(label: string) {
				pick = label;
				repositoryContainer.querySelector<HTMLElement>('.sessions-chat-isolation-picker .action-label')!.click();
				await new Promise(resolve => setTimeout(resolve, 0));
			},
			state() {
				const repository = repositoryContainer.querySelector<HTMLElement>('.nested-chat-repository-controls')!;
				return {
					visible: !row.querySelector<HTMLElement>('.nested-chat-folder-picker')!.hidden,
					folder: trigger().textContent,
					canPickFolder: trigger().tabIndex === 0,
					worktreeOffered: !repository.hidden && repositoryControls.visible.get(),
					petPlatforms: controls.getChatPetPlatformElements().length,
				};
			},
			repositoryState() {
				const isolation = repositoryContainer.querySelector<HTMLElement>('.sessions-chat-isolation-picker .action-label')!;
				const branch = repositoryContainer.querySelector<HTMLElement>('.nested-chat-branch-picker')!;
				const branchTrigger = branch.querySelector<HTMLElement>('.action-label')!;
				return {
					isolation: `${isolation.getAttribute('aria-label')} [${isolation.role}]`,
					branch: branch.hidden ? 'hidden' : `${branchTrigger.getAttribute('aria-label')} [${branchTrigger.role}]${branch.querySelector('.codicon-chevron-down') ? ' with chevron' : ''}`,
					separator: !repositoryContainer.querySelector<HTMLElement>('.nested-chat-repository-separator')!.hidden,
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
			oldHostOrCloud: { visible: oldHostOrCloud.state().visible, worktreeOffered: oldHostOrCloud.state().worktreeOffered, petPlatforms: oldHostOrCloud.state().petPlatforms },
		}, {
			ws: { visible: true, folder: 'repo', canPickFolder: true, worktreeOffered: true, petPlatforms: 1, items: ['repo', 'recent', 'No workspace', '', 'Browse...', 'Open Folder...'] },
			wl: { visible: true, folder: 'No workspace', canPickFolder: true, worktreeOffered: false, petPlatforms: 1, items: ['recent', 'No workspace', '', 'Browse...', 'Open Folder...'] },
			singleFolder: { visible: true, folder: 'repo', canPickFolder: false, worktreeOffered: true, petPlatforms: 1, items: undefined },
			oldHostOrCloud: { visible: false, worktreeOffered: false, petPlatforms: 0 },
		});
	});

	test('lists the session folder, recent folders and No workspace like New Session', async () => {
		const recentFolders = ['a', 'repo', 'b', 'c', 'd', 'e', 'f'].map(name => URI.file(`/work/${name}`));
		const h = createControls(constObservable(support(URI.file('/work/repo'))), git, { recentFolders, describeFolder: folder => folder.path === '/work/a' ? { label: 'a [host]', description: '/work' } : undefined });
		await h.pickFolder('nothing');
		assert.deepStrictEqual(h.lists, [{
			icons: ['folder', 'folder', 'folder', 'folder', 'folder', 'folder', 'comment-discussion', undefined, 'folder-opened', 'folder-opened'],
			rows: ['repo · /work', 'a [host] · /work', 'b · /work', 'c · /work', 'd · /work', 'e · /work', 'No workspace · Start without a backing workspace', '---', 'Browse...', 'Open Folder...'],
			options: { className: 'sessions-new-chat-picker-list', inlineDescription: true },
		}]);
	});

	test('leaves the row\'s accessible label to the action list so the worktree note is announced', async () => {
		const h = createControls(constObservable({ ...support(URI.file('/work/wt')), sessionFolderWorktree: { branch: 'agents/fix', repositoryLabel: 'repo' } }));
		await h.pickFolder('nothing');
		assert.deepStrictEqual(h.accessibilityProviderKeys, [['getWidgetAriaLabel']]);
	});

	test('presents No workspace the way New Session does for the session\'s provider', async () => {
		const present = async (unified: boolean, provider: { id: string; label: string; icon: ThemeIcon } | undefined) => {
			const h = createControls(constObservable(support(URI.file('/work/repo'))), git, { describeNoWorkspace: () => getNoWorkspaceChoicePresentation(unified, provider) });
			await h.pickFolder('nothing');
			const row = h.lists[0].rows.findIndex(candidate => candidate.endsWith('Start without a backing workspace'));
			return { row: h.lists[0].rows[row], icon: h.lists[0].icons[row] };
		};
		assert.deepStrictEqual({
			standard: await present(false, undefined),
			local: await present(true, { id: 'local-agent-host', label: 'Local', icon: Codicon.deviceDesktop }),
			remote: await present(true, { id: 'remote-agent-host-dev', label: 'Dev Box', icon: Codicon.remote }),
		}, {
			standard: { row: 'No workspace · Start without a backing workspace', icon: Codicon.commentDiscussion.id },
			local: { row: 'This Computer · Start without a backing workspace', icon: Codicon.deviceDesktop.id },
			remote: { row: 'Chat [Dev Box] · Start without a backing workspace', icon: Codicon.remote.id },
		});
	});

	test('a session folder that no longer exists is neither preselected nor offered, and the trigger says why', async () => {
		const missing = createControls(constObservable(support(repo)), git, { folderExists: async folder => folder.path !== '/repo' });
		const cannotTell = createControls(constObservable(support(repo)), git, { folderExists: async () => undefined });
		const singleFolder = createControls(constObservable(support(repo, false)), git, { folderExists: async () => false });
		await new Promise(resolve => setTimeout(resolve, 0));
		await missing.pickFolder('nothing');
		const describe = async (h: ReturnType<typeof createControls>) => ({ folder: h.state().folder, title: h.trigger().title, tooltip: await h.tooltip(), description: h.trigger().getAttribute('aria-description'), workspace: h.controls.getWorkspace() });
		assert.deepStrictEqual({
			missing: { ...await describe(missing), items: missing.shown[0] },
			cannotTell: await describe(cannotTell),
			singleFolder: await describe(singleFolder),
		}, {
			missing: {
				folder: 'No workspace',
				title: '',
				tooltip: 'No workspace. The session\'s folder repo no longer exists.',
				description: 'The session\'s folder repo no longer exists.',
				workspace: { kind: 'scratch' },
				items: ['recent', 'No workspace', '', 'Browse...', 'Open Folder...'],
			},
			cannotTell: { folder: 'repo', title: '', tooltip: 'repo', description: null, workspace: undefined },
			singleFolder: { folder: 'repo', title: '', tooltip: 'Folder for the Nested Session, repo', description: null, workspace: undefined },
		});
	});

	test('folder, isolation, and branch pickers share the composer hover delegate', async () => {
		const harness = createControls(constObservable(support(repo)));
		await new Promise(resolve => setTimeout(resolve, 0));

		assert.deepStrictEqual(harness.hoverPresentation(), Array.from({ length: 3 }, () => ({
			nativeTitle: '',
			sharedDelegate: true,
			placement: 'element',
		})));
	});

	test('a send waits for the check of the session folder', async () => {
		const answers: ((exists: boolean | undefined) => void)[] = [];
		const folderExists = () => new Promise<boolean | undefined>(resolve => answers.push(resolve));
		const missing = createControls(constObservable(support(repo)), git, { folderExists });
		const cannotTell = createControls(constObservable(support(repo)), git, { folderExists });
		const workspaces = [missing.controls.resolveWorkspace(), cannotTell.controls.resolveWorkspace()];
		answers[0](false);
		answers[1](undefined);
		assert.deepStrictEqual(await Promise.all(workspaces), [{ kind: 'scratch' }, undefined]);
	});

	test('only a folder that is definitely gone counts as missing', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const folderExists = Reflect.get(NewChatInSessionWidget.prototype, '_folderExists') as (folder: URI, token: CancellationToken) => Promise<boolean | undefined>;
		const check = (stat: () => Promise<unknown>, token = CancellationToken.None) => folderExists.call({ fileService: { stat } }, repo, token);
		const cancelled = new CancellationTokenSource();
		cancelled.cancel();
		assert.deepStrictEqual({
			found: await check(async () => ({})),
			notFound: await check(() => Promise.reject(createFileSystemProviderError('gone', FileSystemProviderErrorCode.FileNotFound))),
			unavailable: await check(() => Promise.reject(createFileSystemProviderError('disconnected', FileSystemProviderErrorCode.Unavailable))),
			unknownError: await check(() => Promise.reject(new Error('boom'))),
			noAnswer: await check(() => new Promise(() => { })),
			cancelled: await check(() => new Promise(() => { }), cancelled.token),
		}, { found: true, notFound: false, unavailable: undefined, unknownError: undefined, noAnswer: undefined, cancelled: undefined });
		cancelled.dispose();
	}));

	test('the selection maps to the requested workspace, and a new session starts over', async () => {
		const value = observableValue<INestedChatWorkspaceSupport | undefined>('support', support(repo));
		const h = createControls(value, git, { recentFolders: [other] });
		const before = h.controls.getWorkspace();
		await h.pickFolder('No workspace');
		const scratch = { workspace: h.controls.getWorkspace(), worktreeOffered: h.state().worktreeOffered };
		await h.pickFolder('other');
		const otherFolder = h.controls.getWorkspace();
		// A capability update of the same session keeps the choice; a session switch resets (the widget calls `reset`).
		value.set({ ...support(repo), browseActions: [] }, undefined);
		const afterFolderUpdate = h.controls.getWorkspace();
		value.set(support(undefined), undefined);
		h.controls.reset();
		assert.deepStrictEqual({ before, scratch, otherFolder, afterFolderUpdate, afterSessionChange: h.controls.getWorkspace(), label: h.state().folder }, {
			before: undefined,
			scratch: { workspace: { kind: 'scratch' }, worktreeOffered: false },
			otherFolder: { kind: 'folder', folder: other, isolation: 'folder' },
			afterFolderUpdate: { kind: 'folder', folder: other, isolation: 'folder' },
			afterSessionChange: undefined,
			label: 'No workspace',
		});
	});

	test('the isolation dropdown offers Branch and New Worktree, and only a worktree shows the branch picker', async () => {
		const h = createControls(constObservable(support(repo)));
		await new Promise(resolve => setTimeout(resolve, 0));
		const initial = { ...h.repositoryState(), workspace: h.controls.getWorkspace() };
		await h.pickIsolation('New Worktree');
		await new Promise(resolve => setTimeout(resolve, 0));
		const worktree = { ...h.repositoryState(), items: h.shown.at(-1), workspace: h.controls.getWorkspace() };
		await h.pickIsolation('Branch');
		const folder = { ...h.repositoryState(), workspace: h.controls.getWorkspace() };

		assert.deepStrictEqual({ initial, worktree, folder }, {
			initial: { isolation: 'Isolation: Branch [button]', branch: 'hidden', separator: false, workspace: undefined },
			worktree: {
				isolation: 'Isolation: New Worktree [button]',
				branch: 'Pick Branch, main [button]',
				separator: true,
				items: ['Branch', 'New Worktree'],
				workspace: { kind: 'folder', folder: repo, isolation: 'worktree', baseBranch: 'main' },
			},
			folder: { isolation: 'Isolation: Branch [button]', branch: 'hidden', separator: false, workspace: undefined },
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
			describeNoWorkspace: () => getNoWorkspaceChoicePresentation(false, undefined),
			describeFolder: () => undefined,
			folderExists: async () => true,
			openLocalFolder: async () => undefined,
		}));
		const unsupported = { resolves, workspace: controls.getWorkspace() };
		value.set(support(repo), undefined);
		value.set({ ...support(repo), browseActions: [] }, undefined);
		await new Promise(resolve => setTimeout(resolve, 0));
		assert.deepStrictEqual({ unsupported, resolves }, { unsupported: { resolves: 0, workspace: undefined }, resolves: 1 });
	});

	test('renders the New Session structure: the options row in the centered content, the repository controls where New Session has them', () => {
		const experimental = observableValue('experimental', false);
		const supported = observableValue<INestedChatWorkspaceSupport | undefined>('support', support(repo));
		const offersWorktree = observableValue('offersWorktree', true);
		const placements: (string | undefined)[] = [];
		const parent = mainWindow.document.createElement('div');
		const owner = {
			_register: <T extends IDisposable>(disposable: T) => store.add(disposable),
			_useExperimentalComposerLayout: experimental,
			_screenReaderOptimized: constObservable(false),
			_collapsedSessionOptionsShowIcons: constObservable(true),
			_sessionOptionsExpanded: constObservable(true),
			_workspaceSupport: supported,
			_workspaceControls: {
				renderFolderPicker: (row: HTMLElement) => row.appendChild(mainWindow.document.createElement('div')).classList.add('nested-chat-folder-picker'),
				offersWorktree,
			},
			_newChatInput: {
				render: (content: HTMLElement) => content.appendChild(mainWindow.document.createElement('div')).classList.add('new-chat-input-container'),
				placeRepositoryControls: (host?: HTMLElement) => placements.push(host?.className),
				hostNoticeContainerElement: undefined,
			},
			storageService: { getBoolean: () => true },
			_renderSubSessionTip: Reflect.get(NewChatInSessionWidget.prototype, '_renderSubSessionTip'),
		};
		(Reflect.get(NewChatInSessionWidget.prototype, 'render') as (parent: HTMLElement) => void).call(owner, parent);
		const structure = () => {
			const describe = (element: Element): string => `${element.className}${element instanceof HTMLElement && element.hidden ? '[hidden]' : ''}`;
			const content = parent.querySelector('.new-chat-widget-content')!;
			return [...content.children].map(child => [describe(child), ...[...child.querySelectorAll('.sessions-workspace-category-picker > *')].map(describe)]);
		};
		const standard = { structure: structure(), placements: placements.splice(0) };
		experimental.set(true, undefined);
		const experimentalLayout = { structure: structure(), placements: placements.splice(0) };
		// "No workspace" or a folder without Git: no worktree, so no tray to show or hide.
		offersWorktree.set(false, undefined);
		const noWorktree = structure()[0];
		supported.set(undefined, undefined);
		const unsupported = structure()[0][0];

		assert.deepStrictEqual({ standard, experimentalLayout, noWorktree, unsupported }, {
			standard: {
				structure: [
					['new-session-workspace-picker-container', 'nested-chat-folder-picker', 'new-chat-session-options-details legacy-session-options-details', 'monaco-button new-chat-session-options-toggle codicon codicon-chevron-left-compact[hidden]'],
					['new-chat-input-container'],
				],
				// Below the input, like New Session's standard layout.
				placements: [undefined],
			},
			experimentalLayout: {
				structure: [
					['new-session-workspace-picker-container', 'nested-chat-folder-picker', 'new-chat-session-options-details', 'monaco-button new-chat-session-options-toggle codicon codicon-chevron-left-compact'],
					['new-chat-input-container'],
				],
				// In the options tray, like New Session's experimental layout.
				placements: ['new-chat-repository-controls-host'],
			},
			noWorktree: ['new-session-workspace-picker-container', 'nested-chat-folder-picker', 'new-chat-session-options-details[hidden]', 'monaco-button new-chat-session-options-toggle codicon codicon-chevron-left-compact[hidden]'],
			unsupported: 'new-session-workspace-picker-container[hidden]',
		});
	});

	test('the tray starts from New Session\'s choice, and a choice made here leaves New Session\'s untouched', () => {
		const storage = store.add(new InMemoryStorageService());
		storage.store('agentSessions.newSession.sessionOptionsExpanded2', false, StorageScope.PROFILE, StorageTarget.USER);
		const parent = mainWindow.document.createElement('div');
		const owner = {
			_register: <T extends IDisposable>(disposable: T) => store.add(disposable),
			_useExperimentalComposerLayout: constObservable(true),
			_screenReaderOptimized: constObservable(false),
			_collapsedSessionOptionsShowIcons: constObservable(false),
			_sessionOptionsExpanded: observableValue('expanded', Reflect.get(NewChatInSessionWidget.prototype, '_getInitialSessionOptionsExpanded').call({ storageService: storage })),
			_workspaceSupport: constObservable(support(repo)),
			_workspaceControls: { renderFolderPicker: () => { }, offersWorktree: constObservable(true) },
			_newChatInput: { render: () => { }, placeRepositoryControls: () => { }, hostNoticeContainerElement: undefined },
			storageService: storage,
			_renderSubSessionTip: () => { },
		};
		(Reflect.get(NewChatInSessionWidget.prototype, 'render') as (parent: HTMLElement) => void).call(owner, parent);
		const initial = owner._sessionOptionsExpanded.get();
		parent.querySelector<HTMLElement>('.new-chat-session-options-toggle')!.click();

		assert.deepStrictEqual({
			initial,
			expanded: owner._sessionOptionsExpanded.get(),
			newSession: storage.getBoolean('agentSessions.newSession.sessionOptionsExpanded2', StorageScope.PROFILE),
			nested: storage.getBoolean('sessions.nestedSession.sessionOptionsExpanded', StorageScope.PROFILE),
		}, { initial: false, expanded: true, newSession: false, nested: true });
	});

	suite('send', () => {

		type Send = (query: string, attachments?: undefined, background?: boolean, userInteraction?: never) => Promise<boolean>;

		function chat(name: string, status = SessionStatus.Untitled): IChat {
			return { resource: URI.parse(`chat:/${name}`), status: constObservable(status) } as Partial<IChat> as IChat;
		}

		function createSend(initialWorkspace: INestedChatWorkspace | undefined, options: { placeholder?: IChat; activeElsewhere?: IChat; refuse?: Error; supported?: boolean; failSend?: () => boolean; disposeDuringApply?: boolean; sessionDuringCheck?: string } = {}) {
			let workspace = initialWorkspace;
			const placeholder = options.placeholder ?? chat('placeholder');
			const activeChat = observableValue<IChat>('activeChat', options.activeElsewhere ?? placeholder);
			const session = { sessionId: 's', activeChat, chats: constObservable([placeholder]) };
			const calls: string[] = [];
			const owner = {
				send: Reflect.get(NewChatInSessionWidget.prototype, '_send') as Send,
				_applyWorkspace: Reflect.get(NewChatInSessionWidget.prototype, '_applyWorkspace'),
				_appliedWorkspace: undefined as { chat: URI; workspace: INestedChatWorkspace } | undefined,
				_store: { isDisposed: false },
				_session: observableValue<object>('session', session),
				_chat: constObservable<IChat | undefined>(placeholder),
				_workspaceSupport: constObservable(options.supported === false ? undefined : support(repo)),
				_workspaceControls: {
					resolveWorkspace: async () => {
						if (options.sessionDuringCheck) {
							owner._session.set({ ...session, sessionId: options.sessionDuringCheck }, undefined);
						}
						return workspace;
					},
					reset: () => calls.push('reset'),
				},
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

		test('sends to the composer chat while another chat of the session is active', async () => {
			const h = createSend({ kind: 'scratch' }, { activeElsewhere: chat('other', SessionStatus.Completed) });
			assert.deepStrictEqual({ sent: await h.send(), calls: h.calls }, {
				sent: true,
				calls: ['apply /placeholder {"kind":"scratch"}', 'handoff', 'send /placeholder hello measured', 'reset'],
			});
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

		test('a session switch while the folder is checked sends nothing to the old session\'s chat, a refreshed session object still sends', async () => {
			const switched = createSend({ kind: 'scratch' }, { sessionDuringCheck: 'other' });
			const refreshed = createSend({ kind: 'scratch' }, { sessionDuringCheck: 's' });
			assert.deepStrictEqual({
				switched: { sent: await switched.send(), calls: switched.calls },
				refreshed: { sent: await refreshed.send(), calls: refreshed.calls },
			}, {
				switched: { sent: false, calls: ['cancel cancelled'] },
				refreshed: { sent: true, calls: ['apply /placeholder {"kind":"scratch"}', 'handoff', 'send /placeholder hello measured', 'reset'] },
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
