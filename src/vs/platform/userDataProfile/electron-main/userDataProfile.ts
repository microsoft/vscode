/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { INodeProcess } from '../../../base/common/platform.js';
import { joinPath } from '../../../base/common/resources.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { IFileService } from '../../files/common/files.js';
import { refineServiceDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';
import { IUserDataProfilesService, WillCreateProfileEvent, WillRemoveProfileEvent, IUserDataProfile } from '../common/userDataProfile.js';
import { UserDataProfilesService } from '../node/userDataProfile.js';
import { IAnyWorkspaceIdentifier, IEmptyWorkspaceIdentifier } from '../../workspace/common/workspace.js';
import { IStateService } from '../../state/node/state.js';

export const IUserDataProfilesMainService = refineServiceDecorator<IUserDataProfilesService, IUserDataProfilesMainService>(IUserDataProfilesService);
export interface IUserDataProfilesMainService extends IUserDataProfilesService {
	getProfileForWorkspace(workspaceIdentifier: IAnyWorkspaceIdentifier): IUserDataProfile | undefined;
	unsetWorkspace(workspaceIdentifier: IAnyWorkspaceIdentifier, transient?: boolean): void;
	getAssociatedEmptyWindows(): IEmptyWorkspaceIdentifier[];
	readonly onWillCreateProfile: Event<WillCreateProfileEvent>;
	readonly onWillRemoveProfile: Event<WillRemoveProfileEvent>;
}

export class UserDataProfilesMainService extends UserDataProfilesService implements IUserDataProfilesMainService {

	constructor(
		@IStateService stateService: IStateService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@INativeEnvironmentService environmentService: INativeEnvironmentService,
		@IFileService fileService: IFileService,
		@ILogService logService: ILogService,
	) {
		super(stateService, uriIdentityService, environmentService, fileService, logService);
	}

	protected override createDefaultProfile(): IUserDataProfile {
		const defaultProfile = super.createDefaultProfile();
		if (!(process as INodeProcess).isEmbeddedApp) {
			return defaultProfile;
		}
		const hostUserRoamingDataHome = this.environmentService.hostUserRoamingDataHome;
		if (!hostUserRoamingDataHome) {
			return defaultProfile;
		}
		return {
			...defaultProfile,
			keybindingsResource: joinPath(hostUserRoamingDataHome, 'keybindings.json'),
			promptsHome: joinPath(hostUserRoamingDataHome, 'prompts'),
			mcpResource: joinPath(hostUserRoamingDataHome, 'mcp.json'),
		};
	}

	getAssociatedEmptyWindows(): IEmptyWorkspaceIdentifier[] {
		const emptyWindows: IEmptyWorkspaceIdentifier[] = [];
		for (const id of this.profilesObject.emptyWindows.keys()) {
			emptyWindows.push({ id });
		}
		return emptyWindows;
	}

}
