/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IDebugConfiguration, IDebugService } from 'vs/workbench/contrib/debug/common/debug';
import { ILifecycleService, ShutdownReason } from 'vs/workbench/services/lifecycle/common/lifecycle';

export class DebugLifecycle implements IWorkbenchContribution {
	constructor(
		@ILifecycleService lifecycleService: ILifecycleService,
		@IDebugService private readonly debugService: IDebugService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IDialogService private readonly dialogService: IDialogService,
	) {
		lifecycleService.onBeforeShutdown(async e => e.veto(this.shouldVetoShutdown(e.reason), 'veto.debug'));
	}

	private shouldVetoShutdown(_reason: ShutdownReason): boolean | Promise<boolean> {
		const rootSessions = this.debugService.getModel().getSessions().filter(s => s.parentSession === undefined);
		if (rootSessions.length === 0) {
			return false;
		}

		const shouldConfirmOnExit = this.configurationService.getValue<IDebugConfiguration>('debug').confirmOnExit;
		if (shouldConfirmOnExit === 'never') {
			return false;
		}

		return this._showWindowCloseConfirmation(rootSessions.length);
	}

	protected async _showWindowCloseConfirmation(numSessions: number): Promise<boolean> {
		let message: string;
		if (numSessions === 1) {
			message = nls.localize('debug.debugSessionCloseConfirmationSingular', "There is an active debug session, are you sure you want to stop it?");
		} else {
			message = nls.localize('debug.debugSessionCloseConfirmationPlural', "There are active debug sessions, are you sure you want to stop them?");
		}
		const res = await this.dialogService.confirm({
			message,
			type: 'warning',
			primaryButton: nls.localize('debug.stop', "Stop Debugging")
		});
		return !res.confirmed;
	}
}
