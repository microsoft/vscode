/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { cloneAndChange } from 'vs/base/common/objects';
import { URI, UriComponents } from 'vs/base/common/uri';
import { DefaultURITransformer, IURITransformer, transformAndReviveIncomingURIs } from 'vs/base/common/uriIpc';
import { IChannel, IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { IExtensionIdentifier, IExtensionTipsService, IGalleryExtension, ILocalExtension, IExtensionsControlManifest, isTargetPlatformCompatible, InstallOptions, InstallVSIXOptions, UninstallOptions, Metadata, IExtensionManagementService, DidUninstallExtensionEvent, InstallExtensionEvent, InstallExtensionResult, UninstallExtensionEvent, InstallOperation, InstallExtensionInfo } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionType, IExtensionManifest, TargetPlatform } from 'vs/platform/extensions/common/extensions';

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
	onDidUpdateExtensionMetadata: Event<ILocalExtension>;

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
				return Event.map<ILocalExtension, ILocalExtension>(this.onDidUpdateExtensionMetadata, e => transformOutgoingExtension(e, uriTransformer));
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
			case 'unzip': {
				return this.service.unzip(transformIncomingURI(args[0], uriTransformer));
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
			case 'canInstall': {
				return this.service.canInstall(args[0]);
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
			case 'reinstallFromGallery': {
				return this.service.reinstallFromGallery(transformIncomingExtension(args[0], uriTransformer));
			}
			case 'getInstalled': {
				const extensions = await this.service.getInstalled(args[0], transformIncomingURI(args[1], uriTransformer));
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

export type ExtensionEventResult = InstallExtensionEvent | InstallExtensionResult | UninstallExtensionEvent | DidUninstallExtensionEvent;

export class ExtensionManagementChannelClient extends Disposable implements IExtensionManagementService {

	declare readonly _serviceBrand: undefined;

	private readonly _onInstallExtension = this._register(new Emitter<InstallExtensionEvent>());
	get onInstallExtension() { return this._onInstallExtension.event; }

	private readonly _onDidInstallExtensions = this._register(new Emitter<readonly InstallExtensionResult[]>());
	get onDidInstallExtensions() { return this._onDidInstallExtensions.event; }

	private readonly _onUninstallExtension = this._register(new Emitter<UninstallExtensionEvent>());
	get onUninstallExtension() { return this._onUninstallExtension.event; }

	private readonly _onDidUninstallExtension = this._register(new Emitter<DidUninstallExtensionEvent>());
	get onDidUninstallExtension() { return this._onDidUninstallExtension.event; }

	private readonly _onDidUpdateExtensionMetadata = this._register(new Emitter<ILocalExtension>());
	get onDidUpdateExtensionMetadata() { return this._onDidUpdateExtensionMetadata.event; }

	constructor(private readonly channel: IChannel) {
		super();
		this._register(this.channel.listen<InstallExtensionEvent>('onInstallExtension')(e => this.fireEvent(this._onInstallExtension, { ...e, source: this.isUriComponents(e.source) ? URI.revive(e.source) : e.source, profileLocation: URI.revive(e.profileLocation) })));
		this._register(this.channel.listen<readonly InstallExtensionResult[]>('onDidInstallExtensions')(results => this.fireEvent(this._onDidInstallExtensions, results.map(e => ({ ...e, local: e.local ? transformIncomingExtension(e.local, null) : e.local, source: this.isUriComponents(e.source) ? URI.revive(e.source) : e.source, profileLocation: URI.revive(e.profileLocation) })))));
		this._register(this.channel.listen<UninstallExtensionEvent>('onUninstallExtension')(e => this.fireEvent(this._onUninstallExtension, { ...e, profileLocation: URI.revive(e.profileLocation) })));
		this._register(this.channel.listen<DidUninstallExtensionEvent>('onDidUninstallExtension')(e => this.fireEvent(this._onDidUninstallExtension, { ...e, profileLocation: URI.revive(e.profileLocation) })));
		this._register(this.channel.listen<ILocalExtension>('onDidUpdateExtensionMetadata')(e => this._onDidUpdateExtensionMetadata.fire(transformIncomingExtension(e, null))));
	}

	protected fireEvent(event: Emitter<InstallExtensionEvent>, data: InstallExtensionEvent): void;
	protected fireEvent(event: Emitter<readonly InstallExtensionResult[]>, data: InstallExtensionResult[]): void;
	protected fireEvent(event: Emitter<UninstallExtensionEvent>, data: UninstallExtensionEvent): void;
	protected fireEvent(event: Emitter<DidUninstallExtensionEvent>, data: DidUninstallExtensionEvent): void;
	protected fireEvent(event: Emitter<ExtensionEventResult>, data: ExtensionEventResult): void;
	protected fireEvent(event: Emitter<ExtensionEventResult[]>, data: ExtensionEventResult[]): void;
	protected fireEvent<E>(event: Emitter<E>, data: E): void {
		event.fire(data);
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

	async canInstall(extension: IGalleryExtension): Promise<boolean> {
		const currentTargetPlatform = await this.getTargetPlatform();
		return extension.allTargetPlatforms.some(targetPlatform => isTargetPlatformCompatible(targetPlatform, extension.allTargetPlatforms, currentTargetPlatform));
	}

	zip(extension: ILocalExtension): Promise<URI> {
		return Promise.resolve(this.channel.call<UriComponents>('zip', [extension]).then(result => URI.revive(result)));
	}

	unzip(zipLocation: URI): Promise<IExtensionIdentifier> {
		return Promise.resolve(this.channel.call<IExtensionIdentifier>('unzip', [zipLocation]));
	}

	install(vsix: URI, options?: InstallVSIXOptions): Promise<ILocalExtension> {
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
		return Promise.resolve(this.channel.call<void>('uninstall', [extension!, options]));
	}

	reinstallFromGallery(extension: ILocalExtension): Promise<ILocalExtension> {
		return Promise.resolve(this.channel.call<ILocalExtension>('reinstallFromGallery', [extension])).then(local => transformIncomingExtension(local, null));
	}

	getInstalled(type: ExtensionType | null = null, extensionsProfileResource?: URI): Promise<ILocalExtension[]> {
		return Promise.resolve(this.channel.call<ILocalExtension[]>('getInstalled', [type, extensionsProfileResource]))
			.then(extensions => extensions.map(extension => transformIncomingExtension(extension, null)));
	}

	updateMetadata(local: ILocalExtension, metadata: Partial<Metadata>, extensionsProfileResource?: URI): Promise<ILocalExtension> {
		return Promise.resolve(this.channel.call<ILocalExtension>('updateMetadata', [local, metadata, extensionsProfileResource]))
			.then(extension => transformIncomingExtension(extension, null));
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
