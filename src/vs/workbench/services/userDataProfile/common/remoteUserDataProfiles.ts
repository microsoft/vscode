/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { DidChangeProfilesEvent, IUserDataProfile, IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { IRemoteAgentService } from '../../remote/common/remoteAgentService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IStringDictionary } from '../../../../base/common/collections.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IUserDataProfileService } from './userDataProfile.js';
import { distinct } from '../../../../base/common/arrays.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { UserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfileIpc.js';

const associatedRemoteProfilesKey = 'associatedRemoteProfiles';

export const IRemoteUserDataProfilesService = createDecorator<IRemoteUserDataProfilesService>('IRemoteUserDataProfilesService');
export interface IRemoteUserDataProfilesService {
	readonly _serviceBrand: undefined;
	getRemoteProfiles(): Promise<readonly IUserDataProfile[]>;
	getRemoteProfile(localProfile: IUserDataProfile): Promise<IUserDataProfile>;
}

class RemoteUserDataProfilesService extends Disposable implements IRemoteUserDataProfilesService {

	readonly _serviceBrand: undefined;

	private readonly initPromise: Promise<void>;

	private remoteUserDataProfilesService: IUserDataProfilesService | undefined;

	constructor(
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IRemoteAgentService private readonly remoteAgentService: IRemoteAgentService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.initPromise = this.init();
	}

	private async init(): Promise<void> {
		const connection = this.remoteAgentService.getConnection();
		if (!connection) {
			return;
		}

		const environment = await this.remoteAgentService.getEnvironment();
		if (!environment) {
			return;
		}

		this.remoteUserDataProfilesService = new UserDataProfilesService(environment.profiles.all, environment.profiles.home, connection.getChannel('userDataProfiles'));
		this._register(this.userDataProfilesService.onDidChangeProfiles(e => this.onDidChangeLocalProfiles(e)));

		// Associate current local profile with remote profile
		const remoteProfile = await this.getAssociatedRemoteProfile(this.userDataProfileService.currentProfile, this.remoteUserDataProfilesService);
		if (!remoteProfile.isDefault) {
			this.setAssociatedRemoteProfiles([...this.getAssociatedRemoteProfiles(), remoteProfile.id]);
		}

		this.cleanUp();
	}

	private async onDidChangeLocalProfiles(e: DidChangeProfilesEvent): Promise<void> {
		for (const profile of e.removed) {
			const remoteProfile = this.remoteUserDataProfilesService?.profiles.find(p => p.id === profile.id);
			if (remoteProfile) {
				await this.remoteUserDataProfilesService?.removeProfile(remoteProfile);
			}
		}
	}

	async getRemoteProfiles(): Promise<readonly IUserDataProfile[]> {
		await this.initPromise;

		if (!this.remoteUserDataProfilesService) {
			throw new Error('Remote profiles service not available in the current window');
		}

		return this.remoteUserDataProfilesService.profiles;
	}

	async getRemoteProfile(localProfile: IUserDataProfile): Promise<IUserDataProfile> {
		await this.initPromise;

		if (!this.remoteUserDataProfilesService) {
			throw new Error('Remote profiles service not available in the current window');
		}

		return this.getAssociatedRemoteProfile(localProfile, this.remoteUserDataProfilesService);
	}

	private async getAssociatedRemoteProfile(localProfile: IUserDataProfile, remoteUserDataProfilesService: IUserDataProfilesService): Promise<IUserDataProfile> {
		// If the local profile is the default profile, return the remote default profile
		if (localProfile.isDefault) {
			return remoteUserDataProfilesService.defaultProfile;
		}

		let profile = remoteUserDataProfilesService.profiles.find(p => p.id === localProfile.id);
		if (!profile) {
			profile = await remoteUserDataProfilesService.createProfile(localProfile.id, localProfile.name, {
				shortName: localProfile.shortName,
				transient: localProfile.isTransient,
				useDefaultFlags: localProfile.useDefaultFlags,
			});
			this.setAssociatedRemoteProfiles([...this.getAssociatedRemoteProfiles(), this.userDataProfileService.currentProfile.id]);
		}
		return profile;
	}

	private getAssociatedRemoteProfiles(): string[] {
		if (this.environmentService.remoteAuthority) {
			const remotes = this.parseAssociatedRemoteProfiles();
			return remotes[this.environmentService.remoteAuthority] ?? [];
		}
		return [];
	}

	private setAssociatedRemoteProfiles(profiles: string[]): void {
		if (this.environmentService.remoteAuthority) {
			const remotes = this.parseAssociatedRemoteProfiles();
			profiles = distinct(profiles);
			if (profiles.length) {
				remotes[this.environmentService.remoteAuthority] = profiles;
			} else {
				delete remotes[this.environmentService.remoteAuthority];
			}
			if (Object.keys(remotes).length) {
				this.storageService.store(associatedRemoteProfilesKey, JSON.stringify(remotes), StorageScope.APPLICATION, StorageTarget.MACHINE);
			} else {
				this.storageService.remove(associatedRemoteProfilesKey, StorageScope.APPLICATION);
			}
		}
	}

	private parseAssociatedRemoteProfiles(): IStringDictionary<string[]> {
		if (this.environmentService.remoteAuthority) {
			const value = this.storageService.get(associatedRemoteProfilesKey, StorageScope.APPLICATION);
			try {
				return value ? JSON.parse(value) : {};
			} catch (error) {
				this.logService.error(error);
			}
		}
		return {};
	}

	private async cleanUp(): Promise<void> {
		const associatedRemoteProfiles: string[] = [];
		for (const profileId of this.getAssociatedRemoteProfiles()) {
			const remoteProfile = this.remoteUserDataProfilesService?.profiles.find(p => p.id === profileId);
			if (!remoteProfile) {
				continue;
			}
			const localProfile = this.userDataProfilesService.profiles.find(p => p.id === profileId);
			if (localProfile) {
				if (localProfile.name !== remoteProfile.name || localProfile.shortName !== remoteProfile.shortName) {
					await this.remoteUserDataProfilesService?.updateProfile(remoteProfile, { name: localProfile.name, shortName: localProfile.shortName });
				}
				associatedRemoteProfiles.push(profileId);
				continue;
			}
			if (remoteProfile) {
				// Cleanup remote profiles those are not available locally
				await this.remoteUserDataProfilesService?.removeProfile(remoteProfile);
			}
		}
		this.setAssociatedRemoteProfiles(associatedRemoteProfiles);
	}

}

registerSingleton(IRemoteUserDataProfilesService, RemoteUserDataProfilesService, InstantiationType.Delayed);
