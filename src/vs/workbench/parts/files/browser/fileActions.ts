/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/fileactions';
import { TPromise } from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import { isWindows, isLinux, isMacintosh } from 'vs/base/common/platform';
import { sequence, ITask } from 'vs/base/common/async';
import paths = require('vs/base/common/paths');
import URI from 'vs/base/common/uri';
import errors = require('vs/base/common/errors');
import { toErrorMessage } from 'vs/base/common/errorMessage';
import strings = require('vs/base/common/strings');
import { Event, EventType as CommonEventType } from 'vs/base/common/events';
import severity from 'vs/base/common/severity';
import diagnostics = require('vs/base/common/diagnostics');
import { BaseTextEditor } from 'vs/workbench/browser/parts/editor/textEditor';
import { Action, IAction } from 'vs/base/common/actions';
import { MessageType, IInputValidator } from 'vs/base/browser/ui/inputbox/inputBox';
import { ITree, IHighlightEvent } from 'vs/base/parts/tree/browser/tree';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { VIEWLET_ID } from 'vs/workbench/parts/files/common/files';
import labels = require('vs/base/common/labels');
import { LocalFileChangeEvent, ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IFileService, IFileStat, IImportResult } from 'vs/platform/files/common/files';
import { DiffEditorInput, toDiffLabel } from 'vs/workbench/common/editor/diffEditorInput';
import { asFileEditorInput, getUntitledOrFileResource, IEditorIdentifier, EditorInput } from 'vs/workbench/common/editor';
import { FileEditorInput } from 'vs/workbench/parts/files/common/editors/fileEditorInput';
import { FileStat, NewStatPlaceholder } from 'vs/workbench/parts/files/common/explorerViewModel';
import { ExplorerView } from 'vs/workbench/parts/files/browser/views/explorerView';
import { ExplorerViewlet } from 'vs/workbench/parts/files/browser/explorerViewlet';
import { IActionProvider } from 'vs/base/parts/tree/browser/actionsRenderer';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { CollapseAction } from 'vs/workbench/browser/viewlet';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IQuickOpenService, IFilePickOpenEntry } from 'vs/workbench/services/quickopen/common/quickOpenService';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { Position, IResourceInput, IEditorInput } from 'vs/platform/editor/common/editor';
import { IEventService } from 'vs/platform/event/common/event';
import { IInstantiationService, IConstructorSignature2 } from 'vs/platform/instantiation/common/instantiation';
import { IMessageService, IMessageWithAction, IConfirmation, Severity, CancelAction } from 'vs/platform/message/common/message';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { Keybinding } from 'vs/base/common/keybinding';
import { Selection } from 'vs/editor/common/core/selection';

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
		this.enabled = !!(this._contextService && this._fileService && this._editorService && this._isEnabled());
	}

	protected onError(error: any): void {
		this._messageService.show(Severity.Error, error);
	}

	protected onWarning(warning: any): void {
		this._messageService.show(Severity.Warning, warning);
	}

	protected onErrorWithRetry(error: any, retry: () => TPromise<any>, extraAction?: Action): void {
		const actions = [
			new Action(this.id, nls.localize('retry', "Retry"), null, true, () => retry()),
			CancelAction
		];

		if (extraAction) {
			actions.unshift(extraAction);
		}

		const errorWithRetry: IMessageWithAction = {
			actions,
			message: toErrorMessage(error, false)
		};

		this._messageService.show(Severity.Error, errorWithRetry);
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

		const viewletState = <IFileViewletState>context.viewletState;
		if (!viewletState) {
			return TPromise.wrapError('Invalid viewlet state provided to BaseEnableFileRenameAction.');
		}

		const stat = <IFileStat>context.stat;
		if (!stat) {
			return TPromise.wrapError('Invalid stat provided to BaseEnableFileRenameAction.');
		}

		viewletState.setEditable(stat, {
			action: this.renameAction,
			validator: (value) => {
				const message = this.validateFileName(this.element.parent, value);

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

			const unbind = this.tree.addListener2(CommonEventType.HIGHLIGHT, (e: IHighlightEvent) => {
				if (!e.highlight) {
					viewletState.clearEditable(stat);
					this.tree.refresh(stat).done(null, errors.onUnexpectedError);
					unbind.dispose();
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
		const existingName = getWellFormedFileName(this.element.name);

		// Return early if name is invalid or didn't change
		if (name === existingName || this.validateFileName(this.element.parent, name)) {
			return TPromise.as(null);
		}

		// Call function and Emit Event through viewer
		const promise = this.runAction(name).then((stat: IFileStat) => {
			if (stat) {
				this.onSuccess(stat);
			}
		}, (error: any) => {
			this.onError(error);
		});

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

		this.eventService.emit('files.internal:fileChanged', new LocalFileChangeEvent(before, stat));
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
		@IEventService eventService: IEventService
	) {
		super(RenameFileAction.ID, nls.localize('rename', "Rename"), element, contextService, editorService, fileService, messageService, textFileService, eventService);

		this._updateEnablement();
	}

	public runAction(newName: string): TPromise<any> {

		// Handle dirty
		let revertPromise: TPromise<any> = TPromise.as(null);
		const dirty = this.textFileService.getDirty().filter(d => paths.isEqualOrParent(d.fsPath, this.element.resource.fsPath));
		if (dirty.length) {
			let message: string;
			if (this.element.isDirectory) {
				if (dirty.length === 1) {
					message = nls.localize('dirtyMessageFolderOne', "You are renaming a folder with unsaved changes in 1 file. Do you want to continue?");
				} else {
					message = nls.localize('dirtyMessageFolder', "You are renaming a folder with unsaved changes in {0} files. Do you want to continue?", dirty.length);
				}
			} else {
				message = nls.localize('dirtyMessageFile', "You are renaming a file with unsaved changes. Do you want to continue?");
			}

			const res = this.messageService.confirm({
				message,
				type: 'warning',
				detail: nls.localize('dirtyWarning', "Your changes will be lost if you don't save them."),
				primaryButton: nls.localize({ key: 'renameLabel', comment: ['&& denotes a mnemonic'] }, "&&Rename")
			});

			if (!res) {
				return TPromise.as(null);
			}

			revertPromise = this.textFileService.revertAll(dirty);
		}

		return revertPromise.then(() => {
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

		const viewletState = <IFileViewletState>context.viewletState;
		if (!viewletState) {
			return TPromise.wrapError('Invalid viewlet state provided to BaseNewAction.');
		}

		let folder: FileStat = this.presetFolder;
		if (!folder) {
			const focus = <FileStat>this.tree.getFocus();
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
				const stat = NewStatPlaceholder.addNewStatPlaceholder(folder, !this.isFile);

				this.renameAction.element = stat;

				viewletState.setEditable(stat, {
					action: this.renameAction,
					validator: (value) => {
						const message = this.renameAction.validateFileName(folder, value);

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

							const unbind = this.tree.addListener2(CommonEventType.HIGHLIGHT, (e: IHighlightEvent) => {
								if (!e.highlight) {
									stat.destroy();
									this.tree.refresh(folder).done(null, errors.onUnexpectedError);
									unbind.dispose();
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
		@IInstantiationService private instantiationService: IInstantiationService,
		@IMessageService private messageService: IMessageService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		return this.viewletService.openViewlet(VIEWLET_ID, true).then((viewlet) => {
			return TPromise.timeout(100).then(() => { // use a timeout to prevent the explorer from revealing the active file
				viewlet.focus();

				const explorer = <ExplorerViewlet>viewlet;
				const explorerView = explorer.getExplorerView();

				// Not having a folder opened
				if (!explorerView) {
					return this.messageService.show(Severity.Info, nls.localize('openFolderFirst', "Open a folder first to create files or folders within."));
				}

				if (!explorerView.isExpanded()) {
					explorerView.expand();
				}

				const action = this.toDispose = this.instantiationService.createInstance(this.getAction(), explorerView.getViewer(), null);

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
export class GlobalNewUntitledFileAction extends Action {
	public static ID = 'workbench.action.files.newUntitledFile';
	public static LABEL = nls.localize('newUntitledFile', "New Untitled File");

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const input = this.untitledEditorService.createOrGet();

		return this.editorService.openEditor(input, { pinned: true }); // untitled are always pinned
	}
}

/* Create new file from anywhere */
export class GlobalNewFileAction extends BaseGlobalNewAction {
	public static ID = 'workbench.action.files.newFile';
	public static LABEL = nls.localize('newFile', "New File");

	protected getAction(): IConstructorSignature2<ITree, IFileStat, Action> {
		return NewFileAction;
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
		@IEventService eventService: IEventService
	) {
		super(CreateFileAction.ID, CreateFileAction.LABEL, element, contextService, editorService, fileService, messageService, textFileService, eventService);

		this._updateEnablement();
	}

	public runAction(fileName: string): TPromise<any> {
		return this.fileService.createFile(URI.file(paths.join(this.element.parent.resource.fsPath, fileName))).then(null, (error) => {
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
		@IEventService eventService: IEventService
	) {
		super(CreateFolderAction.ID, CreateFolderAction.LABEL, null, contextService, editorService, fileService, messageService, textFileService, eventService);

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

	public run(context?: any): TPromise<any> {

		// Remove highlight
		if (this.tree) {
			this.tree.clearHighlight();
		}

		// Read context
		if (context && context.event) {
			const bypassTrash = (isMacintosh && context.event.altKey) || (!isMacintosh && context.event.shiftKey);
			if (bypassTrash) {
				this.useTrash = false;
			}
		}

		let primaryButton: string;
		if (this.useTrash) {
			primaryButton = isWindows ? nls.localize('deleteButtonLabelRecycleBin', "&&Move to Recycle Bin") : nls.localize({ key: 'deleteButtonLabelTrash', comment: ['&& denotes a mnemonic'] }, "&&Move to Trash");
		} else {
			primaryButton = nls.localize({ key: 'deleteButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Delete");
		}

		// Handle dirty
		let revertPromise: TPromise<any> = TPromise.as(null);
		const dirty = this.textFileService.getDirty().filter(d => paths.isEqualOrParent(d.fsPath, this.element.resource.fsPath));
		if (dirty.length) {
			let message: string;
			if (this.element.isDirectory) {
				if (dirty.length === 1) {
					message = nls.localize('dirtyMessageFolderOneDelete', "You are deleting a folder with unsaved changes in 1 file. Do you want to continue?");
				} else {
					message = nls.localize('dirtyMessageFolderDelete', "You are deleting a folder with unsaved changes in {0} files. Do you want to continue?", dirty.length);
				}
			} else {
				message = nls.localize('dirtyMessageFileDelete', "You are deleting a file with unsaved changes. Do you want to continue?");
			}

			const res = this.messageService.confirm({
				message,
				type: 'warning',
				detail: nls.localize('dirtyWarning', "Your changes will be lost if you don't save them."),
				primaryButton
			});

			if (!res) {
				return TPromise.as(null);
			}

			this.skipConfirm = true; // since we already asked for confirmation
			revertPromise = this.textFileService.revertAll(dirty);
		}

		// Check if file is dirty in editor and save it to avoid data loss
		return revertPromise.then(() => {

			// Ask for Confirm
			if (!this.skipConfirm) {
				let confirm: IConfirmation;
				if (this.useTrash) {
					confirm = {
						message: this.element.isDirectory ? nls.localize('confirmMoveTrashMessageFolder', "Are you sure you want to delete '{0}' and its contents?", this.element.name) : nls.localize('confirmMoveTrashMessageFile', "Are you sure you want to delete '{0}'?", this.element.name),
						detail: isWindows ? nls.localize('undoBin', "You can restore from the recycle bin.") : nls.localize('undoTrash', "You can restore from the trash."),
						primaryButton
					};
				} else {
					confirm = {
						message: this.element.isDirectory ? nls.localize('confirmDeleteMessageFolder', "Are you sure you want to permanently delete '{0}' and its contents?", this.element.name) : nls.localize('confirmDeleteMessageFile', "Are you sure you want to permanently delete '{0}'?", this.element.name),
						detail: nls.localize('irreversible', "This action is irreversible!"),
						primaryButton
					};
				}

				if (!this.messageService.confirm(confirm)) {
					return TPromise.as(null);
				}
			}

			// Since a delete operation can take a while we want to emit the event proactively to avoid issues
			// with stale entries in the explorer tree.
			this.eventService.emit('files.internal:fileChanged', new LocalFileChangeEvent(this.element.clone(), null));

			// Call function
			const servicePromise = this.fileService.del(this.element.resource, this.useTrash).then(() => {
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
				const event = new LocalFileChangeEvent(new FileStat(this.contextService.getWorkspace().resource, true, true), new FileStat(this.contextService.getWorkspace().resource, true, true));
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
		@IEventService eventService: IEventService
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
		const importPromise = TPromise.as(null).then(() => {
			const input = context.input;
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
				const filesArray: File[] = [];
				for (let i = 0; i < input.files.length; i++) {
					const file = input.files[i];
					filesArray.push(file);
				}

				// Resolve target to check for name collisions and ask user
				return this.fileService.resolveFile(targetElement.resource).then((targetStat: IFileStat) => {

					// Check for name collisions
					const targetNames: { [name: string]: IFileStat } = {};
					targetStat.children.forEach((child) => {
						targetNames[isLinux ? child.name : child.name.toLowerCase()] = child;
					});

					let overwrite = true;
					if (filesArray.some((file) => {
						return !!targetNames[isLinux ? file.name : file.name.toLowerCase()];
					})) {
						const confirm: IConfirmation = {
							message: nls.localize('confirmOverwrite', "A file or folder with the same name already exists in the destination folder. Do you want to replace it?"),
							detail: nls.localize('irreversible', "This action is irreversible!"),
							primaryButton: nls.localize({ key: 'replaceButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Replace")
						};

						overwrite = this.messageService.confirm(confirm);
					}

					if (!overwrite) {
						return;
					}

					// Run import in sequence
					const importPromisesFactory: ITask<TPromise<void>>[] = [];
					filesArray.forEach((file) => {
						importPromisesFactory.push(() => {
							const sourceFile = URI.file((<any>file).path);

							return this.fileService.importFile(sourceFile, targetElement.resource).then((result: IImportResult) => {
								if (result.stat) {

									// Emit Deleted Event if file gets replaced unless it is the same file
									const oldFile = targetNames[isLinux ? file.name : file.name.toLowerCase()];
									if (oldFile && oldFile.resource.fsPath !== result.stat.resource.fsPath) {
										this.eventService.emit('files.internal:fileChanged', new LocalFileChangeEvent(oldFile, null));
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

		return importPromise.then(() => {
			this.tree.clearHighlight();
		}, (error: any) => {
			this.onError(error);
			this.tree.clearHighlight();
		});
	}
}

/** File import event is emitted when a file is import into the workbench. */
export class FileImportedEvent extends LocalFileChangeEvent {
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
		const root: FileStat = this.tree.getInput();
		const exists = root.find(fileToCopy.resource);
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
		const pasteAction = this.instantiationService.createInstance(DuplicateFileAction, this.tree, fileToCopy, target);

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
		@IEventService eventService: IEventService
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
		const result = this.fileService.copyFile(this.element.resource, this.findTarget()).then((stat: IFileStat) => {
			this.eventService.emit('files.internal:fileChanged', new LocalFileChangeEvent(null, stat));
		}, (error: any) => {
			this.onError(error);
		});

		return result;
	}

	public onError(error: any): void {
		this.messageService.show(Severity.Error, error);
	}

	private findTarget(): URI {
		const root: FileStat = this.tree.getInput();
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
		const lastIndexOfDot = name.lastIndexOf('.');
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
		const activeEditor = this.editorService.getActiveEditor();
		this.enabled = (!activeEditor || activeEditor.position !== Position.THREE);
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
		@IHistoryService private historyService: IHistoryService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IMessageService private messageService: IMessageService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const fileInput = asFileEditorInput(this.editorService.getActiveEditorInput());
		if (fileInput) {

			// Keep as resource to compare
			globalResourceToCompare = fileInput.getResource();

			// Pick another entry from history
			interface IHistoryPickEntry extends IFilePickOpenEntry {
				input: IEditorInput | IResourceInput;
			}

			const history = this.historyService.getHistory();
			const picks: IHistoryPickEntry[] = history.map(input => {
				let resource: URI;
				let label: string;
				let description: string;

				if (input instanceof EditorInput) {
					return void 0; // only files supported
				}

				const resourceInput = input as IResourceInput;
				resource = resourceInput.resource;
				label = paths.basename(resourceInput.resource.fsPath);
				description = labels.getPathLabel(paths.dirname(resource.fsPath), this.contextService);

				return <IHistoryPickEntry>{ input, resource, label, description };
			}).filter(p => !!p);

			return this.quickOpenService.pick(picks, { placeHolder: nls.localize('pickHistory', "Select an editor history entry to compare with"), autoFocus: { autoFocusFirstEntry: true }, matchOnDescription: true }).then(pick => {
				if (pick) {
					const compareAction = this.instantiationService.createInstance(CompareResourcesAction, pick.resource, null);
					if (compareAction._isEnabled()) {
						compareAction.run().done(() => compareAction.dispose());
					} else {
						this.messageService.show(Severity.Info, nls.localize('unableToFileToCompare', "The selected file can not be compared with '{0}'.", paths.basename(globalResourceToCompare.fsPath)));
					}
				}
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
			const root: FileStat = this.tree.getInput();
			if (root instanceof FileStat) {
				const exists = root.find(globalResourceToCompare);
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

		return true;
	}

	public run(): TPromise<any> {

		// Remove highlight
		if (this.tree) {
			this.tree.clearHighlight();
		}

		const leftInput = this.instantiationService.createInstance(FileEditorInput, globalResourceToCompare, void 0);
		const rightInput = this.instantiationService.createInstance(FileEditorInput, this.resource, void 0);

		return this.editorService.openEditor(new DiffEditorInput(toDiffLabel(globalResourceToCompare, this.resource, this.contextService), null, leftInput, rightInput));
	}
}

// Refresh Explorer Viewer
export class RefreshViewExplorerAction extends Action {

	constructor(explorerView: ExplorerView, clazz: string) {
		super('workbench.files.action.refreshFilesExplorer', nls.localize('refresh', "Refresh"), clazz, true, (context: any) => explorerView.refresh());
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

	public run(context?: any): TPromise<boolean> {
		return this.doRun(context).then(() => true, (error) => {
			this.messageService.show(Severity.Error, toErrorMessage(error, false));
		});
	}

	protected abstract doRun(context?: any): TPromise<boolean>;
}

export abstract class BaseSaveFileAction extends BaseActionWithErrorReporting {
	private resource: URI;

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@ITextFileService private textFileService: ITextFileService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@IMessageService messageService: IMessageService
	) {
		super(id, label, messageService);

		this.enabled = true;
	}

	public abstract isSaveAs(): boolean;

	public setResource(resource: URI): void {
		this.resource = resource;
	}

	protected doRun(context: any): TPromise<boolean> {
		let source: URI;
		if (this.resource) {
			source = this.resource;
		} else {
			source = getUntitledOrFileResource(this.editorService.getActiveEditorInput(), true);
		}

		if (source) {

			// Save As (or Save untitled with associated path)
			if (this.isSaveAs() || source.scheme === 'untitled') {
				let encodingOfSource: string;
				if (source.scheme === 'untitled') {
					encodingOfSource = this.untitledEditorService.get(source).getEncoding();
				} else if (source.scheme === 'file') {
					const textModel = this.textFileService.models.get(source);
					encodingOfSource = textModel && textModel.getEncoding(); // text model can be null e.g. if this is a binary file!
				}

				let selectionOfSource: Selection;
				const activeEditor = this.editorService.getActiveEditor();
				if (activeEditor instanceof BaseTextEditor) {
					const activeResource = getUntitledOrFileResource(activeEditor.input, true);
					if (activeResource && activeResource.toString() === source.toString()) {
						selectionOfSource = <Selection>activeEditor.getSelection();
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
					if (!target || target.toString() === source.toString()) {
						return; // save canceled or same resource used
					}

					const replaceWith: IResourceInput = {
						resource: target,
						encoding: encodingOfSource,
						options: {
							pinned: true,
							selection: selectionOfSource
						}
					};

					return this.editorService.replaceEditors([{
						toReplace: { resource: source },
						replaceWith: replaceWith
					}]).then(() => true);
				});
			}

			// Just save
			return this.textFileService.save(source, { force: true /* force a change to the file to trigger external watchers if any */ });
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
	public static LABEL = nls.localize('saveAs', "Save As...");

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
		@IWorkbenchEditorService protected editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@ITextFileService private textFileService: ITextFileService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@IMessageService messageService: IMessageService
	) {
		super(id, label, messageService);

		this.toDispose = [];
		this.lastIsDirty = this.textFileService.isDirty();
		this.enabled = this.lastIsDirty;

		this.registerListeners();
	}

	protected abstract getSaveAllArguments(context?: any): any;
	protected abstract includeUntitled(): boolean;

	private registerListeners(): void {

		// listen to files being changed locally
		this.toDispose.push(this.textFileService.models.onModelDirty(e => this.updateEnablement(true)));
		this.toDispose.push(this.textFileService.models.onModelSaved(e => this.updateEnablement(false)));
		this.toDispose.push(this.textFileService.models.onModelReverted(e => this.updateEnablement(false)));
		this.toDispose.push(this.textFileService.models.onModelSaveError(e => this.updateEnablement(true)));

		if (this.includeUntitled()) {
			this.toDispose.push(this.untitledEditorService.onDidChangeDirty(resource => this.updateEnablement(this.untitledEditorService.isDirty(resource))));
		}
	}

	private updateEnablement(isDirty: boolean): void {
		if (this.lastIsDirty !== isDirty) {
			this.enabled = this.textFileService.isDirty();
			this.lastIsDirty = this.enabled;
		}
	}

	protected doRun(context: any): TPromise<boolean> {
		const stacks = this.editorGroupService.getStacksModel();

		// Store some properties per untitled file to restore later after save is completed
		const mapUntitledToProperties: { [resource: string]: { encoding: string; indexInGroups: number[]; activeInGroups: boolean[] } } = Object.create(null);
		this.textFileService.getDirty()
			.filter(r => r.scheme === 'untitled')			// All untitled resources
			.map(r => this.untitledEditorService.get(r))	// Mapped to their inputs
			.filter(input => !!input)								// If possible :)
			.forEach(input => {
				mapUntitledToProperties[input.getResource().toString()] = {
					encoding: input.getEncoding(),
					indexInGroups: stacks.groups.map(g => g.indexOf(input)),
					activeInGroups: stacks.groups.map(g => g.isActive(input))
				};
			});

		// Save all
		return this.textFileService.saveAll(this.getSaveAllArguments(context)).then(results => {

			// Reopen saved untitled editors
			const untitledToReopen: { input: IResourceInput, position: Position }[] = [];

			results.results.forEach(result => {
				if (!result.success || result.source.scheme !== 'untitled') {
					return;
				}

				const untitledProps = mapUntitledToProperties[result.source.toString()];
				if (!untitledProps) {
					return;
				}

				// For each position where the untitled file was opened
				untitledProps.indexInGroups.forEach((indexInGroup, index) => {
					if (indexInGroup >= 0) {
						untitledToReopen.push({
							input: {
								resource: result.target,
								encoding: untitledProps.encoding,
								options: {
									pinned: true,
									index: indexInGroup,
									preserveFocus: true,
									inactive: !untitledProps.activeInGroups[index]
								}
							},
							position: index
						});
					}
				});
			});

			if (untitledToReopen.length) {
				return this.editorService.openEditors(untitledToReopen).then(() => true);
			}
		});
	}

	public dispose(): void {
		this.toDispose = dispose(this.toDispose);

		super.dispose();
	}
}

export class SaveAllAction extends BaseSaveAllAction {

	public static ID = 'workbench.action.files.saveAll';
	public static LABEL = nls.localize('saveAll', "Save All");

	public get class(): string {
		return 'explorer-action save-all';
	}

	protected getSaveAllArguments(): boolean {
		return this.includeUntitled();
	}

	protected includeUntitled(): boolean {
		return true;
	}
}

export class SaveAllInGroupAction extends BaseSaveAllAction {

	public static ID = 'workbench.files.action.saveAllInGroup';
	public static LABEL = nls.localize('saveAllInGroup', "Save All in Group");

	public get class(): string {
		return 'explorer-action save-all';
	}

	protected getSaveAllArguments(editorIdentifier: IEditorIdentifier): any {
		if (!editorIdentifier) {
			return this.includeUntitled();
		}

		const editorGroup = editorIdentifier.group;
		const resourcesToSave = [];
		editorGroup.getEditors().forEach(editor => {
			const resource = getUntitledOrFileResource(editor, true);
			if (resource) {
				resourcesToSave.push(resource);
			}
		});

		return resourcesToSave;
	}

	protected includeUntitled(): boolean {
		return true;
	}
}

export class SaveFilesAction extends BaseSaveAllAction {

	public static ID = 'workbench.action.files.saveFiles';
	public static LABEL = nls.localize('saveFiles', "Save Dirty Files");

	protected getSaveAllArguments(): boolean {
		return this.includeUntitled();
	}

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
			const activeFileInput = asFileEditorInput(this.editorService.getActiveEditorInput(), true);
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

export class FocusOpenEditorsView extends Action {

	public static ID = 'workbench.files.action.focusOpenEditorsView';
	public static LABEL = nls.localize({ key: 'focusOpenEditors', comment: ['Open is an adjective'] }, "Focus on Open Editors View");

	constructor(
		id: string,
		label: string,
		@IViewletService private viewletService: IViewletService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		return this.viewletService.openViewlet(VIEWLET_ID, true).then((viewlet: ExplorerViewlet) => {
			const openEditorsView = viewlet.getOpenEditorsView();
			if (openEditorsView) {
				openEditorsView.expand();
				openEditorsView.getViewer().DOMFocus();
			}
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
		return this.viewletService.openViewlet(VIEWLET_ID, true).then((viewlet: ExplorerViewlet) => {
			const view = viewlet.getExplorerView();
			if (view) {
				view.expand();
				view.getViewer().DOMFocus();
			}
		});
	}
}

export class ShowActiveFileInExplorer extends Action {

	public static ID = 'workbench.files.action.showActiveFileInExplorer';
	public static LABEL = nls.localize('showInExplorer', "Show Active File in Explorer");

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IViewletService private viewletService: IViewletService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IMessageService private messageService: IMessageService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const fileInput = asFileEditorInput(this.editorService.getActiveEditorInput(), true);
		if (fileInput) {
			return this.viewletService.openViewlet(VIEWLET_ID, false).then((viewlet: ExplorerViewlet) => {
				const isInsideWorkspace = this.contextService.isInsideWorkspace(fileInput.getResource());
				if (isInsideWorkspace) {
					const explorerView = viewlet.getExplorerView();
					if (explorerView) {
						explorerView.expand();
						explorerView.select(fileInput.getResource(), true);
					}
				} else {
					const openEditorsView = viewlet.getOpenEditorsView();
					if (openEditorsView) {
						openEditorsView.expand();
					}
				}
			});
		} else {
			this.messageService.show(severity.Info, nls.localize('openFileToShow', "Open a file first to show it in the explorer"));
		}

		return TPromise.as(true);
	}
}

export class CollapseExplorerView extends Action {

	public static ID = 'workbench.files.action.collapseExplorerFolders';
	public static LABEL = nls.localize('collapseExplorerFolders', "Collapse Folders in Explorer");

	constructor(
		id: string,
		label: string,
		@IViewletService private viewletService: IViewletService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		return this.viewletService.openViewlet(VIEWLET_ID, true).then((viewlet: ExplorerViewlet) => {
			const explorerView = viewlet.getExplorerView();
			if (explorerView) {
				const viewer = explorerView.getViewer();
				if (viewer) {
					const action = new CollapseAction(viewer, true, null);
					action.run().done();
					action.dispose();
				}
			}
		});
	}
}

export class RefreshExplorerView extends Action {

	public static ID = 'workbench.files.action.refreshFilesExplorer';
	public static LABEL = nls.localize('refreshExplorer', "Refresh Explorer");

	constructor(
		id: string,
		label: string,
		@IViewletService private viewletService: IViewletService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		return this.viewletService.openViewlet(VIEWLET_ID, true).then((viewlet: ExplorerViewlet) => {
			const explorerView = viewlet.getExplorerView();
			if (explorerView) {
				explorerView.refresh();
			}
		});
	}
}

export function keybindingForAction(id: string, keybindingService: IKeybindingService): Keybinding {
	switch (id) {
		case GlobalNewUntitledFileAction.ID:
			return new Keybinding(KeyMod.CtrlCmd | KeyCode.KEY_N);
		case TriggerRenameFileAction.ID:
			return new Keybinding(isMacintosh ? KeyCode.Enter : KeyCode.F2);
		case SaveFileAction.ID:
			return new Keybinding(KeyMod.CtrlCmd | KeyCode.KEY_S);
		case MoveFileToTrashAction.ID:
			return new Keybinding(isMacintosh ? KeyMod.CtrlCmd | KeyCode.Backspace : KeyCode.Delete);
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

	if (keybindingService) {
		const keys = keybindingService.lookupKeybindings(id);
		if (keys.length > 0) {
			return keys[0]; // only take the first one
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
		const fullPathLength = name.length + parent.resource.fsPath.length + 1 /* path segment */;
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
	diag = diagnostics.register('FileActionsDiagnostics', function (...args: any[]) {
		console.log(args[1] + ' - ' + args[0] + ' (time: ' + args[2].getTime() + ' [' + args[2].toUTCString() + '])');
	});
}