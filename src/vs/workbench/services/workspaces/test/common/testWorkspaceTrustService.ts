/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { IWorkspaceTrustManagementService, IWorkspaceTrustUriInfo } from 'vs/platform/workspace/common/workspaceTrust';


export class TestWorkspaceTrustManagementService implements IWorkspaceTrustManagementService {
	_serviceBrand: undefined;

	private _onDidChangeTrust = new Emitter<boolean>();
	onDidChangeTrust = this._onDidChangeTrust.event;

	private _onDidChangeTrustedFolders = new Emitter<void>();
	onDidChangeTrustedFolders = this._onDidChangeTrustedFolders.event;

	private trusted: boolean;

	constructor(trusted: boolean = true) {
		this.trusted = trusted;
	}

	getTrustedFolders(): URI[] {
		throw new Error('Method not implemented.');
	}

	setParentFolderTrust(trusted: boolean): void {
		throw new Error('Method not implemented.');
	}

	getFolderTrustInfo(folder: URI): IWorkspaceTrustUriInfo {
		throw new Error('Method not implemented.');
	}

	setTrustedFolders(folders: URI[]): void {
		throw new Error('Method not implemented.');
	}

	setFoldersTrust(folders: URI[], trusted: boolean): void {
		throw new Error('Method not implemented.');
	}

	canSetParentFolderTrust(): boolean {
		throw new Error('Method not implemented.');
	}

	canSetWorkspaceTrust(): boolean {
		throw new Error('Method not implemented.');
	}

	isWorkpaceTrusted(): boolean {
		return this.trusted;
	}

	setWorkspaceTrust(trusted: boolean): void {
		if (this.trusted !== trusted) {
			this.trusted = trusted;
			this._onDidChangeTrust.fire(this.trusted);
		}
	}
}
