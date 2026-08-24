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
import { ActivitybarPart } from '../../../../browser/parts/activitybar/activitybarPart.js';
import { IViewSize } from '../../../../../base/browser/ui/grid/grid.js';
import { COMPACT_FLOATING_PANEL_OUTER_MARGIN, LayoutSettings, ModernUIDensity, Parts, Position } from '../../../../services/layout/browser/layoutService.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { IPaneCompositePart } from '../../../../browser/parts/paneCompositePart.js';
import { Event, Emitter } from '../../../../../base/common/event.js';
import { IPaneComposite } from '../../../../common/panecomposite.js';
import { Extensions, PaneCompositeDescriptor } from '../../../../browser/panecomposite.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ViewContainerLocation } from '../../../../common/views.js';
import { ACTIVITY_BAR_BACKGROUND, MODERN_ACTIVITY_BAR_BACKGROUND, MODERN_ACTIVITY_BAR_INACTIVE_BACKGROUND } from '../../../../common/theme.js';

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
	modernUICompact = false;
	sideBarPosition = Position.LEFT;
	override isFloatingPanelsEnabled(): boolean { return this.floatingPanelsEnabled; }
	override isModernUICompact(): boolean { return this.modernUICompact; }
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

	function createActivitybarPart(compact: boolean, floatingPanelsEnabled = false, sideBarPosition = Position.LEFT, colors: { [id: string]: string | undefined } = {}, modernUICompact = false): { part: ActivitybarPart; configService: TestConfigurationService; layoutService: TestFloatingPanelsLayoutService; hostService: TestHostService } {
		const configService = new TestConfigurationService({
			[LayoutSettings.ACTIVITY_BAR_COMPACT]: compact,
			[LayoutSettings.MODERN_UI]: floatingPanelsEnabled,
			[LayoutSettings.MODERN_UI_DENSITY]: modernUICompact ? ModernUIDensity.Compact : ModernUIDensity.Default,
		});
		const storageService = disposables.add(new TestStorageService());
		const themeService = new TestThemeService(new TestColorTheme(colors));
		const layoutService = new TestFloatingPanelsLayoutService();
		const hostService = new TestHostService();
		layoutService.floatingPanelsEnabled = floatingPanelsEnabled;
		layoutService.modernUICompact = modernUICompact;
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

	test('floating panels reserves the cluster perimeter, plus a leading gap only for a standalone right-hand rail', () => {
		const base = ActivitybarPart.FLOATING_ACTIVITYBAR_WIDTH + ActivitybarPart.FLOATING_MARGIN + ActivitybarPart.FLOATING_LANE;
		const withLeadingGap = base + ActivitybarPart.FLOATING_MARGIN;

		const widthOf = (sideBarPosition: Position, sideBarVisible: boolean, modernUICompact = false) => {
			const { part, layoutService } = createActivitybarPart(false, true, sideBarPosition, {}, modernUICompact);
			layoutService.isVisible = (partId: Parts) => partId === Parts.SIDEBAR_PART && sideBarVisible;
			return part.minimumWidth;
		};

		assert.deepStrictEqual({
			left: widthOf(Position.LEFT, true),
			leftCollapsed: widthOf(Position.LEFT, false),
			right: widthOf(Position.RIGHT, true),
			rightCollapsed: widthOf(Position.RIGHT, false),
			compactRightCollapsed: widthOf(Position.RIGHT, false, true),
		}, {
			left: base,
			leftCollapsed: base,
			right: base,
			// Only here does the rail follow another card and have to supply the gap itself.
			rightCollapsed: withLeadingGap,
			// Compact keeps its cards joined edge to edge, so no gap is ever needed.
			compactRightCollapsed: ActivitybarPart.FLOATING_ACTIVITYBAR_WIDTH + COMPACT_FLOATING_PANEL_OUTER_MARGIN + ActivitybarPart.FLOATING_COMPACT_LANE,
		});
	});

	test('compact Modern UI density reserves the connected cluster perimeter and rail padding', () => {
		const { part } = createActivitybarPart(false, true, Position.LEFT, {}, true);

		assert.deepStrictEqual(
			{ min: part.minimumWidth, max: part.maximumWidth },
			{
				min: ActivitybarPart.FLOATING_ACTIVITYBAR_WIDTH + COMPACT_FLOATING_PANEL_OUTER_MARGIN + ActivitybarPart.FLOATING_COMPACT_LANE,
				max: ActivitybarPart.FLOATING_ACTIVITYBAR_WIDTH + COMPACT_FLOATING_PANEL_OUTER_MARGIN + ActivitybarPart.FLOATING_COMPACT_LANE,
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
		assert.strictEqual(part.minimumWidth, ActivitybarPart.FLOATING_ACTIVITYBAR_WIDTH + ActivitybarPart.FLOATING_MARGIN + ActivitybarPart.FLOATING_LANE);
	});

	test('fires onDidChange(undefined) when Modern UI density changes', () => {
		const { part, configService, layoutService } = createActivitybarPart(false, true);
		const events: (IViewSize | undefined)[] = [];
		disposables.add(part.onDidChange(e => events.push(e)));

		layoutService.modernUICompact = true;
		configService.setUserConfiguration(LayoutSettings.MODERN_UI_DENSITY, ModernUIDensity.Compact);
		fireConfigChange(configService, LayoutSettings.MODERN_UI_DENSITY);

		assert.deepStrictEqual({
			events,
			minimumWidth: part.minimumWidth,
		}, {
			events: [undefined],
			minimumWidth: ActivitybarPart.FLOATING_ACTIVITYBAR_WIDTH + COMPACT_FLOATING_PANEL_OUTER_MARGIN * 2,
		});
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

	test('updateCompactStyle sets compact Modern UI density properties', () => {
		const { part } = createActivitybarPart(false, true, Position.LEFT, {}, true);
		const element = document.createElement('div');
		fixture.appendChild(element);
		part.create(element);

		assert.deepStrictEqual({
			width: element.style.getPropertyValue('--activity-bar-width'),
			actionHeight: element.style.getPropertyValue('--activity-bar-action-height'),
			iconSize: element.style.getPropertyValue('--activity-bar-icon-size'),
		}, {
			width: `${ActivitybarPart.FLOATING_ACTIVITYBAR_WIDTH}px`,
			actionHeight: `${ActivitybarPart.FLOATING_ACTION_HEIGHT}px`,
			iconSize: `${ActivitybarPart.ICON_SIZE}px`,
		});
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
	function layoutContentHeight(visibleParts: Parts[], floatingPanelsEnabled = true, modernUICompact = false): number {
		const { part, layoutService } = createActivitybarPart(false, floatingPanelsEnabled, Position.LEFT, {}, modernUICompact);
		const el = document.createElement('div');
		fixture.appendChild(el);
		part.create(el);

		const visible = new Set(visibleParts);
		layoutService.isVisible = (partId: Parts) => visible.has(partId);
		part.layout(100, 300);

		const content = el.querySelector<HTMLElement>('.content');
		return parseInt(content!.style.height, 10);
	}

	test('reserves the perimeter gutter on each window edge the activity bar faces', () => {
		const margin = ActivitybarPart.FLOATING_MARGIN;
		// At the default density the window-edge perimeter matches the inter-card gap.
		const outerMargin = ActivitybarPart.FLOATING_MARGIN;
		const borders = ActivitybarPart.FLOATING_BORDER * 2;
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
			titleAndStatusBarVisible: 300 - margin - borders,
			titleBarHidden: 300 - outerMargin - margin - borders,
			bannerInsteadOfTitleBar: 300 - margin - borders,
			statusBarHidden: 300 - outerMargin - borders,
			bothEdgesExposed: 300 - outerMargin * 2 - borders,
			floatingPanelsDisabled: 300,
		});
	});

	test('compact density aligns the activity bar bottom gutter with the panel cluster', () => {
		const outerMargin = COMPACT_FLOATING_PANEL_OUTER_MARGIN;
		const borders = ActivitybarPart.FLOATING_BORDER * 2;
		assert.deepStrictEqual({
			titleAndStatusBarVisible: layoutContentHeight([Parts.TITLEBAR_PART, Parts.STATUSBAR_PART], true, true),
			titleBarHidden: layoutContentHeight([Parts.STATUSBAR_PART], true, true),
			statusBarHidden: layoutContentHeight([Parts.TITLEBAR_PART], true, true),
			bothEdgesExposed: layoutContentHeight([], true, true),
		}, {
			titleAndStatusBarVisible: 300 - outerMargin - borders,
			titleBarHidden: 300 - outerMargin * 2 - borders,
			statusBarHidden: 300 - outerMargin - borders,
			bothEdgesExposed: 300 - outerMargin * 2 - borders,
		});
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
