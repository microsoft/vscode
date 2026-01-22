/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parse } from '../../../../base/common/jsonc.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IRequestService } from '../../../../platform/request/common/request.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { ISystemProfileTemplate, IUserDataProfilesService, IUserDataProfileTemplate } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { INativeWorkbenchEnvironmentService } from '../../environment/electron-browser/environmentService.js';
import { IExtensionService } from '../../extensions/common/extensions.js';
import { IHostService } from '../../host/browser/host.js';
import { UserDataProfileManagementService } from '../browser/userDataProfileManagement.js';
import { IUserDataProfileManagementService, IUserDataProfileService } from '../common/userDataProfile.js';

export class NativeUserDataProfileManagementService extends UserDataProfileManagementService implements IUserDataProfileManagementService {

	constructor(
		@INativeWorkbenchEnvironmentService private readonly nativeEnvironmentService: INativeWorkbenchEnvironmentService,
		@IFileService private readonly fileService: IFileService,
		@IUserDataProfilesService userDataProfilesService: IUserDataProfilesService,
		@IUserDataProfileService userDataProfileService: IUserDataProfileService,
		@IHostService hostService: IHostService,
		@IDialogService dialogService: IDialogService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
		@IExtensionService extensionService: IExtensionService,
		@IProductService productService: IProductService,
		@IRequestService requestService: IRequestService,
		@IConfigurationService configurationService: IConfigurationService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@ILogService logService: ILogService,
	) {
		super(userDataProfilesService, userDataProfileService, hostService, dialogService, workspaceContextService, extensionService, nativeEnvironmentService, productService, requestService, configurationService, uriIdentityService, logService);
	}

	private systemPrfilesTemplatesPromise: Promise<ResourceMap<IUserDataProfileTemplate>> | undefined;
	override async getSystemProfileTemplates(): Promise<ResourceMap<IUserDataProfileTemplate>> {
		if (!this.systemPrfilesTemplatesPromise) {
			this.systemPrfilesTemplatesPromise = this.doGetBuiltinProfileTemplates();
		}
		return this.systemPrfilesTemplatesPromise;
	}

	private async doGetBuiltinProfileTemplates(): Promise<ResourceMap<IUserDataProfileTemplate>> {
		const result: ResourceMap<IUserDataProfileTemplate> = new ResourceMap();
		const profilesFolder = joinPath(URI.file(this.nativeEnvironmentService.appRoot), 'profiles');
		try {
			const stat = await this.fileService.resolve(profilesFolder);
			if (!stat.children?.length) {
				return result;
			}
			for (const child of stat.children) {
				if (child.isDirectory) {
					continue;
				}
				if (this.uriIdentityService.extUri.extname(child.resource) !== '.json') {
					continue;
				}
				try {
					const content = (await this.fileService.readFile(child.resource)).value.toString();
					const profile: ISystemProfileTemplate = parse(content);
					result.set(child.resource, {
						id: profile.id,
						name: profile.name,
						icon: profile.icon,
						settings: profile.settings ? JSON.stringify({ settings: JSON.stringify(profile.settings) }) : undefined,
						globalState: profile.globalState ? JSON.stringify({ storage: profile.globalState }) : undefined,
					});
				} catch (error) {
					this.logService.error(`Error while reading system profile template from ${child.resource.toString()}`, error);
				}
			}
		} catch (error) {
			this.logService.error(`Error while reading system profile templates from ${profilesFolder.toString()}`, error);
		}
		return result;
	}

}

