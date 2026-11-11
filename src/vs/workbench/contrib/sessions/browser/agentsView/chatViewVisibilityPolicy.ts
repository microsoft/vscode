/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../../common/views.js';
import { IWorkbenchLayoutService, Parts } from '../../../../services/layout/browser/layoutService.js';
import { IPaneCompositePartService } from '../../../../services/panecomposite/browser/panecomposite.js';
import { ChatViewContainerId } from '../../../chat/browser/chat.js';

/** Where the Chat view showed when the chat part hid it, until the chat part closes or the user shows it again. */
const HIDDEN_CHAT_VIEW_STORAGE_KEY = 'workbench.chatPart.hiddenChatView';

type ChatViewPartLocation = ViewContainerLocation.AuxiliaryBar | ViewContainerLocation.Panel;

function partOf(location: ChatViewPartLocation): Parts.AUXILIARYBAR_PART | Parts.PANEL_PART {
	return location === ViewContainerLocation.AuxiliaryBar ? Parts.AUXILIARYBAR_PART : Parts.PANEL_PART;
}

/**
 * Hides the Chat view while the chat part shows, so that the window shows one chat surface, and shows it again as the chat
 * part closes, only when the chat part hid it:
 * - as the chat part shows, the Secondary Side Bar or the panel hides when it shows the Chat view as its active view;
 * - as the user shows that part, opens the Chat view or moves it, the Chat view is the user's again, and stays as it is;
 * - as the chat part closes, the part shows the Chat view again, without focus.
 * What it hid survives a reload: the chat part closing after it still shows the Chat view again.
 */
export class ChatViewVisibilityPolicy extends Disposable {

	private _changing = false;

	constructor(
		@IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
		@IPaneCompositePartService private readonly _paneCompositeService: IPaneCompositePartService,
		@IViewDescriptorService private readonly _viewDescriptorService: IViewDescriptorService,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();

		this._register(this._layoutService.onDidChangePartVisibility(({ partId, visible }) => {
			if (partId === Parts.CHAT_PART) {
				if (visible) {
					this._hideChatView();
				} else {
					void this._showChatView().catch(onUnexpectedError);
				}
			} else if (visible && !this._changing) {
				const hidden = this._readHidden();
				if (hidden !== undefined && partId === partOf(hidden)) {
					this._clearHidden();
				}
			}
		}));
		this._register(this._paneCompositeService.onDidPaneCompositeOpen(({ composite }) => {
			if (!this._changing && composite.getId() === ChatViewContainerId) {
				this._clearHidden();
			}
		}));
		this._register(this._viewDescriptorService.onDidChangeContainerLocation(({ viewContainer }) => {
			if (viewContainer.id === ChatViewContainerId) {
				this._clearHidden();
			}
		}));
	}

	private _hideChatView(): void {
		const container = this._viewDescriptorService.getViewContainerById(ChatViewContainerId);
		const location = container ? this._viewDescriptorService.getViewContainerLocation(container) : null;
		if (location !== ViewContainerLocation.AuxiliaryBar && location !== ViewContainerLocation.Panel) {
			return; // not where it shows beside the chat part: the Primary Side Bar shows the Sessions view
		}
		const part = partOf(location);
		if (!this._layoutService.isVisible(part) || this._paneCompositeService.getActivePaneComposite(location)?.getId() !== ChatViewContainerId) {
			return;
		}

		this._changing = true;
		try {
			if (location === ViewContainerLocation.AuxiliaryBar) {
				this._layoutService.setAuxiliaryBarMaximized(false);
			}
			this._layoutService.setPartHidden(true, part);
		} finally {
			this._changing = false;
		}
		this._storageService.store(HIDDEN_CHAT_VIEW_STORAGE_KEY, JSON.stringify({ location }), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	private async _showChatView(): Promise<void> {
		const location = this._readHidden();
		if (location === undefined) {
			return;
		}
		this._clearHidden();
		if (this._layoutService.isVisible(partOf(location))) {
			return;
		}

		this._changing = true;
		try {
			this._layoutService.setPartHidden(false, partOf(location));
			await this._paneCompositeService.openPaneComposite(ChatViewContainerId, location, false);
		} finally {
			this._changing = false;
		}
	}

	private _readHidden(): ChatViewPartLocation | undefined {
		const raw = this._storageService.get(HIDDEN_CHAT_VIEW_STORAGE_KEY, StorageScope.WORKSPACE);
		if (!raw) {
			return undefined;
		}
		try {
			const { location } = JSON.parse(raw) as { location?: unknown };
			return location === ViewContainerLocation.AuxiliaryBar || location === ViewContainerLocation.Panel ? location : undefined;
		} catch {
			return undefined;
		}
	}

	private _clearHidden(): void {
		this._storageService.remove(HIDDEN_CHAT_VIEW_STORAGE_KEY, StorageScope.WORKSPACE);
	}
}
