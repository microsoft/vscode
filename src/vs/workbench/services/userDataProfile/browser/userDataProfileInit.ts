/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Barrier, Promises } from '../../../../base/common/async.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IUserDataInitializer } from '../../userData/browser/userDataInit.js';
import { IProfileResourceInitializer, IUserDataProfileService, IUserDataProfileTemplate } from '../common/userDataProfile.js';
import { SettingsResourceInitializer } from './settingsResource.js';
import { GlobalStateResourceInitializer } from './globalStateResource.js';
import { KeybindingsResourceInitializer } from './keybindingsResource.js';
import { TasksResourceInitializer } from './tasksResource.js';
import { SnippetsResourceInitializer } from './snippetsResource.js';
import { McpResourceInitializer } from './mcpProfileResource.js';
import { ExtensionsResourceInitializer } from './extensionsResource.js';
import { IBrowserWorkbenchEnvironmentService } from '../../environment/browser/environmentService.js';
import { isString } from '../../../../base/common/types.js';
import { IRequestService, asJson } from '../../../../platform/request/common/request.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { ProfileResourceType } from '../../../../platform/userDataProfile/common/userDataProfile.js';

export class UserDataProfileInitializer implements IUserDataInitializer {

	_serviceBrand: undefined;

	private readonly initialized: ProfileResourceType[] = [];
	private readonly initializationFinished = new Barrier();

	constructor(
		@IBrowserWorkbenchEnvironmentService private readonly environmentService: IBrowserWorkbenchEnvironmentService,
		@IFileService private readonly fileService: IFileService,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IRequestService private readonly requestService: IRequestService,
	) {
	}

	async whenInitializationFinished(): Promise<void> {
		await this.initializationFinished.wait();
	}

	async requiresInitialization(): Promise<boolean> {
		if (!this.environmentService.options?.profile?.contents) {
			return false;
		}
		if (!this.storageService.isNew(StorageScope.PROFILE)) {
			return false;
		}
		return true;
	}

	async initializeRequiredResources(): Promise<void> {
		this.logService.trace(`UserDataProfileInitializer#initializeRequiredResources`);
		const promises = [];
		const profileTemplate = await this.getProfileTemplate();
		if (profileTemplate?.settings) {
			promises.push(this.initialize(new SettingsResourceInitializer(this.userDataProfileService, this.fileService, this.logService), profileTemplate.settings, ProfileResourceType.Settings));
		}
		if (profileTemplate?.globalState) {
			promises.push(this.initialize(new GlobalStateResourceInitializer(this.storageService), profileTemplate.globalState, ProfileResourceType.GlobalState));
		}
		await Promise.all(promises);
	}

	async initializeOtherResources(instantiationService: IInstantiationService): Promise<void> {
		try {
			this.logService.trace(`UserDataProfileInitializer#initializeOtherResources`);
			const promises = [];
			const profileTemplate = await this.getProfileTemplate();
			if (profileTemplate?.keybindings) {
				promises.push(this.initialize(new KeybindingsResourceInitializer(this.userDataProfileService, this.fileService, this.logService), profileTemplate.keybindings, ProfileResourceType.Keybindings));
			}
			if (profileTemplate?.tasks) {
				promises.push(this.initialize(new TasksResourceInitializer(this.userDataProfileService, this.fileService, this.logService), profileTemplate.tasks, ProfileResourceType.Tasks));
			}
			if (profileTemplate?.mcp) {
				promises.push(this.initialize(new McpResourceInitializer(this.userDataProfileService, this.fileService, this.logService), profileTemplate.mcp, ProfileResourceType.Mcp));
			}
			if (profileTemplate?.snippets) {
				promises.push(this.initialize(new SnippetsResourceInitializer(this.userDataProfileService, this.fileService, this.uriIdentityService), profileTemplate.snippets, ProfileResourceType.Snippets));
			}
			promises.push(this.initializeInstalledExtensions(instantiationService));
			await Promises.settled(promises);
		} finally {
			this.initializationFinished.open();
		}
	}

	private initializeInstalledExtensionsPromise: Promise<void> | undefined;
	async initializeInstalledExtensions(instantiationService: IInstantiationService): Promise<void> {
		if (!this.initializeInstalledExtensionsPromise) {
			const profileTemplate = await this.getProfileTemplate();
			if (profileTemplate?.extensions) {
				this.initializeInstalledExtensionsPromise = this.initialize(instantiationService.createInstance(ExtensionsResourceInitializer), profileTemplate.extensions, ProfileResourceType.Extensions);
			} else {
				this.initializeInstalledExtensionsPromise = Promise.resolve();
			}

		}
		return this.initializeInstalledExtensionsPromise;
	}

	private profileTemplatePromise: Promise<IUserDataProfileTemplate | null> | undefined;
	private getProfileTemplate(): Promise<IUserDataProfileTemplate | null> {
		if (!this.profileTemplatePromise) {
			this.profileTemplatePromise = this.doGetProfileTemplate();
		}
		return this.profileTemplatePromise;
	}

	private async doGetProfileTemplate(): Promise<IUserDataProfileTemplate | null> {
		if (!this.environmentService.options?.profile?.contents) {
			return null;
		}
		if (isString(this.environmentService.options.profile.contents)) {
			try {
				return JSON.parse(this.environmentService.options.profile.contents);
			} catch (error) {
				this.logService.error(error);
				return null;
			}
		}
		try {
			const url = URI.revive(this.environmentService.options.profile.contents).toString(true);
			const context = await this.requestService.request({ type: 'GET', url }, CancellationToken.None);
			if (context.res.statusCode === 200) {
				return await asJson(context);
			} else {
				this.logService.warn(`UserDataProfileInitializer: Failed to get profile from URL: ${url}. Status code: ${context.res.statusCode}.`);
			}
		} catch (error) {
			this.logService.error(error);
		}
		return null;
	}

	private async initialize(initializer: IProfileResourceInitializer, content: string, profileResource: ProfileResourceType): Promise<void> {
		try {
			if (this.initialized.includes(profileResource)) {
				this.logService.info(`UserDataProfileInitializer: ${profileResource} initialized already.`);
				return;
			}
			this.initialized.push(profileResource);
			this.logService.trace(`UserDataProfileInitializer: Initializing ${profileResource}`);
			await initializer.initialize(content);
			this.logService.info(`UserDataProfileInitializer: Initialized ${profileResource}`);
		} catch (error) {
			this.logService.info(`UserDataProfileInitializer: Error while initializing ${profileResource}`);
			this.logService.error(error);
		}
	}

}
