/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Application, Terminal, TerminalCommandId, Logger } from '../../../../automation';
import { installAllHandlers } from '../../utils';
import { setup as setupTerminalEditorsTests } from './terminal-editors.test';
import { setup as setupTerminalInputTests } from './terminal-input.test';
import { setup as setupTerminalPersistenceTests } from './terminal-persistence.test';
import { setup as setupTerminalProfileTests } from './terminal-profiles.test';
import { setup as setupTerminalTabsTests } from './terminal-tabs.test';
import { setup as setupTerminalSplitCwdTests } from './terminal-splitCwd.test';

export function setup(logger: Logger) {
	describe('Terminal', function () {

		// Retry tests 3 times to minimize build failures due to any flakiness
		this.retries(3);

		// Shared before/after handling
		installAllHandlers(logger);

		let terminal: Terminal;
		before(async function () {
			// Fetch terminal automation API
			const app = this.app as Application;
			terminal = app.workbench.terminal;

			// Always show tabs to make getting terminal groups easier
			await app.workbench.settingsEditor.addUserSetting('terminal.integrated.tabs.hideCondition', '"never"');
			// Use the DOM renderer for smoke tests so they can be inspected in the playwright trace
			// viewer
			await app.workbench.settingsEditor.addUserSetting('terminal.integrated.gpuAcceleration', '"off"');

			// Close the settings editor
			await app.workbench.quickaccess.runCommand('workbench.action.closeAllEditors');
		});

		afterEach(async () => {
			// Kill all terminals between every test for a consistent testing environment
			await terminal.runCommand(TerminalCommandId.KillAll);
		});

		setupTerminalEditorsTests();
		setupTerminalInputTests();
		setupTerminalPersistenceTests();
		setupTerminalProfileTests();
		setupTerminalTabsTests();
		if (!process.platform.startsWith('win')) {
			setupTerminalSplitCwdTests();
		}
	});
}
