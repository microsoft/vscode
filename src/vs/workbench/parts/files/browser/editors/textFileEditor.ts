/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import errors = require('vs/base/common/errors');
import {MIME_BINARY, MIME_TEXT} from 'vs/base/common/mime';
import types = require('vs/base/common/types');
import paths = require('vs/base/common/paths');
import {IEditorViewState} from 'vs/editor/common/editorCommon';
import {Action} from 'vs/base/common/actions';
import {Scope} from 'vs/workbench/common/memento';
import {IEditorOptions} from 'vs/editor/common/editorCommon';
import {VIEWLET_ID, TEXT_FILE_EDITOR_ID} from 'vs/workbench/parts/files/common/files';
import {SaveErrorHandler} from 'vs/workbench/parts/files/browser/saveErrorHandler';
import {BaseTextEditor} from 'vs/workbench/browser/parts/editor/textEditor';
import {EditorInput, EditorOptions, TextEditorOptions, EditorModel} from 'vs/workbench/common/editor';
import {TextFileEditorModel} from 'vs/workbench/parts/files/common/editors/textFileEditorModel';
import {BinaryEditorModel} from 'vs/workbench/common/editor/binaryEditorModel';
import {FileEditorInput} from 'vs/workbench/parts/files/browser/editors/fileEditorInput';
import {ExplorerViewlet} from 'vs/workbench/parts/files/browser/explorerViewlet';
import {IViewletService} from 'vs/workbench/services/viewlet/common/viewletService';
import {IFileOperationResult, FileOperationResult, FileChangesEvent, EventType, IFileService} from 'vs/platform/files/common/files';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IWorkspaceContextService} from 'vs/workbench/services/workspace/common/contextService';
import {IStorageService} from 'vs/platform/storage/common/storage';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {IEventService} from 'vs/platform/event/common/event';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IMessageService, Severity, CancelAction} from 'vs/platform/message/common/message';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IModeService} from 'vs/editor/common/services/modeService';
import {IThemeService} from 'vs/workbench/services/themes/common/themeService';
import {IHistoryService} from 'vs/workbench/services/history/common/history';

const LEGACY_EDITOR_VIEW_STATE_PREFERENCE_KEY = 'editorViewState'; // TODO@Ben migration
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
		@IHistoryService private historyService: IHistoryService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IStorageService storageService: IStorageService,
		@IMessageService messageService: IMessageService,
		@IConfigurationService configurationService: IConfigurationService,
		@IEventService eventService: IEventService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IModeService modeService: IModeService,
		@IThemeService themeService: IThemeService
	) {
		super(TextFileEditor.ID, telemetryService, instantiationService, contextService, storageService, messageService, configurationService, eventService, editorService, modeService, themeService);

		// Since we are the one providing save-support for models, we hook up the error handler for saving
		TextFileEditorModel.setSaveErrorHandler(instantiationService.createInstance(SaveErrorHandler));

		// Clear view state for deleted files
		this.toUnbind.push(this.eventService.addListener2(EventType.FILE_CHANGES, (e: FileChangesEvent) => this.onFilesChanged(e)));
	}

	private onFilesChanged(e: FileChangesEvent): void {
		let deleted = e.getDeleted();
		if (deleted && deleted.length) {
			this.clearTextEditorViewState(this.storageService, deleted.map((d) => d.resource.toString()));
		}
	}

	public getTitle(): string {
		return this.getInput() ? this.getInput().getName() : nls.localize('textFileEditor', "Text File Editor");
	}

	public setInput(input: EditorInput, options: EditorOptions): TPromise<void> {
		let oldInput = this.getInput();
		super.setInput(input, options);

		// Detect options
		let forceOpen = options && options.forceOpen;

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
			this.saveTextEditorViewState(this.storageService, (<FileEditorInput>oldInput).getResource().toString());
		}

		// Different Input (Reload)
		return this.editorService.resolveEditorModel(input, true /* Reload */).then((resolvedModel: EditorModel) => {

			// There is a special case where the text editor has to handle binary file editor input: if a file with application/unknown
			// mime has been resolved and cached before, it maybe an actual instance of BinaryEditorModel. In this case our text
			// editor has to open this model using the binary editor. We return early in this case.
			if (resolvedModel instanceof BinaryEditorModel && this.openAsBinary(input, options)) {
				return null;
			}

			// Assert Model interface
			if (!(resolvedModel instanceof TextFileEditorModel)) {
				return TPromise.wrapError<void>('Invalid editor input. Text file editor requires a model instance of TextFileEditorModel.');
			}

			let textFileModel = <TextFileEditorModel>resolvedModel;
			let textEditor = this.getControl();

			// Assert Text Model
			if (!textFileModel.textEditorModel) {
				return TPromise.wrapError<void>('Unable to open the file because the associated text model is undefined.');
			}

			// First assert that the current input is still the one we expect
			// This prevents a race condition when reloading a content takes long
			// and the user meanwhile decided to open another file
			if (!this.getInput() || (<FileEditorInput>this.getInput()).getResource().toString() !== textFileModel.getResource().toString()) {
				return null;
			}

			// log the time it takes the editor to render the resource
			let mode = textFileModel.textEditorModel.getMode();
			let setModelEvent = this.telemetryService.timedPublicLog('editorSetModel', {
				mode: mode && mode.getId(),
				resource: textFileModel.textEditorModel.uri.toString(),
			});

			// Editor
			textEditor.setModel(textFileModel.textEditorModel);

			// stop the event
			setModelEvent.stop();

			// TextOptions (avoiding instanceof here for a reason, do not change!)
			let optionsGotApplied = false;
			if (options && types.isFunction((<TextEditorOptions>options).apply)) {
				optionsGotApplied = (<TextEditorOptions>options).apply(textEditor);
			}

			// Otherwise restore View State
			if (!optionsGotApplied) {
				const editorViewState = this.loadTextEditorViewState(this.storageService, (<FileEditorInput>this.getInput()).getResource().toString());
				if (editorViewState) {
					textEditor.restoreViewState(editorViewState);
				}
			}
		}, (error) => {

			// In case we tried to open a file inside the text editor and the response
			// indicates that this is not a text file, reopen the file through the binary
			// editor by using application/octet-stream as mime.
			if ((<IFileOperationResult>error).fileOperationResult === FileOperationResult.FILE_IS_BINARY && this.openAsBinary(input, options)) {
				return;
			}

			// Similar, handle case where we were asked to open a folder in the text editor.
			if ((<IFileOperationResult>error).fileOperationResult === FileOperationResult.FILE_IS_DIRECTORY && this.openAsFolder(input)) {
				return;
			}

			// Offer to create a file from the error if we have a file not found and the name is valid
			if ((<IFileOperationResult>error).fileOperationResult === FileOperationResult.FILE_NOT_FOUND && paths.isValidBasename(paths.basename((<FileEditorInput>input).getResource().fsPath))) {
				return TPromise.wrapError(errors.create(errors.toErrorMessage(error), {
					actions: [
						CancelAction,
						new Action('workbench.files.action.createMissingFile', nls.localize('createFile', "Create File"), null, true, () => {
							return this.fileService.updateContent((<FileEditorInput>input).getResource(), '').then(() => {

								// Open
								return this.editorService.openEditor({
									resource: (<FileEditorInput>input).getResource(),
									mime: MIME_TEXT,
									options: {
										pinned: true // new file gets pinned by default
									}
								});
							});
						})
					]
				}));
			}

			// Inform the user if the file is too large to open
			if ((<IFileOperationResult>error).fileOperationResult === FileOperationResult.FILE_TOO_LARGE) {
				this.messageService.show(Severity.Info, nls.localize('fileTooLarge', "We are sorry, but the file is too large to open it inside an editor."));

				return;
			}

			// Otherwise make sure the error bubbles up
			return TPromise.wrapError(error);
		});
	}

	private openAsBinary(input: EditorInput, options: EditorOptions): boolean {
		if (input instanceof FileEditorInput) {
			let fileEditorInput = <FileEditorInput>input;

			let fileInputBinary = this.instantiationService.createInstance(FileEditorInput, fileEditorInput.getResource(), MIME_BINARY, void 0);
			this.editorService.openEditor(fileInputBinary, options, this.position).done(null, errors.onUnexpectedError);

			return true;
		}

		return false;
	}

	private openAsFolder(input: EditorInput): boolean {

		// Since we cannot open a folder, we have to restore the previous input if any and close the editor
		this.editorService.closeEditor(this.position, this.input).done(() => {

			// Best we can do is to reveal the folder in the explorer
			if (input instanceof FileEditorInput) {
				let fileEditorInput = <FileEditorInput>input;

				// Reveal if we have a workspace path
				if (this.contextService.isInsideWorkspace(fileEditorInput.getResource())) {
					this.viewletService.openViewlet(VIEWLET_ID, true).done((viewlet: ExplorerViewlet) => {
						return viewlet.getExplorerView().select(fileEditorInput.getResource(), true);
					}, errors.onUnexpectedError);
				}
			}
		}, errors.onUnexpectedError);

		return true; // in any case we handled it
	}

	protected getCodeEditorOptions(): IEditorOptions {
		let options = super.getCodeEditorOptions();

		let input = this.getInput();
		let inputName = input && input.getName();
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

		// TODO@Ben migration
		const legacyEditorViewStateMemento = memento[LEGACY_EDITOR_VIEW_STATE_PREFERENCE_KEY];
		if (legacyEditorViewStateMemento) {
			return legacyEditorViewStateMemento[key];
		}

		return null;
	}

	public clearInput(): void {

		// Keep editor view state in settings to restore when coming back
		if (this.input) {
			this.saveTextEditorViewState(this.storageService, (<FileEditorInput>this.input).getResource().toString());
		}

		// Clear Model
		this.getControl().setModel(null);

		// Pass to super
		super.clearInput();
	}

	public shutdown(): void {

		// Save View State
		if (this.input) {
			this.saveTextEditorViewState(this.storageService, (<FileEditorInput>this.input).getResource().toString());
		}

		// Call Super
		super.shutdown();
	}
}