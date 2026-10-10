/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { refineServiceDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IExtensionGalleryAuthorizationService } from '../../../../platform/extensionManagement/common/extensionGalleryAuthorization.js';

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

	/** Discovers and silently resolves the bearer required by an authentication challenge. */
	getMarketplaceAccessToken(serviceIndexUrl: string, wwwAuthenticate: string | undefined): Promise<string | undefined>;

	/** Interactive. The provider owns account selection and how the session is obtained. */
	signIn(): Promise<void>;
}

export const IExtensionGalleryAccountService = refineServiceDecorator<IExtensionGalleryAuthorizationService, IExtensionGalleryAccountService>(IExtensionGalleryAuthorizationService);

export interface IExtensionGalleryAccessResult {
	readonly status: ExtensionGalleryAccountStatus;
	readonly authorizationRevision?: number;
}

/** Identity, entitlement, and authentication for the Private Marketplace. */
export interface IExtensionGalleryAccountService extends IExtensionGalleryAuthorizationService {
	readonly _serviceBrand: undefined;

	readonly accountStatus: ExtensionGalleryAccountStatus;
	readonly onDidChangeAccountStatus: Event<ExtensionGalleryAccountStatus>;
	readonly onDidChangeAccount: Event<void>;

	/** Resolves the account verdict and publishes the authorization that request services may use. */
	resolveMarketplaceAccess(serviceIndexUrl: string): Promise<IExtensionGalleryAccessResult>;

	/** Publishes replacement authorization for a rejected request, returning its revision when available. */
	negotiateMarketplaceAccess(serviceIndexUrl: string, wwwAuthenticate?: string): Promise<number | undefined>;

	/** Clears the reported authorization if it is still current. */
	clearMarketplaceAuthorization(serviceIndexUrl: string, authorizationRevision: number): Promise<void>;

	/** Interactive sign-in for whichever provider the deployment configured. */
	signIn(): Promise<void>;

	setAccountProvider(provider: IExtensionGalleryAccountProvider): void;
}
