/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { TestStorageService } from '../../../common/workbenchTestServices.js';
import { TestLayoutService } from '../../workbenchTestServices.js';
import { ActivitybarPart } from '../../../../browser/parts/activitybar/activitybarPart.js';
import { IViewSize } from '../../../../../base/browser/ui/grid/grid.js';
import { LayoutSettings, Parts } from '../../../../services/layout/browser/layoutService.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { IPaneCompositePart } from '../../../../browser/parts/paneCompositePart.js';
import { Event, Emitter } from '../../../../../base/common/event.js';
import { IPaneComposite } from '../../../../common/panecomposite.js';
import { Extensions, PaneCompositeDescriptor } from '../../../../browser/panecomposite.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ViewContainerLocation } from '../../../../common/views.js';

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

	function createActivitybarPart(compact: boolean): { part: ActivitybarPart; configService: TestConfigurationService } {
		const configService = new TestConfigurationService({
			[LayoutSettings.ACTIVITY_BAR_COMPACT]: compact,
		});
		const storageService = disposables.add(new TestStorageService());
		const themeService = new TestThemeService();
		const layoutService = new TestLayoutService();

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

		return { part, configService };
	}

	function fireConfigChange(configService: TestConfigurationService, key: string): void {
		configService.onDidChangeConfigurationEmitter.fire({
			affectsConfiguration: (k: string) => k === key,
		} satisfies Partial<IConfigurationChangeEvent> as unknown as IConfigurationChangeEvent);
	}

	// --- Static constants ---------------------------------------------------

	test('default constants match original (pre-compact) dimensions', () => {
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
				actionHeight: 32,
				iconSize: 16,
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

	ensureNoDisposablesAreLeakedInTestSuite();
});
