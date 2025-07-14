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
import { setup as setupTerminalStickyScrollTests } from './terminal-stickyScroll.test';
import { setup as setupTerminalShellIntegrationTests } from './terminal-shellIntegration.test';

export function setup(logger: Logger) {
	describe('Terminal', function () {

		// Retry tests 3 times to minimize build failures due to any flakiness
		this.retries(3);

		// Shared before/after handling
		installAllHandlers(logger);

		let app: Application;
		let terminal: Terminal;
		before(async function () {
			// Fetch terminal automation API
			app = this.app as Application;
			terminal = app.workbench.terminal;
		});

		afterEach(async () => {
			// Kill all terminals between every test for a consistent testing environment
			await terminal.runCommand(TerminalCommandId.KillAll);
		});

		// https://github.com/microsoft/vscode/issues/216564
		// The pty host can crash on Linux in smoke tests for an unknown reason. We need more user
		// reports to investigate
		setupTerminalEditorsTests({ skipSuite: process.platform === 'linux' });
		setupTerminalInputTests({ skipSuite: process.platform === 'linux' });
		setupTerminalPersistenceTests({ skipSuite: process.platform === 'linux' });
		setupTerminalProfileTests({ skipSuite: process.platform === 'linux' });
		setupTerminalTabsTests({ skipSuite: process.platform === 'linux' });
		setupTerminalShellIntegrationTests({ skipSuite: process.platform === 'linux' });
		setupTerminalStickyScrollTests({ skipSuite: true });
		// https://github.com/microsoft/vscode/pull/141974
		// Windows is skipped here as well as it was never enabled from the start
		setupTerminalSplitCwdTests({ skipSuite: process.platform === 'linux' || process.platform === 'win32' });
	});
}
