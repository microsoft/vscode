/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Event } from '../../../base/common/event.js';
import { URI } from '../../../base/common/uri.js';
import { SortBy, SortOrder } from '../../extensionManagement/common/extensionManagement.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IMcpServerConfiguration } from './mcpPlatformTypes.js';

export interface ILocalMcpServer {
	readonly name: string;
	readonly config: IMcpServerConfiguration;
	readonly version: string;
	readonly location?: URI;
	readonly id?: string;
	readonly displayName?: string;
	readonly url?: string;
	readonly description?: string;
	readonly repositoryUrl?: string;
	readonly readmeUrl?: URI;
	readonly publisher?: string;
	readonly publisherDisplayName?: string;
	readonly iconUrl?: string;
	readonly manifest?: IMcpServerManifest;
}

export interface IMcpServerInput {
	readonly description?: string;
	readonly is_required?: boolean;
	readonly format?: 'string' | 'number' | 'boolean' | 'filepath';
	readonly value?: string;
	readonly is_secret?: boolean;
	readonly default?: string;
	readonly choices?: readonly string[];
}

export interface IMcpServerVariableInput extends IMcpServerInput {
	readonly variables?: Record<string, IMcpServerInput>;
}

export interface IMcpServerPositionalArgument extends IMcpServerVariableInput {
	readonly type: 'positional';
	readonly value_hint: string;
	readonly is_repeatable: boolean;
}

export interface IMcpServerNamedArgument extends IMcpServerVariableInput {
	readonly type: 'named';
	readonly name: string;
	readonly is_repeatable: boolean;
}

export interface IMcpServerKeyValueInput extends IMcpServerVariableInput {
	readonly name: string;
	readonly value: string;
}

export type IMcpServerArgument = IMcpServerPositionalArgument | IMcpServerNamedArgument;

export const enum PackageType {
	NODE = 'npm',
	DOCKER = 'docker',
	PYTHON = 'pypi',
	REMOTE = 'remote',
}

export interface IMcpServerPackage {
	readonly name: string;
	readonly version: string;
	readonly registry_name: PackageType;
	readonly package_arguments?: readonly IMcpServerArgument[];
	readonly runtime_arguments?: readonly IMcpServerArgument[];
	readonly environment_variables?: ReadonlyArray<IMcpServerKeyValueInput>;
}

export interface IMcpServerRemote {
	readonly url: string;
	readonly transport_type: 'streamable' | 'sse';
	readonly headers: ReadonlyArray<IMcpServerKeyValueInput>;
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
	readonly packageTypes: readonly PackageType[];
	readonly readmeUrl?: string;
	readonly publisher: string;
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

export interface InstallMcpServerEvent {
	readonly name: string;
	readonly source?: IGalleryMcpServer;
	readonly applicationScoped?: boolean;
	readonly workspaceScoped?: boolean;
}

export interface InstallMcpServerResult {
	readonly name: string;
	readonly source?: IGalleryMcpServer;
	readonly local?: ILocalMcpServer;
	readonly error?: Error;
	readonly applicationScoped?: boolean;
	readonly workspaceScoped?: boolean;
}

export interface UninstallMcpServerEvent {
	readonly name: string;
	readonly applicationScoped?: boolean;
	readonly workspaceScoped?: boolean;
}

export interface DidUninstallMcpServerEvent {
	readonly name: string;
	readonly error?: string;
	readonly applicationScoped?: boolean;
	readonly workspaceScoped?: boolean;
}


export const IMcpGalleryService = createDecorator<IMcpGalleryService>('IMcpGalleryService');
export interface IMcpGalleryService {
	readonly _serviceBrand: undefined;
	isEnabled(): boolean;
	query(options?: IQueryOptions, token?: CancellationToken): Promise<IGalleryMcpServer[]>;
	getManifest(extension: IGalleryMcpServer, token: CancellationToken): Promise<IMcpServerManifest>;
	getReadme(extension: IGalleryMcpServer, token: CancellationToken): Promise<string>;
}

export const IMcpManagementService = createDecorator<IMcpManagementService>('IMcpManagementService');
export interface IMcpManagementService {
	readonly _serviceBrand: undefined;
	readonly onInstallMcpServer: Event<InstallMcpServerEvent>;
	readonly onDidInstallMcpServers: Event<readonly InstallMcpServerResult[]>;
	readonly onUninstallMcpServer: Event<UninstallMcpServerEvent>;
	readonly onDidUninstallMcpServer: Event<DidUninstallMcpServerEvent>;
	getInstalled(): Promise<ILocalMcpServer[]>;
	installFromGallery(server: IGalleryMcpServer, packageType: PackageType): Promise<void>;
	uninstall(server: ILocalMcpServer): Promise<void>;
}

export const mcpGalleryServiceUrlConfig = 'chat.mcp.gallery.serviceUrl';
