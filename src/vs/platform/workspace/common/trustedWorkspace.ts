/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IWorkspace, IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';

export enum TrustState {
	Unknown,
	Trusted,
	Untrusted
}

export type WorkspaceTrustChangeEvent = Event<TrustState>;

export interface ITrustedContentModel {

	readonly onDidChangeTrust: Event<void>;

	setFolderTrustState(folder: URI, trustState: TrustState): void;
	getFolderTrustState(folder: URI): TrustState;
}

export interface ITrustedWorkspaceService {
	readonly _serviceBrand: undefined;

	onDidChangeTrust: WorkspaceTrustChangeEvent;
	getWorkspaceTrustState(): TrustState;
}


interface ICachedTrustedContentInfo {
	folders: { uri: string, trustState: TrustState }[]
}

export class TrustedContentModel extends Disposable implements ITrustedContentModel {

	private storageKey = 'content.trust.model.key';
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

		return { folders: [] };
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
			const before = this.cachedTrustInfo.folders.length;
			this.cachedTrustInfo.folders = this.cachedTrustInfo.folders.filter(info => info.uri !== folder.toString());

			if (this.cachedTrustInfo.folders.length !== before) {
				changed = true;
			}
		} else {
			let found = false;
			for (const trustInfo of this.cachedTrustInfo.folders) {
				if (trustInfo.uri === folder.toString()) {
					found = true;
					if (trustInfo.trustState !== trustState) {
						trustInfo.trustState = trustState;
						changed = true;
					}
				}
			}

			if (!found) {
				this.cachedTrustInfo.folders.push({ uri: folder.toString(), trustState });
				changed = true;
			}
		}

		if (changed) {
			this.saveTrustInfo();
		}
	}

	getFolderTrustState(folder: URI): TrustState {
		for (const trustInfo of this.cachedTrustInfo.folders) {
			if (trustInfo.uri === folder.toString()) {
				return trustInfo.trustState;
			}
		}

		return TrustState.Unknown;
	}
}

export class TrustedWorkspaceService extends Disposable implements ITrustedWorkspaceService {

	_serviceBrand: undefined;
	readonly model: ITrustedContentModel;

	private readonly _onDidChangeTrust = this._register(new Emitter<TrustState>());
	readonly onDidChangeTrust = this._onDidChangeTrust.event;

	private _currentTrustState: TrustState = TrustState.Unknown;
	private _workspace: IWorkspace;

	constructor(
		private readonly storageService: IStorageService,
		private readonly workspaceService: IWorkspaceContextService
	) {
		super();

		this._workspace = this.workspaceService.getWorkspace();

		this.model = this._register(new TrustedContentModel(this.storageService));

		this._currentTrustState = this.calculateWorkspaceTrustState();

		this._register(this.model.onDidChangeTrust(() => this.currentTrustState = this.calculateWorkspaceTrustState()));
	}

	private get currentTrustState(): TrustState {
		return this._currentTrustState;
	}

	private set currentTrustState(trustState: TrustState) {
		if (this._currentTrustState === trustState) { return; }
		this._currentTrustState = trustState;

		this._onDidChangeTrust.fire(trustState);
	}

	private calculateWorkspaceTrustState(): TrustState {
		let state = undefined;

		for (const folder of this._workspace.folders) {
			const folderTrust = this.model.getFolderTrustState(folder.uri);

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

	getWorkspaceTrustState(): TrustState {
		return this.currentTrustState;
	}
}
