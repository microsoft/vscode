/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { assertIsDefined } from 'vs/base/common/types';
import { isValidBasename } from 'vs/base/common/extpath';
import { basename } from 'vs/base/common/resources';
import { toAction } from 'vs/base/common/actions';
import { VIEWLET_ID, TEXT_FILE_EDITOR_ID } from 'vs/workbench/contrib/files/common/files';
import { ITextFileService, TextFileOperationError, TextFileOperationResult } from 'vs/workbench/services/textfile/common/textfiles';
import { BaseTextEditor } from 'vs/workbench/browser/parts/editor/textEditor';
import { IEditorOpenContext, EditorInputCapabilities } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { applyTextEditorOptions } from 'vs/workbench/common/editor/editorOptions';
import { BinaryEditorModel } from 'vs/workbench/common/editor/binaryEditorModel';
import { FileEditorInput } from 'vs/workbench/contrib/files/browser/editors/fileEditorInput';
import { FileOperationError, FileOperationResult, FileChangesEvent, IFileService, FileOperationEvent, FileOperation } from 'vs/platform/files/common/files';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/textResourceConfigurationService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ICodeEditorViewState, ScrollType } from 'vs/editor/common/editorCommon';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IErrorWithActions } from 'vs/base/common/errors';
import { EditorActivation, ITextEditorOptions } from 'vs/platform/editor/common/editor';
import { IUriIdentityService } from 'vs/workbench/services/uriIdentity/common/uriIdentity';
import { IExplorerService } from 'vs/workbench/contrib/files/browser/files';
import { MutableDisposable } from 'vs/base/common/lifecycle';
import { IPaneCompositePartService } from 'vs/workbench/services/panecomposite/browser/panecomposite';
import { ViewContainerLocation } from 'vs/workbench/common/views';

/**
 * An implementation of editor for file system resources.
 */
export class TextFileEditor extends BaseTextEditor<ICodeEditorViewState> {

	static readonly ID = TEXT_FILE_EDITOR_ID;

	private readonly inputListener = this._register(new MutableDisposable());

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IFileService private readonly fileService: IFileService,
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
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService
	) {
		super(TextFileEditor.ID, telemetryService, instantiationService, storageService, textResourceConfigurationService, themeService, editorService, editorGroupService);

		// Clear view state for deleted files
		this._register(this.fileService.onDidFilesChange(e => this.onDidFilesChange(e)));

		// Move view state for moved files
		this._register(this.fileService.onDidRunOperation(e => this.onDidRunOperation(e)));

		// Listen to file system provider changes
		this._register(this.fileService.onDidChangeFileSystemProviderCapabilities(e => this.onDidChangeFileSystemProvider(e.scheme)));
		this._register(this.fileService.onDidChangeFileSystemProviderRegistrations(e => this.onDidChangeFileSystemProvider(e.scheme)));
	}

	private onDidFilesChange(e: FileChangesEvent): void {
		const deleted = e.rawDeleted;
		if (deleted) {
			for (const [resource] of deleted) {
				this.clearEditorViewState(resource);
			}
		}
	}

	private onDidRunOperation(e: FileOperationEvent): void {
		if (e.operation === FileOperation.MOVE && e.target) {
			this.moveEditorViewState(e.resource, e.target.resource, this.uriIdentityService.extUri);
		}
	}

	private onDidChangeFileSystemProvider(scheme: string): void {
		if (this.input?.resource.scheme === scheme) {
			this.updateReadonly(this.input);
		}
	}

	private onDidChangeInputCapabilities(input: FileEditorInput): void {
		if (this.input === input) {
			this.updateReadonly(input);
		}
	}

	private updateReadonly(input: FileEditorInput): void {
		const control = this.getControl();
		if (control) {
			control.updateOptions({ readOnly: input.hasCapability(EditorInputCapabilities.Readonly) });
		}
	}

	override getTitle(): string {
		return this.input ? this.input.getName() : localize('textFileEditor', "Text File Editor");
	}

	override get input(): FileEditorInput | undefined {
		return this._input as FileEditorInput;
	}

	override async setInput(input: FileEditorInput, options: ITextEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {

		// Update our listener for input capabilities
		this.inputListener.value = input.onDidChangeCapabilities(() => this.onDidChangeInputCapabilities(input));

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
			const textEditor = assertIsDefined(this.getControl());
			textEditor.setModel(textFileModel.textEditorModel);

			// View state
			const editorViewState = this.loadEditorViewState(input, context);
			if (editorViewState) {
				textEditor.restoreViewState(editorViewState);
			}

			// Apply options to editor if any
			if (options) {
				applyTextEditorOptions(options, textEditor, ScrollType.Immediate);
			}

			// Since the resolved model provides information about being readonly
			// or not, we apply it here to the editor even though the editor input
			// was already asked for being readonly or not. The rationale is that
			// a resolved model might have more specific information about being
			// readonly or not that the input did not have.
			textEditor.updateOptions({ readOnly: textFileModel.isReadonly() });
		} catch (error) {
			this.handleSetInputError(error, input, options);
		}
	}

	protected handleSetInputError(error: Error, input: FileEditorInput, options: ITextEditorOptions | undefined): void {

		// In case we tried to open a file inside the text editor and the response
		// indicates that this is not a text file, reopen the file through the binary
		// editor.
		if ((<TextFileOperationError>error).textFileOperationResult === TextFileOperationResult.FILE_IS_BINARY) {
			return this.openAsBinary(input, options);
		}

		// Similar, handle case where we were asked to open a folder in the text editor.
		if ((<FileOperationError>error).fileOperationResult === FileOperationResult.FILE_IS_DIRECTORY) {
			this.openAsFolder(input);

			throw new Error(localize('openFolderError', "File is a directory"));
		}

		// Offer to create a file from the error if we have a file not found and the name is valid
		if ((<FileOperationError>error).fileOperationResult === FileOperationResult.FILE_NOT_FOUND && isValidBasename(basename(input.preferredResource))) {
			const fileNotFoundError: FileOperationError & IErrorWithActions = new FileOperationError(toErrorMessage(error), FileOperationResult.FILE_NOT_FOUND);
			fileNotFoundError.actions = [
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
			];

			throw fileNotFoundError;
		}

		// Otherwise make sure the error bubbles up
		throw error;
	}

	private openAsBinary(input: FileEditorInput, options: ITextEditorOptions | undefined): void {

		// Mark file input for forced binary opening
		input.setForceOpenAsBinary();

		// Open in group
		(this.group ?? this.editorGroupService.activeGroup).openEditor(input, {
			...options,
			// Make sure to not steal away the currently active group
			// because we are triggering another openEditor() call
			// and do not control the initial intent that resulted
			// in us now opening as binary.
			activation: EditorActivation.PRESERVE
		});
	}

	private async openAsFolder(input: FileEditorInput): Promise<void> {
		if (!this.group) {
			return;
		}

		// Since we cannot open a folder, we have to restore the previous input if any and close the editor
		await this.group.closeEditor(this.input);

		// Best we can do is to reveal the folder in the explorer
		if (this.contextService.isInsideWorkspace(input.preferredResource)) {
			await this.paneCompositeService.openPaneComposite(VIEWLET_ID, ViewContainerLocation.Sidebar);

			this.explorerService.select(input.preferredResource, true);
		}
	}

	override clearInput(): void {
		super.clearInput();

		// Clear input listener
		this.inputListener.clear();

		// Clear Model
		const textEditor = this.getControl();
		if (textEditor) {
			textEditor.setModel(null);
		}
	}

	protected override tracksEditorViewState(input: EditorInput): boolean {
		return input instanceof FileEditorInput;
	}

	protected override tracksDisposedEditorViewState(): boolean {
		return true; // track view state even for disposed editors
	}
}
