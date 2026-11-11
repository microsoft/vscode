/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getZoomFactor, isFullscreen, setFullscreen, setZoomFactor } from '../../../base/browser/browser.js';
import { $, addDisposableListener, append, EventType, registerWindow } from '../../../base/browser/dom.js';
import { ButtonBar } from '../../../base/browser/ui/button/button.js';
import { Direction, Grid, IView, Sizing } from '../../../base/browser/ui/grid/grid.js';
import { CodeWindow, ensureCodeWindow, mainWindow } from '../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../base/common/async.js';
import { runWithFakedTimers } from '../../../base/test/common/timeTravelScheduler.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { IHostService } from '../../../workbench/services/host/browser/host.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { isMacintosh, isNative } from '../../../base/common/platform.js';
import { mock, upcastPartial } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../platform/configuration/test/common/testConfigurationService.js';
import { IEditorGroupsContainer } from '../../../workbench/services/editor/common/editorGroupsService.js';
import { IWorkbenchLayoutService, LayoutSettings, ModernUIDensity, Parts } from '../../../workbench/services/layout/browser/layoutService.js';
import { TestLayoutService, TestMenuService, workbenchInstantiationService } from '../../../workbench/test/browser/workbenchTestServices.js';
import { IMenu, IMenuChangeEvent, IMenuService, MenuId, MenuItemAction } from '../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { AgentsWindowMenus } from '../../browser/agentsWindowMenus.js';
import { TitlebarPart, TitleService } from '../../browser/parts/titlebarPart.js';
// eslint-disable-next-line local/code-import-patterns -- Test the title-bar styling supplied by the Modern UI contribution.
import '../../../workbench/contrib/modernUI/browser/media/titlebar.css';
// eslint-disable-next-line local/code-import-patterns -- Use the rendered command center's sizing and border.
import '../../contrib/sessions/browser/media/sessionsTitleBarWidget.css';
import '../../browser/media/workbench.css';
// eslint-disable-next-line local/code-import-patterns -- Include the production styles of the right-hand title-bar controls.
import '../../../workbench/contrib/sessionChanges/browser/media/sessionChangesEditor.css';
// eslint-disable-next-line local/code-import-patterns, local/code-layering -- Include the shared remote-connections control's CSS without its Electron implementation.
import '../../../workbench/contrib/chat/electron-browser/media/tunnelHost.css';
// eslint-disable-next-line local/code-import-patterns -- Include the production account control's styling.
import '../../contrib/accountMenu/browser/media/accountTitleBarWidget.css';

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

	test('the last shown actions of a chat window\'s title bar keep its inset to the window\'s edge: its layout actions, or its session actions while the layout actions show in its Session Activity Bar; the main window\'s title bar marks none', () => {
		const { instantiationService } = createTitlebar();
		const container = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench.mac'));
		store.add(toDisposable(() => container.remove()));
		container.style.cssText = 'width: 800px; --vscode-agents-layout-floatingPanelGap: 4px; --vscode-spacing-size80: 8px; --vscode-spacing-size40: 4px;';
		instantiationService.stub(IWorkbenchLayoutService, new class extends TestLayoutService {
			override getContainer(): HTMLElement { return container; }
		}());
		const onDidChangeLayoutActions = store.add(new Emitter<IMenuChangeEvent>());
		let layoutActionsInTitleBar = true;
		const contextKeyService = instantiationService.get(IContextKeyService);
		const commandService = instantiationService.get(ICommandService);
		const actions = (...ids: string[]) => [['navigation', ids.map(id => new MenuItemAction({ id, title: id }, undefined, undefined, undefined, undefined, contextKeyService, commandService))]] as [string, MenuItemAction[]][];
		instantiationService.stub(IMenuService, new class extends TestMenuService {
			override createMenu(id: MenuId, menuContextKeyService: IContextKeyService): IMenu {
				if (id === AgentsWindowMenus.TitleBarSessionMenu) {
					return { onDidChange: Event.None, dispose: () => { }, getActions: () => actions('createPullRequest') };
				}
				if (id === AgentsWindowMenus.TitleBarWindowLayout) {
					return { onDidChange: onDidChangeLayoutActions.event, dispose: () => { }, getActions: () => layoutActionsInTitleBar ? actions('toggleEditor', 'configureLayout') : [] };
				}
				return super.createMenu(id, menuContextKeyService);
			}
		}());
		const titleService = store.add(instantiationService.createInstance(TitleService));
		const part = store.add(titleService.createAuxiliaryTitlebarPart(container, new class extends mock<IEditorGroupsContainer>() { }(), instantiationService));
		const groups = {
			session: part.element.querySelector<HTMLElement>('.titlebar-session-actions-container')!,
			layout: part.element.querySelector<HTMLElement>('.titlebar-window-layout-container')!,
		};
		const titleBarContainer = part.element.querySelector<HTMLElement>('.sessions-titlebar-container')!;
		// The groups that show, their insets, and how far the last action that shows is from the end of the title bar: the
		// window's edge, or the window controls after the actions, such as of a title bar in a browser.
		const shownWindowControls = () => [...part.element.querySelectorAll<HTMLElement>('.titlebar-right > .window-controls-container')].find(element => element.getClientRects().length > 0);
		const read = (state: { customWindowControls?: boolean; fullscreen?: boolean } = {}) => {
			titleBarContainer.classList.toggle('custom-window-controls', !!state.customWindowControls);
			container.classList.toggle('fullscreen', !!state.fullscreen);
			part.layout(800, part.height, 0, 0);
			const shown = Object.entries(groups).filter(([, element]) => element.offsetWidth > 0);
			const lastItem = shown.at(-1)![1].querySelector('.action-item:last-child')!;
			return {
				last: Object.entries(groups).filter(([, element]) => element.classList.contains('titlebar-last-actions')).map(([name]) => name),
				insets: Object.fromEntries(shown.map(([name, element]) => [name, mainWindow.getComputedStyle(element).paddingRight])),
				edge: (shownWindowControls()?.getBoundingClientRect().left ?? part.element.getBoundingClientRect().right) - lastItem.getBoundingClientRect().right,
			};
		};
		const setLayoutActionsInTitleBar = (inTitleBar: boolean) => {
			layoutActionsInTitleBar = inTitleBar;
			onDidChangeLayoutActions.fire({ menu: upcastPartial<IMenu>({}), isStructuralChange: true, isEnablementChange: false, isToggleChange: false });
		};
		const states = () => ({ default: read(), customWindowControls: read({ customWindowControls: true }), customWindowControlsFullscreen: read({ customWindowControls: true, fullscreen: true }) });
		const inTitleBar = states();
		setLayoutActionsInTitleBar(false);
		const inStrip = states();
		setLayoutActionsInTitleBar(true);
		const backInTitleBar = read();
		const mainPart = store.add(instantiationService.createInstance(TitlebarPart, Parts.TITLEBAR_PART, mainWindow));
		mainPart.create(append(container, $('.part.titlebar')));

		const lastIs = (name: string, inset: number) => ({ last: [name], insets: name === 'layout' ? { session: '0px', layout: `${inset}px` } : { session: `${inset}px` }, edge: inset });
		assert.deepStrictEqual({ inTitleBar, inStrip, backInTitleBar, mainMarked: mainPart.element.querySelectorAll('.titlebar-last-actions').length }, {
			inTitleBar: { default: lastIs('layout', 8), customWindowControls: lastIs('layout', 8), customWindowControlsFullscreen: lastIs('layout', 8) },
			inStrip: { default: lastIs('session', 8), customWindowControls: lastIs('session', 8), customWindowControlsFullscreen: lastIs('session', 8) },
			backInTitleBar: lastIs('layout', 8),
			mainMarked: 0,
		});
	});

	for (const platform of ['mac', 'windows', 'linux', 'web']) {
		test(`uses the tighter ${platform} title-bar inset whenever right-side window controls take no space`, () => {
			const { part } = createTitlebar();
			const root = append(mainWindow.document.body, $(`.monaco-workbench.agent-sessions-workbench.${platform}`));
			store.add(toDisposable(() => root.remove()));
			root.style.cssText = 'width: 800px; --vscode-agents-layout-floatingPanelGap: 4px; --vscode-spacing-size40: 4px; --vscode-spacing-size80: 8px;';
			const content = append(append(root, $('.part.titlebar')), $('.titlebar-container.sessions-titlebar-container.has-center'));
			const left = append(content, $('.titlebar-left'));
			append(content, $('.titlebar-center'));
			const right = append(content, $('.titlebar-right'));
			const toolbar = append(right, $('.titlebar-actions-container.titlebar-right-layout-container'));
			const controls = append(right, $('.window-controls-container'));
			controls.style.width = '138px';
			Reflect.set(part, 'rootContainer', content);
			Reflect.set(part, 'rightContent', right);
			const read = () => {
				updateTitleBarToolBarOverflow.call(part);
				return {
					hasControls: right.classList.contains('has-window-controls'),
					inset: mainWindow.getComputedStyle(toolbar).paddingRight,
				};
			};
			const shown = read();
			controls.style.display = 'none';
			const hidden = read();
			controls.style.display = '';
			controls.style.width = '0px';
			const emptyOverlay = read();
			controls.style.width = '138px';
			const restored = read();
			root.classList.add('fullscreen');
			const fullscreen = read();
			root.classList.remove('fullscreen');
			const exitedFullscreen = read();
			left.appendChild(controls);
			const controlsOnLeft = read();
			right.appendChild(controls);
			const controlsOnRight = read();

			assert.deepStrictEqual({ shown, hidden, emptyOverlay, restored, fullscreen, exitedFullscreen, controlsOnLeft, controlsOnRight }, {
				shown: { hasControls: true, inset: '8px' },
				hidden: { hasControls: false, inset: '4px' },
				emptyOverlay: { hasControls: false, inset: '4px' },
				restored: { hasControls: true, inset: '8px' },
				fullscreen: { hasControls: false, inset: '4px' },
				exitedFullscreen: { hasControls: true, inset: '8px' },
				controlsOnLeft: { hasControls: false, inset: '4px' },
				controlsOnRight: { hasControls: true, inset: '8px' },
			});
		});

		for (const auxiliary of [false, true]) {
			test(`optically centers ${platform} ${auxiliary ? 'auxiliary' : 'main'} title-bar contents in default density`, () => {
				const root = append(mainWindow.document.body, $(`.monaco-workbench.agent-sessions-workbench.${platform}`));
				store.add(toDisposable(() => root.remove()));
				root.style.cssText = 'width: 800px; --vscode-spacing-size20: 2px; --vscode-spacing-size80: 8px; --vscode-spacing-size240: 24px; --vscode-commandCenter-border: transparent;';
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
				const screenReaderToolbar = append(right, $('.titlebar-actions-container.titlebar-screen-reader-container'));
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
				const screenReaderButtonBar = store.add(new ButtonBar(screenReaderToolbar));
				const screenReaderButton = screenReaderButtonBar.addButton({});
				screenReaderButton.label = 'Screen Reader Optimized';
				actions.push(screenReaderButton.element);

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
					const gap = (height - (index === 2 || index >= 4 ? 24 : 22)) / 2;
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
				root.style.cssText = 'width: 800px; --vscode-agents-layout-floatingPanelGap: 4px; --vscode-spacing-size80: 8px; --vscode-spacing-size40: 4px;';
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
				right.classList.toggle('has-window-controls', !!windowControls);

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
					rightAction: outerInset + (windowControls ? 8 + 138 : 4),
					rightActionWidth: 40,
					rightActionHeight: 22,
					windowControlsRight: windowControls ? outerInset : undefined,
				};
				assert.deepStrictEqual(states, [expected, expected, expected]);
			});
		}
	}

	test('aligns right-hand controls across themes and density transitions without resizing shared workbench controls', () => {
		const root = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench'));
		store.add(toDisposable(() => root.remove()));
		root.style.cssText = 'width: 800px; --vscode-spacing-size20: 2px; --vscode-spacing-size40: 4px; --vscode-spacing-size80: 8px; --vscode-spacing-size240: 24px; --vscode-cornerRadius-small: 4px; --vscode-cornerRadius-medium: 6px; --vscode-codiconFontSize: 16px;';
		const titlebar = append(root, $('.part.titlebar'));
		const content = append(titlebar, $('.titlebar-container.sessions-titlebar-container'));
		const right = append(content, $('.titlebar-right'));
		const toolbar = append(right, $('.titlebar-actions-container.titlebar-right-layout-container'));
		const actions = append(append(append(toolbar, $('.monaco-toolbar')), $('.monaco-action-bar')), $('ul.actions-container'));
		const changes = append(actions, $('li.action-item.changes-actions-bar'));
		const buttonBar = store.add(new ButtonBar(changes));
		const primary = buttonBar.addButton({});
		primary.label = 'Create PR';
		const split = buttonBar.addButtonWithDropdown({ actions: [], contextMenuProvider: { showContextMenu: () => { } } });
		split.label = 'Sync Changes';
		const secondary = buttonBar.addButton({ secondary: true });
		secondary.element.classList.add('monaco-text-button', 'codicon');
		const remote = append(append(actions, $('li.action-item')), $('a.action-label.codicon.tunnel-host-toggle'));
		append(append(remote, $('span.tunnel-host-icon')), $('span.codicon'));
		const layout = append(append(actions, $('li.action-item')), $('a.action-label.codicon'));
		const account = append(actions, $('li.action-item.sessions-account-titlebar-widget'));
		const avatar = append(account, $('img.sessions-account-titlebar-widget-avatar.visible'));
		const controls = [primary.element, split.element, secondary.element, remote, layout, account];
		const read = (element: HTMLElement) => {
			const bounds = element.getBoundingClientRect();
			const style = mainWindow.getComputedStyle(element);
			return { height: bounds.height, radius: style.borderRadius };
		};
		const states = ['vs', 'vs-dark', 'hc-black', 'hc-light'].flatMap(theme => {
			root.classList.add(theme);
			const states = [false, true, false].map(compact => {
				root.classList.toggle('modern-ui-compact', compact);
				titlebar.style.height = `${compact ? 35 : 44}px`;
				return {
					controls: controls.map(read),
					iconWidths: [secondary.element, remote, layout, account].map(element => element.getBoundingClientRect().width),
					gap: mainWindow.getComputedStyle(actions).gap,
					avatar: read(avatar),
					splitCorners: [...split.element.querySelectorAll<HTMLElement>('.monaco-button')].map(element => mainWindow.getComputedStyle(element).borderRadius),
					splitIconAlignment: mainWindow.getComputedStyle(split.element.querySelector<HTMLElement>('.monaco-dropdown-button')!).justifyContent,
				};
			});
			root.classList.remove(theme);
			return states;
		});
		const shared = append(mainWindow.document.body, $('.monaco-workbench'));
		store.add(toDisposable(() => shared.remove()));
		shared.style.setProperty('--vscode-cornerRadius-medium', '6px');
		const sharedActions = append(append(shared, $('.monaco-action-bar')), $('li.action-item'));
		const sharedAction = append(sharedActions, $('a.action-label.codicon'));
		const sharedRemote = append(sharedActions, $('a.action-label.codicon.tunnel-host-toggle'));
		sharedRemote.style.setProperty('--vscode-cornerRadius-small', '4px');

		assert.deepStrictEqual({ states, shared: read(sharedAction), sharedRemoteHeight: sharedRemote.getBoundingClientRect().height }, {
			states: Array.from({ length: 12 }, () => ({
				controls: controls.map((_, index) => ({ height: 24, radius: index === 1 ? '0px' : '4px' })),
				iconWidths: [24, 24, 24, 24],
				gap: '4px',
				avatar: { height: 18, radius: '50%' },
				splitCorners: ['4px 0px 0px 4px', '0px 4px 4px 0px'],
				splitIconAlignment: 'center',
			})),
			shared: { height: 22, radius: '6px' },
			sharedRemoteHeight: 16,
		});
	});

	test('keeps profile feedback immediate and badges stationary across motion settings', () => {
		const parent = append(mainWindow.document.body, $('div'));
		store.add(toDisposable(() => parent.remove()));
		const root = append(parent, $('.monaco-workbench.agent-sessions-workbench'));
		const account = append(root, $('.action-item.sessions-account-titlebar-widget', { tabindex: '0' }));
		const parts = [
			account,
			append(account, $('.sessions-account-titlebar-widget-icon')),
			append(account, $('.sessions-account-titlebar-widget-label')),
			append(account, $('.sessions-account-titlebar-widget-badge')),
		];
		const states = [parent, root].flatMap(motionContainer => ['monaco-enable-motion', 'monaco-reduce-motion', 'monaco-enable-motion'].flatMap(motion => {
			motionContainer.classList.add(motion);
			const states = [false, true, false].map(menuVisible => {
				account.classList.toggle('menu-visible', menuVisible);
				if (menuVisible) {
					account.focus();
				} else {
					account.blur();
				}
				return parts.map(element => {
					const style = mainWindow.getComputedStyle(element);
					return { transitionDuration: style.transitionDuration, animationName: style.animationName, transform: style.transform };
				});
			});
			motionContainer.classList.remove(motion);
			return states;
		}));

		assert.deepStrictEqual(states, Array.from({ length: 18 }, () => parts.map(() => ({
			transitionDuration: '0s', animationName: 'none', transform: 'none',
		}))));
	});

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

	for (const { name, classes, titlebarClasses = [], controlsOnLeft, gap } of [
		{ name: 'native macOS', classes: ['mac'], controlsOnLeft: true, gap: 16 },
		{ name: 'macOS fullscreen', classes: ['mac'], titlebarClasses: ['titlebar-fullscreen'], controlsOnLeft: true, gap: 8 },
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
			titlebar.classList.add(...titlebarClasses);
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

	test('tracks fullscreen of its own window on the title bar element', () => {
		const { part } = createTitlebar();
		const parent = $('div');
		(part as unknown as { createContentArea(parent: HTMLElement): HTMLElement }).createContentArea(parent);
		const initial = parent.classList.contains('titlebar-fullscreen');
		setFullscreen(true, mainWindow);
		store.add(toDisposable(() => setFullscreen(false, mainWindow)));
		const fullscreen = parent.classList.contains('titlebar-fullscreen');
		setFullscreen(false, mainWindow);

		assert.deepStrictEqual({ initial, fullscreen, restored: parent.classList.contains('titlebar-fullscreen') }, { initial: false, fullscreen: true, restored: false });
	});

	function createAuxiliaryTitlebar(options?: { createdBeforeInWindow?: boolean; hostFullscreen?: () => Promise<boolean | undefined> | boolean | undefined }) {
		const iframe = mainWindow.document.body.appendChild(mainWindow.document.createElement('iframe'));
		store.add(toDisposable(() => iframe.remove()));
		const auxiliaryWindow = iframe.contentWindow!;
		ensureCodeWindow(auxiliaryWindow, mainWindow.vscodeWindowId + 1000);
		store.add(registerWindow(auxiliaryWindow));
		// A window in full screen need not cover its screen, such as below the camera notch of a display or on an external display.
		const screen = { width: 3360, height: 1418 };
		Object.defineProperty(auxiliaryWindow, 'screen', { configurable: true, get: () => screen });
		Object.defineProperty(auxiliaryWindow, 'outerWidth', { configurable: true, get: () => 1512 });
		Object.defineProperty(auxiliaryWindow, 'outerHeight', { configurable: true, get: () => 944 });
		const { part } = createTitlebar();
		const hostQueries: CodeWindow[] = [];
		(part as unknown as { queryWindowFullscreen(targetWindow: CodeWindow): Promise<boolean | undefined> }).queryWindowFullscreen = async targetWindow => {
			hostQueries.push(targetWindow);
			return options?.hostFullscreen?.();
		};
		// Created before it is in its window, as the title row of a chat view is, it moves there.
		const parent = options?.createdBeforeInWindow ? mainWindow.document.createElement('div') : auxiliaryWindow.document.body.appendChild(auxiliaryWindow.document.createElement('div'));
		(part as unknown as { createContentArea(parent: HTMLElement): HTMLElement }).createContentArea(parent);
		if (options?.createdBeforeInWindow) {
			auxiliaryWindow.document.body.appendChild(parent);
			// As it is laid out in the window it moved to
			(part as unknown as { trackFullscreenOfWindow(): void }).trackFullscreenOfWindow();
		}
		store.add(toDisposable(() => {
			setFullscreen(false, mainWindow);
			setFullscreen(false, auxiliaryWindow);
		}));
		// Only native macOS reserves a spacer for the traffic lights.
		const hasTrafficLightSpacer = isMacintosh && isNative;
		const read = () => ({
			fullscreenClass: parent.classList.contains('titlebar-fullscreen'),
			spacer: hasTrafficLightSpacer ? parent.querySelector<HTMLElement>('.titlebar-left > .window-controls-container')!.style.display : 'absent',
		});
		return { auxiliaryWindow, part, read, hasTrafficLightSpacer, hostQueries };
	}

	test('tracks fullscreen of an auxiliary window independently of the main window', () => {
		const { auxiliaryWindow, read } = createAuxiliaryTitlebar();

		setFullscreen(true, mainWindow);
		const mainFullscreen = read().fullscreenClass;
		setFullscreen(false, mainWindow);
		setFullscreen(true, auxiliaryWindow);
		const auxiliaryFullscreen = read().fullscreenClass;
		setFullscreen(true, mainWindow);
		setFullscreen(false, auxiliaryWindow);
		const auxiliaryRestoredWhileMainFullscreen = read().fullscreenClass;

		assert.deepStrictEqual({ mainFullscreen, auxiliaryFullscreen, auxiliaryRestoredWhileMainFullscreen }, { mainFullscreen: false, auxiliaryFullscreen: true, auxiliaryRestoredWhileMainFullscreen: false });
	});

	test('a title bar created before it is in its window, such as the title row of a chat view, gives up the traffic-light inset while that window is fullscreen, and takes it back as it leaves fullscreen', () => {
		const { auxiliaryWindow, read, hasTrafficLightSpacer } = createAuxiliaryTitlebar({ createdBeforeInWindow: true });
		const windowed = read();
		setFullscreen(true, auxiliaryWindow);
		const fullscreen = read();
		setFullscreen(false, auxiliaryWindow);

		assert.deepStrictEqual({ windowed, fullscreen, windowedAgain: read() }, {
			windowed: { fullscreenClass: false, spacer: hasTrafficLightSpacer ? '' : 'absent' },
			fullscreen: { fullscreenClass: true, spacer: hasTrafficLightSpacer ? 'none' : 'absent' },
			windowedAgain: { fullscreenClass: false, spacer: hasTrafficLightSpacer ? '' : 'absent' },
		});
	});

	test('gives up the traffic-light inset for an auxiliary window in full screen that does not cover its screen, such as below a camera notch or on an external display, and takes it back as it leaves full screen', () => {
		const { auxiliaryWindow, read, hasTrafficLightSpacer } = createAuxiliaryTitlebar({ createdBeforeInWindow: true });
		setFullscreen(true, auxiliaryWindow);
		const fullscreen = read();
		setFullscreen(false, auxiliaryWindow);

		assert.deepStrictEqual({ fullscreen, windowed: read() }, {
			fullscreen: { fullscreenClass: true, spacer: hasTrafficLightSpacer ? 'none' : 'absent' },
			windowed: { fullscreenClass: false, spacer: hasTrafficLightSpacer ? '' : 'absent' },
		});
	});

	test('a stale full-screen state of an auxiliary window is corrected by its host once the window is done resizing, and the title bar moving to the window asks its host', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		let hostFullscreen: boolean | undefined = undefined;
		const { auxiliaryWindow, read, hasTrafficLightSpacer, hostQueries } = createAuxiliaryTitlebar({ createdBeforeInWindow: true, hostFullscreen: () => hostFullscreen });
		const askedOnMove = hostQueries.length;
		// The browser also resizes the frame as it lays it out, at times no test controls; each such resize may ask the host
		// once more.
		let browserResizes = 0;
		store.add(addDisposableListener(auxiliaryWindow, EventType.RESIZE, e => {
			if (e.isTrusted) {
				browserResizes++;
			}
		}));
		const resize = async () => {
			const askedBefore = hostQueries.length;
			const browserResizesBefore = browserResizes;
			// Many resize events as the window animates: the host is asked once, after the last
			for (let i = 0; i < 5; i++) {
				auxiliaryWindow.dispatchEvent(new UIEvent('resize'));
				await timeout(50);
			}
			await timeout(1000);
			const asked = hostQueries.length - askedBefore;
			// Not counting a query each of those resizes may have added
			return asked - Math.min(Math.max(asked - 1, 0), browserResizes - browserResizesBefore);
		};

		// Told it is in full screen, which it left without being told
		setFullscreen(true, auxiliaryWindow);
		const stale = read();
		hostFullscreen = false;
		const corrected = { asked: await resize(), ...read() };
		// And the other way
		hostFullscreen = true;
		const enteredUntold = { asked: await resize(), ...read() };

		assert.deepStrictEqual({ askedOnMove, stale, corrected, enteredUntold }, {
			askedOnMove: 1,
			stale: { fullscreenClass: true, spacer: hasTrafficLightSpacer ? 'none' : 'absent' },
			corrected: { fullscreenClass: false, spacer: hasTrafficLightSpacer ? '' : 'absent', asked: 1 },
			enteredUntold: { fullscreenClass: true, spacer: hasTrafficLightSpacer ? 'none' : 'absent', asked: 1 },
		});
	}));

	test('an answer of the host that comes after the title bar is disposed changes nothing', async () => {
		const answer = new DeferredPromise<boolean | undefined>();
		const { auxiliaryWindow, part, read } = createAuxiliaryTitlebar({ hostFullscreen: () => answer.p });
		const before = read();
		part.dispose();
		answer.complete(true);
		await timeout(0);

		assert.deepStrictEqual({ before, fullscreen: isFullscreen(auxiliaryWindow) }, { before: { fullscreenClass: false, spacer: before.spacer }, fullscreen: false });
	});

	test('a title bar created before it is in its window, such as the title row of a chat view, looks active while the window it is in is the active window, not while the main window is', () => {
		const { instantiationService } = createTitlebar();
		const onDidChangeActiveWindow = store.add(new Emitter<number>());
		instantiationService.stub(IHostService, 'onDidChangeActiveWindow', onDidChangeActiveWindow.event);
		const iframe = mainWindow.document.body.appendChild(mainWindow.document.createElement('iframe'));
		store.add(toDisposable(() => iframe.remove()));
		const auxiliaryWindow = iframe.contentWindow!;
		ensureCodeWindow(auxiliaryWindow, mainWindow.vscodeWindowId + 2000);
		store.add(registerWindow(auxiliaryWindow));
		// Created while not in its window yet: its window is the main window then.
		const part = store.add(instantiationService.createInstance(TitlebarPart, Parts.TITLEBAR_PART, mainWindow));
		part.create(auxiliaryWindow.document.body.appendChild(auxiliaryWindow.document.createElement('div')));
		const inactive = () => part.element.classList.contains('inactive');

		onDidChangeActiveWindow.fire(mainWindow.vscodeWindowId);
		const mainActive = inactive();
		onDidChangeActiveWindow.fire(auxiliaryWindow.vscodeWindowId);
		const ownActive = inactive();

		assert.deepStrictEqual({ mainActive, ownActive }, { mainActive: true, ownActive: false });
	});

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
