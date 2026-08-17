/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { ActionsOrientation } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { EventType, ModifierKeyEmitter } from '../../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { isMacintosh, isNative } from '../../../../../base/common/platform.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { MenuSettings } from '../../../../../platform/window/common/window.js';
import { TestStorageService } from '../../../common/workbenchTestServices.js';
import { TestLayoutService, TestViewsService, workbenchInstantiationService } from '../../workbenchTestServices.js';
import { ActivityBarCompositeBar, ActivitybarPart } from '../../../../browser/parts/activitybar/activitybarPart.js';
import { CustomMenubarControl } from '../../../../browser/parts/titlebar/menubarControl.js';
import { IViewSize } from '../../../../../base/browser/ui/grid/grid.js';
import { LayoutSettings, Parts, Position } from '../../../../services/layout/browser/layoutService.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { IPaneCompositePart } from '../../../../browser/parts/paneCompositePart.js';
import { Event, Emitter } from '../../../../../base/common/event.js';
import { IPaneComposite } from '../../../../common/panecomposite.js';
import { Extensions, PaneCompositeDescriptor } from '../../../../browser/panecomposite.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IViewDescriptorService, ViewContainer, ViewContainerLocation } from '../../../../common/views.js';
import { IPaneCompositeBarOptions } from '../../../../browser/parts/paneCompositeBar.js';
import { HoverPosition } from '../../../../../base/browser/ui/hover/hoverWidget.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';

class StubPaneCompositePart implements IPaneCompositePart {
	declare readonly _serviceBrand: undefined;
	readonly partId = Parts.SIDEBAR_PART;
	readonly registryId = Extensions.Viewlets;
	element: HTMLElement = undefined!;
	minimumWidth = 0;
	maximumWidth = 0;
	minimumHeight = 0;
	maximumHeight = 0;
	onDidChange = Event.None;
	onDidPaneCompositeOpen = new Emitter<IPaneComposite>().event;
	onDidPaneCompositeClose = new Emitter<IPaneComposite>().event;
	openPaneComposite(): Promise<IPaneComposite | undefined> { return Promise.resolve(undefined); }
	getPaneComposites(): PaneCompositeDescriptor[] { return []; }
	getPaneComposite(): PaneCompositeDescriptor | undefined { return undefined; }
	getActivePaneComposite(): IPaneComposite | undefined { return undefined; }
	getProgressIndicator() { return undefined; }
	hideActivePaneComposite(): void { }
	getLastActivePaneCompositeId(): string { return ''; }
	getPinnedPaneCompositeIds(): string[] { return []; }
	getVisiblePaneCompositeIds(): string[] { return []; }
	getPaneCompositeIds(): string[] { return []; }
	layout(): void { }
	dispose(): void { }
}

class TestFloatingPanelsLayoutService extends TestLayoutService {
	floatingPanelsEnabled = false;
	sideBarPosition = Position.LEFT;
	override isFloatingPanelsEnabled(): boolean { return this.floatingPanelsEnabled; }
	override getSideBarPosition(): Position { return this.sideBarPosition; }
}

class TestViewDescriptorService extends mock<IViewDescriptorService>() {
	override readonly viewContainers: readonly ViewContainer[] = [];
	override readonly onDidChangeViewContainers = Event.None;
	override readonly onDidChangeContainerLocation = Event.None;
	override readonly onDidChangeContainer = Event.None;
	override readonly onDidChangeLocation = Event.None;

	override getViewContainersByLocation(): ViewContainer[] {
		return [];
	}
}

class TestCompactMenubarControl {
	private button: HTMLElement | undefined;

	create(parent: HTMLElement): HTMLElement {
		this.dispose();
		this.button = document.createElement('div');
		this.button.setAttribute('aria-label', 'Application Menu');
		this.button.tabIndex = 0;
		parent.appendChild(this.button);
		return parent;
	}

	toggleFocus(): void {
		this.button?.focus();
	}

	dispose(): void {
		this.button?.remove();
		this.button = undefined;
	}
}

suite('ActivitybarPart', () => {

	const disposables = new DisposableStore();

	let fixture: HTMLElement;
	const fixtureId = 'activitybar-part-fixture';

	setup(() => {
		fixture = document.createElement('div');
		fixture.id = fixtureId;
		mainWindow.document.body.appendChild(fixture);
	});

	teardown(() => {
		fixture.remove();
		disposables.clear();
		ModifierKeyEmitter.disposeInstance();
		sinon.restore();
	});

	function createActivitybarPart(compact: boolean, floatingPanelsEnabled = false, sideBarPosition = Position.LEFT): { part: ActivitybarPart; configService: TestConfigurationService; layoutService: TestFloatingPanelsLayoutService } {
		const configService = new TestConfigurationService({
			[LayoutSettings.ACTIVITY_BAR_COMPACT]: compact,
			[LayoutSettings.MODERN_UI]: floatingPanelsEnabled,
		});
		const storageService = disposables.add(new TestStorageService());
		const themeService = new TestThemeService();
		const layoutService = new TestFloatingPanelsLayoutService();
		layoutService.floatingPanelsEnabled = floatingPanelsEnabled;
		layoutService.sideBarPosition = sideBarPosition;

		// Override isVisible to return false so that create() does not call show()
		// and attempt to instantiate the composite bar (which requires a full DI setup).
		layoutService.isVisible = (_part: Parts) => false;

		// Stub instantiation service—createCompositeBar is only called in show(),
		// which we skip in unit tests focused on dimensions / style behaviour.
		const stubInstantiationService = { createInstance: () => { throw new Error('not expected'); } } as unknown as IInstantiationService;

		const part = disposables.add(new ActivitybarPart(
			ViewContainerLocation.Sidebar,
			new StubPaneCompositePart(),
			stubInstantiationService,
			layoutService,
			themeService,
			storageService,
			configService,
		));

		return { part, configService, layoutService };
	}

	function fireConfigChange(configService: TestConfigurationService, key: string): void {
		configService.onDidChangeConfigurationEmitter.fire({
			affectsConfiguration: (k: string) => k === key,
		} satisfies Partial<IConfigurationChangeEvent> as unknown as IConfigurationChangeEvent);
	}

	function dispatchKeyboardEvent(element: HTMLElement, type: string, keyCode: number): void {
		const event = new KeyboardEvent(type, { bubbles: true });
		Object.defineProperty(event, 'keyCode', { get: () => keyCode });
		element.dispatchEvent(event);
	}

	function createActivityBarCompositeBar(configService: TestConfigurationService): ActivityBarCompositeBar {
		const instantiationService = workbenchInstantiationService({ configurationService: () => configService }, disposables);
		instantiationService.stubInstance(CustomMenubarControl, new TestCompactMenubarControl());
		instantiationService.stub(IViewDescriptorService, new TestViewDescriptorService());
		instantiationService.stub(IViewsService, new TestViewsService());

		const options: IPaneCompositeBarOptions = {
			partContainerClass: 'activitybar',
			pinnedViewContainersKey: 'activitybar.test.pinned',
			placeholderViewContainersKey: 'activitybar.test.placeholder',
			viewContainersWorkspaceStateKey: 'activitybar.test.workspace',
			orientation: ActionsOrientation.VERTICAL,
			icon: true,
			iconSize: 16,
			recomputeSizes: false,
			activityHoverOptions: { position: () => HoverPosition.RIGHT },
			fillExtraContextMenuActions: () => { },
			compositeSize: 52,
			overflowActionSize: 48,
			colors: () => ({
				activeForegroundColor: undefined,
				inactiveForegroundColor: undefined,
				activeBorderColor: undefined,
				activeBackground: undefined,
				badgeBackground: undefined,
				badgeForeground: undefined,
				dragAndDropBorder: undefined,
				activeBackgroundColor: undefined,
				inactiveBackgroundColor: undefined,
				activeBorderBottomColor: undefined,
			})
		};

		return disposables.add(instantiationService.createInstance(ActivityBarCompositeBar, ViewContainerLocation.Sidebar, options, Parts.ACTIVITYBAR_PART, new StubPaneCompositePart(), false));
	}

	// --- Static constants ---------------------------------------------------

	test('default constants match expected dimensions', () => {
		assert.deepStrictEqual(
			{
				width: ActivitybarPart.ACTIVITYBAR_WIDTH,
				actionHeight: ActivitybarPart.ACTION_HEIGHT,
				iconSize: ActivitybarPart.ICON_SIZE,
			},
			{
				width: 48,
				actionHeight: 48,
				iconSize: 24,
			}
		);
	});

	test('compact constants match reduced dimensions', () => {
		assert.deepStrictEqual(
			{
				width: ActivitybarPart.COMPACT_ACTIVITYBAR_WIDTH,
				actionHeight: ActivitybarPart.COMPACT_ACTION_HEIGHT,
				iconSize: ActivitybarPart.COMPACT_ICON_SIZE,
			},
			{
				width: 36,
				actionHeight: 28,
				iconSize: 16,
			}
		);
	});

	test('floating constants are narrower than default', () => {
		assert.deepStrictEqual(
			{
				width: ActivitybarPart.FLOATING_ACTIVITYBAR_WIDTH,
				actionHeight: ActivitybarPart.FLOATING_ACTION_HEIGHT,
				compactWidth: ActivitybarPart.FLOATING_COMPACT_ACTIVITYBAR_WIDTH,
			},
			{
				width: 36,
				actionHeight: 36,
				compactWidth: 28,
			}
		);
	});

	// --- Dimension getters --------------------------------------------------

	test('default mode returns default width constraints', () => {
		const { part } = createActivitybarPart(false);
		assert.deepStrictEqual(
			{ min: part.minimumWidth, max: part.maximumWidth },
			{ min: ActivitybarPart.ACTIVITYBAR_WIDTH, max: ActivitybarPart.ACTIVITYBAR_WIDTH }
		);
	});

	test('compact mode returns compact width constraints', () => {
		const { part } = createActivitybarPart(true);
		assert.deepStrictEqual(
			{ min: part.minimumWidth, max: part.maximumWidth },
			{ min: ActivitybarPart.COMPACT_ACTIVITYBAR_WIDTH, max: ActivitybarPart.COMPACT_ACTIVITYBAR_WIDTH }
		);
	});

	test('height constraints are unbounded', () => {
		const { part } = createActivitybarPart(false);
		assert.strictEqual(part.minimumHeight, 0);
		assert.strictEqual(part.maximumHeight, Number.POSITIVE_INFINITY);
	});

	test('floating panels reserves outer padding on the left', () => {
		const { part } = createActivitybarPart(false, true);

		assert.deepStrictEqual(
			{ min: part.minimumWidth, max: part.maximumWidth },
			{
				min: ActivitybarPart.FLOATING_ACTIVITYBAR_WIDTH + ActivitybarPart.FLOATING_MARGIN * 2,
				max: ActivitybarPart.FLOATING_ACTIVITYBAR_WIDTH + ActivitybarPart.FLOATING_MARGIN * 2,
			}
		);
	});

	test('floating panels reserves a 4px inner gap and both gutters on the right', () => {
		const { part } = createActivitybarPart(false, true, Position.RIGHT);

		assert.deepStrictEqual(
			{ min: part.minimumWidth, max: part.maximumWidth },
			{
				min: ActivitybarPart.FLOATING_ACTIVITYBAR_WIDTH + ActivitybarPart.FLOATING_MARGIN * 3,
				max: ActivitybarPart.FLOATING_ACTIVITYBAR_WIDTH + ActivitybarPart.FLOATING_MARGIN * 3,
			}
		);
	});

	// --- Configuration change: dimension update ----------------------------

	test('toggling compact via config changes width constraints', () => {
		const { part, configService } = createActivitybarPart(false);

		// Initially default
		assert.strictEqual(part.minimumWidth, ActivitybarPart.ACTIVITYBAR_WIDTH);

		// Switch to compact
		configService.setUserConfiguration(LayoutSettings.ACTIVITY_BAR_COMPACT, true);
		fireConfigChange(configService, LayoutSettings.ACTIVITY_BAR_COMPACT);

		assert.deepStrictEqual(
			{ min: part.minimumWidth, max: part.maximumWidth },
			{ min: ActivitybarPart.COMPACT_ACTIVITYBAR_WIDTH, max: ActivitybarPart.COMPACT_ACTIVITYBAR_WIDTH }
		);

		// Switch back to default
		configService.setUserConfiguration(LayoutSettings.ACTIVITY_BAR_COMPACT, false);
		fireConfigChange(configService, LayoutSettings.ACTIVITY_BAR_COMPACT);

		assert.deepStrictEqual(
			{ min: part.minimumWidth, max: part.maximumWidth },
			{ min: ActivitybarPart.ACTIVITYBAR_WIDTH, max: ActivitybarPart.ACTIVITYBAR_WIDTH }
		);
	});

	(isMacintosh && isNative ? test.skip : test)('Modern UI menu bar visibility preserves compact menu keyboard navigation', async () => {
		const configService = new TestConfigurationService({
			[LayoutSettings.MODERN_UI]: true,
			[MenuSettings.MenuBarVisibility]: 'compact'
		});
		const compositeBar = createActivityBarCompositeBar(configService);
		const focusSpy = sinon.spy(compositeBar, 'focus');
		compositeBar.create(fixture);
		const menuCounts = [fixture.querySelectorAll('.menubar').length];

		for (const visibility of ['visible', 'hidden', 'compact', 'compact']) {
			await configService.setUserConfiguration(MenuSettings.MenuBarVisibility, visibility);
			fireConfigChange(configService, MenuSettings.MenuBarVisibility);
			menuCounts.push(fixture.querySelectorAll('.menubar').length);
		}

		focusSpy.resetHistory();
		const applicationMenu = fixture.querySelector<HTMLElement>('[aria-label="Application Menu"]')!;
		dispatchKeyboardEvent(applicationMenu, EventType.KEY_DOWN, 39);
		dispatchKeyboardEvent(applicationMenu, EventType.KEY_UP, 39);
		dispatchKeyboardEvent(applicationMenu, EventType.KEY_DOWN, 40);

		assert.deepStrictEqual({
			menuCounts,
			focusCount: focusSpy.callCount
		}, {
			menuCounts: [1, 0, 0, 1, 1],
			focusCount: 1
		});
	});

	// --- onDidChange fires for grid ----------------------------------------

	test('fires onDidChange(undefined) when compact setting changes', () => {
		const { part, configService } = createActivitybarPart(false);

		const events: (IViewSize | undefined)[] = [];
		disposables.add(part.onDidChange(e => events.push(e)));

		// Toggle to compact
		configService.setUserConfiguration(LayoutSettings.ACTIVITY_BAR_COMPACT, true);
		fireConfigChange(configService, LayoutSettings.ACTIVITY_BAR_COMPACT);

		assert.strictEqual(events.length, 1);
		assert.strictEqual(events[0], undefined, 'should fire undefined to signal constraint change');

		// Toggle back
		configService.setUserConfiguration(LayoutSettings.ACTIVITY_BAR_COMPACT, false);
		fireConfigChange(configService, LayoutSettings.ACTIVITY_BAR_COMPACT);

		assert.strictEqual(events.length, 2);
		assert.strictEqual(events[1], undefined);
	});

	test('does not fire onDidChange for unrelated config changes', () => {
		const { part, configService } = createActivitybarPart(false);

		const events: (IViewSize | undefined)[] = [];
		disposables.add(part.onDidChange(e => events.push(e)));

		fireConfigChange(configService, 'editor.fontSize');

		assert.strictEqual(events.length, 0);
	});

	test('fires onDidChange(undefined) when floating panels setting changes', () => {
		const { part, configService, layoutService } = createActivitybarPart(false, false);

		const events: (IViewSize | undefined)[] = [];
		disposables.add(part.onDidChange(e => events.push(e)));

		layoutService.floatingPanelsEnabled = true;
		configService.setUserConfiguration(LayoutSettings.MODERN_UI, true);
		fireConfigChange(configService, LayoutSettings.MODERN_UI);

		assert.deepStrictEqual(events, [undefined]);
		assert.strictEqual(part.minimumWidth, ActivitybarPart.FLOATING_ACTIVITYBAR_WIDTH + ActivitybarPart.FLOATING_MARGIN * 2);
	});

	// --- CSS custom properties on element -----------------------------------

	test('updateCompactStyle sets correct CSS custom properties in default mode', () => {
		const { part } = createActivitybarPart(false);

		const el = document.createElement('div');
		fixture.appendChild(el);
		part.create(el);

		assert.strictEqual(el.style.getPropertyValue('--activity-bar-width'), `${ActivitybarPart.ACTIVITYBAR_WIDTH}px`);
		assert.strictEqual(el.style.getPropertyValue('--activity-bar-action-height'), `${ActivitybarPart.ACTION_HEIGHT}px`);
		assert.strictEqual(el.style.getPropertyValue('--activity-bar-icon-size'), `${ActivitybarPart.ICON_SIZE}px`);
		assert.strictEqual(el.classList.contains('compact'), false);
	});

	test('updateCompactStyle sets correct CSS custom properties in compact mode', () => {
		const { part } = createActivitybarPart(true);

		const el = document.createElement('div');
		fixture.appendChild(el);
		part.create(el);

		assert.strictEqual(el.style.getPropertyValue('--activity-bar-width'), `${ActivitybarPart.COMPACT_ACTIVITYBAR_WIDTH}px`);
		assert.strictEqual(el.style.getPropertyValue('--activity-bar-action-height'), `${ActivitybarPart.COMPACT_ACTION_HEIGHT}px`);
		assert.strictEqual(el.style.getPropertyValue('--activity-bar-icon-size'), `${ActivitybarPart.COMPACT_ICON_SIZE}px`);
		assert.strictEqual(el.classList.contains('compact'), true);
	});

	test('updateCompactStyle sets correct CSS custom properties in floating mode', () => {
		const { part } = createActivitybarPart(false, true);

		const el = document.createElement('div');
		fixture.appendChild(el);
		part.create(el);

		assert.strictEqual(el.style.getPropertyValue('--activity-bar-width'), `${ActivitybarPart.FLOATING_ACTIVITYBAR_WIDTH}px`);
		assert.strictEqual(el.style.getPropertyValue('--activity-bar-action-height'), `${ActivitybarPart.FLOATING_ACTION_HEIGHT}px`);
		assert.strictEqual(el.style.getPropertyValue('--activity-bar-icon-size'), `${ActivitybarPart.ICON_SIZE}px`);
		assert.strictEqual(el.classList.contains('compact'), false);
	});

	test('toggling compact updates CSS custom properties on element', () => {
		const { part, configService } = createActivitybarPart(false);

		const el = document.createElement('div');
		fixture.appendChild(el);
		part.create(el);

		// Default state
		assert.strictEqual(el.style.getPropertyValue('--activity-bar-width'), `${ActivitybarPart.ACTIVITYBAR_WIDTH}px`);
		assert.strictEqual(el.classList.contains('compact'), false);

		// Switch to compact
		configService.setUserConfiguration(LayoutSettings.ACTIVITY_BAR_COMPACT, true);
		fireConfigChange(configService, LayoutSettings.ACTIVITY_BAR_COMPACT);

		assert.strictEqual(el.style.getPropertyValue('--activity-bar-width'), `${ActivitybarPart.COMPACT_ACTIVITYBAR_WIDTH}px`);
		assert.strictEqual(el.style.getPropertyValue('--activity-bar-action-height'), `${ActivitybarPart.COMPACT_ACTION_HEIGHT}px`);
		assert.strictEqual(el.style.getPropertyValue('--activity-bar-icon-size'), `${ActivitybarPart.COMPACT_ICON_SIZE}px`);
		assert.strictEqual(el.classList.contains('compact'), true);

		// Switch back
		configService.setUserConfiguration(LayoutSettings.ACTIVITY_BAR_COMPACT, false);
		fireConfigChange(configService, LayoutSettings.ACTIVITY_BAR_COMPACT);

		assert.strictEqual(el.style.getPropertyValue('--activity-bar-width'), `${ActivitybarPart.ACTIVITYBAR_WIDTH}px`);
		assert.strictEqual(el.style.getPropertyValue('--activity-bar-action-height'), `${ActivitybarPart.ACTION_HEIGHT}px`);
		assert.strictEqual(el.style.getPropertyValue('--activity-bar-icon-size'), `${ActivitybarPart.ICON_SIZE}px`);
		assert.strictEqual(el.classList.contains('compact'), false);
	});

	// --- toJSON ------------------------------------------------------------

	test('toJSON returns correct part type', () => {
		const { part } = createActivitybarPart(false);
		assert.deepStrictEqual(part.toJSON(), { type: Parts.ACTIVITYBAR_PART });
	});

	// --- layout: floating panels gutter reservation -------------------------

	// The part has no title, header or footer, so the content area ends up exactly the height `layout()` reserved.
	function layoutContentHeight(visibleParts: Parts[], floatingPanelsEnabled = true): number {
		const { part, layoutService } = createActivitybarPart(false, floatingPanelsEnabled);
		const el = document.createElement('div');
		fixture.appendChild(el);
		part.create(el);

		const visible = new Set(visibleParts);
		layoutService.isVisible = (partId: Parts) => visible.has(partId);
		part.layout(100, 300);

		const content = el.querySelector<HTMLElement>('.content');
		return parseInt(content!.style.height, 10);
	}

	test('reserves a doubled gutter on each window edge the activity bar faces', () => {
		const margin = ActivitybarPart.FLOATING_MARGIN;
		const actual = {
			// Windowed default: a title bar above and a status bar below, so neither is a window edge.
			titleAndStatusBarVisible: layoutContentHeight([Parts.TITLEBAR_PART, Parts.STATUSBAR_PART]),

			// Native fullscreen: nothing above the middle section, so the top is a window edge.
			titleBarHidden: layoutContentHeight([Parts.STATUSBAR_PART]),

			// A visible banner still occupies the row above, so the top is not a window edge.
			bannerInsteadOfTitleBar: layoutContentHeight([Parts.BANNER_PART, Parts.STATUSBAR_PART]),

			// Hidden status bar: the activity bar now reaches the window bottom edge.
			statusBarHidden: layoutContentHeight([Parts.TITLEBAR_PART]),

			// Both edges at once.
			bothEdgesExposed: layoutContentHeight([]),

			// Experiment disabled: the activity bar is not a floating card, so no gutters at all.
			floatingPanelsDisabled: layoutContentHeight([], false),
		};

		assert.deepStrictEqual(actual, {
			titleAndStatusBarVisible: 300 - margin,
			titleBarHidden: 300 - margin * 2 - margin,
			bannerInsteadOfTitleBar: 300 - margin,
			statusBarHidden: 300 - margin * 2,
			bothEdgesExposed: 300 - margin * 2 - margin * 2,
			floatingPanelsDisabled: 300,
		});
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
