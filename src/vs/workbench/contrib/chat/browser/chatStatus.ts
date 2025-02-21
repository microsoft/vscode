/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IStatusbarService, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar.js';
import { IChatQuotasService } from '../common/chatQuotasService.js';
import { quotaToButtonMessage, OPEN_CHAT_QUOTA_EXCEEDED_DIALOG } from './actions/chatActions.js';

export class ChatStatusBarEntry extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'chat.quotasStatusBarEntry';

	private readonly entry = this._register(new DisposableStore());

	constructor(
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IChatQuotasService private readonly chatQuotasService: IChatQuotasService
	) {
		super();

		this.registerListeners();

		setTimeout(() => {
			chatQuotasService.acceptQuotas({ chatQuotaExceeded: true, completionsQuotaExceeded: false, quotaResetDate: new Date() });
		}, 5000);
	}

	private registerListeners(): void {
		this._register(Event.runAndSubscribe(this.chatQuotasService.onDidChangeQuotas, () => this.updateStatusbarEntry()));
	}

	private updateStatusbarEntry(): void {
		this.entry.clear();

		const { chatQuotaExceeded, completionsQuotaExceeded } = this.chatQuotasService.quotas;
		if (chatQuotaExceeded || completionsQuotaExceeded) {
			let text: string;
			if (chatQuotaExceeded && !completionsQuotaExceeded) {
				text = localize('chatQuotaExceededStatus', "Chat limit reached");
			} else if (completionsQuotaExceeded && !chatQuotaExceeded) {
				text = localize('completionsQuotaExceededStatus', "Completions limit reached");
			} else {
				text = localize('chatAndCompletionsQuotaExceededStatus', "Copilot limit reached");
			}

			this.entry.add(this.statusbarService.addEntry({
				name: localize('indicator', "Copilot Limit Indicator"),
				text: `$(copilot-warning) ${text}`,
				ariaLabel: text,
				command: OPEN_CHAT_QUOTA_EXCEEDED_DIALOG,
				showInAllWindows: true,
				kind: 'prominent',
				tooltip: quotaToButtonMessage({ chatQuotaExceeded, completionsQuotaExceeded })
			}, ChatStatusBarEntry.ID, StatusbarAlignment.RIGHT, 1));
		}
	}
}

