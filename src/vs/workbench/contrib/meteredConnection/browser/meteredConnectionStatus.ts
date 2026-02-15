/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IMeteredConnectionService, METERED_CONNECTION_SETTING_KEY } from '../../../../platform/meteredConnection/common/meteredConnection.js';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';

export class MeteredConnectionStatusContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.meteredConnectionStatus';

	private readonly statusBarEntry = this._register(new MutableDisposable<IStatusbarEntryAccessor>());

	constructor(
		@IMeteredConnectionService private readonly meteredConnectionService: IMeteredConnectionService,
		@IStatusbarService private readonly statusbarService: IStatusbarService,
	) {
		super();

		this.updateStatusBarEntry(this.meteredConnectionService.isConnectionMetered);

		this._register(this.meteredConnectionService.onDidChangeIsConnectionMetered(isMetered => {
			this.updateStatusBarEntry(isMetered);
		}));
	}

	private updateStatusBarEntry(isMetered: boolean): void {
		if (isMetered) {
			if (!this.statusBarEntry.value) {
				this.statusBarEntry.value = this.statusbarService.addEntry(
					this.getStatusBarEntry(),
					MeteredConnectionStatusContribution.ID,
					StatusbarAlignment.RIGHT,
					-Number.MAX_VALUE // Show at the far right
				);
			}
		} else {
			this.statusBarEntry.clear();
		}
	}

	private getStatusBarEntry(): IStatusbarEntry {
		return {
			name: localize('status.meteredConnection', "Metered Connection"),
			text: '$(radio-tower)',
			ariaLabel: localize('status.meteredConnection.ariaLabel', "Metered Connection Detected"),
			tooltip: localize('status.meteredConnection.tooltip', "Metered connection detected. Some automatic features like extension updates, Settings Sync, and automatic Git operations are paused to reduce data usage."),
			command: {
				id: 'workbench.action.openSettings',
				title: localize('status.meteredConnection.configure', "Configure"),
				arguments: [`@id:${METERED_CONNECTION_SETTING_KEY}`]
			},
			showInAllWindows: true
		};
	}
}
