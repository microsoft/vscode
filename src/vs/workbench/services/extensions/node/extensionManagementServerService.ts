/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { IExtensionManagementServer, IExtensionManagementServerService, IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';

const localExtensionManagementServerAuthority: string = 'vscode-local';

export class ExtensionManagementServerService implements IExtensionManagementServerService {

	_serviceBrand: any;

	readonly extensionManagementServers: IExtensionManagementServer[];

	constructor(
		localExtensionManagementService: IExtensionManagementService
	) {
		this.extensionManagementServers = [{ extensionManagementService: localExtensionManagementService, authority: localExtensionManagementServerAuthority, label: localize('local', "Local") }];
	}

	getExtensionManagementServer(location: URI): IExtensionManagementServer {
		return this.extensionManagementServers[0];
	}

	getLocalExtensionManagementServer(): IExtensionManagementServer {
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
		const authority = location.scheme === Schemas.file ? localExtensionManagementServerAuthority : location.authority;
		return this.extensionManagementServers.filter(server => authority === server.authority)[0];
	}

	getLocalExtensionManagementServer(): IExtensionManagementServer {
		return this.extensionManagementServers[0];
	}
}