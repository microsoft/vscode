/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BroadcastDataChannel } from 'vs/base/browser/broadcast';
import { revive } from 'vs/base/common/marshalling';
import { UriDto } from 'vs/base/common/types';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { ILogService } from 'vs/platform/log/common/log';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { DidChangeProfilesEvent, IUserDataProfile, IUserDataProfilesService, PROFILES_ENABLEMENT_CONFIG, reviveProfile, StoredProfileAssociations, StoredUserDataProfile, UserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';

type BroadcastedProfileChanges = UriDto<Omit<DidChangeProfilesEvent, 'all'>>;

export class BrowserUserDataProfilesService extends UserDataProfilesService implements IUserDataProfilesService {

	protected override readonly defaultProfileShouldIncludeExtensionsResourceAlways: boolean = true;
	private readonly changesBroadcastChannel: BroadcastDataChannel<BroadcastedProfileChanges>;

	constructor(
		@IEnvironmentService environmentService: IEnvironmentService,
		@IFileService fileService: IFileService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@ILogService logService: ILogService,
	) {
		super(environmentService, fileService, uriIdentityService, logService);
		super.setEnablement(window.localStorage.getItem(PROFILES_ENABLEMENT_CONFIG) === 'true');
		this.changesBroadcastChannel = this._register(new BroadcastDataChannel<BroadcastedProfileChanges>(`${UserDataProfilesService.PROFILES_KEY}.changes`));
		this._register(this.changesBroadcastChannel.onDidReceiveData(changes => {
			try {
				this._profilesObject = undefined;
				this._onDidChangeProfiles.fire({ added: changes.added.map(p => reviveProfile(p, this.profilesHome.scheme)), removed: changes.removed.map(p => reviveProfile(p, this.profilesHome.scheme)), all: this.profiles });
			} catch (error) {/* ignore */ }
		}));
	}

	override setEnablement(enabled: boolean): void {
		super.setEnablement(enabled);
		window.localStorage.setItem(PROFILES_ENABLEMENT_CONFIG, enabled ? 'true' : 'false');
	}

	protected override getStoredProfiles(): StoredUserDataProfile[] {
		try {
			const value = window.localStorage.getItem(UserDataProfilesService.PROFILES_KEY);
			if (value) {
				return revive(JSON.parse(value));
			}
		} catch (error) {
			/* ignore */
			this.logService.error(error);
		}
		return [];
	}

	protected override triggerProfilesChanges(added: IUserDataProfile[], removed: IUserDataProfile[]) {
		super.triggerProfilesChanges(added, removed);
		this.changesBroadcastChannel.postData({ added, removed });
	}

	protected override saveStoredProfiles(storedProfiles: StoredUserDataProfile[]): void {
		window.localStorage.setItem(UserDataProfilesService.PROFILES_KEY, JSON.stringify(storedProfiles));
	}

	protected override getStoredProfileAssociations(): StoredProfileAssociations {
		try {
			const value = window.localStorage.getItem(UserDataProfilesService.PROFILE_ASSOCIATIONS_KEY);
			if (value) {
				return revive(JSON.parse(value));
			}
		} catch (error) {
			/* ignore */
			this.logService.error(error);
		}
		return {};
	}

	protected override saveStoredProfileAssociations(storedProfileAssociations: StoredProfileAssociations): void {
		window.localStorage.setItem(UserDataProfilesService.PROFILE_ASSOCIATIONS_KEY, JSON.stringify(storedProfileAssociations));
	}

}
