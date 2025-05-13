/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { SortBy, SortOrder } from '../../extensionManagement/common/extensionManagement.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IMcpServerConfiguration } from './mcpPlatformTypes.js';

export interface ILocalMcpServer {
	readonly name: string;
	readonly config: Omit<IMcpServerConfiguration, 'manifest'>;
	readonly manifest?: IMcpServerManifest;
}

export interface IMcpServerArgumentInput {
	readonly description?: string;
	readonly is_required?: boolean;
	readonly format?: 'string' | 'number' | 'boolean' | 'filepath';
	readonly value?: string;
	readonly is_secret?: boolean;
	readonly default?: string;
	readonly choices?: readonly string[];
}

export interface IMcpServerPositionalArgument extends IMcpServerArgumentInput {
	readonly type: 'positional';
}

export interface IMcpServerNamedArgument extends IMcpServerArgumentInput {
	readonly type: 'named';
	readonly name: string;
}

export interface IMcpServerTemplateArgument {
	readonly type: 'template';
	readonly name: string;
	readonly template: {
		readonly value: string;
		readonly variables?: readonly IMcpServerArgumentInput[];
	};
	readonly description?: string;
	readonly is_required?: boolean;
}

export type IMcpServerArgument =
	| IMcpServerPositionalArgument
	| IMcpServerNamedArgument
	| IMcpServerTemplateArgument;

export interface IMcpServerPackage {
	readonly name: string;
	readonly version: string;
	readonly registry_name: string;
	readonly package_arguments?: readonly IMcpServerArgument[];
	readonly runtime_arguments?: readonly IMcpServerArgument[];
	readonly environment_variables?: ReadonlyArray<IMcpServerNamedArgument | IMcpServerTemplateArgument>;
}

export interface IMcpServerRemote {
	readonly url: string;
	readonly transport_type: 'streamable' | 'sse';
	readonly headers: ReadonlyArray<IMcpServerNamedArgument | IMcpServerTemplateArgument>;
}

export interface IMcpServerManifest {
	readonly packages: readonly IMcpServerPackage[];
	readonly remotes: readonly IMcpServerRemote[];
}

export interface IGalleryMcpServer {
	readonly id: string;
	readonly name: string;
	readonly displayName: string;
	readonly url: string;
	readonly description: string;
	readonly version: string;
	readonly lastUpdated: number;
	readonly repositoryUrl: string;
	readonly manifestUrl: string;
	readonly readmeUrl?: string;
	readonly publisher?: string;
	readonly publisherDisplayName?: string;
	readonly publisherDomain?: { link: string; verified: boolean };
	readonly iconUrl?: string;
	readonly licenseUrl?: string;
	readonly installCount?: number;
	readonly rating?: number;
	readonly ratingCount?: number;
	readonly categories?: readonly string[];
	readonly tags?: readonly string[];
	readonly releaseDate?: number;
}

export interface IQueryOptions {
	text?: string;
	sortBy?: SortBy;
	sortOrder?: SortOrder;
}

export const IMcpGalleryService = createDecorator<IMcpGalleryService>('IMcpGalleryService');
export interface IMcpGalleryService {
	readonly _serviceBrand: undefined;
	query(options?: IQueryOptions, token?: CancellationToken): Promise<IGalleryMcpServer[]>;
	getManifest(extension: IGalleryMcpServer, token: CancellationToken): Promise<IMcpServerManifest>;
	getReadme(gallery: IGalleryMcpServer, token: CancellationToken): Promise<string | null>;
}

export const IMcpManagementService = createDecorator<IMcpManagementService>('IMcpManagementService');
export interface IMcpManagementService {
	readonly _serviceBrand: undefined;
	getInstalled(): Promise<ILocalMcpServer[]>;
	installFromGallery(server: IGalleryMcpServer): Promise<void>;
}

export const mcpGalleryServiceUrlConfig = 'chat.mcp.gallery.serviceUrl';
