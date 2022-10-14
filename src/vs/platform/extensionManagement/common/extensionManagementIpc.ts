/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { revive } from 'vs/base/common/marshalling';
import { cloneAndChange } from 'vs/base/common/objects';
import { URI, UriComponents } from 'vs/base/common/uri';
import { DefaultURITransformer, IURITransformer, transformAndReviveIncomingURIs } from 'vs/base/common/uriIpc';
import { IChannel, IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { IExtensionIdentifier, IExtensionTipsService, IGalleryExtension, IGalleryMetadata, ILocalExtension, IExtensionsControlManifest, isTargetPlatformCompatible, InstallOptions, InstallVSIXOptions, UninstallOptions, Metadata, IExtensionManagementService, DidUninstallExtensionEvent, InstallExtensionEvent, InstallExtensionResult, UninstallExtensionEvent } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionType, IExtensionManifest, TargetPlatform } from 'vs/platform/extensions/common/extensions';

function transformIncomingURI(uri: UriComponents, transformer: IURITransformer | null): URI {
	return URI.revive(transformer ? transformer.transformIncoming(uri) : uri);
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

function transformOutgoingExtension(extension: ILocalExtension, transformer: IURITransformer | null): ILocalExtension {
	return transformer ? cloneAndChange(extension, value => value instanceof URI ? transformer.transformOutgoingURI(value) : undefined) : extension;
}

export class ExtensionManagementChannel implements IServerChannel {

	onInstallExtension: Event<InstallExtensionEvent>;
	onDidInstallExtensions: Event<readonly InstallExtensionResult[]>;
	onUninstallExtension: Event<UninstallExtensionEvent>;
	onDidUninstallExtension: Event<DidUninstallExtensionEvent>;

	constructor(private service: IExtensionManagementService, private getUriTransformer: (requestContext: any) => IURITransformer | null) {
		this.onInstallExtension = Event.buffer(service.onInstallExtension, true);
		this.onDidInstallExtensions = Event.buffer(service.onDidInstallExtensions, true);
		this.onUninstallExtension = Event.buffer(service.onUninstallExtension, true);
		this.onDidUninstallExtension = Event.buffer(service.onDidUninstallExtension, true);
	}

	listen(context: any, event: string): Event<any> {
		const uriTransformer = this.getUriTransformer(context);
		switch (event) {
			case 'onInstallExtension': return this.onInstallExtension;
			case 'onDidInstallExtensions': return Event.map(this.onDidInstallExtensions, results => results.map(i => ({ ...i, local: i.local ? transformOutgoingExtension(i.local, uriTransformer) : i.local })));
			case 'onUninstallExtension': return this.onUninstallExtension;
			case 'onDidUninstallExtension': return this.onDidUninstallExtension;
		}

		throw new Error('Invalid listen');
	}

	call(context: any, command: string, args?: any): Promise<any> {
		const uriTransformer: IURITransformer | null = this.getUriTransformer(context);
		switch (command) {
			case 'zip': return this.service.zip(transformIncomingExtension(args[0], uriTransformer)).then(uri => transformOutgoingURI(uri, uriTransformer));
			case 'unzip': return this.service.unzip(transformIncomingURI(args[0], uriTransformer));
			case 'install': return this.service.install(transformIncomingURI(args[0], uriTransformer), revive(args[1]));
			case 'getManifest': return this.service.getManifest(transformIncomingURI(args[0], uriTransformer));
			case 'getTargetPlatform': return this.service.getTargetPlatform();
			case 'canInstall': return this.service.canInstall(args[0]);
			case 'installFromGallery': return this.service.installFromGallery(args[0], revive(args[1]));
			case 'uninstall': return this.service.uninstall(transformIncomingExtension(args[0], uriTransformer), revive(args[1]));
			case 'reinstallFromGallery': return this.service.reinstallFromGallery(transformIncomingExtension(args[0], uriTransformer));
			case 'getInstalled': return this.service.getInstalled(args[0], URI.revive(args[1])).then(extensions => extensions.map(e => transformOutgoingExtension(e, uriTransformer)));
			case 'getMetadata': return this.service.getMetadata(transformIncomingExtension(args[0], uriTransformer));
			case 'updateMetadata': return this.service.updateMetadata(transformIncomingExtension(args[0], uriTransformer), args[1]).then(e => transformOutgoingExtension(e, uriTransformer));
			case 'updateExtensionScope': return this.service.updateExtensionScope(transformIncomingExtension(args[0], uriTransformer), args[1]).then(e => transformOutgoingExtension(e, uriTransformer));
			case 'getExtensionsControlManifest': return this.service.getExtensionsControlManifest();
		}

		throw new Error('Invalid call');
	}
}

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

	constructor(private readonly channel: IChannel) {
		super();
		this._register(this.channel.listen<InstallExtensionEvent>('onInstallExtension')(e => this._onInstallExtension.fire({ identifier: e.identifier, source: this.isUriComponents(e.source) ? URI.revive(e.source) : e.source, profileLocation: URI.revive(e.profileLocation) })));
		this._register(this.channel.listen<readonly InstallExtensionResult[]>('onDidInstallExtensions')(results => this._onDidInstallExtensions.fire(results.map(e => ({ ...e, local: e.local ? transformIncomingExtension(e.local, null) : e.local, source: this.isUriComponents(e.source) ? URI.revive(e.source) : e.source, profileLocation: URI.revive(e.profileLocation) })))));
		this._register(this.channel.listen<UninstallExtensionEvent>('onUninstallExtension')(e => this._onUninstallExtension.fire({ identifier: e.identifier, profileLocation: URI.revive(e.profileLocation) })));
		this._register(this.channel.listen<DidUninstallExtensionEvent>('onDidUninstallExtension')(e => this._onDidUninstallExtension.fire({ ...e, profileLocation: URI.revive(e.profileLocation) })));
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

	getManifest(vsix: URI): Promise<IExtensionManifest> {
		return Promise.resolve(this.channel.call<IExtensionManifest>('getManifest', [vsix]));
	}

	installFromGallery(extension: IGalleryExtension, installOptions?: InstallOptions): Promise<ILocalExtension> {
		return Promise.resolve(this.channel.call<ILocalExtension>('installFromGallery', [extension, installOptions])).then(local => transformIncomingExtension(local, null));
	}

	uninstall(extension: ILocalExtension, options?: UninstallOptions): Promise<void> {
		return Promise.resolve(this.channel.call<void>('uninstall', [extension!, options]));
	}

	reinstallFromGallery(extension: ILocalExtension): Promise<void> {
		return Promise.resolve(this.channel.call<void>('reinstallFromGallery', [extension]));
	}

	getInstalled(type: ExtensionType | null = null, extensionsProfileResource?: URI): Promise<ILocalExtension[]> {
		return Promise.resolve(this.channel.call<ILocalExtension[]>('getInstalled', [type, extensionsProfileResource]))
			.then(extensions => extensions.map(extension => transformIncomingExtension(extension, null)));
	}

	getMetadata(local: ILocalExtension): Promise<Metadata | undefined> {
		return Promise.resolve(this.channel.call<Metadata>('getMetadata', [local]));
	}

	updateMetadata(local: ILocalExtension, metadata: IGalleryMetadata): Promise<ILocalExtension> {
		return Promise.resolve(this.channel.call<ILocalExtension>('updateMetadata', [local, metadata]))
			.then(extension => transformIncomingExtension(extension, null));
	}

	updateExtensionScope(local: ILocalExtension, isMachineScoped: boolean): Promise<ILocalExtension> {
		return Promise.resolve(this.channel.call<ILocalExtension>('updateExtensionScope', [local, isMachineScoped]))
			.then(extension => transformIncomingExtension(extension, null));
	}

	getExtensionsControlManifest(): Promise<IExtensionsControlManifest> {
		return Promise.resolve(this.channel.call<IExtensionsControlManifest>('getExtensionsControlManifest'));
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
			case 'getAllWorkspacesTips': return this.service.getAllWorkspacesTips();
		}

		throw new Error('Invalid call');
	}
}
