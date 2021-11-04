/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { deepClone } from 'vs/base/common/objects';
import { isObject, isArray, assertIsDefined, withUndefinedAsNull, withNullAsUndefined } from 'vs/base/common/types';
import { IDiffEditor, isDiffEditor } from 'vs/editor/browser/editorBrowser';
import { IDiffEditorOptions, IEditorOptions as ICodeEditorOptions } from 'vs/editor/common/config/editorOptions';
import { BaseTextEditor, IEditorConfiguration } from 'vs/workbench/browser/parts/editor/textEditor';
import { TEXT_DIFF_EDITOR_ID, IEditorFactoryRegistry, EditorExtensions, ITextDiffEditorPane, IEditorOpenContext, EditorInputCapabilities, isEditorInput } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { applyTextEditorOptions } from 'vs/workbench/common/editor/editorOptions';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { DiffNavigator } from 'vs/editor/browser/widget/diffNavigator';
import { DiffEditorWidget } from 'vs/editor/browser/widget/diffEditorWidget';
import { TextDiffEditorModel } from 'vs/workbench/common/editor/textDiffEditorModel';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/textResourceConfigurationService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { TextFileOperationError, TextFileOperationResult } from 'vs/workbench/services/textfile/common/textfiles';
import { ScrollType, IDiffEditorViewState, IDiffEditorModel } from 'vs/editor/common/editorCommon';
import { DisposableStore, MutableDisposable } from 'vs/base/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { URI } from 'vs/base/common/uri';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { CancellationToken } from 'vs/base/common/cancellation';
import { EditorActivation, ITextEditorOptions } from 'vs/platform/editor/common/editor';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { isEqual } from 'vs/base/common/resources';
import { multibyteAwareBtoa } from 'vs/base/browser/dom';
import { IFileService } from 'vs/platform/files/common/files';

/**
 * The text editor that leverages the diff text editor for the editing experience.
 */
export class TextDiffEditor extends BaseTextEditor<IDiffEditorViewState> implements ITextDiffEditorPane {

	static readonly ID = TEXT_DIFF_EDITOR_ID;

	private diffNavigator: DiffNavigator | undefined;
	private readonly diffNavigatorDisposables = this._register(new DisposableStore());

	private readonly inputListener = this._register(new MutableDisposable());

	override get scopedContextKeyService(): IContextKeyService | undefined {
		const control = this.getControl();
		if (!control) {
			return undefined;
		}

		const originalEditor = control.getOriginalEditor();
		const modifiedEditor = control.getModifiedEditor();

		return (originalEditor.hasTextFocus() ? originalEditor : modifiedEditor).invokeWithinContext(accessor => accessor.get(IContextKeyService));
	}

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@ITextResourceConfigurationService configurationService: ITextResourceConfigurationService,
		@IEditorService editorService: IEditorService,
		@IThemeService themeService: IThemeService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IFileService private readonly fileService: IFileService
	) {
		super(TextDiffEditor.ID, telemetryService, instantiationService, storageService, configurationService, themeService, editorService, editorGroupService);

		// Listen to file system provider changes
		this._register(this.fileService.onDidChangeFileSystemProviderCapabilities(e => this.onDidChangeFileSystemProvider(e.scheme)));
		this._register(this.fileService.onDidChangeFileSystemProviderRegistrations(e => this.onDidChangeFileSystemProvider(e.scheme)));
	}

	private onDidChangeFileSystemProvider(scheme: string): void {
		if (this.input instanceof DiffEditorInput && (this.input.original.resource?.scheme === scheme || this.input.modified.resource?.scheme === scheme)) {
			this.updateReadonly(this.input);
		}
	}

	private onDidChangeInputCapabilities(input: DiffEditorInput): void {
		if (this.input === input) {
			this.updateReadonly(input);
		}
	}

	private updateReadonly(input: DiffEditorInput): void {
		const control = this.getControl();
		if (control) {
			control.updateOptions({
				readOnly: input.modified.hasCapability(EditorInputCapabilities.Readonly),
				originalEditable: !input.original.hasCapability(EditorInputCapabilities.Readonly)
			});
		}
	}

	override getTitle(): string {
		if (this.input) {
			return this.input.getName();
		}

		return localize('textDiffEditor', "Text Diff Editor");
	}

	override createEditorControl(parent: HTMLElement, configuration: ICodeEditorOptions): IDiffEditor {
		return this.instantiationService.createInstance(DiffEditorWidget, parent, configuration, {});
	}

	override async setInput(input: DiffEditorInput, options: ITextEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {

		// Update our listener for input capabilities
		this.inputListener.value = input.onDidChangeCapabilities(() => this.onDidChangeInputCapabilities(input));

		// Dispose previous diff navigator
		this.diffNavigatorDisposables.clear();

		// Set input and resolve
		await super.setInput(input, options, context, token);

		try {
			const resolvedModel = await input.resolve();

			// Check for cancellation
			if (token.isCancellationRequested) {
				return undefined;
			}

			// Fallback to open as binary if not text
			if (!(resolvedModel instanceof TextDiffEditorModel)) {
				this.openAsBinary(input, options);
				return undefined;
			}

			// Set Editor Model
			const diffEditor = assertIsDefined(this.getControl());
			const resolvedDiffEditorModel = resolvedModel as TextDiffEditorModel;
			diffEditor.setModel(withUndefinedAsNull(resolvedDiffEditorModel.textDiffEditorModel));

			/// Apply options to editor if any
			let optionsGotApplied = false;
			if (options) {
				optionsGotApplied = applyTextEditorOptions(options, diffEditor, ScrollType.Immediate);
			}

			// Otherwise restore View State unless disabled via settings
			let hasPreviousViewState = false;
			if (!optionsGotApplied) {
				hasPreviousViewState = this.restoreTextDiffEditorViewState(input, context, diffEditor);
			}

			// Diff navigator
			this.diffNavigator = new DiffNavigator(diffEditor, {
				alwaysRevealFirst: !optionsGotApplied && !hasPreviousViewState // only reveal first change if we had no options or viewstate
			});
			this.diffNavigatorDisposables.add(this.diffNavigator);

			// Since the resolved model provides information about being readonly
			// or not, we apply it here to the editor even though the editor input
			// was already asked for being readonly or not. The rationale is that
			// a resolved model might have more specific information about being
			// readonly or not that the input did not have.
			diffEditor.updateOptions({
				readOnly: resolvedDiffEditorModel.modifiedModel?.isReadonly(),
				originalEditable: !resolvedDiffEditorModel.originalModel?.isReadonly()
			});
		} catch (error) {

			// In case we tried to open a file and the response indicates that this is not a text file, fallback to binary diff.
			if (this.isFileBinaryError(error)) {
				this.openAsBinary(input, options);
				return;
			}

			throw error;
		}
	}

	private restoreTextDiffEditorViewState(editor: DiffEditorInput, context: IEditorOpenContext, control: IDiffEditor): boolean {
		const viewState = this.loadEditorViewState(editor, context);
		if (viewState) {
			control.restoreViewState(viewState);

			return true;
		}

		return false;
	}

	private openAsBinary(input: DiffEditorInput, options: ITextEditorOptions | undefined): void {
		const original = input.original;
		const modified = input.modified;

		const binaryDiffInput = this.instantiationService.createInstance(DiffEditorInput, input.getName(), input.getDescription(), original, modified, true);

		// Forward binary flag to input if supported
		const fileEditorFactory = Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).getFileEditorFactory();
		if (fileEditorFactory.isFileEditor(original)) {
			original.setForceOpenAsBinary();
		}

		if (fileEditorFactory.isFileEditor(modified)) {
			modified.setForceOpenAsBinary();
		}

		// Replace this editor with the binary one
		(this.group ?? this.editorGroupService.activeGroup).replaceEditors([{
			editor: input,
			replacement: binaryDiffInput,
			options: {
				...options,
				// Make sure to not steal away the currently active group
				// because we are triggering another openEditor() call
				// and do not control the initial intent that resulted
				// in us now opening as binary.
				activation: EditorActivation.PRESERVE,
				pinned: this.group?.isPinned(input),
				sticky: this.group?.isSticky(input)
			}
		}]);
	}

	protected override computeConfiguration(configuration: IEditorConfiguration): ICodeEditorOptions {
		const editorConfiguration = super.computeConfiguration(configuration);

		// Handle diff editor specially by merging in diffEditor configuration
		if (isObject(configuration.diffEditor)) {
			const diffEditorConfiguration: IDiffEditorOptions = deepClone(configuration.diffEditor);

			// User settings defines `diffEditor.codeLens`, but here we rename that to `diffEditor.diffCodeLens` to avoid collisions with `editor.codeLens`.
			diffEditorConfiguration.diffCodeLens = diffEditorConfiguration.codeLens;
			delete diffEditorConfiguration.codeLens;

			// User settings defines `diffEditor.wordWrap`, but here we rename that to `diffEditor.diffWordWrap` to avoid collisions with `editor.wordWrap`.
			diffEditorConfiguration.diffWordWrap = <'off' | 'on' | 'inherit' | undefined>diffEditorConfiguration.wordWrap;
			delete diffEditorConfiguration.wordWrap;

			Object.assign(editorConfiguration, diffEditorConfiguration);
		}

		return editorConfiguration;
	}

	protected override getConfigurationOverrides(): ICodeEditorOptions {
		const options: IDiffEditorOptions = super.getConfigurationOverrides();

		options.readOnly = this.input instanceof DiffEditorInput && this.input.modified.hasCapability(EditorInputCapabilities.Readonly);
		options.originalEditable = this.input instanceof DiffEditorInput && !this.input.original.hasCapability(EditorInputCapabilities.Readonly);
		options.lineDecorationsWidth = '2ch';

		return options;
	}

	private isFileBinaryError(error: Error[]): boolean;
	private isFileBinaryError(error: Error): boolean;
	private isFileBinaryError(error: Error | Error[]): boolean {
		if (isArray(error)) {
			const errors = <Error[]>error;

			return errors.some(error => this.isFileBinaryError(error));
		}

		return (<TextFileOperationError>error).textFileOperationResult === TextFileOperationResult.FILE_IS_BINARY;
	}

	override clearInput(): void {
		super.clearInput();

		// Clear input listener
		this.inputListener.clear();

		// Dispose previous diff navigator
		this.diffNavigatorDisposables.clear();

		// Clear Model
		const diffEditor = this.getControl();
		diffEditor?.setModel(null);
	}

	getDiffNavigator(): DiffNavigator | undefined {
		return this.diffNavigator;
	}

	override getControl(): IDiffEditor | undefined {
		return super.getControl() as IDiffEditor | undefined;
	}

	protected override tracksEditorViewState(input: EditorInput): boolean {
		return input instanceof DiffEditorInput;
	}

	protected override computeEditorViewState(resource: URI): IDiffEditorViewState | undefined {
		const control = this.getControl();
		if (!isDiffEditor(control)) {
			return undefined;
		}

		const model = control.getModel();
		if (!model || !model.modified || !model.original) {
			return undefined; // view state always needs a model
		}

		const modelUri = this.toEditorViewStateResource(model);
		if (!modelUri) {
			return undefined; // model URI is needed to make sure we save the view state correctly
		}

		if (!isEqual(modelUri, resource)) {
			return undefined; // prevent saving view state for a model that is not the expected one
		}

		return withNullAsUndefined(control.saveViewState());
	}

	protected override toEditorViewStateResource(modelOrInput: IDiffEditorModel | EditorInput): URI | undefined {
		let original: URI | undefined;
		let modified: URI | undefined;

		if (modelOrInput instanceof DiffEditorInput) {
			original = modelOrInput.original.resource;
			modified = modelOrInput.modified.resource;
		} else if (!isEditorInput(modelOrInput)) {
			original = modelOrInput.original.uri;
			modified = modelOrInput.modified.uri;
		}

		if (!original || !modified) {
			return undefined;
		}

		// create a URI that is the Base64 concatenation of original + modified resource
		return URI.from({ scheme: 'diff', path: `${multibyteAwareBtoa(original.toString())}${multibyteAwareBtoa(modified.toString())}` });
	}
}
