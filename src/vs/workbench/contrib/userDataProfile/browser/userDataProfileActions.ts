/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from 'vs/nls';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { IUserDataProfileManagementService, PROFILES_CATEGORY, PROFILES_ENABLEMENT_CONTEXT } from 'vs/workbench/services/userDataProfile/common/userDataProfile';

class CreateTransientProfileAction extends Action2 {
	static readonly ID = 'workbench.profiles.actions.createTemporaryProfile';
	static readonly TITLE = localize2('create temporary profile', "Create a Temporary Profile");
	constructor() {
		super({
			id: CreateTransientProfileAction.ID,
			title: CreateTransientProfileAction.TITLE,
			category: PROFILES_CATEGORY,
			f1: true,
			precondition: PROFILES_ENABLEMENT_CONTEXT,
		});
	}

	async run(accessor: ServicesAccessor) {
		return accessor.get(IUserDataProfileManagementService).createAndEnterTransientProfile();
	}
}

registerAction2(CreateTransientProfileAction);

// Developer Actions

registerAction2(class CleanupProfilesAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.profiles.actions.cleanupProfiles',
			title: localize2('cleanup profile', "Cleanup Profiles"),
			category: Categories.Developer,
			f1: true,
			precondition: PROFILES_ENABLEMENT_CONTEXT,
		});
	}

	async run(accessor: ServicesAccessor) {
		return accessor.get(IUserDataProfilesService).cleanUp();
	}
});

registerAction2(class ResetWorkspacesAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.profiles.actions.resetWorkspaces',
			title: localize2('reset workspaces', "Reset Workspace Profiles Associations"),
			category: Categories.Developer,
			f1: true,
			precondition: PROFILES_ENABLEMENT_CONTEXT,
		});
	}

	async run(accessor: ServicesAccessor) {
		const userDataProfilesService = accessor.get(IUserDataProfilesService);
		return userDataProfilesService.resetWorkspaces();
	}
});
