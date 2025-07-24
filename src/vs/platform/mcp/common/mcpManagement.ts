/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Event } from '../../../base/common/event.js';
import { IMarkdownString } from '../../../base/common/htmlContent.js';
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
	readonly url?: string;
	readonly description?: string;
	readonly repositoryUrl?: string;
	readonly readmeUrl?: URI;
	readonly publisher?: string;
	readonly publisherDisplayName?: string;
	readonly icon?: {
		readonly dark: string;
		readonly light: string;
	};
	readonly codicon?: string;
	readonly manifest?: IMcpServerManifest;
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

export const enum PackageType {
	NODE = 'npm',
	DOCKER = 'docker',
	PYTHON = 'pypi',
	NUGET = 'nuget',
	REMOTE = 'remote',
}

export interface IMcpServerPackage {
	readonly name: string;
	readonly version?: string;
	readonly registry_name: PackageType;
	readonly package_arguments?: readonly IMcpServerArgument[];
	readonly runtime_arguments?: readonly IMcpServerArgument[];
	readonly environment_variables?: ReadonlyArray<IMcpServerKeyValueInput>;
}

export interface IMcpServerRemote {
	readonly url: string;
	readonly transport_type?: 'streamable' | 'sse';
	readonly headers?: ReadonlyArray<IMcpServerKeyValueInput>;
}

export interface IMcpServerManifest {
	readonly packages?: readonly IMcpServerPackage[];
	readonly remotes?: readonly IMcpServerRemote[];
}

export interface IGalleryMcpServer {
	readonly id: string;
	readonly name: string;
	readonly displayName: string;
	readonly url?: string;
	readonly icon?: {
		readonly dark: string;
		readonly light: string;
	};
	readonly description: string;
	readonly version?: string;
	readonly lastUpdated?: number;
	readonly repositoryUrl?: string;
	readonly manifestUrl?: string;
	readonly manifest?: IMcpServerManifest;
	readonly packageTypes: readonly PackageType[];
	readonly readmeUrl?: string;
	readonly publisher: string;
	readonly publisherDisplayName?: string;
	readonly publisherDomain?: { link: string; verified: boolean };
	readonly codicon?: string;
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
	isEnabled(): boolean;
	query(options?: IQueryOptions, token?: CancellationToken): Promise<IGalleryMcpServer[]>;
	getMcpServers(servers: string[]): Promise<IGalleryMcpServer[]>;
	getManifest(extension: IGalleryMcpServer, token: CancellationToken): Promise<IMcpServerManifest>;
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
	packageType?: PackageType;
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
}

export const IAllowedMcpServersService = createDecorator<IAllowedMcpServersService>('IAllowedMcpServersService');
export interface IAllowedMcpServersService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeAllowedMcpServers: Event<void>;
	isAllowed(mcpServer: IGalleryMcpServer | ILocalMcpServer | IInstallableMcpServer): true | IMarkdownString;
}

export const mcpEnabledConfig = 'chat.mcp.enabled';
export const mcpGalleryServiceUrlConfig = 'chat.mcp.gallery.serviceUrl';
