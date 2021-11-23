/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import minimist = require('minimist');
import { Application, Terminal, TerminalCommandId } from '../../../../automation/out';
import { afterSuite, beforeSuite } from '../../utils';
import { setup as setupTerminalEditorsTests } from './terminal-editors.test';
import { setup as setupTerminalPersistenceTests } from './terminal-persistence.test';
import { setup as setupTerminalProfileTests } from './terminal-profiles.test';
import { setup as setupTerminalTabsTests } from './terminal-tabs.test';

export function setup(opts: minimist.ParsedArgs) {
	describe('Terminal', () => {
		// TODO: Enable terminal tests for non-web when the desktop driver is moved to playwright
		if (!opts.web) {
			return;
		}

		beforeSuite(opts);
		afterSuite(opts);

		let terminal: Terminal;
		before(async function () {
			// Fetch terminal automation API
			const app = this.app as Application;
			terminal = app.workbench.terminal;

			// Always show tabs to make getting terminal groups easier
			await app.workbench.settingsEditor.addUserSetting('terminal.integrated.tabs.hideCondition', '"never"');

			// Close the settings editor
			await app.workbench.quickaccess.runCommand('workbench.action.closeAllEditors');
		});

		afterEach(async () => {
			// Kill all terminals between every test for a consistent testing environment
			await terminal.runCommand(TerminalCommandId.KillAll);
		});

		setupTerminalEditorsTests(opts);
		setupTerminalPersistenceTests(opts);
		setupTerminalProfileTests(opts);
		setupTerminalTabsTests(opts);
	});
}
