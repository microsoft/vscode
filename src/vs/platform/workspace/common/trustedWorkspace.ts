/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IWorkspace, IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';

export const TRUSTED_WORKSPACES_URI = URI.parse('trustedWorkspaces:/Trusted Workspaces');

export enum TrustState {
	Unknown,
	Trusted,
	Untrusted
}

export enum TrustScope {
	Local,
	Remote
}

export const TrustedWorkspaceContext = {
	IsPendingRequest: new RawContextKey<boolean>('trustedWorkspaceIsPendingRequest', false),
	TrustState: new RawContextKey<TrustState>('trustedWorkspaceTrustState', TrustState.Unknown)
};

export interface ITrustedContentModel {

	readonly onDidChangeTrust: Event<void>;

	setFolderTrustState(folder: URI, trustState: TrustState): void;
	getFolderTrustState(folder: URI): TrustState;
}

export interface ITrustedWorkspaceRequest {
	immediate: boolean;
	message?: string;
}

export interface ITrustedWorkspaceRequestModel {
	readonly trustRequest: ITrustedWorkspaceRequest | undefined;

	readonly onDidInitiateRequest: Event<void>;
	readonly onDidCompleteRequest: Event<TrustState>;

	initiateRequest(request?: ITrustedWorkspaceRequest): void;
	completeRequest(trustState: TrustState): void;
}

export interface ITrustedWorkspaceChangeModel {
	previousState: TrustState;
	currentState: TrustState;
}

export type WorkspaceTrustChangeEvent = Event<ITrustedWorkspaceChangeModel>;

export const ITrustedWorkspaceService = createDecorator<ITrustedWorkspaceService>('trustedWorkspaceService');

export interface ITrustedWorkspaceService {
	readonly _serviceBrand: undefined;

	readonly requestModel: ITrustedWorkspaceRequestModel;

	onDidChangeTrust: WorkspaceTrustChangeEvent;
	getWorkspaceTrustState(): TrustState;
	requireWorkspaceTrust(request?: ITrustedWorkspaceRequest): Promise<TrustState>;
	resetWorkspaceTrust(): Promise<TrustState>;
}

interface ICachedTrustedContentInfo {
	localFolders: { uri: string, trustState: TrustState }[]
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

		try {
			if (infoAsString) {
				return JSON.parse(infoAsString);
			}
		} catch { }

		return { localFolders: [], trustedRemoteItems: [] };
	}

	private saveTrustInfo(): void {
		this.storageService.store(this.storageKey, JSON.stringify(this.cachedTrustInfo), StorageScope.GLOBAL, StorageTarget.MACHINE);
	}

	private onDidStorageChange(): void {
		this.cachedTrustInfo = this.loadTrustInfo();

		this._onDidChangeTrust.fire();
	}

	setFolderTrustState(folder: URI, trustState: TrustState): void {
		let changed = false;

		if (trustState === TrustState.Unknown) {
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

	getFolderTrustState(folder: URI): TrustState {
		for (const trustInfo of this.cachedTrustInfo.localFolders) {
			if (trustInfo.uri === folder.toString()) {
				return trustInfo.trustState;
			}
		}

		return TrustState.Unknown;
	}
}

export class TrustedWorkspaceRequestModel extends Disposable implements ITrustedWorkspaceRequestModel {
	trustRequest: ITrustedWorkspaceRequest | undefined;

	_onDidInitiateRequest = this._register(new Emitter<void>());
	onDidInitiateRequest: Event<void> = this._onDidInitiateRequest.event;

	_onDidCompleteRequest = this._register(new Emitter<TrustState>());
	onDidCompleteRequest = this._onDidCompleteRequest.event;

	initiateRequest(request: ITrustedWorkspaceRequest): void {
		if (this.trustRequest && (!request.immediate || this.trustRequest.immediate)) {
			return;
		}

		this.trustRequest = request;
		this._onDidInitiateRequest.fire();
	}

	completeRequest(trustState: TrustState): void {
		this.trustRequest = undefined;
		this._onDidCompleteRequest.fire(trustState);
	}
}

export class TrustedWorkspaceService extends Disposable implements ITrustedWorkspaceService {

	_serviceBrand: undefined;
	private readonly dataModel: ITrustedContentModel;
	readonly requestModel: ITrustedWorkspaceRequestModel;

	private readonly _onDidChangeTrust = this._register(new Emitter<ITrustedWorkspaceChangeModel>());
	readonly onDidChangeTrust = this._onDidChangeTrust.event;

	private _currentTrustState: TrustState = TrustState.Unknown;
	private _inFlightResolver?: (trustState: TrustState) => void;
	private _trustRequestPromise?: Promise<TrustState>;
	private _workspace: IWorkspace;

	private readonly _ctxTrustedWorkspaceTrustState: IContextKey<TrustState>;
	private readonly _ctxTrustedWorkspacePendingRequest: IContextKey<boolean>;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@IContextKeyService contextKeyService: IContextKeyService
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

	private get currentTrustState(): TrustState {
		return this._currentTrustState;
	}

	private set currentTrustState(trustState: TrustState) {
		if (this._currentTrustState === trustState) { return; }
		const previousState = this._currentTrustState;
		this._currentTrustState = trustState;

		this._onDidChangeTrust.fire({ previousState, currentState: this._currentTrustState });
	}

	private calculateWorkspaceTrustState(): TrustState {
		if (this.workspaceService.getWorkbenchState() === WorkbenchState.EMPTY) {
			return TrustState.Trusted;
		}

		let state = undefined;
		for (const folder of this._workspace.folders) {
			const folderTrust = this.dataModel.getFolderTrustState(folder.uri);

			switch (folderTrust) {
				case TrustState.Untrusted:
					return TrustState.Untrusted;
				case TrustState.Unknown:
					state = folderTrust;
					break;
				case TrustState.Trusted:
					if (state === undefined) {
						state = folderTrust;
					}
					break;
			}
		}

		return state ?? TrustState.Unknown;
	}

	private onTrustRequestCompleted(trustState: TrustState): void {
		if (this._trustRequestPromise === undefined) {
			return;
		}

		if (this.currentTrustState !== TrustState.Unknown) {
			this._inFlightResolver!(this.currentTrustState);
			this._inFlightResolver = undefined;
			this._trustRequestPromise = undefined;
			return;
		}

		this._inFlightResolver!(trustState);
		this._inFlightResolver = undefined;
		this._trustRequestPromise = undefined;

		this._workspace.folders.forEach(folder => {
			this.dataModel.setFolderTrustState(folder.uri, trustState);
		});
		this._ctxTrustedWorkspacePendingRequest.set(false);
		this._ctxTrustedWorkspaceTrustState.set(trustState);
	}

	getWorkspaceTrustState(): TrustState {
		return this.currentTrustState;
	}

	async requireWorkspaceTrust(request?: ITrustedWorkspaceRequest): Promise<TrustState> {
		if (this.currentTrustState !== TrustState.Unknown) {
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

	async resetWorkspaceTrust(): Promise<TrustState> {
		if (this.currentTrustState !== TrustState.Unknown) {
			this._workspace.folders.forEach(folder => {
				this.dataModel.setFolderTrustState(folder.uri, TrustState.Unknown);
			});
		}
		return Promise.resolve(TrustState.Unknown);
	}
}

registerSingleton(ITrustedWorkspaceService, TrustedWorkspaceService);
