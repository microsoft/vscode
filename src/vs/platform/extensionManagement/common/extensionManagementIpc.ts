/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { IExtensionManagementService, ILocalExtension, InstallExtensionEvent, DidInstallExtensionEvent, IGalleryExtension, LocalExtensionType, DidUninstallExtensionEvent, IExtensionIdentifier, IGalleryMetadata, IReportedExtension } from './extensionManagement';
import { Event, buffer, mapEvent } from 'vs/base/common/event';
import URI from 'vs/base/common/uri';
import { IURITransformer } from 'vs/base/common/uriIpc';

export interface IExtensionManagementChannel extends IChannel {
	listen(event: 'onInstallExtension'): Event<InstallExtensionEvent>;
	listen(event: 'onDidInstallExtension'): Event<DidInstallExtensionEvent>;
	listen(event: 'onUninstallExtension'): Event<IExtensionIdentifier>;
	listen(event: 'onDidUninstallExtension'): Event<DidUninstallExtensionEvent>;
	call(command: 'install', args: [string]): TPromise<void>;
	call(command: 'installFromGallery', args: [IGalleryExtension]): TPromise<void>;
	call(command: 'uninstall', args: [ILocalExtension, boolean]): TPromise<void>;
	call(command: 'reinstallFromGallery', args: [ILocalExtension]): TPromise<void>;
	call(command: 'getInstalled', args: [LocalExtensionType]): TPromise<ILocalExtension[]>;
	call(command: 'getExtensionsReport'): TPromise<IReportedExtension[]>;
	call(command: 'updateMetadata', args: [ILocalExtension, IGalleryMetadata]): TPromise<ILocalExtension>;
}

export class ExtensionManagementChannel implements IExtensionManagementChannel {

	onInstallExtension: Event<InstallExtensionEvent>;
	onDidInstallExtension: Event<DidInstallExtensionEvent>;
	onUninstallExtension: Event<IExtensionIdentifier>;
	onDidUninstallExtension: Event<DidUninstallExtensionEvent>;

	constructor(private service: IExtensionManagementService, private uriTransformer: IURITransformer) {
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

	call(command: string, args?: any): TPromise<any> {
		switch (command) {
			case 'install': return this.service.install(args[0]);
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
		return extension ? { ...extension, ...{ location: URI.revive(this.uriTransformer.transformIncoming(extension.location)) } } : extension;
	}
}

export class ExtensionManagementChannelClient implements IExtensionManagementService {

	_serviceBrand: any;

	constructor(private channel: IExtensionManagementChannel, private uriTransformer: IURITransformer) { }

	get onInstallExtension(): Event<InstallExtensionEvent> { return this.channel.listen('onInstallExtension'); }
	get onDidInstallExtension(): Event<DidInstallExtensionEvent> { return mapEvent(this.channel.listen('onDidInstallExtension'), i => ({ ...i, local: this._transform(i.local) })); }
	get onUninstallExtension(): Event<IExtensionIdentifier> { return this.channel.listen('onUninstallExtension'); }
	get onDidUninstallExtension(): Event<DidUninstallExtensionEvent> { return this.channel.listen('onDidUninstallExtension'); }

	install(zipPath: string): TPromise<void> {
		return this.channel.call('install', [zipPath]);
	}

	installFromGallery(extension: IGalleryExtension): TPromise<void> {
		return this.channel.call('installFromGallery', [extension]);
	}

	uninstall(extension: ILocalExtension, force = false): TPromise<void> {
		return this.channel.call('uninstall', [extension, force]);
	}

	reinstallFromGallery(extension: ILocalExtension): TPromise<void> {
		return this.channel.call('reinstallFromGallery', [extension]);
	}

	getInstalled(type: LocalExtensionType = null): TPromise<ILocalExtension[]> {
		return this.channel.call('getInstalled', [type])
			.then(extensions => extensions.map(extension => this._transform(extension)));
	}

	updateMetadata(local: ILocalExtension, metadata: IGalleryMetadata): TPromise<ILocalExtension> {
		return this.channel.call('updateMetadata', [local, metadata])
			.then(extension => this._transform(extension));
	}

	getExtensionsReport(): TPromise<IReportedExtension[]> {
		return this.channel.call('getExtensionsReport');
	}

	private _transform(extension: ILocalExtension): ILocalExtension {
		return extension ? { ...extension, ...{ location: URI.revive(this.uriTransformer.transformIncoming(extension.location)) } } : extension;
	}

}