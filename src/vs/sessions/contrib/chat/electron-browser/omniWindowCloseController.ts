/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Disposable } from '../../../../base/common/lifecycle.js';

export interface IOmniInputWindow {
	readonly isOpen: boolean;
	readonly onDidChangeOpen: Event<boolean>;
}

export interface IOmniOwnerWindow {
	readonly onDidFocus: Event<void>;
	hide(): Promise<void>;
	close(): Promise<void>;
}

export class OmniWindowCloseController extends Disposable {

	private closeOwnerWhenOmniCloses = false;

	constructor(
		private readonly omniInputWindow: IOmniInputWindow,
		private readonly ownerWindow: IOmniOwnerWindow,
	) {
		super();

		this._register(this.ownerWindow.onDidFocus(() => this.closeOwnerWhenOmniCloses = false));
		this._register(this.omniInputWindow.onDidChangeOpen(open => {
			if (!open && this.closeOwnerWhenOmniCloses) {
				this.closeOwnerWhenOmniCloses = false;
				this.ownerWindow.close().catch(onUnexpectedError);
			}
		}));
	}

	async preserveOmniOnOwnerClose(): Promise<boolean> {
		if (!this.omniInputWindow.isOpen) {
			return false;
		}

		await this.ownerWindow.hide();
		if (!this.omniInputWindow.isOpen) {
			return false;
		}

		this.closeOwnerWhenOmniCloses = true;
		return true;
	}
}
