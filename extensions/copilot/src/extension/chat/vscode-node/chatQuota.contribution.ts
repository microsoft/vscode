/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { commands, env, Uri } from 'vscode';
import { IChatQuotaService } from '../../../platform/chat/common/chatQuotaService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IExtensionContribution } from '../../common/contributions';

export class ChatQuotaContribution extends Disposable implements IExtensionContribution {
	public readonly id = 'chat.quota';

	constructor(@IChatQuotaService chatQuotaService: IChatQuotaService) {
		super();
		this._register(commands.registerCommand('chat.enablePremiumOverages', () => {
			// Clear quota before opening the page to ensure that if the user enabled overages,
			// the next request they send won't try to downgrade them to the base model.
			chatQuotaService.clearQuota();
			env.openExternal(Uri.parse('https://aka.ms/github-copilot-manage-overage'));
		}));
	}
}