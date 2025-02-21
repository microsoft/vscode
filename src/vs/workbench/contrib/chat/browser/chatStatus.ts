/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar.js';
import { IChatQuotasService } from '../common/chatQuotasService.js';
import { quotaToButtonMessage, OPEN_CHAT_QUOTA_EXCEEDED_DIALOG } from './actions/chatActions.js';

export class ChatStatusBarEntry extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'chat.statusBarEntry';

	private static readonly ENTRY_SETTING = 'chat.experimental.statusIndicator.enabled';

	private entry: IStatusbarEntryAccessor | undefined = undefined;

	constructor(
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IChatQuotasService private readonly chatQuotasService: IChatQuotasService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();

		this.create();
		this.registerListeners();
	}

	private create(): void {
		const enabled = this.configurationService.getValue(ChatStatusBarEntry.ENTRY_SETTING) !== false;
		if (enabled && !this.entry) {
			this.entry = this.statusbarService.addEntry(this.getStatusbarEntry(), ChatStatusBarEntry.ID, StatusbarAlignment.RIGHT, Number.NEGATIVE_INFINITY /* the end of the right hand side */);
		} else if (!enabled && this.entry) {
			this.entry.dispose();
			this.entry = undefined;
		}
	}

	private registerListeners(): void {
		this._register(this.chatQuotasService.onDidChangeQuotas(() => this.entry?.update(this.getStatusbarEntry())));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatStatusBarEntry.ENTRY_SETTING)) {
				this.create();
			}
		}));
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

	override dispose(): void {
		this.entry?.dispose();
		this.entry = undefined;

		super.dispose();
	}
}
