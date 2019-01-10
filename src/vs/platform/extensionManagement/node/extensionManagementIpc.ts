/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel, IServerChannel } from 'vs/base/parts/ipc/node/ipc';
import { IExtensionManagementService, ILocalExtension, InstallExtensionEvent, DidInstallExtensionEvent, IGalleryExtension, LocalExtensionType, DidUninstallExtensionEvent, IExtensionIdentifier, IGalleryMetadata, IReportedExtension } from '../common/extensionManagement';
import { Event } from 'vs/base/common/event';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IURITransformer, DefaultURITransformer, transformAndReviveIncomingURIs } from 'vs/base/common/uriIpc';
import { cloneAndChange } from 'vs/base/common/objects';

function transformIncomingURI(uri: UriComponents, transformer: IURITransformer | null): URI {
	return URI.revive(transformer ? transformer.transformIncoming(uri) : uri);
}

function transformOutgoingURI(uri: URI, transformer: IURITransformer | null): URI {
	return transformer ? transformer.transformOutgoing(uri) : uri;
}

function transformIncomingExtension(extension: ILocalExtension, transformer: IURITransformer | null): ILocalExtension {
	transformer = transformer ? transformer : DefaultURITransformer;
	const manfiest = extension.manifest;
	delete extension.manifest;
	extension = transformAndReviveIncomingURIs(extension, transformer);
	extension.manifest = manfiest;
	return extension;
}

function transformOutgoingExtension(extension: ILocalExtension, transformer: IURITransformer | null): ILocalExtension {
	return transformer ? cloneAndChange(extension, value => value instanceof URI ? transformer.transformOutgoing(value) : undefined) : extension;
}

export class ExtensionManagementChannel implements IServerChannel {

	onInstallExtension: Event<InstallExtensionEvent>;
	onDidInstallExtension: Event<DidInstallExtensionEvent>;
	onUninstallExtension: Event<IExtensionIdentifier>;
	onDidUninstallExtension: Event<DidUninstallExtensionEvent>;

	constructor(private service: IExtensionManagementService, private getUriTransformer: (requestContext: any) => IURITransformer | null) {
		this.onInstallExtension = Event.buffer(service.onInstallExtension, true);
		this.onDidInstallExtension = Event.buffer(service.onDidInstallExtension, true);
		this.onUninstallExtension = Event.buffer(service.onUninstallExtension, true);
		this.onDidUninstallExtension = Event.buffer(service.onDidUninstallExtension, true);
	}

	listen(context, event: string): Event<any> {
		const uriTransformer = this.getUriTransformer(context);
		switch (event) {
			case 'onInstallExtension': return this.onInstallExtension;
			case 'onDidInstallExtension': return Event.map(this.onDidInstallExtension, i => ({ ...i, local: i.local ? transformOutgoingExtension(i.local, uriTransformer) : i.local }));
			case 'onUninstallExtension': return this.onUninstallExtension;
			case 'onDidUninstallExtension': return this.onDidUninstallExtension;
		}

		throw new Error('Invalid listen');
	}

	call(context, command: string, args?: any): Promise<any> {
		const uriTransformer: IURITransformer | null = this.getUriTransformer(context);
		switch (command) {
			case 'zip': return this.service.zip(transformIncomingExtension(args[0], uriTransformer)).then(uri => transformOutgoingURI(uri, uriTransformer));
			case 'unzip': return this.service.unzip(transformIncomingURI(args[0], uriTransformer), args[1]);
			case 'install': return this.service.install(transformIncomingURI(args[0], uriTransformer));
			case 'installFromGallery': return this.service.installFromGallery(args[0]);
			case 'uninstall': return this.service.uninstall(transformIncomingExtension(args[0], uriTransformer), args[1]);
			case 'reinstallFromGallery': return this.service.reinstallFromGallery(transformIncomingExtension(args[0], uriTransformer));
			case 'getInstalled': return this.service.getInstalled(args[0]).then(extensions => extensions.map(e => transformOutgoingExtension(e, uriTransformer)));
			case 'updateMetadata': return this.service.updateMetadata(transformIncomingExtension(args[0], uriTransformer), args[1]).then(e => transformOutgoingExtension(e, uriTransformer));
			case 'getExtensionsReport': return this.service.getExtensionsReport();
		}

		throw new Error('Invalid call');
	}
}

export class ExtensionManagementChannelClient implements IExtensionManagementService {

	_serviceBrand: any;

	constructor(private channel: IChannel) { }

	get onInstallExtension(): Event<InstallExtensionEvent> { return this.channel.listen('onInstallExtension'); }
	get onDidInstallExtension(): Event<DidInstallExtensionEvent> { return Event.map(this.channel.listen<DidInstallExtensionEvent>('onDidInstallExtension'), i => ({ ...i, local: i.local ? transformIncomingExtension(i.local, null) : i.local })); }
	get onUninstallExtension(): Event<IExtensionIdentifier> { return this.channel.listen('onUninstallExtension'); }
	get onDidUninstallExtension(): Event<DidUninstallExtensionEvent> { return this.channel.listen('onDidUninstallExtension'); }

	zip(extension: ILocalExtension): Promise<URI> {
		return Promise.resolve(this.channel.call('zip', [extension]).then(result => URI.revive(result)));
	}

	unzip(zipLocation: URI, type: LocalExtensionType): Promise<IExtensionIdentifier> {
		return Promise.resolve(this.channel.call('unzip', [zipLocation, type]));
	}

	install(vsix: URI): Promise<IExtensionIdentifier> {
		return Promise.resolve(this.channel.call('install', [vsix]));
	}

	installFromGallery(extension: IGalleryExtension): Promise<void> {
		return Promise.resolve(this.channel.call('installFromGallery', [extension]));
	}

	uninstall(extension: ILocalExtension, force = false): Promise<void> {
		return Promise.resolve(this.channel.call('uninstall', [extension!, force]));
	}

	reinstallFromGallery(extension: ILocalExtension): Promise<void> {
		return Promise.resolve(this.channel.call('reinstallFromGallery', [extension]));
	}

	getInstalled(type: LocalExtensionType | null = null): Promise<ILocalExtension[]> {
		return Promise.resolve(this.channel.call<ILocalExtension[]>('getInstalled', [type]))
			.then(extensions => extensions.map(extension => transformIncomingExtension(extension, null)));
	}

	updateMetadata(local: ILocalExtension, metadata: IGalleryMetadata): Promise<ILocalExtension> {
		return Promise.resolve(this.channel.call<ILocalExtension>('updateMetadata', [local, metadata]))
			.then(extension => transformIncomingExtension(extension, null));
	}

	getExtensionsReport(): Promise<IReportedExtension[]> {
		return Promise.resolve(this.channel.call('getExtensionsReport'));
	}
}