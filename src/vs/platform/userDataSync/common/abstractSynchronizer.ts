/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IFileService, IFileContent, FileChangesEvent, FileSystemProviderError, FileSystemProviderErrorCode, FileOperationResult, FileOperationError } from 'vs/platform/files/common/files';
import { VSBuffer } from 'vs/base/common/buffer';
import { URI } from 'vs/base/common/uri';
import { SyncSource, SyncStatus, IUserData, IUserDataSyncStoreService, UserDataSyncErrorCode, UserDataSyncError } from 'vs/platform/userDataSync/common/userDataSync';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { joinPath, dirname } from 'vs/base/common/resources';
import { toLocalISOString } from 'vs/base/common/date';
import { ThrottledDelayer } from 'vs/base/common/async';
import { Emitter, Event } from 'vs/base/common/event';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

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
		@ITelemetryService private readonly telemetryService: ITelemetryService,
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

	async hasPreviouslySynced(): Promise<boolean> {
		const lastSyncData = await this.getLastSyncUserData();
		return !!lastSyncData;
	}

	async hasRemoteData(): Promise<boolean> {
		const lastSyncData = await this.getLastSyncUserData();
		const remoteUserData = await this.getRemoteUserData(lastSyncData);
		return remoteUserData.content !== null;
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
		return this.userDataSyncStoreService.read(this.getRemoteDataResourceKey(), lastSyncData, this.source);
	}

	protected async updateRemoteUserData(content: string, ref: string | null): Promise<string> {
		return this.userDataSyncStoreService.write(this.getRemoteDataResourceKey(), content, ref, this.source);
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

	protected abstract readonly enabled: boolean;
	protected abstract getRemoteDataResourceKey(): string;
}

export abstract class AbstractFileSynchroniser extends AbstractSynchroniser {

	constructor(
		protected readonly file: URI,
		readonly source: SyncSource,
		@IFileService fileService: IFileService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IUserDataSyncStoreService userDataSyncStoreService: IUserDataSyncStoreService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super(source, fileService, environmentService, userDataSyncStoreService, telemetryService);
		this._register(this.fileService.watch(dirname(file)));
		this._register(this.fileService.onFileChanges(e => this.onFileChanges(e)));
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
				throw new UserDataSyncError(e.message, UserDataSyncErrorCode.NewLocal);
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
			this.cancel();
			this.doSync();
		}
		// Otherwise fire change event
		else {
			this._onDidChangeLocal.fire();
		}

	}

	protected abstract cancel(): void;
	protected abstract doSync(): Promise<void>;
}
