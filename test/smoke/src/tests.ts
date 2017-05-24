/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { SpectronApplication } from "./spectron/application";
import { CommonActions } from './areas/common';
// import { FirstExperience } from './areas/first-experience';
import { ConfigurationView, ActivityBarPosition } from './areas/configuration-views';
import { Search } from './areas/search';
import { CSS, CSSProblem } from './areas/css';
import { JavaScript } from './areas/javascript';
import { JavaScriptDebug } from './areas/javascript-debug';
import { Git } from './areas/git';
import { IntegratedTerminal } from './areas/integrated-terminal';
import { StatusBar, StatusBarElement } from './areas/statusBar';
import { DataLoss } from './areas/data-loss';
import { Tasks } from './areas/tasks';
import { Extensions } from './areas/extensions';
import { Localization, ViewletType } from "./areas/localization";

describe('Smoke Test Suite', function () {
	const latestPath = process.env.VSCODE_LATEST_PATH;
	const stablePath = process.env.VSCODE_STABLE_PATH;
	// const insiders = process.env.VSCODE_EDITION;
	const workspacePath = process.env.SMOKETEST_REPO;
	const tempUserDir = 'test_data/temp_user_dir';
	const tempExtensionsDir = 'test_data/temp_extensions_dir';

	let app: SpectronApplication;
	let common: CommonActions;

	if (stablePath) {
		context('Data Migration', function () {

			afterEach(async function () {
				await app.stop();
				return await common.removeDirectory(tempUserDir)
			});

			function setupSpectron(context: Mocha.ITestCallbackContext, appPath: string, workspace?: string[]): void {
				app = new SpectronApplication(appPath, context.test.fullTitle(), context.test.currentRetry(), workspace, [`--user-data-dir=${tempUserDir}`]);
				common = new CommonActions(app);
			}

			it('checks if the Untitled file is restored migrating from stable to latest', async function () {
				const textToType = 'Very dirty file';

				// Setting up stable version
				setupSpectron(this, stablePath);
				await app.start();

				await common.newUntitledFile();
				await common.type(textToType);
				await app.stop();

				await app.wait(); // wait until all resources are released (e.g. locked local storage)

				// Checking latest version for the restored state
				setupSpectron(this, latestPath);
				await app.start();

				assert.ok(await common.getTab('Untitled-1'));
				await common.selectTab('Untitled-1');
				const editorText = await common.getEditorFirstLinePlainText();
				assert.equal(editorText, textToType);
			});

			it('checks if the newly created dirty file is restored migrating from stable to latest', async function () {
				const fileName = 'test_data/plainFile',
					firstTextPart = 'This is going to be an unsaved file', secondTextPart = '_that is dirty.';

				// Setting up stable version
				setupSpectron(this, stablePath, [fileName]);
				await common.removeFile(`${fileName}`);
				await app.start();

				await common.type(firstTextPart);
				await common.saveOpenedFile();
				await app.wait();
				await common.type(secondTextPart);

				await app.stop();
				await app.wait(); // wait until all resources are released (e.g. locked local storage)

				// Checking latest version for the restored state
				setupSpectron(this, latestPath);
				await app.start();
				assert.ok(await common.getTab(fileName.split('/')[1]));
				await common.selectTab(fileName.split('/')[1]);
				const editorText = await common.getEditorFirstLinePlainText();
				assert.equal(editorText, firstTextPart.concat(secondTextPart));

				// Cleanup
				await common.removeFile(`${fileName}`);
			});

			it('cheks if opened tabs are restored migrating from stable to latest', async function () {
				const fileName1 = 'app.js', fileName2 = 'jsconfig.json', fileName3 = 'readme.md';
				setupSpectron(this, stablePath, [workspacePath]);
				await app.start();
				await common.openFile(fileName1, true);
				await common.openFile(fileName2, true);
				await common.openFile(fileName3, true);
				await app.stop();

				setupSpectron(this, latestPath, [workspacePath]);
				await app.start();
				assert.ok(await common.getTab(fileName1));
				assert.ok(await common.getTab(fileName2));
				assert.ok(await common.getTab(fileName3));
			});
		});
	}

	context('Data Loss', function () {
		let dataLoss: DataLoss;

		beforeEach(async function () {
			app = new SpectronApplication(latestPath, this.currentTest.fullTitle(), (this.currentTest as any).currentRetry(), [workspacePath], [`--user-data-dir=${tempUserDir}`]);
			common = new CommonActions(app);
			dataLoss = new DataLoss(app);
			await common.removeDirectory(tempUserDir);

			return await app.start();
		});
		afterEach(async function () {
			return await app.stop();
		});

		it(`verifies that 'hot exit' works for dirty files`, async function () {
			const textToType = 'Hello, Code!', fileName = 'readme.md', untitled = 'Untitled-1';
			await common.newUntitledFile();
			await common.type(textToType);
			await dataLoss.openExplorerViewlet();
			await common.openFile(fileName, true);
			await common.type(textToType);

			await app.stop();
			await app.start();

			// check tab presence
			assert.ok(await common.getTab(untitled));
			assert.ok(await common.getTab(fileName, true));
			// check if they marked as dirty (icon) and active tab is the last opened
			assert.ok(await dataLoss.verifyTabIsDirty(untitled));
			assert.ok(await dataLoss.verifyTabIsDirty(fileName, true));
		});

		it(`verifies that contents of the dirty files are restored after 'hot exit'`, async function () {
			// make one dirty file,
			// create one untitled file
			const textToType = 'Hello, Code!';

			// create one untitled file
			await common.newUntitledFile();
			await app.wait();
			await common.type(textToType);

			// make one dirty file,
			await common.openFile('readme.md', true);
			await app.wait();
			await common.type(textToType);

			await app.stop();
			await app.start();

			// check their contents
			let fileDirt = await common.getEditorFirstLinePlainText();
			assert.equal(fileDirt, 'Hello, Code'); // ignore '!' as it is a separate <span/>, first part is enough
			await common.selectTab('Untitled-1');
			fileDirt = await common.getEditorFirstLinePlainText();
			assert.equal(fileDirt, textToType);
		});
	});

	// Do not run until experiments are finished over the first-time startup behaviour.
	// context('First User Experience', function () {
	// 	let experience: FirstExperience;

	// 	beforeEach(async function () {
	// 		app = new SpectronApplication(latestPath, this.currentTest.fullTitle(), (this.currentTest as any).currentRetry(), undefined, [`--user-data-dir=${tempUserDir}`, `--excludeSwitches=load-component-extension`]);
	// 		common = new CommonActions(app);
	// 		experience = new FirstExperience(app);
			
	// 		await common.removeDirectory(tempUserDir);
	// 		return await app.start();
	// 	});
	// 	afterEach(async function () {
	// 		return await app.stop();
	// 	});

	// 	it(`verifies if title is set correctly on the clean user-directory startup`, async function () {
	// 		const title = await common.getWindowTitle();
			
	// 		let expectedTitle = 'Welcome';
	// 		if (process.platform !== 'darwin') {
	// 			expectedTitle += ' — Visual Studio Code';
	// 			if (insiders) expectedTitle += ' - Insiders';
	// 		}

	// 		assert.equal(title, expectedTitle);
	// 	});

	// 	it(`verifies if 'Welcome page' tab is presented on the clean user-directory startup`, async function () {
	// 		assert.ok(await experience.getWelcomeTab());
	// 	});
	// });

	context('Explorer', function () {
		beforeEach(async function () {
			app = new SpectronApplication(latestPath, this.currentTest.fullTitle(), (this.currentTest as any).currentRetry(), [workspacePath]);
			common = new CommonActions(app);

			return await app.start();
		});
		afterEach(async function () {
			return await app.stop();
		});

		it('quick open search produces correct result', async function () {
			await common.openQuickOpen();
			await common.type('.js');
			await app.wait();
			const elCount = await common.getQuickOpenElements();
			assert.equal(elCount, 7);
		});

		it('quick open respects fuzzy matching', async function () {
			await common.openQuickOpen();
			await common.type('a.s');
			await app.wait();
			const elCount = await common.getQuickOpenElements();
			assert.equal(elCount, 3);
		});
	});

	context('Configuration and views', function () {
		let configView: ConfigurationView;

		beforeEach(async function () {
			app = new SpectronApplication(latestPath, this.currentTest.fullTitle(), (this.currentTest as any).currentRetry(), [workspacePath]);
			common = new CommonActions(app);
			configView = new ConfigurationView(app);

			return await app.start();
		});
		afterEach(async function () {
			return await app.stop();
		});

		it('turns off editor line numbers and verifies the live change', async function () {
			await common.newUntitledFile();
			await app.wait();
			let elements = await configView.getEditorLineNumbers();
			assert.equal(elements.value.length, 1);
			await common.addSetting('editor.lineNumbers', 'off');
			await app.wait();
			elements = await configView.getEditorLineNumbers();
			assert.equal(elements.value.length, 0);
		});

		it(`changes 'workbench.action.toggleSidebarPosition' command key binding and verifies it`, async function () {
			await configView.enterKeybindingsView()
			await common.type('workbench.action.toggleSidebarPosition');
			await app.wait();
			await configView.selectFirstKeybindingsMatch();
			await configView.changeKeybinding();
			await configView.enterBinding(['Control', 'u', 'NULL']);
			await common.enter();
			let html = await configView.getActivityBar(ActivityBarPosition.RIGHT);
			assert.equal(html, undefined);;
			await app.wait();
			await configView.toggleActivityBarPosition();
			html = await configView.getActivityBar(ActivityBarPosition.RIGHT);
			assert.ok(html);
		});
	});

	context('Search', function () {
		let search: Search;

		beforeEach(async function () {
			app = new SpectronApplication(latestPath, this.currentTest.fullTitle(), (this.currentTest as any).currentRetry(), [workspacePath]);
			common = new CommonActions(app);
			search = new Search(app);

			return await app.start();
		});
		afterEach(async function () {
			return await app.stop();
		});

		it('searches for body & checks for correct result number', async function () {
			const s = search;
			await s.openSearchViewlet();
			await s.searchFor('body');
			const result = await s.getResultText();
			assert.equal(result, '7 results in 4 files');
		});

		it('searches only for *.js files & checks for correct result number', async function () {
			const s = search;
			await s.openSearchViewlet();
			await s.searchFor('body');
			await s.toggleSearchDetails();
			await s.searchFor('*.js');
			const results = await s.getResultText();
			assert.equal(results, '4 results in 1 file');
		});

		it('dismisses result & checks for correct result number', async function () {
			const s = search;
			await s.openSearchViewlet()
			await s.searchFor('body');
			await s.hoverOverResultCount();
			await s.dismissResult();
			await app.wait();
			const result = await s.getResultText();
			assert.equal(result, '3 results in 3 files')
		});

		it('replaces first search result with a replace term', async function () {
			const s = search;
			await s.openSearchViewlet()
			await s.searchFor('body');
			await s.toggleReplace();
			await s.setReplaceText('ydob');
			await s.hoverOverResultCount();
			await s.replaceFirstMatch();
			await app.wait();
			await common.saveOpenedFile();
			const result = await s.getResultText();
			assert.equal(result, '3 results in 3 files');
		});
	});

	context('CSS', function () {
		let css: CSS;

		beforeEach(async function () {
			app = new SpectronApplication(latestPath, this.currentTest.fullTitle(), (this.currentTest as any).currentRetry(), [workspacePath]);
			common = new CommonActions(app);
			css = new CSS(app);

			return await app.start();
		});
		afterEach(async function () {
			return await app.stop();
		});

		it('verifies quick outline', async function () {
			await common.openFirstMatchFile('style.css');
			await css.openQuickOutline();
			await app.wait();
			const count = await common.getQuickOpenElements();
			assert.equal(count, 2);
		});

		it('verifies warnings for the empty rule', async function () {
			await common.openFirstMatchFile('style.css');
			await common.type('.foo{}');
			await app.wait();
			let warning = await css.getEditorProblem(CSSProblem.WARNING);
			assert.ok(warning);
			await css.toggleProblemsView();
			warning = await css.getProblemsViewsProblem(CSSProblem.WARNING);
			assert.ok(warning);
		});

		it('verifies that warning becomes an error once setting changed', async function () {
			await common.addSetting('css.lint.emptyRules', 'error');
			await common.openFirstMatchFile('style.css');
			await common.type('.foo{}');
			await app.wait();
			let error = await css.getEditorProblem(CSSProblem.ERROR);
			assert.ok(error);
			await css.toggleProblemsView();
			error = await css.getProblemsViewsProblem(CSSProblem.ERROR);
			assert.ok(error);
		});
	});

	context('JavaScript', function () {
		let js: JavaScript;

		beforeEach(async function () {
			app = new SpectronApplication(latestPath, this.currentTest.fullTitle(), (this.currentTest as any).currentRetry(), [workspacePath]);
			common = new CommonActions(app);
			js = new JavaScript(app);

			return await app.start();
		});
		afterEach(async function () {
			return await app.stop();
		});

		it('shows correct quick outline', async function () {
			await common.openFirstMatchFile('bin/www');
			await js.openQuickOutline();
			await app.wait();
			const symbols = await common.getQuickOpenElements();
			assert.equal(symbols, 12);
		});

		it(`finds 'All References' to 'app'`, async function () {
			await common.openFirstMatchFile('bin/www');
			await app.wait();
			await js.findAppReferences();
			const titleCount = await js.getTitleReferencesCount();
			assert.equal(titleCount, 3);
			const treeCount = await js.getTreeReferencesCount();
			assert.equal(treeCount, 3);
		});

		it(`renames local 'app' variable`, async function () {
			await common.openFirstMatchFile('bin/www');

			const newVarName = 'newApp';
			await js.renameApp(newVarName);
			await common.enter();
			const newName = await js.getNewAppName();
			assert.equal(newName, newVarName);
		});

		it('folds/unfolds the code correctly', async function () {
			await common.openFirstMatchFile('bin/www');
			// Fold
			await js.toggleFirstCommentFold();
			const foldedIcon = await js.getFirstCommentFoldedIcon();
			assert.ok(foldedIcon);
			let nextLineNumber = await js.getNextLineNumberAfterFold();
			assert.equal(nextLineNumber, 7);
			// Unfold
			await js.toggleFirstCommentFold();
			nextLineNumber = await js.getNextLineNumberAfterFold();
			assert.equal(nextLineNumber, 4);
		});

		it(`verifies that 'Go To Definition' works`, async function () {
			await common.openFirstMatchFile('app.js');
			await js.goToExpressDefinition();
			await app.wait();
			assert.ok(await common.getTab('index.d.ts'));
		});

		it(`verifies that 'Peek Definition' works`, async function () {
			await common.openFirstMatchFile('app.js');
			await js.peekExpressDefinition();
			const definitionFilename = await js.getPeekExpressResultName();
			assert.equal(definitionFilename, 'index.d.ts');
		});
	});

	context('Debugging JavaScript', function () {
		let jsDebug: JavaScriptDebug;

		beforeEach(async function () {
			app = new SpectronApplication(latestPath, this.currentTest.fullTitle(), (this.currentTest as any).currentRetry(), [workspacePath]);
			common = new CommonActions(app);
			jsDebug = new JavaScriptDebug(app);

			return await app.start();
		});
		afterEach(async function () {
			return await app.stop();
		});

		it('autodetects program attribute for launch.json', async function () {
			await jsDebug.openDebugViewlet();
			await jsDebug.pressConfigureLaunchJson();
			const value = await jsDebug.getProgramConfigValue();
			process.platform === 'win32' ? assert.equal(value, '"${workspaceRoot}\\\\bin\\\\www"') : assert.equal(value, '"${workspaceRoot}/bin/www"');
		});

		it(`can set a breakpoint and verify if it's set`, async function () {
			await common.openFirstMatchFile('index.js');
			await jsDebug.setBreakpointOnLine(6);
			const breakpoint = await jsDebug.verifyBreakpointOnLine(6);
			assert.ok(breakpoint);
		});
	});

	context('Git', function () {
		let git: Git;

		beforeEach(async function () {
			app = new SpectronApplication(latestPath, this.currentTest.fullTitle(), (this.currentTest as any).currentRetry(), [workspacePath]);
			common = new CommonActions(app);
			git = new Git(app, common);

			return await app.start();
		});
		afterEach(async function () {
			return await app.stop();
		});

		it('verifies current changes are picked up by Git viewlet', async function () {
			const changesCount = await git.getScmIconChanges();
			assert.equal(changesCount, 2);
			await git.openGitViewlet();
			assert.ok(await git.verifyScmChange('app.js'));
			assert.ok(await git.verifyScmChange('launch.json'));
		});

		it(`verifies 'app.js' diff viewer changes`, async function () {
			await git.openGitViewlet();
			await common.openFile('app.js');
			const original = await git.getOriginalAppJsBodyVarName();
			assert.equal(original, 'bodyParser');
			const modified = await git.getModifiedAppJsBodyVarName();
			assert.equal(modified, 'ydobParser');
		});

		it(`stages 'app.js' changes and checks stage count`, async function () {
			await git.openGitViewlet();
			await app.wait();
			await git.stageFile('app.js');
			const stagedCount = await git.getStagedCount();
			assert.equal(stagedCount, 1);

			// Return back to unstaged state
			await git.unstageFile('app.js');
		});

		it(`stages, commits change to 'app.js' locally and verifies outgoing change`, async function () {
			await git.openGitViewlet();
			await app.wait();
			await git.stageFile('app.js');
			await git.focusOnCommitBox();
			await common.type('Test commit');
			await git.pressCommit();
			const changes = await git.getOutgoingChanges();
			assert.equal(changes, ' 0↓ 1↑');
		});
	});

	context('Integrated Terminal', function () {
		let terminal: IntegratedTerminal;

		beforeEach(async function () {
			app = new SpectronApplication(latestPath, this.currentTest.fullTitle(), (this.currentTest as any).currentRetry(), [workspacePath]);
			common = new CommonActions(app);
			terminal = new IntegratedTerminal(app);

			return await app.start();
		});
		afterEach(async function () {
			return await app.stop();
		});

		it(`opens terminal, runs 'echo' and verifies the output`, async function () {
			const command = 'echo test';
			await terminal.openTerminal(common);
			await app.wait();
			await common.type(command);
			await common.enter();
			await app.wait();
			let output = await terminal.getCommandOutput(command);
			assert.equal(output, 'test');
		});
	});

	context('Status Bar', function () {
		let statusBar: StatusBar;

		beforeEach(async function () {
			app = new SpectronApplication(latestPath, this.currentTest.fullTitle(), (this.currentTest as any).currentRetry(), [workspacePath]);
			common = new CommonActions(app);
			statusBar = new StatusBar(app);

			return await app.start();
		});
		afterEach(async function () {
			return await app.stop();
		});

		it('verifies presence of all default status bar elements', async function () {
			await app.wait();
			assert.ok(await statusBar.isVisible(StatusBarElement.BRANCH_STATUS));
			assert.ok(await statusBar.isVisible(StatusBarElement.FEEDBACK_ICON));
			assert.ok(await statusBar.isVisible(StatusBarElement.SYNC_STATUS));
			assert.ok(await statusBar.isVisible(StatusBarElement.PROBLEMS_STATUS));

			await common.openFirstMatchFile('app.js');
			assert.ok(await statusBar.isVisible(StatusBarElement.ENCODING_STATUS));
			assert.ok(await statusBar.isVisible(StatusBarElement.EOL_STATUS));
			assert.ok(await statusBar.isVisible(StatusBarElement.INDENTATION_STATUS));
			assert.ok(await statusBar.isVisible(StatusBarElement.LANGUAGE_STATUS));
			assert.ok(await statusBar.isVisible(StatusBarElement.SELECTION_STATUS));
		});

		it(`verifies that 'quick open' opens when clicking on 'Branch', 'Indentation Status, 'Encoding', 'EOL' and 'Language' status elements`, async function () {
			await app.wait();
			await statusBar.clickOn(StatusBarElement.BRANCH_STATUS);
			assert.ok(await statusBar.isQuickOpenWidgetVisible());
			await common.closeQuickOpen();

			await common.openFirstMatchFile('app.js');
			await statusBar.clickOn(StatusBarElement.INDENTATION_STATUS);
			assert.ok(await statusBar.isQuickOpenWidgetVisible());
			await common.closeQuickOpen();
			await statusBar.clickOn(StatusBarElement.ENCODING_STATUS);
			assert.ok(await statusBar.isQuickOpenWidgetVisible());
			await common.closeQuickOpen();
			await statusBar.clickOn(StatusBarElement.EOL_STATUS);
			assert.ok(await statusBar.isQuickOpenWidgetVisible());
			await common.closeQuickOpen();
			await statusBar.clickOn(StatusBarElement.LANGUAGE_STATUS);
			assert.ok(await statusBar.isQuickOpenWidgetVisible());
			await common.closeQuickOpen();
		});

		it(`verifies that 'Problems View' appears when clicking on 'Problems' status element`, async function () {
			await statusBar.clickOn(StatusBarElement.PROBLEMS_STATUS);
			assert.ok(await statusBar.getProblemsView());
		});

		it(`verifies that 'Tweet us feedback' pop-up appears when clicking on 'Feedback' icon`, async function () {
			await statusBar.clickOn(StatusBarElement.FEEDBACK_ICON);
			assert.ok(await statusBar.getFeedbackView());
		});

		it(`checks if 'Go to Line' works if called from the status bar`, async function () {
			await common.openFirstMatchFile('app.js');
			await statusBar.clickOn(StatusBarElement.SELECTION_STATUS);
			const lineNumber = 15;
			await common.type(lineNumber.toString());
			await common.enter();
			assert.ok(await statusBar.getEditorHighlightedLine(lineNumber));
		});

		it(`verifies if changing EOL is reflected in the status bar`, async function () {
			await common.openFirstMatchFile('app.js');
			await statusBar.clickOn(StatusBarElement.EOL_STATUS);
			await common.selectNextQuickOpenElement();
			await common.enter();
			const currentEOL = await statusBar.getEOLMode();
			assert.equal(currentEOL, 'CRLF');
		});
	});

	context('Tasks', function () {
		let tasks: Tasks;

		beforeEach(async function () {
			app = new SpectronApplication(latestPath, this.currentTest.fullTitle(), (this.currentTest as any).currentRetry(), [workspacePath]);
			tasks = new Tasks(app);

			return await app.start();
		});
		afterEach(async function () {
			return await app.stop();
		});

		it('verifies that build task produces 6 errors', async function () {
			await tasks.build();
			const res = await tasks.getOutputResult();
			assert.equal(res, '✖ 6 problems (6 errors, 0 warnings)');
		});
		
		it(`is able to select 'Git' output`, async function () {
			await tasks.build();
			await app.wait();
			await tasks.selectOutputViewType('Git');
			const viewType = await tasks.getOutputViewType();
			assert.equal(viewType, 'Git');
		});

		it('ensures that build task produces errors in index.js', async function () {
			await tasks.build();
			assert.ok(await tasks.firstOutputLineEndsWith('index.js'));
		});

		it(`verifies build errors are reflected in 'Problems View'`, async function () {		
			await tasks.build();
			await app.wait();
			await tasks.openProblemsView();
			const problemName = await tasks.getProblemsViewFirstElementName();
			assert.equal(problemName, 'index.js');
			const problemsCount = await tasks.getProblemsViewFirstElementCount();
			assert.equal(problemsCount, '6');
		});
	});

	context('Extensions', function () {
		let extensions: Extensions;

		beforeEach(async function () {
			app = new SpectronApplication(latestPath, this.currentTest.fullTitle(), (this.currentTest as any).currentRetry(), [workspacePath], [`--extensions-dir=${tempExtensionsDir}`]);
			common = new CommonActions(app);
			extensions = new Extensions(app, common);
			await common.removeDirectory(tempExtensionsDir);

			return await app.start();
		});
		afterEach(async function () {
			await app.stop();
			return await common.removeDirectory(tempExtensionsDir);
		});

		it(`installs 'vscode-icons' extension and verifies reload is prompted`, async function () {
			await extensions.openExtensionsViewlet();
			await extensions.searchForExtension('vscode-icons');
			await app.wait();
			await extensions.installFirstResult();
			await app.wait();
			assert.ok(await extensions.getFirstReloadText());
		});

		it(`installs an extension and checks if it works on restart`, async function () {
			await extensions.openExtensionsViewlet();
			await extensions.searchForExtension('vscode-icons');
			await app.wait();
			await extensions.installFirstResult();
			await app.wait();
			await extensions.getFirstReloadText();
			
			await app.stop();
			await app.wait(); // wait until all resources are released (e.g. locked local storage) 
			await app.start();
			await extensions.selectMinimalIconsTheme();
			const x = await extensions.verifyFolderIconAppearance();
			assert.ok(x);
		});
	});

	context('Localization', function () {
		afterEach(async function () {
			return await app.stop();
		});

		it(`starts with 'DE' locale and verifies title and viewlets text is in German`, async function () {
			app = new SpectronApplication(latestPath, this.test.fullTitle(), this.test.currentRetry(), [workspacePath, '--locale=DE'], [`--user-data-dir=${tempUserDir}`]);
			common = new CommonActions(app);
			const locale = new Localization(app);
			common.removeDirectory(tempUserDir);

			await app.start();
			
			// Do not run until experiments are finished over the first-time startup behaviour.
			// let expectedTitle = 'Willkommen — vscode-smoketest-express';
			// if (process.platform !== 'darwin') {
			// 	expectedTitle += ' — Visual Studio Code';
			// 	if (insiders) expectedTitle += ' - Insiders';
			// }
			// assert.equal(await common.getWindowTitle(), expectedTitle);

			let text = await locale.getOpenEditorsText();
			assert.equal(text.toLowerCase(), 'geöffnete editoren');

			await locale.openViewlet(ViewletType.SEARCH);
			text = await locale.getOpenedViewletTitle()
			assert.equal(text.toLowerCase(), 'suchen');

			await locale.openViewlet(ViewletType.SCM);
			text = await locale.getOpenedViewletTitle();
			assert.equal(text.toLowerCase(), 'quellcodeverwaltung: git');

			await locale.openViewlet(ViewletType.DEBUG);
			text = await locale.getOpenedViewletTitle();
			assert.equal(text.toLowerCase(), 'debuggen');

			await locale.openViewlet(ViewletType.EXTENSIONS);
			text = await locale.getExtensionsSearchPlaceholder();
			assert.equal(text.toLowerCase(), 'nach erweiterungen im marketplace suchen');
		});
	});
	
});