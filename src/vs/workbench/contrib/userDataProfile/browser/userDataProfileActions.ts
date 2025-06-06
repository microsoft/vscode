/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { PROFILES_CATEGORY } from '../../../services/userDataProfile/common/userDataProfile.js';

class CreateTransientProfileAction extends Action2 {
	static readonly ID = 'workbench.profiles.actions.createTemporaryProfile';
	static readonly TITLE = localize2('create temporary profile', "New Window with Temporary Profile");
	constructor() {
		super({
			id: CreateTransientProfileAction.ID,
			title: CreateTransientProfileAction.TITLE,
			category: PROFILES_CATEGORY,
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor) {
		accessor.get(IHostService).openWindow({ forceTempProfile: true });
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
		});
	}

	async run(accessor: ServicesAccessor) {
		const userDataProfilesService = accessor.get(IUserDataProfilesService);
		return userDataProfilesService.resetWorkspaces();
	}
});
