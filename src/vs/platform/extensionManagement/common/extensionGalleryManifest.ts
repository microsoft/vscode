/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

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
	Unavailable = 'unavailable'
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
 * Scope for requesting tokens against the Private Marketplace's own Entra app registration.
 * Produces tokens with `aud = api://{private-marketplace-client-id}`, matching the server's
 * `Marketplace:Authorization:Entra:Audience` config.
 *
 * Do NOT use `https://marketplace.visualstudio.com/.default` — that produces
 * `aud: marketplace.visualstudio.com` and will be rejected with 401.
 *
 * `{private-marketplace-client-id}` is the Client ID from the deployment-time app registration.
 */
export const PRIVATE_MARKETPLACE_SCOPE = 'api://{private-marketplace-client-id}/access_as_user';
