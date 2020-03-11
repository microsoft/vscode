/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyncStatus, IUserDataSyncStoreService, IUserDataSyncLogService, IGlobalState, SyncResource, IUserDataSynchroniser, IUserDataSyncEnablementService, IUserDataSyncBackupStoreService } from 'vs/platform/userDataSync/common/userDataSync';
import { VSBuffer } from 'vs/base/common/buffer';
import { Event } from 'vs/base/common/event';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { dirname } from 'vs/base/common/resources';
import { IFileService } from 'vs/platform/files/common/files';
import { IStringDictionary } from 'vs/base/common/collections';
import { edit } from 'vs/platform/userDataSync/common/content';
import { merge } from 'vs/platform/userDataSync/common/globalStateMerge';
import { parse } from 'vs/base/common/json';
import { AbstractSynchroniser, IRemoteUserData } from 'vs/platform/userDataSync/common/abstractSynchronizer';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

const argvProperties: string[] = ['locale'];

interface ISyncPreviewResult {
	readonly local: IGlobalState | undefined;
	readonly remote: IGlobalState | undefined;
	readonly localUserData: IGlobalState;
	readonly remoteUserData: IRemoteUserData;
	readonly lastSyncUserData: IRemoteUserData | null;
}

export class GlobalStateSynchroniser extends AbstractSynchroniser implements IUserDataSynchroniser {

	protected readonly version: number = 1;

	constructor(
		@IFileService fileService: IFileService,
		@IUserDataSyncStoreService userDataSyncStoreService: IUserDataSyncStoreService,
		@IUserDataSyncBackupStoreService userDataSyncBackupStoreService: IUserDataSyncBackupStoreService,
		@IUserDataSyncLogService logService: IUserDataSyncLogService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IUserDataSyncEnablementService userDataSyncEnablementService: IUserDataSyncEnablementService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super(SyncResource.GlobalState, fileService, environmentService, userDataSyncStoreService, userDataSyncBackupStoreService, userDataSyncEnablementService, telemetryService, logService, configurationService);
		this._register(this.fileService.watch(dirname(this.environmentService.argvResource)));
		this._register(Event.filter(this.fileService.onDidFilesChange, e => e.contains(this.environmentService.argvResource))(() => this._onDidChangeLocal.fire()));
	}

	async pull(): Promise<void> {
		if (!this.isEnabled()) {
			this.logService.info(`${this.syncResourceLogLabel}: Skipped pulling ui state as it is disabled.`);
			return;
		}

		this.stop();

		try {
			this.logService.info(`${this.syncResourceLogLabel}: Started pulling ui state...`);
			this.setStatus(SyncStatus.Syncing);

			const lastSyncUserData = await this.getLastSyncUserData();
			const remoteUserData = await this.getRemoteUserData(lastSyncUserData);

			if (remoteUserData.syncData !== null) {
				const localUserData = await this.getLocalGlobalState();
				const local: IGlobalState = JSON.parse(remoteUserData.syncData.content);
				await this.apply({ local, remote: undefined, remoteUserData, localUserData, lastSyncUserData });
			}

			// No remote exists to pull
			else {
				this.logService.info(`${this.syncResourceLogLabel}: Remote UI state does not exist.`);
			}

			this.logService.info(`${this.syncResourceLogLabel}: Finished pulling UI state.`);
		} finally {
			this.setStatus(SyncStatus.Idle);
		}
	}

	async push(): Promise<void> {
		if (!this.isEnabled()) {
			this.logService.info(`${this.syncResourceLogLabel}: Skipped pushing UI State as it is disabled.`);
			return;
		}

		this.stop();

		try {
			this.logService.info(`${this.syncResourceLogLabel}: Started pushing UI State...`);
			this.setStatus(SyncStatus.Syncing);

			const localUserData = await this.getLocalGlobalState();
			const lastSyncUserData = await this.getLastSyncUserData();
			const remoteUserData = await this.getRemoteUserData(lastSyncUserData);
			await this.apply({ local: undefined, remote: localUserData, remoteUserData, localUserData, lastSyncUserData }, true);

			this.logService.info(`${this.syncResourceLogLabel}: Finished pushing UI State.`);
		} finally {
			this.setStatus(SyncStatus.Idle);
		}

	}

	async stop(): Promise<void> { }

	async getRemoteContent(ref?: string, fragment?: string): Promise<string | null> {
		let content = await super.getRemoteContent(ref);
		if (content !== null && fragment) {
			return this.getFragment(content, fragment);
		}
		return content;
	}

	async getLocalBackupContent(ref?: string, fragment?: string): Promise<string | null> {
		let content = await super.getLocalBackupContent(ref);
		if (content !== null && fragment) {
			return this.getFragment(content, fragment);
		}
		return content;
	}

	private getFragment(content: string, fragment: string): string | null {
		const syncData = this.parseSyncData(content);
		if (syncData) {
			switch (fragment) {
				case 'globalState':
					return syncData.content;
			}
		}
		return null;
	}

	accept(content: string): Promise<void> {
		throw new Error(`${this.syncResourceLogLabel}: Conflicts should not occur`);
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

	protected async performSync(remoteUserData: IRemoteUserData, lastSyncUserData: IRemoteUserData | null): Promise<SyncStatus> {
		const result = await this.getPreview(remoteUserData, lastSyncUserData);
		await this.apply(result);
		return SyncStatus.Idle;
	}

	private async getPreview(remoteUserData: IRemoteUserData, lastSyncUserData: IRemoteUserData | null): Promise<ISyncPreviewResult> {
		const remoteGlobalState: IGlobalState = remoteUserData.syncData ? JSON.parse(remoteUserData.syncData.content) : null;
		const lastSyncGlobalState = lastSyncUserData && lastSyncUserData.syncData ? JSON.parse(lastSyncUserData.syncData.content) : null;

		const localGloablState = await this.getLocalGlobalState();

		if (remoteGlobalState) {
			this.logService.trace(`${this.syncResourceLogLabel}: Merging remote ui state with local ui state...`);
		} else {
			this.logService.trace(`${this.syncResourceLogLabel}: Remote ui state does not exist. Synchronizing ui state for the first time.`);
		}

		const { local, remote } = merge(localGloablState, remoteGlobalState, lastSyncGlobalState);

		return { local, remote, remoteUserData, localUserData: localGloablState, lastSyncUserData };
	}

	private async apply({ local, remote, remoteUserData, lastSyncUserData, localUserData }: ISyncPreviewResult, forcePush?: boolean): Promise<void> {

		const hasChanges = local || remote;

		if (!hasChanges) {
			this.logService.info(`${this.syncResourceLogLabel}: No changes found during synchronizing ui state.`);
		}

		if (local) {
			// update local
			this.logService.trace(`${this.syncResourceLogLabel}: Updating local ui state...`);
			await this.backupLocal(JSON.stringify(localUserData));
			await this.writeLocalGlobalState(local);
			this.logService.info(`${this.syncResourceLogLabel}: Updated local ui state`);
		}

		if (remote) {
			// update remote
			this.logService.trace(`${this.syncResourceLogLabel}: Updating remote ui state...`);
			const content = JSON.stringify(remote);
			remoteUserData = await this.updateRemoteUserData(content, forcePush ? null : remoteUserData.ref);
			this.logService.info(`${this.syncResourceLogLabel}: Updated remote ui state`);
		}

		if (lastSyncUserData?.ref !== remoteUserData.ref) {
			// update last sync
			this.logService.trace(`${this.syncResourceLogLabel}: Updating last synchronized ui state...`);
			await this.updateLastSyncUserData(remoteUserData);
			this.logService.info(`${this.syncResourceLogLabel}: Updated last synchronized ui state`);
		}
	}

	private async getLocalGlobalState(): Promise<IGlobalState> {
		const argv: IStringDictionary<any> = {};
		const storage: IStringDictionary<any> = {};
		const argvContent: string = await this.getLocalArgvContent();
		const argvValue: IStringDictionary<any> = parse(argvContent);
		for (const argvProperty of argvProperties) {
			if (argvValue[argvProperty] !== undefined) {
				argv[argvProperty] = argvValue[argvProperty];
			}
		}
		return { argv, storage };
	}

	private async getLocalArgvContent(): Promise<string> {
		try {
			const content = await this.fileService.readFile(this.environmentService.argvResource);
			return content.value.toString();
		} catch (error) { }
		return '{}';
	}

	private async writeLocalGlobalState(globalState: IGlobalState): Promise<void> {
		const argvContent = await this.getLocalArgvContent();
		let content = argvContent;
		for (const argvProperty of Object.keys(globalState.argv)) {
			content = edit(content, [argvProperty], globalState.argv[argvProperty], {});
		}
		if (argvContent !== content) {
			await this.fileService.writeFile(this.environmentService.argvResource, VSBuffer.fromString(content));
		}
	}

}
