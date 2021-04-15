/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { WorkspaceTrustRequestOptions, IWorkspaceTrustManagementService, IWorkspaceTrustStateInfo, IWorkspaceTrustUriInfo, IWorkspaceTrustRequestService, IWorkspaceTrustStorageService as IWorkspaceTrustStorageService } from 'vs/platform/workspace/common/workspaceTrust';
import { IUriIdentityService } from 'vs/workbench/services/uriIdentity/common/uriIdentity';

export const WORKSPACE_TRUST_ENABLED = 'security.workspace.trust.enabled';
export const WORKSPACE_TRUST_EXTENSION_REQUEST = 'security.workspace.trust.extensionRequest';
export const WORKSPACE_TRUST_STORAGE_KEY = 'content.trust.model.key';

export const WorkspaceTrustContext = {
	PendingRequest: new RawContextKey<boolean>('workspaceTrustPendingRequest', false),
	IsTrusted: new RawContextKey<boolean>('isWorkspaceTrusted', false)
};

export function isWorkspaceTrustEnabled(configurationService: IConfigurationService): boolean {
	return configurationService.inspect<boolean>(WORKSPACE_TRUST_ENABLED).userValue ?? false;
}

export class WorkspaceTrustStorageService extends Disposable implements IWorkspaceTrustStorageService {
	_serviceBrand: undefined;

	private readonly storageKey = WORKSPACE_TRUST_STORAGE_KEY;
	private trustStateInfo: IWorkspaceTrustStateInfo;

	private readonly _onDidStorageChange = this._register(new Emitter<void>());
	readonly onDidStorageChange = this._onDidStorageChange.event;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService
	) {
		super();

		this.trustStateInfo = this.loadTrustInfo();
		this._register(this.storageService.onDidChangeValue(changeEvent => {
			if (changeEvent.key === this.storageKey) {
				this.trustStateInfo = this.loadTrustInfo();
				this._onDidStorageChange.fire();
			}
		}));
	}

	private loadTrustInfo(): IWorkspaceTrustStateInfo {
		const infoAsString = this.storageService.get(this.storageKey, StorageScope.GLOBAL);

		let result: IWorkspaceTrustStateInfo | undefined;
		try {
			if (infoAsString) {
				result = JSON.parse(infoAsString);
			}
		} catch { }

		if (!result) {
			result = {
				uriTrustInfo: []
			};
		}

		if (!result.uriTrustInfo) {
			result.uriTrustInfo = [];
		}

		result.uriTrustInfo = result.uriTrustInfo.map(info => { return { uri: URI.revive(info.uri), trusted: info.trusted }; });
		result.uriTrustInfo = result.uriTrustInfo.filter(info => info.trusted);

		return result;
	}

	private saveTrustInfo(): void {
		this.storageService.store(this.storageKey, JSON.stringify(this.trustStateInfo), StorageScope.GLOBAL, StorageTarget.MACHINE);
	}

	getFolderTrustStateInfo(folder: URI): IWorkspaceTrustUriInfo {
		let resultState = false;
		let maxLength = -1;

		let resultUri = folder;

		for (const trustInfo of this.trustStateInfo.uriTrustInfo) {
			if (this.uriIdentityService.extUri.isEqualOrParent(folder, trustInfo.uri)) {
				const fsPath = trustInfo.uri.fsPath;
				if (fsPath.length > maxLength) {
					maxLength = fsPath.length;
					resultState = trustInfo.trusted;
					resultUri = trustInfo.uri;
				}
			}
		}

		return { trusted: resultState, uri: resultUri };
	}

	private setFolderTrustState(folder: URI, trusted: boolean): boolean {
		if (trusted) {
			const foundItem = this.trustStateInfo.uriTrustInfo.find(trustInfo => this.uriIdentityService.extUri.isEqual(trustInfo.uri, folder));
			if (!foundItem) {
				this.trustStateInfo.uriTrustInfo.push({ uri: folder, trusted: true });
				return true;
			}
		} else {
			const previousLength = this.trustStateInfo.uriTrustInfo.length;
			this.trustStateInfo.uriTrustInfo = this.trustStateInfo.uriTrustInfo.filter(trustInfo => !this.uriIdentityService.extUri.isEqual(trustInfo.uri, folder));
			return previousLength !== this.trustStateInfo.uriTrustInfo.length;
		}

		return false;
	}

	setFoldersTrust(folders: URI[], trusted: boolean): void {
		let changed = false;
		for (const folder of folders) {
			changed = this.setFolderTrustState(folder, trusted) || changed;
		}

		if (changed) {
			this.saveTrustInfo();
		}
	}

	getFoldersTrust(folders: URI[]): boolean {
		let state = true;
		for (const folder of folders) {
			const { trusted } = this.getFolderTrustStateInfo(folder);

			if (!trusted) {
				state = trusted;
				return state;
			}
		}

		return state;
	}

	setTrustedFolders(folders: URI[]): void {
		this.trustStateInfo.uriTrustInfo = [];
		for (const folder of folders) {
			this.trustStateInfo.uriTrustInfo.push({
				trusted: true,
				uri: folder
			});
		}

		this.saveTrustInfo();
	}

	getTrustStateInfo(): IWorkspaceTrustStateInfo {
		return this.trustStateInfo;
	}
}

export class WorkspaceTrustManagementService extends Disposable implements IWorkspaceTrustManagementService {

	_serviceBrand: undefined;

	private readonly _onDidChangeTrust = this._register(new Emitter<boolean>());
	readonly onDidChangeTrust = this._onDidChangeTrust.event;

	private _isWorkspaceTrusted: boolean = false;

	constructor(
		@IConfigurationService readonly configurationService: IConfigurationService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@IWorkspaceTrustStorageService private readonly workspaceTrustStorageService: IWorkspaceTrustStorageService
	) {
		super();

		this._isWorkspaceTrusted = this.calculateWorkspaceTrust();

		this._register(this.workspaceService.onDidChangeWorkspaceFolders(() => this.currentTrustState = this.calculateWorkspaceTrust()));
		this._register(this.workspaceTrustStorageService.onDidStorageChange(() => this.currentTrustState = this.calculateWorkspaceTrust()));
	}

	private set currentTrustState(trusted: boolean) {
		if (this._isWorkspaceTrusted === trusted) { return; }
		this._isWorkspaceTrusted = trusted;

		this._onDidChangeTrust.fire(trusted);
	}

	private calculateWorkspaceTrust(): boolean {
		if (!isWorkspaceTrustEnabled(this.configurationService)) {
			return true;
		}

		if (this.workspaceService.getWorkbenchState() === WorkbenchState.EMPTY) {
			return true;
		}

		const folderURIs = this.workspaceService.getWorkspace().folders.map(f => f.uri);
		const trusted = this.workspaceTrustStorageService.getFoldersTrust(folderURIs);

		return trusted;
	}

	isWorkpaceTrusted(): boolean {
		return this._isWorkspaceTrusted;
	}

	setWorkspaceTrust(trusted: boolean): void {
		const folderURIs = this.workspaceService.getWorkspace().folders.map(f => f.uri);
		this.workspaceTrustStorageService.setFoldersTrust(folderURIs, trusted);
	}
}

export class WorkspaceTrustRequestService extends Disposable implements IWorkspaceTrustRequestService {
	_serviceBrand: undefined;

	private _trusted!: boolean;
	private _trustRequestPromise?: Promise<boolean>;
	private _trustRequestResolver?: (trusted: boolean) => void;
	private _modalTrustRequestPromise?: Promise<boolean>;
	private _modalTrustRequestResolver?: (trusted: boolean) => void;
	private readonly _ctxWorkspaceTrustState: IContextKey<boolean>;
	private readonly _ctxWorkspaceTrustPendingRequest: IContextKey<boolean>;

	private readonly _onDidInitiateWorkspaceTrustRequest = this._register(new Emitter<WorkspaceTrustRequestOptions>());
	readonly onDidInitiateWorkspaceTrustRequest = this._onDidInitiateWorkspaceTrustRequest.event;

	private readonly _onDidCompleteWorkspaceTrustRequest = this._register(new Emitter<boolean>());
	readonly onDidCompleteWorkspaceTrustRequest = this._onDidCompleteWorkspaceTrustRequest.event;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustManagementService: IWorkspaceTrustManagementService,
	) {
		super();

		this._register(this.workspaceTrustManagementService.onDidChangeTrust(trusted => this.onTrustStateChanged(trusted)));

		this._ctxWorkspaceTrustState = WorkspaceTrustContext.IsTrusted.bindTo(contextKeyService);
		this._ctxWorkspaceTrustPendingRequest = WorkspaceTrustContext.PendingRequest.bindTo(contextKeyService);

		this.trusted = this.workspaceTrustManagementService.isWorkpaceTrusted();
	}

	private get trusted(): boolean {
		return this._trusted;
	}

	private set trusted(trusted: boolean) {
		this._trusted = trusted;
		this._ctxWorkspaceTrustState.set(trusted);
	}

	private onTrustStateChanged(trusted: boolean): void {
		// Resolve any pending soft requests for workspace trust
		if (this._trustRequestResolver) {
			this._trustRequestResolver(trusted);

			this._trustRequestResolver = undefined;
			this._trustRequestPromise = undefined;
		}

		// Update context if there are no pending requests
		if (!this._modalTrustRequestPromise && !this._trustRequestPromise) {
			this._ctxWorkspaceTrustPendingRequest.set(false);
		}

		this.trusted = trusted;
	}

	cancelRequest(): void {
		if (this._modalTrustRequestResolver) {
			this._modalTrustRequestResolver(this.trusted);

			this._modalTrustRequestResolver = undefined;
			this._modalTrustRequestPromise = undefined;
		}
	}

	completeRequest(trusted?: boolean): void {
		if (this._modalTrustRequestResolver) {
			this._modalTrustRequestResolver(trusted ?? this.trusted);

			this._modalTrustRequestResolver = undefined;
			this._modalTrustRequestPromise = undefined;
		}
		if (this._trustRequestResolver) {
			this._trustRequestResolver(trusted ?? this.trusted);

			this._trustRequestResolver = undefined;
			this._trustRequestPromise = undefined;
		}

		if (trusted === undefined) {
			return;
		}

		this.workspaceTrustManagementService.setWorkspaceTrust(trusted);
		this._onDidCompleteWorkspaceTrustRequest.fire(trusted);
	}

	async requestWorkspaceTrust(options: WorkspaceTrustRequestOptions = { modal: false }): Promise<boolean> {
		// Trusted workspace
		if (this.trusted) {
			return this.trusted;
		}

		if (options.modal) {
			// Modal request
			if (!this._modalTrustRequestPromise) {
				// Create promise
				this._modalTrustRequestPromise = new Promise(resolve => {
					this._modalTrustRequestResolver = resolve;
				});
			} else {
				// Return existing promise
				return this._modalTrustRequestPromise;
			}
		} else {
			// Soft request
			if (!this._trustRequestPromise) {
				// Create promise
				this._trustRequestPromise = new Promise(resolve => {
					this._trustRequestResolver = resolve;
				});
			} else {
				// Return existing promise
				return this._trustRequestPromise;
			}
		}

		this._ctxWorkspaceTrustPendingRequest.set(true);
		this._onDidInitiateWorkspaceTrustRequest.fire(options);

		return options.modal ? this._modalTrustRequestPromise! : this._trustRequestPromise!;
	}
}

registerSingleton(IWorkspaceTrustManagementService, WorkspaceTrustManagementService);
registerSingleton(IWorkspaceTrustRequestService, WorkspaceTrustRequestService);
registerSingleton(IWorkspaceTrustStorageService, WorkspaceTrustStorageService);
