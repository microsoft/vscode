/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventType } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IEditorGroup, IEditorGroupsService, GroupsOrder } from '../../../services/editor/common/editorGroupsService.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { Parts, IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { AccessibilityWorkbenchSettingId } from './accessibilityConfiguration.js';
import { IEditorGroupView } from '../../../browser/parts/editor/editor.js';

/** Fallback debounce delay in ms when the configured value is missing or invalid. */
const DEFAULT_FOCUS_DELAY_MS = 200;

export class FocusFollowsMouseContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.focusFollowsMouse';

	/** Disposables for the currently-active set of mouse listeners. Cleared when feature is disabled. */
	private readonly listenerStore = this._register(new DisposableStore());

	/** Per-editor-group disposables, keyed by group id. */
	private readonly groupListeners = this._register(new DisposableMap<number>());

	// A single scheduler and pending action are shared across all parts and
	// editor groups by design: only one focus can be pending at a time, and the
	// most recently hovered target wins. Each `mouseenter` overwrites the
	// pending action and restarts the timer; `mouseleave` (or disable) cancels
	// it. This intentionally focuses whatever the cursor most recently entered.
	private readonly focusScheduler = this._register(new RunOnceScheduler(() => this.pendingFocus?.(), DEFAULT_FOCUS_DELAY_MS));
	private pendingFocus: (() => void) | undefined = undefined;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
	) {
		super();

		this._register(Event.runAndSubscribe(configurationService.onDidChangeConfiguration, e => {
			// The delay is read lazily in getDelay(), so only the enabled flag
			// needs to drive enable/disable here.
			if (e && !e.affectsConfiguration(AccessibilityWorkbenchSettingId.FocusFollowsMouseEnabled)) {
				return;
			}
			this.update();
		}));
	}

	private update(): void {
		const enabled = this.configurationService.getValue<boolean>(AccessibilityWorkbenchSettingId.FocusFollowsMouseEnabled);
		if (enabled) {
			this.enable();
		} else {
			this.disable();
		}
	}

	/**
	 * Resolves the configured debounce delay, falling back to the default when
	 * the user-provided value is missing or not a non-negative number.
	 */
	private getDelay(): number {
		const delay = this.configurationService.getValue<number>(AccessibilityWorkbenchSettingId.FocusFollowsMouseDelay);
		return typeof delay === 'number' && delay >= 0 ? delay : DEFAULT_FOCUS_DELAY_MS;
	}

	private cancelPendingFocus(): void {
		this.pendingFocus = undefined;
		this.focusScheduler.cancel();
	}

	private enable(): void {
		this.listenerStore.clear();
		this.groupListeners.clearAndDisposeAll();

		// Sidebar
		this.addPartListener(Parts.SIDEBAR_PART, () => this.layoutService.focusPart(Parts.SIDEBAR_PART));

		// Panel
		this.addPartListener(Parts.PANEL_PART, () => this.layoutService.focusPart(Parts.PANEL_PART));

		// Auxiliary bar
		this.addPartListener(Parts.AUXILIARYBAR_PART, () => this.layoutService.focusPart(Parts.AUXILIARYBAR_PART));

		// Editor groups — attach to each existing group and watch for new ones
		for (const group of this.editorGroupsService.getGroups(GroupsOrder.CREATION_TIME)) {
			this.attachGroupListener(group);
		}

		this.listenerStore.add(this.editorGroupsService.onDidAddGroup(group => this.attachGroupListener(group)));
		this.listenerStore.add(this.editorGroupsService.onDidRemoveGroup(group => this.groupListeners.deleteAndDispose(group.id)));
	}

	private disable(): void {
		this.listenerStore.clear();
		this.groupListeners.clearAndDisposeAll();
		this.cancelPendingFocus();
	}

	/**
	 * Attaches mouse listeners to the container of a workbench part.
	 * Does nothing if the part container is not yet visible/available.
	 * Parts are resolved for the main window only; the same parts in auxiliary
	 * windows are not covered (editor groups, handled separately, are covered
	 * across all windows via IEditorGroupsService).
	 */
	private addPartListener(part: Parts, focusFn: () => void): void {
		const container = this.layoutService.getContainer(mainWindow, part);
		if (!container) {
			return;
		}
		this.listenerStore.add(addDisposableListener(container, EventType.MOUSE_ENTER, (e: MouseEvent) => {
			this.scheduleFocus(e, focusFn);
		}));
		this.listenerStore.add(addDisposableListener(container, EventType.MOUSE_LEAVE, () => this.cancelPendingFocus()));
	}

	/**
	 * Attaches mouse listeners directly to the DOM element of an editor group.
	 * `IEditorGroup` exposes no public DOM accessor, so the group is narrowed to
	 * its internal `IEditorGroupView` (the same cast the editor service uses).
	 */
	private attachGroupListener(group: IEditorGroup): void {
		const element = (group as IEditorGroupView).element;
		if (!element) {
			return;
		}

		const store = new DisposableStore();
		store.add(addDisposableListener(element, EventType.MOUSE_ENTER, (e: MouseEvent) => {
			this.scheduleFocus(e, () => {
				// Re-resolve the group at focus time in case it has since been disposed.
				const live = this.editorGroupsService.getGroup(group.id);
				live?.focus();
			});
		}));

		// Cancel any pending focus when the mouse leaves the group, so a brief
		// transit across a group border does not accidentally steal focus.
		store.add(addDisposableListener(element, EventType.MOUSE_LEAVE, () => this.cancelPendingFocus()));

		this.groupListeners.set(group.id, store);
	}

	/**
	 * Schedules a focus action after the configured delay, guarded against unsafe conditions.
	 */
	private scheduleFocus(e: MouseEvent, focusFn: () => void): void {
		// If a mouse button is held (e.g. drag-and-drop), do not shift focus.
		if (e.buttons !== 0) {
			return;
		}

		// If a context menu is open, do not shift focus.
		if (this.layoutService.activeContainer.classList.contains('context-menu-visible')) {
			return;
		}

		this.pendingFocus = focusFn;
		this.focusScheduler.schedule(this.getDelay());
	}
}
