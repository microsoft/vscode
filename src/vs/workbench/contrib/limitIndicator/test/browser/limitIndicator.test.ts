/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import Severity from '../../../../../base/common/severity.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IDiffEditor } from '../../../../../editor/browser/editorBrowser.js';
import { EditorType } from '../../../../../editor/common/editorCommon.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { MarkerDecorationsService } from '../../../../../editor/common/services/markerDecorationsService.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ColorDetector, DecoratorLimitReporter } from '../../../../../editor/contrib/colorPicker/browser/colorDetector.js';
import { FoldingController, RangesLimitReporter } from '../../../../../editor/contrib/folding/browser/folding.js';
import { createCodeEditorServices, instantiateTestCodeEditor, ITestCodeEditor } from '../../../../../editor/test/browser/testCodeEditor.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MarkerSeverity } from '../../../../../platform/markers/common/markers.js';
import { MarkerService } from '../../../../../platform/markers/common/markerService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ILanguageStatus, ILanguageStatusService } from '../../../../services/languageStatus/common/languageStatusService.js';
import { LimitIndicatorContribution } from '../../browser/limitIndicator.contribution.js';

suite('LimitIndicatorContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let instantiationService: TestInstantiationService;
	let modelService: IModelService;
	let markerService: MarkerService;
	let decorationService: MarkerDecorationsService;
	let editor: ITestCodeEditor;
	let activeEditor: IEditorService['activeTextEditorControl'];
	let activeEditorChanged: Emitter<void>;
	let editorService: IEditorService;
	let languageStatusService: ILanguageStatusService;
	let statuses: Set<ILanguageStatus>;
	let contribution: LimitIndicatorContribution;

	setup(() => {
		instantiationService = createCodeEditorServices(disposables);
		modelService = instantiationService.get(IModelService);
		markerService = disposables.add(new MarkerService());
		decorationService = disposables.add(new MarkerDecorationsService(modelService, markerService));
		editor = disposables.add(instantiateTestCodeEditor(instantiationService, createModel()));
		activeEditor = editor;
		activeEditorChanged = disposables.add(new Emitter<void>());
		statuses = new Set();
		editorService = new class extends mock<IEditorService>() {
			override readonly onDidActiveEditorChange = activeEditorChanged.event;
			override get activeTextEditorControl() { return activeEditor; }
		};
		languageStatusService = new class extends mock<ILanguageStatusService>() {
			override addStatus(status: ILanguageStatus) {
				statuses.add(status);
				return toDisposable(() => statuses.delete(status));
			}
		};
		contribution = disposables.add(new LimitIndicatorContribution(editorService, languageStatusService, decorationService));
	});

	function createModel(): ITextModel {
		return disposables.add(modelService.createModel(Array.from({ length: 600 }, () => 'value').join('\n'), null));
	}

	function setActiveEditor(control: IEditorService['activeTextEditorControl']): void {
		activeEditor = control;
		activeEditorChanged.fire();
	}

	async function changeMarkers(model: ITextModel, count: number, owner = 'test'): Promise<void> {
		const changed = Event.toPromise(markerService.onMarkerChanged);
		markerService.changeOne(owner, model.uri, Array.from({ length: count }, (_, index) => ({
			severity: MarkerSeverity.Error,
			message: `problem ${index + 1}`,
			startLineNumber: index + 1,
			startColumn: 1,
			endLineNumber: index + 1,
			endColumn: 2
		})));
		await changed;
	}

	test('shows a warning without a Configure action only when diagnostics overflow', async () => {
		await changeMarkers(editor.getModel(), 500);
		const atLimit = [...statuses];
		await changeMarkers(editor.getModel(), 1, 'overflow');
		const overflowing = [...statuses];
		await changeMarkers(editor.getModel(), 0, 'overflow');

		assert.deepStrictEqual({ atLimit, overflowing, restored: [...statuses] }, {
			atLimit: [],
			overflowing: [{
				id: 'diagnosticsLimitInfo',
				selector: '*',
				name: 'Diagnostic Highlight Status',
				severity: Severity.Warning,
				label: 'Diagnostic highlights',
				detail: 'only 500 shown for performance reasons',
				command: undefined,
				accessibilityInfo: undefined,
				source: 'Diagnostics',
				busy: false
			}],
			restored: []
		});
	});

	test('shows existing overflow when the contribution is initialized', async () => {
		contribution.dispose();
		await changeMarkers(editor.getModel(), 501);
		contribution = disposables.add(new LimitIndicatorContribution(editorService, languageStatusService, decorationService));

		assert.deepStrictEqual([...statuses].map(status => status.id), ['diagnosticsLimitInfo']);
	});

	test('follows model changes in the same editor, including an empty editor', async () => {
		const affected = editor.getModel();
		const unaffected = createModel();
		await changeMarkers(affected, 501);
		const counts = [statuses.size];

		editor.setModel(unaffected);
		counts.push(statuses.size);
		editor.setModel(affected);
		counts.push(statuses.size);
		editor.setModel(null);
		counts.push(statuses.size);
		editor.setModel(affected);
		counts.push(statuses.size);
		affected.dispose();
		counts.push(statuses.size);

		assert.deepStrictEqual(counts, [1, 0, 1, 0, 1, 0]);
	});

	test('follows the active split editor and ignores background diagnostics', async () => {
		const affected = editor.getModel();
		const otherEditor = disposables.add(instantiateTestCodeEditor(instantiationService, createModel()));
		await changeMarkers(affected, 501);
		const counts = [statuses.size];

		setActiveEditor(otherEditor);
		counts.push(statuses.size);
		await changeMarkers(affected, 600);
		counts.push(statuses.size);
		setActiveEditor(editor);
		counts.push(statuses.size);
		otherEditor.setModel(affected);
		setActiveEditor(otherEditor);
		counts.push(statuses.size);
		await changeMarkers(affected, 500);
		counts.push(statuses.size);
		setActiveEditor(editor);
		counts.push(statuses.size);
		await changeMarkers(affected, 501);
		counts.push(statuses.size);
		setActiveEditor(undefined);
		counts.push(statuses.size);

		assert.deepStrictEqual(counts, [1, 0, 0, 1, 1, 0, 0, 1, 0]);
	});

	test('does not recreate the active warning for another resource', async () => {
		await changeMarkers(editor.getModel(), 501);
		const status = [...statuses][0];
		await changeMarkers(createModel(), 600);

		assert.strictEqual([...statuses][0], status);
	});

	test('does not recreate the warning while diagnostics remain over the limit', async () => {
		await changeMarkers(editor.getModel(), 501);
		const status = [...statuses][0];
		await changeMarkers(editor.getModel(), 600);

		assert.strictEqual([...statuses][0], status);
	});

	test('uses the modified editor in a diff', async () => {
		const modifiedEditor = disposables.add(instantiateTestCodeEditor(instantiationService, createModel()));
		await changeMarkers(editor.getModel(), 501);
		setActiveEditor(new class extends mock<IDiffEditor>() {
			override getEditorType() { return EditorType.IDiffEditor; }
			override getOriginalEditor() { return editor; }
			override getModifiedEditor() { return modifiedEditor; }
		});
		const counts = [statuses.size];
		await changeMarkers(modifiedEditor.getModel(), 501);
		counts.push(statuses.size);
		await changeMarkers(modifiedEditor.getModel(), 500);
		counts.push(statuses.size);

		assert.deepStrictEqual(counts, [0, 1, 0]);
	});

	test('respects validation visibility and read-only changes', async () => {
		await changeMarkers(editor.getModel(), 501);
		const counts = [statuses.size];

		editor.updateOptions({ renderValidationDecorations: 'off' });
		counts.push(statuses.size);
		editor.updateOptions({ renderValidationDecorations: 'on' });
		counts.push(statuses.size);
		editor.updateOptions({ readOnly: true });
		counts.push(statuses.size);
		editor.updateOptions({ renderValidationDecorations: 'editable' });
		counts.push(statuses.size);
		editor.updateOptions({ readOnly: false });
		counts.push(statuses.size);

		assert.deepStrictEqual(counts, [1, 0, 1, 1, 0, 1]);
	});

	test('clears and restores the warning when diagnostics are filtered', async () => {
		const model = editor.getModel();
		await changeMarkers(model, 501);
		const counts = [statuses.size];

		const filtered = Event.toPromise(markerService.onMarkerChanged);
		const filter = disposables.add(markerService.installResourceFilter(model.uri, 'test'));
		await filtered;
		counts.push(statuses.size);
		const unfiltered = Event.toPromise(markerService.onMarkerChanged);
		filter.dispose();
		await unfiltered;
		counts.push(statuses.size);

		assert.deepStrictEqual(counts, [1, 0, 1]);
	});

	test('keeps Configure actions for folding and color limits', async () => {
		contribution.dispose();
		const colorReporter = disposables.add(new DecoratorLimitReporter());
		const foldingReporter = disposables.add(new RangesLimitReporter(editor));
		editor.registerAndInstantiateContribution(ColorDetector.ID, class extends mock<ColorDetector>() {
			override get limitReporter() { return colorReporter; }
			override dispose() { }
		});
		editor.registerAndInstantiateContribution(FoldingController.ID, class extends mock<FoldingController>() {
			override get limitReporter() { return foldingReporter; }
			override dispose() { }
		});
		colorReporter.update(3, 1);
		foldingReporter.update(10, 5);
		contribution = disposables.add(new LimitIndicatorContribution(editorService, languageStatusService, decorationService));
		await changeMarkers(editor.getModel(), 501);

		assert.deepStrictEqual([...statuses].map(status => ({ id: status.id, detail: status.detail, command: status.command })), [
			{
				id: 'decoratorsLimitInfo',
				detail: 'only 1 shown for performance reasons',
				command: { id: 'workbench.action.openSettings', arguments: ['editor.colorDecoratorsLimit'], title: 'Configure' }
			},
			{
				id: 'foldingLimitInfo',
				detail: 'only 5 shown for performance reasons',
				command: { id: 'workbench.action.openSettings', arguments: ['editor.foldingMaximumRegions'], title: 'Configure' }
			},
			{ id: 'diagnosticsLimitInfo', detail: 'only 500 shown for performance reasons', command: undefined }
		]);
	});

	test('disposes its warning and listeners', async () => {
		await changeMarkers(editor.getModel(), 501);
		contribution.dispose();
		await changeMarkers(editor.getModel(), 600);
		editor.updateOptions({ renderValidationDecorations: 'off' });
		editor.updateOptions({ renderValidationDecorations: 'on' });
		setActiveEditor(editor);
		editor.setModel(disposables.add(modelService.createModel('value', null, URI.file('/other.txt'))));
		await changeMarkers(editor.getModel(), 501);

		assert.deepStrictEqual([...statuses], []);
	});
});
