/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { createCommandUri, IMarkdownString, MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { basename } from '../../../../base/common/resources.js';
import { isBoolean, isNumber, isObject, isString, isStringArray } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { CustomizationMarketplaceConfiguration } from '../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IGalleryMcpServer, IMcpGalleryService, IQueryOptions, IInstallableMcpServer, IGalleryMcpServerConfiguration, mcpAccessConfig, McpAccessValue, IAllowedMcpServersService, IMcpGalleryServerResolveResult, McpGalleryResolveStatus, replaceMcpServerVariableReferences } from '../../../../platform/mcp/common/mcpManagement.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IMcpDevModeConfig, IMcpRemoteServerConfiguration, IMcpServerConfiguration, IMcpServerVariable, IMcpStdioServerConfiguration, McpServerType } from '../../../../platform/mcp/common/mcpPlatformTypes.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { StorageScope } from '../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IURLService } from '../../../../platform/url/common/url.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { MCP_CONFIGURATION_KEY, WORKSPACE_STANDALONE_CONFIGURATIONS } from '../../../services/configuration/common/configuration.js';
import { IMcpResourceScannerService } from '../../../../platform/mcp/common/mcpResourceScannerService.js';
import { parseCopilotGlobalMcpConfiguration } from '../../../../platform/mcp/common/mcpCopilotGlobalConfiguration.js';
import { IMcpCopilotGlobalConfigurationService } from '../common/mcpCopilotGlobalConfigurationService.js';
import { ACTIVE_GROUP, IEditorService, MODAL_GROUP } from '../../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { DidUninstallWorkbenchMcpServerEvent, IWorkbenchLocalMcpServer, IWorkbenchMcpManagementService, IWorkbenchMcpServerInstallResult, IWorkbencMcpServerInstallOptions, LocalMcpServerScope, REMOTE_USER_CONFIG_ID, USER_CONFIG_ID, WORKSPACE_CONFIG_ID, WORKSPACE_FOLDER_CONFIG_ID_PREFIX } from '../../../services/mcp/common/mcpWorkbenchManagementService.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
import { mcpConfigurationSection } from '../common/mcpConfiguration.js';
import { McpServerInstallData, McpServerInstallClassification } from '../common/mcpServer.js';
import { HasInstalledMcpServersContext, IEditableMcpServerConfiguration, IMcpConfigPath, IMcpServerEditorOptions, IMcpService, IMcpWorkbenchService, IWorkbenchMcpServer, McpCollectionProvenance, McpCollectionSortOrder, McpServerEditorTab, McpServerEnablementState, McpServerInstallState, McpServerEnablementStatus, McpServersGalleryStatusContext } from '../common/mcpTypes.js';
import { McpResourceFormat, WORKSPACE_ROOT_MCP_COLLECTION_ID_PREFIX, WORKSPACE_ROOT_MCP_CONFIG_FILE } from '../../../../platform/mcp/common/mcpWorkspaceConfiguration.js';
import { ContributionEnablementState } from '../../chat/common/enablement.js';
import { McpServerEditorInput } from './mcpServerEditorInput.js';
import { IMcpGalleryManifest, IMcpGalleryManifestService } from '../../../../platform/mcp/common/mcpGalleryManifest.js';
import { IIterativePager, IIterativePage } from '../../../../base/common/paging.js';
import { AICustomizationManagementCommands, AICustomizationManagementSection, IAICustomizationMarketplaceOpenTarget } from '../../chat/common/aiCustomizationWorkspaceService.js';
import { IExtensionsWorkbenchService } from '../../extensions/common/extensions.js';
import { autorun } from '../../../../base/common/observable.js';
import Severity from '../../../../base/common/severity.js';
import { ThrottledDelayer } from '../../../../base/common/async.js';
import { McpGalleryServerUrlError } from '../../../../platform/mcp/common/mcpGalleryService.js';

interface IMcpServerStateProvider<T> {
	(mcpWorkbenchServer: McpWorkbenchServer): T;
}

interface IMcpInstallUriPayload {
	readonly name: string;
	readonly config: IMcpServerConfiguration;
	readonly inputs?: IMcpServerVariable[];
}

function parseMcpInstallUriPayload(query: string): IMcpInstallUriPayload | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(decodeURIComponent(query));
	} catch {
		return undefined;
	}

	if (!isObject(parsed)) {
		return undefined;
	}

	const payload = parsed as Record<string, unknown>;
	if (!isString(payload.name) || !payload.name) {
		return undefined;
	}

	const config = sanitizeMcpServerConfiguration(payload);
	if (!config) {
		return undefined;
	}

	return {
		name: payload.name,
		config,
		inputs: Array.isArray(payload.inputs) ? payload.inputs as IMcpServerVariable[] : undefined,
	};
}

function sanitizeMcpServerConfiguration(payload: Record<string, unknown>): IMcpServerConfiguration | undefined {
	const type = payload.type === McpServerType.LOCAL || payload.type === McpServerType.REMOTE
		? payload.type
		: isString(payload.command)
			? McpServerType.LOCAL
			: McpServerType.REMOTE;
	const dev = sanitizeMcpDevModeConfig(payload.dev);

	const common = {
		...(isString(payload.version) ? { version: payload.version } : {}),
		...(isBoolean(payload.gallery) || isString(payload.gallery) ? { gallery: payload.gallery } : {}),
		...(dev ? { dev } : {}),
	};

	if (type === McpServerType.LOCAL) {
		if (!isString(payload.command)) {
			return undefined;
		}
		const env = sanitizeMcpEnvironment(payload.env);

		return {
			type,
			command: payload.command,
			...common,
			...(isStringArray(payload.args) ? { args: payload.args } : {}),
			...(env ? { env } : {}),
			...(isString(payload.envFile) ? { envFile: payload.envFile } : {}),
			...(isString(payload.cwd) ? { cwd: payload.cwd } : {}),
			...(isBoolean(payload.sandboxEnabled) ? { sandboxEnabled: payload.sandboxEnabled } : {}),
		} satisfies IMcpStdioServerConfiguration;
	}

	if (!isString(payload.url)) {
		return undefined;
	}
	const headers = sanitizeStringRecord(payload.headers);
	const oauth = sanitizeMcpOAuthConfiguration(payload.oauth);

	return {
		type,
		url: payload.url,
		...common,
		...(payload.transport === 'http' || payload.transport === 'sse' ? { transport: payload.transport } : {}),
		...(headers ? { headers } : {}),
		...(oauth ? { oauth } : {}),
	} satisfies IMcpRemoteServerConfiguration;
}

function sanitizeMcpDevModeConfig(value: unknown): IMcpDevModeConfig | undefined {
	if (!isObject(value)) {
		return undefined;
	}

	const payload = value as Record<string, unknown>;
	const debug = sanitizeMcpDevModeDebugConfiguration(payload.debug);
	if (!isString(payload.watch) && !isStringArray(payload.watch) && !debug) {
		return undefined;
	}

	return {
		...(isString(payload.watch) || isStringArray(payload.watch) ? { watch: payload.watch } : {}),
		...(debug ? { debug } : {}),
	};
}

function sanitizeMcpDevModeDebugConfiguration(value: unknown): IMcpDevModeConfig['debug'] | undefined {
	if (!isObject(value)) {
		return undefined;
	}

	const payload = value as Record<string, unknown>;
	if (payload.type === 'node') {
		return { type: 'node' };
	}
	if (payload.type === 'debugpy') {
		return {
			type: 'debugpy',
			...(isString(payload.debugpyPath) ? { debugpyPath: payload.debugpyPath } : {}),
		};
	}
	return undefined;
}

function sanitizeMcpEnvironment(value: unknown): Record<string, string | number | null> | undefined {
	return sanitizeRecord(value, entry => entry === null || isString(entry) || isNumber(entry));
}

function sanitizeStringRecord(value: unknown): Record<string, string> | undefined {
	return sanitizeRecord(value, isString);
}

function sanitizeRecord<T>(value: unknown, isValidValue: (entry: unknown) => entry is T): Record<string, T> | undefined {
	if (!isObject(value)) {
		return undefined;
	}

	return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, T] => isValidValue(entry[1])));
}

function sanitizeMcpOAuthConfiguration(value: unknown): IMcpRemoteServerConfiguration['oauth'] | undefined {
	if (!isObject(value)) {
		return undefined;
	}

	const payload = value as Record<string, unknown>;
	return isString(payload.clientId) ? { clientId: payload.clientId } : undefined;
}

class McpWorkbenchServer implements IWorkbenchMcpServer {

	constructor(
		private installStateProvider: IMcpServerStateProvider<McpServerInstallState>,
		private runtimeStateProvider: IMcpServerStateProvider<McpServerEnablementStatus | undefined>,
		public local: IWorkbenchLocalMcpServer | undefined,
		public gallery: IGalleryMcpServer | undefined,
		public readonly installable: IInstallableMcpServer | undefined,
		@IMcpGalleryService private readonly mcpGalleryService: IMcpGalleryService,
		@IFileService private readonly fileService: IFileService,
	) {
		this.local = local;
	}

	get id(): string {
		return this.local?.id ?? this.gallery?.name ?? this.installable?.name ?? this.name;
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

	get starsCount(): number {
		return this.gallery?.starsCount ?? 0;
	}

	get license(): string | undefined {
		return this.gallery?.license;
	}

	get repository(): string | undefined {
		return this.gallery?.repositoryUrl;
	}

	get config(): IMcpServerConfiguration | undefined {
		return this.local?.config ?? this.installable?.config;
	}

	get runtimeStatus(): McpServerEnablementStatus | undefined {
		return this.runtimeStateProvider(this);
	}

	get readmeUrl(): URI | undefined {
		return this.local?.readmeUrl ?? (this.gallery?.readmeUrl ? URI.parse(this.gallery.readmeUrl) : undefined);
	}

	async getReadme(token: CancellationToken): Promise<string> {
		if (this.local?.readmeUrl) {
			const content = await this.fileService.readFile(this.local.readmeUrl);
			return content.value.toString();
		}

		if (this.gallery?.readme) {
			return this.gallery.readme;
		}

		if (this.gallery?.readmeUrl) {
			return this.mcpGalleryService.getReadme(this.gallery, token);
		}

		return Promise.reject(new Error('not available'));
	}

	async getManifest(token: CancellationToken): Promise<IGalleryMcpServerConfiguration> {
		if (this.local?.manifest) {
			return this.local.manifest;
		}

		if (this.gallery) {
			return this.gallery.configuration;
		}

		throw new Error('No manifest available');
	}

}

export class McpWorkbenchService extends Disposable implements IMcpWorkbenchService {

	_serviceBrand: undefined;

	private installing: McpWorkbenchServer[] = [];
	private uninstalling: McpWorkbenchServer[] = [];

	private _local: McpWorkbenchServer[] = [];
	private registrySyncGeneration = 0;
	private registryGeneration = 0;
	private localQueryGeneration = 0;
	private profileChangeGeneration = 0;
	// Source identity is intentionally trusted only in-process; IPC copies are re-verified.
	private readonly gallerySourceGenerations = new WeakMap<IGalleryMcpServer, number>();
	private readonly registrySyncDelayer = this._register(new ThrottledDelayer<void>(0));
	readonly whenInitialLocalMcpServersLoaded: Promise<void>;
	get local(): readonly McpWorkbenchServer[] { return [...this._local]; }

	private readonly _onChange = this._register(new Emitter<IWorkbenchMcpServer | undefined>());
	readonly onChange = this._onChange.event;

	private readonly _onReset = this._register(new Emitter<void>());
	readonly onReset = this._onReset.event;

	constructor(
		@IMcpGalleryManifestService private readonly mcpGalleryManifestService: IMcpGalleryManifestService,
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
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ILogService private readonly logService: ILogService,
		@ICommandService private readonly commandService: ICommandService,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@INotificationService private readonly notificationService: INotificationService,
		@IAllowedMcpServersService private readonly allowedMcpServersService: IAllowedMcpServersService,
		@IMcpService private readonly mcpService: IMcpService,
		@IMcpResourceScannerService private readonly mcpResourceScannerService: IMcpResourceScannerService,
		@IMcpCopilotGlobalConfigurationService private readonly copilotGlobalConfigurationService: IMcpCopilotGlobalConfigurationService,
		@IFileService private readonly fileService: IFileService,
		@IURLService urlService: IURLService,
	) {
		super();
		this._register(this.mcpManagementService.onDidInstallMcpServersInCurrentProfile(e => this.onDidInstallMcpServers(e)));
		this._register(this.mcpManagementService.onDidUpdateMcpServersInCurrentProfile(e => this.onDidUpdateMcpServers(e)));
		this._register(this.mcpManagementService.onDidUninstallMcpServerInCurrentProfile(e => this.onDidUninstallMcpServer(e)));
		this._register(this.mcpManagementService.onDidChangeProfile(e => this.onDidChangeProfile()));
		this._register(mcpGalleryManifestService.onDidChangeMcpGalleryManifest(() => {
			this.invalidateRegistryVerification();
			this.scheduleRegistrySync();
		}));
		this.whenInitialLocalMcpServersLoaded = this.queryLocal().then(() => undefined, error => this.logService.error(error));
		urlService.registerHandler(this);
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(mcpAccessConfig)) {
				this._onChange.fire(undefined);
			}
		}));
		this._register(this.allowedMcpServersService.onDidChangeAllowedMcpServers(() => {
			this._local = this.sort(this._local);
			this._onChange.fire(undefined);
		}));
		this._register(autorun(reader => {
			for (const server of mcpService.servers.read(reader)) {
				server.enablement.read(reader);
			}
			this._local = this.sort(this._local);
			this._onChange.fire(undefined);
		}));
	}

	private async onDidChangeProfile() {
		const profileChangeGeneration = ++this.profileChangeGeneration;
		const generation = ++this.localQueryGeneration;
		this.invalidateRegistryVerification();
		await this.queryLocalForGeneration(generation);
		if (profileChangeGeneration !== this.profileChangeGeneration) {
			return;
		}
		this._onReset.fire();
	}

	private invalidateRegistryVerification(): void {
		this.registryGeneration++;
		this.registrySyncGeneration++;
		for (const server of this._local) {
			server.gallery = undefined;
		}
		this._onChange.fire(undefined);
	}

	private areSameMcpServers(a: { name: string; scope: LocalMcpServerScope; mcpResource: URI } | undefined, b: { name: string; scope: LocalMcpServerScope; mcpResource: URI } | undefined): boolean {
		if (a === b) {
			return true;
		}
		if (!a || !b) {
			return false;
		}
		return a.name === b.name && a.scope === b.scope && this.uriIdentityService.extUri.isEqual(a.mcpResource, b.mcpResource);
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
		let needsRegistrySync = false;
		for (const { local, source } of e) {
			let server = local ? this.installing.find(server => this.areSameMcpServers(server.local, local)) : undefined;
			this.installing = server ? this.installing.filter(e => e !== server) : this.installing;
			if (local) {
				const trustedGallery = this.getTrustedGallerySource(source, local) ?? this.getTrustedGallerySource(server?.gallery, local);
				if (server) {
					server.local = local;
				} else {
					server = this.instantiationService.createInstance(McpWorkbenchServer, e => this.getInstallState(e), e => this.getRuntimeStatus(e), local, undefined, undefined);
				}
				server.gallery = trustedGallery?.name === local.name ? trustedGallery : undefined;
				needsRegistrySync = true;
				this._local = this._local.filter(server => !this.areSameMcpServers(server.local, local));
				this.addServer(server);
			}
			this._onChange.fire(server);
		}
		if (needsRegistrySync) {
			this.scheduleRegistrySync();
		}
	}

	private onDidUpdateMcpServers(e: readonly IWorkbenchMcpServerInstallResult[]) {
		let needsRegistrySync = false;
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
				server = this.instantiationService.createInstance(McpWorkbenchServer, e => this.getInstallState(e), e => this.getRuntimeStatus(e), result.local, undefined, undefined);
				this.addServer(server);
			}
			const trustedGallery = this.getTrustedGallerySource(result.source, result.local) ?? this.getTrustedGallerySource(server.gallery, result.local);
			server.gallery = trustedGallery?.name === result.local.name ? trustedGallery : undefined;
			needsRegistrySync = true;
			this._onChange.fire(server);
		}
		if (needsRegistrySync) {
			this.scheduleRegistrySync();
		}
	}

	private fromGallery(gallery: IGalleryMcpServer, registryGeneration: number): IWorkbenchMcpServer | undefined {
		this.rememberGallerySource(gallery, registryGeneration);
		return this.getInstalledGalleryServer(gallery.name);
	}

	private getInstalledGalleryServer(name: string): McpWorkbenchServer | undefined {
		return this._local.find(server => server.local?.format !== McpResourceFormat.WorkspaceRoot && server.name === name);
	}

	private scheduleRegistrySync(): void {
		const generation = ++this.registrySyncGeneration;
		void this.registrySyncDelayer.trigger(() => this.syncInstalledMcpServers(generation))
			.catch(error => this.logService.error(error));
	}

	private async syncInstalledMcpServers(generation: number): Promise<void> {
		if (!this.mcpGalleryService.isEnabled()) {
			return;
		}

		const servers = this.local.flatMap(server => server.local && server.local.format !== McpResourceFormat.WorkspaceRoot ? [{ server, local: server.local }] : []);
		const infosByName = new Map<string, { name: string; id?: string }>();
		for (const { local } of servers) {
			const existing = infosByName.get(local.name);
			if (!existing || (!existing.id && local.galleryId)) {
				infosByName.set(local.name, { name: local.name, id: local.galleryId });
			}
		}
		const infos = [...infosByName.values()];

		if (!infos.length) {
			return;
		}

		const resolved = await this.mcpGalleryService.resolveMcpServersFromGallery(infos);
		if (generation !== this.registrySyncGeneration) {
			return;
		}
		this.syncInstalledMcpServersWithGallery(resolved, servers, generation);
	}

	private syncInstalledMcpServersWithGallery(
		resolved: Map<string, IMcpGalleryServerResolveResult>,
		servers: readonly { server: McpWorkbenchServer; local: IWorkbenchLocalMcpServer }[],
		generation: number,
	): void {
		for (const { server: mcpServer, local } of servers) {
			if (generation !== this.registrySyncGeneration || !this._local.includes(mcpServer) || mcpServer.local !== local) {
				continue;
			}

			const result = resolved.get(local.name);

			// Undetermined (e.g. registry unreachable): keep the current state so a
			// transient failure never disables a previously verified server.
			if (!result || result.status === McpGalleryResolveStatus.Failed) {
				continue;
			}

			if (result.status === McpGalleryResolveStatus.NotFound) {
				if (mcpServer.gallery) {
					mcpServer.gallery = undefined;
					this._onChange.fire(mcpServer);
				}
				continue;
			}

			const gallery = result.server;
			const changed = mcpServer.gallery !== gallery;
			this.rememberGallerySource(gallery);
			mcpServer.gallery = gallery;
			if (changed) {
				this._onChange.fire(mcpServer);
			}
		}
	}

	async queryGallery(options?: IQueryOptions, token?: CancellationToken, manifest?: IMcpGalleryManifest): Promise<IIterativePager<IWorkbenchMcpServer>> {
		if (!this.mcpGalleryService.isEnabled()) {
			return {
				firstPage: { items: [], hasMore: false },
				getNextPage: async () => ({ items: [], hasMore: false })
			};
		}
		const registryGeneration = this.registryGeneration;
		const pager = await this.mcpGalleryService.query(options, token, manifest);
		const mapPage = (page: IIterativePage<IGalleryMcpServer>): IIterativePage<IWorkbenchMcpServer> => ({
			items: page.items.map(gallery => this.fromGallery(gallery, registryGeneration) ?? this.instantiationService.createInstance(McpWorkbenchServer, e => this.getInstallState(e), e => this.getRuntimeStatus(e), undefined, gallery, undefined)),
			hasMore: page.hasMore
		});

		return {
			firstPage: mapPage(pager.firstPage),
			getNextPage: async (ct) => {
				const nextPage = await pager.getNextPage(ct);
				return mapPage(nextPage);
			}
		};
	}

	async queryLocal(): Promise<IWorkbenchMcpServer[]> {
		await this.queryLocalForGeneration(++this.localQueryGeneration);
		return [...this.local];
	}

	private async queryLocalForGeneration(generation: number): Promise<boolean> {
		const installed = await this.mcpManagementService.getInstalled();
		if (generation !== this.localQueryGeneration) {
			return false;
		}
		this._local = this.sort(installed.map(i => {
			const existing = this._local.find(local => local.id === i.id);
			const local = existing ?? this.instantiationService.createInstance(McpWorkbenchServer, e => this.getInstallState(e), e => this.getRuntimeStatus(e), undefined, undefined, undefined);
			local.local = i;
			return local;
		}));
		this._onChange.fire(undefined);
		this.scheduleRegistrySync();
		return true;
	}

	private rememberGallerySource(gallery: IGalleryMcpServer, registryGeneration = this.registryGeneration): void {
		if (registryGeneration === this.registryGeneration) {
			this.gallerySourceGenerations.set(gallery, registryGeneration);
		}
	}

	private getTrustedGallerySource(gallery: IGalleryMcpServer | undefined, local?: IWorkbenchLocalMcpServer): IGalleryMcpServer | undefined {
		return local?.format !== McpResourceFormat.WorkspaceRoot && gallery && this.gallerySourceGenerations.get(gallery) === this.registryGeneration ? gallery : undefined;
	}

	private addServer(server: McpWorkbenchServer): void {
		this._local.push(server);
		this._local = this.sort(this._local);
	}

	private sort(local: McpWorkbenchServer[]): McpWorkbenchServer[] {
		return local.sort((a, b) => {
			if (a.name === b.name) {
				const aEnabled = !a.runtimeStatus || a.runtimeStatus.state === McpServerEnablementState.Enabled;
				const bEnabled = !b.runtimeStatus || b.runtimeStatus.state === McpServerEnablementState.Enabled;
				if (aEnabled !== bEnabled) {
					return aEnabled ? -1 : 1;
				}
				return a.id.localeCompare(b.id);
			}
			return a.name.localeCompare(b.name);
		});
	}

	getEnabledLocalMcpServers(): IWorkbenchLocalMcpServer[] {
		const result = new Map<string, IWorkbenchLocalMcpServer>();
		const userRemote: IWorkbenchLocalMcpServer[] = [];
		const workspace: IWorkbenchLocalMcpServer[] = [];

		// Discovery precedence must not depend on runtime-dependent display ordering.
		for (const server of this.local.toSorted((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))) {
			// Root servers are published independently; exclude them before resolving installed-name precedence.
			if (server.local?.format === McpResourceFormat.WorkspaceRoot) {
				continue;
			}
			const enablementStatus = this.getEnablementStatus(server);
			if (enablementStatus && enablementStatus.state !== McpServerEnablementState.Enabled) {
				continue;
			}

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

	async getMcpServerFromGallery(name: string, manifest?: IMcpGalleryManifest): Promise<IWorkbenchMcpServer | undefined> {
		const registryGeneration = this.registryGeneration;
		const servers = await this.mcpGalleryService.getMcpServersFromGallery([{ name }], manifest);
		if (registryGeneration !== this.registryGeneration) {
			throw new Error(localize('mcpRegistryChangedDuringLookup', "The MCP registry changed. Try installing the server again."));
		}
		const gallery = servers.find(server => server.name === name);
		if (!gallery) {
			return undefined;
		}
		this.rememberGallerySource(gallery, registryGeneration);
		const installed = this.getInstalledGalleryServer(gallery.name);
		return gallery.galleryUrl && installed?.local?.galleryUrl === gallery.galleryUrl && installed.gallery?.name === gallery.name
			? installed
			: this.instantiationService.createInstance(McpWorkbenchServer, e => this.getInstallState(e), e => this.getRuntimeStatus(e), undefined, gallery, undefined);
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

	async install(server: IWorkbenchMcpServer, installOptions?: IWorkbencMcpServerInstallOptions): Promise<IWorkbenchMcpServer> {
		if (!(server instanceof McpWorkbenchServer)) {
			throw new Error('Invalid server instance');
		}

		if (server.installable) {
			const installable = server.installable;
			return this.doInstall(server, () => this.mcpManagementService.install(installable, installOptions));
		}

		if (server.gallery) {
			const gallery = server.gallery;
			return this.doInstall(server, () => this.mcpManagementService.installFromGallery(gallery, installOptions));
		}

		throw new Error('No installable server found');
	}

	async uninstall(server: IWorkbenchMcpServer): Promise<void> {
		if (!server.local) {
			throw new Error('Local server is missing');
		}
		await this.mcpManagementService.uninstall(server.local);
	}

	async resolveEditableMcpServerConfiguration(source: URI, name: string): Promise<IEditableMcpServerConfiguration | undefined> {
		const root = this._local.find(server => server.local?.format === McpResourceFormat.WorkspaceRoot && server.local.name === name && this.uriIdentityService.extUri.isEqual(server.local.mcpResource, source))?.local;
		if (root) {
			return {
				config: root.config,
				format: McpResourceFormat.WorkspaceRoot,
				save: (previous, next) => this.mcpResourceScannerService.updateMcpServer(name, previous, next, root.mcpResource, ConfigurationTarget.WORKSPACE_FOLDER, McpResourceFormat.WorkspaceRoot),
			};
		}

		const resource = await this.copilotGlobalConfigurationService.getConfigurationResource();
		if (!resource || !this.uriIdentityService.extUri.isEqual(resource, source)) {
			return undefined;
		}
		const content = (await this.fileService.readFile(resource)).value.toString();
		const config = parseCopilotGlobalMcpConfiguration(content)[name];
		if (!config) {
			return undefined;
		}
		return {
			config,
			format: McpResourceFormat.CopilotGlobal,
			save: (previous, next) => this.mcpResourceScannerService.updateMcpServer(name, previous, next, resource, undefined, McpResourceFormat.CopilotGlobal),
		};
	}

	private async doInstall(server: McpWorkbenchServer, installTask: () => Promise<IWorkbenchLocalMcpServer>): Promise<IWorkbenchMcpServer> {
		const source = server.gallery ? 'gallery' : 'local';
		const serverName = server.name;
		// Check for inputs in installable config or if it comes from handleURL with inputs
		const hasInputs = !!(server.installable?.inputs && server.installable.inputs.length > 0);

		this.installing.push(server);
		this._onChange.fire(server);

		try {
			const local = await installTask();
			let result = this.local.find(candidate => this.areSameMcpServers(candidate.local, local));
			if (!server.local || !result) {
				if (!server.local) {
					const gallery = this.getTrustedGallerySource(result?.gallery, local) ?? this.getTrustedGallerySource(server.gallery, local);
					this._local = this._local.filter(candidate => candidate !== result);
					server.local = local;
					server.gallery = gallery;
					result = server;
				} else {
					result = this.instantiationService.createInstance(McpWorkbenchServer, e => this.getInstallState(e), e => this.getRuntimeStatus(e), local, this.getTrustedGallerySource(server.gallery, local), undefined);
				}
				this.addServer(result);
				this._onChange.fire(result);
				this.scheduleRegistrySync();
			}

			// Track successful installation
			this.telemetryService.publicLog2<McpServerInstallData, McpServerInstallClassification>('mcp/serverInstall', {
				serverName,
				source,
				scope: result.local?.scope ?? 'unknown',
				success: true,
				hasInputs
			});

			return result;
		} catch (error) {
			// Track failed installation
			this.telemetryService.publicLog2<McpServerInstallData, McpServerInstallClassification>('mcp/serverInstall', {
				serverName,
				source,
				scope: 'unknown',
				success: false,
				error: error instanceof Error ? error.message : String(error),
				hasInputs
			});

			throw error;
		} finally {
			if (this.installing.includes(server)) {
				this.installing.splice(this.installing.indexOf(server), 1);
				this._onChange.fire(server);
			}
		}
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
			if (this.uriIdentityService.extUri.isEqual(workspaceFolder.toResource(WORKSPACE_ROOT_MCP_CONFIG_FILE), mcpResource)) {
				const collectionId = `${WORKSPACE_ROOT_MCP_COLLECTION_ID_PREFIX}${workspaceFolder.index}`;
				return {
					id: collectionId,
					collectionId,
					format: McpResourceFormat.WorkspaceRoot,
					provenance: McpCollectionProvenance.WorkspaceDotMcp,
					key: 'workspaceFolderValue',
					target: ConfigurationTarget.WORKSPACE_FOLDER,
					label: `${workspaceFolder.name}/${WORKSPACE_ROOT_MCP_CONFIG_FILE}`,
					scope: StorageScope.WORKSPACE,
					remoteAuthority: this.environmentService.remoteAuthority,
					order: McpCollectionSortOrder.WorkspaceFolder + 1,
					uri: mcpResource,
					workspaceFolder,
				};
			}
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
		if (uri.path === 'mcp/install') {
			return this.handleMcpInstallUri(uri);
		}
		if (uri.path.startsWith('mcp/by-name/')) {
			const mcpServerName = uri.path.substring('mcp/by-name/'.length);
			if (mcpServerName) {
				return this.handleMcpServerByName(mcpServerName);
			}
			this.notificationService.warn(localize('mcpLinkMissingName', "This MCP link does not specify a server. Browse MCP servers to find an available server."));
			await this.openSearch('');
			return true;
		}
		if (uri.path.startsWith('mcp/')) {
			const mcpServerUrl = uri.path.substring(4);
			if (mcpServerUrl) {
				return this.handleMcpServerUrl(`${Schemas.https}://${mcpServerUrl}`);
			}
		}
		return false;
	}

	private async handleMcpInstallUri(uri: URI): Promise<boolean> {
		const parsed = parseMcpInstallUriPayload(uri.query);
		if (!parsed) {
			return false;
		}

		try {
			const { name, inputs, config } = parsed;

			// When a gallery field is present and the gallery service is available,
			// verify the server exists in the active gallery by name. If verified,
			// route through the gallery-only path (matching handleMcpServerByName).
			if (config.gallery && this.mcpGalleryService.isEnabled()) {
				const registryGeneration = this.registryGeneration;
				let galleryServer: IGalleryMcpServer | undefined;
				try {
					// Verify by name against the active gallery (not by URL, which would
					// make outbound requests to untrusted URLs from the protocol payload).
					[galleryServer] = await this.mcpGalleryService.getMcpServersFromGallery([{ name }]);
				} catch (e) {
					this.logService.warn(`Gallery verification failed for MCP server '${name}', opening its local configuration`, e);
				}
				if (galleryServer) {
					this.rememberGallerySource(galleryServer, registryGeneration);
					await this.openGallery(galleryServer);
					return true;
				}
				this.logService.info(`MCP server '${name}' not found in gallery, opening its local configuration`);
			}

			await this.open(this.instantiationService.createInstance(McpWorkbenchServer, e => this.getInstallState(e), e => this.getRuntimeStatus(e), undefined, undefined, { name, config, inputs }));
		} catch (e) {
			this.logService.error(e);
			throw e;
		}
		return true;
	}

	private async handleMcpServerUrl(url: string): Promise<boolean> {
		try {
			const gallery = await this.mcpGalleryService.getMcpServer(url);
			if (!gallery) {
				this.logService.info(`MCP server '${url}' not found`);
				this.notificationService.warn(localize('mcpLinkUnavailable', "This MCP link is no longer available in the configured registry. Browse MCP servers to find an available server."));
				await this.openSearch('');
				return true;
			}
			await this.openGallery(gallery);
		} catch (e) {
			this.logService.error(e);
			if (e instanceof McpGalleryServerUrlError && this.isMarketplaceEnabled) {
				this.notificationService.warn(localize('mcpLinkOutsideGallery', "This MCP link is not part of the configured registry. Browse MCP servers to find an available server."));
				await this.openSearch('');
			} else {
				this.notificationService.error(e);
			}
		}
		return true;
	}

	private async handleMcpServerByName(name: string): Promise<boolean> {
		const registryGeneration = this.registryGeneration;
		const manifest = await this.mcpGalleryManifestService.getMcpGalleryManifest();
		if (!manifest) {
			if (this.isMarketplaceEnabled) {
				await this.openMarketplace({ section: AICustomizationManagementSection.McpServers, mcpServer: { name } });
			} else {
				this.logService.info(`Cannot open MCP server '${name}': no MCP gallery configured`);
				this.notificationService.warn(localize('mcpLinkGalleryNotConfigured', "The MCP gallery is not configured. Configure 'chat.mcp.gallery.serviceUrl' to open MCP server details."));
			}
			return true;
		}

		const result = (await this.mcpGalleryService.resolveMcpServersFromGallery([{ name }], manifest)).get(name);
		if (result?.status === McpGalleryResolveStatus.Found) {
			const gallery = result.server;
			this.rememberGallerySource(gallery, registryGeneration);
			await this.openGallery(gallery);
		} else if (result?.status === McpGalleryResolveStatus.Failed && !this.isMarketplaceEnabled) {
			this.logService.info(`Cannot determine whether MCP server '${name}' is available: the configured registry could not be reached`);
			this.notificationService.warn(localize('mcpLinkLookupRetry', "The MCP registry could not be reached. Check your connection or sign-in, then try this link again."));
		} else if (this.isMarketplaceEnabled) {
			if (result?.status === McpGalleryResolveStatus.Failed) {
				this.notificationService.warn(localize('mcpLegacyGalleryUnavailable', "The MCP registry could not be reached. Looking for this server in Customizations."));
			}
			await this.openMarketplace({ section: AICustomizationManagementSection.McpServers, mcpServer: { name, registryUrl: manifest?.url } });
		} else {
			this.logService.info(`MCP server '${name}' not found`);
			this.notificationService.warn(localize('mcpServerNotFound', "MCP server '{0}' was not found in the configured registry.", name));
		}
		return true;
	}

	async openSearch(searchValue: string, preserveFocus?: boolean): Promise<void> {
		if (this.isMarketplaceEnabled) {
			await this.openMarketplace({
				section: AICustomizationManagementSection.McpServers,
				searchQuery: searchValue ? `@type:mcp ${searchValue}` : '@type:mcp',
				preserveFocus,
			});
		} else {
			await this.extensionsWorkbenchService.openSearch(`@mcp ${searchValue}`, preserveFocus);
		}
	}

	private get isMarketplaceEnabled(): boolean {
		return this.configurationService.getValue<boolean>(CustomizationMarketplaceConfiguration.MarketplaceEnabled) === true;
	}

	private async openMarketplace(target: IAICustomizationMarketplaceOpenTarget): Promise<void> {
		await this.commandService.executeCommand(AICustomizationManagementCommands.OpenMarketplace, target);
	}

	private async openGallery(gallery: IGalleryMcpServer, options?: IMcpServerEditorOptions): Promise<void> {
		if (!this.isMarketplaceEnabled) {
			const server = this.getInstalledGalleryServer(gallery.name) ?? this.instantiationService.createInstance(McpWorkbenchServer, e => this.getInstallState(e), e => this.getRuntimeStatus(e), undefined, gallery, undefined);
			await this.open(server, options);
			return;
		}
		await this.openMarketplace({
			section: AICustomizationManagementSection.McpServers,
			mcpServer: { name: gallery.name, registryUrl: gallery.galleryUrl },
			preserveFocus: options?.preserveFocus,
		});
	}

	async open(extension: IWorkbenchMcpServer, options?: IMcpServerEditorOptions): Promise<void> {
		if (this.isMarketplaceEnabled && extension.gallery && options?.tab !== McpServerEditorTab.Configuration) {
			await this.openGallery(extension.gallery, options);
			return;
		}
		const useModal = this.configurationService.getValue<boolean>('extensions.allowOpenInModalEditor');
		await this.editorService.openEditor(this.instantiationService.createInstance(McpServerEditorInput, extension), options, useModal ? MODAL_GROUP : ACTIVE_GROUP);
	}

	private getInstallState(extension: McpWorkbenchServer): McpServerInstallState {
		if (this.installing.some(server => server === extension || server.local && extension.local && this.areSameMcpServers(server.local, extension.local))) {
			return McpServerInstallState.Installing;
		}
		if (this.uninstalling.some(server => server === extension || server.local && extension.local && this.areSameMcpServers(server.local, extension.local))) {
			return McpServerInstallState.Uninstalling;
		}
		const local = this.local.find(e => e === extension);
		return local ? McpServerInstallState.Installed : McpServerInstallState.Uninstalled;
	}

	private getRuntimeStatus(mcpServer: McpWorkbenchServer): McpServerEnablementStatus | undefined {
		const enablementStatus = this.getEnablementStatus(mcpServer);

		if (enablementStatus) {
			return enablementStatus;
		}

		const server = this.mcpService.servers.get().find(s => s.definition.id === mcpServer.id);
		if (!server) {
			return { state: McpServerEnablementState.Disabled };
		}

		const enablement = server.enablement.get();
		if (enablement === ContributionEnablementState.DisabledProfile) {
			return {
				state: McpServerEnablementState.DisabledProfile,
				message: {
					severity: Severity.Info,
					text: new MarkdownString(localize('disabled globally', "This MCP server is disabled."))
				}
			};
		}
		if (enablement === ContributionEnablementState.DisabledWorkspace) {
			return {
				state: McpServerEnablementState.DisabledWorkspace,
				message: {
					severity: Severity.Info,
					text: new MarkdownString(localize('disabled in workspace', "This MCP server is disabled for this workspace."))
				}
			};
		}

		return undefined;
	}

	private getEnablementStatus(mcpServer: McpWorkbenchServer): McpServerEnablementStatus | undefined {
		if (!mcpServer.local) {
			return undefined;
		}

		const settingsCommandLink = createCommandUri('workbench.action.openSettings', { query: `@id:${mcpAccessConfig}` }).toString();
		const accessValue = this.configurationService.getValue(mcpAccessConfig);

		if (accessValue === McpAccessValue.None) {
			return {
				state: McpServerEnablementState.DisabledByAccess,
				message: {
					severity: Severity.Warning,
					text: new MarkdownString(localize('disabled - all not allowed', "This MCP Server is disabled because MCP servers are configured to be disabled in the Editor. Please check your [settings]({0}).", settingsCommandLink))
				}
			};

		}

		const allowed = this.allowedMcpServersService.isAllowed(mcpServer.local);
		if (allowed !== true) {
			return {
				state: McpServerEnablementState.DisabledByAccess,
				message: { severity: Severity.Warning, text: allowed }
			};
		}

		if (accessValue === McpAccessValue.Registry && !this.allowedMcpServersService.hasManagedAllowlist) {
			if (mcpServer.local.format === McpResourceFormat.WorkspaceRoot || !mcpServer.gallery) {
				return {
					state: McpServerEnablementState.DisabledByAccess,
					message: {
						severity: Severity.Warning,
						text: new MarkdownString(localize('disabled - some not allowed', "This MCP Server is disabled because it is configured to be disabled in the Editor. Please check your [settings]({0}).", settingsCommandLink))
					}
				};
			}

			// Registry membership is name-based for local configurations; remote URLs must match the raw or converted template.
			const remoteUrl = mcpServer.local.config.type === McpServerType.REMOTE && mcpServer.local.config.url;
			if (remoteUrl && !mcpServer.gallery.configuration.remotes?.some(remote => remote.url === remoteUrl || replaceMcpServerVariableReferences(remote.url, remote.variables) === remoteUrl)) {
				return {
					state: McpServerEnablementState.DisabledByAccess,
					message: {
						severity: Severity.Warning,
						text: new MarkdownString(localize('disabled - some not allowed', "This MCP Server is disabled because it is configured to be disabled in the Editor. Please check your [settings]({0}).", settingsCommandLink))
					}
				};
			}
		}

		return undefined;
	}

}

export class MCPContextsInitialisation extends Disposable implements IWorkbenchContribution {

	static ID = 'workbench.mcp.contexts.initialisation';

	constructor(
		@IMcpWorkbenchService mcpWorkbenchService: IMcpWorkbenchService,
		@IMcpGalleryManifestService mcpGalleryManifestService: IMcpGalleryManifestService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		const mcpServersGalleryStatus = McpServersGalleryStatusContext.bindTo(contextKeyService);
		mcpServersGalleryStatus.set(mcpGalleryManifestService.mcpGalleryManifestStatus);
		this._register(mcpGalleryManifestService.onDidChangeMcpGalleryManifestStatus(status => mcpServersGalleryStatus.set(status)));

		const hasInstalledMcpServersContextKey = HasInstalledMcpServersContext.bindTo(contextKeyService);
		mcpWorkbenchService.queryLocal().finally(() => {
			hasInstalledMcpServersContextKey.set(mcpWorkbenchService.local.length > 0);
			this._register(mcpWorkbenchService.onChange(() => hasInstalledMcpServersContextKey.set(mcpWorkbenchService.local.length > 0)));
		});
	}
}
