/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Application } from '../../../../automation';

export async function setTerminalTestSettings(app: Application) {
	// Always show tabs to make getting terminal groups easier
	await app.workbench.settingsEditor.addUserSetting('terminal.integrated.tabs.hideCondition', '"never"');
	// Use the DOM renderer for smoke tests so they can be inspected in the playwright trace
	// viewer
	await app.workbench.settingsEditor.addUserSetting('terminal.integrated.gpuAcceleration', '"off"');

	// Close the settings editor
	await app.workbench.quickaccess.runCommand('workbench.action.closeAllEditors');
}
