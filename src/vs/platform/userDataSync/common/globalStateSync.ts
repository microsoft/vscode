/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUserData, UserDataSyncError, UserDataSyncErrorCode, SyncStatus, IUserDataSyncStoreService, IUserDataSyncLogService, IGlobalState, SyncSource, IUserDataSynchroniser, ResourceKey } from 'vs/platform/userDataSync/common/userDataSync';
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
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

const argvProperties: string[] = ['locale'];

interface ISyncPreviewResult {
	readonly local: IGlobalState | undefined;
	readonly remote: IGlobalState | undefined;
	readonly remoteUserData: IUserData;
	readonly lastSyncUserData: IUserData | null;
}

export class GlobalStateSynchroniser extends AbstractSynchroniser implements IUserDataSynchroniser {

	readonly resourceKey: ResourceKey = 'globalState';
	protected get enabled(): boolean { return this.configurationService.getValue<boolean>('sync.enableUIState') === true; }

	constructor(
		@IFileService fileService: IFileService,
		@IUserDataSyncStoreService userDataSyncStoreService: IUserDataSyncStoreService,
		@IUserDataSyncLogService logService: IUserDataSyncLogService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super(SyncSource.GlobalState, fileService, environmentService, userDataSyncStoreService, telemetryService, logService);
		this._register(this.fileService.watch(dirname(this.environmentService.argvResource)));
		this._register(Event.filter(this.fileService.onFileChanges, e => e.contains(this.environmentService.argvResource))(() => this._onDidChangeLocal.fire()));
	}

	async pull(): Promise<void> {
		if (!this.enabled) {
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
		if (!this.enabled) {
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

	async stop(): Promise<void> { }

	accept(content: string): Promise<void> {
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

	protected async doSync(remoteUserData: IUserData, lastSyncUserData: IUserData | null): Promise<void> {
		try {
			const result = await this.getPreview(remoteUserData, lastSyncUserData);
			await this.apply(result);
			this.logService.trace('UI State: Finished synchronizing ui state.');
		} catch (e) {
			this.setStatus(SyncStatus.Idle);
			if (e instanceof UserDataSyncError && e.code === UserDataSyncErrorCode.Rejected) {
				// Rejected as there is a new remote version. Syncing again,
				this.logService.info('UI State: Failed to synchronize ui state as there is a new remote version available. Synchronizing again...');
				return this.sync();
			}
			throw e;
		} finally {
			this.setStatus(SyncStatus.Idle);
		}
	}

	private async getPreview(remoteUserData: IUserData, lastSyncUserData: IUserData | null, ): Promise<ISyncPreviewResult> {
		const remoteGlobalState: IGlobalState = remoteUserData.content ? JSON.parse(remoteUserData.content) : null;
		const lastSyncGlobalState = lastSyncUserData && lastSyncUserData.content ? JSON.parse(lastSyncUserData.content) : null;

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
			this.logService.trace('UI State: Updating local ui state...');
			await this.writeLocalGlobalState(local);
			this.logService.info('UI State: Updated local ui state');
		}

		if (remote) {
			// update remote
			this.logService.trace('UI State: Updating remote ui state...');
			const content = JSON.stringify(remote);
			const ref = await this.updateRemoteUserData(content, forcePush ? null : remoteUserData.ref);
			this.logService.info('UI State: Updated remote ui state');
			remoteUserData = { ref, content };
		}

		if (lastSyncUserData?.ref !== remoteUserData.ref) {
			// update last sync
			this.logService.trace('UI State: Updating last synchronized ui state...');
			await this.updateLastSyncUserData(remoteUserData);
			this.logService.info('UI State: Updated last synchronized ui state');
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
