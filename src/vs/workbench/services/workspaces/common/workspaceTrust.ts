/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IWorkspace, IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IWorkspaceTrustModel, IWorkspaceTrustRequest, IWorkspaceTrustRequestModel, IWorkspaceTrustService, IWorkspaceTrustStateInfo, WorkspaceTrustState, WorkspaceTrustStateChangeEvent } from 'vs/platform/workspace/common/workspaceTrust';
import { isEqual, isEqualOrParent } from 'vs/base/common/extpath';

export const WORKSPACE_TRUST_ENABLED = 'workspace.trustEnabled';
export const WORKSPACE_TRUST_STORAGE_KEY = 'content.trust.model.key';
export const WORKSPACE_TRUST_URI = URI.parse('workspaceTrust:/Trusted Workspaces');

export const WorkspaceTrustContext = {
	PendingRequest: new RawContextKey<boolean>('workspaceTrustPendingRequest', false),
	TrustState: new RawContextKey<WorkspaceTrustState>('workspaceTrustState', WorkspaceTrustState.Unknown)
};

export class WorkspaceTrustModel extends Disposable implements IWorkspaceTrustModel {

	private storageKey = WORKSPACE_TRUST_STORAGE_KEY;
	private trustStateInfo: IWorkspaceTrustStateInfo;

	private readonly _onDidChangeTrustState = this._register(new Emitter<void>());
	readonly onDidChangeTrustState = this._onDidChangeTrustState.event;

	constructor(
		private readonly storageService: IStorageService
	) {
		super();

		this.trustStateInfo = this.loadTrustInfo();
		this._register(this.storageService.onDidChangeValue(changeEvent => {
			if (changeEvent.key === this.storageKey) {
				this.onDidStorageChange();
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
				localFolders: [],
				//trustedRemoteItems: []
			};
		}

		if (!result.localFolders) {
			result.localFolders = [];
		}

		// if (!result.trustedRemoteItems) {
		// 	result.trustedRemoteItems = [];
		// }

		return result;
	}

	private saveTrustInfo(): void {
		this.storageService.store(this.storageKey, JSON.stringify(this.trustStateInfo), StorageScope.GLOBAL, StorageTarget.MACHINE);
	}

	private onDidStorageChange(): void {
		this.trustStateInfo = this.loadTrustInfo();

		this._onDidChangeTrustState.fire();
	}

	setFolderTrustState(folder: URI, trustState: WorkspaceTrustState): void {
		let changed = false;

		const folderPath = folder.fsPath;

		if (trustState === WorkspaceTrustState.Unknown) {
			const before = this.trustStateInfo.localFolders.length;
			this.trustStateInfo.localFolders = this.trustStateInfo.localFolders.filter(info => isEqual(URI.file(info.uri).fsPath, folderPath));

			if (this.trustStateInfo.localFolders.length !== before) {
				changed = true;
			}
		} else {
			let found = false;
			for (const trustInfo of this.trustStateInfo.localFolders) {
				if (isEqual(URI.file(trustInfo.uri).fsPath, folderPath)) {
					found = true;
					if (trustInfo.trustState !== trustState) {
						trustInfo.trustState = trustState;
						changed = true;
					}
				}
			}

			if (!found) {
				this.trustStateInfo.localFolders.push({ uri: folderPath, trustState });
				changed = true;
			}
		}

		if (changed) {
			this.saveTrustInfo();
		}
	}

	getFolderTrustState(folder: URI): WorkspaceTrustState {
		let result = WorkspaceTrustState.Unknown;
		let maxLength = -1;

		const folderPath = folder.fsPath;
		for (const trustInfo of this.trustStateInfo.localFolders) {
			const trustInfoPath = URI.file(trustInfo.uri).fsPath;

			if (isEqualOrParent(folderPath, trustInfoPath)) {
				if (trustInfoPath.length > maxLength) {
					maxLength = trustInfoPath.length;
					result = trustInfo.trustState;
				}
			}
		}

		return result;
	}
}

export class WorkspaceTrustRequestModel extends Disposable implements IWorkspaceTrustRequestModel {
	trustRequest: IWorkspaceTrustRequest | undefined;

	private readonly _onDidInitiateRequest = this._register(new Emitter<void>());
	readonly onDidInitiateRequest: Event<void> = this._onDidInitiateRequest.event;

	private readonly _onDidCompleteRequest = this._register(new Emitter<WorkspaceTrustState | undefined>());
	readonly onDidCompleteRequest = this._onDidCompleteRequest.event;

	initiateRequest(request: IWorkspaceTrustRequest): void {
		if (this.trustRequest && (!request.immediate || this.trustRequest.immediate)) {
			return;
		}

		this.trustRequest = request;
		this._onDidInitiateRequest.fire();
	}

	completeRequest(trustState?: WorkspaceTrustState): void {
		this.trustRequest = undefined;
		this._onDidCompleteRequest.fire(trustState);
	}
}

export class WorkspaceTrustService extends Disposable implements IWorkspaceTrustService {

	_serviceBrand: undefined;
	private readonly dataModel: IWorkspaceTrustModel;
	readonly requestModel: IWorkspaceTrustRequestModel;

	private readonly _onDidChangeTrustState = this._register(new Emitter<WorkspaceTrustStateChangeEvent>());
	readonly onDidChangeTrustState = this._onDidChangeTrustState.event;

	private _currentTrustState: WorkspaceTrustState = WorkspaceTrustState.Unknown;
	private _inFlightResolver?: (trustState: WorkspaceTrustState) => void;
	private _trustRequestPromise?: Promise<WorkspaceTrustState>;
	private _workspace: IWorkspace;

	private readonly _ctxWorkspaceTrustState: IContextKey<WorkspaceTrustState>;
	private readonly _ctxWorkspaceTrustPendingRequest: IContextKey<boolean>;

	constructor(
		@IConfigurationService readonly configurationService: IConfigurationService,
		@IContextKeyService readonly contextKeyService: IContextKeyService,
		@IStorageService private readonly storageService: IStorageService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
	) {
		super();

		this.dataModel = this._register(new WorkspaceTrustModel(this.storageService));
		this.requestModel = this._register(new WorkspaceTrustRequestModel());

		this._workspace = this.workspaceService.getWorkspace();
		this._currentTrustState = this.calculateWorkspaceTrustState();

		this._register(this.dataModel.onDidChangeTrustState(() => this.currentTrustState = this.calculateWorkspaceTrustState()));
		this._register(this.requestModel.onDidCompleteRequest((trustState) => this.onTrustRequestCompleted(trustState)));

		this._ctxWorkspaceTrustState = WorkspaceTrustContext.TrustState.bindTo(contextKeyService);
		this._ctxWorkspaceTrustPendingRequest = WorkspaceTrustContext.PendingRequest.bindTo(contextKeyService);
		this._ctxWorkspaceTrustState.set(this.currentTrustState);
	}

	private get currentTrustState(): WorkspaceTrustState {
		return this._currentTrustState;
	}

	private set currentTrustState(trustState: WorkspaceTrustState) {
		if (this._currentTrustState === trustState) { return; }
		const previousState = this._currentTrustState;
		this._currentTrustState = trustState;

		this._onDidChangeTrustState.fire({ previousTrustState: previousState, currentTrustState: this._currentTrustState });
	}

	private calculateWorkspaceTrustState(): WorkspaceTrustState {
		if (!this.isWorkspaceTrustEnabled()) {
			return WorkspaceTrustState.Trusted;
		}

		if (this.workspaceService.getWorkbenchState() === WorkbenchState.EMPTY) {
			return WorkspaceTrustState.Trusted;
		}

		let state = undefined;
		for (const folder of this._workspace.folders) {
			const folderTrust = this.dataModel.getFolderTrustState(folder.uri);

			switch (folderTrust) {
				case WorkspaceTrustState.Untrusted:
					return WorkspaceTrustState.Untrusted;
				case WorkspaceTrustState.Unknown:
					state = folderTrust;
					break;
				case WorkspaceTrustState.Trusted:
					if (state === undefined) {
						state = folderTrust;
					}
					break;
			}
		}

		return state ?? WorkspaceTrustState.Unknown;
	}

	private onTrustRequestCompleted(trustState?: WorkspaceTrustState): void {
		if (this._inFlightResolver) {
			this._inFlightResolver(trustState === undefined ? this.currentTrustState : trustState);
		}

		this._inFlightResolver = undefined;
		this._trustRequestPromise = undefined;

		if (trustState === undefined) {
			return;
		}

		this._workspace.folders.forEach(folder => {
			this.dataModel.setFolderTrustState(folder.uri, trustState);
		});

		this._ctxWorkspaceTrustPendingRequest.set(false);
		this._ctxWorkspaceTrustState.set(trustState);
	}

	getWorkspaceTrustState(): WorkspaceTrustState {
		return this.currentTrustState;
	}

	isWorkspaceTrustEnabled(): boolean {
		return this.configurationService.getValue<boolean>(WORKSPACE_TRUST_ENABLED) ?? false;
	}

	async requireWorkspaceTrust(request?: IWorkspaceTrustRequest): Promise<WorkspaceTrustState> {
		if (this.currentTrustState === WorkspaceTrustState.Trusted) {
			return this.currentTrustState;
		}
		if (this.currentTrustState === WorkspaceTrustState.Untrusted && !request?.immediate) {
			return this.currentTrustState;
		}

		if (this._trustRequestPromise) {
			if (request?.immediate &&
				this.requestModel.trustRequest &&
				!this.requestModel.trustRequest.immediate) {
				this.requestModel.initiateRequest(request);
			}

			return this._trustRequestPromise;
		}

		this._trustRequestPromise = new Promise(resolve => {
			this._inFlightResolver = resolve;
		});

		this.requestModel.initiateRequest(request);
		this._ctxWorkspaceTrustPendingRequest.set(true);

		return this._trustRequestPromise;
	}
}

registerSingleton(IWorkspaceTrustService, WorkspaceTrustService);
