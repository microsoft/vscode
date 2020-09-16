/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as fs from 'fs';
import * as util from 'util';
import * as path from 'path';
import { Application } from '../../../../automation';
import * as assert from 'assert';
import { ICellData } from '../../../../automation/out/notebook';

function wait(ms: number): Promise<void> {
	return new Promise(r => setTimeout(r, ms));
}

type INotebookActions = Record<string, () => Promise<any>>;

const SLOW = false;

const SCREENSHOT_EACH_STEP = true;

const NUM_TEST_RUNS = process.env['notebook_random_runs'] ? parseInt(process.env['notebook_random_runs']) : 10;
const ACTIONS_PER_TEST = process.env['notebook_random_test_actions'] ? parseInt(process.env['notebook_random_test_actions']) : 35;

export function setup() {
	describe.only('Notebooks keyboard smashing test', () => {
		after(async function () {
			const app = this.app as Application;
			cp.execSync('git checkout . --quiet', { cwd: app.workspacePathOrFolder });
			cp.execSync('git reset --hard origin/master --quiet', { cwd: app.workspacePathOrFolder });
		});

		beforeEach(async function () {
			const app = this.app as Application;
			await app.workbench.notebook.createRealNotebook();
			await app.workbench.quickaccess.runCommand('notifications.clearAll');
			await app.workbench.quickaccess.runCommand('notebook.renderAllMarkdownCells'); // For a cell at an index persisted as edit-mode
			await app.workbench.quickaccess.runCommand('workbench.action.splitEditor');
		});

		afterEach(async function () {
			this.timeout(1000000);

			const app = this.app as Application;
			if (this.currentTest.state === 'failed' && app.pauseAtEnd) {
				console.log(`Done. Pausing...`);
				await wait(1000000);
			}

			await app.workbench.quickaccess.runCommand('workbench.action.files.save');
			await app.workbench.quickaccess.runCommand('workbench.action.closeAllGroups');
		});

		async function runActionListTest(app: Application, actionRunner: NotebookActionRunner) {
			console.log(`Rerunning action list: ${app.notebookActionList}`);
			const content = fs.readFileSync(app.notebookActionList!).toString();
			const actionList = content.trim().split('\n');
			await actionRunner.runActionList(actionList);
		}

		for (let i = 0; i < NUM_TEST_RUNS; i++) {
			it(`test iteration ${i}`, async function () {
				this.timeout(1000 * 60 * 60 * 8); // 8 hours

				const app = this.app as Application;
				await testMain(app);
			});
		}

		async function testMain(app: Application) {
			const actionRunner = new NotebookActionRunner(app);
			try {
				if (app.notebookActionList) {
					await runActionListTest(app, actionRunner);
				} else {
					await actionRunner.doRandomActions(ACTIONS_PER_TEST);
				}
			} catch (e) {
				console.error('Failed: ' + actionRunner.id);
				const notebookPath = path.join(app.workspacePathOrFolder, 'random_smoketest.random-nb');
				if (app.screenshotsPath) {
					const savedNotebookDest = path.join(app.screenshotsPath, actionRunner.id, 'random_smoketest.random-nb.txt');
					await util.promisify(fs.copyFile)(notebookPath, savedNotebookDest);
				}

				throw e;
			}
		}
	});
}

class NotebookActionRunner {
	private readonly actions: INotebookActions;
	public readonly id: string;

	private hasRunCopy = false;

	constructor(
		private readonly app: Application
	) {
		this.actions = getActions(app);
		this.id = String(Math.floor(Date.now() / 1000)).slice(4);
	}

	private isCopyAction(actionKey: string): boolean {
		return !!actionKey.match(/^(copy|cut)/);
	}

	private isPasteAction(actionKey: string): boolean {
		return !!actionKey.match(/^paste/);
	}

	private async doAction(actionKey: string, i: number) {
		console.log(actionKey);
		try {
			await this.actions[actionKey]();
			await this.app.workbench.notebook.stopEditingCell();
		} finally {
			if (SCREENSHOT_EACH_STEP) {
				await this.app.captureScreenshot(`${this.id}/step_${i}_${actionKey}`);
			}
		}

		await this.assertFocusInvariant();
		await this.assertCodeCellLanguageInvariant(await this.app.workbench.notebook.getCellDatas());

		if (SLOW) {
			await wait(1000);
		}
	}

	private async assertLayoutInvariant() {
		await this.actions['focusTop']();
		await this.actions['focusNextEditorGroup']();
		await this.actions['focusTop']();

		await this.app.captureScreenshot(`${this.id}/0_before`);
		await this.app.workbench.quickaccess.runCommand('workbench.action.files.save');

		const originalCells = await this.app.workbench.notebook.getCellDatas();
		for (let group of originalCells) {
			assert.deepEqual(group, originalCells[0], 'Each originalCells group should match the first group');
		}

		await this.app.workbench.quickaccess.runCommand('workbench.action.closeAllGroups');
		await this.app.workbench.notebook.reopenNotebook();
		await this.app.workbench.quickaccess.runCommand('workbench.action.splitEditor');

		try {
			await wait(1000); // Wait for outputs to finish rendering
			const newCells = await this.app.workbench.notebook.getCellDatas();

			// if (originalCells[0].length === 0) {
			// 	assert.equal(newCells[0].length, 1, 'Original was empty, new notebook should have default');
			// 	return;
			// }

			assert.deepEqual(originalCells[0], newCells[0], 'Cells in group 0 before/after should match');
		} catch (e) {
			throw e;
		} finally {
			await this.app.captureScreenshot(`${this.id}/1_after`);
		}
	}

	private async assertFocusInvariant() {
		if (await this.app.workbench.notebook.focusedNotebookIsEmpty()) {
			return;
		}

		try {
			await this.app.workbench.notebook.getFocusedRow();
		} catch (e) {
			console.error(`Failed invariant: a row must always be focused.`);
			throw e;
		}
	}

	private async assertCodeCellLanguageInvariant(datas: ICellData[][]) {
		datas.forEach(group => {
			group.forEach((cellData, i) => {
				if (typeof cellData.editorHeight === 'number' && cellData.language === 'markdown') {
					throw new Error(`Code cell ${i} should not have language "markdown"`);
				}
			});
		});
	}

	private async doRandomAction(i: number) {
		const randomAction = this.selectRandomAction();
		await this.doAction(randomAction, i);
	}

	private selectRandomAction(): string {
		const randomAction = this.getRandomAction();
		if (this.isCopyAction(randomAction)) {
			this.hasRunCopy = true;
		}

		if (this.isPasteAction(randomAction)) {
			return this.selectRandomAction();
		}

		if (this.isPasteAction(randomAction) && !this.hasRunCopy) {
			return this.selectRandomAction();
		}

		return randomAction;
	}

	private getRandomAction(): string {
		const actionKeys = Object.keys(this.actions);
		const randomKeyIdx = Math.floor(Math.random() * actionKeys.length);
		return actionKeys[randomKeyIdx];
	}

	async doRandomActions(n: number) {
		await this.app.captureScreenshot(`${this.id}/z_initial`);

		console.log(`Starting random action run: ${this.id}`);
		for (let i = 0; i < n; i++) {
			await this.doRandomAction(i);
		}

		try {
			await this.assertLayoutInvariant();
		} catch (e) {
			console.error(e);
			if (this.app.pauseAtEnd) {
				console.log(`Done. Pausing...`);
				await wait(1000000);
			}

			throw e;
		}
	}

	async runActionList(actionList: string[]) {
		console.log(`Starting action list run: ${this.id}`);
		await this.app.captureScreenshot(`${this.id}/z_initial`);
		for (let i = 0; i < actionList.length; i++) {
			const actionKey = actionList[i];
			await this.doAction(actionKey, i);
		}

		if (this.app.pauseAtEnd) {
			console.log(`Done. Pausing...`);
			await wait(1000000);
		}

		await this.assertLayoutInvariant();
	}
}

function getActions(app: Application): INotebookActions {
	const n = app.workbench.notebook;
	const qa = app.workbench.quickaccess;
	return {
		insertCodeEmpty: async () => {
			await n.insertNotebookCell('code');
		},
		insertCodeWithLotsOfText: async () => {
			await n.insertNotebookCell('code');
			await n.editCell();
			await n.waitForTypeInEditor('1234567890 1234567890 1234567890 1234567890 1234567890 1234567890 1234567890 1234567890 1234567890 1234567890 1234567890 1234567890 1234567890 ');
		},
		insertMarkdownEmpty: async () => {
			await n.insertNotebookCell('markdown');
		},
		insertMarkdownWithText: async () => {
			await n.insertNotebookCell('markdown');
			await n.editCell();
			await n.waitForTypeInEditor('# top header\n\n## next header\n\n- Here is a\n- bulleted list\n- of content\n\nAnd some **more** text');
		},
		insertMarkdownWithImage: async () => {
			await n.insertNotebookCell('markdown');
			await n.editCell();
			await n.waitForTypeInEditor('![msft](https://upload.wikimedia.org/wikipedia/en/4/4d/Microsoft_logo_%281980%29.png)');
		},
		editCell: async () => {
			if (await n.focusedNotebookIsEmpty()) {
				return;
			}

			await qa.runCommand('notebook.cell.expandCellContent');
			await n.editCell();
			await n.waitForTypeInEditor('more text\n\n');
		},
		focusPrevious: () => n.focusPreviousCell(),
		focusNext: () => n.focusNextCell(),
		focusTop: () => app.code.dispatchKeybinding('cmd+up'),
		focusBottom: async () => {
			await app.code.dispatchKeybinding('cmd+down');
			await app.code.dispatchKeybinding('down');
		},
		moveUp: () => app.code.dispatchKeybinding('alt+up'),
		moveDown: () => app.code.dispatchKeybinding('alt+down'),
		copyCell: () => qa.runCommand('notebook.cell.copy'),
		cutCell: () => qa.runCommand('notebook.cell.cut'),
		pasteCell: () => qa.runCommand('notebook.cell.paste'),
		pasteAboveCell: () => qa.runCommand('notebook.cell.pasteAbove'),
		splitCell: async () => {
			await n.editCell();
			await qa.runCommand('notebook.cell.split');
		},
		joinCellPrevious: async () => {
			await n.editCell();
			await qa.runCommand('notebook.cell.joinAbove');
		},
		joinCellNext: async () => {
			await n.editCell();
			await qa.runCommand('notebook.cell.joinBelow');
		},
		execute: () => app.code.dispatchKeybinding('ctrl+enter'),
		executeNotebook: () => qa.runCommand('notebook.execute'),
		toggleWordWrap: async () => {
			await n.editCell();
			await app.code.dispatchKeybinding('alt+z');
			await app.code.dispatchKeybinding('alt+z');
		},
		changeCellToMarkdown: () => app.code.dispatchKeybinding('m'),
		changeCellToCode: () => app.code.dispatchKeybinding('y'),
		putCellInEditMode: () => n.editCell(),
		deleteCell: () => n.deleteActiveCell(),
		collapseInput: () => qa.runCommand('notebook.cell.collapseCellContent'),
		expandInput: () => qa.runCommand('notebook.cell.expandCellContent'),
		collapseOutput: () => qa.runCommand('notebook.cell.expandCellOutput'),
		expandOutput: () => qa.runCommand('notebook.cell.expandCellOutput'),
		focusNextEditorGroup: () => qa.runCommand('workbench.action.focusNextGroup')
	};
}
