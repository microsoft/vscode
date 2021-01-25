/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IWorkspace, IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';

export const TRUSTED_WORKSPACES_ENABLED = 'workspace.trustRequirementEnabled';
export const TRUSTED_WORKSPACES_URI = URI.parse('trustedWorkspaces:/Trusted Workspaces');

export enum WorkspaceTrustScope {
	Local = 0,
	Remote = 1
}

export enum WorkspaceTrustState {
	Untrusted = 0,
	Trusted = 1,
	Unknown = 2
}

export function workspaceTrustStateToString(trustState: WorkspaceTrustState) {
	switch (trustState) {
		case WorkspaceTrustState.Trusted:
			return localize('trusted', "Trusted");
		case WorkspaceTrustState.Untrusted:
			return localize('untrusted', "Untrusted");
		case WorkspaceTrustState.Unknown:
		default:
			return localize('unknown', "Unknown");
	}
}

export const TrustedWorkspaceContext = {
	IsPendingRequest: new RawContextKey<boolean>('trustedWorkspaceIsPendingRequest', false),
	TrustState: new RawContextKey<WorkspaceTrustState>('trustedWorkspaceTrustState', WorkspaceTrustState.Unknown)
};

export interface ITrustedContentModel {

	readonly onDidChangeTrust: Event<void>;

	setFolderTrustState(folder: URI, trustState: WorkspaceTrustState): void;
	getFolderTrustState(folder: URI): WorkspaceTrustState;
}

export interface ITrustedWorkspaceRequest {
	immediate: boolean;
	message?: string;
}

export interface ITrustedWorkspaceRequestModel {
	readonly trustRequest: ITrustedWorkspaceRequest | undefined;

	readonly onDidInitiateRequest: Event<void>;
	readonly onDidCompleteRequest: Event<WorkspaceTrustState | undefined>;

	initiateRequest(request?: ITrustedWorkspaceRequest): void;
	completeRequest(trustState?: WorkspaceTrustState): void;
}

export interface WorkspaceTrustStateChangeEvent {
	previousTrustState: WorkspaceTrustState;
	currentTrustState: WorkspaceTrustState;
}

export type WorkspaceTrustChangeEvent = Event<WorkspaceTrustStateChangeEvent>;

export const ITrustedWorkspaceService = createDecorator<ITrustedWorkspaceService>('trustedWorkspaceService');

export interface ITrustedWorkspaceService {
	readonly _serviceBrand: undefined;

	readonly requestModel: ITrustedWorkspaceRequestModel;

	onDidChangeTrust: WorkspaceTrustChangeEvent;
	getWorkspaceTrustState(): WorkspaceTrustState;
	isWorkspaceTrustEnabled(): boolean;
	requireWorkspaceTrust(request: ITrustedWorkspaceRequest): Promise<WorkspaceTrustState>;
	resetWorkspaceTrust(): Promise<WorkspaceTrustState>;
}

interface ICachedTrustedContentInfo {
	localFolders: { uri: string, trustState: WorkspaceTrustState }[]
	trustedRemoteItems: { uri: string }[]
}

export const TRUSTED_WORKSPACES_STORAGE_KEY = 'content.trust.model.key';

export class TrustedContentModel extends Disposable implements ITrustedContentModel {

	private storageKey = TRUSTED_WORKSPACES_STORAGE_KEY;
	private cachedTrustInfo: ICachedTrustedContentInfo;

	private readonly _onDidChangeTrust = this._register(new Emitter<void>());
	readonly onDidChangeTrust = this._onDidChangeTrust.event;

	constructor(
		private readonly storageService: IStorageService
	) {
		super();

		this.cachedTrustInfo = this.loadTrustInfo();
		this._register(this.storageService.onDidChangeValue(changeEvent => {
			if (changeEvent.key === this.storageKey) {
				this.onDidStorageChange();
			}
		}));
	}

	private loadTrustInfo(): ICachedTrustedContentInfo {
		const infoAsString = this.storageService.get(this.storageKey, StorageScope.GLOBAL);

		let result: ICachedTrustedContentInfo | undefined;
		try {
			if (infoAsString) {
				result = JSON.parse(infoAsString);
			}
		} catch { }

		if (!result) {
			result = {
				localFolders: [],
				trustedRemoteItems: []
			};
		}

		if (!result.localFolders) {
			result.localFolders = [];
		}

		if (!result.trustedRemoteItems) {
			result.trustedRemoteItems = [];
		}

		return result;
	}

	private saveTrustInfo(): void {
		this.storageService.store(this.storageKey, JSON.stringify(this.cachedTrustInfo), StorageScope.GLOBAL, StorageTarget.MACHINE);
	}

	private onDidStorageChange(): void {
		this.cachedTrustInfo = this.loadTrustInfo();

		this._onDidChangeTrust.fire();
	}

	setFolderTrustState(folder: URI, trustState: WorkspaceTrustState): void {
		let changed = false;

		if (trustState === WorkspaceTrustState.Unknown) {
			const before = this.cachedTrustInfo.localFolders.length;
			this.cachedTrustInfo.localFolders = this.cachedTrustInfo.localFolders.filter(info => info.uri !== folder.toString());

			if (this.cachedTrustInfo.localFolders.length !== before) {
				changed = true;
			}
		} else {
			let found = false;
			for (const trustInfo of this.cachedTrustInfo.localFolders) {
				if (trustInfo.uri === folder.toString()) {
					found = true;
					if (trustInfo.trustState !== trustState) {
						trustInfo.trustState = trustState;
						changed = true;
					}
				}
			}

			if (!found) {
				this.cachedTrustInfo.localFolders.push({ uri: folder.toString(), trustState });
				changed = true;
			}
		}

		if (changed) {
			this.saveTrustInfo();
		}
	}

	getFolderTrustState(folder: URI): WorkspaceTrustState {
		for (const trustInfo of this.cachedTrustInfo.localFolders) {
			if (trustInfo.uri === folder.toString()) {
				return trustInfo.trustState;
			}
		}

		return WorkspaceTrustState.Unknown;
	}
}

export class TrustedWorkspaceRequestModel extends Disposable implements ITrustedWorkspaceRequestModel {
	trustRequest: ITrustedWorkspaceRequest | undefined;

	_onDidInitiateRequest = this._register(new Emitter<void>());
	onDidInitiateRequest: Event<void> = this._onDidInitiateRequest.event;

	_onDidCompleteRequest = this._register(new Emitter<WorkspaceTrustState | undefined>());
	onDidCompleteRequest = this._onDidCompleteRequest.event;

	initiateRequest(request: ITrustedWorkspaceRequest): void {
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

export class TrustedWorkspaceService extends Disposable implements ITrustedWorkspaceService {

	_serviceBrand: undefined;
	private readonly dataModel: ITrustedContentModel;
	readonly requestModel: ITrustedWorkspaceRequestModel;

	private readonly _onDidChangeTrust = this._register(new Emitter<WorkspaceTrustStateChangeEvent>());
	readonly onDidChangeTrust = this._onDidChangeTrust.event;

	private _currentTrustState: WorkspaceTrustState = WorkspaceTrustState.Unknown;
	private _inFlightResolver?: (trustState: WorkspaceTrustState) => void;
	private _trustRequestPromise?: Promise<WorkspaceTrustState>;
	private _workspace: IWorkspace;

	private readonly _ctxTrustedWorkspaceTrustState: IContextKey<WorkspaceTrustState>;
	private readonly _ctxTrustedWorkspacePendingRequest: IContextKey<boolean>;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@IConfigurationService readonly configurationService: IConfigurationService,
		@IContextKeyService readonly contextKeyService: IContextKeyService
	) {
		super();

		this.dataModel = this._register(new TrustedContentModel(this.storageService));
		this.requestModel = this._register(new TrustedWorkspaceRequestModel());

		this._workspace = this.workspaceService.getWorkspace();
		this._currentTrustState = this.calculateWorkspaceTrustState();

		this._register(this.dataModel.onDidChangeTrust(() => this.currentTrustState = this.calculateWorkspaceTrustState()));
		this._register(this.requestModel.onDidCompleteRequest((trustState) => this.onTrustRequestCompleted(trustState)));

		this._ctxTrustedWorkspaceTrustState = TrustedWorkspaceContext.TrustState.bindTo(contextKeyService);
		this._ctxTrustedWorkspacePendingRequest = TrustedWorkspaceContext.IsPendingRequest.bindTo(contextKeyService);
		this._ctxTrustedWorkspaceTrustState.set(this.currentTrustState);
	}

	private get currentTrustState(): WorkspaceTrustState {
		return this._currentTrustState;
	}

	private set currentTrustState(trustState: WorkspaceTrustState) {
		if (this._currentTrustState === trustState) { return; }
		const previousState = this._currentTrustState;
		this._currentTrustState = trustState;

		this._onDidChangeTrust.fire({ previousTrustState: previousState, currentTrustState: this._currentTrustState });
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

		this._ctxTrustedWorkspacePendingRequest.set(false);
		this._ctxTrustedWorkspaceTrustState.set(trustState);
	}

	getWorkspaceTrustState(): WorkspaceTrustState {
		return this.currentTrustState;
	}

	isWorkspaceTrustEnabled(): boolean {
		return this.configurationService.getValue<boolean>(TRUSTED_WORKSPACES_ENABLED) ?? false;
	}

	async requireWorkspaceTrust(request?: ITrustedWorkspaceRequest): Promise<WorkspaceTrustState> {
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
		this._ctxTrustedWorkspacePendingRequest.set(true);

		return this._trustRequestPromise;
	}

	async resetWorkspaceTrust(): Promise<WorkspaceTrustState> {
		if (this.currentTrustState !== WorkspaceTrustState.Unknown) {
			this._workspace.folders.forEach(folder => {
				this.dataModel.setFolderTrustState(folder.uri, WorkspaceTrustState.Unknown);
			});
		}
		return Promise.resolve(WorkspaceTrustState.Unknown);
	}
}

registerSingleton(ITrustedWorkspaceService, TrustedWorkspaceService);
