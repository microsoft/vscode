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
var ChatSetup_1;
import './media/chatSetup.css';
import { $ } from '../../../../../base/browser/dom.js';
import { Dialog, DialogContentsAlignment } from '../../../../../base/browser/ui/dialog/dialog.js';
import { coalesce } from '../../../../../base/common/arrays.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { localize } from '../../../../../nls.js';
import { createWorkbenchDialogOptions } from '../../../../browser/parts/dialogs/dialog.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import product from '../../../../../platform/product/common/product.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceTrustRequestService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { ChatEntitlement, IChatEntitlementService, isProUser } from '../../../../services/chat/common/chatEntitlementService.js';
import { IChatWidgetService } from '../chat.js';
import { ChatSetupAnonymous, ChatSetupStrategy } from './chatSetup.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IHostService } from '../../../../services/host/browser/host.js';
const defaultChat = {
    publicCodeMatchesUrl: product.defaultChatAgent?.publicCodeMatchesUrl ?? '',
    provider: product.defaultChatAgent?.provider ?? { default: { id: '', name: '' }, enterprise: { id: '', name: '' }, apple: { id: '', name: '' }, google: { id: '', name: '' } },
    manageSettingsUrl: product.defaultChatAgent?.manageSettingsUrl ?? '',
    completionsRefreshTokenCommand: product.defaultChatAgent?.completionsRefreshTokenCommand ?? '',
    chatRefreshTokenCommand: product.defaultChatAgent?.chatRefreshTokenCommand ?? '',
    termsStatementUrl: product.defaultChatAgent?.termsStatementUrl ?? '',
    privacyStatementUrl: product.defaultChatAgent?.privacyStatementUrl ?? ''
};
let ChatSetup = class ChatSetup {
    static { ChatSetup_1 = this; }
    static { this.instance = undefined; }
    static getInstance(instantiationService, context, controller) {
        let instance = ChatSetup_1.instance;
        if (!instance) {
            instance = ChatSetup_1.instance = instantiationService.invokeFunction(accessor => {
                return new ChatSetup_1(context, controller, accessor.get(ITelemetryService), accessor.get(IWorkbenchLayoutService), accessor.get(IKeybindingService), accessor.get(IChatEntitlementService), accessor.get(ILogService), accessor.get(IChatWidgetService), accessor.get(IWorkspaceTrustRequestService), accessor.get(IMarkdownRendererService), accessor.get(IDefaultAccountService), accessor.get(IHostService));
            });
        }
        return instance;
    }
    constructor(context, controller, telemetryService, layoutService, keybindingService, chatEntitlementService, logService, widgetService, workspaceTrustRequestService, markdownRendererService, defaultAccountService, hostService) {
        this.context = context;
        this.controller = controller;
        this.telemetryService = telemetryService;
        this.layoutService = layoutService;
        this.keybindingService = keybindingService;
        this.chatEntitlementService = chatEntitlementService;
        this.logService = logService;
        this.widgetService = widgetService;
        this.workspaceTrustRequestService = workspaceTrustRequestService;
        this.markdownRendererService = markdownRendererService;
        this.defaultAccountService = defaultAccountService;
        this.hostService = hostService;
        this.pendingRun = undefined;
        this.skipDialogOnce = false;
    }
    skipDialog() {
        this.skipDialogOnce = true;
    }
    async run(options) {
        if (this.pendingRun) {
            return this.pendingRun;
        }
        this.pendingRun = this.doRun(options);
        try {
            return await this.pendingRun;
        }
        finally {
            this.pendingRun = undefined;
        }
    }
    async doRun(options) {
        this.context.update({ later: false });
        const dialogSkipped = this.skipDialogOnce;
        this.skipDialogOnce = false;
        const trusted = await this.workspaceTrustRequestService.requestWorkspaceTrust({
            message: localize('chatWorkspaceTrust', "AI features are currently only supported in trusted workspaces.")
        });
        if (!trusted) {
            this.context.update({ later: true });
            this.telemetryService.publicLog2('commandCenter.chatInstall', { installResult: 'failedNotTrusted', installDuration: 0, signUpErrorCode: undefined, provider: undefined });
            return { dialogSkipped, success: undefined /* canceled */ };
        }
        let setupStrategy;
        if (options?.setupStrategy !== undefined) {
            setupStrategy = options.setupStrategy; // caller provided a specific strategy, skip dialog
        }
        else if (!options?.forceSignInDialog && (dialogSkipped || isProUser(this.chatEntitlementService.entitlement) || this.chatEntitlementService.entitlement === ChatEntitlement.Free)) {
            setupStrategy = ChatSetupStrategy.DefaultSetup; // existing pro/free users setup without a dialog
        }
        else if (options?.forceAnonymous === ChatSetupAnonymous.EnabledWithoutDialog) {
            setupStrategy = ChatSetupStrategy.DefaultSetup; // anonymous setup without a dialog
        }
        else {
            setupStrategy = await this.showDialog(options);
        }
        if (setupStrategy === ChatSetupStrategy.DefaultSetup && this.defaultAccountService.getDefaultAccountAuthenticationProvider().enterprise) {
            setupStrategy = ChatSetupStrategy.SetupWithEnterpriseProvider; // users with a configured provider go through provider setup
        }
        if (setupStrategy !== ChatSetupStrategy.Canceled && !options?.disableChatViewReveal) {
            // Show the chat view now to better indicate progress
            // while installing the extension or returning from sign in
            this.widgetService.revealWidget();
        }
        let success = undefined;
        try {
            switch (setupStrategy) {
                case ChatSetupStrategy.SetupWithEnterpriseProvider:
                    success = await this.controller.value.setupWithProvider({ useEnterpriseProvider: true, useSocialProvider: undefined, additionalScopes: options?.additionalScopes, forceAnonymous: options?.forceAnonymous });
                    break;
                case ChatSetupStrategy.SetupWithoutEnterpriseProvider:
                    success = await this.controller.value.setupWithProvider({ useEnterpriseProvider: false, useSocialProvider: undefined, additionalScopes: options?.additionalScopes, forceAnonymous: options?.forceAnonymous });
                    break;
                case ChatSetupStrategy.SetupWithAppleProvider:
                    success = await this.controller.value.setupWithProvider({ useEnterpriseProvider: false, useSocialProvider: 'apple', additionalScopes: options?.additionalScopes, forceAnonymous: options?.forceAnonymous });
                    break;
                case ChatSetupStrategy.SetupWithGoogleProvider:
                    success = await this.controller.value.setupWithProvider({ useEnterpriseProvider: false, useSocialProvider: 'google', additionalScopes: options?.additionalScopes, forceAnonymous: options?.forceAnonymous });
                    break;
                case ChatSetupStrategy.DefaultSetup:
                    success = await this.controller.value.setup({ ...options, forceAnonymous: options?.forceAnonymous });
                    break;
                case ChatSetupStrategy.Canceled:
                    this.context.update({ later: true });
                    this.telemetryService.publicLog2('commandCenter.chatInstall', { installResult: 'failedMaybeLater', installDuration: 0, signUpErrorCode: undefined, provider: undefined });
                    break;
            }
        }
        catch (error) {
            this.logService.error(`[chat setup] Error during setup: ${toErrorMessage(error)}`);
            success = false;
        }
        if (success) {
            this.context.update({ completed: true });
        }
        return { success, dialogSkipped };
    }
    async showDialog(options) {
        const disposables = new DisposableStore();
        const buttons = this.getButtons(options);
        const dialog = disposables.add(new Dialog(this.layoutService.activeContainer, this.getDialogTitle(options), buttons.map(button => button[0]), createWorkbenchDialogOptions({
            type: 'none',
            extraClasses: ['chat-setup-dialog'],
            detail: ' ', // workaround allowing us to render the message in large
            icon: options?.dialogIcon ?? Codicon.copilotLarge,
            alignment: DialogContentsAlignment.Vertical,
            cancelId: buttons.length,
            disableCloseButton: false,
            renderFooter: footer => footer.appendChild(this.createDialogFooter(disposables, options)),
            buttonOptions: buttons.map(button => button[2])
        }, this.keybindingService, this.layoutService, this.hostService)));
        const { button } = await dialog.show();
        disposables.dispose();
        return buttons[button]?.[1] ?? ChatSetupStrategy.Canceled;
    }
    getButtons(options) {
        const styleButton = (...classes) => ({ styleButton: (button) => button.element.classList.add(...classes) });
        let buttons;
        if (!options?.forceAnonymous && (this.context.state.entitlement === ChatEntitlement.Unknown || options?.forceSignInDialog)) {
            const defaultProviderButton = [localize('continueWith', "Continue with {0}", defaultChat.provider.default.name), ChatSetupStrategy.SetupWithoutEnterpriseProvider, styleButton('continue-button', 'default')];
            const defaultProviderLink = [defaultProviderButton[0], defaultProviderButton[1], styleButton('link-button')];
            const enterpriseProviderButton = [localize('continueWith', "Continue with {0}", defaultChat.provider.enterprise.name), ChatSetupStrategy.SetupWithEnterpriseProvider, styleButton('continue-button', 'default')];
            const enterpriseProviderLink = [enterpriseProviderButton[0], enterpriseProviderButton[1], styleButton('link-button')];
            const googleProviderButton = [localize('continueWith', "Continue with {0}", defaultChat.provider.google.name), ChatSetupStrategy.SetupWithGoogleProvider, styleButton('continue-button', 'google')];
            const appleProviderButton = [localize('continueWith', "Continue with {0}", defaultChat.provider.apple.name), ChatSetupStrategy.SetupWithAppleProvider, styleButton('continue-button', 'apple')];
            if (!this.defaultAccountService.getDefaultAccountAuthenticationProvider().enterprise) {
                buttons = coalesce([
                    defaultProviderButton,
                    googleProviderButton,
                    appleProviderButton,
                    enterpriseProviderLink
                ]);
            }
            else {
                buttons = coalesce([
                    enterpriseProviderButton,
                    googleProviderButton,
                    appleProviderButton,
                    defaultProviderLink
                ]);
            }
        }
        else {
            buttons = [[localize('setupAIButton', "Use AI Features"), ChatSetupStrategy.DefaultSetup, undefined]];
        }
        return buttons;
    }
    getDialogTitle(options) {
        if (options?.dialogTitle) {
            return options.dialogTitle;
        }
        if (this.chatEntitlementService.anonymous) {
            if (options?.forceAnonymous) {
                return localize('startUsing', "Start using AI Features");
            }
            else {
                return localize('enableMore', "Enable more AI features");
            }
        }
        if (this.context.state.entitlement === ChatEntitlement.Unknown || options?.forceSignInDialog) {
            return localize('signIn', "Sign in to use AI Features");
        }
        return localize('startUsing', "Start using AI Features");
    }
    createDialogFooter(disposables, options) {
        const element = $('.chat-setup-dialog-footer');
        let footer;
        if (options?.forceAnonymous || this.telemetryService.telemetryLevel === 0 /* TelemetryLevel.NONE */) {
            footer = localize({ key: 'settingsAnonymous', comment: ['{Locked="["}', '{Locked="]({1})"}', '{Locked="]({2})"}'] }, "By continuing, you agree to {0}'s [Terms]({1}) and [Privacy Statement]({2}).", defaultChat.provider.default.name, defaultChat.termsStatementUrl, defaultChat.privacyStatementUrl);
        }
        else {
            footer = localize({ key: 'settings', comment: ['{Locked="["}', '{Locked="]({1})"}', '{Locked="]({2})"}', '{Locked="]({4})"}', '{Locked="]({5})"}'] }, "By continuing, you agree to {0}'s [Terms]({1}) and [Privacy Statement]({2}). {3} Copilot may show [public code]({4}) suggestions and use your data to improve the product. You can change these [settings]({5}) anytime.", defaultChat.provider.default.name, defaultChat.termsStatementUrl, defaultChat.privacyStatementUrl, defaultChat.provider.default.name, defaultChat.publicCodeMatchesUrl, defaultChat.manageSettingsUrl);
        }
        element.appendChild($('p', undefined, disposables.add(this.markdownRendererService.render(new MarkdownString(footer, { isTrusted: true }))).element));
        return element;
    }
};
ChatSetup = ChatSetup_1 = __decorate([
    __param(2, ITelemetryService),
    __param(3, ILayoutService),
    __param(4, IKeybindingService),
    __param(5, IChatEntitlementService),
    __param(6, ILogService),
    __param(7, IChatWidgetService),
    __param(8, IWorkspaceTrustRequestService),
    __param(9, IMarkdownRendererService),
    __param(10, IDefaultAccountService),
    __param(11, IHostService)
], ChatSetup);
export { ChatSetup };
//#endregion
export function refreshTokens(commandService) {
    // ugly, but we need to signal to the extension that entitlements changed
    commandService.executeCommand(defaultChat.completionsRefreshTokenCommand);
    commandService.executeCommand(defaultChat.chatRefreshTokenCommand);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFNldHVwUnVubmVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXRTZXR1cC9jaGF0U2V0dXBSdW5uZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sdUJBQXVCLENBQUM7QUFDL0IsT0FBTyxFQUFFLENBQUMsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBRXZELE9BQU8sRUFBRSxNQUFNLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNsRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDaEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBRWpFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFFM0UsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBQ3hHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUVqRCxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUUzRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUM3RixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0seURBQXlELENBQUM7QUFDekYsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3hFLE9BQU8sT0FBTyxNQUFNLG1EQUFtRCxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxpQkFBaUIsRUFBa0IsTUFBTSx1REFBdUQsQ0FBQztBQUMxRyxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUMzRyxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMvRixPQUFPLEVBQUUsZUFBZSxFQUFrRCx1QkFBdUIsRUFBRSxTQUFTLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNqTCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFFaEQsT0FBTyxFQUFvQixrQkFBa0IsRUFBK0MsaUJBQWlCLEVBQXdCLE1BQU0sZ0JBQWdCLENBQUM7QUFDNUosT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0saUVBQWlFLENBQUM7QUFDekcsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBRXpFLE1BQU0sV0FBVyxHQUFHO0lBQ25CLG9CQUFvQixFQUFFLE9BQU8sQ0FBQyxnQkFBZ0IsRUFBRSxvQkFBb0IsSUFBSSxFQUFFO0lBQzFFLFFBQVEsRUFBRSxPQUFPLENBQUMsZ0JBQWdCLEVBQUUsUUFBUSxJQUFJLEVBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLEVBQUUsVUFBVSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLEVBQUUsTUFBTSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLEVBQUU7SUFDOUssaUJBQWlCLEVBQUUsT0FBTyxDQUFDLGdCQUFnQixFQUFFLGlCQUFpQixJQUFJLEVBQUU7SUFDcEUsOEJBQThCLEVBQUUsT0FBTyxDQUFDLGdCQUFnQixFQUFFLDhCQUE4QixJQUFJLEVBQUU7SUFDOUYsdUJBQXVCLEVBQUUsT0FBTyxDQUFDLGdCQUFnQixFQUFFLHVCQUF1QixJQUFJLEVBQUU7SUFDaEYsaUJBQWlCLEVBQUUsT0FBTyxDQUFDLGdCQUFnQixFQUFFLGlCQUFpQixJQUFJLEVBQUU7SUFDcEUsbUJBQW1CLEVBQUUsT0FBTyxDQUFDLGdCQUFnQixFQUFFLG1CQUFtQixJQUFJLEVBQUU7Q0FDeEUsQ0FBQztBQUVLLElBQU0sU0FBUyxHQUFmLE1BQU0sU0FBUzs7YUFFTixhQUFRLEdBQTBCLFNBQVMsQUFBbkMsQ0FBb0M7SUFDM0QsTUFBTSxDQUFDLFdBQVcsQ0FBQyxvQkFBMkMsRUFBRSxPQUErQixFQUFFLFVBQXFDO1FBQ3JJLElBQUksUUFBUSxHQUFHLFdBQVMsQ0FBQyxRQUFRLENBQUM7UUFDbEMsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ2YsUUFBUSxHQUFHLFdBQVMsQ0FBQyxRQUFRLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLFFBQVEsQ0FBQyxFQUFFO2dCQUM5RSxPQUFPLElBQUksV0FBUyxDQUFDLE9BQU8sRUFBRSxVQUFVLEVBQUUsUUFBUSxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxHQUFHLENBQUMsdUJBQXVCLENBQUMsRUFBRSxRQUFRLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDLEVBQUUsUUFBUSxDQUFDLEdBQUcsQ0FBQyx1QkFBdUIsQ0FBMkIsRUFBRSxRQUFRLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsRUFBRSxRQUFRLENBQUMsR0FBRyxDQUFDLDZCQUE2QixDQUFDLEVBQUUsUUFBUSxDQUFDLEdBQUcsQ0FBQyx3QkFBd0IsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxHQUFHLENBQUMsc0JBQXNCLENBQUMsRUFBRSxRQUFRLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUM7WUFDMWEsQ0FBQyxDQUFDLENBQUM7UUFDSixDQUFDO1FBRUQsT0FBTyxRQUFRLENBQUM7SUFDakIsQ0FBQztJQU1ELFlBQ2tCLE9BQStCLEVBQy9CLFVBQXFDLEVBQ25DLGdCQUFvRCxFQUN2RCxhQUF1RCxFQUNuRCxpQkFBc0QsRUFDakQsc0JBQStELEVBQzNFLFVBQXdDLEVBQ2pDLGFBQWtELEVBQ3ZDLDRCQUE0RSxFQUNqRix1QkFBa0UsRUFDcEUscUJBQThELEVBQ3hFLFdBQTBDO1FBWHZDLFlBQU8sR0FBUCxPQUFPLENBQXdCO1FBQy9CLGVBQVUsR0FBVixVQUFVLENBQTJCO1FBQ2xCLHFCQUFnQixHQUFoQixnQkFBZ0IsQ0FBbUI7UUFDdEMsa0JBQWEsR0FBYixhQUFhLENBQXlCO1FBQ2xDLHNCQUFpQixHQUFqQixpQkFBaUIsQ0FBb0I7UUFDaEMsMkJBQXNCLEdBQXRCLHNCQUFzQixDQUF3QjtRQUMxRCxlQUFVLEdBQVYsVUFBVSxDQUFhO1FBQ2hCLGtCQUFhLEdBQWIsYUFBYSxDQUFvQjtRQUN0QixpQ0FBNEIsR0FBNUIsNEJBQTRCLENBQStCO1FBQ2hFLDRCQUF1QixHQUF2Qix1QkFBdUIsQ0FBMEI7UUFDbkQsMEJBQXFCLEdBQXJCLHFCQUFxQixDQUF3QjtRQUN2RCxnQkFBVyxHQUFYLFdBQVcsQ0FBYztRQWhCakQsZUFBVSxHQUEwQyxTQUFTLENBQUM7UUFFOUQsbUJBQWMsR0FBRyxLQUFLLENBQUM7SUFlM0IsQ0FBQztJQUVMLFVBQVU7UUFDVCxJQUFJLENBQUMsY0FBYyxHQUFHLElBQUksQ0FBQztJQUM1QixDQUFDO0lBRUQsS0FBSyxDQUFDLEdBQUcsQ0FBQyxPQUFzTztRQUMvTyxJQUFJLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUNyQixPQUFPLElBQUksQ0FBQyxVQUFVLENBQUM7UUFDeEIsQ0FBQztRQUVELElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUV0QyxJQUFJLENBQUM7WUFDSixPQUFPLE1BQU0sSUFBSSxDQUFDLFVBQVUsQ0FBQztRQUM5QixDQUFDO2dCQUFTLENBQUM7WUFDVixJQUFJLENBQUMsVUFBVSxHQUFHLFNBQVMsQ0FBQztRQUM3QixDQUFDO0lBQ0YsQ0FBQztJQUVPLEtBQUssQ0FBQyxLQUFLLENBQUMsT0FBc087UUFDelAsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQztRQUV0QyxNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDO1FBQzFDLElBQUksQ0FBQyxjQUFjLEdBQUcsS0FBSyxDQUFDO1FBRTVCLE1BQU0sT0FBTyxHQUFHLE1BQU0sSUFBSSxDQUFDLDRCQUE0QixDQUFDLHFCQUFxQixDQUFDO1lBQzdFLE9BQU8sRUFBRSxRQUFRLENBQUMsb0JBQW9CLEVBQUUsaUVBQWlFLENBQUM7U0FDMUcsQ0FBQyxDQUFDO1FBQ0gsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ2QsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztZQUNyQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsVUFBVSxDQUE4QywyQkFBMkIsRUFBRSxFQUFFLGFBQWEsRUFBRSxrQkFBa0IsRUFBRSxlQUFlLEVBQUUsQ0FBQyxFQUFFLGVBQWUsRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUM7WUFFdk4sT0FBTyxFQUFFLGFBQWEsRUFBRSxPQUFPLEVBQUUsU0FBUyxDQUFDLGNBQWMsRUFBRSxDQUFDO1FBQzdELENBQUM7UUFFRCxJQUFJLGFBQWdDLENBQUM7UUFDckMsSUFBSSxPQUFPLEVBQUUsYUFBYSxLQUFLLFNBQVMsRUFBRSxDQUFDO1lBQzFDLGFBQWEsR0FBRyxPQUFPLENBQUMsYUFBYSxDQUFDLENBQUMsbURBQW1EO1FBQzNGLENBQUM7YUFBTSxJQUFJLENBQUMsT0FBTyxFQUFFLGlCQUFpQixJQUFJLENBQUMsYUFBYSxJQUFJLFNBQVMsQ0FBQyxJQUFJLENBQUMsc0JBQXNCLENBQUMsV0FBVyxDQUFDLElBQUksSUFBSSxDQUFDLHNCQUFzQixDQUFDLFdBQVcsS0FBSyxlQUFlLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUNyTCxhQUFhLEdBQUcsaUJBQWlCLENBQUMsWUFBWSxDQUFDLENBQUMsaURBQWlEO1FBQ2xHLENBQUM7YUFBTSxJQUFJLE9BQU8sRUFBRSxjQUFjLEtBQUssa0JBQWtCLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztZQUNoRixhQUFhLEdBQUcsaUJBQWlCLENBQUMsWUFBWSxDQUFDLENBQUMsbUNBQW1DO1FBQ3BGLENBQUM7YUFBTSxDQUFDO1lBQ1AsYUFBYSxHQUFHLE1BQU0sSUFBSSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNoRCxDQUFDO1FBRUQsSUFBSSxhQUFhLEtBQUssaUJBQWlCLENBQUMsWUFBWSxJQUFJLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyx1Q0FBdUMsRUFBRSxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQ3pJLGFBQWEsR0FBRyxpQkFBaUIsQ0FBQywyQkFBMkIsQ0FBQyxDQUFDLDZEQUE2RDtRQUM3SCxDQUFDO1FBRUQsSUFBSSxhQUFhLEtBQUssaUJBQWlCLENBQUMsUUFBUSxJQUFJLENBQUMsT0FBTyxFQUFFLHFCQUFxQixFQUFFLENBQUM7WUFDckYscURBQXFEO1lBQ3JELDJEQUEyRDtZQUMzRCxJQUFJLENBQUMsYUFBYSxDQUFDLFlBQVksRUFBRSxDQUFDO1FBQ25DLENBQUM7UUFFRCxJQUFJLE9BQU8sR0FBeUIsU0FBUyxDQUFDO1FBQzlDLElBQUksQ0FBQztZQUNKLFFBQVEsYUFBYSxFQUFFLENBQUM7Z0JBQ3ZCLEtBQUssaUJBQWlCLENBQUMsMkJBQTJCO29CQUNqRCxPQUFPLEdBQUcsTUFBTSxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFLHFCQUFxQixFQUFFLElBQUksRUFBRSxpQkFBaUIsRUFBRSxTQUFTLEVBQUUsZ0JBQWdCLEVBQUUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLGNBQWMsRUFBRSxPQUFPLEVBQUUsY0FBYyxFQUFFLENBQUMsQ0FBQztvQkFDN00sTUFBTTtnQkFDUCxLQUFLLGlCQUFpQixDQUFDLDhCQUE4QjtvQkFDcEQsT0FBTyxHQUFHLE1BQU0sSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsaUJBQWlCLENBQUMsRUFBRSxxQkFBcUIsRUFBRSxLQUFLLEVBQUUsaUJBQWlCLEVBQUUsU0FBUyxFQUFFLGdCQUFnQixFQUFFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxjQUFjLEVBQUUsT0FBTyxFQUFFLGNBQWMsRUFBRSxDQUFDLENBQUM7b0JBQzlNLE1BQU07Z0JBQ1AsS0FBSyxpQkFBaUIsQ0FBQyxzQkFBc0I7b0JBQzVDLE9BQU8sR0FBRyxNQUFNLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLGlCQUFpQixDQUFDLEVBQUUscUJBQXFCLEVBQUUsS0FBSyxFQUFFLGlCQUFpQixFQUFFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsY0FBYyxFQUFFLE9BQU8sRUFBRSxjQUFjLEVBQUUsQ0FBQyxDQUFDO29CQUM1TSxNQUFNO2dCQUNQLEtBQUssaUJBQWlCLENBQUMsdUJBQXVCO29CQUM3QyxPQUFPLEdBQUcsTUFBTSxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFLHFCQUFxQixFQUFFLEtBQUssRUFBRSxpQkFBaUIsRUFBRSxRQUFRLEVBQUUsZ0JBQWdCLEVBQUUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLGNBQWMsRUFBRSxPQUFPLEVBQUUsY0FBYyxFQUFFLENBQUMsQ0FBQztvQkFDN00sTUFBTTtnQkFDUCxLQUFLLGlCQUFpQixDQUFDLFlBQVk7b0JBQ2xDLE9BQU8sR0FBRyxNQUFNLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxFQUFFLEdBQUcsT0FBTyxFQUFFLGNBQWMsRUFBRSxPQUFPLEVBQUUsY0FBYyxFQUFFLENBQUMsQ0FBQztvQkFDckcsTUFBTTtnQkFDUCxLQUFLLGlCQUFpQixDQUFDLFFBQVE7b0JBQzlCLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7b0JBQ3JDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLENBQThDLDJCQUEyQixFQUFFLEVBQUUsYUFBYSxFQUFFLGtCQUFrQixFQUFFLGVBQWUsRUFBRSxDQUFDLEVBQUUsZUFBZSxFQUFFLFNBQVMsRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQztvQkFDdk4sTUFBTTtZQUNSLENBQUM7UUFDRixDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNoQixJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxvQ0FBb0MsY0FBYyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNuRixPQUFPLEdBQUcsS0FBSyxDQUFDO1FBQ2pCLENBQUM7UUFFRCxJQUFJLE9BQU8sRUFBRSxDQUFDO1lBQ2IsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUMxQyxDQUFDO1FBRUQsT0FBTyxFQUFFLE9BQU8sRUFBRSxhQUFhLEVBQUUsQ0FBQztJQUNuQyxDQUFDO0lBRU8sS0FBSyxDQUFDLFVBQVUsQ0FBQyxPQUE0SDtRQUNwSixNQUFNLFdBQVcsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBRTFDLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFekMsTUFBTSxNQUFNLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLE1BQU0sQ0FDeEMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxlQUFlLEVBQ2xDLElBQUksQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLEVBQzVCLE9BQU8sQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFDaEMsNEJBQTRCLENBQUM7WUFDNUIsSUFBSSxFQUFFLE1BQU07WUFDWixZQUFZLEVBQUUsQ0FBQyxtQkFBbUIsQ0FBQztZQUNuQyxNQUFNLEVBQUUsR0FBRyxFQUFFLHdEQUF3RDtZQUNyRSxJQUFJLEVBQUUsT0FBTyxFQUFFLFVBQVUsSUFBSSxPQUFPLENBQUMsWUFBWTtZQUNqRCxTQUFTLEVBQUUsdUJBQXVCLENBQUMsUUFBUTtZQUMzQyxRQUFRLEVBQUUsT0FBTyxDQUFDLE1BQU07WUFDeEIsa0JBQWtCLEVBQUUsS0FBSztZQUN6QixZQUFZLEVBQUUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxXQUFXLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDekYsYUFBYSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7U0FDL0MsRUFBRSxJQUFJLENBQUMsaUJBQWlCLEVBQUUsSUFBSSxDQUFDLGFBQWEsRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDLENBQ2hFLENBQUMsQ0FBQztRQUVILE1BQU0sRUFBRSxNQUFNLEVBQUUsR0FBRyxNQUFNLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUN2QyxXQUFXLENBQUMsT0FBTyxFQUFFLENBQUM7UUFFdEIsT0FBTyxPQUFPLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxpQkFBaUIsQ0FBQyxRQUFRLENBQUM7SUFDM0QsQ0FBQztJQUVPLFVBQVUsQ0FBQyxPQUE4RTtRQUVoRyxNQUFNLFdBQVcsR0FBRyxDQUFDLEdBQUcsT0FBaUIsRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUFFLFdBQVcsRUFBRSxDQUFDLE1BQWUsRUFBRSxFQUFFLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLEdBQUcsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBRS9ILElBQUksT0FBa0MsQ0FBQztRQUN2QyxJQUFJLENBQUMsT0FBTyxFQUFFLGNBQWMsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLFdBQVcsS0FBSyxlQUFlLENBQUMsT0FBTyxJQUFJLE9BQU8sRUFBRSxpQkFBaUIsQ0FBQyxFQUFFLENBQUM7WUFDNUgsTUFBTSxxQkFBcUIsR0FBdUIsQ0FBQyxRQUFRLENBQUMsY0FBYyxFQUFFLG1CQUFtQixFQUFFLFdBQVcsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFLGlCQUFpQixDQUFDLDhCQUE4QixFQUFFLFdBQVcsQ0FBQyxpQkFBaUIsRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDO1lBQ2xPLE1BQU0sbUJBQW1CLEdBQXVCLENBQUMscUJBQXFCLENBQUMsQ0FBQyxDQUFDLEVBQUUscUJBQXFCLENBQUMsQ0FBQyxDQUFDLEVBQUUsV0FBVyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUM7WUFFakksTUFBTSx3QkFBd0IsR0FBdUIsQ0FBQyxRQUFRLENBQUMsY0FBYyxFQUFFLG1CQUFtQixFQUFFLFdBQVcsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxFQUFFLGlCQUFpQixDQUFDLDJCQUEyQixFQUFFLFdBQVcsQ0FBQyxpQkFBaUIsRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDO1lBQ3JPLE1BQU0sc0JBQXNCLEdBQXVCLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxDQUFDLEVBQUUsd0JBQXdCLENBQUMsQ0FBQyxDQUFDLEVBQUUsV0FBVyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUM7WUFFMUksTUFBTSxvQkFBb0IsR0FBdUIsQ0FBQyxRQUFRLENBQUMsY0FBYyxFQUFFLG1CQUFtQixFQUFFLFdBQVcsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLGlCQUFpQixDQUFDLHVCQUF1QixFQUFFLFdBQVcsQ0FBQyxpQkFBaUIsRUFBRSxRQUFRLENBQUMsQ0FBQyxDQUFDO1lBQ3hOLE1BQU0sbUJBQW1CLEdBQXVCLENBQUMsUUFBUSxDQUFDLGNBQWMsRUFBRSxtQkFBbUIsRUFBRSxXQUFXLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRSxpQkFBaUIsQ0FBQyxzQkFBc0IsRUFBRSxXQUFXLENBQUMsaUJBQWlCLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQztZQUVwTixJQUFJLENBQUMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLHVDQUF1QyxFQUFFLENBQUMsVUFBVSxFQUFFLENBQUM7Z0JBQ3RGLE9BQU8sR0FBRyxRQUFRLENBQUM7b0JBQ2xCLHFCQUFxQjtvQkFDckIsb0JBQW9CO29CQUNwQixtQkFBbUI7b0JBQ25CLHNCQUFzQjtpQkFDdEIsQ0FBQyxDQUFDO1lBQ0osQ0FBQztpQkFBTSxDQUFDO2dCQUNQLE9BQU8sR0FBRyxRQUFRLENBQUM7b0JBQ2xCLHdCQUF3QjtvQkFDeEIsb0JBQW9CO29CQUNwQixtQkFBbUI7b0JBQ25CLG1CQUFtQjtpQkFDbkIsQ0FBQyxDQUFDO1lBQ0osQ0FBQztRQUNGLENBQUM7YUFBTSxDQUFDO1lBQ1AsT0FBTyxHQUFHLENBQUMsQ0FBQyxRQUFRLENBQUMsZUFBZSxFQUFFLGlCQUFpQixDQUFDLEVBQUUsaUJBQWlCLENBQUMsWUFBWSxFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQUM7UUFDdkcsQ0FBQztRQUVELE9BQU8sT0FBTyxDQUFDO0lBQ2hCLENBQUM7SUFFTyxjQUFjLENBQUMsT0FBb0c7UUFDMUgsSUFBSSxPQUFPLEVBQUUsV0FBVyxFQUFFLENBQUM7WUFDMUIsT0FBTyxPQUFPLENBQUMsV0FBVyxDQUFDO1FBQzVCLENBQUM7UUFFRCxJQUFJLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUMzQyxJQUFJLE9BQU8sRUFBRSxjQUFjLEVBQUUsQ0FBQztnQkFDN0IsT0FBTyxRQUFRLENBQUMsWUFBWSxFQUFFLHlCQUF5QixDQUFDLENBQUM7WUFDMUQsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLE9BQU8sUUFBUSxDQUFDLFlBQVksRUFBRSx5QkFBeUIsQ0FBQyxDQUFDO1lBQzFELENBQUM7UUFDRixDQUFDO1FBRUQsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxXQUFXLEtBQUssZUFBZSxDQUFDLE9BQU8sSUFBSSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsQ0FBQztZQUM5RixPQUFPLFFBQVEsQ0FBQyxRQUFRLEVBQUUsNEJBQTRCLENBQUMsQ0FBQztRQUN6RCxDQUFDO1FBRUQsT0FBTyxRQUFRLENBQUMsWUFBWSxFQUFFLHlCQUF5QixDQUFDLENBQUM7SUFDMUQsQ0FBQztJQUVPLGtCQUFrQixDQUFDLFdBQTRCLEVBQUUsT0FBaUQ7UUFDekcsTUFBTSxPQUFPLEdBQUcsQ0FBQyxDQUFDLDJCQUEyQixDQUFDLENBQUM7UUFHL0MsSUFBSSxNQUFjLENBQUM7UUFDbkIsSUFBSSxPQUFPLEVBQUUsY0FBYyxJQUFJLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxjQUFjLGdDQUF3QixFQUFFLENBQUM7WUFDN0YsTUFBTSxHQUFHLFFBQVEsQ0FBQyxFQUFFLEdBQUcsRUFBRSxtQkFBbUIsRUFBRSxPQUFPLEVBQUUsQ0FBQyxjQUFjLEVBQUUsbUJBQW1CLEVBQUUsbUJBQW1CLENBQUMsRUFBRSxFQUFFLDhFQUE4RSxFQUFFLFdBQVcsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxXQUFXLENBQUMsaUJBQWlCLEVBQUUsV0FBVyxDQUFDLG1CQUFtQixDQUFDLENBQUM7UUFDelMsQ0FBQzthQUFNLENBQUM7WUFDUCxNQUFNLEdBQUcsUUFBUSxDQUFDLEVBQUUsR0FBRyxFQUFFLFVBQVUsRUFBRSxPQUFPLEVBQUUsQ0FBQyxjQUFjLEVBQUUsbUJBQW1CLEVBQUUsbUJBQW1CLEVBQUUsbUJBQW1CLEVBQUUsbUJBQW1CLENBQUMsRUFBRSxFQUFFLDBOQUEwTixFQUFFLFdBQVcsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxXQUFXLENBQUMsaUJBQWlCLEVBQUUsV0FBVyxDQUFDLG1CQUFtQixFQUFFLFdBQVcsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxXQUFXLENBQUMsb0JBQW9CLEVBQUUsV0FBVyxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFDMWpCLENBQUM7UUFDRCxPQUFPLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsU0FBUyxFQUFFLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLHVCQUF1QixDQUFDLE1BQU0sQ0FBQyxJQUFJLGNBQWMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztRQUV0SixPQUFPLE9BQU8sQ0FBQztJQUNoQixDQUFDOztBQTdOVyxTQUFTO0lBcUJuQixXQUFBLGlCQUFpQixDQUFBO0lBQ2pCLFdBQUEsY0FBYyxDQUFBO0lBQ2QsV0FBQSxrQkFBa0IsQ0FBQTtJQUNsQixXQUFBLHVCQUF1QixDQUFBO0lBQ3ZCLFdBQUEsV0FBVyxDQUFBO0lBQ1gsV0FBQSxrQkFBa0IsQ0FBQTtJQUNsQixXQUFBLDZCQUE2QixDQUFBO0lBQzdCLFdBQUEsd0JBQXdCLENBQUE7SUFDeEIsWUFBQSxzQkFBc0IsQ0FBQTtJQUN0QixZQUFBLFlBQVksQ0FBQTtHQTlCRixTQUFTLENBOE5yQjs7QUFFRCxZQUFZO0FBRVosTUFBTSxVQUFVLGFBQWEsQ0FBQyxjQUErQjtJQUM1RCx5RUFBeUU7SUFDekUsY0FBYyxDQUFDLGNBQWMsQ0FBQyxXQUFXLENBQUMsOEJBQThCLENBQUMsQ0FBQztJQUMxRSxjQUFjLENBQUMsY0FBYyxDQUFDLFdBQVcsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO0FBQ3BFLENBQUMifQ==