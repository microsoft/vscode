/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import * as types from 'vs/base/common/types';
import { isValidBasename } from 'vs/base/common/extpath';
import { basename } from 'vs/base/common/resources';
import { Action } from 'vs/base/common/actions';
import { VIEWLET_ID, TEXT_FILE_EDITOR_ID, IExplorerService } from 'vs/workbench/contrib/files/common/files';
import { ITextFileEditorModel, ITextFileService, TextFileOperationError, TextFileOperationResult } from 'vs/workbench/services/textfile/common/textfiles';
import { BaseTextEditor, IEditorConfiguration } from 'vs/workbench/browser/parts/editor/textEditor';
import { EditorOptions, TextEditorOptions, IEditorCloseEvent } from 'vs/workbench/common/editor';
import { BinaryEditorModel } from 'vs/workbench/common/editor/binaryEditorModel';
import { FileEditorInput } from 'vs/workbench/contrib/files/common/editors/fileEditorInput';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { FileOperationError, FileOperationResult, FileChangesEvent, IFileService, FALLBACK_MAX_MEMORY_SIZE_MB, MIN_MAX_MEMORY_SIZE_MB } from 'vs/platform/files/common/files';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/resourceConfiguration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IPreferencesService } from 'vs/workbench/services/preferences/common/preferences';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { IWindowsService, IWindowService } from 'vs/platform/windows/common/windows';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupsService, IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IEditorGroupView } from 'vs/workbench/browser/parts/editor/editor';
import { createErrorWithActions } from 'vs/base/common/errorsWithActions';
import { MutableDisposable } from 'vs/base/common/lifecycle';

/**
 * An implementation of editor for file system resources.
 */
export class TextFileEditor extends BaseTextEditor {

	static readonly ID = TEXT_FILE_EDITOR_ID;

	private restoreViewState: boolean | undefined;
	private readonly groupListener = this._register(new MutableDisposable());

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IFileService private readonly fileService: IFileService,
		@IViewletService private readonly viewletService: IViewletService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IStorageService storageService: IStorageService,
		@ITextResourceConfigurationService configurationService: ITextResourceConfigurationService,
		@IEditorService editorService: IEditorService,
		@IThemeService themeService: IThemeService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@ITextFileService textFileService: ITextFileService,
		@IWindowsService private readonly windowsService: IWindowsService,
		@IPreferencesService private readonly preferencesService: IPreferencesService,
		@IWindowService windowService: IWindowService,
		@IExplorerService private readonly explorerService: IExplorerService
	) {
		super(TextFileEditor.ID, telemetryService, instantiationService, storageService, configurationService, themeService, textFileService, editorService, editorGroupService, windowService);

		this.updateRestoreViewStateConfiguration();

		// Clear view state for deleted files
		this._register(this.fileService.onFileChanges(e => this.onFilesChanged(e)));
	}

	private onFilesChanged(e: FileChangesEvent): void {
		const deleted = e.getDeleted();
		if (deleted && deleted.length) {
			this.clearTextEditorViewState(deleted.map(d => d.resource));
		}
	}

	protected handleConfigurationChangeEvent(configuration?: IEditorConfiguration): void {
		super.handleConfigurationChangeEvent(configuration);

		this.updateRestoreViewStateConfiguration();
	}

	private updateRestoreViewStateConfiguration(): void {
		this.restoreViewState = this.configurationService.getValue(undefined, 'workbench.editor.restoreViewState');
	}

	getTitle(): string {
		return this.input ? this.input.getName() : nls.localize('textFileEditor', "Text File Editor");
	}

	get input(): FileEditorInput {
		return this._input as FileEditorInput;
	}

	setEditorVisible(visible: boolean, group: IEditorGroup): void {
		super.setEditorVisible(visible, group);

		// React to editors closing to preserve or clear view state. This needs to happen
		// in the onWillCloseEditor because at that time the editor has not yet
		// been disposed and we can safely persist the view state still as needed.
		this.groupListener.value = ((group as IEditorGroupView).onWillCloseEditor(e => this.onWillCloseEditorInGroup(e)));
	}

	private onWillCloseEditorInGroup(e: IEditorCloseEvent): void {
		const editor = e.editor;
		if (!(editor instanceof FileEditorInput)) {
			return; // only handle files
		}

		// If the editor is currently active we can always save or clear the view state.
		// If the editor is not active, we can only clear the view state because it needs
		// an active editor with the file opened, so we check for the restoreViewState flag
		// being set.
		if (editor === this.input || !this.restoreViewState) {
			this.doSaveOrClearTextEditorViewState(editor);
		}
	}

	setOptions(options: EditorOptions): void {
		const textOptions = <TextEditorOptions>options;
		if (textOptions && types.isFunction(textOptions.apply)) {
			textOptions.apply(this.getControl(), ScrollType.Smooth);
		}
	}

	async setInput(input: FileEditorInput, options: EditorOptions, token: CancellationToken): Promise<void> {

		// Update/clear view settings if input changes
		this.doSaveOrClearTextEditorViewState(this.input);

		// Set input and resolve
		await super.setInput(input, options, token);
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

			const textFileModel = <ITextFileEditorModel>resolvedModel;

			// Editor
			const textEditor = this.getControl();
			textEditor.setModel(textFileModel.textEditorModel);

			// Always restore View State if any associated
			const editorViewState = this.loadTextEditorViewState(this.input.getResource());
			if (editorViewState) {
				textEditor.restoreViewState(editorViewState);
			}

			// TextOptions (avoiding instanceof here for a reason, do not change!)
			if (options && types.isFunction((<TextEditorOptions>options).apply)) {
				(<TextEditorOptions>options).apply(textEditor, ScrollType.Immediate);
			}

			// Readonly flag
			textEditor.updateOptions({ readOnly: textFileModel.isReadonly() });
		} catch (error) {

			// In case we tried to open a file inside the text editor and the response
			// indicates that this is not a text file, reopen the file through the binary
			// editor.
			if ((<TextFileOperationError>error).textFileOperationResult === TextFileOperationResult.FILE_IS_BINARY) {
				return this.openAsBinary(input, options);
			}

			// Similar, handle case where we were asked to open a folder in the text editor.
			if ((<FileOperationError>error).fileOperationResult === FileOperationResult.FILE_IS_DIRECTORY) {
				this.openAsFolder(input);

				throw new Error(nls.localize('openFolderError', "File is a directory"));
			}

			// Offer to create a file from the error if we have a file not found and the name is valid
			if ((<FileOperationError>error).fileOperationResult === FileOperationResult.FILE_NOT_FOUND && isValidBasename(basename(input.getResource()))) {
				throw createErrorWithActions(toErrorMessage(error), {
					actions: [
						new Action('workbench.files.action.createMissingFile', nls.localize('createFile', "Create File"), undefined, true, async () => {
							await this.textFileService.create(input.getResource());

							return this.editorService.openEditor({
								resource: input.getResource(),
								options: {
									pinned: true // new file gets pinned by default
								}
							});
						})
					]
				});
			}

			if ((<FileOperationError>error).fileOperationResult === FileOperationResult.FILE_EXCEED_MEMORY_LIMIT) {
				const memoryLimit = Math.max(MIN_MAX_MEMORY_SIZE_MB, +this.configurationService.getValue<number>(undefined, 'files.maxMemoryForLargeFilesMB') || FALLBACK_MAX_MEMORY_SIZE_MB);

				throw createErrorWithActions(toErrorMessage(error), {
					actions: [
						new Action('workbench.window.action.relaunchWithIncreasedMemoryLimit', nls.localize('relaunchWithIncreasedMemoryLimit', "Restart with {0} MB", memoryLimit), undefined, true, () => {
							return this.windowsService.relaunch({
								addArgs: [
									`--max-memory=${memoryLimit}`
								]
							});
						}),
						new Action('workbench.window.action.configureMemoryLimit', nls.localize('configureMemoryLimit', 'Configure Memory Limit'), undefined, true, () => {
							return this.preferencesService.openGlobalSettings(undefined, { query: 'files.maxMemoryForLargeFilesMB' });
						})
					]
				});
			}

			// Otherwise make sure the error bubbles up
			throw error;
		}
	}

	private openAsBinary(input: FileEditorInput, options: EditorOptions): void {
		input.setForceOpenAsBinary();
		this.editorService.openEditor(input, options, this.group);
	}

	private async openAsFolder(input: FileEditorInput): Promise<void> {
		if (!this.group) {
			return;
		}

		// Since we cannot open a folder, we have to restore the previous input if any and close the editor
		await this.group.closeEditor(this.input);

		// Best we can do is to reveal the folder in the explorer
		if (this.contextService.isInsideWorkspace(input.getResource())) {
			await this.viewletService.openViewlet(VIEWLET_ID);

			this.explorerService.select(input.getResource(), true);
		}
	}

	protected getAriaLabel(): string {
		const input = this.input;
		const inputName = input && input.getName();

		let ariaLabel: string;
		if (inputName) {
			ariaLabel = nls.localize('fileEditorWithInputAriaLabel', "{0}. Text file editor.", inputName);
		} else {
			ariaLabel = nls.localize('fileEditorAriaLabel', "Text file editor.");
		}

		return ariaLabel;
	}

	clearInput(): void {

		// Update/clear editor view state in settings
		this.doSaveOrClearTextEditorViewState(this.input);

		// Clear Model
		this.getControl().setModel(null);

		// Pass to super
		super.clearInput();
	}

	protected saveState(): void {

		// Update/clear editor view State
		this.doSaveOrClearTextEditorViewState(this.input);

		super.saveState();
	}

	private doSaveOrClearTextEditorViewState(input: FileEditorInput): void {
		if (!input) {
			return; // ensure we have an input to handle view state for
		}

		// If the user configured to not restore view state, we clear the view
		// state unless the editor is still opened in the group.
		if (!this.restoreViewState && (!this.group || !this.group.isOpened(input))) {
			this.clearTextEditorViewState([input.getResource()], this.group);
		}

		// Otherwise we save the view state to restore it later
		else if (!input.isDisposed()) {
			this.saveTextEditorViewState(input.getResource());
		}
	}
}
