/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { join } from 'path';
import { CancellationTokenSource, commands, MarkdownString, TabInputNotebook, Position, QuickPickItem, Selection, StatusBarAlignment, TextEditor, TextEditorSelectionChangeKind, TextEditorViewColumnChangeEvent, TabInputText, Uri, ViewColumn, window, workspace, TabInputTextDiff, UIKind, env } from 'vscode';
import { assertNoRpc, closeAllEditors, createRandomFile, pathEquals } from '../utils';


suite('vscode API - window', () => {

	teardown(async function () {
		assertNoRpc();
		await closeAllEditors();
	});

	test('editor, active text editor', async () => {
		const doc = await workspace.openTextDocument(join(workspace.rootPath || '', './far.js'));
		await window.showTextDocument(doc);
		const active = window.activeTextEditor;
		assert.ok(active);
		assert.ok(pathEquals(active!.document.uri.fsPath, doc.uri.fsPath));
	});

	test('editor, opened via resource', () => {
		const uri = Uri.file(join(workspace.rootPath || '', './far.js'));
		return window.showTextDocument(uri).then((_editor) => {
			const active = window.activeTextEditor;
			assert.ok(active);
			assert.ok(pathEquals(active!.document.uri.fsPath, uri.fsPath));
		});
	});

	// test('editor, UN-active text editor', () => {
	// 	assert.strictEqual(window.visibleTextEditors.length, 0);
	// 	assert.ok(window.activeTextEditor === undefined);
	// });

	test('editor, assign and check view columns', async () => {
		const doc = await workspace.openTextDocument(join(workspace.rootPath || '', './far.js'));
		const p1 = window.showTextDocument(doc, ViewColumn.One).then(editor => {
			assert.strictEqual(editor.viewColumn, ViewColumn.One);
		});
		const p2 = window.showTextDocument(doc, ViewColumn.Two).then(editor_1 => {
			assert.strictEqual(editor_1.viewColumn, ViewColumn.Two);
		});
		const p3 = window.showTextDocument(doc, ViewColumn.Three).then(editor_2 => {
			assert.strictEqual(editor_2.viewColumn, ViewColumn.Three);
		});
		return Promise.all([p1, p2, p3]);
	});

	test('editor, onDidChangeVisibleTextEditors', async () => {
		let eventCounter = 0;
		const reg = window.onDidChangeVisibleTextEditors(_editor => {
			eventCounter += 1;
		});

		const doc = await workspace.openTextDocument(join(workspace.rootPath || '', './far.js'));
		await window.showTextDocument(doc, ViewColumn.One);
		assert.strictEqual(eventCounter, 1);

		await window.showTextDocument(doc, ViewColumn.Two);
		assert.strictEqual(eventCounter, 2);

		await window.showTextDocument(doc, ViewColumn.Three);
		assert.strictEqual(eventCounter, 3);

		reg.dispose();
	});

	test('editor, onDidChangeTextEditorViewColumn (close editor)', () => {

		let actualEvent: TextEditorViewColumnChangeEvent;

		const registration1 = workspace.registerTextDocumentContentProvider('bikes', {
			provideTextDocumentContent() {
				return 'mountainbiking,roadcycling';
			}
		});

		return Promise.all([
			workspace.openTextDocument(Uri.parse('bikes://testing/one')).then(doc => window.showTextDocument(doc, ViewColumn.One)),
			workspace.openTextDocument(Uri.parse('bikes://testing/two')).then(doc => window.showTextDocument(doc, ViewColumn.Two))
		]).then(async editors => {

			const [one, two] = editors;

			await new Promise<void>(resolve => {
				const registration2 = window.onDidChangeTextEditorViewColumn(event => {
					actualEvent = event;
					registration2.dispose();
					resolve();
				});
				// close editor 1, wait a little for the event to bubble
				one.hide();
			});
			assert.ok(actualEvent);
			assert.ok(actualEvent.textEditor === two);
			assert.ok(actualEvent.viewColumn === two.viewColumn);

			registration1.dispose();
		});
	});

	test('editor, onDidChangeTextEditorViewColumn (move editor group)', () => {

		const actualEvents: TextEditorViewColumnChangeEvent[] = [];

		const registration1 = workspace.registerTextDocumentContentProvider('bikes', {
			provideTextDocumentContent() {
				return 'mountainbiking,roadcycling';
			}
		});

		return Promise.all([
			workspace.openTextDocument(Uri.parse('bikes://testing/one')).then(doc => window.showTextDocument(doc, ViewColumn.One)),
			workspace.openTextDocument(Uri.parse('bikes://testing/two')).then(doc => window.showTextDocument(doc, ViewColumn.Two))
		]).then(editors => {

			const [, two] = editors;
			two.show();

			return new Promise<void>(resolve => {

				const registration2 = window.onDidChangeTextEditorViewColumn(event => {
					actualEvents.push(event);

					if (actualEvents.length === 2) {
						registration2.dispose();
						resolve();
					}
				});

				// move active editor group left
				return commands.executeCommand('workbench.action.moveActiveEditorGroupLeft');

			}).then(() => {
				assert.strictEqual(actualEvents.length, 2);

				for (const event of actualEvents) {
					assert.strictEqual(event.viewColumn, event.textEditor.viewColumn);
				}

				registration1.dispose();
			});
		});
	});

	test('active editor not always correct... #49125', async function () {

		if (!window.state.focused) {
			// no focus!
			this.skip();
			return;
		}

		if (process.env['BUILD_SOURCEVERSION'] || process.env['CI']) {
			this.skip();
			return;
		}
		function assertActiveEditor(editor: TextEditor) {
			if (window.activeTextEditor === editor) {
				assert.ok(true);
				return;
			}
			function printEditor(editor: TextEditor): string {
				return `doc: ${editor.document.uri.toString()}, column: ${editor.viewColumn}, active: ${editor === window.activeTextEditor}`;
			}
			const visible = window.visibleTextEditors.map(editor => printEditor(editor));
			assert.ok(false, `ACTIVE editor should be ${printEditor(editor)}, BUT HAVING ${visible.join(', ')}`);

		}

		const randomFile1 = await createRandomFile();
		const randomFile2 = await createRandomFile();

		const [docA, docB] = await Promise.all([
			workspace.openTextDocument(randomFile1),
			workspace.openTextDocument(randomFile2)
		]);
		for (let c = 0; c < 4; c++) {
			const editorA = await window.showTextDocument(docA, ViewColumn.One);
			assertActiveEditor(editorA);

			const editorB = await window.showTextDocument(docB, ViewColumn.Two);
			assertActiveEditor(editorB);
		}
	});

	test('editor, opening multiple at the same time #134786', async () => {
		const fileA = await createRandomFile();
		const fileB = await createRandomFile();
		const fileC = await createRandomFile();

		const testFiles = [fileA, fileB, fileC];
		const result = await Promise.all(testFiles.map(async testFile => {
			try {
				const doc = await workspace.openTextDocument(testFile);
				const editor = await window.showTextDocument(doc);

				return editor.document.uri;
			} catch (error) {
				return undefined;
			}
		}));

		// verify the result array matches our expectations: depending
		// on execution time there are 2 possible results for the first
		// two entries. For the last entry there is only the `fileC` URI
		// as expected result because it is the last editor opened.
		// - either `undefined` indicating that the opening of the editor
		//   was cancelled by the next editor opening
		// - or the expected `URI` that was opened in case it suceeds

		assert.strictEqual(result.length, 3);
		if (result[0]) {
			assert.strictEqual(result[0].toString(), fileA.toString());
		} else {
			assert.strictEqual(result[0], undefined);
		}
		if (result[1]) {
			assert.strictEqual(result[1].toString(), fileB.toString());
		} else {
			assert.strictEqual(result[1], undefined);
		}
		assert.strictEqual(result[2]?.toString(), fileC.toString());
	});

	test('default column when opening a file', async () => {
		const [docA, docB, docC] = await Promise.all([
			workspace.openTextDocument(await createRandomFile()),
			workspace.openTextDocument(await createRandomFile()),
			workspace.openTextDocument(await createRandomFile())
		]);

		await window.showTextDocument(docA, ViewColumn.One);
		await window.showTextDocument(docB, ViewColumn.Two);

		assert.ok(window.activeTextEditor);
		assert.ok(window.activeTextEditor!.document === docB);
		assert.strictEqual(window.activeTextEditor!.viewColumn, ViewColumn.Two);

		const editor = await window.showTextDocument(docC);
		assert.ok(
			window.activeTextEditor === editor,
			`wanted fileName:${editor.document.fileName}/viewColumn:${editor.viewColumn} but got fileName:${window.activeTextEditor!.document.fileName}/viewColumn:${window.activeTextEditor!.viewColumn}. a:${docA.fileName}, b:${docB.fileName}, c:${docC.fileName}`
		);
		assert.ok(window.activeTextEditor!.document === docC);
		assert.strictEqual(window.activeTextEditor!.viewColumn, ViewColumn.Two);
	});

	test('showTextDocument ViewColumn.BESIDE', async () => {
		const [docA, docB, docC] = await Promise.all([
			workspace.openTextDocument(await createRandomFile()),
			workspace.openTextDocument(await createRandomFile()),
			workspace.openTextDocument(await createRandomFile())
		]);

		await window.showTextDocument(docA, ViewColumn.One);
		await window.showTextDocument(docB, ViewColumn.Beside);

		assert.ok(window.activeTextEditor);
		assert.ok(window.activeTextEditor!.document === docB);
		assert.strictEqual(window.activeTextEditor!.viewColumn, ViewColumn.Two);

		await window.showTextDocument(docC, ViewColumn.Beside);

		assert.ok(window.activeTextEditor!.document === docC);
		assert.strictEqual(window.activeTextEditor!.viewColumn, ViewColumn.Three);
	});

	test('showTextDocument ViewColumn is always defined (even when opening > ViewColumn.Nine)', async () => {
		const [doc1, doc2, doc3, doc4, doc5, doc6, doc7, doc8, doc9, doc10] = await Promise.all([
			workspace.openTextDocument(await createRandomFile()),
			workspace.openTextDocument(await createRandomFile()),
			workspace.openTextDocument(await createRandomFile()),
			workspace.openTextDocument(await createRandomFile()),
			workspace.openTextDocument(await createRandomFile()),
			workspace.openTextDocument(await createRandomFile()),
			workspace.openTextDocument(await createRandomFile()),
			workspace.openTextDocument(await createRandomFile()),
			workspace.openTextDocument(await createRandomFile()),
			workspace.openTextDocument(await createRandomFile())
		]);

		await window.showTextDocument(doc1, ViewColumn.One);
		await window.showTextDocument(doc2, ViewColumn.Two);
		await window.showTextDocument(doc3, ViewColumn.Three);
		await window.showTextDocument(doc4, ViewColumn.Four);
		await window.showTextDocument(doc5, ViewColumn.Five);
		await window.showTextDocument(doc6, ViewColumn.Six);
		await window.showTextDocument(doc7, ViewColumn.Seven);
		await window.showTextDocument(doc8, ViewColumn.Eight);
		await window.showTextDocument(doc9, ViewColumn.Nine);
		await window.showTextDocument(doc10, ViewColumn.Beside);

		assert.ok(window.activeTextEditor);
		assert.ok(window.activeTextEditor!.document === doc10);
		assert.strictEqual(window.activeTextEditor!.viewColumn, 10);
	});

	test('issue #27408 - showTextDocument & vscode.diff always default to ViewColumn.One', async () => {
		const [docA, docB, docC] = await Promise.all([
			workspace.openTextDocument(await createRandomFile()),
			workspace.openTextDocument(await createRandomFile()),
			workspace.openTextDocument(await createRandomFile())
		]);

		await window.showTextDocument(docA, ViewColumn.One);
		await window.showTextDocument(docB, ViewColumn.Two);

		assert.ok(window.activeTextEditor);
		assert.ok(window.activeTextEditor!.document === docB);
		assert.strictEqual(window.activeTextEditor!.viewColumn, ViewColumn.Two);

		await window.showTextDocument(docC, ViewColumn.Active);

		assert.ok(window.activeTextEditor!.document === docC);
		assert.strictEqual(window.activeTextEditor!.viewColumn, ViewColumn.Two);
	});

	test('issue #5362 - Incorrect TextEditor passed by onDidChangeTextEditorSelection', (done) => {
		const file10Path = join(workspace.rootPath || '', './10linefile.ts');
		const file30Path = join(workspace.rootPath || '', './30linefile.ts');

		let finished = false;
		const failOncePlease = (err: Error) => {
			if (finished) {
				return;
			}
			finished = true;
			done(err);
		};

		const passOncePlease = () => {
			if (finished) {
				return;
			}
			finished = true;
			done(null);
		};

		const subscription = window.onDidChangeTextEditorSelection((e) => {
			const lineCount = e.textEditor.document.lineCount;
			const pos1 = e.textEditor.selections[0].active.line;
			const pos2 = e.selections[0].active.line;

			if (pos1 !== pos2) {
				failOncePlease(new Error('received invalid selection changed event!'));
				return;
			}

			if (pos1 >= lineCount) {
				failOncePlease(new Error(`Cursor position (${pos1}) is not valid in the document ${e.textEditor.document.fileName} that has ${lineCount} lines.`));
				return;
			}
		});

		// Open 10 line file, show it in slot 1, set cursor to line 10
		// Open 30 line file, show it in slot 1, set cursor to line 30
		// Open 10 line file, show it in slot 1
		// Open 30 line file, show it in slot 1
		workspace.openTextDocument(file10Path).then((doc) => {
			return window.showTextDocument(doc, ViewColumn.One);
		}).then((editor10line) => {
			editor10line.selection = new Selection(new Position(9, 0), new Position(9, 0));
		}).then(() => {
			return workspace.openTextDocument(file30Path);
		}).then((doc) => {
			return window.showTextDocument(doc, ViewColumn.One);
		}).then((editor30line) => {
			editor30line.selection = new Selection(new Position(29, 0), new Position(29, 0));
		}).then(() => {
			return workspace.openTextDocument(file10Path);
		}).then((doc) => {
			return window.showTextDocument(doc, ViewColumn.One);
		}).then(() => {
			return workspace.openTextDocument(file30Path);
		}).then((doc) => {
			return window.showTextDocument(doc, ViewColumn.One);
		}).then(() => {
			subscription.dispose();
		}).then(passOncePlease, failOncePlease);
	});

	//#region Tabs API tests
	// test('Tabs - move tab', async function () {
	// 	const [docA, docB, docC] = await Promise.all([
	// 		workspace.openTextDocument(await createRandomFile()),
	// 		workspace.openTextDocument(await createRandomFile()),
	// 		workspace.openTextDocument(await createRandomFile())
	// 	]);

	// 	await window.showTextDocument(docA, { viewColumn: ViewColumn.One, preview: false });
	// 	await window.showTextDocument(docB, { viewColumn: ViewColumn.One, preview: false });
	// 	await window.showTextDocument(docC, { viewColumn: ViewColumn.Two, preview: false });

	// 	const tabGroups = window.tabGroups;
	// 	assert.strictEqual(tabGroups.all.length, 2);

	// 	const group1Tabs = tabGroups.all[0].tabs;
	// 	assert.strictEqual(group1Tabs.length, 2);

	// 	const group2Tabs = tabGroups.all[1].tabs;
	// 	assert.strictEqual(group2Tabs.length, 1);

	// 	await tabGroups.move(group1Tabs[0], ViewColumn.One, 1);
	// });

	// TODO @lramos15 re-enable these once shape is more stable
	test('Tabs - vscode.open & vscode.diff', async function () {
		// Simple function to get the active tab
		const getActiveTab = () => {
			return window.tabGroups.all.find(g => g.isActive)?.activeTab;
		};

		const [docA, docB, docC] = await Promise.all([
			workspace.openTextDocument(await createRandomFile()),
			workspace.openTextDocument(await createRandomFile()),
			workspace.openTextDocument(await createRandomFile())
		]);

		await window.showTextDocument(docA, { viewColumn: ViewColumn.One, preview: false });
		await window.showTextDocument(docB, { viewColumn: ViewColumn.One, preview: false });
		await window.showTextDocument(docC, { viewColumn: ViewColumn.Two, preview: false });

		const commandFile = await createRandomFile();
		await commands.executeCommand('vscode.open', commandFile, ViewColumn.Three);
		// Ensure active tab is correct after calling vscode.opn
		assert.strictEqual(getActiveTab()?.group.viewColumn, ViewColumn.Three);

		const leftDiff = await createRandomFile();
		const rightDiff = await createRandomFile();
		await commands.executeCommand('vscode.diff', leftDiff, rightDiff, 'Diff', { viewColumn: ViewColumn.Four, preview: false });
		assert.strictEqual(getActiveTab()?.group.viewColumn, ViewColumn.Four);

		const tabs = window.tabGroups.all.map(g => g.tabs).flat(1);
		assert.strictEqual(tabs.length, 5);
		assert.ok(tabs[0].input instanceof TabInputText);
		assert.strictEqual(tabs[0].input.uri.toString(), docA.uri.toString());
		assert.ok(tabs[1].input instanceof TabInputText);
		assert.strictEqual(tabs[1].input.uri.toString(), docB.uri.toString());
		assert.ok(tabs[2].input instanceof TabInputText);
		assert.strictEqual(tabs[2].input.uri.toString(), docC.uri.toString());
		assert.ok(tabs[3].input instanceof TabInputText);
		assert.strictEqual(tabs[3].input.uri.toString(), commandFile.toString());
	});

	(env.uiKind === UIKind.Web ? test.skip : test)('Tabs - Ensure tabs getter is correct', async function () {
		// Reduce test timeout as this test should be quick, so even with 3 retries it will be under 60s.
		this.timeout(10000);
		// This test can be flaky because of opening a notebook
		// Sometimes the webview doesn't resolve especially on windows so we will retry 3 times
		this.retries(3);
		const [docA, docB, docC, notebookDoc] = await Promise.all([
			workspace.openTextDocument(await createRandomFile()),
			workspace.openTextDocument(await createRandomFile()),
			workspace.openTextDocument(await createRandomFile()),
			workspace.openNotebookDocument('jupyter-notebook', undefined)
		]);

		await window.showTextDocument(docA, { viewColumn: ViewColumn.One, preview: false });
		await window.showTextDocument(docB, { viewColumn: ViewColumn.Two, preview: false });
		await window.showTextDocument(docC, { viewColumn: ViewColumn.Three, preview: false });
		await window.showNotebookDocument(notebookDoc, { viewColumn: ViewColumn.One, preview: false });

		const leftDiff = await createRandomFile();
		const rightDiff = await createRandomFile();
		await commands.executeCommand('vscode.diff', leftDiff, rightDiff, 'Diff', { viewColumn: ViewColumn.Three, preview: false });

		const tabs = window.tabGroups.all.map(g => g.tabs).flat(1);
		assert.strictEqual(tabs.length, 5);

		// All resources should match the text documents as they're the only tabs currently open
		assert.ok(tabs[0].input instanceof TabInputText);
		assert.strictEqual(tabs[0].input.uri.toString(), docA.uri.toString());
		assert.ok(tabs[1].input instanceof TabInputNotebook);
		assert.strictEqual(tabs[1].input.uri.toString(), notebookDoc.uri.toString());
		assert.ok(tabs[2].input instanceof TabInputText);
		assert.strictEqual(tabs[2].input.uri.toString(), docB.uri.toString());
		assert.ok(tabs[3].input instanceof TabInputText);
		assert.strictEqual(tabs[3].input.uri.toString(), docC.uri.toString());
		// Diff editor and side by side editor report the right side as the resource
		assert.ok(tabs[4].input instanceof TabInputTextDiff);
		assert.strictEqual(tabs[4].input.modified.toString(), rightDiff.toString());

		assert.strictEqual(tabs[0].group.viewColumn, ViewColumn.One);
		assert.strictEqual(tabs[1].group.viewColumn, ViewColumn.One);
		assert.strictEqual(tabs[2].group.viewColumn, ViewColumn.Two);
		assert.strictEqual(tabs[3].group.viewColumn, ViewColumn.Three);
		assert.strictEqual(tabs[4].group.viewColumn, ViewColumn.Three);
	});

	test('Tabs - ensure active tab is correct', async () => {

		const [docA, docB, docC] = await Promise.all([
			workspace.openTextDocument(await createRandomFile()),
			workspace.openTextDocument(await createRandomFile()),
			workspace.openTextDocument(await createRandomFile()),
		]);

		// Function to acquire the active tab within the active group
		const getActiveTabInActiveGroup = () => {
			const activeGroup = window.tabGroups.all.filter(group => group.isActive)[0];
			return activeGroup?.activeTab;
		};

		await window.showTextDocument(docA, { viewColumn: ViewColumn.One, preview: false });
		let activeTab = getActiveTabInActiveGroup();
		assert.ok(activeTab);
		assert.ok(activeTab.input instanceof TabInputText);
		assert.strictEqual(activeTab.input.uri.toString(), docA.uri.toString());

		await window.showTextDocument(docB, { viewColumn: ViewColumn.Two, preview: false });
		activeTab = getActiveTabInActiveGroup();
		assert.ok(activeTab);
		assert.ok(activeTab.input instanceof TabInputText);
		assert.strictEqual(activeTab.input.uri.toString(), docB.uri.toString());

		await window.showTextDocument(docC, { viewColumn: ViewColumn.Three, preview: false });
		activeTab = getActiveTabInActiveGroup();
		assert.ok(activeTab);
		assert.ok(activeTab.input instanceof TabInputText);
		assert.strictEqual(activeTab.input.uri.toString(), docC.uri.toString());

		await commands.executeCommand('workbench.action.closeActiveEditor');
		await commands.executeCommand('workbench.action.closeActiveEditor');
		await commands.executeCommand('workbench.action.closeActiveEditor');

		assert.ok(!getActiveTabInActiveGroup());
	});

	// TODO@lramos15 https://github.com/microsoft/vscode/issues/145846
	// Should ensure to either use existing tab API for modifications
	// or commands that operate on a dedicated editor that is passed
	// in as an argument

	// test('Tabs - verify pinned state', async () => {

	// 	const [docA] = await Promise.all([
	// 		workspace.openTextDocument(await createRandomFile())
	// 	]);

	// 	await window.showTextDocument(docA, { viewColumn: ViewColumn.One, preview: false });

	// 	const tab = window.tabGroups.activeTabGroup?.activeTab;
	// 	assert.ok(tab);

	// 	assert.strictEqual(tab.isPinned, false);

	// 	let onDidChangeTab = asPromise(window.tabGroups.onDidChangeTab);

	// 	await commands.executeCommand('workbench.action.pinEditor');
	// 	await onDidChangeTab;

	// 	assert.strictEqual(tab.isPinned, true);

	// 	onDidChangeTab = asPromise(window.tabGroups.onDidChangeTab);

	// 	await commands.executeCommand('workbench.action.unpinEditor');
	// 	await onDidChangeTab;

	// 	assert.strictEqual(tab.isPinned, false);
	// });

	// test('Tabs - verify preview state', async () => {

	// 	const [docA] = await Promise.all([
	// 		workspace.openTextDocument(await createRandomFile())
	// 	]);

	// 	await window.showTextDocument(docA, { viewColumn: ViewColumn.One, preview: true });

	// 	const tab = window.tabGroups.activeTabGroup?.activeTab;
	// 	assert.ok(tab);

	// 	assert.strictEqual(tab.isPreview, true);

	// 	let onDidChangeTab = asPromise(window.tabGroups.onDidChangeTab);

	// 	await commands.executeCommand('workbench.action.keepEditor');
	// 	await onDidChangeTab;

	// 	assert.strictEqual(tab.isPreview, false);
	// });

	// test('Tabs - verify dirty state', async () => {

	// 	const [docA] = await Promise.all([
	// 		workspace.openTextDocument(await createRandomFile())
	// 	]);

	// 	await window.showTextDocument(docA, { viewColumn: ViewColumn.One, preview: true });

	// 	const tab = window.tabGroups.activeTabGroup?.activeTab;
	// 	assert.ok(tab);

	// 	assert.strictEqual(tab.isDirty, false);
	// 	assert.strictEqual(docA.isDirty, false);

	// 	let onDidChangeTab = asPromise(window.tabGroups.onDidChangeTab);

	// 	const edit = new WorkspaceEdit();
	// 	edit.insert(docA.uri, new Position(0, 0), 'var abc = 0;');
	// 	await workspace.applyEdit(edit);

	// 	await onDidChangeTab;

	// 	assert.strictEqual(tab.isDirty, true);

	// 	onDidChangeTab = asPromise(window.tabGroups.onDidChangeTab);

	// 	await commands.executeCommand('workbench.action.files.save');

	// 	await onDidChangeTab;

	// 	assert.strictEqual(tab.isDirty, false);
	// });

	// test('Tabs - verify active state', async () => {

	// 	const [docA, docB] = await Promise.all([
	// 		workspace.openTextDocument(await createRandomFile()),
	// 		workspace.openTextDocument(await createRandomFile()),
	// 	]);

	// 	await window.showTextDocument(docA, { viewColumn: ViewColumn.One, preview: false });
	// 	await window.showTextDocument(docB, { viewColumn: ViewColumn.One, preview: false });

	// 	const tab = window.tabGroups.activeTabGroup?.tabs;
	// 	assert.strictEqual(tab?.length, 2);

	// 	assert.strictEqual(tab[0].isActive, false);
	// 	assert.strictEqual(tab[1].isActive, true);

	// 	let onDidChangeTab = asPromise(window.tabGroups.onDidChangeTab);

	// 	await window.showTextDocument(docA, { viewColumn: ViewColumn.One, preview: false });

	// 	await onDidChangeTab;

	// 	assert.strictEqual(tab[0].isActive, true);
	// 	assert.strictEqual(tab[1].isActive, false);
	// });

	/*

	test('Tabs - Move Tab', async () => {
		const [docA, docB, docC] = await Promise.all([
			workspace.openTextDocument(await createRandomFile()),
			workspace.openTextDocument(await createRandomFile()),
			workspace.openTextDocument(await createRandomFile()),
		]);
		await window.showTextDocument(docA, { viewColumn: ViewColumn.One, preview: false });
		await window.showTextDocument(docB, { viewColumn: ViewColumn.One, preview: false });
		await window.showTextDocument(docC, { viewColumn: ViewColumn.Two, preview: false });

		const getAllTabs = () => {

		};
		let tabs = window.tabs;
		assert.strictEqual(tabs.length, 3);

		// Move the first tab of Group 1 to be the first tab of Group 2
		await tabs[0].move(0, ViewColumn.Two);
		assert.strictEqual(tabs.length, 3);
		tabs = window.tabs;
		// Tabs should now be B -> A -> C
		assert.strictEqual(tabs[0].resource?.toString(), docB.uri.toString());

		await tabs[2].move(0, ViewColumn.Two);
		assert.strictEqual(tabs.length, 3);
		tabs = window.tabs;
		// Tabs should now be B -> C -> A
		assert.strictEqual(tabs[1].resource?.toString(), docC.uri.toString());
		await tabs[2].move(1000, ViewColumn.Two);
		assert.strictEqual(tabs.length, 3);
		tabs = window.tabs;
		// Tabs should still be B -> C -> A
		assert.strictEqual(tabs[2].resource?.toString(), docA.uri.toString());

		await tabs[1].move(0, ViewColumn.Three);
		assert.strictEqual(tabs.length, 3);
		tabs = window.tabs;
		// Tabs should now be B -> A -> C With C in a new group
		assert.strictEqual(tabs[2].resource?.toString(), docC.uri.toString());
		assert.strictEqual(tabs[2].viewColumn, ViewColumn.Three);

		await commands.executeCommand('workbench.action.closeActiveEditor');
		await commands.executeCommand('workbench.action.closeActiveEditor');
		await commands.executeCommand('workbench.action.closeActiveEditor');

		assert.ok(!window.activeTab);
	});

	test('Tabs - Close Tabs', async () => {
		const [docA, docB, docC] = await Promise.all([
			workspace.openTextDocument(await createRandomFile()),
			workspace.openTextDocument(await createRandomFile()),
			workspace.openTextDocument(await createRandomFile()),
		]);
		await window.showTextDocument(docA, { viewColumn: ViewColumn.One, preview: false });
		await window.showTextDocument(docB, { viewColumn: ViewColumn.One, preview: false });
		await window.showTextDocument(docC, { viewColumn: ViewColumn.Two, preview: false });

		let tabs = window.tabs;
		assert.strictEqual(tabs.length, 3);

		await tabs[0].close();
		tabs = window.tabs;
		assert.strictEqual(tabs.length, 2);
		assert.strictEqual(tabs[0].resource?.toString(), docB.uri.toString());

		await tabs[0].close();
		tabs = window.tabs;
		assert.strictEqual(tabs.length, 1);
		assert.strictEqual(tabs[0].resource?.toString(), docC.uri.toString());

		await tabs[0].close();
		tabs = window.tabs;
		assert.strictEqual(tabs.length, 0);
		assert.strictEqual(tabs.length, 0);
		assert.ok(!window.activeTab);
	});
	*/
	//#endregion

	test('#7013 - input without options', function () {
		const source = new CancellationTokenSource();
		const p = window.showInputBox(undefined, source.token);
		assert.ok(typeof p === 'object');
		source.dispose();
	});

	test('showInputBox - undefined on cancel', async function () {
		const source = new CancellationTokenSource();
		const p = window.showInputBox(undefined, source.token);
		source.cancel();
		const value = await p;
		assert.strictEqual(value, undefined);
	});

	test('showInputBox - cancel early', async function () {
		const source = new CancellationTokenSource();
		source.cancel();
		const p = window.showInputBox(undefined, source.token);
		const value = await p;
		assert.strictEqual(value, undefined);
	});

	test('showInputBox - \'\' on Enter', function () {
		const p = window.showInputBox();
		return Promise.all<any>([
			commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem'),
			p.then(value => assert.strictEqual(value, ''))
		]);
	});

	test('showInputBox - default value on Enter', function () {
		const p = window.showInputBox({ value: 'farboo' });
		return Promise.all<any>([
			p.then(value => assert.strictEqual(value, 'farboo')),
			commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem'),
		]);
	});

	test('showInputBox - `undefined` on Esc', function () {
		const p = window.showInputBox();
		return Promise.all<any>([
			commands.executeCommand('workbench.action.closeQuickOpen'),
			p.then(value => assert.strictEqual(value, undefined))
		]);
	});

	test('showInputBox - `undefined` on Esc (despite default)', function () {
		const p = window.showInputBox({ value: 'farboo' });
		return Promise.all<any>([
			commands.executeCommand('workbench.action.closeQuickOpen'),
			p.then(value => assert.strictEqual(value, undefined))
		]);
	});

	test('showInputBox - value not empty on second try', async function () {
		const one = window.showInputBox({ value: 'notempty' });
		await commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
		assert.strictEqual(await one, 'notempty');
		const two = window.showInputBox({ value: 'notempty' });
		await commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
		assert.strictEqual(await two, 'notempty');
	});

	test('showQuickPick, accept first', async function () {
		const tracker = createQuickPickTracker<string>();
		const first = tracker.nextItem();
		const pick = window.showQuickPick(['eins', 'zwei', 'drei'], {
			onDidSelectItem: tracker.onDidSelectItem
		});
		assert.strictEqual(await first, 'eins');
		await commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
		assert.strictEqual(await pick, 'eins');
		return tracker.done();
	});

	test('showQuickPick, accept second', async function () {
		const tracker = createQuickPickTracker<string>();
		const first = tracker.nextItem();
		const pick = window.showQuickPick(['eins', 'zwei', 'drei'], {
			onDidSelectItem: tracker.onDidSelectItem
		});
		assert.strictEqual(await first, 'eins');
		const second = tracker.nextItem();
		await commands.executeCommand('workbench.action.quickOpenSelectNext');
		assert.strictEqual(await second, 'zwei');
		await commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
		assert.strictEqual(await pick, 'zwei');
		return tracker.done();
	});

	test('showQuickPick, select first two', async function () {
		// const label = 'showQuickPick, select first two';
		// let i = 0;
		const resolves: ((value: string) => void)[] = [];
		let done: () => void;
		const unexpected = new Promise<void>((resolve, reject) => {
			done = () => resolve();
			resolves.push(reject);
		});
		const picks = window.showQuickPick(['eins', 'zwei', 'drei'], {
			onDidSelectItem: item => resolves.pop()!(item as string),
			canPickMany: true
		});
		const first = new Promise(resolve => resolves.push(resolve));
		// console.log(`${label}: ${++i}`);
		await new Promise(resolve => setTimeout(resolve, 100)); // Allow UI to update.
		// console.log(`${label}: ${++i}`);
		await commands.executeCommand('workbench.action.quickOpenSelectNext');
		// console.log(`${label}: ${++i}`);
		assert.strictEqual(await first, 'eins');
		// console.log(`${label}: ${++i}`);
		await commands.executeCommand('workbench.action.quickPickManyToggle');
		// console.log(`${label}: ${++i}`);
		const second = new Promise(resolve => resolves.push(resolve));
		await commands.executeCommand('workbench.action.quickOpenSelectNext');
		// console.log(`${label}: ${++i}`);
		assert.strictEqual(await second, 'zwei');
		// console.log(`${label}: ${++i}`);
		await commands.executeCommand('workbench.action.quickPickManyToggle');
		// console.log(`${label}: ${++i}`);
		await commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
		// console.log(`${label}: ${++i}`);
		assert.deepStrictEqual(await picks, ['eins', 'zwei']);
		// console.log(`${label}: ${++i}`);
		done!();
		return unexpected;
	});

	test('showQuickPick, keep selection (microsoft/vscode-azure-account#67)', async function () {
		const picks = window.showQuickPick([
			{ label: 'eins' },
			{ label: 'zwei', picked: true },
			{ label: 'drei', picked: true }
		], {
			canPickMany: true
		});
		await new Promise<void>(resolve => setTimeout(() => resolve(), 100));
		await commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
		if (await Promise.race([picks, new Promise<boolean>(resolve => setTimeout(() => resolve(false), 100))]) === false) {
			await commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
			if (await Promise.race([picks, new Promise<boolean>(resolve => setTimeout(() => resolve(false), 1000))]) === false) {
				await commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
				if (await Promise.race([picks, new Promise<boolean>(resolve => setTimeout(() => resolve(false), 1000))]) === false) {
					assert.ok(false, 'Picks not resolved!');
				}
			}
		}
		assert.deepStrictEqual((await picks)!.map(pick => pick.label), ['zwei', 'drei']);
	});

	test('showQuickPick, undefined on cancel', function () {
		const source = new CancellationTokenSource();
		const p = window.showQuickPick(['eins', 'zwei', 'drei'], undefined, source.token);
		source.cancel();
		return p.then(value => {
			assert.strictEqual(value, undefined);
		});
	});

	test('showQuickPick, cancel early', function () {
		const source = new CancellationTokenSource();
		source.cancel();
		const p = window.showQuickPick(['eins', 'zwei', 'drei'], undefined, source.token);
		return p.then(value => {
			assert.strictEqual(value, undefined);
		});
	});

	test('showQuickPick, canceled by another picker', function () {

		const source = new CancellationTokenSource();

		const result = window.showQuickPick(['eins', 'zwei', 'drei'], { ignoreFocusOut: true }).then(result => {
			source.cancel();
			assert.strictEqual(result, undefined);
		});

		window.showQuickPick(['eins', 'zwei', 'drei'], undefined, source.token);

		return result;
	});

	test('showQuickPick, canceled by input', function () {

		const result = window.showQuickPick(['eins', 'zwei', 'drei'], { ignoreFocusOut: true }).then(result => {
			assert.strictEqual(result, undefined);
		});

		const source = new CancellationTokenSource();
		window.showInputBox(undefined, source.token);
		source.cancel();

		return result;
	});

	test('showQuickPick, native promise - #11754', async function () {

		const data = new Promise<string[]>(resolve => {
			resolve(['a', 'b', 'c']);
		});

		const source = new CancellationTokenSource();
		const result = window.showQuickPick(data, undefined, source.token);
		source.cancel();
		const value_1 = await result;
		assert.strictEqual(value_1, undefined);
	});

	test('showQuickPick, never resolve promise and cancel - #22453', function () {

		const result = window.showQuickPick(new Promise<string[]>(_resolve => { }));

		const a = result.then(value => {
			assert.strictEqual(value, undefined);
		});
		const b = commands.executeCommand('workbench.action.closeQuickOpen');
		return Promise.all([a, b]);
	});

	test('showWorkspaceFolderPick', async function () {
		const p = window.showWorkspaceFolderPick(undefined);

		await new Promise(resolve => setTimeout(resolve, 10));
		await commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
		const r1 = await Promise.race([p, new Promise<boolean>(resolve => setTimeout(() => resolve(false), 100))]);
		if (r1 !== false) {
			return;
		}
		await commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
		const r2 = await Promise.race([p, new Promise<boolean>(resolve => setTimeout(() => resolve(false), 1000))]);
		if (r2 !== false) {
			return;
		}
		await commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
		const r3 = await Promise.race([p, new Promise<boolean>(resolve => setTimeout(() => resolve(false), 1000))]);
		assert.ok(r3 !== false);
	});

	test('Default value for showInput Box not accepted when it fails validateInput, reversing #33691', async function () {
		const result = window.showInputBox({
			validateInput: (value: string) => {
				if (!value || value.trim().length === 0) {
					return 'Cannot set empty description';
				}
				return null;
			}
		});

		await commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
		await commands.executeCommand('workbench.action.closeQuickOpen');
		assert.strictEqual(await result, undefined);
	});

	function createQuickPickTracker<T extends string | QuickPickItem>() {
		const resolves: ((value: T) => void)[] = [];
		let done: () => void;
		const unexpected = new Promise<void>((resolve, reject) => {
			done = () => resolve();
			resolves.push(reject);
		});
		return {
			onDidSelectItem: (item: T) => resolves.pop()!(item),
			nextItem: () => new Promise<T>(resolve => resolves.push(resolve)),
			done: () => {
				done!();
				return unexpected;
			},
		};
	}


	test('editor, selection change kind', () => {
		return workspace.openTextDocument(join(workspace.rootPath || '', './far.js')).then(doc => window.showTextDocument(doc)).then(editor => {


			return new Promise<void>((resolve, _reject) => {

				const subscription = window.onDidChangeTextEditorSelection(e => {
					assert.ok(e.textEditor === editor);
					assert.strictEqual(e.kind, TextEditorSelectionChangeKind.Command);

					subscription.dispose();
					resolve();
				});

				editor.selection = new Selection(editor.selection.anchor, editor.selection.active.translate(2));
			});

		});
	});

	test('createStatusBar', async function () {
		const statusBarEntryWithoutId = window.createStatusBarItem(StatusBarAlignment.Left, 100);
		assert.strictEqual(statusBarEntryWithoutId.id, 'vscode.vscode-api-tests');
		assert.strictEqual(statusBarEntryWithoutId.alignment, StatusBarAlignment.Left);
		assert.strictEqual(statusBarEntryWithoutId.priority, 100);
		assert.strictEqual(statusBarEntryWithoutId.name, undefined);
		statusBarEntryWithoutId.name = 'Test Name';
		assert.strictEqual(statusBarEntryWithoutId.name, 'Test Name');
		statusBarEntryWithoutId.tooltip = 'Tooltip';
		assert.strictEqual(statusBarEntryWithoutId.tooltip, 'Tooltip');
		statusBarEntryWithoutId.tooltip = new MarkdownString('**bold**');
		assert.strictEqual(statusBarEntryWithoutId.tooltip.value, '**bold**');

		const statusBarEntryWithId = window.createStatusBarItem('testId', StatusBarAlignment.Right, 200);
		assert.strictEqual(statusBarEntryWithId.alignment, StatusBarAlignment.Right);
		assert.strictEqual(statusBarEntryWithId.priority, 200);
		assert.strictEqual(statusBarEntryWithId.id, 'testId');
		assert.strictEqual(statusBarEntryWithId.name, undefined);
		statusBarEntryWithId.name = 'Test Name';
		assert.strictEqual(statusBarEntryWithId.name, 'Test Name');
	});
});
