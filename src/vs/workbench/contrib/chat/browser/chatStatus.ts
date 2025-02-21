/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IStatusbarEntry, IStatusbarService, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar.js';
import { IChatQuotasService } from '../common/chatQuotasService.js';
import { quotaToButtonMessage, OPEN_CHAT_QUOTA_EXCEEDED_DIALOG } from './actions/chatActions.js';

export class ChatStatusBarEntry extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'chat.statusBarEntry';

	private readonly entry = this._register(this.statusbarService.addEntry(this.getStatusbarEntry(), ChatStatusBarEntry.ID, StatusbarAlignment.RIGHT, Number.NEGATIVE_INFINITY /* the end of the right hand side */));

	constructor(
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IChatQuotasService private readonly chatQuotasService: IChatQuotasService
	) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.chatQuotasService.onDidChangeQuotas(() => this.entry.update(this.getStatusbarEntry())));
	}

	private getStatusbarEntry(): IStatusbarEntry {
		let quotaWarning: string | undefined;
		let quotaTooltip: string | undefined;

		const { chatQuotaExceeded, completionsQuotaExceeded } = this.chatQuotasService.quotas;
		if (chatQuotaExceeded || completionsQuotaExceeded) {
			if (chatQuotaExceeded && !completionsQuotaExceeded) {
				quotaWarning = localize('chatQuotaExceededStatus', "Chat limit reached");
			} else if (completionsQuotaExceeded && !chatQuotaExceeded) {
				quotaWarning = localize('completionsQuotaExceededStatus', "Completions limit reached");
			} else {
				quotaWarning = localize('chatAndCompletionsQuotaExceededStatus', "Copilot limit reached");
			}

			quotaTooltip = quotaToButtonMessage({ chatQuotaExceeded, completionsQuotaExceeded });
		}

		return {
			name: localize('chatStatus', "Copilot Status"),
			text: quotaWarning ? `$(copilot-warning) ${quotaWarning}` : '$(copilot)',
			ariaLabel: quotaWarning ?? localize('chatStatus', "Copilot Status"),
			command: quotaWarning ? OPEN_CHAT_QUOTA_EXCEEDED_DIALOG : undefined,
			showInAllWindows: true,
			kind: 'copilot',
			tooltip: quotaTooltip
		};
	}
}

