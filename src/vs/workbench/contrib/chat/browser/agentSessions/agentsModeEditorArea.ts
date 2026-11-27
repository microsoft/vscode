/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../../base/browser/window.js';
import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IAgentsModeService } from '../../../../services/agentsMode/common/agentsMode.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IWorkbenchLayoutService, Parts } from '../../../../services/layout/browser/layoutService.js';
import { closeGettingStartedEditors } from '../../../welcomeGettingStarted/browser/gettingStartedInput.js';

/**
 * Hides an empty editor area when the window enters Agents mode, and shows it again
 * when the window leaves the mode if the mode had hidden it. Opening an editor in the mode
 * shows the editor area again. The editor area is only hidden when another part takes its
 * place (the chat part, the panel or a maximized secondary side bar), so hiding it never makes
 * the layout open the panel; otherwise it is hidden once the chat part shows. Closing the chat
 * part shows the editor area again; the next chat part shown in the mode takes its place again.
 */
export class AgentsModeEditorArea extends Disposable {

	static readonly HIDDEN_ON_ENTER_STORAGE_KEY = 'chat.agentsMode.editorAreaHiddenOnEnter';

	private readonly pendingHide = this._register(new MutableDisposable());

	constructor(
		@IAgentsModeService private readonly agentsModeService: IAgentsModeService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IStorageService private readonly storageService: IStorageService,
		@IEditorService private readonly editorService: IEditorService,
	) {
		super();

		// A window that left the mode while it could not run its leaving, such as one that restarts with the mode turned off
		if (!agentsModeService.isActive) {
			this.leave();
		}

		if (agentsModeService.isSupported) {
			this._register(editorService.onDidVisibleEditorsChange(() => this.showIfEditorOpened()));
			// Closing the chat part shows the empty editor area again: the next chat shown takes its place again
			this._register(layoutService.onDidChangePartVisibility(e => {
				if (e.partId === Parts.CHAT_PART && e.visible && agentsModeService.isActive && this.wasHiddenOnEnter()) {
					this.hideIfEmpty();
				}
			}));
		}
	}

	/**
	 * Closes the Welcome page, which is not for the mode, and then hides the editor area if nothing else is open in it.
	 */
	async enter(): Promise<void> {
		await closeGettingStartedEditors(this.editorService);
		this.hideIfEmpty();
	}

	private hideIfEmpty(): void {
		this.pendingHide.clear();
		if (!this.agentsModeService.isActive || !this.layoutService.isVisible(Parts.EDITOR_PART, mainWindow) || !this.isMainEditorAreaEmpty()) {
			return;
		}

		if (this.layoutService.isVisible(Parts.CHAT_PART)) {
			// The chat part takes the editor area's place
			this.layoutService.setEditorHiddenByChat(true);
		} else if (!this.layoutService.isVisible(Parts.PANEL_PART)) {
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
		this.storageService.store(AgentsModeEditorArea.HIDDEN_ON_ENTER_STORAGE_KEY, true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	private showIfEditorOpened(): void {
		if (!this.agentsModeService.isActive || !this.wasHiddenOnEnter() || this.isMainEditorAreaEmpty()) {
			return;
		}

		// An editor opened in the main window: show the editor area it opens in, leaving it to the user from now on
		this.pendingHide.clear();
		this.storageService.remove(AgentsModeEditorArea.HIDDEN_ON_ENTER_STORAGE_KEY, StorageScope.WORKSPACE);
		if (!this.layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
			this.layoutService.setPartHidden(false, Parts.EDITOR_PART);
		}
	}

	private wasHiddenOnEnter(): boolean {
		return this.storageService.getBoolean(AgentsModeEditorArea.HIDDEN_ON_ENTER_STORAGE_KEY, StorageScope.WORKSPACE, false);
	}

	private isMainEditorAreaEmpty(): boolean {
		return this.editorGroupsService.mainPart.groups.every(group => group.isEmpty);
	}

	leave(): void {
		this.pendingHide.clear();
		if (!this.wasHiddenOnEnter()) {
			return;
		}

		this.storageService.remove(AgentsModeEditorArea.HIDDEN_ON_ENTER_STORAGE_KEY, StorageScope.WORKSPACE);
		if (!this.layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
			this.layoutService.setPartHidden(false, Parts.EDITOR_PART);
		}
	}
}
