/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {app} from 'electron';
import { ServiceIdentifier, createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { UserSettings, ISettings } from 'vs/workbench/node/userSettings';
import { IEnvService } from 'vs/workbench/electron-main/env';
import Event from 'vs/base/common/event';

export const ISettingsManager = createDecorator<ISettingsManager>('settingsManager');

export interface ISettingsManager {
	serviceId: ServiceIdentifier<any>;
	globalSettings: ISettings;
	loadSync(): boolean;
	getValue(key: string, fallback?: any): any;
	onChange: Event<ISettings>;
}

export class SettingsManager extends UserSettings implements ISettingsManager {

	serviceId = ISettingsManager;

	constructor(@IEnvService envService: IEnvService) {
		super(envService.appSettingsPath, envService.appKeybindingsPath);

		app.on('will-quit', () => {
			this.dispose();
		});
	}

	loadSync(): boolean {
		const settingsChanged = super.loadSync();

		// Store into global so that any renderer can access the value with remote.getGlobal()
		if (settingsChanged) {
			global.globalSettingsValue = JSON.stringify(this.globalSettings);
		}

		return settingsChanged;
	}
}