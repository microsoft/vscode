/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
import { IUserDataProfilesService } from './userDataProfile.js';

export class UserDataSystemProfilesInitializer extends Disposable {

	constructor(
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.initialize()
			.catch(error => {
				this.logService.error('Failed to initialize system profiles', error);
			});
	}

	private async initialize(): Promise<void> {
		const systemProfileTemplates = await this.userDataProfilesService.getSystemProfileTemplates();
		for (const template of systemProfileTemplates) {
			const existingProfile = this.userDataProfilesService.profiles.find(p => p.id === template.id);
			if (!existingProfile) {
				this.logService.info(`Creating system profile '${template.name}' (${template.id})`);
				try {
					await this.userDataProfilesService.createSystemProfile(template.id);
				} catch (error) {
					this.logService.error(`Failed to create system profile '${template.name}' (${template.id})`, error);
				}
			}
		}
	}
}
