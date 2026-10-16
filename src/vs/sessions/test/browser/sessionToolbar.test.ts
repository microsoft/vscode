/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append, getActiveElement, IDimension } from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { timeout } from '../../../base/common/async.js';
import { Codicon } from '../../../base/common/codicons.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { AnchorAlignment } from '../../../base/common/layout.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { mock, upcastPartial } from '../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { IAccessibilityService } from '../../../platform/accessibility/common/accessibility.js';
import { IMenu, IMenuChangeEvent, IMenuService, MenuId, MenuItemAction, SubmenuItemAction } from '../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../platform/commands/common/commands.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextMenuMenuDelegate, IContextMenuService, IContextViewService } from '../../../platform/contextview/browser/contextView.js';
import { workbenchInstantiationService } from '../../../workbench/test/browser/workbenchTestServices.js';
import { ChatViewSessionToolbar, SessionToolbar } from '../../browser/parts/sessionToolbar.js';
import { AgentWorkbenchLayout, IAgentWorkbenchLayoutService } from '../../browser/workbench.js';
import { SESSION_TOOLBAR_SETTING } from '../../common/sessionConfig.js';
import { TestContextViewService } from './testContextViewService.js';
import '../../../base/browser/ui/tree/media/tree.css';
import '../../browser/parts/media/sessionView.css';

interface ITestEntry {
	readonly id: string;
	readonly title: string;
	readonly icon: ThemeIcon;
	readonly submenu?: readonly { readonly id: string; readonly title: string }[];
}

const changes: ITestEntry = { id: 'test.changes', title: 'Changes', icon: Codicon.gitCompare };
const browser: ITestEntry = { id: 'test.browser', title: 'Browser', icon: Codicon.globe };
const canvas: ITestEntry = { id: 'test.canvas', title: 'Canvas', icon: Codicon.preview, submenu: [{ id: 'test.canvas.kusto', title: 'Kusto' }] };

suite('Sessions - Session toolbar', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createToolbar(disposables: Pick<DisposableStore, 'add'>, initialEntries: readonly ITestEntry[]) {
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

		let entries = initialEntries;
		let createdMenu: IMenu | undefined;
		const onDidChangeMenu = testStore.add(new Emitter<IMenuChangeEvent>());
		instantiationService.stub(IMenuService, new class extends mock<IMenuService>() {
			override createMenu(): IMenu {
				const menu: IMenu = {
					onDidChange: onDidChangeMenu.event,
					dispose: () => { },
					getActions: options => [['navigation', entries.map(entry => entry.submenu
						? new SubmenuItemAction({ submenu: MenuId.for(entry.id), title: entry.title, icon: entry.icon }, undefined, entry.submenu.map(item =>
							instantiationService.createInstance(MenuItemAction, { id: item.id, title: item.title }, undefined, options, undefined, undefined)))
						: instantiationService.createInstance(MenuItemAction, { id: entry.id, title: entry.title, icon: entry.icon }, undefined, options, undefined, undefined))]],
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

		const configurationService = new TestConfigurationService({ [SESSION_TOOLBAR_SETTING]: true });
		instantiationService.stub(IConfigurationService, configurationService);

		const toolbar = testStore.add(instantiationService.createInstance(SessionToolbar, container));
		return {
			root,
			toolbar,
			createDocked: () => {
				const host = append(root, $('.host'));
				host.style.cssText = 'width: 800px; height: 600px;';
				for (const [token, value] of [['spacing-size20', '2px'], ['spacing-size40', '4px'], ['spacing-size120', '12px'], ['spacing-size160', '16px'], ['spacing-size280', '28px'], ['strokeThickness', '1px']]) {
					host.style.setProperty(`--vscode-${token}`, value);
				}
				return testStore.add(instantiationService.createInstance(ChatViewSessionToolbar, host));
			},
			setLayout: (layout: AgentWorkbenchLayout) => agentWorkbenchLayout = layout,
			layoutMainContainer: () => onDidLayoutMainContainer.fire({ width: 800, height: 600 }),
			ran,
			contextViewService,
			contextMenus,
			label: (title: string) => toolbar.element.querySelector<HTMLElement>(`.action-label[aria-label^="${title}"]`)!,
			setEntries: (newEntries: readonly ITestEntry[]) => {
				entries = newEntries;
				onDidChangeMenu.fire({ menu: createdMenu!, isStructuralChange: true, isToggleChange: false, isEnablementChange: false });
			},
			setEnabled: (enabled: boolean) => {
				configurationService.setUserConfiguration(SESSION_TOOLBAR_SETTING, enabled);
				configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: (key: string) => key === SESSION_TOOLBAR_SETTING }));
			},
		};
	}

	function key(target: Element, keyCode: number, key: string): void {
		target.dispatchEvent(new KeyboardEvent('keydown', { key, keyCode, bubbles: true, cancelable: true }));
	}

	test('shows icon-only entries while enabled and has entries, outside the phone layout', () => {
		const { root, toolbar, setEntries, setEnabled } = createToolbar(store, [changes, browser, canvas]);
		const displayed = () => mainWindow.getComputedStyle(toolbar.element).display !== 'none';

		const entries = [...toolbar.element.querySelectorAll<HTMLElement>('.action-label')].map(label => ({
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

	test('docks at the right of the chat area, shows only while active, and drags up and down within the area', () => {
		const { createDocked, root, setEntries } = createToolbar(store, [changes, browser]);
		const docked = createDocked();
		const element = docked.element!;
		const handle = element.querySelector<HTMLElement>('.session-toolbar-drag-handle')!;
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
			active: { displayed: true, top: '44px', right: '16px' },
			dragged: { displayed: true, top: '94px', right: '16px' },
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

	test('docked toolbar stays above the chat transcript sticky scroll', () => {
		const { createDocked } = createToolbar(store, [changes, browser]);
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

	test('uses a slim shell with full-size buttons and a compact gap beside padded chat content', () => {
		const { createDocked } = createToolbar(store, [changes, browser]);
		const docked = createDocked();
		docked.layout(0, 600);
		docked.setActive(true);
		const element = docked.element!;
		const host = element.parentElement!;
		// The chat pads its content with the session view's real content padding, which the reservation builds on.
		host.classList.add('session-view');
		host.style.setProperty('--vscode-spacing-size240', '24px');
		const chat = append(host, $('.chat-content'));
		chat.style.cssText = `box-sizing: border-box; width: calc(100% - ${docked.reservedWidth.get()}px); padding: 0 var(--session-view-content-horizontal-padding);`;
		const content = append(chat, $('div'));
		const bounds = element.getBoundingClientRect();
		const button = element.querySelector<HTMLElement>('.action-label')!.getBoundingClientRect();

		assert.deepStrictEqual({
			toolbarWidth: bounds.width,
			buttonSize: [button.width, button.height],
			contentGap: bounds.left - content.getBoundingClientRect().right,
			scrollbarClearance: host.getBoundingClientRect().right - bounds.right,
			column: host.getBoundingClientRect().right - bounds.left,
		}, {
			toolbarWidth: 34,
			buttonSize: [28, 28],
			contentGap: 12,
			scrollbarClearance: 16,
			// The column the host publishes for surfaces that sit beside the strip.
			column: Number.parseFloat(host.style.getPropertyValue('--session-toolbar-column-width')),
		});
	});

	test('docked toolbar is only created in the desktop layout', () => {
		const { createDocked, setLayout } = createToolbar(store, [changes]);
		const desktopToolbar = createDocked();
		const desktop = { created: !!desktopToolbar.element, reservedWidth: desktopToolbar.reservedWidth.get() };
		setLayout(AgentWorkbenchLayout.Mobile);
		const mobileToolbar = createDocked();
		const mobile = { created: !!mobileToolbar.element, reservedWidth: mobileToolbar.reservedWidth.get() };

		assert.deepStrictEqual({ desktop, mobile }, {
			desktop: { created: true, reservedWidth: ChatViewSessionToolbar.RESERVED_WIDTH },
			mobile: { created: false, reservedWidth: 0 },
		});
	});

	test('reserves room beside the chat whether or not the view is active, unless disabled or in the phone layout', () => {
		const { createDocked, setEnabled, root, layoutMainContainer } = createToolbar(store, [changes]);
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
			inactive: ChatViewSessionToolbar.RESERVED_WIDTH,
			active: ChatViewSessionToolbar.RESERVED_WIDTH,
			disabled: 0,
			phoneLayout: 0,
		});
	});

	test('right-clicking an entry or the rest of the strip offers to hide the toolbar', () => {
		const { createDocked, contextMenus } = createToolbar(store, [changes, browser]);
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
			grip: rightClick(element.querySelector<HTMLElement>('.session-toolbar-drag-handle')!),
			strip: rightClick(element),
			menus: contextMenus,
		}, {
			entry: true,
			grip: true,
			strip: true,
			menus: ['SessionToolbarContext', 'SessionToolbarContext', 'SessionToolbarContext'],
		});
	});

	test('runs an entry when clicked', async () => {
		const { label, ran } = createToolbar(store, [changes, browser]);

		label('Browser').click();
		await timeout(0);

		assert.deepStrictEqual(ran, ['test.browser']);
	});

	test('opens the Canvas submenu to the left on hover, click, and keyboard, and runs its items', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { label, ran, contextViewService } = createToolbar(store, [browser, canvas]);
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
