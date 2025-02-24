/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatStatus.css';
import { safeIntl } from '../../../../base/common/date.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { language, OS } from '../../../../base/common/platform.js';
import { localize } from '../../../../nls.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IWorkbenchAssignmentService } from '../../../services/assignment/common/assignmentService.js';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment, TooltipContent } from '../../../services/statusbar/browser/statusbar.js';
import { ChatContextKeys } from '../common/chatContextKeys.js';
import { IChatQuotasService } from '../common/chatQuotasService.js';
import { quotaToButtonMessage, OPEN_CHAT_QUOTA_EXCEEDED_DIALOG, CHAT_SETUP_ACTION_LABEL, TOGGLE_CHAT_ACTION_ID, CHAT_OPEN_ACTION_ID } from './actions/chatActions.js';
import { $, addDisposableListener, append, EventType } from '../../../../base/browser/dom.js';
import { IChatEntitlementsService } from '../common/chatEntitlementsService.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { KeybindingLabel } from '../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { defaultCheckboxStyles, defaultKeybindingLabelStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { Checkbox } from '../../../../base/browser/ui/toggle/toggle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';

export class ChatStatusBarEntry extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'chat.statusBarEntry';

	private readonly treatment = this.assignmentService.getTreatment<boolean>('config.chat.experimental.statusIndicator.enabled'); //TODO@bpasero remove this experiment eventually

	private entry: IStatusbarEntryAccessor | undefined = undefined;
	private readonly entryDisposables = this._register(new MutableDisposable());

	private dateFormatter = safeIntl.DateTimeFormat(language, { year: 'numeric', month: 'long', day: 'numeric' });

	constructor(
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IChatQuotasService private readonly chatQuotasService: IChatQuotasService,
		@IChatEntitlementsService private readonly chatEntitlementsService: IChatEntitlementsService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IWorkbenchAssignmentService private readonly assignmentService: IWorkbenchAssignmentService,
		@IProductService private readonly productService: IProductService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IConfigurationService private readonly configurationService: IConfigurationService
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
		const disposables = new DisposableStore();
		this.entryDisposables.value = disposables;

		let text = '$(copilot)';
		let ariaLabel = localize('chatStatus', "Copilot Status");
		let command = TOGGLE_CHAT_ACTION_ID;
		let tooltip: TooltipContent = localize('openChat', "Open Chat ({0})", this.keybindingService.lookupKeybinding(command)?.getLabel() ?? '');

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
				const container = $('div.chat-status-bar-entry-tooltip');

				// Quota Indicator
				const { chatTotal, chatRemaining, completionsTotal, completionsRemaining, quotaResetDate } = this.chatQuotasService.quotas;

				container.appendChild($('div', undefined, localize('limitTitle', "You are currently using Copilot Free:")));

				const chatQuotaIndicator = this.createQuotaIndicator(container, chatTotal, chatRemaining, localize('chatsLabel', "Chat Messages"));
				const completionsQuotaIndicator = this.createQuotaIndicator(container, completionsTotal, completionsRemaining, localize('completionsLabel', "Code Completions"));

				this.chatEntitlementsService.resolve(CancellationToken.None).then(() => {
					const { chatTotal, chatRemaining, completionsTotal, completionsRemaining } = this.chatQuotasService.quotas;

					chatQuotaIndicator(chatTotal, chatRemaining);
					completionsQuotaIndicator(completionsTotal, completionsRemaining);
				});

				container.appendChild($('div', undefined, localize('limitQuota', "Limits will reset on {0}.", this.dateFormatter.format(quotaResetDate))));

				// Settings
				container.appendChild(document.createElement('hr'));
				this.createSettings(container, disposables);

				// Shortcuts
				container.appendChild(document.createElement('hr'));
				this.createShortcuts(container, disposables);

				return container;
			};
		}

		// Any other User
		else {
			tooltip = () => {
				const container = $('div.chat-status-bar-entry-tooltip');

				// Settings
				this.createSettings(container, disposables);

				// Shortcuts
				container.appendChild($('hr'));
				this.createShortcuts(container, disposables);

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

	private createQuotaIndicator(container: HTMLElement, total: number | undefined, remaining: number | undefined, label: string): (total: number | undefined, remaining: number | undefined) => void {
		const quotaText = $('span');
		const quotaBit = $('div.quota-bit');

		container.appendChild($('div.quota-indicator', undefined,
			$('div.quota-label', undefined,
				$('span', undefined, label),
				quotaText
			),
			$('div.quota-bar', undefined,
				quotaBit
			)
		));

		const update = (total: number | undefined, remaining: number | undefined) => {
			if (typeof total === 'number' && typeof remaining === 'number') {
				quotaText.textContent = localize('quotaDisplay', "{0} / {1}", remaining, total);
				quotaBit.style.width = `${(remaining / total) * 100}%`;
			}
		};

		update(total, remaining);

		return update;
	}

	private createShortcuts(container: HTMLElement, disposables: DisposableStore): HTMLElement {
		const shortcuts = container.appendChild($('div.shortcuts'));

		const openChat = { text: localize('shortcuts.chat', "Chat"), id: CHAT_OPEN_ACTION_ID };
		const openCopilotEdits = { text: localize('shortcuts.copilotEdits', "Copilot Edits"), id: 'workbench.action.chat.openEditSession' };
		const inlineChat = { text: localize('shortcuts.inlineChat', "Inline Chat"), id: 'inlineChat.start' };

		for (const entry of [openChat, openCopilotEdits, inlineChat]) {
			const keys = this.keybindingService.lookupKeybinding(entry.id);
			if (!keys) {
				continue;
			}

			const shortcut = append(shortcuts, $('div.shortcut'));

			append(shortcut, $('span.shortcut-label', undefined, entry.text));

			const shortcutKey = disposables.add(new KeybindingLabel(shortcut, OS, { ...defaultKeybindingLabelStyles }));
			shortcutKey.set(keys);
		}

		return shortcuts;
	}

	private createSettings(container: HTMLElement, disposables: DisposableStore): HTMLElement {
		const settings = container.appendChild($('div.settings'));

		const toggleCompletions = { text: localize('settings.toggleCompletions', "Code Completions"), id: 'editor.inlineSuggest.enabled' };
		const toggleNextEditSuggestions = { text: localize('settings.toggleNextEditSuggestions', "Next Edit Suggestions (Preview)"), id: 'github.copilot.nextEditSuggestions.enabled' };

		for (const entry of [toggleCompletions, toggleNextEditSuggestions]) {
			const checked = Boolean(this.configurationService.getValue<boolean>(entry.id));

			const setting = append(settings, $('div.setting'));

			const checkbox = this._register(new Checkbox(entry.text, checked, defaultCheckboxStyles));
			setting.appendChild(checkbox.domNode);

			const settingLabel = append(setting, $('span.setting-label', undefined, entry.text));
			disposables.add(addDisposableListener(settingLabel, EventType.CLICK, e => {
				if (checkbox?.enabled && (e.target as HTMLElement).tagName !== 'A') {
					checkbox.checked = !checkbox.checked;
					this.configurationService.updateValue(entry.id, checkbox.checked);
					checkbox.focus();
				}
			}));

			disposables.add(checkbox.onChange(() => {
				this.configurationService.updateValue(entry.id, checkbox.checked);
			}));
		}

		return settings;
	}
}
