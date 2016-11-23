/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import errors = require('vs/base/common/errors');
import { toErrorMessage } from 'vs/base/common/errorMessage';
import types = require('vs/base/common/types');
import paths = require('vs/base/common/paths');
import { IEditorViewState, IEditorOptions } from 'vs/editor/common/editorCommon';
import { Action } from 'vs/base/common/actions';
import { Scope } from 'vs/workbench/common/memento';
import { VIEWLET_ID, TEXT_FILE_EDITOR_ID } from 'vs/workbench/parts/files/common/files';
import { ITextFileEditorModel } from 'vs/workbench/services/textfile/common/textfiles';
import { BaseTextEditor } from 'vs/workbench/browser/parts/editor/textEditor';
import { EditorOptions, TextEditorOptions } from 'vs/workbench/common/editor';
import { BinaryEditorModel } from 'vs/workbench/common/editor/binaryEditorModel';
import { FileEditorInput } from 'vs/workbench/parts/files/common/editors/fileEditorInput';
import { ExplorerViewlet } from 'vs/workbench/parts/files/browser/explorerViewlet';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IFileOperationResult, FileOperationResult, FileChangesEvent, EventType, IFileService } from 'vs/platform/files/common/files';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEventService } from 'vs/platform/event/common/event';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IMessageService, CancelAction } from 'vs/platform/message/common/message';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IThemeService } from 'vs/workbench/services/themes/common/themeService';

const TEXT_EDITOR_VIEW_STATE_PREFERENCE_KEY = 'textEditorViewState';

interface ITextEditorViewState {
	0?: IEditorViewState;
	1?: IEditorViewState;
	2?: IEditorViewState;
}

/**
 * An implementation of editor for file system resources.
 */
export class TextFileEditor extends BaseTextEditor {

	public static ID = TEXT_FILE_EDITOR_ID;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IFileService private fileService: IFileService,
		@IViewletService private viewletService: IViewletService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IStorageService storageService: IStorageService,
		@IHistoryService private historyService: IHistoryService,
		@IMessageService messageService: IMessageService,
		@IConfigurationService configurationService: IConfigurationService,
		@IEventService eventService: IEventService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IThemeService themeService: IThemeService
	) {
		super(TextFileEditor.ID, telemetryService, instantiationService, contextService, storageService, messageService, configurationService, eventService, editorService, themeService);

		// Clear view state for deleted files
		this.toUnbind.push(this.eventService.addListener2(EventType.FILE_CHANGES, (e: FileChangesEvent) => this.onFilesChanged(e)));
	}

	private onFilesChanged(e: FileChangesEvent): void {
		const deleted = e.getDeleted();
		if (deleted && deleted.length) {
			this.clearTextEditorViewState(this.storageService, deleted.map((d) => d.resource.toString()));
		}
	}

	public getTitle(): string {
		return this.getInput() ? this.getInput().getName() : nls.localize('textFileEditor', "Text File Editor");
	}

	public getInput(): FileEditorInput {
		return <FileEditorInput>super.getInput();
	}

	public setInput(input: FileEditorInput, options: EditorOptions): TPromise<void> {
		const oldInput = this.getInput();
		super.setInput(input, options);

		// Detect options
		const forceOpen = options && options.forceOpen;

		// We have a current input in this editor and are about to either open a new editor or jump to a different
		// selection inside the editor. Thus we store the current selection into the navigation history so that
		// a user can navigate back to the exact position he left off.
		if (oldInput) {
			const selection = this.getControl().getSelection();
			if (selection) {
				this.historyService.add(oldInput, { selection: { startLineNumber: selection.startLineNumber, startColumn: selection.startColumn } });
			}
		}

		// Same Input
		if (!forceOpen && input.matches(oldInput)) {

			// TextOptions (avoiding instanceof here for a reason, do not change!)
			if (options && types.isFunction((<TextEditorOptions>options).apply)) {
				(<TextEditorOptions>options).apply(this.getControl());
			}

			return TPromise.as<void>(null);
		}

		// Remember view settings if input changes
		if (oldInput) {
			this.saveTextEditorViewState(this.storageService, oldInput.getResource().toString());
		}

		// Different Input (Reload)
		return input.resolve(true).then(resolvedModel => {

			// There is a special case where the text editor has to handle binary file editor input: if a binary file
			// has been resolved and cached before, it maybe an actual instance of BinaryEditorModel. In this case our text
			// editor has to open this model using the binary editor. We return early in this case.
			if (resolvedModel instanceof BinaryEditorModel) {
				return this.openAsBinary(input, options);
			}

			// Check Model state
			const textFileModel = <ITextFileEditorModel>resolvedModel;

			const hasInput = !!this.getInput();
			const modelDisposed = textFileModel.isDisposed();
			const inputChanged = hasInput && this.getInput().getResource().toString() !== textFileModel.getResource().toString();
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
			const editorViewState = this.loadTextEditorViewState(this.storageService, this.getInput().getResource().toString());
			if (editorViewState) {
				textEditor.restoreViewState(editorViewState);
			}

			// TextOptions (avoiding instanceof here for a reason, do not change!)
			if (options && types.isFunction((<TextEditorOptions>options).apply)) {
				(<TextEditorOptions>options).apply(textEditor);
			}
		}, (error) => {

			// In case we tried to open a file inside the text editor and the response
			// indicates that this is not a text file, reopen the file through the binary
			// editor.
			if ((<IFileOperationResult>error).fileOperationResult === FileOperationResult.FILE_IS_BINARY) {
				return this.openAsBinary(input, options);
			}

			// Similar, handle case where we were asked to open a folder in the text editor.
			if ((<IFileOperationResult>error).fileOperationResult === FileOperationResult.FILE_IS_DIRECTORY && this.openAsFolder(input)) {
				return;
			}

			// Offer to create a file from the error if we have a file not found and the name is valid
			if ((<IFileOperationResult>error).fileOperationResult === FileOperationResult.FILE_NOT_FOUND && paths.isValidBasename(paths.basename(input.getResource().fsPath))) {
				return TPromise.wrapError(errors.create(toErrorMessage(error), {
					actions: [
						new Action('workbench.files.action.createMissingFile', nls.localize('createFile', "Create File"), null, true, () => {
							return this.fileService.updateContent(input.getResource(), '').then(() => {

								// Open
								return this.editorService.openEditor({
									resource: input.getResource(),
									options: {
										pinned: true // new file gets pinned by default
									}
								});
							});
						}),
						CancelAction
					]
				}));
			}

			// Otherwise make sure the error bubbles up
			return TPromise.wrapError(error);
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
				this.viewletService.openViewlet(VIEWLET_ID, true).done((viewlet: ExplorerViewlet) => {
					return viewlet.getExplorerView().select(input.getResource(), true);
				}, errors.onUnexpectedError);
			}
		}, errors.onUnexpectedError);

		return true; // in any case we handled it
	}

	protected getCodeEditorOptions(): IEditorOptions {
		const options = super.getCodeEditorOptions();

		const input = this.getInput();
		const inputName = input && input.getName();
		options.ariaLabel = inputName ? nls.localize('fileEditorWithInputAriaLabel', "{0}. Text file editor.", inputName) : nls.localize('fileEditorAriaLabel', "Text file editor.");

		return options;
	}

	/**
	 * Saves the text editor view state under the given key.
	 */
	private saveTextEditorViewState(storageService: IStorageService, key: string): void {
		const memento = this.getMemento(storageService, Scope.WORKSPACE);
		let textEditorViewStateMemento = memento[TEXT_EDITOR_VIEW_STATE_PREFERENCE_KEY];
		if (!textEditorViewStateMemento) {
			textEditorViewStateMemento = Object.create(null);
			memento[TEXT_EDITOR_VIEW_STATE_PREFERENCE_KEY] = textEditorViewStateMemento;
		}

		const editorViewState = this.getControl().saveViewState();

		let fileViewState: ITextEditorViewState = textEditorViewStateMemento[key];
		if (!fileViewState) {
			fileViewState = Object.create(null);
			textEditorViewStateMemento[key] = fileViewState;
		}

		if (typeof this.position === 'number') {
			fileViewState[this.position] = editorViewState;
		}
	}

	/**
	 * Clears the text editor view state under the given key.
	 */
	private clearTextEditorViewState(storageService: IStorageService, keys: string[]): void {
		const memento = this.getMemento(storageService, Scope.WORKSPACE);
		const textEditorViewStateMemento = memento[TEXT_EDITOR_VIEW_STATE_PREFERENCE_KEY];
		if (textEditorViewStateMemento) {
			keys.forEach(key => delete textEditorViewStateMemento[key]);
		}
	}

	/**
	 * Loads the text editor view state for the given key and returns it.
	 */
	private loadTextEditorViewState(storageService: IStorageService, key: string): IEditorViewState {
		const memento = this.getMemento(storageService, Scope.WORKSPACE);
		const textEditorViewStateMemento = memento[TEXT_EDITOR_VIEW_STATE_PREFERENCE_KEY];
		if (textEditorViewStateMemento) {
			const fileViewState: ITextEditorViewState = textEditorViewStateMemento[key];
			if (fileViewState) {
				return fileViewState[this.position];
			}
		}

		return null;
	}

	public clearInput(): void {

		// Keep editor view state in settings to restore when coming back
		if (this.input) {
			this.saveTextEditorViewState(this.storageService, this.getInput().getResource().toString());
		}

		// Clear Model
		this.getControl().setModel(null);

		// Pass to super
		super.clearInput();
	}

	public shutdown(): void {

		// Save View State
		if (this.input) {
			this.saveTextEditorViewState(this.storageService, this.getInput().getResource().toString());
		}

		// Call Super
		super.shutdown();
	}
}