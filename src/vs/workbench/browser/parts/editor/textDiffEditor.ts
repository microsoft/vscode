/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as objects from 'vs/base/common/objects';
import * as types from 'vs/base/common/types';
import { IDiffEditor } from 'vs/editor/browser/editorBrowser';
import { IDiffEditorOptions, IEditorOptions as ICodeEditorOptions } from 'vs/editor/common/config/editorOptions';
import { BaseTextEditor, IEditorConfiguration } from 'vs/workbench/browser/parts/editor/textEditor';
import { TextEditorOptions, EditorInput, EditorOptions, TEXT_DIFF_EDITOR_ID, IEditorInputFactoryRegistry, Extensions as EditorInputExtensions, ITextDiffEditor, IEditorMemento } from 'vs/workbench/common/editor';
import { ResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { DiffNavigator } from 'vs/editor/browser/widget/diffNavigator';
import { DiffEditorWidget } from 'vs/editor/browser/widget/diffEditorWidget';
import { TextDiffEditorModel } from 'vs/workbench/common/editor/textDiffEditorModel';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/resourceConfiguration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ITextFileService, TextFileOperationError, TextFileOperationResult } from 'vs/workbench/services/textfile/common/textfiles';
import { ScrollType, IDiffEditorViewState, IDiffEditorModel } from 'vs/editor/common/editorCommon';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { URI } from 'vs/base/common/uri';
import { Event } from 'vs/base/common/event';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { CancellationToken } from 'vs/base/common/cancellation';
import { EditorMemento } from 'vs/workbench/browser/parts/editor/baseEditor';
import { IWindowService } from 'vs/platform/windows/common/windows';

/**
 * The text editor that leverages the diff text editor for the editing experience.
 */
export class TextDiffEditor extends BaseTextEditor implements ITextDiffEditor {

	static readonly ID = TEXT_DIFF_EDITOR_ID;

	private diffNavigator: DiffNavigator;
	private readonly diffNavigatorDisposables = this._register(new DisposableStore());

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@ITextResourceConfigurationService configurationService: ITextResourceConfigurationService,
		@IEditorService editorService: IEditorService,
		@IThemeService themeService: IThemeService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@ITextFileService textFileService: ITextFileService,
		@IWindowService windowService: IWindowService
	) {
		super(TextDiffEditor.ID, telemetryService, instantiationService, storageService, configurationService, themeService, textFileService, editorService, editorGroupService, windowService);
	}

	protected getEditorMemento<T>(editorGroupService: IEditorGroupsService, key: string, limit: number = 10): IEditorMemento<T> {
		return new EditorMemento(this.getId(), key, Object.create(null), limit, editorGroupService); // do not persist in storage as diff editors are never persisted
	}

	getTitle(): string | null {
		if (this.input) {
			return this.input.getName();
		}

		return nls.localize('textDiffEditor', "Text Diff Editor");
	}

	createEditorControl(parent: HTMLElement, configuration: ICodeEditorOptions): IDiffEditor {
		return this.instantiationService.createInstance(DiffEditorWidget, parent, configuration);
	}

	async setInput(input: EditorInput, options: EditorOptions, token: CancellationToken): Promise<void> {

		// Dispose previous diff navigator
		this.diffNavigatorDisposables.clear();

		// Remember view settings if input changes
		this.saveTextDiffEditorViewState(this.input);

		// Set input and resolve
		await super.setInput(input, options, token);

		try {
			const resolvedModel = await input.resolve();

			// Check for cancellation
			if (token.isCancellationRequested) {
				return undefined;
			}

			// Assert Model Instance
			if (!(resolvedModel instanceof TextDiffEditorModel) && this.openAsBinary(input, options)) {
				return undefined;
			}

			// Set Editor Model
			const diffEditor = this.getControl();
			const resolvedDiffEditorModel = <TextDiffEditorModel>resolvedModel;
			diffEditor.setModel(resolvedDiffEditorModel.textDiffEditorModel);

			// Apply Options from TextOptions
			let optionsGotApplied = false;
			if (options && types.isFunction((<TextEditorOptions>options).apply)) {
				optionsGotApplied = (<TextEditorOptions>options).apply(diffEditor, ScrollType.Immediate);
			}

			// Otherwise restore View State
			let hasPreviousViewState = false;
			if (!optionsGotApplied) {
				hasPreviousViewState = this.restoreTextDiffEditorViewState(input);
			}

			// Diff navigator
			this.diffNavigator = new DiffNavigator(diffEditor, {
				alwaysRevealFirst: !optionsGotApplied && !hasPreviousViewState // only reveal first change if we had no options or viewstate
			});
			this.diffNavigatorDisposables.add(this.diffNavigator);

			// Readonly flag
			diffEditor.updateOptions({ readOnly: resolvedDiffEditorModel.isReadonly() });
		} catch (error) {

			// In case we tried to open a file and the response indicates that this is not a text file, fallback to binary diff.
			if (this.isFileBinaryError(error) && this.openAsBinary(input, options)) {
				return;
			}

			throw error;
		}
	}

	setOptions(options: EditorOptions): void {
		const textOptions = <TextEditorOptions>options;
		if (textOptions && types.isFunction(textOptions.apply)) {
			textOptions.apply(this.getControl(), ScrollType.Smooth);
		}
	}

	private restoreTextDiffEditorViewState(input: EditorInput): boolean {
		if (input instanceof DiffEditorInput) {
			const resource = this.toDiffEditorViewStateResource(input);
			if (resource) {
				const viewState = this.loadTextEditorViewState(resource);
				if (viewState) {
					this.getControl().restoreViewState(viewState);

					return true;
				}
			}
		}

		return false;
	}

	private openAsBinary(input: EditorInput, options: EditorOptions): boolean {
		if (input instanceof DiffEditorInput) {
			const originalInput = input.originalInput;
			const modifiedInput = input.modifiedInput;

			const binaryDiffInput = new DiffEditorInput(input.getName(), input.getDescription(), originalInput, modifiedInput, true);

			// Forward binary flag to input if supported
			const fileInputFactory = Registry.as<IEditorInputFactoryRegistry>(EditorInputExtensions.EditorInputFactories).getFileInputFactory();
			if (fileInputFactory.isFileInput(originalInput)) {
				originalInput.setForceOpenAsBinary();
			}

			if (fileInputFactory.isFileInput(modifiedInput)) {
				modifiedInput.setForceOpenAsBinary();
			}

			this.editorService.openEditor(binaryDiffInput, options, this.group);

			return true;
		}

		return false;
	}

	protected computeConfiguration(configuration: IEditorConfiguration): ICodeEditorOptions {
		const editorConfiguration = super.computeConfiguration(configuration);

		// Handle diff editor specially by merging in diffEditor configuration
		if (types.isObject(configuration.diffEditor)) {
			objects.mixin(editorConfiguration, configuration.diffEditor);
		}

		return editorConfiguration;
	}

	protected getConfigurationOverrides(): ICodeEditorOptions {
		const options: IDiffEditorOptions = super.getConfigurationOverrides();

		options.readOnly = this.isReadOnly();
		options.lineDecorationsWidth = '2ch';

		return options;
	}

	protected getAriaLabel(): string {
		let ariaLabel: string;
		const inputName = this.input && this.input.getName();
		if (this.isReadOnly()) {
			ariaLabel = inputName ? nls.localize('readonlyEditorWithInputAriaLabel', "{0}. Readonly text compare editor.", inputName) : nls.localize('readonlyEditorAriaLabel', "Readonly text compare editor.");
		} else {
			ariaLabel = inputName ? nls.localize('editableEditorWithInputAriaLabel', "{0}. Text file compare editor.", inputName) : nls.localize('editableEditorAriaLabel', "Text file compare editor.");
		}

		return ariaLabel;
	}

	private isReadOnly(): boolean {
		const input = this.input;
		if (input instanceof DiffEditorInput) {
			const modifiedInput = input.modifiedInput;

			return modifiedInput instanceof ResourceEditorInput;
		}

		return false;
	}

	private isFileBinaryError(error: Error[]): boolean;
	private isFileBinaryError(error: Error): boolean;
	private isFileBinaryError(error: Error | Error[]): boolean {
		if (types.isArray(error)) {
			const errors = <Error[]>error;

			return errors.some(e => this.isFileBinaryError(e));
		}

		return (<TextFileOperationError>error).textFileOperationResult === TextFileOperationResult.FILE_IS_BINARY;
	}

	clearInput(): void {

		// Dispose previous diff navigator
		this.diffNavigatorDisposables.clear();

		// Keep editor view state in settings to restore when coming back
		this.saveTextDiffEditorViewState(this.input);

		// Clear Model
		this.getControl().setModel(null);

		// Pass to super
		super.clearInput();
	}

	getDiffNavigator(): DiffNavigator {
		return this.diffNavigator;
	}

	getControl(): IDiffEditor {
		return super.getControl() as IDiffEditor;
	}

	protected loadTextEditorViewState(resource: URI): IDiffEditorViewState {
		return super.loadTextEditorViewState(resource) as IDiffEditorViewState;  // overridden for text diff editor support
	}

	private saveTextDiffEditorViewState(input: EditorInput | null): void {
		if (!(input instanceof DiffEditorInput)) {
			return; // only supported for diff editor inputs
		}

		const resource = this.toDiffEditorViewStateResource(input);
		if (!resource) {
			return; // unable to retrieve input resource
		}

		// Clear view state if input is disposed
		if (input.isDisposed()) {
			super.clearTextEditorViewState([resource]);
		}

		// Otherwise save it
		else {
			super.saveTextEditorViewState(resource);

			// Make sure to clean up when the input gets disposed
			Event.once(input.onDispose)(() => {
				super.clearTextEditorViewState([resource]);
			});
		}
	}

	protected retrieveTextEditorViewState(resource: URI): IDiffEditorViewState | null {
		return this.retrieveTextDiffEditorViewState(resource); // overridden for text diff editor support
	}

	private retrieveTextDiffEditorViewState(resource: URI): IDiffEditorViewState | null {
		const control = this.getControl();
		const model = control.getModel();
		if (!model || !model.modified || !model.original) {
			return null; // view state always needs a model
		}

		const modelUri = this.toDiffEditorViewStateResource(model);
		if (!modelUri) {
			return null; // model URI is needed to make sure we save the view state correctly
		}

		if (modelUri.toString() !== resource.toString()) {
			return null; // prevent saving view state for a model that is not the expected one
		}

		return control.saveViewState();
	}

	private toDiffEditorViewStateResource(modelOrInput: IDiffEditorModel | DiffEditorInput): URI | undefined {
		let original: URI | undefined;
		let modified: URI | undefined;

		if (modelOrInput instanceof DiffEditorInput) {
			original = modelOrInput.originalInput.getResource();
			modified = modelOrInput.modifiedInput.getResource();
		} else {
			original = modelOrInput.original.uri;
			modified = modelOrInput.modified.uri;
		}

		if (!original || !modified) {
			return undefined;
		}

		// create a URI that is the Base64 concatenation of original + modified resource
		return URI.from({ scheme: 'diff', path: `${btoa(original.toString())}${btoa(modified.toString())}` });
	}
}
