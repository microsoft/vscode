/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { safeIntl } from '../../../../base/common/date.js';
import { language } from '../../../../base/common/platform.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { createDecorator, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import product from '../../../../platform/product/common/product.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IStatusbarService, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar.js';
import { ChatContextKeys } from '../common/chatContextKeys.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';

export const IChatQuotasService = createDecorator<IChatQuotasService>('chatQuotasService');

export interface IChatQuotasService {
	_serviceBrand: undefined;

	readonly onDidChangeQuotas: Event<void>;
	readonly quotas: IChatQuotas;

	acceptQuotas(quotas: IChatQuotas): void;
	clearQuotas(): void;
}

export interface IChatQuotas {
	chatQuotaExceeded: boolean;
	completionsQuotaExceeded: boolean;
	quotaResetDate: Date | undefined;
}

export const OPEN_CHAT_QUOTA_EXCEEDED_DIALOG = 'workbench.action.chat.openQuotaExceededDialog';

export class ChatQuotasService extends Disposable implements IChatQuotasService {

	declare _serviceBrand: undefined;

	private readonly _onDidChangeQuotas = this._register(new Emitter<void>());
	readonly onDidChangeQuotas: Event<void> = this._onDidChangeQuotas.event;

	private _quotas: IChatQuotas = { chatQuotaExceeded: false, completionsQuotaExceeded: false, quotaResetDate: undefined };
	get quotas(): IChatQuotas { return this._quotas; }

	private readonly chatQuotaExceededContextKey = ChatContextKeys.chatQuotaExceeded.bindTo(this.contextKeyService);
	private readonly completionsQuotaExceededContextKey = ChatContextKeys.completionsQuotaExceeded.bindTo(this.contextKeyService);

	private ExtensionQuotaContextKeys = { // TODO@bpasero move into product.json or turn into core keys
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
		const chatQuotaExceededSet = new Set([this.ExtensionQuotaContextKeys.chatQuotaExceeded]);
		const completionsQuotaExceededSet = new Set([this.ExtensionQuotaContextKeys.completionsQuotaExceeded]);

		this._register(this.contextKeyService.onDidChangeContext(e => {
			let changed = false;
			if (e.affectsSome(chatQuotaExceededSet)) {
				const newChatQuotaExceeded = this.contextKeyService.getContextKeyValue<boolean>(this.ExtensionQuotaContextKeys.chatQuotaExceeded);
				if (typeof newChatQuotaExceeded === 'boolean' && newChatQuotaExceeded !== this._quotas.chatQuotaExceeded) {
					this._quotas.chatQuotaExceeded = newChatQuotaExceeded;
					changed = true;
				}
			}

			if (e.affectsSome(completionsQuotaExceededSet)) {
				const newCompletionsQuotaExceeded = this.contextKeyService.getContextKeyValue<boolean>(this.ExtensionQuotaContextKeys.completionsQuotaExceeded);
				if (typeof newCompletionsQuotaExceeded === 'boolean' && newCompletionsQuotaExceeded !== this._quotas.completionsQuotaExceeded) {
					this._quotas.completionsQuotaExceeded = newCompletionsQuotaExceeded;
					changed = true;
				}
			}

			if (changed) {
				this.updateContextKeys();
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
				const commandService = accessor.get(ICommandService);
				const dialogService = accessor.get(IDialogService);

				const dateFormatter = safeIntl.DateTimeFormat(language, { year: 'numeric', month: 'long', day: 'numeric' });

				let message: string;
				const { chatQuotaExceeded, completionsQuotaExceeded } = that.quotas;
				if (chatQuotaExceeded && !completionsQuotaExceeded) {
					message = localize('chatQuotaExceeded', "You've run out of free chat messages. You still have free code completions available in the Copilot Free plan. These limits will reset on {0}", dateFormatter.format(that.quotas.quotaResetDate));
				} else if (completionsQuotaExceeded && !chatQuotaExceeded) {
					message = localize('completionsQuotaExceeded', "You've run out of free code completions. You still have free chat messages available in the Copilot Free plan. These limits will reset on {0}", dateFormatter.format(that.quotas.quotaResetDate));
				} else {
					message = localize('chatAndCompletionsQuotaExceeded', "You've reached the limit of the Copilot Free plan. These limits will reset on {0}.", dateFormatter.format(that.quotas.quotaResetDate));
				}

				const upgradeToPro = localize('upgradeToPro', "Here's what you can expect when upgrading to Copilot Pro:\n- Unlimited code completions\n- Unlimited chat messages\n- 30-day free trial");

				await dialogService.prompt({
					type: 'none',
					message: localize('copilotFree', "Copilot Limit Reached"),
					cancelButton: {
						label: localize('dismiss', "Dismiss"),
						run: () => { /* noop */ }
					},
					buttons: [
						{
							label: localize('managePlan', "Upgrade to Copilot Pro"),
							run: () => commandService.executeCommand('workbench.action.chat.upgradePlan')
						},
					],
					custom: {
						closeOnLinkClick: true,
						icon: Codicon.copilotWarningLarge,
						markdownDetails: [
							{ markdown: new MarkdownString(message, true) },
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
		this.updateContextKeys();

		this._onDidChangeQuotas.fire();
	}

	clearQuotas(): void {
		if (this.quotas.chatQuotaExceeded || this.quotas.completionsQuotaExceeded) {
			this.acceptQuotas({ chatQuotaExceeded: false, completionsQuotaExceeded: false, quotaResetDate: undefined });
		}
	}

	private updateContextKeys(): void {
		this.chatQuotaExceededContextKey.set(this._quotas.chatQuotaExceeded);
		this.completionsQuotaExceededContextKey.set(this._quotas.completionsQuotaExceeded);
	}
}

export class ChatQuotasStatusBarEntry extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'chat.quotasStatusBarEntry';

	private static readonly COPILOT_STATUS_ID = 'GitHub.copilot.status'; // TODO@bpasero unify into 1 core indicator

	private readonly entry = this._register(new DisposableStore());

	constructor(
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IChatQuotasService private readonly chatQuotasService: IChatQuotasService
	) {
		super();

		this._register(Event.runAndSubscribe(this.chatQuotasService.onDidChangeQuotas, () => this.updateStatusbarEntry()));
		this._register(this.statusbarService.onDidChangeEntryVisibility(e => {
			if (e.id === ChatQuotasStatusBarEntry.COPILOT_STATUS_ID) {
				this.updateStatusbarEntry();
			}
		}));
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

			const isCopilotStatusVisible = this.statusbarService.isEntryVisible(ChatQuotasStatusBarEntry.COPILOT_STATUS_ID);
			if (!isCopilotStatusVisible) {
				text = `$(copilot-warning) ${text}`;
			}

			this.entry.add(this.statusbarService.addEntry({
				name: localize('indicator', "Copilot Limit Indicator"),
				text,
				ariaLabel: text,
				command: OPEN_CHAT_QUOTA_EXCEEDED_DIALOG,
				showInAllWindows: true,
				kind: 'prominent',
				tooltip: quotaToButtonMessage({ chatQuotaExceeded, completionsQuotaExceeded })
			}, ChatQuotasStatusBarEntry.ID, StatusbarAlignment.RIGHT, {
				id: ChatQuotasStatusBarEntry.COPILOT_STATUS_ID,
				alignment: StatusbarAlignment.RIGHT,
				compact: isCopilotStatusVisible
			}));

			this.entry.add(this.statusbarService.overrideEntry(ChatQuotasStatusBarEntry.COPILOT_STATUS_ID, { kind: 'prominent' }));
		}
	}
}

export function quotaToButtonMessage({ chatQuotaExceeded, completionsQuotaExceeded }: { chatQuotaExceeded: boolean; completionsQuotaExceeded: boolean }): string {
	if (chatQuotaExceeded && !completionsQuotaExceeded) {
		return localize('chatQuotaExceededButton', "Monthly chat messages limit reached. Click for details.");
	} else if (completionsQuotaExceeded && !chatQuotaExceeded) {
		return localize('completionsQuotaExceededButton', "Monthly code completions limit reached. Click for details.");
	} else {
		return localize('chatAndCompletionsQuotaExceededButton', "Copilot Free plan limit reached. Click for details.");
	}
}
