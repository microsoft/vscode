/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../../platform/files/common/files.js';
import { IInstallableMcpServer } from '../../../../platform/mcp/common/mcpManagement.js';
import { getWorkspaceRootMcpConfigurationError, WORKSPACE_ROOT_MCP_CONFIG_FILE } from '../../../../platform/mcp/common/mcpWorkspaceConfiguration.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceContextService, IWorkspaceFolder } from '../../../../platform/workspace/common/workspace.js';
import { MCP_CONFIGURATION_KEY, WORKSPACE_STANDALONE_CONFIGURATIONS } from '../../../services/configuration/common/configuration.js';
import { WorkspaceMcpConfigKind } from '../../../services/mcp/common/mcpWorkbenchManagementService.js';
import { mcpWorkspaceRootConfig } from '../common/mcpConfiguration.js';

export interface IWorkspaceMcpConfigurationTarget {
	readonly folder: IWorkspaceFolder;
	readonly kind: WorkspaceMcpConfigKind;
}

export class McpConfigurationDestination {
	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IFileService private readonly fileService: IFileService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
	) { }

	private get rootEnabled(): boolean {
		return this.configurationService.getValue<boolean>(mcpWorkspaceRootConfig);
	}

	private resource(folder: IWorkspaceFolder, kind: WorkspaceMcpConfigKind): URI {
		return folder.toResource(kind === WorkspaceMcpConfigKind.Root ? WORKSPACE_ROOT_MCP_CONFIG_FILE : WORKSPACE_STANDALONE_CONFIGURATIONS[MCP_CONFIGURATION_KEY]);
	}

	private async exists(resource: URI): Promise<boolean> {
		try {
			await this.fileService.resolve(resource);
			return true;
		} catch (error) {
			if (toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND) {
				return false;
			}
			throw error;
		}
	}

	getExplicitTarget(resource: URI | string): IWorkspaceMcpConfigurationTarget {
		const uri = URI.isUri(resource) ? resource : URI.parse(resource);
		const folder = this.workspaceService.getWorkspaceFolder(uri);
		if (folder) {
			for (const kind of [WorkspaceMcpConfigKind.Root, WorkspaceMcpConfigKind.LegacyVscode]) {
				if (this.uriIdentityService.extUri.isEqual(uri, this.resource(folder, kind))) {
					if (kind === WorkspaceMcpConfigKind.Root && !this.rootEnabled) {
						throw new Error(localize('mcp.rootConfig.disabled', "Enable {0} to add servers to .mcp.json, or use .vscode/mcp.json.", mcpWorkspaceRootConfig));
					}
					return { folder, kind };
				}
			}
		}
		throw new Error(localize('mcp.config.invalidTarget', "Select a .mcp.json or .vscode/mcp.json file at the root of an open workspace folder."));
	}

	async selectForOpen(folder: IWorkspaceFolder): Promise<URI | undefined> {
		const root = this.resource(folder, WorkspaceMcpConfigKind.Root);
		const legacy = this.resource(folder, WorkspaceMcpConfigKind.LegacyVscode);
		const [hasRoot, hasLegacy] = await Promise.all([this.exists(root), this.exists(legacy)]);
		if (hasRoot && hasLegacy) {
			const kind = await this.pick(folder, false);
			return kind === undefined ? undefined : this.resource(folder, kind);
		}
		return hasRoot ? root : hasLegacy ? legacy : this.rootEnabled ? root : legacy;
	}

	async selectForAdd(folder: IWorkspaceFolder, server: IInstallableMcpServer, explicitKind?: WorkspaceMcpConfigKind): Promise<WorkspaceMcpConfigKind | undefined> {
		if (explicitKind === WorkspaceMcpConfigKind.LegacyVscode) {
			return explicitKind;
		}
		if (!this.rootEnabled) {
			if (explicitKind === WorkspaceMcpConfigKind.Root) {
				throw new Error(localize('mcp.rootConfig.disabled', "Enable {0} to add servers to .mcp.json, or use .vscode/mcp.json.", mcpWorkspaceRootConfig));
			}
			return WorkspaceMcpConfigKind.LegacyVscode;
		}

		const error = getWorkspaceRootMcpConfigurationError(server);
		if (explicitKind === WorkspaceMcpConfigKind.Root) {
			if (error) {
				throw new Error(error);
			}
			return explicitKind;
		}
		if (error) {
			return this.pick(folder, true, error);
		}
		if (!await this.exists(this.resource(folder, WorkspaceMcpConfigKind.LegacyVscode))) {
			return WorkspaceMcpConfigKind.Root;
		}
		return this.pick(folder, true);
	}

	private async pick(folder: IWorkspaceFolder, adding: boolean, rootError?: string): Promise<WorkspaceMcpConfigKind | undefined> {
		const items: (IQuickPickItem & { kind: WorkspaceMcpConfigKind })[] = [];
		if (!rootError) {
			items.push({
				kind: WorkspaceMcpConfigKind.Root,
				label: WORKSPACE_ROOT_MCP_CONFIG_FILE,
				description: localize('mcp.config.root', "Workspace root"),
			});
		}
		items.push({
			kind: WorkspaceMcpConfigKind.LegacyVscode,
			label: WORKSPACE_STANDALONE_CONFIGURATIONS[MCP_CONFIGURATION_KEY],
			description: adding ? localize('mcp.config.legacy.deprecated', "Deprecated") : localize('mcp.config.legacy', "VS Code workspace configuration"),
			detail: rootError,
		});
		const selected = await this.quickInputService.pick(items, {
			title: adding ? localize('mcp.config.add', "Add MCP Server to {0}", folder.name) : localize('mcp.config.open', "Open MCP Configuration in {0}", folder.name),
			placeHolder: rootError ? localize('mcp.config.legacyRequired', "This server requires .vscode/mcp.json") : (adding ? localize('mcp.config.add.placeholder', "Select the configuration file for the new server") : localize('mcp.config.open.placeholder', "Select the configuration file to open")),
			ignoreFocusLost: true,
		});
		return selected?.kind;
	}
}
