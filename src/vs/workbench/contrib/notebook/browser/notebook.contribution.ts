/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../base/common/network.js';
import { IDisposable, Disposable, DisposableStore, dispose } from '../../../../base/common/lifecycle.js';
import { parse } from '../../../../base/common/marshalling.js';
import { extname, isEqual } from '../../../../base/common/resources.js';
import { assertType } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { toFormattedString } from '../../../../base/common/jsonFormatter.js';
import { ITextModel, ITextBufferFactory, DefaultEndOfLine, ITextBuffer } from '../../../../editor/common/model.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ILanguageSelection, ILanguageService } from '../../../../editor/common/languages/language.js';
import { ITextModelContentProvider, ITextModelService } from '../../../../editor/common/services/resolverService.js';
import * as nls from '../../../../nls.js';
import { Extensions, IConfigurationPropertySchema, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { IEditorSerializer, IEditorFactoryRegistry, EditorExtensions } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { NotebookEditor } from './notebookEditor.js';
import { NotebookEditorInput, NotebookEditorInputOptions } from '../common/notebookEditorInput.js';
import { INotebookService } from '../common/notebookService.js';
import { NotebookService } from './services/notebookServiceImpl.js';
import { CellKind, CellUri, IResolvedNotebookEditorModel, NotebookWorkingCopyTypeIdentifier, NotebookSetting, ICellOutput, ICell, NotebookCellsChangeType, NotebookMetadataUri } from '../common/notebookCommon.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IUndoRedoService } from '../../../../platform/undoRedo/common/undoRedo.js';
import { INotebookEditorModelResolverService } from '../common/notebookEditorModelResolverService.js';
import { NotebookDiffEditorInput } from '../common/notebookDiffEditorInput.js';
import { NotebookTextDiffEditor } from './diff/notebookDiffEditor.js';
import { INotebookEditorWorkerService } from '../common/services/notebookWorkerService.js';
import { NotebookEditorWorkerServiceImpl } from './services/notebookWorkerServiceImpl.js';
import { INotebookCellStatusBarService } from '../common/notebookCellStatusBarService.js';
import { NotebookCellStatusBarService } from './services/notebookCellStatusBarServiceImpl.js';
import { INotebookEditorService } from './services/notebookEditorService.js';
import { NotebookEditorWidgetService } from './services/notebookEditorServiceImpl.js';
import { IJSONContributionRegistry, Extensions as JSONExtensions } from '../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { IJSONSchema, IJSONSchemaMap } from '../../../../base/common/jsonSchema.js';
import { Event } from '../../../../base/common/event.js';
import { getFormattedOutputJSON, getStreamOutputData } from './diff/diffElementViewModel.js';
import { NotebookModelResolverServiceImpl } from '../common/notebookEditorModelResolverServiceImpl.js';
import { INotebookKernelHistoryService, INotebookKernelService } from '../common/notebookKernelService.js';
import { NotebookKernelService } from './services/notebookKernelServiceImpl.js';
import { IWorkingCopyIdentifier } from '../../../services/workingCopy/common/workingCopy.js';
import { IResourceEditorInput } from '../../../../platform/editor/common/editor.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IWorkingCopyEditorHandler, IWorkingCopyEditorService } from '../../../services/workingCopy/common/workingCopyEditorService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { NotebookRendererMessagingService } from './services/notebookRendererMessagingServiceImpl.js';
import { INotebookRendererMessagingService } from '../common/notebookRendererMessagingService.js';
import { INotebookCellOutlineDataSourceFactory, NotebookCellOutlineDataSourceFactory } from './viewModel/notebookOutlineDataSourceFactory.js';

// Editor Controller
import './controller/coreActions.js';
import './controller/insertCellActions.js';
import './controller/executeActions.js';
import './controller/sectionActions.js';
import './controller/layoutActions.js';
import './controller/editActions.js';
import './controller/cellOutputActions.js';
import './controller/apiActions.js';
import './controller/foldingController.js';
import './controller/chat/notebook.chat.contribution.js';

// Editor Contribution
import './contrib/editorHint/emptyCellEditorHint.js';
import './contrib/clipboard/notebookClipboard.js';
import './contrib/find/notebookFind.js';
import './contrib/format/formatting.js';
import './contrib/saveParticipants/saveParticipants.js';
import './contrib/gettingStarted/notebookGettingStarted.js';
import './contrib/layout/layoutActions.js';
import './contrib/marker/markerProvider.js';
import './contrib/navigation/arrow.js';
import './contrib/outline/notebookOutline.js';
import './contrib/profile/notebookProfile.js';
import './contrib/cellStatusBar/statusBarProviders.js';
import './contrib/cellStatusBar/contributedStatusBarItemController.js';
import './contrib/cellStatusBar/executionStatusBarItemController.js';
import './contrib/editorStatusBar/editorStatusBar.js';
import './contrib/undoRedo/notebookUndoRedo.js';
import './contrib/cellCommands/cellCommands.js';
import './contrib/viewportWarmup/viewportWarmup.js';
import './contrib/troubleshoot/layout.js';
import './contrib/debug/notebookBreakpoints.js';
import './contrib/debug/notebookCellPausing.js';
import './contrib/debug/notebookDebugDecorations.js';
import './contrib/execute/executionEditorProgress.js';
import './contrib/kernelDetection/notebookKernelDetection.js';
import './contrib/cellDiagnostics/cellDiagnostics.js';
import './contrib/multicursor/notebookMulticursor.js';

// Diff Editor Contribution
import './diff/notebookDiffActions.js';

// Services
import { editorOptionsRegistry } from '../../../../editor/common/config/editorOptions.js';
import { NotebookExecutionStateService } from './services/notebookExecutionStateServiceImpl.js';
import { NotebookExecutionService } from './services/notebookExecutionServiceImpl.js';
import { INotebookExecutionService } from '../common/notebookExecutionService.js';
import { INotebookKeymapService } from '../common/notebookKeymapService.js';
import { NotebookKeymapService } from './services/notebookKeymapServiceImpl.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../../editor/common/languages/modesRegistry.js';
import { INotebookExecutionStateService } from '../common/notebookExecutionStateService.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { NotebookInfo } from '../../../../editor/common/languageFeatureRegistry.js';
import { COMMENTEDITOR_DECORATION_KEY } from '../../comments/browser/commentReply.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { NotebookKernelHistoryService } from './services/notebookKernelHistoryServiceImpl.js';
import { INotebookLoggingService } from '../common/notebookLoggingService.js';
import { NotebookLoggingService } from './services/notebookLoggingServiceImpl.js';
import product from '../../../../platform/product/common/product.js';
import { NotebookVariables } from './contrib/notebookVariables/notebookVariables.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { NotebookAccessibilityHelp } from './notebookAccessibilityHelp.js';
import { NotebookAccessibleView } from './notebookAccessibleView.js';
import { DefaultFormatter } from '../../format/browser/formatActionsMultiple.js';
import { NotebookMultiTextDiffEditor } from './diff/notebookMultiDiffEditor.js';
import { NotebookMultiDiffEditorInput } from './diff/notebookMultiDiffEditorInput.js';
import { getFormattedMetadataJSON } from '../common/model/notebookCellTextModel.js';
import { INotebookOutlineEntryFactory, NotebookOutlineEntryFactory } from './viewModel/notebookOutlineEntryFactory.js';
import { getFormattedNotebookMetadataJSON } from '../common/model/notebookMetadataTextModel.js';

/*--------------------------------------------------------------------------------------------- */

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		NotebookEditor,
		NotebookEditor.ID,
		'Notebook Editor'
	),
	[
		new SyncDescriptor(NotebookEditorInput)
	]
);

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		NotebookTextDiffEditor,
		NotebookTextDiffEditor.ID,
		'Notebook Diff Editor'
	),
	[
		new SyncDescriptor(NotebookDiffEditorInput)
	]
);

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		NotebookMultiTextDiffEditor,
		NotebookMultiTextDiffEditor.ID,
		'Notebook Diff Editor'
	),
	[
		new SyncDescriptor(NotebookMultiDiffEditorInput)
	]
);

class NotebookDiffEditorSerializer implements IEditorSerializer {
	constructor(@IConfigurationService private readonly _configurationService: IConfigurationService) { }
	canSerialize(): boolean {
		return true;
	}

	serialize(input: EditorInput): string {
		assertType(input instanceof NotebookDiffEditorInput);
		return JSON.stringify({
			resource: input.resource,
			originalResource: input.original.resource,
			name: input.getName(),
			originalName: input.original.getName(),
			textDiffName: input.getName(),
			viewType: input.viewType,
		});
	}

	deserialize(instantiationService: IInstantiationService, raw: string) {
		type Data = { resource: URI; originalResource: URI; name: string; originalName: string; viewType: string; textDiffName: string | undefined; group: number };
		const data = <Data>parse(raw);
		if (!data) {
			return undefined;
		}
		const { resource, originalResource, name, viewType } = data;
		if (!data || !URI.isUri(resource) || !URI.isUri(originalResource) || typeof name !== 'string' || typeof viewType !== 'string') {
			return undefined;
		}

		if (this._configurationService.getValue('notebook.experimental.enableNewDiffEditor')) {
			return NotebookMultiDiffEditorInput.create(instantiationService, resource, name, undefined, originalResource, viewType);
		} else {
			return NotebookDiffEditorInput.create(instantiationService, resource, name, undefined, originalResource, viewType);
		}
	}

	static canResolveBackup(editorInput: EditorInput, backupResource: URI): boolean {
		return false;
	}

}
type SerializedNotebookEditorData = { resource: URI; preferredResource: URI; viewType: string; options?: NotebookEditorInputOptions };
class NotebookEditorSerializer implements IEditorSerializer {
	canSerialize(input: EditorInput): boolean {
		return input.typeId === NotebookEditorInput.ID;
	}
	serialize(input: EditorInput): string {
		assertType(input instanceof NotebookEditorInput);
		const data: SerializedNotebookEditorData = {
			resource: input.resource,
			preferredResource: input.preferredResource,
			viewType: input.viewType,
			options: input.options
		};
		return JSON.stringify(data);
	}
	deserialize(instantiationService: IInstantiationService, raw: string) {
		const data = <SerializedNotebookEditorData>parse(raw);
		if (!data) {
			return undefined;
		}
		const { resource, preferredResource, viewType, options } = data;
		if (!data || !URI.isUri(resource) || typeof viewType !== 'string') {
			return undefined;
		}

		const input = NotebookEditorInput.getOrCreate(instantiationService, resource, preferredResource, viewType, options);
		return input;
	}
}

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(
	NotebookEditorInput.ID,
	NotebookEditorSerializer
);

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(
	NotebookDiffEditorInput.ID,
	NotebookDiffEditorSerializer
);

export class NotebookContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.notebook';

	private _uriComparisonKeyComputer?: IDisposable;

	constructor(
		@IUndoRedoService undoRedoService: IUndoRedoService,
		@IConfigurationService configurationService: IConfigurationService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
	) {
		super();

		this.updateCellUndoRedoComparisonKey(configurationService, undoRedoService);

		// Watch for changes to undoRedoPerCell setting
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(NotebookSetting.undoRedoPerCell)) {
				this.updateCellUndoRedoComparisonKey(configurationService, undoRedoService);
			}
		}));

		// register comment decoration
		this.codeEditorService.registerDecorationType('comment-controller', COMMENTEDITOR_DECORATION_KEY, {});
	}

	// Add or remove the cell undo redo comparison key based on the user setting
	private updateCellUndoRedoComparisonKey(configurationService: IConfigurationService, undoRedoService: IUndoRedoService) {
		const undoRedoPerCell = configurationService.getValue<boolean>(NotebookSetting.undoRedoPerCell);

		if (!undoRedoPerCell) {
			// Add comparison key to map cell => main document
			if (!this._uriComparisonKeyComputer) {
				this._uriComparisonKeyComputer = undoRedoService.registerUriComparisonKeyComputer(CellUri.scheme, {
					getComparisonKey: (uri: URI): string => {
						if (undoRedoPerCell) {
							return uri.toString();
						}
						return NotebookContribution._getCellUndoRedoComparisonKey(uri);
					}
				});
			}
		} else {
			// Dispose comparison key
			this._uriComparisonKeyComputer?.dispose();
			this._uriComparisonKeyComputer = undefined;
		}
	}

	private static _getCellUndoRedoComparisonKey(uri: URI) {
		const data = CellUri.parse(uri);
		if (!data) {
			return uri.toString();
		}

		return data.notebook.toString();
	}

	override dispose(): void {
		super.dispose();
		this._uriComparisonKeyComputer?.dispose();
	}
}

class CellContentProvider implements ITextModelContentProvider {

	static readonly ID = 'workbench.contrib.cellContentProvider';

	private readonly _registration: IDisposable;

	constructor(
		@ITextModelService textModelService: ITextModelService,
		@IModelService private readonly _modelService: IModelService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@INotebookEditorModelResolverService private readonly _notebookModelResolverService: INotebookEditorModelResolverService,
	) {
		this._registration = textModelService.registerTextModelContentProvider(CellUri.scheme, this);
	}

	dispose(): void {
		this._registration.dispose();
	}

	async provideTextContent(resource: URI): Promise<ITextModel | null> {
		const existing = this._modelService.getModel(resource);
		if (existing) {
			return existing;
		}
		const data = CellUri.parse(resource);
		// const data = parseCellUri(resource);
		if (!data) {
			return null;
		}

		const ref = await this._notebookModelResolverService.resolve(data.notebook);
		let result: ITextModel | null = null;

		if (!ref.object.isResolved()) {
			return null;
		}

		for (const cell of ref.object.notebook.cells) {
			if (cell.uri.toString() === resource.toString()) {
				const bufferFactory: ITextBufferFactory = {
					create: (defaultEOL) => {
						const newEOL = (defaultEOL === DefaultEndOfLine.CRLF ? '\r\n' : '\n');
						(cell.textBuffer as ITextBuffer).setEOL(newEOL);
						return { textBuffer: cell.textBuffer as ITextBuffer, disposable: Disposable.None };
					},
					getFirstLineText: (limit: number) => {
						return cell.textBuffer.getLineContent(1).substring(0, limit);
					}
				};
				const languageId = this._languageService.getLanguageIdByLanguageName(cell.language);
				const languageSelection = languageId ? this._languageService.createById(languageId) : (cell.cellKind === CellKind.Markup ? this._languageService.createById('markdown') : this._languageService.createByFilepathOrFirstLine(resource, cell.textBuffer.getLineContent(1)));
				result = this._modelService.createModel(
					bufferFactory,
					languageSelection,
					resource
				);
				break;
			}
		}

		if (!result) {
			ref.dispose();
			return null;
		}

		const once = Event.any(result.onWillDispose, ref.object.notebook.onWillDispose)(() => {
			once.dispose();
			ref.dispose();
		});

		return result;
	}
}

class CellInfoContentProvider {

	static readonly ID = 'workbench.contrib.cellInfoContentProvider';

	private readonly _disposables: IDisposable[] = [];

	constructor(
		@ITextModelService textModelService: ITextModelService,
		@IModelService private readonly _modelService: IModelService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@ILabelService private readonly _labelService: ILabelService,
		@INotebookEditorModelResolverService private readonly _notebookModelResolverService: INotebookEditorModelResolverService,
	) {
		this._disposables.push(textModelService.registerTextModelContentProvider(Schemas.vscodeNotebookCellMetadata, {
			provideTextContent: this.provideMetadataTextContent.bind(this)
		}));

		this._disposables.push(textModelService.registerTextModelContentProvider(Schemas.vscodeNotebookCellOutput, {
			provideTextContent: this.provideOutputTextContent.bind(this)
		}));

		this._disposables.push(this._labelService.registerFormatter({
			scheme: Schemas.vscodeNotebookCellMetadata,
			formatting: {
				label: '${path} (metadata)',
				separator: '/'
			}
		}));

		this._disposables.push(this._labelService.registerFormatter({
			scheme: Schemas.vscodeNotebookCellOutput,
			formatting: {
				label: '${path} (output)',
				separator: '/'
			}
		}));
	}

	dispose(): void {
		dispose(this._disposables);
	}

	async provideMetadataTextContent(resource: URI): Promise<ITextModel | null> {
		const existing = this._modelService.getModel(resource);
		if (existing) {
			return existing;
		}

		const data = CellUri.parseCellPropertyUri(resource, Schemas.vscodeNotebookCellMetadata);
		if (!data) {
			return null;
		}

		const ref = await this._notebookModelResolverService.resolve(data.notebook);
		let result: ITextModel | null = null;

		const mode = this._languageService.createById('json');
		const disposables = new DisposableStore();
		for (const cell of ref.object.notebook.cells) {
			if (cell.handle === data.handle) {
				const cellIndex = ref.object.notebook.cells.indexOf(cell);
				const metadataSource = getFormattedMetadataJSON(ref.object.notebook.transientOptions.transientCellMetadata, cell.metadata, cell.language);
				result = this._modelService.createModel(
					metadataSource,
					mode,
					resource
				);
				this._disposables.push(disposables.add(ref.object.notebook.onDidChangeContent(e => {
					if (result && e.rawEvents.some(event => (event.kind === NotebookCellsChangeType.ChangeCellMetadata || event.kind === NotebookCellsChangeType.ChangeCellLanguage) && event.index === cellIndex)) {
						const value = getFormattedMetadataJSON(ref.object.notebook.transientOptions.transientCellMetadata, cell.metadata, cell.language);
						if (result.getValue() !== value) {
							result.setValue(getFormattedMetadataJSON(ref.object.notebook.transientOptions.transientCellMetadata, cell.metadata, cell.language));
						}
					}
				})));
				break;
			}
		}

		if (!result) {
			ref.dispose();
			return null;
		}

		const once = result.onWillDispose(() => {
			disposables.dispose();
			once.dispose();
			ref.dispose();
		});

		return result;
	}

	private parseStreamOutput(op?: ICellOutput): { content: string; mode: ILanguageSelection } | undefined {
		if (!op) {
			return;
		}

		const streamOutputData = getStreamOutputData(op.outputs);
		if (streamOutputData) {
			return {
				content: streamOutputData,
				mode: this._languageService.createById(PLAINTEXT_LANGUAGE_ID)
			};
		}

		return;
	}

	private _getResult(data: {
		notebook: URI;
		outputId?: string | undefined;
	}, cell: ICell) {
		let result: { content: string; mode: ILanguageSelection } | undefined = undefined;

		const mode = this._languageService.createById('json');
		const op = cell.outputs.find(op => op.outputId === data.outputId || op.alternativeOutputId === data.outputId);
		const streamOutputData = this.parseStreamOutput(op);
		if (streamOutputData) {
			result = streamOutputData;
			return result;
		}

		const obj = cell.outputs.map(output => ({
			metadata: output.metadata,
			outputItems: output.outputs.map(opit => ({
				mimeType: opit.mime,
				data: opit.data.toString()
			}))
		}));

		const outputSource = toFormattedString(obj, {});
		result = {
			content: outputSource,
			mode
		};

		return result;
	}

	async provideOutputsTextContent(resource: URI): Promise<ITextModel | null> {
		const existing = this._modelService.getModel(resource);
		if (existing) {
			return existing;
		}

		const data = CellUri.parseCellPropertyUri(resource, Schemas.vscodeNotebookCellOutput);
		if (!data) {
			return null;
		}

		const ref = await this._notebookModelResolverService.resolve(data.notebook);
		const cell = ref.object.notebook.cells.find(cell => cell.handle === data.handle);

		if (!cell) {
			ref.dispose();
			return null;
		}

		const mode = this._languageService.createById('json');
		const model = this._modelService.createModel(getFormattedOutputJSON(cell.outputs || []), mode, resource, true);
		const cellModelListener = Event.any(cell.onDidChangeOutputs ?? Event.None, cell.onDidChangeOutputItems ?? Event.None)(() => {
			model.setValue(getFormattedOutputJSON(cell.outputs || []));
		});

		const once = model.onWillDispose(() => {
			once.dispose();
			cellModelListener.dispose();
			ref.dispose();
		});

		return model;
	}

	async provideOutputTextContent(resource: URI): Promise<ITextModel | null> {
		const existing = this._modelService.getModel(resource);
		if (existing) {
			return existing;
		}

		const data = CellUri.parseCellOutputUri(resource);
		if (!data) {
			return this.provideOutputsTextContent(resource);
		}

		const ref = await this._notebookModelResolverService.resolve(data.notebook);
		const cell = ref.object.notebook.cells.find(cell => !!cell.outputs.find(op => op.outputId === data.outputId || op.alternativeOutputId === data.outputId));

		if (!cell) {
			ref.dispose();
			return null;
		}

		const result = this._getResult(data, cell);

		if (!result) {
			ref.dispose();
			return null;
		}

		const model = this._modelService.createModel(result.content, result.mode, resource);
		const cellModelListener = Event.any(cell.onDidChangeOutputs ?? Event.None, cell.onDidChangeOutputItems ?? Event.None)(() => {
			const newResult = this._getResult(data, cell);

			if (!newResult) {
				return;
			}

			model.setValue(newResult.content);
			model.setLanguage(newResult.mode.languageId);
		});

		const once = model.onWillDispose(() => {
			once.dispose();
			cellModelListener.dispose();
			ref.dispose();
		});

		return model;
	}
}

class NotebookMetadataContentProvider {
	static readonly ID = 'workbench.contrib.notebookMetadataContentProvider';

	private readonly _disposables: IDisposable[] = [];

	constructor(
		@ITextModelService textModelService: ITextModelService,
		@IModelService private readonly _modelService: IModelService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@ILabelService private readonly _labelService: ILabelService,
		@INotebookEditorModelResolverService private readonly _notebookModelResolverService: INotebookEditorModelResolverService,
	) {
		this._disposables.push(textModelService.registerTextModelContentProvider(Schemas.vscodeNotebookMetadata, {
			provideTextContent: this.provideMetadataTextContent.bind(this)
		}));

		this._disposables.push(this._labelService.registerFormatter({
			scheme: Schemas.vscodeNotebookMetadata,
			formatting: {
				label: '${path} (metadata)',
				separator: '/'
			}
		}));
	}

	dispose(): void {
		dispose(this._disposables);
	}

	async provideMetadataTextContent(resource: URI): Promise<ITextModel | null> {
		const existing = this._modelService.getModel(resource);
		if (existing) {
			return existing;
		}

		const data = NotebookMetadataUri.parse(resource);
		if (!data) {
			return null;
		}

		const ref = await this._notebookModelResolverService.resolve(data);
		let result: ITextModel | null = null;

		const mode = this._languageService.createById('json');
		const disposables = new DisposableStore();
		const metadataSource = getFormattedNotebookMetadataJSON(ref.object.notebook.transientOptions.transientDocumentMetadata, ref.object.notebook.metadata);
		result = this._modelService.createModel(
			metadataSource,
			mode,
			resource
		);

		if (!result) {
			ref.dispose();
			return null;
		}

		this._disposables.push(disposables.add(ref.object.notebook.onDidChangeContent(e => {
			if (result && e.rawEvents.some(event => (event.kind === NotebookCellsChangeType.ChangeCellContent || event.kind === NotebookCellsChangeType.ChangeDocumentMetadata || event.kind === NotebookCellsChangeType.ModelChange))) {
				const value = getFormattedNotebookMetadataJSON(ref.object.notebook.transientOptions.transientDocumentMetadata, ref.object.notebook.metadata);
				if (result.getValue() !== value) {
					result.setValue(value);
				}
			}
		})));

		const once = result.onWillDispose(() => {
			disposables.dispose();
			once.dispose();
			ref.dispose();
		});

		return result;
	}
}

class RegisterSchemasContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.registerCellSchemas';

	constructor() {
		super();
		this.registerMetadataSchemas();
	}

	private registerMetadataSchemas(): void {
		const jsonRegistry = Registry.as<IJSONContributionRegistry>(JSONExtensions.JSONContribution);
		const metadataSchema: IJSONSchema = {
			properties: {
				['language']: {
					type: 'string',
					description: 'The language for the cell'
				}
			},
			// patternProperties: allSettings.patternProperties,
			additionalProperties: true,
			allowTrailingCommas: true,
			allowComments: true
		};

		jsonRegistry.registerSchema('vscode://schemas/notebook/cellmetadata', metadataSchema);
	}
}

class NotebookEditorManager implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.notebookEditorManager';

	private readonly _disposables = new DisposableStore();

	constructor(
		@IEditorService private readonly _editorService: IEditorService,
		@INotebookEditorModelResolverService private readonly _notebookEditorModelService: INotebookEditorModelResolverService,
		@IEditorGroupsService editorGroups: IEditorGroupsService
	) {
		// OPEN notebook editor for models that have turned dirty without being visible in an editor
		type E = IResolvedNotebookEditorModel;
		this._disposables.add(Event.debounce<E, E[]>(
			this._notebookEditorModelService.onDidChangeDirty,
			(last, current) => !last ? [current] : [...last, current],
			100
		)(this._openMissingDirtyNotebookEditors, this));

		// CLOSE editors when we are about to open conflicting notebooks
		this._disposables.add(_notebookEditorModelService.onWillFailWithConflict(e => {
			for (const group of editorGroups.groups) {
				const conflictInputs = group.editors.filter(input => input instanceof NotebookEditorInput && input.viewType !== e.viewType && isEqual(input.resource, e.resource));
				const p = group.closeEditors(conflictInputs);
				e.waitUntil(p);
			}
		}));
	}

	dispose(): void {
		this._disposables.dispose();
	}

	private _openMissingDirtyNotebookEditors(models: IResolvedNotebookEditorModel[]): void {
		const result: IResourceEditorInput[] = [];
		for (const model of models) {
			if (model.isDirty() && !this._editorService.isOpened({ resource: model.resource, typeId: NotebookEditorInput.ID, editorId: model.viewType }) && extname(model.resource) !== '.interactive') {
				result.push({
					resource: model.resource,
					options: { inactive: true, preserveFocus: true, pinned: true, override: model.viewType }
				});
			}
		}
		if (result.length > 0) {
			this._editorService.openEditors(result);
		}
	}
}

class SimpleNotebookWorkingCopyEditorHandler extends Disposable implements IWorkbenchContribution, IWorkingCopyEditorHandler {

	static readonly ID = 'workbench.contrib.simpleNotebookWorkingCopyEditorHandler';

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IWorkingCopyEditorService private readonly _workingCopyEditorService: IWorkingCopyEditorService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@INotebookService private readonly _notebookService: INotebookService
	) {
		super();

		this._installHandler();
	}

	async handles(workingCopy: IWorkingCopyIdentifier): Promise<boolean> {
		const viewType = this.handlesSync(workingCopy);
		if (!viewType) {
			return false;
		}

		return this._notebookService.canResolve(viewType);
	}

	private handlesSync(workingCopy: IWorkingCopyIdentifier): string /* viewType */ | undefined {
		const viewType = this._getViewType(workingCopy);
		if (!viewType || viewType === 'interactive' || extname(workingCopy.resource) === '.replNotebook') {
			return undefined;
		}

		return viewType;
	}

	isOpen(workingCopy: IWorkingCopyIdentifier, editor: EditorInput): boolean {
		if (!this.handlesSync(workingCopy)) {
			return false;
		}

		return editor instanceof NotebookEditorInput && editor.viewType === this._getViewType(workingCopy) && isEqual(workingCopy.resource, editor.resource);
	}

	createEditor(workingCopy: IWorkingCopyIdentifier): EditorInput {
		return NotebookEditorInput.getOrCreate(this._instantiationService, workingCopy.resource, undefined, this._getViewType(workingCopy)!);
	}

	private async _installHandler(): Promise<void> {
		await this._extensionService.whenInstalledExtensionsRegistered();

		this._register(this._workingCopyEditorService.registerHandler(this));
	}

	private _getViewType(workingCopy: IWorkingCopyIdentifier): string | undefined {
		return NotebookWorkingCopyTypeIdentifier.parse(workingCopy.typeId);
	}
}

class NotebookLanguageSelectorScoreRefine {

	static readonly ID = 'workbench.contrib.notebookLanguageSelectorScoreRefine';

	constructor(
		@INotebookService private readonly _notebookService: INotebookService,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
	) {
		languageFeaturesService.setNotebookTypeResolver(this._getNotebookInfo.bind(this));
	}

	private _getNotebookInfo(uri: URI): NotebookInfo | undefined {
		const cellUri = CellUri.parse(uri);
		if (!cellUri) {
			return undefined;
		}
		const notebook = this._notebookService.getNotebookTextModel(cellUri.notebook);
		if (!notebook) {
			return undefined;
		}
		return {
			uri: notebook.uri,
			type: notebook.viewType
		};
	}
}

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
registerWorkbenchContribution2(NotebookContribution.ID, NotebookContribution, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(CellContentProvider.ID, CellContentProvider, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(CellInfoContentProvider.ID, CellInfoContentProvider, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(NotebookMetadataContentProvider.ID, NotebookMetadataContentProvider, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(RegisterSchemasContribution.ID, RegisterSchemasContribution, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(NotebookEditorManager.ID, NotebookEditorManager, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(NotebookLanguageSelectorScoreRefine.ID, NotebookLanguageSelectorScoreRefine, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(SimpleNotebookWorkingCopyEditorHandler.ID, SimpleNotebookWorkingCopyEditorHandler, WorkbenchPhase.BlockRestore);
workbenchContributionsRegistry.registerWorkbenchContribution(NotebookVariables, LifecyclePhase.Eventually);

AccessibleViewRegistry.register(new NotebookAccessibleView());
AccessibleViewRegistry.register(new NotebookAccessibilityHelp());

registerSingleton(INotebookService, NotebookService, InstantiationType.Delayed);
registerSingleton(INotebookEditorWorkerService, NotebookEditorWorkerServiceImpl, InstantiationType.Delayed);
registerSingleton(INotebookEditorModelResolverService, NotebookModelResolverServiceImpl, InstantiationType.Delayed);
registerSingleton(INotebookCellStatusBarService, NotebookCellStatusBarService, InstantiationType.Delayed);
registerSingleton(INotebookEditorService, NotebookEditorWidgetService, InstantiationType.Delayed);
registerSingleton(INotebookKernelService, NotebookKernelService, InstantiationType.Delayed);
registerSingleton(INotebookKernelHistoryService, NotebookKernelHistoryService, InstantiationType.Delayed);
registerSingleton(INotebookExecutionService, NotebookExecutionService, InstantiationType.Delayed);
registerSingleton(INotebookExecutionStateService, NotebookExecutionStateService, InstantiationType.Delayed);
registerSingleton(INotebookRendererMessagingService, NotebookRendererMessagingService, InstantiationType.Delayed);
registerSingleton(INotebookKeymapService, NotebookKeymapService, InstantiationType.Delayed);
registerSingleton(INotebookLoggingService, NotebookLoggingService, InstantiationType.Delayed);
registerSingleton(INotebookCellOutlineDataSourceFactory, NotebookCellOutlineDataSourceFactory, InstantiationType.Delayed);
registerSingleton(INotebookOutlineEntryFactory, NotebookOutlineEntryFactory, InstantiationType.Delayed);

const schemas: IJSONSchemaMap = {};
function isConfigurationPropertySchema(x: IConfigurationPropertySchema | { [path: string]: IConfigurationPropertySchema }): x is IConfigurationPropertySchema {
	return (typeof x.type !== 'undefined' || typeof x.anyOf !== 'undefined');
}
for (const editorOption of editorOptionsRegistry) {
	const schema = editorOption.schema;
	if (schema) {
		if (isConfigurationPropertySchema(schema)) {
			schemas[`editor.${editorOption.name}`] = schema;
		} else {
			for (const key in schema) {
				if (Object.hasOwnProperty.call(schema, key)) {
					schemas[key] = schema[key];
				}
			}
		}
	}
}

const editorOptionsCustomizationSchema: IConfigurationPropertySchema = {
	description: nls.localize('notebook.editorOptions.experimentalCustomization', 'Settings for code editors used in notebooks. This can be used to customize most editor.* settings.'),
	default: {},
	allOf: [
		{
			properties: schemas,
		}
		// , {
		// 	patternProperties: {
		// 		'^\\[.*\\]$': {
		// 			type: 'object',
		// 			default: {},
		// 			properties: schemas
		// 		}
		// 	}
		// }
	],
	tags: ['notebookLayout']
};

const configurationRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
configurationRegistry.registerConfiguration({
	id: 'notebook',
	order: 100,
	title: nls.localize('notebookConfigurationTitle', "Notebook"),
	type: 'object',
	properties: {
		[NotebookSetting.displayOrder]: {
			description: nls.localize('notebook.displayOrder.description', "Priority list for output mime types"),
			type: 'array',
			items: {
				type: 'string'
			},
			default: []
		},
		[NotebookSetting.cellToolbarLocation]: {
			description: nls.localize('notebook.cellToolbarLocation.description', "Where the cell toolbar should be shown, or whether it should be hidden."),
			type: 'object',
			additionalProperties: {
				markdownDescription: nls.localize('notebook.cellToolbarLocation.viewType', "Configure the cell toolbar position for for specific file types"),
				type: 'string',
				enum: ['left', 'right', 'hidden']
			},
			default: {
				'default': 'right'
			},
			tags: ['notebookLayout']
		},
		[NotebookSetting.showCellStatusBar]: {
			description: nls.localize('notebook.showCellStatusbar.description', "Whether the cell status bar should be shown."),
			type: 'string',
			enum: ['hidden', 'visible', 'visibleAfterExecute'],
			enumDescriptions: [
				nls.localize('notebook.showCellStatusbar.hidden.description', "The cell Status bar is always hidden."),
				nls.localize('notebook.showCellStatusbar.visible.description', "The cell Status bar is always visible."),
				nls.localize('notebook.showCellStatusbar.visibleAfterExecute.description', "The cell Status bar is hidden until the cell has executed. Then it becomes visible to show the execution status.")],
			default: 'visible',
			tags: ['notebookLayout']
		},
		[NotebookSetting.textDiffEditorPreview]: {
			description: nls.localize('notebook.diff.enablePreview.description', "Whether to use the enhanced text diff editor for notebook."),
			type: 'boolean',
			default: true,
			tags: ['notebookLayout']
		},
		[NotebookSetting.diffOverviewRuler]: {
			description: nls.localize('notebook.diff.enableOverviewRuler.description', "Whether to render the overview ruler in the diff editor for notebook."),
			type: 'boolean',
			default: false,
			tags: ['notebookLayout']
		},
		[NotebookSetting.cellToolbarVisibility]: {
			markdownDescription: nls.localize('notebook.cellToolbarVisibility.description', "Whether the cell toolbar should appear on hover or click."),
			type: 'string',
			enum: ['hover', 'click'],
			default: 'click',
			tags: ['notebookLayout']
		},
		[NotebookSetting.undoRedoPerCell]: {
			description: nls.localize('notebook.undoRedoPerCell.description', "Whether to use separate undo/redo stack for each cell."),
			type: 'boolean',
			default: true,
			tags: ['notebookLayout']
		},
		[NotebookSetting.compactView]: {
			description: nls.localize('notebook.compactView.description', "Control whether the notebook editor should be rendered in a compact form. For example, when turned on, it will decrease the left margin width."),
			type: 'boolean',
			default: true,
			tags: ['notebookLayout']
		},
		[NotebookSetting.focusIndicator]: {
			description: nls.localize('notebook.focusIndicator.description', "Controls where the focus indicator is rendered, either along the cell borders or on the left gutter."),
			type: 'string',
			enum: ['border', 'gutter'],
			default: 'gutter',
			tags: ['notebookLayout']
		},
		[NotebookSetting.insertToolbarLocation]: {
			description: nls.localize('notebook.insertToolbarPosition.description', "Control where the insert cell actions should appear."),
			type: 'string',
			enum: ['betweenCells', 'notebookToolbar', 'both', 'hidden'],
			enumDescriptions: [
				nls.localize('insertToolbarLocation.betweenCells', "A toolbar that appears on hover between cells."),
				nls.localize('insertToolbarLocation.notebookToolbar', "The toolbar at the top of the notebook editor."),
				nls.localize('insertToolbarLocation.both', "Both toolbars."),
				nls.localize('insertToolbarLocation.hidden', "The insert actions don't appear anywhere."),
			],
			default: 'both',
			tags: ['notebookLayout']
		},
		[NotebookSetting.globalToolbar]: {
			description: nls.localize('notebook.globalToolbar.description', "Control whether to render a global toolbar inside the notebook editor."),
			type: 'boolean',
			default: true,
			tags: ['notebookLayout']
		},
		[NotebookSetting.stickyScrollEnabled]: {
			description: nls.localize('notebook.stickyScrollEnabled.description', "Experimental. Control whether to render notebook Sticky Scroll headers in the notebook editor."),
			type: 'boolean',
			default: false,
			tags: ['notebookLayout']
		},
		[NotebookSetting.stickyScrollMode]: {
			description: nls.localize('notebook.stickyScrollMode.description', "Control whether nested sticky lines appear to stack flat or indented."),
			type: 'string',
			enum: ['flat', 'indented'],
			enumDescriptions: [
				nls.localize('notebook.stickyScrollMode.flat', "Nested sticky lines appear flat."),
				nls.localize('notebook.stickyScrollMode.indented', "Nested sticky lines appear indented."),
			],
			default: 'indented',
			tags: ['notebookLayout']
		},
		[NotebookSetting.consolidatedOutputButton]: {
			description: nls.localize('notebook.consolidatedOutputButton.description', "Control whether outputs action should be rendered in the output toolbar."),
			type: 'boolean',
			default: true,
			tags: ['notebookLayout']
		},
		[NotebookSetting.showFoldingControls]: {
			description: nls.localize('notebook.showFoldingControls.description', "Controls when the Markdown header folding arrow is shown."),
			type: 'string',
			enum: ['always', 'never', 'mouseover'],
			enumDescriptions: [
				nls.localize('showFoldingControls.always', "The folding controls are always visible."),
				nls.localize('showFoldingControls.never', "Never show the folding controls and reduce the gutter size."),
				nls.localize('showFoldingControls.mouseover', "The folding controls are visible only on mouseover."),
			],
			default: 'mouseover',
			tags: ['notebookLayout']
		},
		[NotebookSetting.dragAndDropEnabled]: {
			description: nls.localize('notebook.dragAndDrop.description', "Control whether the notebook editor should allow moving cells through drag and drop."),
			type: 'boolean',
			default: true,
			tags: ['notebookLayout']
		},
		[NotebookSetting.consolidatedRunButton]: {
			description: nls.localize('notebook.consolidatedRunButton.description', "Control whether extra actions are shown in a dropdown next to the run button."),
			type: 'boolean',
			default: false,
			tags: ['notebookLayout']
		},
		[NotebookSetting.globalToolbarShowLabel]: {
			description: nls.localize('notebook.globalToolbarShowLabel', "Control whether the actions on the notebook toolbar should render label or not."),
			type: 'string',
			enum: ['always', 'never', 'dynamic'],
			default: 'always',
			tags: ['notebookLayout']
		},
		[NotebookSetting.textOutputLineLimit]: {
			markdownDescription: nls.localize('notebook.textOutputLineLimit', "Controls how many lines of text are displayed in a text output. If {0} is enabled, this setting is used to determine the scroll height of the output.", '`#notebook.output.scrolling#`'),
			type: 'number',
			default: 30,
			tags: ['notebookLayout', 'notebookOutputLayout'],
			minimum: 1,
		},
		[NotebookSetting.LinkifyOutputFilePaths]: {
			description: nls.localize('notebook.disableOutputFilePathLinks', "Control whether to disable filepath links in the output of notebook cells."),
			type: 'boolean',
			default: true,
			tags: ['notebookOutputLayout']
		},
		[NotebookSetting.minimalErrorRendering]: {
			description: nls.localize('notebook.minimalErrorRendering', "Control whether to render error output in a minimal style."),
			type: 'boolean',
			default: false,
			tags: ['notebookOutputLayout']
		},
		[NotebookSetting.markupFontSize]: {
			markdownDescription: nls.localize('notebook.markup.fontSize', "Controls the font size in pixels of rendered markup in notebooks. When set to {0}, 120% of {1} is used.", '`0`', '`#editor.fontSize#`'),
			type: 'number',
			default: 0,
			tags: ['notebookLayout']
		},
		[NotebookSetting.markdownLineHeight]: {
			markdownDescription: nls.localize('notebook.markdown.lineHeight', "Controls the line height in pixels of markdown cells in notebooks. When set to {0}, {1} will be used", '`0`', '`normal`'),
			type: 'number',
			default: 0,
			tags: ['notebookLayout']
		},
		[NotebookSetting.cellEditorOptionsCustomizations]: editorOptionsCustomizationSchema,
		[NotebookSetting.interactiveWindowCollapseCodeCells]: {
			markdownDescription: nls.localize('notebook.interactiveWindow.collapseCodeCells', "Controls whether code cells in the interactive window are collapsed by default."),
			type: 'string',
			enum: ['always', 'never', 'fromEditor'],
			default: 'fromEditor'
		},
		[NotebookSetting.outputLineHeight]: {
			markdownDescription: nls.localize('notebook.outputLineHeight', "Line height of the output text within notebook cells.\n - When set to 0, editor line height is used.\n - Values between 0 and 8 will be used as a multiplier with the font size.\n - Values greater than or equal to 8 will be used as effective values."),
			type: 'number',
			default: 0,
			tags: ['notebookLayout', 'notebookOutputLayout']
		},
		[NotebookSetting.outputFontSize]: {
			markdownDescription: nls.localize('notebook.outputFontSize', "Font size for the output text within notebook cells. When set to 0, {0} is used.", '`#editor.fontSize#`'),
			type: 'number',
			default: 0,
			tags: ['notebookLayout', 'notebookOutputLayout']
		},
		[NotebookSetting.outputFontFamily]: {
			markdownDescription: nls.localize('notebook.outputFontFamily', "The font family of the output text within notebook cells. When set to empty, the {0} is used.", '`#editor.fontFamily#`'),
			type: 'string',
			tags: ['notebookLayout', 'notebookOutputLayout']
		},
		[NotebookSetting.outputScrolling]: {
			markdownDescription: nls.localize('notebook.outputScrolling', "Initially render notebook outputs in a scrollable region when longer than the limit."),
			type: 'boolean',
			tags: ['notebookLayout', 'notebookOutputLayout'],
			default: typeof product.quality === 'string' && product.quality !== 'stable' // only enable as default in insiders
		},
		[NotebookSetting.outputWordWrap]: {
			markdownDescription: nls.localize('notebook.outputWordWrap', "Controls whether the lines in output should wrap."),
			type: 'boolean',
			tags: ['notebookLayout', 'notebookOutputLayout'],
			default: false
		},
		[NotebookSetting.defaultFormatter]: {
			description: nls.localize('notebookFormatter.default', "Defines a default notebook formatter which takes precedence over all other formatter settings. Must be the identifier of an extension contributing a formatter."),
			type: ['string', 'null'],
			default: null,
			enum: DefaultFormatter.extensionIds,
			enumItemLabels: DefaultFormatter.extensionItemLabels,
			markdownEnumDescriptions: DefaultFormatter.extensionDescriptions
		},
		[NotebookSetting.formatOnSave]: {
			markdownDescription: nls.localize('notebook.formatOnSave', "Format a notebook on save. A formatter must be available, the file must not be saved after delay, and the editor must not be shutting down."),
			type: 'boolean',
			tags: ['notebookLayout'],
			default: false
		},
		[NotebookSetting.insertFinalNewline]: {
			markdownDescription: nls.localize('notebook.insertFinalNewline', "When enabled, insert a final new line into the end of code cells when saving a notebook."),
			type: 'boolean',
			tags: ['notebookLayout'],
			default: false
		},
		[NotebookSetting.formatOnCellExecution]: {
			markdownDescription: nls.localize('notebook.formatOnCellExecution', "Format a notebook cell upon execution. A formatter must be available."),
			type: 'boolean',
			default: false
		},
		[NotebookSetting.confirmDeleteRunningCell]: {
			markdownDescription: nls.localize('notebook.confirmDeleteRunningCell', "Control whether a confirmation prompt is required to delete a running cell."),
			type: 'boolean',
			default: true
		},
		[NotebookSetting.findFilters]: {
			markdownDescription: nls.localize('notebook.findFilters', "Customize the Find Widget behavior for searching within notebook cells. When both markup source and markup preview are enabled, the Find Widget will search either the source code or preview based on the current state of the cell."),
			type: 'object',
			properties: {
				markupSource: {
					type: 'boolean',
					default: true
				},
				markupPreview: {
					type: 'boolean',
					default: true
				},
				codeSource: {
					type: 'boolean',
					default: true
				},
				codeOutput: {
					type: 'boolean',
					default: true
				}
			},
			default: {
				markupSource: true,
				markupPreview: true,
				codeSource: true,
				codeOutput: true
			},
			tags: ['notebookLayout']
		},
		[NotebookSetting.remoteSaving]: {
			markdownDescription: nls.localize('notebook.remoteSaving', "Enables the incremental saving of notebooks between processes and across Remote connections. When enabled, only the changes to the notebook are sent to the extension host, improving performance for large notebooks and slow network connections."),
			type: 'boolean',
			default: typeof product.quality === 'string' && product.quality !== 'stable', // only enable as default in insiders
			tags: ['experimental']
		},
		[NotebookSetting.scrollToRevealCell]: {
			markdownDescription: nls.localize('notebook.scrolling.revealNextCellOnExecute.description', "How far to scroll when revealing the next cell upon running {0}.", 'notebook.cell.executeAndSelectBelow'),
			type: 'string',
			enum: ['fullCell', 'firstLine', 'none'],
			markdownEnumDescriptions: [
				nls.localize('notebook.scrolling.revealNextCellOnExecute.fullCell.description', 'Scroll to fully reveal the next cell.'),
				nls.localize('notebook.scrolling.revealNextCellOnExecute.firstLine.description', 'Scroll to reveal the first line of the next cell.'),
				nls.localize('notebook.scrolling.revealNextCellOnExecute.none.description', 'Do not scroll.'),
			],
			default: 'fullCell'
		},
		[NotebookSetting.cellGenerate]: {
			markdownDescription: nls.localize('notebook.cellGenerate', "Enable experimental generate action to create code cell with inline chat enabled."),
			type: 'boolean',
			default: typeof product.quality === 'string' && product.quality !== 'stable',
			tags: ['experimental']
		},
		[NotebookSetting.notebookVariablesView]: {
			markdownDescription: nls.localize('notebook.VariablesView.description', "Enable the experimental notebook variables view within the debug panel."),
			type: 'boolean',
			default: false
		},
		[NotebookSetting.cellFailureDiagnostics]: {
			markdownDescription: nls.localize('notebook.cellFailureDiagnostics', "Show available diagnostics for cell failures."),
			type: 'boolean',
			default: true
		},
		[NotebookSetting.outputBackupSizeLimit]: {
			markdownDescription: nls.localize('notebook.backup.sizeLimit', "The limit of notebook output size in kilobytes (KB) where notebook files will no longer be backed up for hot reload. Use 0 for unlimited."),
			type: 'number',
			default: 10000
		},
		[NotebookSetting.multiCursor]: {
			markdownDescription: nls.localize('notebook.multiCursor.enabled', "Experimental. Enables a limited set of multi cursor controls across multiple cells in the notebook editor. Currently supported are core editor actions (typing/cut/copy/paste/composition) and a limited subset of editor commands."),
			type: 'boolean',
			default: false
		},
	}
});
