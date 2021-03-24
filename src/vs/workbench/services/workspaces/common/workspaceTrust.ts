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
import { IWorkspaceTrustModel, WorkspaceTrustRequestOptions, IWorkspaceTrustRequestModel, IWorkspaceTrustService, IWorkspaceTrustStateInfo, WorkspaceTrustState, WorkspaceTrustStateChangeEvent, IWorkspaceTrustFolderInfo } from 'vs/platform/workspace/common/workspaceTrust';
import { isEqual, isEqualOrParent } from 'vs/base/common/extpath';
import { EditorModel } from 'vs/workbench/common/editor';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { dirname, resolve } from 'vs/base/common/path';
import { canceled } from 'vs/base/common/errors';

export const WORKSPACE_TRUST_ENABLED = 'workspace.trustEnabled';
export const WORKSPACE_TRUST_STORAGE_KEY = 'content.trust.model.key';

export const WorkspaceTrustContext = {
	PendingRequest: new RawContextKey<boolean>('workspaceTrustPendingRequest', false),
	TrustState: new RawContextKey<WorkspaceTrustState>('workspaceTrustState', WorkspaceTrustState.Unknown)
};

export class WorkspaceTrustEditorModel extends EditorModel {
	constructor(
		readonly dataModel: IWorkspaceTrustModel,
		private readonly workspaceTrustService: WorkspaceTrustService
	) {
		super();
	}

	get currentWorkspaceTrustState(): WorkspaceTrustState {
		return this.workspaceTrustService.getWorkspaceTrustState();
	}
}
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

	setTrustedFolders(folders: URI[]): void {
		this.trustStateInfo.localFolders = this.trustStateInfo.localFolders.filter(folder => folder.trustState !== WorkspaceTrustState.Trusted);
		for (const folder of folders) {
			this.trustStateInfo.localFolders.push({
				trustState: WorkspaceTrustState.Trusted,
				uri: folder.fsPath
			});
		}

		this.saveTrustInfo();
	}

	setUntrustedFolders(folders: URI[]): void {
		this.trustStateInfo.localFolders = this.trustStateInfo.localFolders.filter(folder => folder.trustState !== WorkspaceTrustState.Untrusted);
		for (const folder of folders) {
			this.trustStateInfo.localFolders.push({
				trustState: WorkspaceTrustState.Untrusted,
				uri: folder.fsPath
			});
		}

		this.saveTrustInfo();
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

	getFolderTrustStateInfo(folder: URI): IWorkspaceTrustFolderInfo {
		let resultState = WorkspaceTrustState.Unknown;
		let maxLength = -1;

		const folderPath = folder.fsPath;
		let resultFolder = folderPath;

		for (const trustInfo of this.trustStateInfo.localFolders) {
			const trustInfoPath = URI.file(trustInfo.uri).fsPath;

			if (isEqualOrParent(folderPath, trustInfoPath)) {
				if (trustInfoPath.length > maxLength) {
					maxLength = trustInfoPath.length;
					resultState = trustInfo.trustState;
					resultFolder = trustInfoPath;
				}
			}
		}

		return { trustState: resultState, uri: resultFolder };
	}

	getTrustStateInfo(): IWorkspaceTrustStateInfo {
		return this.trustStateInfo;
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

export class WorkspaceTrustService extends Disposable implements IWorkspaceTrustService {

	_serviceBrand: undefined;
	private readonly dataModel: IWorkspaceTrustModel;
	readonly requestModel: IWorkspaceTrustRequestModel;
	private editorModel?: WorkspaceTrustEditorModel;

	private readonly _onDidChangeTrustState = this._register(new Emitter<WorkspaceTrustStateChangeEvent>());
	readonly onDidChangeTrustState = this._onDidChangeTrustState.event;

	private _currentTrustState: WorkspaceTrustState = WorkspaceTrustState.Unknown;
	private _trustRequestPromise?: Promise<WorkspaceTrustState>;
	private _inFlightResolver?: (trustState: WorkspaceTrustState) => void;
	private _modalTrustRequestPromise?: Promise<WorkspaceTrustState>;
	private _modalTrustRequestResolver?: (trustState: WorkspaceTrustState) => void;
	private _modalTrustRequestRejecter?: (error: Error) => void;
	private _workspace: IWorkspace;

	private readonly _ctxWorkspaceTrustState: IContextKey<WorkspaceTrustState>;
	private readonly _ctxWorkspaceTrustPendingRequest: IContextKey<boolean>;

	constructor(
		@IConfigurationService readonly configurationService: IConfigurationService,
		@IContextKeyService readonly contextKeyService: IContextKeyService,
		@IStorageService private readonly storageService: IStorageService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();

		this.dataModel = this._register(new WorkspaceTrustModel(this.storageService));
		this.requestModel = this._register(new WorkspaceTrustRequestModel());

		this._workspace = this.workspaceService.getWorkspace();
		this._currentTrustState = this.calculateWorkspaceTrustState();

		this.logInitialWorkspaceTrustInfo();

		this._register(this.workspaceService.onDidChangeWorkspaceFolders(() => this.currentTrustState = this.calculateWorkspaceTrustState()));
		this._register(this.dataModel.onDidChangeTrustState(() => this.currentTrustState = this.calculateWorkspaceTrustState()));
		this._register(this.requestModel.onDidCompleteRequest((trustState) => this.onTrustRequestCompleted(trustState)));
		this._register(this.requestModel.onDidCancelRequest(() => this.onTrustRequestCancelled()));

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

	get workspaceTrustEditorModel(): WorkspaceTrustEditorModel {
		if (this.editorModel === undefined) {
			this.editorModel = this._register(new WorkspaceTrustEditorModel(this.dataModel, this));
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

		this.telemetryService.publicLog2<WorkspaceTrustInfoEvent, WorkspaceTrustInfoEventClassification>('workspaceTrustFolderCounts', {
			trustedFoldersCount: this.dataModel.getTrustStateInfo().localFolders.filter(item => item.trustState === WorkspaceTrustState.Trusted).length,
			untrustedFoldersCount: this.dataModel.getTrustStateInfo().localFolders.filter(item => item.trustState === WorkspaceTrustState.Untrusted).length
		});
	}

	private logWorkspaceTrustFolderInfo(workspaceFolder: string, trustedFolder: string): void {
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

		const workspaceFolderDepth = getDepth(workspaceFolder);
		const trustedFolderDepth = getDepth(trustedFolder);
		const delta = workspaceFolderDepth - trustedFolderDepth;

		this.telemetryService.publicLog2<WorkspaceTrustFolderInfoEvent, WorkspaceTrustFolderInfoEventClassification>('workspaceFolderDepthBelowTrustedFolder', { workspaceFolderDepth, trustedFolderDepth, delta });
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
			const { trustState, uri } = this.dataModel.getFolderTrustStateInfo(folder.uri);

			switch (trustState) {
				case WorkspaceTrustState.Untrusted:
					return WorkspaceTrustState.Untrusted;
				case WorkspaceTrustState.Unknown:
					state = trustState;
					break;
				case WorkspaceTrustState.Trusted:
					this.logWorkspaceTrustFolderInfo(folder.uri.fsPath, uri);
					if (state === undefined) {
						state = trustState;
					}
					break;
			}
		}

		return state ?? WorkspaceTrustState.Unknown;
	}

	private onTrustRequestCompleted(trustState?: WorkspaceTrustState): void {
		if (this._modalTrustRequestResolver) {
			this._modalTrustRequestResolver(trustState === undefined ? this.currentTrustState : trustState);
		}
		if (this._inFlightResolver) {
			this._inFlightResolver(trustState === undefined ? this.currentTrustState : trustState);
		}

		this._inFlightResolver = undefined;
		this._trustRequestPromise = undefined;

		this._modalTrustRequestResolver = undefined;
		this._modalTrustRequestRejecter = undefined;
		this._modalTrustRequestPromise = undefined;

		if (trustState === undefined) {
			return;
		}

		this._workspace.folders.forEach(folder => {
			this.dataModel.setFolderTrustState(folder.uri, trustState);
		});

		this._ctxWorkspaceTrustPendingRequest.set(false);
		this._ctxWorkspaceTrustState.set(trustState);
	}

	private onTrustRequestCancelled(): void {
		if (this._modalTrustRequestRejecter) {
			this._modalTrustRequestRejecter(canceled());
		}

		this._modalTrustRequestResolver = undefined;
		this._modalTrustRequestRejecter = undefined;
		this._modalTrustRequestPromise = undefined;
	}

	getWorkspaceTrustState(): WorkspaceTrustState {
		return this.currentTrustState;
	}

	isWorkspaceTrustEnabled(): boolean {
		return this.configurationService.getValue<boolean>(WORKSPACE_TRUST_ENABLED) ?? false;
	}

	async requireWorkspaceTrust(options: WorkspaceTrustRequestOptions = { modal: true }): Promise<WorkspaceTrustState> {
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
				this._modalTrustRequestPromise = new Promise((resolve, reject) => {
					this._modalTrustRequestResolver = resolve;
					this._modalTrustRequestRejecter = reject;
				});
			} else {
				// Return existing promises
				return this._modalTrustRequestPromise;
			}
		} else {
			// Soft request
			if (!this._trustRequestPromise) {
				this._trustRequestPromise = new Promise(resolve => {
					this._inFlightResolver = resolve;
				});
			} else {
				return this._trustRequestPromise;
			}
		}

		this.requestModel.initiateRequest(options);
		this._ctxWorkspaceTrustPendingRequest.set(true);

		return options.modal ? this._modalTrustRequestPromise! : this._trustRequestPromise!;
	}
}

registerSingleton(IWorkspaceTrustService, WorkspaceTrustService);
