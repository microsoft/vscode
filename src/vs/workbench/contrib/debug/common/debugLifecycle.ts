/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import * as nls from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IDebugConfiguration, IDebugService } from './debug.js';
import { ILifecycleService, ShutdownReason } from '../../../services/lifecycle/common/lifecycle.js';
import { IUnattendedRestartService } from '../../../services/lifecycle/common/unattendedRestart.js';

export class DebugLifecycle implements IWorkbenchContribution {
	private disposable: IDisposable;

	constructor(
		@ILifecycleService lifecycleService: ILifecycleService,
		@IDebugService private readonly debugService: IDebugService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IDialogService private readonly dialogService: IDialogService,
	) {
		this.disposable = lifecycleService.onBeforeShutdown(async e => e.veto(this.shouldVetoShutdown(e.reason), 'veto.debug'));
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

		return this.showWindowCloseConfirmation(rootSessions.length);
	}

	public dispose() {
		return this.disposable.dispose();
	}

	private async showWindowCloseConfirmation(numSessions: number): Promise<boolean> {
		let message: string;
		if (numSessions === 1) {
			message = nls.localize('debug.debugSessionCloseConfirmationSingular', "There is an active debug session, are you sure you want to stop it?");
		} else {
			message = nls.localize('debug.debugSessionCloseConfirmationPlural', "There are active debug sessions, are you sure you want to stop them?");
		}
		const res = await this.dialogService.confirm({
			message,
			type: 'warning',
			primaryButton: nls.localize({ key: 'debug.stop', comment: ['&& denotes a mnemonic'] }, "&&Stop Debugging")
		});
		return !res.confirmed;
	}
}

/**
 * Blocks an unattended restart while debugging. Unlike {@link DebugLifecycle}, this is created
 * after restore, before windows report that they finished starting.
 */
export class DebugUnattendedRestartParticipant extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.debugUnattendedRestartParticipant';

	constructor(
		@IUnattendedRestartService unattendedRestartService: IUnattendedRestartService,
		@IDebugService debugService: IDebugService,
	) {
		super();

		this._register(unattendedRestartService.registerParticipant({
			check: () => debugService.getModel().getSessions().length > 0 ? 'debug.sessionActive' : undefined
		}));
	}
}
