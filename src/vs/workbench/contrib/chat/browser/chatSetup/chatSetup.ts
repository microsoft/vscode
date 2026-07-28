/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import product from '../../../../../platform/product/common/product.js';
import { localize } from '../../../../../nls.js';
import { EnablementState } from '../../../../services/extensionManagement/common/extensionManagement.js';
import { IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';

const defaultChat = {
	chatExtensionId: product.defaultChatAgent?.chatExtensionId ?? '',
	chatRefreshTokenCommand: product.defaultChatAgent?.chatRefreshTokenCommand ?? '',
	providerExtensionId: product.defaultChatAgent?.providerExtensionId ?? '',
};

export type InstallChatClassification = {
	owner: 'bpasero';
	comment: 'Provides insight into chat installation.';
	installResult: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the extension was installed successfully, cancelled or failed to install.' };
	installDuration: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The duration it took to install the extension.' };
	signUpErrorCode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The error code in case of an error signing up.' };
	provider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The provider used for the chat installation.' };
};
export type InstallChatEvent = {
	installResult: 'installed' | 'alreadyInstalled' | 'cancelled' | 'failedInstall' | 'failedNotSignedIn' | 'failedSignUp' | 'failedNotTrusted' | 'failedNoSession' | 'failedMaybeLater' | 'failedEnterpriseSetup';
	installDuration: number;
	signUpErrorCode: number | undefined;
	provider: string | undefined;
};

export enum ChatSetupAnonymous {
	Disabled = 0,
	EnabledWithDialog = 1,
	EnabledWithoutDialog = 2
}

export enum ChatSetupStep {
	Initial = 1,
	SigningIn,
	Installing
}

export enum ChatSetupStrategy {
	Canceled = 0,
	DefaultSetup = 1,
	SetupWithoutEnterpriseProvider = 2,
	SetupWithEnterpriseProvider = 3,
	SetupWithGoogleProvider = 4,
	SetupWithAppleProvider = 5
}

export type ChatSetupResultValue = boolean /* success */ | undefined /* canceled */;

export interface IChatSetupResult {
	readonly success: ChatSetupResultValue;
	readonly dialogSkipped: boolean;
	readonly error?: Error;
	readonly errorAlreadyHandled?: boolean;
}

export class ChatSetupError extends Error {
	constructor(
		readonly originalError: Error,
		readonly userNotified: boolean,
	) {
		super(originalError.message, { cause: originalError });
		this.name = originalError.name;
	}
}

export interface IChatSetupRunOptions {
	readonly disableChatViewReveal?: boolean;
	readonly forceSignInDialog?: boolean;
	readonly additionalScopes?: readonly string[];
	readonly forceAnonymous?: ChatSetupAnonymous;
	readonly dialogIcon?: ThemeIcon;
	readonly dialogTitle?: string;
	readonly setupStrategy?: ChatSetupStrategy;
	readonly disableCloseButton?: boolean;
	readonly onSignInStarted?: () => void;
}

export interface IChatSetupCommandOptions extends IChatSetupRunOptions {
	readonly inputValue?: string;
	readonly returnResult?: boolean;
}

export function refreshTokens(commandService: ICommandService): void {
	// ugly, but we need to signal to the extension that entitlements changed
	commandService.executeCommand(defaultChat.chatRefreshTokenCommand).catch(() => { /* command may not be registered */ });
}

/**
 * Builds a redirect URL that GitHub will use to return the user to VS Code
 * after completing a plan upgrade. The redirect goes through `vscode.dev/redirect`
 * which triggers the native protocol handler back into the desktop app.
 *
 * @param baseUpgradeUrl The direct GitHub upgrade URL (from `resolveGitHubUrl`).
 * @param urlProtocol The VS Code URL protocol scheme (e.g. `vscode`, `vscode-insiders`, `code-oss`).
 * @param quality The product quality (`stable`, `insider`, or `undefined` for OSS).
 * @returns The upgrade URL with a `return_to` query parameter appended.
 */
export function buildUpgradeUrlWithRedirect(baseUpgradeUrl: string, urlProtocol: string, quality: string | undefined): string {
	const vscodeUri = `${urlProtocol}://${defaultChat.chatExtensionId}/upgrade-success`;
	const redirectHost = quality === 'stable' ? 'vscode.dev' : 'insiders.vscode.dev';
	const returnTo = `https://${redirectHost}/redirect?url=${encodeURIComponent(vscodeUri)}`;

	const separator = baseUpgradeUrl.includes('?') ? '&' : '?';
	return `${baseUpgradeUrl}${separator}return_to=${encodeURIComponent(returnTo)}`;
}

/**
 * Ensures the authentication provider extension is enabled.
 * If the extension is found locally but disabled, it will be
 * re-enabled and running extensions will be updated.
 *
 * @returns `true` if the extension was re-enabled, `false` otherwise.
 */
export async function maybeEnableAuthExtension(
	extensionsWorkbenchService: IExtensionsWorkbenchService,
	logService: ILogService
): Promise<boolean> {
	if (!defaultChat.providerExtensionId) {
		return false;
	}

	const providerExtension = extensionsWorkbenchService.local.find(
		e => ExtensionIdentifier.equals(e.identifier.id, defaultChat.providerExtensionId)
	);

	if (!providerExtension) {
		return false;
	}

	if (
		providerExtension.enablementState === EnablementState.DisabledGlobally ||
		providerExtension.enablementState === EnablementState.DisabledWorkspace
	) {
		logService.info(`[chat setup] auth provider extension '${defaultChat.providerExtensionId}' is disabled, re-enabling it`);
		try {
			await extensionsWorkbenchService.setEnablement([providerExtension], EnablementState.EnabledGlobally);
			await extensionsWorkbenchService.updateRunningExtensions(localize('enableAuthExtension', "Enabling GitHub Authentication"));
			return true;
		} catch (error) {
			logService.error(`[chat setup] failed to re-enable auth provider extension '${defaultChat.providerExtensionId}'`, error);
			return false;
		}
	}

	return false;
}
