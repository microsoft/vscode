/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

/** `accessToken` is only carried when the provider authenticates with a bearer. */
export interface IExtensionGalleryAccount {
	readonly accessToken?: string;
}

export const enum ExtensionGalleryAccountStatus {
	/** None signed in, or several with no choice made. */
	SignedOut = 'signedOut',
	Ineligible = 'ineligible',
	Eligible = 'eligible',
	/** Could not be resolved — a transient auth failure, not a sign-out. */
	Unknown = 'unknown'
}

/**
 * The authentication half of marketplace access. Implementations live in the Electron layer and
 * are supplied through {@link IExtensionGalleryAccountService.setAccountProvider}, so the service
 * itself never depends on authentication.
 */
export interface IExtensionGalleryAccountProvider {
	readonly accountStatus: ExtensionGalleryAccountStatus;
	readonly onDidChangeAccountStatus: Event<ExtensionGalleryAccountStatus>;
	readonly onDidChangeAccount: Event<void>;

	/** Never prompts. Check {@link accountStatus} for whether the account may actually be used. */
	getAccount(): Promise<IExtensionGalleryAccount | undefined>;

	/** Interactive. The provider owns account selection and how the session is obtained. */
	signIn(): Promise<void>;
}

export const IExtensionGalleryAccountService = createDecorator<IExtensionGalleryAccountService>('extensionGalleryAccountService');

/** Identity and entitlement for the Private Marketplace. Knows nothing about URLs or HTTP. */
export interface IExtensionGalleryAccountService {
	readonly _serviceBrand: undefined;

	readonly accountStatus: ExtensionGalleryAccountStatus;
	readonly onDidChangeAccountStatus: Event<ExtensionGalleryAccountStatus>;
	readonly onDidChangeAccount: Event<void>;

	/** Never prompts. Check {@link accountStatus} for whether the account may actually be used. */
	getAccount(): Promise<IExtensionGalleryAccount | undefined>;

	/** Interactive sign-in for whichever provider the deployment configured. */
	signIn(): Promise<void>;

	setAccountProvider(provider: IExtensionGalleryAccountProvider): void;
}
