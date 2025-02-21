/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IWorkbenchAssignmentService } from '../../../services/assignment/common/assignmentService.js';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar.js';
import { ChatContextKeys } from '../common/chatContextKeys.js';
import { IChatQuotasService } from '../common/chatQuotasService.js';
import { quotaToButtonMessage, OPEN_CHAT_QUOTA_EXCEEDED_DIALOG, CHAT_SETUP_ACTION_ID, CHAT_SETUP_ACTION_LABEL, CHAT_OPEN_ACTION_ID } from './actions/chatActions.js';

export class ChatStatusBarEntry extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'chat.statusBarEntry';

	private readonly treatment = this.assignmentService.getTreatment<boolean>('config.chat.experimental.statusIndicator.enabled'); //TODO@bpasero remove this experiment eventually

	private entry: IStatusbarEntryAccessor | undefined = undefined;

	constructor(
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IChatQuotasService private readonly chatQuotasService: IChatQuotasService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IWorkbenchAssignmentService private readonly assignmentService: IWorkbenchAssignmentService,
		@IProductService private readonly productService: IProductService
	) {
		super();

		this.create();
		this.registerListeners();
	}

	private async create(): Promise<void> {
		let enabled = false;
		if (this.productService.quality === 'stable') {
			enabled = (await this.treatment) === true;
		} else {
			enabled = true;
		}

		if (!enabled) {
			return;
		}

		this.entry = this.statusbarService.addEntry(this.getEntryProps(), ChatStatusBarEntry.ID, StatusbarAlignment.RIGHT, Number.NEGATIVE_INFINITY /* the end of the right hand side */);
	}

	private registerListeners(): void {
		const contextKeysSet = new Set([
			ChatContextKeys.Setup.limited.key,
			ChatContextKeys.Setup.installed.key,
			ChatContextKeys.Setup.canSignUp.key,
			ChatContextKeys.Setup.signedOut.key
		]);
		this._register(this.contextKeyService.onDidChangeContext(e => {
			if (!this.entry) {
				return;
			}

			if (e.affectsSome(contextKeysSet)) {
				this.entry.update(this.getEntryProps());
			}
		}));

		this._register(this.chatQuotasService.onDidChangeQuotas(() => this.entry?.update(this.getEntryProps())));
	}

	private getEntryProps(): IStatusbarEntry {
		let text = '$(copilot)';
		let ariaLabel = localize('chatStatus', "Copilot Status");
		let command: string | undefined = undefined;
		let tooltip: string | undefined = undefined;

		const { chatQuotaExceeded, completionsQuotaExceeded } = this.chatQuotasService.quotas;
		if (chatQuotaExceeded || completionsQuotaExceeded) {
			let quotaWarning: string;
			if (chatQuotaExceeded && !completionsQuotaExceeded) {
				quotaWarning = localize('chatQuotaExceededStatus', "Chat limit reached");
			} else if (completionsQuotaExceeded && !chatQuotaExceeded) {
				quotaWarning = localize('completionsQuotaExceededStatus', "Completions limit reached");
			} else {
				quotaWarning = localize('chatAndCompletionsQuotaExceededStatus', "Copilot limit reached");
			}

			text = `$(copilot-warning) ${quotaWarning}`;
			ariaLabel = quotaWarning;
			command = OPEN_CHAT_QUOTA_EXCEEDED_DIALOG;
			tooltip = quotaToButtonMessage({ chatQuotaExceeded, completionsQuotaExceeded });
		} else if (
			this.contextKeyService.getContextKeyValue<boolean>(ChatContextKeys.Setup.installed.key) === false ||
			this.contextKeyService.getContextKeyValue<boolean>(ChatContextKeys.Setup.canSignUp.key) === true
		) {
			command = CHAT_SETUP_ACTION_ID;
			tooltip = CHAT_SETUP_ACTION_LABEL.value;
		} else if (
			this.contextKeyService.getContextKeyValue<boolean>(ChatContextKeys.Setup.signedOut.key) === true
		) {
			text = '$(copilot-not-connected)';
			ariaLabel = localize('signInToUseCopilot', "Sign in to Use Copilot...");
			command = CHAT_OPEN_ACTION_ID;
			tooltip = localize('signInToUseCopilot', "Sign in to Use Copilot...");
		}

		return {
			name: localize('chatStatus', "Copilot Status"),
			text,
			ariaLabel,
			command,
			showInAllWindows: true,
			kind: 'copilot',
			tooltip
		};
	}

	override dispose(): void {
		this.entry?.dispose();
		this.entry = undefined;

		super.dispose();
	}
}
