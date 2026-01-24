/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, IDisposable } from '../../../base/common/lifecycle.js';
import { IFileService } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { IUserDataProfile, IUserDataProfilesService, IUserDataProfileUpdateOptions } from './userDataProfile.js';
import { isEmptyObject, Mutable } from '../../../base/common/types.js';
import { equals } from '../../../base/common/objects.js';

export class UserDataProfileTemplatesWatcher extends Disposable {

	private readonly templateWatchers = this._register(new DisposableMap<string, IDisposable>());

	constructor(
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		// Watch template files for existing profiles
		for (const profile of this.userDataProfilesService.profiles) {
			this.watchProfileTemplate(profile);
		}

		// Listen for profile changes to update watchers
		this._register(this.userDataProfilesService.onDidChangeProfiles(e => {
			// Stop watching removed profiles
			for (const profile of e.removed) {
				this.unwatchProfileTemplate(profile);
			}

			// Start watching added profiles
			for (const profile of e.added) {
				this.watchProfileTemplate(profile);
			}

			// Update watchers for updated profiles (templateResource might have changed)
			for (const profile of e.updated) {
				this.unwatchProfileTemplate(profile);
				this.watchProfileTemplate(profile);
			}
		}));
	}

	private async watchProfileTemplate(profile: IUserDataProfile): Promise<void> {
		const templateResource = profile.templateResource;

		if (!templateResource) {
			return;
		}

		try {
			await this.onDidChangeProfileTemplate(profile); // Apply any changes on startup
		} catch (error) {
			this.logService.error(`UserDataProfileTemplateService: Failed to apply template changes on startup for profile '${profile.name}'`, error);
		}

		this.logService.trace(`UserDataProfileTemplateService: Watching template file for profile '${profile.name}'`, templateResource.toString());
		const watcher = this.fileService.createWatcher(templateResource, { recursive: false, excludes: [] });
		const disposable = watcher.onDidChange(async () => {
			this.logService.trace(`UserDataProfileTemplateService: Template file changed for profile '${profile.name}'`, templateResource.toString());
			// Get the latest profile in case it was updated
			const currentProfile = this.userDataProfilesService.profiles.find(p => p.id === profile.id);
			if (currentProfile) {
				try {
					await this.onDidChangeProfileTemplate(currentProfile);
				} catch (error) {
					this.logService.error(`UserDataProfileTemplateService: Failed to apply template changes when template file changed for profile '${profile.name}'`, error);
				}
			}
		});

		this.templateWatchers.set(profile.id, {
			dispose: () => {
				disposable.dispose();
				watcher.dispose();
			}
		});
	}

	private unwatchProfileTemplate(profile: IUserDataProfile): void {
		this.templateWatchers.deleteAndDispose(profile.id);
	}

	private async onDidChangeProfileTemplate(profile: IUserDataProfile): Promise<void> {
		if (!profile.templateResource) {
			return;
		}

		this.logService.info(`UserDataProfileTemplateService: Template file changed for profile '${profile.name}', checking for changes...`);

		try {
			const sourceTemplate = await this.userDataProfilesService.getSourceProfileTemplate(profile);
			const storedTemplate = await this.userDataProfilesService.getStoredProfileTemplate(profile);

			if (!sourceTemplate) {
				this.logService.warn(`UserDataProfileTemplateService: Could not resolve source template for profile '${profile.name}'`);
				return;
			}

			const profileUpdateOptions: Mutable<IUserDataProfileUpdateOptions> = Object.create(null);

			if (sourceTemplate.icon !== storedTemplate?.icon && storedTemplate?.icon === profile.icon) {
				profileUpdateOptions.icon = sourceTemplate.icon;
			}

			if (!equals(sourceTemplate.settings, storedTemplate?.settings)) {
				this.logService.trace(`UserDataProfileTemplateService: Updating default settings for profile '${profile.name}'`);
				await this.userDataProfilesService.updateStoredProfileTemplate(profile);
			}

			if (!isEmptyObject(profileUpdateOptions)) {
				await this.userDataProfilesService.updateProfile(profile, profileUpdateOptions);
			}

			this.logService.info(`UserDataProfileTemplateService: Successfully applied template changes to profile '${profile.name}'`);
		} catch (error) {
			this.logService.error(`UserDataProfileTemplateService: Failed to apply template changes to profile '${profile.name}'`, error);
		}
	}
}
