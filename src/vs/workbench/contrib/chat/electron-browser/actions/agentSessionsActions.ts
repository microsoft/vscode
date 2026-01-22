/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { URI } from '../../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2 } from '../../../../../platform/actions/common/actions.js';
import { INativeEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IUserDataProfilesService, IUserDataProfileTemplate } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { IUserDataProfileImportExportService, IUserDataProfileManagementService } from '../../../../services/userDataProfile/common/userDataProfile.js';

export class OpenAgentSessionsWindowAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.openAgentSessionsWindow',
			title: localize2('openAgentSessionsWindow', "Open Agent Sessions Window"),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor) {
		const uriIdenitityService = accessor.get(IUriIdentityService);
		const environmentService = accessor.get(INativeEnvironmentService);
		const nativeHostService = accessor.get(INativeHostService);
		const userDataProfilesService = accessor.get(IUserDataProfilesService);
		const userDataProfileManagementService = accessor.get(IUserDataProfileManagementService);
		const userDataProfilesImportExportService = accessor.get(IUserDataProfileImportExportService);
		const fileService = accessor.get(IFileService);

		// Create workspace file if it doesn't exist
		const workspaceUri = environmentService.agentSessionsWorkspace;
		const workspaceExists = await fileService.exists(workspaceUri);
		if (!workspaceExists) {
			const emptyWorkspaceContent = JSON.stringify({ folders: [] }, null, '\t');
			await fileService.writeFile(workspaceUri, VSBuffer.fromString(emptyWorkspaceContent));
		}

		const profileTemplates = await userDataProfileManagementService.getSystemProfileTemplates();
		let templateResource: URI | undefined;
		let template: IUserDataProfileTemplate | undefined;
		for (const [resource, value] of profileTemplates) {
			if (uriIdenitityService.extUri.basename(resource) === 'agent-sessions.code-profile') {
				templateResource = resource;
				template = value;
				break;
			}
		}

		if (!templateResource || !template) {
			throw new Error('Unable to find Agent Sessions profile template');
		}

		const profile = userDataProfilesService.profiles.find(p => uriIdenitityService.extUri.isEqual(p.templateData?.resource, templateResource));
		if (profile) {
			await userDataProfileManagementService.updateProfile(profile, { workspaces: [workspaceUri] });
		} else {
			await userDataProfilesImportExportService.createProfileFromTemplate(template, {
				name: localize('agentSessionsProfileName', "Agent Sessions"),
				workspaces: [workspaceUri],
				templateOptions: {
					template: templateResource,
					storeSettingsAsDefault: true,
				},
				useDefaultFlags: { keybindings: true },
				icon: template.icon
			}, CancellationToken.None);
		}

		await nativeHostService.openWindow([{ workspaceUri }], { forceNewWindow: true });
	}
}
