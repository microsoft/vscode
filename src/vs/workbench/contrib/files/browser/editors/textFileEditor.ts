/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { assertIsDefined } from 'vs/base/common/types';
import { IPathService } from 'vs/workbench/services/path/common/pathService';
import { IAction, toAction } from 'vs/base/common/actions';
import { VIEWLET_ID, TEXT_FILE_EDITOR_ID, BINARY_TEXT_FILE_MODE } from 'vs/workbench/contrib/files/common/files';
import { ITextFileService, TextFileOperationError, TextFileOperationResult } from 'vs/workbench/services/textfile/common/textfiles';
import { AbstractTextCodeEditor } from 'vs/workbench/browser/parts/editor/textCodeEditor';
import { IEditorOpenContext, isTextEditorViewState, DEFAULT_EDITOR_ASSOCIATION } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { applyTextEditorOptions } from 'vs/workbench/common/editor/editorOptions';
import { BinaryEditorModel } from 'vs/workbench/common/editor/binaryEditorModel';
import { FileEditorInput } from 'vs/workbench/contrib/files/browser/editors/fileEditorInput';
import { FileOperationError, FileOperationResult, FileChangesEvent, IFileService, FileOperationEvent, FileOperation } from 'vs/platform/files/common/files';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/textResourceConfiguration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ICodeEditorViewState, ScrollType } from 'vs/editor/common/editorCommon';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroup, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { CancellationToken } from 'vs/base/common/cancellation';
import { createErrorWithActions } from 'vs/base/common/errorMessage';
import { EditorActivation, ITextEditorOptions } from 'vs/platform/editor/common/editor';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { IExplorerService } from 'vs/workbench/contrib/files/browser/files';
import { IPaneCompositePartService } from 'vs/workbench/services/panecomposite/browser/panecomposite';
import { ViewContainerLocation } from 'vs/workbench/common/views';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

/**
 * An implementation of editor for file system resources.
 */
export class TextFileEditor extends AbstractTextCodeEditor<ICodeEditorViewState> {

	static readonly ID = TEXT_FILE_EDITOR_ID;

	constructor(
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
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super(TextFileEditor.ID, telemetryService, instantiationService, storageService, textResourceConfigurationService, themeService, editorService, editorGroupService, fileService);

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

	override async setInput(input: FileEditorInput, options: ITextEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {

		// Set input and resolve
		await super.setInput(input, options, context, token);
		try {
			const resolvedModel = await input.resolve();

			// Check for cancellation
			if (token.isCancellationRequested) {
				return;
			}

			// There is a special case where the text editor has to handle binary file editor input: if a binary file
			// has been resolved and cached before, it maybe an actual instance of BinaryEditorModel. In this case our text
			// editor has to open this model using the binary editor. We return early in this case.
			if (resolvedModel instanceof BinaryEditorModel) {
				return this.openAsBinary(input, options);
			}

			const textFileModel = resolvedModel;

			// Editor
			const control = assertIsDefined(this.editorControl);
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
			control.updateOptions({ readOnly: textFileModel.isReadonly() });
		} catch (error) {
			await this.handleSetInputError(error, input, options);
		}
	}

	protected async handleSetInputError(error: Error, input: FileEditorInput, options: ITextEditorOptions | undefined): Promise<void> {

		// In case we tried to open a file inside the text editor and the response
		// indicates that this is not a text file, reopen the file through the binary
		// editor.
		if ((<TextFileOperationError>error).textFileOperationResult === TextFileOperationResult.FILE_IS_BINARY) {
			return this.openAsBinary(input, options);
		}

		// Similar, handle case where we were asked to open a folder in the text editor.
		if ((<FileOperationError>error).fileOperationResult === FileOperationResult.FILE_IS_DIRECTORY) {
			let action: IAction;
			if (this.contextService.isInsideWorkspace(input.preferredResource)) {
				action = toAction({
					id: 'workbench.files.action.reveal', label: localize('reveal', "Reveal in Explorer View"), run: async () => {
						await this.paneCompositeService.openPaneComposite(VIEWLET_ID, ViewContainerLocation.Sidebar, true);

						return this.explorerService.select(input.preferredResource, true);
					}
				});
			} else {
				action = toAction({
					id: 'workbench.files.action.ok', label: localize('ok', "OK"), run: async () => {
						// No operation possible, but clicking OK will close the editor
					}
				});
			}

			throw createErrorWithActions(new FileOperationError(localize('fileIsDirectoryError', "File is a directory"), FileOperationResult.FILE_IS_DIRECTORY), [action]);
		}

		// Offer to create a file from the error if we have a file not found and the name is valid
		if ((<FileOperationError>error).fileOperationResult === FileOperationResult.FILE_NOT_FOUND && await this.pathService.hasValidBasename(input.preferredResource)) {
			const fileNotFoundError = createErrorWithActions(new FileOperationError(localize('fileNotFoundError', "File not found"), FileOperationResult.FILE_NOT_FOUND), [
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
			]);

			throw fileNotFoundError;
		}

		// Otherwise make sure the error bubbles up
		throw error;
	}

	private openAsBinary(input: FileEditorInput, options: ITextEditorOptions | undefined): void {
		const defaultBinaryEditor = this.configurationService.getValue<string | undefined>('workbench.editor.defaultBinaryEditor');
		const group = this.group ?? this.editorGroupService.activeGroup;

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
			this.doOpenAsBinaryInDifferentEditor(group, defaultBinaryEditor, input, editorOptions);
		} else {
			this.doOpenAsBinaryInSameEditor(group, defaultBinaryEditor, input, editorOptions);
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
	}

	protected override tracksEditorViewState(input: EditorInput): boolean {
		return input instanceof FileEditorInput;
	}

	protected override tracksDisposedEditorViewState(): boolean {
		return true; // track view state even for disposed editors
	}
}
