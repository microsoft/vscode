/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import product from '../../../../../platform/product/common/product.js';

const defaultChat = {
	completionsRefreshTokenCommand: product.defaultChatAgent?.completionsRefreshTokenCommand ?? '',
	chatRefreshTokenCommand: product.defaultChatAgent?.chatRefreshTokenCommand ?? '',
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
}

export function refreshTokens(commandService: ICommandService): void {
	// ugly, but we need to signal to the extension that entitlements changed
	commandService.executeCommand(defaultChat.completionsRefreshTokenCommand);
	commandService.executeCommand(defaultChat.chatRefreshTokenCommand);
}
