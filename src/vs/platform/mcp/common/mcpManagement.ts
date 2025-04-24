/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { SortBy, SortOrder } from '../../extensionManagement/common/extensionManagement.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IMcpServerManifest } from './mcpPlatformTypes.js';

export interface ILocalMcpServer {
	readonly name: string;
	readonly id?: string;
	readonly manifest: IMcpServerManifest;
	readonly publisherDisplayName?: string;
}

export interface IGalleryMcpServer {
	readonly id: string;
	readonly name: string;
	readonly displayName: string;
	readonly url: string;
	readonly description: string;
	readonly version: string;
	readonly iconUrl: string;
	readonly codicon?: string;
	readonly manifestUrl: string;
	readonly readmeUrl: string;
	readonly repositoryUrl?: string;
	readonly licenseUrl?: string;
	readonly changeLogUrl?: string;
	readonly publisher: string;
	readonly publisherDisplayName: string;
	readonly publisherDomain?: { link: string; verified: boolean };
	readonly installCount: number;
	readonly rating: number;
	readonly ratingCount: number;
	readonly categories: readonly string[];
	readonly tags: readonly string[];
	readonly releaseDate: number;
	readonly lastUpdated: number;
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
}

export const IMcpManagementService = createDecorator<IMcpManagementService>('IMcpManagementService');
export interface IMcpManagementService {
	readonly _serviceBrand: undefined;
	getInstalled(): Promise<ILocalMcpServer[]>;
	installFromGallery(server: IGalleryMcpServer): Promise<void>;
}
