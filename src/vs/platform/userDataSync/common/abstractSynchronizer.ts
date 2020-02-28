/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IFileService, IFileContent, FileChangesEvent, FileSystemProviderError, FileSystemProviderErrorCode, FileOperationResult, FileOperationError } from 'vs/platform/files/common/files';
import { VSBuffer } from 'vs/base/common/buffer';
import { URI } from 'vs/base/common/uri';
import { SyncSource, SyncStatus, IUserData, IUserDataSyncStoreService, UserDataSyncErrorCode, UserDataSyncError, IUserDataSyncLogService, IUserDataSyncUtilService, ResourceKey, IUserDataSyncEnablementService } from 'vs/platform/userDataSync/common/userDataSync';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { joinPath, dirname } from 'vs/base/common/resources';
import { toLocalISOString } from 'vs/base/common/date';
import { ThrottledDelayer, CancelablePromise } from 'vs/base/common/async';
import { Emitter, Event } from 'vs/base/common/event';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ParseError, parse } from 'vs/base/common/json';
import { FormattingOptions } from 'vs/base/common/jsonFormatter';
import { IStringDictionary } from 'vs/base/common/collections';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

type SyncSourceClassification = {
	source?: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
};

export interface IRemoteUserData {
	ref: string;
	syncData: ISyncData | null;
}

export interface ISyncData {
	version: number;
	content: string;
}

function isSyncData(thing: any): thing is ISyncData {
	return thing
		&& (thing.version && typeof thing.version === 'number')
		&& (thing.content && typeof thing.content === 'string')
		&& Object.keys(thing).length === 2;
}

export abstract class AbstractSynchroniser extends Disposable {

	protected readonly syncFolder: URI;
	private cleanUpDelayer: ThrottledDelayer<void>;

	private _status: SyncStatus = SyncStatus.Idle;
	get status(): SyncStatus { return this._status; }
	private _onDidChangStatus: Emitter<SyncStatus> = this._register(new Emitter<SyncStatus>());
	readonly onDidChangeStatus: Event<SyncStatus> = this._onDidChangStatus.event;

	protected readonly _onDidChangeLocal: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChangeLocal: Event<void> = this._onDidChangeLocal.event;

	protected readonly lastSyncResource: URI;

	constructor(
		readonly source: SyncSource,
		@IFileService protected readonly fileService: IFileService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IUserDataSyncStoreService protected readonly userDataSyncStoreService: IUserDataSyncStoreService,
		@IUserDataSyncEnablementService protected readonly userDataSyncEnablementService: IUserDataSyncEnablementService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IUserDataSyncLogService protected readonly logService: IUserDataSyncLogService,
		@IConfigurationService protected readonly configurationService: IConfigurationService,
	) {
		super();
		this.syncFolder = joinPath(environmentService.userDataSyncHome, source);
		this.lastSyncResource = joinPath(this.syncFolder, `lastSync${source}.json`);
		this.cleanUpDelayer = new ThrottledDelayer(50);
		this.cleanUpBackup();
	}

	protected setStatus(status: SyncStatus): void {
		if (this._status !== status) {
			const oldStatus = this._status;
			this._status = status;
			this._onDidChangStatus.fire(status);
			if (status === SyncStatus.HasConflicts) {
				// Log to telemetry when there is a sync conflict
				this.telemetryService.publicLog2<{ source: string }, SyncSourceClassification>('sync/conflictsDetected', { source: this.source });
			}
			if (oldStatus === SyncStatus.HasConflicts && status === SyncStatus.Idle) {
				// Log to telemetry when conflicts are resolved
				this.telemetryService.publicLog2<{ source: string }, SyncSourceClassification>('sync/conflictsResolved', { source: this.source });
			}
		}
	}

	protected get enabled(): boolean { return this.userDataSyncEnablementService.isResourceEnabled(this.resourceKey); }

	async sync(ref?: string, donotUseLastSyncUserData?: boolean): Promise<void> {
		if (!this.enabled) {
			this.logService.info(`${this.source}: Skipped synchronizing ${this.source.toLowerCase()} as it is disabled.`);
			return;
		}
		if (this.status === SyncStatus.HasConflicts) {
			this.logService.info(`${this.source}: Skipped synchronizing ${this.source.toLowerCase()} as there are conflicts.`);
			return;
		}
		if (this.status === SyncStatus.Syncing) {
			this.logService.info(`${this.source}: Skipped synchronizing ${this.source.toLowerCase()} as it is running already.`);
			return;
		}

		this.logService.trace(`${this.source}: Started synchronizing ${this.source.toLowerCase()}...`);
		this.setStatus(SyncStatus.Syncing);

		const lastSyncUserData = donotUseLastSyncUserData ? null : await this.getLastSyncUserData();
		const remoteUserData = ref && lastSyncUserData && lastSyncUserData.ref === ref ? lastSyncUserData : await this.getRemoteUserData(lastSyncUserData);

		if (remoteUserData.syncData && remoteUserData.syncData.version > this.version) {
			// current version is not compatible with cloud version
			this.telemetryService.publicLog2<{ source: string }, SyncSourceClassification>('sync/incompatible', { source: this.source });
			throw new UserDataSyncError(localize('incompatible', "Cannot sync {0} as its version {1} is not compatible with cloud {2}", this.source, this.version, remoteUserData.syncData.version), UserDataSyncErrorCode.Incompatible, this.source);
		}

		try {
			await this.doSync(remoteUserData, lastSyncUserData);
		} catch (e) {
			if (e instanceof UserDataSyncError) {
				switch (e.code) {
					case UserDataSyncErrorCode.RemotePreconditionFailed:
						// Rejected as there is a new remote version. Syncing again,
						this.logService.info(`${this.source}: Failed to synchronize as there is a new remote version available. Synchronizing again...`);
						return this.sync(undefined, true);
				}
			}
			throw e;
		}
	}

	async hasPreviouslySynced(): Promise<boolean> {
		const lastSyncData = await this.getLastSyncUserData();
		return !!lastSyncData;
	}

	async getRemoteContent(): Promise<string | null> {
		const lastSyncData = await this.getLastSyncUserData();
		const { syncData } = await this.getRemoteUserData(lastSyncData);
		return syncData ? syncData.content : null;
	}

	async resetLocal(): Promise<void> {
		try {
			await this.fileService.del(this.lastSyncResource);
		} catch (e) { /* ignore */ }
	}

	protected async getLastSyncUserData<T extends IRemoteUserData>(): Promise<T | null> {
		try {
			const content = await this.fileService.readFile(this.lastSyncResource);
			const parsed = JSON.parse(content.value.toString());
			let syncData: ISyncData = JSON.parse(parsed.content);

			// Migration from old content to sync data
			if (!isSyncData(syncData)) {
				syncData = { version: this.version, content: parsed.content };
			}

			return { ...parsed, ...{ syncData, content: undefined } };
		} catch (error) {
			if (!(error instanceof FileOperationError && error.fileOperationResult === FileOperationResult.FILE_NOT_FOUND)) {
				// log error always except when file does not exist
				this.logService.error(error);
			}
		}
		return null;
	}

	protected async updateLastSyncUserData(lastSyncRemoteUserData: IRemoteUserData, additionalProps: IStringDictionary<any> = {}): Promise<void> {
		const lastSyncUserData: IUserData = { ref: lastSyncRemoteUserData.ref, content: JSON.stringify(lastSyncRemoteUserData.syncData), ...additionalProps };
		await this.fileService.writeFile(this.lastSyncResource, VSBuffer.fromString(JSON.stringify(lastSyncUserData)));
	}

	protected async getRemoteUserData(lastSyncData: IRemoteUserData | null): Promise<IRemoteUserData> {
		const lastSyncUserData: IUserData | null = lastSyncData ? { ref: lastSyncData.ref, content: lastSyncData.syncData ? JSON.stringify(lastSyncData.syncData) : null } : null;
		const { ref, content } = await this.userDataSyncStoreService.read(this.resourceKey, lastSyncUserData, this.source);
		let syncData: ISyncData | null = null;
		if (content !== null) {
			try {
				syncData = <ISyncData>JSON.parse(content);

				// Migration from old content to sync data
				if (!isSyncData(syncData)) {
					syncData = { version: this.version, content };
				}

			} catch (e) {
				this.logService.error(e);
			}
		}
		return { ref, syncData };
	}

	protected async updateRemoteUserData(content: string, ref: string | null): Promise<IRemoteUserData> {
		const syncData: ISyncData = { version: this.version, content };
		ref = await this.userDataSyncStoreService.write(this.resourceKey, JSON.stringify(syncData), ref, this.source);
		return { ref, syncData };
	}

	protected async backupLocal(content: VSBuffer): Promise<void> {
		const resource = joinPath(this.syncFolder, `${toLocalISOString(new Date()).replace(/-|:|\.\d+Z$/g, '')}.json`);
		try {
			await this.fileService.writeFile(resource, content);
		} catch (e) {
			this.logService.error(e);
		}
		this.cleanUpDelayer.trigger(() => this.cleanUpBackup());
	}

	private async cleanUpBackup(): Promise<void> {
		try {
			if (!(await this.fileService.exists(this.syncFolder))) {
				return;
			}
			const stat = await this.fileService.resolve(this.syncFolder);
			if (stat.children) {
				const all = stat.children.filter(stat => stat.isFile && /^\d{8}T\d{6}(\.json)?$/.test(stat.name)).sort();
				const backUpMaxAge = 1000 * 60 * 60 * 24 * (this.configurationService.getValue<number>('sync.localBackupDuration') || 30 /* Default 30 days */);
				let toDelete = all.filter(stat => {
					const ctime = stat.ctime || new Date(
						parseInt(stat.name.substring(0, 4)),
						parseInt(stat.name.substring(4, 6)) - 1,
						parseInt(stat.name.substring(6, 8)),
						parseInt(stat.name.substring(9, 11)),
						parseInt(stat.name.substring(11, 13)),
						parseInt(stat.name.substring(13, 15))
					).getTime();
					return Date.now() - ctime > backUpMaxAge;
				});
				const remaining = all.length - toDelete.length;
				if (remaining < 10) {
					toDelete = toDelete.slice(10 - remaining);
				}
				await Promise.all(toDelete.map(stat => {
					this.logService.info('Deleting from backup', stat.resource.path);
					this.fileService.del(stat.resource);
				}));
			}
		} catch (e) {
			this.logService.error(e);
		}
	}

	abstract readonly resourceKey: ResourceKey;
	protected abstract readonly version: number;
	protected abstract doSync(remoteUserData: IRemoteUserData, lastSyncUserData: IRemoteUserData | null): Promise<void>;
}

export interface IFileSyncPreviewResult {
	readonly fileContent: IFileContent | null;
	readonly remoteUserData: IRemoteUserData;
	readonly lastSyncUserData: IRemoteUserData | null;
	readonly content: string | null;
	readonly hasLocalChanged: boolean;
	readonly hasRemoteChanged: boolean;
	readonly hasConflicts: boolean;
}

export abstract class AbstractFileSynchroniser extends AbstractSynchroniser {

	protected syncPreviewResultPromise: CancelablePromise<IFileSyncPreviewResult> | null = null;

	constructor(
		protected readonly file: URI,
		source: SyncSource,
		@IFileService fileService: IFileService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IUserDataSyncStoreService userDataSyncStoreService: IUserDataSyncStoreService,
		@IUserDataSyncEnablementService userDataSyncEnablementService: IUserDataSyncEnablementService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IUserDataSyncLogService logService: IUserDataSyncLogService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super(source, fileService, environmentService, userDataSyncStoreService, userDataSyncEnablementService, telemetryService, logService, configurationService);
		this._register(this.fileService.watch(dirname(file)));
		this._register(this.fileService.onDidFilesChange(e => this.onFileChanges(e)));
	}

	async stop(): Promise<void> {
		this.cancel();
		this.logService.trace(`${this.source}: Stopped synchronizing ${this.source.toLowerCase()}.`);
		try {
			await this.fileService.del(this.conflictsPreviewResource);
		} catch (e) { /* ignore */ }
		this.setStatus(SyncStatus.Idle);
	}

	async getRemoteContent(preview?: boolean): Promise<string | null> {
		if (preview) {
			if (this.syncPreviewResultPromise) {
				const result = await this.syncPreviewResultPromise;
				return result.remoteUserData && result.remoteUserData.syncData ? result.remoteUserData.syncData.content : null;
			}
		}
		return super.getRemoteContent();
	}

	protected async getLocalFileContent(): Promise<IFileContent | null> {
		try {
			return await this.fileService.readFile(this.file);
		} catch (error) {
			return null;
		}
	}

	protected async updateLocalFileContent(newContent: string, oldContent: IFileContent | null): Promise<void> {
		try {
			if (oldContent) {
				// file exists already
				await this.backupLocal(oldContent.value);
				await this.fileService.writeFile(this.file, VSBuffer.fromString(newContent), oldContent);
			} else {
				// file does not exist
				await this.fileService.createFile(this.file, VSBuffer.fromString(newContent), { overwrite: false });
			}
		} catch (e) {
			if ((e instanceof FileSystemProviderError && e.code === FileSystemProviderErrorCode.FileExists) ||
				(e instanceof FileOperationError && e.fileOperationResult === FileOperationResult.FILE_MODIFIED_SINCE)) {
				throw new UserDataSyncError(e.message, UserDataSyncErrorCode.LocalPreconditionFailed);
			} else {
				throw e;
			}
		}
	}

	private onFileChanges(e: FileChangesEvent): void {
		if (!e.contains(this.file)) {
			return;
		}

		if (!this.enabled) {
			return;
		}

		// Sync again if local file has changed and current status is in conflicts
		if (this.status === SyncStatus.HasConflicts) {
			this.syncPreviewResultPromise?.then(result => {
				this.cancel();
				this.doSync(result.remoteUserData, result.lastSyncUserData);
			});
		}

		// Otherwise fire change event
		else {
			this._onDidChangeLocal.fire();
		}

	}

	protected cancel(): void {
		if (this.syncPreviewResultPromise) {
			this.syncPreviewResultPromise.cancel();
			this.syncPreviewResultPromise = null;
		}
	}

	protected abstract readonly conflictsPreviewResource: URI;
}

export abstract class AbstractJsonFileSynchroniser extends AbstractFileSynchroniser {

	constructor(
		file: URI,
		source: SyncSource,
		@IFileService fileService: IFileService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IUserDataSyncStoreService userDataSyncStoreService: IUserDataSyncStoreService,
		@IUserDataSyncEnablementService userDataSyncEnablementService: IUserDataSyncEnablementService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IUserDataSyncLogService logService: IUserDataSyncLogService,
		@IUserDataSyncUtilService protected readonly userDataSyncUtilService: IUserDataSyncUtilService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super(file, source, fileService, environmentService, userDataSyncStoreService, userDataSyncEnablementService, telemetryService, logService, configurationService);
	}

	protected hasErrors(content: string): boolean {
		const parseErrors: ParseError[] = [];
		parse(content, parseErrors, { allowEmptyContent: true, allowTrailingComma: true });
		return parseErrors.length > 0;
	}

	private _formattingOptions: Promise<FormattingOptions> | undefined = undefined;
	protected getFormattingOptions(): Promise<FormattingOptions> {
		if (!this._formattingOptions) {
			this._formattingOptions = this.userDataSyncUtilService.resolveFormattingOptions(this.file);
		}
		return this._formattingOptions;
	}

}
