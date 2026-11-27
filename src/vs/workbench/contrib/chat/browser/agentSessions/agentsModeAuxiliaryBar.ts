/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../../common/views.js';
import { IAgentsModeService } from '../../../../services/agentsMode/common/agentsMode.js';
import { IWorkbenchLayoutService, Parts } from '../../../../services/layout/browser/layoutService.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { ChatViewContainerId } from '../chat.js';

/**
 * Shows a hidden secondary side bar with the Chat view when the window enters Agents mode, so the sessions list it
 * hosts is visible, and hides it again when the window leaves the mode if the mode had shown it. Switching keeps the
 * secondary side bar at the width it had in the mode, however the window switches.
 */
export class AgentsModeAuxiliaryBar extends Disposable {

	static readonly SHOWN_ON_ENTER_STORAGE_KEY = 'chat.agentsMode.auxiliaryBarShownOnEnter';
	/** The secondary side bar's width in the mode, as the window last switched. */
	static readonly WIDTH_STORAGE_KEY = 'chat.agentsMode.auxiliaryBarWidth';

	constructor(
		@IAgentsModeService agentsModeService: IAgentsModeService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IStorageService private readonly storageService: IStorageService,
		@IViewsService private readonly viewsService: IViewsService,
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
	) {
		super();

		// Switching moves the side bars and can hide the editor area, so the width is taken before: as the window leaves
		// the mode, and the first time it enters, where the secondary side bar is visible
		this._register(agentsModeService.onWillChange(entering => {
			const width = this.getWidth();
			if (width !== undefined && (!entering || this.storageService.getNumber(AgentsModeAuxiliaryBar.WIDTH_STORAGE_KEY, StorageScope.PROFILE) === undefined)) {
				this.storageService.store(AgentsModeAuxiliaryBar.WIDTH_STORAGE_KEY, width, StorageScope.PROFILE, StorageTarget.MACHINE);
			}
		}));

		// A window that left the mode while it could not run its leaving, such as one that restarts with the mode turned off
		if (!agentsModeService.isActive) {
			this.leave();
		}
	}

	async enter(): Promise<void> {
		if (this.layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
			return;
		}

		// Remembered in the window's storage, so leaving after a restart in the mode hides it again too
		this.storageService.store(AgentsModeAuxiliaryBar.SHOWN_ON_ENTER_STORAGE_KEY, true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		// With the Chat view, which hosts the sessions list, rather than what it showed last
		const chatViewContainer = this.viewDescriptorService.getViewContainerById(ChatViewContainerId);
		if (chatViewContainer && this.viewDescriptorService.getViewContainerLocation(chatViewContainer) === ViewContainerLocation.AuxiliaryBar) {
			await this.viewsService.openViewContainer(ChatViewContainerId, false);
		}
		if (!this.layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
			this.layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
		}
	}

	leave(): void {
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
