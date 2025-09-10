/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IMobileSidebarEditorInputService } from './editors/mobileSidebarInput.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { EventType, addDisposableListener, getActiveWindow } from '../../../../base/browser/dom.js';

const MOBILE_SIDEBAR_MODE_STORAGE_KEY = 'workbench.mobileSidebar.enabled';

export class MobileSidebarController extends Disposable {

	private readonly _onDidChangeMobileMode = this._register(new Emitter<boolean>());
	readonly onDidChangeMobileMode: Event<boolean> = this._onDidChangeMobileMode.event;

	private lastIsMobile: boolean | undefined;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IMobileSidebarEditorInputService private readonly mobileSidebarService: IMobileSidebarEditorInputService,
		@IInstantiationService _instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();

		this.registerListeners();

		// Check initial state
		this.updateLayoutBasedOnModeAndScreenSize();
	}

	private registerListeners(): void {
		// Listen to window resize events
		const targetWindow = getActiveWindow();
		this._register(addDisposableListener(targetWindow, EventType.RESIZE, () => {
			this.updateLayoutBasedOnModeAndScreenSize();
		}));

		// Listen to storage changes (when the mode toggle is changed)
		this._register(this.storageService.onDidChangeValue(StorageScope.WORKSPACE, MOBILE_SIDEBAR_MODE_STORAGE_KEY, this._store)(() => {
			this.updateLayoutBasedOnModeAndScreenSize();
		}));

		// Listen to configuration changes
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('workbench.mobileSidebar')) {
				this.updateLayoutBasedOnModeAndScreenSize();
			}
		}));
	}

	private isMobileSidebarModeEnabled(): boolean {
		return this.storageService.getBoolean(MOBILE_SIDEBAR_MODE_STORAGE_KEY, StorageScope.WORKSPACE, false);
	}

	private isMobileScreen(): boolean {
		const breakpoint = this.mobileSidebarService.getMobileBreakpoint();
		const targetWindow = getActiveWindow();
		return targetWindow.innerWidth <= breakpoint;
	}

	private async updateLayoutBasedOnModeAndScreenSize(): Promise<void> {
		const modeEnabled = this.isMobileSidebarModeEnabled();
		const isMobile = this.isMobileScreen();

		// Only update if we crossed the breakpoint or this is the first check
		if (this.lastIsMobile !== undefined && this.lastIsMobile === isMobile) {
			return; // No change in mobile/desktop state
		}

		console.log('[MobileSidebarController] Breakpoint crossed - Mobile:', isMobile, 'Mode enabled:', modeEnabled);
		this.lastIsMobile = isMobile;

		if (modeEnabled) {
			if (isMobile) {
				// Mobile mode enabled + mobile screen = show mobile sidebar, hide normal sidebar
				await this.applyMobileLayout();
			} else {
				// Mobile mode enabled + desktop screen = show normal sidebar (but keep editor open)
				await this.applyDesktopLayout();
			}
		} else {
			// Mobile mode disabled = always show normal sidebar regardless of screen size
			await this.applyDesktopLayout();
		}
	}

	private async applyMobileLayout(): Promise<void> {
		// Set mobile mode flag
		this.mobileSidebarService.setMobileMode(true);

		// Hide normal sidebar and activity bar
		this.layoutService.setPartHidden(true, Parts.SIDEBAR_PART);
		this.layoutService.setPartHidden(true, Parts.ACTIVITYBAR_PART);

		// Ensure the mobile sidebar editor is open
		const mobileSidebarInput = this.mobileSidebarService.getInstance();

		// Check if it's already open
		let found = false;
		let needsRefresh = false;
		for (const group of this.editorGroupService.groups) {
			const editor = group.editors.find(e => e === mobileSidebarInput);
			if (editor) {
				console.log('[MobileSidebarController] Editor found, making sticky', editor);
				// Make it sticky so it can't be closed
				if (!group.isSticky(editor)) {
					group.stickEditor(editor);
				}
				found = true;
				needsRefresh = true; // Force refresh to remount viewlets
				break;
			}
		}

		// If not found, open it
		if (!found) {
			console.log('[MobileSidebarController] Opening new mobile sidebar editor');
			const activeGroup = this.editorGroupService.activeGroup;
			try {
				const result = await activeGroup.openEditor(mobileSidebarInput, {
					pinned: true,
					preserveFocus: true, // Don't steal focus
					sticky: true
				});
				console.log('[MobileSidebarController] Editor opened, result:', result);
				activeGroup.stickEditor(mobileSidebarInput);
			} catch (error) {
				console.error('[MobileSidebarController] Failed to open editor:', error);
			}
		} else if (needsRefresh) {
			// Force the widget to refresh/remount viewlets that may have been in the normal sidebar
			const mobileSidebarEditor = this.getMobileSidebarEditor();
			if (mobileSidebarEditor) {
				const widget = mobileSidebarEditor.getControl();
				if (widget && typeof widget.refresh === 'function') {
					widget.refresh();
				}
			}
		}

		this._onDidChangeMobileMode.fire(true);
	}

	private getMobileSidebarEditor(): any {
		const mobileSidebarInput = this.mobileSidebarService.getInstance();
		for (const group of this.editorGroupService.groups) {
			const editorPane = group.activeEditorPane;
			if (editorPane && editorPane.input === mobileSidebarInput) {
				return editorPane;
			}
		}
		return undefined;
	}

	private async applyDesktopLayout(): Promise<void> {
		// Clear mobile mode flag
		this.mobileSidebarService.setMobileMode(false);

		// Show normal sidebar and activity bar
		this.layoutService.setPartHidden(false, Parts.SIDEBAR_PART);
		this.layoutService.setPartHidden(false, Parts.ACTIVITYBAR_PART);

		// Only close the mobile sidebar editor if we're actually on desktop (not just mode disabled)
		const isMobile = this.isMobileScreen();
		const modeEnabled = this.isMobileSidebarModeEnabled();

		// Close mobile sidebar editor only when:
		// 1. We're on desktop screen (regardless of mode), OR
		// 2. Mode is disabled (then we don't want mobile sidebar at all)
		if (!isMobile || !modeEnabled) {
			const mobileSidebarInput = this.mobileSidebarService.getInstance();
			for (const group of this.editorGroupService.groups) {
				const editor = group.editors.find(e => e === mobileSidebarInput);
				if (editor) {
					// First unstick if it's sticky
					if (group.isSticky(editor)) {
						group.unstickEditor(editor);
					}
					// Then close it
					await group.closeEditor(editor);
				}
			}
		}

		this._onDidChangeMobileMode.fire(false);
	}
}
