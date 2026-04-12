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
import { mainWindow } from '../../../../../base/browser/window.js';
import { Event, Emitter } from '../../../../../base/common/event.js';
import { Extensions } from '../../../../browser/panecomposite.js';
class StubPaneCompositePart {
    constructor() {
        this.partId = "workbench.parts.sidebar" /* Parts.SIDEBAR_PART */;
        this.registryId = Extensions.Viewlets;
        this.element = undefined;
        this.minimumWidth = 0;
        this.maximumWidth = 0;
        this.minimumHeight = 0;
        this.maximumHeight = 0;
        this.onDidChange = Event.None;
        this.onDidPaneCompositeOpen = new Emitter().event;
        this.onDidPaneCompositeClose = new Emitter().event;
    }
    openPaneComposite() { return Promise.resolve(undefined); }
    getPaneComposites() { return []; }
    getPaneComposite() { return undefined; }
    getActivePaneComposite() { return undefined; }
    getProgressIndicator() { return undefined; }
    hideActivePaneComposite() { }
    getLastActivePaneCompositeId() { return ''; }
    getPinnedPaneCompositeIds() { return []; }
    getVisiblePaneCompositeIds() { return []; }
    getPaneCompositeIds() { return []; }
    layout() { }
    dispose() { }
}
suite('ActivitybarPart', () => {
    const disposables = new DisposableStore();
    let fixture;
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
    function createActivitybarPart(compact) {
        const configService = new TestConfigurationService({
            ["workbench.activityBar.compact" /* LayoutSettings.ACTIVITY_BAR_COMPACT */]: compact,
        });
        const storageService = disposables.add(new TestStorageService());
        const themeService = new TestThemeService();
        const layoutService = new TestLayoutService();
        // Override isVisible to return false so that create() does not call show()
        // and attempt to instantiate the composite bar (which requires a full DI setup).
        layoutService.isVisible = (_part) => false;
        // Stub instantiation service—createCompositeBar is only called in show(),
        // which we skip in unit tests focused on dimensions / style behaviour.
        const stubInstantiationService = { createInstance: () => { throw new Error('not expected'); } };
        const part = disposables.add(new ActivitybarPart(0 /* ViewContainerLocation.Sidebar */, new StubPaneCompositePart(), stubInstantiationService, layoutService, themeService, storageService, configService));
        return { part, configService };
    }
    function fireConfigChange(configService, key) {
        configService.onDidChangeConfigurationEmitter.fire({
            affectsConfiguration: (k) => k === key,
        });
    }
    // --- Static constants ---------------------------------------------------
    test('default constants match original (pre-compact) dimensions', () => {
        assert.deepStrictEqual({
            width: ActivitybarPart.ACTIVITYBAR_WIDTH,
            actionHeight: ActivitybarPart.ACTION_HEIGHT,
            iconSize: ActivitybarPart.ICON_SIZE,
        }, {
            width: 48,
            actionHeight: 48,
            iconSize: 24,
        });
    });
    test('compact constants match reduced dimensions', () => {
        assert.deepStrictEqual({
            width: ActivitybarPart.COMPACT_ACTIVITYBAR_WIDTH,
            actionHeight: ActivitybarPart.COMPACT_ACTION_HEIGHT,
            iconSize: ActivitybarPart.COMPACT_ICON_SIZE,
        }, {
            width: 36,
            actionHeight: 32,
            iconSize: 16,
        });
    });
    // --- Dimension getters --------------------------------------------------
    test('default mode returns default width constraints', () => {
        const { part } = createActivitybarPart(false);
        assert.deepStrictEqual({ min: part.minimumWidth, max: part.maximumWidth }, { min: ActivitybarPart.ACTIVITYBAR_WIDTH, max: ActivitybarPart.ACTIVITYBAR_WIDTH });
    });
    test('compact mode returns compact width constraints', () => {
        const { part } = createActivitybarPart(true);
        assert.deepStrictEqual({ min: part.minimumWidth, max: part.maximumWidth }, { min: ActivitybarPart.COMPACT_ACTIVITYBAR_WIDTH, max: ActivitybarPart.COMPACT_ACTIVITYBAR_WIDTH });
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
        configService.setUserConfiguration("workbench.activityBar.compact" /* LayoutSettings.ACTIVITY_BAR_COMPACT */, true);
        fireConfigChange(configService, "workbench.activityBar.compact" /* LayoutSettings.ACTIVITY_BAR_COMPACT */);
        assert.deepStrictEqual({ min: part.minimumWidth, max: part.maximumWidth }, { min: ActivitybarPart.COMPACT_ACTIVITYBAR_WIDTH, max: ActivitybarPart.COMPACT_ACTIVITYBAR_WIDTH });
        // Switch back to default
        configService.setUserConfiguration("workbench.activityBar.compact" /* LayoutSettings.ACTIVITY_BAR_COMPACT */, false);
        fireConfigChange(configService, "workbench.activityBar.compact" /* LayoutSettings.ACTIVITY_BAR_COMPACT */);
        assert.deepStrictEqual({ min: part.minimumWidth, max: part.maximumWidth }, { min: ActivitybarPart.ACTIVITYBAR_WIDTH, max: ActivitybarPart.ACTIVITYBAR_WIDTH });
    });
    // --- onDidChange fires for grid ----------------------------------------
    test('fires onDidChange(undefined) when compact setting changes', () => {
        const { part, configService } = createActivitybarPart(false);
        const events = [];
        disposables.add(part.onDidChange(e => events.push(e)));
        // Toggle to compact
        configService.setUserConfiguration("workbench.activityBar.compact" /* LayoutSettings.ACTIVITY_BAR_COMPACT */, true);
        fireConfigChange(configService, "workbench.activityBar.compact" /* LayoutSettings.ACTIVITY_BAR_COMPACT */);
        assert.strictEqual(events.length, 1);
        assert.strictEqual(events[0], undefined, 'should fire undefined to signal constraint change');
        // Toggle back
        configService.setUserConfiguration("workbench.activityBar.compact" /* LayoutSettings.ACTIVITY_BAR_COMPACT */, false);
        fireConfigChange(configService, "workbench.activityBar.compact" /* LayoutSettings.ACTIVITY_BAR_COMPACT */);
        assert.strictEqual(events.length, 2);
        assert.strictEqual(events[1], undefined);
    });
    test('does not fire onDidChange for unrelated config changes', () => {
        const { part, configService } = createActivitybarPart(false);
        const events = [];
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
        configService.setUserConfiguration("workbench.activityBar.compact" /* LayoutSettings.ACTIVITY_BAR_COMPACT */, true);
        fireConfigChange(configService, "workbench.activityBar.compact" /* LayoutSettings.ACTIVITY_BAR_COMPACT */);
        assert.strictEqual(el.style.getPropertyValue('--activity-bar-width'), `${ActivitybarPart.COMPACT_ACTIVITYBAR_WIDTH}px`);
        assert.strictEqual(el.style.getPropertyValue('--activity-bar-action-height'), `${ActivitybarPart.COMPACT_ACTION_HEIGHT}px`);
        assert.strictEqual(el.style.getPropertyValue('--activity-bar-icon-size'), `${ActivitybarPart.COMPACT_ICON_SIZE}px`);
        assert.strictEqual(el.classList.contains('compact'), true);
        // Switch back
        configService.setUserConfiguration("workbench.activityBar.compact" /* LayoutSettings.ACTIVITY_BAR_COMPACT */, false);
        fireConfigChange(configService, "workbench.activityBar.compact" /* LayoutSettings.ACTIVITY_BAR_COMPACT */);
        assert.strictEqual(el.style.getPropertyValue('--activity-bar-width'), `${ActivitybarPart.ACTIVITYBAR_WIDTH}px`);
        assert.strictEqual(el.style.getPropertyValue('--activity-bar-action-height'), `${ActivitybarPart.ACTION_HEIGHT}px`);
        assert.strictEqual(el.style.getPropertyValue('--activity-bar-icon-size'), `${ActivitybarPart.ICON_SIZE}px`);
        assert.strictEqual(el.classList.contains('compact'), false);
    });
    // --- toJSON ------------------------------------------------------------
    test('toJSON returns correct part type', () => {
        const { part } = createActivitybarPart(false);
        assert.deepStrictEqual(part.toJSON(), { type: "workbench.parts.activitybar" /* Parts.ACTIVITYBAR_PART */ });
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWN0aXZpdHliYXJQYXJ0LnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvdGVzdC9icm93c2VyL3BhcnRzL2FjdGl2aXR5YmFyL2FjdGl2aXR5YmFyUGFydC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDMUUsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sK0VBQStFLENBQUM7QUFDekgsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDakcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDOUUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDbkUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBRzNGLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUduRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRXJFLE9BQU8sRUFBRSxVQUFVLEVBQTJCLE1BQU0sc0NBQXNDLENBQUM7QUFJM0YsTUFBTSxxQkFBcUI7SUFBM0I7UUFFVSxXQUFNLHNEQUFzQjtRQUM1QixlQUFVLEdBQUcsVUFBVSxDQUFDLFFBQVEsQ0FBQztRQUMxQyxZQUFPLEdBQWdCLFNBQVUsQ0FBQztRQUNsQyxpQkFBWSxHQUFHLENBQUMsQ0FBQztRQUNqQixpQkFBWSxHQUFHLENBQUMsQ0FBQztRQUNqQixrQkFBYSxHQUFHLENBQUMsQ0FBQztRQUNsQixrQkFBYSxH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