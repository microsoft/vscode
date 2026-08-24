/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestColorTheme, TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { TestStorageService } from '../../../common/workbenchTestServices.js';
import { TestHostService, TestLayoutService } from '../../workbenchTestServices.js';
import { ActivitybarPart, ActivityBarCompositeBar } from '../../../../browser/parts/activitybar/activitybarPart.js';
import { IViewSize } from '../../../../../base/browser/ui/grid/grid.js';
import { LayoutSettings, Parts, Position } from '../../../../services/layout/browser/layoutService.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { IPaneCompositePart } from '../../../../browser/parts/paneCompositePart.js';
import { IPaneCompositeBarOptions } from '../../../../browser/parts/paneCompositeBar.js';
import { Event, Emitter } from '../../../../../base/common/event.js';
import { IPaneComposite } from '../../../../common/panecomposite.js';
import { Extensions, PaneCompositeDescriptor } from '../../../../browser/panecomposite.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ViewContainerLocation } from '../../../../common/views.js';
import { ACTIVITY_BAR_BACKGROUND, MODERN_ACTIVITY_BAR_BACKGROUND, MODERN_ACTIVITY_BAR_INACTIVE_BACKGROUND } from '../../../../common/theme.js';
import { ActionsOrientation } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { Dimension } from '../../../../../base/browser/dom.js';

interface ILayoutTestHarness {
	menuBarContainer: HTMLElement | undefined;
	globalCompositeBar: { element: HTMLElement } | undefined;
	options: { orientation: ActionsOrientation };
	compositeBar: { layout: (dimension: Dimension) => void };
}

// `super.layout()` resolves through the prototype chain, so calling the extracted method
// against a harness still runs the real `PaneCompositeBar.layout` and hands the resulting
// dimension to `compositeBar`.
const activityBarCompositeBarLayout = Reflect.get(ActivityBarCompositeBar.prototype, 'layout') as (this: ILayoutTestHarness, width: number, height: number) => void;


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
	});

	function createActivitybarPart(compact: boolean, floatingPanelsEnabled = false, sideBarPosition = Position.LEFT, colors: { [id: string]: string | undefined } = {}, instantiationService?: IInstantiationService): { part: ActivitybarPart; configService: TestConfigurationService; layoutService: TestFloatingPanelsLayoutService; hostService: TestHostService } {
		const configService = new TestConfigurationService({
			[LayoutSettings.ACTIVITY_BAR_COMPACT]: compact,
			[LayoutSettings.MODERN_UI]: floatingPanelsEnabled,
		});
		const storageService = disposables.add(new TestStorageService());
		const themeService = new TestThemeService(new TestColorTheme(colors));
		const layoutService = new TestFloatingPanelsLayoutService();
		const hostService = new TestHostService();
		layoutService.floatingPanelsEnabled = floatingPanelsEnabled;
		layoutService.sideBarPosition = sideBarPosition;

		// Override isVisible to return false so that create() does not call show()
		// and attempt to instantiate the composite bar (which requires a full DI setup).
		layoutService.isVisible = (_part: Parts) => false;

		// Stub instantiation service—createCompositeBar is only called in show(),
		// which we skip in unit tests focused on dimensions / style behaviour.
		const stubInstantiationService = instantiationService ?? { createInstance: () => { throw new Error('not expected'); } } as unknown as IInstantiationService;

		const part = disposables.add(new ActivitybarPart(
			ViewContainerLocation.Sidebar,
			new StubPaneCompositePart(),
			stubInstantiationService,
			layoutService,
			themeService,
			storageService,
			configService,
			hostService,
		));

		return { part, configService, layoutService, hostService };
	}

	function fireConfigChange(configService: TestConfigurationService, key: string): void {
		configService.onDidChangeConfigurationEmitter.fire({
			affectsConfiguration: (k: string) => k === key,
		} satisfies Partial<IConfigurationChangeEvent> as unknown as IConfigurationChangeEvent);
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
		assert.strictEqual(el.style.getPropertyValue('--activity-bar-action-gap'), '0px');
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
		assert.strictEqual(el.style.getPropertyValue('--activity-bar-action-gap'), '0px');
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
		assert.strictEqual(el.style.getPropertyValue('--activity-bar-action-gap'), `${ActivitybarPart.FLOATING_ACTION_GAP}px`);
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

	test('uses the inactive background only for inactive Modern UI windows', () => {
		const { part, configService, hostService } = createActivitybarPart(false, true, Position.LEFT, {
			[ACTIVITY_BAR_BACKGROUND]: '#123456',
			[MODERN_ACTIVITY_BAR_BACKGROUND]: '#abcdef',
			[MODERN_ACTIVITY_BAR_INACTIVE_BACKGROUND]: '#654321',
		});
		const el = document.createElement('div');
		fixture.appendChild(el);
		part.create(el);

		const activeModernBackground = el.style.backgroundColor;
		hostService.setFocus(false);
		const inactiveModernBackground = el.style.backgroundColor;
		configService.setUserConfiguration(LayoutSettings.MODERN_UI, false);
		fireConfigChange(configService, LayoutSettings.MODERN_UI);

		assert.deepStrictEqual({
			activeModernBackground,
			inactiveModernBackground,
			inactiveClassicBackground: el.style.backgroundColor,
		}, {
			activeModernBackground: 'rgb(171, 205, 239)',
			inactiveModernBackground: 'rgb(101, 67, 33)',
			inactiveClassicBackground: 'rgb(18, 52, 86)',
		});
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

	// --- composite bar item sizing -------------------------------------------

	// The composite bar decides how many activity icons fit before collapsing the rest into
	// the overflow ("Additional Views") menu, so the size it is handed has to match the
	// vertical space an item actually occupies in the current mode.
	function capturedCompositeBarOptions(compact: boolean, floatingPanelsEnabled: boolean): IPaneCompositeBarOptions {
		let captured: IPaneCompositeBarOptions | undefined;
		const stubCompositeBar = { create: () => { }, layout: () => { }, dispose: () => { } };
		const { part } = createActivitybarPart(compact, floatingPanelsEnabled, Position.LEFT, {}, {
			createInstance: (_descriptor: unknown, _location: unknown, options: IPaneCompositeBarOptions) => {
				captured = options;
				return stubCompositeBar;
			}
		} as unknown as IInstantiationService);

		const el = document.createElement('div');
		fixture.appendChild(el);
		part.create(el);
		part.show();

		return captured!;
	}

	test('composite bar item size tracks the rendered item stride in every mode', () => {
		const sizesFor = (compact: boolean, floatingPanelsEnabled: boolean) => {
			const { compositeSize, overflowActionSize } = capturedCompositeBarOptions(compact, floatingPanelsEnabled);
			return { compositeSize, overflowActionSize };
		};

		assert.deepStrictEqual(
			{
				classicDefault: sizesFor(false, false),
				classicCompact: sizesFor(true, false),
				modernDefault: sizesFor(false, true),
				modernCompact: sizesFor(true, true),
			},
			{
				// Items stack flush against each other, so the stride is just the action height.
				classicDefault: { compositeSize: 48, overflowActionSize: 48 },
				classicCompact: { compositeSize: 28, overflowActionSize: 28 },
				// Modern UI separates items with an 8px gap, but only at the default size.
				modernDefault: { compositeSize: 44, overflowActionSize: 44 },
				modernCompact: { compositeSize: 28, overflowActionSize: 28 },
			}
		);
	});

	// The gap is rendered *between* items, so N items occupy `N * height + (N - 1) * gap`.
	// `compositeSize` bakes a trailing gap into every item, which over-counts by exactly one
	// gap, so `layout()` hands that gap back to the composite bar. Without it the last item
	// is pushed into the overflow menu a gap earlier than it needs to be.
	function compositeBarLayoutHeight(compact: boolean, floatingPanelsEnabled: boolean): number {
		let layoutHeight = -1;
		const stubCompositeBar = {
			create: () => { },
			layout: (_width: number, height: number) => { layoutHeight = height; },
			dispose: () => { }
		};
		const { part, layoutService } = createActivitybarPart(compact, floatingPanelsEnabled, Position.LEFT, {}, {
			createInstance: () => stubCompositeBar
		} as unknown as IInstantiationService);

		const el = document.createElement('div');
		fixture.appendChild(el);
		part.create(el);
		part.show();

		// A visible title and status bar means neither edge is a window edge.
		const visible = new Set([Parts.TITLEBAR_PART, Parts.STATUSBAR_PART]);
		layoutService.isVisible = (partId: Parts) => visible.has(partId);
		part.layout(100, 300);

		return layoutHeight;
	}

	test('composite bar is given back the leading item gap it does not render', () => {
		const margin = ActivitybarPart.FLOATING_MARGIN;

		assert.deepStrictEqual(
			{
				classicDefault: compositeBarLayoutHeight(false, false),
				classicCompact: compositeBarLayoutHeight(true, false),
				modernDefault: compositeBarLayoutHeight(false, true),
				modernCompact: compositeBarLayoutHeight(true, true),
			},
			{
				// No floating gutters and no gap between items.
				classicDefault: 300,
				classicCompact: 300,
				// Floating reserves a bottom gutter; the 8px gap is then handed back.
				modernDefault: 300 - margin + ActivitybarPart.FLOATING_ACTION_GAP,
				modernCompact: 300 - margin,
			}
		);
	});

	// --- global activity icons reservation -----------------------------------

	// The global (Accounts/Manage) icons are a separate action bar stacked beneath the view
	// containers, so the room they take has to be measured rather than derived from the item
	// size: the gap sits only *between* items, so N icons occupy N * height + (N - 1) * gap.
	function heightLeftForCompositeBar(globalActionCount: number, itemHeight: number, gap: number): number {
		const globalBarElement = document.createElement('div');
		for (let i = 0; i < globalActionCount; i++) {
			const item = document.createElement('div');
			item.style.height = `${itemHeight}px`;
			if (i > 0) {
				item.style.marginTop = `${gap}px`;
			}
			globalBarElement.appendChild(item);
		}
		fixture.appendChild(globalBarElement);

		let laidOut: Dimension | undefined;
		activityBarCompositeBarLayout.call({
			menuBarContainer: undefined,
			globalCompositeBar: { element: globalBarElement },
			options: { orientation: ActionsOrientation.VERTICAL },
			compositeBar: { layout: dimension => { laidOut = dimension; } },
		}, ActivitybarPart.FLOATING_ACTIVITYBAR_WIDTH, 300);

		return laidOut!.height;
	}

	test('reserves the measured height of the global activity icons', () => {
		const gap = ActivitybarPart.FLOATING_ACTION_GAP;
		const itemHeight = ActivitybarPart.FLOATING_ACTION_HEIGHT;

		assert.deepStrictEqual(
			{
				oneGlobalAction: heightLeftForCompositeBar(1, itemHeight, gap),
				twoGlobalActions: heightLeftForCompositeBar(2, itemHeight, gap),
			},
			{
				// A lone icon has no gap at all, so it occupies exactly its own height.
				oneGlobalAction: 300 - itemHeight,
				// Two icons share a single gap: 36 + 8 + 36 = 80, not 2 * (36 + 8) = 88.
				twoGlobalActions: 300 - (itemHeight * 2 + gap),
			}
		);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
