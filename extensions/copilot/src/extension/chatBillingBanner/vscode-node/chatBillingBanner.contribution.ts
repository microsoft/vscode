/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { Disposable } from '../../../util/vs/base/common/lifecycle';

/** Internal workbench command that toggles banner eligibility for the active user. */
const SET_ENABLED_COMMAND = '_chat.billing.usageBannerSetEnabled';

/**
 * Reports whether the signed-in user is on usage-based billing to the
 * workbench-side billing banner service. The workbench layer remains the
 * single source of truth for visibility (eligibility + completion flag);
 * this contribution simply mirrors the auth-side eligibility signal across
 * the API boundary via an internal command.
 */
export class ChatBillingBannerContribution extends Disposable {

	private _lastEnabled: boolean | undefined;
	private _lastAccountId: string | undefined;

	constructor(
		@IAuthenticationService private readonly _authService: IAuthenticationService,
	) {
		super();
		this._register(this._authService.onDidAuthenticationChange(() => this._sync()));
		this._sync();
	}

	private _sync(): void {
		const token = this._authService.copilotToken;
		const enabled = !!token?.isUsageBasedBilling;
		const accountId = token?.username;
		if (enabled === this._lastEnabled && accountId === this._lastAccountId) {
			return;
		}
		this._lastEnabled = enabled;
		this._lastAccountId = accountId;
		void vscode.commands.executeCommand(SET_ENABLED_COMMAND, enabled, accountId);
	}
}
