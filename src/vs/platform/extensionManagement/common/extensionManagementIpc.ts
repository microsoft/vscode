/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { cloneAndChange } from '../../../base/common/objects.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { DefaultURITransformer, IURITransformer, transformAndReviveIncomingURIs } from '../../../base/common/uriIpc.js';
import { IChannel, IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import {
	IExtensionIdentifier, IExtensionTipsService, IGalleryExtension, ILocalExtension, IExtensionsControlManifest, InstallOptions,
	UninstallOptions, Metadata, IExtensionManagementService, DidUninstallExtensionEvent, InstallExtensionEvent, InstallExtensionResult,
	UninstallExtensionEvent, InstallOperation, InstallExtensionInfo, IProductVersion, DidUpdateExtensionMetadata, UninstallExtensionInfo,
	IAllowedExtensionsService
} from './extensionManagement.js';
import { ExtensionType, IExtensionManifest, TargetPlatform } from '../../extensions/common/extensions.js';
import { IProductService } from '../../product/common/productService.js';
import { CommontExtensionManagementService } from './abstractExtensionManagementService.js';

function transformIncomingURI(uri: UriComponents, transformer: IURITransformer | null): URI;
function transformIncomingURI(uri: UriComponents | undefined, transformer: IURITransformer | null): URI | undefined;
function transformIncomingURI(uri: UriComponents | undefined, transformer: IURITransformer | null): URI | undefined {
	return uri ? URI.revive(transformer ? transformer.transformIncoming(uri) : uri) : undefined;
}

function transformOutgoingURI(uri: URI, transformer: IURITransformer | null): URI {
	return transformer ? transformer.transformOutgoingURI(uri) : uri;
}

function transformIncomingExtension(extension: ILocalExtension, transformer: IURITransformer | null): ILocalExtension {
	transformer = transformer ? transformer : DefaultURITransformer;
	const manifest = extension.manifest;
	const transformed = transformAndReviveIncomingURIs({ ...extension, ...{ manifest: undefined } }, transformer);
	return { ...transformed, ...{ manifest } };
}

function transformIncomingOptions<O extends { profileLocation?: UriComponents }>(options: O | undefined, transformer: IURITransformer | null): O | undefined {
	return options?.profileLocation ? transformAndReviveIncomingURIs(options, transformer ?? DefaultURITransformer) : options;
}

function transformOutgoingExtension(extension: ILocalExtension, transformer: IURITransformer | null): ILocalExtension {
	return transformer ? cloneAndChange(extension, value => value instanceof URI ? transformer.transformOutgoingURI(value) : undefined) : extension;
}

export class ExtensionManagementChannel implements IServerChannel {

	onInstallExtension: Event<InstallExtensionEvent>;
	onDidInstallExtensions: Event<readonly InstallExtensionResult[]>;
	onUninstallExtension: Event<UninstallExtensionEvent>;
	onDidUninstallExtension: Event<DidUninstallExtensionEvent>;
	onDidUpdateExtensionMetadata: Event<DidUpdateExtensionMetadata>;

	constructor(private service: IExtensionManagementService, private getUriTransformer: (requestContext: any) => IURITransformer | null) {
		this.onInstallExtension = Event.buffer(service.onInstallExtension, true);
		this.onDidInstallExtensions = Event.buffer(service.onDidInstallExtensions, true);
		this.onUninstallExtension = Event.buffer(service.onUninstallExtension, true);
		this.onDidUninstallExtension = Event.buffer(service.onDidUninstallExtension, true);
		this.onDidUpdateExtensionMetadata = Event.buffer(service.onDidUpdateExtensionMetadata, true);
	}

	listen(context: any, event: string): Event<any> {
		const uriTransformer = this.getUriTransformer(context);
		switch (event) {
			case 'onInstallExtension': {
				return Event.map<InstallExtensionEvent, InstallExtensionEvent>(this.onInstallExtension, e => {
					return {
						...e,
						profileLocation: e.profileLocation ? transformOutgoingURI(e.profileLocation, uriTransformer) : e.profileLocation
					};
				});
			}
			case 'onDidInstallExtensions': {
				return Event.map<readonly InstallExtensionResult[], readonly InstallExtensionResult[]>(this.onDidInstallExtensions, results =>
					results.map(i => ({
						...i,
						local: i.local ? transformOutgoingExtension(i.local, uriTransformer) : i.local,
						profileLocation: i.profileLocation ? transformOutgoingURI(i.profileLocation, uriTransformer) : i.profileLocation
					})));
			}
			case 'onUninstallExtension': {
				return Event.map<UninstallExtensionEvent, UninstallExtensionEvent>(this.onUninstallExtension, e => {
					return {
						...e,
						profileLocation: e.profileLocation ? transformOutgoingURI(e.profileLocation, uriTransformer) : e.profileLocation
					};
				});
			}
			case 'onDidUninstallExtension': {
				return Event.map<DidUninstallExtensionEvent, DidUninstallExtensionEvent>(this.onDidUninstallExtension, e => {
					return {
						...e,
						profileLocation: e.profileLocation ? transformOutgoingURI(e.profileLocation, uriTransformer) : e.profileLocation
					};
				});
			}
			case 'onDidUpdateExtensionMetadata': {
				return Event.map<DidUpdateExtensionMetadata, DidUpdateExtensionMetadata>(this.onDidUpdateExtensionMetadata, e => {
					return {
						local: transformOutgoingExtension(e.local, uriTransformer),
						profileLocation: transformOutgoingURI(e.profileLocation, uriTransformer)
					};
				});
			}
		}

		throw new Error('Invalid listen');
	}

	async call(context: any, command: string, args?: any): Promise<any> {
		const uriTransformer: IURITransformer | null = this.getUriTransformer(context);
		switch (command) {
			case 'zip': {
				const extension = transformIncomingExtension(args[0], uriTransformer);
				const uri = await this.service.zip(extension);
				return transformOutgoingURI(uri, uriTransformer);
			}
			case 'install': {
				return this.service.install(transformIncomingURI(args[0], uriTransformer), transformIncomingOptions(args[1], uriTransformer));
			}
			case 'installFromLocation': {
				return this.service.installFromLocation(transformIncomingURI(args[0], uriTransformer), transformIncomingURI(args[1], uriTransformer));
			}
			case 'installExtensionsFromProfile': {
				return this.service.installExtensionsFromProfile(args[0], transformIncomingURI(args[1], uriTransformer), transformIncomingURI(args[2], uriTransformer));
			}
			case 'getManifest': {
				return this.service.getManifest(transformIncomingURI(args[0], uriTransformer));
			}
			case 'getTargetPlatform': {
				return this.service.getTargetPlatform();
			}
			case 'installFromGallery': {
				return this.service.installFromGallery(args[0], transformIncomingOptions(args[1], uriTransformer));
			}
			case 'installGalleryExtensions': {
				const arg: InstallExtensionInfo[] = args[0];
				return this.service.installGalleryExtensions(arg.map(({ extension, options }) => ({ extension, options: transformIncomingOptions(options, uriTransformer) ?? {} })));
			}
			case 'uninstall': {
				return this.service.uninstall(transformIncomingExtension(args[0], uriTransformer), transformIncomingOptions(args[1], uriTransformer));
			}
			case 'uninstallExtensions': {
				const arg: UninstallExtensionInfo[] = args[0];
				return this.service.uninstallExtensions(arg.map(({ extension, options }) => ({ extension: transformIncomingExtension(extension, uriTransformer), options: transformIncomingOptions(options, uriTransformer) })));
			}
			case 'reinstallFromGallery': {
				return this.service.reinstallFromGallery(transformIncomingExtension(args[0], uriTransformer));
			}
			case 'getInstalled': {
				const extensions = await this.service.getInstalled(args[0], transformIncomingURI(args[1], uriTransformer), args[2]);
				return extensions.map(e => transformOutgoingExtension(e, uriTransformer));
			}
			case 'toggleAppliationScope': {
				const extension = await this.service.toggleAppliationScope(transformIncomingExtension(args[0], uriTransformer), transformIncomingURI(args[1], uriTransformer));
				return transformOutgoingExtension(extension, uriTransformer);
			}
			case 'copyExtensions': {
				return this.service.copyExtensions(transformIncomingURI(args[0], uriTransformer), transformIncomingURI(args[1], uriTransformer));
			}
			case 'updateMetadata': {
				const e = await this.service.updateMetadata(transformIncomingExtension(args[0], uriTransformer), args[1], transformIncomingURI(args[2], uriTransformer));
				return transformOutgoingExtension(e, uriTransformer);
			}
			case 'resetPinnedStateForAllUserExtensions': {
				return this.service.resetPinnedStateForAllUserExtensions(args[0]);
			}
			case 'getExtensionsControlManifest': {
				return this.service.getExtensionsControlManifest();
			}
			case 'download': {
				return this.service.download(args[0], args[1], args[2]);
			}
			case 'cleanUp': {
				return this.service.cleanUp();
			}
		}

		throw new Error('Invalid call');
	}
}

export interface ExtensionEventResult {
	readonly profileLocation: URI;
	readonly local?: ILocalExtension;
	readonly applicationScoped?: boolean;
}

export class ExtensionManagementChannelClient extends CommontExtensionManagementService implements IExtensionManagementService {

	declare readonly _serviceBrand: undefined;

	protected readonly _onInstallExtension = this._register(new Emitter<InstallExtensionEvent>());
	get onInstallExtension() { return this._onInstallExtension.event; }

	protected readonly _onDidInstallExtensions = this._register(new Emitter<readonly InstallExtensionResult[]>());
	get onDidInstallExtensions() { return this._onDidInstallExtensions.event; }

	protected readonly _onUninstallExtension = this._register(new Emitter<UninstallExtensionEvent>());
	get onUninstallExtension() { return this._onUninstallExtension.event; }

	protected readonly _onDidUninstallExtension = this._register(new Emitter<DidUninstallExtensionEvent>());
	get onDidUninstallExtension() { return this._onDidUninstallExtension.event; }

	protected readonly _onDidUpdateExtensionMetadata = this._register(new Emitter<DidUpdateExtensionMetadata>());
	get onDidUpdateExtensionMetadata() { return this._onDidUpdateExtensionMetadata.event; }

	constructor(
		private readonly channel: IChannel,
		productService: IProductService,
		allowedExtensionsService: IAllowedExtensionsService,
	) {
		super(productService, allowedExtensionsService);
		this._register(this.channel.listen<InstallExtensionEvent>('onInstallExtension')(e => this.onInstallExtensionEvent({ ...e, source: this.isUriComponents(e.source) ? URI.revive(e.source) : e.source, profileLocation: URI.revive(e.profileLocation) })));
		this._register(this.channel.listen<readonly InstallExtensionResult[]>('onDidInstallExtensions')(results => this.onDidInstallExtensionsEvent(results.map(e => ({ ...e, local: e.local ? transformIncomingExtension(e.local, null) : e.local, source: this.isUriComponents(e.source) ? URI.revive(e.source) : e.source, profileLocation: URI.revive(e.profileLocation) })))));
		this._register(this.channel.listen<UninstallExtensionEvent>('onUninstallExtension')(e => this.onUninstallExtensionEvent({ ...e, profileLocation: URI.revive(e.profileLocation) })));
		this._register(this.channel.listen<DidUninstallExtensionEvent>('onDidUninstallExtension')(e => this.onDidUninstallExtensionEvent({ ...e, profileLocation: URI.revive(e.profileLocation) })));
		this._register(this.channel.listen<DidUpdateExtensionMetadata>('onDidUpdateExtensionMetadata')(e => this.onDidUpdateExtensionMetadataEvent({ profileLocation: URI.revive(e.profileLocation), local: transformIncomingExtension(e.local, null) })));
	}

	protected onInstallExtensionEvent(event: InstallExtensionEvent): void {
		this._onInstallExtension.fire(event);
	}

	protected onDidInstallExtensionsEvent(results: readonly InstallExtensionResult[]): void {
		this._onDidInstallExtensions.fire(results);
	}

	protected onUninstallExtensionEvent(event: UninstallExtensionEvent): void {
		this._onUninstallExtension.fire(event);
	}

	protected onDidUninstallExtensionEvent(event: DidUninstallExtensionEvent): void {
		this._onDidUninstallExtension.fire(event);
	}

	protected onDidUpdateExtensionMetadataEvent(event: DidUpdateExtensionMetadata): void {
		this._onDidUpdateExtensionMetadata.fire(event);
	}

	private isUriComponents(thing: unknown): thing is UriComponents {
		if (!thing) {
			return false;
		}
		return typeof (<any>thing).path === 'string' &&
			typeof (<any>thing).scheme === 'string';
	}

	protected _targetPlatformPromise: Promise<TargetPlatform> | undefined;
	getTargetPlatform(): Promise<TargetPlatform> {
		if (!this._targetPlatformPromise) {
			this._targetPlatformPromise = this.channel.call<TargetPlatform>('getTargetPlatform');
		}
		return this._targetPlatformPromise;
	}

	zip(extension: ILocalExtension): Promise<URI> {
		return Promise.resolve(this.channel.call<UriComponents>('zip', [extension]).then(result => URI.revive(result)));
	}

	install(vsix: URI, options?: InstallOptions): Promise<ILocalExtension> {
		return Promise.resolve(this.channel.call<ILocalExtension>('install', [vsix, options])).then(local => transformIncomingExtension(local, null));
	}

	installFromLocation(location: URI, profileLocation: URI): Promise<ILocalExtension> {
		return Promise.resolve(this.channel.call<ILocalExtension>('installFromLocation', [location, profileLocation])).then(local => transformIncomingExtension(local, null));
	}

	async installExtensionsFromProfile(extensions: IExtensionIdentifier[], fromProfileLocation: URI, toProfileLocation: URI): Promise<ILocalExtension[]> {
		const result = await this.channel.call<ILocalExtension[]>('installExtensionsFromProfile', [extensions, fromProfileLocation, toProfileLocation]);
		return result.map(local => transformIncomingExtension(local, null));
	}

	getManifest(vsix: URI): Promise<IExtensionManifest> {
		return Promise.resolve(this.channel.call<IExtensionManifest>('getManifest', [vsix]));
	}

	installFromGallery(extension: IGalleryExtension, installOptions?: InstallOptions): Promise<ILocalExtension> {
		return Promise.resolve(this.channel.call<ILocalExtension>('installFromGallery', [extension, installOptions])).then(local => transformIncomingExtension(local, null));
	}

	async installGalleryExtensions(extensions: InstallExtensionInfo[]): Promise<InstallExtensionResult[]> {
		const results = await this.channel.call<InstallExtensionResult[]>('installGalleryExtensions', [extensions]);
		return results.map(e => ({ ...e, local: e.local ? transformIncomingExtension(e.local, null) : e.local, source: this.isUriComponents(e.source) ? URI.revive(e.source) : e.source, profileLocation: URI.revive(e.profileLocation) }));
	}

	uninstall(extension: ILocalExtension, options?: UninstallOptions): Promise<void> {
		if (extension.isWorkspaceScoped) {
			throw new Error('Cannot uninstall a workspace extension');
		}
		return Promise.resolve(this.channel.call<void>('uninstall', [extension, options]));
	}

	uninstallExtensions(extensions: UninstallExtensionInfo[]): Promise<void> {
		if (extensions.some(e => e.extension.isWorkspaceScoped)) {
			throw new Error('Cannot uninstall a workspace extension');
		}
		return Promise.resolve(this.channel.call<void>('uninstallExtensions', [extensions]));

	}

	reinstallFromGallery(extension: ILocalExtension): Promise<ILocalExtension> {
		return Promise.resolve(this.channel.call<ILocalExtension>('reinstallFromGallery', [extension])).then(local => transformIncomingExtension(local, null));
	}

	getInstalled(type: ExtensionType | null = null, extensionsProfileResource?: URI, productVersion?: IProductVersion): Promise<ILocalExtension[]> {
		return Promise.resolve(this.channel.call<ILocalExtension[]>('getInstalled', [type, extensionsProfileResource, productVersion]))
			.then(extensions => extensions.map(extension => transformIncomingExtension(extension, null)));
	}

	updateMetadata(local: ILocalExtension, metadata: Partial<Metadata>, extensionsProfileResource?: URI): Promise<ILocalExtension> {
		return Promise.resolve(this.channel.call<ILocalExtension>('updateMetadata', [local, metadata, extensionsProfileResource]))
			.then(extension => transformIncomingExtension(extension, null));
	}

	resetPinnedStateForAllUserExtensions(pinned: boolean): Promise<void> {
		return this.channel.call<void>('resetPinnedStateForAllUserExtensions', [pinned]);
	}

	toggleAppliationScope(local: ILocalExtension, fromProfileLocation: URI): Promise<ILocalExtension> {
		return this.channel.call<ILocalExtension>('toggleAppliationScope', [local, fromProfileLocation])
			.then(extension => transformIncomingExtension(extension, null));
	}

	copyExtensions(fromProfileLocation: URI, toProfileLocation: URI): Promise<void> {
		return this.channel.call<void>('copyExtensions', [fromProfileLocation, toProfileLocation]);
	}

	getExtensionsControlManifest(): Promise<IExtensionsControlManifest> {
		return Promise.resolve(this.channel.call<IExtensionsControlManifest>('getExtensionsControlManifest'));
	}

	async download(extension: IGalleryExtension, operation: InstallOperation, donotVerifySignature: boolean): Promise<URI> {
		const result = await this.channel.call<UriComponents>('download', [extension, operation, donotVerifySignature]);
		return URI.revive(result);
	}

	async cleanUp(): Promise<void> {
		return this.channel.call('cleanUp');
	}

	registerParticipant() { throw new Error('Not Supported'); }
}

export class ExtensionTipsChannel implements IServerChannel {

	constructor(private service: IExtensionTipsService) {
	}

	listen(context: any, event: string): Event<any> {
		throw new Error('Invalid listen');
	}

	call(context: any, command: string, args?: any): Promise<any> {
		switch (command) {
			case 'getConfigBasedTips': return this.service.getConfigBasedTips(URI.revive(args[0]));
			case 'getImportantExecutableBasedTips': return this.service.getImportantExecutableBasedTips();
			case 'getOtherExecutableBasedTips': return this.service.getOtherExecutableBasedTips();
		}

		throw new Error('Invalid call');
	}
}
