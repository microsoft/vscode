/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { WorkspaceTrustRequestOptions, IWorkspaceTrustManagementService, IWorkspaceTrustInfo, IWorkspaceTrustUriInfo, IWorkspaceTrustRequestService } from 'vs/platform/workspace/common/workspaceTrust';
import { isSingleFolderWorkspaceIdentifier, toWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { IUriIdentityService } from 'vs/workbench/services/uriIdentity/common/uriIdentity';

export const WORKSPACE_TRUST_ENABLED = 'security.workspace.trust.enabled';
export const WORKSPACE_TRUST_EXTENSION_UNTRUSTED_SUPPORT = 'security.workspace.trust.extensionUntrustedSupport';
export const WORKSPACE_TRUST_STORAGE_KEY = 'content.trust.model.key';

export const WorkspaceTrustContext = {
	PendingRequest: new RawContextKey<boolean>('workspaceTrustPendingRequest', false),
	IsTrusted: new RawContextKey<boolean>('isWorkspaceTrusted', false, localize('workspaceTrustCtx', "Whether the current workspace has been trusted by the user."))
};

export function isWorkspaceTrustEnabled(configurationService: IConfigurationService): boolean {
	return configurationService.inspect<boolean>(WORKSPACE_TRUST_ENABLED).userValue ?? false;
}

export class WorkspaceTrustManagementService extends Disposable implements IWorkspaceTrustManagementService {

	_serviceBrand: undefined;

	private readonly storageKey = WORKSPACE_TRUST_STORAGE_KEY;

	private readonly _onDidChangeTrust = this._register(new Emitter<boolean>());
	readonly onDidChangeTrust = this._onDidChangeTrust.event;

	private readonly _onDidChangeTrustedFolders = this._register(new Emitter<void>());
	readonly onDidChangeTrustedFolders = this._onDidChangeTrustedFolders.event;

	private _isWorkspaceTrusted: boolean = false;
	private _trustStateInfo: IWorkspaceTrustInfo;

	constructor(
		@IConfigurationService readonly configurationService: IConfigurationService,
		@IStorageService private readonly storageService: IStorageService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@IEnvironmentService private readonly envService: IEnvironmentService,
	) {
		super();

		this._trustStateInfo = this.loadTrustInfo();
		this._isWorkspaceTrusted = this.calculateWorkspaceTrust();

		this.registerListeners();
	}

	private set currentTrustState(trusted: boolean) {
		if (this._isWorkspaceTrusted === trusted) { return; }
		this._isWorkspaceTrusted = trusted;

		this._onDidChangeTrust.fire(trusted);
	}

	private registerListeners(): void {
		this._register(this.workspaceService.onDidChangeWorkspaceFolders(() => this.currentTrustState = this.calculateWorkspaceTrust()));
		this._register(this.storageService.onDidChangeValue(changeEvent => {
			if (changeEvent.key === this.storageKey) {
				this._trustStateInfo = this.loadTrustInfo();
				this.currentTrustState = this.calculateWorkspaceTrust();
			}
		}));
	}

	private loadTrustInfo(): IWorkspaceTrustInfo {
		const infoAsString = this.storageService.get(this.storageKey, StorageScope.GLOBAL);

		let result: IWorkspaceTrustInfo | undefined;
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
		this.storageService.store(this.storageKey, JSON.stringify(this._trustStateInfo), StorageScope.GLOBAL, StorageTarget.MACHINE);
		this._onDidChangeTrustedFolders.fire();
	}

	private calculateWorkspaceTrust(): boolean {
		if (!isWorkspaceTrustEnabled(this.configurationService)) {
			return true;
		}

		if (this.envService.extensionTestsLocationURI) {
			return true; // trust running tests with vscode-test
		}

		if (this.workspaceService.getWorkbenchState() === WorkbenchState.EMPTY) {
			return true;
		}

		const folderURIs = this.workspaceService.getWorkspace().folders.map(f => f.uri);
		const trusted = this.getFoldersTrust(folderURIs);

		return trusted;
	}

	private getFoldersTrust(folders: URI[]): boolean {
		let state = true;
		for (const folder of folders) {
			const { trusted } = this.getFolderTrustInfo(folder);

			if (!trusted) {
				state = trusted;
				return state;
			}
		}

		return state;
	}

	public getFolderTrustInfo(folder: URI): IWorkspaceTrustUriInfo {
		let resultState = false;
		let maxLength = -1;

		let resultUri = folder;

		for (const trustInfo of this._trustStateInfo.uriTrustInfo) {
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

	setFoldersTrust(folders: URI[], trusted: boolean): void {
		let changed = false;

		for (const folder of folders) {
			if (trusted) {
				const foundItem = this._trustStateInfo.uriTrustInfo.find(trustInfo => this.uriIdentityService.extUri.isEqual(trustInfo.uri, folder));
				if (!foundItem) {
					this._trustStateInfo.uriTrustInfo.push({ uri: folder, trusted: true });
					changed = true;
				}
			} else {
				const previousLength = this._trustStateInfo.uriTrustInfo.length;
				this._trustStateInfo.uriTrustInfo = this._trustStateInfo.uriTrustInfo.filter(trustInfo => !this.uriIdentityService.extUri.isEqual(trustInfo.uri, folder));
				if (previousLength !== this._trustStateInfo.uriTrustInfo.length) {
					changed = true;
				}
			}
		}

		if (changed) {
			this.saveTrustInfo();
		}
	}

	canSetWorkspaceTrust(): boolean {
		return this.workspaceService.getWorkspace().folders.length > 0;
	}

	canSetParentFolderTrust(): boolean {
		const workspaceIdentifier = toWorkspaceIdentifier(this.workspaceService.getWorkspace());
		return isSingleFolderWorkspaceIdentifier(workspaceIdentifier) && workspaceIdentifier.uri.scheme === Schemas.file;
	}

	isWorkpaceTrusted(): boolean {
		return this._isWorkspaceTrusted;
	}

	setParentFolderTrust(trusted: boolean): void {
	}

	setWorkspaceTrust(trusted: boolean): void {
		// TODO: workspace file for multi-root workspaces
		const folderURIs = this.workspaceService.getWorkspace().folders.map(f => f.uri);

		this.setFoldersTrust(folderURIs, trusted);
	}

	getTrustedFolders(): URI[] {
		return this._trustStateInfo.uriTrustInfo.map(info => info.uri);
	}

	setTrustedFolders(folders: URI[]): void {
		this._trustStateInfo.uriTrustInfo = [];
		for (const folder of folders) {
			this._trustStateInfo.uriTrustInfo.push({
				trusted: true,
				uri: folder
			});
		}

		this.saveTrustInfo();
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

registerSingleton(IWorkspaceTrustRequestService, WorkspaceTrustRequestService);
