/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtensionManagementService, IExtensionManagementServerService, IExtensionManagementServer, localExtensionManagementServerLocation } from 'vs/platform/extensionManagement/common/extensionManagement';
import URI from 'vs/base/common/uri';
import { Schemas } from 'vs/base/common/network';

export class ExtensionManagementServerService implements IExtensionManagementServerService {

	_serviceBrand: any;

	readonly extensionManagementServers: IExtensionManagementServer[];

	constructor(
		localExtensionManagementService: IExtensionManagementService
	) {
		this.extensionManagementServers = [{ extensionManagementService: localExtensionManagementService, location: localExtensionManagementServerLocation }];
	}

	getExtensionManagementServer(location: URI): IExtensionManagementServer {
		return this.extensionManagementServers[0];
	}

	getDefaultExtensionManagementServer(): IExtensionManagementServer {
		return this.extensionManagementServers[0];
	}
}

export class SingleServerExtensionManagementServerService implements IExtensionManagementServerService {

	_serviceBrand: any;

	readonly extensionManagementServers: IExtensionManagementServer[];

	constructor(
		extensionManagementServer: IExtensionManagementServer
	) {
		this.extensionManagementServers = [extensionManagementServer];
	}

	getExtensionManagementServer(location: URI): IExtensionManagementServer {
		location = location.scheme === Schemas.file ? URI.from({ scheme: Schemas.file }) : location;
		return this.extensionManagementServers.filter(server => location.authority === server.location.authority)[0];
	}

	getDefaultExtensionManagementServer(): IExtensionManagementServer {
		return this.extensionManagementServers[0];
	}
}