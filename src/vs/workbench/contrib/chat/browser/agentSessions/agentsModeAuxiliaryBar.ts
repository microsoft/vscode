/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveElement } from '../../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../../common/views.js';
import { IAgentsModeService } from '../../../../services/agentsMode/common/agentsMode.js';
import { IWorkbenchLayoutService, Parts } from '../../../../services/layout/browser/layoutService.js';
import { ILifecycleService, LifecyclePhase } from '../../../../services/lifecycle/common/lifecycle.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { ChatViewId } from '../chat.js';

/**
 * Brings the Chat view, which hosts the sessions list, to the front of the secondary side bar when the window enters
 * Agents mode, showing the secondary side bar if it is hidden, and hides it again when the window leaves the mode if the
 * mode had shown it. Where the user moved the Chat view out of the secondary side bar, it is left alone; where they moved
 * it into another view container of the secondary side bar, that container comes to the front. Switching keeps
 * the secondary side bar at the width it had in the mode, however the window switches. The focus the Chat view had as the
 * window entered follows its chat to the chat part, which shows it in the mode.
 */
export class AgentsModeAuxiliaryBar extends Disposable {

	static readonly SHOWN_ON_ENTER_STORAGE_KEY = 'chat.agentsMode.auxiliaryBarShownOnEnter';
	/** The secondary side bar's width in the mode, as the window last switched. */
	static readonly WIDTH_STORAGE_KEY = 'chat.agentsMode.auxiliaryBarWidth';

	/** Whether the Chat view had focus as the window was about to enter the mode, before its chat moved to the chat part. */
	private chatViewFocusedOnEnter = false;
	private readonly pendingFocus = this._register(new MutableDisposable());

	constructor(
		@IAgentsModeService private readonly agentsModeService: IAgentsModeService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IStorageService private readonly storageService: IStorageService,
		@IViewsService private readonly viewsService: IViewsService,
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
		@ILifecycleService lifecycleService: ILifecycleService,
	) {
		super();

		// Switching moves the side bars and can hide the editor area, so the width is taken before: as the window leaves
		// the mode, and the first time it enters, where the secondary side bar is visible
		this._register(this.agentsModeService.onWillChange(entering => {
			this.chatViewFocusedOnEnter = entering && this.layoutService.hasFocus(Parts.AUXILIARYBAR_PART);
			const width = this.getWidth();
			if (width !== undefined && (!entering || this.storageService.getNumber(AgentsModeAuxiliaryBar.WIDTH_STORAGE_KEY, StorageScope.PROFILE) === undefined)) {
				this.storageService.store(AgentsModeAuxiliaryBar.WIDTH_STORAGE_KEY, width, StorageScope.PROFILE, StorageTarget.MACHINE);
			}
		}));

		// A window that left the mode while it could not run its leaving, such as one that restarts with the mode turned off
		if (!agentsModeService.isActive) {
			this.leaveOnceRestored(lifecycleService).catch(onUnexpectedError);
		}
	}

	/**
	 * Leaves the mode the window is no longer in once the window restored: this is created before the workbench lays its
	 * parts out, which it can't show or hide until then.
	 */
	private async leaveOnceRestored(lifecycleService: ILifecycleService): Promise<void> {
		await lifecycleService.when(LifecyclePhase.Restored);
		if (!this._store.isDisposed && !this.agentsModeService.isActive) {
			this.leave();
		}
	}

	/**
	 * @param token cancelled when the window switches again before entering finished
	 */
	async enter(token: CancellationToken = CancellationToken.None): Promise<void> {
		const chatViewFocused = this.chatViewFocusedOnEnter;
		this.chatViewFocusedOnEnter = false;
		this.pendingFocus.clear();
		if (this.viewDescriptorService.getViewLocationById(ChatViewId) !== ViewContainerLocation.AuxiliaryBar) {
			return;
		}

		const wasVisible = this.layoutService.isVisible(Parts.AUXILIARYBAR_PART);
		if (!wasVisible) {
			// Remembered in the window's storage, so leaving after a restart in the mode hides it again too
			this.storageService.store(AgentsModeAuxiliaryBar.SHOWN_ON_ENTER_STORAGE_KEY, true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}
		try {
			await this.viewsService.openView(ChatViewId, false);
		} catch (error) {
			onUnexpectedError(error);
		}
		if (token.isCancellationRequested) {
			// Leaving while the Chat view opened found the secondary side bar still hidden, which opening it then showed
			if (!wasVisible && !this.agentsModeService.isActive && this.layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
				this.layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
			}
			return;
		}
		if (!this.layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
			this.layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
		}

		// The chat the Chat view had focused moves to the chat part, which shows it as the window enters or later, and leaves
		// the focus nowhere: it follows the chat there, unless something else took it meanwhile
		if (chatViewFocused) {
			const focusChatPart = () => {
				const activeElement = getActiveElement();
				if (!activeElement || activeElement === activeElement.ownerDocument.body) {
					this.layoutService.focusPart(Parts.CHAT_PART);
				}
			};
			if (this.layoutService.isVisible(Parts.CHAT_PART)) {
				focusChatPart();
			} else {
				this.pendingFocus.value = this.layoutService.onDidChangePartVisibility(e => {
					if (e.partId === Parts.CHAT_PART && e.visible) {
						this.pendingFocus.clear();
						focusChatPart();
					}
				});
			}
		}
	}

	leave(): void {
		this.pendingFocus.clear();
		if (!this.storageService.getBoolean(AgentsModeAuxiliaryBar.SHOWN_ON_ENTER_STORAGE_KEY, StorageScope.WORKSPACE, false)) {
			return;
		}

		this.storageService.remove(AgentsModeAuxiliaryBar.SHOWN_ON_ENTER_STORAGE_KEY, StorageScope.WORKSPACE);
		if (this.layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
			this.layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
		}
	}

	/**
	 * Gives the secondary side bar, once the window switched, the width it had in the mode, whatever the Chat view did
	 * with it outside. The first time, without one, it takes the layout's default width.
	 */
	applyWidth(): void {
		const current = this.getWidth();
		if (current === undefined) {
			return;
		}
		const width = this.storageService.getNumber(AgentsModeAuxiliaryBar.WIDTH_STORAGE_KEY, StorageScope.PROFILE)
			// The layout's default width of a secondary side bar that was not resized yet
			?? Math.round(Math.min(300, this.layoutService.mainContainerDimension.width / 4));
		if (width !== current) {
			this.layoutService.setSize(Parts.AUXILIARYBAR_PART, { width, height: this.layoutService.getSize(Parts.AUXILIARYBAR_PART).height });
		}
	}

	private getWidth(): number | undefined {
		return this.layoutService.isVisible(Parts.AUXILIARYBAR_PART) && !this.layoutService.isAuxiliaryBarMaximized() ? this.layoutService.getSize(Parts.AUXILIARYBAR_PART).width : undefined;
	}
}
