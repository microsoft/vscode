/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Promises } from 'vs/base/common/async';
import { VSBuffer } from 'vs/base/common/buffer';
import { toLocalISOString } from 'vs/base/common/date';
import { Disposable } from 'vs/base/common/lifecycle';
import { joinPath } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { FileOperationResult, IFileService, IFileStat, toFileOperationResult } from 'vs/platform/files/common/files';
import { IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { ALL_SYNC_RESOURCES, IResourceRefHandle, IUserDataSyncLocalStoreService, IUserDataSyncLogService, SyncResource } from 'vs/platform/userDataSync/common/userDataSync';

export class UserDataSyncLocalStoreService extends Disposable implements IUserDataSyncLocalStoreService {

	_serviceBrand: any;

	constructor(
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IFileService private readonly fileService: IFileService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IUserDataSyncLogService private readonly logService: IUserDataSyncLogService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
	) {
		super();
		this.cleanUp();
	}

	private async cleanUp(): Promise<void> {
		for (const profile of this.userDataProfilesService.profiles) {
			for (const resource of ALL_SYNC_RESOURCES) {
				try {
					await this.cleanUpBackup(this.getResourceBackupHome(resource, profile.isDefault ? undefined : profile.id));
				} catch (error) {
					this.logService.error(error);
				}
			}
		}

		let stat: IFileStat;
		try {
			stat = await this.fileService.resolve(this.environmentService.userDataSyncHome);
		} catch (error) {
			if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
				this.logService.error(error);
			}
			return;
		}

		if (stat.children) {
			for (const child of stat.children) {
				if (child.isDirectory && !ALL_SYNC_RESOURCES.includes(<SyncResource>child.name) && !this.userDataProfilesService.profiles.some(profile => profile.id === child.name)) {
					try {
						this.logService.info('Deleting non existing profile from backup', child.resource.path);
						await this.fileService.del(child.resource, { recursive: true });
					} catch (error) {
						this.logService.error(error);
					}
				}
			}
		}
	}

	async getAllResourceRefs(resource: SyncResource, collection?: string, root?: URI): Promise<IResourceRefHandle[]> {
		const folder = this.getResourceBackupHome(resource, collection, root);
		try {
			const stat = await this.fileService.resolve(folder);
			if (stat.children) {
				const all = stat.children.filter(stat => stat.isFile && !stat.name.startsWith('lastSync')).sort().reverse();
				return all.map(stat => ({
					ref: stat.name,
					created: this.getCreationTime(stat)
				}));
			}
		} catch (error) {
			if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
				throw error;
			}
		}
		return [];
	}

	async resolveResourceContent(resourceKey: SyncResource, ref: string, collection?: string, root?: URI): Promise<string | null> {
		const folder = this.getResourceBackupHome(resourceKey, collection, root);
		const file = joinPath(folder, ref);
		try {
			const content = await this.fileService.readFile(file);
			return content.value.toString();
		} catch (error) {
			this.logService.error(error);
			return null;
		}
	}

	async writeResource(resourceKey: SyncResource, content: string, cTime: Date, collection?: string, root?: URI): Promise<void> {
		const folder = this.getResourceBackupHome(resourceKey, collection, root);
		const resource = joinPath(folder, `${toLocalISOString(cTime).replace(/-|:|\.\d+Z$/g, '')}.json`);
		try {
			await this.fileService.writeFile(resource, VSBuffer.fromString(content));
		} catch (e) {
			this.logService.error(e);
		}
	}

	private getResourceBackupHome(resource: SyncResource, collection?: string, root: URI = this.environmentService.userDataSyncHome): URI {
		return joinPath(root, ...(collection ? [collection, resource] : [resource]));
	}

	private async cleanUpBackup(folder: URI): Promise<void> {
		try {
			try {
				if (!(await this.fileService.exists(folder))) {
					return;
				}
			} catch (e) {
				return;
			}
			const stat = await this.fileService.resolve(folder);
			if (stat.children) {
				const all = stat.children.filter(stat => stat.isFile && /^\d{8}T\d{6}(\.json)?$/.test(stat.name)).sort();
				const backUpMaxAge = 1000 * 60 * 60 * 24 * (this.configurationService.getValue<number>('sync.localBackupDuration') || 30 /* Default 30 days */);
				let toDelete = all.filter(stat => Date.now() - this.getCreationTime(stat) > backUpMaxAge);
				const remaining = all.length - toDelete.length;
				if (remaining < 10) {
					toDelete = toDelete.slice(10 - remaining);
				}
				await Promises.settled(toDelete.map(async stat => {
					this.logService.info('Deleting from backup', stat.resource.path);
					await this.fileService.del(stat.resource);
				}));
			}
		} catch (e) {
			this.logService.error(e);
		}
	}

	private getCreationTime(stat: IFileStat) {
		return new Date(
			parseInt(stat.name.substring(0, 4)),
			parseInt(stat.name.substring(4, 6)) - 1,
			parseInt(stat.name.substring(6, 8)),
			parseInt(stat.name.substring(9, 11)),
			parseInt(stat.name.substring(11, 13)),
			parseInt(stat.name.substring(13, 15))
		).getTime();
	}
}
