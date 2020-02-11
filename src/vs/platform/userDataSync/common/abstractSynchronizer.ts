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

type SyncConflictsClassification = {
	source?: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
};

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
	) {
		super();
		this.syncFolder = joinPath(environmentService.userDataSyncHome, source);
		this.lastSyncResource = joinPath(this.syncFolder, `.lastSync${source}.json`);
		this.cleanUpDelayer = new ThrottledDelayer(50);
	}

	protected setStatus(status: SyncStatus): void {
		if (this._status !== status) {
			const oldStatus = this._status;
			this._status = status;
			this._onDidChangStatus.fire(status);
			if (status === SyncStatus.HasConflicts) {
				// Log to telemetry when there is a sync conflict
				this.telemetryService.publicLog2<{ source: string }, SyncConflictsClassification>('sync/conflictsDetected', { source: this.source });
			}
			if (oldStatus === SyncStatus.HasConflicts && status === SyncStatus.Idle) {
				// Log to telemetry when conflicts are resolved
				this.telemetryService.publicLog2<{ source: string }, SyncConflictsClassification>('sync/conflictsResolved', { source: this.source });
			}
		}
	}

	protected get enabled(): boolean { return this.userDataSyncEnablementService.isResourceEnabled(this.resourceKey); }

	async sync(ref?: string): Promise<void> {
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

		const lastSyncUserData = await this.getLastSyncUserData();
		const remoteUserData = ref && lastSyncUserData && lastSyncUserData.ref === ref ? lastSyncUserData : await this.getRemoteUserData(lastSyncUserData);
		return this.doSync(remoteUserData, lastSyncUserData);
	}

	async hasPreviouslySynced(): Promise<boolean> {
		const lastSyncData = await this.getLastSyncUserData();
		return !!lastSyncData;
	}

	async getRemoteContent(): Promise<string | null> {
		const lastSyncData = await this.getLastSyncUserData();
		const remoteUserData = await this.getRemoteUserData(lastSyncData);
		return remoteUserData.content;
	}

	async resetLocal(): Promise<void> {
		try {
			await this.fileService.del(this.lastSyncResource);
		} catch (e) { /* ignore */ }
	}

	protected async getLastSyncUserData<T extends IUserData>(): Promise<T | null> {
		try {
			const content = await this.fileService.readFile(this.lastSyncResource);
			return JSON.parse(content.value.toString());
		} catch (error) {
			return null;
		}
	}

	protected async updateLastSyncUserData<T extends IUserData>(lastSyncUserData: T): Promise<void> {
		await this.fileService.writeFile(this.lastSyncResource, VSBuffer.fromString(JSON.stringify(lastSyncUserData)));
	}

	protected async getRemoteUserData(lastSyncData: IUserData | null): Promise<IUserData> {
		return this.userDataSyncStoreService.read(this.resourceKey, lastSyncData, this.source);
	}

	protected async updateRemoteUserData(content: string, ref: string | null): Promise<string> {
		return this.userDataSyncStoreService.write(this.resourceKey, content, ref, this.source);
	}

	protected async backupLocal(content: VSBuffer): Promise<void> {
		const resource = joinPath(this.syncFolder, toLocalISOString(new Date()).replace(/-|:|\.\d+Z$/g, ''));
		await this.fileService.writeFile(resource, content);
		this.cleanUpDelayer.trigger(() => this.cleanUpBackup());
	}

	private async cleanUpBackup(): Promise<void> {
		const stat = await this.fileService.resolve(this.syncFolder);
		if (stat.children) {
			const all = stat.children.filter(stat => stat.isFile && /^\d{8}T\d{6}$/.test(stat.name)).sort();
			const toDelete = all.slice(0, Math.max(0, all.length - 9));
			await Promise.all(toDelete.map(stat => this.fileService.del(stat.resource)));
		}
	}

	abstract readonly resourceKey: ResourceKey;
	protected abstract doSync(remoteUserData: IUserData, lastSyncUserData: IUserData | null): Promise<void>;
}

export interface IFileSyncPreviewResult {
	readonly fileContent: IFileContent | null;
	readonly remoteUserData: IUserData;
	readonly lastSyncUserData: IUserData | null;
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
	) {
		super(source, fileService, environmentService, userDataSyncStoreService, userDataSyncEnablementService, telemetryService, logService);
		this._register(this.fileService.watch(dirname(file)));
		this._register(this.fileService.onFileChanges(e => this.onFileChanges(e)));
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
				return result.remoteUserData ? result.remoteUserData.content : null;
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
	) {
		super(file, source, fileService, environmentService, userDataSyncStoreService, userDataSyncEnablementService, telemetryService, logService);
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
