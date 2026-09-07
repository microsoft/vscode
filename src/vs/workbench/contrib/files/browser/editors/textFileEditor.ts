/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { mark } from '../../../../../base/common/performance.js';
import { assertReturnsDefined } from '../../../../../base/common/types.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { Schemas } from '../../../../../base/common/network.js';
import { ReadableStream } from '../../../../../base/common/stream.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { IAction, toAction } from '../../../../../base/common/actions.js';
import { VIEWLET_ID, TEXT_FILE_EDITOR_ID, BINARY_TEXT_FILE_MODE, LargeFileEditorBaseLineNumberContext, LargeFileEditorModeContext } from '../../common/files.js';
import { ITextFileService, TextFileOperationError, TextFileOperationResult } from '../../../../services/textfile/common/textfiles.js';
import { AbstractTextCodeEditor } from '../../../../browser/parts/editor/textCodeEditor.js';
import { IEditorOpenContext, isTextEditorViewState, DEFAULT_EDITOR_ASSOCIATION, createEditorOpenError, IFileEditorInputOptions, createTooLargeFileError } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { applyTextEditorOptions } from '../../../../common/editor/editorOptions.js';
import { BinaryEditorModel } from '../../../../common/editor/binaryEditorModel.js';
import { FileEditorInput } from './fileEditorInput.js';
import { FileOperationError, FileOperationResult, FileChangesEvent, IFileService, FileOperationEvent, FileOperation, ByteSize, TooLargeFileOperationError } from '../../../../../platform/files/common/files.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITextResourceConfigurationService } from '../../../../../editor/common/services/textResourceConfiguration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { ICodeEditorViewState, ScrollType } from '../../../../../editor/common/editorCommon.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { EditorActivation, ITextEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IExplorerService } from '../files.js';
import { IPaneCompositePartService } from '../../../../services/panecomposite/browser/panecomposite.js';
import { ViewContainerLocation } from '../../../../common/views.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IPreferencesService } from '../../../../services/preferences/common/preferences.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { EditorOption, IEditorOptions as ICodeEditorOptions } from '../../../../../editor/common/config/editorOptions.js';
import { IFilesConfigurationService } from '../../../../services/filesConfiguration/common/filesConfigurationService.js';
import { DecodeStreamError, DecodeStreamErrorKind } from '../../../../services/textfile/common/encoding.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../../../editor/common/languages/modesRegistry.js';
import { IEditorConfiguration } from '../../../../browser/parts/editor/textEditor.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { LargeFileEditorModel, LargeFileStreamReader } from '../../common/largeFileEditorModel.js';
import { IContextKey } from '../../../../../platform/contextkey/common/contextkey.js';

/**
 * An implementation of editor for file system resources.
 */
export class TextFileEditor extends AbstractTextCodeEditor<ICodeEditorViewState> {

	static readonly ID = TEXT_FILE_EDITOR_ID;

	private static readonly LARGE_FILE_STREAMING_THRESHOLD = 256 * ByteSize.MB;
	private static readonly LARGE_FILE_PAGE_LENGTH = 8 * ByteSize.MB;
	private static readonly LARGE_FILE_MAX_MODEL_LENGTH = 64 * ByteSize.MB;

	private readonly largeFileEditorModel = this._register(new MutableDisposable<LargeFileEditorModel>());
	private readonly largeFileNotification = this._register(new MutableDisposable());
	private isLargeFileInput = false;
	private loadingLargeFile = false;
	private largeFileLoadErrorShown = false;
	private largeFileEditorModeContext: IContextKey<boolean> | undefined;
	private largeFileEditorBaseLineNumberContext: IContextKey<number> | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IFileService fileService: IFileService,
		@IPaneCompositePartService private readonly paneCompositeService: IPaneCompositePartService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IStorageService storageService: IStorageService,
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService,
		@IEditorService editorService: IEditorService,
		@IThemeService themeService: IThemeService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IExplorerService private readonly explorerService: IExplorerService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IPathService private readonly pathService: IPathService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IPreferencesService protected readonly preferencesService: IPreferencesService,
		@IHostService private readonly hostService: IHostService,
		@IFilesConfigurationService private readonly filesConfigurationService: IFilesConfigurationService,
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService,
		@INotificationService private readonly notificationService: INotificationService
	) {
		super(TextFileEditor.ID, group, telemetryService, instantiationService, storageService, textResourceConfigurationService, themeService, editorService, editorGroupService, fileService);

		// Clear view state for deleted files
		this._register(this.fileService.onDidFilesChange(e => this.onDidFilesChange(e)));

		// Move view state for moved files
		this._register(this.fileService.onDidRunOperation(e => this.onDidRunOperation(e)));
	}

	private onDidFilesChange(e: FileChangesEvent): void {
		for (const resource of e.rawDeleted) {
			this.clearEditorViewState(resource);
		}
	}

	private onDidRunOperation(e: FileOperationEvent): void {
		if (e.operation === FileOperation.MOVE && e.target) {
			this.moveEditorViewState(e.resource, e.target.resource, this.uriIdentityService.extUri);
		}
	}

	override getTitle(): string {
		if (this.input) {
			return this.input.getName();
		}

		return localize('textFileEditor', "Text File Editor");
	}

	override get input(): FileEditorInput | undefined {
		return this._input as FileEditorInput;
	}

	override async setInput(input: FileEditorInput, options: IFileEditorInputOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		mark('code/willSetInputToTextFileEditor');

		try {
			// Set input before asynchronous work so canceled operations cannot overwrite a newer input.
			await super.setInput(input, options, context, token);
			if (!this.isCurrentInput(input, token)) {
				return;
			}

			this.isLargeFileInput = await this.shouldOpenAsLargeFile(input, options);
			if (!this.isCurrentInput(input, token)) {
				return;
			}

			this.largeFileEditorModeContext?.set(this.isLargeFileInput);
			this.largeFileEditorBaseLineNumberContext?.set(1);

			if (this.isLargeFileInput) {
				this.updateEditorControlOptions(this.getConfigurationOverrides(
					this.textResourceConfigurationService.getValue<IEditorConfiguration>(input.resource)
				));
				await this.setLargeFileInput(input, options, token);
				mark('code/didSetInputToTextFileEditor');
				return;
			}

			const resolvedModel = await input.resolve(options);

			// Check for cancellation
			if (!this.isCurrentInput(input, token)) {
				return;
			}

			// There is a special case where the text editor has to handle binary
			// file editor input: if a binary file has been resolved and cached
			// before, it maybe an actual instance of BinaryEditorModel. In this
			// case our text editor has to open this model using the binary editor.
			// We return early in this case.

			if (resolvedModel instanceof BinaryEditorModel) {
				return this.openAsBinary(input, options);
			}

			const textFileModel = resolvedModel;

			// Editor
			const control = assertReturnsDefined(this.editorControl);
			control.setModel(textFileModel.textEditorModel);

			// Restore view state (unless provided by options)
			if (!isTextEditorViewState(options?.viewState)) {
				const editorViewState = this.loadEditorViewState(input, context);
				if (editorViewState) {
					if (options?.selection) {
						editorViewState.cursorState = []; // prevent duplicate selections via options
					}

					control.restoreViewState(editorViewState);
				}
			}

			// Apply options to editor if any
			if (options) {
				applyTextEditorOptions(options, control, ScrollType.Immediate);
			}

			// Since the resolved model provides information about being readonly
			// or not, we apply it here to the editor even though the editor input
			// was already asked for being readonly or not. The rationale is that
			// a resolved model might have more specific information about being
			// readonly or not that the input did not have.
			control.updateOptions(this.getReadonlyConfiguration(textFileModel.isReadonly()));

			if (control.handleInitialized) {
				control.handleInitialized();
			}
		} catch (error) {
			if (token.isCancellationRequested || (this.input && this.input !== input)) {
				return;
			}
			await this.handleSetInputError(error, input, options);
		}

		mark('code/didSetInputToTextFileEditor');
	}

	private isCurrentInput(input: FileEditorInput, token: CancellationToken): boolean {
		return !token.isCancellationRequested && this.input === input;
	}

	private async shouldOpenAsLargeFile(input: FileEditorInput, options: IFileEditorInputOptions | undefined): Promise<boolean> {
		if (
			input.resource.scheme !== Schemas.file ||
			options?.limits?.size === Number.MAX_VALUE ||
			this.modelService.getModel(input.resource)
		) {
			return false;
		}

		const stat = await this.fileService.stat(input.resource);
		return stat.isFile && stat.size > TextFileEditor.LARGE_FILE_STREAMING_THRESHOLD;
	}

	private async setLargeFileInput(input: FileEditorInput, options: IFileEditorInputOptions | undefined, token: CancellationToken): Promise<void> {
		const bufferStream = await this.fileService.readFileStream(input.resource, { limits: { size: Number.MAX_VALUE } }, token);
		if (!this.isCurrentInput(input, token)) {
			bufferStream.value.destroy();
			return;
		}

		let decodedStream: ReadableStream<string>;
		try {
			decodedStream = input.getEncoding()
				? await this.textFileService.getDecodedStream(input.resource, bufferStream.value, {
					acceptTextOnly: true,
					encoding: input.getEncoding()
				})
				: await this.textFileService.getDecodedStream(input.resource, bufferStream.value, {
					acceptTextOnly: true,
					autoGuessEncoding: false
				});
		} catch (error) {
			bufferStream.value.destroy();
			if (error instanceof DecodeStreamError && error.decodeStreamErrorKind === DecodeStreamErrorKind.STREAM_IS_BINARY) {
				throw new TextFileOperationError(localize('fileBinaryError', "File seems to be binary and cannot be opened as text"), TextFileOperationResult.FILE_IS_BINARY);
			}

			throw error;
		}
		if (!this.isCurrentInput(input, token)) {
			decodedStream.destroy();
			return;
		}

		const reader = new LargeFileStreamReader(decodedStream);
		try {
			const initialPage = await reader.readPage(TextFileEditor.LARGE_FILE_PAGE_LENGTH);
			if (!this.isCurrentInput(input, token)) {
				reader.dispose();
				return;
			}

			const textEditorModel = this.modelService.createModel(
				initialPage.value,
				this.languageService.createById(PLAINTEXT_LANGUAGE_ID),
				input.resource.with({ scheme: Schemas.inMemory, fragment: `vscode-large-file-preview-${this.group.id}` }),
				true
			);
			const largeFileEditorModel = new LargeFileEditorModel(
				textEditorModel,
				reader,
				initialPage.isLast,
				TextFileEditor.LARGE_FILE_PAGE_LENGTH,
				TextFileEditor.LARGE_FILE_MAX_MODEL_LENGTH
			);
			this.largeFileEditorModel.value = largeFileEditorModel;

			const control = assertReturnsDefined(this.editorControl);
			control.setModel(textEditorModel);

			if (options) {
				applyTextEditorOptions(options, control, ScrollType.Immediate);
			}

			if (control.handleInitialized) {
				control.handleInitialized();
			}

			this.showLargeFileNotification(input, options);
			this.loadMoreLargeFileIfNeeded();
		} catch (error) {
			reader.dispose();
			throw error;
		}
	}

	private showLargeFileNotification(input: FileEditorInput, options: IFileEditorInputOptions | undefined): void {
		const notification = this.notificationService.prompt(
			Severity.Info,
			localize('largeFileStreaming', "This large file is open in a memory-efficient, read-only mode. More content loads as you scroll."),
			[{
				label: localize('openLargeFileFully', "Open Fully"),
				run: async () => {
					const fileEditorOptions: IFileEditorInputOptions = {
						...options,
						forceReload: true,
						limits: { size: Number.MAX_VALUE }
					};

					await this.group.openEditor(input, fileEditorOptions);
				}
			}]
		);
		this.largeFileNotification.value = toDisposable(() => notification.close());
	}

	private getLargeFileReadOnlyMessage(): MarkdownString {
		return new MarkdownString(localize('largeFileReadOnly', "This large file is loaded incrementally and is read-only. Use the Open Fully action in the notification to edit it."));
	}

	private loadMoreLargeFileIfNeeded(): void {
		const largeFileEditorModel = this.largeFileEditorModel.value;
		const control = this.editorControl;
		if (!largeFileEditorModel || !control || this.loadingLargeFile || this.largeFileLoadErrorShown || largeFileEditorModel.isComplete) {
			return;
		}

		const layoutInfo = control.getLayoutInfo();
		const isSingleLine = largeFileEditorModel.textEditorModel.getLineCount() === 1;
		const isNearEnd = isSingleLine
			? control.getScrollLeft() + layoutInfo.contentWidth * 2 >= control.getScrollWidth()
			: control.getScrollTop() + layoutInfo.height * 2 >= control.getScrollHeight();
		if (!isNearEnd) {
			return;
		}

		this.loadingLargeFile = true;
		const scrollTop = control.getScrollTop();
		largeFileEditorModel.loadMore().then(result => {
			if (this.largeFileEditorModel.value !== largeFileEditorModel) {
				return;
			}

			if (result.removedLineCount > 0) {
				const lineHeight = control.getOption(EditorOption.lineHeight);
				control.setScrollTop(Math.max(0, scrollTop - result.removedLineCount * lineHeight), ScrollType.Immediate);
				control.updateOptions({ lineNumbers: lineNumber => String(largeFileEditorModel.baseLineNumber + lineNumber - 1) });
				this.largeFileEditorBaseLineNumberContext?.set(largeFileEditorModel.baseLineNumber);
			}

			if (result.stoppedAtLongLine && !this.largeFileLoadErrorShown) {
				this.largeFileLoadErrorShown = true;
				this.notificationService.warn(localize('largeFileLongLine', "More content cannot be loaded because a single line exceeds the large file preview limit."));
			}
		}, error => {
			if (!isCancellationError(error) && this.largeFileEditorModel.value === largeFileEditorModel) {
				this.largeFileLoadErrorShown = true;
				this.notificationService.error(error);
			}
		}).finally(() => {
			if (this.largeFileEditorModel.value === largeFileEditorModel) {
				this.loadingLargeFile = false;
			}
		});
	}

	protected async handleSetInputError(error: Error, input: FileEditorInput, options: ITextEditorOptions | undefined): Promise<void> {

		// Handle case where content appears to be binary
		if ((<TextFileOperationError>error).textFileOperationResult === TextFileOperationResult.FILE_IS_BINARY) {
			return this.openAsBinary(input, options);
		}

		// Handle case where we were asked to open a folder
		if ((<FileOperationError>error).fileOperationResult === FileOperationResult.FILE_IS_DIRECTORY) {
			const actions: IAction[] = [];

			actions.push(toAction({
				id: 'workbench.files.action.openFolder', label: localize('openFolder', "Open Folder"), run: async () => {
					return this.hostService.openWindow([{ folderUri: input.resource }], { forceNewWindow: true });
				}
			}));

			if (this.contextService.isInsideWorkspace(input.preferredResource)) {
				actions.push(toAction({
					id: 'workbench.files.action.reveal', label: localize('reveal', "Reveal Folder"), run: async () => {
						await this.paneCompositeService.openPaneComposite(VIEWLET_ID, ViewContainerLocation.Sidebar, true);

						return this.explorerService.select(input.preferredResource, true);
					}
				}));
			}

			throw createEditorOpenError(localize('fileIsDirectory', "The file is not displayed in the text editor because it is a directory."), actions, { forceMessage: true });
		}

		// Handle case where a file is too large to open without confirmation
		if ((<FileOperationError>error).fileOperationResult === FileOperationResult.FILE_TOO_LARGE) {
			let message: string;
			if (error instanceof TooLargeFileOperationError) {
				message = localize('fileTooLargeForHeapErrorWithSize', "The file is not displayed in the text editor because it is very large ({0}).", ByteSize.formatSize(error.size));
			} else {
				message = localize('fileTooLargeForHeapErrorWithoutSize', "The file is not displayed in the text editor because it is very large.");
			}

			throw createTooLargeFileError(this.group, input, options, message, this.preferencesService);
		}

		// Offer to create a file from the error if we have a file not found and the name is valid and not readonly
		if (
			(<FileOperationError>error).fileOperationResult === FileOperationResult.FILE_NOT_FOUND &&
			!this.filesConfigurationService.isReadonly(input.preferredResource) &&
			await this.pathService.hasValidBasename(input.preferredResource)
		) {
			const fileNotFoundError = createEditorOpenError(new FileOperationError(localize('unavailableResourceErrorEditorText', "The editor could not be opened because the file was not found."), FileOperationResult.FILE_NOT_FOUND), [
				toAction({
					id: 'workbench.files.action.createMissingFile', label: localize('createFile', "Create File"), run: async () => {
						await this.textFileService.create([{ resource: input.preferredResource }]);

						return this.editorService.openEditor({
							resource: input.preferredResource,
							options: {
								pinned: true // new file gets pinned by default
							}
						});
					}
				})
			], {

				// Support the flow of directly pressing `Enter` on the dialog to
				// create the file on the go. This is nice when for example following
				// a link to a file that does not exist to scaffold it quickly.

				allowDialog: true
			});

			throw fileNotFoundError;
		}

		// Otherwise make sure the error bubbles up
		throw error;
	}

	private openAsBinary(input: FileEditorInput, options: ITextEditorOptions | undefined): void {
		const defaultBinaryEditor = this.configurationService.getValue<string | undefined>('workbench.editor.defaultBinaryEditor');

		const editorOptions = {
			...options,
			// Make sure to not steal away the currently active group
			// because we are triggering another openEditor() call
			// and do not control the initial intent that resulted
			// in us now opening as binary.
			activation: EditorActivation.PRESERVE
		};

		// Check configuration and determine whether we open the binary
		// file input in a different editor or going through the same
		// editor.
		// Going through the same editor is debt, and a better solution
		// would be to introduce a real editor for the binary case
		// and avoid enforcing binary or text on the file editor input.

		if (defaultBinaryEditor && defaultBinaryEditor !== '' && defaultBinaryEditor !== DEFAULT_EDITOR_ASSOCIATION.id) {
			this.doOpenAsBinaryInDifferentEditor(this.group, defaultBinaryEditor, input, editorOptions);
		} else {
			this.doOpenAsBinaryInSameEditor(this.group, defaultBinaryEditor, input, editorOptions);
		}
	}

	private doOpenAsBinaryInDifferentEditor(group: IEditorGroup, editorId: string | undefined, editor: FileEditorInput, editorOptions: ITextEditorOptions): void {
		this.editorService.replaceEditors([{
			editor,
			replacement: { resource: editor.resource, options: { ...editorOptions, override: editorId } }
		}], group);
	}

	private doOpenAsBinaryInSameEditor(group: IEditorGroup, editorId: string | undefined, editor: FileEditorInput, editorOptions: ITextEditorOptions): void {

		// Open binary as text
		if (editorId === DEFAULT_EDITOR_ASSOCIATION.id) {
			editor.setForceOpenAsText();
			editor.setPreferredLanguageId(BINARY_TEXT_FILE_MODE); // https://github.com/microsoft/vscode/issues/131076

			editorOptions = { ...editorOptions, forceReload: true }; // Same pane and same input, must force reload to clear cached state
		}

		// Open as binary
		else {
			editor.setForceOpenAsBinary();
		}

		group.openEditor(editor, editorOptions);
	}

	override clearInput(): void {
		super.clearInput();

		// Clear Model
		this.editorControl?.setModel(null);
		this.largeFileEditorModel.clear();
		this.largeFileNotification.clear();
		this.isLargeFileInput = false;
		this.loadingLargeFile = false;
		this.largeFileLoadErrorShown = false;
		this.largeFileEditorModeContext?.reset();
		this.largeFileEditorBaseLineNumberContext?.reset();
	}

	protected override createEditorControl(parent: HTMLElement, initialOptions: ICodeEditorOptions): void {
		mark('code/willCreateTextFileEditorControl');

		super.createEditorControl(parent, initialOptions);
		this._register(assertReturnsDefined(this.editorControl).onDidScrollChange(() => this.loadMoreLargeFileIfNeeded()));
		const scopedContextKeyService = assertReturnsDefined(this.scopedContextKeyService);
		this.largeFileEditorModeContext = LargeFileEditorModeContext.bindTo(scopedContextKeyService);
		this.largeFileEditorBaseLineNumberContext = LargeFileEditorBaseLineNumberContext.bindTo(scopedContextKeyService);

		mark('code/didCreateTextFileEditorControl');
	}

	protected override getConfigurationOverrides(configuration: IEditorConfiguration): ICodeEditorOptions {
		const overrides = super.getConfigurationOverrides(configuration);
		if (!this.isLargeFileInput) {
			return overrides;
		}

		return {
			...overrides,
			readOnly: true,
			readOnlyMessage: this.getLargeFileReadOnlyMessage(),
			wordWrap: 'off',
			folding: false,
			codeLens: false,
			links: false,
			selectionHighlight: false,
			occurrencesHighlight: 'off',
			stickyScroll: { enabled: false },
			minimap: { enabled: false },
			renderValidationDecorations: 'off',
			lineNumbers: lineNumber => String((this.largeFileEditorModel.value?.baseLineNumber ?? 1) + lineNumber - 1)
		};
	}

	protected override updateReadonly(input: EditorInput): void {
		if (this.isLargeFileInput) {
			this.updateEditorControlOptions({
				readOnly: true,
				readOnlyMessage: this.getLargeFileReadOnlyMessage()
			});
			return;
		}

		super.updateReadonly(input);
	}

	protected override tracksEditorViewState(input: EditorInput): boolean {
		return !this.isLargeFileInput && input instanceof FileEditorInput;
	}

	protected override tracksDisposedEditorViewState(): boolean {
		return true; // track view state even for disposed editors
	}
}
