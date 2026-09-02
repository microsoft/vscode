/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, observableValue, transaction } from '../../../../base/common/observable.js';
import { observableMemento, type ObservableMemento } from '../../../../platform/observable/common/observableMemento.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import type { IAutomationService } from '../../../../workbench/contrib/chat/common/automations/automationService.js';
import type { ICustomViewService } from '../../../services/customView/browser/customViewService.js';
import { AUTOMATIONS_CUSTOM_VIEW_ID } from './automationsConstants.js';

export const AUTOMATIONS_NEW_BADGE_SEEN_STORAGE_KEY = 'sessions.automations.newBadgeSeen';

const automationsNewBadgeSeenMemento = observableMemento<boolean>({
	key: AUTOMATIONS_NEW_BADGE_SEEN_STORAGE_KEY,
	defaultValue: false,
	toStorage: value => String(value),
	fromStorage: value => value === 'true',
});

/** Owns the first-use state for the Automations shortcut badge. */
export class AutomationsNewBadgeState extends Disposable {

	private readonly seen: ObservableMemento<boolean>;
	private readonly initialized = observableValue(this, false);
	private observingActiveView = false;
	readonly showNewBadge = derived(this, reader => this.initialized.read(reader) && !this.seen.read(reader));

	constructor(
		private readonly automationService: IAutomationService,
		private readonly customViewService: ICustomViewService,
		storageService: IStorageService,
	) {
		super();
		this.seen = this._register(automationsNewBadgeSeenMemento(StorageScope.APPLICATION, StorageTarget.MACHINE, storageService));
	}

	initialize(): void {
		if (!this.observingActiveView) {
			this.observingActiveView = true;
			this._register(autorun(reader => {
				if (this.customViewService.activeCustomView.read(reader)?.id === AUTOMATIONS_CUSTOM_VIEW_ID) {
					this.markSeen();
				}
			}));
		}
		if (this.initialized.get()) {
			return;
		}

		const hasPriorUse = this.seen.get()
			|| this.automationService.automations.get().length > 0
			|| this.automationService.runs.get().length > 0;
		transaction(tx => {
			if (hasPriorUse) {
				this.seen.set(true, tx);
			}
			this.initialized.set(true, tx);
		});
	}

	markSeen(): void {
		transaction(tx => {
			if (!this.seen.get()) {
				this.seen.set(true, tx);
			}
			if (!this.initialized.get()) {
				this.initialized.set(true, tx);
			}
		});
	}
}
