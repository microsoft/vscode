/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { $, append, getActiveElement, IDimension } from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { timeout } from '../../../base/common/async.js';
import { Codicon } from '../../../base/common/codicons.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { Separator, toAction } from '../../../base/common/actions.js';
import { derived, observableValue } from '../../../base/common/observable.js';
import { AnchorAlignment } from '../../../base/common/layout.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { IHoverDelegate } from '../../../base/browser/ui/hover/hoverDelegate.js';
import { getBaseLayerHoverDelegate, setBaseLayerHoverDelegate } from '../../../base/browser/ui/hover/hoverDelegate2.js';
import { mock, upcastPartial } from '../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { IAccessibilityService } from '../../../platform/accessibility/common/accessibility.js';
import { IMenu, IMenuActionOptions, IMenuChangeEvent, IMenuService, MenuId, MenuItemAction, MenuRegistry, SubmenuItemAction } from '../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../platform/commands/common/commands.js';
import { ContextKeyExpr, ContextKeyExpression, IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { ContextKeyService } from '../../../platform/contextkey/browser/contextKeyService.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextMenuMenuDelegate, IContextMenuService, IContextViewService } from '../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../platform/hover/browser/hover.js';
import { HoverService } from '../../../platform/hover/browser/hoverService.js';
import { ILayoutService } from '../../../platform/layout/browser/layoutService.js';
import { workbenchInstantiationService } from '../../../workbench/test/browser/workbenchTestServices.js';
import { ChatViewSessionActivityBar, SessionActivityBar } from '../../../workbench/contrib/sessions/browser/parts/sessionActivityBar.js';
import { MenuActivityBar, MenuActivityBarSize } from '../../../workbench/browser/parts/activitybar/menuActivityBar.js';
import { IStorageService } from '../../../platform/storage/common/storage.js';
import { registerSessionActivityBarExternalHost, SESSION_ACTIVITY_BAR_COLUMN_WIDTH, setSessionActivityBarSize } from '../../../workbench/browser/parts/sessions/sessionActivityBarHost.js';
import { Menus, SessionActivityBarGroup } from '../../../workbench/contrib/sessions/browser/menus.js';
import { TogglePanelAction } from '../../../workbench/browser/parts/panel/panelActions.js';
import { IAgentWorkbenchLayoutService } from '../../browser/workbench.js';
import { AgentWorkbenchLayout } from '../../../workbench/services/sessions/browser/sessionsHostLayoutService.js';
import { SESSION_ACTIVITY_BAR_SETTING } from '../../../workbench/contrib/sessions/common/sessionConfig.js';
import { TOGGLE_SIDE_PANEL_COMMAND_ID } from '../../../workbench/contrib/sessions/common/sessionCommands.js';
import { sessionActivityBarChatActionContext } from '../../../workbench/contrib/sessions/common/contextkeys.js';
import { ISessionActivityBarActivityService, SessionActivityBarActivityService } from '../../../workbench/contrib/sessions/common/sessionActivityBarActivityService.js';
import { IconBadge, NumberBadge } from '../../../workbench/services/activity/common/activity.js';
import { TestContextViewService } from './testContextViewService.js';
import '../../../base/browser/ui/tree/media/tree.css';
import '../../../workbench/contrib/sessions/browser/parts/media/sessionView.css';
// eslint-disable-next-line local/code-import-patterns
import '../../../workbench/contrib/modernUI/browser/media/tabs.css';
// eslint-disable-next-line local/code-import-patterns
import '../../../workbench/contrib/modernUI/browser/media/connectedEditorTabs.css';
import { LayoutModeContext } from '../../../workbench/common/contextkeys.js';
import { IWindowCommandContext } from '../../../workbench/common/windowCommandContext.js';
import { stubSessionsHostLayout } from './sessionsHostLayoutTestUtils.js';

interface ITestEntry {
	readonly id: string;
	readonly title: string;
	readonly icon: ThemeIcon;
	readonly submenu?: readonly { readonly id: string; readonly title: string }[];
	/** The menu group, `navigation` by default. */
	readonly group?: string;
	/** Whether the entry is checked, as when the side pane shows its editor. */
	readonly checked?: boolean;
	readonly when?: ContextKeyExpression;
}

const changes: ITestEntry = { id: 'test.changes', title: 'Changes', icon: Codicon.gitCompare };
const browser: ITestEntry = { id: 'test.browser', title: 'Browser', icon: Codicon.globe };
const canvas: ITestEntry = { id: 'test.canvas', title: 'Canvas', icon: Codicon.preview, submenu: [{ id: 'test.canvas.kusto', title: 'Kusto' }] };

suite('Sessions - Session Activity Bar', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());

	function createActivityBar(disposables: Pick<DisposableStore, 'add'>, initialEntries: readonly ITestEntry[], options?: { readonly realHovers?: boolean }) {
		const testStore = disposables.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, testStore);

		const root = append(mainWindow.document.body, $('.monaco-workbench'));
		testStore.add(toDisposable(() => root.remove()));
		const container = append(root, $('.content'));

		const ran: string[] = [];
		const ranWith: { readonly id: string; readonly args: unknown[] }[] = [];
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
			override readonly onWillExecuteCommand = Event.None;
			override readonly onDidExecuteCommand = Event.None;
			override async executeCommand<R>(id: string, ...args: unknown[]): Promise<R | undefined> {
				ran.push(id);
				ranWith.push({ id, args });
				return undefined;
			}
		});
		instantiationService.stub(IAccessibilityService, new class extends mock<IAccessibilityService>() {
			override readonly onDidChangeScreenReaderOptimized = Event.None;
			override readonly onDidChangeReducedMotion = Event.None;
			override isScreenReaderOptimized(): boolean { return false; }
		});

		// Entries can be shown and hidden from the context menu, as menu items are.
		const hideActions = (entry: ITestEntry) => ({
			isHidden: false,
			isModifiedFromDefault: false,
			hide: toAction({ id: `hide.${entry.id}`, label: `Hide '${entry.title}'`, run: () => { } }),
			toggle: toAction({ id: `toggle.${entry.id}`, label: entry.title, checked: true, run: () => { } }),
		});
		const createEntryAction = (entry: ITestEntry, options: IMenuActionOptions | undefined) => {
			if (!entry.checked) {
				return instantiationService.createInstance(MenuItemAction, { id: entry.id, title: entry.title, icon: entry.icon }, undefined, options, hideActions(entry), undefined);
			}
			// The entry's toggled condition holds, as when the side pane shows its editor.
			const contextKeyService = new class extends mock<IContextKeyService>() {
				override contextMatchesRules(rules: ContextKeyExpression | undefined): boolean { return !!rules?.evaluate({ getValue: () => undefined }); }
			};
			return instantiationService.invokeFunction(accessor => new MenuItemAction({ id: entry.id, title: entry.title, icon: entry.icon, toggled: ContextKeyExpr.true() }, undefined, options, hideActions(entry), undefined, contextKeyService, accessor.get(ICommandService)));
		};

		let entries = initialEntries;
		let createdMenu: IMenu | undefined;
		const onDidChangeMenu = testStore.add(new Emitter<IMenuChangeEvent>());
		instantiationService.stub(IMenuService, new class extends mock<IMenuService>() {
			override createMenu(_id: MenuId, contextKeyService: IContextKeyService): IMenu {
				const menu: IMenu = {
					onDidChange: onDidChangeMenu.event,
					dispose: () => { },
					getActions: options => {
						const groups = new Map<string, (MenuItemAction | SubmenuItemAction)[]>();
						for (const entry of entries) {
							if (entry.when && !contextKeyService.contextMatchesRules(entry.when)) {
								continue;
							}
							const group = entry.group ?? 'navigation';
							groups.set(group, [...groups.get(group) ?? [], entry.submenu
								? new SubmenuItemAction({ submenu: MenuId.for(entry.id), title: entry.title, icon: entry.icon }, undefined, entry.submenu.map(item =>
									instantiationService.createInstance(MenuItemAction, { id: item.id, title: item.title }, undefined, options, undefined, undefined)), entry.checked)
								: createEntryAction(entry, options)]);
						}
						return [...groups];
					},
				};
				createdMenu = menu;
				return menu;
			}
		});

		let agentWorkbenchLayout = AgentWorkbenchLayout.Desktop;
		const onDidLayoutMainContainer = testStore.add(new Emitter<IDimension>());
		instantiationService.stub(IAgentWorkbenchLayoutService, new class extends mock<IAgentWorkbenchLayoutService>() {
			override readonly mainContainer = root;
			override readonly onDidLayoutMainContainer = onDidLayoutMainContainer.event;
			override get agentWorkbenchLayout() { return agentWorkbenchLayout; }
		});
		stubSessionsHostLayout(instantiationService);

		const contextViewService = new TestContextViewService();
		instantiationService.stub(IContextViewService, contextViewService);

		const contextMenus: string[] = [];
		const contextMenuActions: string[][] = [];
		instantiationService.stub(IContextMenuService, new class extends mock<IContextMenuService>() {
			override readonly onDidShowContextMenu = Event.None;
			override readonly onDidHideContextMenu = Event.None;
			override showContextMenu(delegate: IContextMenuMenuDelegate): void {
				contextMenus.push(delegate.menuId?.id ?? 'none');
				contextMenuActions.push((delegate.getActions?.() ?? []).map(action => action instanceof Separator ? '---' : `${action.checked ? '✓ ' : ''}${action.label}${action.enabled ? '' : ' (disabled)'}`));
			}
		});

		const configurationService = new TestConfigurationService({ [SESSION_ACTIVITY_BAR_SETTING]: true, 'workbench.hover.delay': 500 });
		instantiationService.stub(IConfigurationService, configurationService);
		const contextKeyService = testStore.add(instantiationService.createInstance(ContextKeyService));
		instantiationService.stub(IContextKeyService, contextKeyService);

		if (options?.realHovers) {
			instantiationService.stub(ILayoutService, upcastPartial<ILayoutService>({ activeContainer: root, mainContainer: root, getContainer: () => root, onDidLayoutContainer: Event.None }));
			const hoverService = testStore.add(instantiationService.createInstance(HoverService));
			instantiationService.stub(IHoverService, hoverService);
			const previousHoverDelegate = getBaseLayerHoverDelegate();
			setBaseLayerHoverDelegate(hoverService);
			testStore.add(toDisposable(() => setBaseLayerHoverDelegate(previousHoverDelegate)));
		}

		const activityService = testStore.add(new SessionActivityBarActivityService());
		instantiationService.stub(ISessionActivityBarActivityService, activityService);

		const activityBar = testStore.add(instantiationService.createInstance(SessionActivityBar, container));
		const storageService = instantiationService.get(IStorageService);
		return {
			root,
			activityBar,
			activityService,
			createDocked: () => {
				const host = append(root, $('.host'));
				host.style.cssText = 'width: 800px; height: 600px;';
				for (const [token, value] of [['spacing-size20', '2px'], ['spacing-size40', '4px'], ['spacing-size60', '6px'], ['spacing-size120', '12px'], ['spacing-size240', '24px'], ['strokeThickness', '1px']]) {
					host.style.setProperty(`--vscode-${token}`, value);
				}
				return testStore.add(instantiationService.createInstance(ChatViewSessionActivityBar, host));
			},
			setLayout: (layout: AgentWorkbenchLayout) => agentWorkbenchLayout = layout,
			layoutMainContainer: () => onDidLayoutMainContainer.fire({ width: 800, height: 600 }),
			ran,
			ranWith,
			contextKeyService,
			contextViewService,
			contextMenus,
			contextMenuActions,
			setSize: (size: MenuActivityBarSize) => setSessionActivityBarSize(storageService, size),
			label: (title: string) => activityBar.element.querySelector<HTMLElement>(`.action-label[aria-label^="${title}"]`)!,
			setEntries: (newEntries: readonly ITestEntry[]) => {
				entries = newEntries;
				onDidChangeMenu.fire({ menu: createdMenu!, isStructuralChange: true, isToggleChange: false, isEnablementChange: false });
			},
			setEnabled: (enabled: boolean) => {
				configurationService.setUserConfiguration(SESSION_ACTIVITY_BAR_SETTING, enabled);
				configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectedKeys: new Set([SESSION_ACTIVITY_BAR_SETTING]), affectsConfiguration: (key: string) => key === SESSION_ACTIVITY_BAR_SETTING }));
			},
		};
	}

	function key(target: Element, keyCode: number, key: string): void {
		target.dispatchEvent(new KeyboardEvent('keydown', { key, keyCode, bubbles: true, cancelable: true }));
	}

	test('does not subscribe to chat actions while the activity bar is disabled', () => {
		const { activityBar, setEnabled } = createActivityBar(store, [browser]);
		let subscriptions = 0;
		const actions = derived(reader => {
			subscriptions++;
			reader.store.add(toDisposable(() => subscriptions--));
			return [];
		});
		setEnabled(false);
		activityBar.setChatActions(actions);
		const disabled = subscriptions;
		setEnabled(true);
		const enabled = subscriptions;
		setEnabled(false);
		assert.deepStrictEqual({ disabled, enabled, disabledAgain: subscriptions }, { disabled: 0, enabled: 1, disabledAgain: 0 });
	});

	test('scopes chat actions to their bar and refreshes their labels and callbacks', async () => {
		const id = 'test.pullRequest';
		const entry = { id, title: 'Open Pull Request', icon: Codicon.gitPullRequest, group: SessionActivityBarGroup.SidePanel, when: sessionActivityBarChatActionContext(id) };
		const first = createActivityBar(store, [browser, entry]);
		const second = createActivityBar(store, [browser, entry]);
		const opened: number[] = [];
		const action = (number: number) => toAction({ id, label: `Open Pull Request #${number}`, class: ThemeIcon.asClassName(Codicon.gitPullRequest), run: () => { opened.push(number); } });
		const original = action(1);
		let originalIdReads = 0;
		Object.defineProperty(original, 'id', { get: () => { originalIdReads++; return id; } });
		const actions = observableValue('actions', [original]);
		first.activityBar.setChatActions(actions);
		first.label('Open Pull Request').click();
		key(first.label('Open Pull Request'), 35, 'End');
		actions.set([action(2)], undefined);
		originalIdReads = 0;
		const focusPreserved = getActiveElement() === first.label('Open Pull Request');
		key(first.label('Open Pull Request'), 13, 'Enter');
		first.label('Open Pull Request').dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
		key(first.label('Open Pull Request'), 32, ' ');
		first.label('Open Pull Request').dispatchEvent(new KeyboardEvent('keyup', { key: ' ', keyCode: 32, bubbles: true, cancelable: true }));
		const updated = first.label('Open Pull Request').getAttribute('aria-label');
		const otherBar = !!second.activityBar.element.querySelector('.action-label[aria-label^="Open Pull Request"]');
		first.setEnabled(false);
		first.setEnabled(true);
		const restored = !!first.label('Open Pull Request');
		first.activityBar.setChatActions(undefined);
		await timeout(0);

		assert.deepStrictEqual({ opened, originalIdReads, updated, otherBar, restored, focusPreserved, cleared: !!first.label('Open Pull Request'), commands: first.ran }, {
			opened: [1, 2, 2], originalIdReads: 0, updated: 'Open Pull Request #2', otherBar: false, restored: true, focusPreserved: true, cleared: false, commands: [],
		});
	});

	test('keeps chat actions directly clickable when checked without adding dropdowns', () => {
		const id = 'test.issue';
		const { activityBar, label } = createActivityBar(store, [{
			id, title: 'Issues', icon: Codicon.issues, group: SessionActivityBarGroup.SidePanel, when: sessionActivityBarChatActionContext(id),
		}]);
		const ran: number[] = [];
		const action = (number: number, checked: boolean) => toAction({ id, label: 'Issues', checked, class: ThemeIcon.asClassName(Codicon.issues), run: () => { ran.push(number); } });
		const actions = observableValue('actions', [action(1, false)]);
		activityBar.setChatActions(actions);
		const primary = label('Issues');
		primary.click();
		actions.set([action(2, true)], undefined);
		const checked = { css: primary.classList.contains('checked'), pressed: primary.getAttribute('aria-pressed'), sameElement: primary === label('Issues') };
		primary.click();
		assert.deepStrictEqual({
			ran, checked, noDropdown: !activityBar.element.querySelector('.dropdown-action-container'),
		}, {
			ran: [1, 2], checked: { css: true, pressed: 'true', sameElement: true }, noDropdown: true,
		});
	});

	test('shows icon-only entries while enabled and has entries, outside the phone layout', () => {
		const { root, activityBar, setEntries, setEnabled } = createActivityBar(store, [changes, browser, canvas]);
		const displayed = () => mainWindow.getComputedStyle(activityBar.element).display !== 'none';

		const entries = [...activityBar.element.querySelectorAll<HTMLElement>('.action-label')].map(label => ({
			ariaLabel: label.getAttribute('aria-label'),
			icon: [...label.classList].find(className => className.startsWith('codicon-')),
			hasPopup: label.getAttribute('aria-haspopup'),
			text: label.textContent,
		}));
		const initial = displayed();
		setEnabled(false);
		const settingDisabled = displayed();
		setEnabled(true);
		const settingEnabled = displayed();
		setEntries([]);
		const noEntries = displayed();
		setEntries([browser]);
		const entriesAdded = displayed();
		root.classList.add('phone-layout');
		const phoneLayout = displayed();

		assert.deepStrictEqual({ entries, initial, settingDisabled, settingEnabled, noEntries, entriesAdded, phoneLayout }, {
			entries: [
				{ ariaLabel: 'Changes', icon: 'codicon-git-compare', hasPopup: null, text: '' },
				{ ariaLabel: 'Browser', icon: 'codicon-globe', hasPopup: null, text: '' },
				{ ariaLabel: 'Canvas', icon: 'codicon-preview', hasPopup: 'menu', text: '' },
			],
			initial: true,
			settingDisabled: false,
			settingEnabled: true,
			noEntries: false,
			entriesAdded: true,
			phoneLayout: false,
		});
	});

	test('shows the activity reported for an entry as a badge and in its label', () => {
		const { activityBar, activityService } = createActivityBar(store, [changes, browser]);
		const state = () => [...activityBar.element.querySelectorAll<HTMLElement>('.action-item')].map(item => {
			const badge = item.querySelector<HTMLElement>('.menu-activity-bar-badge')!;
			return {
				ariaLabel: item.querySelector('.action-label')!.getAttribute('aria-label'),
				badge: mainWindow.getComputedStyle(badge).display === 'none' ? undefined : badge.classList.contains('count') ? badge.textContent : 'dot',
			};
		});

		const initial = state();
		const dot = activityService.showActivity(changes.id, { badge: new IconBadge(Codicon.circleFilled, () => 'New changes') });
		const withDot = state();
		// Like the workbench activity bar, the badge overlaps the bottom-right corner of the 24px icon centered in the 36px entry.
		for (const [token, value] of [['spacing-size20', '2px'], ['spacing-size60', '6px'], ['spacing-size80', '8px'], ['spacing-size120', '12px'], ['spacing-size200', '20px'], ['spacing-size240', '24px'], ['strokeThickness', '1px']]) {
			activityBar.element.style.setProperty(`--vscode-${token}`, value);
		}
		const changesItem = activityBar.element.querySelector<HTMLElement>('.action-item')!;
		const itemBounds = changesItem.getBoundingClientRect();
		const badgeBounds = changesItem.querySelector('.menu-activity-bar-badge')!.getBoundingClientRect();
		const centerX = (badgeBounds.left + badgeBounds.right) / 2;
		const centerY = (badgeBounds.top + badgeBounds.bottom) / 2;
		const dotPlacement = {
			insideEntry: badgeBounds.left >= itemBounds.left && badgeBounds.right <= itemBounds.right && badgeBounds.top >= itemBounds.top && badgeBounds.bottom <= itemBounds.bottom,
			bottomRightQuadrant: centerX > (itemBounds.left + itemBounds.right) / 2 && centerY > (itemBounds.top + itemBounds.bottom) / 2,
			smallerThanEntry: badgeBounds.width < itemBounds.width / 2 && badgeBounds.height < itemBounds.height / 2,
		};
		const count = activityService.showActivity(browser.id, { badge: new NumberBadge(120, n => `${n} pages`) });
		const withCount = state();
		// The most recent activity is shown, not an aggregate of every activity.
		const moreRecentCount = activityService.showActivity(browser.id, { badge: new NumberBadge(3, n => `${n} tabs`) });
		const withMoreRecentCount = state();
		moreRecentCount.dispose();
		dot.dispose();
		count.dispose();
		const cleared = state();

		assert.deepStrictEqual({ initial, withDot, dotPlacement, withCount, withMoreRecentCount, cleared }, {
			initial: [{ ariaLabel: 'Changes', badge: undefined }, { ariaLabel: 'Browser', badge: undefined }],
			withDot: [{ ariaLabel: 'Changes - New changes', badge: 'dot' }, { ariaLabel: 'Browser', badge: undefined }],
			dotPlacement: { insideEntry: true, bottomRightQuadrant: true, smallerThanEntry: true },
			withCount: [{ ariaLabel: 'Changes - New changes', badge: 'dot' }, { ariaLabel: 'Browser - 120 pages', badge: '99+' }],
			withMoreRecentCount: [{ ariaLabel: 'Changes - New changes', badge: 'dot' }, { ariaLabel: 'Browser - 3 tabs', badge: '3' }],
			cleared: [{ ariaLabel: 'Changes', badge: undefined }, { ariaLabel: 'Browser', badge: undefined }],
		});
	});

	test('docks at the right of the chat area at a fixed distance below its top, with a grip, and shows only while active', () => {
		const { createDocked, root, setEntries } = createActivityBar(store, [changes, browser]);
		const docked = createDocked();
		const element = docked.element!;
		const state = () => {
			const style = mainWindow.getComputedStyle(element);
			const grip = element.querySelector<HTMLElement>('.session-activity-bar-drag-handle');
			return { displayed: style.display !== 'none', top: element.style.top, right: style.right, grip: !!grip && mainWindow.getComputedStyle(grip).display !== 'none' };
		};

		docked.layout(40, 400);
		const inactive = state().displayed;
		docked.setActive(true);
		const active = state();
		setEntries([changes, browser, canvas]);
		docked.layout(60, 400);
		const areaMoved = state().top;
		root.classList.add('phone-layout');
		const phoneLayout = state().displayed;
		root.classList.remove('phone-layout');
		docked.setActive(false);
		const deactivated = state().displayed;

		assert.deepStrictEqual({ inactive, active, areaMoved, phoneLayout, deactivated }, {
			inactive: false,
			active: { displayed: true, top: '44px', right: '2px', grip: true },
			areaMoved: '64px',
			phoneLayout: false,
			deactivated: false,
		});
	});

	test('floating beside the chat, drags up and down by its grip within the area, clear of the input, and double-clicking the grip resets it; docked in a column, it has no grip', () => {
		const { createDocked, root } = createActivityBar(store, [changes, browser]);
		const hostElement = append(root, $('.external-host'));
		const inColumn = observableValue('inColumn', false);
		store.add(registerSessionActivityBarExternalHost(root, { element: hostElement, active: inColumn, fullSize: true, setOccupied: () => { } }));
		const docked = createDocked();
		const element = docked.element!;
		const grip = element.querySelector<HTMLElement>('.session-activity-bar-drag-handle')!;
		const top = () => Number.parseFloat(element.style.top);
		const drag = (deltaY: number) => {
			const pointer = { pointerId: 1, button: 0, buttons: 1, bubbles: true, clientX: 0 };
			grip.dispatchEvent(new PointerEvent('pointerdown', { ...pointer, clientY: 0 }));
			grip.dispatchEvent(new PointerEvent('pointermove', { ...pointer, clientY: deltaY }));
			grip.dispatchEvent(new PointerEvent('pointerup', { ...pointer, buttons: 0, clientY: deltaY }));
		};

		docked.layout(40, 400);
		docked.setActive(true);
		drag(50);
		const dragged = top();
		drag(2000);
		const bottomGap = 40 + 400 - top() - element.offsetHeight;
		docked.layout(40, 600);
		const bottomGapAfterAreaGrew = 40 + 600 - top() - element.offsetHeight;
		grip.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		const reset = top();
		inColumn.set(true, undefined);
		const inColumnState = { top: mainWindow.getComputedStyle(element).top, grip: mainWindow.getComputedStyle(grip).display !== 'none' };

		assert.deepStrictEqual({ dragged, bottomGap, bottomGapAfterAreaGrew, reset, inColumn: inColumnState }, {
			dragged: 94,
			bottomGap: 30,
			bottomGapAfterAreaGrew: 30,
			reset: 44,
			inColumn: { top: '0px', grip: false },
		});
	});

	test('renders two groups: the side panel toggle with the tab entries, then the terminal with the panel toggle', () => {
		const sidePanel: ITestEntry = { id: 'test.sidePanel', title: 'Toggle Side Panel', icon: Codicon.layoutSidebarRight, group: SessionActivityBarGroup.SidePanel };
		const terminal: ITestEntry = { id: 'test.terminal', title: 'Terminal', icon: Codicon.terminal, group: SessionActivityBarGroup.Panel };
		const panel: ITestEntry = { id: 'test.panel', title: 'Show Panel', icon: Codicon.layoutPanelOff, group: SessionActivityBarGroup.Panel };
		const { activityBar, ran, label } = createActivityBar(store, [sidePanel, { ...changes, group: SessionActivityBarGroup.SidePanel }, { ...browser, group: SessionActivityBarGroup.SidePanel }, terminal, panel]);
		const items = [...activityBar.element.querySelectorAll<HTMLElement>('.actions-container > .action-item')]
			.map(item => item.querySelector('.action-label.separator') ? '---' : item.querySelector('.action-label')?.getAttribute('aria-label'));
		label('Toggle Side Panel').click();

		assert.deepStrictEqual({ items, ran }, {
			items: ['Toggle Side Panel', 'Changes', 'Browser', '---', 'Terminal', 'Show Panel'],
			ran: ['test.sidePanel'],
		});
	});

	test('docked activity bar stays above the chat transcript sticky scroll', () => {
		const { createDocked } = createActivityBar(store, [changes, browser]);
		const docked = createDocked();
		const element = docked.element!;
		// The tree sticky-scroll surface that pins a scrolled chat request to the top of the transcript.
		const scrollable = append(append(element.parentElement!, $('.monaco-list')), $('.monaco-scrollable-element'));
		append(append(scrollable, $('.monaco-tree-sticky-container')), $('.sticky-row')).style.cssText = 'height: 300px; background: black;';
		docked.layout(0, 400);
		docked.setActive(true);

		const bounds = element.getBoundingClientRect();
		const topmost = mainWindow.document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);

		assert.deepStrictEqual(!!topmost && element.contains(topmost), true);
	});

	test('uses a slim shell with minimum-size buttons in a column of its own at the right edge, with an equal 2px gap on either side, the chat to its left', () => {
		const { createDocked } = createActivityBar(store, [changes, browser]);
		const docked = createDocked();
		docked.layout(0, 400);
		docked.setActive(true);
		const element = docked.element!;
		const host = element.parentElement!;
		// As the hosts lay it out: to the left of the column they keep.
		const chat = append(host, $('.chat-view.sessions-chat'));
		chat.style.cssText = `position: absolute; top: 0; left: 0; height: 100%; width: calc(100% - ${docked.reservedWidth.get()}px);`;
		const bounds = element.getBoundingClientRect();
		const button = element.querySelector<HTMLElement>('.action-label')!.getBoundingClientRect();
		const hostBounds = host.getBoundingClientRect();
		const chatBounds = chat.getBoundingClientRect();

		assert.deepStrictEqual({
			activityBarWidth: bounds.width,
			buttonSize: [button.width, button.height],
			column: docked.reservedWidth.get(),
			gaps: { chat: bounds.left - chatBounds.right, edge: hostBounds.right - bounds.right },
		}, {
			activityBarWidth: 30,
			buttonSize: [24, 24],
			column: SESSION_ACTIVITY_BAR_COLUMN_WIDTH,
			gaps: { chat: 2, edge: 2 },
		});
	});

	test('docked activity bar is only created in the desktop layout', () => {
		const { createDocked, setLayout } = createActivityBar(store, [changes]);
		const desktopActivityBar = createDocked();
		const desktop = { created: !!desktopActivityBar.element, reservedWidth: desktopActivityBar.reservedWidth.get() };
		setLayout(AgentWorkbenchLayout.Mobile);
		const mobileActivityBar = createDocked();
		const mobile = { created: !!mobileActivityBar.element, reservedWidth: mobileActivityBar.reservedWidth.get() };

		assert.deepStrictEqual({ desktop, mobile }, {
			desktop: { created: true, reservedWidth: SESSION_ACTIVITY_BAR_COLUMN_WIDTH },
			mobile: { created: false, reservedWidth: 0 },
		});
	});

	test('reserves room beside the chat whether or not the view is active, unless disabled or in the phone layout', () => {
		const { createDocked, setEnabled, root, layoutMainContainer } = createActivityBar(store, [changes]);
		const docked = createDocked();
		const reserved = () => docked.reservedWidth.get();

		const inactive = reserved();
		docked.setActive(true);
		const active = reserved();
		setEnabled(false);
		const disabled = reserved();
		setEnabled(true);
		root.classList.add('phone-layout');
		layoutMainContainer();
		const phoneLayout = reserved();

		assert.deepStrictEqual({ inactive, active, disabled, phoneLayout }, {
			inactive: SESSION_ACTIVITY_BAR_COLUMN_WIDTH,
			active: SESSION_ACTIVITY_BAR_COLUMN_WIDTH,
			disabled: 0,
			phoneLayout: 0,
		});
	});

	test('shows in a host outside the chat while the host is active, level with its top, which then keeps the column for it, also while the chat is hidden, and beside the chat again otherwise', () => {
		const { createDocked, root } = createActivityBar(store, [changes]);
		const hostElement = append(root, $('.external-host'));
		const active = observableValue('active', false);
		const occupied: boolean[] = [];
		store.add(registerSessionActivityBarExternalHost(root, { element: hostElement, active, setOccupied: (_occupant, value) => occupied.push(value) }));
		const docked = createDocked();
		const element = docked.element!;
		const state = () => ({ inHost: hostElement.contains(element), shown: !element.classList.contains('inactive'), reserved: docked.reservedWidth.get() });

		docked.layout(40, 400);
		docked.setActive(true);
		const besideChat = state();
		active.set(true, undefined);
		const hosted = { ...state(), top: element.style.top };
		docked.setActive(true, true);
		const chatHidden = state();
		active.set(false, undefined);
		const hostInactiveChatHidden = state();
		docked.setActive(true);
		const back = state();

		assert.deepStrictEqual({ besideChat, hosted, chatHidden, hostInactiveChatHidden, back, occupied: occupied.at(-1) }, {
			besideChat: { inHost: false, shown: true, reserved: SESSION_ACTIVITY_BAR_COLUMN_WIDTH },
			hosted: { inHost: true, shown: true, reserved: 0, top: '0px' },
			chatHidden: { inHost: true, shown: true, reserved: 0 },
			hostInactiveChatHidden: { inHost: false, shown: false, reserved: SESSION_ACTIVITY_BAR_COLUMN_WIDTH },
			back: { inHost: false, shown: true, reserved: SESSION_ACTIVITY_BAR_COLUMN_WIDTH },
			occupied: false,
		});
	});

	test('stays beside the chat while its host is turned off, as when the fixed column setting is off, and offers itself to the host whether it is on or off', () => {
		const { createDocked, root } = createActivityBar(store, [changes]);
		const hostElement = append(root, $('.external-host'));
		const active = observableValue('active', true);
		const enabled = observableValue('enabled', false);
		let offers = 0;
		store.add(registerSessionActivityBarExternalHost(root, { element: hostElement, active, enabled, offer: () => offers++, setOccupied: () => { } }));
		const docked = createDocked();
		const element = docked.element!;
		const state = () => ({ inHost: hostElement.contains(element), shown: !element.classList.contains('inactive'), reserved: docked.reservedWidth.get(), offered: offers > 0 });

		docked.layout(40, 400);
		const inactiveChat = state();
		docked.setActive(true);
		const off = state();
		offers = 0;
		enabled.set(true, undefined);
		const on = state();
		offers = 0;
		active.set(false, undefined);
		const hostInactive = state();

		assert.deepStrictEqual({ inactiveChat, off, on, hostInactive }, {
			inactiveChat: { inHost: false, shown: false, reserved: SESSION_ACTIVITY_BAR_COLUMN_WIDTH, offered: false },
			off: { inHost: false, shown: true, reserved: SESSION_ACTIVITY_BAR_COLUMN_WIDTH, offered: true },
			on: { inHost: true, shown: true, reserved: 0, offered: true },
			hostInactive: { inHost: false, shown: true, reserved: SESSION_ACTIVITY_BAR_COLUMN_WIDTH, offered: false },
		});
	});

	test('in the main window\'s column, fills the column from top to bottom after the gap between cards, with entries the size of the Modern UI workbench activity bar\'s at the normal size, and offers the context menu anywhere', () => {
		const { createDocked, root, contextMenus, setSize } = createActivityBar(store, [changes, browser]);
		setSize(MenuActivityBarSize.Normal);
		const hostElement = append(root, $('.session-activity-bar-column.session-activity-bar-host'));
		// As the workbench sizes the column: the gap between cards, then the bar.
		hostElement.style.cssText = `--agents-floating-panel-gap: 8px; --vscode-spacing-size80: 8px; --vscode-strokeThickness: 1px; position: relative; width: ${8 + MenuActivityBar.getWidth(false)}px; height: 200px;`;
		store.add(registerSessionActivityBarExternalHost(root, { element: hostElement, active: observableValue('active', true), fullSize: true, setOccupied: () => { } }));
		const docked = createDocked();
		docked.layout(40, 400);
		docked.setActive(true);
		const element = docked.element!;
		const bounds = element.getBoundingClientRect();
		const hostBounds = hostElement.getBoundingClientRect();
		const nearBottom = mainWindow.document.elementFromPoint(bounds.left + bounds.width / 2, bounds.bottom - 10)!;
		nearBottom.dispatchEvent(new MouseEvent('contextmenu', { button: 2, bubbles: true, cancelable: true }));

		assert.deepStrictEqual({
			fills: [bounds.top, bounds.bottom, bounds.left, bounds.right].map(Math.round),
			entry: (({ width, height }) => [width, height])(element.querySelector<HTMLElement>('.action-label:not(.separator)')!.getBoundingClientRect()),
			iconSize: mainWindow.getComputedStyle(element.querySelector<HTMLElement>('.action-label:not(.separator)')!).fontSize,
			bottomIsStrip: element.contains(nearBottom),
			menus: contextMenus,
		}, {
			fills: [hostBounds.top, hostBounds.bottom, hostBounds.left + 8, hostBounds.right].map(Math.round),
			entry: [36, 36],
			iconSize: '24px',
			bottomIsStrip: true,
			menus: ['SessionActivityBarContext'],
		});
	});

	test('in the main window\'s column, takes the size chosen for it, and beside a chat is always compact', () => {
		const { createDocked, root, setSize } = createActivityBar(store, [changes, browser]);
		root.style.setProperty('--vscode-spacing-size40', '4px');
		root.style.setProperty('--vscode-spacing-size80', '8px');
		const hostElement = append(root, $('.session-activity-bar-column.session-activity-bar-host'));
		const inColumn = observableValue('inColumn', true);
		store.add(registerSessionActivityBarExternalHost(root, { element: hostElement, active: inColumn, fullSize: true, setOccupied: () => { } }));
		const docked = createDocked();
		docked.layout(0, 400);
		docked.setActive(true);
		const element = docked.element!;
		const state = () => {
			const [first, second] = [...element.querySelectorAll<HTMLElement>('.action-label:not(.separator)')].map(entry => entry.getBoundingClientRect());
			return { compact: element.classList.contains('size-compact'), floating: element.classList.contains('floating'), gap: second.top - first.bottom };
		};

		const initial = state();
		setSize(MenuActivityBarSize.Normal);
		const normalSize = state();
		inColumn.set(false, undefined);
		const besideChat = state();
		inColumn.set(true, undefined);
		const backInColumn = state();
		setSize(MenuActivityBarSize.Compact);
		const compact = state();
		root.classList.add('modern-ui-compact');
		const compactDensity = state();

		assert.deepStrictEqual({ initial, normalSize, besideChat, backInColumn, compact, compactDensity }, {
			initial: { compact: true, floating: false, gap: 4 },
			normalSize: { compact: false, floating: false, gap: 8 },
			besideChat: { compact: true, floating: true, gap: 0 },
			backInColumn: { compact: false, floating: false, gap: 8 },
			compact: { compact: true, floating: false, gap: 4 },
			compactDensity: { compact: true, floating: false, gap: 4 },
		});
	});

	test('aligns the docked strip with inset frames without horizontal movement and defaults to transparent customizable chrome', () => {
		const { createDocked, root } = createActivityBar(store, [changes, browser]);
		root.classList.add('agent-sessions-workbench', 'modern-ui-tabs');
		root.style.setProperty('--vscode-strokeThickness', '1px');
		root.style.setProperty('--vscode-agentsWindow-panels-spacing', '4px');
		root.style.setProperty('--vscode-modernActivityBar-border', 'red');
		root.style.setProperty('--vscode-modernActivityBar-background', 'red');
		const hostElement = append(root, $('.session-activity-bar-column.session-activity-bar-host'));
		hostElement.style.cssText = '--vscode-spacing-size60: 6px; --vscode-spacing-size240: 24px; width: 38px; height: 200px;';
		store.add(registerSessionActivityBarExternalHost(root, { element: hostElement, active: observableValue('active', true), fullSize: true, setOccupied: () => { } }));
		const docked = createDocked();
		docked.layout(40, 400);
		docked.setActive(true);
		const element = docked.element!;
		const geometry = () => {
			const bounds = element.getBoundingClientRect();
			const hostBounds = hostElement.getBoundingClientRect();
			return {
				insets: [bounds.top - hostBounds.top, hostBounds.bottom - bounds.bottom, hostBounds.right - bounds.right],
				border: mainWindow.getComputedStyle(element).borderRightColor,
				background: mainWindow.getComputedStyle(element).backgroundColor,
			};
		};
		const open = geometry();
		root.classList.add('noeditorpane');
		const closed = geometry();
		root.classList.remove('noeditorpane');
		const reopened = geometry();
		root.classList.add('modern-ui-compact', 'hc-black');
		const compact = geometry();
		root.classList.remove('modern-ui-compact', 'hc-black');
		root.classList.add('hc-light');
		const highContrastLight = geometry();
		root.classList.remove('modern-ui-tabs');
		const legacy = geometry();
		root.style.setProperty('--vscode-agentsActivityBar-background', '#123456');
		root.style.setProperty('--vscode-agentsActivityBar-border', '#abcdef');
		const customized = geometry();
		root.style.removeProperty('--vscode-agentsActivityBar-background');
		root.style.removeProperty('--vscode-agentsActivityBar-border');
		const reset = geometry();

		assert.deepStrictEqual({ open, closed, reopened, compact, highContrastLight, legacy, customized, reset }, {
			open: { insets: [1, 1, 0], border: 'rgba(0, 0, 0, 0)', background: 'rgba(0, 0, 0, 0)' },
			closed: { insets: [1, 1, 0], border: 'rgba(0, 0, 0, 0)', background: 'rgba(0, 0, 0, 0)' },
			reopened: { insets: [1, 1, 0], border: 'rgba(0, 0, 0, 0)', background: 'rgba(0, 0, 0, 0)' },
			compact: { insets: [0, 0, 0], border: 'rgba(0, 0, 0, 0)', background: 'rgba(0, 0, 0, 0)' },
			highContrastLight: { insets: [1, 1, 0], border: 'rgba(0, 0, 0, 0)', background: 'rgba(0, 0, 0, 0)' },
			legacy: { insets: [0, 0, 0], border: 'rgba(0, 0, 0, 0)', background: 'rgba(0, 0, 0, 0)' },
			customized: { insets: [0, 0, 0], border: 'rgb(171, 205, 239)', background: 'rgb(18, 52, 86)' },
			reset: { insets: [0, 0, 0], border: 'rgba(0, 0, 0, 0)', background: 'rgba(0, 0, 0, 0)' },
		});
	});

	test('aligns the first docked control with the connected panel header icons as tab height and layout density change', () => {
		const { createDocked, root } = createActivityBar(store, [changes, browser]);
		root.classList.add('modern-ui-tabs', 'modern-ui-connected-editor-tabs');
		root.style.cssText = '--vscode-spacing-size20: 2px; --vscode-spacing-size40: 4px; --vscode-spacing-size60: 6px; --vscode-spacing-size80: 8px; --vscode-spacing-size200: 20px; --vscode-spacing-size240: 24px; --vscode-strokeThickness: 1px;';
		const editor = append(root, $('.part.editor'));
		editor.style.cssText = 'position: absolute; top: 0; width: 400px;';
		const group = append(append(editor, $('.content')), $('.editor-group-container.active'));
		const title = append(group, $('.title.tabs'));
		const row = append(title, $('.tabs-and-actions-container'));
		append(append(row, $('.tabs-container')), $('.tab'));
		const toolbars = append(row, $('.editor-toolbars'));
		const actions = append(toolbars, $('.editor-actions'));
		const actionBar = append(append(actions, $('.monaco-toolbar')), $('.monaco-action-bar'));
		const icon = append(append(append(actionBar, $('ul.actions-container')), $('li.action-item')), $('a.action-label.codicon'));
		const hostElement = append(root, $('.session-activity-bar-column.session-activity-bar-host'));
		hostElement.style.cssText = 'position: absolute; top: 0; width: 34px; height: 200px;';
		store.add(registerSessionActivityBarExternalHost(root, { element: hostElement, active: observableValue('active', true), fullSize: true, setOccupied: () => { } }));
		const docked = createDocked();
		docked.setActive(true);
		docked.layout(0, 200);
		const states = [false, true, false].map(compactDensity => {
			root.classList.toggle('modern-ui-compact', compactDensity);
			return [false, true, false].map(compactTabs => {
				root.classList.toggle('editor-tabs-compact-height', compactTabs);
				title.classList.toggle('compact-height', compactTabs);
				const control = docked.element!.querySelector<HTMLElement>('.action-label')!.getBoundingClientRect();
				const header = icon.getBoundingClientRect();
				return {
					offset: control.top + control.height / 2 - header.top - header.height / 2,
					center: control.top + control.height / 2 - hostElement.getBoundingClientRect().top,
				};
			});
		});

		assert.deepStrictEqual(states, Array.from({ length: 3 }, () => [
			{ offset: 0, center: 15.5 },
			{ offset: 0, center: 13.5 },
			{ offset: 0, center: 15.5 },
		]));
	});

	test('right-clicking an entry or the rest of the strip offers to hide the activity bar and lists the entries to show, the rest of the strip without the actions of an entry', () => {
		const { createDocked, contextMenus, contextMenuActions } = createActivityBar(store, [changes, browser]);
		const docked = createDocked();
		docked.layout(0, 400);
		docked.setActive(true);
		const element = docked.element!;
		const rightClick = (target: HTMLElement) => {
			const event = new MouseEvent('contextmenu', { button: 2, bubbles: true, cancelable: true });
			target.dispatchEvent(event);
			return event.defaultPrevented;
		};

		assert.deepStrictEqual({
			entry: rightClick(element.querySelector<HTMLElement>('.action-label[aria-label^="Browser"]')!),
			strip: rightClick(element),
			menus: contextMenus,
			actions: contextMenuActions,
		}, {
			entry: true,
			strip: true,
			menus: ['SessionActivityBarContext', 'SessionActivityBarContext'],
			actions: [
				['Configure Keybinding (disabled)', 'Hide \'Browser\'', '---', '✓ Changes', '✓ Browser'],
				['✓ Changes', '✓ Browser'],
			],
		});
	});

	test('shows the hover of the next entry instantly once one has shown, like the workbench activity bar', () => {
		const previous = getBaseLayerHoverDelegate();
		const delegates = new Set<IHoverDelegate>();
		setBaseLayerHoverDelegate({ ...previous, setupManagedHover: (delegate, ...args) => { delegates.add(delegate); return previous.setupManagedHover(delegate, ...args); } });
		store.add(toDisposable(() => setBaseLayerHoverDelegate(previous)));
		createActivityBar(store, [changes, browser]);

		// All entries share one delegate.
		assert.strictEqual(delegates.size, 1);
		const [delegate] = delegates;
		const firstDelay = delegate.delay;
		delegate.onDidHideHover?.();

		assert.deepStrictEqual({ firstDelayed: firstDelay !== 0, nextDelay: delegate.delay }, { firstDelayed: true, nextDelay: 0 });
	});

	test('runs an entry when clicked', async () => {
		const { label, ran } = createActivityBar(store, [changes, browser]);

		label('Browser').click();
		await timeout(0);

		assert.deepStrictEqual(ran, ['test.browser']);
	});

	test('shows a checked entry as pressed and hides what it shows when it is clicked or activated by keyboard', async () => {
		const files: ITestEntry = { id: 'test.files', title: 'Files', icon: Codicon.files, group: SessionActivityBarGroup.SidePanel, checked: true };
		const terminal: ITestEntry = { id: 'test.terminal', title: 'Terminal', icon: Codicon.terminal, group: SessionActivityBarGroup.Panel, checked: true };
		// The entries' groups determine what they hide, as registered in the menu.
		for (const entry of [files, terminal]) {
			store.add(MenuRegistry.appendMenuItem(Menus.SessionActivityBar, { command: { id: entry.id, title: entry.title }, group: entry.group }));
		}
		const { label, ran } = createActivityBar(store, [files, { ...browser, group: SessionActivityBarGroup.SidePanel }, terminal]);

		const state = (title: string) => ({ checked: label(title).classList.contains('checked'), pressed: label(title).getAttribute('aria-pressed') });
		const before = { files: state('Files'), browser: state('Browser'), terminal: state('Terminal') };
		for (const title of ['Files', 'Browser', 'Terminal']) {
			label(title).click();
			await timeout(0);
		}
		key(label('Files'), 36, 'Home');
		key(label('Files'), 13, 'Enter');
		// The action bar runs the focused entry when Enter is released.
		label('Files').dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
		await timeout(0);

		assert.deepStrictEqual({ before, ran }, {
			before: { files: { checked: true, pressed: 'true' }, browser: { checked: false, pressed: null }, terminal: { checked: true, pressed: 'true' } },
			ran: [TOGGLE_SIDE_PANEL_COMMAND_ID, 'test.browser', TogglePanelAction.ID, TOGGLE_SIDE_PANEL_COMMAND_ID],
		});
	});

	test('shows a checked Canvas submenu as pressed', () => {
		const createCanvas = (checked: boolean): ITestEntry => ({
			...canvas,
			checked,
		});
		const inactive = createActivityBar(store, [createCanvas(false)]);
		const active = createActivityBar(store, [createCanvas(true)]);
		const state = (entry: ReturnType<typeof createActivityBar>) => {
			const element = entry.label('Canvas');
			return { checked: element.classList.contains('checked'), pressed: element.getAttribute('aria-pressed') };
		};

		assert.deepStrictEqual({ inactive: state(inactive), active: state(active) }, {
			inactive: { checked: false, pressed: 'false' },
			active: { checked: true, pressed: 'true' },
		});
	});

	test('in a window with layout modes, such as a chat window, a checked entry hides the editor parts of that window, and the entries of the panel\'s group toggle themselves: never the side panel or the panel of the main window', async () => {
		const files: ITestEntry = { id: 'test.files', title: 'Files', icon: Codicon.files, group: SessionActivityBarGroup.SidePanel, checked: true };
		const terminal: ITestEntry = { id: 'test.terminal', title: 'Terminal', icon: Codicon.terminal, group: SessionActivityBarGroup.Panel, checked: true };
		for (const entry of [files, terminal]) {
			store.add(MenuRegistry.appendMenuItem(Menus.SessionActivityBar, { command: { id: entry.id, title: entry.title }, group: entry.group }));
		}
		const { label, ran, contextKeyService } = createActivityBar(store, [files, terminal]);
		LayoutModeContext.bindTo(contextKeyService).set('sideBySide');

		for (const title of ['Files', 'Terminal']) {
			label(title).click();
			await timeout(0);
		}

		assert.deepStrictEqual(ran, ['workbench.action.chatWindow.toggleEditor', 'test.terminal']);
	});

	test('the entries run with the window they are in, which the window that has focus may not be yet: a chat window, or the main window, such as while a chat window has focus', async () => {
		const files: ITestEntry = { id: 'test.files', title: 'Files', icon: Codicon.files, group: SessionActivityBarGroup.SidePanel, checked: true };
		const terminal: ITestEntry = { id: 'test.terminal', title: 'Terminal', icon: Codicon.terminal, group: SessionActivityBarGroup.Panel };
		for (const entry of [files, terminal]) {
			store.add(MenuRegistry.appendMenuItem(Menus.SessionActivityBar, { command: { id: entry.id, title: entry.title }, group: entry.group }));
		}
		const { label, ranWith, contextKeyService } = createActivityBar(store, [files, terminal]);

		label('Terminal').click();
		await timeout(0);
		LayoutModeContext.bindTo(contextKeyService).set('sideBySide');
		for (const title of ['Terminal', 'Files']) {
			label(title).click();
			await timeout(0);
		}

		const context: IWindowCommandContext = { windowId: mainWindow.vscodeWindowId };
		assert.deepStrictEqual(ranWith, [
			{ id: 'test.terminal', args: [context] },
			{ id: 'test.terminal', args: [context] },
			{ id: 'workbench.action.chatWindow.toggleEditor', args: [context] },
		]);
	});

	test('opens the Canvas submenu to the left on hover, click, and keyboard, and runs its items', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { label, ran, contextViewService } = createActivityBar(store, [browser, canvas]);
		const canvasLabel = label('Canvas');
		const state = () => ({ shown: contextViewService.openSubmenu, expanded: canvasLabel.getAttribute('aria-expanded'), highlighted: canvasLabel.classList.contains('submenu-open') });

		canvasLabel.dispatchEvent(new MouseEvent('mouseenter'));
		await timeout(300);
		const afterHover = state();
		const preferredSide = contextViewService.delegate?.anchorAlignment === AnchorAlignment.RIGHT ? 'left' : 'right';
		contextViewService.hideContextView();

		canvasLabel.click();
		const afterClick = state();

		key(getActiveElement()!, 39, 'ArrowRight');
		const afterRightArrow = { ...state(), anchorFocused: getActiveElement() === canvasLabel };

		key(canvasLabel, 37, 'ArrowLeft');
		const afterLeftArrow = state();

		key(getActiveElement()!, 13, 'Enter');
		await timeout(0);
		const afterRun = { ...state(), ran };

		assert.deepStrictEqual({ afterHover, preferredSide, afterClick, afterRightArrow, afterLeftArrow, afterRun }, {
			afterHover: { shown: { items: ['Kusto'], focused: false }, expanded: 'true', highlighted: true },
			preferredSide: 'left',
			afterClick: { shown: { items: ['Kusto'], focused: true }, expanded: 'true', highlighted: true },
			afterRightArrow: { shown: undefined, expanded: 'false', highlighted: false, anchorFocused: true },
			afterLeftArrow: { shown: { items: ['Kusto'], focused: true }, expanded: 'true', highlighted: true },
			afterRun: { shown: undefined, expanded: 'false', highlighted: false, ran: ['test.canvas.kusto'] },
		});
	}));

	test('does not show the Canvas entry\'s hover over its submenu, nor after the pointer leaves, and shows it again after the submenu closes', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { root, label } = createActivityBar(store, [browser, canvas], { realHovers: true });
		const hover = () => [...root.querySelectorAll('.monaco-hover')].map(element => element.textContent?.trim());
		const enter = (target: HTMLElement) => {
			target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
			target.dispatchEvent(new MouseEvent('mouseenter'));
		};
		const leave = (target: HTMLElement) => {
			target.dispatchEvent(new MouseEvent('mouseleave'));
			target.parentElement!.dispatchEvent(new MouseEvent('mouseleave'));
		};
		const browserLabel = label('Browser');
		const canvasLabel = label('Canvas');

		enter(canvasLabel);
		await timeout(1000);
		const hoveredUntilSubmenuOpens = { submenu: canvasLabel.getAttribute('aria-expanded'), hover: hover() };
		leave(canvasLabel);
		await timeout(1000);
		const afterLeaving = { submenu: canvasLabel.getAttribute('aria-expanded'), hover: hover() };

		enter(browserLabel);
		await timeout(1000);
		const browserHover = hover();
		leave(browserLabel);
		enter(canvasLabel);
		await timeout(0);
		const instantHoverAfterSubmenuClosed = hover();
		await timeout(300);
		const instantHoverOnceSubmenuOpens = { submenu: canvasLabel.getAttribute('aria-expanded'), hover: hover() };

		assert.deepStrictEqual({ hoveredUntilSubmenuOpens, afterLeaving, browserHover, instantHoverAfterSubmenuClosed, instantHoverOnceSubmenuOpens }, {
			hoveredUntilSubmenuOpens: { submenu: 'true', hover: [] },
			afterLeaving: { submenu: 'false', hover: [] },
			browserHover: ['Browser'],
			instantHoverAfterSubmenuClosed: ['Canvas'],
			instantHoverOnceSubmenuOpens: { submenu: 'true', hover: [] },
		});
	}));
});
