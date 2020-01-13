/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IUserData, UserDataSyncStoreError, UserDataSyncStoreErrorCode, ISynchroniser, SyncStatus, IUserDataSyncStoreService, IUserDataSyncLogService, IGlobalState } from 'vs/platform/userDataSync/common/userDataSync';
import { VSBuffer } from 'vs/base/common/buffer';
import { Emitter, Event } from 'vs/base/common/event';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { URI } from 'vs/base/common/uri';
import { joinPath, dirname } from 'vs/base/common/resources';
import { IFileService } from 'vs/platform/files/common/files';
import { IStringDictionary } from 'vs/base/common/collections';
import { edit } from 'vs/platform/userDataSync/common/content';
import { merge } from 'vs/platform/userDataSync/common/globalStateMerge';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { parse } from 'vs/base/common/json';

const argvProperties: string[] = ['locale'];

export class GlobalStateSynchroniser extends Disposable implements ISynchroniser {

	private static EXTERNAL_USER_DATA_GLOBAL_STATE_KEY: string = 'globalState';

	private _status: SyncStatus = SyncStatus.Idle;
	get status(): SyncStatus { return this._status; }
	private _onDidChangStatus: Emitter<SyncStatus> = this._register(new Emitter<SyncStatus>());
	readonly onDidChangeStatus: Event<SyncStatus> = this._onDidChangStatus.event;

	private _onDidChangeLocal: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChangeLocal: Event<void> = this._onDidChangeLocal.event;

	private readonly lastSyncGlobalStateResource: URI;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IUserDataSyncStoreService private readonly userDataSyncStoreService: IUserDataSyncStoreService,
		@IUserDataSyncLogService private readonly logService: IUserDataSyncLogService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
		this.lastSyncGlobalStateResource = joinPath(environmentService.userRoamingDataHome, '.lastSyncGlobalState');
		this._register(this.fileService.watch(dirname(this.environmentService.argvResource)));
		this._register(Event.filter(this.fileService.onFileChanges, e => e.contains(this.environmentService.argvResource))(() => this._onDidChangeLocal.fire()));
	}

	private setStatus(status: SyncStatus): void {
		if (this._status !== status) {
			this._status = status;
			this._onDidChangStatus.fire(status);
		}
	}

	async sync(): Promise<boolean> {
		if (!this.configurationService.getValue<boolean>('sync.enableUIState')) {
			this.logService.trace('UI State: Skipping synchronizing UI state as it is disabled.');
			return false;
		}

		if (this.status !== SyncStatus.Idle) {
			this.logService.trace('UI State: Skipping synchronizing ui state as it is running already.');
			return false;
		}

		this.logService.trace('UI State: Started synchronizing ui state...');
		this.setStatus(SyncStatus.Syncing);

		try {
			await this.doSync();
			this.logService.trace('UI State: Finised synchronizing ui state.');
			this.setStatus(SyncStatus.Idle);
			return true;
		} catch (e) {
			this.setStatus(SyncStatus.Idle);
			if (e instanceof UserDataSyncStoreError && e.code === UserDataSyncStoreErrorCode.Rejected) {
				// Rejected as there is a new remote version. Syncing again,
				this.logService.info('UI State: Failed to synchronise ui state as there is a new remote version available. Synchronizing again...');
				return this.sync();
			}
			throw e;
		}
	}

	stop(): void { }

	async hasPreviouslySynced(): Promise<boolean> {
		const lastSyncData = await this.getLastSyncUserData();
		return !!lastSyncData;
	}

	async hasRemote(): Promise<boolean> {
		const remoteUserData = await this.userDataSyncStoreService.read(GlobalStateSynchroniser.EXTERNAL_USER_DATA_GLOBAL_STATE_KEY, null);
		return remoteUserData.content !== null;
	}

	private async doSync(): Promise<void> {
		const lastSyncData = await this.getLastSyncUserData();
		const lastSyncGlobalState = lastSyncData && lastSyncData.content ? JSON.parse(lastSyncData.content) : null;

		let remoteData = await this.userDataSyncStoreService.read(GlobalStateSynchroniser.EXTERNAL_USER_DATA_GLOBAL_STATE_KEY, lastSyncData);
		const remoteGlobalState: IGlobalState = remoteData.content ? JSON.parse(remoteData.content) : null;

		const localGloablState = await this.getLocalGlobalState();

		const { local, remote } = merge(localGloablState, remoteGlobalState, lastSyncGlobalState);

		if (local) {
			// update local
			this.logService.info('UI State: Updating local ui state...');
			await this.writeLocalGlobalState(local);
		}

		if (remote) {
			// update remote
			this.logService.info('UI State: Updating remote ui state...');
			remoteData = await this.writeToRemote(remote, remoteData.ref);
		}

		if (remoteData.content
			&& (!lastSyncData || lastSyncData.ref !== remoteData.ref)
		) {
			// update last sync
			this.logService.info('UI State: Updating last synchronised ui state...');
			await this.updateLastSyncValue(remoteData);
		}
	}

	private async getLocalGlobalState(): Promise<IGlobalState> {
		const argv: IStringDictionary<any> = {};
		const storage: IStringDictionary<any> = {};
		try {
			const content = await this.fileService.readFile(this.environmentService.argvResource);
			const argvValue: IStringDictionary<any> = parse(content.value.toString());
			for (const argvProperty of argvProperties) {
				if (argvValue[argvProperty] !== undefined) {
					argv[argvProperty] = argvValue[argvProperty];
				}
			}
		} catch (error) { }
		return { argv, storage };
	}

	private async writeLocalGlobalState(globalState: IGlobalState): Promise<void> {
		const content = await this.fileService.readFile(this.environmentService.argvResource);
		let argvContent = content.value.toString();
		for (const argvProperty of Object.keys(globalState.argv)) {
			argvContent = edit(argvContent, [argvProperty], globalState.argv[argvProperty], {});
		}
		if (argvContent !== content.value.toString()) {
			await this.fileService.writeFile(this.environmentService.argvResource, VSBuffer.fromString(argvContent));
		}
	}

	private async getLastSyncUserData(): Promise<IUserData | null> {
		try {
			const content = await this.fileService.readFile(this.lastSyncGlobalStateResource);
			return JSON.parse(content.value.toString());
		} catch (error) {
			return null;
		}
	}

	private async updateLastSyncValue(remoteUserData: IUserData): Promise<void> {
		await this.fileService.writeFile(this.lastSyncGlobalStateResource, VSBuffer.fromString(JSON.stringify(remoteUserData)));
	}

	private async writeToRemote(globalState: IGlobalState, ref: string | null): Promise<IUserData> {
		const content = JSON.stringify(globalState);
		ref = await this.userDataSyncStoreService.write(GlobalStateSynchroniser.EXTERNAL_USER_DATA_GLOBAL_STATE_KEY, content, ref);
		return { content, ref };
	}

}
