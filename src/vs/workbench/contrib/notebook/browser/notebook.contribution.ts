/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from 'vs/base/common/network';
import { IDisposable, Disposable, DisposableStore, dispose } from 'vs/base/common/lifecycle';
import { parse } from 'vs/base/common/marshalling';
import { isEqual } from 'vs/base/common/resources';
import { assertType } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { toFormattedString } from 'vs/base/common/jsonFormatter';
import { ITextModel, ITextBufferFactory, DefaultEndOfLine, ITextBuffer } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { ILanguageSelection, ILanguageService } from 'vs/editor/common/languages/language';
import { ITextModelContentProvider, ITextModelService } from 'vs/editor/common/services/resolverService';
import * as nls from 'vs/nls';
import { Extensions, IConfigurationPropertySchema, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorPaneDescriptor, IEditorPaneRegistry } from 'vs/workbench/browser/editor';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { IEditorSerializer, IEditorFactoryRegistry, EditorExtensions } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { NotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookEditor';
import { NotebookEditorInput, NotebookEditorInputOptions } from 'vs/workbench/contrib/notebook/common/notebookEditorInput';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { NotebookService } from 'vs/workbench/contrib/notebook/browser/services/notebookServiceImpl';
import { CellKind, CellUri, IResolvedNotebookEditorModel, NotebookWorkingCopyTypeIdentifier, NotebookSetting, ICellOutput, ICell } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IUndoRedoService } from 'vs/platform/undoRedo/common/undoRedo';
import { INotebookEditorModelResolverService } from 'vs/workbench/contrib/notebook/common/notebookEditorModelResolverService';
import { NotebookDiffEditorInput } from 'vs/workbench/contrib/notebook/common/notebookDiffEditorInput';
import { NotebookTextDiffEditor } from 'vs/workbench/contrib/notebook/browser/diff/notebookDiffEditor';
import { INotebookEditorWorkerService } from 'vs/workbench/contrib/notebook/common/services/notebookWorkerService';
import { NotebookEditorWorkerServiceImpl } from 'vs/workbench/contrib/notebook/browser/services/notebookWorkerServiceImpl';
import { INotebookCellStatusBarService } from 'vs/workbench/contrib/notebook/common/notebookCellStatusBarService';
import { NotebookCellStatusBarService } from 'vs/workbench/contrib/notebook/browser/services/notebookCellStatusBarServiceImpl';
import { INotebookEditorService } from 'vs/workbench/contrib/notebook/browser/services/notebookEditorService';
import { NotebookEditorWidgetService } from 'vs/workbench/contrib/notebook/browser/services/notebookEditorServiceImpl';
import { IJSONContributionRegistry, Extensions as JSONExtensions } from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import { IJSONSchema, IJSONSchemaMap } from 'vs/base/common/jsonSchema';
import { Event } from 'vs/base/common/event';
import { getFormattedMetadataJSON, getStreamOutputData } from 'vs/workbench/contrib/notebook/browser/diff/diffElementViewModel';
import { NotebookModelResolverServiceImpl } from 'vs/workbench/contrib/notebook/common/notebookEditorModelResolverServiceImpl';
import { INotebookKernelHistoryService, INotebookKernelService } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { NotebookKernelService } from 'vs/workbench/contrib/notebook/browser/services/notebookKernelServiceImpl';
import { IWorkingCopyIdentifier } from 'vs/workbench/services/workingCopy/common/workingCopy';
import { IResourceEditorInput } from 'vs/platform/editor/common/editor';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IWorkingCopyEditorHandler, IWorkingCopyEditorService } from 'vs/workbench/services/workingCopy/common/workingCopyEditorService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ILabelService } from 'vs/platform/label/common/label';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { NotebookRendererMessagingService } from 'vs/workbench/contrib/notebook/browser/services/notebookRendererMessagingServiceImpl';
import { INotebookRendererMessagingService } from 'vs/workbench/contrib/notebook/common/notebookRendererMessagingService';

// Editor Controller
import 'vs/workbench/contrib/notebook/browser/controller/coreActions';
import 'vs/workbench/contrib/notebook/browser/controller/insertCellActions';
import 'vs/workbench/contrib/notebook/browser/controller/executeActions';
import 'vs/workbench/contrib/notebook/browser/controller/layoutActions';
import 'vs/workbench/contrib/notebook/browser/controller/editActions';
import 'vs/workbench/contrib/notebook/browser/controller/apiActions';
import 'vs/workbench/contrib/notebook/browser/controller/foldingController';

// Editor Contribution
import 'vs/workbench/contrib/notebook/browser/contrib/clipboard/notebookClipboard';
import 'vs/workbench/contrib/notebook/browser/contrib/find/notebookFind';
import 'vs/workbench/contrib/notebook/browser/contrib/format/formatting';
import 'vs/workbench/contrib/notebook/browser/contrib/saveParticipants/saveParticipants';
import 'vs/workbench/contrib/notebook/browser/contrib/gettingStarted/notebookGettingStarted';
import 'vs/workbench/contrib/notebook/browser/contrib/layout/layoutActions';
import 'vs/workbench/contrib/notebook/browser/contrib/marker/markerProvider';
import 'vs/workbench/contrib/notebook/browser/contrib/navigation/arrow';
import 'vs/workbench/contrib/notebook/browser/contrib/outline/notebookOutline';
import 'vs/workbench/contrib/notebook/browser/contrib/profile/notebookProfile';
import 'vs/workbench/contrib/notebook/browser/contrib/cellStatusBar/statusBarProviders';
import 'vs/workbench/contrib/notebook/browser/contrib/cellStatusBar/contributedStatusBarItemController';
import 'vs/workbench/contrib/notebook/browser/contrib/cellStatusBar/executionStatusBarItemController';
import 'vs/workbench/contrib/notebook/browser/contrib/editorStatusBar/editorStatusBar';
import 'vs/workbench/contrib/notebook/browser/contrib/undoRedo/notebookUndoRedo';
import 'vs/workbench/contrib/notebook/browser/contrib/cellCommands/cellCommands';
import 'vs/workbench/contrib/notebook/browser/contrib/viewportWarmup/viewportWarmup';
import 'vs/workbench/contrib/notebook/browser/contrib/troubleshoot/layout';
import 'vs/workbench/contrib/notebook/browser/contrib/debug/notebookBreakpoints';
import 'vs/workbench/contrib/notebook/browser/contrib/debug/notebookCellPausing';
import 'vs/workbench/contrib/notebook/browser/contrib/debug/notebookDebugDecorations';
import 'vs/workbench/contrib/notebook/browser/contrib/execute/executionEditorProgress';
import 'vs/workbench/contrib/notebook/browser/contrib/kernelDetection/notebookKernelDetection';

// Diff Editor Contribution
import 'vs/workbench/contrib/notebook/browser/diff/notebookDiffActions';

// Services
import { editorOptionsRegistry } from 'vs/editor/common/config/editorOptions';
import { NotebookExecutionStateService } from 'vs/workbench/contrib/notebook/browser/services/notebookExecutionStateServiceImpl';
import { NotebookExecutionService } from 'vs/workbench/contrib/notebook/browser/services/notebookExecutionServiceImpl';
import { INotebookExecutionService } from 'vs/workbench/contrib/notebook/common/notebookExecutionService';
import { INotebookKeymapService } from 'vs/workbench/contrib/notebook/common/notebookKeymapService';
import { NotebookKeymapService } from 'vs/workbench/contrib/notebook/browser/services/notebookKeymapServiceImpl';
import { PLAINTEXT_LANGUAGE_ID } from 'vs/editor/common/languages/modesRegistry';
import { INotebookExecutionStateService } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { NotebookInfo } from 'vs/editor/common/languageFeatureRegistry';
import { COMMENTEDITOR_DECORATION_KEY } from 'vs/workbench/contrib/comments/browser/commentReply';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { NotebookKernelHistoryService } from 'vs/workbench/contrib/notebook/browser/services/notebookKernelHistoryServiceImpl';
import { INotebookLoggingService } from 'vs/workbench/contrib/notebook/common/notebookLoggingService';
import { NotebookLoggingService } from 'vs/workbench/contrib/notebook/browser/services/notebookLoggingServiceImpl';
import product from 'vs/platform/product/common/product';

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

class NotebookDiffEditorSerializer implements IEditorSerializer {
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

		const input = NotebookDiffEditorInput.create(instantiationService, resource, name, undefined, originalResource, viewType);
		return input;
	}

	static canResolveBackup(editorInput: EditorInput, backupResource: URI): boolean {
		return false;
	}

}
type SerializedNotebookEditorData = { resource: URI; viewType: string; options?: NotebookEditorInputOptions };
class NotebookEditorSerializer implements IEditorSerializer {
	canSerialize(): boolean {
		return true;
	}
	serialize(input: EditorInput): string {
		assertType(input instanceof NotebookEditorInput);
		const data: SerializedNotebookEditorData = {
			resource: input.resource,
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
		const { resource, viewType, options } = data;
		if (!data || !URI.isUri(resource) || typeof viewType !== 'string') {
			return undefined;
		}

		const input = NotebookEditorInput.create(instantiationService, resource, viewType, options);
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

		for (const cell of ref.object.notebook.cells) {
			if (cell.handle === data.handle) {
				const metadataSource = getFormattedMetadataJSON(ref.object.notebook, cell.metadata, cell.language);
				result = this._modelService.createModel(
					metadataSource,
					mode,
					resource
				);
				break;
			}
		}

		if (!result) {
			ref.dispose();
			return null;
		}

		const once = result.onWillDispose(() => {
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
		const op = cell.outputs.find(op => op.outputId === data.outputId);
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

	async provideOutputTextContent(resource: URI): Promise<ITextModel | null> {
		const existing = this._modelService.getModel(resource);
		if (existing) {
			return existing;
		}

		const data = CellUri.parseCellOutputUri(resource);
		if (!data) {
			return null;
		}

		const ref = await this._notebookModelResolverService.resolve(data.notebook);
		const cell = ref.object.notebook.cells.find(cell => !!cell.outputs.find(op => op.outputId === data.outputId));

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

class RegisterSchemasContribution extends Disposable implements IWorkbenchContribution {
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
			if (model.isDirty() && !this._editorService.isOpened({ resource: model.resource, typeId: NotebookEditorInput.ID, editorId: model.viewType }) && model.resource.scheme !== Schemas.vscodeInteractive) {
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
		if (!viewType || viewType === 'interactive') {
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
		return NotebookEditorInput.create(this._instantiationService, workingCopy.resource, this._getViewType(workingCopy)!);
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
workbenchContributionsRegistry.registerWorkbenchContribution(NotebookContribution, LifecyclePhase.Starting);
workbenchContributionsRegistry.registerWorkbenchContribution(CellContentProvider, LifecyclePhase.Starting);
workbenchContributionsRegistry.registerWorkbenchContribution(CellInfoContentProvider, LifecyclePhase.Starting);
workbenchContributionsRegistry.registerWorkbenchContribution(RegisterSchemasContribution, LifecyclePhase.Starting);
workbenchContributionsRegistry.registerWorkbenchContribution(NotebookEditorManager, LifecyclePhase.Ready);
workbenchContributionsRegistry.registerWorkbenchContribution(NotebookLanguageSelectorScoreRefine, LifecyclePhase.Ready);
workbenchContributionsRegistry.registerWorkbenchContribution(SimpleNotebookWorkingCopyEditorHandler, LifecyclePhase.Ready);

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
			tags: ['notebookLayout', 'notebookOutputLayout']
		},
		[NotebookSetting.markupFontSize]: {
			markdownDescription: nls.localize('notebook.markup.fontSize', "Controls the font size in pixels of rendered markup in notebooks. When set to {0}, 120% of {1} is used.", '`0`', '`#editor.fontSize#`'),
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
			markdownDescription: nls.localize('notebook.outputScrolling', "Initially render notebook outputs in a scrollable region when longer than the limit"),
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
		[NotebookSetting.formatOnSave]: {
			markdownDescription: nls.localize('notebook.formatOnSave', "Format a notebook on save. A formatter must be available, the file must not be saved after delay, and the editor must not be shutting down."),
			type: 'boolean',
			tags: ['notebookLayout'],
			default: false
		},
		[NotebookSetting.codeActionsOnSave]: {
			markdownDescription: nls.localize('notebook.codeActionsOnSave', "Experimental. Run a series of CodeActions for a notebook on save. CodeActions must be specified, the file must not be saved after delay, and the editor must not be shutting down. Example: `source.fixAll: true`"),
			type: 'object',
			additionalProperties: {
				type: 'boolean'
			},
			default: {}
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
		[NotebookSetting.findScope]: {
			markdownDescription: nls.localize('notebook.findScope', "Customize the Find Widget behavior for searching within notebook cells. When both markup source and markup preview are enabled, the Find Widget will search either the source code or preview based on the current state of the cell."),
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
		}
	}
});


