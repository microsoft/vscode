/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitpod. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import minimist = require('minimist');
import * as path from 'path';
import { Application, Quality } from '../../../../automation';
import { afterSuite, beforeSuite } from '../../utils';

export function setup(opts: minimist.ParsedArgs) {
	describe('Terminal', () => {
		beforeSuite(opts);

		afterSuite(opts);

		it('shows terminal and runs command', async function () {
			const app = this.app as Application;

			// Canvas may cause problems when running in a container
			await app.workbench.settingsEditor.addUserSetting('terminal.integrated.gpuAcceleration', '"off"');

			await app.workbench.terminal.showTerminal();
			await app.workbench.terminal.runCommand('ls');
			await app.workbench.terminal.waitForTerminalText(lines => lines.some(l => l.includes('app.js')));
		});

		it('shows terminal and runs cli command', async function () {
			const app = this.app as Application;

			if (app.quality !== Quality.Dev) {
				this.skip();
			}

			const rootPath = process.env['VSCODE_REPOSITORY'];
			if (!rootPath) {
				throw new Error('VSCODE_REPOSITORY env variable not found');
			}

			const cliPath = path.join(rootPath, 'out', 'server-cli.js');

			await app.workbench.terminal.runCommand(`node ${cliPath} app.js`);
			await app.workbench.editors.waitForActiveTab('app.js');
		});
	});
}
