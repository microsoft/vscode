/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { timeout } from '../../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IEditorGroup, IEditorGroupsService, GroupsOrder } from '../../../../services/editor/common/editorGroupsService.js';
import { IWorkbenchLayoutService, Parts } from '../../../../services/layout/browser/layoutService.js';
import { TestLayoutService, TestEditorGroupsService, TestEditorGroupView } from '../../../../test/browser/workbenchTestServices.js';
import { FocusFollowsMouseContribution } from '../../browser/focusFollowsMouseContribution.js';
import { AccessibilityWorkbenchSettingId } from '../../browser/accessibilityConfiguration.js';
import { mainWindow } from '../../../../../base/browser/window.js';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

/**
 * Layout service that routes getContainer() per-Part and records focusPart calls.
 */
class TestFocusLayoutService extends TestLayoutService {

	readonly focusedParts: Parts[] = [];
	private readonly partContainers = new Map<Parts, HTMLElement>();

	setPartContainer(part: Parts, el: HTMLElement): void {
		this.partContainers.set(part, el);
	}

	override getContainer(_targetWindow?: Window, part?: Parts): HTMLElement {
		const el = part !== undefined ? this.partContainers.get(part) : undefined;
		return el ?? super.getContainer();
	}

	override focusPart(part: Parts): void {
		this.focusedParts.push(part);
	}
}

/**
 * Minimal editor group with a real HTMLElement so mouseenter/mouseleave fire.
 */
class TestGroupWithElement extends TestEditorGroupView {

	override readonly element: HTMLElement;
	readonly focusCalls: number[] = [];

	constructor(id: number) {
		super(id);
		this.element = mainWindow.document.createElement('div');
	}

	override focus(): void {
		this.focusCalls.push(this.id);
	}
}

/**
 * Editor groups service backed by mutable group list with emitters.
 */
class TestFocusEditorGroupsService extends TestEditorGroupsService {

	private readonly _onDidAddGroup = new Emitter<IEditorGroup>();
	private readonly _onDidRemoveGroup = new Emitter<IEditorGroup>();

	override readonly onDidAddGroup = this._onDidAddGroup.event;
	override readonly onDidRemoveGroup = this._onDidRemoveGroup.event;

	constructor(public override groups: TestGroupWithElement[] = []) {
		super(groups);
	}

	addTestGroup(group: TestGroupWithElement): void {
		this.groups.push(group);
		this._onDidAddGroup.fire(group);
	}

	removeTestGroup(group: TestGroupWithElement): void {
		this.groups = this.groups.filter(g => g.id !== group.id);
		this._onDidRemoveGroup.fire(group);
	}

	override getGroups(_order?: GroupsOrder): readonly IEditorGroup[] {
		return this.groups;
	}

	override getGroup(id: number): IEditorGroup | undefined {
		return this.groups.find(g => g.id === id);
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DELAY = 200; // must match DEFAULT_FOCUS_DELAY_MS in the contribution

function fireMouseEnter(el: HTMLElement, buttons = 0): void {
	el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false, buttons }));
}

function fireMouseLeave(el: HTMLElement): void {
	el.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
}

function buildContribution(
	store: Pick<DisposableStore, 'add'>,
	configService: TestConfigurationService,
	layoutService: TestFocusLayoutService,
	editorGroupsService: TestFocusEditorGroupsService,
): FocusFollowsMouseContribution {
	// Wire services using a minimal manual DI approach
	const contribution = new FocusFollowsMouseContribution(
		configService as unknown as IConfigurationService,
		layoutService as unknown as IWorkbenchLayoutService,
		editorGroupsService as unknown as IEditorGroupsService,
	);
	store.add(contribution);
	return contribution;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

suite('FocusFollowsMouseContribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let configService: TestConfigurationService;
	let layoutService: TestFocusLayoutService;
	let editorGroupsService: TestFocusEditorGroupsService;
	let sidebarEl: HTMLElement;
	let panelEl: HTMLElement;

	setup(() => {
		configService = new TestConfigurationService();
		layoutService = new TestFocusLayoutService();

		sidebarEl = mainWindow.document.createElement('div');
		panelEl = mainWindow.document.createElement('div');
		layoutService.setPartContainer(Parts.SIDEBAR_PART, sidebarEl);
		layoutService.setPartContainer(Parts.PANEL_PART, panelEl);

		editorGroupsService = new TestFocusEditorGroupsService();
	});

	// -------------------------------------------------------------------------
	// Disabled by default — no focus fired
	// -------------------------------------------------------------------------

	test('does not fire focus when feature is disabled', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		configService.setUserConfiguration(AccessibilityWorkbenchSettingId.FocusFollowsMouseEnabled, false);

		buildContribution(store, configService, layoutService, editorGroupsService);

		fireMouseEnter(sidebarEl);
		await timeout(DELAY + 50);

		assert.strictEqual(layoutService.focusedParts.length, 0, 'No part should be focused when feature is off');
	}));

	// -------------------------------------------------------------------------
	// Sidebar and panel focus
	// -------------------------------------------------------------------------

	test('focuses sidebar after delay on mouseenter', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		configService.setUserConfiguration(AccessibilityWorkbenchSettingId.FocusFollowsMouseEnabled, true);
		buildContribution(store, configService, layoutService, editorGroupsService);

		fireMouseEnter(sidebarEl);

		// No immediate focus
		assert.strictEqual(layoutService.focusedParts.length, 0, 'Focus should not fire immediately');

		await timeout(DELAY + 50);
		assert.strictEqual(layoutService.focusedParts.length, 1);
		assert.strictEqual(layoutService.focusedParts[0], Parts.SIDEBAR_PART);
	}));

	test('focuses panel after delay on mouseenter', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		configService.setUserConfiguration(AccessibilityWorkbenchSettingId.FocusFollowsMouseEnabled, true);
		buildContribution(store, configService, layoutService, editorGroupsService);

		fireMouseEnter(panelEl);
		await timeout(DELAY + 50);

		assert.strictEqual(layoutService.focusedParts[0], Parts.PANEL_PART);
	}));

	// -------------------------------------------------------------------------
	// Guards
	// -------------------------------------------------------------------------

	test('does not focus when a mouse button is held during mouseenter', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		configService.setUserConfiguration(AccessibilityWorkbenchSettingId.FocusFollowsMouseEnabled, true);
		buildContribution(store, configService, layoutService, editorGroupsService);

		fireMouseEnter(sidebarEl, /* buttons = */ 1); // primary button held
		await timeout(DELAY + 50);

		assert.strictEqual(layoutService.focusedParts.length, 0, 'Should not focus while dragging');
	}));

	test('does not focus when a context menu is visible', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		configService.setUserConfiguration(AccessibilityWorkbenchSettingId.FocusFollowsMouseEnabled, true);
		buildContribution(store, configService, layoutService, editorGroupsService);

		// activeContainer is mainWindow.document.body in TestLayoutService
		layoutService.activeContainer.classList.add('context-menu-visible');
		try {
			fireMouseEnter(sidebarEl);
			await timeout(DELAY + 50);
			assert.strictEqual(layoutService.focusedParts.length, 0, 'Should not focus with context menu open');
		} finally {
			layoutService.activeContainer.classList.remove('context-menu-visible');
		}
	}));

	// -------------------------------------------------------------------------
	// Editor group listeners
	// -------------------------------------------------------------------------

	test('focuses editor group after delay on mouseenter', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const group = store.add(new TestGroupWithElement(1));
		editorGroupsService.addTestGroup(group);
		configService.setUserConfiguration(AccessibilityWorkbenchSettingId.FocusFollowsMouseEnabled, true);
		buildContribution(store, configService, layoutService, editorGroupsService);

		fireMouseEnter(group.element);
		await timeout(DELAY + 50);

		assert.strictEqual(group.focusCalls.length, 1, 'Group focus() should be called once');
	}));

	test('cancels pending group focus on mouseleave', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const group = store.add(new TestGroupWithElement(1));
		editorGroupsService.addTestGroup(group);
		configService.setUserConfiguration(AccessibilityWorkbenchSettingId.FocusFollowsMouseEnabled, true);
		buildContribution(store, configService, layoutService, editorGroupsService);

		fireMouseEnter(group.element);
		fireMouseLeave(group.element); // cancel before delay elapses
		await timeout(DELAY + 50);

		assert.strictEqual(group.focusCalls.length, 0, 'Focus should be cancelled by mouseleave');
	}));

	test('attaches listener to groups added after construction', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		configService.setUserConfiguration(AccessibilityWorkbenchSettingId.FocusFollowsMouseEnabled, true);
		buildContribution(store, configService, layoutService, editorGroupsService);

		const group = store.add(new TestGroupWithElement(2));
		editorGroupsService.addTestGroup(group);

		fireMouseEnter(group.element);
		await timeout(DELAY + 50);

		assert.strictEqual(group.focusCalls.length, 1, 'Dynamically added group should receive focus');
	}));

	test('cleans up listener when a group is removed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const group = store.add(new TestGroupWithElement(3));
		editorGroupsService.addTestGroup(group);
		configService.setUserConfiguration(AccessibilityWorkbenchSettingId.FocusFollowsMouseEnabled, true);
		buildContribution(store, configService, layoutService, editorGroupsService);

		editorGroupsService.removeTestGroup(group);

		// After removal, mouseenter should not schedule focus (listener disposed)
		fireMouseEnter(group.element);
		await timeout(DELAY + 50);

		assert.strictEqual(group.focusCalls.length, 0, 'Removed group should not receive focus');
	}));

	// -------------------------------------------------------------------------
	// Runtime config change
	// -------------------------------------------------------------------------

	test('enables listeners when setting is toggled on at runtime', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		configService.setUserConfiguration(AccessibilityWorkbenchSettingId.FocusFollowsMouseEnabled, false);
		buildContribution(store, configService, layoutService, editorGroupsService);

		// Toggle on and notify the contribution
		configService.setUserConfiguration(AccessibilityWorkbenchSettingId.FocusFollowsMouseEnabled, true);
		configService.onDidChangeConfigurationEmitter.fire({
			affectsConfiguration: (key: string) => key === AccessibilityWorkbenchSettingId.FocusFollowsMouseEnabled,
		} as unknown as IConfigurationChangeEvent);

		fireMouseEnter(sidebarEl);
		await timeout(DELAY + 50);

		assert.strictEqual(layoutService.focusedParts.length, 1);
		assert.strictEqual(layoutService.focusedParts[0], Parts.SIDEBAR_PART);
	}));

	test('disables listeners when setting is toggled off at runtime', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		configService.setUserConfiguration(AccessibilityWorkbenchSettingId.FocusFollowsMouseEnabled, true);
		buildContribution(store, configService, layoutService, editorGroupsService);

		// Toggle off and notify the contribution
		configService.setUserConfiguration(AccessibilityWorkbenchSettingId.FocusFollowsMouseEnabled, false);
		configService.onDidChangeConfigurationEmitter.fire({
			affectsConfiguration: (key: string) => key === AccessibilityWorkbenchSettingId.FocusFollowsMouseEnabled,
		} as unknown as IConfigurationChangeEvent);

		fireMouseEnter(sidebarEl);
		await timeout(DELAY + 50);

		assert.strictEqual(layoutService.focusedParts.length, 0, 'No focus should fire after feature is disabled');
	}));

	// -------------------------------------------------------------------------
	// Configurable debounce delay
	// -------------------------------------------------------------------------

	test('respects a custom configured delay', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const customDelay = 500;
		configService.setUserConfiguration(AccessibilityWorkbenchSettingId.FocusFollowsMouseEnabled, true);
		configService.setUserConfiguration(AccessibilityWorkbenchSettingId.FocusFollowsMouseDelay, customDelay);
		buildContribution(store, configService, layoutService, editorGroupsService);

		fireMouseEnter(sidebarEl);

		// Still pending at the old default delay
		await timeout(DELAY + 50);
		assert.strictEqual(layoutService.focusedParts.length, 0, 'Focus should not fire before the custom delay elapses');

		// Fires once the custom delay has elapsed
		await timeout(customDelay);
		assert.strictEqual(layoutService.focusedParts[0], Parts.SIDEBAR_PART);
	}));

	test('picks up a delay change at runtime without a config event', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		configService.setUserConfiguration(AccessibilityWorkbenchSettingId.FocusFollowsMouseEnabled, true);
		configService.setUserConfiguration(AccessibilityWorkbenchSettingId.FocusFollowsMouseDelay, 100);
		buildContribution(store, configService, layoutService, editorGroupsService);

		// Change the delay; the next schedule reads it live (no enable/disable needed)
		configService.setUserConfiguration(AccessibilityWorkbenchSettingId.FocusFollowsMouseDelay, 400);

		fireMouseEnter(sidebarEl);
		await timeout(150);
		assert.strictEqual(layoutService.focusedParts.length, 0, 'Focus should respect the updated delay');

		await timeout(300);
		assert.strictEqual(layoutService.focusedParts[0], Parts.SIDEBAR_PART);
	}));

	test('falls back to the default delay when configured value is invalid', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		configService.setUserConfiguration(AccessibilityWorkbenchSettingId.FocusFollowsMouseEnabled, true);
		configService.setUserConfiguration(AccessibilityWorkbenchSettingId.FocusFollowsMouseDelay, -1);
		buildContribution(store, configService, layoutService, editorGroupsService);

		fireMouseEnter(sidebarEl);
		await timeout(DELAY + 50);

		assert.strictEqual(layoutService.focusedParts[0], Parts.SIDEBAR_PART);
	}));
});
