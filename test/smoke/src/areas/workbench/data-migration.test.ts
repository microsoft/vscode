/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Application, ApplicationOptions, Quality } from '../../../../automation';
import { join } from 'path';
import { ParsedArgs } from 'minimist';
import { afterSuite, timeout } from '../../utils';

export function setup(opts: ParsedArgs, testDataPath: string) {

	describe('Datamigration', () => {

		let insidersApp: Application | undefined = undefined;
		let stableApp: Application | undefined = undefined;

		afterSuite(opts, () => insidersApp, async () => stableApp?.stop());

		it(`verifies opened editors are restored`, async function () {
			const stableCodePath = opts['stable-build'];
			if (!stableCodePath) {
				this.skip();
			}

			// On macOS, the stable app fails to launch on first try,
			// so let's retry this once
			// https://github.com/microsoft/vscode/pull/127799
			if (process.platform === 'darwin') {
				this.retries(2);
			}

			const userDataDir = join(testDataPath, 'd2'); // different data dir from the other tests

			const stableOptions: ApplicationOptions = Object.assign({}, this.defaultOptions);
			stableOptions.codePath = stableCodePath;
			stableOptions.userDataDir = userDataDir;
			stableOptions.quality = Quality.Stable;

			stableApp = new Application(stableOptions);
			await stableApp.start();

			// Open 3 editors and pin 2 of them
			await stableApp.workbench.quickaccess.openFile('www');
			await stableApp.workbench.quickaccess.runCommand('View: Keep Editor');

			await stableApp.workbench.quickaccess.openFile('app.js');
			await stableApp.workbench.quickaccess.runCommand('View: Keep Editor');

			await stableApp.workbench.editors.newUntitledFile();

			await stableApp.stop();
			stableApp = undefined;

			const insiderOptions: ApplicationOptions = Object.assign({}, this.defaultOptions);
			insiderOptions.userDataDir = userDataDir;

			insidersApp = new Application(insiderOptions);
			await insidersApp.start();

			// Verify 3 editors are open
			await insidersApp.workbench.editors.selectTab('Untitled-1');
			await insidersApp.workbench.editors.selectTab('app.js');
			await insidersApp.workbench.editors.selectTab('www');

			await insidersApp.stop();
			insidersApp = undefined;
		});

		it(`verifies that 'hot exit' works for dirty files`, async function () {
			const stableCodePath = opts['stable-build'];
			if (!stableCodePath) {
				this.skip();
			}

			const userDataDir = join(testDataPath, 'd3'); // different data dir from the other tests

			const stableOptions: ApplicationOptions = Object.assign({}, this.defaultOptions);
			stableOptions.codePath = stableCodePath;
			stableOptions.userDataDir = userDataDir;
			stableOptions.quality = Quality.Stable;

			stableApp = new Application(stableOptions);
			await stableApp.start();

			await stableApp.workbench.editors.newUntitledFile();

			const untitled = 'Untitled-1';
			const textToTypeInUntitled = 'Hello from Untitled';
			await stableApp.workbench.editor.waitForTypeInEditor(untitled, textToTypeInUntitled);

			const readmeMd = 'readme.md';
			const textToType = 'Hello, Code';
			await stableApp.workbench.quickaccess.openFile(readmeMd);
			await stableApp.workbench.editor.waitForTypeInEditor(readmeMd, textToType);

			await timeout(2000); // give time to store the backup before stopping the app

			await stableApp.stop();
			stableApp = undefined;

			const insiderOptions: ApplicationOptions = Object.assign({}, this.defaultOptions);
			insiderOptions.userDataDir = userDataDir;

			insidersApp = new Application(insiderOptions);
			await insidersApp.start();

			await insidersApp.workbench.editors.waitForTab(readmeMd, true);
			await insidersApp.workbench.editors.selectTab(readmeMd);
			await insidersApp.workbench.editor.waitForEditorContents(readmeMd, c => c.indexOf(textToType) > -1);

			await insidersApp.workbench.editors.waitForTab(untitled, true);
			await insidersApp.workbench.editors.selectTab(untitled);
			await insidersApp.workbench.editor.waitForEditorContents(untitled, c => c.indexOf(textToTypeInUntitled) > -1);

			await insidersApp.stop();
			insidersApp = undefined;
		});
	});
}
