/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { setupInstantiationService, withTestNotebook } from 'vs/workbench/contrib/notebook/test/browser/testNotebookEditor';
import { OutlineTarget } from 'vs/workbench/services/outline/browser/outline';
import { IFileIconTheme, IThemeService } from 'vs/platform/theme/common/themeService';
import { mock } from 'vs/base/test/common/mock';
import { Event } from 'vs/base/common/event';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IMarkerService } from 'vs/platform/markers/common/markers';
import { MarkerService } from 'vs/platform/markers/common/markerService';
import { CellKind, IOutputDto, NotebookCellMetadata } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { IActiveNotebookEditor, INotebookEditorPane } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { NotebookCellOutline } from 'vs/workbench/contrib/notebook/browser/contrib/outline/notebookOutline';

suite('Notebook Outline', function () {

	let disposables: DisposableStore;
	let instantiationService: TestInstantiationService;

	suiteSetup(() => {
		disposables = new DisposableStore();
		instantiationService = setupInstantiationService(disposables);
		instantiationService.set(IEditorService, new class extends mock<IEditorService>() { });
		instantiationService.set(IMarkerService, new MarkerService());
		instantiationService.set(IThemeService, new class extends mock<IThemeService>() {
			override onDidFileIconThemeChange = Event.None;
			override getFileIconTheme(): IFileIconTheme {
				return { hasFileIcons: true, hasFolderIcons: true, hidesExplorerArrows: false };
			}
		});
	});

	suiteTeardown(() => disposables.dispose());

	function withNotebookOutline<R = any>(cells: [source: string, lang: string, kind: CellKind, output?: IOutputDto[], metadata?: NotebookCellMetadata][], callback: (outline: NotebookCellOutline, editor: IActiveNotebookEditor) => R): Promise<R> {
		return withTestNotebook(cells, (editor) => {
			if (!editor.hasModel()) {
				assert.ok(false, 'MUST have active text editor');
			}
			const outline = instantiationService.createInstance(NotebookCellOutline, new class extends mock<INotebookEditorPane>() {
				override getControl() {
					return editor;
				}
				override onDidChangeModel: Event<void> = Event.None;
			}, OutlineTarget.OutlinePane);
			return callback(outline, editor);
		});

	}

	test('basic', async function () {
		await withNotebookOutline([], outline => {
			assert.ok(outline instanceof NotebookCellOutline);
			assert.deepStrictEqual(outline.config.quickPickDataSource.getQuickPickElements(), []);
		});
	});

	test('special characters in heading', async function () {
		await withNotebookOutline([
			['# Hellö & Hällo', 'md', CellKind.Markup]
		], outline => {
			assert.ok(outline instanceof NotebookCellOutline);
			assert.deepStrictEqual(outline.config.quickPickDataSource.getQuickPickElements().length, 1);
			assert.deepStrictEqual(outline.config.quickPickDataSource.getQuickPickElements()[0].label, 'Hellö & Hällo');
		});

		await withNotebookOutline([
			['# bo<i>ld</i>', 'md', CellKind.Markup]
		], outline => {
			assert.ok(outline instanceof NotebookCellOutline);
			assert.deepStrictEqual(outline.config.quickPickDataSource.getQuickPickElements().length, 1);
			assert.deepStrictEqual(outline.config.quickPickDataSource.getQuickPickElements()[0].label, 'bold');
		});
	});

	test('Notebook falsely detects "empty cells"', async function () {
		await withNotebookOutline([
			['  的时代   ', 'md', CellKind.Markup]
		], outline => {
			assert.ok(outline instanceof NotebookCellOutline);
			assert.deepStrictEqual(outline.config.quickPickDataSource.getQuickPickElements().length, 1);
			assert.deepStrictEqual(outline.config.quickPickDataSource.getQuickPickElements()[0].label, '的时代');
		});

		await withNotebookOutline([
			['   ', 'md', CellKind.Markup]
		], outline => {
			assert.ok(outline instanceof NotebookCellOutline);
			assert.deepStrictEqual(outline.config.quickPickDataSource.getQuickPickElements().length, 1);
			assert.deepStrictEqual(outline.config.quickPickDataSource.getQuickPickElements()[0].label, 'empty cell');
		});

		await withNotebookOutline([
			['+++++[]{}--)(0  ', 'md', CellKind.Markup]
		], outline => {
			assert.ok(outline instanceof NotebookCellOutline);
			assert.deepStrictEqual(outline.config.quickPickDataSource.getQuickPickElements().length, 1);
			assert.deepStrictEqual(outline.config.quickPickDataSource.getQuickPickElements()[0].label, '+++++[]{}--)(0');
		});

		await withNotebookOutline([
			['+++++[]{}--)(0 Hello **&^ ', 'md', CellKind.Markup]
		], outline => {
			assert.ok(outline instanceof NotebookCellOutline);
			assert.deepStrictEqual(outline.config.quickPickDataSource.getQuickPickElements().length, 1);
			assert.deepStrictEqual(outline.config.quickPickDataSource.getQuickPickElements()[0].label, '+++++[]{}--)(0 Hello **&^');
		});

		await withNotebookOutline([
			['!@#$\n Überschrïft', 'md', CellKind.Markup]
		], outline => {
			assert.ok(outline instanceof NotebookCellOutline);
			assert.deepStrictEqual(outline.config.quickPickDataSource.getQuickPickElements().length, 1);
			assert.deepStrictEqual(outline.config.quickPickDataSource.getQuickPickElements()[0].label, '!@#$');
		});
	});

	test('Heading text defines entry label', async function () {
		return await withNotebookOutline([
			['foo\n # h1', 'md', CellKind.Markup]
		], outline => {
			assert.ok(outline instanceof NotebookCellOutline);
			assert.deepStrictEqual(outline.config.quickPickDataSource.getQuickPickElements().length, 1);
			assert.deepStrictEqual(outline.config.quickPickDataSource.getQuickPickElements()[0].label, 'h1');
		});
	});

	test('Notebook outline ignores markdown headings #115200', async function () {
		await withNotebookOutline([
			['## h2 \n# h1', 'md', CellKind.Markup]
		], outline => {
			assert.ok(outline instanceof NotebookCellOutline);
			assert.deepStrictEqual(outline.config.quickPickDataSource.getQuickPickElements().length, 2);
			assert.deepStrictEqual(outline.config.quickPickDataSource.getQuickPickElements()[0].label, 'h2');
			assert.deepStrictEqual(outline.config.quickPickDataSource.getQuickPickElements()[1].label, 'h1');
		});

		await withNotebookOutline([
			['## h2', 'md', CellKind.Markup],
			['# h1', 'md', CellKind.Markup]
		], outline => {
			assert.ok(outline instanceof NotebookCellOutline);
			assert.deepStrictEqual(outline.config.quickPickDataSource.getQuickPickElements().length, 2);
			assert.deepStrictEqual(outline.config.quickPickDataSource.getQuickPickElements()[0].label, 'h2');
			assert.deepStrictEqual(outline.config.quickPickDataSource.getQuickPickElements()[1].label, 'h1');
		});
	});
});
