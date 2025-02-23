/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatStatus.css';
import { safeIntl } from '../../../../base/common/date.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { language } from '../../../../base/common/platform.js';
import { localize } from '../../../../nls.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IWorkbenchAssignmentService } from '../../../services/assignment/common/assignmentService.js';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar.js';
import { ChatContextKeys } from '../common/chatContextKeys.js';
import { IChatQuotasService } from '../common/chatQuotasService.js';
import { quotaToButtonMessage, OPEN_CHAT_QUOTA_EXCEEDED_DIALOG, CHAT_SETUP_ACTION_LABEL, TOGGLE_CHAT_ACTION_ID } from './actions/chatActions.js';
import { $ } from '../../../../base/browser/dom.js';
import { IChatEntitlementsService } from '../common/chatEntitlementsService.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';

export class ChatStatusBarEntry extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'chat.statusBarEntry';

	private readonly treatment = this.assignmentService.getTreatment<boolean>('config.chat.experimental.statusIndicator.enabled'); //TODO@bpasero remove this experiment eventually

	private entry: IStatusbarEntryAccessor | undefined = undefined;

	private dateFormatter = safeIntl.DateTimeFormat(language, { year: 'numeric', month: 'long', day: 'numeric' });

	constructor(
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IChatQuotasService private readonly chatQuotasService: IChatQuotasService,
		@IChatEntitlementsService private readonly chatEntitlementsService: IChatEntitlementsService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IWorkbenchAssignmentService private readonly assignmentService: IWorkbenchAssignmentService,
		@IProductService private readonly productService: IProductService,
		@IKeybindingService private readonly keybindingService: IKeybindingService
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

		this.entry = this._register(this.statusbarService.addEntry(this.getEntryProps(), ChatStatusBarEntry.ID, StatusbarAlignment.RIGHT, Number.NEGATIVE_INFINITY /* the end of the right hand side */));
	}

	private registerListeners(): void {
		const contextKeysSet = new Set([
			ChatContextKeys.Setup.hidden.key,
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

			this.statusbarService.updateEntryVisibility(ChatStatusBarEntry.ID, !this.contextKeyService.getContextKeyValue<boolean>(ChatContextKeys.Setup.hidden.key));
		}));

		this._register(this.chatQuotasService.onDidChangeQuotaExceeded(() => this.entry?.update(this.getEntryProps())));
	}

	private getEntryProps(): IStatusbarEntry {
		let text = '$(copilot)';
		let ariaLabel = localize('chatStatus', "Copilot Status");
		let command = TOGGLE_CHAT_ACTION_ID;
		let tooltip: string | (() => HTMLElement) = localize('openChat', "Open Chat ({0})", this.keybindingService.lookupKeybinding(command)?.getLabel() ?? '');

		// Quota Exceeded
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
		}

		// Copilot Not Installed
		else if (
			this.contextKeyService.getContextKeyValue<boolean>(ChatContextKeys.Setup.installed.key) === false ||
			this.contextKeyService.getContextKeyValue<boolean>(ChatContextKeys.Setup.canSignUp.key) === true
		) {
			tooltip = CHAT_SETUP_ACTION_LABEL.value;
		}

		// Signed out
		else if (this.contextKeyService.getContextKeyValue<boolean>(ChatContextKeys.Setup.signedOut.key) === true) {
			text = '$(copilot-not-connected)';
			ariaLabel = localize('signInToUseCopilot', "Sign in to Use Copilot...");
			tooltip = localize('signInToUseCopilot', "Sign in to Use Copilot...");
		}

		// Copilot Limited User
		else if (this.contextKeyService.getContextKeyValue<boolean>(ChatContextKeys.Setup.limited.key) === true) {
			tooltip = () => {
				const container = $('div.chat-status-bar-entry');
				container.appendChild($('div', undefined, localize('limitTitle', "You are currently using Copilot Free:")));

				const quotas = this.chatQuotasService.quotas;
				const chatQuotaIndicator = this.createQuotaIndicator(quotas.chatTotal, quotas.chatRemaining, localize('chatsLabel', "Chat Messages"));
				container.appendChild(chatQuotaIndicator.element);

				const completionsQuotaIndicator = this.createQuotaIndicator(quotas.completionsTotal, quotas.completionsRemaining, localize('completionsLabel', "Code Completions"));
				container.appendChild(completionsQuotaIndicator.element);

				this.chatEntitlementsService.resolve(CancellationToken.None).then(entitlements => {
					const quotas = this.chatQuotasService.quotas;
					if (typeof quotas?.chatTotal === 'number' && typeof quotas?.chatRemaining === 'number') {
						chatQuotaIndicator.update(quotas.chatTotal, quotas.chatRemaining);
					}
					if (typeof quotas?.completionsTotal === 'number' && typeof quotas?.completionsRemaining === 'number') {
						completionsQuotaIndicator.update(quotas.completionsTotal, quotas.completionsRemaining);
					}
				});

				container.appendChild($('div', undefined, localize('limitQuota', "Limits will reset on {0}.", this.dateFormatter.format(this.chatQuotasService.quotas.quotaResetDate))));

				return container;
			};
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

	private createQuotaIndicator(total: number | undefined, remaining: number | undefined, label: string): { element: HTMLElement; update: (total: number, remaining: number) => void } {
		const quotaLabel = $('span', undefined);
		const quotaBit = $('div.quota-bit');
		const quotaContainer = $('div.quota-indicator', undefined,
			$('div.quota-label', undefined,
				$('span', undefined, label),
				quotaLabel
			),
			$('div.quota-bar', undefined,
				quotaBit
			)
		);

		const update = (newTotal: number, newRemaining: number) => {
			quotaLabel.textContent = localize('quotaDisplay', "{0} / {1}", newRemaining, newTotal);
			quotaBit.style.width = `${(newRemaining / newTotal) * 100}%`;
		};

		if (typeof total === 'number' && typeof remaining === 'number') {
			update(total, remaining);
		}

		return {
			element: quotaContainer,
			update
		};
	}
}
