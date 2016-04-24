/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IChannel, eventToCall, eventFromCall } from 'vs/base/parts/ipc/common/ipc';
import { IExtensionsService, IExtension, IExtensionManifest } from './extensions';
import Event from 'vs/base/common/event';

export interface IExtensionsChannel extends IChannel {
	call(command: 'event:onInstallExtension'): TPromise<void>;
	call(command: 'event:onDidInstallExtension'): TPromise<void>;
	call(command: 'event:onUninstallExtension'): TPromise<void>;
	call(command: 'event:onDidUninstallExtension'): TPromise<void>;
	call(command: 'install', extensionOrPath: IExtension | string): TPromise<IExtension>;
	call(command: 'uninstall', extension: IExtension): TPromise<void>;
	call(command: 'getInstalled', includeDuplicateVersions: boolean): TPromise<IExtension[]>;
	call(command: string, arg: any): TPromise<any>;
}

export class ExtensionsChannel implements IExtensionsChannel {

	constructor(private service: IExtensionsService) { }

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

export class ExtensionsChannelClient implements IExtensionsService {

	serviceId = IExtensionsService;

	constructor(private channel: IExtensionsChannel) { }

	private _onInstallExtension = eventFromCall(this.channel, 'event:onInstallExtension');
	get onInstallExtension(): Event<IExtensionManifest> { return this._onInstallExtension; }

	private _onDidInstallExtension = eventFromCall(this.channel, 'event:onDidInstallExtension');
	get onDidInstallExtension(): Event<{ extension: IExtension; error?: Error; }> { return this._onDidInstallExtension; }

	private _onUninstallExtension = eventFromCall(this.channel, 'event:onUninstallExtension');
	get onUninstallExtension(): Event<IExtension> { return this._onUninstallExtension; }

	private _onDidUninstallExtension = eventFromCall(this.channel, 'event:onDidUninstallExtension');
	get onDidUninstallExtension(): Event<IExtension> { return this._onDidUninstallExtension; }

	install(extension: IExtension): TPromise<IExtension>;
	install(zipPath: string): TPromise<IExtension>;
	install(arg: any): TPromise<IExtension> {
		return this.channel.call('install', arg);
	}

	uninstall(extension: IExtension): TPromise<void> {
		return this.channel.call('uninstall', extension);
	}

	getInstalled(includeDuplicateVersions?: boolean): TPromise<IExtension[]> {
		return this.channel.call('getInstalled', includeDuplicateVersions);
	}
}