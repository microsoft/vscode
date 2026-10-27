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
import { toAction } from '../../../base/common/actions.js';
import { constObservable, derived, observableValue } from '../../../base/common/observable.js';
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
import { workbenchInstantiationService } from '../../../workbench/test/browser/workbenchTestServices.js';
import { ChatWindowEditorGroupContext } from '../../services/chatWindow/browser/chatWindowService.js';
import { ChatViewSessionActivityBar, registerSessionActivityBarExternalHost, SESSION_ACTIVITY_BAR_COLUMN_WIDTH, SessionActivityBar, SessionActivityBarHostOccupancy } from '../../browser/parts/sessionActivityBar.js';
import { Menus, SessionActivityBarGroup } from '../../browser/menus.js';
import { TogglePanelAction } from '../../../workbench/browser/parts/panel/panelActions.js';
import { AgentWorkbenchLayout, IAgentWorkbenchLayoutService } from '../../browser/workbench.js';
import { SESSION_ACTIVITY_BAR_SETTING } from '../../common/sessionConfig.js';
import { TOGGLE_SIDE_PANEL_COMMAND_ID } from '../../common/sessionCommands.js';
import { sessionActivityBarChatActionContext } from '../../common/contextkeys.js';
import { ISessionActivityBarActivityService, SessionActivityBarActivityService } from '../../services/activity/common/sessionActivityBarActivityService.js';
import { IconBadge, NumberBadge } from '../../../workbench/services/activity/common/activity.js';
import { TestContextViewService } from './testContextViewService.js';
import '../../../base/browser/ui/tree/media/tree.css';
import '../../browser/parts/media/sessionView.css';
import { CHAT_WINDOW_TOGGLE_EDITOR_KEY_COMMAND_ID, ChatWindowIdContext, isChatWindowHandle } from '../../services/chatWindow/browser/chatWindowService.js';

interface ITestEntry {
	readonly id: string;
	readonly title: string;
	readonly icon: ThemeIcon;
	readonly submenu?: readonly { readonly id: string; readonly title: string; readonly checked?: boolean }[];
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

	function createActivityBar(disposables: Pick<DisposableStore, 'add'>, initialEntries: readonly ITestEntry[], contextKeys: Record<string, string> = {}) {
		const testStore = disposables.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, testStore);

		const root = append(mainWindow.document.body, $('.monaco-workbench'));
		testStore.add(toDisposable(() => root.remove()));
		const container = append(root, $('.content'));

		const ran: string[] = [];
		const ranWith: [string, unknown][] = [];
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
			override readonly onWillExecuteCommand = Event.None;
			override readonly onDidExecuteCommand = Event.None;
			override async executeCommand<R>(id: string, ...args: unknown[]): Promise<R | undefined> {
				ran.push(id);
				ranWith.push([id, args[0]]);
				return undefined;
			}
		});
		instantiationService.stub(IAccessibilityService, new class extends mock<IAccessibilityService>() {
			override readonly onDidChangeScreenReaderOptimized = Event.None;
			override readonly onDidChangeReducedMotion = Event.None;
			override isScreenReaderOptimized(): boolean { return false; }
		});

		const createEntryAction = (entry: ITestEntry, options: IMenuActionOptions | undefined) => {
			if (!entry.checked) {
				return instantiationService.createInstance(MenuItemAction, { id: entry.id, title: entry.title, icon: entry.icon }, undefined, options, undefined, undefined);
			}
			// The entry's toggled condition holds, as when the side pane shows its editor.
			const contextKeyService = new class extends mock<IContextKeyService>() {
				override contextMatchesRules(rules: ContextKeyExpression | undefined): boolean { return !!rules?.evaluate({ getValue: () => undefined }); }
			};
			return instantiationService.invokeFunction(accessor => new MenuItemAction({ id: entry.id, title: entry.title, icon: entry.icon, toggled: ContextKeyExpr.true() }, undefined, options, undefined, undefined, contextKeyService, accessor.get(ICommandService)));
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
									createEntryAction({ ...item, icon: entry.icon }, options)))
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

		const contextViewService = new TestContextViewService();
		instantiationService.stub(IContextViewService, contextViewService);

		const contextMenus: string[] = [];
		instantiationService.stub(IContextMenuService, new class extends mock<IContextMenuService>() {
			override readonly onDidShowContextMenu = Event.None;
			override readonly onDidHideContextMenu = Event.None;
			override showContextMenu(delegate: IContextMenuMenuDelegate): void {
				contextMenus.push(delegate.menuId?.id ?? 'none');
			}
		});

		const configurationService = new TestConfigurationService({ [SESSION_ACTIVITY_BAR_SETTING]: true });
		instantiationService.stub(IConfigurationService, configurationService);
		const contextKeyService = testStore.add(instantiationService.createInstance(ContextKeyService));
		for (const [key, value] of Object.entries(contextKeys)) {
			contextKeyService.createKey(key, value);
		}
		instantiationService.stub(IContextKeyService, contextKeyService);

		const activityService = testStore.add(new SessionActivityBarActivityService());
		instantiationService.stub(ISessionActivityBarActivityService, activityService);

		const activityBar = testStore.add(instantiationService.createInstance(SessionActivityBar, container));
		return {
			root,
			activityBar,
			activityService,
			createDocked: (parent: HTMLElement = root) => {
				const host = append(parent, $('.host'));
				host.style.cssText = 'width: 800px; height: 600px;';
				for (const [token, value] of [['spacing-size20', '2px'], ['spacing-size40', '4px'], ['spacing-size120', '12px'], ['spacing-size240', '24px'], ['strokeThickness', '1px']]) {
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
			const badge = item.querySelector<HTMLElement>('.session-activity-bar-badge')!;
			return {
				ariaLabel: item.querySelector('.action-label')!.getAttribute('aria-label'),
				badge: mainWindow.getComputedStyle(badge).display === 'none' ? undefined : badge.classList.contains('count') ? badge.textContent : 'dot',
			};
		});

		const initial = state();
		const dot = activityService.showActivity(changes.id, { badge: new IconBadge(Codicon.circleFilled, () => 'New changes') });
		const withDot = state();
		// Like the workbench activity bar, the badge overlaps the bottom-right corner of the 16px icon centered in the 24px entry.
		for (const [token, value] of [['spacing-size20', '2px'], ['spacing-size80', '8px'], ['spacing-size120', '12px'], ['spacing-size240', '24px'], ['strokeThickness', '1px']]) {
			activityBar.element.style.setProperty(`--vscode-${token}`, value);
		}
		const changesItem = activityBar.element.querySelector<HTMLElement>('.action-item')!;
		const itemBounds = changesItem.getBoundingClientRect();
		const badgeBounds = changesItem.querySelector('.session-activity-bar-badge')!.getBoundingClientRect();
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

	test('docks at the right of the chat area, shows only while active, and drags up and down within the area', () => {
		const { createDocked, root, setEntries } = createActivityBar(store, [changes, browser]);
		const docked = createDocked();
		const element = docked.element!;
		const handle = element.querySelector<HTMLElement>('.session-activity-bar-drag-handle')!;
		const state = () => {
			const style = mainWindow.getComputedStyle(element);
			return { displayed: style.display !== 'none', top: element.style.top, right: style.right };
		};
		let areaHeight = 0;
		const layout = (height: number) => {
			areaHeight = height;
			docked.layout(40, height);
		};
		const bottomGap = () => 40 + areaHeight - Number.parseFloat(element.style.top) - element.offsetHeight;
		const drag = (deltaX: number, deltaY: number) => {
			const pointer = { pointerId: 1, button: 0, buttons: 1, bubbles: true };
			handle.dispatchEvent(new PointerEvent('pointerdown', { ...pointer, clientX: 500, clientY: 100 }));
			// Captured pointer events target the grip; they bubble to the window when capture is unavailable.
			handle.dispatchEvent(new PointerEvent('pointermove', { ...pointer, clientX: 500 + deltaX, clientY: 100 + deltaY }));
			handle.dispatchEvent(new PointerEvent('pointerup', { ...pointer, buttons: 0, clientX: 500 + deltaX, clientY: 100 + deltaY }));
		};

		layout(400);
		const inactive = state().displayed;
		docked.setActive(true);
		const active = state();
		const height = element.offsetHeight;
		drag(-300, 50);
		const dragged = state();
		drag(0, 2000);
		const draggedToBottom = { top: state().top, bottomGap: bottomGap() };
		layout(500);
		const areaGrewAtBottom = bottomGap();
		setEntries([changes, browser, canvas]);
		const entryAddedAtBottom = bottomGap();
		layout(element.offsetHeight + 10);
		const areaTooShort = state().top;
		layout(400);
		drag(0, -2000);
		const draggedPastTop = state().top;
		drag(0, 20);
		layout(600);
		const areaGrewNearTop = state().top;
		handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		const reset = state().top;
		root.classList.add('phone-layout');
		const phoneLayout = state().displayed;
		root.classList.remove('phone-layout');
		docked.setActive(false);
		const deactivated = state().displayed;

		assert.deepStrictEqual({ inactive, active, dragged, draggedToBottom, areaGrewAtBottom, entryAddedAtBottom, areaTooShort, draggedPastTop, areaGrewNearTop, reset, phoneLayout, deactivated }, {
			inactive: false,
			active: { displayed: true, top: '44px', right: '2px' },
			dragged: { displayed: true, top: '94px', right: '2px' },
			draggedToBottom: { top: `${40 + 400 - height - 30}px`, bottomGap: 30 },
			areaGrewAtBottom: 30,
			entryAddedAtBottom: 30,
			areaTooShort: '40px',
			draggedPastTop: '40px',
			areaGrewNearTop: '60px',
			reset: '44px',
			phoneLayout: false,
			deactivated: false,
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
		docked.layout(0, 600);
		docked.setActive(true);

		const bounds = element.getBoundingClientRect();
		const topmost = mainWindow.document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);

		assert.deepStrictEqual(!!topmost && element.contains(topmost), true);
	});

	test('uses a slim shell with minimum-size buttons in a column of its own at the right edge, with an equal 2px gap on either side, the chat to its left', () => {
		const { createDocked } = createActivityBar(store, [changes, browser]);
		const docked = createDocked();
		docked.layout(0, 600);
		docked.setActive(true);
		const element = docked.element!;
		const host = element.parentElement!;
		// As the hosts lay it out: to the left of the column they keep.
		const chat = append(host, $('.chat-view'));
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

	test('shows the strip of the active chat in an active external host, which keeps the column outside every chat, and beside the chat otherwise', () => {
		const { createDocked, setEnabled, root } = createActivityBar(store, [changes]);
		const hostElement = append(root, $('.external-host'));
		const active = observableValue('active', false);
		const occupancy = new SessionActivityBarHostOccupancy();
		store.add(registerSessionActivityBarExternalHost(root, { element: hostElement, active, height: constObservable(500), setOccupied: (occupant, value) => occupancy.set(occupant, value) }));
		const first = createDocked();
		const second = createDocked();
		first.setActive(true);
		second.setActive(false);
		// Occupied while the shown strip is in it, empty while the strip is disabled.
		const where = () => ({
			first: first.element?.parentElement === hostElement ? 'host' : 'chat',
			second: second.element?.parentElement === hostElement ? 'host' : 'chat',
			reserved: [first.reservedWidth.get(), second.reservedWidth.get()],
			occupied: occupancy.occupied.get(),
		});

		const inactiveHost = where();
		active.set(true, undefined);
		const activeHost = where();
		setEnabled(false);
		const disabled = occupancy.occupied.get();
		setEnabled(true);
		// Focus moves to the second chat.
		first.setActive(false);
		second.setActive(true);
		const focusMoved = where();
		active.set(false, undefined);
		const hostGone = where();

		assert.deepStrictEqual({ inactiveHost, activeHost, disabled, focusMoved, hostGone }, {
			inactiveHost: { first: 'chat', second: 'chat', reserved: [SESSION_ACTIVITY_BAR_COLUMN_WIDTH, SESSION_ACTIVITY_BAR_COLUMN_WIDTH], occupied: false },
			activeHost: { first: 'host', second: 'chat', reserved: [0, 0], occupied: true },
			disabled: false,
			focusMoved: { first: 'chat', second: 'host', reserved: [0, 0], occupied: true },
			hostGone: { first: 'chat', second: 'chat', reserved: [SESSION_ACTIVITY_BAR_COLUMN_WIDTH, SESSION_ACTIVITY_BAR_COLUMN_WIDTH], occupied: false },
		});
	});

	test('the strip at the edge of the editor area is as wide as beside the chat, with an equal 2px gap on either side in its column, at either density', () => {
		const { createDocked, root } = createActivityBar(store, [changes]);
		root.classList.add('agent-sessions-workbench');
		// The design tokens the strip's style reads, for both of its hosts.
		for (const [token, value] of [['spacing-size20', '2px'], ['spacing-size120', '12px'], ['spacing-size240', '24px'], ['strokeThickness', '1px']]) {
			root.style.setProperty(`--vscode-${token}`, value);
		}
		// As the editor part hosts it: a column of its own at its right edge, below the tabs, which the editor's content
		// makes room for (`setContentRightInset`), so the content ends where the column starts.
		const editorPart = append(root, $('.part.editor'));
		editorPart.style.cssText = 'position: relative; width: 800px; height: 600px;';
		const hostElement = append(editorPart, $('.session-activity-bar-host.session-activity-bar-editor-host'));
		hostElement.style.setProperty('--session-activity-bar-column-width', `${SESSION_ACTIVITY_BAR_COLUMN_WIDTH}px`);
		hostElement.style.height = '500px';
		const active = observableValue('active', false);
		store.add(registerSessionActivityBarExternalHost(root, { element: hostElement, active, height: constObservable(500), setOccupied: () => { } }));
		const docked = createDocked();
		docked.setActive(true);
		const measure = () => {
			const strip = docked.element!;
			const style = mainWindow.getComputedStyle(strip);
			const entry = strip.querySelector<HTMLElement>('.action-label:not(.separator)')!;
			return {
				width: strip.offsetWidth,
				padding: [style.paddingLeft, style.paddingRight],
				border: [style.borderLeftWidth, style.borderRightWidth],
				entryWidth: entry.offsetWidth,
			};
		};
		const gaps = () => {
			const strip = docked.element!.getBoundingClientRect();
			const column = hostElement.getBoundingClientRect();
			const part = editorPart.getBoundingClientRect();
			return { column: column.width, content: strip.left - column.left, edge: part.right - strip.right };
		};

		const results: Record<string, unknown> = {};
		for (const density of ['default', 'compact']) {
			root.classList.toggle('modern-ui-compact', density === 'compact');
			active.set(false, undefined);
			const besideChat = measure();
			active.set(true, undefined);
			results[density] = { besideChat, atEditorEdge: measure(), gaps: gaps() };
		}

		const strip = { width: 30, padding: ['2px', '2px'], border: ['1px', '1px'], entryWidth: 24 };
		// 2px between the editor's content and the strip, and between the strip and the edge.
		const gapsAtEditorEdge = { column: 34, content: 2, edge: 2 };
		assert.deepStrictEqual(results, {
			default: { besideChat: strip, atEditorEdge: strip, gaps: gapsAtEditorEdge },
			compact: { besideChat: strip, atEditorEdge: strip, gaps: gapsAtEditorEdge },
		});
	});

	test('keeps the external host occupied while any strip is in it, whichever order strips enter and leave in', () => {
		const { createDocked, root } = createActivityBar(store, [changes]);
		const hostElement = append(root, $('.external-host'));
		const occupancy = new SessionActivityBarHostOccupancy();
		store.add(registerSessionActivityBarExternalHost(root, { element: hostElement, active: constObservable(true), height: constObservable(500), setOccupied: (occupant, value) => occupancy.set(occupant, value) }));
		const first = createDocked();
		const second = createDocked();
		const third = createDocked();
		const state = () => ({ occupied: occupancy.occupied.get(), inHost: [first, second, third].map(strip => strip.element?.parentElement === hostElement) });

		first.setActive(true);
		// The next chat is activated before the previous one is deactivated, as when it comes first in the iteration.
		second.setActive(true);
		first.setActive(false);
		const activatedBeforeDeactivated = state();
		third.setActive(true);
		// The previous strip is disposed while the next one is already in the host.
		second.dispose();
		const disposedWhileOtherOccupies = state();
		third.setActive(false);
		const empty = state();

		assert.deepStrictEqual({ activatedBeforeDeactivated, disposedWhileOtherOccupies, empty }, {
			activatedBeforeDeactivated: { occupied: true, inHost: [false, true, false] },
			disposedWhileOtherOccupies: { occupied: true, inHost: [false, false, true] },
			empty: { occupied: false, inHost: [false, false, false] },
		});
	});

	test('shows the strip of an active chat hidden with its part only in an active external host, and finds the host once the chat is attached', async () => {
		const { createDocked, root } = createActivityBar(store, [changes]);
		const hostElement = append(root, $('.external-host'));
		const active = observableValue('active', false);
		store.add(registerSessionActivityBarExternalHost(root, { element: hostElement, active, height: constObservable(500), setOccupied: () => { } }));
		// Created detached, as a chat is while the Sessions Part is hidden and not laid out.
		const detached = mainWindow.document.createElement('div');
		const docked = createDocked(detached);
		const where = () => docked.element?.parentElement === hostElement ? 'host' : docked.element?.classList.contains('inactive') ? 'hidden' : 'chat';

		docked.setActive(true, true);
		const hiddenWithPart = where();
		active.set(true, undefined);
		const hostActiveWhileDetached = where();
		root.appendChild(detached);
		await new Promise(resolve => mainWindow.requestAnimationFrame(resolve));
		const attached = where();
		active.set(false, undefined);
		const hostInactive = where();
		docked.setActive(true, false);
		const partShown = where();

		assert.deepStrictEqual({ hiddenWithPart, hostActiveWhileDetached, attached, hostInactive, partShown }, {
			hiddenWithPart: 'hidden',
			hostActiveWhileDetached: 'hidden',
			attached: 'host',
			hostInactive: 'hidden',
			partShown: 'chat',
		});
	});

	test('reserves room beside the chat whether or not the view is active, unless disabled, in the phone layout, or the strip shows in a host outside the chat', () => {
		const { createDocked, setEnabled, root, layoutMainContainer } = createActivityBar(store, [changes]);
		const hostActive = observableValue('hostActive', false);
		store.add(registerSessionActivityBarExternalHost(root, { element: append(root, $('.external-host')), active: hostActive, height: constObservable(500), setOccupied: () => { } }));
		const docked = createDocked();
		docked.layout(0, 600);
		const reserved = () => docked.reservedWidth.get();

		const inactive = reserved();
		docked.setActive(true);
		const active = reserved();
		// Stacked below the editor, or hidden: the host keeps the column, outside the chat, for both views.
		hostActive.set(true, undefined);
		const hostedOutside = reserved();
		docked.setActive(false);
		const hostedOutsideInactive = reserved();
		hostActive.set(false, undefined);
		const hostInactive = reserved();
		setEnabled(false);
		const disabled = reserved();
		setEnabled(true);
		root.classList.add('phone-layout');
		layoutMainContainer();
		const phoneLayout = reserved();

		assert.deepStrictEqual({ inactive, active, hostedOutside, hostedOutsideInactive, hostInactive, disabled, phoneLayout }, {
			inactive: SESSION_ACTIVITY_BAR_COLUMN_WIDTH,
			active: SESSION_ACTIVITY_BAR_COLUMN_WIDTH,
			hostedOutside: 0,
			hostedOutsideInactive: 0,
			hostInactive: SESSION_ACTIVITY_BAR_COLUMN_WIDTH,
			disabled: 0,
			phoneLayout: 0,
		});
	});

	test('right-clicking an entry or the rest of the strip offers to hide the activity bar', () => {
		const { createDocked, contextMenus } = createActivityBar(store, [changes, browser]);
		const docked = createDocked();
		docked.layout(0, 600);
		docked.setActive(true);
		const element = docked.element!;
		const rightClick = (target: HTMLElement) => {
			const event = new MouseEvent('contextmenu', { button: 2, bubbles: true, cancelable: true });
			target.dispatchEvent(event);
			return event.defaultPrevented;
		};

		assert.deepStrictEqual({
			entry: rightClick(element.querySelector<HTMLElement>('.action-label[aria-label^="Browser"]')!),
			grip: rightClick(element.querySelector<HTMLElement>('.session-activity-bar-drag-handle')!),
			strip: rightClick(element),
			menus: contextMenus,
		}, {
			entry: true,
			grip: true,
			strip: true,
			menus: ['SessionActivityBarContext', 'SessionActivityBarContext', 'SessionActivityBarContext'],
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

	test('an entry acts on the chat window its strip is part of, which it is told by the editor group of that window', async () => {
		const { label, ranWith, contextKeyService } = createActivityBar(store, [browser]);

		ChatWindowEditorGroupContext.bindTo(contextKeyService).set(7);
		label('Browser').click();
		await timeout(0);

		assert.deepStrictEqual(ranWith, [['test.browser', { groupId: 7 }]]);
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

	test('in a chat window, a checked entry hides the editor area of that window, and the entries of the panel\'s group toggle themselves: never the side panel or the panel of the main window', async () => {
		const files: ITestEntry = { id: 'test.files', title: 'Files', icon: Codicon.files, group: SessionActivityBarGroup.SidePanel, checked: true };
		const terminal: ITestEntry = { id: 'test.terminal', title: 'Terminal', icon: Codicon.terminal, group: SessionActivityBarGroup.Panel, checked: true };
		for (const entry of [files, terminal]) {
			store.add(MenuRegistry.appendMenuItem(Menus.SessionActivityBar, { command: { id: entry.id, title: entry.title }, group: entry.group }));
		}
		const { label, ranWith, contextKeyService } = createActivityBar(store, [files, terminal]);
		ChatWindowIdContext.bindTo(contextKeyService).set(7);

		for (const title of ['Files', 'Terminal']) {
			label(title).click();
			await timeout(0);
		}

		assert.deepStrictEqual(ranWith, [[CHAT_WINDOW_TOGGLE_EDITOR_KEY_COMMAND_ID, { chatWindowId: 7 }], ['test.terminal', { chatWindowId: 7 }]]);
	});

	test('an item of a submenu acts on the chat window its strip is part of, as the entries do; in the main window, without a context', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { label, ranWith, contextKeyService } = createActivityBar(store, [canvas]);
		const runKusto = async () => {
			label('Canvas').click();
			key(getActiveElement()!, 13, 'Enter');
			await timeout(0);
		};

		await runKusto();
		ChatWindowIdContext.bindTo(contextKeyService).set(7);
		await runKusto();

		assert.deepStrictEqual(ranWith.map(([id, context]) => [id, isChatWindowHandle(context) ? context : 'no handle']), [['test.canvas.kusto', 'no handle'], ['test.canvas.kusto', { chatWindowId: 7 }]]);
	}));

	test('names the Layout button after the layout mode of its window, keeping its icon, and other submenu entries after their title', () => {
		const layout: ITestEntry = {
			id: Menus.SessionLayout.id, title: 'Layout', icon: Codicon.layout,
			submenu: [{ id: 'test.showChat', title: 'Show Chat', checked: true }, { id: 'test.showEditor', title: 'Show Editor', checked: true }],
		};
		const describe = (entries: ITestEntry[], contextKeys: Record<string, string> = {}) => {
			const { activityBar } = createActivityBar(store, entries, contextKeys);
			const button = activityBar.element.querySelector<HTMLElement>('.action-label[aria-haspopup="menu"]')!;
			return { label: button.getAttribute('aria-label'), icon: button.classList.contains('codicon-layout') };
		};

		assert.deepStrictEqual({
			stacked: describe([layout], { 'sessions.layoutMode': 'stacked' }),
			editorOnly: describe([layout], { 'sessions.layoutMode': 'editorOnly' }),
			noMode: describe([layout]),
			canvas: describe([canvas]),
		}, {
			stacked: { label: 'Layout: Stacked', icon: true },
			editorOnly: { label: 'Layout: Editor Only', icon: true },
			noMode: { label: 'Layout', icon: true },
			canvas: { label: 'Canvas', icon: false },
		});
	});

	test('opens the Canvas submenu to the left on click and keyboard only, keeps it open as the pointer leaves, and runs its items', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { label, ran, contextViewService } = createActivityBar(store, [browser, canvas]);
		const canvasLabel = label('Canvas');
		const state = () => ({ shown: contextViewService.openSubmenu, expanded: canvasLabel.getAttribute('aria-expanded'), highlighted: canvasLabel.classList.contains('submenu-open') });

		canvasLabel.dispatchEvent(new MouseEvent('mouseenter'));
		await timeout(300);
		const afterHover = state();

		canvasLabel.click();
		const afterClick = state();
		const preferredSide = contextViewService.delegate?.anchorAlignment === AnchorAlignment.RIGHT ? 'left' : 'right';
		canvasLabel.dispatchEvent(new MouseEvent('mouseleave'));
		await timeout(400);
		const afterPointerLeave = state();
		canvasLabel.click();
		const afterSecondClick = state();
		canvasLabel.click();

		key(getActiveElement()!, 39, 'ArrowRight');
		const afterRightArrow = { ...state(), anchorFocused: getActiveElement() === canvasLabel };

		key(canvasLabel, 37, 'ArrowLeft');
		const afterLeftArrow = state();

		key(getActiveElement()!, 13, 'Enter');
		await timeout(0);
		const afterRun = { ...state(), ran };

		assert.deepStrictEqual({ afterHover, afterClick, preferredSide, afterPointerLeave, afterSecondClick, afterRightArrow, afterLeftArrow, afterRun }, {
			afterHover: { shown: undefined, expanded: 'false', highlighted: false },
			afterClick: { shown: { items: ['Kusto'], focused: true }, expanded: 'true', highlighted: true },
			preferredSide: 'left',
			afterPointerLeave: { shown: { items: ['Kusto'], focused: true }, expanded: 'true', highlighted: true },
			afterSecondClick: { shown: undefined, expanded: 'false', highlighted: false },
			afterRightArrow: { shown: undefined, expanded: 'false', highlighted: false, anchorFocused: true },
			afterLeftArrow: { shown: { items: ['Kusto'], focused: true }, expanded: 'true', highlighted: true },
			afterRun: { shown: undefined, expanded: 'false', highlighted: false, ran: ['test.canvas.kusto'] },
		});
	}));
});
