/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { deepClone } from 'vs/base/common/objects';
import { isObject, isArray, assertIsDefined, withUndefinedAsNull, withNullAsUndefined } from 'vs/base/common/types';
import { IMergeEditor, isMergeEditor } from 'vs/editor/browser/mergeEditorBrowser';
import { IMergeEditorOptions, IEditorOptions as ICodeEditorOptions } from 'vs/editor/common/config/editorOptions';
import { BaseTextEditor, IEditorConfiguration } from './textEditor';
import { TEXT_MERGE_EDITOR_ID, IEditorFactoryRegistry, EditorExtensions, ITextMergeEditorPane, IEditorOpenContext, EditorInputCapabilities, isEditorInput } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { applyTextEditorOptions } from 'vs/workbench/common/editor/editorOptions';
import { MergeEditorInput } from 'vs/workbench/common/editor/mergeEditorInput';
import { MergeNavigator } from 'vs/editor/browser/widget/mergeNavigator';
import { MergeEditorWidget } from 'vs/editor/browser/widget/mergeEditorWidget';
import { TextMergeEditorModel } from 'vs/workbench/common/editor/textMergeEditorModel';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/textResourceConfiguration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { TextFileOperationError, TextFileOperationResult } from 'vs/workbench/services/textfile/common/textfiles';
import { ScrollType, IMergeEditorViewState, IMergeEditorModel } from 'vs/editor/common/editorCommon';
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
 * The text editor that leverages the merge text editor for the editing experience.
 */
export class TextMergeEditor extends BaseTextEditor<IMergeEditorViewState> implements ITextMergeEditorPane {

	static readonly ID = TEXT_MERGE_EDITOR_ID;

	private mergeNavigator: MergeNavigator | undefined;
	private readonly mergeNavigatorDisposables = this._register(new DisposableStore());

	private readonly inputListener = this._register(new MutableDisposable());

	override get scopedContextKeyService(): IContextKeyService | undefined {
		const control = this.getControl();
		if (!control) {
			return undefined;
		}

		const currentEditor = control.getCurrentEditor();
		const outputEditor = control.getOutputEditor();
		const incomingEditor = control.getIncomingEditor();

		return (currentEditor.hasTextFocus() ? currentEditor : outputEditor.hasTextFocus() ? outputEditor : incomingEditor).invokeWithinContext(accessor => accessor.get(IContextKeyService));
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
		super(TextMergeEditor.ID, telemetryService, instantiationService, storageService, configurationService, themeService, editorService, editorGroupService);

		// Listen to file system provider changes
		this._register(this.fileService.onDidChangeFileSystemProviderCapabilities(e => this.onDidChangeFileSystemProvider(e.scheme)));
		this._register(this.fileService.onDidChangeFileSystemProviderRegistrations(e => this.onDidChangeFileSystemProvider(e.scheme)));
	}

	private onDidChangeFileSystemProvider(scheme: string): void {
		if (this.input instanceof MergeEditorInput && (this.input.current.resource?.scheme === scheme || this.input.output.resource?.scheme === scheme || this.input.incoming.resource?.scheme === scheme)) {
			this.updateReadonly(this.input);
		}
	}

	private onDidChangeInputCapabilities(input: MergeEditorInput): void {
		if (this.input === input) {
			this.updateReadonly(input);
		}
	}

	private updateReadonly(input: MergeEditorInput): void {
		const control = this.getControl();
		if (control) {
			control.updateOptions({
				readOnly: input.output.hasCapability(EditorInputCapabilities.Readonly)
			});
		}
	}

	override getTitle(): string {
		if (this.input) {
			return this.input.getName();
		}

		return localize('textMergeEditor', "Text Merge Editor");
	}

	override createEditorControl(parent: HTMLElement, configuration: ICodeEditorOptions): IMergeEditor {
		return this.instantiationService.createInstance(MergeEditorWidget, parent, configuration, {});
	}

	override async setInput(input: MergeEditorInput, options: ITextEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {

		// Update our listener for input capabilities
		this.inputListener.value = input.onDidChangeCapabilities(() => this.onDidChangeInputCapabilities(input));

		// Dispose previous merge navigator
		this.mergeNavigatorDisposables.clear();

		// Set input and resolve
		await super.setInput(input, options, context, token);

		try {
			const resolvedModel = await input.resolve();

			// Check for cancellation
			if (token.isCancellationRequested) {
				return undefined;
			}

			// Fallback to open as binary if not text
			if (!(resolvedModel instanceof TextMergeEditorModel)) {
				this.openAsBinary(input, options);
				return undefined;
			}

			// Set Editor Model
			const mergeEditor = assertIsDefined(this.getControl());
			const resolvedMergeEditorModel = resolvedModel as TextMergeEditorModel;
			mergeEditor.setModel(withUndefinedAsNull(resolvedMergeEditorModel.textMergeEditorModel));

			/// Apply options to editor if any
			let optionsGotApplied = false;
			if (options) {
				optionsGotApplied = applyTextEditorOptions(options, mergeEditor, ScrollType.Immediate);
			}

			// Otherwise restore View State unless disabled via settings
			let hasPreviousViewState = false;
			if (!optionsGotApplied) {
				hasPreviousViewState = this.restoreTextMergeEditorViewState(input, context, mergeEditor);
			}

			// Merge navigator
			this.mergeNavigator = new MergeNavigator(mergeEditor, {
				alwaysRevealFirst: !optionsGotApplied && !hasPreviousViewState // only reveal first change if we had no options or viewstate
			});
			this.mergeNavigatorDisposables.add(this.mergeNavigator);

			// Since the resolved model provides information about being readonly
			// or not, we apply it here to the editor even though the editor input
			// was already asked for being readonly or not. The rationale is that
			// a resolved model might have more specific information about being
			// readonly or not that the input did not have.
			mergeEditor.updateOptions({
				readOnly: resolvedMergeEditorModel.outputModel?.isReadonly(),
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

	private restoreTextMergeEditorViewState(editor: MergeEditorInput, context: IEditorOpenContext, control: IMergeEditor): boolean {
		const viewState = this.loadEditorViewState(editor, context);
		if (viewState) {
			control.restoreViewState(viewState);

			return true;
		}

		return false;
	}

	private openAsBinary(input: MergeEditorInput, options: ITextEditorOptions | undefined): void {
		const commonAncestor = input.commonAncestor;
		const current = input.current;
		const output = input.output;
		const incoming = input.incoming;

		const binaryMergeInput = this.instantiationService.createInstance(MergeEditorInput, input.getName(), input.getDescription(), commonAncestor, current, output, incoming, true);

		// Forward binary flag to input if supported
		const fileEditorFactory = Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).getFileEditorFactory();
		if (fileEditorFactory.isFileEditor(current)) {
			current.setForceOpenAsBinary();
		}

		if (fileEditorFactory.isFileEditor(output)) {
			output.setForceOpenAsBinary();
		}

		if (fileEditorFactory.isFileEditor(incoming)) {
			incoming.setForceOpenAsBinary();
		}

		// Replace this editor with the binary one
		(this.group ?? this.editorGroupService.activeGroup).replaceEditors([{
			editor: input,
			replacement: binaryMergeInput,
			options: {
				...options,
				// Make sure to not steal away the currently active group
				// because we are triggering an incoming openEditor() call
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

		// Handle merge editor specially by merging in mergeEditor configuration
		if (isObject(configuration.mergeEditor)) {
			const mergeEditorConfiguration: IMergeEditorOptions = deepClone(configuration.mergeEditor);

			// User settings defines `mergeEditor.wordWrap`, but here we rename that to `mergeEditor.mergeWordWrap` to avoid collisions with `editor.wordWrap`.
			mergeEditorConfiguration.mergeWordWrap = <'off' | 'on' | 'inherit' | undefined>mergeEditorConfiguration.wordWrap;
			delete mergeEditorConfiguration.wordWrap;

			Object.assign(editorConfiguration, mergeEditorConfiguration);
		}

		return editorConfiguration;
	}

	protected override getConfigurationOverrides(): ICodeEditorOptions {
		const options: IMergeEditorOptions = super.getConfigurationOverrides();

		options.readOnly = this.input instanceof MergeEditorInput && this.input.output.hasCapability(EditorInputCapabilities.Readonly);
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

		// Dispose previous merge navigator
		this.mergeNavigatorDisposables.clear();

		// Clear Model
		const mergeEditor = this.getControl();
		mergeEditor?.setModel(null);
	}

	getMergeNavigator(): MergeNavigator | undefined {
		return this.mergeNavigator;
	}

	override getControl(): IMergeEditor | undefined {
		return super.getControl() as IMergeEditor | undefined;
	}

	protected override tracksEditorViewState(input: EditorInput): boolean {
		return input instanceof MergeEditorInput;
	}

	protected override computeEditorViewState(resource: URI): IMergeEditorViewState | undefined {
		const control = this.getControl();
		if (!isMergeEditor(control)) {
			return undefined;
		}

		const model = control.getModel();
		if (!model || !model.current || !model.output || !model.incoming) {
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

	protected override toEditorViewStateResource(modelOrInput: IMergeEditorModel | EditorInput): URI | undefined {
		let current: URI | undefined;
		let output: URI | undefined;
		let incoming: URI | undefined;

		if (modelOrInput instanceof MergeEditorInput) {
			current = modelOrInput.current.resource;
			output = modelOrInput.output.resource;
			incoming = modelOrInput.incoming.resource;
		} else if (!isEditorInput(modelOrInput)) {
			current = modelOrInput.current.uri;
			output = modelOrInput.output.uri;
			incoming = modelOrInput.incoming.uri;
		}

		if (!current || !output || !incoming) {
			return undefined;
		}

		// create a URI that is the Base64 concatenation of current + output + incoming resource
		return URI.from({ scheme: 'merge', path: `${multibyteAwareBtoa(current.toString())}${multibyteAwareBtoa(output.toString())}${multibyteAwareBtoa(incoming.toString())}` });
	}
}
