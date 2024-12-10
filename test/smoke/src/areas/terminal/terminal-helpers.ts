/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Application } from '../../../../automation';

export async function setTerminalTestSettings(app: Application, additionalSettings: [key: string, value: string][] = []) {
	await app.workbench.settingsEditor.addUserSettings([
		// Work wrap is required when calling settingsEditor.addUserSetting multiple times or the
		// click to focus will fail
		['editor.wordWrap', '"on"'],
		// Always show tabs to make getting terminal groups easier
		['terminal.integrated.tabs.hideCondition', '"never"'],
		// Use the DOM renderer for smoke tests so they can be inspected in the playwright trace
		// viewer
		['terminal.integrated.gpuAcceleration', '"off"'],
		...additionalSettings
	]);

	// Close the settings editor
	await app.workbench.quickaccess.runCommand('workbench.action.closeAllEditors');
}
