/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Severity from 'vs/base/common/severity';
import { localize } from 'vs/nls';
import { Action2 } from 'vs/platform/actions/common/actions';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IAuthenticationAccessService } from 'vs/workbench/services/authentication/browser/authenticationAccessService';
import { IAuthenticationUsageService } from 'vs/workbench/services/authentication/browser/authenticationUsageService';
import { IAuthenticationService } from 'vs/workbench/services/authentication/common/authentication';

export class SignOutOfAccountAction extends Action2 {
	constructor() {
		super({
			id: '_signOutOfAccount',
			title: localize('signOutOfAccount', "Sign out of account"),
			f1: false
		});
	}

	override async run(accessor: ServicesAccessor, { providerId, accountLabel }: { providerId: string; accountLabel: string }): Promise<void> {
		const authenticationService = accessor.get(IAuthenticationService);
		const authenticationUsageService = accessor.get(IAuthenticationUsageService);
		const authenticationAccessService = accessor.get(IAuthenticationAccessService);
		const dialogService = accessor.get(IDialogService);

		if (!providerId || !accountLabel) {
			throw new Error('Invalid arguments. Expected: { providerId: string; accountLabel: string }');
		}

		const allSessions = await authenticationService.getSessions(providerId);
		const sessions = allSessions.filter(s => s.account.label === accountLabel);

		const accountUsages = authenticationUsageService.readAccountUsages(providerId, accountLabel);

		const { confirmed } = await dialogService.confirm({
			type: Severity.Info,
			message: accountUsages.length
				? localize('signOutMessage', "The account '{0}' has been used by: \n\n{1}\n\n Sign out from these extensions?", accountLabel, accountUsages.map(usage => usage.extensionName).join('\n'))
				: localize('signOutMessageSimple', "Sign out of '{0}'?", accountLabel),
			primaryButton: localize({ key: 'signOut', comment: ['&& denotes a mnemonic'] }, "&&Sign Out")
		});

		if (confirmed) {
			const removeSessionPromises = sessions.map(session => authenticationService.removeSession(providerId, session.id));
			await Promise.all(removeSessionPromises);
			authenticationUsageService.removeAccountUsage(providerId, accountLabel);
			authenticationAccessService.removeAllowedExtensions(providerId, accountLabel);
		}
	}
}
