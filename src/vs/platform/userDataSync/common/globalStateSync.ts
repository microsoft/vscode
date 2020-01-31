/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUserData, UserDataSyncError, UserDataSyncErrorCode, SyncStatus, IUserDataSyncStoreService, IUserDataSyncLogService, IGlobalState, SyncSource, IUserDataSynchroniser } from 'vs/platform/userDataSync/common/userDataSync';
import { VSBuffer } from 'vs/base/common/buffer';
import { Event } from 'vs/base/common/event';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { dirname } from 'vs/base/common/resources';
import { IFileService } from 'vs/platform/files/common/files';
import { IStringDictionary } from 'vs/base/common/collections';
import { edit } from 'vs/platform/userDataSync/common/content';
import { merge } from 'vs/platform/userDataSync/common/globalStateMerge';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { parse } from 'vs/base/common/json';
import { AbstractSynchroniser } from 'vs/platform/userDataSync/common/abstractSynchronizer';

const argvProperties: string[] = ['locale'];

interface ISyncPreviewResult {
	readonly local: IGlobalState | undefined;
	readonly remote: IGlobalState | undefined;
	readonly remoteUserData: IUserData;
	readonly lastSyncUserData: IUserData | null;
}

export class GlobalStateSynchroniser extends AbstractSynchroniser implements IUserDataSynchroniser {

	constructor(
		@IFileService fileService: IFileService,
		@IUserDataSyncStoreService userDataSyncStoreService: IUserDataSyncStoreService,
		@IUserDataSyncLogService private readonly logService: IUserDataSyncLogService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super(SyncSource.GlobalState, fileService, environmentService, userDataSyncStoreService);
		this._register(this.fileService.watch(dirname(this.environmentService.argvResource)));
		this._register(Event.filter(this.fileService.onFileChanges, e => e.contains(this.environmentService.argvResource))(() => this._onDidChangeLocal.fire()));
	}

	protected getRemoteDataResourceKey(): string { return 'globalState'; }

	async pull(): Promise<void> {
		if (!this.configurationService.getValue<boolean>('sync.enableUIState')) {
			this.logService.info('UI State: Skipped pulling ui state as it is disabled.');
			return;
		}

		this.stop();

		try {
			this.logService.info('UI State: Started pulling ui state...');
			this.setStatus(SyncStatus.Syncing);

			const lastSyncUserData = await this.getLastSyncUserData();
			const remoteUserData = await this.getRemoteUserData(lastSyncUserData);

			if (remoteUserData.content !== null) {
				const local: IGlobalState = JSON.parse(remoteUserData.content);
				await this.apply({ local, remote: undefined, remoteUserData, lastSyncUserData });
			}

			// No remote exists to pull
			else {
				this.logService.info('UI State: Remote UI state does not exist.');
			}

			this.logService.info('UI State: Finished pulling UI state.');
		} finally {
			this.setStatus(SyncStatus.Idle);
		}
	}

	async push(): Promise<void> {
		if (!this.configurationService.getValue<boolean>('sync.enableUIState')) {
			this.logService.info('UI State: Skipped pushing UI State as it is disabled.');
			return;
		}

		this.stop();

		try {
			this.logService.info('UI State: Started pushing UI State...');
			this.setStatus(SyncStatus.Syncing);

			const remote = await this.getLocalGlobalState();
			const lastSyncUserData = await this.getLastSyncUserData();
			const remoteUserData = await this.getRemoteUserData(lastSyncUserData);
			await this.apply({ local: undefined, remote, remoteUserData, lastSyncUserData }, true);

			this.logService.info('UI State: Finished pushing UI State.');
		} finally {
			this.setStatus(SyncStatus.Idle);
		}

	}

	async sync(): Promise<void> {
		if (!this.configurationService.getValue<boolean>('sync.enableUIState')) {
			this.logService.trace('UI State: Skipping synchronizing UI state as it is disabled.');
			return;
		}

		if (this.status !== SyncStatus.Idle) {
			this.logService.trace('UI State: Skipping synchronizing ui state as it is running already.');
			return;
		}

		this.logService.trace('UI State: Started synchronizing ui state...');
		this.setStatus(SyncStatus.Syncing);

		try {
			const result = await this.getPreview();
			await this.apply(result);
			this.logService.trace('UI State: Finished synchronizing ui state.');
		} catch (e) {
			this.setStatus(SyncStatus.Idle);
			if (e instanceof UserDataSyncError && e.code === UserDataSyncErrorCode.Rejected) {
				// Rejected as there is a new remote version. Syncing again,
				this.logService.info('UI State: Failed to synchronise ui state as there is a new remote version available. Synchronizing again...');
				return this.sync();
			}
			throw e;
		} finally {
			this.setStatus(SyncStatus.Idle);
		}
	}

	async stop(): Promise<void> { }

	async restart(): Promise<void> {
		throw new Error('UI State: Conflicts should not occur');
	}

	resolveConflicts(content: string, remote: boolean): Promise<void> {
		throw new Error('UI State: Conflicts should not occur');
	}

	async hasLocalData(): Promise<boolean> {
		try {
			const localGloablState = await this.getLocalGlobalState();
			if (localGloablState.argv['locale'] !== 'en') {
				return true;
			}
		} catch (error) {
			/* ignore error */
		}
		return false;
	}

	async getRemoteContent(): Promise<string | null> {
		return null;
	}

	private async getPreview(): Promise<ISyncPreviewResult> {
		const lastSyncUserData = await this.getLastSyncUserData();
		const lastSyncGlobalState = lastSyncUserData && lastSyncUserData.content ? JSON.parse(lastSyncUserData.content) : null;

		const remoteUserData = await this.getRemoteUserData(lastSyncUserData);
		const remoteGlobalState: IGlobalState = remoteUserData.content ? JSON.parse(remoteUserData.content) : null;

		const localGloablState = await this.getLocalGlobalState();

		if (remoteGlobalState) {
			this.logService.trace('UI State: Merging remote ui state with local ui state...');
		} else {
			this.logService.trace('UI State: Remote ui state does not exist. Synchronizing ui state for the first time.');
		}

		const { local, remote } = merge(localGloablState, remoteGlobalState, lastSyncGlobalState);

		return { local, remote, remoteUserData, lastSyncUserData };
	}

	private async apply({ local, remote, remoteUserData, lastSyncUserData }: ISyncPreviewResult, forcePush?: boolean): Promise<void> {

		const hasChanges = local || remote;

		if (!hasChanges) {
			this.logService.trace('UI State: No changes found during synchronizing ui state.');
		}

		if (local) {
			// update local
			this.logService.info('UI State: Updating local ui state...');
			await this.writeLocalGlobalState(local);
		}

		if (remote) {
			// update remote
			this.logService.info('UI State: Updating remote ui state...');
			const content = JSON.stringify(remote);
			const ref = await this.updateRemoteUserData(content, forcePush ? null : remoteUserData.ref);
			remoteUserData = { ref, content };
		}

		if (hasChanges || !lastSyncUserData) {
			// update last sync
			this.logService.info('UI State: Updating last synchronised ui state...');
			await this.updateLastSyncUserData(remoteUserData);
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

}
