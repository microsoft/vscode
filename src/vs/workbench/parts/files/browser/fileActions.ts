/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/fileactions';
import {TPromise} from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import {isWindows, isLinux, isMacintosh} from 'vs/base/common/platform';
import {sequence, ITask} from 'vs/base/common/async';
import {MIME_TEXT, isUnspecific, isBinaryMime, guessMimeTypes} from 'vs/base/common/mime';
import paths = require('vs/base/common/paths');
import URI from 'vs/base/common/uri';
import errors = require('vs/base/common/errors');
import strings = require('vs/base/common/strings');
import {Event, EventType as CommonEventType} from 'vs/base/common/events';
import {getPathLabel} from 'vs/base/common/labels';
import diagnostics = require('vs/base/common/diagnostics');
import {Action, IAction} from 'vs/base/common/actions';
import {MessageType, IInputValidator} from 'vs/base/browser/ui/inputbox/inputBox';
import {ITree, IHighlightEvent} from 'vs/base/parts/tree/browser/tree';
import {disposeAll, IDisposable} from 'vs/base/common/lifecycle';
import {EventType as WorkbenchEventType, EditorEvent} from 'vs/workbench/common/events';
import Files = require('vs/workbench/parts/files/common/files');
import {IFileService, IFileStat, IImportResult} from 'vs/platform/files/common/files';
import {DiffEditorInput, toDiffLabel} from 'vs/workbench/common/editor/diffEditorInput';
import {asFileEditorInput, getUntitledOrFileResource, TextEditorOptions, EditorOptions, EditorInput} from 'vs/workbench/common/editor';
import {IEditorSelection} from 'vs/editor/common/editorCommon';
import {FileEditorInput} from 'vs/workbench/parts/files/browser/editors/fileEditorInput';
import {FileStat, NewStatPlaceholder} from 'vs/workbench/parts/files/common/explorerViewModel';
import {ExplorerView} from 'vs/workbench/parts/files/browser/views/explorerView';
import {ExplorerViewlet} from 'vs/workbench/parts/files/browser/explorerViewlet';
import {CACHE} from 'vs/workbench/parts/files/common/editors/textFileEditorModel';
import {IActionProvider} from 'vs/base/parts/tree/browser/actionsRenderer';
import {WorkingFileEntry, WorkingFilesModel} from 'vs/workbench/parts/files/common/workingFilesModel';
import {IUntitledEditorService} from 'vs/workbench/services/untitled/common/untitledEditorService';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IQuickOpenService} from 'vs/workbench/services/quickopen/common/quickOpenService';
import {IViewletService} from 'vs/workbench/services/viewlet/common/viewletService';
import {IPartService} from 'vs/workbench/services/part/common/partService';
import {IStorageService} from 'vs/platform/storage/common/storage';
import {IResourceInput, Position, IEditor} from 'vs/platform/editor/common/editor';
import {IEventService} from 'vs/platform/event/common/event';
import {IInstantiationService, IConstructorSignature2} from 'vs/platform/instantiation/common/instantiation';
import {IMessageService, IMessageWithAction, IConfirmation, Severity, CancelAction} from 'vs/platform/message/common/message';
import {IProgressService, IProgressRunner} from 'vs/platform/progress/common/progress';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {KeyMod, KeyCode, Keybinding} from 'vs/base/common/keyCodes';

import ITextFileService = Files.ITextFileService;

export interface IEditableData {
	action: IAction;
	validator: IInputValidator;
}

export interface IFileViewletState {
	actionProvider: IActionProvider;
	getEditableData(stat: IFileStat): IEditableData;
	setEditable(stat: IFileStat, editableData: IEditableData): void;
	clearEditable(stat: IFileStat): void;
}

export class BaseFileAction extends Action {
	private _element: FileStat;
	private listenerToUnbind: () => void;

	constructor(
		id: string,
		label: string,
		@IWorkspaceContextService private _contextService: IWorkspaceContextService,
		@IWorkbenchEditorService private _editorService: IWorkbenchEditorService,
		@IFileService private _fileService: IFileService,
		@IMessageService private _messageService: IMessageService,
		@ITextFileService private _textFileService: ITextFileService,
		@IEventService private _eventService: IEventService
	) {
		super(id, label);

		this.enabled = false;

		// update enablement when options change
		this.listenerToUnbind = this._eventService.addListener(WorkbenchEventType.WORKBENCH_OPTIONS_CHANGED, () => this._updateEnablement());
	}

	public get contextService() {
		return this._contextService;
	}

	public get messageService() {
		return this._messageService;
	}

	public get editorService() {
		return this._editorService;
	}

	public get fileService() {
		return this._fileService;
	}

	public get eventService() {
		return this._eventService;
	}

	public get textFileService() {
		return this._textFileService;
	}

	public get element() {
		return this._element;
	}

	public set element(element: FileStat) {
		this._element = element;
	}

	_isEnabled(): boolean {
		return true;
	}

	_updateEnablement(): void {
		this.enabled = !!(this._contextService && this._fileService && this._editorService && !this._contextService.getOptions().readOnly && this._isEnabled());
	}

	protected onError(error: any): void {
		this._messageService.show(Severity.Error, error);
	}

	protected onWarning(warning: any): void {
		this._messageService.show(Severity.Warning, warning);
	}

	protected onErrorWithRetry(error: any, retry: () => TPromise<any>, extraAction?: Action): void {
		let actions = [
			CancelAction,
			new Action(this.id, nls.localize('retry', "Retry"), null, true, () => retry())
		];

		if (extraAction) {
			actions.push(extraAction);
		}

		let errorWithRetry: IMessageWithAction = {
			actions: actions,
			message: errors.toErrorMessage(error, false)
		};

		this._messageService.show(Severity.Error, errorWithRetry);
	}

	protected handleDirty(): TPromise<boolean /* cancel */> {
		if (this.textFileService.isDirty(this._element.resource)) {
			let res = this.textFileService.confirmSave([this._element.resource]);
			if (res === Files.ConfirmResult.SAVE) {
				return this.textFileService.save(this._element.resource).then(() => false);
			}

			if (res === Files.ConfirmResult.DONT_SAVE) {
				return this.textFileService.revert(this._element.resource).then(() => false);
			}

			return TPromise.as(true);
		}

		return TPromise.as(false);
	}

	public dispose(): void {
		this.listenerToUnbind();

		super.dispose();
	}
}

export class TriggerRenameFileAction extends BaseFileAction {

	public static ID = 'workbench.files.action.triggerRename';

	private tree: ITree;
	private renameAction: BaseRenameAction;

	constructor(
		tree: ITree,
		element: FileStat,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IFileService fileService: IFileService,
		@IMessageService messageService: IMessageService,
		@ITextFileService textFileService: ITextFileService,
		@IEventService eventService: IEventService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(TriggerRenameFileAction.ID, nls.localize('rename', "Rename"), contextService, editorService, fileService, messageService, textFileService, eventService);

		this.tree = tree;
		this.element = element;
		this.renameAction = instantiationService.createInstance(RenameFileAction, element);
		this._updateEnablement();
	}

	public validateFileName(parent: IFileStat, name: string): string {
		return this.renameAction.validateFileName(this.element.parent, name);
	}

	public run(context?: any): TPromise<any> {
		if (!context) {
			return TPromise.wrapError('No context provided to BaseEnableFileRenameAction.');
		}

		let viewletState = <IFileViewletState>context.viewletState;
		if (!viewletState) {
			return TPromise.wrapError('Invalid viewlet state provided to BaseEnableFileRenameAction.');
		}

		let stat = <IFileStat>context.stat;
		if (!stat) {
			return TPromise.wrapError('Invalid stat provided to BaseEnableFileRenameAction.');
		}

		viewletState.setEditable(stat, {
			action: this.renameAction,
			validator: (value) => {
				let message = this.validateFileName(this.element.parent, value);

				if (!message) {
					return null;
				}

				return {
					content: message,
					formatContent: true,
					type: MessageType.ERROR
				};
			}
		});

		this.tree.refresh(stat, false).then(() => {
			this.tree.setHighlight(stat);

			let unbind = this.tree.addListener(CommonEventType.HIGHLIGHT, (e: IHighlightEvent) => {
				if (!e.highlight) {
					viewletState.clearEditable(stat);
					this.tree.refresh(stat).done(null, errors.onUnexpectedError);
					unbind();
				}
			});
		}).done(null, errors.onUnexpectedError);
	}
}

export abstract class BaseRenameAction extends BaseFileAction {

	constructor(
		id: string,
		label: string,
		element: FileStat,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IFileService fileService: IFileService,
		@IMessageService messageService: IMessageService,
		@ITextFileService textFileService: ITextFileService,
		@IProgressService private progressService: IProgressService,
		@IEventService eventService: IEventService
	) {
		super(id, label, contextService, editorService, fileService, messageService, textFileService, eventService);

		this.element = element;
	}

	public run(context?: any): TPromise<any> {
		if (!context) {
			return TPromise.wrapError('No context provided to BaseRenameFileAction.');
		}

		let name = <string>context.value;
		if (!name) {
			return TPromise.wrapError('No new name provided to BaseRenameFileAction.');
		}

		// Automatically trim whitespaces and trailing dots to produce nice file names
		name = getWellFormedFileName(name);
		let existingName = getWellFormedFileName(this.element.name);

		// Return early if name is invalid or didn't change
		if (name === existingName || this.validateFileName(this.element.parent, name)) {
			return TPromise.as(null);
		}

		// Call function and Emit Event through viewer
		let promise = this.runAction(name).then((stat: IFileStat) => {
			if (stat) {
				this.onSuccess(stat);
			}
		}, (error: any) => {
			this.onError(error);
		});

		if (this.progressService) {
			this.progressService.showWhile(promise, 800);
		}

		return promise;
	}

	public validateFileName(parent: IFileStat, name: string): string {
		let source = this.element.name;
		let target = name;

		if (!isLinux) { // allow rename of same file also when case differs (e.g. Game.js => game.js)
			source = source.toLowerCase();
			target = target.toLowerCase();
		}

		if (getWellFormedFileName(source) === getWellFormedFileName(target)) {
			return null;
		}

		return validateFileName(parent, name, false);
	}

	public abstract runAction(newName: string): TPromise<any>;

	public onSuccess(stat: IFileStat): void {
		let before: IFileStat = null;
		if (!(this.element instanceof NewStatPlaceholder)) {
			before = this.element.clone(); // Clone element to not expose viewers element to listeners
		}

		this.eventService.emit('files.internal:fileChanged', new Files.LocalFileChangeEvent(before, stat));
	}
}

export class RenameFileAction extends BaseRenameAction {

	public static ID = 'workbench.files.action.renameFile';

	constructor(
		element: FileStat,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IFileService fileService: IFileService,
		@IMessageService messageService: IMessageService,
		@ITextFileService textFileService: ITextFileService,
		@IProgressService progressService: IProgressService,
		@IEventService eventService: IEventService
	) {
		super(RenameFileAction.ID, nls.localize('rename', "Rename"), element, contextService, editorService, fileService, messageService, textFileService, progressService, eventService);

		this._updateEnablement();
	}

	public runAction(newName: string): TPromise<any> {

		// Check if file is dirty in editor and save it to avoid data loss
		return this.handleDirty().then((cancel: boolean) => {
			if (cancel) {
				return TPromise.as(null);
			}

			// If the file is still dirty, do not touch it because a save is pending to disk and we can not abort it
			if (this.textFileService.isDirty(this.element.resource)) {
				this.onWarning(nls.localize('warningFileDirty', "File '{0}' is currently being saved, please try again later.", getPathLabel(this.element.resource)));

				return TPromise.as(null);
			}

			return this.fileService.rename(this.element.resource, newName).then(null, (error: Error) => {
				this.onErrorWithRetry(error, () => this.runAction(newName));
			});
		});
	}
}

/* Base New File/Folder Action */
export class BaseNewAction extends BaseFileAction {
	private presetFolder: FileStat;
	private tree: ITree;
	private isFile: boolean;
	private renameAction: BaseRenameAction;

	constructor(
		id: string,
		label: string,
		tree: ITree,
		isFile: boolean,
		editableAction: BaseRenameAction,
		element: FileStat,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IFileService fileService: IFileService,
		@IMessageService messageService: IMessageService,
		@ITextFileService textFileService: ITextFileService,
		@IEventService eventService: IEventService
	) {
		super(id, label, contextService, editorService, fileService, messageService, textFileService, eventService);

		if (element) {
			this.presetFolder = element.isDirectory ? element : element.parent;
		}

		this.tree = tree;
		this.isFile = isFile;
		this.renameAction = editableAction;
	}

	public run(context?: any): TPromise<any> {
		if (!context) {
			return TPromise.wrapError('No context provided to BaseNewAction.');
		}

		let viewletState = <IFileViewletState>context.viewletState;
		if (!viewletState) {
			return TPromise.wrapError('Invalid viewlet state provided to BaseNewAction.');
		}

		let folder: FileStat = this.presetFolder;
		if (!folder) {
			let focus = <FileStat>this.tree.getFocus();
			if (focus) {
				folder = focus.isDirectory ? focus : focus.parent;
			} else {
				folder = this.tree.getInput();
			}
		}

		if (!folder) {
			return TPromise.wrapError('Invalid parent folder to create.');
		}

		return this.tree.reveal(folder, 0.5).then(() => {
			return this.tree.expand(folder).then(() => {
				let stat = NewStatPlaceholder.addNewStatPlaceholder(folder, !this.isFile);

				this.renameAction.element = stat;

				viewletState.setEditable(stat, {
					action: this.renameAction,
					validator: (value) => {
						let message = this.renameAction.validateFileName(folder, value);

						if (!message) {
							return null;
						}

						return {
							content: message,
							formatContent: true,
							type: MessageType.ERROR
						};
					}
				});

				return this.tree.refresh(folder).then(() => {
					return this.tree.expand(folder).then(() => {
						return this.tree.reveal(stat, 0.5).then(() => {
							this.tree.setHighlight(stat);

							let unbind: () => void = this.tree.addListener(CommonEventType.HIGHLIGHT, (e: IHighlightEvent) => {
								if (!e.highlight) {
									stat.destroy();
									this.tree.refresh(folder).done(null, errors.onUnexpectedError);
									unbind();
								}
							});
						});
					});
				});
			});
		});
	}
}

/* New File */
export class NewFileAction extends BaseNewAction {

	constructor(
		tree: ITree,
		element: FileStat,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IFileService fileService: IFileService,
		@IMessageService messageService: IMessageService,
		@ITextFileService textFileService: ITextFileService,
		@IEventService eventService: IEventService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super('workbench.action.files.newFile', nls.localize('newFile', "New File"), tree, true, instantiationService.createInstance(CreateFileAction, element), null, contextService, editorService, fileService, messageService, textFileService, eventService);

		this.class = 'explorer-action new-file';
		this._updateEnablement();
	}
}

/* New Folder */
export class NewFolderAction extends BaseNewAction {

	constructor(
		tree: ITree,
		element: FileStat,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IFileService fileService: IFileService,
		@IMessageService messageService: IMessageService,
		@ITextFileService textFileService: ITextFileService,
		@IEventService eventService: IEventService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super('workbench.action.files.newFolder', nls.localize('newFolder', "New Folder"), tree, false, instantiationService.createInstance(CreateFolderAction, element), null, contextService, editorService, fileService, messageService, textFileService, eventService);

		this.class = 'explorer-action new-folder';
		this._updateEnablement();
	}
}

export abstract class BaseGlobalNewAction extends Action {
	private toDispose: Action;

	constructor(
		id: string,
		label: string,
		@IViewletService private viewletService: IViewletService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		return this.viewletService.openViewlet(Files.VIEWLET_ID, true).then((viewlet) => {
			return TPromise.timeout(100).then(() => { // use a timeout to prevent the explorer from revealing the active file
				viewlet.focus();

				let explorer = <ExplorerViewlet>viewlet;
				let explorerView = explorer.getExplorerView();

				if (!explorerView.isExpanded()) {
					explorerView.expand();
				}

				let action = this.toDispose = this.instantiationService.createInstance(this.getAction(), explorerView.getViewer(), null);

				return explorer.getActionRunner().run(action);
			});
		});
	}

	protected abstract getAction(): IConstructorSignature2<ITree, IFileStat, Action>;

	public dispose(): void {
		super.dispose();

		if (this.toDispose) {
			this.toDispose.dispose();
			this.toDispose = null;
		}
	}
}

/* Create new file from anywhere: Open untitled */
export class GlobalNewFileAction extends Action {
	public static ID = 'workbench.action.files.newUntitledFile';
	public static LABEL = nls.localize('newFile', "New File");

	constructor(
		id: string,
		label: string,
		@IStorageService private storageService: IStorageService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@ITextFileService private textFileService: ITextFileService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		let input = this.untitledEditorService.createOrGet();

		// Make sure this untitled buffer shows up in working files set
		this.textFileService.getWorkingFilesModel().addEntry(input.getResource());

		return this.editorService.openEditor(input);
	}
}

/* Create new folder from anywhere */
export class GlobalNewFolderAction extends BaseGlobalNewAction {
	public static ID = 'workbench.action.files.newFolder';
	public static LABEL = nls.localize('newFolder', "New Folder");

	protected getAction(): IConstructorSignature2<ITree, IFileStat, Action> {
		return NewFolderAction;
	}
}

/* Create New File/Folder (only used internally by explorerViewer) */
export abstract class BaseCreateAction extends BaseRenameAction {

	public validateFileName(parent: IFileStat, name: string): string {
		if (this.element instanceof NewStatPlaceholder) {
			return validateFileName(parent, name, false);
		}

		return super.validateFileName(parent, name);
	}
}

/* Create New File (only used internally by explorerViewer) */
export class CreateFileAction extends BaseCreateAction {

	public static ID = 'workbench.files.action.createFileFromExplorer';
	public static LABEL = nls.localize('createNewFile', "New File");

	constructor(
		element: FileStat,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IFileService fileService: IFileService,
		@IMessageService messageService: IMessageService,
		@ITextFileService textFileService: ITextFileService,
		@IProgressService progressService: IProgressService,
		@IEventService eventService: IEventService
	) {
		super(CreateFileAction.ID, CreateFileAction.LABEL, element, contextService, editorService, fileService, messageService, textFileService, progressService, eventService);

		this._updateEnablement();
	}

	public runAction(fileName: string): TPromise<any> {
		return this.fileService.createFile(URI.file(paths.join(this.element.parent.resource.fsPath, fileName))).then((stat) => {
			this.textFileService.getWorkingFilesModel().addEntry(stat.resource); // add to working files

			return stat;
		}, (error) => {
			this.onErrorWithRetry(error, () => this.runAction(fileName));
		});
	}
}

/* Create New Folder (only used internally by explorerViewer) */
export class CreateFolderAction extends BaseCreateAction {

	public static ID = 'workbench.files.action.createFolderFromExplorer';
	public static LABEL = nls.localize('createNewFolder', "New Folder");

	constructor(
		element: FileStat,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IFileService fileService: IFileService,
		@IMessageService messageService: IMessageService,
		@ITextFileService textFileService: ITextFileService,
		@IProgressService progressService: IProgressService,
		@IEventService eventService: IEventService
	) {
		super(CreateFolderAction.ID, CreateFolderAction.LABEL, null, contextService, editorService, fileService, messageService, textFileService, progressService, eventService);

		this._updateEnablement();
	}

	public runAction(fileName: string): TPromise<any> {
		return this.fileService.createFolder(URI.file(paths.join(this.element.parent.resource.fsPath, fileName))).then(null, (error) => {
			this.onErrorWithRetry(error, () => this.runAction(fileName));
		});
	}
}

export class BaseDeleteFileAction extends BaseFileAction {
	private tree: ITree;
	private useTrash: boolean;
	private skipConfirm: boolean;

	constructor(
		id: string,
		label: string,
		tree: ITree,
		element: FileStat,
		useTrash: boolean,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IFileService fileService: IFileService,
		@IMessageService messageService: IMessageService,
		@ITextFileService textFileService: ITextFileService,
		@IEventService eventService: IEventService
	) {
		super(id, label, contextService, editorService, fileService, messageService, textFileService, eventService);

		this.tree = tree;
		this.element = element;
		this.useTrash = useTrash && !paths.isUNC(element.resource.fsPath); // on UNC shares there is no trash

		this._updateEnablement();
	}

	public run(): TPromise<any> {

		// Remove highlight
		if (this.tree) {
			this.tree.clearHighlight();
		}

		// Ask for Confirm
		if (!this.skipConfirm) {
			let confirm: IConfirmation;
			if (this.useTrash) {
				confirm = {
					message: this.element.isDirectory ? nls.localize('confirmMoveTrashMessageFolder', "Are you sure you want to delete '{0}' and its contents?", this.element.name) : nls.localize('confirmMoveTrashMessageFile', "Are you sure you want to delete '{0}'?", this.element.name),
					detail: isWindows ? nls.localize('undoBin', "You can restore from the recycle bin.") : nls.localize('undoTrash', "You can restore from the trash."),
					primaryButton: isWindows ? nls.localize('deleteButtonLabelRecycleBin', "&&Move to Recycle Bin") : nls.localize({ key: 'deleteButtonLabelTrash', comment: ['&& denotes a mnemonic'] }, "&&Move to Trash")
				};
			} else {
				confirm = {
					message: this.element.isDirectory ? nls.localize('confirmDeleteMessageFolder', "Are you sure you want to permanently delete '{0}' and its contents?", this.element.name) : nls.localize('confirmDeleteMessageFile', "Are you sure you want to permanently delete '{0}'?", this.element.name),
					detail: nls.localize('irreversible', "This action is irreversible!"),
					primaryButton: nls.localize({ key: 'deleteButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Delete")
				};
			}

			if (!this.messageService.confirm(confirm)) {
				return TPromise.as(null);
			}
		}

		// Check if file is dirty in editor and save it to avoid data loss
		return this.handleDirty().then((cancel: boolean) => {
			if (cancel) {
				return TPromise.as(null);
			}

			// If the file is still dirty, do not touch it because a save is pending to disk and we can not abort it
			if (this.textFileService.isDirty(this.element.resource)) {
				this.onWarning(nls.localize('warningFileDirty', "File '{0}' is currently being saved, please try again later.", getPathLabel(this.element.resource)));

				return TPromise.as(null);
			}

			// Since a delete operation can take a while we want to emit the event proactively to avoid issues
			// with stale entries in the explorer tree.
			this.eventService.emit('files.internal:fileChanged', new Files.LocalFileChangeEvent(this.element.clone(), null));

			// Call function
			let servicePromise = this.fileService.del(this.element.resource, this.useTrash).then(() => {
				if (this.element.parent) {
					this.tree.setFocus(this.element.parent); // move focus to parent
				}
			}, (error: any) => {

				// Allow to retry
				let extraAction: Action;
				if (this.useTrash) {
					extraAction = new Action('permanentDelete', nls.localize('permDelete', "Delete Permanently"), null, true, () => { this.useTrash = false; this.skipConfirm = true; return this.run(); });
				}

				this.onErrorWithRetry(error, () => this.run(), extraAction);

				// Since the delete failed, best we can do is to refresh the explorer from the root to show the current state of files.
				let event = new Files.LocalFileChangeEvent(new FileStat(this.contextService.getWorkspace().resource, true, true), new FileStat(this.contextService.getWorkspace().resource, true, true));
				this.eventService.emit('files.internal:fileChanged', event);

				// Focus back to tree
				this.tree.DOMFocus();
			});

			return servicePromise;
		});
	}
}

/* Move File/Folder to trash */
export class MoveFileToTrashAction extends BaseDeleteFileAction {
	public static ID = 'workbench.files.action.moveFileToTrash';

	constructor(
		tree: ITree,
		element: FileStat,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IFileService fileService: IFileService,
		@IMessageService messageService: IMessageService,
		@ITextFileService textFileService: ITextFileService,
		@IEventService eventService: IEventService
	) {
		super(MoveFileToTrashAction.ID, nls.localize('delete', "Delete"), tree, element, true, contextService, editorService, fileService, messageService, textFileService, eventService);
	}
}

/* Delete File/Folder */
export class DeleteFileAction extends BaseDeleteFileAction {
	public static ID = 'workbench.files.action.deleteFile';

	constructor(
		tree: ITree,
		element: FileStat,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IFileService fileService: IFileService,
		@IMessageService messageService: IMessageService,
		@ITextFileService textFileService: ITextFileService,
		@IEventService eventService: IEventService
	) {
		super(DeleteFileAction.ID, nls.localize('delete', "Delete"), tree, element, false, contextService, editorService, fileService, messageService, textFileService, eventService);
	}
}

/* Import File */
export class ImportFileAction extends BaseFileAction {

	public static ID = 'workbench.files.action.importFile';
	private tree: ITree;

	constructor(
		tree: ITree,
		element: FileStat,
		clazz: string,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IFileService fileService: IFileService,
		@IMessageService messageService: IMessageService,
		@ITextFileService textFileService: ITextFileService,
		@IEventService eventService: IEventService,
		@IProgressService private progressService: IProgressService
	) {
		super(ImportFileAction.ID, nls.localize('importFiles', "Import Files"), contextService, editorService, fileService, messageService, textFileService, eventService);

		this.tree = tree;
		this.element = element;

		if (clazz) {
			this.class = clazz;
		}

		this._updateEnablement();
	}

	public getViewer(): ITree {
		return this.tree;
	}

	public run(context?: any): TPromise<any> {
		let multiFileProgressTracker: IProgressRunner;
		let importPromise = TPromise.as(null).then(() => {
			let input = context.input;
			if (input.files && input.files.length > 0) {

				// Find parent for import
				let targetElement: FileStat;
				if (this.element) {
					targetElement = this.element;
				} else {
					targetElement = this.tree.getFocus() || this.tree.getInput();
				}

				if (!targetElement.isDirectory) {
					targetElement = targetElement.parent;
				}

				// Create real files array
				let filesArray: File[] = [];
				for (let i = 0; i < input.files.length; i++) {
					let file = input.files[i];
					filesArray.push(file);
				}

				// Resolve target to check for name collisions and ask user
				return this.fileService.resolveFile(targetElement.resource).then((targetStat: IFileStat) => {

					// Check for name collisions
					let targetNames: { [name: string]: IFileStat } = {};
					targetStat.children.forEach((child) => {
						targetNames[isLinux ? child.name : child.name.toLowerCase()] = child;
					});

					let overwrite = true;
					if (filesArray.some((file) => {
						return !!targetNames[isLinux ? file.name : file.name.toLowerCase()];
					})) {
						let confirm: IConfirmation = {
							message: nls.localize('confirmOverwrite', "A file or folder with the same name already exists in the destination folder. Do you want to replace it?"),
							detail: nls.localize('irreversible', "This action is irreversible!"),
							primaryButton: nls.localize({ key: 'replaceButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Replace")
						};

						overwrite = this.messageService.confirm(confirm);
					}

					if (!overwrite) {
						return;
					}

					// Progress per file imported
					if (filesArray.length > 1 && this.progressService) {
						multiFileProgressTracker = this.progressService.show(filesArray.length);
					}

					// Run import in sequence
					let importPromisesFactory: ITask<TPromise<void>>[] = [];
					filesArray.forEach((file) => {
						importPromisesFactory.push(() => {
							let sourceFile = URI.file((<any>file).path);

							return this.fileService.importFile(sourceFile, targetElement.resource).then((result: IImportResult) => {

								// Progress
								if (multiFileProgressTracker) {
									multiFileProgressTracker.worked(1);
								}

								if (result.stat) {

									// Emit Deleted Event if file gets replaced unless it is the same file
									let oldFile = targetNames[isLinux ? file.name : file.name.toLowerCase()];
									if (oldFile && oldFile.resource.fsPath !== result.stat.resource.fsPath) {
										this.eventService.emit('files.internal:fileChanged', new Files.LocalFileChangeEvent(oldFile, null));
									}

									// Emit Import Event
									this.eventService.emit('files.internal:fileChanged', new FileImportedEvent(result.stat, result.isNew, context.event));
								}
							}, (error: any) => {
								this.messageService.show(Severity.Error, error);
							});
						});
					});

					return sequence(importPromisesFactory);
				});
			}
		});

		if (this.progressService && !multiFileProgressTracker) {
			this.progressService.showWhile(importPromise, 800);
		}

		return importPromise.then(() => {
			this.tree.clearHighlight();
		}, (error: any) => {
			this.onError(error);
			this.tree.clearHighlight();
		});
	}
}

/** File import event is emitted when a file is import into the workbench. */
export class FileImportedEvent extends Files.LocalFileChangeEvent {
	private isNew: boolean;

	constructor(stat?: IFileStat, isNew?: boolean, originalEvent?: Event) {
		super(null, stat, originalEvent);

		this.isNew = isNew;
	}

	public gotAdded(): boolean {
		return this.isNew;
	}

	public gotMoved(): boolean {
		return false;
	}

	public gotUpdated(): boolean {
		return !this.isNew;
	}

	public gotDeleted(): boolean {
		return false;
	}
}

// Copy File/Folder
let fileToCopy: FileStat;
export class CopyFileAction extends BaseFileAction {

	public static ID = 'workbench.files.action.copyFile';

	private tree: ITree;
	constructor(
		tree: ITree,
		element: FileStat,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IFileService fileService: IFileService,
		@IMessageService messageService: IMessageService,
		@ITextFileService textFileService: ITextFileService,
		@IEventService eventService: IEventService
	) {
		super(CopyFileAction.ID, nls.localize('copyFile', "Copy"), contextService, editorService, fileService, messageService, textFileService, eventService);

		this.tree = tree;
		this.element = element;
		this._updateEnablement();
	}

	public run(): TPromise<any> {

		// Remember as file/folder to copy
		fileToCopy = this.element;

		// Remove highlight
		if (this.tree) {
			this.tree.clearHighlight();
		}

		this.tree.DOMFocus();

		return TPromise.as(null);
	}
}

// Paste File/Folder
export class PasteFileAction extends BaseFileAction {

	public static ID = 'workbench.files.action.pasteFile';

	private tree: ITree;

	constructor(
		tree: ITree,
		element: FileStat,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IFileService fileService: IFileService,
		@IMessageService messageService: IMessageService,
		@ITextFileService textFileService: ITextFileService,
		@IEventService eventService: IEventService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(PasteFileAction.ID, nls.localize('pasteFile', "Paste"), contextService, editorService, fileService, messageService, textFileService, eventService);

		this.tree = tree;
		this.element = element;
		this._updateEnablement();
	}

	_isEnabled(): boolean {

		// Need at least a file to copy
		if (!fileToCopy) {
			return false;
		}

		// Check if file was deleted or moved meanwhile
		let root: FileStat = this.tree.getInput();
		let exists = root.find(fileToCopy.resource);
		if (!exists) {
			fileToCopy = null;
			return false;
		}

		// Check if target is ancestor of pasted folder
		if (this.element.resource.toString() !== fileToCopy.resource.toString() && paths.isEqualOrParent(this.element.resource.fsPath, fileToCopy.resource.fsPath)) {
			return false;
		}

		return true;
	}

	public run(): TPromise<any> {

		// Find target
		let target: FileStat;
		if (this.element.resource.toString() === fileToCopy.resource.toString()) {
			target = this.element.parent;
		} else {
			target = this.element.isDirectory ? this.element : this.element.parent;
		}

		// Reuse duplicate action
		let pasteAction = this.instantiationService.createInstance(DuplicateFileAction, this.tree, fileToCopy, target);

		return pasteAction.run().then(() => {
			this.tree.DOMFocus();
		});
	}
}

// Duplicate File/Folder
export class DuplicateFileAction extends BaseFileAction {
	private tree: ITree;
	private target: IFileStat;

	constructor(
		tree: ITree,
		element: FileStat,
		target: FileStat,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IFileService fileService: IFileService,
		@IMessageService messageService: IMessageService,
		@ITextFileService textFileService: ITextFileService,
		@IEventService eventService: IEventService,
		@IProgressService private progressService: IProgressService
	) {
		super('workbench.files.action.duplicateFile', nls.localize('duplicateFile', "Duplicate"), contextService, editorService, fileService, messageService, textFileService, eventService);

		this.tree = tree;
		this.element = element;
		this.target = (target && target.isDirectory) ? target : element.parent;
		this._updateEnablement();
	}

	public run(): TPromise<any> {

		// Remove highlight
		if (this.tree) {
			this.tree.clearHighlight();
		}

		// Copy File and emit event
		let result = this.fileService.copyFile(this.element.resource, this.findTarget()).then((stat: IFileStat) => {
			this.eventService.emit('files.internal:fileChanged', new Files.LocalFileChangeEvent(null, stat));
		}, (error: any) => {
			this.onError(error);
		});

		if (this.progressService) {
			this.progressService.showWhile(result, 800);
		}

		return result;
	}

	public onError(error: any): void {
		this.messageService.show(Severity.Error, error);
	}

	private findTarget(): URI {
		let root: FileStat = this.tree.getInput();
		let name = this.element.name;

		let candidate = URI.file(paths.join(this.target.resource.fsPath, name));
		while (true) {
			if (!root.find(candidate)) {
				break;
			}

			name = this.toCopyName(name, this.element.isDirectory);
			candidate = URI.file(paths.join(this.target.resource.fsPath, name));
		}

		return candidate;
	}

	private toCopyName(name: string, isFolder: boolean): string {

		// file.1.txt=>file.2.txt
		if (!isFolder && name.match(/(\d+)(\..*)$/)) {
			return name.replace(/(\d+)(\..*)$/, (match, g1?, g2?) => { return (parseInt(g1) + 1) + g2; });
		}

		// file.txt=>file.1.txt
		let lastIndexOfDot = name.lastIndexOf('.');
		if (!isFolder && lastIndexOfDot >= 0) {
			return strings.format('{0}.1{1}', name.substr(0, lastIndexOfDot), name.substr(lastIndexOfDot));
		}

		// folder.1=>folder.2
		if (isFolder && name.match(/(\d+)$/)) {
			return name.replace(/(\d+)$/, (match: string, ...groups: any[]) => { return String(parseInt(groups[0]) + 1); });
		}

		// file/folder=>file.1/folder.1
		return strings.format('{0}.1', name);
	}
}

// Open to the side
export class OpenToSideAction extends Action {

	public static ID = 'workbench.files.action.openToSide';
	public static LABEL = nls.localize('openToSide', "Open to the Side");

	private tree: ITree;
	private resource: URI;
	private preserveFocus: boolean;

	constructor(
		tree: ITree,
		resource: URI,
		preserveFocus: boolean,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(OpenToSideAction.ID, OpenToSideAction.LABEL);

		this.tree = tree;
		this.preserveFocus = preserveFocus;
		this.resource = resource;

		this.updateEnablement();
	}

	private updateEnablement(): void {
		let activeEditor = this.editorService.getActiveEditor();
		this.enabled = (!activeEditor || activeEditor.position !== Position.RIGHT);
	}

	public run(): TPromise<any> {

		// Remove highlight
		this.tree.clearHighlight();

		// Set side input
		return this.editorService.openEditor({
			resource: this.resource,
			options: {
				preserveFocus: this.preserveFocus
			}
		}, true);
	}
}

let globalResourceToCompare: URI;
export class SelectResourceForCompareAction extends Action {
	private resource: URI;
	private tree: ITree;

	constructor(resource: URI, tree: ITree) {
		super('workbench.files.action.selectForCompare', nls.localize('compareSource', "Select for Compare"));

		this.tree = tree;
		this.resource = resource;
		this.enabled = true;
	}

	public run(): TPromise<any> {

		// Remember as source file to compare
		globalResourceToCompare = this.resource;

		// Remove highlight
		if (this.tree) {
			this.tree.clearHighlight();
			this.tree.DOMFocus();
		}

		return TPromise.as(null);
	}
}

// Global Compare with
export class GlobalCompareResourcesAction extends Action {

	public static ID = 'workbench.files.action.compareFileWith';
	public static LABEL = nls.localize('globalCompareFile', "Compare Active File With...");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IMessageService private messageService: IMessageService,
		@IEventService private eventService: IEventService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		let fileInput = asFileEditorInput(this.editorService.getActiveEditorInput());
		if (fileInput) {

			// Keep as resource to compare
			globalResourceToCompare = fileInput.getResource();

			// Listen for next editor to open
			let unbind = this.eventService.addListener(WorkbenchEventType.EDITOR_INPUT_OPENING, (e: EditorEvent) => {
				unbind(); // listen once

				let otherFileInput = asFileEditorInput(e.editorInput);
				if (otherFileInput) {
					let compareAction = this.instantiationService.createInstance(CompareResourcesAction, otherFileInput.getResource(), null);
					if (compareAction._isEnabled()) {
						e.prevent();

						compareAction.run().done(() => compareAction.dispose());
					} else {
						this.messageService.show(Severity.Info, nls.localize('unableToFileToCompare', "The selected file can not be compared with '{0}'.", paths.basename(globalResourceToCompare.fsPath)));
					}
				}
			});

			// Bring up quick open
			this.quickOpenService.show().then(() => {
				unbind(); // make sure to unbind if quick open is closing
			});

		} else {
			this.messageService.show(Severity.Info, nls.localize('openFileToCompare', "Open a file first to compare it with another file."));
		}

		return TPromise.as(true);
	}
}

// Compare with Resource
export class CompareResourcesAction extends Action {
	private tree: ITree;
	private resource: URI;

	constructor(
		resource: URI,
		tree: ITree,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super('workbench.files.action.compareFiles', CompareResourcesAction.computeLabel());

		this.tree = tree;
		this.resource = resource;
	}

	private static computeLabel(): string {
		if (globalResourceToCompare) {
			return nls.localize('compareWith', "Compare with '{0}'", paths.basename(globalResourceToCompare.fsPath));
		}

		return nls.localize('compareFiles', "Compare Files");
	}

	public getLabel(): string {
		return CompareResourcesAction.computeLabel();
	}

	_isEnabled(): boolean {

		// Need at least a resource to compare
		if (!globalResourceToCompare) {
			return false;
		}

		// Check if file was deleted or moved meanwhile (explorer only)
		if (this.tree) {
			let root: FileStat = this.tree.getInput();
			if (root instanceof FileStat) {
				let exists = root.find(globalResourceToCompare);
				if (!exists) {
					globalResourceToCompare = null;
					return false;
				}
			}
		}

		// Check if target is identical to source
		if (this.resource.toString() === globalResourceToCompare.toString()) {
			return false;
		}

		let mimeA = guessMimeTypes(this.resource.fsPath).join(', ');
		let mimeB = guessMimeTypes(globalResourceToCompare.fsPath).join(', ');

		// Check if target has same mime
		if (mimeA === mimeB) {
			return true;
		}

		// Ensure the mode is equal if this is text (limitation of current diff infrastructure)
		let isBinaryA = isBinaryMime(mimeA);
		let isBinaryB = isBinaryMime(mimeB);

		// Ensure we are not comparing binary with text
		if (isBinaryA !== isBinaryB) {
			return false;
		}

		return true;
	}

	public run(): TPromise<any> {

		// Remove highlight
		if (this.tree) {
			this.tree.clearHighlight();
		}

		let leftInput = this.instantiationService.createInstance(FileEditorInput, globalResourceToCompare, void 0, void 0);
		let rightInput = this.instantiationService.createInstance(FileEditorInput, this.resource, void 0, void 0);

		return this.editorService.openEditor(new DiffEditorInput(toDiffLabel(globalResourceToCompare, this.resource, this.contextService), null, leftInput, rightInput));
	}
}

// Refresh Explorer Viewer
export class RefreshViewExplorerAction extends Action {

	constructor(explorerView: ExplorerView, clazz: string) {
		super('workbench.files.action.refreshExplorer', nls.localize('refresh', "Refresh"), clazz, true, (context: any) => {
			if (explorerView.getViewer().getHighlight()) {
				return TPromise.as(null); // Global action disabled if user is in edit mode from another action
			}

			explorerView.focusBody();

			return explorerView.refresh(true, true, true);
		});
	}
}

export abstract class BaseActionWithErrorReporting extends Action {
	constructor(
		id: string,
		label: string,
		private messageService: IMessageService
	) {
		super(id, label);
	}

	public run(): TPromise<boolean> {
		return this.doRun().then(() => true, (error) => {
			this.messageService.show(Severity.Error, errors.toErrorMessage(error, false));
		});
	}

	protected abstract doRun(): TPromise<boolean>;
}

export abstract class BaseSaveFileAction extends BaseActionWithErrorReporting {
	private resource: URI;

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@ITextFileService private textFileService: ITextFileService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IMessageService messageService: IMessageService
	) {
		super(id, label, messageService);

		this.enabled = true;
	}

	public abstract isSaveAs(): boolean;

	public setResource(resource: URI): void {
		this.resource = resource;
	}

	protected doRun(): TPromise<boolean> {
		let source: URI;
		if (this.resource) {
			source = this.resource;
		} else {
			source = getUntitledOrFileResource(this.editorService.getActiveEditorInput(), true);
		}

		if (source) {

			// Save As (or Save untitled with associated path)
			if (this.isSaveAs() || source.scheme === 'untitled') {
				let positionsOfSource = findSaveAsPositions(this.editorService, source);

				let mimeOfSource: string;
				if (source.scheme === 'untitled') {
					let selectedMime = this.untitledEditorService.get(source).getMime();
					if (!isUnspecific(selectedMime)) {
						mimeOfSource = [selectedMime, MIME_TEXT].join(', ');
					}
				}

				let encodingOfSource: string;
				if (source.scheme === 'untitled') {
					encodingOfSource = this.untitledEditorService.get(source).getEncoding();
				} else if (source.scheme === 'file') {
					let textModel = CACHE.get(source);
					encodingOfSource = textModel && textModel.getEncoding(); // text model can be null e.g. if this is a binary file!
				}

				let selectionOfSource: IEditorSelection;
				if (positionsOfSource.length) {
					const activeEditor = this.editorService.getActiveEditor();
					if (activeEditor && positionsOfSource.indexOf(activeEditor.position) >= 0) {
						selectionOfSource = <IEditorSelection>activeEditor.getSelection();
					}
				}

				// Special case: an untitled file with associated path gets saved directly unless "saveAs" is true
				let savePromise: TPromise<URI>;
				if (!this.isSaveAs() && source.scheme === 'untitled' && this.untitledEditorService.hasAssociatedFilePath(source)) {
					savePromise = this.textFileService.save(source).then((result) => {
						if (result) {
							return URI.file(source.fsPath);
						}

						return null;
					});
				}

				// Otherwise, really "Save As..."
				else {
					savePromise = this.textFileService.saveAs(source);
				}

				return savePromise.then((target) => {
					if (!target) {
						return;
					}

					// Reopen editors for the resource based on the positions
					let reopenPromise = TPromise.as(null);
					if (target.toString() !== source.toString() && positionsOfSource.length) {
						let targetInput = this.instantiationService.createInstance(FileEditorInput, target, mimeOfSource, encodingOfSource);

						let options: TextEditorOptions;
						if (selectionOfSource) {
							options = new TextEditorOptions();
							options.selection(selectionOfSource.startLineNumber, selectionOfSource.startColumn, selectionOfSource.endLineNumber, selectionOfSource.endColumn);
						}

						reopenPromise = this.editorService.openEditor(targetInput, options, positionsOfSource[0]).then(() => {
							if (positionsOfSource.length > 1) {
								return this.editorService.openEditor(targetInput, options, positionsOfSource[1]).then(() => {
									if (positionsOfSource.length > 2) {
										return this.editorService.openEditor(targetInput, options, positionsOfSource[2]);
									}
								});
							}
						});
					}

					return reopenPromise;
				});
			}

			// Just save
			return this.textFileService.save(source);
		}

		return TPromise.as(false);
	}
}

export class SaveFileAction extends BaseSaveFileAction {

	public static ID = 'workbench.action.files.save';
	public static LABEL = nls.localize('save', "Save");

	public isSaveAs(): boolean {
		return false;
	}
}

export class SaveFileAsAction extends BaseSaveFileAction {

	public static ID = 'workbench.action.files.saveAs';
	public static LABEL = 'Save As...';

	public isSaveAs(): boolean {
		return true;
	}
}

export abstract class BaseSaveAllAction extends BaseActionWithErrorReporting {
	private toDispose: IDisposable[];
	private lastIsDirty: boolean;

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@ITextFileService private textFileService: ITextFileService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IEventService private eventService: IEventService,
		@IMessageService messageService: IMessageService
	) {
		super(id, label, messageService);

		this.toDispose = [];
		this.lastIsDirty = this.textFileService.isDirty();
		this.enabled = this.lastIsDirty;

		this.registerListeners();
	}

	protected abstract includeUntitled(): boolean;

	private registerListeners(): void {

		// listen to files being changed locally
		this.toDispose.push(this.eventService.addListener2(Files.EventType.FILE_DIRTY, (e: Files.LocalFileChangeEvent) => this.updateEnablement(true)));
		this.toDispose.push(this.eventService.addListener2(Files.EventType.FILE_SAVED, (e: Files.LocalFileChangeEvent) => this.updateEnablement(false)));
		this.toDispose.push(this.eventService.addListener2(Files.EventType.FILE_REVERTED, (e: Files.LocalFileChangeEvent) => this.updateEnablement(false)));
		this.toDispose.push(this.eventService.addListener2(Files.EventType.FILE_SAVE_ERROR, (e: Files.LocalFileChangeEvent) => this.updateEnablement(true)));

		if (this.includeUntitled()) {
			this.toDispose.push(this.eventService.addListener2(WorkbenchEventType.UNTITLED_FILE_DIRTY, () => this.updateEnablement(true)));
			this.toDispose.push(this.eventService.addListener2(WorkbenchEventType.UNTITLED_FILE_DELETED, () => this.updateEnablement(false)));
		}
	}

	private updateEnablement(isDirty: boolean): void {
		if (this.lastIsDirty !== isDirty) {
			this.enabled = this.textFileService.isDirty();
			this.lastIsDirty = this.enabled;
		}
	}

	protected doRun(): TPromise<boolean> {

		// Store mimes per untitled file to restore later
		const mapUntitledToProperties: { [resource: string]: { mime: string; encoding: string; } } = Object.create(null);
		this.textFileService.getDirty()
			.filter(r => r.scheme === 'untitled')			// All untitled resources^
			.map(r => this.untitledEditorService.get(r))	// Mapped to their inputs
			.filter(i => !!i)								// If possible :)
			.forEach(i => mapUntitledToProperties[i.getResource().toString()] = { mime: i.getMime(), encoding: i.getEncoding() });

		// Save all
		return this.textFileService.saveAll(this.includeUntitled()).then((result) => {

			// all saved - now try to reopen saved untitled ones
			if (this.includeUntitled()) {
				let untitledResults = result.results.filter((res) => res.source.scheme === 'untitled');
				let reopenPromises: { (): TPromise<IEditor> }[] = [];

				// Create a promise function for each editor open call to reopen
				untitledResults.forEach((res) => {
					if (res.success) {
						let positions = findSaveAsPositions(this.editorService, res.source);

						let mimeOfSource: string;
						let selectedMime = mapUntitledToProperties[res.source.toString()] && mapUntitledToProperties[res.source.toString()].mime;
						if (!isUnspecific(selectedMime)) {
							mimeOfSource = [selectedMime, MIME_TEXT].join(', ');
						}

						let encodingOfSource: string = mapUntitledToProperties[res.source.toString()] && mapUntitledToProperties[res.source.toString()].encoding;

						let targetInput = this.instantiationService.createInstance(FileEditorInput, res.target, mimeOfSource, encodingOfSource);

						let options = new EditorOptions();
						options.preserveFocus = true;

						positions.forEach((position) => {
							reopenPromises.push(() => {
								return this.editorService.openEditor(targetInput, options, position);
							});
						});
					}
				});

				// Build a promise that completes when reopen is done
				let reopenPromise = TPromise.as(null);
				if (reopenPromises.length) {
					reopenPromise = reopenPromises[0]().then(() => {
						if (reopenPromises.length > 1) {
							return reopenPromises[1]().then(() => {
								if (reopenPromises.length > 2) {
									return reopenPromises[2]();
								}
							});
						}
					});
				}

				return reopenPromise;
			}
		});
	}

	public dispose(): void {
		this.toDispose = disposeAll(this.toDispose);

		super.dispose();
	}
}

function findSaveAsPositions(editorService: IWorkbenchEditorService, outerResource: URI): Position[] {
	let activeInput = editorService.getActiveEditorInput();

	return editorService.getVisibleEditors().filter((editor) => {
		if (outerResource.scheme === 'file' && activeInput !== editor.input) {
			return false; // skip non active if this is about a file; for untitled respect them all
		}

		let innerResource = getUntitledOrFileResource(editor.input);

		return innerResource && innerResource.toString() === outerResource.toString();
	}).map((editor) => editor.position);
}

export class SaveAllAction extends BaseSaveAllAction {

	public static ID = 'workbench.action.files.saveAll';
	public static LABEL = nls.localize('saveAll', "Save All");

	public get class(): string {
		return 'explorer-action save-all';
	}

	protected includeUntitled(): boolean {
		return true;
	}
}

export class SaveFilesAction extends BaseSaveAllAction {

	public static ID = 'workbench.action.files.saveFiles';
	public static LABEL = nls.localize('saveFiles', "Save Dirty Files");

	protected includeUntitled(): boolean {
		return false;
	}
}

export class RevertFileAction extends Action {

	public static ID = 'workbench.action.files.revert';
	public static LABEL = nls.localize('revert', "Revert File");

	private resource: URI;

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@ITextFileService private textFileService: ITextFileService
	) {
		super(id, label);

		this.enabled = true;
	}

	public setResource(resource: URI): void {
		this.resource = resource;
	}

	public run(): TPromise<any> {
		let resource: URI;
		if (this.resource) {
			resource = this.resource;
		} else {
			let activeFileInput = asFileEditorInput(this.editorService.getActiveEditorInput(), true);
			if (activeFileInput) {
				resource = activeFileInput.getResource();
			}
		}

		if (resource && resource.scheme !== 'untitled') {
			return this.textFileService.revert(resource, true /* force */);
		}

		return TPromise.as(true);
	}
}

export class OpenResourcesAction extends Action {
	private resources: IResourceInput[];
	private diffMode: boolean;

	constructor(
		resources: IResourceInput[],
		diffMode: boolean,
		@IPartService private partService: IPartService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IViewletService private viewletService: IViewletService,
		@ITextFileService private textFileService: ITextFileService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
		super('workbench.files.action.openResourcesAction');

		this.resources = resources;
		this.diffMode = diffMode;
	}

	public run(): TPromise<any> {
		return this.partService.joinCreation().then(() => {
			let viewletPromise = TPromise.as(null);
			if (!this.partService.isSideBarHidden()) {
				viewletPromise = this.viewletService.openViewlet(Files.VIEWLET_ID, false);
			}

			return viewletPromise.then(() => {

				// Out of workspace files get added right away to working files model
				this.resources.forEach((fileToOpen) => {
					let resource = fileToOpen.resource;
					let workspace = this.contextService.getWorkspace();

					if (!workspace || !paths.isEqualOrParent(resource.fsPath, workspace.resource.fsPath)) {
						this.textFileService.getWorkingFilesModel().addEntry(resource);
					}
				});

				// In diffMode we open 2 resources as diff
				if (this.diffMode) {
					return TPromise.join(this.resources.map(f => this.editorService.inputToType(f))).then((inputs: EditorInput[]) => {
						return this.editorService.openEditor(new DiffEditorInput(toDiffLabel(this.resources[0].resource, this.resources[1].resource, this.contextService), null, inputs[0], inputs[1]));
					});
				}

				// For one file, just put it into the current active editor
				if (this.resources.length === 1) {
					return this.editorService.openEditor(this.resources[0]);
				}

				// Otherwise replace all
				return this.editorService.setEditors(this.resources);
			});
		});
	}
}

export abstract class BaseCloseWorkingFileAction extends Action {
	protected model: WorkingFilesModel;
	private elements: URI[];

	constructor(
		id: string,
		label: string,
		clazz: string,
		model: WorkingFilesModel,
		elements: WorkingFileEntry[],
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@IWorkbenchEditorService protected editorService: IWorkbenchEditorService,
		@ITextFileService private textFileService: ITextFileService,
		@IMessageService private messageService: IMessageService,
		@IQuickOpenService private quickOpenService: IQuickOpenService
	) {
		super(id, label, clazz);

		this.model = model;
		this.elements = elements ? elements.map(e => e.resource) : void 0 /* all */;
	}

	public run(): TPromise<any> {
		let workingFilesCount = this.model.getEntries().length;

		// Handle dirty
		let isDirty: boolean;
		if (this.elements) {
			isDirty = this.elements.some(e => this.textFileService.isDirty(e));
		} else {
			isDirty = this.textFileService.isDirty();
		}

		let saveOrRevertPromise: TPromise<Files.ITextFileOperationResult> = TPromise.as(null);
		if (isDirty) {
			let confirmResult = this.textFileService.confirmSave(this.elements);

			switch (confirmResult) {
				case Files.ConfirmResult.SAVE:
					if (this.elements) {
						saveOrRevertPromise = this.textFileService.saveAll(this.elements);
					} else {
						saveOrRevertPromise = this.textFileService.saveAll(true /* include untitled */);
					}

					break;
				case Files.ConfirmResult.DONT_SAVE:
					if (this.elements) {
						saveOrRevertPromise = this.textFileService.revertAll(this.elements);
					} else {
						saveOrRevertPromise = this.textFileService.revertAll();
					}

					break;
				case Files.ConfirmResult.CANCEL:
					return TPromise.as(null);
			}
		}

		return saveOrRevertPromise.then((result?: Files.ITextFileOperationResult) => {

			// Collect resources to dispose
			let resourcesToDispose: URI[] = [];
			if (this.elements) {
				resourcesToDispose = this.elements;
			} else {
				resourcesToDispose = this.model.getEntries().map((e) => e.resource);
			}

			// Remove those that failed from the save/revert if we had it
			if (result) {
				let failed = result.results.filter((r) => !r.success).map((r) => r.source.toString());
				resourcesToDispose = resourcesToDispose.filter((r) => failed.indexOf(r.toString()) < 0);
			}

			// remove from model
			if (resourcesToDispose.length === workingFilesCount) {
				this.model.clear();
			} else {
				resourcesToDispose.forEach((r) => this.model.removeEntry(r));
			}

			// dispose
			resourcesToDispose.forEach((r) => this.disposeResource(r));
		}, (error) => {
			this.messageService.show(Severity.Error, error);
		});
	}

	private disposeResource(resource: URI): void {

		// file inputs
		fileEditorInputsForResource(resource, this.editorService, this.quickOpenService).forEach((input) => {
			if (!input.isDisposed()) {
				input.dispose(true);
			}
		});

		// untitled inputs
		let input = this.untitledEditorService.get(resource);
		if (input) {
			input.dispose();
		}
	}
}

export class CloseAllWorkingFilesAction extends BaseCloseWorkingFileAction {

	public static ID = 'workbench.files.action.closeAllWorkingFiles';

	private listenerToDispose: IDisposable;

	constructor(
		model: WorkingFilesModel,
		@IUntitledEditorService untitledEditorService: IUntitledEditorService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@ITextFileService textFileService: ITextFileService,
		@IMessageService messageService: IMessageService,
		@IQuickOpenService quickOpenService: IQuickOpenService
	) {
		super(CloseAllWorkingFilesAction.ID, nls.localize('closeAllLabel', "Close All Files"), 'action-close-all-files', model, null, untitledEditorService, editorService, textFileService, messageService, quickOpenService);

		this.enabled = (model.count() > 0);
		this.listenerToDispose = model.onModelChange(this.onModelChange, this);
	}

	public run(): TPromise<boolean> {
		return super.run().then(() => closeNonFileEditors(this.editorService)); // close non file editors too
	}

	private onModelChange(event: Files.IWorkingFileModelChangeEvent): void {
		this.enabled = (this.model.count() > 0);
	}

	public dispose(): void {
		if (this.listenerToDispose) {
			this.listenerToDispose.dispose();
			this.listenerToDispose = null;
		}

		super.dispose();
	}
}

export class CloseOneWorkingFileAction extends BaseCloseWorkingFileAction {

	public static ID = 'workbench.files.action.closeOneWorkingFile';

	constructor(
		model: WorkingFilesModel,
		element: WorkingFileEntry,
		@IUntitledEditorService untitledEditorService: IUntitledEditorService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@ITextFileService textFileService: ITextFileService,
		@IMessageService messageService: IMessageService,
		@IQuickOpenService quickOpenService: IQuickOpenService
	) {
		super(CloseOneWorkingFileAction.ID, nls.localize('closeLabel', "Close File"), element.dirty ? 'action-close-dirty-file' : 'action-close-file', model, [element], untitledEditorService, editorService, textFileService, messageService, quickOpenService);
	}
}

export class CloseOtherWorkingFilesAction extends BaseCloseWorkingFileAction {

	public static ID = 'workbench.files.action.closeOtherWorkingFiles';

	constructor(
		model: WorkingFilesModel,
		element: WorkingFileEntry,
		@IUntitledEditorService untitledEditorService: IUntitledEditorService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@ITextFileService textFileService: ITextFileService,
		@IMessageService messageService: IMessageService,
		@IQuickOpenService quickOpenService: IQuickOpenService
	) {
		super(CloseOtherWorkingFilesAction.ID, nls.localize('closeOtherLabel', "Close Other Files"), 'action-close-file', model, model.getEntries().filter(e => e !== element), untitledEditorService, editorService, textFileService, messageService, quickOpenService);
	}

	public run(): TPromise<boolean> {
		return super.run().then(() => closeNonFileEditors(this.editorService)); // close non file editors too
	}
}

function disposeNonDirtyFileInputs(editorService: IWorkbenchEditorService, quickopenService: IQuickOpenService, textFileService: ITextFileService, exclude?: URI): void {
	let activeFileInputs = editorService.getVisibleEditors().map(e => asFileEditorInput(e.input, true)).filter(i => i instanceof FileEditorInput);
	activeFileInputs.forEach((f: FileEditorInput) => {
		if (exclude && exclude.toString() === f.getResource().toString()) {
			return; // excluded
		}

		if (textFileService.isDirty(f.getResource())) {
			return; // do not touch dirty
		}

		fileEditorInputsForResource(f.getResource(), editorService, quickopenService).forEach(i => {
			if (!i.isDisposed()) {
				i.dispose(true);
			}
		});
	});
}

function closeNonFileEditors(editorService: IWorkbenchEditorService): TPromise<boolean> {
	let nonFileEditors = editorService.getVisibleEditors().filter(e => !getUntitledOrFileResource(e.input, true));

	return TPromise.join(nonFileEditors.map(e => editorService.closeEditor(e))).then(() => true, errors.onUnexpectedError);
}

function fileEditorInputsForResource(resource: URI, editorService: IWorkbenchEditorService, quickopenService: IQuickOpenService): FileEditorInput[] {

	// Get cached ones
	let inputs: FileEditorInput[] = FileEditorInput.getAll(resource);

	// Add those from history as well
	let history = quickopenService.getEditorHistory();
	for (let i = 0; i < history.length; i++) {
		let element = history[i];
		if (element instanceof FileEditorInput && (<FileEditorInput>element).getResource().toString() === resource.toString()) {
			inputs.push(<FileEditorInput>element);
		}
	}

	// Add those from visible editors too
	let editors = editorService.getVisibleEditors();
	editors.forEach((editor) => {
		let input = editor.input;
		if (input instanceof FileEditorInput && (<FileEditorInput>input).getResource().toString() === resource.toString()) {
			inputs.push(<FileEditorInput>input);
		}
	});

	return inputs;
}

export class CloseFileAction extends Action {

	public static ID = 'workbench.files.action.closeFile';
	public static LABEL = nls.localize('closeFile', "Close File");

	constructor(
		id: string,
		label: string,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@ITextFileService private textFileService: ITextFileService,
		@IMessageService private messageService: IMessageService,
		@IQuickOpenService private quickOpenService: IQuickOpenService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		let editor = this.editorService.getActiveEditor();
		let input = this.editorService.getActiveEditorInput();
		let resource = getUntitledOrFileResource(input, true);

		// For a file or untitled
		if (resource) {
			let model = this.textFileService.getWorkingFilesModel();
			let entry = model.findEntry(resource);

			// Use action to close a working file that will take care of everthing
			if (entry) {
				let closeAction = this.instantiationService.createInstance(CloseOneWorkingFileAction, model, entry);
				closeAction.run().done(() => closeAction.dispose(), errors.onUnexpectedError);
			}

			// Otherwise just dispose
			else {
				if (input instanceof DiffEditorInput) {
					input = (<DiffEditorInput>input).getModifiedInput();
				}

				// File Input
				if (input instanceof FileEditorInput) {
					fileEditorInputsForResource(input.getResource(), this.editorService, this.quickOpenService).forEach((input) => {
						if (!input.isDisposed()) {
							input.dispose(true);
						}
					});
				}

				// Untitled Input
				else {
					input.dispose();
				}
			}
		}

		// Any other editor just closes
		else if (editor) {
			this.editorService.closeEditor(editor).done(null, errors.onUnexpectedError);;
		}

		// Otherwise tell the user
		else {
			this.messageService.show(Severity.Info, nls.localize('noFileOpen', "There is currently no file opened to close."));
		}

		return TPromise.as(true);
	}
}

export class CloseOtherFilesAction extends Action {

	public static ID = 'workbench.files.action.closeOtherFiles';
	public static LABEL = nls.localize('closeOtherFiles', "Close Other Files");

	constructor(
		id: string,
		label: string,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@ITextFileService private textFileService: ITextFileService,
		@IMessageService private messageService: IMessageService,
		@IQuickOpenService private quickOpenService: IQuickOpenService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const workingFilesModel = this.textFileService.getWorkingFilesModel();

		let activeResource = getUntitledOrFileResource(this.editorService.getActiveEditorInput(), true);
		let actionToRun: IAction;

		// Close all but active resource
		if (activeResource && workingFilesModel.hasEntry(activeResource)) {
			actionToRun = this.instantiationService.createInstance(CloseOtherWorkingFilesAction, workingFilesModel, workingFilesModel.findEntry(activeResource));
		}

		// Without active resource: Close all
		else {
			actionToRun = this.instantiationService.createInstance(CloseAllWorkingFilesAction, workingFilesModel);
		}

		return actionToRun.run().then(() => {
			actionToRun.dispose();

			// Dispose remaining non dirty ones except for active one
			disposeNonDirtyFileInputs(this.editorService, this.quickOpenService, this.textFileService, activeResource);
		});
	}
}

export class CloseAllFilesAction extends Action {

	public static ID = 'workbench.files.action.closeAllFiles';
	public static LABEL = nls.localize('closeAllFiles', "Close All Files");

	constructor(
		id: string,
		label: string,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@ITextFileService private textFileService: ITextFileService,
		@IMessageService private messageService: IMessageService,
		@IQuickOpenService private quickOpenService: IQuickOpenService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {

		// Close all Working Files
		let closeAction = this.instantiationService.createInstance(CloseAllWorkingFilesAction, this.textFileService.getWorkingFilesModel());
		return closeAction.run().then(() => {
			closeAction.dispose();

			// Dispose remaining non dirty ones
			disposeNonDirtyFileInputs(this.editorService, this.quickOpenService, this.textFileService);
		});
	}
}

export class OpenNextWorkingFile extends Action {

	public static ID = 'workbench.files.action.openNextWorkingFile';
	public static LABEL = nls.localize('openNextWorkingFile', "Open Next Working File");

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@ITextFileService private textFileService: ITextFileService,
		@IMessageService private messageService: IMessageService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		let model = this.textFileService.getWorkingFilesModel();

		// Return: No working files
		if (model.count() === 0) {
			this.messageService.show(Severity.Info, nls.localize('noWorkingFiles', "Currently there are no working files."));
		}

		// If entry found, open next one
		else {
			let resource = getUntitledOrFileResource(this.editorService.getActiveEditorInput(), true);
			return this.editorService.openEditor({ resource: model.next(resource).resource });
		}

		return TPromise.as(true);
	}
}

export class OpenPreviousWorkingFile extends Action {

	public static ID = 'workbench.files.action.openPreviousWorkingFile';
	public static LABEL = nls.localize('openPreviousWorkingFile', "Open Previous Working File");

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@ITextFileService private textFileService: ITextFileService,
		@IMessageService private messageService: IMessageService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		let model = this.textFileService.getWorkingFilesModel();

		// Return: No working files
		if (model.count() === 0) {
			this.messageService.show(Severity.Info, nls.localize('noWorkingFiles', "Currently there are no working files."));
		}

		// If entry found, open previous one
		else {
			let resource = getUntitledOrFileResource(this.editorService.getActiveEditorInput(), true);
			return this.editorService.openEditor({ resource: model.previous(resource).resource });
		}

		return TPromise.as(true);
	}
}

export class AddToWorkingFiles extends Action {

	public static ID = 'workbench.files.action.addToWorkingFiles';
	public static LABEL = nls.localize('addToWorkingFiles', "Add Active File to Working Files");

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@ITextFileService private textFileService: ITextFileService,
		@IMessageService private messageService: IMessageService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		let fileInput = asFileEditorInput(this.editorService.getActiveEditorInput(), true);
		if (fileInput) {
			this.textFileService.getWorkingFilesModel().addEntry(fileInput.getResource());
		} else {
			this.messageService.show(Severity.Info, nls.localize('openFileToAdd', "Open a file first to add it to working files"));
		}

		return TPromise.as(true);
	}
}

export class FocusWorkingFiles extends Action {

	public static ID = 'workbench.files.action.focusWorkingFiles';
	public static LABEL = nls.localize('focusWorkingFiles', "Focus on Working Files");

	constructor(
		id: string,
		label: string,
		@IViewletService private viewletService: IViewletService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		return this.viewletService.openViewlet(Files.VIEWLET_ID, true).then((viewlet: ExplorerViewlet) => {
			viewlet.getWorkingFilesView().expand();
			viewlet.getWorkingFilesView().getViewer().DOMFocus();
		});
	}
}

export class FocusFilesExplorer extends Action {

	public static ID = 'workbench.files.action.focusFilesExplorer';
	public static LABEL = nls.localize('focusFilesExplorer', "Focus on Files Explorer");

	constructor(
		id: string,
		label: string,
		@IViewletService private viewletService: IViewletService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		return this.viewletService.openViewlet(Files.VIEWLET_ID, true).then((viewlet: ExplorerViewlet) => {
			const view = viewlet.getExplorerView();
			if (view) {
				view.expand();
				view.getViewer().DOMFocus();
			}
		});
	}
}

export function keybindingForAction(id: string): Keybinding {
	switch (id) {
		case GlobalNewFileAction.ID:
			return new Keybinding(KeyMod.CtrlCmd | KeyCode.KEY_N);
		case TriggerRenameFileAction.ID:
			return new Keybinding(isMacintosh ? KeyCode.Enter : KeyCode.F2);
		case SaveFileAction.ID:
			return new Keybinding(KeyMod.CtrlCmd | KeyCode.KEY_S);
		case DeleteFileAction.ID:
		case MoveFileToTrashAction.ID:
			return new Keybinding(KeyCode.Delete);
		case CopyFileAction.ID:
			return new Keybinding(KeyMod.CtrlCmd | KeyCode.KEY_C);
		case PasteFileAction.ID:
			return new Keybinding(KeyMod.CtrlCmd | KeyCode.KEY_V);
		case OpenToSideAction.ID:
			if (isMacintosh) {
				return new Keybinding(KeyMod.WinCtrl | KeyCode.Enter);
			} else {
				return new Keybinding(KeyMod.CtrlCmd | KeyCode.Enter);
			}
	}

	return null;
}

export function validateFileName(parent: IFileStat, name: string, allowOverwriting: boolean = false): string {

	// Produce a well formed file name
	name = getWellFormedFileName(name);

	// Name not provided
	if (!name || name.length === 0 || /^\s+$/.test(name)) {
		return nls.localize('emptyFileNameError', "A file or folder name must be provided.");
	}

	// Do not allow to overwrite existing file
	if (!allowOverwriting) {
		if (parent.children && parent.children.some((c) => {
			if (isLinux) {
				return c.name === name;
			}

			return c.name.toLowerCase() === name.toLowerCase();
		})) {
			return nls.localize('fileNameExistsError', "A file or folder **{0}** already exists at this location. Please choose a different name.", name);
		}
	}

	// Invalid File name
	if (!paths.isValidBasename(name)) {
		return nls.localize('invalidFileNameError', "The name **{0}** is not valid as a file or folder name. Please choose a different name.", name);
	}

	// Max length restriction (on Windows)
	if (isWindows) {
		let fullPathLength = name.length + parent.resource.fsPath.length + 1 /* path segment */;
		if (fullPathLength > 255) {
			return nls.localize('filePathTooLongError', "The name **{0}** results in a path that is too long. Please choose a shorter name.", name);
		}
	}

	return null;
}

export function getWellFormedFileName(filename: string): string {
	if (!filename) {
		return filename;
	}

	// Trim whitespaces
	filename = strings.trim(strings.trim(filename, ' '), '\t');

	// Remove trailing dots
	filename = strings.rtrim(filename, '.');

	return filename;
}

// Diagnostics support
let diag: (...args: any[]) => void;
if (!diag) {
	diag = diagnostics.register('FileActionsDiagnostics', function(...args: any[]) {
		console.log(args[1] + ' - ' + args[0] + ' (time: ' + args[2].getTime() + ' [' + args[2].toUTCString() + '])');
	});
}