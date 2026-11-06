/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename, IExtUri } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ConfigurationTarget } from '../../../../platform/configuration/common/configuration.js';
import { IExtensionManagementService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { ExtensionIdentifier, ExtensionType } from '../../../../platform/extensions/common/extensions.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IMcpResourceScannerService } from '../../../../platform/mcp/common/mcpResourceScannerService.js';
import { McpResourceFormat } from '../../../../platform/mcp/common/mcpWorkspaceConfiguration.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IUserDataProfile } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { getCleanPromptName, getPromptFileType } from '../../../../workbench/contrib/chat/common/promptSyntax/config/promptFileLocations.js';
import { PromptsType } from '../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { IMcpCopilotGlobalConfigurationService } from '../../../../workbench/contrib/mcp/common/mcpCopilotGlobalConfigurationService.js';
import { IUserDataProfileService } from '../../../../workbench/services/userDataProfile/common/userDataProfile.js';
import { getSuggestedContributionLabels } from '../../extensions/browser/agentsWindowExtensionsWidget.js';

/** The customization files that a profile keeps in its prompts folder. */
export type FolderProfileCustomizationType = PromptsType.agent | PromptsType.instructions | PromptsType.prompt;

export interface IFolderProfileExtension {
	readonly id: string;
	readonly displayName: string;
	/** What the extension adds for agents, such as "Tools" or "MCP Servers". */
	readonly contributions: readonly string[];
}

export interface IFolderProfileMcpServer {
	readonly name: string;
	/** The profile's MCP configuration file, which defines the server. */
	readonly resource: URI;
}

export interface IFolderProfileCustomization {
	readonly type: FolderProfileCustomizationType;
	readonly name: string;
	readonly resource: URI;
}

/**
 * What a folder's profile sets up for agents that the Agents window does not have, because the Agents window
 * uses the Default profile. A list is empty when the profile shares that part with the Default profile or has
 * nothing beyond it.
 */
export interface IFolderProfileSetup {
	readonly profile: IUserDataProfile;
	readonly extensions: readonly IFolderProfileExtension[];
	readonly mcpServers: readonly IFolderProfileMcpServer[];
	readonly customizations: readonly IFolderProfileCustomization[];
}

export function hasFolderProfileSetup(setup: IFolderProfileSetup): boolean {
	return setup.extensions.length > 0 || setup.mcpServers.length > 0 || setup.customizations.length > 0;
}

/**
 * Returns the profile that VS Code opens `folder` with, unless that is the Default profile, the Agents window's own
 * profile, or a temporary profile.
 */
export function getFolderProfile(profiles: readonly IUserDataProfile[], folder: URI, extUri: IExtUri): IUserDataProfile | undefined {
	return profiles.find(profile => !profile.isDefault && !profile.isAgentsWindowProfile && !profile.isTransient
		&& !!profile.workspaces?.some(workspace => extUri.isEqual(workspace, folder)));
}

/**
 * Compares a profile with the profile of the Agents window, which takes extensions, MCP servers, and prompt files
 * from the Default profile.
 */
export class FolderProfileSetupResolver {

	constructor(
		@IUserDataProfileService private readonly _userDataProfileService: IUserDataProfileService,
		@IExtensionManagementService private readonly _extensionManagementService: IExtensionManagementService,
		@IMcpResourceScannerService private readonly _mcpResourceScannerService: IMcpResourceScannerService,
		@IMcpCopilotGlobalConfigurationService private readonly _copilotGlobalConfigurationService: IMcpCopilotGlobalConfigurationService,
		@IFileService private readonly _fileService: IFileService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService,
		@ILogService private readonly _logService: ILogService,
	) { }

	async resolve(profile: IUserDataProfile): Promise<IFolderProfileSetup> {
		const current = this._userDataProfileService.currentProfile;
		// A profile that uses the Default profile's extensions, MCP servers, or prompt files shares them with this window.
		const [extensions, mcpServers, customizations] = await Promise.all([
			this._isShared(profile.extensionsResource, current.extensionsResource) ? [] : this._try('extensions', () => this._resolveExtensions(profile.extensionsResource, current.extensionsResource)),
			this._isShared(profile.mcpResource, current.mcpResource) ? [] : this._try('MCP servers', () => this._resolveMcpServers(profile.mcpResource, current.mcpResource)),
			this._isShared(profile.promptsHome, current.promptsHome) ? [] : this._try('prompt files', () => this._resolveCustomizations(profile.promptsHome, current.promptsHome)),
		]);
		return { profile, extensions, mcpServers, customizations };
	}

	private _isShared(resource: URI, current: URI): boolean {
		return this._uriIdentityService.extUri.isEqual(resource, current);
	}

	private async _try<T>(part: string, resolve: () => Promise<readonly T[]>): Promise<readonly T[]> {
		try {
			return await resolve();
		} catch (error) {
			this._logService.warn(`[FolderProfileSetup] Could not compare the ${part} of the folder's profile`, error);
			return [];
		}
	}

	/** Extensions installed in the profile, but not in this window, that add tools, MCP servers, skills, or other agent features. */
	private async _resolveExtensions(profileLocation: URI, currentLocation: URI): Promise<IFolderProfileExtension[]> {
		const [installed, available] = await Promise.all([
			this._extensionManagementService.getInstalled(ExtensionType.User, profileLocation),
			this._extensionManagementService.getInstalled(ExtensionType.User, currentLocation),
		]);
		const availableIds = new Set(available.map(extension => ExtensionIdentifier.toKey(extension.identifier.id)));
		const extensions: IFolderProfileExtension[] = [];
		for (const extension of installed) {
			const contributions = getSuggestedContributionLabels(extension.manifest);
			if (contributions.length > 0 && !availableIds.has(ExtensionIdentifier.toKey(extension.identifier.id))) {
				extensions.push({ id: extension.identifier.id, displayName: extension.manifest.displayName || extension.manifest.name, contributions });
			}
		}
		return extensions.sort((a, b) => a.displayName.localeCompare(b.displayName));
	}

	/** MCP servers in the profile's configuration that are neither in this window's configuration nor in the Copilot Global configuration, which every profile shares. */
	private async _resolveMcpServers(profileResource: URI, currentResource: URI): Promise<IFolderProfileMcpServer[]> {
		const [names, availableNames] = await Promise.all([
			this._scanMcpServerNames(profileResource),
			this._getAvailableMcpServerNames(currentResource),
		]);
		return names
			.filter(name => !availableNames.has(name))
			.sort((a, b) => a.localeCompare(b))
			.map(name => ({ name, resource: profileResource }));
	}

	private async _getAvailableMcpServerNames(currentResource: URI): Promise<ReadonlySet<string>> {
		const copilotGlobalResource = await this._copilotGlobalConfigurationService.getConfigurationResource();
		const names = await Promise.all([
			this._scanMcpServerNames(currentResource),
			copilotGlobalResource ? this._scanMcpServerNames(copilotGlobalResource, McpResourceFormat.CopilotGlobal).catch(error => {
				this._logService.warn('[FolderProfileSetup] Could not read the Copilot Global MCP configuration', error);
				return [];
			}) : [],
		]);
		return new Set(names.flat());
	}

	private async _scanMcpServerNames(resource: URI, format?: McpResourceFormat): Promise<string[]> {
		const { servers } = await this._mcpResourceScannerService.scanMcpServers(resource, format ? undefined : ConfigurationTarget.USER, format);
		return Object.keys(servers ?? {});
	}

	/** Agents, instructions, and prompt files in the profile's prompts folder that this window's prompts folder has no file of the same name for. */
	private async _resolveCustomizations(promptsHome: URI, currentPromptsHome: URI): Promise<IFolderProfileCustomization[]> {
		const [files, availableFiles] = await Promise.all([
			this._listFiles(promptsHome),
			this._listFiles(currentPromptsHome),
		]);
		const availableNames = new Set(availableFiles.map(file => basename(file)));
		const customizations: IFolderProfileCustomization[] = [];
		for (const file of files) {
			const type = getPromptFileType(file);
			if ((type === PromptsType.agent || type === PromptsType.instructions || type === PromptsType.prompt) && !availableNames.has(basename(file))) {
				customizations.push({ type, name: getCleanPromptName(file), resource: file });
			}
		}
		return customizations.sort((a, b) => a.name.localeCompare(b.name));
	}

	private async _listFiles(folder: URI): Promise<URI[]> {
		try {
			const stat = await this._fileService.resolve(folder);
			return (stat.children ?? []).filter(child => child.isFile).map(child => child.resource);
		} catch (error) {
			// A profile without customizations has no prompts folder. Other errors leave the comparison out rather than overstate it.
			if (toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND) {
				return [];
			}
			throw error;
		}
	}
}
