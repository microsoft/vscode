/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { setupInstantiationService, withTestNotebook } from '../testNotebookEditor.js';
import { OutlineTarget } from '../../../../../services/outline/browser/outline.js';
import { IFileIconTheme, IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { Event } from '../../../../../../base/common/event.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IMarkerService } from '../../../../../../platform/markers/common/markers.js';
import { MarkerService } from '../../../../../../platform/markers/common/markerService.js';
import { CellKind, IOutputDto, NotebookCellMetadata } from '../../../common/notebookCommon.js';
import { IActiveNotebookEditor, INotebookEditorPane } from '../../../browser/notebookBrowser.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NotebookCellOutline } from '../../../browser/contrib/outline/notebookOutline.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ILanguageFeaturesService } from '../../../../../../editor/common/services/languageFeatures.js';
import { LanguageFeaturesService } from '../../../../../../editor/common/services/languageFeaturesService.js';
import { IEditorPaneSelectionChangeEvent } from '../../../../../common/editor.js';

suite('Notebook Outline', function () {

	let disposables: DisposableStore;
	let instantiationService: TestInstantiationService;

	teardown(() => disposables.dispose());

	ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		disposables = new DisposableStore();
		instantiationService = setupInstantiationService(disposables);
		instantiationService.set(IEditorService, new class extends mock<IEditorService>() { });
		instantiationService.set(ILanguageFeaturesService, new LanguageFeaturesService());
		instantiationService.set(IMarkerService, disposables.add(new MarkerService()));
		instantiationService.set(IThemeService, new class extends mock<IThemeService>() {
			override onDidFileIconThemeChange = Event.None;
			override getFileIconTheme(): IFileIconTheme {
				return { hasFileIcons: true, hasFolderIcons: true, hidesExplorerArrows: false };
			}
		});
	});


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
				override onDidChangeSelection: Event<IEditorPaneSelectionChangeEvent> = Event.None;
			}, OutlineTarget.OutlinePane);

			disposables.add(outline);
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
