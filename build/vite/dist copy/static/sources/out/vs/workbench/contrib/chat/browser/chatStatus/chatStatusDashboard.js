/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { $, append, EventType, addDisposableListener, EventHelper, disposableWindowInterval, getWindow } from '../../../../../base/browser/dom.js';
import { Gesture, EventType as TouchEventType } from '../../../../../base/browser/touch.js';
import { ActionBar } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { renderLabelWithIcons } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Checkbox } from '../../../../../base/browser/ui/toggle/toggle.js';
import { toAction } from '../../../../../base/common/actions.js';
import { cancelOnDispose } from '../../../../../base/common/cancellation.js';
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
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
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
import { IChatEntitlementService, ChatEntitlement, getChatPlanName } from '../../../../services/chat/common/chatEntitlementService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';
import { isNewUser } from './chatStatus.js';
import { IChatStatusItemService } from './chatStatusItemService.js';
import product from '../../../../../platform/product/common/product.js';
import { contrastBorder, inputValidationErrorBorder, inputValidationInfoBorder, inputValidationWarningBorder, registerColor, transparent } from '../../../../../platform/theme/common/colorRegistry.js';
import { Color } from '../../../../../base/common/color.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { ChatViewId } from '../chat.js';
import { isCompletionsEnabled } from '../../../../../editor/common/services/completionsEnablement.js';
import { AgentSessionProviders } from '../agentSessions/agentSessions.js';
const defaultChat = product.defaultChatAgent;
const gaugeForeground = registerColor('gauge.foreground', {
    dark: inputValidationInfoBorder,
    light: inputValidationInfoBorder,
    hcDark: contrastBorder,
    hcLight: contrastBorder
}, localize('gaugeForeground', "Gauge foreground color."));
registerColor('gauge.background', {
    dark: transparent(gaugeForeground, 0.3),
    light: transparent(gaugeForeground, 0.3),
    hcDark: Color.white,
    hcLight: Color.white
}, localize('gaugeBackground', "Gauge background color."));
registerColor('gauge.border', {
    dark: null,
    light: null,
    hcDark: contrastBorder,
    hcLight: contrastBorder
}, localize('gaugeBorder', "Gauge border color."));
const gaugeWarningForeground = registerColor('gauge.warningForeground', {
    dark: inputValidationWarningBorder,
    light: inputValidationWarningBorder,
    hcDark: contrastBorder,
    hcLight: contrastBorder
}, localize('gaugeWarningForeground', "Gauge warning foreground color."));
registerColor('gauge.warningBackground', {
    dark: transparent(gaugeWarningForeground, 0.3),
    light: transparent(gaugeWarningForeground, 0.3),
    hcDark: Color.white,
    hcLight: Color.white
}, localize('gaugeWarningBackground', "Gauge warning background color."));
const gaugeErrorForeground = registerColor('gauge.errorForeground', {
    dark: inputValidationErrorBorder,
    light: inputValidationErrorBorder,
    hcDark: contrastBorder,
    hcLight: contrastBorder
}, localize('gaugeErrorForeground', "Gauge error foreground color."));
registerColor('gauge.errorBackground', {
    dark: transparent(gaugeErrorForeground, 0.3),
    light: transparent(gaugeErrorForeground, 0.3),
    hcDark: Color.white,
    hcLight: Color.white
}, localize('gaugeErrorBackground', "Gauge error background color."));
let ChatStatusDashboard = class ChatStatusDashboard extends DomWidget {
    constructor(options, chatEntitlementService, chatStatusItemService, commandService, configurationService, editorService, hoverService, languageService, openerService, telemetryService, textResourceConfigurationService, inlineCompletionsService, chatSessionsService, markdownRendererService, languageFeaturesService, quickInputService, viewService) {
        super();
        this.options = options;
        this.chatEntitlementService = chatEntitlementService;
        this.chatStatusItemService = chatStatusItemService;
        this.commandService = commandService;
        this.configurationService = configurationService;
        this.editorService = editorService;
        this.hoverService = hoverService;
        this.languageService = languageService;
        this.openerService = openerService;
        this.telemetryService = telemetryService;
        this.textResourceConfigurationService = textResourceConfigurationService;
        this.inlineCompletionsService = inlineCompletionsService;
        this.chatSessionsService = chatSessionsService;
        this.markdownRendererService = markdownRendererService;
        this.languageFeaturesService = languageFeaturesService;
        this.quickInputService = quickInputService;
        this.viewService = viewService;
        this.element = $('div.chat-status-bar-entry-tooltip');
        this.dateFormatter = safeIntl.DateTimeFormat(language, { year: 'numeric', month: 'long', day: 'numeric' });
        this.dateTimeFormatter = safeIntl.DateTimeFormat(language, { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric' });
        this.quotaPercentageFormatter = safeIntl.NumberFormat(undefined, { maximumFractionDigits: 1, minimumFractionDigits: 0 });
        this.quotaOverageFormatter = safeIntl.NumberFormat(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 0 });
        this.render();
    }
    render() {
        const token = cancelOnDispose(this._store);
        let needsSeparator = false;
        const addSeparator = (label, action) => {
            if (needsSeparator) {
                this.element.appendChild($('hr'));
            }
            if (label || action) {
                this.renderHeader(this.element, this._store, label ?? '', action);
            }
            needsSeparator = true;
        };
        // Quota Indicator
        const { chat: chatQuota, completions: completionsQuota, premiumChat: premiumChatQuota, resetDate, resetDateHasTime } = this.chatEntitlementService.quotas;
        if (chatQuota || completionsQuota || premiumChatQuota) {
            const usageTitle = this.getUsageTitle();
            addSeparator(usageTitle, toAction({
                id: 'workbench.action.manageCopilot',
                label: localize('quotaLabel', "Manage Chat"),
                tooltip: localize('quotaTooltip', "Manage Chat"),
                class: ThemeIcon.asClassName(Codicon.settings),
                run: () => this.runCommandAndClose(() => this.openerService.open(URI.parse(defaultChat.manageSettingsUrl))),
            }));
            const completionsQuotaIndicator = completionsQuota && (completionsQuota.total > 0 || completionsQuota.unlimited) ? this.createQuotaIndicator(this.element, this._store, completionsQuota, localize('completionsLabel', "Inline Suggestions"), false) : undefined;
            const chatQuotaIndicator = chatQuota && (chatQuota.total > 0 || chatQuota.unlimited) ? this.createQuotaIndicator(this.element, this._store, chatQuota, localize('chatsLabel', "Chat messages"), false) : undefined;
            const premiumChatLabel = premiumChatQuota?.overageEnabled && !premiumChatQuota?.unlimited ? localize('includedPremiumChatsLabel', "Included premium requests") : localize('premiumChatsLabel', "Premium requests");
            const premiumChatQuotaIndicator = premiumChatQuota && (premiumChatQuota.total > 0 || premiumChatQuota.unlimited) ? this.createQuotaIndicator(this.element, this._store, premiumChatQuota, premiumChatLabel, true) : undefined;
            if (resetDate) {
                this.element.appendChild($('div.description', undefined, localize('limitQuota', "Allowance resets {0}.", resetDateHasTime ? this.dateTimeFormatter.value.format(new Date(resetDate)) : this.dateFormatter.value.format(new Date(resetDate)))));
            }
            if (this.chatEntitlementService.entitlement === ChatEntitlement.Free && (Number(chatQuota?.percentRemaining) <= 25 || Number(completionsQuota?.percentRemaining) <= 25)) {
                const upgradeProButton = this._store.add(new Button(this.element, { ...defaultButtonStyles, hoverDelegate: nativeHoverDelegate, secondary: this.canUseChat() /* use secondary color when chat can still be used */ }));
                upgradeProButton.label = localize('upgradeToCopilotPro', "Upgrade to GitHub Copilot Pro");
                this._store.add(upgradeProButton.onDidClick(() => this.runCommandAndClose('workbench.action.chat.upgradePlan')));
            }
            (async () => {
                await this.chatEntitlementService.update(token);
                if (token.isCancellationRequested) {
                    return;
                }
                const { chat: chatQuota, completions: completionsQuota, premiumChat: premiumChatQuota } = this.chatEntitlementService.quotas;
                if (completionsQuota) {
                    completionsQuotaIndicator?.(completionsQuota);
                }
                if (chatQuota) {
                    chatQuotaIndicator?.(chatQuota);
                }
                if (premiumChatQuota) {
                    premiumChatQuotaIndicator?.(premiumChatQuota);
                }
            })();
        }
        // Anonymous Indicator
        else if (this.chatEntitlementService.anonymous && this.chatEntitlementService.sentiment.completed) {
            addSeparator(localize('anonymousTitle', "Copilot Usage"));
            this.createQuotaIndicator(this.element, this._store, localize('quotaLimited', "Limited"), localize('completionsLabel', "Inline Suggestions"), false);
            this.createQuotaIndicator(this.element, this._store, localize('quotaLimited', "Limited"), localize('chatsLabel', "Chat messages"), false);
        }
        // Chat sessions
        {
            const inProgress = this.chatSessionsService.getInProgress();
            if (inProgress.some(item => item.count > 0)) {
                addSeparator(localize('chatAgentSessionsTitle', "Agent Sessions"), toAction({
                    id: 'workbench.view.chat.status.sessions',
                    label: localize('viewChatSessionsLabel', "View Agent Sessions"),
                    tooltip: localize('viewChatSessionsTooltip', "View Agent Sessions"),
                    class: ThemeIcon.asClassName(Codicon.eye),
                    run: () => {
                        this.viewService.openView(ChatViewId, true);
                        this.hoverService.hideHover(true);
                    }
                }));
                for (const { chatSessionType, count } of inProgress) {
                    if (count > 0) {
                        const displayName = this.getDisplayNameForChatSessionType(chatSessionType);
                        if (displayName) {
                            const text = '$(loading~spin) ' + localize('inProgressChatSession', "{0} in progress", displayName);
                            const chatSessionsElement = this.element.appendChild($('div.description'));
                            const parts = renderLabelWithIcons(text);
                            chatSessionsElement.append(...parts);
                        }
                    }
                }
            }
        }
        // Contributions
        if (!this.options?.disableContributions) {
            for (const item of this.chatStatusItemService.getEntries()) {
                addSeparator();
                const itemDisposables = this._store.add(new MutableDisposable());
                let rendered = this.renderContributedChatStatusItem(item);
                itemDisposables.value = rendered.disposables;
                this.element.appendChild(rendered.element);
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
        // Settings (editor-specific)
        if (!this.options?.disableInlineSuggestionsSettings) {
            const chatSentiment = this.chatEntitlementService.sentiment;
            addSeparator(localize('inlineSuggestions', "Inline Suggestions"), !chatSentiment.disabled && !chatSentiment.untrusted ? toAction({
                id: 'workbench.action.openChatSettings',
                label: localize('settingsLabel', "Settings"),
                tooltip: localize('settingsTooltip', "Open Settings"),
                class: ThemeIcon.asClassName(Codicon.settingsGear),
                run: () => this.runCommandAndClose(() => this.commandService.executeCommand('workbench.action.openSettings', { query: `@id:${defaultChat.completionsEnablementSetting} @id:${defaultChat.nextEditSuggestionsSetting}` })),
            }) : undefined);
            this.createSettings(this.element, this._store);
        }
        // Model Selection (editor-specific)
        if (!this.options?.disableModelSelection) {
            const providers = this.languageFeaturesService.inlineCompletionsProvider.allNoModel();
            const provider = providers.find(p => p.modelInfo && p.modelInfo.models.length > 0);
            if (provider) {
                const modelInfo = provider.modelInfo;
                const currentModel = modelInfo.models.find(m => m.id === modelInfo.currentModelId);
                if (currentModel) {
                    const modelContainer = this.element.appendChild($('div.model-selection'));
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
        if (!this.options?.disableProviderOptions) {
            const providers = this.languageFeaturesService.inlineCompletionsProvider.allNoModel();
            for (const provider of providers) {
                if (provider.providerOptions && provider.providerOptions.length > 0) {
                    for (const option of provider.providerOptions) {
                        const currentValue = option.values.find(v => v.id === option.currentValueId);
                        if (currentValue) {
                            const optionContainer = this.element.appendChild($('div.suggest-option-selection'));
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
            const snooze = append(this.element, $('div.snooze-completions'));
            this.createCompletionsSnooze(snooze, localize('settings.snooze', "Snooze"), this._store);
        }
        // New to Chat / Signed out
        {
            const newUser = isNewUser(this.chatEntitlementService);
            const anonymousUser = this.chatEntitlementService.anonymous;
            const disabled = this.chatEntitlementService.sentiment.disabled || this.chatEntitlementService.sentiment.untrusted;
            const signedOut = this.chatEntitlementService.entitlement === ChatEntitlement.Unknown;
            if (newUser || signedOut || disabled) {
                addSeparator();
                let descriptionText;
                let descriptionClass = '.description';
                if (newUser && anonymousUser) {
                    descriptionText = new MarkdownString(localize({ key: 'activeDescriptionAnonymous', comment: ['{Locked="]({2})"}', '{Locked="]({3})"}'] }, "By continuing with {0} Copilot, you agree to {1}'s [Terms]({2}) and [Privacy Statement]({3})", defaultChat.provider.default.name, defaultChat.provider.default.name, defaultChat.termsStatementUrl, defaultChat.privacyStatementUrl), { isTrusted: true });
                    descriptionClass = `${descriptionClass}.terms`;
                }
                else if (newUser) {
                    descriptionText = localize('activateDescription', "Set up Copilot to use AI features.");
                }
                else if (anonymousUser) {
                    descriptionText = localize('enableMoreDescription', "Sign in to enable more Copilot AI features.");
                }
                else if (disabled) {
                    descriptionText = localize('enableDescription', "Enable Copilot to use AI features.");
                }
                else {
                    descriptionText = localize('signInDescription', "Sign in to use Copilot AI features.");
                }
                let buttonLabel;
                if (newUser) {
                    buttonLabel = localize('enableAIFeatures', "Use AI Features");
                }
                else if (anonymousUser) {
                    buttonLabel = localize('enableMoreAIFeatures', "Enable more AI Features");
                }
                else if (disabled) {
                    buttonLabel = localize('enableCopilotButton', "Enable AI Features");
                }
                else {
                    buttonLabel = localize('signInToUseAIFeatures', "Sign in to use AI Features");
                }
                let commandId;
                if (newUser && anonymousUser) {
                    commandId = 'workbench.action.chat.triggerSetupAnonymousWithoutDialog';
                }
                else {
                    commandId = 'workbench.action.chat.triggerSetup';
                }
                if (typeof descriptionText === 'string') {
                    this.element.appendChild($(`div${descriptionClass}`, undefined, descriptionText));
                }
                else {
                    this.element.appendChild($(`div${descriptionClass}`, undefined, this._store.add(this.markdownRendererService.render(descriptionText)).element));
                }
                const button = this._store.add(new Button(this.element, { ...defaultButtonStyles, hoverDelegate: nativeHoverDelegate }));
                button.label = buttonLabel;
                this._store.add(button.onDidClick(() => this.runCommandAndClose(commandId)));
            }
        }
    }
    getDisplayNameForChatSessionType(chatSessionType) {
        if (chatSessionType === AgentSessionProviders.Local) {
            return localize('chat.session.inProgress.local', "Local Agent");
        }
        else if (chatSessionType === AgentSessionProviders.Background) {
            return localize('chat.session.inProgress.background', "Background Agent");
        }
        else if (chatSessionType === AgentSessionProviders.Cloud) {
            return localize('chat.session.inProgress.cloud', "Cloud Agent");
        }
        else {
            return this.chatSessionsService.getChatSessionContribution(chatSessionType)?.displayName;
        }
    }
    canUseChat() {
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
    getUsageTitle() {
        const planName = getChatPlanName(this.chatEntitlementService.entitlement);
        return localize('usageTitleWithPlan', "{0} Usage", planName);
    }
    renderHeader(container, disposables, label, action) {
        const header = container.appendChild($('div.header', undefined, label ?? ''));
        if (action) {
            const toolbar = disposables.add(new ActionBar(header, { hoverDelegate: nativeHoverDelegate }));
            toolbar.push([action], { icon: true, label: false });
        }
    }
    renderContributedChatStatusItem(item) {
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
            const detail = itemBody.appendChild($('div.detail-item'));
            this.renderTextPlus(detail, item.detail, disposables);
        }
        return { element: itemElement, disposables };
    }
    renderTextPlus(target, text, store) {
        for (const node of parseLinkedText(text).nodes) {
            if (typeof node === 'string') {
                const parts = renderLabelWithIcons(node);
                target.append(...parts);
            }
            else {
                store.add(new Link(target, node, undefined, this.hoverService, this.openerService));
            }
        }
    }
    runCommandAndClose(commandOrFn, ...args) {
        if (typeof commandOrFn === 'function') {
            commandOrFn(...args);
        }
        else {
            this.telemetryService.publicLog2('workbenchActionExecuted', { id: commandOrFn, from: 'chat-status' });
            this.commandService.executeCommand(commandOrFn, ...args);
        }
        this.hoverService.hideHover(true);
    }
    createQuotaIndicator(container, disposables, quota, label, supportsOverage) {
        const quotaValue = $('span.quota-value');
        const quotaBit = $('div.quota-bit');
        const overageLabel = $('span.overage-label');
        const quotaIndicator = container.appendChild($('div.quota-indicator', undefined, $('div.quota-label', undefined, $('span', undefined, label), quotaValue), $('div.quota-bar', undefined, quotaBit), $('div.description', undefined, overageLabel)));
        if (supportsOverage && (this.chatEntitlementService.entitlement === ChatEntitlement.EDU || this.chatEntitlementService.entitlement === ChatEntitlement.Pro || this.chatEntitlementService.entitlement === ChatEntitlement.ProPlus)) {
            const manageOverageButton = disposables.add(new Button(quotaIndicator, { ...defaultButtonStyles, secondary: true, hoverDelegate: nativeHoverDelegate }));
            manageOverageButton.label = localize('enableAdditionalUsage', "Manage paid premium requests");
            disposables.add(manageOverageButton.onDidClick(() => this.runCommandAndClose(() => this.openerService.open(URI.parse(defaultChat.manageOverageUrl)))));
        }
        const update = (quota) => {
            quotaIndicator.classList.remove('error');
            quotaIndicator.classList.remove('warning');
            let usedPercentage;
            if (typeof quota === 'string' || quota.unlimited) {
                usedPercentage = 0;
            }
            else {
                usedPercentage = Math.max(0, 100 - quota.percentRemaining);
            }
            if (typeof quota === 'string') {
                quotaValue.textContent = quota;
            }
            else if (quota.unlimited) {
                quotaValue.textContent = localize('quotaUnlimited', "Included");
            }
            else if (quota.overageCount) {
                quotaValue.textContent = localize('quotaDisplayWithOverage', "+{0} requests", this.quotaOverageFormatter.value.format(quota.overageCount));
            }
            else {
                quotaValue.textContent = localize('quotaDisplay', "{0}%", this.quotaPercentageFormatter.value.format(usedPercentage));
            }
            quotaBit.style.width = `${usedPercentage}%`;
            const overageEnabled = supportsOverage && typeof quota !== 'string' && quota?.overageEnabled;
            if (usedPercentage >= 90 && !overageEnabled) {
                quotaIndicator.classList.add('error');
            }
            else if (usedPercentage >= 75 && !overageEnabled) {
                quotaIndicator.classList.add('warning');
            }
            if (supportsOverage) {
                if (typeof quota !== 'string' && quota.unlimited) {
                    overageLabel.textContent = '';
                }
                else if (typeof quota !== 'string' && quota?.overageEnabled) {
                    overageLabel.replaceChildren(localize('additionalUsageApprovedLine1', "Additional premium requests approved."), $('br'), localize('additionalUsageApprovedLine2', "You can continue after the included premium requests limit reaches 100%."));
                }
                else {
                    overageLabel.textContent = localize('additionalUsageDisabled', "Additional paid premium requests disabled.");
                }
            }
            else {
                overageLabel.textContent = '';
            }
        };
        update(quota);
        return update;
    }
    createSettings(container, disposables) {
        const modeId = this.editorService.activeTextEditorLanguageId;
        const settings = container.appendChild($('div.settings'));
        // --- Inline Suggestions
        {
            const globalSetting = append(settings, $('div.setting'));
            this.createInlineSuggestionsSetting(globalSetting, localize('settings.codeCompletions.allFiles', "All files"), '*', disposables);
            if (modeId) {
                const languageSetting = append(settings, $('div.setting'));
                this.createInlineSuggestionsSetting(languageSetting, localize('settings.codeCompletions.language', "{0}", this.languageService.getLanguageName(modeId) ?? modeId), modeId, disposables);
            }
        }
        // --- Next edit suggestions
        {
            const setting = append(settings, $('div.setting'));
            this.createNextEditSuggestionsSetting(setting, localize('settings.nextEditSuggestions', "Next edit suggestions"), this.getCompletionsSettingAccessor(modeId), disposables);
        }
        return settings;
    }
    createSetting(container, settingIdsToReEvaluate, label, accessor, disposables) {
        const checkbox = disposables.add(new Checkbox(label, Boolean(accessor.readSetting()), { ...defaultCheckboxStyles }));
        container.appendChild(checkbox.domNode);
        const settingLabel = append(container, $('span.setting-label', undefined, label));
        disposables.add(Gesture.addTarget(settingLabel));
        [EventType.CLICK, TouchEventType.Tap].forEach(eventType => {
            disposables.add(addDisposableListener(settingLabel, eventType, e => {
                if (checkbox?.enabled) {
                    EventHelper.stop(e, true);
                    checkbox.checked = !checkbox.checked;
                    accessor.writeSetting(checkbox.checked);
                    checkbox.focus();
                }
            }));
        });
        disposables.add(checkbox.onChange(() => {
            accessor.writeSetting(checkbox.checked);
        }));
        disposables.add(this.configurationService.onDidChangeConfiguration(e => {
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
    createInlineSuggestionsSetting(container, label, modeId, disposables) {
        this.createSetting(container, [defaultChat.completionsEnablementSetting], label, this.getCompletionsSettingAccessor(modeId), disposables);
    }
    getCompletionsSettingAccessor(modeId = '*') {
        const settingId = defaultChat.completionsEnablementSetting;
        return {
            readSetting: () => isCompletionsEnabled(this.configurationService, modeId),
            writeSetting: (value) => {
                this.telemetryService.publicLog2('chatStatus.settingChanged', {
                    settingIdentifier: settingId,
                    settingMode: modeId,
                    settingEnablement: value ? 'enabled' : 'disabled'
                });
                let result = this.configurationService.getValue(settingId);
                if (!isObject(result)) {
                    result = Object.create(null);
                }
                return this.configurationService.updateValue(settingId, { ...result, [modeId]: value });
            }
        };
    }
    createNextEditSuggestionsSetting(container, label, completionsSettingAccessor, disposables) {
        const nesSettingId = defaultChat.nextEditSuggestionsSetting;
        const completionsSettingId = defaultChat.completionsEnablementSetting;
        const resource = EditorResourceAccessor.getOriginalUri(this.editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
        const checkbox = this.createSetting(container, [nesSettingId, completionsSettingId], label, {
            readSetting: () => completionsSettingAccessor.readSetting() && this.textResourceConfigurationService.getValue(resource, nesSettingId),
            writeSetting: (value) => {
                this.telemetryService.publicLog2('chatStatus.settingChanged', {
                    settingIdentifier: nesSettingId,
                    settingEnablement: value ? 'enabled' : 'disabled'
                });
                return this.textResourceConfigurationService.updateValue(resource, nesSettingId, value);
            }
        }, disposables);
        // enablement of NES depends on completions setting
        // so we have to update our checkbox state accordingly
        if (!completionsSettingAccessor.readSetting()) {
            container.classList.add('disabled');
            checkbox.disable();
        }
        disposables.add(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(completionsSettingId)) {
                if (completionsSettingAccessor.readSetting() && this.canUseChat()) {
                    checkbox.enable();
                    container.classList.remove('disabled');
                }
                else {
                    checkbox.disable();
                    container.classList.add('disabled');
                }
            }
        }));
    }
    createCompletionsSnooze(container, label, disposables) {
        const isEnabled = () => {
            const completionsEnabled = isCompletionsEnabled(this.configurationService);
            const completionsEnabledActiveLanguage = isCompletionsEnabled(this.configurationService, this.editorService.activeTextEditorLanguageId);
            return completionsEnabled || completionsEnabledActiveLanguage;
        };
        const button = disposables.add(new Button(container, { disabled: !isEnabled(), ...defaultButtonStyles, hoverDelegate: nativeHoverDelegate, secondary: true }));
        const timerDisplay = container.appendChild($('span.snooze-label'));
        const actionBar = container.appendChild($('div.snooze-action-bar'));
        const toolbar = disposables.add(new ActionBar(actionBar, { hoverDelegate: nativeHoverDelegate }));
        const cancelAction = toAction({
            id: 'workbench.action.cancelSnoozeStatusBarLink',
            label: localize('cancelSnooze', "Cancel Snooze"),
            run: () => this.inlineCompletionsService.cancelSnooze(),
            class: ThemeIcon.asClassName(Codicon.stopCircle)
        });
        const update = (isEnabled) => {
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
        const timerDisposables = disposables.add(new DisposableStore());
        function updateIntervalTimer() {
            timerDisposables.clear();
            const enabled = isEnabled();
            if (update(enabled)) {
                return;
            }
            timerDisposables.add(disposableWindowInterval(getWindow(container), () => update(enabled), 1000));
        }
        updateIntervalTimer();
        disposables.add(button.onDidClick(() => {
            this.inlineCompletionsService.snooze();
            update(isEnabled());
        }));
        disposables.add(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(defaultChat.completionsEnablementSetting)) {
                button.enabled = isEnabled();
            }
            updateIntervalTimer();
        }));
        disposables.add(this.inlineCompletionsService.onDidChangeIsSnoozing(e => {
            updateIntervalTimer();
        }));
    }
    async showModelPicker(provider) {
        if (!provider.modelInfo || !provider.setModelId) {
            return;
        }
        const modelInfo = provider.modelInfo;
        const items = modelInfo.models.map(model => ({
            id: model.id,
            label: model.name,
            description: model.id === modelInfo.currentModelId ? localize('currentModel.description', "Currently selected") : undefined,
            picked: model.id === modelInfo.currentModelId
        }));
        const selected = await this.quickInputService.pick(items, {
            placeHolder: localize('selectModelFor', "Select a model for {0}", provider.displayName || 'inline completions'),
            canPickMany: false
        });
        if (selected && selected.id && selected.id !== modelInfo.currentModelId) {
            await provider.setModelId(selected.id);
        }
        this.hoverService.hideHover(true);
    }
    async showProviderOptionPicker(provider, option) {
        if (!provider.setProviderOption) {
            return;
        }
        const items = option.values.map(value => ({
            id: value.id,
            label: value.label,
            description: value.id === option.currentValueId ? localize('currentOption.description', "Currently selected") : undefined,
            picked: value.id === option.currentValueId,
        }));
        const selected = await this.quickInputService.pick(items, {
            placeHolder: localize('selectProviderOptionFor', "Select {0}", option.label),
            canPickMany: false
        });
        if (selected && selected.id && selected.id !== option.currentValueId) {
            await provider.setProviderOption(option.id, selected.id);
        }
        this.hoverService.hideHover(true);
    }
};
ChatStatusDashboard = __decorate([
    __param(1, IChatEntitlementService),
    __param(2, IChatStatusItemService),
    __param(3, ICommandService),
    __param(4, IConfigurationService),
    __param(5, IEditorService),
    __param(6, IHoverService),
    __param(7, ILanguageService),
    __param(8, IOpenerService),
    __param(9, ITelemetryService),
    __param(10, ITextResourceConfigurationService),
    __param(11, IInlineCompletionsService),
    __param(12, IChatSessionsService),
    __param(13, IMarkdownRendererService),
    __param(14, ILanguageFeaturesService),
    __param(15, IQuickInputService),
    __param(16, IViewsService)
], ChatStatusDashboard);
export { ChatStatusDashboard };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFN0YXR1c0Rhc2hib2FyZC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0U3RhdHVzL2NoYXRTdGF0dXNEYXNoYm9hcmQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLENBQUMsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLHFCQUFxQixFQUFFLFdBQVcsRUFBRSx3QkFBd0IsRUFBRSxTQUFTLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNuSixPQUFPLEVBQUUsT0FBTyxFQUFFLFNBQVMsSUFBSSxjQUFjLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUM1RixPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDbEYsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQzlGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUMzRSxPQUFPLEVBQVcsUUFBUSxFQUF1RSxNQUFNLHVDQUF1QyxDQUFDO0FBQy9JLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUM3RSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDakUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDN0YsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQzNFLE9BQU8sRUFB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