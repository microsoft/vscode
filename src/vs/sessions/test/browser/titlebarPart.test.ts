/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getZoomFactor, setZoomFactor } from '../../../base/browser/browser.js';
import { $, append } from '../../../base/browser/dom.js';
import { Direction, Grid, IView, Orientation, Sizing } from '../../../base/browser/ui/grid/grid.js';
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
import '../../browser/media/workbench.css';

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
		const grid = store.add(new Grid(titleView, { orientation: Orientation.VERTICAL }));
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

	for (const platform of ['mac', 'windows', 'web']) {
		for (const auxiliary of [false, true]) {
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
