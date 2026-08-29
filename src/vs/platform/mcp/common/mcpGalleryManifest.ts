/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const enum McpGalleryResourceType {
	McpServersQueryService = 'McpServersQueryService',
	McpServerWebUri = 'McpServerWebUriTemplate',
	McpServerVersionUri = 'McpServerVersionUriTemplate',
	McpServerIdUri = 'McpServerIdUriTemplate',
	McpServerLatestVersionUri = 'McpServerLatestVersionUriTemplate',
	McpServerNamedResourceUri = 'McpServerNamedResourceUriTemplate',
	PublisherUriTemplate = 'PublisherUriTemplate',
	ContactSupportUri = 'ContactSupportUri',
	PrivacyPolicyUri = 'PrivacyPolicyUri',
	TermsOfServiceUri = 'TermsOfServiceUri',
	ReportUri = 'ReportUri',
}

export type McpGalleryManifestResource = {
	readonly id: string;
	readonly type: string;
};

export interface IMcpGalleryManifest {
	readonly version: string;
	readonly url: string;
	readonly resources: readonly McpGalleryManifestResource[];
}

export const enum McpGalleryManifestStatus {
	Available = 'available',
	Unavailable = 'unavailable'
}

export const IMcpGalleryManifestService = createDecorator<IMcpGalleryManifestService>('IMcpGalleryManifestService');

export interface IMcpGalleryManifestService {
	readonly _serviceBrand: undefined;

	readonly mcpGalleryManifestStatus: McpGalleryManifestStatus;
	readonly onDidChangeMcpGalleryManifestStatus: Event<McpGalleryManifestStatus>;
	readonly onDidChangeMcpGalleryManifest: Event<IMcpGalleryManifest | null>;
	getMcpGalleryManifest(): Promise<IMcpGalleryManifest | null>;
}

export function getMcpGalleryManifestResourceUri(manifest: IMcpGalleryManifest, type: string): string | undefined {
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
