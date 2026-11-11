/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { IExtUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ExtensionIdentifier, ExtensionType } from '../../../../../platform/extensions/common/extensions.js';
import { FileOperationResult, IFileService, IFileStat, toFileOperationResult } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IMcpResourceScannerService } from '../../../../../platform/mcp/common/mcpResourceScannerService.js';
import { McpResourceFormat } from '../../../../../platform/mcp/common/mcpWorkspaceConfiguration.js';
import { COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG } from '../../../../../platform/policy/common/copilotManagedSettings.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IUserDataProfile } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { isPromptTypeBlocked, StrictPluginOnlyCustomization } from '../../../chat/common/customizationLockdown.js';
import { getCleanPromptName, getPromptFileType } from '../../../chat/common/promptSyntax/config/promptFileLocations.js';
import { PromptsType } from '../../../chat/common/promptSyntax/promptTypes.js';
import { IPromptsService, PromptsStorage } from '../../../chat/common/promptSyntax/service/promptsService.js';
import { MAX_INSTRUCTIONS_RECURSION_DEPTH } from '../../../chat/common/promptSyntax/utils/promptFilesLocator.js';
import { IMcpCopilotGlobalConfigurationService } from '../../../mcp/common/mcpCopilotGlobalConfigurationService.js';
import { IWorkbenchExtensionManagementService } from '../../../../services/extensionManagement/common/extensionManagement.js';
import { IUserDataProfileService } from '../../../../services/userDataProfile/common/userDataProfile.js';
import { getSuggestedContributionLabels } from '../agentsWindowExtensionSuggestions.js';

/** The customization files that a profile keeps in its prompts folder. */
export type FolderProfileCustomizationType = PromptsType.agent | PromptsType.instructions | PromptsType.prompt;

const CUSTOMIZATION_TYPES: readonly FolderProfileCustomizationType[] = [PromptsType.agent, PromptsType.instructions, PromptsType.prompt];

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
		@IWorkbenchExtensionManagementService private readonly _extensionManagementService: IWorkbenchExtensionManagementService,
		@IMcpResourceScannerService private readonly _mcpResourceScannerService: IMcpResourceScannerService,
		@IMcpCopilotGlobalConfigurationService private readonly _copilotGlobalConfigurationService: IMcpCopilotGlobalConfigurationService,
		@IPromptsService private readonly _promptsService: IPromptsService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
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
			this._isShared(profile.promptsHome, current.promptsHome) ? [] : this._try('prompt files', () => this._resolveCustomizations(profile.promptsHome)),
		]);
		return { profile, extensions, mcpServers, customizations };
	}

	/**
	 * Calls `onDidChange` when what {@link resolve} returns for `profile` may change: when extensions are installed in
	 * or removed from either profile, or when either profile's MCP configuration or customization files change.
	 */
	watch(profile: IUserDataProfile, onDidChange: () => void): IDisposable {
		const store = new DisposableStore();
		const current = this._userDataProfileService.currentProfile;
		const extUri = this._uriIdentityService.extUri;

		if (!this._isShared(profile.extensionsResource, current.extensionsResource)) {
			// Application-scoped extensions are in every profile, which is how "Apply Extension to all Profiles" adds one to this window.
			const affects = (profileLocation: URI, applicationScoped: boolean | undefined) => !!applicationScoped
				|| extUri.isEqual(profileLocation, profile.extensionsResource) || extUri.isEqual(profileLocation, current.extensionsResource);
			store.add(this._extensionManagementService.onProfileAwareDidInstallExtensions(results => {
				if (results.some(result => !result.error && affects(result.profileLocation, result.applicationScoped ?? result.local?.isApplicationScoped))) {
					onDidChange();
				}
			}));
			store.add(this._extensionManagementService.onProfileAwareDidUninstallExtension(e => {
				if (!e.error && affects(e.profileLocation, e.applicationScoped)) {
					onDidChange();
				}
			}));
			store.add(this._extensionManagementService.onProfileAwareDidUpdateExtensionMetadata(e => {
				if (affects(e.profileLocation, e.local.isApplicationScoped)) {
					onDidChange();
				}
			}));
		}

		// Shared watchers, as the MCP management service and the prompt files locator use for these files: the file service
		// deduplicates them with the watcher of this window's MCP configuration, and correlated watchers cannot be recursive.
		const watched: URI[] = [];
		const watchResource = (resource: URI, recursive: boolean) => {
			watched.push(resource);
			store.add(this._fileService.watch(resource, { recursive, excludes: [] }));
		};
		if (!this._isShared(profile.mcpResource, current.mcpResource)) {
			watchResource(profile.mcpResource, false);
			watchResource(current.mcpResource, false);
			this._copilotGlobalConfigurationService.getConfigurationResource().then(resource => {
				if (resource && !store.isDisposed) {
					watchResource(resource, false);
				}
			}, error => this._logService.warn('[FolderProfileSetup] Could not watch the Copilot Global MCP configuration', error));
		}
		if (!this._isShared(profile.promptsHome, current.promptsHome)) {
			// Instructions files can be in subfolders.
			watchResource(profile.promptsHome, true);
			// The prompts service tells when the customization files of this window change.
			store.add(Event.any(this._promptsService.onDidChangeCustomAgents, this._promptsService.onDidChangeInstructions, this._promptsService.onDidChangeSlashCommands)(() => onDidChange()));
		}
		store.add(this._fileService.onDidFilesChange(e => {
			if (watched.some(resource => e.affects(resource))) {
				onDidChange();
			}
		}));
		return store;
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

	/**
	 * Agents, instructions, and prompt files in the profile's prompts folder that this window has no customization file of
	 * the same type and name for, either in its own prompts folder or in the personal folders that every profile uses,
	 * such as ~/.copilot/agents.
	 */
	private async _resolveCustomizations(promptsHome: URI): Promise<IFolderProfileCustomization[]> {
		// A policy that limits a type to plugins applies to every profile, so no window uses the profile's files of that type.
		const strictPluginOnly = this._configurationService.getValue<StrictPluginOnlyCustomization>(COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG);
		const types = CUSTOMIZATION_TYPES.filter(type => !isPromptTypeBlocked(strictPluginOnly, type));
		const getKey = (type: PromptsType, file: URI) => `${type}/${getCleanPromptName(file)}`;
		const [files, availableFiles] = await Promise.all([
			this._listCustomizationFiles(promptsHome, 0),
			Promise.all(types.map(type => this._promptsService.listPromptFilesForStorage(type, PromptsStorage.user, CancellationToken.None))),
		]);
		const availableKeys = new Set(availableFiles.flatMap((paths, index) => paths.map(path => getKey(types[index], path.uri))));
		const customizations: IFolderProfileCustomization[] = [];
		for (const file of files) {
			const type = types.find(candidate => candidate === getPromptFileType(file));
			if (type && !availableKeys.has(getKey(type, file))) {
				customizations.push({ type, name: getCleanPromptName(file), resource: file });
			}
		}
		return customizations.sort((a, b) => a.name.localeCompare(b.name));
	}

	/**
	 * Lists the files of a prompts folder that the prompt files locator reads: instructions files can be in subfolders, up
	 * to the depth that it searches, while other customization files are only read from the folder itself.
	 */
	private async _listCustomizationFiles(folder: URI, depth: number): Promise<URI[]> {
		let children: IFileStat[];
		try {
			children = (await this._fileService.resolve(folder)).children ?? [];
		} catch (error) {
			// A profile without customizations has no prompts folder. Other errors leave the comparison out rather than overstate it.
			if (toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND) {
				return [];
			}
			throw error;
		}
		const files: URI[] = [];
		for (const child of children) {
			if (child.isFile && (depth === 0 || getPromptFileType(child.resource) === PromptsType.instructions)) {
				files.push(child.resource);
			} else if (child.isDirectory && depth < MAX_INSTRUCTIONS_RECURSION_DEPTH) {
				files.push(...await this._listCustomizationFiles(child.resource, depth + 1));
			}
		}
		return files;
	}
}
