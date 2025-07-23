/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IMarkdownString, MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { basename } from '../../../../base/common/resources.js';
import { Mutable } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ConfigurationTarget } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IGalleryMcpServer, IMcpGalleryService, IQueryOptions, IInstallableMcpServer, IMcpServerManifest, ILocalMcpServer } from '../../../../platform/mcp/common/mcpManagement.js';
import { IMcpServerConfiguration, IMcpServerVariable, IMcpStdioServerConfiguration, McpServerType } from '../../../../platform/mcp/common/mcpPlatformTypes.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { StorageScope } from '../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IURLService } from '../../../../platform/url/common/url.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { MCP_CONFIGURATION_KEY, WORKSPACE_STANDALONE_CONFIGURATIONS } from '../../../services/configuration/common/configuration.js';
import { ACTIVE_GROUP, IEditorService } from '../../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { DidUninstallWorkbenchMcpServerEvent, IWorkbenchLocalMcpServer, IWorkbenchMcpManagementService, IWorkbenchMcpServerInstallResult, LocalMcpServerScope, REMOTE_USER_CONFIG_ID, USER_CONFIG_ID, WORKSPACE_CONFIG_ID, WORKSPACE_FOLDER_CONFIG_ID_PREFIX } from '../../../services/mcp/common/mcpWorkbenchManagementService.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
import { mcpConfigurationSection } from '../common/mcpConfiguration.js';
import { HasInstalledMcpServersContext, IMcpConfigPath, IMcpWorkbenchService, IWorkbenchMcpServer, McpCollectionSortOrder, McpServerInstallState, McpServersGalleryEnabledContext } from '../common/mcpTypes.js';
import { McpServerEditorInput } from './mcpServerEditorInput.js';

interface IMcpServerStateProvider<T> {
	(mcpWorkbenchServer: McpWorkbenchServer): T;
}

class McpWorkbenchServer implements IWorkbenchMcpServer {

	constructor(
		private installStateProvider: IMcpServerStateProvider<McpServerInstallState>,
		public local: IWorkbenchLocalMcpServer | undefined,
		public gallery: IGalleryMcpServer | undefined,
		public readonly installable: IInstallableMcpServer | undefined,
		@IMcpGalleryService private readonly mcpGalleryService: IMcpGalleryService,
		@IFileService private readonly fileService: IFileService,
	) {
		this.local = local;
	}

	get id(): string {
		return this.local?.id ?? this.gallery?.id ?? this.installable?.name ?? this.name;
	}

	get name(): string {
		return this.gallery?.name ?? this.local?.name ?? this.installable?.name ?? '';
	}

	get label(): string {
		return this.gallery?.displayName ?? this.local?.displayName ?? this.local?.name ?? this.installable?.name ?? '';
	}

	get icon(): {
		readonly dark: string;
		readonly light: string;
	} | undefined {
		return this.gallery?.icon ?? this.local?.icon;
	}

	get installState(): McpServerInstallState {
		return this.installStateProvider(this);
	}

	get codicon(): string | undefined {
		return this.gallery?.codicon ?? this.local?.codicon;
	}

	get publisherDisplayName(): string | undefined {
		return this.gallery?.publisherDisplayName ?? this.local?.publisherDisplayName ?? this.gallery?.publisher ?? this.local?.publisher;
	}

	get publisherUrl(): string | undefined {
		return this.gallery?.publisherDomain?.link;
	}

	get description(): string {
		return this.gallery?.description ?? this.local?.description ?? '';
	}

	get installCount(): number {
		return this.gallery?.installCount ?? 0;
	}

	get url(): string | undefined {
		return this.gallery?.url;
	}

	get repository(): string | undefined {
		return this.gallery?.repositoryUrl;
	}

	get config(): IMcpServerConfiguration | undefined {
		return this.local?.config ?? this.installable?.config;
	}

	get readmeUrl(): URI | undefined {
		return this.local?.readmeUrl ?? (this.gallery?.readmeUrl ? URI.parse(this.gallery.readmeUrl) : undefined);
	}

	async getReadme(token: CancellationToken): Promise<string> {
		if (this.local?.readmeUrl) {
			const content = await this.fileService.readFile(this.local.readmeUrl);
			return content.value.toString();
		}

		if (this.gallery?.readmeUrl) {
			return this.mcpGalleryService.getReadme(this.gallery, token);
		}

		return Promise.reject(new Error('not available'));
	}

	async getManifest(token: CancellationToken): Promise<IMcpServerManifest> {
		if (this.local?.manifest) {
			return this.local.manifest;
		}

		if (this.gallery) {
			return this.mcpGalleryService.getManifest(this.gallery, token);
		}

		throw new Error('No manifest available');
	}

}

export class McpWorkbenchService extends Disposable implements IMcpWorkbenchService {

	_serviceBrand: undefined;

	private installing: McpWorkbenchServer[] = [];
	private uninstalling: McpWorkbenchServer[] = [];

	private _local: McpWorkbenchServer[] = [];
	get local(): readonly McpWorkbenchServer[] { return [...this._local]; }

	private readonly _onChange = this._register(new Emitter<IWorkbenchMcpServer | undefined>());
	readonly onChange = this._onChange.event;

	private readonly _onReset = this._register(new Emitter<void>());
	readonly onReset = this._onReset.event;

	constructor(
		@IMcpGalleryService private readonly mcpGalleryService: IMcpGalleryService,
		@IWorkbenchMcpManagementService private readonly mcpManagementService: IWorkbenchMcpManagementService,
		@IEditorService private readonly editorService: IEditorService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@ILabelService private readonly labelService: ILabelService,
		@IProductService private readonly productService: IProductService,
		@IRemoteAgentService private readonly remoteAgentService: IRemoteAgentService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
		@IURLService urlService: IURLService,
	) {
		super();
		this._register(this.mcpManagementService.onDidInstallMcpServersInCurrentProfile(e => this.onDidInstallMcpServers(e)));
		this._register(this.mcpManagementService.onDidUpdateMcpServersInCurrentProfile(e => this.onDidUpdateMcpServers(e)));
		this._register(this.mcpManagementService.onDidUninstallMcpServerInCurrentProfile(e => this.onDidUninstallMcpServer(e)));
		this._register(this.mcpManagementService.onDidChangeProfile(e => this.onDidChangeProfile()));
		this.queryLocal().then(() => this.syncInstalledMcpServers());
		urlService.registerHandler(this);
	}

	private async onDidChangeProfile() {
		await this.queryLocal();
		this._onChange.fire(undefined);
		this._onReset.fire();
	}

	private areSameMcpServers(a: { name: string; scope: LocalMcpServerScope } | undefined, b: { name: string; scope: LocalMcpServerScope } | undefined): boolean {
		if (a === b) {
			return true;
		}
		if (!a || !b) {
			return false;
		}
		return a.name === b.name && a.scope === b.scope;
	}

	private onDidUninstallMcpServer(e: DidUninstallWorkbenchMcpServerEvent) {
		if (e.error) {
			return;
		}
		const uninstalled = this._local.find(server => this.areSameMcpServers(server.local, e));
		if (uninstalled) {
			this._local = this._local.filter(server => server !== uninstalled);
			this._onChange.fire(uninstalled);
		}
	}

	private onDidInstallMcpServers(e: readonly IWorkbenchMcpServerInstallResult[]) {
		const servers: IWorkbenchMcpServer[] = [];
		for (const result of e) {
			if (!result.local) {
				continue;
			}
			servers.push(this.onDidInstallMcpServer(result.local, result.source));
		}
		if (servers.some(server => server.local?.source === 'gallery' && !server.gallery)) {
			this.syncInstalledMcpServers();
		}
	}

	private onDidInstallMcpServer(local: IWorkbenchLocalMcpServer, gallery?: IGalleryMcpServer): IWorkbenchMcpServer {
		let server = this.installing.find(server => server.local ? this.areSameMcpServers(server.local, local) : server.name === local.name);
		this.installing = server ? this.installing.filter(e => e !== server) : this.installing;
		if (server) {
			server.local = local;
		} else {
			server = this.instantiationService.createInstance(McpWorkbenchServer, e => this.getInstallState(e), local, gallery, undefined);
		}
		this._local = this._local.filter(server => !this.areSameMcpServers(server.local, local));
		this._local.push(server);
		this._onChange.fire(server);
		return server;
	}

	private onDidUpdateMcpServers(e: readonly IWorkbenchMcpServerInstallResult[]) {
		for (const result of e) {
			if (!result.local) {
				continue;
			}
			const serverIndex = this._local.findIndex(server => this.areSameMcpServers(server.local, result.local));
			let server: McpWorkbenchServer;
			if (serverIndex !== -1) {
				this._local[serverIndex].local = result.local;
				server = this._local[serverIndex];
			} else {
				server = this.instantiationService.createInstance(McpWorkbenchServer, e => this.getInstallState(e), result.local, result.source, undefined);
				this._local.push(server);
			}
			this._onChange.fire(server);
		}
	}

	private fromGallery(gallery: IGalleryMcpServer): IWorkbenchMcpServer | undefined {
		for (const local of this._local) {
			if (local.name === gallery.name) {
				local.gallery = gallery;
				return local;
			}
		}
		return undefined;
	}

	private async syncInstalledMcpServers(): Promise<void> {
		const installedGalleryServers: ILocalMcpServer[] = [];
		for (const installed of this.local) {
			if (installed.local?.source !== 'gallery') {
				continue;
			}
			installedGalleryServers.push(installed.local);
		}
		if (installedGalleryServers.length) {
			const galleryServers = await this.mcpGalleryService.getMcpServers(installedGalleryServers.map(server => server.name));
			if (galleryServers.length) {
				this.syncInstalledMcpServersWithGallery(galleryServers);
			}
		}
	}

	private async syncInstalledMcpServersWithGallery(gallery: IGalleryMcpServer[]): Promise<void> {
		const galleryMap = new Map<string, IGalleryMcpServer>(gallery.map(server => [server.name, server]));
		for (const mcpServer of this.local) {
			if (!mcpServer.gallery) {
				if (!mcpServer.local) {
					continue;
				}
				if (mcpServer.gallery) {
					continue;
				}
				const galleryServer = galleryMap.get(mcpServer.name);
				if (!galleryServer) {
					continue;
				}
				mcpServer.gallery = galleryServer;
				if (!mcpServer.id) {
					mcpServer.local = await this.mcpManagementService.updateMetadata(mcpServer.local, galleryServer);
				}
				this._onChange.fire(mcpServer);
			}
		}
	}

	async queryGallery(options?: IQueryOptions, token?: CancellationToken): Promise<IWorkbenchMcpServer[]> {
		if (!this.mcpGalleryService.isEnabled()) {
			return [];
		}
		const result = await this.mcpGalleryService.query(options, token);
		return result.map(gallery => this.fromGallery(gallery) ?? this.instantiationService.createInstance(McpWorkbenchServer, e => this.getInstallState(e), undefined, gallery, undefined));
	}

	async queryLocal(): Promise<IWorkbenchMcpServer[]> {
		const installed = await this.mcpManagementService.getInstalled();
		this._local = installed.map(i => {
			const local = this.instantiationService.createInstance(McpWorkbenchServer, e => this.getInstallState(e), undefined, undefined, undefined);
			local.local = i;
			return local;
		});
		this._onChange.fire(undefined);
		return [...this.local];
	}

	getEnabledLocalMcpServers(): IWorkbenchLocalMcpServer[] {
		const result = new Map<string, IWorkbenchLocalMcpServer>();
		const userRemote: IWorkbenchLocalMcpServer[] = [];
		const workspace: IWorkbenchLocalMcpServer[] = [];

		for (const server of this.local) {
			if (server.local?.scope === LocalMcpServerScope.User) {
				result.set(server.name, server.local);
			} else if (server.local?.scope === LocalMcpServerScope.RemoteUser) {
				userRemote.push(server.local);
			} else if (server.local?.scope === LocalMcpServerScope.Workspace) {
				workspace.push(server.local);
			}
		}

		for (const server of userRemote) {
			const existing = result.get(server.name);
			if (existing) {
				this.logService.warn(localize('overwriting', "Overwriting mcp server '{0}' from {1} with {2}.", server.name, server.mcpResource.path, existing.mcpResource.path));
			}
			result.set(server.name, server);
		}

		for (const server of workspace) {
			const existing = result.get(server.name);
			if (existing) {
				this.logService.warn(localize('overwriting', "Overwriting mcp server '{0}' from {1} with {2}.", server.name, server.mcpResource.path, existing.mcpResource.path));
			}
			result.set(server.name, server);
		}

		return [...result.values()];
	}

	canInstall(mcpServer: IWorkbenchMcpServer): true | IMarkdownString {
		if (!(mcpServer instanceof McpWorkbenchServer)) {
			return new MarkdownString().appendText(localize('not an extension', "The provided object is not an mcp server."));
		}

		if (mcpServer.gallery) {
			const result = this.mcpManagementService.canInstall(mcpServer.gallery);
			if (result === true) {
				return true;
			}

			return result;
		}

		if (mcpServer.installable) {
			const result = this.mcpManagementService.canInstall(mcpServer.installable);
			if (result === true) {
				return true;
			}

			return result;
		}


		return new MarkdownString().appendText(localize('cannot be installed', "Cannot install the '{0}' MCP Server because it is not available in this setup.", mcpServer.label));
	}

	async install(server: IWorkbenchMcpServer): Promise<IWorkbenchMcpServer> {
		if (!(server instanceof McpWorkbenchServer)) {
			throw new Error('Invalid server instance');
		}

		if (server.installable) {
			const installable = server.installable;
			return this.doInstall(server, () => this.mcpManagementService.install(installable));
		}

		if (server.gallery) {
			const gallery = server.gallery;
			return this.doInstall(server, () => this.mcpManagementService.installFromGallery(gallery, { packageType: gallery.packageTypes[0] }));
		}

		throw new Error('No installable server found');
	}

	async uninstall(server: IWorkbenchMcpServer): Promise<void> {
		if (!server.local) {
			throw new Error('Local server is missing');
		}
		await this.mcpManagementService.uninstall(server.local);
	}

	private async doInstall(server: McpWorkbenchServer, installTask: () => Promise<IWorkbenchLocalMcpServer>): Promise<IWorkbenchMcpServer> {
		this.installing.push(server);
		this._onChange.fire(server);
		await installTask();
		return this.waitAndGetInstalledMcpServer(server);
	}

	private async waitAndGetInstalledMcpServer(server: McpWorkbenchServer): Promise<IWorkbenchMcpServer> {
		let installed = this.local.find(local => local.name === server.name);
		if (!installed) {
			await Event.toPromise(Event.filter(this.onChange, e => !!e && this.local.some(local => local.name === server.name)));
		}
		installed = this.local.find(local => local.name === server.name);
		if (!installed) {
			// This should not happen
			throw new Error('Extension should have been installed');
		}
		return installed;
	}

	getMcpConfigPath(localMcpServer: IWorkbenchLocalMcpServer): IMcpConfigPath | undefined;
	getMcpConfigPath(mcpResource: URI): Promise<IMcpConfigPath | undefined>;
	getMcpConfigPath(arg: URI | IWorkbenchLocalMcpServer): Promise<IMcpConfigPath | undefined> | IMcpConfigPath | undefined {
		if (arg instanceof URI) {
			const mcpResource = arg;
			for (const profile of this.userDataProfilesService.profiles) {
				if (this.uriIdentityService.extUri.isEqual(profile.mcpResource, mcpResource)) {
					return this.getUserMcpConfigPath(mcpResource);
				}
			}

			return this.remoteAgentService.getEnvironment().then(remoteEnvironment => {
				if (remoteEnvironment && this.uriIdentityService.extUri.isEqual(remoteEnvironment.mcpResource, mcpResource)) {
					return this.getRemoteMcpConfigPath(mcpResource);
				}
				return this.getWorkspaceMcpConfigPath(mcpResource);
			});
		}

		if (arg.scope === LocalMcpServerScope.User) {
			return this.getUserMcpConfigPath(arg.mcpResource);
		}

		if (arg.scope === LocalMcpServerScope.Workspace) {
			return this.getWorkspaceMcpConfigPath(arg.mcpResource);
		}

		if (arg.scope === LocalMcpServerScope.RemoteUser) {
			return this.getRemoteMcpConfigPath(arg.mcpResource);
		}

		return undefined;
	}

	private getUserMcpConfigPath(mcpResource: URI): IMcpConfigPath {
		return {
			id: USER_CONFIG_ID,
			key: 'userLocalValue',
			target: ConfigurationTarget.USER_LOCAL,
			label: localize('mcp.configuration.userLocalValue', 'Global in {0}', this.productService.nameShort),
			scope: StorageScope.PROFILE,
			order: McpCollectionSortOrder.User,
			uri: mcpResource,
			section: [],
		};
	}

	private getRemoteMcpConfigPath(mcpResource: URI): IMcpConfigPath {
		return {
			id: REMOTE_USER_CONFIG_ID,
			key: 'userRemoteValue',
			target: ConfigurationTarget.USER_REMOTE,
			label: this.environmentService.remoteAuthority ? this.labelService.getHostLabel(Schemas.vscodeRemote, this.environmentService.remoteAuthority) : 'Remote',
			scope: StorageScope.PROFILE,
			order: McpCollectionSortOrder.User + McpCollectionSortOrder.RemoteBoost,
			remoteAuthority: this.environmentService.remoteAuthority,
			uri: mcpResource,
			section: [],
		};
	}

	private getWorkspaceMcpConfigPath(mcpResource: URI): IMcpConfigPath | undefined {
		const workspace = this.workspaceService.getWorkspace();
		if (workspace.configuration && this.uriIdentityService.extUri.isEqual(workspace.configuration, mcpResource)) {
			return {
				id: WORKSPACE_CONFIG_ID,
				key: 'workspaceValue',
				target: ConfigurationTarget.WORKSPACE,
				label: basename(mcpResource),
				scope: StorageScope.WORKSPACE,
				order: McpCollectionSortOrder.Workspace,
				remoteAuthority: this.environmentService.remoteAuthority,
				uri: mcpResource,
				section: ['settings', mcpConfigurationSection],
			};
		}

		const workspaceFolders = workspace.folders;
		for (let index = 0; index < workspaceFolders.length; index++) {
			const workspaceFolder = workspaceFolders[index];
			if (this.uriIdentityService.extUri.isEqual(this.uriIdentityService.extUri.joinPath(workspaceFolder.uri, WORKSPACE_STANDALONE_CONFIGURATIONS[MCP_CONFIGURATION_KEY]), mcpResource)) {
				return {
					id: `${WORKSPACE_FOLDER_CONFIG_ID_PREFIX}${index}`,
					key: 'workspaceFolderValue',
					target: ConfigurationTarget.WORKSPACE_FOLDER,
					label: `${workspaceFolder.name}/.vscode/mcp.json`,
					scope: StorageScope.WORKSPACE,
					remoteAuthority: this.environmentService.remoteAuthority,
					order: McpCollectionSortOrder.WorkspaceFolder,
					uri: mcpResource,
					workspaceFolder,
				};
			}
		}

		return undefined;
	}

	async handleURL(uri: URI): Promise<boolean> {
		if (uri.path !== 'mcp/install') {
			return false;
		}

		let parsed: IMcpServerConfiguration & { name: string; inputs?: IMcpServerVariable[]; gallery?: boolean };
		try {
			parsed = JSON.parse(decodeURIComponent(uri.query));
		} catch (e) {
			return false;
		}

		try {
			const { name, inputs, gallery, ...config } = parsed;

			if (gallery || !config || Object.keys(config).length === 0) {
				const [galleryServer] = await this.mcpGalleryService.getMcpServers([name]);
				if (!galleryServer) {
					throw new Error(`MCP server '${name}' not found in gallery`);
				}
				this.open(this.instantiationService.createInstance(McpWorkbenchServer, e => this.getInstallState(e), undefined, galleryServer, undefined));
			} else {
				if (config.type === undefined) {
					(<Mutable<IMcpServerConfiguration>>config).type = (<IMcpStdioServerConfiguration>parsed).command ? McpServerType.LOCAL : McpServerType.REMOTE;
				}
				this.open(this.instantiationService.createInstance(McpWorkbenchServer, e => this.getInstallState(e), undefined, undefined, { name, config, inputs }));
			}
		} catch (e) {
			// ignore
		}
		return true;
	}

	async open(extension: IWorkbenchMcpServer, options?: IEditorOptions): Promise<void> {
		await this.editorService.openEditor(this.instantiationService.createInstance(McpServerEditorInput, extension), options, ACTIVE_GROUP);
	}

	private getInstallState(extension: McpWorkbenchServer): McpServerInstallState {
		if (this.installing.some(i => i.name === extension.name)) {
			return McpServerInstallState.Installing;
		}
		if (this.uninstalling.some(e => e.name === extension.name)) {
			return McpServerInstallState.Uninstalling;
		}
		const local = this.local.find(e => e === extension);
		return local ? McpServerInstallState.Installed : McpServerInstallState.Uninstalled;
	}

}

export class MCPContextsInitialisation extends Disposable implements IWorkbenchContribution {

	static ID = 'workbench.mcp.contexts.initialisation';

	constructor(
		@IMcpWorkbenchService mcpWorkbenchService: IMcpWorkbenchService,
		@IMcpGalleryService mcpGalleryService: IMcpGalleryService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		const hasInstalledMcpServersContextKey = HasInstalledMcpServersContext.bindTo(contextKeyService);
		McpServersGalleryEnabledContext.bindTo(contextKeyService).set(mcpGalleryService.isEnabled());
		hasInstalledMcpServersContextKey.set(mcpWorkbenchService.local.length > 0);
		this._register(mcpWorkbenchService.onChange(() => hasInstalledMcpServersContextKey.set(mcpWorkbenchService.local.length > 0)));
	}
}
