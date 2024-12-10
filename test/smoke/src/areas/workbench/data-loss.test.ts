/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join } from 'path';
import { Application, ApplicationOptions, Logger, Quality } from '../../../../automation';
import { createApp, timeout, installDiagnosticsHandler, installAppAfterHandler, getRandomUserDataDir, suiteLogsPath, suiteCrashPath } from '../../utils';

export function setup(ensureStableCode: () => string | undefined, logger: Logger) {
	describe('Data Loss (insiders -> insiders)', function () {

		// Double the timeout since these tests involve 2 startups
		this.timeout(4 * 60 * 1000);

		let app: Application | undefined = undefined;

		// Shared before/after handling
		installDiagnosticsHandler(logger, () => app);
		installAppAfterHandler(() => app);

		it('verifies opened editors are restored', async function () {
			app = createApp({
				...this.defaultOptions,
				logsPath: suiteLogsPath(this.defaultOptions, 'test_verifies_opened_editors_are_restored'),
				crashesPath: suiteCrashPath(this.defaultOptions, 'test_verifies_opened_editors_are_restored')
			});
			await app.start();

			// Open 3 editors
			await app.workbench.quickaccess.openFile(join(app.workspacePathOrFolder, 'bin', 'www'));
			await app.workbench.quickaccess.runCommand('View: Keep Editor');
			await app.workbench.quickaccess.openFile(join(app.workspacePathOrFolder, 'app.js'));
			await app.workbench.quickaccess.runCommand('View: Keep Editor');
			await app.workbench.editors.newUntitledFile();

			await app.restart();

			// Verify 3 editors are open
			await app.workbench.editors.selectTab('Untitled-1');
			await app.workbench.editors.selectTab('app.js');
			await app.workbench.editors.selectTab('www');

			await app.stop();
			app = undefined;
		});

		it('verifies editors can save and restore', async function () {
			app = createApp({
				...this.defaultOptions,
				logsPath: suiteLogsPath(this.defaultOptions, 'test_verifies_editors_can_save_and_restore'),
				crashesPath: suiteCrashPath(this.defaultOptions, 'test_verifies_editors_can_save_and_restore')
			});
			await app.start();

			const textToType = 'Hello, Code';

			// open editor and type
			await app.workbench.quickaccess.openFile(join(app.workspacePathOrFolder, 'app.js'));
			await app.workbench.editor.waitForTypeInEditor('app.js', textToType);
			await app.workbench.editors.waitForTab('app.js', true);

			// save
			await app.workbench.editors.saveOpenedFile();
			await app.workbench.editors.waitForTab('app.js', false);

			// restart
			await app.restart();

			// verify contents
			await app.workbench.editor.waitForEditorContents('app.js', contents => contents.indexOf(textToType) > -1);

			await app.stop();
			app = undefined;
		});

		it('verifies that "hot exit" works for dirty files (without delay)', function () {
			return testHotExit.call(this, 'test_verifies_that_hot_exit_works_for_dirty_files_without_delay', undefined, undefined);
		});

		it('verifies that "hot exit" works for dirty files (with delay)', function () {
			return testHotExit.call(this, 'test_verifies_that_hot_exit_works_for_dirty_files_with_delay', 2000, undefined);
		});

		it('verifies that auto save triggers on shutdown', function () {
			return testHotExit.call(this, 'test_verifies_that_auto_save_triggers_on_shutdown', undefined, true);
		});

		async function testHotExit(this: import('mocha').Context, title: string, restartDelay: number | undefined, autoSave: boolean | undefined) {
			app = createApp({
				...this.defaultOptions,
				logsPath: suiteLogsPath(this.defaultOptions, title),
				crashesPath: suiteCrashPath(this.defaultOptions, title)
			});
			await app.start();

			if (autoSave) {
				await app.workbench.settingsEditor.addUserSetting('files.autoSave', '"afterDelay"');
			}

			const textToTypeInUntitled = 'Hello from Untitled';

			await app.workbench.editors.newUntitledFile();
			await app.workbench.editor.waitForTypeInEditor('Untitled-1', textToTypeInUntitled);
			await app.workbench.editors.waitForTab('Untitled-1', true);

			const textToType = 'Hello, Code';
			await app.workbench.quickaccess.openFile(join(app.workspacePathOrFolder, 'readme.md'));
			await app.workbench.editor.waitForTypeInEditor('readme.md', textToType);
			await app.workbench.editors.waitForTab('readme.md', !autoSave);

			if (typeof restartDelay === 'number') {
				// this is an OK use of a timeout in a smoke test:
				// we want to simulate a user having typed into
				// the editor and pausing for a moment before
				// terminating
				await timeout(restartDelay);
			}

			await app.restart();

			await app.workbench.editors.waitForTab('readme.md', !autoSave);
			await app.workbench.editors.waitForTab('Untitled-1', true);

			await app.workbench.editors.selectTab('readme.md');
			await app.workbench.editor.waitForEditorContents('readme.md', contents => contents.indexOf(textToType) > -1);

			await app.workbench.editors.selectTab('Untitled-1');
			await app.workbench.editor.waitForEditorContents('Untitled-1', contents => contents.indexOf(textToTypeInUntitled) > -1);

			await app.stop();
			app = undefined;
		}
	});

	describe('Data Loss (stable -> insiders)', function () {

		// Double the timeout since these tests involve 2 startups
		this.timeout(4 * 60 * 1000);

		let insidersApp: Application | undefined = undefined;
		let stableApp: Application | undefined = undefined;

		// Shared before/after handling
		installDiagnosticsHandler(logger, () => insidersApp ?? stableApp);
		installAppAfterHandler(() => insidersApp ?? stableApp, async () => stableApp?.stop());

		it('verifies opened editors are restored', async function () {
			const stableCodePath = ensureStableCode();
			if (!stableCodePath) {
				this.skip();
			}

			// macOS: the first launch of stable Code will trigger
			// additional checks in the OS (notarization validation)
			// so it can take a very long time. as such we install
			// a retry handler to make sure we do not fail as a
			// consequence.
			if (process.platform === 'darwin') {
				this.retries(2);
			}

			const userDataDir = getRandomUserDataDir(this.defaultOptions);
			const logsPath = suiteLogsPath(this.defaultOptions, 'test_verifies_opened_editors_are_restored_from_stable');
			const crashesPath = suiteCrashPath(this.defaultOptions, 'test_verifies_opened_editors_are_restored_from_stable');

			const stableOptions: ApplicationOptions = Object.assign({}, this.defaultOptions);
			stableOptions.codePath = stableCodePath;
			stableOptions.userDataDir = userDataDir;
			stableOptions.quality = Quality.Stable;
			stableOptions.logsPath = logsPath;
			stableOptions.crashesPath = crashesPath;

			stableApp = new Application(stableOptions);
			await stableApp.start();

			// Open 3 editors
			await stableApp.workbench.quickaccess.openFile(join(stableApp.workspacePathOrFolder, 'bin', 'www'));
			await stableApp.workbench.quickaccess.runCommand('View: Keep Editor');
			await stableApp.workbench.quickaccess.openFile(join(stableApp.workspacePathOrFolder, 'app.js'));
			await stableApp.workbench.quickaccess.runCommand('View: Keep Editor');
			await stableApp.workbench.editors.newUntitledFile();

			await stableApp.stop();
			stableApp = undefined;

			const insiderOptions: ApplicationOptions = Object.assign({}, this.defaultOptions);
			insiderOptions.userDataDir = userDataDir;
			insiderOptions.logsPath = logsPath;
			insiderOptions.crashesPath = crashesPath;

			insidersApp = new Application(insiderOptions);
			await insidersApp.start();

			// Verify 3 editors are open
			await insidersApp.workbench.editors.selectTab('Untitled-1');
			await insidersApp.workbench.editors.selectTab('app.js');
			await insidersApp.workbench.editors.selectTab('www');

			await insidersApp.stop();
			insidersApp = undefined;
		});

		it('verifies that "hot exit" works for dirty files (without delay)', async function () {
			return testHotExit.call(this, `test_verifies_that_hot_exit_works_for_dirty_files_without_delay_from_stable`, undefined);
		});

		it('verifies that "hot exit" works for dirty files (with delay)', async function () {
			return testHotExit.call(this, `test_verifies_that_hot_exit_works_for_dirty_files_with_delay_from_stable`, 2000);
		});

		async function testHotExit(this: import('mocha').Context, title: string, restartDelay: number | undefined) {
			const stableCodePath = ensureStableCode();
			if (!stableCodePath) {
				this.skip();
			}

			const userDataDir = getRandomUserDataDir(this.defaultOptions);
			const logsPath = suiteLogsPath(this.defaultOptions, title);
			const crashesPath = suiteCrashPath(this.defaultOptions, title);

			const stableOptions: ApplicationOptions = Object.assign({}, this.defaultOptions);
			stableOptions.codePath = stableCodePath;
			stableOptions.userDataDir = userDataDir;
			stableOptions.quality = Quality.Stable;
			stableOptions.logsPath = logsPath;
			stableOptions.crashesPath = crashesPath;

			stableApp = new Application(stableOptions);
			await stableApp.start();

			const textToTypeInUntitled = 'Hello from Untitled';

			await stableApp.workbench.editors.newUntitledFile();
			await stableApp.workbench.editor.waitForTypeInEditor('Untitled-1', textToTypeInUntitled);
			await stableApp.workbench.editors.waitForTab('Untitled-1', true);

			const textToType = 'Hello, Code';
			await stableApp.workbench.quickaccess.openFile(join(stableApp.workspacePathOrFolder, 'readme.md'));
			await stableApp.workbench.editor.waitForTypeInEditor('readme.md', textToType);
			await stableApp.workbench.editors.waitForTab('readme.md', true);

			if (typeof restartDelay === 'number') {
				// this is an OK use of a timeout in a smoke test
				// we want to simulate a user having typed into
				// the editor and pausing for a moment before
				// terminating
				await timeout(restartDelay);
			}

			await stableApp.stop();
			stableApp = undefined;

			const insiderOptions: ApplicationOptions = Object.assign({}, this.defaultOptions);
			insiderOptions.userDataDir = userDataDir;
			insiderOptions.logsPath = logsPath;
			insiderOptions.crashesPath = crashesPath;

			insidersApp = new Application(insiderOptions);
			await insidersApp.start();

			await insidersApp.workbench.editors.waitForTab('readme.md', true);
			await insidersApp.workbench.editors.waitForTab('Untitled-1', true);

			await insidersApp.workbench.editors.selectTab('readme.md');
			await insidersApp.workbench.editor.waitForEditorContents('readme.md', contents => contents.indexOf(textToType) > -1);

			await insidersApp.workbench.editors.selectTab('Untitled-1');
			await insidersApp.workbench.editor.waitForEditorContents('Untitled-1', contents => contents.indexOf(textToTypeInUntitled) > -1);

			await insidersApp.stop();
			insidersApp = undefined;
		}
	});
}
