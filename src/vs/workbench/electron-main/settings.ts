/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {app} from 'electron';

import env = require('vs/workbench/electron-main/env');
import {UserSettings} from 'vs/workbench/node/userSettings';

export class SettingsManager extends UserSettings {

	constructor() {
		super(env.appSettingsPath, env.appKeybindingsPath);

		app.on('will-quit', () => {
			this.dispose();
		});
	}

	public loadSync(): boolean {
		const settingsChanged = super.loadSync();

		// Store into global so that any renderer can access the value with remote.getGlobal()
		if (settingsChanged) {
			global.globalSettingsValue = JSON.stringify(this.globalSettings);
		}

		return settingsChanged;
	}
}

export const manager = new SettingsManager();