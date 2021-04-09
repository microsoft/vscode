/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { dirname, resolve } from 'vs/base/common/path';
import { URI } from 'vs/base/common/uri';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { WorkspaceTrustRequestOptions, IWorkspaceTrustRequestModel, IWorkspaceTrustManagementService, IWorkspaceTrustStateInfo, WorkspaceTrustState, WorkspaceTrustStateChangeEvent, IWorkspaceTrustUriInfo, IWorkspaceTrustRequestService, IWorkspaceTrustStorageService as IWorkspaceTrustStorageService } from 'vs/platform/workspace/common/workspaceTrust';
import { EditorModel } from 'vs/workbench/common/editor';
import { IUriIdentityService } from 'vs/workbench/services/uriIdentity/common/uriIdentity';

export const WORKSPACE_TRUST_ENABLED = 'security.workspace.trust.enabled';
export const WORKSPACE_TRUST_STORAGE_KEY = 'content.trust.model.key';

export const WorkspaceTrustContext = {
	PendingRequest: new RawContextKey<boolean>('workspaceTrustPendingRequest', false),
	TrustState: new RawContextKey<WorkspaceTrustState>('workspaceTrustState', WorkspaceTrustState.Unspecified)
};

export class WorkspaceTrustEditorModel extends EditorModel {
	constructor(
		readonly workspaceTrustStorageService: IWorkspaceTrustStorageService,
		readonly workspaceTrustManagementService: WorkspaceTrustManagementService
	) {
		super();
	}
}

export class WorkspaceTrustRequestModel extends Disposable implements IWorkspaceTrustRequestModel {
	trustRequestOptions: WorkspaceTrustRequestOptions | undefined;

	private readonly _onDidInitiateRequest = this._register(new Emitter<void>());
	readonly onDidInitiateRequest: Event<void> = this._onDidInitiateRequest.event;

	private readonly _onDidCompleteRequest = this._register(new Emitter<WorkspaceTrustState | undefined>());
	readonly onDidCompleteRequest = this._onDidCompleteRequest.event;

	private readonly _onDidCancelRequest = this._register(new Emitter<void>());
	readonly onDidCancelRequest = this._onDidCancelRequest.event;

	initiateRequest(options: WorkspaceTrustRequestOptions): void {
		if (this.trustRequestOptions && (!options.modal || this.trustRequestOptions.modal)) {
			return;
		}

		this.trustRequestOptions = options;
		this._onDidInitiateRequest.fire();
	}

	completeRequest(trustState?: WorkspaceTrustState): void {
		this.trustRequestOptions = undefined;
		this._onDidCompleteRequest.fire(trustState);
	}

	cancelRequest(): void {
		this.trustRequestOptions = undefined;
		this._onDidCancelRequest.fire();
	}
}

export class WorkspaceTrustStorageService extends Disposable implements IWorkspaceTrustStorageService {
	_serviceBrand: undefined;

	private storageKey = WORKSPACE_TRUST_STORAGE_KEY;
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

		result.uriTrustInfo = result.uriTrustInfo.map(info => { return { uri: URI.revive(info.uri), trustState: info.trustState }; });

		return result;
	}

	private saveTrustInfo(): void {
		this.storageService.store(this.storageKey, JSON.stringify(this.trustStateInfo), StorageScope.GLOBAL, StorageTarget.MACHINE);
	}

	getFolderTrustStateInfo(folder: URI): IWorkspaceTrustUriInfo {
		let resultState = WorkspaceTrustState.Unspecified;
		let maxLength = -1;

		let resultUri = folder;

		for (const trustInfo of this.trustStateInfo.uriTrustInfo) {
			if (this.uriIdentityService.extUri.isEqualOrParent(folder, trustInfo.uri)) {
				const fsPath = trustInfo.uri.fsPath;
				if (fsPath.length > maxLength) {
					maxLength = fsPath.length;
					resultState = trustInfo.trustState;
					resultUri = trustInfo.uri;
				}
			}
		}

		return { trustState: resultState, uri: resultUri };
	}

	private setFolderTrustState(folder: URI, trustState: WorkspaceTrustState): boolean {
		let changed = false;

		if (trustState === WorkspaceTrustState.Unspecified) {
			const before = this.trustStateInfo.uriTrustInfo.length;
			this.trustStateInfo.uriTrustInfo = this.trustStateInfo.uriTrustInfo.filter(info => this.uriIdentityService.extUri.isEqual(info.uri, folder));

			if (this.trustStateInfo.uriTrustInfo.length !== before) {
				changed = true;
			}
		} else {
			let found = false;
			for (const trustInfo of this.trustStateInfo.uriTrustInfo) {
				if (this.uriIdentityService.extUri.isEqual(trustInfo.uri, folder)) {
					found = true;
					if (trustInfo.trustState !== trustState) {
						trustInfo.trustState = trustState;
						changed = true;
					}
				}
			}

			if (!found) {
				this.trustStateInfo.uriTrustInfo.push({ uri: folder, trustState });
				changed = true;
			}
		}

		return changed;
	}

	setFoldersTrustState(folders: URI[], trustState: WorkspaceTrustState): void {
		let changed = false;
		for (const folder of folders) {
			changed = this.setFolderTrustState(folder, trustState) || changed;
		}

		if (changed) {
			this.saveTrustInfo();
		}
	}

	getFoldersTrustState(folders: URI[]): WorkspaceTrustState {
		let state = undefined;
		for (const folder of folders) {
			const { trustState } = this.getFolderTrustStateInfo(folder);

			switch (trustState) {
				case WorkspaceTrustState.Untrusted:
					return WorkspaceTrustState.Untrusted;
				case WorkspaceTrustState.Unspecified:
					state = trustState;
					break;
				case WorkspaceTrustState.Trusted:
					if (state === undefined) {
						state = trustState;
					}
					break;
			}
		}

		return state ?? WorkspaceTrustState.Unspecified;
	}

	setTrustedFolders(folders: URI[]): void {
		this.trustStateInfo.uriTrustInfo = this.trustStateInfo.uriTrustInfo.filter(folder => folder.trustState !== WorkspaceTrustState.Trusted);
		for (const folder of folders) {
			this.trustStateInfo.uriTrustInfo.push({
				trustState: WorkspaceTrustState.Trusted,
				uri: folder
			});
		}

		this.saveTrustInfo();
	}

	setUntrustedFolders(folders: URI[]): void {
		this.trustStateInfo.uriTrustInfo = this.trustStateInfo.uriTrustInfo.filter(folder => folder.trustState !== WorkspaceTrustState.Untrusted);
		for (const folder of folders) {
			this.trustStateInfo.uriTrustInfo.push({
				trustState: WorkspaceTrustState.Untrusted,
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
	private editorModel?: WorkspaceTrustEditorModel;

	private readonly _onDidChangeTrustState = this._register(new Emitter<WorkspaceTrustStateChangeEvent>());
	readonly onDidChangeTrustState = this._onDidChangeTrustState.event;

	private _currentTrustState: WorkspaceTrustState = WorkspaceTrustState.Unspecified;

	constructor(
		@IConfigurationService readonly configurationService: IConfigurationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@IWorkspaceTrustStorageService private readonly workspaceTrustStorageService: IWorkspaceTrustStorageService
	) {
		super();

		this._currentTrustState = this.calculateWorkspaceTrustState();

		this._register(this.workspaceService.onDidChangeWorkspaceFolders(() => this.currentTrustState = this.calculateWorkspaceTrustState()));
		this._register(this.workspaceTrustStorageService.onDidStorageChange(() => this.currentTrustState = this.calculateWorkspaceTrustState()));

		this.logInitialWorkspaceTrustInfo();
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

	get workspaceTrustEditorModel(): WorkspaceTrustEditorModel {
		if (this.editorModel === undefined) {
			this.editorModel = this._register(new WorkspaceTrustEditorModel(this.workspaceTrustStorageService, this));
		}

		return this.editorModel;
	}

	private logInitialWorkspaceTrustInfo(): void {
		if (!this.isWorkspaceTrustEnabled()) {
			return;
		}

		type WorkspaceTrustInfoEventClassification = {
			trustedFoldersCount: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
			untrustedFoldersCount: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
		};

		type WorkspaceTrustInfoEvent = {
			trustedFoldersCount: number,
			untrustedFoldersCount: number
		};

		const trustStateInfo = this.workspaceTrustStorageService.getTrustStateInfo();
		this.telemetryService.publicLog2<WorkspaceTrustInfoEvent, WorkspaceTrustInfoEventClassification>('workspaceTrustFolderCounts', {
			trustedFoldersCount: trustStateInfo.uriTrustInfo.filter(item => item.trustState === WorkspaceTrustState.Trusted).length,
			untrustedFoldersCount: trustStateInfo.uriTrustInfo.filter(item => item.trustState === WorkspaceTrustState.Untrusted).length
		});
	}

	private logWorkspaceTrustFolderInfo(): void {
		if (!this.isWorkspaceTrustEnabled()) {
			return;
		}

		type WorkspaceTrustFolderInfoEventClassification = {
			trustedFolderDepth: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
			workspaceFolderDepth: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
			delta: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
		};

		type WorkspaceTrustFolderInfoEvent = {
			trustedFolderDepth: number,
			workspaceFolderDepth: number,
			delta: number
		};

		const getDepth = (folder: string): number => {
			let resolvedPath = resolve(folder);

			let depth = 0;
			while (dirname(resolvedPath) !== resolvedPath && depth < 100) {
				resolvedPath = dirname(resolvedPath);
				depth++;
			}

			return depth;
		};

		for (const folder of this.workspaceService.getWorkspace().folders) {
			const { trustState, uri } = this.workspaceTrustStorageService.getFolderTrustStateInfo(folder.uri);
			if (trustState !== WorkspaceTrustState.Trusted) {
				continue;
			}

			const workspaceFolderDepth = getDepth(folder.uri.fsPath);
			const trustedFolderDepth = getDepth(uri.fsPath);
			const delta = workspaceFolderDepth - trustedFolderDepth;

			this.telemetryService.publicLog2<WorkspaceTrustFolderInfoEvent, WorkspaceTrustFolderInfoEventClassification>('workspaceFolderDepthBelowTrustedFolder', { workspaceFolderDepth, trustedFolderDepth, delta });
		}
	}

	private calculateWorkspaceTrustState(): WorkspaceTrustState {
		if (!this.isWorkspaceTrustEnabled()) {
			return WorkspaceTrustState.Trusted;
		}

		if (this.workspaceService.getWorkbenchState() === WorkbenchState.EMPTY) {
			return WorkspaceTrustState.Trusted;
		}

		const folderURIs = this.workspaceService.getWorkspace().folders.map(f => f.uri);
		const trustState = this.workspaceTrustStorageService.getFoldersTrustState(folderURIs);

		this.logWorkspaceTrustFolderInfo();

		return trustState;
	}

	getWorkspaceTrustState(): WorkspaceTrustState {
		return this.currentTrustState;
	}

	setWorkspaceTrustState(trustState: WorkspaceTrustState): void {
		const folderURIs = this.workspaceService.getWorkspace().folders.map(f => f.uri);
		this.workspaceTrustStorageService.setFoldersTrustState(folderURIs, trustState);
	}

	isWorkspaceTrustEnabled(): boolean {
		return this.configurationService.inspect<boolean>(WORKSPACE_TRUST_ENABLED).userValue ?? false;
	}
}

export class WorkspaceTrustRequestService extends Disposable implements IWorkspaceTrustRequestService {
	_serviceBrand: undefined;

	private _currentTrustState!: WorkspaceTrustState;
	private _trustRequestPromise?: Promise<WorkspaceTrustState | undefined>;
	private _trustRequestResolver?: (trustState?: WorkspaceTrustState) => void;
	private _modalTrustRequestPromise?: Promise<WorkspaceTrustState | undefined>;
	private _modalTrustRequestResolver?: (trustState?: WorkspaceTrustState) => void;
	private readonly _ctxWorkspaceTrustState: IContextKey<WorkspaceTrustState>;
	private readonly _ctxWorkspaceTrustPendingRequest: IContextKey<boolean>;

	readonly requestModel: IWorkspaceTrustRequestModel;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustManagementService: IWorkspaceTrustManagementService,
	) {
		super();

		this.requestModel = this._register(new WorkspaceTrustRequestModel());
		this._register(this.requestModel.onDidCancelRequest(() => this.onTrustRequestCancelled()));
		this._register(this.requestModel.onDidCompleteRequest(trustState => this.onTrustRequestCompleted(trustState)));
		this._register(this.workspaceTrustManagementService.onDidChangeTrustState(trustState => this.onTrustStateChanged(trustState.currentTrustState)));

		this._ctxWorkspaceTrustState = WorkspaceTrustContext.TrustState.bindTo(contextKeyService);
		this._ctxWorkspaceTrustPendingRequest = WorkspaceTrustContext.PendingRequest.bindTo(contextKeyService);

		this.currentTrustState = this.workspaceTrustManagementService.getWorkspaceTrustState();
	}

	private get currentTrustState(): WorkspaceTrustState {
		return this._currentTrustState;
	}

	private set currentTrustState(trustState: WorkspaceTrustState) {
		this._currentTrustState = trustState;
		this._ctxWorkspaceTrustState.set(trustState);
	}

	private onTrustRequestCancelled(): void {
		if (this._modalTrustRequestResolver) {
			this._modalTrustRequestResolver(undefined);

			this._modalTrustRequestResolver = undefined;
			this._modalTrustRequestPromise = undefined;
		}
	}

	private onTrustRequestCompleted(trustState?: WorkspaceTrustState): void {
		if (this._modalTrustRequestResolver) {
			this._modalTrustRequestResolver(trustState ?? this.currentTrustState);

			this._modalTrustRequestResolver = undefined;
			this._modalTrustRequestPromise = undefined;
		}
		if (this._trustRequestResolver) {
			this._trustRequestResolver(trustState ?? this.currentTrustState);

			this._trustRequestResolver = undefined;
			this._trustRequestPromise = undefined;
		}

		if (trustState === undefined) {
			return;
		}

		this.workspaceTrustManagementService.setWorkspaceTrustState(trustState);
	}

	private onTrustStateChanged(trustState: WorkspaceTrustState): void {
		// Resolve any pending soft requests for workspace trust
		if (this._trustRequestResolver) {
			this._trustRequestResolver(trustState);

			this._trustRequestResolver = undefined;
			this._trustRequestPromise = undefined;
		}

		// Update context if there are no pending requests
		if (!this._modalTrustRequestPromise && !this._trustRequestPromise) {
			this._ctxWorkspaceTrustPendingRequest.set(false);
		}

		this.currentTrustState = trustState;
	}

	async requestWorkspaceTrust(options: WorkspaceTrustRequestOptions = { modal: true }): Promise<WorkspaceTrustState | undefined> {
		// Trusted workspace
		if (this.currentTrustState === WorkspaceTrustState.Trusted) {
			return this.currentTrustState;
		}
		// Untrusted workspace - soft request
		if (this.currentTrustState === WorkspaceTrustState.Untrusted && !options.modal) {
			return this.currentTrustState;
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

		this.requestModel.initiateRequest(options);
		this._ctxWorkspaceTrustPendingRequest.set(true);

		return options.modal ? this._modalTrustRequestPromise! : this._trustRequestPromise!;
	}
}

registerSingleton(IWorkspaceTrustManagementService, WorkspaceTrustManagementService);
registerSingleton(IWorkspaceTrustRequestService, WorkspaceTrustRequestService);
