/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { cloneAndChange } from '../../../base/common/objects.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { DefaultURITransformer, IURITransformer, transformAndReviveIncomingURIs } from '../../../base/common/uriIpc.js';
import { IChannel, IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { ILogService } from '../../log/common/log.js';
import { RemoteAgentConnectionContext } from '../../remote/common/remoteAgentEnvironment.js';
import { DidUninstallMcpServerEvent, IGalleryMcpServer, ILocalMcpServer, IMcpManagementService, IInstallableMcpServer, InstallMcpServerEvent, InstallMcpServerResult, InstallOptions, UninstallMcpServerEvent, UninstallOptions, IAllowedMcpServersService } from './mcpManagement.js';
import { AbstractMcpManagementService } from './mcpManagementService.js';

function transformIncomingURI(uri: UriComponents, transformer: IURITransformer | null): URI;
function transformIncomingURI(uri: UriComponents | undefined, transformer: IURITransformer | null): URI | undefined;
function transformIncomingURI(uri: UriComponents | undefined, transformer: IURITransformer | null): URI | undefined {
	return uri ? URI.revive(transformer ? transformer.transformIncoming(uri) : uri) : undefined;
}

function transformIncomingServer(mcpServer: ILocalMcpServer, transformer: IURITransformer | null): ILocalMcpServer {
	transformer = transformer ? transformer : DefaultURITransformer;
	const manifest = mcpServer.manifest;
	const transformed = transformAndReviveIncomingURIs({ ...mcpServer, ...{ manifest: undefined } }, transformer);
	return { ...transformed, ...{ manifest } };
}

function transformIncomingOptions<O extends { mcpResource?: UriComponents }>(options: O | undefined, transformer: IURITransformer | null): O | undefined {
	return options?.mcpResource ? transformAndReviveIncomingURIs(options, transformer ?? DefaultURITransformer) : options;
}

function transformOutgoingExtension(extension: ILocalMcpServer, transformer: IURITransformer | null): ILocalMcpServer {
	return transformer ? cloneAndChange(extension, value => value instanceof URI ? transformer.transformOutgoingURI(value) : undefined) : extension;
}

function transformOutgoingURI(uri: URI, transformer: IURITransformer | null): URI {
	return transformer ? transformer.transformOutgoingURI(uri) : uri;
}

export class McpManagementChannel<TContext = RemoteAgentConnectionContext | string> implements IServerChannel<TContext> {
	readonly onInstallMcpServer: Event<InstallMcpServerEvent>;
	readonly onDidInstallMcpServers: Event<readonly InstallMcpServerResult[]>;
	readonly onDidUpdateMcpServers: Event<readonly InstallMcpServerResult[]>;
	readonly onUninstallMcpServer: Event<UninstallMcpServerEvent>;
	readonly onDidUninstallMcpServer: Event<DidUninstallMcpServerEvent>;

	constructor(private service: IMcpManagementService, private getUriTransformer: (requestContext: TContext) => IURITransformer | null) {
		this.onInstallMcpServer = Event.buffer(service.onInstallMcpServer, true);
		this.onDidInstallMcpServers = Event.buffer(service.onDidInstallMcpServers, true);
		this.onDidUpdateMcpServers = Event.buffer(service.onDidUpdateMcpServers, true);
		this.onUninstallMcpServer = Event.buffer(service.onUninstallMcpServer, true);
		this.onDidUninstallMcpServer = Event.buffer(service.onDidUninstallMcpServer, true);
	}

	listen<T>(context: TContext, event: string): Event<T> {
		const uriTransformer = this.getUriTransformer(context);
		switch (event) {
			case 'onInstallMcpServer': {
				return Event.map<InstallMcpServerEvent, InstallMcpServerEvent>(this.onInstallMcpServer, event => {
					return { ...event, mcpResource: transformOutgoingURI(event.mcpResource, uriTransformer) };
				}) as Event<T>;
			}
			case 'onDidInstallMcpServers': {
				return Event.map<readonly InstallMcpServerResult[], readonly InstallMcpServerResult[]>(this.onDidInstallMcpServers, results =>
					results.map(i => ({
						...i,
						local: i.local ? transformOutgoingExtension(i.local, uriTransformer) : i.local,
						mcpResource: transformOutgoingURI(i.mcpResource, uriTransformer)
					}))) as Event<T>;
			}
			case 'onDidUpdateMcpServers': {
				return Event.map<readonly InstallMcpServerResult[], readonly InstallMcpServerResult[]>(this.onDidUpdateMcpServers, results =>
					results.map(i => ({
						...i,
						local: i.local ? transformOutgoingExtension(i.local, uriTransformer) : i.local,
						mcpResource: transformOutgoingURI(i.mcpResource, uriTransformer)
					}))) as Event<T>;
			}
			case 'onUninstallMcpServer': {
				return Event.map<UninstallMcpServerEvent, UninstallMcpServerEvent>(this.onUninstallMcpServer, event => {
					return { ...event, mcpResource: transformOutgoingURI(event.mcpResource, uriTransformer) };
				}) as Event<T>;
			}
			case 'onDidUninstallMcpServer': {
				return Event.map<DidUninstallMcpServerEvent, DidUninstallMcpServerEvent>(this.onDidUninstallMcpServer, event => {
					return { ...event, mcpResource: transformOutgoingURI(event.mcpResource, uriTransformer) };
				}) as Event<T>;
			}
		}

		throw new Error('Invalid listen');
	}

	async call<T>(context: TContext, command: string, args?: unknown): Promise<T> {
		const uriTransformer: IURITransformer | null = this.getUriTransformer(context);
		const argsArray = Array.isArray(args) ? args : [];
		switch (command) {
			case 'getInstalled': {
				const mcpServers = await this.service.getInstalled(transformIncomingURI(argsArray[0], uriTransformer));
				return mcpServers.map(e => transformOutgoingExtension(e, uriTransformer)) as T;
			}
			case 'install': {
				return this.service.install(argsArray[0], transformIncomingOptions(argsArray[1], uriTransformer)) as T;
			}
			case 'installFromGallery': {
				return this.service.installFromGallery(argsArray[0], transformIncomingOptions(argsArray[1], uriTransformer)) as T;
			}
			case 'uninstall': {
				return this.service.uninstall(transformIncomingServer(argsArray[0], uriTransformer), transformIncomingOptions(argsArray[1], uriTransformer)) as T;
			}
			case 'updateMetadata': {
				return this.service.updateMetadata(transformIncomingServer(argsArray[0], uriTransformer), argsArray[1], transformIncomingURI(argsArray[2], uriTransformer)) as T;
			}
		}

		throw new Error('Invalid call');
	}
}

export class McpManagementChannelClient extends AbstractMcpManagementService implements IMcpManagementService {

	declare readonly _serviceBrand: undefined;

	private readonly _onInstallMcpServer = this._register(new Emitter<InstallMcpServerEvent>());
	get onInstallMcpServer() { return this._onInstallMcpServer.event; }

	private readonly _onDidInstallMcpServers = this._register(new Emitter<readonly InstallMcpServerResult[]>());
	get onDidInstallMcpServers() { return this._onDidInstallMcpServers.event; }

	private readonly _onUninstallMcpServer = this._register(new Emitter<UninstallMcpServerEvent>());
	get onUninstallMcpServer() { return this._onUninstallMcpServer.event; }

	private readonly _onDidUninstallMcpServer = this._register(new Emitter<DidUninstallMcpServerEvent>());
	get onDidUninstallMcpServer() { return this._onDidUninstallMcpServer.event; }

	private readonly _onDidUpdateMcpServers = this._register(new Emitter<InstallMcpServerResult[]>());
	get onDidUpdateMcpServers() { return this._onDidUpdateMcpServers.event; }

	constructor(
		private readonly channel: IChannel,
		@IAllowedMcpServersService allowedMcpServersService: IAllowedMcpServersService,
		@ILogService logService: ILogService
	) {
		super(allowedMcpServersService, logService);
		this._register(this.channel.listen<InstallMcpServerEvent>('onInstallMcpServer')(e => this._onInstallMcpServer.fire(({ ...e, mcpResource: transformIncomingURI(e.mcpResource, null) }))));
		this._register(this.channel.listen<readonly InstallMcpServerResult[]>('onDidInstallMcpServers')(results => this._onDidInstallMcpServers.fire(results.map(e => ({ ...e, local: e.local ? transformIncomingServer(e.local, null) : e.local, mcpResource: transformIncomingURI(e.mcpResource, null) })))));
		this._register(this.channel.listen<readonly InstallMcpServerResult[]>('onDidUpdateMcpServers')(results => this._onDidUpdateMcpServers.fire(results.map(e => ({ ...e, local: e.local ? transformIncomingServer(e.local, null) : e.local, mcpResource: transformIncomingURI(e.mcpResource, null) })))));
		this._register(this.channel.listen<UninstallMcpServerEvent>('onUninstallMcpServer')(e => this._onUninstallMcpServer.fire(({ ...e, mcpResource: transformIncomingURI(e.mcpResource, null) }))));
		this._register(this.channel.listen<DidUninstallMcpServerEvent>('onDidUninstallMcpServer')(e => this._onDidUninstallMcpServer.fire(({ ...e, mcpResource: transformIncomingURI(e.mcpResource, null) }))));
	}

	install(server: IInstallableMcpServer, options?: InstallOptions): Promise<ILocalMcpServer> {
		return Promise.resolve(this.channel.call<ILocalMcpServer>('install', [server, options])).then(local => transformIncomingServer(local, null));
	}

	installFromGallery(extension: IGalleryMcpServer, installOptions?: InstallOptions): Promise<ILocalMcpServer> {
		return Promise.resolve(this.channel.call<ILocalMcpServer>('installFromGallery', [extension, installOptions])).then(local => transformIncomingServer(local, null));
	}

	uninstall(extension: ILocalMcpServer, options?: UninstallOptions): Promise<void> {
		return Promise.resolve(this.channel.call<void>('uninstall', [extension, options]));
	}

	getInstalled(mcpResource?: URI): Promise<ILocalMcpServer[]> {
		return Promise.resolve(this.channel.call<ILocalMcpServer[]>('getInstalled', [mcpResource]))
			.then(servers => servers.map(server => transformIncomingServer(server, null)));
	}

	updateMetadata(local: ILocalMcpServer, gallery: IGalleryMcpServer, mcpResource?: URI): Promise<ILocalMcpServer> {
		return Promise.resolve(this.channel.call<ILocalMcpServer>('updateMetadata', [local, gallery, mcpResource])).then(local => transformIncomingServer(local, null));
	}
}
