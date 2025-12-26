/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { deepClone } from '../../../../base/common/objects.js';
import { isObject, assertReturnsDefined } from '../../../../base/common/types.js';
import { ICodeEditor, IDiffEditor } from '../../../../editor/browser/editorBrowser.js';
import { IDiffEditorOptions, IEditorOptions as ICodeEditorOptions } from '../../../../editor/common/config/editorOptions.js';
import { AbstractTextEditor, IEditorConfiguration } from './textEditor.js';
import { TEXT_DIFF_EDITOR_ID, IEditorFactoryRegistry, EditorExtensions, ITextDiffEditorPane, IEditorOpenContext, isEditorInput, isTextEditorViewState, createTooLargeFileError } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { applyTextEditorOptions } from '../../../common/editor/editorOptions.js';
import { DiffEditorInput } from '../../../common/editor/diffEditorInput.js';
import { TextDiffEditorModel } from '../../../common/editor/textDiffEditorModel.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITextResourceConfigurationChangeEvent, ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { TextFileOperationError, TextFileOperationResult } from '../../../services/textfile/common/textfiles.js';
import { ScrollType, IDiffEditorViewState, IDiffEditorModel, IDiffEditorViewModel } from '../../../../editor/common/editorCommon.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { EditorActivation, ITextEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { isEqual } from '../../../../base/common/resources.js';
import { Dimension } from '../../../../base/browser/dom.js';
import { multibyteAwareBtoa } from '../../../../base/common/strings.js';
import { ByteSize, FileOperationError, FileOperationResult, IFileService, TooLargeFileOperationError } from '../../../../platform/files/common/files.js';
import { IBoundarySashes } from '../../../../base/browser/ui/sash/sash.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { DiffEditorWidget } from '../../../../editor/browser/widget/diffEditor/diffEditorWidget.js';

/**
 * The text editor that leverages the diff text editor for the editing experience.
 */
export class TextDiffEditor extends AbstractTextEditor<IDiffEditorViewState> implements ITextDiffEditorPane {
	static readonly ID = TEXT_DIFF_EDITOR_ID;

	private diffEditorControl: IDiffEditor | undefined = undefined;

	private inputLifecycleStopWatch: StopWatch | undefined = undefined;

	override get scopedContextKeyService(): IContextKeyService | undefined {
		if (!this.diffEditorControl) {
			return undefined;
		}

		const originalEditor = this.diffEditorControl.getOriginalEditor();
		const modifiedEditor = this.diffEditorControl.getModifiedEditor();

		return (originalEditor.hasTextFocus() ? originalEditor : modifiedEditor).invokeWithinContext(accessor => accessor.get(IContextKeyService));
	}

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@ITextResourceConfigurationService configurationService: ITextResourceConfigurationService,
		@IEditorService editorService: IEditorService,
		@IThemeService themeService: IThemeService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IFileService fileService: IFileService,
		@IPreferencesService private readonly preferencesService: IPreferencesService
	) {
		super(TextDiffEditor.ID, group, telemetryService, instantiationService, storageService, configurationService, themeService, editorService, editorGroupService, fileService);
	}

	override getTitle(): string {
		if (this.input) {
			return this.input.getName();
		}

		return localize('textDiffEditor', "Text Diff Editor");
	}

	protected override createEditorControl(parent: HTMLElement, configuration: ICodeEditorOptions): void {
		this.diffEditorControl = this._register(this.instantiationService.createInstance(DiffEditorWidget, parent, configuration, {}));
	}

	protected updateEditorControlOptions(options: ICodeEditorOptions): void {
		this.diffEditorControl?.updateOptions(options);
	}

	protected getMainControl(): ICodeEditor | undefined {
		return this.diffEditorControl?.getModifiedEditor();
	}

	private _previousViewModel: IDiffEditorViewModel | null = null;

	override async setInput(input: DiffEditorInput, options: ITextEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		if (this._previousViewModel) {
			this._previousViewModel.dispose();
			this._previousViewModel = null;
		}

		// Cleanup previous things associated with the input
		this.inputLifecycleStopWatch = undefined;

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
			const control = assertReturnsDefined(this.diffEditorControl);
			const resolvedDiffEditorModel = resolvedModel;

			const vm = resolvedDiffEditorModel.textDiffEditorModel ? control.createViewModel(resolvedDiffEditorModel.textDiffEditorModel) : null;
			this._previousViewModel = vm;
			await vm?.waitForDiff();
			control.setModel(vm);

			// Restore view state (unless provided by options)
			let hasPreviousViewState = false;
			if (!isTextEditorViewState(options?.viewState)) {
				hasPreviousViewState = this.restoreTextDiffEditorViewState(input, options, context, control);
			}

			// Apply options to editor if any
			let optionsGotApplied = false;
			if (options) {
				optionsGotApplied = applyTextEditorOptions(options, control, ScrollType.Immediate);
			}

			if (!optionsGotApplied && !hasPreviousViewState) {
				control.revealFirstDiff();
			}

			// Since the resolved model provides information about being readonly
			// or not, we apply it here to the editor even though the editor input
			// was already asked for being readonly or not. The rationale is that
			// a resolved model might have more specific information about being
			// readonly or not that the input did not have.
			control.updateOptions({
				...this.getReadonlyConfiguration(resolvedDiffEditorModel.modifiedModel?.isReadonly()),
				originalEditable: !resolvedDiffEditorModel.originalModel?.isReadonly()
			});

			control.handleInitialized();

			// Start to measure input lifecycle
			this.inputLifecycleStopWatch = new StopWatch(false);
		} catch (error) {
			await this.handleSetInputError(error, input, options);
		}
	}

	private async handleSetInputError(error: Error, input: DiffEditorInput, options: ITextEditorOptions | undefined): Promise<void> {

		// Handle case where content appears to be binary
		if (this.isFileBinaryError(error)) {
			return this.openAsBinary(input, options);
		}

		// Handle case where a file is too large to open without confirmation
		if ((<FileOperationError>error).fileOperationResult === FileOperationResult.FILE_TOO_LARGE) {
			let message: string;
			if (error instanceof TooLargeFileOperationError) {
				message = localize('fileTooLargeForHeapErrorWithSize', "At least one file is not displayed in the text compare editor because it is very large ({0}).", ByteSize.formatSize(error.size));
			} else {
				message = localize('fileTooLargeForHeapErrorWithoutSize', "At least one file is not displayed in the text compare editor because it is very large.");
			}

			throw createTooLargeFileError(this.group, input, options, message, this.preferencesService);
		}

		// Otherwise make sure the error bubbles up
		throw error;
	}

	private restoreTextDiffEditorViewState(editor: DiffEditorInput, options: ITextEditorOptions | undefined, context: IEditorOpenContext, control: IDiffEditor): boolean {
		const editorViewState = this.loadEditorViewState(editor, context);
		if (editorViewState) {
			if (options?.selection && editorViewState.modified) {
				editorViewState.modified.cursorState = []; // prevent duplicate selections via options
			}

			control.restoreViewState(editorViewState);

			if (options?.revealIfVisible) {
				control.revealFirstDiff();
			}

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
		this.group.replaceEditors([{
			editor: input,
			replacement: binaryDiffInput,
			options: {
				...options,
				// Make sure to not steal away the currently active group
				// because we are triggering another openEditor() call
				// and do not control the initial intent that resulted
				// in us now opening as binary.
				activation: EditorActivation.PRESERVE,
				pinned: this.group.isPinned(input),
				sticky: this.group.isSticky(input)
			}
		}]);
	}

	override setOptions(options: ITextEditorOptions | undefined): void {
		super.setOptions(options);

		if (options) {
			applyTextEditorOptions(options, assertReturnsDefined(this.diffEditorControl), ScrollType.Smooth);
		}
	}

	protected override shouldHandleConfigurationChangeEvent(e: ITextResourceConfigurationChangeEvent, resource: URI): boolean {
		if (super.shouldHandleConfigurationChangeEvent(e, resource)) {
			return true;
		}

		return e.affectsConfiguration(resource, 'diffEditor') || e.affectsConfiguration(resource, 'accessibility.verbosity.diffEditor');
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

		const verbose = configuration.accessibility?.verbosity?.diffEditor ?? false;
		(editorConfiguration as IDiffEditorOptions).accessibilityVerbose = verbose;

		return editorConfiguration;
	}

	protected override getConfigurationOverrides(configuration: IEditorConfiguration): IDiffEditorOptions {
		return {
			...super.getConfigurationOverrides(configuration),
			...this.getReadonlyConfiguration(this.input?.isReadonly()),
			originalEditable: this.input instanceof DiffEditorInput && !this.input.original.isReadonly(),
			lineDecorationsWidth: '2ch'
		};
	}

	protected override updateReadonly(input: EditorInput): void {
		if (input instanceof DiffEditorInput) {
			this.diffEditorControl?.updateOptions({
				...this.getReadonlyConfiguration(input.isReadonly()),
				originalEditable: !input.original.isReadonly(),
			});
		} else {
			super.updateReadonly(input);
		}
	}

	private isFileBinaryError(error: Error[]): boolean;
	private isFileBinaryError(error: Error): boolean;
	private isFileBinaryError(error: Error | Error[]): boolean {
		if (Array.isArray(error)) {
			const errors = error;

			return errors.some(error => this.isFileBinaryError(error));
		}

		return (<TextFileOperationError>error).textFileOperationResult === TextFileOperationResult.FILE_IS_BINARY;
	}

	override clearInput(): void {
		if (this._previousViewModel) {
			this._previousViewModel.dispose();
			this._previousViewModel = null;
		}

		super.clearInput();

		// Log input lifecycle telemetry
		const inputLifecycleElapsed = this.inputLifecycleStopWatch?.elapsed();
		this.inputLifecycleStopWatch = undefined;
		if (typeof inputLifecycleElapsed === 'number') {
			this.logInputLifecycleTelemetry(inputLifecycleElapsed, this.getControl()?.getModel()?.modified?.getLanguageId());
		}

		// Clear Model
		this.diffEditorControl?.setModel(null);
	}

	private logInputLifecycleTelemetry(duration: number, languageId: string | undefined): void {
		let collapseUnchangedRegions = false;
		if (this.diffEditorControl instanceof DiffEditorWidget) {
			collapseUnchangedRegions = this.diffEditorControl.collapseUnchangedRegions;
		}
		this.telemetryService.publicLog2<{
			editorVisibleTimeMs: number;
			languageId: string;
			collapseUnchangedRegions: boolean;
		}, {
			owner: 'hediet';
			editorVisibleTimeMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Indicates the time the diff editor was visible to the user' };
			languageId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Indicates for which language the diff editor was shown' };
			collapseUnchangedRegions: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Indicates whether unchanged regions were collapsed' };
			comment: 'This event gives insight about how long the diff editor was visible to the user.';
		}>('diffEditor.editorVisibleTime', {
			editorVisibleTimeMs: duration,
			languageId: languageId ?? '',
			collapseUnchangedRegions,
		});
	}

	override getControl(): IDiffEditor | undefined {
		return this.diffEditorControl;
	}

	override focus(): void {
		super.focus();

		this.diffEditorControl?.focus();
	}

	override hasFocus(): boolean {
		return this.diffEditorControl?.hasTextFocus() || super.hasFocus();
	}

	protected override setEditorVisible(visible: boolean): void {
		super.setEditorVisible(visible);

		if (visible) {
			this.diffEditorControl?.onVisible();
		} else {
			this.diffEditorControl?.onHide();
		}
	}

	override layout(dimension: Dimension): void {
		this.diffEditorControl?.layout(dimension);
	}

	override setBoundarySashes(sashes: IBoundarySashes) {
		this.diffEditorControl?.setBoundarySashes(sashes);
	}

	protected override tracksEditorViewState(input: EditorInput): boolean {
		return input instanceof DiffEditorInput;
	}

	protected override computeEditorViewState(resource: URI): IDiffEditorViewState | undefined {
		if (!this.diffEditorControl) {
			return undefined;
		}

		const model = this.diffEditorControl.getModel();
		if (!model?.modified || !model.original) {
			return undefined; // view state always needs a model
		}

		const modelUri = this.toEditorViewStateResource(model);
		if (!modelUri) {
			return undefined; // model URI is needed to make sure we save the view state correctly
		}

		if (!isEqual(modelUri, resource)) {
			return undefined; // prevent saving view state for a model that is not the expected one
		}

		return this.diffEditorControl.saveViewState() ?? undefined;
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
