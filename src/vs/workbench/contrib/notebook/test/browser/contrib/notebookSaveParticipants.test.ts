/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { HierarchicalKind } from '../../../../../../base/common/hierarchicalKind.js';
import { IReference } from '../../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IBulkEditOptions, IBulkEditResult, IBulkEditService, ResourceEdit } from '../../../../../../editor/browser/services/bulkEditService.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { WorkspaceEdit } from '../../../../../../editor/common/languages.js';
import { LanguageSelector } from '../../../../../../editor/common/languageSelector.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../../../editor/common/services/languageFeatures.js';
import { LanguageFeaturesService } from '../../../../../../editor/common/services/languageFeaturesService.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../../editor/common/services/resolverService.js';
import { createTextModel } from '../../../../../../editor/test/common/testTextModel.js';
import { IAccessibilitySignalService } from '../../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { NullCommandService } from '../../../../../../platform/commands/test/common/nullCommandService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../../platform/notification/test/common/testNotificationService.js';
import { Progress } from '../../../../../../platform/progress/common/progress.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { CodeActionParticipantUtils } from '../../../browser/contrib/saveParticipants/saveParticipants.js';
import { NotebookTextModel } from '../../../common/model/notebookTextModel.js';
import { CellKind } from '../../../common/notebookCommon.js';
import { MockNotebookCell, withTestNotebook } from '../testNotebookEditor.js';

suite('Notebook Save Participants', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const organizeImports = new HierarchicalKind('notebook.source.organizeImports');

	const markdownFirstNotebook: MockNotebookCell[] = [
		['# Title', 'markdown', CellKind.Markup],
		['from time import time_ns\n\ntime_ns()', 'python', CellKind.Code],
	];

	const mixedNotebook: MockNotebookCell[] = [
		['# Title', 'markdown', CellKind.Markup],
		['title: front matter', 'raw', CellKind.Code],
		['import os', 'python', CellKind.Code],
		['import sys', 'python', CellKind.Code],
		['## Section', 'markdown', CellKind.Markup],
	];

	/**
	 * Registers a code action provider for `selector` that returns an action of the requested kind only for
	 * cells of `providedLanguage`, then records which cells it was asked for and which actions were applied.
	 */
	function runWithCodeActionProvider<T>(
		cells: MockNotebookCell[],
		selector: LanguageSelector,
		providedLanguage: string,
		run: (instantiationService: TestInstantiationService, notebook: NotebookTextModel) => Promise<T>
	): Promise<{ result: T; requested: string[]; applied: string[] }> {
		return withTestNotebook(cells, async (editor, _viewModel, disposables, instantiationService) => {
			const requested: string[] = [];
			const applied: string[] = [];

			const languageFeaturesService = new LanguageFeaturesService();
			disposables.add(languageFeaturesService.codeActionProvider.register(selector, {
				provideCodeActions: (model, _range, context) => {
					requested.push(`${context.only}:${model.getLanguageId()}`);
					if (!context.only || model.getLanguageId() !== providedLanguage) {
						return undefined;
					}
					const edit: WorkspaceEdit = { edits: [{ resource: model.uri, textEdit: { range: new Range(1, 1, 1, 1), text: '' }, versionId: undefined }] };
					return { actions: [{ title: context.only, kind: context.only, edit }], dispose() { } };
				}
			}));

			instantiationService.stub(ILanguageFeaturesService, languageFeaturesService);
			instantiationService.stub(ITextModelService, new class extends mock<ITextModelService>() {
				override async createModelReference(uri: URI): Promise<IReference<IResolvedTextEditorModel>> {
					const cell = editor.textModel.cells.find(cell => isEqual(cell.uri, uri))!;
					const textEditorModel: ITextModel = disposables.add(createTextModel(cell.getValue(), cell.language, undefined, cell.uri));
					return { object: { textEditorModel } as IResolvedTextEditorModel, dispose() { } };
				}
			});
			instantiationService.stub(IBulkEditService, new class extends mock<IBulkEditService>() {
				override async apply(_edit: ResourceEdit[] | WorkspaceEdit, options?: IBulkEditOptions): Promise<IBulkEditResult> {
					applied.push(options?.label ?? '');
					return { ariaSummary: '', isApplied: true };
				}
			});
			instantiationService.stub(ICommandService, NullCommandService);
			instantiationService.stub(ITelemetryService, NullTelemetryService);
			instantiationService.stub(INotificationService, new TestNotificationService());
			instantiationService.stub(IAccessibilitySignalService, new class extends mock<IAccessibilitySignalService>() {
				override async playSignal() { }
			});

			const result = await run(instantiationService, editor.textModel);
			return { result, requested, applied };
		});
	}

	test('notebook code actions on save reach code cell providers when the first cell is markdown', async () => {
		const actual = await runWithCodeActionProvider(markdownFirstNotebook, { language: 'python' }, 'python', (instantiationService, notebook) =>
			instantiationService.invokeFunction(CodeActionParticipantUtils.applyOnSaveNotebookCodeActions, notebook, [organizeImports], [], Progress.None, CancellationToken.None));

		assert.deepStrictEqual(actual, {
			result: undefined,
			requested: ['notebook.source.organizeImports:python'],
			applied: ['notebook.source.organizeImports'],
		});
	});

	test('notebook code actions on save try code cells first and stop at the first language with actions', async () => {
		const actual = await runWithCodeActionProvider(mixedNotebook, { scheme: Schemas.vscodeNotebookCell }, 'python', (instantiationService, notebook) =>
			instantiationService.invokeFunction(CodeActionParticipantUtils.applyOnSaveNotebookCodeActions, notebook, [organizeImports], [], Progress.None, CancellationToken.None));

		assert.deepStrictEqual(actual, {
			result: undefined,
			requested: ['notebook.source.organizeImports:raw', 'notebook.source.organizeImports:python'],
			applied: ['notebook.source.organizeImports'],
		});
	});

	test('notebook code actions on save ask the first cell of each language once when none provide actions', async () => {
		const actual = await runWithCodeActionProvider(mixedNotebook, { scheme: Schemas.vscodeNotebookCell }, 'julia', (instantiationService, notebook) =>
			instantiationService.invokeFunction(CodeActionParticipantUtils.applyOnSaveNotebookCodeActions, notebook, [organizeImports], [], Progress.None, CancellationToken.None));

		assert.deepStrictEqual(actual, {
			result: undefined,
			requested: ['notebook.source.organizeImports:raw', 'notebook.source.organizeImports:python', 'notebook.source.organizeImports:markdown'],
			applied: [],
		});
	});

	test('notebook format code action reaches code cell providers when the first cell is markdown', async () => {
		const actual = await runWithCodeActionProvider(markdownFirstNotebook, { language: 'python' }, 'python', (instantiationService, notebook) =>
			instantiationService.invokeFunction(CodeActionParticipantUtils.checkAndRunFormatCodeAction, notebook, Progress.None, CancellationToken.None));

		assert.deepStrictEqual(actual, {
			result: true,
			requested: ['notebook.format:python'],
			applied: ['notebook.format'],
		});
	});
});
