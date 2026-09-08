/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Action, SubmenuAction, toAction, type IAction } from '../../../../../base/common/actions.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { computePullRequestIcon, type ChatPullRequestState } from '../../../../common/chatPullRequest.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { ChatInputPills, createChatInputPillSource, StandardChatInputPillSources, type IStandardChatInputPillsData } from '../../browser/chatInputPills.js';
import { createSessionPullRequestPillData, type IChatPullRequestPillEntry, type IChatPullRequestPillSection } from '../../browser/sessionPullRequestPill.js';
import { ISessionChatPillVisibilityService, SESSION_CHAT_PILL_KINDS, SessionChatPillKind, SessionChatPillVisibility } from '../../common/sessionChatPills.js';

suite('StandardChatInputPillSources', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createServices(sharedVisibility?: SessionChatPillVisibility) {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const visibility = sharedVisibility ?? store.add(instantiationService.createInstance(SessionChatPillVisibility));
		instantiationService.stub(ISessionChatPillVisibilityService, visibility);
		return { instantiationService, visibility };
	}

	function createPills(data: IStandardChatInputPillsData, sharedVisibility?: SessionChatPillVisibility) {
		const { instantiationService, visibility } = createServices(sharedVisibility);
		let menuActions: readonly IAction[] = [];
		instantiationService.stub(IContextMenuService, {
			showContextMenu: delegate => {
				assert.ok(delegate.getActions);
				menuActions = delegate.getActions();
			},
		});
		const container = document.createElement('div');
		document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		const sources = store.add(instantiationService.createInstance(StandardChatInputPillSources, data, SESSION_CHAT_PILL_KINDS));
		const inputPills = store.add(instantiationService.createInstance(ChatInputPills, container, {
			debugName: 'ChatInputPills.options.test',
			compact: false,
			enabled: constObservable(true),
			sources: constObservable(sources.sources),
			offeredKinds: SESSION_CHAT_PILL_KINDS,
		}));
		return {
			inputPills,
			visibility,
			labels: () => [...inputPills.element.querySelectorAll('.chat-pill-label')].map(element => element.textContent),
			openContextMenu: (target: HTMLElement, keyboard = false) => {
				menuActions = [];
				target.dispatchEvent(keyboard
					? new KeyboardEvent('keydown', { key: 'F10', keyCode: 121, shiftKey: true, bubbles: true })
					: new MouseEvent('contextmenu', { bubbles: true }));
				return menuActions;
			},
		};
	}

	function pullRequestEntry(id: string, state?: ChatPullRequestState): IChatPullRequestPillEntry {
		return { id, label: id, pillLabel: id, icon: computePullRequestIcon(state ?? 'open'), pullRequestState: state, open: () => { } };
	}

	function createPullRequestVisibility() {
		return store.add(new SessionChatPillVisibility(store.add(new TestStorageService()))).pullRequests;
	}

	test('uses one canonical composition for different offered kind sets', () => {
		const { instantiationService } = createServices();
		const sections = constObservable([]);
		const data: IStandardChatInputPillsData = {
			changes: {
				stats: constObservable({ files: 1, insertions: 2, deletions: 1 }),
				label: constObservable('Changes'),
				open: () => { },
			},
			pullRequests: { sections },
			issues: { sections },
			artifacts: { sections },
			references: { sections },
			customizations: { sections },
			browsers: { sections },
			subagents: { sections },
		};
		const full = store.add(instantiationService.createInstance(StandardChatInputPillSources, data, SESSION_CHAT_PILL_KINDS));
		const editorKinds = [
			SessionChatPillKind.Changes,
			SessionChatPillKind.PullRequests,
			SessionChatPillKind.Issues,
			SessionChatPillKind.Artifacts,
			SessionChatPillKind.References,
			SessionChatPillKind.Browsers,
		];
		const editor = store.add(instantiationService.createInstance(StandardChatInputPillSources, data, editorKinds));

		assert.deepStrictEqual({
			full: full.sources.map(source => source.kind),
			editor: editor.sources.map(source => source.kind),
		}, {
			full: SESSION_CHAT_PILL_KINDS,
			editor: editorKinds,
		});
	});

	test('offers checked pull request options directly below Hide for mouse and keyboard', async () => {
		const data = createSessionPullRequestPillData(constObservable([{ title: 'Pull Requests', entries: [pullRequestEntry('#1', 'open')] }]), createPullRequestVisibility());
		const pills = createPills({
			pullRequests: data,
		});
		const menu = pills.openContextMenu(pills.inputPills.getPillElements()[0]);
		const submenu = menu[1];
		assert.ok(submenu instanceof SubmenuAction);
		const before = submenu.actions.map(action => ({ label: action.label, checked: action.checked }));
		await submenu.actions[1].run();
		const keyboardMenu = pills.openContextMenu(pills.inputPills.getPillElements()[0], true);
		const keyboardSubmenu = keyboardMenu[1];
		assert.ok(keyboardSubmenu instanceof SubmenuAction);
		const after = keyboardSubmenu.actions.map(action => ({ label: action.label, checked: action.checked }));
		await keyboardSubmenu.actions[0].run();

		assert.deepStrictEqual({
			order: menu.slice(0, 3).map(action => action.label),
			keyboardOrder: keyboardMenu.slice(0, 3).map(action => action.label),
			before,
			after,
			restoredAll: data.getContextMenuActions()[0].checked,
		}, {
			order: ['Hide Pull Requests', 'Pull Requests Options', ''],
			keyboardOrder: ['Hide Pull Requests', 'Pull Requests Options', ''],
			before: [{ label: 'Show All', checked: true }, { label: 'Show Open/Draft', checked: false }],
			after: [{ label: 'Show All', checked: false }, { label: 'Show Open/Draft', checked: true }],
			restoredAll: true,
		});
	});

	test('lets other pills contribute options without changing the visibility menu', async () => {
		let invoked = false;
		const pills = createPills({
			changes: {
				stats: constObservable({ files: 1, insertions: 1, deletions: 0 }),
				label: constObservable('Changes'),
				open: () => { },
				getContextMenuActions: () => [toAction({ id: 'changes.option', label: 'Changes Option', run: () => { } })],
			},
			artifacts: {
				sections: constObservable([{ title: 'Artifacts', entries: [{ id: 'report', label: 'Report', open: () => { } }] }]),
				getContextMenuActions: () => [toAction({ id: 'artifacts.option', label: 'Artifact Option', run: () => { invoked = true; } })],
			},
			references: {
				sections: constObservable([{ title: 'References', entries: [{ id: 'docs', label: 'Docs', open: () => { } }] }]),
			},
		});
		const [changes, artifacts, references] = pills.inputPills.getPillElements();
		const changesMenu = pills.openContextMenu(changes);
		const artifactsMenu = pills.openContextMenu(artifacts);
		const referencesMenu = pills.openContextMenu(references);
		const submenu = artifactsMenu[1];
		assert.ok(submenu instanceof SubmenuAction);
		await submenu.actions[0].run();

		assert.deepStrictEqual({
			changes: changesMenu.slice(0, 2).map(action => action.label),
			artifacts: artifactsMenu.slice(0, 3).map(action => action.label),
			references: referencesMenu.slice(0, 2).map(action => action.label),
			referencesHaveOptions: referencesMenu.some(action => action instanceof SubmenuAction),
			invoked,
		}, {
			changes: ['Changes Options', ''],
			artifacts: ['Hide Artifacts', 'Artifacts Options', ''],
			references: ['Hide References', ''],
			referencesHaveOptions: false,
			invoked: true,
		});
	});

	test('renders filtered pull request data reactively across sessions without changing references', async () => {
		const sections = observableValue<readonly IChatPullRequestPillSection[]>('pullRequestSections', [{
			title: 'Pull Requests',
			entries: [
				pullRequestEntry('#1', 'open'),
				pullRequestEntry('#2', 'draft'),
				pullRequestEntry('#3', 'closed'),
				pullRequestEntry('#4', 'merged'),
				pullRequestEntry('#5'),
			],
		}]);
		const pullRequestVisibility = createPullRequestVisibility();
		const firstData = createSessionPullRequestPillData(sections, pullRequestVisibility);
		const first = createPills({ pullRequests: firstData, references: { sections } });
		const second = createPills({ pullRequests: createSessionPullRequestPillData(sections, pullRequestVisibility) }, first.visibility);
		const before = { first: first.labels(), second: second.labels() };
		await firstData.getContextMenuActions()[1].run();
		const filtered = { first: first.labels(), second: second.labels() };
		const states: readonly (ChatPullRequestState | undefined)[] = ['open', 'draft', 'closed', 'merged', undefined];
		const transitions = states.map(state => {
			sections.set([{ title: 'Pull Requests', entries: [pullRequestEntry('#1', state)] }], undefined);
			return { state, first: first.labels(), second: second.labels() };
		});

		assert.deepStrictEqual({ before, filtered, transitions }, {
			before: { first: ['5 Pull Requests', '5 References'], second: ['5 Pull Requests'] },
			filtered: { first: ['3 Pull Requests', '5 References'], second: ['3 Pull Requests'] },
			transitions: [
				{ state: 'open', first: ['#1', '1 Reference'], second: ['#1'] },
				{ state: 'draft', first: ['#1', '1 Reference'], second: ['#1'] },
				{ state: 'closed', first: ['1 Reference'], second: [] },
				{ state: 'merged', first: ['1 Reference'], second: [] },
				{ state: undefined, first: ['#1', '1 Reference'], second: ['#1'] },
			],
		});
	});

	test('keeps options reachable when every pull request is filtered out', async () => {
		const data = createSessionPullRequestPillData(constObservable([{ title: 'Pull Requests', entries: [pullRequestEntry('#1', 'merged')] }]), createPullRequestVisibility());
		const pills = createPills({
			pullRequests: data,
		});
		await data.getContextMenuActions()[1].run();
		const filtered = {
			labels: pills.labels(),
			visible: pills.inputPills.visible,
			empty: pills.inputPills.element.classList.contains('empty'),
		};
		const row = pills.inputPills.element.querySelector<HTMLElement>('.chat-pills-row-content');
		assert.ok(row);
		const submenu = pills.openContextMenu(row, true)[0];
		assert.ok(submenu instanceof SubmenuAction);
		await submenu.actions[0].run();

		assert.deepStrictEqual({
			filtered,
			options: submenu.label,
			restored: pills.labels(),
			emptyAfterRestore: pills.inputPills.element.classList.contains('empty'),
		}, {
			filtered: { labels: [], visible: true, empty: true },
			options: 'Pull Requests Options',
			restored: ['#1'],
			emptyAfterRestore: false,
		});
	});

	test('renders summary icon updates from the pull request data provider', async () => {
		const icon = observableValue('pullRequestSummaryIcon', computePullRequestIcon('merged'));
		const data = createSessionPullRequestPillData(constObservable([{
			title: 'Pull Requests',
			entries: [pullRequestEntry('#1', 'merged'), pullRequestEntry('#2', 'draft'), pullRequestEntry('#3', 'draft')],
		}]), createPullRequestVisibility(), icon);
		const pills = createPills({
			pullRequests: data,
		});
		const hasIcon = (state: ChatPullRequestState) => pills.inputPills.element.querySelector('.chat-pill-icon')?.classList.contains(`codicon-${computePullRequestIcon(state).id}`);
		const before = hasIcon('merged');
		await data.getContextMenuActions()[1].run();
		icon.set(computePullRequestIcon('closed'), undefined);
		const filtered = hasIcon('draft');
		await data.getContextMenuActions()[0].run();

		assert.deepStrictEqual({ before, filtered, restored: hasIcon('closed') }, { before: true, filtered: true, restored: true });
	});

	test('keeps the row available for restoring a hidden pill', async () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const hidden = observableValue('hiddenPills', false);
		instantiationService.stub(ISessionChatPillVisibilityService, {
			_serviceBrand: undefined,
			readHiddenKinds: reader => hidden.read(reader) ? new Set([SessionChatPillKind.Browsers]) : new Set(),
			isVisible: (kind, reader) => kind !== SessionChatPillKind.Browsers || !hidden.read(reader),
			hide: () => hidden.set(true, undefined),
			toggle: () => hidden.set(!hidden.get(), undefined),
		});
		const container = document.createElement('div');
		document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		const hasData = observableValue('browserPill.hasData', true);
		const source = {
			...createChatInputPillSource({ action: store.add(new Action('browser', 'Browser')) }, SessionChatPillKind.Browsers),
			hasData,
		};
		const overlayFocus = document.createElement('button');
		container.appendChild(overlayFocus);
		let focusFallbackCount = 0;
		const inputPills = store.add(instantiationService.createInstance(ChatInputPills, container, {
			debugName: 'ChatInputPills.test',
			compact: false,
			enabled: constObservable(true),
			sources: constObservable([source]),
			offeredKinds: [SessionChatPillKind.Browsers],
			focusFallback: () => {
				focusFallbackCount++;
				overlayFocus.focus();
			},
		}));
		const before = {
			hidden: inputPills.element.classList.contains('hidden'),
			empty: inputPills.element.classList.contains('empty'),
			pillCount: inputPills.getPillElements().length,
		};

		overlayFocus.focus();
		inputPills.getPillElements()[0].setAttribute('aria-expanded', 'true');
		hidden.set(true, undefined);
		await timeout(0);
		const afterHidden = {
			hidden: inputPills.element.classList.contains('hidden'),
			empty: inputPills.element.classList.contains('empty'),
			pillCount: inputPills.getPillElements().length,
			emptyRowFocused: document.activeElement === inputPills.element.querySelector('.chat-pills-row-content'),
		};
		hasData.set(false, undefined);
		await timeout(0);

		assert.deepStrictEqual({
			before,
			after: afterHidden,
			afterDataRemoved: {
				hidden: inputPills.element.classList.contains('hidden'),
				focusFallbackCount,
				fallbackFocused: document.activeElement === overlayFocus,
			},
		}, {
			before: {
				hidden: false,
				empty: false,
				pillCount: 1,
			},
			after: {
				hidden: false,
				empty: true,
				pillCount: 0,
				emptyRowFocused: true,
			},
			afterDataRemoved: {
				hidden: true,
				focusFallbackCount: 1,
				fallbackFocused: true,
			},
		});
	});
});
