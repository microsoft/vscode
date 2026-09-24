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
import type { IChatPillSection } from '../../../../browser/chatPills.js';
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

	test('offers checked pull request options in a separate group below Hide for mouse and keyboard', async () => {
		const data = createSessionPullRequestPillData(constObservable([{ title: 'Pull Requests', entries: [pullRequestEntry('#1', 'open')] }]), createPullRequestVisibility());
		const pills = createPills({
			pullRequests: data,
		});
		const menu = pills.openContextMenu(pills.inputPills.getPillElements()[0]);
		const submenu = menu[2];
		assert.ok(submenu instanceof SubmenuAction);
		const before = submenu.actions.map(action => ({ label: action.label, checked: action.checked }));
		await submenu.actions[1].run();
		const keyboardMenu = pills.openContextMenu(pills.inputPills.getPillElements()[0], true);
		const keyboardSubmenu = keyboardMenu[2];
		assert.ok(keyboardSubmenu instanceof SubmenuAction);
		const after = keyboardSubmenu.actions.map(action => ({ label: action.label, checked: action.checked }));
		await keyboardSubmenu.actions[0].run();

		assert.deepStrictEqual({
			order: menu.slice(0, 4).map(action => action.label),
			keyboardOrder: keyboardMenu.slice(0, 4).map(action => action.label),
			before,
			after,
			restoredAll: data.getContextMenuActions()[0].checked,
		}, {
			order: ['Hide Pull Requests', '', 'Pull Requests Options', ''],
			keyboardOrder: ['Hide Pull Requests', '', 'Pull Requests Options', ''],
			before: [{ label: 'Show All', checked: true }, { label: 'Show Open/Draft', checked: false }],
			after: [{ label: 'Show All', checked: false }, { label: 'Show Open/Draft', checked: true }],
			restoredAll: true,
		});
	});

	test('groups single PR removal with options for mouse and keyboard but not on the toolbar background', async () => {
		let removed = 0;
		const entry: IChatPullRequestPillEntry = {
			...pullRequestEntry('#1', 'open'),
			promotedAction: toAction({ id: 'remove-pr', label: 'Remove Pull Request Reference from Session', run: () => { removed++; } }),
		};
		const data = createSessionPullRequestPillData(constObservable([{ title: 'Pull Requests', entries: [entry] }]), createPullRequestVisibility());
		const pills = createPills({ pullRequests: data });
		const target = pills.inputPills.getPillElements()[0];
		const mouseMenu = pills.openContextMenu(target);
		const keyboardMenu = pills.openContextMenu(target, true);
		const backgroundMenu = pills.openContextMenu(pills.inputPills.element);
		await mouseMenu.find(action => action.id === 'remove-pr')?.run();
		await keyboardMenu.find(action => action.id === 'remove-pr')?.run();

		assert.deepStrictEqual({
			mouse: mouseMenu.slice(0, 5).map(action => action.label),
			keyboard: keyboardMenu.slice(0, 5).map(action => action.label),
			backgroundRemoval: backgroundMenu.some(action => action.id === 'remove-pr'),
			removed,
		}, {
			mouse: ['Hide Pull Requests', '', 'Remove Pull Request Reference from Session', 'Pull Requests Options', ''],
			keyboard: ['Hide Pull Requests', '', 'Remove Pull Request Reference from Session', 'Pull Requests Options', ''],
			backgroundRemoval: false,
			removed: 2,
		});
	});

	test('restores focus to a live pill after a context menu action removes an entry', async () => {
		const sections = observableValue<readonly IChatPullRequestPillSection[]>('pullRequests', []);
		sections.set([{
			title: 'Pull Requests', entries: [{
				...pullRequestEntry('#1', 'open'),
				promotedAction: toAction({
					id: 'remove-pr',
					label: 'Remove Pull Request from Session',
					run: async () => {
						await timeout(0);
						sections.set([], undefined);
					},
				}),
			}]
		}], undefined);
		const pills = createPills({
			pullRequests: createSessionPullRequestPillData(sections, createPullRequestVisibility()),
			artifacts: { sections: constObservable([{ title: 'Artifacts', entries: [{ id: 'report', label: 'Report', open: () => { } }] }]) },
		});
		const target = pills.inputPills.getPillElements()[0];
		target.focus();
		const menu = pills.openContextMenu(target, true);
		// The real context menu widget holds focus while it is open, so the pill is no longer focused
		// by the time the promoted action resolves.
		target.blur();
		const removeAction = menu.find(action => action.id === 'remove-pr');
		assert.ok(removeAction);
		await removeAction.run();
		await timeout(10);

		assert.deepStrictEqual({
			action: removeAction.label,
			labels: pills.labels(),
			focusedLivePill: document.activeElement === pills.inputPills.getPillElements().at(0),
		}, {
			action: 'Remove Pull Request from Session',
			labels: ['1 Artifact'],
			focusedLivePill: true,
		});
	});

	for (const state of ['open', 'closed'] as const) {
		test(`restores focus after filtering when the target pill ${state === 'open' ? 'remains visible' : 'disappears'}`, async () => {
			const data = createSessionPullRequestPillData(constObservable([{
				title: 'Pull Requests', entries: [pullRequestEntry('#1', state)],
			}]), createPullRequestVisibility());
			const pills = createPills({
				changes: {
					stats: constObservable({ files: 1, insertions: 1, deletions: 0 }),
					label: constObservable('Changes'),
					open: () => { },
				},
				pullRequests: data,
			});
			const target = pills.inputPills.getPillElements()[1];
			target.focus();
			const submenu = pills.openContextMenu(target, true).find(action => action instanceof SubmenuAction);
			assert.ok(submenu instanceof SubmenuAction);
			target.blur();
			await submenu.actions[1].run();
			await timeout(10);

			assert.deepStrictEqual({
				labels: pills.labels(),
				focused: document.activeElement === pills.inputPills.getPillElements()[state === 'open' ? 1 : 0],
			}, {
				labels: state === 'open' ? ['1 File', '#1'] : ['1 File'],
				focused: true,
			});
		});
	}

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
		const submenu = artifactsMenu[2];
		assert.ok(submenu instanceof SubmenuAction);
		await submenu.actions[0].run();

		assert.deepStrictEqual({
			changes: changesMenu.slice(0, 2).map(action => action.label),
			artifacts: artifactsMenu.slice(0, 4).map(action => action.label),
			references: referencesMenu.slice(0, 2).map(action => action.label),
			referencesHaveOptions: referencesMenu.some(action => action instanceof SubmenuAction),
			invoked,
		}, {
			changes: ['Changes Options', ''],
			artifacts: ['Hide Artifacts', '', 'Artifacts Options', ''],
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
			const referencesPill = first.inputPills.getPillElements().at(-1);
			assert.ok(referencesPill);
			return {
				state,
				first: first.labels(),
				second: second.labels(),
				fallbackOptions: first.openContextMenu(referencesPill).some(action => action.id === 'chatInputPills.options.pullRequests'),
			};
		});

		assert.deepStrictEqual({ before, filtered, transitions }, {
			before: { first: ['5 Pull Requests', '5 References'], second: ['5 Pull Requests'] },
			filtered: { first: ['3 Pull Requests', '5 References'], second: ['3 Pull Requests'] },
			transitions: [
				{ state: 'open', first: ['#1', '1 Reference'], second: ['#1'], fallbackOptions: false },
				{ state: 'draft', first: ['#1', '1 Reference'], second: ['#1'], fallbackOptions: false },
				{ state: 'closed', first: ['1 Reference'], second: [], fallbackOptions: true },
				{ state: 'merged', first: ['1 Reference'], second: [], fallbackOptions: true },
				{ state: undefined, first: ['#1', '1 Reference'], second: ['#1'], fallbackOptions: false },
			],
		});
	});

	test('keeps options for multiple filtered pill kinds reachable without special handling', async () => {
		const visibility = createPullRequestVisibility();
		visibility.setShowAll(false);
		const artifactSections = observableValue<readonly IChatPillSection[]>('artifacts', []);
		const hasArtifacts = observableValue('hasArtifacts', true);
		const pills = createPills({
			pullRequests: createSessionPullRequestPillData(constObservable([{
				title: 'Pull Requests', entries: [pullRequestEntry('#1', 'closed')],
			}]), visibility),
			artifacts: {
				sections: artifactSections,
				hasData: hasArtifacts,
				getContextMenuActions: () => [toAction({
					id: 'artifacts.showAll',
					label: 'Show All',
					run: () => artifactSections.set([{ title: 'Artifacts', entries: [{ id: 'report', label: 'Report', open: () => { } }] }], undefined),
				})],
			},
			references: { sections: constObservable([{ title: 'References', entries: [{ id: 'docs', label: 'Docs', open: () => { } }] }]) },
		});
		const references = pills.inputPills.getPillElements()[0];
		const getOptions = (target: HTMLElement, keyboard = false) => pills.openContextMenu(target, keyboard)
			.filter(action => action instanceof SubmenuAction);
		const mouse = getOptions(references);
		const keyboard = getOptions(references, true);
		const row = pills.inputPills.element.querySelector<HTMLElement>('.chat-pills-row-content');
		assert.ok(row);
		const background = getOptions(row);
		await keyboard[1].actions[0].run();
		const restored = { labels: pills.labels(), options: getOptions(pills.inputPills.getPillElements()[1]).map(action => action.label) };
		artifactSections.set([], undefined);
		hasArtifacts.set(false, undefined);

		assert.deepStrictEqual({
			mouse: mouse.map(action => action.label),
			keyboard: keyboard.map(action => action.label),
			background: background.map(action => action.label),
			restored,
			cleared: getOptions(pills.inputPills.getPillElements()[0]).map(action => action.label),
		}, {
			mouse: ['Pull Requests Options', 'Artifacts Options'],
			keyboard: ['Pull Requests Options', 'Artifacts Options'],
			background: ['Pull Requests Options', 'Artifacts Options'],
			restored: { labels: ['1 Artifact', '1 Reference'], options: ['Pull Requests Options'] },
			cleared: ['Pull Requests Options'],
		});
	});

	test('offers filtered pull request options on every other pill for mouse and keyboard', async () => {
		const data = createSessionPullRequestPillData(constObservable([{
			title: 'Pull Requests',
			entries: [pullRequestEntry('#1', 'closed'), pullRequestEntry('#2', 'merged')],
		}]), createPullRequestVisibility());
		const sections = constObservable([{ title: 'Items', entries: [{ id: 'item', label: 'Item', open: () => { } }] }]);
		const pills = createPills({
			changes: {
				stats: constObservable({ files: 1, insertions: 1, deletions: 0 }),
				label: constObservable('Changes'),
				open: () => { },
			},
			pullRequests: data,
			issues: { sections },
			artifacts: { sections },
			references: { sections },
			customizations: { sections },
			browsers: { sections },
			subagents: { sections },
		});
		pills.visibility.toggle(SessionChatPillKind.Customizations);
		pills.visibility.toggle(SessionChatPillKind.Subagents);
		await data.getContextMenuActions()[1].run();

		const targets = pills.inputPills.getPillElements();
		const menus = [false, true].map(keyboard => targets.map(target =>
			pills.openContextMenu(target, keyboard).map(action => action.label)));
		const submenu = pills.openContextMenu(targets[1], true)[2];
		assert.ok(submenu instanceof SubmenuAction);
		const checked = submenu.actions.map(action => ({ label: action.label, checked: action.checked }));
		await submenu.actions[0].run();
		const restoredOptions = pills.openContextMenu(pills.inputPills.getPillElements()[0])
			.filter(action => action instanceof SubmenuAction).map(action => action.label);
		const otherKinds = ['Issues', 'Artifacts', 'References', 'Customizations', 'Browsers', 'Subagents'];
		const toggles = ['Pull Requests', ...otherKinds];
		const expectedMenus = [
			['Pull Requests Options', '', ...toggles],
			...otherKinds.map(label => [`Hide ${label}`, '', 'Pull Requests Options', '', ...toggles]),
		];

		assert.deepStrictEqual({ menus, checked, restoredOptions, restoredPullRequests: pills.labels()[1] }, {
			menus: [expectedMenus, expectedMenus],
			checked: [{ label: 'Show All', checked: false }, { label: 'Show Open/Draft', checked: true }],
			restoredOptions: [],
			restoredPullRequests: '2 Pull Requests',
		});
	});

	for (const { name, entries, showAll, hidden } of [
		{ name: 'there are no pull requests', entries: [], showAll: false, hidden: false },
		{ name: 'some pull requests remain visible', entries: [pullRequestEntry('#1', 'open'), pullRequestEntry('#2', 'merged')], showAll: false, hidden: false },
		{ name: 'closed pull requests are not filtered', entries: [pullRequestEntry('#1', 'closed')], showAll: true, hidden: false },
		{ name: 'the pull request pill is manually hidden', entries: [pullRequestEntry('#1', 'open')], showAll: false, hidden: true },
	]) {
		test(`does not offer pull request options on other pills when ${name}`, () => {
			const visibility = createPullRequestVisibility();
			visibility.setShowAll(showAll);
			const data = createSessionPullRequestPillData(constObservable([{ title: 'Pull Requests', entries }]), visibility);
			const pills = createPills({
				pullRequests: data,
				references: { sections: constObservable([{ title: 'References', entries: [{ id: 'docs', label: 'Docs', open: () => { } }] }]) },
			});
			if (hidden) {
				pills.visibility.hide(SessionChatPillKind.PullRequests);
			}
			const referencesPill = pills.inputPills.getPillElements().at(-1);
			assert.ok(referencesPill);

			assert.deepStrictEqual(
				pills.openContextMenu(referencesPill).filter(action => action instanceof SubmenuAction).map(action => action.label),
				[],
			);
		});
	}

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
