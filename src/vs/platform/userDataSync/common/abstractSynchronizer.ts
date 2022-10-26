/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from 'vs/base/common/arrays';
import { CancelablePromise, createCancelablePromise, ThrottledDelayer } from 'vs/base/common/async';
import { VSBuffer } from 'vs/base/common/buffer';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IStringDictionary } from 'vs/base/common/collections';
import { Emitter, Event } from 'vs/base/common/event';
import { parse, ParseError } from 'vs/base/common/json';
import { FormattingOptions } from 'vs/base/common/jsonFormatter';
import { Disposable } from 'vs/base/common/lifecycle';
import { IExtUri } from 'vs/base/common/resources';
import { uppercaseFirstLetter } from 'vs/base/common/strings';
import { isUndefined } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { IHeaders } from 'vs/base/parts/request/common/request';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { FileChangesEvent, FileOperationError, FileOperationResult, IFileContent, IFileService } from 'vs/platform/files/common/files';
import { ILogService } from 'vs/platform/log/common/log';
import { getServiceMachineId } from 'vs/platform/externalServices/common/serviceMachineId';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { Change, getLastSyncResourceUri, IRemoteUserData, IResourcePreview as IBaseResourcePreview, ISyncData, IUserDataSyncResourcePreview as IBaseSyncResourcePreview, IUserData, IUserDataInitializer, IUserDataSyncBackupStoreService, IUserDataSyncConfiguration, IUserDataSynchroniser, IUserDataSyncLogService, IUserDataSyncEnablementService, IUserDataSyncStoreService, IUserDataSyncUtilService, MergeState, PREVIEW_DIR_NAME, SyncResource, SyncStatus, UserDataSyncError, UserDataSyncErrorCode, USER_DATA_SYNC_CONFIGURATION_SCOPE, USER_DATA_SYNC_SCHEME, IUserDataResourceManifest, getPathSegments, IUserDataSyncResourceConflicts, IUserDataSyncResource } from 'vs/platform/userDataSync/common/userDataSync';
import { IUserDataProfile, IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';

type IncompatibleSyncSourceClassification = {
	owner: 'sandy081';
	comment: 'Information about the sync resource that is incompatible';
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'settings sync resource. eg., settings, keybindings...' };
};

export function isSyncData(thing: any): thing is ISyncData {
	if (thing
		&& (thing.version !== undefined && typeof thing.version === 'number')
		&& (thing.content !== undefined && typeof thing.content === 'string')) {

		// backward compatibility
		if (Object.keys(thing).length === 2) {
			return true;
		}

		if (Object.keys(thing).length === 3
			&& (thing.machineId !== undefined && typeof thing.machineId === 'string')) {
			return true;
		}
	}

	return false;
}

export function getSyncResourceLogLabel(syncResource: SyncResource, profile: IUserDataProfile): string {
	return `${uppercaseFirstLetter(syncResource)}${profile.isDefault ? '' : ` (${profile.name})`}`;
}

export interface IResourcePreview {

	readonly baseResource: URI;
	readonly baseContent: string | null;

	readonly remoteResource: URI;
	readonly remoteContent: string | null;
	readonly remoteChange: Change;

	readonly localResource: URI;
	readonly localContent: string | null;
	readonly localChange: Change;

	readonly previewResource: URI;
	readonly acceptedResource: URI;
}

export interface IAcceptResult {
	readonly content: string | null;
	readonly localChange: Change;
	readonly remoteChange: Change;
}

export interface IMergeResult extends IAcceptResult {
	readonly hasConflicts: boolean;
}

interface IEditableResourcePreview extends IBaseResourcePreview, IResourcePreview {
	localChange: Change;
	remoteChange: Change;
	mergeState: MergeState;
	acceptResult?: IAcceptResult;
}

interface ISyncResourcePreview extends IBaseSyncResourcePreview {
	readonly remoteUserData: IRemoteUserData;
	readonly lastSyncUserData: IRemoteUserData | null;
	readonly resourcePreviews: IEditableResourcePreview[];
}

export abstract class AbstractSynchroniser extends Disposable implements IUserDataSynchroniser {

	private syncPreviewPromise: CancelablePromise<ISyncResourcePreview> | null = null;

	protected readonly syncFolder: URI;
	protected readonly syncPreviewFolder: URI;
	protected readonly extUri: IExtUri;
	private readonly currentMachineIdPromise: Promise<string>;

	private _status: SyncStatus = SyncStatus.Idle;
	get status(): SyncStatus { return this._status; }
	private _onDidChangStatus: Emitter<SyncStatus> = this._register(new Emitter<SyncStatus>());
	readonly onDidChangeStatus: Event<SyncStatus> = this._onDidChangStatus.event;

	private _conflicts: IBaseResourcePreview[] = [];
	get conflicts(): IUserDataSyncResourceConflicts { return { ...this.syncResource, conflicts: this._conflicts }; }
	private _onDidChangeConflicts = this._register(new Emitter<IUserDataSyncResourceConflicts>());
	readonly onDidChangeConflicts = this._onDidChangeConflicts.event;

	private readonly localChangeTriggerThrottler = new ThrottledDelayer<void>(50);
	private readonly _onDidChangeLocal: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChangeLocal: Event<void> = this._onDidChangeLocal.event;

	protected readonly lastSyncResource: URI;
	private hasSyncResourceStateVersionChanged: boolean = false;
	protected readonly syncResourceLogLabel: string;

	protected syncHeaders: IHeaders = {};

	readonly resource = this.syncResource.syncResource;

	constructor(
		readonly syncResource: IUserDataSyncResource,
		readonly collection: string | undefined,
		@IFileService protected readonly fileService: IFileService,
		@IEnvironmentService protected readonly environmentService: IEnvironmentService,
		@IStorageService storageService: IStorageService,
		@IUserDataSyncStoreService protected readonly userDataSyncStoreService: IUserDataSyncStoreService,
		@IUserDataSyncBackupStoreService protected readonly userDataSyncBackupStoreService: IUserDataSyncBackupStoreService,
		@IUserDataSyncEnablementService protected readonly userDataSyncEnablementService: IUserDataSyncEnablementService,
		@ITelemetryService protected readonly telemetryService: ITelemetryService,
		@IUserDataSyncLogService protected readonly logService: IUserDataSyncLogService,
		@IConfigurationService protected readonly configurationService: IConfigurationService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
	) {
		super();
		this.syncResourceLogLabel = getSyncResourceLogLabel(syncResource.syncResource, syncResource.profile);
		this.extUri = uriIdentityService.extUri;
		this.syncFolder = this.extUri.joinPath(environmentService.userDataSyncHome, ...getPathSegments(syncResource.profile.isDefault ? undefined : syncResource.profile.id, syncResource.syncResource));
		this.syncPreviewFolder = this.extUri.joinPath(this.syncFolder, PREVIEW_DIR_NAME);
		this.lastSyncResource = getLastSyncResourceUri(syncResource.profile.isDefault ? undefined : syncResource.profile.id, syncResource.syncResource, environmentService, this.extUri);
		this.currentMachineIdPromise = getServiceMachineId(environmentService, fileService, storageService);
	}

	protected triggerLocalChange(): void {
		this.localChangeTriggerThrottler.trigger(() => this.doTriggerLocalChange());
	}

	protected async doTriggerLocalChange(): Promise<void> {

		// Sync again if current status is in conflicts
		if (this.status === SyncStatus.HasConflicts) {
			this.logService.info(`${this.syncResourceLogLabel}: In conflicts state and local change detected. Syncing again...`);
			const preview = await this.syncPreviewPromise!;
			this.syncPreviewPromise = null;
			const status = await this.performSync(preview.remoteUserData, preview.lastSyncUserData, true, this.getUserDataSyncConfiguration());
			this.setStatus(status);
		}

		// Check if local change causes remote change
		else {
			this.logService.trace(`${this.syncResourceLogLabel}: Checking for local changes...`);
			const lastSyncUserData = await this.getLastSyncUserData();
			const hasRemoteChanged = lastSyncUserData ? await this.hasRemoteChanged(lastSyncUserData) : true;
			if (hasRemoteChanged) {
				this._onDidChangeLocal.fire();
			}
		}
	}

	protected setStatus(status: SyncStatus): void {
		if (this._status !== status) {
			this._status = status;
			this._onDidChangStatus.fire(status);
		}
	}

	async sync(manifest: IUserDataResourceManifest | null, headers: IHeaders = {}): Promise<void> {
		await this._sync(manifest, true, this.getUserDataSyncConfiguration(), headers);
	}

	async preview(manifest: IUserDataResourceManifest | null, userDataSyncConfiguration: IUserDataSyncConfiguration, headers: IHeaders = {}): Promise<ISyncResourcePreview | null> {
		return this._sync(manifest, false, userDataSyncConfiguration, headers);
	}

	async apply(force: boolean, headers: IHeaders = {}): Promise<ISyncResourcePreview | null> {
		try {
			this.syncHeaders = { ...headers };

			const status = await this.doApply(force);
			this.setStatus(status);

			return this.syncPreviewPromise;
		} finally {
			this.syncHeaders = {};
		}
	}

	private async _sync(manifest: IUserDataResourceManifest | null, apply: boolean, userDataSyncConfiguration: IUserDataSyncConfiguration, headers: IHeaders): Promise<ISyncResourcePreview | null> {
		try {
			this.syncHeaders = { ...headers };

			if (this.status === SyncStatus.HasConflicts) {
				this.logService.info(`${this.syncResourceLogLabel}: Skipped synchronizing ${this.resource.toLowerCase()} as there are conflicts.`);
				return this.syncPreviewPromise;
			}

			if (this.status === SyncStatus.Syncing) {
				this.logService.info(`${this.syncResourceLogLabel}: Skipped synchronizing ${this.resource.toLowerCase()} as it is running already.`);
				return this.syncPreviewPromise;
			}

			this.logService.trace(`${this.syncResourceLogLabel}: Started synchronizing ${this.resource.toLowerCase()}...`);
			this.setStatus(SyncStatus.Syncing);

			let status: SyncStatus = SyncStatus.Idle;
			try {
				const lastSyncUserData = await this.getLastSyncUserData();
				const remoteUserData = await this.getLatestRemoteUserData(manifest, lastSyncUserData);
				status = await this.performSync(remoteUserData, lastSyncUserData, apply, userDataSyncConfiguration);
				if (status === SyncStatus.HasConflicts) {
					this.logService.info(`${this.syncResourceLogLabel}: Detected conflicts while synchronizing ${this.resource.toLowerCase()}.`);
				} else if (status === SyncStatus.Idle) {
					this.logService.trace(`${this.syncResourceLogLabel}: Finished synchronizing ${this.resource.toLowerCase()}.`);
				}
				return this.syncPreviewPromise || null;
			} finally {
				this.setStatus(status);
			}
		} finally {
			this.syncHeaders = {};
		}
	}

	async replace(content: string): Promise<boolean> {
		const syncData = this.parseSyncData(content);
		if (!syncData) {
			return false;
		}

		await this.stop();

		try {
			this.logService.trace(`${this.syncResourceLogLabel}: Started resetting ${this.resource.toLowerCase()}...`);
			this.setStatus(SyncStatus.Syncing);
			const lastSyncUserData = await this.getLastSyncUserData();
			const remoteUserData = await this.getLatestRemoteUserData(null, lastSyncUserData);
			const isRemoteDataFromCurrentMachine = await this.isRemoteDataFromCurrentMachine(remoteUserData);

			/* use replace sync data */
			const resourcePreviewResults = await this.generateSyncPreview({ ref: remoteUserData.ref, syncData }, lastSyncUserData, isRemoteDataFromCurrentMachine, this.getUserDataSyncConfiguration(), CancellationToken.None);

			const resourcePreviews: [IResourcePreview, IAcceptResult][] = [];
			for (const resourcePreviewResult of resourcePreviewResults) {
				/* Accept remote resource */
				const acceptResult: IAcceptResult = await this.getAcceptResult(resourcePreviewResult, resourcePreviewResult.remoteResource, undefined, CancellationToken.None);
				/* compute remote change */
				const { remoteChange } = await this.getAcceptResult(resourcePreviewResult, resourcePreviewResult.previewResource, resourcePreviewResult.remoteContent, CancellationToken.None);
				resourcePreviews.push([resourcePreviewResult, { ...acceptResult, remoteChange: remoteChange !== Change.None ? remoteChange : Change.Modified }]);
			}

			await this.applyResult(remoteUserData, lastSyncUserData, resourcePreviews, false);
			this.logService.info(`${this.syncResourceLogLabel}: Finished resetting ${this.resource.toLowerCase()}.`);
		} finally {
			this.setStatus(SyncStatus.Idle);
		}

		return true;
	}

	private async isRemoteDataFromCurrentMachine(remoteUserData: IRemoteUserData): Promise<boolean> {
		const machineId = await this.currentMachineIdPromise;
		return !!remoteUserData.syncData?.machineId && remoteUserData.syncData.machineId === machineId;
	}

	protected async getLatestRemoteUserData(manifest: IUserDataResourceManifest | null, lastSyncUserData: IRemoteUserData | null): Promise<IRemoteUserData> {
		if (lastSyncUserData) {

			const latestRef = manifest ? manifest[this.resource] : undefined;

			// Last time synced resource and latest resource on server are same
			if (lastSyncUserData.ref === latestRef) {
				return lastSyncUserData;
			}

			// There is no resource on server and last time it was synced with no resource
			if (latestRef === undefined && lastSyncUserData.syncData === null) {
				return lastSyncUserData;
			}
		}
		return this.getRemoteUserData(lastSyncUserData);
	}

	private async performSync(remoteUserData: IRemoteUserData, lastSyncUserData: IRemoteUserData | null, apply: boolean, userDataSyncConfiguration: IUserDataSyncConfiguration): Promise<SyncStatus> {
		if (remoteUserData.syncData && remoteUserData.syncData.version > this.version) {
			// current version is not compatible with cloud version
			this.telemetryService.publicLog2<{ source: string }, IncompatibleSyncSourceClassification>('sync/incompatible', { source: this.resource });
			throw new UserDataSyncError(localize({ key: 'incompatible', comment: ['This is an error while syncing a resource that its local version is not compatible with its remote version.'] }, "Cannot sync {0} as its local version {1} is not compatible with its remote version {2}", this.resource, this.version, remoteUserData.syncData.version), UserDataSyncErrorCode.IncompatibleLocalContent, this.resource);
		}

		try {
			return await this.doSync(remoteUserData, lastSyncUserData, apply, userDataSyncConfiguration);
		} catch (e) {
			if (e instanceof UserDataSyncError) {
				switch (e.code) {

					case UserDataSyncErrorCode.LocalPreconditionFailed:
						// Rejected as there is a new local version. Syncing again...
						this.logService.info(`${this.syncResourceLogLabel}: Failed to synchronize ${this.syncResourceLogLabel} as there is a new local version available. Synchronizing again...`);
						return this.performSync(remoteUserData, lastSyncUserData, apply, userDataSyncConfiguration);

					case UserDataSyncErrorCode.Conflict:
					case UserDataSyncErrorCode.PreconditionFailed:
						// Rejected as there is a new remote version. Syncing again...
						this.logService.info(`${this.syncResourceLogLabel}: Failed to synchronize as there is a new remote version available. Synchronizing again...`);

						// Avoid cache and get latest remote user data - https://github.com/microsoft/vscode/issues/90624
						remoteUserData = await this.getRemoteUserData(null);

						// Get the latest last sync user data. Because multiples parallel syncs (in Web) could share same last sync data
						// and one of them successfully updated remote and last sync state.
						lastSyncUserData = await this.getLastSyncUserData();

						return this.performSync(remoteUserData, lastSyncUserData, apply, userDataSyncConfiguration);
				}
			}
			throw e;
		}
	}

	protected async doSync(remoteUserData: IRemoteUserData, lastSyncUserData: IRemoteUserData | null, apply: boolean, userDataSyncConfiguration: IUserDataSyncConfiguration): Promise<SyncStatus> {
		try {
			// generate or use existing preview
			if (!this.syncPreviewPromise) {
				this.syncPreviewPromise = createCancelablePromise(token => this.doGenerateSyncResourcePreview(remoteUserData, lastSyncUserData, apply, userDataSyncConfiguration, token));
			}

			const preview = await this.syncPreviewPromise;
			this.updateConflicts(preview.resourcePreviews);
			if (preview.resourcePreviews.some(({ mergeState }) => mergeState === MergeState.Conflict)) {
				return SyncStatus.HasConflicts;
			}

			if (apply) {
				return await this.doApply(false);
			}

			return SyncStatus.Syncing;

		} catch (error) {

			// reset preview on error
			this.syncPreviewPromise = null;

			throw error;
		}
	}

	async merge(resource: URI): Promise<ISyncResourcePreview | null> {
		await this.updateSyncResourcePreview(resource, async (resourcePreview) => {
			const mergeResult = await this.getMergeResult(resourcePreview, CancellationToken.None);
			await this.fileService.writeFile(resourcePreview.previewResource, VSBuffer.fromString(mergeResult?.content || ''));
			const acceptResult: IAcceptResult | undefined = mergeResult && !mergeResult.hasConflicts
				? await this.getAcceptResult(resourcePreview, resourcePreview.previewResource, undefined, CancellationToken.None)
				: undefined;
			resourcePreview.acceptResult = acceptResult;
			resourcePreview.mergeState = mergeResult.hasConflicts ? MergeState.Conflict : acceptResult ? MergeState.Accepted : MergeState.Preview;
			resourcePreview.localChange = acceptResult ? acceptResult.localChange : mergeResult.localChange;
			resourcePreview.remoteChange = acceptResult ? acceptResult.remoteChange : mergeResult.remoteChange;
			return resourcePreview;
		});
		return this.syncPreviewPromise;
	}

	async accept(resource: URI, content?: string | null): Promise<ISyncResourcePreview | null> {
		await this.updateSyncResourcePreview(resource, async (resourcePreview) => {
			const acceptResult = await this.getAcceptResult(resourcePreview, resource, content, CancellationToken.None);
			resourcePreview.acceptResult = acceptResult;
			resourcePreview.mergeState = MergeState.Accepted;
			resourcePreview.localChange = acceptResult.localChange;
			resourcePreview.remoteChange = acceptResult.remoteChange;
			return resourcePreview;
		});
		return this.syncPreviewPromise;
	}

	async discard(resource: URI): Promise<ISyncResourcePreview | null> {
		await this.updateSyncResourcePreview(resource, async (resourcePreview) => {
			const mergeResult = await this.getMergeResult(resourcePreview, CancellationToken.None);
			await this.fileService.writeFile(resourcePreview.previewResource, VSBuffer.fromString(mergeResult.content || ''));
			resourcePreview.acceptResult = undefined;
			resourcePreview.mergeState = MergeState.Preview;
			resourcePreview.localChange = mergeResult.localChange;
			resourcePreview.remoteChange = mergeResult.remoteChange;
			return resourcePreview;
		});
		return this.syncPreviewPromise;
	}

	private async updateSyncResourcePreview(resource: URI, updateResourcePreview: (resourcePreview: IEditableResourcePreview) => Promise<IEditableResourcePreview>): Promise<void> {
		if (!this.syncPreviewPromise) {
			return;
		}

		let preview = await this.syncPreviewPromise;
		const index = preview.resourcePreviews.findIndex(({ localResource, remoteResource, previewResource }) =>
			this.extUri.isEqual(localResource, resource) || this.extUri.isEqual(remoteResource, resource) || this.extUri.isEqual(previewResource, resource));
		if (index === -1) {
			return;
		}

		this.syncPreviewPromise = createCancelablePromise(async token => {
			const resourcePreviews = [...preview.resourcePreviews];
			resourcePreviews[index] = await updateResourcePreview(resourcePreviews[index]);
			return {
				...preview,
				resourcePreviews
			};
		});

		preview = await this.syncPreviewPromise;
		this.updateConflicts(preview.resourcePreviews);
		if (preview.resourcePreviews.some(({ mergeState }) => mergeState === MergeState.Conflict)) {
			this.setStatus(SyncStatus.HasConflicts);
		} else {
			this.setStatus(SyncStatus.Syncing);
		}
	}

	private async doApply(force: boolean): Promise<SyncStatus> {
		if (!this.syncPreviewPromise) {
			return SyncStatus.Idle;
		}

		const preview = await this.syncPreviewPromise;

		// check for conflicts
		if (preview.resourcePreviews.some(({ mergeState }) => mergeState === MergeState.Conflict)) {
			return SyncStatus.HasConflicts;
		}

		// check if all are accepted
		if (preview.resourcePreviews.some(({ mergeState }) => mergeState !== MergeState.Accepted)) {
			return SyncStatus.Syncing;
		}

		// apply preview
		await this.applyResult(preview.remoteUserData, preview.lastSyncUserData, preview.resourcePreviews.map(resourcePreview => ([resourcePreview, resourcePreview.acceptResult!])), force);

		// reset preview
		this.syncPreviewPromise = null;

		// reset preview folder
		await this.clearPreviewFolder();

		return SyncStatus.Idle;
	}

	private async clearPreviewFolder(): Promise<void> {
		try {
			await this.fileService.del(this.syncPreviewFolder, { recursive: true });
		} catch (error) { /* Ignore */ }
	}

	private updateConflicts(resourcePreviews: IEditableResourcePreview[]): void {
		const conflicts = resourcePreviews.filter(({ mergeState }) => mergeState === MergeState.Conflict);
		if (!equals(this._conflicts, conflicts, (a, b) => this.extUri.isEqual(a.previewResource, b.previewResource))) {
			this._conflicts = conflicts;
			this._onDidChangeConflicts.fire(this.conflicts);
		}
	}

	async hasPreviouslySynced(): Promise<boolean> {
		const lastSyncData = await this.getLastSyncUserData();
		return !!lastSyncData && lastSyncData.syncData !== null /* `null` sync data implies resource is not synced */;
	}

	protected async resolvePreviewContent(uri: URI): Promise<string | null> {
		const syncPreview = this.syncPreviewPromise ? await this.syncPreviewPromise : null;
		if (syncPreview) {
			for (const resourcePreview of syncPreview.resourcePreviews) {
				if (this.extUri.isEqual(resourcePreview.acceptedResource, uri)) {
					return resourcePreview.acceptResult ? resourcePreview.acceptResult.content : null;
				}
				if (this.extUri.isEqual(resourcePreview.remoteResource, uri)) {
					return resourcePreview.remoteContent;
				}
				if (this.extUri.isEqual(resourcePreview.localResource, uri)) {
					return resourcePreview.localContent;
				}
				if (this.extUri.isEqual(resourcePreview.baseResource, uri)) {
					return resourcePreview.baseContent;
				}
			}
		}
		return null;
	}

	async resetLocal(): Promise<void> {
		try {
			await this.fileService.del(this.lastSyncResource);
		} catch (e) { /* ignore */ }
	}

	private async doGenerateSyncResourcePreview(remoteUserData: IRemoteUserData, lastSyncUserData: IRemoteUserData | null, apply: boolean, userDataSyncConfiguration: IUserDataSyncConfiguration, token: CancellationToken): Promise<ISyncResourcePreview> {
		const isRemoteDataFromCurrentMachine = await this.isRemoteDataFromCurrentMachine(remoteUserData);
		const resourcePreviewResults = await this.generateSyncPreview(remoteUserData, lastSyncUserData, isRemoteDataFromCurrentMachine, userDataSyncConfiguration, token);

		const resourcePreviews: IEditableResourcePreview[] = [];
		for (const resourcePreviewResult of resourcePreviewResults) {
			const acceptedResource = resourcePreviewResult.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'accepted' });

			/* No change -> Accept */
			if (resourcePreviewResult.localChange === Change.None && resourcePreviewResult.remoteChange === Change.None) {
				resourcePreviews.push({
					...resourcePreviewResult,
					acceptedResource,
					acceptResult: { content: null, localChange: Change.None, remoteChange: Change.None },
					mergeState: MergeState.Accepted
				});
			}

			/* Changed -> Apply ? (Merge ? Conflict | Accept) : Preview */
			else {
				/* Merge */
				const mergeResult = apply ? await this.getMergeResult(resourcePreviewResult, token) : undefined;
				if (token.isCancellationRequested) {
					break;
				}
				await this.fileService.writeFile(resourcePreviewResult.previewResource, VSBuffer.fromString(mergeResult?.content || ''));

				/* Conflict | Accept */
				const acceptResult = mergeResult && !mergeResult.hasConflicts
					/* Accept if merged and there are no conflicts */
					? await this.getAcceptResult(resourcePreviewResult, resourcePreviewResult.previewResource, undefined, token)
					: undefined;

				resourcePreviews.push({
					...resourcePreviewResult,
					acceptResult,
					mergeState: mergeResult?.hasConflicts ? MergeState.Conflict : acceptResult ? MergeState.Accepted : MergeState.Preview,
					localChange: acceptResult ? acceptResult.localChange : mergeResult ? mergeResult.localChange : resourcePreviewResult.localChange,
					remoteChange: acceptResult ? acceptResult.remoteChange : mergeResult ? mergeResult.remoteChange : resourcePreviewResult.remoteChange
				});
			}
		}

		return { syncResource: this.resource, profile: this.syncResource.profile, remoteUserData, lastSyncUserData, resourcePreviews, isLastSyncFromCurrentMachine: isRemoteDataFromCurrentMachine };
	}

	async getLastSyncUserData<T extends IRemoteUserData>(): Promise<T | null> {
		try {
			const content = await this.fileService.readFile(this.lastSyncResource);
			const parsed = JSON.parse(content.value.toString());
			const resourceSyncStateVersion = this.userDataSyncEnablementService.getResourceSyncStateVersion(this.resource);
			this.hasSyncResourceStateVersionChanged = parsed.version && resourceSyncStateVersion && parsed.version !== resourceSyncStateVersion;
			if (this.hasSyncResourceStateVersionChanged) {
				this.logService.info(`${this.syncResourceLogLabel}: Reset last sync state because last sync state version ${parsed.version} is not compatible with current sync state version ${resourceSyncStateVersion}.`);
				await this.resetLocal();
				return null;
			}

			const userData: IUserData = parsed as IUserData;
			if (userData.content === null) {
				return { ref: parsed.ref, syncData: null } as T;
			}
			const syncData: ISyncData = JSON.parse(userData.content);

			/* Check if syncData is of expected type. Return only if matches */
			if (isSyncData(syncData)) {
				return { ...parsed, ...{ syncData, content: undefined } };
			}

		} catch (error) {
			if (error instanceof FileOperationError && error.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
				this.logService.info(`${this.syncResourceLogLabel}: Not synced yet. Last sync resource does not exist.`);
			} else {
				// log error always except when file does not exist
				this.logService.error(error);
			}
		}
		return null;
	}

	protected async updateLastSyncUserData(lastSyncRemoteUserData: IRemoteUserData, additionalProps: IStringDictionary<any> = {}): Promise<void> {
		if (additionalProps['ref'] || additionalProps['content'] || additionalProps['version']) {
			throw new Error('Cannot have core properties as additional');
		}

		const version = this.userDataSyncEnablementService.getResourceSyncStateVersion(this.resource);
		const lastSyncUserData = { ref: lastSyncRemoteUserData.ref, content: lastSyncRemoteUserData.syncData ? JSON.stringify(lastSyncRemoteUserData.syncData) : null, version, ...additionalProps };
		await this.fileService.writeFile(this.lastSyncResource, VSBuffer.fromString(JSON.stringify(lastSyncUserData)));
	}

	async getRemoteUserData(lastSyncData: IRemoteUserData | null): Promise<IRemoteUserData> {
		const { ref, content } = await this.getUserData(lastSyncData);
		let syncData: ISyncData | null = null;
		if (content !== null) {
			syncData = this.parseSyncData(content);
		}
		return { ref, syncData };
	}

	protected parseSyncData(content: string): ISyncData {
		try {
			const syncData: ISyncData = JSON.parse(content);
			if (isSyncData(syncData)) {
				return syncData;
			}
		} catch (error) {
			this.logService.error(error);
		}
		throw new UserDataSyncError(localize('incompatible sync data', "Cannot parse sync data as it is not compatible with the current version."), UserDataSyncErrorCode.IncompatibleRemoteContent, this.resource);
	}

	private async getUserData(lastSyncData: IRemoteUserData | null): Promise<IUserData> {
		const lastSyncUserData: IUserData | null = lastSyncData ? { ref: lastSyncData.ref, content: lastSyncData.syncData ? JSON.stringify(lastSyncData.syncData) : null } : null;
		return this.userDataSyncStoreService.readResource(this.resource, lastSyncUserData, this.collection, this.syncHeaders);
	}

	protected async updateRemoteUserData(content: string, ref: string | null): Promise<IRemoteUserData> {
		const machineId = await this.currentMachineIdPromise;
		const syncData: ISyncData = { version: this.version, machineId, content };
		try {
			ref = await this.userDataSyncStoreService.writeResource(this.resource, JSON.stringify(syncData), ref, this.collection, this.syncHeaders);
			return { ref, syncData };
		} catch (error) {
			if (error instanceof UserDataSyncError && error.code === UserDataSyncErrorCode.TooLarge) {
				error = new UserDataSyncError(error.message, error.code, this.resource);
			}
			throw error;
		}
	}

	protected async backupLocal(content: string): Promise<void> {
		const syncData: ISyncData = { version: this.version, content };
		return this.userDataSyncBackupStoreService.backup(this.syncResource.profile, this.resource, JSON.stringify(syncData));
	}

	async stop(): Promise<void> {
		if (this.status === SyncStatus.Idle) {
			return;
		}

		this.logService.trace(`${this.syncResourceLogLabel}: Stopping synchronizing ${this.resource.toLowerCase()}.`);
		if (this.syncPreviewPromise) {
			this.syncPreviewPromise.cancel();
			this.syncPreviewPromise = null;
		}

		this.updateConflicts([]);
		await this.clearPreviewFolder();

		this.setStatus(SyncStatus.Idle);
		this.logService.info(`${this.syncResourceLogLabel}: Stopped synchronizing ${this.resource.toLowerCase()}.`);
	}

	private getUserDataSyncConfiguration(): IUserDataSyncConfiguration {
		return this.configurationService.getValue(USER_DATA_SYNC_CONFIGURATION_SCOPE);
	}

	protected abstract readonly version: number;
	protected abstract generateSyncPreview(remoteUserData: IRemoteUserData, lastSyncUserData: IRemoteUserData | null, isRemoteDataFromCurrentMachine: boolean, userDataSyncConfiguration: IUserDataSyncConfiguration, token: CancellationToken): Promise<IResourcePreview[]>;
	protected abstract getMergeResult(resourcePreview: IResourcePreview, token: CancellationToken): Promise<IMergeResult>;
	protected abstract getAcceptResult(resourcePreview: IResourcePreview, resource: URI, content: string | null | undefined, token: CancellationToken): Promise<IAcceptResult>;
	protected abstract applyResult(remoteUserData: IRemoteUserData, lastSyncUserData: IRemoteUserData | null, result: [IResourcePreview, IAcceptResult][], force: boolean): Promise<void>;
	protected abstract hasRemoteChanged(lastSyncUserData: IRemoteUserData): Promise<boolean>;

	abstract hasLocalData(): Promise<boolean>;
	abstract resolveContent(uri: URI): Promise<string | null>;
}

export interface IFileResourcePreview extends IResourcePreview {
	readonly fileContent: IFileContent | null;
}

export abstract class AbstractFileSynchroniser extends AbstractSynchroniser {

	constructor(
		protected readonly file: URI,
		syncResource: IUserDataSyncResource,
		collection: string | undefined,
		@IFileService fileService: IFileService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IStorageService storageService: IStorageService,
		@IUserDataSyncStoreService userDataSyncStoreService: IUserDataSyncStoreService,
		@IUserDataSyncBackupStoreService userDataSyncBackupStoreService: IUserDataSyncBackupStoreService,
		@IUserDataSyncEnablementService userDataSyncEnablementService: IUserDataSyncEnablementService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IUserDataSyncLogService logService: IUserDataSyncLogService,
		@IConfigurationService configurationService: IConfigurationService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
	) {
		super(syncResource, collection, fileService, environmentService, storageService, userDataSyncStoreService, userDataSyncBackupStoreService, userDataSyncEnablementService, telemetryService, logService, configurationService, uriIdentityService);
		this._register(this.fileService.watch(this.extUri.dirname(file)));
		this._register(this.fileService.onDidFilesChange(e => this.onFileChanges(e)));
	}

	protected async getLocalFileContent(): Promise<IFileContent | null> {
		try {
			return await this.fileService.readFile(this.file);
		} catch (error) {
			return null;
		}
	}

	protected async updateLocalFileContent(newContent: string, oldContent: IFileContent | null, force: boolean): Promise<void> {
		try {
			if (oldContent) {
				// file exists already
				await this.fileService.writeFile(this.file, VSBuffer.fromString(newContent), force ? undefined : oldContent);
			} else {
				// file does not exist
				await this.fileService.createFile(this.file, VSBuffer.fromString(newContent), { overwrite: force });
			}
		} catch (e) {
			if ((e instanceof FileOperationError && e.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) ||
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
		this.triggerLocalChange();
	}

}

export abstract class AbstractJsonFileSynchroniser extends AbstractFileSynchroniser {

	constructor(
		file: URI,
		syncResource: IUserDataSyncResource,
		collection: string | undefined,
		@IFileService fileService: IFileService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IStorageService storageService: IStorageService,
		@IUserDataSyncStoreService userDataSyncStoreService: IUserDataSyncStoreService,
		@IUserDataSyncBackupStoreService userDataSyncBackupStoreService: IUserDataSyncBackupStoreService,
		@IUserDataSyncEnablementService userDataSyncEnablementService: IUserDataSyncEnablementService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IUserDataSyncLogService logService: IUserDataSyncLogService,
		@IUserDataSyncUtilService protected readonly userDataSyncUtilService: IUserDataSyncUtilService,
		@IConfigurationService configurationService: IConfigurationService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
	) {
		super(file, syncResource, collection, fileService, environmentService, storageService, userDataSyncStoreService, userDataSyncBackupStoreService, userDataSyncEnablementService, telemetryService, logService, configurationService, uriIdentityService);
	}

	protected hasErrors(content: string, isArray: boolean): boolean {
		const parseErrors: ParseError[] = [];
		const result = parse(content, parseErrors, { allowEmptyContent: true, allowTrailingComma: true });
		return parseErrors.length > 0 || (!isUndefined(result) && isArray !== Array.isArray(result));
	}

	private _formattingOptions: Promise<FormattingOptions> | undefined = undefined;
	protected getFormattingOptions(): Promise<FormattingOptions> {
		if (!this._formattingOptions) {
			this._formattingOptions = this.userDataSyncUtilService.resolveFormattingOptions(this.file);
		}
		return this._formattingOptions;
	}

}

export abstract class AbstractInitializer implements IUserDataInitializer {

	protected readonly extUri: IExtUri;
	private readonly lastSyncResource: URI;

	constructor(
		readonly resource: SyncResource,
		@IUserDataProfilesService protected readonly userDataProfilesService: IUserDataProfilesService,
		@IEnvironmentService protected readonly environmentService: IEnvironmentService,
		@ILogService protected readonly logService: ILogService,
		@IFileService protected readonly fileService: IFileService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
	) {
		this.extUri = uriIdentityService.extUri;
		this.lastSyncResource = getLastSyncResourceUri(undefined, this.resource, environmentService, this.extUri);
	}

	async initialize({ ref, content }: IUserData): Promise<void> {
		if (!content) {
			this.logService.info('Remote content does not exist.', this.resource);
			return;
		}

		const syncData = this.parseSyncData(content);
		if (!syncData) {
			return;
		}

		try {
			await this.doInitialize({ ref, syncData });
		} catch (error) {
			this.logService.error(error);
		}
	}

	private parseSyncData(content: string): ISyncData | undefined {
		try {
			const syncData: ISyncData = JSON.parse(content);
			if (isSyncData(syncData)) {
				return syncData;
			}
		} catch (error) {
			this.logService.error(error);
		}
		this.logService.info('Cannot parse sync data as it is not compatible with the current version.', this.resource);
		return undefined;
	}

	protected async updateLastSyncUserData(lastSyncRemoteUserData: IRemoteUserData, additionalProps: IStringDictionary<any> = {}): Promise<void> {
		const lastSyncUserData: IUserData = { ref: lastSyncRemoteUserData.ref, content: lastSyncRemoteUserData.syncData ? JSON.stringify(lastSyncRemoteUserData.syncData) : null, ...additionalProps };
		await this.fileService.writeFile(this.lastSyncResource, VSBuffer.fromString(JSON.stringify(lastSyncUserData)));
	}

	protected abstract doInitialize(remoteUserData: IRemoteUserData): Promise<void>;

}
