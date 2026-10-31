/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../../base/common/event.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IAccessibilitySignalService } from '../../../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { ITelemetryService } from '../../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../../platform/telemetry/common/telemetryUtils.js';
import { INotificationService } from '../../../../../../../platform/notification/common/notification.js';
import { IWorkspaceTrustManagementService } from '../../../../../../../platform/workspace/common/workspaceTrust.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
import { CodeAction, CodeActionProvider, IWorkspaceTextEdit, WorkspaceEdit } from '../../../../../../../editor/common/languages.js';
import { ILanguageService } from '../../../../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../../../../editor/common/services/model.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../../../editor/common/services/resolverService.js';
import { ITreeSitterLibraryService } from '../../../../../../../editor/common/services/treeSitter/treeSitterLibraryService.js';
import { ILanguageFeaturesService } from '../../../../../../../editor/common/services/languageFeatures.js';
import { LanguageFeaturesService } from '../../../../../../../editor/common/services/languageFeaturesService.js';
import { IBulkEditService } from '../../../../../../../editor/browser/services/bulkEditService.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotebookService } from '../../../../common/notebookService.js';
import { INotebookLoggingService } from '../../../../common/notebookLoggingService.js';
import { CellKind } from '../../../../common/notebookCommon.js';
import { NotebookTextModel } from '../../../../common/model/notebookTextModel.js';
import { NotebookFileWorkingCopyModel } from '../../../../common/notebookEditorModel.js';
import { IStoredFileWorkingCopy, IStoredFileWorkingCopyModel } from '../../../../../../services/workingCopy/common/storedFileWorkingCopy.js';
import { SaveReason } from '../../../../../../common/editor.js';
import { setupInstantiationService } from '../../testNotebookEditor.js';
import { CodeActionOnSaveParticipant } from '../../../../browser/contrib/saveParticipants/saveParticipants.js';

suite('Notebook save participants - code actions on save (#338963)', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let instantiationService: TestInstantiationService;
	let notebook: NotebookTextModel;
	let workingCopy: IStoredFileWorkingCopy<IStoredFileWorkingCopyModel>;
	let participant: CodeActionOnSaveParticipant;
	let providerCalls: string[];
	let appliedEdits: WorkspaceEdit[];
	let cellModelService: IModelService;
	let cellLanguageService: ILanguageService;

	const CODE_CELL_SOURCE = 'from time import time_ns\n\ntime_ns()';
	const ORGANIZED_CODE_CELL_SOURCE = 'from time import time_ns\n\n\ntime_ns()';

	setup(() => {
		instantiationService = setupInstantiationService(disposables);

		providerCalls = [];
		appliedEdits = [];

		instantiationService.stub(ILanguageFeaturesService, new LanguageFeaturesService());
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(INotebookService, new class extends mock<INotebookService>() {
			override readonly onDidAddNotebookDocument = Event.None;
			override readonly onWillRemoveNotebookDocument = Event.None;
		});
		instantiationService.stub(IWorkspaceTrustManagementService, { isWorkspaceTrusted: () => true });
		{
			const languageService = instantiationService.get(ILanguageService);
			disposables.add(languageService.registerLanguage({ id: 'python' }));
			disposables.add(languageService.registerLanguage({ id: 'markdown' }));
		}
		instantiationService.stub(ITreeSitterLibraryService, upcastPartial<ITreeSitterLibraryService>({ supportsLanguage: () => false }));
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() { }());
		instantiationService.stub(INotificationService, new class extends mock<INotificationService>() { }());
		instantiationService.stub(IAccessibilitySignalService, { playSignal: () => Promise.resolve() });
		// The harness's TextModelResolverService is not fully wired for tests, so resolve cell
		// documents directly from the model service the way the participant does.
		{
			const modelService = instantiationService.get(IModelService);
			const languageService = instantiationService.get(ILanguageService);
			cellModelService = modelService;
			cellLanguageService = languageService;
			instantiationService.stub(ITextModelService, {
				createModelReference: async (resource: URI) => {
					const model = modelService.getModel(resource);
					if (!model) {
						throw new Error(`No text model registered for ${resource.toString()}`);
					}
					return {
						object: { uri: model.uri, textEditorModel: model } as unknown as IResolvedTextEditorModel,
						dispose() { }
					};
				}
			} as unknown as ITextModelService);
		}
		instantiationService.stub(IBulkEditService, upcastPartial<IBulkEditService>({
			apply: async (edit: WorkspaceEdit) => {
				for (const editEntry of edit.edits) {
					const textEdit = editEntry as IWorkspaceTextEdit;
					if (!textEdit.resource || !textEdit.textEdit) {
						continue;
					}
					const textModel = cellModelService.getModel(textEdit.resource);
					textModel?.applyEdits([textEdit.textEdit]);
				}
				appliedEdits.push(edit);
				return { ariaSummary: '', isApplied: true };
			}
		}));
	});

	function registerOrganizeImportsProvider(): void {
		// Mirrors a language server offering notebook.source.organizeImports for python cells:
		// it adds a blank line after the import statement.
		const provider: CodeActionProvider = {
			provideCodeActions: async model => {
				providerCalls.push(model.getLanguageId());
				const codeCell = notebook.cells.find(cell => cell.uri.toString() === model.uri.toString())!;
				const action: CodeAction = {
					title: 'Organize Imports',
					kind: 'notebook.source.organizeImports',
					edit: {
						edits: [{
							resource: codeCell.uri,
							versionId: undefined,
							textEdit: { range: new Range(1, 25, 1, 25), text: '\n' }
						}]
					}
				};
				return { dispose: () => { }, actions: [action] };
			}
		};
		disposables.add((instantiationService.get(ILanguageFeaturesService) as LanguageFeaturesService).codeActionProvider.register({ language: 'python' }, provider));
	}

	function createNotebook(cells: [source: string, language: string, cellKind: CellKind][]): void {
		const notebookUri = URI.parse(`test://test/notebook-${Math.random()}.ipynb`);
		notebook = disposables.add(instantiationService.createInstance(NotebookTextModel, 'test-notebook', notebookUri, cells.map(([source, language, cellKind]) => ({
			source,
			mime: undefined,
			language,
			cellKind,
			outputs: [],
			metadata: {}
		})), {}, { transientOutputs: false, transientCellMetadata: {}, transientDocumentMetadata: {}, cellContentMetadata: {} }));
		// Bind each cell to a text model that shares the cell's buffer, mirroring how the
		// workbench's cell content provider resolves cell documents.
		for (let i = 0; i < cells.length; i++) {
			const cell = notebook.cells[i];
			const languageId = cellLanguageService.getLanguageIdByLanguageName(cells[i][1]) ?? 'plaintext';
			disposables.add(cellModelService.createModel({
				create: () => ({ textBuffer: cell.textBuffer, disposable: Disposable.None }),
				getFirstLineText: (limit: number) => cell.textBuffer.getLineContent(1).substring(0, limit)
			}, cellLanguageService.createById(languageId), cell.uri));
		}

		const workingCopyModel = disposables.add(new NotebookFileWorkingCopyModel(
			notebook,
			instantiationService.get(INotebookService),
			instantiationService.get(IConfigurationService),
			NullTelemetryService,
			instantiationService.get(INotebookLoggingService)));
		workingCopy = { model: workingCopyModel } as unknown as IStoredFileWorkingCopy<IStoredFileWorkingCopyModel>;
		(instantiationService.get(IConfigurationService) as TestConfigurationService).setUserConfiguration('notebook.codeActionsOnSave', { 'notebook.source.organizeImports': 'explicit' });
		participant = instantiationService.createInstance(CodeActionOnSaveParticipant);
	}

	async function save(): Promise<void> {
		await participant.participate(workingCopy, { reason: SaveReason.EXPLICIT }, { report: () => { } }, CancellationToken.None);
	}

	test('notebook code actions run on the code cell when the first cell is markdown (#338963)', async () => {
		createNotebook([
			['# Title', 'markdown', CellKind.Markup],
			[CODE_CELL_SOURCE, 'python', CellKind.Code]
		]);
		registerOrganizeImportsProvider();

		await save();

		assert.deepStrictEqual(providerCalls, ['python']);
		assert.strictEqual(appliedEdits.length, 1);
		assert.strictEqual(notebook.cells[1].getValue(), ORGANIZED_CODE_CELL_SOURCE);
	});

	test('notebook code actions still run when the first cell is a code cell', async () => {
		createNotebook([
			[CODE_CELL_SOURCE, 'python', CellKind.Code],
			['# Title', 'markdown', CellKind.Markup]
		]);
		registerOrganizeImportsProvider();

		await save();

		assert.deepStrictEqual(providerCalls, ['python']);
		assert.strictEqual(appliedEdits.length, 1);
		assert.strictEqual(notebook.cells[0].getValue(), ORGANIZED_CODE_CELL_SOURCE);
	});

	test('a notebook-scope action is applied only once even if several cells provide it', async () => {
		createNotebook([
			[CODE_CELL_SOURCE, 'python', CellKind.Code],
			[CODE_CELL_SOURCE, 'python', CellKind.Code]
		]);
		registerOrganizeImportsProvider();

		await save();

		assert.strictEqual(appliedEdits.length, 1);
	});
});
