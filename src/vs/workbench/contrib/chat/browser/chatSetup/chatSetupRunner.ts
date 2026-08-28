/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatSetup.css';
import { $ } from '../../../../../base/browser/dom.js';
import { Dialog, DialogContentsAlignment } from '../../../../../base/browser/ui/dialog/dialog.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Lazy } from '../../../../../base/common/lazy.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ChatMicrosoftAuthenticationEnabledSettingId } from '../../../../../platform/chat/common/chatSettings.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { createWorkbenchDialogOptions } from '../../../../browser/parts/dialogs/dialog.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import product from '../../../../../platform/product/common/product.js';
import { ITelemetryService, TelemetryLevel } from '../../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { ChatEntitlement, ChatEntitlementContext, ChatEntitlementService, IChatEntitlementService, isProUser } from '../../../../services/chat/common/chatEntitlementService.js';
import { IChatWidgetService } from '../chat.js';
import { ChatSetupController } from './chatSetupController.js';
import { IChatSetupResult, ChatSetupAnonymous, ChatSetupDialogVisibleContext, ChatSetupError, InstallChatEvent, InstallChatClassification, ChatSetupStrategy, ChatSetupResultValue, IChatSetupRunOptions } from './chatSetup.js';
import { GitHubPaths, IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { raceTimeout } from '../../../../../base/common/async.js';

const fallbackProviders = {
	default: { id: '', name: '' },
	enterprise: { id: '', name: '' },
	apple: { id: '', name: '' },
	google: { id: '', name: '' },
	microsoft: { id: '', name: '' },
};

const configuredProviders = product.defaultChatAgent?.provider;
const defaultChat = {
	chatExtensionId: product.defaultChatAgent?.chatExtensionId ?? '',
	publicCodeMatchesUrl: product.defaultChatAgent?.publicCodeMatchesUrl ?? '',
	provider: {
		default: configuredProviders?.default ?? fallbackProviders.default,
		enterprise: configuredProviders?.enterprise ?? fallbackProviders.enterprise,
		apple: configuredProviders?.apple ?? fallbackProviders.apple,
		google: configuredProviders?.google ?? fallbackProviders.google,
		microsoft: configuredProviders?.microsoft ?? fallbackProviders.microsoft,
	},
	chatRefreshTokenCommand: product.defaultChatAgent?.chatRefreshTokenCommand ?? '',
	termsStatementUrl: product.defaultChatAgent?.termsStatementUrl ?? '',
	privacyStatementUrl: product.defaultChatAgent?.privacyStatementUrl ?? ''
};

export interface IChatSetupDialogButton {
	readonly label: string;
	readonly strategy: ChatSetupStrategy;
	readonly classes?: readonly string[];
}

export interface IChatSetupDialogProviders {
	readonly default: { readonly name: string };
	readonly enterprise: { readonly name: string };
	readonly apple: { readonly name: string };
	readonly google: { readonly name: string };
	readonly microsoft: { readonly name: string };
}

export interface IChatSetupDialogFooterContent {
	readonly providerName: string;
	readonly termsStatementUrl: string;
	readonly privacyStatementUrl: string;
	readonly publicCodeMatchesUrl: string;
}

export interface IChatSetupDialogOptions {
	readonly title: string;
	readonly buttons: readonly IChatSetupDialogButton[];
	readonly icon: ThemeIcon;
	readonly disableCloseButton: boolean;
	readonly footer: string;
	readonly extraClasses?: readonly string[];
	readonly renderFooter?: (container: HTMLElement) => IDisposable | undefined;
}

export class ChatSetupDialog extends Disposable {

	private readonly dialog: Dialog;

	constructor(
		container: HTMLElement,
		private readonly options: IChatSetupDialogOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@ILayoutService layoutService: IWorkbenchLayoutService,
		@IHostService hostService: IHostService,
		@IMarkdownRendererService markdownRendererService: IMarkdownRendererService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		const dialogVisible = ChatSetupDialogVisibleContext.bindTo(contextKeyService);
		dialogVisible.set(true);
		this._register(toDisposable(() => dialogVisible.reset()));

		this.dialog = this._register(new Dialog(
			container,
			options.title,
			options.buttons.map(button => button.label),
			createWorkbenchDialogOptions({
				type: 'none',
				extraClasses: ['chat-setup-dialog', ...(options.extraClasses ?? [])],
				detail: ' ',
				icon: options.icon,
				alignment: DialogContentsAlignment.Vertical,
				cancelId: options.buttons.length,
				disableCloseButton: options.disableCloseButton,
				renderFooter: footer => {
					const element = footer.appendChild($('.chat-setup-dialog-footer'));
					const renderedFooter = this._register(markdownRendererService.render(new MarkdownString(options.footer, { isTrusted: true })));
					element.appendChild($('p', undefined, renderedFooter.element));
					const customFooter = options.renderFooter?.(element);
					if (customFooter) {
						this._register(customFooter);
					}
				},
				buttonOptions: options.buttons.map(button => {
					const classes = button.classes;
					return classes ? { styleButton: control => control.element.classList.add(...classes) } : undefined;
				})
			}, keybindingService, layoutService, hostService)
		));
	}

	async show(): Promise<ChatSetupStrategy> {
		const { button } = await this.dialog.show();
		return this.options.buttons[button]?.strategy ?? ChatSetupStrategy.Canceled;
	}
}

export async function showChatSetupDialogWithCancellation(
	dialog: Pick<ChatSetupDialog, 'show' | 'dispose'>,
	cancellationToken: CancellationToken | undefined,
	onDidDismissDialog?: () => void,
): Promise<ChatSetupStrategy> {
	let canceled = false;
	const cancellationListener = cancellationToken?.onCancellationRequested(() => {
		canceled = true;
		dialog.dispose();
	});
	try {
		if (cancellationToken?.isCancellationRequested) {
			canceled = true;
			dialog.dispose();
		}
		const strategy = canceled ? ChatSetupStrategy.Canceled : await dialog.show();
		if (!canceled && strategy === ChatSetupStrategy.Canceled) {
			onDidDismissDialog?.();
		}
		return strategy;
	} finally {
		cancellationListener?.dispose();
		dialog.dispose();
	}
}

/**
 * Whether the sign-in dialog should offer "Continue with Microsoft". The dialog treats it as one
 * more provider button, exactly like Google and Apple: it goes to whichever host the default
 * account provider points at, and a host that cannot broker a Microsoft identity refuses it in the
 * authentication extension rather than here.
 */
export function shouldShowMicrosoftProvider(configurationService: IConfigurationService): boolean {
	return configurationService.getValue<boolean>(ChatMicrosoftAuthenticationEnabledSettingId) === true;
}

export function getChatSetupDialogButtons(entitlement: ChatEntitlement, options: IChatSetupRunOptions | undefined, enterpriseAuthentication: boolean, showMicrosoftProvider: boolean, providers: IChatSetupDialogProviders = defaultChat.provider): IChatSetupDialogButton[] {
	const button = (label: string, strategy: ChatSetupStrategy, ...classes: string[]): IChatSetupDialogButton => ({ label, strategy, classes });

	if (!options?.forceAnonymous && (entitlement === ChatEntitlement.Unknown || options?.forceSignInDialog)) {
		const defaultProviderButton = button(localize('continueWith', "Continue with {0}", providers.default.name), ChatSetupStrategy.SetupWithoutEnterpriseProvider, 'continue-button', 'default');
		const defaultProviderLink = button(defaultProviderButton.label, defaultProviderButton.strategy, 'link-button');
		const enterpriseProviderButton = button(localize('continueWith', "Continue with {0}", providers.enterprise.name), ChatSetupStrategy.SetupWithEnterpriseProvider, 'continue-button', 'default');
		const enterpriseProviderLink = button(enterpriseProviderButton.label, enterpriseProviderButton.strategy, 'link-button');
		const googleProviderButton = button(localize('continueWith', "Continue with {0}", providers.google.name), ChatSetupStrategy.SetupWithGoogleProvider, 'continue-button', 'google');
		const appleProviderButton = button(localize('continueWith', "Continue with {0}", providers.apple.name), ChatSetupStrategy.SetupWithAppleProvider, 'continue-button', 'apple');
		const microsoftProviderButton = button(localize('continueWith', "Continue with {0}", providers.microsoft.name), ChatSetupStrategy.SetupWithMicrosoftProvider, 'continue-button', 'microsoft');

		const socialProviderButtons = [googleProviderButton, appleProviderButton, ...(showMicrosoftProvider ? [microsoftProviderButton] : [])];
		const providerButtons = enterpriseAuthentication
			? [enterpriseProviderButton, ...socialProviderButtons, defaultProviderLink]
			: [defaultProviderButton, ...socialProviderButtons, enterpriseProviderLink];
		return options?.allowContinueWithoutSignIn
			? [...providerButtons, button(localize('continueWithoutSigningIn', "Continue Without Signing In"), ChatSetupStrategy.Canceled, 'link-button')]
			: providerButtons;
	}

	return [button(localize('setupAIButton', "Use AI Features"), ChatSetupStrategy.DefaultSetup)];
}

export function getChatSetupDialogFooter(
	forceAnonymous: ChatSetupAnonymous | undefined,
	telemetryLevel: TelemetryLevel,
	settingsUrl: string,
	content: IChatSetupDialogFooterContent = {
		providerName: defaultChat.provider.default.name,
		termsStatementUrl: defaultChat.termsStatementUrl,
		privacyStatementUrl: defaultChat.privacyStatementUrl,
		publicCodeMatchesUrl: defaultChat.publicCodeMatchesUrl,
	}
): string {
	if (forceAnonymous || telemetryLevel === TelemetryLevel.NONE) {
		return localize({ key: 'settingsAnonymous', comment: ['{Locked="["}', '{Locked="]({1})"}', '{Locked="]({2})"}'] }, "By continuing, you agree to {0}'s [Terms]({1}) and [Privacy Statement]({2}).", content.providerName, content.termsStatementUrl, content.privacyStatementUrl);
	}

	return localize({ key: 'settings', comment: ['{Locked="["}', '{Locked="]({1})"}', '{Locked="]({2})"}', '{Locked="]({4})"}', '{Locked="]({5})"}'] }, "By continuing, you agree to {0}'s [Terms]({1}) and [Privacy Statement]({2}). {3} Copilot may show [public code]({4}) suggestions and use your data to improve the product. You can change these [settings]({5}) anytime.", content.providerName, content.termsStatementUrl, content.privacyStatementUrl, content.providerName, content.publicCodeMatchesUrl, settingsUrl);
}

export class ChatSetup {

	private static instance: ChatSetup | undefined = undefined;
	static getInstance(instantiationService: IInstantiationService, context: ChatEntitlementContext, controller: Lazy<ChatSetupController>): ChatSetup {
		let instance = ChatSetup.instance;
		if (!instance) {
			instance = ChatSetup.instance = instantiationService.createInstance(ChatSetup, context, controller);
		}

		return instance;
	}

	private pendingRun: Promise<IChatSetupResult> | undefined = undefined;

	private skipDialogOnce = false;

	constructor(
		private readonly context: ChatEntitlementContext,
		private readonly controller: Lazy<ChatSetupController>,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ILayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IChatEntitlementService private readonly chatEntitlementService: ChatEntitlementService,
		@ILogService private readonly logService: ILogService,
		@IChatWidgetService private readonly widgetService: IChatWidgetService,
		@IWorkspaceTrustRequestService private readonly workspaceTrustRequestService: IWorkspaceTrustRequestService,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) { }

	skipDialog(): void {
		this.skipDialogOnce = true;
	}

	async run(options?: IChatSetupRunOptions): Promise<IChatSetupResult> {
		if (this.pendingRun) {
			return this.pendingRun;
		}

		this.pendingRun = this.doRun(options);

		try {
			return await this.pendingRun;
		} finally {
			this.pendingRun = undefined;
		}
	}

	private async doRun(options?: IChatSetupRunOptions): Promise<IChatSetupResult> {
		this.context.update({ later: false });

		const dialogSkipped = this.skipDialogOnce;
		this.skipDialogOnce = false;
		if (options?.cancellationToken?.isCancellationRequested) {
			return { dialogSkipped, success: undefined };
		}

		const wasTrusted = this.workspaceTrustManagementService.isWorkspaceTrusted();
		const trusted = await this.workspaceTrustRequestService.requestWorkspaceTrust({
			message: localize('chatWorkspaceTrust', "AI features are currently only supported in trusted workspaces.")
		});
		if (!trusted) {
			this.context.update({ later: true });
			this.telemetryService.publicLog2<InstallChatEvent, InstallChatClassification>('commandCenter.chatInstall', { installResult: 'failedNotTrusted', installDuration: 0, signUpErrorCode: undefined, provider: undefined });

			return { dialogSkipped, success: undefined /* canceled */ };
		}
		if (options?.cancellationToken?.isCancellationRequested) {
			return { dialogSkipped, success: undefined };
		}

		if (!wasTrusted) {
			// Trust was just granted: the chat extension is (re)activating, and the
			// entitlement only resolves once it is up. Wait for activation so the
			// dialog decision below isn't made from a stale "signed out" entitlement
			// (which would briefly show the sign-in dialog to an already-signed-in
			// user). Bounded, so a genuinely signed-out / slow case still proceeds.
			await this.whenChatExtensionActivated();
		}

		let setupStrategy: ChatSetupStrategy;
		if (options?.setupStrategy !== undefined) {
			setupStrategy = options.setupStrategy; // caller provided a specific strategy, skip dialog
		} else if (!options?.forceSignInDialog && (dialogSkipped || isProUser(this.chatEntitlementService.entitlement) || this.chatEntitlementService.entitlement === ChatEntitlement.Free)) {
			setupStrategy = ChatSetupStrategy.DefaultSetup; // existing pro/free users setup without a dialog
		} else if (options?.forceAnonymous === ChatSetupAnonymous.EnabledWithoutDialog) {
			setupStrategy = ChatSetupStrategy.DefaultSetup; // anonymous setup without a dialog
		} else {
			setupStrategy = await this.showDialog(options);
		}

		if (setupStrategy === ChatSetupStrategy.DefaultSetup && this.defaultAccountService.getDefaultAccountAuthenticationProvider().enterprise) {
			setupStrategy = ChatSetupStrategy.SetupWithEnterpriseProvider; // users with a configured provider go through provider setup
		}

		let success: ChatSetupResultValue = undefined;
		let setupError: Error | undefined;
		let errorAlreadyHandled = false;
		const setupCancellation = new CancellationTokenSource(options?.cancellationToken);
		try {
			if (setupStrategy !== ChatSetupStrategy.Canceled) {
				options?.onSignInStarted?.(() => setupCancellation.cancel());
			}

			if (setupStrategy !== ChatSetupStrategy.Canceled && !options?.disableChatViewReveal) {
				// Show the chat view now to better indicate progress
				// while installing the extension or returning from sign in
				this.widgetService.revealWidget();
			}

			switch (setupStrategy) {
				case ChatSetupStrategy.SetupWithEnterpriseProvider:
					success = await this.controller.value.setupWithProvider({ useEnterpriseProvider: true, useSocialProvider: undefined, additionalScopes: options?.additionalScopes, forceAnonymous: options?.forceAnonymous, cancellationToken: setupCancellation.token });
					break;
				case ChatSetupStrategy.SetupWithoutEnterpriseProvider:
					success = await this.controller.value.setupWithProvider({ useEnterpriseProvider: false, useSocialProvider: undefined, additionalScopes: options?.additionalScopes, forceAnonymous: options?.forceAnonymous, cancellationToken: setupCancellation.token });
					break;
				case ChatSetupStrategy.SetupWithAppleProvider:
					success = await this.controller.value.setupWithProvider({ useEnterpriseProvider: false, useSocialProvider: 'apple', additionalScopes: options?.additionalScopes, forceAnonymous: options?.forceAnonymous, cancellationToken: setupCancellation.token });
					break;
				case ChatSetupStrategy.SetupWithGoogleProvider:
					success = await this.controller.value.setupWithProvider({ useEnterpriseProvider: false, useSocialProvider: 'google', additionalScopes: options?.additionalScopes, forceAnonymous: options?.forceAnonymous, cancellationToken: setupCancellation.token });
					break;
				case ChatSetupStrategy.SetupWithMicrosoftProvider:
					success = await this.controller.value.setupWithProvider({ useEnterpriseProvider: false, useSocialProvider: 'microsoft', additionalScopes: options?.additionalScopes, forceAnonymous: options?.forceAnonymous, cancellationToken: setupCancellation.token });
					break;
				case ChatSetupStrategy.DefaultSetup:
					success = await this.controller.value.setup({ ...options, forceAnonymous: options?.forceAnonymous, cancellationToken: setupCancellation.token });
					break;
				case ChatSetupStrategy.Canceled:
					this.context.update({ later: true });
					this.telemetryService.publicLog2<InstallChatEvent, InstallChatClassification>('commandCenter.chatInstall', { installResult: 'failedMaybeLater', installDuration: 0, signUpErrorCode: undefined, provider: undefined });
					break;
			}
		} catch (error) {
			this.logService.error(`[chat setup] Error during setup: ${toErrorMessage(error)}`);
			success = false;
			if (error instanceof ChatSetupError) {
				setupError = error.originalError;
				errorAlreadyHandled = error.userNotified;
			} else {
				setupError = error instanceof Error ? error : new Error(toErrorMessage(error));
			}
		} finally {
			setupCancellation.dispose();
		}

		if (success) {
			this.context.update({ completed: true });
		}

		return { success, dialogSkipped, error: setupError, errorAlreadyHandled };
	}

	/**
	 * Whether the default chat extension has finished activating. `activationTimes`
	 * is only set once activation completes, so `undefined` means "not yet active".
	 */
	private isChatExtensionActivated(): boolean {
		const status = this.extensionService.getExtensionsStatus();
		for (const id of Object.keys(status)) {
			if (ExtensionIdentifier.equals(id, defaultChat.chatExtensionId)) {
				return status[id].activationTimes !== undefined;
			}
		}
		return false;
	}

	/**
	 * Resolves once the default chat extension has finished activating (bounded by
	 * a timeout). Detection relies only on the extension lifecycle, so it never
	 * touches the user's authentication session.
	 */
	private async whenChatExtensionActivated(timeoutMs = 10000): Promise<void> {
		if (!defaultChat.chatExtensionId || this.isChatExtensionActivated()) {
			return;
		}

		const store = new DisposableStore();
		try {
			await raceTimeout(new Promise<void>(resolve => {
				const check = () => {
					if (this.isChatExtensionActivated()) {
						resolve();
					}
				};
				store.add(this.extensionService.onDidChangeExtensionsStatus(check));
				this.extensionService.whenInstalledExtensionsRegistered().then(check);
			}), timeoutMs);
		} finally {
			store.dispose();
		}
	}

	private async showDialog(options?: IChatSetupRunOptions): Promise<ChatSetupStrategy> {
		if (options?.cancellationToken?.isCancellationRequested) {
			return ChatSetupStrategy.Canceled;
		}
		const enterpriseAuthentication = this.defaultAccountService.getDefaultAccountAuthenticationProvider().enterprise;
		const showMicrosoftProvider = shouldShowMicrosoftProvider(this.configurationService);
		const buttons = getChatSetupDialogButtons(this.context.state.entitlement, options, enterpriseAuthentication, showMicrosoftProvider);
		const dialog = this.instantiationService.createInstance(ChatSetupDialog, this.layoutService.activeContainer, {
			title: this.getDialogTitle(options),
			buttons,
			icon: options?.dialogIcon ?? Codicon.copilotLarge,
			disableCloseButton: options?.disableCloseButton ?? false,
			footer: getChatSetupDialogFooter(options?.forceAnonymous, this.telemetryService.telemetryLevel, this.defaultAccountService.resolveGitHubUrl(GitHubPaths.copilotSettings)),
			extraClasses: options?.dialogExtraClasses,
			renderFooter: options?.renderDialogFooter,
		});
		return showChatSetupDialogWithCancellation(dialog, options?.cancellationToken, options?.onDidDismissDialog);
	}

	private getDialogTitle(options?: IChatSetupRunOptions): string {
		if (options?.dialogTitle) {
			return options.dialogTitle;
		}

		if (this.chatEntitlementService.anonymous) {
			if (options?.forceAnonymous) {
				return localize('startUsing', "Start using AI Features");
			} else {
				return localize('enableMore', "Enable more AI features");
			}
		}

		if (this.context.state.entitlement === ChatEntitlement.Unknown || options?.forceSignInDialog) {
			return localize('signIn', "Sign in to use GitHub Copilot");
		}

		return localize('startUsing', "Start using AI Features");
	}

}

//#endregion

export function refreshTokens(commandService: ICommandService): void {
	// ugly, but we need to signal to the extension that entitlements changed
	commandService.executeCommand(defaultChat.chatRefreshTokenCommand);
}
