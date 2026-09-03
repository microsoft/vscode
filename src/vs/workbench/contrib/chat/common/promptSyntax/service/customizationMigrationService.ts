/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { URI } from '../../../../../../base/common/uri.js';
import { PromptFileSource, PromptsType } from '../promptTypes.js';
import { PromptsStorage } from './promptsService.js';

export const ICustomizationMigrationService = createDecorator<ICustomizationMigrationService>('customizationMigrationService');

export enum CustomizationMigrationType {
	UserData = 'userData',
	PromptFiles = 'promptFiles',
	McpServers = 'mcpServers',
}

export interface MigratableConfiguration {
	readonly uri: URI;
	readonly type: PromptsType;
	readonly storage: PromptsStorage;
	readonly name?: string;
	readonly description?: string;
	readonly source?: PromptFileSource;
}

export function getCustomizationMigrationTargetType(customization: MigratableConfiguration): PromptsType {
	return customization.type === PromptsType.prompt ? PromptsType.skill : customization.type;
}

export function isPromptFileMigrationCandidate(customization: MigratableConfiguration): boolean {
	return customization.type === PromptsType.prompt
		&& (customization.storage === PromptsStorage.local || customization.storage === PromptsStorage.user);
}

export function isUserDataMigrationCandidate(customization: MigratableConfiguration): boolean {
	return customization.source === PromptFileSource.UserData
		&& (customization.type === PromptsType.agent || customization.type === PromptsType.instructions);
}

export type FileCustomizationMigrationType = CustomizationMigrationType.UserData | CustomizationMigrationType.PromptFiles;

export interface FileCustomizationMigration {
	readonly type: FileCustomizationMigrationType;
	readonly files: readonly URI[];
	readonly candidates: readonly MigratableConfiguration[];
}

export interface IMcpServerCustomizationMigrationItem {
	readonly id: string;
	readonly name: string;
	/** Whether Agent Host delivery fully supports this server's configuration. */
	readonly supported: boolean;
}

export interface IAgentHostMcpServerSupportCoverage {
	/** Some installed servers may be absent or disabled because MCP access is restricted. */
	readonly restrictedByMcpAccess: boolean;
	/** Customization policy may prevent otherwise supported servers from reaching the Agent Host. */
	readonly restrictedByCustomizationPolicy: boolean;
}

export interface McpServerCustomizationMigration {
	readonly type: CustomizationMigrationType.McpServers;
	readonly servers: readonly IMcpServerCustomizationMigrationItem[];
	/** Whether all lazy MCP collections known to the client have loaded; when false, servers may be missing. */
	readonly discoveryComplete: boolean;
	/** Snapshot-wide restrictions that may limit inventory or delivery, independent of per-server support. */
	readonly coverage: IAgentHostMcpServerSupportCoverage;
}

export type CustomizationMigration = FileCustomizationMigration | McpServerCustomizationMigration;

export interface ICustomizationMigrationService {
	readonly _serviceBrand: undefined;

	computeMigration(sessionResource: URI, type: FileCustomizationMigrationType): Promise<FileCustomizationMigration>;
	computeMigration(sessionResource: URI, type: CustomizationMigrationType.McpServers): Promise<McpServerCustomizationMigration>;
	computeMigrations(sessionResource: URI): Promise<CustomizationMigration[]>;
	computeMigrationHint(sessionResource: URI): Promise<string | undefined>;
}
