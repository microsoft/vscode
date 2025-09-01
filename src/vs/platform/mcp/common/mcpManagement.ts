/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Event } from '../../../base/common/event.js';
import { IMarkdownString } from '../../../base/common/htmlContent.js';
import { IPager } from '../../../base/common/paging.js';
import { URI } from '../../../base/common/uri.js';
import { SortBy, SortOrder } from '../../extensionManagement/common/extensionManagement.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IMcpServerConfiguration, IMcpServerVariable } from './mcpPlatformTypes.js';

export type InstallSource = 'gallery' | 'local';

export interface ILocalMcpServer {
	readonly name: string;
	readonly config: IMcpServerConfiguration;
	readonly version?: string;
	readonly mcpResource: URI;
	readonly location?: URI;
	readonly displayName?: string;
	readonly description?: string;
	readonly galleryUrl?: string;
	readonly repositoryUrl?: string;
	readonly readmeUrl?: URI;
	readonly publisher?: string;
	readonly publisherDisplayName?: string;
	readonly icon?: {
		readonly dark: string;
		readonly light: string;
	};
	readonly codicon?: string;
	readonly manifest?: IGalleryMcpServerConfiguration;
	readonly source: InstallSource;
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

export const enum RegistryType {
	NODE = 'npm',
	PYTHON = 'pypi',
	DOCKER = 'docker-hub',
	NUGET = 'nuget',
	REMOTE = 'remote',
	MCPB = 'mcpb',
}

export interface IMcpServerPackage {
	readonly registry_type: RegistryType;
	readonly registry_base_url?: string;
	readonly identifier: string;
	readonly version: string;
	readonly file_sha256?: string;
	readonly runtime_hint?: string;
	readonly package_arguments?: readonly IMcpServerArgument[];
	readonly runtime_arguments?: readonly IMcpServerArgument[];
	readonly environment_variables?: ReadonlyArray<IMcpServerKeyValueInput>;
}

export interface IMcpServerRemote {
	readonly url: string;
	readonly transport_type?: 'streamable' | 'sse';
	readonly headers?: ReadonlyArray<IMcpServerKeyValueInput>;
}

export interface IGalleryMcpServerConfiguration {
	readonly packages?: readonly IMcpServerPackage[];
	readonly remotes?: readonly IMcpServerRemote[];
}

export const enum GalleryMcpServerStatus {
	Active = 'active',
	Deprecated = 'deprecated'
}

export interface IGalleryMcpServer {
	readonly id: string;
	readonly name: string;
	readonly displayName: string;
	readonly description: string;
	readonly version: string;
	readonly isLatest: boolean;
	readonly status: GalleryMcpServerStatus;
	readonly url?: string;
	readonly codicon?: string;
	readonly icon?: {
		readonly dark: string;
		readonly light: string;
	};
	readonly lastUpdated?: number;
	readonly publishDate?: number;
	readonly releaseDate?: number;
	readonly repositoryUrl?: string;
	readonly configuration?: IGalleryMcpServerConfiguration;
	readonly readmeUrl?: string;
	readonly publisher: string;
	readonly publisherDisplayName?: string;
	readonly publisherDomain?: { link: string; verified: boolean };
	readonly ratingCount?: number;
	readonly topics?: readonly string[];
	readonly license?: string;
	readonly starsCount?: number;
}

export interface IQueryOptions {
	text?: string;
	sortBy?: SortBy;
	sortOrder?: SortOrder;
}

export const IMcpGalleryService = createDecorator<IMcpGalleryService>('IMcpGalleryService');
export interface IMcpGalleryService {
	readonly _serviceBrand: undefined;
	isEnabled(): boolean;
	query(options?: IQueryOptions, token?: CancellationToken): Promise<IPager<IGalleryMcpServer>>;
	getMcpServersFromVSCodeGallery(servers: string[]): Promise<IGalleryMcpServer[]>;
	getMcpServers(urls: string[]): Promise<IGalleryMcpServer[]>;
	getMcpServerConfiguration(extension: IGalleryMcpServer, token: CancellationToken): Promise<IGalleryMcpServerConfiguration>;
	getReadme(extension: IGalleryMcpServer, token: CancellationToken): Promise<string>;
}

export interface InstallMcpServerEvent {
	readonly name: string;
	readonly mcpResource: URI;
	readonly source?: IGalleryMcpServer;
}

export interface InstallMcpServerResult {
	readonly name: string;
	readonly mcpResource: URI;
	readonly source?: IGalleryMcpServer;
	readonly local?: ILocalMcpServer;
	readonly error?: Error;
}

export interface UninstallMcpServerEvent {
	readonly name: string;
	readonly mcpResource: URI;
}

export interface DidUninstallMcpServerEvent {
	readonly name: string;
	readonly mcpResource: URI;
	readonly error?: string;
}

export type InstallOptions = {
	packageType?: RegistryType;
	mcpResource?: URI;
};

export type UninstallOptions = {
	mcpResource?: URI;
};

export interface IInstallableMcpServer {
	readonly name: string;
	readonly config: IMcpServerConfiguration;
	readonly inputs?: IMcpServerVariable[];
}

export const IMcpManagementService = createDecorator<IMcpManagementService>('IMcpManagementService');
export interface IMcpManagementService {
	readonly _serviceBrand: undefined;
	readonly onInstallMcpServer: Event<InstallMcpServerEvent>;
	readonly onDidInstallMcpServers: Event<readonly InstallMcpServerResult[]>;
	readonly onDidUpdateMcpServers: Event<readonly InstallMcpServerResult[]>;
	readonly onUninstallMcpServer: Event<UninstallMcpServerEvent>;
	readonly onDidUninstallMcpServer: Event<DidUninstallMcpServerEvent>;
	getInstalled(mcpResource?: URI): Promise<ILocalMcpServer[]>;
	canInstall(server: IGalleryMcpServer | IInstallableMcpServer): true | IMarkdownString;
	install(server: IInstallableMcpServer, options?: InstallOptions): Promise<ILocalMcpServer>;
	installFromGallery(server: IGalleryMcpServer, options?: InstallOptions): Promise<ILocalMcpServer>;
	updateMetadata(local: ILocalMcpServer, server: IGalleryMcpServer, profileLocation?: URI): Promise<ILocalMcpServer>;
	uninstall(server: ILocalMcpServer, options?: UninstallOptions): Promise<void>;

	getMcpServerConfigurationFromManifest(manifest: IGalleryMcpServerConfiguration, packageType: RegistryType): Omit<IInstallableMcpServer, 'name'>;
}

export const IAllowedMcpServersService = createDecorator<IAllowedMcpServersService>('IAllowedMcpServersService');
export interface IAllowedMcpServersService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeAllowedMcpServers: Event<void>;
	isAllowed(mcpServer: IGalleryMcpServer | ILocalMcpServer | IInstallableMcpServer): true | IMarkdownString;
}

export const mcpAccessConfig = 'chat.mcp.access';
export const mcpGalleryServiceUrlConfig = 'chat.mcp.gallery.serviceUrl';
export const mcpAutoStartConfig = 'chat.mcp.autostart';

export const enum McpAutoStartValue {
	Never = 'never',
	OnlyNew = 'onlyNew',
	NewAndOutdated = 'newAndOutdated',
}

export const enum McpAccessValue {
	None = 'none',
	Registry = 'registry',
	All = 'all',
}
