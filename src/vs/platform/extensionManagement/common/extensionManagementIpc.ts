/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IChannel, eventToCall, eventFromCall } from 'vs/base/parts/ipc/common/ipc';
import { IExtensionManagementService, ILocalExtension, InstallExtensionEvent, DidInstallExtensionEvent, IGalleryExtension, LocalExtensionType, DidUninstallExtensionEvent, IExtensionIdentifier, IGalleryMetadata, IReportedExtension } from './extensionManagement';
import Event, { buffer } from 'vs/base/common/event';

export interface IExtensionManagementChannel extends IChannel {
	call(command: 'event:onInstallExtension'): TPromise<void>;
	call(command: 'event:onDidInstallExtension'): TPromise<void>;
	call(command: 'event:onUninstallExtension'): TPromise<void>;
	call(command: 'event:onDidUninstallExtension'): TPromise<void>;
	call(command: 'install', path: string): TPromise<ILocalExtension>;
	call(command: 'installFromGallery', extension: IGalleryExtension): TPromise<ILocalExtension>;
	call(command: 'uninstall', args: [ILocalExtension, boolean]): TPromise<void>;
	call(command: 'reinstall', args: [ILocalExtension]): TPromise<ILocalExtension>;
	call(command: 'getInstalled'): TPromise<ILocalExtension[]>;
	call(command: 'getExtensionsReport'): TPromise<IReportedExtension[]>;
	call(command: string, arg?: any): TPromise<any>;
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

	call(command: string, arg?: any): TPromise<any> {
		switch (command) {
			case 'event:onInstallExtension': return eventToCall(this.onInstallExtension);
			case 'event:onDidInstallExtension': return eventToCall(this.onDidInstallExtension);
			case 'event:onUninstallExtension': return eventToCall(this.onUninstallExtension);
			case 'event:onDidUninstallExtension': return eventToCall(this.onDidUninstallExtension);
			case 'install': return this.service.install(arg);
			case 'installFromGallery': return this.service.installFromGallery(arg[0]);
			case 'uninstall': return this.service.uninstall(arg[0], arg[1]);
			case 'reinstall': return this.service.reinstall(arg[0]);
			case 'getInstalled': return this.service.getInstalled(arg);
			case 'updateMetadata': return this.service.updateMetadata(arg[0], arg[1]);
			case 'getExtensionsReport': return this.service.getExtensionsReport();
		}
		return undefined;
	}
}

export class ExtensionManagementChannelClient implements IExtensionManagementService {

	_serviceBrand: any;

	constructor(private channel: IExtensionManagementChannel) { }

	private _onInstallExtension = eventFromCall<InstallExtensionEvent>(this.channel, 'event:onInstallExtension');
	get onInstallExtension(): Event<InstallExtensionEvent> { return this._onInstallExtension; }

	private _onDidInstallExtension = eventFromCall<DidInstallExtensionEvent>(this.channel, 'event:onDidInstallExtension');
	get onDidInstallExtension(): Event<DidInstallExtensionEvent> { return this._onDidInstallExtension; }

	private _onUninstallExtension = eventFromCall<IExtensionIdentifier>(this.channel, 'event:onUninstallExtension');
	get onUninstallExtension(): Event<IExtensionIdentifier> { return this._onUninstallExtension; }

	private _onDidUninstallExtension = eventFromCall<DidUninstallExtensionEvent>(this.channel, 'event:onDidUninstallExtension');
	get onDidUninstallExtension(): Event<DidUninstallExtensionEvent> { return this._onDidUninstallExtension; }

	install(zipPath: string): TPromise<ILocalExtension> {
		return this.channel.call('install', zipPath);
	}

	installFromGallery(extension: IGalleryExtension): TPromise<ILocalExtension> {
		return this.channel.call('installFromGallery', [extension]);
	}

	uninstall(extension: ILocalExtension, force = false): TPromise<void> {
		return this.channel.call('uninstall', [extension, force]);
	}

	reinstall(extension: ILocalExtension): TPromise<ILocalExtension> {
		return this.channel.call('reinstall', [extension]);
	}

	getInstalled(type: LocalExtensionType = null): TPromise<ILocalExtension[]> {
		return this.channel.call('getInstalled', type);
	}

	updateMetadata(local: ILocalExtension, metadata: IGalleryMetadata): TPromise<ILocalExtension> {
		return this.channel.call('updateMetadata', [local, metadata]);
	}

	getExtensionsReport(): TPromise<IReportedExtension[]> {
		return this.channel.call('getExtensionsReport');
	}
}