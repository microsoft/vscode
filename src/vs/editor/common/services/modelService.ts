/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, IDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import * as platform from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { EditOperation, ISingleEditOperation } from 'vs/editor/common/core/editOperation';
import { Range } from 'vs/editor/common/core/range';
import { DefaultEndOfLine, EndOfLinePreference, EndOfLineSequence, ITextBuffer, ITextBufferFactory, ITextModel, ITextModelCreationOptions } from 'vs/editor/common/model';
import { TextModel, createTextBuffer } from 'vs/editor/common/model/textModel';
import { EDITOR_MODEL_DEFAULTS } from 'vs/editor/common/core/textModelDefaults';
import { IModelLanguageChangedEvent } from 'vs/editor/common/textModelEvents';
import { PLAINTEXT_LANGUAGE_ID } from 'vs/editor/common/languages/modesRegistry';
import { ILanguageSelection, ILanguageService } from 'vs/editor/common/languages/language';
import { IModelService } from 'vs/editor/common/services/model';
import { ITextResourcePropertiesService } from 'vs/editor/common/services/textResourceConfiguration';
import { IConfigurationChangeEvent, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IUndoRedoService, ResourceEditStackSnapshot } from 'vs/platform/undoRedo/common/undoRedo';
import { StringSHA1 } from 'vs/base/common/hash';
import { isEditStackElement } from 'vs/editor/common/model/editStack';
import { Schemas } from 'vs/base/common/network';
import { equals } from 'vs/base/common/objects';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';

function MODEL_ID(resource: URI): string {
	return resource.toString();
}

class ModelData implements IDisposable {

	private readonly _modelEventListeners = new DisposableStore();

	constructor(
		public readonly model: TextModel,
		onWillDispose: (model: ITextModel) => void,
		onDidChangeLanguage: (model: ITextModel, e: IModelLanguageChangedEvent) => void
	) {
		this.model = model;
		this._modelEventListeners.add(model.onWillDispose(() => onWillDispose(model)));
		this._modelEventListeners.add(model.onDidChangeLanguage((e) => onDidChangeLanguage(model, e)));
	}

	public dispose(): void {
		this._modelEventListeners.dispose();
	}
}

interface IRawEditorConfig {
	tabSize?: any;
	indentSize?: any;
	insertSpaces?: any;
	detectIndentation?: any;
	trimAutoWhitespace?: any;
	creationOptions?: any;
	largeFileOptimizations?: any;
	bracketPairColorization?: any;
}

interface IRawConfig {
	eol?: any;
	editor?: IRawEditorConfig;
}

const DEFAULT_EOL = (platform.isLinux || platform.isMacintosh) ? DefaultEndOfLine.LF : DefaultEndOfLine.CRLF;

class DisposedModelInfo {
	constructor(
		public readonly uri: URI,
		public readonly initialUndoRedoSnapshot: ResourceEditStackSnapshot | null,
		public readonly time: number,
		public readonly sharesUndoRedoStack: boolean,
		public readonly heapSize: number,
		public readonly sha1: string,
		public readonly versionId: number,
		public readonly alternativeVersionId: number,
	) { }
}

export class ModelService extends Disposable implements IModelService {

	public static MAX_MEMORY_FOR_CLOSED_FILES_UNDO_STACK = 20 * 1024 * 1024;

	public _serviceBrand: undefined;

	private readonly _onModelAdded: Emitter<ITextModel> = this._register(new Emitter<ITextModel>());
	public readonly onModelAdded: Event<ITextModel> = this._onModelAdded.event;

	private readonly _onModelRemoved: Emitter<ITextModel> = this._register(new Emitter<ITextModel>());
	public readonly onModelRemoved: Event<ITextModel> = this._onModelRemoved.event;

	private readonly _onModelModeChanged = this._register(new Emitter<{ model: ITextModel; oldLanguageId: string }>());
	public readonly onModelLanguageChanged = this._onModelModeChanged.event;

	private _modelCreationOptionsByLanguageAndResource: { [languageAndResource: string]: ITextModelCreationOptions };

	/**
	 * All the models known in the system.
	 */
	private readonly _models: { [modelId: string]: ModelData };
	private readonly _disposedModels: Map<string, DisposedModelInfo>;
	private _disposedModelsHeapSize: number;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITextResourcePropertiesService private readonly _resourcePropertiesService: ITextResourcePropertiesService,
		@IUndoRedoService private readonly _undoRedoService: IUndoRedoService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@ILanguageConfigurationService private readonly _languageConfigurationService: ILanguageConfigurationService,
	) {
		super();
		this._modelCreationOptionsByLanguageAndResource = Object.create(null);
		this._models = {};
		this._disposedModels = new Map<string, DisposedModelInfo>();
		this._disposedModelsHeapSize = 0;

		this._register(this._configurationService.onDidChangeConfiguration(e => this._updateModelOptions(e)));
		this._updateModelOptions(undefined);
	}

	private static _readModelOptions(config: IRawConfig, isForSimpleWidget: boolean): ITextModelCreationOptions {
		let tabSize = EDITOR_MODEL_DEFAULTS.tabSize;
		if (config.editor && typeof config.editor.tabSize !== 'undefined') {
			const parsedTabSize = parseInt(config.editor.tabSize, 10);
			if (!isNaN(parsedTabSize)) {
				tabSize = parsedTabSize;
			}
			if (tabSize < 1) {
				tabSize = 1;
			}
		}

		let indentSize: number | 'tabSize' = 'tabSize';
		if (config.editor && typeof config.editor.indentSize !== 'undefined' && config.editor.indentSize !== 'tabSize') {
			const parsedIndentSize = parseInt(config.editor.indentSize, 10);
			if (!isNaN(parsedIndentSize)) {
				indentSize = Math.max(parsedIndentSize, 1);
			}
		}

		let insertSpaces = EDITOR_MODEL_DEFAULTS.insertSpaces;
		if (config.editor && typeof config.editor.insertSpaces !== 'undefined') {
			insertSpaces = (config.editor.insertSpaces === 'false' ? false : Boolean(config.editor.insertSpaces));
		}

		let newDefaultEOL = DEFAULT_EOL;
		const eol = config.eol;
		if (eol === '\r\n') {
			newDefaultEOL = DefaultEndOfLine.CRLF;
		} else if (eol === '\n') {
			newDefaultEOL = DefaultEndOfLine.LF;
		}

		let trimAutoWhitespace = EDITOR_MODEL_DEFAULTS.trimAutoWhitespace;
		if (config.editor && typeof config.editor.trimAutoWhitespace !== 'undefined') {
			trimAutoWhitespace = (config.editor.trimAutoWhitespace === 'false' ? false : Boolean(config.editor.trimAutoWhitespace));
		}

		let detectIndentation = EDITOR_MODEL_DEFAULTS.detectIndentation;
		if (config.editor && typeof config.editor.detectIndentation !== 'undefined') {
			detectIndentation = (config.editor.detectIndentation === 'false' ? false : Boolean(config.editor.detectIndentation));
		}

		let largeFileOptimizations = EDITOR_MODEL_DEFAULTS.largeFileOptimizations;
		if (config.editor && typeof config.editor.largeFileOptimizations !== 'undefined') {
			largeFileOptimizations = (config.editor.largeFileOptimizations === 'false' ? false : Boolean(config.editor.largeFileOptimizations));
		}
		let bracketPairColorizationOptions = EDITOR_MODEL_DEFAULTS.bracketPairColorizationOptions;
		if (config.editor?.bracketPairColorization && typeof config.editor.bracketPairColorization === 'object') {
			bracketPairColorizationOptions = {
				enabled: !!config.editor.bracketPairColorization.enabled,
				independentColorPoolPerBracketType: !!config.editor.bracketPairColorization.independentColorPoolPerBracketType
			};
		}

		return {
			isForSimpleWidget: isForSimpleWidget,
			tabSize: tabSize,
			indentSize: indentSize,
			insertSpaces: insertSpaces,
			detectIndentation: detectIndentation,
			defaultEOL: newDefaultEOL,
			trimAutoWhitespace: trimAutoWhitespace,
			largeFileOptimizations: largeFileOptimizations,
			bracketPairColorizationOptions
		};
	}

	private _getEOL(resource: URI | undefined, language: string): string {
		if (resource) {
			return this._resourcePropertiesService.getEOL(resource, language);
		}
		const eol = this._configurationService.getValue('files.eol', { overrideIdentifier: language });
		if (eol && typeof eol === 'string' && eol !== 'auto') {
			return eol;
		}
		return platform.OS === platform.OperatingSystem.Linux || platform.OS === platform.OperatingSystem.Macintosh ? '\n' : '\r\n';
	}

	private _shouldRestoreUndoStack(): boolean {
		const result = this._configurationService.getValue('files.restoreUndoStack');
		if (typeof result === 'boolean') {
			return result;
		}
		return true;
	}

	public getCreationOptions(languageIdOrSelection: string | ILanguageSelection, resource: URI | undefined, isForSimpleWidget: boolean): ITextModelCreationOptions {
		const language = (typeof languageIdOrSelection === 'string' ? languageIdOrSelection : languageIdOrSelection.languageId);
		let creationOptions = this._modelCreationOptionsByLanguageAndResource[language + resource];
		if (!creationOptions) {
			const editor = this._configurationService.getValue<IRawEditorConfig>('editor', { overrideIdentifier: language, resource });
			const eol = this._getEOL(resource, language);
			creationOptions = ModelService._readModelOptions({ editor, eol }, isForSimpleWidget);
			this._modelCreationOptionsByLanguageAndResource[language + resource] = creationOptions;
		}
		return creationOptions;
	}

	private _updateModelOptions(e: IConfigurationChangeEvent | undefined): void {
		const oldOptionsByLanguageAndResource = this._modelCreationOptionsByLanguageAndResource;
		this._modelCreationOptionsByLanguageAndResource = Object.create(null);

		// Update options on all models
		const keys = Object.keys(this._models);
		for (let i = 0, len = keys.length; i < len; i++) {
			const modelId = keys[i];
			const modelData = this._models[modelId];
			const language = modelData.model.getLanguageId();
			const uri = modelData.model.uri;

			if (e && !e.affectsConfiguration('editor', { overrideIdentifier: language, resource: uri }) && !e.affectsConfiguration('files.eol', { overrideIdentifier: language, resource: uri })) {
				continue; // perf: skip if this model is not affected by configuration change
			}

			const oldOptions = oldOptionsByLanguageAndResource[language + uri];
			const newOptions = this.getCreationOptions(language, uri, modelData.model.isForSimpleWidget);
			ModelService._setModelOptionsForModel(modelData.model, newOptions, oldOptions);
		}
	}

	private static _setModelOptionsForModel(model: ITextModel, newOptions: ITextModelCreationOptions, currentOptions: ITextModelCreationOptions): void {
		if (currentOptions && currentOptions.defaultEOL !== newOptions.defaultEOL && model.getLineCount() === 1) {
			model.setEOL(newOptions.defaultEOL === DefaultEndOfLine.LF ? EndOfLineSequence.LF : EndOfLineSequence.CRLF);
		}

		if (currentOptions
			&& (currentOptions.detectIndentation === newOptions.detectIndentation)
			&& (currentOptions.insertSpaces === newOptions.insertSpaces)
			&& (currentOptions.tabSize === newOptions.tabSize)
			&& (currentOptions.indentSize === newOptions.indentSize)
			&& (currentOptions.trimAutoWhitespace === newOptions.trimAutoWhitespace)
			&& equals(currentOptions.bracketPairColorizationOptions, newOptions.bracketPairColorizationOptions)
		) {
			// Same indent opts, no need to touch the model
			return;
		}

		if (newOptions.detectIndentation) {
			model.detectIndentation(newOptions.insertSpaces, newOptions.tabSize);
			model.updateOptions({
				trimAutoWhitespace: newOptions.trimAutoWhitespace,
				bracketColorizationOptions: newOptions.bracketPairColorizationOptions
			});
		} else {
			model.updateOptions({
				insertSpaces: newOptions.insertSpaces,
				tabSize: newOptions.tabSize,
				indentSize: newOptions.indentSize,
				trimAutoWhitespace: newOptions.trimAutoWhitespace,
				bracketColorizationOptions: newOptions.bracketPairColorizationOptions
			});
		}
	}

	// --- begin IModelService

	private _insertDisposedModel(disposedModelData: DisposedModelInfo): void {
		this._disposedModels.set(MODEL_ID(disposedModelData.uri), disposedModelData);
		this._disposedModelsHeapSize += disposedModelData.heapSize;
	}

	private _removeDisposedModel(resource: URI): DisposedModelInfo | undefined {
		const disposedModelData = this._disposedModels.get(MODEL_ID(resource));
		if (disposedModelData) {
			this._disposedModelsHeapSize -= disposedModelData.heapSize;
		}
		this._disposedModels.delete(MODEL_ID(resource));
		return disposedModelData;
	}

	private _ensureDisposedModelsHeapSize(maxModelsHeapSize: number): void {
		if (this._disposedModelsHeapSize > maxModelsHeapSize) {
			// we must remove some old undo stack elements to free up some memory
			const disposedModels: DisposedModelInfo[] = [];
			this._disposedModels.forEach(entry => {
				if (!entry.sharesUndoRedoStack) {
					disposedModels.push(entry);
				}
			});
			disposedModels.sort((a, b) => a.time - b.time);
			while (disposedModels.length > 0 && this._disposedModelsHeapSize > maxModelsHeapSize) {
				const disposedModel = disposedModels.shift()!;
				this._removeDisposedModel(disposedModel.uri);
				if (disposedModel.initialUndoRedoSnapshot !== null) {
					this._undoRedoService.restoreSnapshot(disposedModel.initialUndoRedoSnapshot);
				}
			}
		}
	}

	private _createModelData(value: string | ITextBufferFactory, languageIdOrSelection: string | ILanguageSelection, resource: URI | undefined, isForSimpleWidget: boolean): ModelData {
		// create & save the model
		const options = this.getCreationOptions(languageIdOrSelection, resource, isForSimpleWidget);
		const model: TextModel = new TextModel(
			value,
			languageIdOrSelection,
			options,
			resource,
			this._undoRedoService,
			this._languageService,
			this._languageConfigurationService,
		);
		if (resource && this._disposedModels.has(MODEL_ID(resource))) {
			const disposedModelData = this._removeDisposedModel(resource)!;
			const elements = this._undoRedoService.getElements(resource);
			const sha1Computer = this._getSHA1Computer();
			const sha1IsEqual = (
				sha1Computer.canComputeSHA1(model)
					? sha1Computer.computeSHA1(model) === disposedModelData.sha1
					: false
			);
			if (sha1IsEqual || disposedModelData.sharesUndoRedoStack) {
				for (const element of elements.past) {
					if (isEditStackElement(element) && element.matchesResource(resource)) {
						element.setModel(model);
					}
				}
				for (const element of elements.future) {
					if (isEditStackElement(element) && element.matchesResource(resource)) {
						element.setModel(model);
					}
				}
				this._undoRedoService.setElementsValidFlag(resource, true, (element) => (isEditStackElement(element) && element.matchesResource(resource)));
				if (sha1IsEqual) {
					model._overwriteVersionId(disposedModelData.versionId);
					model._overwriteAlternativeVersionId(disposedModelData.alternativeVersionId);
					model._overwriteInitialUndoRedoSnapshot(disposedModelData.initialUndoRedoSnapshot);
				}
			} else {
				if (disposedModelData.initialUndoRedoSnapshot !== null) {
					this._undoRedoService.restoreSnapshot(disposedModelData.initialUndoRedoSnapshot);
				}
			}
		}
		const modelId = MODEL_ID(model.uri);

		if (this._models[modelId]) {
			// There already exists a model with this id => this is a programmer error
			throw new Error('ModelService: Cannot add model because it already exists!');
		}

		const modelData = new ModelData(
			model,
			(model) => this._onWillDispose(model),
			(model, e) => this._onDidChangeLanguage(model, e)
		);
		this._models[modelId] = modelData;

		return modelData;
	}

	public updateModel(model: ITextModel, value: string | ITextBufferFactory): void {
		const options = this.getCreationOptions(model.getLanguageId(), model.uri, model.isForSimpleWidget);
		const { textBuffer, disposable } = createTextBuffer(value, options.defaultEOL);

		// Return early if the text is already set in that form
		if (model.equalsTextBuffer(textBuffer)) {
			disposable.dispose();
			return;
		}

		// Otherwise find a diff between the values and update model
		model.pushStackElement();
		model.pushEOL(textBuffer.getEOL() === '\r\n' ? EndOfLineSequence.CRLF : EndOfLineSequence.LF);
		model.pushEditOperations(
			[],
			ModelService._computeEdits(model, textBuffer),
			() => []
		);
		model.pushStackElement();
		disposable.dispose();
	}

	private static _commonPrefix(a: ITextModel, aLen: number, aDelta: number, b: ITextBuffer, bLen: number, bDelta: number): number {
		const maxResult = Math.min(aLen, bLen);

		let result = 0;
		for (let i = 0; i < maxResult && a.getLineContent(aDelta + i) === b.getLineContent(bDelta + i); i++) {
			result++;
		}
		return result;
	}

	private static _commonSuffix(a: ITextModel, aLen: number, aDelta: number, b: ITextBuffer, bLen: number, bDelta: number): number {
		const maxResult = Math.min(aLen, bLen);

		let result = 0;
		for (let i = 0; i < maxResult && a.getLineContent(aDelta + aLen - i) === b.getLineContent(bDelta + bLen - i); i++) {
			result++;
		}
		return result;
	}

	/**
	 * Compute edits to bring `model` to the state of `textSource`.
	 */
	public static _computeEdits(model: ITextModel, textBuffer: ITextBuffer): ISingleEditOperation[] {
		const modelLineCount = model.getLineCount();
		const textBufferLineCount = textBuffer.getLineCount();
		const commonPrefix = this._commonPrefix(model, modelLineCount, 1, textBuffer, textBufferLineCount, 1);

		if (modelLineCount === textBufferLineCount && commonPrefix === modelLineCount) {
			// equality case
			return [];
		}

		const commonSuffix = this._commonSuffix(model, modelLineCount - commonPrefix, commonPrefix, textBuffer, textBufferLineCount - commonPrefix, commonPrefix);

		let oldRange: Range;
		let newRange: Range;
		if (commonSuffix > 0) {
			oldRange = new Range(commonPrefix + 1, 1, modelLineCount - commonSuffix + 1, 1);
			newRange = new Range(commonPrefix + 1, 1, textBufferLineCount - commonSuffix + 1, 1);
		} else if (commonPrefix > 0) {
			oldRange = new Range(commonPrefix, model.getLineMaxColumn(commonPrefix), modelLineCount, model.getLineMaxColumn(modelLineCount));
			newRange = new Range(commonPrefix, 1 + textBuffer.getLineLength(commonPrefix), textBufferLineCount, 1 + textBuffer.getLineLength(textBufferLineCount));
		} else {
			oldRange = new Range(1, 1, modelLineCount, model.getLineMaxColumn(modelLineCount));
			newRange = new Range(1, 1, textBufferLineCount, 1 + textBuffer.getLineLength(textBufferLineCount));
		}

		return [EditOperation.replaceMove(oldRange, textBuffer.getValueInRange(newRange, EndOfLinePreference.TextDefined))];
	}

	public createModel(value: string | ITextBufferFactory, languageSelection: ILanguageSelection | null, resource?: URI, isForSimpleWidget: boolean = false): ITextModel {
		let modelData: ModelData;

		if (languageSelection) {
			modelData = this._createModelData(value, languageSelection, resource, isForSimpleWidget);
		} else {
			modelData = this._createModelData(value, PLAINTEXT_LANGUAGE_ID, resource, isForSimpleWidget);
		}

		this._onModelAdded.fire(modelData.model);

		return modelData.model;
	}

	public destroyModel(resource: URI): void {
		// We need to support that not all models get disposed through this service (i.e. model.dispose() should work!)
		const modelData = this._models[MODEL_ID(resource)];
		if (!modelData) {
			return;
		}
		modelData.model.dispose();
	}

	public getModels(): ITextModel[] {
		const ret: ITextModel[] = [];

		const keys = Object.keys(this._models);
		for (let i = 0, len = keys.length; i < len; i++) {
			const modelId = keys[i];
			ret.push(this._models[modelId].model);
		}

		return ret;
	}

	public getModel(resource: URI): ITextModel | null {
		const modelId = MODEL_ID(resource);
		const modelData = this._models[modelId];
		if (!modelData) {
			return null;
		}
		return modelData.model;
	}

	// --- end IModelService

	protected _schemaShouldMaintainUndoRedoElements(resource: URI) {
		return (
			resource.scheme === Schemas.file
			|| resource.scheme === Schemas.vscodeRemote
			|| resource.scheme === Schemas.vscodeUserData
			|| resource.scheme === Schemas.vscodeNotebookCell
			|| resource.scheme === 'fake-fs' // for tests
		);
	}

	private _onWillDispose(model: ITextModel): void {
		const modelId = MODEL_ID(model.uri);
		const modelData = this._models[modelId];

		const sharesUndoRedoStack = (this._undoRedoService.getUriComparisonKey(model.uri) !== model.uri.toString());
		let maintainUndoRedoStack = false;
		let heapSize = 0;
		if (sharesUndoRedoStack || (this._shouldRestoreUndoStack() && this._schemaShouldMaintainUndoRedoElements(model.uri))) {
			const elements = this._undoRedoService.getElements(model.uri);
			if (elements.past.length > 0 || elements.future.length > 0) {
				for (const element of elements.past) {
					if (isEditStackElement(element) && element.matchesResource(model.uri)) {
						maintainUndoRedoStack = true;
						heapSize += element.heapSize(model.uri);
						element.setModel(model.uri); // remove reference from text buffer instance
					}
				}
				for (const element of elements.future) {
					if (isEditStackElement(element) && element.matchesResource(model.uri)) {
						maintainUndoRedoStack = true;
						heapSize += element.heapSize(model.uri);
						element.setModel(model.uri); // remove reference from text buffer instance
					}
				}
			}
		}

		const maxMemory = ModelService.MAX_MEMORY_FOR_CLOSED_FILES_UNDO_STACK;
		const sha1Computer = this._getSHA1Computer();
		if (!maintainUndoRedoStack) {
			if (!sharesUndoRedoStack) {
				const initialUndoRedoSnapshot = modelData.model.getInitialUndoRedoSnapshot();
				if (initialUndoRedoSnapshot !== null) {
					this._undoRedoService.restoreSnapshot(initialUndoRedoSnapshot);
				}
			}
		} else if (!sharesUndoRedoStack && (heapSize > maxMemory || !sha1Computer.canComputeSHA1(model))) {
			// the undo stack for this file would never fit in the configured memory or the file is very large, so don't bother with it.
			const initialUndoRedoSnapshot = modelData.model.getInitialUndoRedoSnapshot();
			if (initialUndoRedoSnapshot !== null) {
				this._undoRedoService.restoreSnapshot(initialUndoRedoSnapshot);
			}
		} else {
			this._ensureDisposedModelsHeapSize(maxMemory - heapSize);
			// We only invalidate the elements, but they remain in the undo-redo service.
			this._undoRedoService.setElementsValidFlag(model.uri, false, (element) => (isEditStackElement(element) && element.matchesResource(model.uri)));
			this._insertDisposedModel(new DisposedModelInfo(model.uri, modelData.model.getInitialUndoRedoSnapshot(), Date.now(), sharesUndoRedoStack, heapSize, sha1Computer.computeSHA1(model), model.getVersionId(), model.getAlternativeVersionId()));
		}

		delete this._models[modelId];
		modelData.dispose();

		// clean up cache
		delete this._modelCreationOptionsByLanguageAndResource[model.getLanguageId() + model.uri];

		this._onModelRemoved.fire(model);
	}

	private _onDidChangeLanguage(model: ITextModel, e: IModelLanguageChangedEvent): void {
		const oldLanguageId = e.oldLanguage;
		const newLanguageId = model.getLanguageId();
		const oldOptions = this.getCreationOptions(oldLanguageId, model.uri, model.isForSimpleWidget);
		const newOptions = this.getCreationOptions(newLanguageId, model.uri, model.isForSimpleWidget);
		ModelService._setModelOptionsForModel(model, newOptions, oldOptions);
		this._onModelModeChanged.fire({ model, oldLanguageId: oldLanguageId });
	}

	protected _getSHA1Computer(): ITextModelSHA1Computer {
		return new DefaultModelSHA1Computer();
	}
}

export interface ITextModelSHA1Computer {
	canComputeSHA1(model: ITextModel): boolean;
	computeSHA1(model: ITextModel): string;
}

export class DefaultModelSHA1Computer implements ITextModelSHA1Computer {

	public static MAX_MODEL_SIZE = 10 * 1024 * 1024; // takes 200ms to compute a sha1 on a 10MB model on a new machine

	canComputeSHA1(model: ITextModel): boolean {
		return (model.getValueLength() <= DefaultModelSHA1Computer.MAX_MODEL_SIZE);
	}

	computeSHA1(model: ITextModel): string {
		// compute the sha1
		const shaComputer = new StringSHA1();
		const snapshot = model.createSnapshot();
		let text: string | null;
		while ((text = snapshot.read())) {
			shaComputer.update(text);
		}
		return shaComputer.digest();
	}
}
