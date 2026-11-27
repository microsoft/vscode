/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../../base/browser/window.js';
import { disposableTimeout } from '../../../../../base/common/async.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IAgenticModeService } from '../../../../services/agenticMode/common/agenticMode.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IWorkbenchLayoutService, Parts } from '../../../../services/layout/browser/layoutService.js';
import { gettingStartedInputTypeId } from '../../../welcomeGettingStarted/browser/gettingStartedInput.js';

/**
 * Hides an empty editor area when the window enters Agentic Mode, and shows it again
 * when the window leaves the mode if the mode had hidden it. Opening an editor in the mode
 * shows the editor area again. The editor area is only hidden when another part takes its
 * place (the chat part, the panel or a maximized secondary side bar), so hiding it never makes
 * the layout open the panel; otherwise it is hidden once the chat part shows. Closing the chat
 * part shows the editor area again; the next chat part shown in the mode takes its place again.
 */
export class AgenticModeEditorArea extends Disposable {

	/** Keeps the value from before the rename to Agentic Mode, so windows already in the mode keep their state. */
	static readonly HIDDEN_ON_ENTER_STORAGE_KEY = 'chat.agentsSettingsMode.editorAreaHiddenOnEnter';

	private readonly pendingHide = this._register(new MutableDisposable());

	constructor(
		@IAgenticModeService private readonly agenticModeService: IAgenticModeService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IStorageService private readonly storageService: IStorageService,
		@IEditorService editorService: IEditorService,
	) {
		super();

		if (agenticModeService.isSupported) {
			this._register(agenticModeService.onDidChange(active => active ? this.onDidEnter() : this.onDidLeave()));
			this._register(editorService.onDidVisibleEditorsChange(() => this.showIfEditorOpened()));
			// Closing the chat part shows the empty editor area again: the next chat shown takes its place again
			this._register(layoutService.onDidChangePartVisibility(e => {
				if (e.partId === Parts.CHAT_PART && e.visible && agenticModeService.isActive && this.wasHiddenOnEnter()) {
					this.hideIfEmpty();
				}
			}));
		}
	}

	private onDidEnter(): void {
		const pendingHide = new DisposableStore();
		this.pendingHide.value = pendingHide;
		// Entering the mode also closes editors (the Welcome page), so look at the editor area once those closed
		pendingHide.add(disposableTimeout(() => this.hideIfEmpty(), 0));
		// The chat part can show before that: take the editor area's place as it shows, before the layout squeezes
		// the side bars to keep room for the editor area beside it
		pendingHide.add(this.layoutService.onDidChangePartVisibility(e => {
			if (e.partId === Parts.CHAT_PART && e.visible) {
				this.hideIfEmpty();
			}
		}));
	}

	private hideIfEmpty(): void {
		this.pendingHide.clear();
		if (!this.agenticModeService.isActive || !this.layoutService.isVisible(Parts.EDITOR_PART, mainWindow) || !this.isMainEditorAreaEmpty(true)) {
			return;
		}

		if (this.layoutService.isVisible(Parts.CHAT_PART)) {
			// The chat part takes the editor area's place
			this.layoutService.setEditorHiddenByChat(true);
		} else if (!this.layoutService.isVisible(Parts.PANEL_PART) && !this.layoutService.isAuxiliaryBarMaximized()) {
			// Nothing else would fill the editor area's place and the layout would open the panel: wait for the chat part
			this.pendingHide.value = this.layoutService.onDidChangePartVisibility(e => {
				if (e.partId === Parts.CHAT_PART && e.visible) {
					this.hideIfEmpty();
				}
			});
			return;
		}
		if (this.layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
			this.layoutService.setPartHidden(true, Parts.EDITOR_PART);
		}

		// Remembered in the window's storage, so leaving after a restart in the mode shows it again too
		this.storageService.store(AgenticModeEditorArea.HIDDEN_ON_ENTER_STORAGE_KEY, true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	private showIfEditorOpened(): void {
		if (!this.agenticModeService.isActive || !this.wasHiddenOnEnter() || this.isMainEditorAreaEmpty()) {
			return;
		}

		// An editor opened in the main window: show the editor area it opens in, leaving it to the user from now on
		this.pendingHide.clear();
		this.storageService.remove(AgenticModeEditorArea.HIDDEN_ON_ENTER_STORAGE_KEY, StorageScope.WORKSPACE);
		if (!this.layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
			this.layoutService.setPartHidden(false, Parts.EDITOR_PART);
		}
	}

	private wasHiddenOnEnter(): boolean {
		return this.storageService.getBoolean(AgenticModeEditorArea.HIDDEN_ON_ENTER_STORAGE_KEY, StorageScope.WORKSPACE, false);
	}

	private isMainEditorAreaEmpty(ignoreWelcome = false): boolean {
		// Entering the mode closes the Welcome page, so it doesn't keep the editor area from hiding
		return this.editorGroupsService.mainPart.groups.every(group => group.editors.every(editor => ignoreWelcome && editor.typeId === gettingStartedInputTypeId));
	}

	private onDidLeave(): void {
		this.pendingHide.clear();
		if (!this.wasHiddenOnEnter()) {
			return;
		}

		this.storageService.remove(AgenticModeEditorArea.HIDDEN_ON_ENTER_STORAGE_KEY, StorageScope.WORKSPACE);
		if (!this.layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
			this.layoutService.setPartHidden(false, Parts.EDITOR_PART);
		}
	}
}
