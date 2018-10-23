/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel } from 'vs/base/parts/ipc/node/ipc';
import { IExtensionManagementService, ILocalExtension, InstallExtensionEvent, DidInstallExtensionEvent, IGalleryExtension, LocalExtensionType, DidUninstallExtensionEvent, IExtensionIdentifier, IGalleryMetadata, IReportedExtension } from '../common/extensionManagement';
import { Event, buffer, mapEvent } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { IURITransformer } from 'vs/base/common/uriIpc';

export interface IExtensionManagementChannel extends IChannel {
	listen(event: 'onInstallExtension'): Event<InstallExtensionEvent>;
	listen(event: 'onDidInstallExtension'): Event<DidInstallExtensionEvent>;
	listen(event: 'onUninstallExtension'): Event<IExtensionIdentifier>;
	listen(event: 'onDidUninstallExtension'): Event<DidUninstallExtensionEvent>;

	call(command: 'zip', args: [ILocalExtension]): Thenable<URI>;
	call(command: 'unzip', args: [URI, LocalExtensionType]): Thenable<IExtensionIdentifier>;
	call(command: 'install', args: [URI]): Thenable<IExtensionIdentifier>;
	call(command: 'installFromGallery', args: [IGalleryExtension]): Thenable<void>;
	call(command: 'uninstall', args: [ILocalExtension, boolean]): Thenable<void>;
	call(command: 'reinstallFromGallery', args: [ILocalExtension]): Thenable<void>;
	call(command: 'getInstalled', args: [LocalExtensionType | null]): Thenable<ILocalExtension[]>;
	call(command: 'getExtensionsReport'): Thenable<IReportedExtension[]>;
	call(command: 'updateMetadata', args: [ILocalExtension, IGalleryMetadata]): Thenable<ILocalExtension>;
}

export class ExtensionManagementChannel implements IExtensionManagementChannel {

	onInstallExtension: Event<InstallExtensionEvent>;
	onDidInstallExtension: Event<DidInstallExtensionEvent>;
	onUninstallExtension: Event<IExtensionIdentifier>;
	onDidUninstallExtension: Event<DidUninstallExtensionEvent>;

	constructor(private service: IExtensionManagementService) {
		this.onInstallExtension = buffer(service.onInstallExtension, true);
		this.onDidInstallExtension = buffer(service.onDidInstallExtension, true);
		this.onUninstallExtension = buffer(service.onUninstallExtension, true);
		this.onDidUninstallExtension = buffer(service.onDidUninstallExtension, true);
	}

	listen(event: string): Event<any> {
		switch (event) {
			case 'onInstallExtension': return this.onInstallExtension;
			case 'onDidInstallExtension': return this.onDidInstallExtension;
			case 'onUninstallExtension': return this.onUninstallExtension;
			case 'onDidUninstallExtension': return this.onDidUninstallExtension;
		}

		throw new Error('Invalid listen');
	}

	call(command: string, args?: any): Thenable<any> {
		switch (command) {
			case 'zip': return this.service.zip(this._transform(args[0]));
			case 'unzip': return this.service.unzip(URI.revive(args[0]), args[1]);
			case 'install': return this.service.install(URI.revive(args[0]));
			case 'installFromGallery': return this.service.installFromGallery(args[0]);
			case 'uninstall': return this.service.uninstall(this._transform(args[0]), args[1]);
			case 'reinstallFromGallery': return this.service.reinstallFromGallery(this._transform(args[0]));
			case 'getInstalled': return this.service.getInstalled(args[0]);
			case 'updateMetadata': return this.service.updateMetadata(this._transform(args[0]), args[1]);
			case 'getExtensionsReport': return this.service.getExtensionsReport();
		}

		throw new Error('Invalid call');
	}

	private _transform(extension: ILocalExtension): ILocalExtension {
		return extension ? { ...extension, ...{ location: URI.revive(extension.location) } } : extension;
	}
}

export class ExtensionManagementChannelClient implements IExtensionManagementService {

	_serviceBrand: any;

	constructor(private channel: IExtensionManagementChannel, private uriTransformer: IURITransformer) { }

	get onInstallExtension(): Event<InstallExtensionEvent> { return this.channel.listen('onInstallExtension'); }
	get onDidInstallExtension(): Event<DidInstallExtensionEvent> { return mapEvent(this.channel.listen('onDidInstallExtension'), i => ({ ...i, local: this._transformIncoming(i.local) })); }
	get onUninstallExtension(): Event<IExtensionIdentifier> { return this.channel.listen('onUninstallExtension'); }
	get onDidUninstallExtension(): Event<DidUninstallExtensionEvent> { return this.channel.listen('onDidUninstallExtension'); }

	zip(extension: ILocalExtension): Promise<URI> {
		return Promise.resolve(this.channel.call('zip', [this._transformOutgoing(extension)]).then(result => URI.revive(this.uriTransformer.transformIncoming(result))));
	}

	unzip(zipLocation: URI, type: LocalExtensionType): Promise<IExtensionIdentifier> {
		return Promise.resolve(this.channel.call('unzip', [this.uriTransformer.transformOutgoing(zipLocation), type]));
	}

	install(vsix: URI): Promise<IExtensionIdentifier> {
		return Promise.resolve(this.channel.call('install', [this.uriTransformer.transformOutgoing(vsix)]));
	}

	installFromGallery(extension: IGalleryExtension): Promise<void> {
		return Promise.resolve(this.channel.call('installFromGallery', [extension]));
	}

	uninstall(extension: ILocalExtension, force = false): Promise<void> {
		return Promise.resolve(this.channel.call('uninstall', [this._transformOutgoing(extension)!, force]));
	}

	reinstallFromGallery(extension: ILocalExtension): Promise<void> {
		return Promise.resolve(this.channel.call('reinstallFromGallery', [this._transformOutgoing(extension)]));
	}

	getInstalled(type: LocalExtensionType | null = null): Promise<ILocalExtension[]> {
		return Promise.resolve(this.channel.call('getInstalled', [type]))
			.then(extensions => extensions.map(extension => this._transformIncoming(extension)));
	}

	updateMetadata(local: ILocalExtension, metadata: IGalleryMetadata): Promise<ILocalExtension> {
		return Promise.resolve(this.channel.call('updateMetadata', [this._transformOutgoing(local), metadata]))
			.then(extension => this._transformIncoming(extension));
	}

	getExtensionsReport(): Promise<IReportedExtension[]> {
		return Promise.resolve(this.channel.call('getExtensionsReport'));
	}

	private _transformIncoming(extension: ILocalExtension): ILocalExtension;
	private _transformIncoming(extension: ILocalExtension | undefined): ILocalExtension | undefined;
	private _transformIncoming(extension: ILocalExtension | undefined): ILocalExtension | undefined {
		return extension ? { ...extension, ...{ location: URI.revive(this.uriTransformer.transformIncoming(extension.location)) } } : extension;
	}

	private _transformOutgoing(extension: ILocalExtension): ILocalExtension;
	private _transformOutgoing(extension: ILocalExtension | undefined): ILocalExtension | undefined;
	private _transformOutgoing(extension: ILocalExtension | undefined): ILocalExtension | undefined {
		return extension ? { ...extension, ...{ location: this.uriTransformer.transformOutgoing(extension.location) } } : extension;
	}

}