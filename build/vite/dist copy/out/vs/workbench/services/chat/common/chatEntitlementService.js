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
var ChatEntitlementContext_1;
import product from '../../../../platform/product/common/product.js';
import { Barrier } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { asText, IRequestService } from '../../../../platform/request/common/request.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IAuthenticationService } from '../../authentication/common/authentication.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { URI } from '../../../../base/common/uri.js';
import Severity from '../../../../base/common/severity.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { isWeb } from '../../../../base/common/platform.js';
import { ILifecycleService } from '../../lifecycle/common/lifecycle.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { observableFromEvent } from '../../../../base/common/observable.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
export var ChatEntitlementContextKeys;
(function (ChatEntitlementContextKeys) {
    ChatEntitlementContextKeys.Setup = {
        hidden: new RawContextKey('chatSetupHidden', false, true), // True when chat setup is explicitly hidden.
        installed: new RawContextKey('chatSetupInstalled', false, true), // True when the chat extension is installed and enabled.
        disabled: new RawContextKey('chatSetupDisabled', false, true), // True when the chat extension is disabled due to any other reason than workspace trust.
        untrusted: new RawContextKey('chatSetupUntrusted', false, true), // True when the chat extension is disabled due to workspace trust.
        later: new RawContextKey('chatSetupLater', false, true), // True when the user wants to finish setup later.
        registered: new RawContextKey('chatSetupRegistered', false, true), // True when the user has registered as Free or Pro user.
        completed: new RawContextKey('chatSetupCompleted', false, true) // True when the user has completed the setup flow, regardless of the outcome.
    };
    ChatEntitlementContextKeys.Entitlement = {
        signedOut: new RawContextKey('chatEntitlementSignedOut', false, true), // True when user is signed out.
        canSignUp: new RawContextKey('chatPlanCanSignUp', false, true), // True when user can sign up to be a chat free user.
        planFree: new RawContextKey('chatPlanFree', false, true), // True when user is a chat free user.
        planPro: new RawContextKey('chatPlanPro', false, true), // True when user is a chat pro user.
        planEdu: new RawContextKey('chatPlanEdu', false, true), // True when user is a chat edu user.
        planProPlus: new RawContextKey('chatPlanProPlus', false, true), // True when user is a chat pro plus user.
        planBusiness: new RawContextKey('chatPlanBusiness', false, true), // True when user is a chat business user.
        planEnterprise: new RawContextKey('chatPlanEnterprise', false, true), // True when user is a chat enterprise user.
        organisations: new RawContextKey('chatEntitlementOrganisations', undefined, true), // The organizations the user belongs to.
        internal: new RawContextKey('chatEntitlementInternal', false, true), // True when user belongs to internal organisation.
        sku: new RawContextKey('chatEntitlementSku', undefined, true), // The SKU of the user.
    };
    ChatEntitlementContextKeys.chatQuotaExceeded = new RawContextKey('chatQuotaExceeded', false, true);
    ChatEntitlementContextKeys.completionsQuotaExceeded = new RawContextKey('completionsQuotaExceeded', false, true);
    ChatEntitlementContextKeys.chatAnonymous = new RawContextKey('chatAnonymous', false, true);
})(ChatEntitlementContextKeys || (ChatEntitlementContextKeys = {}));
export const IChatEntitlementService = createDecorator('chatEntitlementService');
export var ChatEntitlement;
(function (ChatEntitlement) {
    /** Signed out */
    ChatEntitlement[ChatEntitlement["Unknown"] = 1] = "Unknown";
    /** Signed in but not yet resolved */
    ChatEntitlement[ChatEntitlement["Unresolved"] = 2] = "Unresolved";
    /** Signed in and entitled to Free */
    ChatEntitlement[ChatEntitlement["Available"] = 3] = "Available";
    /** Signed in but not entitled to Free */
    ChatEntitlement[ChatEntitlement["Unavailable"] = 4] = "Unavailable";
    /** Signed-up to Free */
    ChatEntitlement[ChatEntitlement["Free"] = 5] = "Free";
    /** Signed-up to EDU */
    ChatEntitlement[ChatEntitlement["EDU"] = 10] = "EDU";
    /** Signed-up to Pro */
    ChatEntitlement[ChatEntitlement["Pro"] = 6] = "Pro";
    /** Signed-up to Pro Plus */
    ChatEntitlement[ChatEntitlement["ProPlus"] = 7] = "ProPlus";
    /** Signed-up to Business */
    ChatEntitlement[ChatEntitlement["Business"] = 8] = "Business";
    /** Signed-up to Enterprise */
    ChatEntitlement[ChatEntitlement["Enterprise"] = 9] = "Enterprise";
})(ChatEntitlement || (ChatEntitlement = {}));
//#region Helper Functions
/**
 * Checks the chat entitlements to see if the user falls into the paid category
 * @param chatEntitlement The chat entitlement to check
 * @returns Whether or not they are a paid user
 */
export function isProUser(chatEntitlement) {
    return chatEntitlement === ChatEntitlement.EDU ||
        chatEntitlement === ChatEntitlement.Pro ||
        chatEntitlement === ChatEntitlement.ProPlus ||
        chatEntitlement === ChatEntitlement.Business ||
        chatEntitlement === ChatEntitlement.Enterprise;
}
/**
 * Gets the full plan name for the given chat entitlement
 * @param chatEntitlement The chat entitlement to get the plan name for
 * @returns The localized full plan name (e.g., "Copilot Pro", "Copilot Free")
 */
export function getChatPlanName(chatEntitlement) {
    switch (chatEntitlement) {
        case ChatEntitlement.EDU:
            return localize('plan.eduName', 'Copilot EDU');
        case ChatEntitlement.Pro:
            return localize('plan.proName', 'Copilot Pro');
        case ChatEntitlement.ProPlus:
            return localize('plan.proPlusName', 'Copilot Pro+');
        case ChatEntitlement.Business:
            return localize('plan.businessName', 'Copilot Business');
        case ChatEntitlement.Enterprise:
            return localize('plan.enterpriseName', 'Copilot Enterprise');
        default:
            return localize('plan.freeName', 'Copilot Free');
    }
}
//#region Service Implementation
const defaultChatAgent = {
    upgradePlanUrl: product.defaultChatAgent?.upgradePlanUrl ?? '',
    providerUriSetting: product.defaultChatAgent?.providerUriSetting ?? '',
    entitlementSignupLimitedUrl: product.defaultChatAgent?.entitlementSignupLimitedUrl ?? '',
    chatQuotaExceededContext: product.defaultChatAgent?.chatQuotaExceededContext ?? '',
    completionsQuotaExceededContext: product.defaultChatAgent?.completionsQuotaExceededContext ?? ''
};
const CHAT_ALLOW_ANONYMOUS_CONFIGURATION_KEY = 'chat.allowAnonymousAccess';
function isAnonymous(configurationService, entitlement, sentiment) {
    if (configurationService.getValue(CHAT_ALLOW_ANONYMOUS_CONFIGURATION_KEY) !== true) {
        return false; // only enabled behind an experimental setting
    }
    if (entitlement !== ChatEntitlement.Unknown) {
        return false; // only consider signed out users
    }
    if (sentiment.hidden || sentiment.disabled) {
        return false; // only consider enabled scenarios
    }
    return true;
}
function logChatEntitlements(state, configurationService, telemetryService) {
    telemetryService.publicLog2('chatEntitlements', {
        chatHidden: Boolean(state.hidden),
        chatDisabled: Boolean(state.disabled),
        chatEntitlement: state.entitlement,
        chatRegistered: Boolean(state.registered),
        chatAnonymous: isAnonymous(configurationService, state.entitlement, state)
    });
}
let ChatEntitlementService = class ChatEntitlementService extends Disposable {
    constructor(instantiationService, productService, environmentService, contextKeyService, configurationService, telemetryService) {
        super();
        this.contextKeyService = contextKeyService;
        this.configurationService = configurationService;
        this.telemetryService = telemetryService;
        //#endregion
        //#region --- Quotas
        this._onDidChangeQuotaExceeded = this._register(new Emitter());
        this.onDidChangeQuotaExceeded = this._onDidChangeQuotaExceeded.event;
        this._onDidChangeQuotaRemaining = this._register(new Emitter());
        this.onDidChangeQuotaRemaining = this._onDidChangeQuotaRemaining.event;
        this._quotas = {};
        this.ExtensionQuotaContextKeys = {
            chatQuotaExceeded: defaultChatAgent.chatQuotaExceededContext,
            completionsQuotaExceeded: defaultChatAgent.completionsQuotaExceededContext,
        };
        this._onDidChangeAnonymous = this._register(new Emitter());
        this.onDidChangeAnonymous = this._onDidChangeAnonymous.event;
        this.anonymousObs = observableFromEvent(this.onDidChangeAnonymous, () => this.anonymous);
        this.chatQuotaExceededContextKey = ChatEntitlementContextKeys.chatQuotaExceeded.bindTo(this.contextKeyService);
        this.completionsQuotaExceededContextKey = ChatEntitlementContextKeys.completionsQuotaExceeded.bindTo(this.contextKeyService);
        this.anonymousContextKey = ChatEntitlementContextKeys.chatAnonymous.bindTo(this.contextKeyService);
        this.anonymousContextKey.set(this.anonymous);
        this.onDidChangeEntitlement = Event.map(Event.filter(this.contextKeyService.onDidChangeContext, e => e.affectsSome(new Set([
            ChatEntitlementContextKeys.Entitlement.planEdu.key,
            ChatEntitlementContextKeys.Entitlement.planPro.key,
            ChatEntitlementContextKeys.Entitlement.planBusiness.key,
            ChatEntitlementContextKeys.Entitlement.planEnterprise.key,
            ChatEntitlementContextKeys.Entitlement.planProPlus.key,
            ChatEntitlementContextKeys.Entitlement.planFree.key,
            ChatEntitlementContextKeys.Entitlement.canSignUp.key,
            ChatEntitlementContextKeys.Entitlement.signedOut.key,
            ChatEntitlementContextKeys.Entitlement.organisations.key,
            ChatEntitlementContextKeys.Entitlement.internal.key,
            ChatEntitlementContextKeys.Entitlement.sku.key
        ])), this._store), () => { }, this._store);
        this.entitlementObs = observableFromEvent(this.onDidChangeEntitlement, () => this.entitlement);
        this.onDidChangeSentiment = Event.map(Event.filter(this.contextKeyService.onDidChangeContext, e => e.affectsSome(new Set([
            ChatEntitlementContextKeys.Setup.completed.key,
            ChatEntitlementContextKeys.Setup.hidden.key,
            ChatEntitlementContextKeys.Setup.disabled.key,
            ChatEntitlementContextKeys.Setup.untrusted.key,
            ChatEntitlementContextKeys.Setup.installed.key,
            ChatEntitlementContextKeys.Setup.later.key,
            ChatEntitlementContextKeys.Setup.registered.key
        ])), this._store), () => { }, this._store);
        this.sentimentObs = observableFromEvent(this.onDidChangeSentiment, () => this.sentiment);
        if ((isWeb && !environmentService.remoteAuthority)) {
            ChatEntitlementContextKeys.Setup.hidden.bindTo(this.contextKeyService).set(true); // hide copilot UI on web if unsupported
            return;
        }
        if (!productService.defaultChatAgent) {
            return; // we need a default chat agent configured going forward from here
        }
        const context = this.context = new Lazy(() => this._register(instantiationService.createInstance(ChatEntitlementContext)));
        this.requests = new Lazy(() => this._register(instantiationService.createInstance(ChatEntitlementRequests, context.value, {
            clearQuotas: () => this.clearQuotas(),
            acceptQuotas: quotas => this.acceptQuotas(quotas)
        })));
        this.registerListeners();
    }
    get entitlement() {
        if (this.contextKeyService.getContextKeyValue(ChatEntitlementContextKeys.Entitlement.planEdu.key) === true) {
            return ChatEntitlement.EDU;
        }
        else if (this.contextKeyService.getContextKeyValue(ChatEntitlementContextKeys.Entitlement.planPro.key) === true) {
            return ChatEntitlement.Pro;
        }
        else if (this.contextKeyService.getContextKeyValue(ChatEntitlementContextKeys.Entitlement.planBusiness.key) === true) {
            return ChatEntitlement.Business;
        }
        else if (this.contextKeyService.getContextKeyValue(ChatEntitlementContextKeys.Entitlement.planEnterprise.key) === true) {
            return ChatEntitlement.Enterprise;
        }
        else if (this.contextKeyService.getContextKeyValue(ChatEntitlementContextKeys.Entitlement.planProPlus.key) === true) {
            return ChatEntitlement.ProPlus;
        }
        else if (this.contextKeyService.getContextKeyValue(ChatEntitlementContextKeys.Entitlement.planFree.key) === true) {
            return ChatEntitlement.Free;
        }
        else if (this.contextKeyService.getContextKeyValue(ChatEntitlementContextKeys.Entitlement.canSignUp.key) === true) {
            return ChatEntitlement.Available;
        }
        else if (this.contextKeyService.getContextKeyValue(ChatEntitlementContextKeys.Entitlement.signedOut.key) === true) {
            return ChatEntitlement.Unknown;
        }
        return ChatEntitlement.Unresolved;
    }
    get isInternal() {
        return this.contextKeyService.getContextKeyValue(ChatEntitlementContextKeys.Entitlement.internal.key) === true;
    }
    get organisations() {
        return this.contextKeyService.getContextKeyValue(ChatEntitlementContextKeys.Entitlement.organisations.key);
    }
    get sku() {
        return this.contextKeyService.getContextKeyValue(ChatEntitlementContextKeys.Entitlement.sku.key);
    }
    get copilotTrackingId() {
        return this.context?.value.state.copilotTrackingId;
    }
    get previewFeaturesDisabled() {
        return this.contextKeyService.getContextKeyValue('github.copilot.previewFeaturesDisabled') === true;
    }
    get quotas() { return this._quotas; }
    registerListeners() {
        const quotaExceededSet = new Set([this.ExtensionQuotaContextKeys.chatQuotaExceeded, this.ExtensionQuotaContextKeys.completionsQuotaExceeded]);
        const cts = this._register(new MutableDisposable());
        this._register(this.contextKeyService.onDidChangeContext(e => {
            if (e.affectsSome(quotaExceededSet)) {
                if (cts.value) {
                    cts.value.cancel();
                }
                cts.value = new CancellationTokenSource();
                this.update(cts.value.token);
            }
        }));
        let anonymousUsage = this.anonymous;
        const updateAnonymousUsage = () => {
            const newAnonymousUsage = this.anonymous;
            if (newAnonymousUsage !== anonymousUsage) {
                anonymousUsage = newAnonymousUsage;
                this.anonymousContextKey.set(newAnonymousUsage);
                if (this.context?.hasValue) {
                    logChatEntitlements(this.context.value.state, this.configurationService, this.telemetryService);
                }
                this._onDidChangeAnonymous.fire();
            }
        };
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(CHAT_ALLOW_ANONYMOUS_CONFIGURATION_KEY)) {
                updateAnonymousUsage();
            }
        }));
        this._register(this.onDidChangeEntitlement(() => updateAnonymousUsage()));
        this._register(this.onDidChangeSentiment(() => updateAnonymousUsage()));
    }
    acceptQuotas(quotas) {
        const oldQuota = this._quotas;
        this._quotas = quotas;
        this.updateContextKeys();
        const { changed: chatChanged } = this.compareQuotas(oldQuota.chat, quotas.chat);
        const { changed: completionsChanged } = this.compareQuotas(oldQuota.completions, quotas.completions);
        const { changed: premiumChatChanged } = this.compareQuotas(oldQuota.premiumChat, quotas.premiumChat);
        if (chatChanged.exceeded || completionsChanged.exceeded || premiumChatChanged.exceeded) {
            this._onDidChangeQuotaExceeded.fire();
        }
        if (chatChanged.remaining || completionsChanged.remaining || premiumChatChanged.remaining) {
            this._onDidChangeQuotaRemaining.fire();
        }
    }
    compareQuotas(oldQuota, newQuota) {
        return {
            changed: {
                exceeded: (oldQuota?.percentRemaining === 0) !== (newQuota?.percentRemaining === 0),
                remaining: oldQuota?.percentRemaining !== newQuota?.percentRemaining
            }
        };
    }
    clearQuotas() {
        this.acceptQuotas({});
    }
    updateContextKeys() {
        this.chatQuotaExceededContextKey.set(this._quotas.chat?.percentRemaining === 0);
        this.completionsQuotaExceededContextKey.set(this._quotas.completions?.percentRemaining === 0);
    }
    get sentiment() {
        return {
            completed: this.contextKeyService.getContextKeyValue(ChatEntitlementContextKeys.Setup.completed.key) === true,
            installed: this.contextKeyService.getContextKeyValue(ChatEntitlementContextKeys.Setup.installed.key) === true,
            hidden: this.contextKeyService.getContextKeyValue(ChatEntitlementContextKeys.Setup.hidden.key) === true,
            disabled: this.contextKeyService.getContextKeyValue(ChatEntitlementContextKeys.Setup.disabled.key) === true,
            untrusted: this.contextKeyService.getContextKeyValue(ChatEntitlementContextKeys.Setup.untrusted.key) === true,
            later: this.contextKeyService.getContextKeyValue(ChatEntitlementContextKeys.Setup.later.key) === true,
            registered: this.contextKeyService.getContextKeyValue(ChatEntitlementContextKeys.Setup.registered.key) === true
        };
    }
    get anonymous() {
        return isAnonymous(this.configurationService, this.entitlement, this.sentiment);
    }
    //#endregion
    markAnonymousRateLimited() {
        if (!this.anonymous) {
            return;
        }
        this.chatQuotaExceededContextKey.set(true);
        this._onDidChangeQuotaExceeded.fire();
    }
    async update(token) {
        await this.requests?.value.forceResolveEntitlement(token);
    }
};
ChatEntitlementService = __decorate([
    __param(0, IInstantiationService),
    __param(1, IProductService),
    __param(2, IWorkbenchEnvironmentService),
    __param(3, IContextKeyService),
    __param(4, IConfigurationService),
    __param(5, ITelemetryService)
], ChatEntitlementService);
export { ChatEntitlementService };
let ChatEntitlementRequests = class ChatEntitlementRequests extends Disposable {
    constructor(context, chatQuotasAccessor, telemetryService, logService, requestService, dialogService, openerService, lifecycleService, defaultAccountService, authenticationService) {
        super();
        this.context = context;
        this.chatQuotasAccessor = chatQuotasAccessor;
        this.telemetryService = telemetryService;
        this.logService = logService;
        this.requestService = requestService;
        this.dialogService = dialogService;
        this.openerService = openerService;
        this.lifecycleService = lifecycleService;
        this.defaultAccountService = defaultAccountService;
        this.authenticationService = authenticationService;
        this.pendingResolveCts = new CancellationTokenSource();
        this.state = { entitlement: this.context.state.entitlement };
        this.registerListeners();
        this.resolve();
    }
    registerListeners() {
        this._register(this.defaultAccountService.onDidChangeDefaultAccount(() => this.resolve()));
        this._register(this.context.onDidChange(() => {
            if (this.context.state.disabled || this.context.state.entitlement === ChatEntitlement.Unknown) {
                // When the extension is disabled or the user is not entitled
                // make sure to clear quotas so that any indicators are also gone
                this.state = { entitlement: this.state.entitlement, quotas: undefined };
                this.chatQuotasAccessor.clearQuotas();
            }
        }));
    }
    async resolve() {
        this.pendingResolveCts.dispose(true);
        const cts = this.pendingResolveCts = new CancellationTokenSource();
        const defaultAccount = await this.defaultAccountService.getDefaultAccount();
        if (cts.token.isCancellationRequested) {
            return;
        }
        // Immediately signal whether we have a session or not
        let state = undefined;
        if (defaultAccount) {
            // Do not overwrite any state we have already
            if (this.state.entitlement === ChatEntitlement.Unknown) {
                state = { entitlement: ChatEntitlement.Unresolved };
            }
        }
        else {
            state = { entitlement: ChatEntitlement.Unknown };
        }
        if (state) {
            this.update(state);
        }
        if (defaultAccount) {
            // Afterwards resolve entitlement with a network request
            // but only unless it was not already resolved before.
            await this.resolveEntitlement(defaultAccount, cts.token);
        }
    }
    async resolveEntitlement(defaultAccount, token) {
        const entitlements = await this.doResolveEntitlement(defaultAccount, token);
        if (typeof entitlements?.entitlement === 'number' && !token.isCancellationRequested) {
            this.update(entitlements);
        }
        return entitlements;
    }
    async doResolveEntitlement(defaultAccount, token) {
        if (token.isCancellationRequested) {
            return undefined;
        }
        const entitlementsData = defaultAccount.entitlementsData;
        if (!entitlementsData) {
            this.logService.trace('[chat entitlement]: no entitlements data available on default account');
            return { entitlement: entitlementsData === null ? ChatEntitlement.Unknown : ChatEntitlement.Unresolved };
        }
        let entitlement;
        if (entitlementsData.access_type_sku === 'free_limited_copilot') {
            entitlement = ChatEntitlement.Free;
        }
        else if (entitlementsData.can_signup_for_limited) {
            entitlement = ChatEntitlement.Available;
        }
        else if (entitlementsData.copilot_plan === 'individual_edu') {
            entitlement = ChatEntitlement.EDU;
        }
        else if (entitlementsData.copilot_plan === 'individual') {
            entitlement = ChatEntitlement.Pro;
        }
        else if (entitlementsData.copilot_plan === 'individual_pro') {
            entitlement = ChatEntitlement.ProPlus;
        }
        else if (entitlementsData.copilot_plan === 'business') {
            entitlement = ChatEntitlement.Business;
        }
        else if (entitlementsData.copilot_plan === 'enterprise') {
            entitlement = ChatEntitlement.Enterprise;
        }
        else {
            entitlement = ChatEntitlement.Unavailable;
        }
        const entitlements = {
            entitlement,
            organisations: entitlementsData.organization_login_list,
            quotas: this.toQuotas(entitlementsData),
            sku: entitlementsData.access_type_sku,
            copilotTrackingId: entitlementsData.analytics_tracking_id
        };
        this.logService.trace(`[chat entitlement]: resolved to ${entitlements.entitlement}, quotas: ${JSON.stringify(entitlements.quotas)}`);
        this.telemetryService.publicLog2('chatInstallEntitlement', {
            entitlement: entitlements.entitlement,
            tid: entitlementsData.analytics_tracking_id,
            sku: entitlements.sku,
            quotaChat: entitlements.quotas?.chat?.remaining,
            quotaPremiumChat: entitlements.quotas?.premiumChat?.remaining,
            quotaCompletions: entitlements.quotas?.completions?.remaining,
            quotaResetDate: entitlements.quotas?.resetDate
        });
        return entitlements;
    }
    toQuotas(entitlementsData) {
        const quotas = {
            resetDate: entitlementsData.quota_reset_date_utc ?? entitlementsData.quota_reset_date ?? entitlementsData.limited_user_reset_date,
            resetDateHasTime: typeof entitlementsData.quota_reset_date_utc === 'string',
        };
        // Legacy Free SKU Quota
        if (entitlementsData.monthly_quotas?.chat && typeof entitlementsData.limited_user_quotas?.chat === 'number') {
            quotas.chat = {
                total: entitlementsData.monthly_quotas.chat,
                remaining: entitlementsData.limited_user_quotas.chat,
                percentRemaining: Math.min(100, Math.max(0, (entitlementsData.limited_user_quotas.chat / entitlementsData.monthly_quotas.chat) * 100)),
                overageEnabled: false,
                overageCount: 0,
                unlimited: false
            };
        }
        if (entitlementsData.monthly_quotas?.completions && typeof entitlementsData.limited_user_quotas?.completions === 'number') {
            quotas.completions = {
                total: entitlementsData.monthly_quotas.completions,
                remaining: entitlementsData.limited_user_quotas.completions,
                percentRemaining: Math.min(100, Math.max(0, (entitlementsData.limited_user_quotas.completions / entitlementsData.monthly_quotas.completions) * 100)),
                overageEnabled: false,
                overageCount: 0,
                unlimited: false
            };
        }
        // New Quota Snapshot
        if (entitlementsData.quota_snapshots) {
            for (const quotaType of ['chat', 'completions', 'premium_interactions']) {
                const rawQuotaSnapshot = entitlementsData.quota_snapshots[quotaType];
                if (!rawQuotaSnapshot) {
                    continue;
                }
                const quotaSnapshot = {
                    total: rawQuotaSnapshot.entitlement,
                    remaining: rawQuotaSnapshot.remaining,
                    percentRemaining: Math.min(100, Math.max(0, rawQuotaSnapshot.percent_remaining)),
                    overageEnabled: rawQuotaSnapshot.overage_permitted,
                    overageCount: rawQuotaSnapshot.overage_count,
                    unlimited: rawQuotaSnapshot.unlimited
                };
                switch (quotaType) {
                    case 'chat':
                        quotas.chat = quotaSnapshot;
                        break;
                    case 'completions':
                        quotas.completions = quotaSnapshot;
                        break;
                    case 'premium_interactions':
                        quotas.premiumChat = quotaSnapshot;
                        break;
                }
            }
        }
        return quotas;
    }
    async request(url, type, body, sessions, token, callSite) {
        let lastRequest;
        for (const session of sessions) {
            if (token.isCancellationRequested) {
                return lastRequest;
            }
            try {
                const response = await this.requestService.request({
                    type,
                    url,
                    data: type === 'POST' ? JSON.stringify(body) : undefined,
                    disableCache: true,
                    headers: {
                        'Authorization': `Bearer ${session.accessToken}`
                    },
                    callSite
                }, token);
                const status = response.res.statusCode;
                if (status && status !== 200) {
                    lastRequest = response;
                    continue; // try next session
                }
                return response;
            }
            catch (error) {
                if (!token.isCancellationRequested) {
                    this.logService.error(`[chat entitlement] request: error ${error}`);
                }
            }
        }
        return lastRequest;
    }
    update(state) {
        this.state = state;
        this.context.update({ entitlement: this.state.entitlement, organisations: this.state.organisations, sku: this.state.sku, copilotTrackingId: this.state.copilotTrackingId });
        if (state.quotas) {
            this.chatQuotasAccessor.acceptQuotas(state.quotas);
        }
    }
    async forceResolveEntitlement(token = CancellationToken.None) {
        const defaultAccount = await this.defaultAccountService.refresh();
        if (!defaultAccount) {
            return undefined;
        }
        return this.resolveEntitlement(defaultAccount, token);
    }
    async signUpFree() {
        const sessions = await this.getSessions();
        if (sessions.length === 0) {
            return undefined;
        }
        return this.doSignUpFree(sessions);
    }
    async doSignUpFree(sessions) {
        const body = {
            restricted_telemetry: this.telemetryService.telemetryLevel === 0 /* TelemetryLevel.NONE */ ? 'disabled' : 'enabled',
            public_code_suggestions: 'enabled'
        };
        const response = await this.request(defaultChatAgent.entitlementSignupLimitedUrl, 'POST', body, sessions, CancellationToken.None, 'chatEntitlementService.signUpFree');
        if (!response) {
            const retry = await this.onUnknownSignUpError(localize('signUpNoResponseError', "No response received."), '[chat entitlement] sign-up: no response');
            return retry ? this.doSignUpFree(sessions) : { errorCode: 1 };
        }
        if (response.res.statusCode && response.res.statusCode !== 200) {
            if (response.res.statusCode === 422) {
                try {
                    const responseText = await asText(response);
                    if (responseText) {
                        const responseError = JSON.parse(responseText);
                        if (typeof responseError.message === 'string' && responseError.message) {
                            this.onUnprocessableSignUpError(`[chat entitlement] sign-up: unprocessable entity (${responseError.message})`, responseError.message);
                            return { errorCode: response.res.statusCode };
                        }
                    }
                }
                catch (error) {
                    // ignore - handled below
                }
            }
            const retry = await this.onUnknownSignUpError(localize('signUpUnexpectedStatusError', "Unexpected status code {0}.", response.res.statusCode), `[chat entitlement] sign-up: unexpected status code ${response.res.statusCode}`);
            return retry ? this.doSignUpFree(sessions) : { errorCode: response.res.statusCode };
        }
        let responseText = null;
        try {
            responseText = await asText(response);
        }
        catch (error) {
            // ignore - handled below
        }
        if (!responseText) {
            const retry = await this.onUnknownSignUpError(localize('signUpNoResponseContentsError', "Response has no contents."), '[chat entitlement] sign-up: response has no content');
            return retry ? this.doSignUpFree(sessions) : { errorCode: 2 };
        }
        let parsedResult = undefined;
        try {
            parsedResult = JSON.parse(responseText);
            this.logService.trace(`[chat entitlement] sign-up: response is ${responseText}`);
        }
        catch (err) {
            const retry = await this.onUnknownSignUpError(localize('signUpInvalidResponseError', "Invalid response contents."), `[chat entitlement] sign-up: error parsing response (${err})`);
            return retry ? this.doSignUpFree(sessions) : { errorCode: 3 };
        }
        // We have made it this far, so the user either did sign-up or was signed-up already.
        // That is, because the endpoint throws in all other case according to Patrick.
        this.update({ entitlement: ChatEntitlement.Free });
        return Boolean(parsedResult?.subscribed);
    }
    async getSessions() {
        const defaultAccount = await this.defaultAccountService.getDefaultAccount();
        if (defaultAccount) {
            const sessions = await this.authenticationService.getSessions(defaultAccount.authenticationProvider.id);
            const accountSessions = sessions.filter(s => s.id === defaultAccount.sessionId);
            if (accountSessions.length) {
                return accountSessions;
            }
        }
        return [...(await this.authenticationService.getSessions(this.defaultAccountService.getDefaultAccountAuthenticationProvider().id))];
    }
    async onUnknownSignUpError(detail, logMessage) {
        this.logService.error(logMessage);
        if (!this.lifecycleService.willShutdown) {
            const { confirmed } = await this.dialogService.confirm({
                type: Severity.Error,
                message: localize('unknownSignUpError', "An error occurred while signing up for the GitHub Copilot Free plan. Would you like to try again?"),
                detail,
                primaryButton: localize('retry', "Retry")
            });
            return confirmed;
        }
        return false;
    }
    onUnprocessableSignUpError(logMessage, logDetails) {
        this.logService.error(logMessage);
        if (!this.lifecycleService.willShutdown) {
            this.dialogService.prompt({
                type: Severity.Error,
                message: localize('unprocessableSignUpError', "An error occurred while signing up for the GitHub Copilot Free plan."),
                detail: logDetails,
                buttons: [
                    {
                        label: localize('ok', "OK"),
                        run: () => { }
                    },
                    {
                        label: localize('learnMore', "Learn More"),
                        run: () => this.openerService.open(URI.parse(defaultChatAgent.upgradePlanUrl))
                    }
                ]
            });
        }
    }
    async signIn(options) {
        const defaultAccount = await this.defaultAccountService.signIn({
            additionalScopes: options?.additionalScopes,
            extraAuthorizeParameters: { get_started_with: 'copilot-vscode' },
            provider: options?.useSocialProvider
        });
        if (!defaultAccount) {
            return {};
        }
        const entitlements = await this.doResolveEntitlement(defaultAccount, CancellationToken.None);
        return { defaultAccount, entitlements };
    }
    dispose() {
        this.pendingResolveCts.dispose(true);
        super.dispose();
    }
};
ChatEntitlementRequests = __decorate([
    __param(2, ITelemetryService),
    __param(3, ILogService),
    __param(4, IRequestService),
    __param(5, IDialogService),
    __param(6, IOpenerService),
    __param(7, ILifecycleService),
    __param(8, IDefaultAccountService),
    __param(9, IAuthenticationService)
], ChatEntitlementRequests);
export { ChatEntitlementRequests };
let ChatEntitlementContext = class ChatEntitlementContext extends Disposable {
    static { ChatEntitlementContext_1 = this; }
    static { this.CHAT_ENTITLEMENT_CONTEXT_STORAGE_KEY = 'chat.setupContext'; }
    static { this.CHAT_ENTITLEMENT_CONTEXT_MIGRATED_STORAGE_KEY = 'chat.setupContext.migrated.v1'; }
    static { this.CHAT_DISABLED_CONFIGURATION_KEY = 'chat.disableAIFeatures'; }
    get state() { return this.withConfiguration(this.suspendedState ?? this._state); }
    constructor(contextKeyService, storageService, logService, configurationService, telemetryService) {
        super();
        this.storageService = storageService;
        this.logService = logService;
        this.configurationService = configurationService;
        this.telemetryService = telemetryService;
        this.suspendedState = undefined;
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this.updateBarrier = undefined;
        this.canSignUpContextKey = ChatEntitlementContextKeys.Entitlement.canSignUp.bindTo(contextKeyService);
        this.signedOutContextKey = ChatEntitlementContextKeys.Entitlement.signedOut.bindTo(contextKeyService);
        this.freeContextKey = ChatEntitlementContextKeys.Entitlement.planFree.bindTo(contextKeyService);
        this.eduContextKey = ChatEntitlementContextKeys.Entitlement.planEdu.bindTo(contextKeyService);
        this.proContextKey = ChatEntitlementContextKeys.Entitlement.planPro.bindTo(contextKeyService);
        this.proPlusContextKey = ChatEntitlementContextKeys.Entitlement.planProPlus.bindTo(contextKeyService);
        this.businessContextKey = ChatEntitlementContextKeys.Entitlement.planBusiness.bindTo(contextKeyService);
        this.enterpriseContextKey = ChatEntitlementContextKeys.Entitlement.planEnterprise.bindTo(contextKeyService);
        this.organisationsContextKey = ChatEntitlementContextKeys.Entitlement.organisations.bindTo(contextKeyService);
        this.isInternalContextKey = ChatEntitlementContextKeys.Entitlement.internal.bindTo(contextKeyService);
        this.skuContextKey = ChatEntitlementContextKeys.Entitlement.sku.bindTo(contextKeyService);
        this.completedContext = ChatEntitlementContextKeys.Setup.completed.bindTo(contextKeyService);
        this.hiddenContext = ChatEntitlementContextKeys.Setup.hidden.bindTo(contextKeyService);
        this.laterContext = ChatEntitlementContextKeys.Setup.later.bindTo(contextKeyService);
        this.installedContext = ChatEntitlementContextKeys.Setup.installed.bindTo(contextKeyService);
        this.disabledContext = ChatEntitlementContextKeys.Setup.disabled.bindTo(contextKeyService);
        this.untrustedContext = ChatEntitlementContextKeys.Setup.untrusted.bindTo(contextKeyService);
        this.registeredContext = ChatEntitlementContextKeys.Setup.registered.bindTo(contextKeyService);
        this._state = this.storageService.getObject(ChatEntitlementContext_1.CHAT_ENTITLEMENT_CONTEXT_STORAGE_KEY, 0 /* StorageScope.PROFILE */) ?? {
            entitlement: ChatEntitlement.Unknown,
            organisations: undefined,
            sku: undefined,
            copilotTrackingId: undefined
        };
        const migrated = this.storageService.getBoolean(ChatEntitlementContext_1.CHAT_ENTITLEMENT_CONTEXT_MIGRATED_STORAGE_KEY, 0 /* StorageScope.PROFILE */) === true;
        if (!migrated) {
            this.storageService.store(ChatEntitlementContext_1.CHAT_ENTITLEMENT_CONTEXT_MIGRATED_STORAGE_KEY, true, 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
            if (this._state.installed && !this._state.completed) {
                this._state.completed = true; // treat installation signal as completed signal once
                this.storageService.store(ChatEntitlementContext_1.CHAT_ENTITLEMENT_CONTEXT_STORAGE_KEY, this._state, 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
            }
        }
        this.updateContextSync();
        this.registerListeners();
    }
    registerListeners() {
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(ChatEntitlementContext_1.CHAT_DISABLED_CONFIGURATION_KEY)) {
                this.updateContext();
            }
        }));
    }
    withConfiguration(state) {
        if (this.configurationService.getValue(ChatEntitlementContext_1.CHAT_DISABLED_CONFIGURATION_KEY) === true) {
            return {
                ...state,
                hidden: true // Setting always wins: if AI is disabled, set `hidden: true`
            };
        }
        return state;
    }
    async update(context) {
        this.logService.trace(`[chat entitlement context] update(): ${JSON.stringify(context)}`);
        const oldState = JSON.stringify(this._state);
        if (typeof context.installed === 'boolean' && typeof context.disabled === 'boolean' && typeof context.untrusted === 'boolean') {
            this._state.installed = context.installed;
            this._state.disabled = context.disabled;
            this._state.untrusted = context.untrusted;
            if (context.installed && !context.disabled) {
                context.hidden = false; // treat this as a sign to make Chat visible again in case it is hidden
            }
        }
        if (typeof context.hidden === 'boolean') {
            this._state.hidden = context.hidden;
        }
        if (typeof context.later === 'boolean') {
            this._state.later = context.later;
        }
        if (typeof context.completed === 'boolean') {
            this._state.completed = context.completed;
        }
        if (typeof context.entitlement === 'number') {
            this._state.entitlement = context.entitlement;
            this._state.organisations = context.organisations;
            this._state.sku = context.sku;
            this._state.copilotTrackingId = context.copilotTrackingId;
            if (this._state.entitlement === ChatEntitlement.Free || isProUser(this._state.entitlement)) {
                this._state.registered = true;
            }
            else if (this._state.entitlement === ChatEntitlement.Available) {
                this._state.registered = false; // only reset when signed-in user can sign-up for free
            }
        }
        if (isAnonymous(this.configurationService, this._state.entitlement, this._state)) {
            this._state.sku = 'no_auth_limited_copilot'; // no-auth users have a fixed SKU
        }
        if (oldState === JSON.stringify(this._state)) {
            return; // state did not change
        }
        this.storageService.store(ChatEntitlementContext_1.CHAT_ENTITLEMENT_CONTEXT_STORAGE_KEY, {
            ...this._state,
            later: undefined // do not persist this across restarts for now
        }, 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        return this.updateContext();
    }
    async updateContext() {
        await this.updateBarrier?.wait();
        this.updateContextSync();
    }
    updateContextSync() {
        const state = this.withConfiguration(this._state);
        this.signedOutContextKey.set(state.entitlement === ChatEntitlement.Unknown);
        this.canSignUpContextKey.set(state.entitlement === ChatEntitlement.Available);
        this.freeContextKey.set(state.entitlement === ChatEntitlement.Free);
        this.eduContextKey.set(state.entitlement === ChatEntitlement.EDU);
        this.proContextKey.set(state.entitlement === ChatEntitlement.Pro);
        this.proPlusContextKey.set(state.entitlement === ChatEntitlement.ProPlus);
        this.businessContextKey.set(state.entitlement === ChatEntitlement.Business);
        this.enterpriseContextKey.set(state.entitlement === ChatEntitlement.Enterprise);
        this.organisationsContextKey.set(state.organisations);
        this.isInternalContextKey.set(Boolean(state.organisations?.some(org => org === 'github' || org === 'microsoft' || org === 'ms-copilot' || org === 'MicrosoftCopilot')));
        this.skuContextKey.set(state.sku);
        this.completedContext.set(!!state.completed);
        this.hiddenContext.set(!!state.hidden);
        this.laterContext.set(!!state.later);
        this.installedContext.set(!!state.installed);
        this.disabledContext.set(!!state.disabled);
        this.untrustedContext.set(!!state.untrusted);
        this.registeredContext.set(!!state.registered);
        this.logService.trace(`[chat entitlement context] updateContext(): ${JSON.stringify(state)}`);
        logChatEntitlements(state, this.configurationService, this.telemetryService);
        this._onDidChange.fire();
    }
    suspend() {
        this.suspendedState = { ...this._state };
        this.updateBarrier = new Barrier();
    }
    resume() {
        this.suspendedState = undefined;
        this.updateBarrier?.open();
        this.updateBarrier = undefined;
    }
};
ChatEntitlementContext = ChatEntitlementContext_1 = __decorate([
    __param(0, IContextKeyService),
    __param(1, IStorageService),
    __param(2, ILogService),
    __param(3, IConfigurationService),
    __param(4, ITelemetryService)
], ChatEntitlementContext);
export { ChatEntitlementContext };
//#endregion
registerSingleton(IChatEntitlementService, ChatEntitlementService, 0 /* InstantiationType.Eager */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEVudGl0bGVtZW50U2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLE9BQU8sTUFBTSxnREFBZ0QsQ0FBQztBQUNyRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDM0QsT0FBTyxFQUFFLGlCQUFpQixFQUFFLHVCQUF1QixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDckcsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDdkQsT0FBTyxFQUFFLFVBQVUsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRXJGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQWUsa0JBQWtCLEVBQUUsYUFBYSxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDdEgsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxlQUFlLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNwSCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDckUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxNQUFNLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDekYsT0FBTyxF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