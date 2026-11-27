/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../../base/common/async.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IAgenticModeService } from '../../../../services/agenticMode/common/agenticMode.js';
import { IWorkbenchLayoutService, Parts } from '../../../../services/layout/browser/layoutService.js';

/**
 * Shows a hidden secondary side bar when the window enters Agentic Mode, so the sessions list it hosts is visible,
 * and hides it again when the window leaves the mode if the mode had shown it.
 */
export class AgenticModeAuxiliaryBar extends Disposable {

	static readonly SHOWN_ON_ENTER_STORAGE_KEY = 'chat.agenticMode.auxiliaryBarShownOnEnter';

	/**
	 * How long after leaving the mode the secondary side bar is kept hidden: leaving hands the chat back to the Chat view,
	 * which opens it and with it the side bar.
	 */
	static readonly KEEP_HIDDEN_ON_LEAVE_MS = 2000;

	private readonly keepHidden = this._register(new MutableDisposable());

	constructor(
		@IAgenticModeService agenticModeService: IAgenticModeService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();

		if (agenticModeService.isSupported) {
			this._register(agenticModeService.onDidChange(active => active ? this.onDidEnter() : this.onDidLeave()));
		}
	}

	private onDidEnter(): void {
		this.keepHidden.clear();
		if (this.layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
			return;
		}

		this.layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
		// Remembered in the window's storage, so leaving after a restart in the mode hides it again too
		this.storageService.store(AgenticModeAuxiliaryBar.SHOWN_ON_ENTER_STORAGE_KEY, true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	private onDidLeave(): void {
		if (!this.storageService.getBoolean(AgenticModeAuxiliaryBar.SHOWN_ON_ENTER_STORAGE_KEY, StorageScope.WORKSPACE, false)) {
			return;
		}

		this.storageService.remove(AgenticModeAuxiliaryBar.SHOWN_ON_ENTER_STORAGE_KEY, StorageScope.WORKSPACE);
		this.hide();

		// The Chat view taking the chat back opens the side bar once, after the mode is left: hide it again then
		const store = new DisposableStore();
		this.keepHidden.value = store;
		store.add(this.layoutService.onDidChangePartVisibility(e => {
			if (e.partId === Parts.AUXILIARYBAR_PART && e.visible) {
				this.keepHidden.clear();
				this.hide();
			}
		}));
		store.add(disposableTimeout(() => this.keepHidden.clear(), AgenticModeAuxiliaryBar.KEEP_HIDDEN_ON_LEAVE_MS));
	}

	private hide(): void {
		if (this.layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
			this.layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
		}
	}
}
