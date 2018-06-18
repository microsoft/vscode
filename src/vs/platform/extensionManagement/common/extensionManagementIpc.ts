/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IChannel, eventToCall, eventFromCall } from 'vs/base/parts/ipc/common/ipc';
import { IExtensionManagementService, ILocalExtension, InstallExtensionEvent, DidInstallExtensionEvent, IGalleryExtension, LocalExtensionType, DidUninstallExtensionEvent, IExtensionIdentifier, IGalleryMetadata, IReportedExtension } from './extensionManagement';
import { Event, buffer, mapEvent } from 'vs/base/common/event';
import URI from 'vs/base/common/uri';
import { IURITransformer } from 'vs/base/common/uriIpc';

export interface IExtensionManagementChannel extends IChannel {
	call(command: 'event:onInstallExtension'): TPromise<void>;
	call(command: 'event:onDidInstallExtension'): TPromise<void>;
	call(command: 'event:onUninstallExtension'): TPromise<void>;
	call(command: 'event:onDidUninstallExtension'): TPromise<void>;
	call(command: 'install', args: [string]): TPromise<ILocalExtension>;
	call(command: 'installFromGallery', args: [IGalleryExtension]): TPromise<ILocalExtension>;
	call(command: 'uninstall', args: [ILocalExtension, boolean]): TPromise<void>;
	call(command: 'reinstallFromGallery', args: [ILocalExtension]): TPromise<ILocalExtension>;
	call(command: 'getInstalled', args: [LocalExtensionType]): TPromise<ILocalExtension[]>;
	call(command: 'getExtensionsReport'): TPromise<IReportedExtension[]>;
	call(command: 'updateMetadata', args: [ILocalExtension, IGalleryMetadata]): TPromise<ILocalExtension>;
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

	call(command: string, args?: any): TPromise<any> {
		switch (command) {
			case 'event:onInstallExtension': return eventToCall(this.onInstallExtension);
			case 'event:onDidInstallExtension': return eventToCall(this.onDidInstallExtension);
			case 'event:onUninstallExtension': return eventToCall(this.onUninstallExtension);
			case 'event:onDidUninstallExtension': return eventToCall(this.onDidUninstallExtension);
			case 'install': return this.service.install(args[0]);
			case 'installFromGallery': return this.service.installFromGallery(args[0]);
			case 'uninstall': return this.service.uninstall(args[0], args[1]);
			case 'reinstallFromGallery': return this.service.reinstallFromGallery(args[0]);
			case 'getInstalled': return this.service.getInstalled(args[0]);
			case 'updateMetadata': return this.service.updateMetadata(args[0], args[1]);
			case 'getExtensionsReport': return this.service.getExtensionsReport();
		}
		return undefined;
	}
}

export class ExtensionManagementChannelClient implements IExtensionManagementService {

	_serviceBrand: any;

	constructor(private channel: IExtensionManagementChannel, private uriTransformer: IURITransformer) { }

	private _onInstallExtension = eventFromCall<InstallExtensionEvent>(this.channel, 'event:onInstallExtension');
	get onInstallExtension(): Event<InstallExtensionEvent> { return this._onInstallExtension; }

	private _onDidInstallExtension = mapEvent(eventFromCall<DidInstallExtensionEvent>(this.channel, 'event:onDidInstallExtension'), i => ({ ...i, local: this._transform(i.local) }));
	get onDidInstallExtension(): Event<DidInstallExtensionEvent> { return this._onDidInstallExtension; }

	private _onUninstallExtension = eventFromCall<IExtensionIdentifier>(this.channel, 'event:onUninstallExtension');
	get onUninstallExtension(): Event<IExtensionIdentifier> { return this._onUninstallExtension; }

	private _onDidUninstallExtension = eventFromCall<DidUninstallExtensionEvent>(this.channel, 'event:onDidUninstallExtension');
	get onDidUninstallExtension(): Event<DidUninstallExtensionEvent> { return this._onDidUninstallExtension; }

	install(zipPath: string): TPromise<ILocalExtension> {
		return this.channel.call('install', [zipPath])
			.then(extension => this._transform(extension));
	}

	installFromGallery(extension: IGalleryExtension): TPromise<ILocalExtension> {
		return this.channel.call('installFromGallery', [extension])
			.then(extension => this._transform(extension));
	}

	uninstall(extension: ILocalExtension, force = false): TPromise<void> {
		return this.channel.call('uninstall', [extension, force]);
	}

	reinstallFromGallery(extension: ILocalExtension): TPromise<ILocalExtension> {
		return this.channel.call('reinstallFromGallery', [extension])
			.then(extension => this._transform(extension));
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