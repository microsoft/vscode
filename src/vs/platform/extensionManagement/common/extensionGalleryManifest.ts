/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { RawContextKey } from '../../contextkey/common/contextkey.js';

/**
 * Context key exposing the effective Marketplace authentication provider (e.g. `github` or
 * `microsoft`) for `when`-clause driven welcome content. Defined here in the platform layer so
 * both the workbench service that sets it and the Extensions contribution that reads it can
 * depend on it without a service-to-contribution dependency.
 */
export const CONTEXT_MARKETPLACE_AUTH_PROVIDER = new RawContextKey<string>('marketplaceAuthProvider', '');

export const enum ExtensionGalleryResourceType {
	ExtensionQueryService = 'ExtensionQueryService',
	ExtensionLatestVersionUri = 'ExtensionLatestVersionUriTemplate',
	ExtensionStatisticsUri = 'ExtensionStatisticsUriTemplate',
	PublisherViewUri = 'PublisherViewUriTemplate',
	ExtensionDetailsViewUri = 'ExtensionDetailsViewUriTemplate',
	ExtensionRatingViewUri = 'ExtensionRatingViewUriTemplate',
	ExtensionResourceUri = 'ExtensionResourceUriTemplate',
	ContactSupportUri = 'ContactSupportUri',
	EligibilityService = 'EligibilityService',
}

export const enum Flag {
	None = 'None',
	IncludeVersions = 'IncludeVersions',
	IncludeFiles = 'IncludeFiles',
	IncludeCategoryAndTags = 'IncludeCategoryAndTags',
	IncludeSharedAccounts = 'IncludeSharedAccounts',
	IncludeVersionProperties = 'IncludeVersionProperties',
	ExcludeNonValidated = 'ExcludeNonValidated',
	IncludeInstallationTargets = 'IncludeInstallationTargets',
	IncludeAssetUri = 'IncludeAssetUri',
	IncludeStatistics = 'IncludeStatistics',
	IncludeLatestVersionOnly = 'IncludeLatestVersionOnly',
	Unpublished = 'Unpublished',
	IncludeNameConflictInfo = 'IncludeNameConflictInfo',
	IncludeLatestPrereleaseAndStableVersionOnly = 'IncludeLatestPrereleaseAndStableVersionOnly',
}

export type ExtensionGalleryManifestResource = {
	readonly id: string;
	readonly type: string;
};

export type ExtensionQueryCapabilityValue = {
	readonly name: string;
	readonly value: number;
};

export interface IExtensionGalleryManifest {
	readonly version: string;
	readonly resources: readonly ExtensionGalleryManifestResource[];
	readonly capabilities: {
		readonly extensionQuery: {
			readonly filtering?: readonly ExtensionQueryCapabilityValue[];
			readonly sorting?: readonly ExtensionQueryCapabilityValue[];
			readonly flags?: readonly ExtensionQueryCapabilityValue[];
		};
		readonly signing?: {
			readonly allPublicRepositorySigned: boolean;
			readonly allPrivateRepositorySigned?: boolean;
		};
		readonly extensions?: {
			readonly includePublicExtensions?: boolean;
			readonly includePrivateExtensions?: boolean;
		};
	};
}

export const enum ExtensionGalleryManifestStatus {
	Available = 'available',
	RequiresSignIn = 'requiresSignIn',
	AccessDenied = 'accessDenied',
	Unavailable = 'unavailable',
	/**
	 * A marketplace is configured, and the user is (or is presumed) eligible, but its
	 * gallery manifest could not be fetched — a transient network/server error. Unlike
	 * {@link Unavailable} (which also means "no gallery configured"), this state is only
	 * ever set after a failed fetch of a configured marketplace, so it is safe to surface
	 * an informative message without affecting builds that have no gallery at all.
	 */
	Unreachable = 'unreachable',
	/**
	 * The marketplace is configured for Microsoft (Entra ID) authentication, but the
	 * gallery manifest does not advertise an EligibilityService resource. Access is
	 * refused (no silent fallback to another provider) until the server is corrected.
	 */
	Misconfigured = 'misconfigured'
}

export const IExtensionGalleryManifestService = createDecorator<IExtensionGalleryManifestService>('IExtensionGalleryManifestService');

export interface IExtensionGalleryManifestService {
	readonly _serviceBrand: undefined;

	readonly extensionGalleryManifestStatus: ExtensionGalleryManifestStatus;
	readonly onDidChangeExtensionGalleryManifestStatus: Event<ExtensionGalleryManifestStatus>;
	readonly onDidChangeExtensionGalleryManifest: Event<IExtensionGalleryManifest | null>;
	getExtensionGalleryManifest(): Promise<IExtensionGalleryManifest | null>;
}

export function getExtensionGalleryManifestResourceUri(manifest: IExtensionGalleryManifest, type: string): string | undefined {
	const [name, version] = type.split('/');
	for (const resource of manifest.resources) {
		const [r, v] = resource.type.split('/');
		if (r !== name) {
			continue;
		}
		if (!version || v === version) {
			return resource.id;
		}
		break;
	}
	return undefined;
}

export const ExtensionGalleryServiceUrlConfigKey = 'extensions.gallery.serviceUrl';

export const ExtensionGalleryAuthProviderConfigKey = 'extensions.gallery.authProvider';

/**
 * Scopes requested when signing in with Microsoft (Entra ID) to establish the
 * user's identity for the Private Marketplace eligibility check.
 *
 * Only standard OpenID Connect sign-in scopes are requested — enough to obtain a
 * Microsoft session that identifies the user. This intentionally does NOT request a
 * resource-scoped token (e.g. `api://<client-id>/access_as_user`). Acquiring resource
 * tokens for Private Marketplace API calls, per the server's Protected Resource
 * Metadata (RFC 9728), is deferred to a follow-up change.
 */
export const PRIVATE_MARKETPLACE_SCOPES: string[] = ['openid', 'profile', 'email', 'offline_access'];
