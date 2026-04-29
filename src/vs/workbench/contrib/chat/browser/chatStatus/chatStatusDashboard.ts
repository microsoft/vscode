/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, EventType, addDisposableListener, EventHelper, disposableWindowInterval, getWindow } from '../../../../../base/browser/dom.js';
import { Gesture, EventType as TouchEventType } from '../../../../../base/browser/touch.js';
import { ActionBar } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { renderLabelWithIcons } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { Checkbox } from '../../../../../base/browser/ui/toggle/toggle.js';
import { IAction, toAction, WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification } from '../../../../../base/common/actions.js';
import { CancellationToken, cancelOnDispose } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { safeIntl } from '../../../../../base/common/date.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { MutableDisposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { parseLinkedText } from '../../../../../base/common/linkedText.js';
import { language } from '../../../../../base/common/platform.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { isObject } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { IInlineCompletionsService } from '../../../../../editor/browser/services/inlineCompletionsService.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { ITextResourceConfigurationService } from '../../../../../editor/common/services/textResourceConfiguration.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import * as languages from '../../../../../editor/common/languages.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IHoverService, nativeHoverDelegate } from '../../../../../platform/hover/browser/hover.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { Link } from '../../../../../platform/opener/browser/link.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { defaultButtonStyles, defaultCheckboxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { DomWidget } from '../../../../../platform/domWidget/browser/domWidget.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../../common/editor.js';
import { IChatEntitlementService, ChatEntitlementService, ChatEntitlement, IQuotaSnapshot, getChatPlanName } from '../../../../services/chat/common/chatEntitlementService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { isNewUser } from './chatStatus.js';
import { IChatStatusItemService, ChatStatusEntry } from './chatStatusItemService.js';
import product from '../../../../../platform/product/common/product.js';
import { isCompletionsEnabled } from '../../../../../editor/common/services/completionsEnablement.js';

const defaultChat = product.defaultChatAgent;

interface ISettingsAccessor {
	readSetting: () => boolean;
	writeSetting: (value: boolean) => Promise<void>;
}
type ChatSettingChangedClassification = {
	owner: 'bpasero';
	comment: 'Provides insight into chat settings changed from the chat status entry.';
	settingIdentifier: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The identifier of the setting that changed.' };
	settingMode?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The optional editor language for which the setting changed.' };
	settingEnablement: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the setting got enabled or disabled.' };
};
type ChatSettingChangedEvent = {
	settingIdentifier: string;
	settingMode?: string;
	settingEnablement: 'enabled' | 'disabled';
};

export interface IChatStatusDashboardOptions {
	/** When true, disables the Inline Suggestions settings section (toggles for all files, language, next edit). */
	disableInlineSuggestionsSettings?: boolean;
	/** When true, disables the inline completions model selection section. */
	disableModelSelection?: boolean;
	/** When true, disables the inline completions provider options section. */
	disableProviderOptions?: boolean;
	/** When true, disables the completions snooze button. */
	disableCompletionsSnooze?: boolean;
	/** When true, the Quick Settings region is rendered always-expanded without a collapsible header. */
	disableQuickSettingsCollapsible?: boolean;
	/**
	 * When provided, the title header (plan name + manage / CTA actions) is
	 * rendered into this caller-owned container instead of inline at the top
	 * of the dashboard. Use this to embed the title header in a host layout
	 * without reaching into the dashboard's private DOM.
	 */
	titleHeaderContainer?: HTMLElement;
}

export class ChatStatusDashboard extends DomWidget {

	private static readonly QUICK_SETTINGS_COLLAPSED_KEY = 'chatStatusDashboard.quickSettingsCollapsed';

	readonly element = $('div.chat-status-bar-entry-tooltip');

	private readonly dateFormatter = safeIntl.DateTimeFormat(language, { month: 'short', day: 'numeric' });
	private readonly timeFormatter = safeIntl.DateTimeFormat(language, { hour: 'numeric', minute: 'numeric' });
	private readonly quotaPercentageFormatter = safeIntl.NumberFormat(undefined, { maximumFractionDigits: 0, minimumFractionDigits: 0 });

	constructor(
		private readonly options: IChatStatusDashboardOptions | undefined,
		@IChatEntitlementService private readonly chatEntitlementService: ChatEntitlementService,
		@IChatStatusItemService private readonly chatStatusItemService: IChatStatusItemService,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEditorService private readonly editorService: IEditorService,
		@IHoverService private readonly hoverService: IHoverService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IOpenerService private readonly openerService: IOpenerService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ITextResourceConfigurationService private readonly textResourceConfigurationService: ITextResourceConfigurationService,
		@IInlineCompletionsService private readonly inlineCompletionsService: IInlineCompletionsService,
		@IMarkdownRendererService private readonly markdownRendererService: IMarkdownRendererService,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();

		this.render();
	}

	private render(): void {
		const token = cancelOnDispose(this._store);

		const { chat, premiumChat, completions } = this.chatEntitlementService.quotas;
		const hasQuotas = !!(chat || premiumChat);
		const isAnonymousWithSentiment = this.chatEntitlementService.anonymous && this.chatEntitlementService.sentiment.completed;
		const hasUsageSection = hasQuotas || isAnonymousWithSentiment;
		const hasVisibleUsageContent = chat?.unlimited === false ||
			premiumChat?.unlimited === false ||
			completions?.unlimited === false ||
			isAnonymousWithSentiment;
		const contributedEntries = [...this.chatStatusItemService.getEntries()];
		const hasQuickSettingsContent =
			!this.options?.disableInlineSuggestionsSettings ||
			!this.options?.disableModelSelection ||
			!this.options?.disableProviderOptions ||
			!this.options?.disableCompletionsSnooze ||
			contributedEntries.length > 0;

		// Title header with plan name, CTA buttons, and manage action
		let headerAdditionalSpendButton: Button | undefined;
		if (hasUsageSection) {
			const planName = getChatPlanName(this.chatEntitlementService.entitlement);
			const headerHost = this.options?.titleHeaderContainer ?? this.element;
			const header = this.renderHeader(headerHost, this._store, planName, toAction({
				id: 'workbench.action.manageCopilot',
				label: localize('quotaLabel', "Manage Copilot Settings"),
				tooltip: localize('quotaTooltip', "Manage Copilot Settings"),
				class: ThemeIcon.asClassName(Codicon.settings),
				run: () => this.runCommandAndClose(() => this.openerService.open(URI.parse(defaultChat.manageSettingsUrl))),
			}));

			// Add Additional Spend / Upgrade buttons to the header
			const canConfigureAdditionalSpend = this.chatEntitlementService.entitlement === ChatEntitlement.EDU || this.chatEntitlementService.entitlement === ChatEntitlement.Pro || this.chatEntitlementService.entitlement === ChatEntitlement.ProPlus;
			const showUpgrade = this.chatEntitlementService.entitlement !== ChatEntitlement.ProPlus &&
				this.chatEntitlementService.entitlement !== ChatEntitlement.Business &&
				this.chatEntitlementService.entitlement !== ChatEntitlement.Enterprise;

			const actionBarElement = header.lastElementChild;
			const initialAdditionalUsageEnabled = this.chatEntitlementService.quotas.additionalUsageEnabled ?? false;

			if (canConfigureAdditionalSpend) {
				headerAdditionalSpendButton = this._store.add(new Button(header, { ...defaultButtonStyles, hoverDelegate: nativeHoverDelegate, secondary: true }));
				headerAdditionalSpendButton.element.classList.add('header-cta-button');
				headerAdditionalSpendButton.label = initialAdditionalUsageEnabled ? localize('manageAdditionalSpend', "Manage Additional Spend") : localize('configureAdditionalSpend', "Configure Additional Spend");
				this._store.add(headerAdditionalSpendButton.onDidClick(() => this.runCommandAndClose(() => this.openerService.open(URI.parse(defaultChat.manageAdditionalSpendUrl)))));
				if (actionBarElement) {
					header.insertBefore(headerAdditionalSpendButton.element, actionBarElement);
				}
			}

			if (showUpgrade) {
				const upgradeButton = this._store.add(new Button(header, { ...defaultButtonStyles, hoverDelegate: nativeHoverDelegate }));
				upgradeButton.element.classList.add('header-cta-button');
				upgradeButton.label = localize('upgrade', "Upgrade");
				this._store.add(upgradeButton.onDidClick(() => this.runCommandAndClose('workbench.action.chat.upgradePlan')));
				if (actionBarElement) {
					header.insertBefore(upgradeButton.element, actionBarElement);
				}
			}
		}

		// Always trigger a fresh quota fetch when the dashboard opens
		const updatePromise = this.chatEntitlementService.update(token);

		// Usage section — always shown inline
		if (hasVisibleUsageContent) {
			this.renderUsageContent(this.element, token, headerAdditionalSpendButton, updatePromise);
		}

		// Premium chat included indicator (shown when premium chat is unlimited)
		const hasPremiumUnlimited = !!premiumChat?.unlimited;
		if (hasPremiumUnlimited) {
			const includedTitle = premiumChat!.usageBasedBilling
				? localize('includedTitleTBB', "Monthly Limit")
				: localize('includedTitle', "Premium Requests");
			const includedContainer = this.element.appendChild($('div.quota-indicator.included'));
			includedContainer.appendChild($('div.quota-title', undefined, includedTitle));
			includedContainer.appendChild($('div.description', undefined, localize('premiumIncluded', "Included with your organization's plan.")));
		}

		// Quick Settings — collapsible region
		if (hasQuickSettingsContent) {
			const hasContentAbove = hasUsageSection || hasVisibleUsageContent || hasPremiumUnlimited;
			this.renderQuickSettings(contributedEntries, hasContentAbove);
		}

		// New to Chat / Signed out
		this.renderSetupSection();
	}

	private renderUsageContent(container: HTMLElement, token: CancellationToken, headerAdditionalSpendButton: Button | undefined, updatePromise: Promise<void>): void {
		const { chat: chatQuota, completions: completionsQuota, premiumChat: premiumChatQuota, resetDate, resetDateHasTime } = this.chatEntitlementService.quotas;

		if (chatQuota || premiumChatQuota || completionsQuota) {
			const resetLabel = resetDate ? (resetDateHasTime ? localize('quotaResetsAt', "Resets {0} at {1}", this.dateFormatter.value.format(new Date(resetDate)), this.timeFormatter.value.format(new Date(resetDate))) : localize('quotaResets', "Resets {0}", this.dateFormatter.value.format(new Date(resetDate)))) : undefined;

			// Global quota callout (shown at the top, before quota indicators)
			const globalCalloutUpdater = this.createGlobalQuotaCallout(container);
			const { calloutVisible: initialCalloutVisible } = globalCalloutUpdater();

			// Update header additional spend button visibility based on callout
			if (headerAdditionalSpendButton) {
				headerAdditionalSpendButton.element.style.display = initialCalloutVisible ? '' : 'none';
			}

			let chatQuotaIndicator: ((quota: IQuotaSnapshot | string) => void) | undefined;
			if (chatQuota && !chatQuota.unlimited) {
				chatQuotaIndicator = this.createQuotaIndicator(container, chatQuota, localize('chatsLabel', "Chat messages"), resetLabel);
			}

			let premiumChatQuotaIndicator: ((quota: IQuotaSnapshot | string) => void) | undefined;
			if (premiumChatQuota && !premiumChatQuota.unlimited && premiumChatQuota.percentRemaining >= 0) {
				const premiumChatLabel = premiumChatQuota.usageBasedBilling
					? localize('monthlyLimitLabel', "Monthly Limit")
					: this.chatEntitlementService.quotas.additionalUsageEnabled ? localize('includedPremiumChatsLabel', "Included premium requests") : localize('premiumChatsLabel', "Premium requests");
				const premiumChatResetLabel = premiumChatQuota.usageBasedBilling ? this.formatResetAtLabel(premiumChatQuota.resetAt) ?? resetLabel : resetLabel;
				premiumChatQuotaIndicator = this.createQuotaIndicator(container, premiumChatQuota, premiumChatLabel, premiumChatResetLabel);
			}

			let completionsQuotaIndicator: ((quota: IQuotaSnapshot | string) => void) | undefined;
			if (completionsQuota && !completionsQuota.unlimited && completionsQuota.percentRemaining >= 0) {
				completionsQuotaIndicator = this.createQuotaIndicator(container, completionsQuota, localize('completionsLabel', "Inline Suggestions"), resetLabel);
			}

			// Global quota callout and header button are updated in the async block below

			(async () => {
				await updatePromise;
				if (token.isCancellationRequested) {
					return;
				}

				const { chat: chatQuota, premiumChat: premiumChatQuota, completions: completionsQuota } = this.chatEntitlementService.quotas;
				if (chatQuota) {
					chatQuotaIndicator?.(chatQuota);
				}
				if (premiumChatQuota) {
					premiumChatQuotaIndicator?.(premiumChatQuota);
				}
				if (completionsQuota) {
					completionsQuotaIndicator?.(completionsQuota);
				}
				const { calloutVisible, additionalUsageEnabled: isAdditionalUsageEnabled } = globalCalloutUpdater();
				if (headerAdditionalSpendButton) {
					headerAdditionalSpendButton.element.style.display = calloutVisible ? '' : 'none';
					headerAdditionalSpendButton.label = isAdditionalUsageEnabled ? localize('manageAdditionalSpend', "Manage Additional Spend") : localize('configureAdditionalSpend', "Configure Additional Spend");
				}
			})();
		}

		// Anonymous Indicator
		else if (this.chatEntitlementService.anonymous && this.chatEntitlementService.sentiment.completed) {
			this.createQuotaIndicator(container, localize('quotaLimited', "Limited"), localize('chatsLabel', "Chat messages"));
		}
	}

	private renderQuickSettings(contributedEntries: ChatStatusEntry[], hasContentAbove: boolean): void {
		const nonCollapsible = !!this.options?.disableQuickSettingsCollapsible;
		const collapsed = !nonCollapsible && this.storageService.getBoolean(ChatStatusDashboard.QUICK_SETTINGS_COLLAPSED_KEY, StorageScope.PROFILE, true);

		let disclosureHeader: HTMLElement | undefined;
		let chevron: HTMLElement | undefined;
		if (!nonCollapsible) {
			disclosureHeader = this.element.appendChild($('button.collapsible-header'));
			if (!hasContentAbove) {
				disclosureHeader.classList.add('no-border');
			}
			disclosureHeader.setAttribute('aria-expanded', String(!collapsed));

			chevron = disclosureHeader.appendChild($('span.collapsible-chevron'));
			chevron.classList.add(...ThemeIcon.asClassNameArray(collapsed ? Codicon.chevronRight : Codicon.chevronDown));

			disclosureHeader.appendChild($('span.collapsible-label', undefined, localize('quickSettingsTab', "Quick Settings")));
		}

		const collapsibleContent = this.element.appendChild($('div.collapsible-content'));
		const collapsibleInner = collapsibleContent.appendChild($('div.collapsible-inner'));
		if (collapsed) {
			collapsibleContent.classList.add('collapsed');
		}

		if (disclosureHeader && chevron) {
			const toggle = () => {
				const isCollapsed = collapsibleContent.classList.toggle('collapsed');
				disclosureHeader!.setAttribute('aria-expanded', String(!isCollapsed));
				chevron!.className = 'collapsible-chevron';
				chevron!.classList.add(...ThemeIcon.asClassNameArray(isCollapsed ? Codicon.chevronRight : Codicon.chevronDown));
				this.storageService.store(ChatStatusDashboard.QUICK_SETTINGS_COLLAPSED_KEY, isCollapsed, StorageScope.PROFILE, StorageTarget.USER);
			};

			this._store.add(addDisposableListener(disclosureHeader, EventType.CLICK, () => toggle()));
		}

		this.renderInlineSuggestionsContent(collapsibleInner);

		// Contributions
		for (const item of contributedEntries) {
			collapsibleInner.appendChild($('hr'));

			const itemDisposables = this._store.add(new MutableDisposable());

			let rendered = this.renderContributedChatStatusItem(item);
			itemDisposables.value = rendered.disposables;
			collapsibleInner.appendChild(rendered.element);

			this._store.add(this.chatStatusItemService.onDidChange(e => {
				if (e.entry.id === item.id) {
					const previousElement = rendered.element;

					rendered = this.renderContributedChatStatusItem(e.entry);
					itemDisposables.value = rendered.disposables;

					previousElement.replaceWith(rendered.element);
				}
			}));
		}
	}

	private renderSetupSection(): void {
		const newUser = isNewUser(this.chatEntitlementService);
		const anonymousUser = this.chatEntitlementService.anonymous;
		const disabled = this.chatEntitlementService.sentiment.disabled || this.chatEntitlementService.sentiment.untrusted;
		const signedOut = this.chatEntitlementService.entitlement === ChatEntitlement.Unknown;
		if (!(newUser || signedOut || disabled)) {
			return;
		}

		this.element.appendChild($('hr'));

		let descriptionText: string | MarkdownString;
		let descriptionClass = '.description';
		if (newUser && anonymousUser) {
			descriptionText = new MarkdownString(localize({ key: 'activeDescriptionAnonymous', comment: ['{Locked="]({2})"}', '{Locked="]({3})"}'] }, "By continuing with {0} Copilot, you agree to {1}'s [Terms]({2}) and [Privacy Statement]({3})", defaultChat.provider.default.name, defaultChat.provider.default.name, defaultChat.termsStatementUrl, defaultChat.privacyStatementUrl), { isTrusted: true });
			descriptionClass = `${descriptionClass}.terms`;
		} else if (newUser) {
			descriptionText = localize('activateDescription', "Set up Copilot to use AI features.");
		} else if (anonymousUser) {
			descriptionText = localize('enableMoreDescription', "Sign in to enable more Copilot AI features.");
		} else if (disabled) {
			descriptionText = localize('enableDescription', "Enable Copilot to use AI features.");
		} else {
			descriptionText = localize('signInDescription', "Sign in to use Copilot AI features.");
		}

		let buttonLabel: string;
		if (newUser) {
			buttonLabel = localize('enableAIFeatures', "Use AI Features");
		} else if (anonymousUser) {
			buttonLabel = localize('enableMoreAIFeatures', "Enable more AI Features");
		} else if (disabled) {
			buttonLabel = localize('enableCopilotButton', "Enable AI Features");
		} else {
			buttonLabel = localize('signInToUseAIFeatures', "Sign in to use AI Features");
		}

		let commandId: string;
		if (newUser && anonymousUser) {
			commandId = 'workbench.action.chat.triggerSetupAnonymousWithoutDialog';
		} else {
			commandId = 'workbench.action.chat.triggerSetup';
		}

		if (typeof descriptionText === 'string') {
			this.element.appendChild($(`div${descriptionClass}`, undefined, descriptionText));
		} else {
			this.element.appendChild($(`div${descriptionClass}`, undefined, this._store.add(this.markdownRendererService.render(descriptionText)).element));
		}

		const button = this._store.add(new Button(this.element, { ...defaultButtonStyles, hoverDelegate: nativeHoverDelegate }));
		button.label = buttonLabel;
		this._store.add(button.onDidClick(() => this.runCommandAndClose(commandId)));
	}

	private renderInlineSuggestionsContent(container: HTMLElement): void {
		// Settings (editor-specific)
		if (!this.options?.disableInlineSuggestionsSettings) {
			this.createSettings(container);
		}

		const providers = (!this.options?.disableModelSelection || !this.options?.disableProviderOptions) ? this.languageFeaturesService.inlineCompletionsProvider.allNoModel() : undefined;

		// Model Selection (editor-specific)
		if (!this.options?.disableModelSelection && providers) {
			const provider = providers.find(p => p.modelInfo && p.modelInfo.models.length > 0);

			if (provider) {
				const modelInfo = provider.modelInfo!;
				const currentModel = modelInfo.models.find(m => m.id === modelInfo.currentModelId);

				if (currentModel) {
					const modelContainer = container.appendChild($('div.model-selection'));

					modelContainer.appendChild($('span.model-text', undefined, localize('modelLabel', "Model")));

					const actionBar = modelContainer.appendChild($('div.model-action-bar'));
					const toolbar = this._store.add(new ActionBar(actionBar, { hoverDelegate: nativeHoverDelegate }));
					toolbar.push([toAction({
						id: 'workbench.action.selectInlineCompletionsModel',
						label: currentModel.name,
						tooltip: localize('selectModel', "Select Model"),
						class: ThemeIcon.asClassName(Codicon.gear),
						run: async () => {
							await this.showModelPicker(provider);
						}
					})], { icon: false, label: true });
				}
			}
		}

		// Provider Options (editor-specific)
		if (!this.options?.disableProviderOptions && providers) {
			for (const provider of providers) {
				if (provider.providerOptions && provider.providerOptions.length > 0) {
					for (const option of provider.providerOptions) {
						const currentValue = option.values.find(v => v.id === option.currentValueId);
						if (currentValue) {
							const optionContainer = container.appendChild($('div.suggest-option-selection'));

							optionContainer.appendChild($('span.suggest-option-text', undefined, option.label));

							const actionBar = optionContainer.appendChild($('div.suggest-option-action-bar'));
							const toolbar = this._store.add(new ActionBar(actionBar, { hoverDelegate: nativeHoverDelegate }));
							toolbar.push([toAction({
								id: `workbench.action.selectProviderOption.${option.id}`,
								label: currentValue.label,
								tooltip: localize('selectOption', "Select {0}", option.label),
								run: async () => {
									await this.showProviderOptionPicker(provider, option);
								}
							})], { icon: false, label: true });
						}
					}
				}
			}
		}

		// Completions Snooze (editor-specific)
		if (!this.options?.disableCompletionsSnooze && this.canUseChat()) {
			const snooze = append(container, $('div.snooze-completions'));
			this.createCompletionsSnooze(snooze, localize('settings.snooze', "Snooze"));
		}
	}

	private canUseChat(): boolean {
		if (!this.chatEntitlementService.sentiment.completed || this.chatEntitlementService.sentiment.disabled || this.chatEntitlementService.sentiment.untrusted) {
			return false; // chat not completed or not enabled
		}

		if (this.chatEntitlementService.entitlement === ChatEntitlement.Unknown || this.chatEntitlementService.entitlement === ChatEntitlement.Available) {
			return this.chatEntitlementService.anonymous; // signed out or not-yet-signed-up users can only use Chat if anonymous access is allowed
		}

		if (this.chatEntitlementService.entitlement === ChatEntitlement.Free && this.chatEntitlementService.quotas.chat?.percentRemaining === 0 && this.chatEntitlementService.quotas.completions?.percentRemaining === 0) {
			return false; // free user with no quota left
		}

		return true;
	}

	private renderHeader(container: HTMLElement, disposables: DisposableStore, label: string, action?: IAction): HTMLElement {
		const header = container.appendChild($('div.header'));
		header.appendChild($('span.header-label', undefined, label));

		if (action) {
			const toolbar = disposables.add(new ActionBar(header, { hoverDelegate: nativeHoverDelegate }));
			toolbar.push([action], { icon: true, label: false });
		}

		return header;
	}

	private renderContributedChatStatusItem(item: ChatStatusEntry): { element: HTMLElement; disposables: DisposableStore } {
		const disposables = new DisposableStore();

		const itemElement = $('div.contribution');

		const headerLabel = typeof item.label === 'string' ? item.label : item.label.label;
		const headerLink = typeof item.label === 'string' ? undefined : item.label.link;
		this.renderHeader(itemElement, disposables, headerLabel, headerLink ? toAction({
			id: 'workbench.action.openChatStatusItemLink',
			label: localize('learnMore', "Learn More"),
			tooltip: localize('learnMore', "Learn More"),
			class: ThemeIcon.asClassName(Codicon.linkExternal),
			run: () => this.runCommandAndClose(() => this.openerService.open(URI.parse(headerLink))),
		}) : undefined);

		const itemBody = itemElement.appendChild($('div.body'));

		const description = itemBody.appendChild($('span.description'));
		this.renderTextPlus(description, item.description, disposables);

		if (item.detail) {
			const separator = itemBody.appendChild($('span.separator'));
			separator.textContent = '\u2014';
			const detail = itemBody.appendChild($('span.detail-item'));
			this.renderTextPlus(detail, item.detail, disposables);
		}

		return { element: itemElement, disposables };
	}

	private renderTextPlus(target: HTMLElement, text: string, store: DisposableStore): void {
		for (const node of parseLinkedText(text).nodes) {
			if (typeof node === 'string') {
				const parts = renderLabelWithIcons(node);
				target.append(...parts);
			} else {
				store.add(new Link(target, node, undefined, this.hoverService, this.openerService));
			}
		}
	}

	private runCommandAndClose(commandOrFn: string | ((...args: unknown[]) => void), ...args: unknown[]): void {
		if (typeof commandOrFn === 'function') {
			commandOrFn(...args);
		} else {
			this.telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: commandOrFn, from: 'chat-status' });
			this.commandService.executeCommand(commandOrFn, ...args);
		}

		this.hoverService.hideHover(true);
	}

	private formatResetAtLabel(resetAt: number | undefined): string | undefined {
		if (!resetAt) {
			return undefined;
		}
		const resetDate = new Date(resetAt * 1000);
		return localize('quotaResetsAt', "Resets {0} at {1}", this.dateFormatter.value.format(resetDate), this.timeFormatter.value.format(resetDate));
	}

	private createQuotaIndicator(container: HTMLElement, quota: IQuotaSnapshot | string, label: string, resetLabel?: string): (quota: IQuotaSnapshot | string) => void {
		const quotaValue = $('span.quota-value');
		const quotaValueSuffix = $('span.quota-value-suffix');
		const quotaBit = $('div.quota-bit');
		const resetValue = $('span.quota-reset');

		if (resetLabel) {
			resetValue.textContent = resetLabel;
		}

		container.appendChild($('div.quota-indicator', undefined,
			$('div.quota-title', undefined, label),
			$('div.quota-details', undefined,
				$('div.quota-percentage', undefined,
					quotaValue,
					quotaValueSuffix
				),
				resetValue
			),
			$('div.quota-bar', undefined,
				quotaBit
			)
		));

		const update = (quota: IQuotaSnapshot | string) => {
			let usedPercentage: number;
			if (typeof quota === 'string') {
				usedPercentage = 0;
			} else {
				usedPercentage = Math.max(0, 100 - quota.percentRemaining);
			}

			if (typeof quota === 'string') {
				quotaValue.textContent = quota;
				quotaValueSuffix.textContent = '';
			} else {
				quotaValue.textContent = localize('quotaDisplay', "{0}%", this.quotaPercentageFormatter.value.format(Math.floor(usedPercentage)));
				quotaValueSuffix.textContent = ` ${localize('quotaUsed', "used")}`;
			}

			quotaBit.style.width = `${usedPercentage}%`;
		};

		update(quota);

		return update;
	}

	private createGlobalQuotaCallout(container: HTMLElement): () => { calloutVisible: boolean; additionalUsageEnabled: boolean } {
		const calloutIcon = $('span.callout-icon');
		const calloutText = $('span.callout-text');
		const quotaCallout = container.appendChild($('div.quota-callout', undefined, calloutIcon, calloutText));
		quotaCallout.style.display = 'none';

		const update = () => {
			const quotas = this.chatEntitlementService.quotas;
			const additionalUsageEnabled = quotas.additionalUsageEnabled ?? false;
			const isEnterpriseUser = this.chatEntitlementService.entitlement === ChatEntitlement.Enterprise || this.chatEntitlementService.entitlement === ChatEntitlement.Business;

			const allQuotas: IQuotaSnapshot[] = [];
			if (quotas.chat && !quotas.chat.unlimited) { allQuotas.push(quotas.chat); }
			if (quotas.premiumChat && !quotas.premiumChat.unlimited) { allQuotas.push(quotas.premiumChat); }
			if (quotas.completions && !quotas.completions.unlimited) { allQuotas.push(quotas.completions); }

			const maxUsedPercentage = allQuotas.length > 0 ? Math.max(...allQuotas.map(q => Math.max(0, 100 - q.percentRemaining))) : 0;

			if (maxUsedPercentage >= 100 && additionalUsageEnabled) {
				quotaCallout.style.display = '';
				quotaCallout.className = 'quota-callout info';
				calloutIcon.className = `callout-icon ${ThemeIcon.asClassName(Codicon.info)}`;
				calloutText.textContent = localize('quotaAdditionalUsageActive', "Additional spend is configured. Usage will continue until limits reset.");
			} else if (maxUsedPercentage >= 75 && additionalUsageEnabled) {
				quotaCallout.style.display = '';
				quotaCallout.className = 'quota-callout info';
				calloutIcon.className = `callout-icon ${ThemeIcon.asClassName(Codicon.info)}`;
				calloutText.textContent = localize('quotaAdditionalUsageApproaching', "Once the limit is reached, additional spend will be used.");
			} else if (maxUsedPercentage >= 100 && !additionalUsageEnabled) {
				quotaCallout.style.display = '';
				quotaCallout.className = 'quota-callout info';
				calloutIcon.className = `callout-icon ${ThemeIcon.asClassName(Codicon.info)}`;
				calloutText.textContent = isEnterpriseUser
					? localize('quotaPausedEnterprise', "Copilot is paused until the limit resets. Contact your administrator for more information.")
					: localize('quotaPaused', "Copilot is paused until the limit resets.");
			} else if (maxUsedPercentage >= 75 && !additionalUsageEnabled) {
				quotaCallout.style.display = '';
				quotaCallout.className = 'quota-callout info';
				calloutIcon.className = `callout-icon ${ThemeIcon.asClassName(Codicon.info)}`;
				calloutText.textContent = isEnterpriseUser
					? localize('quotaWarningEnterprise', "Copilot will pause when the limit is reached. Contact your administrator for more information.")
					: localize('quotaWarning', "Copilot will pause when the limit is reached.");
			} else {
				quotaCallout.style.display = 'none';
			}

			return { calloutVisible: quotaCallout.style.display !== 'none', additionalUsageEnabled };
		};

		update();

		return update;
	}

	private createSettings(container: HTMLElement): void {
		const modeId = this.editorService.activeTextEditorLanguageId;
		const settings = container.appendChild($('div.settings'));

		// --- Inline Suggestions
		{
			const globalSetting = append(settings, $('div.setting'));
			this.createInlineSuggestionsSetting(globalSetting, localize('settings.codeCompletions.allFiles', "All files"), '*');

			if (modeId) {
				const languageSetting = append(settings, $('div.setting'));
				this.createInlineSuggestionsSetting(languageSetting, localize('settings.codeCompletions.language', "{0}", this.languageService.getLanguageName(modeId) ?? modeId), modeId);
			}
		}

		// --- Next edit suggestions
		{
			const setting = append(settings, $('div.setting'));
			this.createNextEditSuggestionsSetting(setting, localize('settings.nextEditSuggestions', "Next edit suggestions"), this.getCompletionsSettingAccessor(modeId));
		}
	}

	private createSetting(container: HTMLElement, settingIdsToReEvaluate: string[], label: string, accessor: ISettingsAccessor): Checkbox {
		const checkbox = this._store.add(new Checkbox(label, Boolean(accessor.readSetting()), { ...defaultCheckboxStyles }));
		container.appendChild(checkbox.domNode);

		const settingLabel = append(container, $('span.setting-label', undefined, label));
		this._store.add(Gesture.addTarget(settingLabel));
		[EventType.CLICK, TouchEventType.Tap].forEach(eventType => {
			this._store.add(addDisposableListener(settingLabel, eventType, e => {
				if (checkbox?.enabled) {
					EventHelper.stop(e, true);

					checkbox.checked = !checkbox.checked;
					accessor.writeSetting(checkbox.checked);
					checkbox.focus();
				}
			}));
		});

		this._store.add(checkbox.onChange(() => {
			accessor.writeSetting(checkbox.checked);
		}));

		this._store.add(this.configurationService.onDidChangeConfiguration(e => {
			if (settingIdsToReEvaluate.some(id => e.affectsConfiguration(id))) {
				checkbox.checked = Boolean(accessor.readSetting());
			}
		}));

		if (!this.canUseChat()) {
			container.classList.add('disabled');
			checkbox.disable();
			checkbox.checked = false;
		}

		return checkbox;
	}

	private createInlineSuggestionsSetting(container: HTMLElement, label: string, modeId: string | undefined): void {
		this.createSetting(container, [defaultChat.completionsEnablementSetting], label, this.getCompletionsSettingAccessor(modeId));
	}

	private getCompletionsSettingAccessor(modeId = '*'): ISettingsAccessor {
		const settingId = defaultChat.completionsEnablementSetting;

		return {
			readSetting: () => isCompletionsEnabled(this.configurationService, modeId),
			writeSetting: (value: boolean) => {
				this.telemetryService.publicLog2<ChatSettingChangedEvent, ChatSettingChangedClassification>('chatStatus.settingChanged', {
					settingIdentifier: settingId,
					settingMode: modeId,
					settingEnablement: value ? 'enabled' : 'disabled'
				});

				let result = this.configurationService.getValue<Record<string, boolean>>(settingId);
				if (!isObject(result)) {
					result = Object.create(null);
				}

				return this.configurationService.updateValue(settingId, { ...result, [modeId]: value });
			}
		};
	}

	private createNextEditSuggestionsSetting(container: HTMLElement, label: string, completionsSettingAccessor: ISettingsAccessor): void {
		const nesSettingId = defaultChat.nextEditSuggestionsSetting;
		const completionsSettingId = defaultChat.completionsEnablementSetting;
		const resource = EditorResourceAccessor.getOriginalUri(this.editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });

		const checkbox = this.createSetting(container, [nesSettingId, completionsSettingId], label, {
			readSetting: () => completionsSettingAccessor.readSetting() && this.textResourceConfigurationService.getValue<boolean>(resource, nesSettingId),
			writeSetting: (value: boolean) => {
				this.telemetryService.publicLog2<ChatSettingChangedEvent, ChatSettingChangedClassification>('chatStatus.settingChanged', {
					settingIdentifier: nesSettingId,
					settingEnablement: value ? 'enabled' : 'disabled'
				});

				return this.textResourceConfigurationService.updateValue(resource, nesSettingId, value);
			}
		});

		// enablement of NES depends on completions setting
		// so we have to update our checkbox state accordingly
		if (!completionsSettingAccessor.readSetting()) {
			container.classList.add('disabled');
			checkbox.disable();
		}

		this._store.add(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(completionsSettingId)) {
				if (completionsSettingAccessor.readSetting() && this.canUseChat()) {
					checkbox.enable();
					container.classList.remove('disabled');
				} else {
					checkbox.disable();
					container.classList.add('disabled');
				}
			}
		}));
	}

	private createCompletionsSnooze(container: HTMLElement, label: string): void {
		const isEnabled = () => {
			const completionsEnabled = isCompletionsEnabled(this.configurationService);
			const completionsEnabledActiveLanguage = isCompletionsEnabled(this.configurationService, this.editorService.activeTextEditorLanguageId);
			return completionsEnabled || completionsEnabledActiveLanguage;
		};

		const button = this._store.add(new Button(container, { disabled: !isEnabled(), ...defaultButtonStyles, hoverDelegate: nativeHoverDelegate, secondary: true }));

		const timerDisplay = container.appendChild($('span.snooze-label'));

		const actionBar = container.appendChild($('div.snooze-action-bar'));
		const toolbar = this._store.add(new ActionBar(actionBar, { hoverDelegate: nativeHoverDelegate }));
		const cancelAction = toAction({
			id: 'workbench.action.cancelSnoozeStatusBarLink',
			label: localize('cancelSnooze', "Cancel Snooze"),
			run: () => this.inlineCompletionsService.cancelSnooze(),
			class: ThemeIcon.asClassName(Codicon.stopCircle)
		});

		const update = (isEnabled: boolean) => {
			container.classList.toggle('disabled', !isEnabled);
			toolbar.clear();

			const timeLeftMs = this.inlineCompletionsService.snoozeTimeLeft;
			if (!isEnabled || timeLeftMs <= 0) {
				timerDisplay.textContent = localize('completions.snooze5minutesTitle', "Hide suggestions for 5 min");
				timerDisplay.title = '';
				button.label = label;
				button.setTitle(localize('completions.snooze5minutes', "Hide inline suggestions for 5 min"));
				return true;
			}

			const timeLeftSeconds = Math.ceil(timeLeftMs / 1000);
			const minutes = Math.floor(timeLeftSeconds / 60);
			const seconds = timeLeftSeconds % 60;

			timerDisplay.textContent = `${minutes}:${seconds < 10 ? '0' : ''}${seconds} ${localize('completions.remainingTime', "remaining")}`;
			timerDisplay.title = localize('completions.snoozeTimeDescription', "Inline suggestions are hidden for the remaining duration");
			button.label = localize('completions.plus5min', "+5 min");
			button.setTitle(localize('completions.snoozeAdditional5minutes', "Snooze additional 5 min"));
			toolbar.push([cancelAction], { icon: true, label: false });

			return false;
		};

		// Update every second if there's time remaining
		const timerDisposables = this._store.add(new DisposableStore());
		function updateIntervalTimer() {
			timerDisposables.clear();
			const enabled = isEnabled();

			if (update(enabled)) {
				return;
			}

			timerDisposables.add(disposableWindowInterval(
				getWindow(container),
				() => update(enabled),
				1000
			));
		}
		updateIntervalTimer();

		this._store.add(button.onDidClick(() => {
			this.inlineCompletionsService.snooze();
			update(isEnabled());
		}));

		this._store.add(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(defaultChat.completionsEnablementSetting)) {
				button.enabled = isEnabled();
			}
			updateIntervalTimer();
		}));

		this._store.add(this.inlineCompletionsService.onDidChangeIsSnoozing(() => {
			updateIntervalTimer();
		}));
	}

	private async showQuickPick(
		items: IQuickPickItem[],
		placeHolder: string,
		apply: (selectedId: string) => Promise<void>,
	): Promise<void> {
		const selected = await this.quickInputService.pick(items, {
			placeHolder,
			canPickMany: false
		});

		if (selected?.id) {
			await apply(selected.id);
		}

		this.hoverService.hideHover(true);
	}

	private async showModelPicker(provider: languages.InlineCompletionsProvider): Promise<void> {
		if (!provider.modelInfo || !provider.setModelId) {
			return;
		}

		const modelInfo = provider.modelInfo;
		await this.showQuickPick(
			modelInfo.models.map(model => ({
				id: model.id,
				label: model.name,
				description: model.id === modelInfo.currentModelId ? localize('currentModel.description', "Currently selected") : undefined,
				picked: model.id === modelInfo.currentModelId
			})),
			localize('selectModelFor', "Select a model for {0}", provider.displayName || 'inline completions'),
			async (id) => {
				if (id !== modelInfo.currentModelId) {
					await provider.setModelId!(id);
				}
			},
		);
	}

	private async showProviderOptionPicker(provider: languages.InlineCompletionsProvider, option: languages.IInlineCompletionProviderOption): Promise<void> {
		if (!provider.setProviderOption) {
			return;
		}

		await this.showQuickPick(
			option.values.map(value => ({
				id: value.id,
				label: value.label,
				description: value.id === option.currentValueId ? localize('currentOption.description', "Currently selected") : undefined,
				picked: value.id === option.currentValueId,
			})),
			localize('selectProviderOptionFor', "Select {0}", option.label),
			async (id) => {
				if (id !== option.currentValueId) {
					await provider.setProviderOption!(option.id, id);
				}
			},
		);
	}
}
