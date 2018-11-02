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

	readonly localExtensionManagementServer;

	constructor(
		localExtensionManagementService: IExtensionManagementService
	) {
		this.localExtensionManagementServer = { extensionManagementService: localExtensionManagementService, authority: localExtensionManagementServerAuthority, label: localize('local', "Local") };
	}

	getExtensionManagementServer(location: URI): IExtensionManagementServer | null {
		return this.localExtensionManagementServer;
	}

	get otherExtensionManagementServer(): IExtensionManagementServer | null {
		return null;
	}
}

export class SingleServerExtensionManagementServerService implements IExtensionManagementServerService {

	_serviceBrand: any;


	constructor(
		private readonly extensionManagementServer: IExtensionManagementServer
	) {
	}

	getExtensionManagementServer(location: URI): IExtensionManagementServer | null {
		const authority = location.scheme === Schemas.file ? localExtensionManagementServerAuthority : location.authority;
		return this.extensionManagementServer.authority === authority ? this.extensionManagementServer : null;
	}

	get localExtensionManagementServer(): IExtensionManagementServer | null {
		return this.extensionManagementServer.authority === localExtensionManagementServerAuthority ? this.extensionManagementServer : null;
	}

	get otherExtensionManagementServer(): IExtensionManagementServer | null {
		return this.extensionManagementServer.authority !== localExtensionManagementServerAuthority ? this.extensionManagementServer : null;
	}
}