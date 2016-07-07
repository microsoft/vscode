/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IChannel, eventToCall, eventFromCall } from 'vs/base/parts/ipc/common/ipc';
import { IExtensionManagementService, ILocalExtension, IGalleryExtension, InstallExtensionEvent, DidInstallExtensionEvent } from './extensionManagement';
import Event from 'vs/base/common/event';

export interface IExtensionManagementChannel extends IChannel {
	call(command: 'event:onInstallExtension'): TPromise<void>;
	call(command: 'event:onDidInstallExtension'): TPromise<void>;
	call(command: 'event:onUninstallExtension'): TPromise<void>;
	call(command: 'event:onDidUninstallExtension'): TPromise<void>;
	call(command: 'install', extensionOrPath: ILocalExtension | string): TPromise<ILocalExtension>;
	call(command: 'uninstall', extension: ILocalExtension): TPromise<void>;
	call(command: 'getInstalled', includeDuplicateVersions: boolean): TPromise<ILocalExtension[]>;
	call(command: string, arg: any): TPromise<any>;
}

export class ExtensionManagementChannel implements IExtensionManagementChannel {

	constructor(private service: IExtensionManagementService) { }

	call(command: string, arg: any): TPromise<any> {
		switch (command) {
			case 'event:onInstallExtension': return eventToCall(this.service.onInstallExtension);
			case 'event:onDidInstallExtension': return eventToCall(this.service.onDidInstallExtension);
			case 'event:onUninstallExtension': return eventToCall(this.service.onUninstallExtension);
			case 'event:onDidUninstallExtension': return eventToCall(this.service.onDidUninstallExtension);
			case 'install': return this.service.install(arg);
			case 'uninstall': return this.service.uninstall(arg);
			case 'getInstalled': return this.service.getInstalled(arg);
		}
	}
}

export class ExtensionManagementChannelClient implements IExtensionManagementService {

	_serviceBrand: any;

	constructor(private channel: IExtensionManagementChannel) { }

	private _onInstallExtension = eventFromCall<InstallExtensionEvent>(this.channel, 'event:onInstallExtension');
	get onInstallExtension(): Event<InstallExtensionEvent> { return this._onInstallExtension; }

	private _onDidInstallExtension = eventFromCall<DidInstallExtensionEvent>(this.channel, 'event:onDidInstallExtension');
	get onDidInstallExtension(): Event<DidInstallExtensionEvent> { return this._onDidInstallExtension; }

	private _onUninstallExtension = eventFromCall<string>(this.channel, 'event:onUninstallExtension');
	get onUninstallExtension(): Event<string> { return this._onUninstallExtension; }

	private _onDidUninstallExtension = eventFromCall<string>(this.channel, 'event:onDidUninstallExtension');
	get onDidUninstallExtension(): Event<string> { return this._onDidUninstallExtension; }

	install(extension: IGalleryExtension): TPromise<void>;
	install(zipPath: string): TPromise<void>;
	install(arg: any): TPromise<void> {
		return this.channel.call('install', arg);
	}

	uninstall(extension: ILocalExtension): TPromise<void> {
		return this.channel.call('uninstall', extension);
	}

	getInstalled(includeDuplicateVersions?: boolean): TPromise<ILocalExtension[]> {
		return this.channel.call('getInstalled', includeDuplicateVersions);
	}
}