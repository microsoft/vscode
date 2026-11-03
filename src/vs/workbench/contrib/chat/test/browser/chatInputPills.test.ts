/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Action, SubmenuAction, toAction, type IAction } from '../../../../../base/common/actions.js';
import { AnchorPosition } from '../../../../../base/common/layout.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IActionListItem } from '../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { computePullRequestIcon, type ChatPullRequestState } from '../../../../common/chatPullRequest.js';
import type { IChatPillEntry, IChatPillSection } from '../../../../browser/chatPills.js';
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

	function createPills(data: IStandardChatInputPillsData, sharedVisibility?: SessionChatPillVisibility, options?: {
		readonly pinScope?: IObservable<string | undefined>;
		readonly storageService?: TestStorageService;
	}) {
		const { instantiationService, visibility } = createServices(sharedVisibility);
		if (options?.storageService) {
			instantiationService.stub(IStorageService, options.storageService);
		}
		let menuActions: readonly IAction[] = [];
		let dropdownItems: readonly IActionListItem<IChatPillEntry>[] = [];
		let hideDropdown: (() => void) | undefined;
		instantiationService.stub(IContextMenuService, {
			showContextMenu: delegate => {
				assert.ok(delegate.getActions);
				menuActions = delegate.getActions();
			},
		});
		instantiationService.stub(IActionWidgetService, {
			get isVisible() { return !!hideDropdown; },
			show: (_id, _preview, items, delegate) => {
				dropdownItems = items as readonly IActionListItem<IChatPillEntry>[];
				hideDropdown = () => {
					hideDropdown = undefined;
					delegate.onHide?.();
				};
			},
			hide: () => hideDropdown?.(),
			updateItems: items => {
				dropdownItems = items as readonly IActionListItem<IChatPillEntry>[];
			},
		});
		const container = document.createElement('div');
		document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		const pinScope = options?.pinScope ?? observableValue<string | undefined>('pinScope', 'chat:default');
		const sources = store.add(instantiationService.createInstance(StandardChatInputPillSources, data, SESSION_CHAT_PILL_KINDS, pinScope));
		const inputPills = store.add(instantiationService.createInstance(ChatInputPills, container, {
			debugName: 'ChatInputPills.options.test',
			compact: false,
			enabled: constObservable(true),
			sources: constObservable(sources.sources),
			offeredKinds: SESSION_CHAT_PILL_KINDS,
		}));
		return {
			inputPills,
			pinScope,
			sources,
			visibility,
			labels: () => [...inputPills.element.querySelectorAll('.chat-pill-label, .changes-stats-files')].map(element => element.textContent),
			openDropdown: (index = 0) => {
				dropdownItems = [];
				inputPills.getPillElements()[index]?.click();
				return dropdownItems;
			},
			closeDropdown: () => hideDropdown?.(),
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
			canvases: { sections },
			browsers: { sections },
			subagents: { sections },
			backgroundShells: { sections },
		};
		const full = store.add(instantiationService.createInstance(StandardChatInputPillSources, data, SESSION_CHAT_PILL_KINDS, constObservable('chat:full')));
		const supportedKinds = [
			SessionChatPillKind.Changes,
			SessionChatPillKind.PullRequests,
			SessionChatPillKind.Issues,
			SessionChatPillKind.Artifacts,
			SessionChatPillKind.References,
			SessionChatPillKind.Canvases,
			SessionChatPillKind.Browsers,
		];
		const subset = store.add(instantiationService.createInstance(StandardChatInputPillSources, data, supportedKinds, constObservable('chat:subset')));

		assert.deepStrictEqual({
			full: full.sources.map(source => source.kind),
			subset: subset.sources.map(source => source.kind),
		}, {
			full: SESSION_CHAT_PILL_KINDS,
			subset: supportedKinds,
		});
	});

	test('all chat-input collection dropdowns prefer above without forcing placement', () => {
		const { instantiationService, visibility } = createServices();
		for (const kind of SESSION_CHAT_PILL_KINDS) {
			if (!visibility.isVisible(kind, undefined)) {
				visibility.toggle(kind);
			}
		}
		const placements: { preferred: AnchorPosition | undefined; fixed: AnchorPosition | undefined }[] = [];
		instantiationService.stub(IActionWidgetService, {
			isVisible: false,
			show: (_user, _preview, _items, _delegate, _anchor, _container, _actions, _accessibility, options) => {
				placements.push({ preferred: options?.preferredAnchorPosition, fixed: options?.anchorPosition });
			},
			hide: () => { },
		});
		const sections = constObservable<readonly IChatPillSection[]>([{
			title: 'Entries',
			entries: ['first', 'second'].map(id => ({ id, label: id, open: () => { } })),
		}]);
		const sources = store.add(instantiationService.createInstance(StandardChatInputPillSources, {
			pullRequests: { sections },
			issues: { sections },
			artifacts: { sections },
			references: { sections },
			customizations: { sections },
			browsers: { sections },
			subagents: { sections },
			backgroundShells: { sections },
		}, SESSION_CHAT_PILL_KINDS, constObservable('chat:placement')));
		const inputPills = store.add(instantiationService.createInstance(ChatInputPills, undefined, {
			debugName: 'ChatInputPills.placement.test',
			compact: false,
			enabled: constObservable(true),
			sources: constObservable(sources.sources),
			offeredKinds: SESSION_CHAT_PILL_KINDS,
		}));
		document.body.appendChild(inputPills.element);
		store.add(toDisposable(() => inputPills.element.remove()));
		for (const pill of inputPills.getPillElements()) {
			pill.click();
		}

		assert.deepStrictEqual(placements, Array.from({ length: 8 }, () => ({
			preferred: AnchorPosition.ABOVE,
			fixed: undefined,
		})));
	});

	test('background shells are visible by default and a single shell still opens a picker', () => {
		const pills = createPills({
			backgroundShells: { sections: constObservable([{ title: 'Active background shells', entries: [{ id: 'shell', label: 'Run tests', open: () => { } }] }]) },
		});
		const button = pills.inputPills.element.querySelector('.chat-pill-button');
		assert.deepStrictEqual({
			labels: pills.labels(),
			popup: button?.getAttribute('aria-haspopup'),
			label: button?.getAttribute('aria-label'),
		}, {
			labels: ['1 Background Shell'],
			popup: 'listbox',
			label: 'Show 1 background shell',
		});
	});

	test('pins and unpins entries from every aggregated pill kind', async () => {
		const cases: readonly {
			readonly property: Exclude<keyof IStandardChatInputPillsData, 'changes'>;
			readonly kind: SessionChatPillKind;
			readonly aggregateLabel: string;
			readonly remainingLabel: string;
			readonly remainingPinnable?: boolean;
			readonly remainingHasPopup?: boolean;
		}[] = [
				{ property: 'pullRequests', kind: SessionChatPillKind.PullRequests, aggregateLabel: '2 Pull Requests', remainingLabel: 'second' },
				{ property: 'issues', kind: SessionChatPillKind.Issues, aggregateLabel: '2 Issues', remainingLabel: 'second' },
				{ property: 'artifacts', kind: SessionChatPillKind.Artifacts, aggregateLabel: '2 Artifacts', remainingLabel: 'second' },
				{ property: 'references', kind: SessionChatPillKind.References, aggregateLabel: '2 References', remainingLabel: 'second' },
				{ property: 'customizations', kind: SessionChatPillKind.Customizations, aggregateLabel: '2 Customizations', remainingLabel: 'second' },
				{ property: 'canvases', kind: SessionChatPillKind.Canvases, aggregateLabel: '2 Canvases', remainingLabel: 'second' },
				{ property: 'browsers', kind: SessionChatPillKind.Browsers, aggregateLabel: '2 Active Browsers', remainingLabel: 'second' },
				{ property: 'subagents', kind: SessionChatPillKind.Subagents, aggregateLabel: '2 Subagents', remainingLabel: 'second' },
				{ property: 'backgroundShells', kind: SessionChatPillKind.BackgroundShells, aggregateLabel: '2 Background Shells', remainingLabel: '1 Background Shell', remainingPinnable: true, remainingHasPopup: true },
			];
		const results = [];
		for (const testCase of cases) {
			const sections = constObservable<readonly IChatPillSection[]>([{
				title: 'Entries',
				entries: ['first', 'second'].map(id => ({ id, label: id, open: () => { } })),
			}]);
			const pills = createPills({ [testCase.property]: { sections } }, undefined, {
				pinScope: constObservable(`chat:${testCase.kind}`),
			});
			if (!pills.visibility.isVisible(testCase.kind, undefined)) {
				pills.visibility.toggle(testCase.kind);
			}
			const initial = pills.labels();
			const firstItem = pills.openDropdown().find(item => item.item?.id === 'first');
			const pinAction = firstItem?.toolbarActions?.find(action => action.label === 'Pin first');
			assert.ok(pinAction);
			await pinAction.run();
			await timeout(0);
			const [pinned] = pills.inputPills.getPillElements();
			const contextActions = pills.openContextMenu(pinned);
			const unpinAction = contextActions.find(action => action.label === 'Unpin first');
			assert.ok(unpinAction);
			const afterPin = pills.labels();
			pills.closeDropdown();
			const pinnedPicker = testCase.kind === SessionChatPillKind.BackgroundShells
				? pills.openDropdown(0).filter(item => item.item).map(item => ({ id: item.item?.id, openSubmenuOnClick: item.openSubmenuOnClick }))
				: [];
			pills.closeDropdown();
			const remainingAfterClose = pills.inputPills.getPillElements()[1];
			const remainingAriaLabel = remainingAfterClose.getAttribute('aria-label');
			const remainingHasPopup = remainingAfterClose.getAttribute('aria-haspopup') === 'listbox';
			const pinnedActions = contextActions.filter(action => action.label === 'Unpin first').map(action => action.label);
			const remainingActions = pills.openContextMenu(remainingAfterClose).filter(action => action.label === 'Pin second').map(action => action.label);
			await unpinAction.run();
			results.push({
				kind: testCase.kind,
				initial,
				afterPin,
				pinnedPicker,
				pinnedActions,
				remainingActions,
				remainingAriaLabel,
				remainingHasPopup,
				afterUnpin: pills.labels(),
			});
		}

		assert.deepStrictEqual(results, cases.map(testCase => ({
			kind: testCase.kind,
			initial: [testCase.aggregateLabel],
			afterPin: ['first', testCase.remainingLabel],
			pinnedPicker: testCase.kind === SessionChatPillKind.BackgroundShells ? [{ id: 'first', openSubmenuOnClick: true }] : [],
			pinnedActions: ['Unpin first'],
			remainingActions: testCase.remainingPinnable ? ['Pin second'] : [],
			remainingAriaLabel: testCase.remainingHasPopup ? 'Show 1 background shell' : 'second',
			remainingHasPopup: testCase.remainingHasPopup ?? false,
			afterUnpin: [testCase.aggregateLabel],
		})));
	});

	test('keeps a pinned pill descriptor stable while its live entry updates', async () => {
		const sections = observableValue<readonly IChatPillSection[]>('sections', [{
			title: 'Browsers',
			entries: [
				{ id: 'browser', label: 'Loading', open: () => { } },
				{ id: 'other', label: 'Other', open: () => { } },
			],
		}]);
		const pills = createPills({ browsers: { sections } }, undefined, {
			pinScope: constObservable('chat:live'),
		});
		const browser = pills.openDropdown().find(item => item.item?.id === 'browser');
		await browser?.toolbarActions?.find(action => action.label === 'Pin Loading')?.run();
		const source = pills.sources.sources.find(source => source.kind === SessionChatPillKind.Browsers);
		assert.ok(source);
		const descriptor = source.pills.get()[0];

		sections.set([{
			title: 'Browsers',
			entries: [
				{ id: 'browser', label: 'Documentation', open: () => { } },
				{ id: 'other', label: 'Other', open: () => { } },
			],
		}], undefined);
		const updatedDescriptor = source.pills.get()[0];
		const contextActions = pills.openContextMenu(pills.inputPills.getPillElements()[0]);

		assert.deepStrictEqual({
			stable: descriptor === updatedDescriptor,
			labels: pills.labels(),
			unpin: contextActions.find(action => action.id.includes('.unpin.'))?.label,
		}, {
			stable: true,
			labels: ['Documentation', 'Other'],
			unpin: 'Unpin Documentation',
		});
	});

	test('places copy before pin and destructive actions on dropdown rows', () => {
		const copy = toAction({ id: 'copy', label: 'Copy Path', run: () => { } });
		const remove = toAction({ id: 'remove', label: 'Remove Artifact', run: () => { } });
		const sections = constObservable<readonly IChatPillSection[]>([{
			title: 'Artifacts',
			entries: [
				{ id: 'plan', label: 'Plan', toolbarActions: [copy], promotedAction: remove, open: () => { } },
				{ id: 'report', label: 'Report', open: () => { } },
			],
		}]);
		const pills = createPills({ artifacts: { sections } }, undefined, {
			pinScope: constObservable('chat:action-order'),
		});
		const plan = pills.openDropdown().find(item => item.item?.id === 'plan');

		assert.deepStrictEqual(plan?.toolbarActions?.map(action => action.label), [
			'Copy Path',
			'Pin Plan',
			'Remove Artifact',
		]);
	});

	test('shows a clickable pinned icon without losing copy, destructive, or keyboard unpin actions', async () => {
		const copy = toAction({ id: 'copy', label: 'Copy Path', run: () => { } });
		const remove = toAction({ id: 'remove', label: 'Remove Artifact', run: () => { } });
		const sections = constObservable<readonly IChatPillSection[]>([{
			title: 'Artifacts',
			entries: [
				{ id: 'plan', label: 'Plan', resource: URI.file('/repo/plan.md'), toolbarActions: [copy], promotedAction: remove, open: () => { } },
				{ id: 'report', label: 'Report', resource: URI.file('/repo/report.md'), open: () => { } },
			],
		}]);
		const pills = createPills({ artifacts: { sections } }, undefined, {
			pinScope: constObservable('chat:pinned-icon'),
		});
		const plan = pills.openDropdown().find(item => item.item?.id === 'plan');
		await plan?.toolbarActions?.find(action => action.label === 'Pin Plan')?.run();
		await timeout(0);
		const pinned = pills.inputPills.getPillElements()[0];
		const unpin = pinned.closest('.chat-pill-item')?.querySelector<HTMLElement>('.chat-pill-promoted-action');
		assert.ok(unpin);
		const contextActions = pills.openContextMenu(pinned).filter(action => ['copy', 'remove'].includes(action.id) || action.id.includes('.unpin.'));
		unpin.click();
		await timeout(0);

		assert.deepStrictEqual({
			icon: {
				ariaLabel: unpin.getAttribute('aria-label'),
				unpin: unpin.classList.contains('codicon-unpin'),
				tabIndex: unpin.getAttribute('tabindex'),
			},
			contextActions: contextActions.map(action => action.label),
			afterClick: pills.labels(),
		}, {
			icon: { ariaLabel: 'Unpin Plan', unpin: true, tabIndex: '-1' },
			contextActions: ['Copy Path', 'Remove Artifact', 'Unpin Plan'],
			afterClick: ['2 Artifacts'],
		});
	});

	test('persists pins per chat scope and restores them when returning to the chat', async () => {
		const storageService = store.add(new TestStorageService());
		const pinScope = observableValue<string | undefined>('pinScope', 'chat:first');
		const sections = constObservable<readonly IChatPillSection[]>([{
			title: 'Artifacts',
			entries: ['plan', 'report'].map(id => ({ id, label: id, open: () => { } })),
		}]);
		const first = createPills({ artifacts: { sections } }, undefined, { pinScope, storageService });
		const plan = first.openDropdown().find(item => item.item?.id === 'plan');
		await plan?.toolbarActions?.find(action => action.label === 'Pin plan')?.run();
		const pinnedInFirst = first.labels();

		pinScope.set('chat:second', undefined);
		const unpinnedInSecond = first.labels();
		pinScope.set('chat:first', undefined);
		const restoredInFirst = first.labels();

		const restored = createPills({ artifacts: { sections } }, undefined, {
			pinScope: constObservable('chat:first'),
			storageService,
		});
		const newController = restored.labels();

		assert.deepStrictEqual({ pinnedInFirst, unpinnedInSecond, restoredInFirst, newController }, {
			pinnedInFirst: ['plan', 'report'],
			unpinnedInSecond: ['2 Artifacts'],
			restoredInFirst: ['plan', 'report'],
			newController: ['plan', 'report'],
		});
	});

	test('keeps a filtered pinned entry stored until it becomes visible again', async () => {
		const pullRequestVisibility = createPullRequestVisibility();
		const data = createSessionPullRequestPillData(constObservable([{
			title: 'Pull Requests',
			entries: [
				pullRequestEntry('#closed', 'closed'),
				pullRequestEntry('#open', 'open'),
			],
		}]), pullRequestVisibility);
		const pills = createPills({ pullRequests: data }, undefined, {
			pinScope: constObservable('chat:filtered'),
		});
		const closed = pills.openDropdown().find(item => item.item?.id === '#closed');
		await closed?.toolbarActions?.find(action => action.label === 'Pin #closed')?.run();
		const pinned = pills.labels();

		pullRequestVisibility.setShowAll(false);
		const filtered = pills.labels();
		pullRequestVisibility.setShowAll(true);
		const restored = pills.labels();

		assert.deepStrictEqual({ pinned, filtered, restored }, {
			pinned: ['#closed', '#open'],
			filtered: ['#open'],
			restored: ['#closed', '#open'],
		});
	});

	test('a single subagent still opens a picker', () => {
		const pills = createPills({
			subagents: { sections: constObservable([{ title: 'Active subagents', entries: [{ id: 'subagent', label: 'Research', open: () => { } }] }]) },
		});
		pills.visibility.toggle(SessionChatPillKind.Subagents);
		const button = pills.inputPills.element.querySelector('.chat-pill-button');

		assert.deepStrictEqual({
			labels: pills.labels(),
			popup: button?.getAttribute('aria-haspopup'),
			label: button?.getAttribute('aria-label'),
		}, {
			labels: ['1 Subagent'],
			popup: 'listbox',
			label: 'Show 1 subagent',
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

	test('groups single PR copy and removal with options for mouse and keyboard but not on the toolbar background', async () => {
		let removed = 0;
		let copied = 0;
		const entry: IChatPullRequestPillEntry = {
			...pullRequestEntry('#1', 'open'),
			toolbarActions: [toAction({ id: 'copy-pr', label: 'Copy Pull Request URL', run: () => { copied++; } })],
			promotedAction: toAction({ id: 'remove-pr', label: 'Remove Pull Request Reference from Session', run: () => { removed++; } }),
		};
		const data = createSessionPullRequestPillData(constObservable([{ title: 'Pull Requests', entries: [entry] }]), createPullRequestVisibility());
		const pills = createPills({ pullRequests: data });
		const target = pills.inputPills.getPillElements()[0];
		const mouseMenu = pills.openContextMenu(target);
		const keyboardMenu = pills.openContextMenu(target, true);
		const backgroundMenu = pills.openContextMenu(pills.inputPills.element);
		await mouseMenu.find(action => action.id === 'copy-pr')?.run();
		await keyboardMenu.find(action => action.id === 'copy-pr')?.run();
		await mouseMenu.find(action => action.id === 'remove-pr')?.run();
		await keyboardMenu.find(action => action.id === 'remove-pr')?.run();

		assert.deepStrictEqual({
			mouse: mouseMenu.slice(0, 6).map(action => action.label),
			keyboard: keyboardMenu.slice(0, 6).map(action => action.label),
			backgroundActions: backgroundMenu.filter(action => action.id === 'copy-pr' || action.id === 'remove-pr').map(action => action.id),
			copied,
			removed,
		}, {
			mouse: ['Hide Pull Requests', '', 'Copy Pull Request URL', 'Remove Pull Request Reference from Session', 'Pull Requests Options', ''],
			keyboard: ['Hide Pull Requests', '', 'Copy Pull Request URL', 'Remove Pull Request Reference from Session', 'Pull Requests Options', ''],
			backgroundActions: [],
			copied: 2,
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

	for (const kind of ['issues', 'artifacts', 'references'] as const) {
		test(`shares single-entry ${kind} actions across surfaces`, async () => {
			let removed = 0;
			const copied: string[] = [];
			const entries = [{
				id: 'entry',
				label: 'Entry',
				open: () => { },
				toolbarActions: [toAction({ id: 'copy', label: 'Copy Path', run: () => { copied.push('/repo/plan.md'); } })],
				hoverActions: [toAction({ id: 'copy-relative', label: 'Copy Relative Path', run: () => { copied.push('plan.md'); } })],
				promotedAction: toAction({ id: 'remove', label: 'Remove Entry', run: () => { removed++; } }),
			}];
			const sections = observableValue<readonly IChatPillSection[]>('sections', [{ title: 'Entries', entries }]);
			const pills = createPills({ [kind]: { sections } });
			const target = pills.inputPills.getPillElements()[0];
			const mouseMenu = pills.openContextMenu(target);
			const keyboardMenu = pills.openContextMenu(target, true);
			const backgroundMenu = pills.openContextMenu(pills.inputPills.element);
			await mouseMenu.find(action => action.id === 'copy')?.run();
			await keyboardMenu.find(action => action.id === 'copy-relative')?.run();
			await mouseMenu.find(action => action.id === 'remove')?.run();
			await keyboardMenu.find(action => action.id === 'remove')?.run();
			sections.set([{ title: 'Entries', entries: [...entries, { ...entries[0], id: 'another' }] }], undefined);
			const multipleMenu = pills.openContextMenu(pills.inputPills.getPillElements()[0]);
			const entryActions = (menu: readonly IAction[]) => menu.filter(action => ['copy', 'copy-relative', 'remove'].includes(action.id)).map(action => action.id);
			sections.set([{ title: 'Entries', entries: [{ ...entries[0], promotedAction: undefined }] }], undefined);
			const copyOnlyMenu = pills.openContextMenu(pills.inputPills.getPillElements()[0]);

			assert.deepStrictEqual({
				mouse: entryActions(mouseMenu),
				keyboard: entryActions(keyboardMenu),
				background: entryActions(backgroundMenu),
				multiple: entryActions(multipleMenu),
				copyOnly: entryActions(copyOnlyMenu),
				copied,
				removed,
			}, {
				mouse: ['copy', 'copy-relative', 'remove'],
				keyboard: ['copy', 'copy-relative', 'remove'],
				background: [],
				multiple: [],
				copyOnly: ['copy', 'copy-relative'],
				copied: ['/repo/plan.md', 'plan.md'],
				removed: 2,
			});
		});
	}

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
		const submenu = artifactsMenu.find(action => action.id === 'chatInputPills.options.artifacts');
		assert.ok(submenu instanceof SubmenuAction);
		await submenu.actions[0].run();

		assert.deepStrictEqual({
			changes: changesMenu.slice(0, 2).map(action => action.label),
			artifacts: artifactsMenu.filter(action => ['Pin Report', 'Hide Artifacts', 'Artifacts Options'].includes(action.label)).map(action => action.label),
			references: referencesMenu.filter(action => ['Pin Docs', 'Hide References'].includes(action.label)).map(action => action.label),
			referencesHaveOptions: referencesMenu.some(action => action instanceof SubmenuAction),
			invoked,
		}, {
			changes: ['Changes Options', ''],
			artifacts: ['Hide Artifacts', 'Pin Report', 'Artifacts Options'],
			references: ['Pin Docs', 'Hide References'],
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
		const submenu = pills.openContextMenu(targets[1], true).find(action => action.id === 'chatInputPills.options.pullRequests');
		assert.ok(submenu instanceof SubmenuAction);
		const checked = submenu.actions.map(action => ({ label: action.label, checked: action.checked }));
		await submenu.actions[0].run();
		const restoredOptions = pills.openContextMenu(pills.inputPills.getPillElements()[0])
			.filter(action => action instanceof SubmenuAction).map(action => action.label);
		const otherKinds = ['Issues', 'Artifacts', 'References', 'Customizations', 'Browsers', 'Subagents'];
		const toggles = ['Pull Requests', ...otherKinds];
		const expectedMenus = [
			['Pull Requests Options', '', ...toggles],
			...otherKinds.map(label => [
				...(['Artifacts', 'References', 'Customizations', 'Subagents'].includes(label) ? ['Pin Item', ''] : []),
				`Hide ${label}`, '', 'Pull Requests Options', '', ...toggles,
			]),
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

	test('does not reserve a focusable row for pill kinds hidden by default', () => {
		const references = observableValue<readonly IChatPillSection[]>('references', []);
		const pills = createPills({
			customizations: { sections: constObservable([{ title: 'Instructions', entries: [{ id: 'agents', label: 'AGENTS.md', open: () => { } }] }]) },
			references: { sections: references },
		});
		const state = () => ({
			visible: pills.inputPills.visible,
			empty: pills.inputPills.element.classList.contains('empty'),
			focusable: pills.inputPills.element.querySelector('.chat-pills-row-content')?.hasAttribute('tabindex'),
		});
		const defaultHidden = state();
		references.set([{ title: 'References', entries: [{ id: 'docs', label: 'Docs', open: () => { } }] }], undefined);
		pills.visibility.hide(SessionChatPillKind.References);

		assert.deepStrictEqual({ defaultHidden, userHidden: state() }, {
			defaultHidden: { visible: false, empty: false, focusable: false },
			userHidden: { visible: true, empty: true, focusable: true },
		});
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
