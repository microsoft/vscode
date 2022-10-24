/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { toFormattedString } from 'vs/base/common/jsonFormatter';
import { URI } from 'vs/base/common/uri';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { IUserDataProfile, IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { AbstractSynchroniser, IAcceptResult, IMergeResult, IResourcePreview } from 'vs/platform/userDataSync/common/abstractSynchronizer';
import { merge } from 'vs/platform/userDataSync/common/userDataProfilesManifestMerge';
import { Change, IRemoteUserData, IUserDataSyncBackupStoreService, IUserDataSynchroniser, IUserDataSyncLogService, IUserDataSyncEnablementService, IUserDataSyncStoreService, SyncResource, USER_DATA_SYNC_SCHEME, ISyncUserDataProfile, ISyncData, IUserDataResourceManifest } from 'vs/platform/userDataSync/common/userDataSync';

export interface IUserDataProfileManifestResourceMergeResult extends IAcceptResult {
	readonly local: { added: ISyncUserDataProfile[]; removed: IUserDataProfile[]; updated: ISyncUserDataProfile[] };
	readonly remote: { added: IUserDataProfile[]; removed: ISyncUserDataProfile[]; updated: IUserDataProfile[] } | null;
}

export interface IUserDataProfilesManifestResourcePreview extends IResourcePreview {
	readonly previewResult: IUserDataProfileManifestResourceMergeResult;
	readonly remoteProfiles: ISyncUserDataProfile[] | null;
}

export class UserDataProfilesManifestSynchroniser extends AbstractSynchroniser implements IUserDataSynchroniser {

	protected readonly version: number = 1;
	readonly previewResource: URI = this.extUri.joinPath(this.syncPreviewFolder, 'profiles.json');
	readonly baseResource: URI = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'base' });
	readonly localResource: URI = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'local' });
	readonly remoteResource: URI = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'remote' });
	readonly acceptedResource: URI = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'accepted' });

	constructor(
		profile: IUserDataProfile,
		collection: string | undefined,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IFileService fileService: IFileService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IStorageService storageService: IStorageService,
		@IUserDataSyncStoreService userDataSyncStoreService: IUserDataSyncStoreService,
		@IUserDataSyncBackupStoreService userDataSyncBackupStoreService: IUserDataSyncBackupStoreService,
		@IUserDataSyncLogService logService: IUserDataSyncLogService,
		@IConfigurationService configurationService: IConfigurationService,
		@IUserDataSyncEnablementService userDataSyncEnablementService: IUserDataSyncEnablementService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
	) {
		super({ syncResource: SyncResource.Profiles, profile }, collection, fileService, environmentService, storageService, userDataSyncStoreService, userDataSyncBackupStoreService, userDataSyncEnablementService, telemetryService, logService, configurationService, uriIdentityService);
	}

	async getLastSyncedProfiles(): Promise<ISyncUserDataProfile[] | null> {
		const lastSyncUserData = await this.getLastSyncUserData();
		return lastSyncUserData?.syncData ? parseUserDataProfilesManifest(lastSyncUserData.syncData) : null;
	}

	async getRemoteSyncedProfiles(manifest: IUserDataResourceManifest | null): Promise<ISyncUserDataProfile[] | null> {
		const lastSyncUserData = await this.getLastSyncUserData();
		const remoteUserData = await this.getLatestRemoteUserData(manifest, lastSyncUserData);
		return remoteUserData?.syncData ? parseUserDataProfilesManifest(remoteUserData.syncData) : null;
	}

	protected async generateSyncPreview(remoteUserData: IRemoteUserData, lastSyncUserData: IRemoteUserData | null, isRemoteDataFromCurrentMachine: boolean): Promise<IUserDataProfilesManifestResourcePreview[]> {
		const remoteProfiles: ISyncUserDataProfile[] | null = remoteUserData.syncData ? parseUserDataProfilesManifest(remoteUserData.syncData) : null;
		const lastSyncProfiles: ISyncUserDataProfile[] | null = lastSyncUserData?.syncData ? parseUserDataProfilesManifest(lastSyncUserData.syncData) : null;
		const localProfiles = this.getLocalUserDataProfiles();

		const { local, remote } = merge(localProfiles, remoteProfiles, lastSyncProfiles, []);
		const previewResult: IUserDataProfileManifestResourceMergeResult = {
			local, remote,
			content: lastSyncProfiles ? this.stringifyRemoteProfiles(lastSyncProfiles) : null,
			localChange: local.added.length > 0 || local.removed.length > 0 || local.updated.length > 0 ? Change.Modified : Change.None,
			remoteChange: remote !== null ? Change.Modified : Change.None,
		};

		const localContent = stringifyLocalProfiles(localProfiles, false);
		return [{
			baseResource: this.baseResource,
			baseContent: lastSyncProfiles ? this.stringifyRemoteProfiles(lastSyncProfiles) : null,
			localResource: this.localResource,
			localContent,
			remoteResource: this.remoteResource,
			remoteContent: remoteProfiles ? this.stringifyRemoteProfiles(remoteProfiles) : null,
			remoteProfiles,
			previewResource: this.previewResource,
			previewResult,
			localChange: previewResult.localChange,
			remoteChange: previewResult.remoteChange,
			acceptedResource: this.acceptedResource
		}];
	}

	protected async hasRemoteChanged(lastSyncUserData: IRemoteUserData): Promise<boolean> {
		const lastSyncProfiles: ISyncUserDataProfile[] | null = lastSyncUserData?.syncData ? parseUserDataProfilesManifest(lastSyncUserData.syncData) : null;
		const localProfiles = this.getLocalUserDataProfiles();
		const { remote } = merge(localProfiles, lastSyncProfiles, lastSyncProfiles, []);
		return !!remote?.added.length || !!remote?.removed.length || !!remote?.updated.length;
	}

	protected async getMergeResult(resourcePreview: IUserDataProfilesManifestResourcePreview, token: CancellationToken): Promise<IMergeResult> {
		return { ...resourcePreview.previewResult, hasConflicts: false };
	}

	protected async getAcceptResult(resourcePreview: IUserDataProfilesManifestResourcePreview, resource: URI, content: string | null | undefined, token: CancellationToken): Promise<IAcceptResult> {
		/* Accept local resource */
		if (this.extUri.isEqual(resource, this.localResource)) {
			return this.acceptLocal(resourcePreview);
		}

		/* Accept remote resource */
		if (this.extUri.isEqual(resource, this.remoteResource)) {
			return this.acceptRemote(resourcePreview);
		}

		/* Accept preview resource */
		if (this.extUri.isEqual(resource, this.previewResource)) {
			return resourcePreview.previewResult;
		}

		throw new Error(`Invalid Resource: ${resource.toString()}`);
	}

	private async acceptLocal(resourcePreview: IUserDataProfilesManifestResourcePreview): Promise<IUserDataProfileManifestResourceMergeResult> {
		const localProfiles = this.getLocalUserDataProfiles();
		const mergeResult = merge(localProfiles, null, null, []);
		const { local, remote } = mergeResult;
		return {
			content: resourcePreview.localContent,
			local,
			remote,
			localChange: local.added.length > 0 || local.removed.length > 0 || local.updated.length > 0 ? Change.Modified : Change.None,
			remoteChange: remote !== null ? Change.Modified : Change.None,
		};
	}

	private async acceptRemote(resourcePreview: IUserDataProfilesManifestResourcePreview): Promise<IUserDataProfileManifestResourceMergeResult> {
		const remoteProfiles: ISyncUserDataProfile[] = resourcePreview.remoteContent ? JSON.parse(resourcePreview.remoteContent) : null;
		const lastSyncProfiles: ISyncUserDataProfile[] = [];
		const localProfiles: IUserDataProfile[] = [];
		for (const profile of this.getLocalUserDataProfiles()) {
			const remoteProfile = remoteProfiles?.find(remoteProfile => remoteProfile.id === profile.id);
			if (remoteProfile) {
				lastSyncProfiles.push({ id: profile.id, name: profile.name, collection: remoteProfile.collection });
				localProfiles.push(profile);
			}
		}
		if (remoteProfiles !== null) {
			const mergeResult = merge(localProfiles, remoteProfiles, lastSyncProfiles, []);
			const { local, remote } = mergeResult;
			return {
				content: resourcePreview.remoteContent,
				local,
				remote,
				localChange: local.added.length > 0 || local.removed.length > 0 || local.updated.length > 0 ? Change.Modified : Change.None,
				remoteChange: remote !== null ? Change.Modified : Change.None,
			};
		} else {
			return {
				content: resourcePreview.remoteContent,
				local: { added: [], removed: [], updated: [] },
				remote: null,
				localChange: Change.None,
				remoteChange: Change.None,
			};
		}
	}

	protected async applyResult(remoteUserData: IRemoteUserData, lastSyncUserData: IRemoteUserData | null, resourcePreviews: [IUserDataProfilesManifestResourcePreview, IUserDataProfileManifestResourceMergeResult][], force: boolean): Promise<void> {
		const { local, remote, localChange, remoteChange } = resourcePreviews[0][1];
		if (localChange === Change.None && remoteChange === Change.None) {
			this.logService.info(`${this.syncResourceLogLabel}: No changes found during synchronizing profiles.`);
		}

		if (localChange !== Change.None) {
			await this.backupLocal(stringifyLocalProfiles(this.getLocalUserDataProfiles(), false));
			const promises: Promise<any>[] = [];
			for (const profile of local.added) {
				promises.push(this.userDataProfilesService.createProfile(profile.id, profile.name, { shortName: profile.shortName }));
			}
			for (const profile of local.removed) {
				promises.push(this.userDataProfilesService.removeProfile(profile));
			}
			for (const profile of local.updated) {
				const localProfile = this.userDataProfilesService.profiles.find(p => p.id === profile.id);
				if (localProfile) {
					promises.push(this.userDataProfilesService.updateProfile(localProfile, { name: profile.name, shortName: profile.shortName }));
				} else {
					this.logService.info(`${this.syncResourceLogLabel}: Could not find profile with id '${profile.id}' to update.`);
				}
			}
			await Promise.all(promises);
		}

		if (remoteChange !== Change.None) {
			const remoteProfiles = resourcePreviews[0][0].remoteProfiles || [];
			this.logService.trace(`${this.syncResourceLogLabel}: Updating remote profiles...`);
			for (const profile of remote?.added || []) {
				const collection = await this.userDataSyncStoreService.createCollection(this.syncHeaders);
				remoteProfiles.push({ id: profile.id, name: profile.name, collection, shortName: profile.shortName });
			}
			for (const profile of remote?.removed || []) {
				remoteProfiles.splice(remoteProfiles.findIndex(({ id }) => profile.id === id), 1);
			}
			for (const profile of remote?.updated || []) {
				const profileToBeUpdated = remoteProfiles.find(({ id }) => profile.id === id);
				if (profileToBeUpdated) {
					remoteProfiles.splice(remoteProfiles.indexOf(profileToBeUpdated), 1, { id: profile.id, name: profile.name, collection: profileToBeUpdated.collection, shortName: profile.shortName });
				}
			}
			remoteUserData = await this.updateRemoteUserData(this.stringifyRemoteProfiles(remoteProfiles), force ? null : remoteUserData.ref);
			this.logService.info(`${this.syncResourceLogLabel}: Updated remote profiles.${remote?.added.length ? ` Added: ${JSON.stringify(remote.added.map(e => e.name))}.` : ''}${remote?.updated.length ? ` Updated: ${JSON.stringify(remote.updated.map(e => e.name))}.` : ''}${remote?.removed.length ? ` Removed: ${JSON.stringify(remote.removed.map(e => e.name))}.` : ''}`);

			for (const profile of remote?.removed || []) {
				await this.userDataSyncStoreService.deleteCollection(profile.collection, this.syncHeaders);
			}
		}

		if (lastSyncUserData?.ref !== remoteUserData.ref) {
			// update last sync
			this.logService.trace(`${this.syncResourceLogLabel}: Updating last synchronized profiles...`);
			await this.updateLastSyncUserData(remoteUserData);
			this.logService.info(`${this.syncResourceLogLabel}: Updated last synchronized profiles.`);
		}
	}

	async hasLocalData(): Promise<boolean> {
		return this.getLocalUserDataProfiles().length > 0;
	}

	async resolveContent(uri: URI): Promise<string | null> {
		if (this.extUri.isEqual(this.remoteResource, uri)
			|| this.extUri.isEqual(this.baseResource, uri)
			|| this.extUri.isEqual(this.localResource, uri)
			|| this.extUri.isEqual(this.acceptedResource, uri)
		) {
			const content = await this.resolvePreviewContent(uri);
			return content ? toFormattedString(JSON.parse(content), {}) : content;
		}
		return null;
	}

	private getLocalUserDataProfiles(): IUserDataProfile[] {
		return this.userDataProfilesService.profiles.filter(p => !p.isDefault && !p.isTransient);
	}

	private stringifyRemoteProfiles(profiles: ISyncUserDataProfile[]): string {
		return JSON.stringify([...profiles].sort((a, b) => a.name.localeCompare(b.name)));
	}

}

export function stringifyLocalProfiles(profiles: IUserDataProfile[], format: boolean): string {
	const result = [...profiles].sort((a, b) => a.name.localeCompare(b.name)).map(p => ({ id: p.id, name: p.name }));
	return format ? toFormattedString(result, {}) : JSON.stringify(result);
}

export function parseUserDataProfilesManifest(syncData: ISyncData): ISyncUserDataProfile[] {
	return JSON.parse(syncData.content);
}


