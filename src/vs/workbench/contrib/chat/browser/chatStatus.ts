/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
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
		this._register(Event.runAndSubscribe(this.chatQuotasService.onDidChangeQuotas, () => this.entry.update(this.getStatusbarEntry())));
	}

	private getStatusbarEntry(): IStatusbarEntry {
		let text: string;
		let quotaExceeded = false;

		const { chatQuotaExceeded, completionsQuotaExceeded } = this.chatQuotasService.quotas;
		if (chatQuotaExceeded || completionsQuotaExceeded) {
			if (chatQuotaExceeded && !completionsQuotaExceeded) {
				text = localize('chatQuotaExceededStatus', "Chat limit reached");
			} else if (completionsQuotaExceeded && !chatQuotaExceeded) {
				text = localize('completionsQuotaExceededStatus', "Completions limit reached");
			} else {
				text = localize('chatAndCompletionsQuotaExceededStatus', "Copilot limit reached");
			}

			text = `$(copilot-warning) ${text}`;
			quotaExceeded = true;
		} else {
			text = '$(copilot)';
		}

		return {
			name: localize('chatStatus', "Copilot Status"),
			text,
			ariaLabel: text,
			command: quotaExceeded ? OPEN_CHAT_QUOTA_EXCEEDED_DIALOG : undefined,
			showInAllWindows: true,
			kind: 'copilot',
			tooltip: quotaExceeded ? quotaToButtonMessage({ chatQuotaExceeded, completionsQuotaExceeded }) : undefined
		};
	}
}

