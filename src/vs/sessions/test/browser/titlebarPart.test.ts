/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getZoomFactor, setZoomFactor } from '../../../base/browser/browser.js';
import { $, append } from '../../../base/browser/dom.js';
import { Direction, Grid, IView, Sizing } from '../../../base/browser/ui/grid/grid.js';
import { mainWindow } from '../../../base/browser/window.js';
import { Event } from '../../../base/common/event.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { mock } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../platform/configuration/test/common/testConfigurationService.js';
import { IEditorGroupsContainer } from '../../../workbench/services/editor/common/editorGroupsService.js';
import { IWorkbenchLayoutService, LayoutSettings, ModernUIDensity, Parts } from '../../../workbench/services/layout/browser/layoutService.js';
import { TestLayoutService, workbenchInstantiationService } from '../../../workbench/test/browser/workbenchTestServices.js';
import { TitlebarPart, TitleService } from '../../browser/parts/titlebarPart.js';
// eslint-disable-next-line local/code-import-patterns -- Test the title-bar styling supplied by the Modern UI contribution.
import '../../../workbench/contrib/modernUI/browser/media/titlebar.css';
// eslint-disable-next-line local/code-import-patterns -- Use the rendered command center's sizing and border.
import '../../contrib/sessions/browser/media/sessionsTitleBarWidget.css';
import { IconLabel } from '../../../base/browser/ui/iconLabel/iconLabel.js';
import '../../browser/parts/media/chatCompositeBar.css';
import '../../browser/media/workbench.css';
import '../../browser/media/openInVSCode.css';

suite('Sessions - Titlebar Part', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const updateTitleBarToolBarOverflow = Reflect.get(TitlebarPart.prototype, 'updateTitleBarToolBarOverflow') as (this: TitlebarPart) => void;

	function createTitlebar(density: ModernUIDensity = ModernUIDensity.Default) {
		const configuration = new TestConfigurationService({
			window: { titleBarStyle: 'custom' },
			[LayoutSettings.MODERN_UI_DENSITY]: density,
			[LayoutSettings.MODERN_UI]: false,
		});
		store.add(configuration.onDidChangeConfigurationEmitter);
		const instantiationService = workbenchInstantiationService({ configurationService: () => configuration }, store);
		const part = store.add(instantiationService.createInstance(TitlebarPart, Parts.TITLEBAR_PART, mainWindow));
		part.element = $('div');
		return { part, configuration, instantiationService };
	}

	test('uses 44px in Default and 35px in Compact at startup', () => {
		const heights = [ModernUIDensity.Default, ModernUIDensity.Compact].map(density => {
			const { part } = createTitlebar(density);
			return { minimum: part.minimumHeight, maximum: part.maximumHeight };
		});
		assert.deepStrictEqual(heights, [{ minimum: 44, maximum: 44 }, { minimum: 35, maximum: 35 }]);
	});

	test('updates grid constraints when density changes without a reload', async () => {
		const { part, configuration } = createTitlebar();
		const titleView: IView = {
			element: part.element,
			minimumWidth: 0,
			maximumWidth: Number.POSITIVE_INFINITY,
			get minimumHeight() { return part.minimumHeight; },
			get maximumHeight() { return part.maximumHeight; },
			onDidChange: part.onDidChange,
			layout: () => { },
		};
		const content: IView = {
			element: $('div'),
			minimumWidth: 0,
			maximumWidth: Number.POSITIVE_INFINITY,
			minimumHeight: 0,
			maximumHeight: Number.POSITIVE_INFINITY,
			onDidChange: Event.None,
			layout: () => { },
		};
		const grid = store.add(new Grid(titleView));
		grid.addView(content, Sizing.Distribute, titleView, Direction.Down);
		grid.layout(800, 600);
		const changes: number[] = [];
		store.add(part.onDidChange(() => changes.push(part.minimumHeight)));
		const read = () => ({ title: grid.getViewSize(titleView).height, content: grid.getViewSize(content).height });
		const initial = read();
		for (const density of [ModernUIDensity.Compact, ModernUIDensity.Default]) {
			await configuration.setUserConfiguration(LayoutSettings.MODERN_UI_DENSITY, density);
			configuration.onDidChangeConfigurationEmitter.fire({
				affectsConfiguration: key => key === LayoutSettings.MODERN_UI_DENSITY,
				source: ConfigurationTarget.USER,
				affectedKeys: new Set([LayoutSettings.MODERN_UI_DENSITY]),
				change: { keys: [LayoutSettings.MODERN_UI_DENSITY], overrides: [] },
			});
			if (density === ModernUIDensity.Compact) {
				assert.deepStrictEqual(read(), { title: 35, content: 565 });
			}
		}
		assert.deepStrictEqual({ initial, restored: read(), changes }, {
			initial: { title: 44, content: 556 },
			restored: { title: 44, content: 556 },
			changes: [35, 44],
		});
	});

	test('preserves title-bar counter-zoom behavior in both densities', () => {
		const initialZoom = getZoomFactor(mainWindow);
		store.add(toDisposable(() => setZoomFactor(initialZoom, mainWindow)));
		const states = [ModernUIDensity.Default, ModernUIDensity.Compact].map(density => {
			const { part } = createTitlebar(density);
			return [1, 0.8, 1.25].map(zoom => {
				setZoomFactor(zoom, mainWindow);
				return part.minimumHeight;
			});
		});
		assert.deepStrictEqual(states, [[44, 55, 44], [35, 43.75, 35]]);
	});

	test('updates auxiliary title bars and keeps top notifications below them', async () => {
		const { configuration, instantiationService } = createTitlebar();
		const container = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench'));
		store.add(toDisposable(() => container.remove()));
		instantiationService.stub(IWorkbenchLayoutService, new class extends TestLayoutService {
			override getContainer(): HTMLElement { return container; }
		}());
		const titleService = store.add(instantiationService.createInstance(TitleService));
		const part = store.add(titleService.createAuxiliaryTitlebarPart(container, new class extends mock<IEditorGroupsContainer>() { }(), instantiationService));
		const read = () => {
			part.layout(800, part.height, 0, 0);
			return { height: part.height, containerHeight: part.container.style.height, notificationTop: container.style.getPropertyValue('--modern-ui-notifications-block-start-inset') };
		};
		const initial = read();
		await configuration.setUserConfiguration(LayoutSettings.MODERN_UI_DENSITY, ModernUIDensity.Compact);
		configuration.onDidChangeConfigurationEmitter.fire({
			affectsConfiguration: key => key === LayoutSettings.MODERN_UI_DENSITY,
			source: ConfigurationTarget.USER,
			affectedKeys: new Set([LayoutSettings.MODERN_UI_DENSITY]),
			change: { keys: [LayoutSettings.MODERN_UI_DENSITY], overrides: [] },
		});

		assert.deepStrictEqual({ initial, compact: read() }, {
			initial: { height: 44, containerHeight: '44px', notificationTop: '49px' },
			compact: { height: 35, containerHeight: '35px', notificationTop: '40px' },
		});
	});

	for (const platform of ['mac', 'windows', 'linux', 'web']) {
		for (const auxiliary of [false, true]) {
			test(`optically centers ${platform} ${auxiliary ? 'auxiliary' : 'main'} title-bar contents in default density`, () => {
				const root = append(mainWindow.document.body, $(`.monaco-workbench.agent-sessions-workbench.${platform}`));
				store.add(toDisposable(() => root.remove()));
				root.style.cssText = 'width: 800px; --vscode-spacing-size20: 2px; --vscode-spacing-size80: 8px; --vscode-commandCenter-border: transparent;';
				const grid = auxiliary ? root : append(root, $('.monaco-grid-view'));
				const titlebar = append(grid, $('.part.titlebar'));
				const content = append(titlebar, $('.titlebar-container.sessions-titlebar-container.has-center'));
				const left = append(content, $('.titlebar-left'));
				const leftToolbar = append(left, $('.left-toolbar-container'));
				const center = append(content, $('.titlebar-center'));
				const navigation = append(center, $('.titlebar-actions-container.titlebar-center-nav-container'));
				const windowTitle = append(center, $('.window-title'));
				const commandCenter = append(windowTitle, $('.command-center'));
				const centerActions = append(center, $('.titlebar-actions-container.titlebar-center-actions-container'));
				const right = append(content, $('.titlebar-right'));
				const rightToolbar = append(right, $('.titlebar-actions-container.titlebar-right-layout-container'));
				const actions = [leftToolbar, navigation, commandCenter, centerActions, rightToolbar].map(container => {
					const toolbar = append(container, $('.monaco-toolbar'));
					const actionBar = append(toolbar, $('.monaco-action-bar'));
					const actionContainer = append(actionBar, $('ul.actions-container'));
					if (container === commandCenter) {
						return append(actionContainer, $('li.action-item.agent-sessions-titlebar-container'));
					}
					const item = append(actionContainer, $('li.action-item'));
					return append(item, $('a.action-label.codicon'));
				});

				const states = [false, true].flatMap(modernUI => {
					root.classList.toggle('modern-ui', modernUI);
					return [false, true, false].map(compact => {
						root.classList.toggle('modern-ui-compact', compact);
						titlebar.style.height = `${compact ? 35 : 44}px`;
						const bounds = titlebar.getBoundingClientRect();
						return actions.map(action => {
							const actionBounds = action.getBoundingClientRect();
							return { top: actionBounds.top - bounds.top, bottom: bounds.bottom - actionBounds.bottom };
						});
					});
				});

				const expected = (height: number, offset: number) => actions.map((_, index) => {
					const gap = (height - (index === 2 ? 24 : 22)) / 2;
					return { top: gap + offset, bottom: gap - offset };
				});
				const defaultDensity = expected(44, 1);
				const compact = expected(35, 0);
				const compactModernUI = expected(35, platform === 'mac' ? 1 : 0);
				assert.deepStrictEqual(states, [defaultDensity, compact, defaultDensity, defaultDensity, compactModernUI, defaultDensity]);
			});

			test(`keeps ${platform} ${auxiliary ? 'auxiliary' : 'main'} title-bar outer spacing unchanged across densities`, () => {
				const root = append(mainWindow.document.body, $(`.monaco-workbench.agent-sessions-workbench.${platform}`));
				store.add(toDisposable(() => root.remove()));
				root.style.cssText = 'width: 800px; --vscode-agents-layout-floatingPanelGap: 4px; --vscode-spacing-size80: 8px;';
				const grid = auxiliary ? root : append(root, $('.monaco-grid-view'));
				const titlebar = append(grid, $('.part.titlebar'));
				titlebar.style.height = '35px';
				const content = append(titlebar, $('.titlebar-container.sessions-titlebar-container.has-center'));
				const left = append(content, $('.titlebar-left'));
				const leftToolbar = append(left, $('.left-toolbar-container'));
				leftToolbar.style.width = '40px';
				const center = append(content, $('.titlebar-center'));
				center.style.width = '200px';
				const right = append(content, $('.titlebar-right'));
				const rightToolbar = append(right, $('.titlebar-actions-container.titlebar-right-layout-container'));
				const rightAction = append(rightToolbar, $('.action-label'));
				rightAction.style.cssText = 'width: 40px; height: 22px; flex-shrink: 0;';
				const windowControls = platform === 'windows' ? append(right, $('.window-controls-container')) : undefined;

				const states = [false, true, false].map(compact => {
					root.classList.toggle('modern-ui-compact', compact);
					titlebar.style.height = `${compact ? 35 : 44}px`;
					titlebar.style.width = `${grid.clientWidth}px`;
					content.style.width = `${grid.clientWidth}px`;
					const rootBounds = root.getBoundingClientRect();
					const contentBounds = content.getBoundingClientRect();
					const centerBounds = center.getBoundingClientRect();
					return {
						left: contentBounds.left - rootBounds.left,
						right: rootBounds.right - contentBounds.right,
						center: (centerBounds.left + centerBounds.right) / 2 - rootBounds.left,
						leftAction: leftToolbar.getBoundingClientRect().left - rootBounds.left,
						rightAction: rootBounds.right - rightAction.getBoundingClientRect().right,
						rightActionWidth: rightAction.getBoundingClientRect().width,
						rightActionHeight: rightAction.getBoundingClientRect().height,
						windowControlsRight: windowControls ? rootBounds.right - windowControls.getBoundingClientRect().right : undefined,
					};
				});

				const outerInset = auxiliary ? 0 : 4;
				const expected = {
					left: 0,
					right: outerInset,
					center: auxiliary ? 400 : 398,
					leftAction: 0,
					rightAction: outerInset + 8 + (windowControls ? 138 : 0),
					rightActionWidth: 40,
					rightActionHeight: 22,
					windowControlsRight: windowControls ? outerInset : undefined,
				};
				assert.deepStrictEqual(states, [expected, expected, expected]);
			});
		}
	}

	for (const platform of ['windows', 'linux']) {
		for (const auxiliary of [false, true]) {
			test(`preserves ${platform} ${auxiliary ? 'auxiliary' : 'main'} window-control edge targets across densities and zoom levels`, () => {
				const root = append(mainWindow.document.body, $(`.monaco-workbench.agent-sessions-workbench.${platform}`));
				store.add(toDisposable(() => root.remove()));
				root.style.cssText = 'position: fixed; top: 0; left: 0; width: 400px; height: 100px; z-index: 10000; --vscode-spacing-size20: 2px;';
				const grid = auxiliary ? root : append(root, $('.monaco-grid-view'));
				const titlebar = append(grid, $('.part.titlebar'));
				titlebar.style.position = 'relative';
				const content = append(titlebar, $('.titlebar-container.sessions-titlebar-container.has-center'));
				append(content, $('.titlebar-drag-region'));
				append(content, $('.titlebar-left'));
				append(content, $('.titlebar-center'));
				const right = append(content, $('.titlebar-right'));
				const controls = append(right, $('.window-controls-container'));
				const buttons = ['window-minimize', 'window-max-restore', 'window-close'].map(name => append(controls, $(`.window-icon.${name}`)));

				const states = [0.8, 1, 1.25].flatMap(zoom => {
					root.style.zoom = `${zoom}`;
					titlebar.style.setProperty('--zoom-factor', `${zoom}`);
					content.classList.toggle('counter-zoom', zoom < 1);
					return [false, true, false].map(compact => {
						root.classList.toggle('modern-ui-compact', compact);
						titlebar.style.height = `${(compact ? 35 : 44) / Math.min(zoom, 1)}px`;
						const bounds = titlebar.getBoundingClientRect();
						return buttons.map(button => {
							const buttonBounds = button.getBoundingClientRect();
							const x = (buttonBounds.left + buttonBounds.right) / 2;
							return {
								top: buttonBounds.top - bounds.top,
								bottom: bounds.bottom - buttonBounds.bottom,
								topHit: mainWindow.document.elementFromPoint(x, bounds.top + 0.5) === button,
								bottomHit: mainWindow.document.elementFromPoint(x, bounds.bottom - 0.5) === button,
							};
						});
					});
				});

				assert.deepStrictEqual(states, Array.from({ length: 9 }, () => buttons.map(() => ({
					top: 0,
					bottom: 0,
					topHit: true,
					bottomHit: true,
				}))));
			});
		}
	}

	for (const { name, classes, controlsOnLeft, gap } of [
		{ name: 'native macOS', classes: ['mac'], controlsOnLeft: true, gap: 16 },
		{ name: 'macOS fullscreen', classes: ['mac', 'fullscreen'], controlsOnLeft: true, gap: 8 },
		{ name: 'macOS browser', classes: ['mac', 'web'], controlsOnLeft: true, gap: 8 },
		{ name: 'macOS without left controls', classes: ['mac'], controlsOnLeft: false, gap: 8 },
		{ name: 'Windows', classes: ['windows'], controlsOnLeft: false, gap: 8 },
		{ name: 'Linux', classes: ['linux'], controlsOnLeft: false, gap: 8 },
	]) {
		test(`uses the intended traffic-light to sidebar spacing on ${name}`, () => {
			const root = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench'));
			store.add(toDisposable(() => root.remove()));
			root.classList.add(...classes);
			root.style.cssText = 'width: 800px; --vscode-spacing-size160: 16px;';
			const titlebar = append(root, $('.part.titlebar'));
			const content = append(titlebar, $('.titlebar-container.sessions-titlebar-container.has-center'));
			const left = append(content, $('.titlebar-left'));
			const controls = controlsOnLeft ? append(left, $('.window-controls-container')) : undefined;
			const toolbar = append(left, $('.left-toolbar-container'));
			const button = append(toolbar, $('button'));
			button.style.cssText = 'width: 22px; height: 22px; padding: 0; border: 0; flex-shrink: 0;';
			const center = append(content, $('.titlebar-center'));
			center.style.width = '200px';
			append(content, $('.titlebar-right'));

			const states = [false, true, false].map(compact => {
				root.classList.toggle('modern-ui-compact', compact);
				titlebar.style.height = `${compact ? 35 : 44}px`;
				const start = controls && mainWindow.getComputedStyle(controls).display !== 'none'
					? controls.getBoundingClientRect().right
					: left.getBoundingClientRect().left;
				const buttonBounds = button.getBoundingClientRect();
				const centerBounds = center.getBoundingClientRect();
				return {
					gap: buttonBounds.left - start,
					width: buttonBounds.width,
					height: buttonBounds.height,
					commandCenter: (centerBounds.left + centerBounds.right) / 2 - root.getBoundingClientRect().left,
				};
			});

			const expected = { gap, width: 22, height: 22, commandCenter: 400 };
			assert.deepStrictEqual(states, [expected, expected, expected]);
		});
	}

	test('shows a session header in place of the title only while it hosts one; a title bar that is never asked to is as before', () => {
		const { instantiationService } = createTitlebar();
		const root = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench'));
		store.add(toDisposable(() => root.remove()));
		const createPart = () => {
			const part = store.add(instantiationService.createInstance(TitlebarPart, Parts.TITLEBAR_PART, mainWindow));
			part.create(append(root, $('.part.titlebar')));
			return part;
		};
		const shown = (element: Element | null) => !!element && mainWindow.getComputedStyle(element).display !== 'none';
		const read = (part: TitlebarPart) => ({
			left: [...part.element.querySelector('.titlebar-left')!.children].map(child => child.className),
			hostsHeader: part.element.classList.contains('hosts-session-header'),
			headerShown: shown(part.element.querySelector('.session-header-host')),
			titleShown: shown(part.element.querySelector('.window-title')),
		});

		const main = read(createPart());
		const chatWindow = createPart();
		const header = append(chatWindow.getSessionHeaderHost(), $('.session-header-bar'));
		const notHosting = read(chatWindow);
		chatWindow.setHostsSessionHeader(true);
		const hosting = { ...read(chatWindow), header: shown(header) };
		chatWindow.setHostsSessionHeader(false);

		const left = main.left;
		assert.deepStrictEqual({ main, notHosting, hosting, after: read(chatWindow) }, {
			main: { left, hostsHeader: false, headerShown: false, titleShown: true },
			notHosting: { left: [...left, 'session-header-host'], hostsHeader: false, headerShown: false, titleShown: true },
			hosting: { left: [...left, 'session-header-host'], hostsHeader: true, headerShown: true, titleShown: false, header: true },
			after: { left: [...left, 'session-header-host'], hostsHeader: false, headerShown: false, titleShown: true },
		});
	});

	test('a click on the title of a hosted session header, or in its rename input, reaches it, above the drag region of the title bar, as a click on a toolbar does; its empty space moves the window', () => {
		const { instantiationService } = createTitlebar();
		const root = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench'));
		store.add(toDisposable(() => root.remove()));
		// In the viewport, wherever the test page has scrolled to.
		root.style.cssText = 'position: fixed; top: 0; left: 0; width: 600px; z-index: 100000;';
		const part = store.add(instantiationService.createInstance(TitlebarPart, Parts.TITLEBAR_PART, mainWindow));
		part.create(append(root, $('.part.titlebar')));
		part.element.style.height = '35px';
		part.setHostsSessionHeader(true);
		const header = append(append(part.getSessionHeaderHost(), $('.chat-composite-bar.session-header-bar.window-chrome')), $('.chat-composite-bar-header'));
		const titleRow = append(append(header, $('.chat-composite-bar-header-main')), $('.chat-composite-bar-title-row'));
		titleRow.style.cssText = 'display: flex; width: 200px;';
		const title = append(titleRow, $('.chat-composite-bar-session-title'));
		title.style.width = '100px';
		const titleText = append(title, $('span.chat-composite-bar-session-title-text'));
		titleText.textContent = 'Title';
		const titleActions = append(titleRow, $('.chat-composite-bar-title-actions'));
		titleActions.style.cssText = 'width: 40px; height: 16px;';
		const dragRegion = part.element.querySelector('.titlebar-drag-region');
		const center = (element: Element) => {
			const bounds = element.getBoundingClientRect();
			return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
		};
		const at = (point: { x: number; y: number }, target: Element) => {
			// The elements at the point, topmost first (whatever else of the test page is above them).
			const stack = mainWindow.document.elementsFromPoint(point.x, point.y);
			const targetIndex = stack.findIndex(element => target.contains(element));
			const dragRegionIndex = stack.findIndex(element => element === dragRegion);
			// The window's app region at the point, as Electron reads it: that of the topmost element that sets one. A drag
			// region takes the mouse from the page, so a click there moves the window rather than reaching the title.
			const appRegion = stack.map(element => mainWindow.getComputedStyle(element).getPropertyValue('-webkit-app-region')).find(region => region === 'drag' || region === 'no-drag');
			return { reaches: targetIndex >= 0 && (dragRegionIndex < 0 || targetIndex < dragRegionIndex), appRegion };
		};

		const before = { title: at(center(title), title), titleActions: at(center(titleActions), titleActions) };
		// The empty space of the header, between its title and its actions, which keep to the end of the row.
		const empty = at({ x: (title.getBoundingClientRect().right + titleActions.getBoundingClientRect().left) / 2, y: center(title).y }, header);
		// Renaming swaps the title's text for an input in the title, as SessionHeaderBar.startTitleEditing does.
		titleText.style.display = 'none';
		const input = append(title, $<HTMLInputElement>('input.chat-composite-bar-session-title-input'));
		input.style.width = '90px';
		const renameInput = at(center(input), input);

		assert.deepStrictEqual({ dragRegion: !!dragRegion, ...before, renameInput, empty }, {
			dragRegion: true,
			title: { reaches: true, appRegion: 'no-drag' },
			titleActions: { reaches: true, appRegion: 'no-drag' },
			renameInput: { reaches: true, appRegion: 'no-drag' },
			empty: { reaches: true, appRegion: 'drag' },
		});
	});

	for (const chatColumn of [true, false]) {
		test(`a hosted session header gives way to the title bar's actions, its title shortening, ${chatColumn ? 'above the chat\'s column only' : 'across the window'}`, () => {
			const root = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench.mac'));
			store.add(toDisposable(() => root.remove()));
			root.style.width = '480px';
			const titlebar = append(root, $(`.part.titlebar.hosts-session-header${chatColumn ? '.header-chat-column' : ''}`));
			titlebar.style.height = '35px';
			const content = append(titlebar, $('.titlebar-container.sessions-titlebar-container.has-center'));
			const left = append(content, $('.titlebar-left'));
			append(left, $('.window-controls-container')).style.cssText = 'width: 70px; flex-shrink: 0;';
			// The session header, as it shows in the title bar.
			const header = append(append(append(left, $('.session-header-host')), $('.chat-composite-bar.session-header-bar.window-chrome')), $('.chat-composite-bar-header'));
			append(header, $('.chat-composite-bar-session-icon')).style.width = '16px';
			const titleRow = append(append(header, $('.chat-composite-bar-header-main')), $('.chat-composite-bar-title-row'));
			const title = append(append(titleRow, $('.chat-composite-bar-session-title')), $('span.chat-composite-bar-session-title-text'));
			store.add(new IconLabel(title)).setLabel('A long title of a chat, which does not fit beside the actions of the title bar of its window');
			append(titleRow, $('.chat-composite-bar-title-actions')).style.width = '20px';
			const center = append(content, $('.titlebar-center'));
			const actions = append(center, $('.titlebar-actions-container.titlebar-center-actions-container'));
			actions.style.cssText = 'width: 66px; flex-shrink: 0;';
			const right = append(content, $('.titlebar-right'));
			append(right, $('.titlebar-actions-container')).style.cssText = 'width: 52px; flex-shrink: 0;';
			// The window controls at the right (Windows, Linux).
			const windowControls = append(right, $('.window-controls-container'));
			windowControls.style.width = '138px';

			const bounds = titlebar.getBoundingClientRect();
			const actionBounds = actions.getBoundingClientRect();
			// The sections as they size: the header's can shrink below its title; above the chat's column, it takes the room left.
			const sizing = (element: HTMLElement) => { const style = mainWindow.getComputedStyle(element); return `${style.flexGrow} ${style.flexShrink} ${style.flexBasis} min ${style.minWidth}`; };
			assert.deepStrictEqual({
				overflowing: [content, left, center, right].some(element => element.scrollWidth > element.clientWidth),
				actionsShown: actionBounds.width === 66 && actionBounds.right <= bounds.right,
				titleShortened: [title, ...title.querySelectorAll('*')].some(element => element.clientWidth > 0 && element.clientWidth < element.scrollWidth),
				left: sizing(left).endsWith('min 0px'),
				chatColumn: chatColumn ? [sizing(left), sizing(center).split(' min')[0], sizing(right).split(' min')[0]] : undefined,
				// Above the chat's column only, at the top right of the window, above the editor area beside the chat.
				windowControls: chatColumn ? { position: mainWindow.getComputedStyle(windowControls).position, top: windowControls.getBoundingClientRect().top, right: Math.round(windowControls.getBoundingClientRect().right) === mainWindow.document.documentElement.clientWidth } : mainWindow.getComputedStyle(windowControls).position,
			}, {
				overflowing: false, actionsShown: true, titleShortened: true, left: true,
				chatColumn: chatColumn ? ['1 1 auto min 0px', '0 0 auto', '0 0 auto'] : undefined,
				windowControls: chatColumn ? { position: 'fixed', top: 0, right: true } : 'static',
			});
		});
	}

	for (const { chatColumn, width } of [{ chatColumn: true, width: 520 }, { chatColumn: false, width: 520 }, { chatColumn: false, width: 1200 }]) {
		test(`the actions of the session in a title bar that hosts its header are one group at its right, Run and Open in VS Code, Create Pull Request, the layout actions, then the header's More Actions last, ${chatColumn ? 'above the chat\'s column' : `across a window ${width}px wide`}`, () => {
			const { instantiationService } = createTitlebar();
			const root = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench'));
			store.add(toDisposable(() => root.remove()));
			root.style.cssText = `position: fixed; top: 0; left: 0; width: ${width}px; z-index: 100000;`;
			const part = store.add(instantiationService.createInstance(TitlebarPart, Parts.TITLEBAR_PART, mainWindow));
			part.create(append(root, $('.part.titlebar')));
			part.element.style.height = '35px';
			part.element.classList.toggle('header-chat-column', chatColumn);
			// The hosted header: its title, and its More Actions in the host the title bar gives them, as SessionView does.
			const header = append(part.getSessionHeaderHost(), $('.chat-composite-bar.session-header-bar.window-chrome'));
			append(header, $('.chat-composite-bar-session-title')).textContent = 'Title';
			const more = append(append(part.getSessionHeaderActionsHost(), $('.chat-composite-bar-title-actions')), $('.action-label.codicon.codicon-ellipsis'));
			more.style.cssText = 'display: block; width: 22px; height: 22px;';
			// The actions the title bar shows beside its title (Run, Open in VS Code) and at its right (Create Pull Request), as
			// its toolbars render them.
			for (const [container, ids] of [['.titlebar-center-actions-container', ['test.run', 'test.openInVSCode']], ['.titlebar-session-actions-container', ['test.createPullRequest']], ['.titlebar-right-layout-container', ['test.layout']]] as const) {
				const element = part.element.querySelector<HTMLElement>(container)!;
				element.classList.remove('has-no-actions');
				for (const id of ids) {
					const item = append(element.querySelector('.actions-container')!, $('li.action-item'));
					append(item, $('a.action-label', { 'aria-label': id })).style.cssText = 'display: block; width: 22px; height: 22px;';
				}
			}
			part.setHostsSessionHeader(true);
			if (chatColumn) {
				// Above the chat's column only: the title bar is as wide as the column.
				part.element.style.width = '400px';
			}

			const label = (id: string) => part.element.querySelector<HTMLElement>(`.action-label[aria-label="${id}"]`)!;
			const actions = [label('test.run'), label('test.openInVSCode'), label('test.createPullRequest'), label('test.layout'), more].map(element => element.getBoundingClientRect());
			// Every action the title bar shows at its right, in the order they show: More Actions is the last of them.
			const shownActions = [...part.element.querySelectorAll<HTMLElement>('.titlebar-right .action-label')].filter(element => element.getBoundingClientRect().width > 0).sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
			const right = (part.element.querySelector('.titlebar-right') as HTMLElement).getBoundingClientRect();
			const titleBar = part.element.getBoundingClientRect();
			assert.deepStrictEqual({
				// In this order, left to right.
				inOrder: actions.every((bounds, index) => index === 0 || bounds.left >= actions[index - 1].right),
				// Next to each other, without the room of the title between them.
				contiguous: actions.every((bounds, index) => index === 0 || bounds.left - actions[index - 1].right <= 8),
				// At the right of the title bar.
				rightAligned: Math.round(right.right) === Math.round(titleBar.right) && right.right - actions[actions.length - 1].right <= 12,
				hostedOutsideHeader: !part.getSessionHeaderHost().contains(more),
				moreLast: shownActions.at(-1) === more,
			}, { inOrder: true, contiguous: true, rightAligned: true, hostedOutsideHeader: true, moreLast: true });

			// Without the header, such as while the window shows only the chat input, the title shows, and the actions stay
			// one group at the right.
			part.setHostsSessionHeader(false);
			const withoutHeader = [label('test.run'), label('test.openInVSCode'), label('test.createPullRequest')].map(element => element.getBoundingClientRect());
			assert.deepStrictEqual({
				contiguous: withoutHeader.every((bounds, index) => index === 0 || (bounds.left >= withoutHeader[index - 1].right && bounds.left - withoutHeader[index - 1].right <= 8)),
				moreHidden: more.getBoundingClientRect().width,
			}, { contiguous: true, moreHidden: 0 });
		});
	}

	test('hides optional toolbar groups when a titlebar section overflows', () => {
		let centerClientWidth = 100;
		let rightClientWidth = 100;
		const root = createMeasuredElement(() => 100, () => 100);
		const left = createMeasuredElement(() => 20, () => 20);
		const toolBars = [20, 20, 20, 20, 20, 20].map(() => mainWindow.document.createElement('div'));
		toolBars[0].classList.add('titlebar-screen-reader-container');
		const center = createMeasuredElement(
			() => centerClientWidth,
			() => 40 + visibleWidth(toolBars[1], 20) + visibleWidth(toolBars[2], 20)
		);
		const right = createMeasuredElement(
			() => rightClientWidth,
			() => 40 + visibleWidth(toolBars[0], 20) + visibleWidth(toolBars[3], 20) + visibleWidth(toolBars[4], 20) + visibleWidth(toolBars[5], 20)
		);
		const titlebarPart = Object.create(TitlebarPart.prototype) as TitlebarPart;
		Reflect.set(titlebarPart, 'rootContainer', root);
		Reflect.set(titlebarPart, 'leftContent', left);
		Reflect.set(titlebarPart, 'centerContent', center);
		Reflect.set(titlebarPart, 'rightContent', right);
		Reflect.set(titlebarPart, 'overflowManagedToolBarElements', toolBars);

		updateTitleBarToolBarOverflow.call(titlebarPart);
		const prioritized = toolBars.map(element => element.classList.contains('overflowing'));

		centerClientWidth = 200;
		rightClientWidth = 200;
		updateTitleBarToolBarOverflow.call(titlebarPart);
		const expanded = toolBars.map(element => element.classList.contains('overflowing'));

		assert.deepStrictEqual({ prioritized, expanded }, {
			prioritized: [true, false, false, false, false, false],
			expanded: [false, false, false, false, false, false],
		});
	});

	test('the actions of a title bar that hosts a session header are one group with the gaps of the main window\'s, a group whose actions all hide themselves taking no room, and end with More Actions centered above the Session Activity Bar\'s column at the right', () => {
		/** The right of a title bar with the actions of a chat window, or of the main window, as they render. */
		const render = (hostsHeader: boolean) => {
			const root = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench'));
			store.add(toDisposable(() => root.remove()));
			root.style.cssText = 'position: fixed; top: 0; left: 0; width: 800px;';
			// The spacing tokens, which the theme defines.
			root.style.setProperty('--vscode-spacing-size40', '4px');
			root.style.setProperty('--vscode-spacing-size80', '8px');
			const titlebar = append(root, $(`.part.titlebar${hostsHeader ? '.hosts-session-header' : ''}`));
			titlebar.style.height = '35px';
			const content = append(titlebar, $('.titlebar-container.sessions-titlebar-container.has-center'));
			append(content, $('.titlebar-left'));
			append(content, $('.titlebar-center'));
			const right = append(content, $('.titlebar-right'));
			const group = (className: string, items: readonly (string | { readonly name: string; readonly className?: string; readonly hidden?: boolean })[], parent = right) => {
				const container = append(parent, $(className));
				const actions = append(append(append(container, $('.monaco-toolbar')), $('.monaco-action-bar')), $('ul.actions-container'));
				for (const item of items) {
					const { name, className: itemClassName, hidden } = typeof item === 'string' ? { name: item } : item;
					const element = append(actions, $(`li.action-item${itemClassName ? `.${itemClassName}` : ''}`));
					element.dataset.name = name;
					element.style.width = '22px';
					element.style.height = '22px';
					if (hidden) {
						element.style.display = 'none';
					}
				}
			};
			if (hostsHeader) {
				// As the chat window gives it, to center the header's actions (22px) above the Session Activity Bar's column (34px).
				titlebar.style.setProperty('--session-header-actions-inset', '6px');
				// As TitlebarPart.getSessionHeaderActionsHost arranges them: Run and Open in VS Code first, the header's last.
				group('.titlebar-actions-container.titlebar-center-actions-container', ['Run', { name: 'Open in VS Code', className: 'open-in-vscode-titlebar-widget' }]);
				group('.titlebar-actions-container.titlebar-session-actions-container', [{ name: 'Create Pull Request', className: 'changes-actions-bar', hidden: true }]);
				group('.titlebar-actions-container.titlebar-chat-window-layout-container', ['Show Editor', 'Layout']);
				group('.titlebar-actions-container.titlebar-right-layout-container', ['Always on Top']);
				const host = append(right, $('.session-header-actions-host'));
				const more = append(host, $('.action-item'));
				more.dataset.name = 'More Actions';
				more.style.cssText = 'width: 22px; height: 22px;';
			} else {
				group('.titlebar-actions-container.titlebar-session-actions-container', ['Show Panel', 'Toggle Side Panel']);
				group('.titlebar-actions-container.titlebar-right-layout-container', ['Accounts']);
			}
			const items = [...titlebar.querySelectorAll<HTMLElement>('[data-name]')].filter(item => item.getBoundingClientRect().width > 0).sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
			const gaps = items.slice(1).map((item, index) => `${items[index].dataset.name} | ${item.dataset.name}: ${Math.round(item.getBoundingClientRect().left - items[index].getBoundingClientRect().right)}`);
			const last = items[items.length - 1];
			const bounds = last.getBoundingClientRect();
			return { gaps, last: last.dataset.name, rightInset: Math.round(titlebar.getBoundingClientRect().right - bounds.right), centerFromRight: Math.round(titlebar.getBoundingClientRect().right - (bounds.left + bounds.width / 2)) };
		};

		const main = render(false);
		const chatWindow = render(true);

		assert.deepStrictEqual({ main, chatWindow }, {
			main: { gaps: ['Show Panel | Toggle Side Panel: 1', 'Toggle Side Panel | Accounts: 4'], last: 'Accounts', rightInset: 8, centerFromRight: 19 },
			chatWindow: {
				gaps: ['Run | Open in VS Code: 3', 'Open in VS Code | Show Editor: 4', 'Show Editor | Layout: 1', 'Layout | Always on Top: 4', 'Always on Top | More Actions: 4'],
				last: 'More Actions',
				// Centered above the column (34px), as its entries are.
				rightInset: 6,
				centerFromRight: 17,
			},
		});
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
