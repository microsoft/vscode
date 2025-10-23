/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Event } from '../../../base/common/event.js';
import { IMarkdownString } from '../../../base/common/htmlContent.js';
import { IIterativePager } from '../../../base/common/paging.js';
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
	readonly galleryId?: string;
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
	readonly isRequired?: boolean;
	readonly format?: 'string' | 'number' | 'boolean' | 'filepath';
	readonly value?: string;
	readonly isSecret?: boolean;
	readonly default?: string;
	readonly choices?: readonly string[];
}

export interface IMcpServerVariableInput extends IMcpServerInput {
	readonly variables?: Record<string, IMcpServerInput>;
}

export interface IMcpServerPositionalArgument extends IMcpServerVariableInput {
	readonly type: 'positional';
	readonly valueHint?: string;
	readonly isRepeated?: boolean;
}

export interface IMcpServerNamedArgument extends IMcpServerVariableInput {
	readonly type: 'named';
	readonly name: string;
	readonly isRepeated?: boolean;
}

export interface IMcpServerKeyValueInput extends IMcpServerVariableInput {
	readonly name: string;
	readonly value?: string;
}

export type IMcpServerArgument = IMcpServerPositionalArgument | IMcpServerNamedArgument;

export const enum RegistryType {
	NODE = 'npm',
	PYTHON = 'pypi',
	DOCKER = 'oci',
	NUGET = 'nuget',
	MCPB = 'mcpb',
	REMOTE = 'remote'
}

export const enum TransportType {
	STDIO = 'stdio',
	STREAMABLE_HTTP = 'streamable-http',
	SSE = 'sse'
}

export interface StdioTransport {
	readonly type: TransportType.STDIO;
}

export interface StreamableHttpTransport {
	readonly type: TransportType.STREAMABLE_HTTP;
	readonly url: string;
	readonly headers?: ReadonlyArray<IMcpServerKeyValueInput>;
}

export interface SseTransport {
	readonly type: TransportType.SSE;
	readonly url: string;
	readonly headers?: ReadonlyArray<IMcpServerKeyValueInput>;
}

export type Transport = StdioTransport | StreamableHttpTransport | SseTransport;

export interface IMcpServerPackage {
	readonly registryType: RegistryType;
	readonly identifier: string;
	readonly transport: Transport;
	readonly version?: string;
	readonly registryBaseUrl?: string;
	readonly fileSha256?: string;
	readonly packageArguments?: readonly IMcpServerArgument[];
	readonly runtimeHint?: string;
	readonly runtimeArguments?: readonly IMcpServerArgument[];
	readonly environmentVariables?: ReadonlyArray<IMcpServerKeyValueInput>;
}

export interface IGalleryMcpServerConfiguration {
	readonly packages?: readonly IMcpServerPackage[];
	readonly remotes?: ReadonlyArray<SseTransport | StreamableHttpTransport>;
}

export const enum GalleryMcpServerStatus {
	Active = 'active',
	Deprecated = 'deprecated'
}

export interface IGalleryMcpServer {
	readonly name: string;
	readonly displayName: string;
	readonly description: string;
	readonly version: string;
	readonly isLatest: boolean;
	readonly status: GalleryMcpServerStatus;
	readonly id?: string;
	readonly galleryUrl?: string;
	readonly webUrl?: string;
	readonly codicon?: string;
	readonly icon?: {
		readonly dark: string;
		readonly light: string;
	};
	readonly lastUpdated?: number;
	readonly publishDate?: number;
	readonly repositoryUrl?: string;
	readonly configuration: IGalleryMcpServerConfiguration;
	readonly readmeUrl?: string;
	readonly readme?: string;
	readonly publisher: string;
	readonly publisherDisplayName?: string;
	readonly publisherUrl?: string;
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
	query(options?: IQueryOptions, token?: CancellationToken): Promise<IIterativePager<IGalleryMcpServer>>;
	getMcpServersFromGallery(infos: { name: string; id?: string }[]): Promise<IGalleryMcpServer[]>;
	getMcpServer(url: string): Promise<IGalleryMcpServer | undefined>;
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

export type McpServerConfiguration = Omit<IInstallableMcpServer, 'name'>;
export interface McpServerConfigurationParseResult {
	readonly mcpServerConfiguration: McpServerConfiguration;
	readonly notices: string[];
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

	getMcpServerConfigurationFromManifest(manifest: IGalleryMcpServerConfiguration, packageType: RegistryType): McpServerConfigurationParseResult;
}

export const IAllowedMcpServersService = createDecorator<IAllowedMcpServersService>('IAllowedMcpServersService');
export interface IAllowedMcpServersService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeAllowedMcpServers: Event<void>;
	isAllowed(mcpServer: IGalleryMcpServer | ILocalMcpServer | IInstallableMcpServer): true | IMarkdownString;
}

export const mcpAccessConfig = 'chat.mcp.access';
export const mcpGalleryServiceUrlConfig = 'chat.mcp.gallery.serviceUrl';
export const mcpGalleryServiceEnablementConfig = 'chat.mcp.gallery.enabled';
export const mcpAutoStartConfig = 'chat.mcp.autostart';

export interface IMcpGalleryConfig {
	readonly serviceUrl?: string;
	readonly enabled?: boolean;
	readonly version?: string;
}

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
