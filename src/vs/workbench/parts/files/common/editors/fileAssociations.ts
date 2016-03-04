/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {IWorkbenchContribution} from 'vs/workbench/common/contributions';
import errors = require('vs/base/common/errors');
import mime = require('vs/base/common/mime');
import {IFilesConfiguration} from 'vs/platform/files/common/files';
import {IConfigurationService, IConfigurationServiceEvent, ConfigurationServiceEventTypes} from 'vs/platform/configuration/common/configuration';
import {IEventService} from 'vs/platform/event/common/event';
import {IModeService} from 'vs/editor/common/services/modeService';

// Register and update configured file associations
export class FileAssociations implements IWorkbenchContribution {
	private toUnbind: { (): void; }[];

	constructor(
		@IConfigurationService private configurationService: IConfigurationService,
		@IEventService private eventService: IEventService,
		@IModeService private modeService: IModeService
	) {
		this.toUnbind = [];

		this.registerListeners();
		this.loadConfiguration();
	}

	private registerListeners(): void {
		this.toUnbind.push(this.configurationService.addListener(ConfigurationServiceEventTypes.UPDATED, (e: IConfigurationServiceEvent) => this.onConfigurationChange(e.config)));
	}

	private loadConfiguration(): void {
		this.configurationService.loadConfiguration().done((configuration: IFilesConfiguration) => {
			this.onConfigurationChange(configuration);
		}, errors.onUnexpectedError);
	}

	private onConfigurationChange(configuration: IFilesConfiguration): void {
		if (configuration.files && configuration.files.associations) {
			Object.keys(configuration.files.associations).forEach(pattern => {
				mime.registerTextMime({ mime: this.modeService.getMimeForMode(configuration.files.associations[pattern]), filepattern: pattern, userConfigured: true });
			});
		}
	}

	public getId(): string {
		return 'vs.files.associations';
	}

	public dispose(): void {
		while (this.toUnbind.length) {
			this.toUnbind.pop()();
		}
	}
}