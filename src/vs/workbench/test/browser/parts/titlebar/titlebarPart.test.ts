/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CodeWindow, mainWindow } from '../../../../../base/browser/window.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IMenu, IMenuService } from '../../../../../platform/actions/common/actions.js';
import { IActionViewItemFactory, IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { ActionViewItem } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { TestColorTheme, TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { IUpdateService, StateType } from '../../../../../platform/update/common/update.js';
import { isMacintosh, isWeb } from '../../../../../base/common/platform.js';
import { getMenuBarVisibility, hasNativeMenu } from '../../../../../platform/window/common/window.js';
import { CustomMenubarControl } from '../../../../browser/parts/titlebar/menubarControl.js';
import { BrowserTitlebarPart } from '../../../../browser/parts/titlebar/titlebarPart.js';
import { WindowTitle } from '../../../../browser/parts/titlebar/windowTitle.js';
import { IEditorPartOptions } from '../../../../common/editor.js';
import { MODERN_UI_INACTIVE_SHELL_BACKGROUND, MODERN_UI_SHELL_BACKGROUND, TITLE_BAR_ACTIVE_BACKGROUND, TITLE_BAR_INACTIVE_BACKGROUND } from '../../../../common/theme.js';
import { IActivityService } from '../../../../services/activity/common/activity.js';
import { ACCOUNTS_ACTIVITY_ID, GLOBAL_ACTIVITY_ID } from '../../../../common/activity.js';
import { IEditorGroupsContainer } from '../../../../services/editor/common/editorGroupsService.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { ActivityBarPosition, EditorActionsLocation, EditorTabsMode, isCompactMenuInTitlebar, IWorkbenchLayoutService, Parts } from '../../../../services/layout/browser/layoutService.js';
import { TestContextMenuService, TestHostService, TestLayoutService, TestMenuService, workbenchInstantiationService } from '../../workbenchTestServices.js';
import { TestActivityService } from '../../../common/workbenchTestServices.js';

function stubMenubarServices(instantiationService: TestInstantiationService): void {
	// The custom menu bar expects the main menu to have at least one (possibly empty) group.
	instantiationService.stub(IMenuService, new class extends TestMenuService {
		override createMenu(): IMenu {
			return { onDidChange: Event.None, dispose: () => undefined, getActions: () => [['', []]] };
		}
	}());
	instantiationService.stub(IUpdateService, new class extends mock<IUpdateService>() {
		override readonly onStateChange = Event.None;
		override get state() { return { type: StateType.Uninitialized as const }; }
	}());
}

// On web, the first CustomMenubarControl lazily registers a global focus action that is never
// unregistered. Create one before the suite snapshots the registries so it is not reported as a leak.
{
	const disposables = new DisposableStore();
	const instantiationService = workbenchInstantiationService(undefined, disposables);
	stubMenubarServices(instantiationService);
	disposables.add(instantiationService.createInstance(CustomMenubarControl));
	disposables.dispose();
}

suite('TitlebarPart colors', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	class TestTitlebarPart extends BrowserTitlebarPart {
		protected override createContentArea(parent: HTMLElement): HTMLElement {
			this.element = parent;
			return parent;
		}

		installTestMenubar(leftContent: HTMLElement): void {
			Reflect.set(this, 'leftContent', leftContent);
			this.installMenubar();
		}
	}

	test('resolves shell and title colors from the target window focus', () => {
		let focused = false;
		const targetWindow = new class extends mock<CodeWindow>() {
			override vscodeWindowId = mainWindow.vscodeWindowId;
			override document = new class extends mock<Document>() {
				override hasFocus(): boolean { return focused; }
			}();
		}();
		const activeWindowEmitter = store.add(new Emitter<number>());
		const hostService = new class extends TestHostService {
			override readonly onDidChangeActiveWindow = activeWindowEmitter.event;
		}();
		const themeService = new TestThemeService(new TestColorTheme({
			[TITLE_BAR_ACTIVE_BACKGROUND]: '#112233',
			[TITLE_BAR_INACTIVE_BACKGROUND]: '#223344',
			[MODERN_UI_SHELL_BACKGROUND]: '#334455',
			[MODERN_UI_INACTIVE_SHELL_BACKGROUND]: '#445566',
		}));
		const root = document.createElement('div');
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IHostService, hostService);
		instantiationService.stub(IThemeService, themeService);
		instantiationService.stub(IContextMenuService, new TestContextMenuService());
		instantiationService.stub(IWorkbenchLayoutService, new class extends TestLayoutService {
			override getContainer(): HTMLElement { return root; }
		}());
		instantiationService.stub(IUpdateService, new class extends mock<IUpdateService>() {
			override readonly onStateChange = Event.None;
			override get state() { return { type: StateType.Uninitialized as const }; }
		}());
		instantiationService.stub(IActivityService, new TestActivityService());
		instantiationService.stubInstance(WindowTitle, { dispose() { } });
		const groups = new class extends mock<IEditorGroupsContainer>() {
			override onDidChangeEditorPartOptions = Event.None;
		}();
		const part = store.add(instantiationService.createInstance(TestTitlebarPart, Parts.TITLEBAR_PART, targetWindow, groups));
		const container = document.createElement('div');
		part.create(container);
		const colors = () => ({
			title: container.style.backgroundColor,
			shell: root.style.getPropertyValue('--modern-ui-shell-background'),
		});
		const initiallyInactive = colors();
		focused = true;
		activeWindowEmitter.fire(targetWindow.vscodeWindowId);
		const active = colors();
		focused = false;
		activeWindowEmitter.fire(targetWindow.vscodeWindowId + 1);
		hostService.setFocus(false);
		hostService.setFocus(true);
		const anotherWindowActive = colors();

		themeService.setTheme(new TestColorTheme({
			[TITLE_BAR_ACTIVE_BACKGROUND]: '#112233',
			[MODERN_UI_SHELL_BACKGROUND]: '#334455',
		}));
		const missingInactiveColors = colors();

		assert.deepStrictEqual({ initiallyInactive, active, anotherWindowActive, missingInactiveColors }, {
			initiallyInactive: { title: 'rgb(34, 51, 68)', shell: '#445566' },
			active: { title: 'rgb(17, 34, 51)', shell: '#334455' },
			anotherWindowActive: { title: 'rgb(34, 51, 68)', shell: '#445566' },
			missingInactiveColors: { title: 'rgb(17, 34, 51)', shell: '#334455' },
		});
	});

	test('uses title bar foreground colors for action toolbar icons', () => {
		const workbench = document.createElement('div');
		workbench.className = 'monaco-workbench';
		workbench.style.color = '#abcdef';
		workbench.style.setProperty('--vscode-titleBar-activeForeground', '#112233');
		workbench.style.setProperty('--vscode-titleBar-inactiveForeground', '#445566');

		const titlebar = document.createElement('div');
		titlebar.className = 'part titlebar';
		const titlebarContainer = document.createElement('div');
		titlebarContainer.className = 'titlebar-container';
		const titlebarRight = document.createElement('div');
		titlebarRight.className = 'titlebar-right';
		const actionToolbar = document.createElement('div');
		actionToolbar.className = 'action-toolbar-container';
		const icon = document.createElement('span');
		icon.className = 'codicon';
		actionToolbar.appendChild(icon);
		titlebarRight.appendChild(actionToolbar);
		titlebarContainer.appendChild(titlebarRight);
		titlebar.appendChild(titlebarContainer);
		workbench.appendChild(titlebar);
		document.body.appendChild(workbench);

		store.add(toDisposable(() => workbench.remove()));
		const active = mainWindow.getComputedStyle(icon).color;
		titlebar.classList.add('inactive');
		const inactive = mainWindow.getComputedStyle(icon).color;

		assert.deepStrictEqual({ active, inactive }, {
			active: 'rgb(17, 34, 51)',
			inactive: 'rgb(68, 85, 102)',
		});
	});

	test('updates inactive title bar opacity from menubar focus state', () => {
		const workbench = mainWindow.document.createElement('div');
		workbench.className = 'monaco-workbench';
		const titlebar = mainWindow.document.createElement('div');
		titlebar.className = 'part titlebar';
		const titlebarContainer = mainWindow.document.createElement('div');
		titlebarContainer.className = 'titlebar-container';
		titlebar.appendChild(titlebarContainer);
		workbench.appendChild(titlebar);
		mainWindow.document.body.appendChild(workbench);

		const focusStateEmitter = store.add(new Emitter<boolean>());
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IContextMenuService, new TestContextMenuService());
		instantiationService.stub(IWorkbenchLayoutService, new class extends TestLayoutService {
			override getContainer(): HTMLElement { return workbench; }
		}());
		instantiationService.stubInstance(WindowTitle, { dispose() { } });
		instantiationService.stubInstance(CustomMenubarControl, {
			onVisibilityChange: Event.None,
			onFocusStateChange: focusStateEmitter.event,
			create(parent) { return parent; },
			dispose() { },
		});

		const groups = new class extends mock<IEditorGroupsContainer>() {
			override onDidChangeEditorPartOptions = Event.None;
		}();
		const part = store.add(instantiationService.createInstance(TestTitlebarPart, Parts.TITLEBAR_PART, mainWindow, groups));

		store.add(toDisposable(() => workbench.remove()));
		part.create(titlebar);
		titlebar.classList.add('inactive');
		part.installTestMenubar(titlebarContainer);

		const state = () => ({
			focused: titlebar.classList.contains('menubar-focused'),
			opacity: mainWindow.getComputedStyle(titlebarContainer).opacity,
		});
		const initial = state();
		focusStateEmitter.fire(true);
		const focused = state();
		focusStateEmitter.fire(false);
		const blurred = state();
		focusStateEmitter.fire(true);
		const refocused = state();

		const uninstallMenubar = Reflect.get(BrowserTitlebarPart.prototype, 'uninstallMenubar') as (this: BrowserTitlebarPart) => void;
		uninstallMenubar.call(part);
		const uninstalled = state();
		focusStateEmitter.fire(true);
		const afterUninstallEvent = state();

		assert.deepStrictEqual({ initial, focused, blurred, refocused, uninstalled, afterUninstallEvent }, {
			initial: { focused: false, opacity: '0.6' },
			focused: { focused: true, opacity: '1' },
			blurred: { focused: false, opacity: '0.6' },
			refocused: { focused: true, opacity: '1' },
			uninstalled: { focused: false, opacity: '0.6' },
			afterUninstallEvent: { focused: false, opacity: '0.6' },
		});
	});
});

suite('Workbench - Titlebar Part', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const updateTitleBarToolBarOverflow = Reflect.get(BrowserTitlebarPart.prototype, 'updateTitleBarToolBarOverflow') as (this: BrowserTitlebarPart) => void;

	test('hides optional toolbar groups in priority order', () => {
		let rootClientWidth = 130;
		const centerAdjacentToolBar = mainWindow.document.createElement('div');
		const updateToolBar = mainWindow.document.createElement('div');
		const root = createMeasuredElement(
			() => rootClientWidth,
			() => 100 + visibleWidth(centerAdjacentToolBar, 30) + visibleWidth(updateToolBar, 30)
		);
		const titlebarPart = Object.create(BrowserTitlebarPart.prototype) as BrowserTitlebarPart;
		Reflect.set(titlebarPart, 'rootContainer', root);
		Reflect.set(titlebarPart, 'centerAdjacentToolBarElement', centerAdjacentToolBar);
		Reflect.set(titlebarPart, 'updateToolBarElement', updateToolBar);

		updateTitleBarToolBarOverflow.call(titlebarPart);
		const centerHiddenFirst = [centerAdjacentToolBar, updateToolBar].map(element => element.classList.contains('overflowing'));

		rootClientWidth = 100;
		updateTitleBarToolBarOverflow.call(titlebarPart);
		const bothHidden = [centerAdjacentToolBar, updateToolBar].map(element => element.classList.contains('overflowing'));

		rootClientWidth = 160;
		updateTitleBarToolBarOverflow.call(titlebarPart);
		const bothVisible = [centerAdjacentToolBar, updateToolBar].map(element => element.classList.contains('overflowing'));

		assert.deepStrictEqual({ centerHiddenFirst, bothHidden, bothVisible }, {
			centerHiddenFirst: [true, false],
			bothHidden: [true, true],
			bothVisible: [false, false],
		});
	});

	test('compact menu is owned by the titlebar only when the activity bar is at the top', () => {
		const config = (menuBarVisibility: string, location: string) => new TestConfigurationService({
			window: { menuBarVisibility },
			workbench: { activityBar: { location } }
		});
		const owner = (menuBarVisibility: string, location: string) => isCompactMenuInTitlebar(config(menuBarVisibility, location));
		// Native macOS (and native menus) force the classic menu bar, in which case nothing is compact.
		const compactSupported = getMenuBarVisibility(config('compact', ActivityBarPosition.TOP)) === 'compact';

		assert.deepStrictEqual({
			compactTop: owner('compact', ActivityBarPosition.TOP),
			compactDefault: owner('compact', ActivityBarPosition.DEFAULT),
			compactBottom: owner('compact', ActivityBarPosition.BOTTOM),
			classicTop: owner('classic', ActivityBarPosition.TOP),
		}, {
			compactTop: compactSupported,
			compactDefault: false,
			compactBottom: false,
			classicTop: false,
		});
	});

	function createTitlebar(configurationService: TestConfigurationService, partCtor: typeof BrowserTitlebarPart = BrowserTitlebarPart) {
		const root = document.createElement('div');
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IHostService, new TestHostService());
		instantiationService.stub(IContextMenuService, new TestContextMenuService());
		instantiationService.stub(IWorkbenchLayoutService, new class extends TestLayoutService {
			override getContainer(): HTMLElement { return root; }
		}());
		stubMenubarServices(instantiationService);
		instantiationService.stub(IActivityService, new TestActivityService());
		// Render the activity actions as plain items: their real view items need account services.
		instantiationService.stub(IActionViewItemService, new class extends mock<IActionViewItemService>() {
			override readonly onDidChange = Event.None;
			override lookUp(_menu: unknown, id: unknown): IActionViewItemFactory | undefined {
				return id === ACCOUNTS_ACTIVITY_ID || id === GLOBAL_ACTIVITY_ID ? (action, options) => new ActionViewItem(undefined, action, options) : undefined;
			}
		}());
		instantiationService.stubInstance(WindowTitle, { dispose() { } });
		const groups = new class extends mock<IEditorGroupsContainer>() {
			override onDidChangeEditorPartOptions = Event.None;
			override partOptions = { editorActionsLocation: EditorActionsLocation.DEFAULT, showTabs: EditorTabsMode.MULTIPLE } as IEditorPartOptions;
		}();
		const part = instantiationService.createInstance(partCtor, Parts.TITLEBAR_PART, mainWindow, groups);
		const container = document.createElement('div');
		part.create(container);
		return { part, container };
	}

	function setConfiguration(configurationService: TestConfigurationService, menuBarVisibility: string, location: string): void {
		configurationService.setUserConfiguration('window.menuBarVisibility', menuBarVisibility);
		configurationService.setUserConfiguration('workbench.activityBar.location', location);
		const keys = ['window.menuBarVisibility', 'workbench.activityBar.location'];
		configurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: (key: string) => keys.includes(key) } as IConfigurationChangeEvent);
	}

	function menubarState(container: HTMLElement) {
		const menubars = container.querySelectorAll('.menubar');
		return { count: menubars.length, compact: menubars.length === 1 && menubars[0].classList.contains('compact') };
	}

	test('installs, recreates and removes the menu bar as compact ownership changes', () => {
		const configurationService = new TestConfigurationService({
			window: { menuBarVisibility: 'classic' },
			workbench: { activityBar: { location: ActivityBarPosition.DEFAULT } }
		});
		const compactSupported = getMenuBarVisibility(new TestConfigurationService({ window: { menuBarVisibility: 'compact' } })) === 'compact';
		// Mirrors the production install guard: native menus (e.g. native macOS) never get a custom menu bar.
		const customSupported = !hasNativeMenu(new TestConfigurationService({ window: { menuBarVisibility: 'classic' } })) && (!isMacintosh || isWeb);
		const { part, container } = createTitlebar(configurationService);

		const states: Record<string, { count: number; compact: boolean }> = { classic: menubarState(container) };
		setConfiguration(configurationService, 'compact', ActivityBarPosition.TOP);
		states.compactTop = menubarState(container);
		setConfiguration(configurationService, 'compact', ActivityBarPosition.DEFAULT);
		states.compactDefault = menubarState(container);
		setConfiguration(configurationService, 'compact', ActivityBarPosition.TOP);
		states.compactTopAgain = menubarState(container);
		setConfiguration(configurationService, 'classic', ActivityBarPosition.TOP);
		states.classicAgain = menubarState(container);
		setConfiguration(configurationService, 'compact', ActivityBarPosition.TOP);
		states.compactTopThird = menubarState(container);
		part.dispose();

		const none = { count: 0, compact: false };
		const classic = customSupported ? { count: 1, compact: false } : none;
		const titlebarCompact = customSupported ? { count: 1, compact: compactSupported } : none;
		assert.deepStrictEqual(states, {
			classic,
			compactTop: titlebarCompact,
			compactDefault: compactSupported ? none : classic,
			compactTopAgain: titlebarCompact,
			classicAgain: classic,
			compactTopThird: titlebarCompact,
		});
	});

	test('does not install a custom menu bar when the platform does not support one', () => {
		class UnsupportedTitlebarPart extends BrowserTitlebarPart {
			protected override get supportsCustomMenubar(): boolean { return false; }
		}
		const configurationService = new TestConfigurationService({
			window: { menuBarVisibility: 'classic' },
			workbench: { activityBar: { location: ActivityBarPosition.DEFAULT } }
		});
		const { part, container } = createTitlebar(configurationService, UnsupportedTitlebarPart);

		const initial = menubarState(container);
		setConfiguration(configurationService, 'compact', ActivityBarPosition.TOP);
		const compactTop = menubarState(container);
		part.dispose();

		assert.deepStrictEqual({ initial, compactTop }, {
			initial: { count: 0, compact: false },
			compactTop: { count: 0, compact: false },
		});
	});

	test('titlebar-owned compact menu opens rightward even when the sidebar is on the right', function () {
		const compactSupported = getMenuBarVisibility(new TestConfigurationService({ window: { menuBarVisibility: 'compact' } })) === 'compact';
		const customSupported = !hasNativeMenu(new TestConfigurationService({ window: { menuBarVisibility: 'classic' } })) && (!isMacintosh || isWeb);
		if (!compactSupported || !customSupported) {
			this.skip();
		}
		const configurationService = new TestConfigurationService({
			window: { menuBarVisibility: 'compact' },
			workbench: { activityBar: { location: ActivityBarPosition.TOP }, sideBar: { location: 'right' } }
		});
		const { part, container } = createTitlebar(configurationService);

		const button = container.querySelector<HTMLElement>('.menubar .menubar-menu-button');
		button?.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
		const holder = container.querySelector<HTMLElement>('.menubar-menu-items-holder');
		const result = { opened: !!holder, opensLeftward: holder?.style.left === 'auto' };
		part.dispose();

		assert.deepStrictEqual(result, { opened: true, opensLeftward: false });
	});
});

function createMeasuredElement(clientWidth: () => number, scrollWidth: () => number): HTMLElement {
	const element = mainWindow.document.createElement('div');
	Object.defineProperties(element, {
		clientWidth: { get: clientWidth },
		scrollWidth: { get: scrollWidth },
	});
	return element;
}

function visibleWidth(element: HTMLElement, width: number): number {
	return element.classList.contains('overflowing') || element.classList.contains('has-no-actions') ? 0 : width;
}
