/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { safeIntl } from '../../../../base/common/date.js';
import { language } from '../../../../base/common/platform.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { createDecorator, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import product from '../../../../platform/product/common/product.js';
import { URI } from '../../../../base/common/uri.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar.js';

export const IChatQuotasService = createDecorator<IChatQuotasService>('chatQuotasService');

export interface IChatQuotasService {
	_serviceBrand: undefined;

	readonly onDidChangeQuotas: Event<void>;
	readonly quotas: IChatQuotas;

	acceptQuotas(quotas: IChatQuotas): void;
}

export interface IChatQuotas {
	readonly chatQuotaExceeded: boolean;
	readonly completionsQuotaExceeded: boolean;
	readonly quotaResetDate: Date;
}

export const OPEN_CHAT_QUOTA_EXCEEDED_DIALOG = 'workbench.action.chat.openQuotaExceededDialog';

export class ChatQuotasService extends Disposable implements IChatQuotasService {

	declare _serviceBrand: undefined;

	private readonly _onDidChangeQuotas = this._register(new Emitter<void>());
	readonly onDidChangeQuotas: Event<void> = this._onDidChangeQuotas.event;

	private _quotas = { chatQuotaExceeded: false, completionsQuotaExceeded: false, quotaResetDate: new Date(0) };
	get quotas(): IChatQuotas { return this._quotas; }

	private QuotaContextKeys = { // TODO@bpasero move into product.json or turn into core keys
		chatQuotaExceeded: 'github.copilot.chat.quotaExceeded',
		completionsQuotaExceeded: 'github.copilot.completions.quotaExceeded',
	};

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super();

		this.registerListeners();
		this.registerActions();
	}

	private registerListeners(): void {
		const chatQuotaExceededSet = new Set([this.QuotaContextKeys.chatQuotaExceeded]);
		const completionsQuotaExceededSet = new Set([this.QuotaContextKeys.completionsQuotaExceeded]);

		this._register(this.contextKeyService.onDidChangeContext(e => {
			let fireEvent = false;
			if (e.affectsSome(chatQuotaExceededSet)) {
				const newChatQuotaExceeded = this.contextKeyService.getContextKeyValue<boolean>(this.QuotaContextKeys.chatQuotaExceeded);
				if (typeof newChatQuotaExceeded === 'boolean' && newChatQuotaExceeded !== this._quotas.chatQuotaExceeded) {
					this._quotas.chatQuotaExceeded = newChatQuotaExceeded;
					fireEvent = true;
				}
			}

			if (e.affectsSome(completionsQuotaExceededSet)) {
				const newCompletionsQuotaExceeded = this.contextKeyService.getContextKeyValue<boolean>(this.QuotaContextKeys.completionsQuotaExceeded);
				if (typeof newCompletionsQuotaExceeded === 'boolean' && newCompletionsQuotaExceeded !== this._quotas.completionsQuotaExceeded) {
					this._quotas.completionsQuotaExceeded = newCompletionsQuotaExceeded;
					fireEvent = true;
				}
			}

			if (fireEvent) {
				this._onDidChangeQuotas.fire();
			}
		}));
	}

	private registerActions(): void {
		const that = this;

		class ShowLimitReachedDialogAction extends Action2 {

			constructor() {
				super({
					id: OPEN_CHAT_QUOTA_EXCEEDED_DIALOG,
					title: localize('upgradeChat', "Upgrade to Copilot Pro"),
				});
			}

			override async run(accessor: ServicesAccessor) {
				const openerService = accessor.get(IOpenerService);
				const dialogService = accessor.get(IDialogService);

				let message: string;
				const { chatQuotaExceeded, completionsQuotaExceeded } = that.quotas;
				if (chatQuotaExceeded && !completionsQuotaExceeded) {
					message = localize('out of free chat responses', "You've run out of free chat responses, but free code completions are still available as part of the Copilot Free plan.");
				} else if (completionsQuotaExceeded && !chatQuotaExceeded) {
					message = localize('out of completions', "You've run out of free code completions, but free chat responses are still available as part of the Copilot Free plan.");
				} else {
					message = localize('out of limits', "You've reached the limits of the Copilot Free plan.");
				}

				const dateFormatter = safeIntl.DateTimeFormat(language, { year: 'numeric', month: 'long', day: 'numeric' });
				const resetMessage = localize('limit reset', "Your limits will reset on {0}.", dateFormatter.format(that.quotas.quotaResetDate));
				const upgradeToPro = localize('upgradeToPro', "Here's what you can expect when upgrading to Copilot Pro:\n- Unlimited code completions\n- Unlimited chat interactions\n- 30 day free trial");

				await dialogService.prompt({
					type: 'none',
					message: localize('limit reached', "Copilot Free"),
					cancelButton: {
						label: localize('dismiss', "Dismiss"),
						run: () => { /* noop */ }
					},
					buttons: [
						{
							label: localize('managePlan', "Upgrade to Copilot Pro"),
							run: () => { openerService.open(URI.parse(product.defaultChatAgent?.upgradePlanUrl ?? '')); }
						},
					],
					custom: {
						closeOnLinkClick: true,
						icon: Codicon.copilot,
						markdownDetails: [
							{ markdown: new MarkdownString(`${message} ${resetMessage}`, true) },
							{ markdown: new MarkdownString(upgradeToPro, true) }
						]
					}
				});
			}
		}

		class SimulateCopilotQuotaExceeded extends Action2 {
			constructor() {
				super({
					id: 'workbench.action.chat.simulateCopilotQuotaExceeded',
					title: localize2('simulateCopilotQuotaExceeded', "Simulate Copilot Quota Exceeded"),
					f1: true,
					category: Categories.Developer
				});
			}

			override async run(accessor: ServicesAccessor): Promise<void> {
				const inputService = accessor.get(IQuickInputService);
				const result = await inputService.pick([
					{ label: 'Chat' },
					{ label: 'Completions' }
				], { canPickMany: true, placeHolder: 'Pick the quotas to exceed' });

				if (result) {
					const resultSet = new Set(result.map(r => r.label));
					that.acceptQuotas({
						chatQuotaExceeded: resultSet.has('Chat'),
						completionsQuotaExceeded: resultSet.has('Completions'),
						quotaResetDate: new Date()
					});
				}
			}
		}

		registerAction2(ShowLimitReachedDialogAction);
		if (product.quality !== 'stable') {
			registerAction2(SimulateCopilotQuotaExceeded);
		}
	}

	acceptQuotas(quotas: IChatQuotas): void {
		this._quotas = quotas;

		this._onDidChangeQuotas.fire();
	}
}

export class ChatQuotasStatusBarEntry extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'chat.quotasStatusBarEntry';

	private readonly _entry = this._register(new MutableDisposable<IStatusbarEntryAccessor>());

	constructor(
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IChatQuotasService private readonly chatQuotasService: IChatQuotasService
	) {
		super();

		this._register(this.chatQuotasService.onDidChangeQuotas(() => this.updateStatusbarEntry()));
	}

	private updateStatusbarEntry(): void {
		const { chatQuotaExceeded, completionsQuotaExceeded } = this.chatQuotasService.quotas;
		if (chatQuotaExceeded || completionsQuotaExceeded) {
			// Some quota exceeded, show indicator
			this._entry.value = this.statusbarService.addEntry({
				name: localize('indicator', "Copilot Quota Indicator"),
				text: `$(copilot-warning) ${localize('limitReached', "Limit Reached")}`,
				ariaLabel: localize('copilotQuotaExceeded', "Copilot Limit Reached"),
				command: OPEN_CHAT_QUOTA_EXCEEDED_DIALOG,
				kind: 'prominent',
				showInAllWindows: true,
				tooltip: quotaToButtonMessage({ chatQuotaExceeded, completionsQuotaExceeded }),
			}, ChatQuotasStatusBarEntry.ID, StatusbarAlignment.RIGHT, { id: 'GitHub.copilot.status', alignment: StatusbarAlignment.RIGHT });
		} else {
			// No quota exceeded, remove indicator
			if (this._entry.value) {
				this._entry.clear();
			}
		}
	}
}

export function quotaToButtonMessage({ chatQuotaExceeded, completionsQuotaExceeded }: { chatQuotaExceeded: boolean; completionsQuotaExceeded: boolean }): string {
	if (chatQuotaExceeded && !completionsQuotaExceeded) {
		return localize('chatQuotaExceeded', "You've reached your monthly chat messages limit, click for details");
	} else if (completionsQuotaExceeded && !chatQuotaExceeded) {
		return localize('completionsQuotaExceeded', "You've reached your monthly code completions limit, click for details");
	} else {
		return localize('chatAndCompletionsQuotaExceeded', "You've reached the limits of your Copilot Free plan, click for details");
	}
}
