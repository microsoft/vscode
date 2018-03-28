/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import * as nls from 'vs/nls';
import * as errors from 'vs/base/common/errors';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import * as types from 'vs/base/common/types';
import * as paths from 'vs/base/common/paths';
import { Action } from 'vs/base/common/actions';
import { VIEWLET_ID, TEXT_FILE_EDITOR_ID, IExplorerViewlet } from 'vs/workbench/parts/files/common/files';
import { ITextFileEditorModel, ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { BaseTextEditor } from 'vs/workbench/browser/parts/editor/textEditor';
import { EditorOptions, TextEditorOptions, IEditorCloseEvent } from 'vs/workbench/common/editor';
import { BinaryEditorModel } from 'vs/workbench/common/editor/binaryEditorModel';
import { FileEditorInput } from 'vs/workbench/parts/files/common/editors/fileEditorInput';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { FileOperationError, FileOperationResult, FileChangesEvent, IFileService } from 'vs/platform/files/common/files';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/resourceConfiguration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IPreferencesService } from 'vs/workbench/parts/preferences/common/preferences';
import { PreferencesEditor } from 'vs/workbench/parts/preferences/browser/preferencesEditor';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { IWindowsService } from 'vs/platform/windows/common/windows';

/**
 * An implementation of editor for file system resources.
 */
export class TextFileEditor extends BaseTextEditor {

	public static readonly ID = TEXT_FILE_EDITOR_ID;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IFileService private fileService: IFileService,
		@IViewletService private viewletService: IViewletService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IStorageService storageService: IStorageService,
		@ITextResourceConfigurationService configurationService: ITextResourceConfigurationService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IThemeService themeService: IThemeService,
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@ITextFileService textFileService: ITextFileService,
		@IWindowsService private windowsService: IWindowsService,
		@IPreferencesService private preferencesService: IPreferencesService
	) {
		super(TextFileEditor.ID, telemetryService, instantiationService, storageService, configurationService, themeService, textFileService, editorGroupService);

		// Clear view state for deleted files
		this.toUnbind.push(this.fileService.onFileChanges(e => this.onFilesChanged(e)));

		// React to editors closing to preserve view state
		this.toUnbind.push(editorGroupService.getStacksModel().onWillCloseEditor(e => this.onWillCloseEditor(e)));
	}

	private onFilesChanged(e: FileChangesEvent): void {
		const deleted = e.getDeleted();
		if (deleted && deleted.length) {
			this.clearTextEditorViewState(deleted.map(d => d.resource));
		}
	}

	private onWillCloseEditor(e: IEditorCloseEvent): void {
		if (e.editor === this.input && this.position === this.editorGroupService.getStacksModel().positionOfGroup(e.group)) {
			this.doSaveTextEditorViewState(this.input);
		}
	}

	public getTitle(): string {
		return this.input ? this.input.getName() : nls.localize('textFileEditor', "Text File Editor");
	}

	public get input(): FileEditorInput {
		return this._input as FileEditorInput;
	}

	public setInput(input: FileEditorInput, options?: EditorOptions): TPromise<void> {

		// Return early for same input unless we force to open
		const forceOpen = options && options.forceOpen;
		if (!forceOpen && input.matches(this.input)) {

			// Still apply options if any (avoiding instanceof here for a reason, do not change!)
			if (options && types.isFunction((<TextEditorOptions>options).apply)) {
				(<TextEditorOptions>options).apply(this.getControl(), ScrollType.Smooth);
			}

			return TPromise.wrap<void>(null);
		}

		// Remember view settings if input changes
		this.doSaveTextEditorViewState(this.input);

		// Set input and resolve
		return super.setInput(input, options).then(() => {
			return input.resolve(true).then(resolvedModel => {

				// There is a special case where the text editor has to handle binary file editor input: if a binary file
				// has been resolved and cached before, it maybe an actual instance of BinaryEditorModel. In this case our text
				// editor has to open this model using the binary editor. We return early in this case.
				if (resolvedModel instanceof BinaryEditorModel) {
					return this.openAsBinary(input, options);
				}

				// Check Model state
				const textFileModel = <ITextFileEditorModel>resolvedModel;

				const hasInput = !!this.input;
				const modelDisposed = textFileModel.isDisposed();
				const inputChanged = hasInput && this.input.getResource().toString() !== textFileModel.getResource().toString();
				if (
					!hasInput ||		// editor got hidden meanwhile
					modelDisposed || 	// input got disposed meanwhile
					inputChanged 		// a different input was set meanwhile
				) {
					return null;
				}

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
			}, error => {

				// In case we tried to open a file inside the text editor and the response
				// indicates that this is not a text file, reopen the file through the binary
				// editor.
				if ((<FileOperationError>error).fileOperationResult === FileOperationResult.FILE_IS_BINARY) {
					return this.openAsBinary(input, options);
				}

				// Similar, handle case where we were asked to open a folder in the text editor.
				if ((<FileOperationError>error).fileOperationResult === FileOperationResult.FILE_IS_DIRECTORY && this.openAsFolder(input)) {
					return;
				}

				// Offer to create a file from the error if we have a file not found and the name is valid
				if ((<FileOperationError>error).fileOperationResult === FileOperationResult.FILE_NOT_FOUND && paths.isValidBasename(paths.basename(input.getResource().fsPath))) {
					return TPromise.wrapError<void>(errors.create(toErrorMessage(error), {
						actions: [
							new Action('workbench.files.action.createMissingFile', nls.localize('createFile', "Create File"), null, true, () => {
								return this.fileService.updateContent(input.getResource(), '').then(() => this.editorService.openEditor({
									resource: input.getResource(),
									options: {
										pinned: true // new file gets pinned by default
									}
								}));
							})
						]
					}));
				}

				if ((<FileOperationError>error).fileOperationResult === FileOperationResult.FILE_EXCEED_MEMORY_LIMIT) {
					let memoryLimit = Math.max(2048, +this.configurationService.getValue<number>(null, 'files.maxMemoryForLargeFilesMB') || 4096);

					return TPromise.wrapError<void>(errors.create(toErrorMessage(error), {
						actions: [
							new Action('workbench.window.action.relaunchWithIncreasedMemoryLimit', nls.localize('relaunchWithIncreasedMemoryLimit', "Restart with {0} MB", memoryLimit), null, true, () => {
								return this.windowsService.relaunch({
									addArgs: [
										`--max-memory=${memoryLimit}`
									]
								});
							}),
							new Action('workbench.window.action.configureMemoryLimit', nls.localize('configureMemoryLimit', 'Configure Memory Limit'), null, true, () => {
								return this.preferencesService.openGlobalSettings().then(editor => {
									if (editor instanceof PreferencesEditor) {
										editor.focusSearch('files.maxMemoryForLargeFilesMB');
									}
								});
							})
						]
					}));
				}

				// Otherwise make sure the error bubbles up
				return TPromise.wrapError<void>(error);
			});
		});
	}

	private openAsBinary(input: FileEditorInput, options: EditorOptions): void {
		input.setForceOpenAsBinary();
		this.editorService.openEditor(input, options, this.position).done(null, errors.onUnexpectedError);
	}

	private openAsFolder(input: FileEditorInput): boolean {

		// Since we cannot open a folder, we have to restore the previous input if any and close the editor
		this.editorService.closeEditor(this.position, this.input).done(() => {

			// Best we can do is to reveal the folder in the explorer
			if (this.contextService.isInsideWorkspace(input.getResource())) {
				this.viewletService.openViewlet(VIEWLET_ID, true).done(viewlet => {
					return (viewlet as IExplorerViewlet).getExplorerView().select(input.getResource(), true);
				}, errors.onUnexpectedError);
			}
		}, errors.onUnexpectedError);

		return true; // in any case we handled it
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

	public clearInput(): void {

		// Keep editor view state in settings to restore when coming back
		this.doSaveTextEditorViewState(this.input);

		// Clear Model
		this.getControl().setModel(null);

		// Pass to super
		super.clearInput();
	}

	public shutdown(): void {

		// Save View State
		this.doSaveTextEditorViewState(this.input);

		// Call Super
		super.shutdown();
	}

	private doSaveTextEditorViewState(input: FileEditorInput): void {
		if (input && !input.isDisposed()) {
			this.saveTextEditorViewState(input.getResource());
		}
	}
}