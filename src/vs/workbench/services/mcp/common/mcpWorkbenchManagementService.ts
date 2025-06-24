/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILocalMcpServer, IMcpManagementService, IGalleryMcpServer, InstallOptions, InstallMcpServerEvent, UninstallMcpServerEvent, DidUninstallMcpServerEvent, InstallMcpServerResult, IMcpServer } from '../../../../platform/mcp/common/mcpManagement.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IUserDataProfileService } from '../../../services/userDataProfile/common/userDataProfile.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IMcpResourceScannerService } from '../../../../platform/mcp/common/mcpResourceScannerService.js';
import { isWorkspaceFolder, IWorkspaceContextService, IWorkspaceFolder } from '../../../../platform/workspace/common/workspace.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { MCP_CONFIGURATION_KEY, WORKSPACE_STANDALONE_CONFIGURATIONS } from '../../configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IRemoteAgentService } from '../../remote/common/remoteAgentService.js';
import { URI } from '../../../../base/common/uri.js';
import { ConfigurationTarget } from '../../../../platform/configuration/common/configuration.js';
import { IJSONEditingService } from '../../configuration/common/jsonEditing.js';
import { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { McpManagementChannelClient } from '../../../../platform/mcp/common/mcpManagementIpc.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { IRemoteUserDataProfilesService } from '../../userDataProfile/common/remoteUserDataProfiles.js';

export interface IWorkbencMcpServerInstallOptions extends InstallOptions {
	target?: ConfigurationTarget | IWorkspaceFolder;
}

export const enum LocalMcpServerScope {
	User = 'user',
	RemoteUser = 'remoteUser',
	Workspace = 'workspace',
}

export interface IWorkbenchLocalMcpServer extends ILocalMcpServer {
	readonly scope?: LocalMcpServerScope;
}

export interface IWorkbenchMcpServerInstallResult extends InstallMcpServerResult {
	readonly local?: IWorkbenchLocalMcpServer;
}

export interface IWorkbenchMcpManagementService extends IMcpManagementService {

	readonly onDidInstallMcpServers: Event<readonly IWorkbenchMcpServerInstallResult[]>;

	readonly onInstallMcpServerInCurrentProfile: Event<InstallMcpServerEvent>;
	readonly onDidInstallMcpServersInCurrentProfile: Event<readonly IWorkbenchMcpServerInstallResult[]>;
	readonly onUninstallMcpServerInCurrentProfile: Event<UninstallMcpServerEvent>;
	readonly onDidUninstallMcpServerInCurrentProfile: Event<DidUninstallMcpServerEvent>;

	getInstalled(): Promise<IWorkbenchLocalMcpServer[]>;
	install(server: IMcpServer, options?: IWorkbencMcpServerInstallOptions): Promise<IWorkbenchLocalMcpServer>;
}

export const IWorkbenchMcpManagementService = createDecorator<IWorkbenchMcpManagementService>('workbenchMcpManagementService');

class WorkbenchMcpManagementService extends Disposable implements IWorkbenchMcpManagementService {

	readonly _serviceBrand: undefined;

	readonly onInstallMcpServer: Event<InstallMcpServerEvent>;
	readonly onUninstallMcpServer: Event<UninstallMcpServerEvent>;
	readonly onDidUninstallMcpServer: Event<DidUninstallMcpServerEvent>;

	private _onDidInstallMcpServers = this._register(new Emitter<readonly IWorkbenchMcpServerInstallResult[]>());
	readonly onDidInstallMcpServers = this._onDidInstallMcpServers.event;

	private readonly _onInstallMcpServerInCurrentProfile = this._register(new Emitter<InstallMcpServerEvent>());
	readonly onInstallMcpServerInCurrentProfile = this._onInstallMcpServerInCurrentProfile.event;

	private readonly _onDidInstallMcpServersInCurrentProfile = this._register(new Emitter<readonly IWorkbenchMcpServerInstallResult[]>());
	readonly onDidInstallMcpServersInCurrentProfile = this._onDidInstallMcpServersInCurrentProfile.event;

	private readonly _onUninstallMcpServerInCurrentProfile = this._register(new Emitter<UninstallMcpServerEvent>());
	readonly onUninstallMcpServerInCurrentProfile = this._onUninstallMcpServerInCurrentProfile.event;

	private readonly _onDidUninstallMcpServerInCurrentProfile = this._register(new Emitter<DidUninstallMcpServerEvent>());
	readonly onDidUninstallMcpServerInCurrentProfile = this._onDidUninstallMcpServerInCurrentProfile.event;

	private readonly remoteMcpManagementService: IMcpManagementService | undefined;

	constructor(
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@IJSONEditingService private readonly jsonEditingService: IJSONEditingService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IMcpResourceScannerService private readonly mcpResourceScannerService: IMcpResourceScannerService,
		@IMcpManagementService private readonly mcpManagementService: IMcpManagementService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IRemoteUserDataProfilesService private readonly remoteUserDataProfilesService: IRemoteUserDataProfilesService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		const remoteAgentConnection = remoteAgentService.getConnection();
		if (remoteAgentConnection) {
			this.remoteMcpManagementService = new McpManagementChannelClient(remoteAgentConnection.getChannel<IChannel>('mcpManagement'));
		}

		this.onInstallMcpServer = this.remoteMcpManagementService ? Event.any(this.remoteMcpManagementService.onInstallMcpServer, this.mcpManagementService.onInstallMcpServer) : this.mcpManagementService.onInstallMcpServer;
		this.onUninstallMcpServer = this.remoteMcpManagementService ? Event.any(this.remoteMcpManagementService.onUninstallMcpServer, this.mcpManagementService.onUninstallMcpServer) : this.mcpManagementService.onUninstallMcpServer;
		this.onDidUninstallMcpServer = this.remoteMcpManagementService ? Event.any(this.remoteMcpManagementService.onDidUninstallMcpServer, this.mcpManagementService.onDidUninstallMcpServer) : this.mcpManagementService.onDidUninstallMcpServer;

		this._register(this.mcpManagementService.onInstallMcpServer(e => {
			if (uriIdentityService.extUri.isEqual(e.mcpResource, this.userDataProfileService.currentProfile.mcpResource)) {
				this._onInstallMcpServerInCurrentProfile.fire(e);
			}
		}));

		this._register(this.mcpManagementService.onDidInstallMcpServers(e => {
			const mcpServerInstallResult: IWorkbenchMcpServerInstallResult[] = [];
			const mcpServerInstallResultInCurrentProfile: IWorkbenchMcpServerInstallResult[] = [];
			for (const result of e) {
				const workbenchResult = {
					...result,
					local: result.local ? { ...result.local, scope: LocalMcpServerScope.User } : undefined
				};
				mcpServerInstallResult.push(workbenchResult);
				if (uriIdentityService.extUri.isEqual(result.mcpResource, this.userDataProfileService.currentProfile.mcpResource)) {
					mcpServerInstallResultInCurrentProfile.push(workbenchResult);
				}
			}

			this._onDidInstallMcpServers.fire(mcpServerInstallResult);
			if (mcpServerInstallResultInCurrentProfile.length) {
				this._onDidInstallMcpServersInCurrentProfile.fire(mcpServerInstallResultInCurrentProfile);
			}
		}));

		this._register(this.mcpManagementService.onUninstallMcpServer(e => {
			if (uriIdentityService.extUri.isEqual(e.mcpResource, this.userDataProfileService.currentProfile.mcpResource)) {
				this._onUninstallMcpServerInCurrentProfile.fire(e);
			}
		}));

		this._register(this.mcpManagementService.onDidUninstallMcpServer(e => {
			if (uriIdentityService.extUri.isEqual(e.mcpResource, this.userDataProfileService.currentProfile.mcpResource)) {
				this._onDidUninstallMcpServerInCurrentProfile.fire(e);
			}
		}));

		if (this.remoteMcpManagementService) {
			this._register(this.remoteMcpManagementService.onInstallMcpServer(async e => {
				const remoteMcpResource = await this.getRemoteMcpResource(this.userDataProfileService.currentProfile.mcpResource);
				if (remoteMcpResource ? uriIdentityService.extUri.isEqual(e.mcpResource, remoteMcpResource) : this.userDataProfileService.currentProfile.isDefault) {
					this._onInstallMcpServerInCurrentProfile.fire(e);
				}
			}));

			this._register(this.remoteMcpManagementService.onDidInstallMcpServers(async e => {
				const mcpServerInstallResult: IWorkbenchMcpServerInstallResult[] = [];
				const mcpServerInstallResultInCurrentProfile: IWorkbenchMcpServerInstallResult[] = [];
				const remoteMcpResource = await this.getRemoteMcpResource(this.userDataProfileService.currentProfile.mcpResource);
				for (const result of e) {
					const workbenchResult = {
						...result,
						local: result.local ? { ...result.local, scope: LocalMcpServerScope.RemoteUser } : undefined
					};
					mcpServerInstallResult.push(workbenchResult);
					if (remoteMcpResource ? uriIdentityService.extUri.isEqual(result.mcpResource, remoteMcpResource) : this.userDataProfileService.currentProfile.isDefault) {
						mcpServerInstallResultInCurrentProfile.push(workbenchResult);
					}
				}

				this._onDidInstallMcpServersInCurrentProfile.fire(mcpServerInstallResult);
				if (mcpServerInstallResultInCurrentProfile.length) {
					this._onDidInstallMcpServersInCurrentProfile.fire(mcpServerInstallResultInCurrentProfile);
				}
			}));

			this._register(this.remoteMcpManagementService.onUninstallMcpServer(async e => {
				const remoteMcpResource = await this.getRemoteMcpResource(this.userDataProfileService.currentProfile.mcpResource);
				if (remoteMcpResource ? uriIdentityService.extUri.isEqual(e.mcpResource, remoteMcpResource) : this.userDataProfileService.currentProfile.isDefault) {
					this._onUninstallMcpServerInCurrentProfile.fire(e);
				}
			}));

			this._register(this.remoteMcpManagementService.onDidUninstallMcpServer(async e => {
				const remoteMcpResource = await this.getRemoteMcpResource(this.userDataProfileService.currentProfile.mcpResource);
				if (remoteMcpResource ? uriIdentityService.extUri.isEqual(e.mcpResource, remoteMcpResource) : this.userDataProfileService.currentProfile.isDefault) {
					this._onDidUninstallMcpServerInCurrentProfile.fire(e);
				}
			}));
		}
	}

	async getInstalled(): Promise<IWorkbenchLocalMcpServer[]> {
		const installed: IWorkbenchLocalMcpServer[] = [];
		const [userServers, remoteServers, workspaceServers] = await Promise.all([
			this.mcpManagementService.getInstalled(this.userDataProfileService.currentProfile.mcpResource),
			this.remoteMcpManagementService?.getInstalled(await this.getRemoteMcpResource()) ?? Promise.resolve<ILocalMcpServer[]>([]),
			this.getWorkspaceMcpServers(),
		]);

		for (const server of userServers) {
			installed.push({ ...server, scope: LocalMcpServerScope.User });
		}
		for (const server of remoteServers) {
			installed.push({ ...server, scope: LocalMcpServerScope.RemoteUser });
		}
		for (const server of workspaceServers) {
			installed.push({ ...server, scope: LocalMcpServerScope.Workspace });
		}

		return installed;
	}

	async install(server: IMcpServer, options?: IWorkbencMcpServerInstallOptions): Promise<IWorkbenchLocalMcpServer> {
		options = options ?? {};

		if (options.target === ConfigurationTarget.WORKSPACE || isWorkspaceFolder(options.target)) {
			const mcpResource = options.target === ConfigurationTarget.WORKSPACE ? this.workspaceContextService.getWorkspace().configuration : options.target.toResource(WORKSPACE_STANDALONE_CONFIGURATIONS[MCP_CONFIGURATION_KEY]);
			if (!mcpResource) {
				throw new Error(`Illegal target: ${options.target}`);
			}

			await this.jsonEditingService.write(mcpResource, [
				{
					path: ['mcp', 'servers', server.name],
					value: server.config
				},
				...(server.inputs || []).map(i => ({
					path: ['mcp', 'inputs', -1],
					value: i,
				})),
			], true);

			const installed = (await this.getWorkspaceMcpServers()).find(s => s.name === server.name);
			if (!installed) {
				throw new Error(`Failed to install MCP server: ${server.name}`);
			}
			return installed;
		}

		if (options.target === ConfigurationTarget.USER_REMOTE) {
			if (!this.remoteMcpManagementService) {
				throw new Error(`Illegal target: ${options.target}`);
			}
			options.mcpResource = await this.getRemoteMcpResource(options.mcpResource);
			return this.remoteMcpManagementService.install(server, options);
		}

		if (options.target && options.target !== ConfigurationTarget.USER && options.target !== ConfigurationTarget.USER_LOCAL) {
			throw new Error(`Illegal target: ${options.target}`);
		}

		options.mcpResource = this.userDataProfileService.currentProfile.mcpResource;
		return this.mcpManagementService.install(server, options);
	}

	installFromGallery(server: IGalleryMcpServer, options?: InstallOptions): Promise<ILocalMcpServer> {
		options = options ?? {};
		if (!options.mcpResource) {
			options.mcpResource = this.userDataProfileService.currentProfile.mcpResource;
		}
		return this.mcpManagementService.installFromGallery(server, options);
	}

	async uninstall(server: IWorkbenchLocalMcpServer): Promise<void> {
		if (server.scope === LocalMcpServerScope.Workspace) {
			const workspace = this.workspaceContextService.getWorkspace();
			if (workspace.configuration && this.uriIdentityService.extUri.isEqual(server.mcpResource, workspace.configuration)) {
				await this.jsonEditingService.write(server.mcpResource, [
					{
						path: ['mcp', 'servers', server.name],
						value: undefined
					},
				], true);
				return;
			}
			await this.mcpResourceScannerService.removeMcpServers([server.name], server.mcpResource);
			return;
		}

		if (server.scope === LocalMcpServerScope.RemoteUser) {
			if (!this.remoteMcpManagementService) {
				throw new Error(`Illegal target: ${server.scope}`);
			}
			this.remoteMcpManagementService.uninstall(server);
		}

		return this.mcpManagementService.uninstall(server, { mcpResource: this.userDataProfileService.currentProfile.mcpResource });
	}

	private async getWorkspaceMcpServers(): Promise<IWorkbenchLocalMcpServer[]> {
		const workspaceServers: IWorkbenchLocalMcpServer[] = [];
		const workspace = this.workspaceService.getWorkspace();

		for (const folder of workspace.folders) {
			const mcpResource = this.uriIdentityService.extUri.joinPath(folder.uri, WORKSPACE_STANDALONE_CONFIGURATIONS[MCP_CONFIGURATION_KEY]);
			const scannedMcpServers = await this.scanMcpServers(mcpResource);
			workspaceServers.push(...scannedMcpServers);
		}

		return workspaceServers;
	}

	private async scanMcpServers(mcpResource: URI): Promise<IWorkbenchLocalMcpServer[]> {
		const mcpServers: IWorkbenchLocalMcpServer[] = [];
		try {
			const scannedMcpServers = await this.mcpResourceScannerService.scanMcpServers(mcpResource);
			if (scannedMcpServers.servers) {
				for (const [serverName, scannedServer] of Object.entries(scannedMcpServers.servers)) {
					mcpServers.push({
						name: serverName,
						config: scannedServer.config,
						version: scannedServer.version,
						scope: LocalMcpServerScope.Workspace,
						mcpResource,
						id: scannedServer.id,
					});
				}
			}
		} catch (error) {
			this.logService.error(`Failed to scan MCP servers from ${mcpResource.path}: ${error}`);
		}
		return mcpServers;
	}

	private async getRemoteMcpResource(mcpResource?: URI): Promise<URI | undefined> {
		if (!mcpResource && this.userDataProfileService.currentProfile.isDefault) {
			return undefined;
		}
		mcpResource = mcpResource ?? this.userDataProfileService.currentProfile.mcpResource;
		let profile = this.userDataProfilesService.profiles.find(p => this.uriIdentityService.extUri.isEqual(p.mcpResource, mcpResource));
		if (profile) {
			profile = await this.remoteUserDataProfilesService.getRemoteProfile(profile);
		} else {
			profile = (await this.remoteUserDataProfilesService.getRemoteProfiles()).find(p => this.uriIdentityService.extUri.isEqual(p.extensionsResource, mcpResource));
		}
		return profile?.extensionsResource;
	}
}

registerSingleton(IWorkbenchMcpManagementService, WorkbenchMcpManagementService, InstantiationType.Delayed);
