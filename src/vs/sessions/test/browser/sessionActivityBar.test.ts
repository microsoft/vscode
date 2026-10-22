/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { $, append, getActiveElement, IDimension } from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { retry, timeout } from '../../../base/common/async.js';
import { Codicon } from '../../../base/common/codicons.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
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
import { IConfigurationChangeEvent, IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextMenuMenuDelegate, IContextMenuService, IContextViewService } from '../../../platform/contextview/browser/contextView.js';
import { workbenchInstantiationService } from '../../../workbench/test/browser/workbenchTestServices.js';
import { ChatViewSessionActivityBar, SessionActivityBar } from '../../browser/parts/sessionActivityBar.js';
import { Menus, SessionActivityBarGroup } from '../../browser/menus.js';
import { TogglePanelAction } from '../../../workbench/browser/parts/panel/panelActions.js';
import { AgentWorkbenchLayout, IAgentWorkbenchLayoutService } from '../../browser/workbench.js';
import { SESSION_ACTIVITY_BAR_SETTING } from '../../common/sessionConfig.js';
import { TOGGLE_SIDE_PANEL_COMMAND_ID } from '../../common/sessionCommands.js';
import { ISessionActivityBarActivityService, SessionActivityBarActivityService } from '../../services/activity/common/sessionActivityBarActivityService.js';
import { IconBadge, NumberBadge } from '../../../workbench/services/activity/common/activity.js';
import { TestContextViewService } from './testContextViewService.js';
import '../../../base/browser/ui/tree/media/tree.css';
import '../../browser/parts/media/sessionView.css';

interface ITestEntry {
	readonly id: string;
	readonly title: string;
	readonly icon: ThemeIcon;
	readonly submenu?: readonly { readonly id: string; readonly title: string }[];
	/** The menu group, `navigation` by default. */
	readonly group?: string;
	/** Whether the entry is checked, as when the side pane shows its editor. */
	readonly checked?: boolean;
}

const changes: ITestEntry = { id: 'test.changes', title: 'Changes', icon: Codicon.gitCompare };
const browser: ITestEntry = { id: 'test.browser', title: 'Browser', icon: Codicon.globe };
const canvas: ITestEntry = { id: 'test.canvas', title: 'Canvas', icon: Codicon.preview, submenu: [{ id: 'test.canvas.kusto', title: 'Kusto' }] };

suite('Sessions - Session Activity Bar', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());

	function nextFrame(): Promise<void> {
		return new Promise(resolve => mainWindow.requestAnimationFrame(() => resolve()));
	}

	function createActivityBar(disposables: Pick<DisposableStore, 'add'>, initialEntries: readonly ITestEntry[]) {
		const testStore = disposables.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, testStore);

		const root = append(mainWindow.document.body, $('.monaco-workbench'));
		testStore.add(toDisposable(() => root.remove()));
		const container = append(root, $('.content'));

		const ran: string[] = [];
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
			override readonly onWillExecuteCommand = Event.None;
			override readonly onDidExecuteCommand = Event.None;
			override async executeCommand<R>(id: string): Promise<R | undefined> {
				ran.push(id);
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
			override createMenu(): IMenu {
				const menu: IMenu = {
					onDidChange: onDidChangeMenu.event,
					dispose: () => { },
					getActions: options => {
						const groups = new Map<string, (MenuItemAction | SubmenuItemAction)[]>();
						for (const entry of entries) {
							const group = entry.group ?? 'navigation';
							groups.set(group, [...groups.get(group) ?? [], entry.submenu
								? new SubmenuItemAction({ submenu: MenuId.for(entry.id), title: entry.title, icon: entry.icon }, undefined, entry.submenu.map(item =>
									instantiationService.createInstance(MenuItemAction, { id: item.id, title: item.title }, undefined, options, undefined, undefined)))
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

		const activityService = testStore.add(new SessionActivityBarActivityService());
		instantiationService.stub(ISessionActivityBarActivityService, activityService);

		const activityBar = testStore.add(instantiationService.createInstance(SessionActivityBar, container));
		return {
			root,
			activityBar,
			activityService,
			createDocked: () => {
				const host = append(root, $('.host'));
				host.style.cssText = 'width: 800px; height: 600px;';
				for (const [token, value] of [['spacing-size20', '2px'], ['spacing-size40', '4px'], ['spacing-size120', '12px'], ['spacing-size240', '24px'], ['strokeThickness', '1px']]) {
					host.style.setProperty(`--vscode-${token}`, value);
				}
				return testStore.add(instantiationService.createInstance(ChatViewSessionActivityBar, host));
			},
			setLayout: (layout: AgentWorkbenchLayout) => agentWorkbenchLayout = layout,
			layoutMainContainer: () => onDidLayoutMainContainer.fire({ width: 800, height: 600 }),
			ran,
			contextViewService,
			contextMenus,
			label: (title: string) => activityBar.element.querySelector<HTMLElement>(`.action-label[aria-label^="${title}"]`)!,
			setEntries: (newEntries: readonly ITestEntry[]) => {
				entries = newEntries;
				onDidChangeMenu.fire({ menu: createdMenu!, isStructuralChange: true, isToggleChange: false, isEnablementChange: false });
			},
			setEnabled: (enabled: boolean) => {
				configurationService.setUserConfiguration(SESSION_ACTIVITY_BAR_SETTING, enabled);
				configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: (key: string) => key === SESSION_ACTIVITY_BAR_SETTING }));
			},
		};
	}

	function key(target: Element, keyCode: number, key: string): void {
		target.dispatchEvent(new KeyboardEvent('keydown', { key, keyCode, bubbles: true, cancelable: true }));
	}

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
			active: { displayed: true, top: '44px', right: '12px' },
			dragged: { displayed: true, top: '94px', right: '12px' },
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

	test('moves the scroll arrow above an overlapping strip and restores it when the gutter clears', async () => {
		const { createDocked, setEnabled } = createActivityBar(store, [changes, browser, canvas]);
		const docked = createDocked();
		const element = docked.element!;
		const host = element.parentElement!;
		const session = append(host, $('.interactive-session'));
		const list = append(session, $('.interactive-list'));
		list.style.cssText = 'position: relative; width: 800px; height: 530px;';
		const button = append(list, $('.chat-scroll-down'));
		button.style.cssText = 'display: flex; position: absolute; right: 15px; bottom: 8px; width: 24px; height: 24px;';
		docked.setScrollDownButton(button);
		docked.layout(0, 600);
		docked.setActive(true);
		await nextFrame();
		const initial = button.style.translate;

		const handle = element.querySelector<HTMLElement>('.session-activity-bar-drag-handle')!;
		const pointer = { pointerId: 1, button: 0, buttons: 1, bubbles: true, clientX: 500 };
		handle.dispatchEvent(new PointerEvent('pointerdown', { ...pointer, clientY: 0 }));
		handle.dispatchEvent(new PointerEvent('pointermove', { ...pointer, clientY: 2000 }));
		handle.dispatchEvent(new PointerEvent('pointerup', { ...pointer, buttons: 0, clientY: 2000 }));
		await nextFrame();
		const movedGap = element.getBoundingClientRect().top - button.getBoundingClientRect().bottom;

		list.style.height = '350px';
		await retry(async () => assert.strictEqual(button.style.translate, ''), 10, 100);
		const resized = button.style.translate;
		list.style.height = '530px';
		await retry(async () => assert.notStrictEqual(button.style.translate, ''), 10, 100);
		setEnabled(false);
		await nextFrame();
		const disabled = button.style.translate;
		setEnabled(true);
		await nextFrame();
		const restoredGap = element.getBoundingClientRect().top - button.getBoundingClientRect().bottom;
		docked.setActive(false);
		await nextFrame();
		const inactive = button.style.translate;
		docked.setActive(true);
		docked.setScrollDownButton(undefined);
		const detached = button.style.translate;

		const hasExpectedGap = (gap: number) => Math.abs(gap - ChatViewSessionActivityBar.SCROLL_DOWN_BUTTON_GAP) <= 1;
		assert.deepStrictEqual({ initial, movedGap: hasExpectedGap(movedGap), resized, disabled, restoredGap: hasExpectedGap(restoredGap), inactive, detached }, {
			initial: '',
			movedGap: true,
			resized: '',
			disabled: '',
			restoredGap: true,
			inactive: '',
			detached: '',
		});
	});

	test('skips scroll arrow measurements while hidden, inactive, or detached', async () => {
		const { createDocked, setEnabled, setEntries } = createActivityBar(store, [changes, browser, canvas]);
		const docked = createDocked();
		const element = docked.element!;
		const session = append(element.parentElement!, $('.interactive-session'));
		const list = append(session, $('.interactive-list'));
		list.style.cssText = 'position: relative; width: 800px; height: 80px;';
		const button = append(list, $('.chat-scroll-down'));
		button.style.cssText = 'display: flex; position: absolute; right: 15px; bottom: 8px; width: 24px; height: 24px;';
		docked.setScrollDownButton(button);
		docked.layout(0, 600);
		docked.setActive(true);
		await nextFrame();
		const translated = button.style.translate !== '';

		const measurements = [
			sinon.spy(button, 'getBoundingClientRect'),
			sinon.spy(list, 'getBoundingClientRect'),
			sinon.spy(element, 'getBoundingClientRect'),
		];
		const measurementCount = () => measurements.reduce((count, spy) => count + spy.callCount, 0);
		docked.setActive(false);
		await nextFrame();
		const inactive = { measurements: measurementCount(), translate: button.style.translate };
		docked.setActive(true);
		await nextFrame();
		measurements.forEach(spy => spy.resetHistory());
		setEnabled(false);
		setEntries([changes, browser]);
		await nextFrame();
		const disabled = { measurements: measurementCount(), translate: button.style.translate };
		setEnabled(true);
		await nextFrame();
		measurements.forEach(spy => spy.resetHistory());
		button.style.display = 'none';
		docked.layout(0, 600);
		await nextFrame();
		const hidden = { measurements: measurementCount(), translate: button.style.translate };
		button.style.display = 'flex';
		session.remove();
		docked.layout(0, 600);
		await nextFrame();
		const detached = { measurements: measurementCount(), translate: button.style.translate };

		assert.deepStrictEqual({ translated, inactive, disabled, hidden, detached }, {
			translated: true,
			inactive: { measurements: 0, translate: '' },
			disabled: { measurements: 0, translate: '' },
			hidden: { measurements: 0, translate: '' },
			detached: { measurements: 0, translate: '' },
		});
	});

	test('coalesces scroll arrow attachment, layout, drag, and observer updates and cancels them on detachment', async () => {
		const { createDocked } = createActivityBar(store, [changes, browser]);
		const docked = createDocked();
		const session = append(docked.element!.parentElement!, $('.interactive-session'));
		const list = append(session, $('.interactive-list'));
		list.style.cssText = 'position: relative; width: 800px; height: 530px;';
		const button = append(list, $('.chat-scroll-down'));
		button.style.cssText = 'display: flex; position: absolute; right: 15px; bottom: 8px; width: 24px; height: 24px;';
		const measurements = sinon.spy(button, 'getBoundingClientRect');
		docked.setScrollDownButton(button);
		docked.layout(0, 600);
		docked.setActive(true);
		docked.layout(0, 610);
		const handle = docked.element!.querySelector<HTMLElement>('.session-activity-bar-drag-handle')!;
		const pointer = { pointerId: 1, button: 0, buttons: 1, bubbles: true, clientX: 500 };
		handle.dispatchEvent(new PointerEvent('pointerdown', { ...pointer, clientY: 0 }));
		handle.dispatchEvent(new PointerEvent('pointermove', { ...pointer, clientY: 40 }));
		handle.dispatchEvent(new PointerEvent('pointermove', { ...pointer, clientY: 80 }));
		handle.dispatchEvent(new PointerEvent('pointerup', { ...pointer, buttons: 0, clientY: 80 }));
		const beforeLayoutFrame = measurements.callCount;
		await nextFrame();
		const afterLayoutFrame = measurements.callCount;
		await nextFrame();
		await nextFrame();
		measurements.resetHistory();

		session.style.setProperty('--vscode-chat-persistent-content-height', '10px');
		await Promise.resolve();
		docked.layout(0, 620);
		session.style.setProperty('--vscode-chat-persistent-content-height', '20px');
		await Promise.resolve();
		const beforeFrame = measurements.callCount;
		await nextFrame();
		const afterFrame = measurements.callCount;
		session.style.setProperty('--vscode-chat-persistent-content-height', '30px');
		await Promise.resolve();
		docked.layout(0, 630);
		docked.setScrollDownButton(undefined);
		await nextFrame();

		assert.deepStrictEqual({ beforeLayoutFrame, afterLayoutFrame, beforeFrame, afterFrame, afterDetachment: measurements.callCount }, {
			beforeLayoutFrame: 0,
			afterLayoutFrame: 1,
			beforeFrame: 0,
			afterFrame: 1,
			afterDetachment: 1,
		});
	});

	for (const { height, bottom, placement } of [
		{ height: 240, bottom: 80, placement: 'below' },
		{ height: 180, bottom: 8, placement: 'beside' },
		{ height: 28, bottom: 8, placement: 'beside' },
	]) {
		test(`keeps the scroll arrow visible ${placement} the strip in a ${height}px transcript`, async () => {
			const entries = Array.from({ length: 6 }, (_, index) => ({ id: `test.entry${index}`, title: `Entry ${index}`, icon: Codicon.globe }));
			const { createDocked } = createActivityBar(store, entries);
			const docked = createDocked();
			const element = docked.element!;
			const host = element.parentElement!;
			host.style.cssText += 'position: fixed; top: 0; left: 0;';
			const session = append(host, $('.interactive-session'));
			const list = append(session, $('.interactive-list'));
			list.style.cssText = `position: relative; width: 800px; height: ${height}px; flex: none; overflow: hidden;`;
			const button = append(list, $('button.chat-scroll-down'));
			button.style.cssText = `display: flex; position: absolute; right: 15px; bottom: ${bottom}px; width: 24px; height: 24px; box-sizing: border-box;`;
			docked.setScrollDownButton(button);
			docked.layout(0, 600);
			docked.setActive(true);
			await nextFrame();

			const bounds = button.getBoundingClientRect();
			const viewport = list.getBoundingClientRect();
			const barBounds = element.getBoundingClientRect();
			const target = mainWindow.document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
			assert.deepStrictEqual({
				insideViewport: bounds.top >= viewport.top && bounds.bottom <= viewport.bottom && bounds.left >= viewport.left && bounds.right <= viewport.right,
				clearOfStrip: placement === 'below'
					? bounds.top >= barBounds.bottom + ChatViewSessionActivityBar.SCROLL_DOWN_BUTTON_GAP - 1
					: bounds.right <= barBounds.left - ChatViewSessionActivityBar.SCROLL_DOWN_BUTTON_GAP + 1,
				receivesPointer: target === button,
			}, { insideViewport: true, clearOfStrip: true, receivesPointer: true });

			button.style.bottom = '8px';
			list.style.height = '530px';
			await retry(async () => assert.strictEqual(button.style.translate, ''), 10, 100);
		});
	}

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

	test('uses a slim shell with minimum-size buttons, keeping padded chat content evenly spaced and clear of it', () => {
		const { createDocked } = createActivityBar(store, [changes, browser]);
		const docked = createDocked();
		docked.layout(0, 600);
		docked.setActive(true);
		const element = docked.element!;
		const host = element.parentElement!;
		// The chat pads its content with the session view's real content padding, which the reservation builds on.
		host.classList.add('session-view');
		// The chat insets its content by the reserved width on each side, inside its own content padding.
		const chat = append(host, $('.chat-content'));
		chat.style.cssText = `box-sizing: border-box; margin: 0 ${docked.reservedWidth.get()}px; padding: 0 var(--session-view-content-horizontal-padding);`;
		const content = append(chat, $('div'));
		const bounds = element.getBoundingClientRect();
		const button = element.querySelector<HTMLElement>('.action-label')!.getBoundingClientRect();
		const hostBounds = host.getBoundingClientRect();
		const contentBounds = content.getBoundingClientRect();

		assert.deepStrictEqual({
			activityBarWidth: bounds.width,
			buttonSize: [button.width, button.height],
			contentGap: bounds.left - contentBounds.right,
			scrollbarClearance: hostBounds.right - bounds.right,
			column: hostBounds.right - bounds.left,
			// Space between the content and each edge of the chat, the activity bar's side included.
			sideSpace: [contentBounds.left - hostBounds.left, hostBounds.right - contentBounds.right],
		}, {
			activityBarWidth: 30,
			buttonSize: [24, 24],
			contentGap: 12,
			scrollbarClearance: 12,
			// The column the host publishes for surfaces that sit beside the strip.
			column: Number.parseFloat(host.style.getPropertyValue('--session-activity-bar-column-width')),
			sideSpace: [54, 54],
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
			desktop: { created: true, reservedWidth: ChatViewSessionActivityBar.RESERVED_WIDTH },
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
			inactive: ChatViewSessionActivityBar.RESERVED_WIDTH,
			active: ChatViewSessionActivityBar.RESERVED_WIDTH,
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
});
