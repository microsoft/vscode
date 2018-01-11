/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/fileactions';
import { TPromise } from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import { isWindows, isLinux } from 'vs/base/common/platform';
import { sequence, ITask, always } from 'vs/base/common/async';
import paths = require('vs/base/common/paths');
import resources = require('vs/base/common/resources');
import URI from 'vs/base/common/uri';
import errors = require('vs/base/common/errors');
import { toErrorMessage } from 'vs/base/common/errorMessage';
import strings = require('vs/base/common/strings');
import severity from 'vs/base/common/severity';
import diagnostics = require('vs/base/common/diagnostics');
import { Action, IAction } from 'vs/base/common/actions';
import { MessageType, IInputValidator } from 'vs/base/browser/ui/inputbox/inputBox';
import { ITree, IHighlightEvent } from 'vs/base/parts/tree/browser/tree';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { VIEWLET_ID } from 'vs/workbench/parts/files/common/files';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IFileService, IFileStat } from 'vs/platform/files/common/files';
import { toResource } from 'vs/workbench/common/editor';
import { FileStat, Model, NewStatPlaceholder } from 'vs/workbench/parts/files/common/explorerModel';
import { ExplorerView } from 'vs/workbench/parts/files/electron-browser/views/explorerView';
import { ExplorerViewlet } from 'vs/workbench/parts/files/electron-browser/explorerViewlet';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { CollapseAction } from 'vs/workbench/browser/viewlet';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IUntitledResourceInput } from 'vs/platform/editor/common/editor';
import { IInstantiationService, IConstructorSignature2, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IMessageService, IMessageWithAction, IConfirmation, Severity, CancelAction, IConfirmationResult, getConfirmMessage } from 'vs/platform/message/common/message';
import { ITextModel } from 'vs/editor/common/model';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { COPY_PATH_COMMAND_ID, REVEAL_IN_EXPLORER_COMMAND_ID, SAVE_ALL_COMMAND_ID, SAVE_ALL_LABEL, SAVE_FILES_COMMAND_ID, SAVE_FILES_LABEL, SAVE_ALL_IN_GROUP_COMMAND_ID } from 'vs/workbench/parts/files/electron-browser/fileCommands';
import { ITextModelService, ITextModelContentProvider } from 'vs/editor/common/services/resolverService';
import { IConfigurationService, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { once } from 'vs/base/common/event';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ICommandService, CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IListService, ListWidget } from 'vs/platform/list/browser/listService';
import { RawContextKey, IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';

export interface IEditableData {
	action: IAction;
	validator: IInputValidator;
}

export interface IFileViewletState {
	getEditableData(stat: IFileStat): IEditableData;
	setEditable(stat: IFileStat, editableData: IEditableData): void;
	clearEditable(stat: IFileStat): void;
}

export const NEW_FILE_COMMAND_ID = 'workbench.command.files.newFile';
export const NEW_FILE_LABEL = nls.localize('newFile', "New File");

export const NEW_FOLDER_COMMAND_ID = 'workbench.command.files.newFolder';
export const NEW_FOLDER_LABEL = nls.localize('newFolder', "New Folder");

export const TRIGGER_RENAME_LABEL = nls.localize('rename', "Rename");

export const MOVE_FILE_TO_TRASH_LABEL = nls.localize('delete', "Delete");

export const COPY_FILE_LABEL = nls.localize('copyFile', "Copy");

export const PASTE_FILE_LABEL = nls.localize('pasteFile', "Paste");

export const FileCopiedContext = new RawContextKey<boolean>('fileCopied', false);

export class BaseErrorReportingAction extends Action {

	constructor(
		id: string,
		label: string,
		private _messageService: IMessageService
	) {
		super(id, label);
	}

	public get messageService() {
		return this._messageService;
	}

	protected onError(error: any): void {
		if (error.message === 'string') {
			error = error.message;
		}

		this._messageService.show(Severity.Error, toErrorMessage(error, false));
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

export class BaseFileAction extends BaseErrorReportingAction {
	public element: FileStat;

	constructor(
		id: string,
		label: string,
		@IFileService protected fileService: IFileService,
		@IMessageService _messageService: IMessageService,
		@ITextFileService protected textFileService: ITextFileService
	) {
		super(id, label, _messageService);

		this.enabled = false;
	}

	_isEnabled(): boolean {
		return true;
	}

	_updateEnablement(): void {
		this.enabled = !!(this.fileService && this._isEnabled());
	}
}

class TriggerRenameFileAction extends BaseFileAction {

	public static readonly ID = 'renameFile';

	private tree: ITree;
	private renameAction: BaseRenameAction;

	constructor(
		tree: ITree,
		element: FileStat,
		@IFileService fileService: IFileService,
		@IMessageService messageService: IMessageService,
		@ITextFileService textFileService: ITextFileService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(TriggerRenameFileAction.ID, TRIGGER_RENAME_LABEL, fileService, messageService, textFileService);

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
			return TPromise.wrapError(new Error('No context provided to BaseEnableFileRenameAction.'));
		}

		const viewletState = <IFileViewletState>context.viewletState;
		if (!viewletState) {
			return TPromise.wrapError(new Error('Invalid viewlet state provided to BaseEnableFileRenameAction.'));
		}

		const stat = <IFileStat>context.stat;
		if (!stat) {
			return TPromise.wrapError(new Error('Invalid stat provided to BaseEnableFileRenameAction.'));
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

			const unbind = this.tree.onDidChangeHighlight((e: IHighlightEvent) => {
				if (!e.highlight) {
					viewletState.clearEditable(stat);
					this.tree.refresh(stat).done(null, errors.onUnexpectedError);
					unbind.dispose();
				}
			});
		}).done(null, errors.onUnexpectedError);

		return void 0;
	}
}

export abstract class BaseRenameAction extends BaseFileAction {

	constructor(
		id: string,
		label: string,
		element: FileStat,
		@IFileService fileService: IFileService,
		@IMessageService messageService: IMessageService,
		@ITextFileService textFileService: ITextFileService
	) {
		super(id, label, fileService, messageService, textFileService);

		this.element = element;
	}

	public run(context?: any): TPromise<any> {
		if (!context) {
			return TPromise.wrapError(new Error('No context provided to BaseRenameFileAction.'));
		}

		let name = <string>context.value;
		if (!name) {
			return TPromise.wrapError(new Error('No new name provided to BaseRenameFileAction.'));
		}

		// Automatically trim whitespaces and trailing dots to produce nice file names
		name = getWellFormedFileName(name);
		const existingName = getWellFormedFileName(this.element.name);

		// Return early if name is invalid or didn't change
		if (name === existingName || this.validateFileName(this.element.parent, name)) {
			return TPromise.as(null);
		}

		// Call function and Emit Event through viewer
		const promise = this.runAction(name).then(null, (error: any) => {
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
}

class RenameFileAction extends BaseRenameAction {

	public static readonly ID = 'workbench.files.action.renameFile';

	constructor(
		element: FileStat,
		@IFileService fileService: IFileService,
		@IMessageService messageService: IMessageService,
		@ITextFileService textFileService: ITextFileService,
		@IBackupFileService private backupFileService: IBackupFileService
	) {
		super(RenameFileAction.ID, nls.localize('rename', "Rename"), element, fileService, messageService, textFileService);

		this._updateEnablement();
	}

	public runAction(newName: string): TPromise<any> {
		const dirty = this.textFileService.getDirty().filter(d => resources.isEqualOrParent(d, this.element.resource, !isLinux /* ignorecase */));
		const dirtyRenamed: URI[] = [];
		return TPromise.join(dirty.map(d => {
			let renamed: URI;

			// If the dirty file itself got moved, just reparent it to the target folder
			const targetPath = paths.join(this.element.parent.resource.path, newName);
			if (this.element.resource.toString() === d.toString()) {
				renamed = this.element.parent.resource.with({ path: targetPath });
			}

			// Otherwise, a parent of the dirty resource got moved, so we have to reparent more complicated. Example:
			else {
				renamed = this.element.parent.resource.with({ path: paths.join(targetPath, d.path.substr(this.element.resource.path.length + 1)) });
			}

			dirtyRenamed.push(renamed);

			const model = this.textFileService.models.get(d);

			return this.backupFileService.backupResource(renamed, model.getValue(), model.getVersionId());
		}))

			// 2. soft revert all dirty since we have backed up their contents
			.then(() => this.textFileService.revertAll(dirty, { soft: true /* do not attempt to load content from disk */ }))

			// 3.) run the rename operation
			.then(() => this.fileService.rename(this.element.resource, newName).then(null, (error: Error) => {
				return TPromise.join(dirtyRenamed.map(d => this.backupFileService.discardResourceBackup(d))).then(() => {
					this.onErrorWithRetry(error, () => this.runAction(newName));
				});
			}))

			// 4.) resolve those that were dirty to load their previous dirty contents from disk
			.then(() => {
				return TPromise.join(dirtyRenamed.map(t => this.textFileService.models.loadOrCreate(t)));
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
		@IFileService fileService: IFileService,
		@IMessageService messageService: IMessageService,
		@ITextFileService textFileService: ITextFileService
	) {
		super(id, label, fileService, messageService, textFileService);

		if (element) {
			this.presetFolder = element.isDirectory ? element : element.parent;
		}

		this.tree = tree;
		this.isFile = isFile;
		this.renameAction = editableAction;
	}

	public run(context?: any): TPromise<any> {
		if (!context) {
			return TPromise.wrapError(new Error('No context provided to BaseNewAction.'));
		}

		const viewletState = <IFileViewletState>context.viewletState;
		if (!viewletState) {
			return TPromise.wrapError(new Error('Invalid viewlet state provided to BaseNewAction.'));
		}

		let folder = this.presetFolder;
		if (!folder) {
			const focus = <FileStat>this.tree.getFocus();
			if (focus) {
				folder = focus.isDirectory ? focus : focus.parent;
			} else {
				const input: FileStat | Model = this.tree.getInput();
				folder = input instanceof Model ? input.roots[0] : input;
			}
		}

		if (!folder) {
			return TPromise.wrapError(new Error('Invalid parent folder to create.'));
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

							const unbind = this.tree.onDidChangeHighlight((e: IHighlightEvent) => {
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
		@IFileService fileService: IFileService,
		@IMessageService messageService: IMessageService,
		@ITextFileService textFileService: ITextFileService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super('explorer.newFile', NEW_FILE_LABEL, tree, true, instantiationService.createInstance(CreateFileAction, element), null, fileService, messageService, textFileService);

		this.class = 'explorer-action new-file';
		this._updateEnablement();
	}
}

/* New Folder */
export class NewFolderAction extends BaseNewAction {

	constructor(
		tree: ITree,
		element: FileStat,
		@IFileService fileService: IFileService,
		@IMessageService messageService: IMessageService,
		@ITextFileService textFileService: ITextFileService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super('explorer.newFolder', NEW_FOLDER_LABEL, tree, false, instantiationService.createInstance(CreateFolderAction, element), null, fileService, messageService, textFileService);

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
					explorerView.setExpanded(true);
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
	public static readonly ID = 'workbench.action.files.newUntitledFile';
	public static readonly LABEL = nls.localize('newUntitledFile', "New Untitled File");

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		return this.editorService.openEditor({ options: { pinned: true } } as IUntitledResourceInput); // untitled are always pinned
	}
}

/* Create new file from anywhere */
export class GlobalNewFileAction extends BaseGlobalNewAction {
	public static readonly ID = 'explorer.newFile';
	public static readonly LABEL = nls.localize('newFile', "New File");

	protected getAction(): IConstructorSignature2<ITree, IFileStat, Action> {
		return NewFileAction;
	}
}

/* Create new folder from anywhere */
export class GlobalNewFolderAction extends BaseGlobalNewAction {
	public static readonly ID = 'explorer.newFolder';
	public static readonly LABEL = nls.localize('newFolder', "New Folder");

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
class CreateFileAction extends BaseCreateAction {

	public static readonly ID = 'workbench.files.action.createFileFromExplorer';
	public static readonly LABEL = nls.localize('createNewFile', "New File");

	constructor(
		element: FileStat,
		@IFileService fileService: IFileService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IMessageService messageService: IMessageService,
		@ITextFileService textFileService: ITextFileService
	) {
		super(CreateFileAction.ID, CreateFileAction.LABEL, element, fileService, messageService, textFileService);

		this._updateEnablement();
	}

	public runAction(fileName: string): TPromise<any> {
		const resource = this.element.parent.resource;
		return this.fileService.createFile(resource.with({ path: paths.join(resource.path, fileName) })).then(stat => {
			return this.editorService.openEditor({ resource: stat.resource, options: { pinned: true } });
		}, (error) => {
			this.onErrorWithRetry(error, () => this.runAction(fileName));
		});
	}
}

/* Create New Folder (only used internally by explorerViewer) */
class CreateFolderAction extends BaseCreateAction {

	public static readonly ID = 'workbench.files.action.createFolderFromExplorer';
	public static readonly LABEL = nls.localize('createNewFolder', "New Folder");

	constructor(
		element: FileStat,
		@IFileService fileService: IFileService,
		@IMessageService messageService: IMessageService,
		@ITextFileService textFileService: ITextFileService
	) {
		super(CreateFolderAction.ID, CreateFolderAction.LABEL, null, fileService, messageService, textFileService);

		this._updateEnablement();
	}

	public runAction(fileName: string): TPromise<any> {
		const resource = this.element.parent.resource;
		return this.fileService.createFolder(resource.with({ path: paths.join(resource.path, fileName) })).then(null, (error) => {
			this.onErrorWithRetry(error, () => this.runAction(fileName));
		});
	}
}

class BaseDeleteFileAction extends BaseFileAction {

	private static readonly CONFIRM_DELETE_SETTING_KEY = 'explorer.confirmDelete';

	private skipConfirm: boolean;

	constructor(
		private tree: ITree,
		private elements: FileStat[],
		private useTrash: boolean,
		@IFileService fileService: IFileService,
		@IMessageService messageService: IMessageService,
		@ITextFileService textFileService: ITextFileService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		super('moveFileToTrash', MOVE_FILE_TO_TRASH_LABEL, fileService, messageService, textFileService);

		this.tree = tree;
		this.useTrash = useTrash && elements.every(e => !paths.isUNC(e.resource.fsPath)); // on UNC shares there is no trash

		this._updateEnablement();
	}

	public run(): TPromise<any> {

		// Remove highlight
		if (this.tree) {
			this.tree.clearHighlight();
		}

		let primaryButton: string;
		if (this.useTrash) {
			primaryButton = isWindows ? nls.localize('deleteButtonLabelRecycleBin', "&&Move to Recycle Bin") : nls.localize({ key: 'deleteButtonLabelTrash', comment: ['&& denotes a mnemonic'] }, "&&Move to Trash");
		} else {
			primaryButton = nls.localize({ key: 'deleteButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Delete");
		}

		// Handle dirty
		let confirmDirtyPromise: TPromise<boolean> = TPromise.as(true);
		const dirty = this.textFileService.getDirty().filter(d => this.elements.some(e => resources.isEqualOrParent(d, e.resource, !isLinux /* ignorecase */)));
		if (dirty.length) {
			let message: string;
			if (this.elements.length > 1) {
				message = nls.localize('dirtyMessageFilesDelete', "You are deleting files with unsaved changes. Do you want to continue?");
			} else if (this.elements[0].isDirectory) {
				if (dirty.length === 1) {
					message = nls.localize('dirtyMessageFolderOneDelete', "You are deleting a folder with unsaved changes in 1 file. Do you want to continue?");
				} else {
					message = nls.localize('dirtyMessageFolderDelete', "You are deleting a folder with unsaved changes in {0} files. Do you want to continue?", dirty.length);
				}
			} else {
				message = nls.localize('dirtyMessageFileDelete', "You are deleting a file with unsaved changes. Do you want to continue?");
			}

			confirmDirtyPromise = this.messageService.confirm({
				message,
				type: 'warning',
				detail: nls.localize('dirtyWarning', "Your changes will be lost if you don't save them."),
				primaryButton
			}).then(confirmed => {
				if (!confirmed) {
					return false;
				}

				this.skipConfirm = true; // since we already asked for confirmation
				return this.textFileService.revertAll(dirty).then(() => true);
			});
		}

		// Check if file is dirty in editor and save it to avoid data loss
		return confirmDirtyPromise.then(confirmed => {
			if (!confirmed) {
				return null;
			}

			let confirmDeletePromise: TPromise<IConfirmationResult>;

			// Check if we need to ask for confirmation at all
			if (this.skipConfirm || (this.useTrash && this.configurationService.getValue<boolean>(BaseDeleteFileAction.CONFIRM_DELETE_SETTING_KEY) === false)) {
				confirmDeletePromise = TPromise.as({ confirmed: true } as IConfirmationResult);
			}

			// Confirm for moving to trash
			else if (this.useTrash) {
				const message = this.elements.length > 1 ? getConfirmMessage(nls.localize('confirmMoveTrashMessageMultiple', "Are you sure you want to delete the following {0} files?", this.elements.length), this.elements.map(e => e.resource))
					: this.elements[0].isDirectory ? nls.localize('confirmMoveTrashMessageFolder', "Are you sure you want to delete '{0}' and its contents?", this.elements[0].name)
						: nls.localize('confirmMoveTrashMessageFile', "Are you sure you want to delete '{0}'?", this.elements[0].name);
				confirmDeletePromise = this.messageService.confirmWithCheckbox({
					message,
					detail: isWindows ? nls.localize('undoBin', "You can restore from the recycle bin.") : nls.localize('undoTrash', "You can restore from the trash."),
					primaryButton,
					checkbox: {
						label: nls.localize('doNotAskAgain', "Do not ask me again")
					},
					type: 'question'
				});
			}

			// Confirm for deleting permanently
			else {
				const message = this.elements.length > 1 ? getConfirmMessage(nls.localize('confirmDeleteMessageMultiple', "Are you sure you want to permanently delete the following {0} files?", this.elements.length), this.elements.map(e => e.resource))
					: this.elements[0].isDirectory ? nls.localize('confirmDeleteMessageFolder', "Are you sure you want to permanently delete '{0}' and its contents?", this.elements[0].name)
						: nls.localize('confirmDeleteMessageFile', "Are you sure you want to permanently delete '{0}'?", this.elements[0].name);
				confirmDeletePromise = this.messageService.confirmWithCheckbox({
					message,
					detail: nls.localize('irreversible', "This action is irreversible!"),
					primaryButton,
					type: 'warning'
				});
			}

			return confirmDeletePromise.then(confirmation => {

				// Check for confirmation checkbox
				let updateConfirmSettingsPromise: TPromise<void> = TPromise.as(void 0);
				if (confirmation.confirmed && confirmation.checkboxChecked === true) {
					updateConfirmSettingsPromise = this.configurationService.updateValue(BaseDeleteFileAction.CONFIRM_DELETE_SETTING_KEY, false, ConfigurationTarget.USER);
				}

				return updateConfirmSettingsPromise.then(() => {

					// Check for confirmation
					if (!confirmation.confirmed) {
						return TPromise.as(null);
					}

					// Call function
					const servicePromise = TPromise.join(this.elements.map(e => this.fileService.del(e.resource, this.useTrash))).then(() => {
						if (this.elements[0].parent) {
							this.tree.setFocus(this.elements[0].parent); // move focus to parent
						}
					}, (error: any) => {
						if (this.elements.length === 1) {
							// Allow to retry
							let extraAction: Action;
							if (this.useTrash) {
								extraAction = new Action('permanentDelete', nls.localize('permDelete', "Delete Permanently"), null, true, () => { this.useTrash = false; this.skipConfirm = true; return this.run(); });
							}

							this.onErrorWithRetry(error, () => this.run(), extraAction);
						}

						// Focus back to tree
						this.tree.DOMFocus();
					});

					return servicePromise;
				});
			});
		});
	}
}

/* Import File */
export class ImportFileAction extends BaseFileAction {

	private tree: ITree;

	constructor(
		tree: ITree,
		element: FileStat,
		clazz: string,
		@IFileService fileService: IFileService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IMessageService messageService: IMessageService,
		@ITextFileService textFileService: ITextFileService
	) {
		super('workbench.files.action.importFile', nls.localize('importFiles', "Import Files"), fileService, messageService, textFileService);

		this.tree = tree;
		this.element = element;

		if (clazz) {
			this.class = clazz;
		}

		this._updateEnablement();
	}

	public run(resources: URI[]): TPromise<any> {
		const importPromise = TPromise.as(null).then(() => {
			if (resources && resources.length > 0) {

				// Find parent for import
				let targetElement: FileStat;
				if (this.element) {
					targetElement = this.element;
				} else {
					const input: FileStat | Model = this.tree.getInput();
					targetElement = this.tree.getFocus() || (input instanceof Model ? input.roots[0] : input);
				}

				if (!targetElement.isDirectory) {
					targetElement = targetElement.parent;
				}

				// Resolve target to check for name collisions and ask user
				return this.fileService.resolveFile(targetElement.resource).then((targetStat: IFileStat) => {

					// Check for name collisions
					const targetNames: { [name: string]: IFileStat } = {};
					targetStat.children.forEach((child) => {
						targetNames[isLinux ? child.name : child.name.toLowerCase()] = child;
					});

					let overwritePromise = TPromise.as(true);
					if (resources.some(resource => {
						return !!targetNames[isLinux ? paths.basename(resource.fsPath) : paths.basename(resource.fsPath).toLowerCase()];
					})) {
						const confirm: IConfirmation = {
							message: nls.localize('confirmOverwrite', "A file or folder with the same name already exists in the destination folder. Do you want to replace it?"),
							detail: nls.localize('irreversible', "This action is irreversible!"),
							primaryButton: nls.localize({ key: 'replaceButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Replace"),
							type: 'warning'
						};

						overwritePromise = this.messageService.confirm(confirm);
					}

					return overwritePromise.then(overwrite => {
						if (!overwrite) {
							return void 0;
						}

						// Run import in sequence
						const importPromisesFactory: ITask<TPromise<void>>[] = [];
						resources.forEach(resource => {
							importPromisesFactory.push(() => {
								const sourceFile = resource;
								const targetFile = targetElement.resource.with({ path: paths.join(targetElement.resource.path, paths.basename(sourceFile.path)) });

								// if the target exists and is dirty, make sure to revert it. otherwise the dirty contents
								// of the target file would replace the contents of the imported file. since we already
								// confirmed the overwrite before, this is OK.
								let revertPromise = TPromise.wrap(null);
								if (this.textFileService.isDirty(targetFile)) {
									revertPromise = this.textFileService.revertAll([targetFile], { soft: true });
								}

								return revertPromise.then(() => {
									return this.fileService.importFile(sourceFile, targetElement.resource).then(res => {

										// if we only import one file, just open it directly
										if (resources.length === 1) {
											this.editorService.openEditor({ resource: res.stat.resource, options: { pinned: true } }).done(null, errors.onUnexpectedError);
										}
									}, error => this.onError(error));
								});
							});
						});

						return sequence(importPromisesFactory);
					});
				});
			}

			return void 0;
		});

		return importPromise.then(() => {
			this.tree.clearHighlight();
		}, (error: any) => {
			this.onError(error);
			this.tree.clearHighlight();
		});
	}
}

// Copy File/Folder
let filesToCopy: FileStat[];
let fileCopiedContextKey: IContextKey<boolean>;

class CopyFileAction extends BaseFileAction {

	private tree: ITree;
	constructor(
		tree: ITree,
		private elements: FileStat[],
		@IFileService fileService: IFileService,
		@IMessageService messageService: IMessageService,
		@ITextFileService textFileService: ITextFileService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super('filesExplorer.copy', COPY_FILE_LABEL, fileService, messageService, textFileService);

		this.tree = tree;
		if (!fileCopiedContextKey) {
			fileCopiedContextKey = FileCopiedContext.bindTo(contextKeyService);
		}
		this._updateEnablement();
	}

	public run(): TPromise<any> {

		// Remember as file/folder to copy
		filesToCopy = this.elements;
		fileCopiedContextKey.set(!!filesToCopy.length);

		// Remove highlight
		if (this.tree) {
			this.tree.clearHighlight();
		}

		this.tree.DOMFocus();

		return TPromise.as(null);
	}
}

// Paste File/Folder
class PasteFileAction extends BaseFileAction {

	public static readonly ID = 'filesExplorer.paste';

	private tree: ITree;

	constructor(
		tree: ITree,
		element: FileStat,
		@IFileService fileService: IFileService,
		@IMessageService messageService: IMessageService,
		@ITextFileService textFileService: ITextFileService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(PasteFileAction.ID, PASTE_FILE_LABEL, fileService, messageService, textFileService);

		this.tree = tree;
		this.element = element;
		if (!this.element) {
			const input: FileStat | Model = this.tree.getInput();
			this.element = input instanceof Model ? input.roots[0] : input;
		}
		this._updateEnablement();
	}

	public run(fileToCopy: FileStat): TPromise<any> {

		const exists = fileToCopy.root.find(fileToCopy.resource);
		if (!exists) {
			fileToCopy = null;
			fileCopiedContextKey.set(false);
			throw new Error(nls.localize('fileDeleted', "File was deleted or moved meanwhile"));
		}

		// Check if target is ancestor of pasted folder
		if (this.element.resource.toString() !== fileToCopy.resource.toString() && resources.isEqualOrParent(this.element.resource, fileToCopy.resource, !isLinux /* ignorecase */)) {
			throw new Error(nls.localize('fileIsAncestor', "File to copy is an ancestor of the desitnation folder"));
		}

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
		@IFileService fileService: IFileService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IMessageService messageService: IMessageService,
		@ITextFileService textFileService: ITextFileService
	) {
		super('workbench.files.action.duplicateFile', nls.localize('duplicateFile', "Duplicate"), fileService, messageService, textFileService);

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

		// Copy File
		const result = this.fileService.copyFile(this.element.resource, this.findTarget()).then(stat => {
			if (!stat.isDirectory) {
				return this.editorService.openEditor({ resource: stat.resource, options: { pinned: true } });
			}

			return void 0;
		}, error => this.onError(error));

		return result;
	}

	private findTarget(): URI {
		let name = this.element.name;

		let candidate = this.target.resource.with({ path: paths.join(this.target.resource.path, name) });
		while (true) {
			if (!this.element.root.find(candidate)) {
				break;
			}

			name = this.toCopyName(name, this.element.isDirectory);
			candidate = this.target.resource.with({ path: paths.join(this.target.resource.path, name) });
		}

		return candidate;
	}

	private toCopyName(name: string, isFolder: boolean): string {

		// file.1.txt=>file.2.txt
		if (!isFolder && name.match(/(.*\.)(\d+)(\..*)$/)) {
			return name.replace(/(.*\.)(\d+)(\..*)$/, (match, g1?, g2?, g3?) => { return g1 + (parseInt(g2) + 1) + g3; });
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

// Global Compare with
export class GlobalCompareResourcesAction extends Action {

	public static readonly ID = 'workbench.files.action.compareFileWith';
	public static readonly LABEL = nls.localize('globalCompareFile', "Compare Active File With...");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IMessageService private messageService: IMessageService,
		@IEditorGroupService private editorGroupService: IEditorGroupService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const activeInput = this.editorService.getActiveEditorInput();
		const activeResource = activeInput ? activeInput.getResource() : void 0;
		if (activeResource) {

			// Compare with next editor that opens
			const unbind = once(this.editorGroupService.onEditorOpening)(e => {
				const resource = e.input.getResource();
				if (resource) {
					e.prevent(() => {
						return this.editorService.openEditor({
							leftResource: activeResource,
							rightResource: resource
						});
					});
				}
			});

			// Bring up quick open
			this.quickOpenService.show('', { autoFocus: { autoFocusSecondEntry: true } }).then(() => {
				unbind.dispose(); // make sure to unbind if quick open is closing
			});
		} else {
			this.messageService.show(Severity.Info, nls.localize('openFileToCompare', "Open a file first to compare it with another file."));
		}

		return TPromise.as(true);
	}
}

// Refresh Explorer Viewer
export class RefreshViewExplorerAction extends Action {

	constructor(explorerView: ExplorerView, clazz: string) {
		super('workbench.files.action.refreshFilesExplorer', nls.localize('refresh', "Refresh"), clazz, true, (context: any) => explorerView.refresh());
	}
}

export abstract class BaseSaveAllAction extends BaseErrorReportingAction {
	private toDispose: IDisposable[];
	private lastIsDirty: boolean;

	constructor(
		id: string,
		label: string,
		@ITextFileService private textFileService: ITextFileService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@ICommandService protected commandService: ICommandService,
		@IMessageService messageService: IMessageService,
	) {
		super(id, label, messageService);

		this.toDispose = [];
		this.lastIsDirty = this.textFileService.isDirty();
		this.enabled = this.lastIsDirty;

		this.registerListeners();
	}

	protected abstract includeUntitled(): boolean;
	protected abstract doRun(context: any): TPromise<any>;

	private registerListeners(): void {

		// listen to files being changed locally
		this.toDispose.push(this.textFileService.models.onModelsDirty(e => this.updateEnablement(true)));
		this.toDispose.push(this.textFileService.models.onModelsSaved(e => this.updateEnablement(false)));
		this.toDispose.push(this.textFileService.models.onModelsReverted(e => this.updateEnablement(false)));
		this.toDispose.push(this.textFileService.models.onModelsSaveError(e => this.updateEnablement(true)));

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

	public run(context?: any): TPromise<boolean> {
		return this.doRun(context).then(() => true, error => {
			this.onError(error);
			return null;
		});
	}

	public dispose(): void {
		this.toDispose = dispose(this.toDispose);

		super.dispose();
	}
}

export class SaveAllAction extends BaseSaveAllAction {

	public static readonly ID = 'workbench.action.files.saveAll';
	public static readonly LABEL = SAVE_ALL_LABEL;

	public get class(): string {
		return 'explorer-action save-all';
	}

	protected doRun(context: any): TPromise<any> {
		return this.commandService.executeCommand(SAVE_ALL_COMMAND_ID);
	}

	protected includeUntitled(): boolean {
		return true;
	}
}

export class SaveAllInGroupAction extends BaseSaveAllAction {

	public static readonly ID = 'workbench.files.action.saveAllInGroup';
	public static readonly LABEL = nls.localize('saveAllInGroup', "Save All in Group");

	public get class(): string {
		return 'explorer-action save-all';
	}

	protected doRun(context: any): TPromise<any> {
		return this.commandService.executeCommand(SAVE_ALL_IN_GROUP_COMMAND_ID);
	}

	protected includeUntitled(): boolean {
		return true;
	}
}

export class SaveFilesAction extends BaseSaveAllAction {

	public static readonly ID = 'workbench.action.files.saveFiles';
	public static readonly LABEL = SAVE_FILES_LABEL;

	protected doRun(context: any): TPromise<any> {
		return this.commandService.executeCommand(SAVE_FILES_COMMAND_ID, false);
	}

	protected includeUntitled(): boolean {
		return false;
	}
}

export class FocusOpenEditorsView extends Action {

	public static readonly ID = 'workbench.files.action.focusOpenEditorsView';
	public static readonly LABEL = nls.localize({ key: 'focusOpenEditors', comment: ['Open is an adjective'] }, "Focus on Open Editors View");

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
				openEditorsView.setExpanded(true);
				openEditorsView.getList().domFocus();
			}
		});
	}
}

export class FocusFilesExplorer extends Action {

	public static readonly ID = 'workbench.files.action.focusFilesExplorer';
	public static readonly LABEL = nls.localize('focusFilesExplorer', "Focus on Files Explorer");

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
				view.setExpanded(true);
				view.getViewer().DOMFocus();
			}
		});
	}
}

export class ShowActiveFileInExplorer extends Action {

	public static readonly ID = 'workbench.files.action.showActiveFileInExplorer';
	public static readonly LABEL = nls.localize('showInExplorer', "Reveal Active File in Side Bar");

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IMessageService private messageService: IMessageService,
		@ICommandService private commandService: ICommandService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const resource = toResource(this.editorService.getActiveEditorInput(), { supportSideBySide: true });
		if (resource) {
			this.commandService.executeCommand(REVEAL_IN_EXPLORER_COMMAND_ID, resource);
		} else {
			this.messageService.show(severity.Info, nls.localize('openFileToShow', "Open a file first to show it in the explorer"));
		}

		return TPromise.as(true);
	}
}

export class CollapseExplorerView extends Action {

	public static readonly ID = 'workbench.files.action.collapseExplorerFolders';
	public static readonly LABEL = nls.localize('collapseExplorerFolders', "Collapse Folders in Explorer");

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

	public static readonly ID = 'workbench.files.action.refreshFilesExplorer';
	public static readonly LABEL = nls.localize('refreshExplorer', "Refresh Explorer");

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

export class ShowOpenedFileInNewWindow extends Action {

	public static readonly ID = 'workbench.action.files.showOpenedFileInNewWindow';
	public static readonly LABEL = nls.localize('openFileInNewWindow', "Open Active File in New Window");

	constructor(
		id: string,
		label: string,
		@IWindowsService private windowsService: IWindowsService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IMessageService private messageService: IMessageService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const fileResource = toResource(this.editorService.getActiveEditorInput(), { supportSideBySide: true, filter: 'file' });
		if (fileResource) {
			this.windowsService.openWindow([fileResource.fsPath], { forceNewWindow: true, forceOpenWorkspaceAsFile: true });
		} else {
			this.messageService.show(severity.Info, nls.localize('openFileToShowInNewWindow', "Open a file first to open in new window"));
		}

		return TPromise.as(true);
	}
}

export class CopyPathAction extends Action {

	public static readonly LABEL = nls.localize('copyPath', "Copy Path");

	constructor(
		private resource: URI,
		@ICommandService private commandService: ICommandService
	) {
		super('copyFilePath', CopyPathAction.LABEL);

		this.order = 140;
	}

	public run(): TPromise<any> {
		return this.commandService.executeCommand(COPY_PATH_COMMAND_ID, this.resource);
	}
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
		return nls.localize('invalidFileNameError', "The name **{0}** is not valid as a file or folder name. Please choose a different name.", trimLongName(name));
	}

	// Max length restriction (on Windows)
	if (isWindows) {
		const fullPathLength = name.length + parent.resource.fsPath.length + 1 /* path segment */;
		if (fullPathLength > 255) {
			return nls.localize('filePathTooLongError', "The name **{0}** results in a path that is too long. Please choose a shorter name.", trimLongName(name));
		}
	}

	return null;
}

function trimLongName(name: string): string {
	if (name && name.length > 255) {
		return `${name.substr(0, 255)}...`;
	}

	return name;
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

export class CompareWithClipboardAction extends Action {

	public static readonly ID = 'workbench.files.action.compareWithClipboard';
	public static readonly LABEL = nls.localize('compareWithClipboard', "Compare Active File with Clipboard");

	private static readonly SCHEME = 'clipboardCompare';

	private registrationDisposal: IDisposable;

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@ITextModelService private textModelService: ITextModelService,
	) {
		super(id, label);

		this.enabled = true;
	}

	public run(): TPromise<any> {
		const resource: URI = toResource(this.editorService.getActiveEditorInput(), { supportSideBySide: true, filter: 'file' });
		const provider = this.instantiationService.createInstance(ClipboardContentProvider);

		if (resource) {
			if (!this.registrationDisposal) {
				this.registrationDisposal = this.textModelService.registerTextModelContentProvider(CompareWithClipboardAction.SCHEME, provider);
			}

			const name = paths.basename(resource.fsPath);
			const editorLabel = nls.localize('clipboardComparisonLabel', "Clipboard ↔ {0}", name);

			const cleanUp = () => {
				this.registrationDisposal = dispose(this.registrationDisposal);
			};

			return always(this.editorService.openEditor({ leftResource: URI.from({ scheme: CompareWithClipboardAction.SCHEME, path: resource.fsPath }), rightResource: resource, label: editorLabel }), cleanUp);
		}

		return TPromise.as(true);
	}

	public dispose(): void {
		super.dispose();

		this.registrationDisposal = dispose(this.registrationDisposal);
	}
}

class ClipboardContentProvider implements ITextModelContentProvider {
	constructor(
		@IClipboardService private clipboardService: IClipboardService,
		@IModeService private modeService: IModeService,
		@IModelService private modelService: IModelService
	) { }

	provideTextContent(resource: URI): TPromise<ITextModel> {
		const model = this.modelService.createModel(this.clipboardService.readText(), this.modeService.getOrCreateMode('text/plain'), resource);

		return TPromise.as(model);
	}
}

// Diagnostics support
let diag: (...args: any[]) => void;
if (!diag) {
	diag = diagnostics.register('FileActionsDiagnostics', function (...args: any[]) {
		console.log(args[1] + ' - ' + args[0] + ' (time: ' + args[2].getTime() + ' [' + args[2].toUTCString() + '])');
	});
}

interface IExplorerContext {
	viewletState: IFileViewletState;
	stat: FileStat;
	selection: FileStat[];
}

function getContext(listWidget: ListWidget, viewletService: IViewletService): IExplorerContext {
	// These commands can only be triggered when explorer viewlet is visible so get it using the active viewlet
	const tree = <ITree>listWidget;
	const stat = tree.getFocus();
	const selection = tree.getSelection();

	// Only respect the selection if user clicked inside it (focus belongs to it)
	return { stat, selection: selection && selection.indexOf(stat) >= 0 ? selection : [], viewletState: (<ExplorerViewlet>viewletService.getActiveViewlet()).getViewletState() };
}

// TODO@isidor these commands are calling into actions due to the complex inheritance action structure.
// It should be the other way around, that actions call into commands.
CommandsRegistry.registerCommand({
	id: NEW_FILE_COMMAND_ID,
	handler: (accessor) => {
		const instantationService = accessor.get(IInstantiationService);
		const listService = accessor.get(IListService);
		const explorerContext = getContext(listService.lastFocusedList, accessor.get(IViewletService));
		const newFileAction = instantationService.createInstance(NewFileAction, listService.lastFocusedList, explorerContext.stat);

		return newFileAction.run(explorerContext);
	}
});

CommandsRegistry.registerCommand({
	id: NEW_FOLDER_COMMAND_ID,
	handler: (accessor) => {
		const instantationService = accessor.get(IInstantiationService);
		const listService = accessor.get(IListService);
		const explorerContext = getContext(listService.lastFocusedList, accessor.get(IViewletService));
		const newFolderAction = instantationService.createInstance(NewFolderAction, listService.lastFocusedList, explorerContext.stat);

		return newFolderAction.run(explorerContext);
	}
});

export const renameHandler = (accessor: ServicesAccessor) => {
	const instantationService = accessor.get(IInstantiationService);
	const listService = accessor.get(IListService);
	const explorerContext = getContext(listService.lastFocusedList, accessor.get(IViewletService));

	const renameAction = instantationService.createInstance(TriggerRenameFileAction, listService.lastFocusedList, explorerContext.stat);
	return renameAction.run(explorerContext);
};

export const moveFileToTrashHandler = (accessor: ServicesAccessor) => {
	const instantationService = accessor.get(IInstantiationService);
	const listService = accessor.get(IListService);
	const explorerContext = getContext(listService.lastFocusedList, accessor.get(IViewletService));
	const stats = explorerContext.selection.length > 1 ? explorerContext.selection : [explorerContext.stat];

	const moveFileToTrashAction = instantationService.createInstance(BaseDeleteFileAction, listService.lastFocusedList, stats, true);
	return moveFileToTrashAction.run();
};

export const deleteFileHandler = (accessor: ServicesAccessor) => {
	const instantationService = accessor.get(IInstantiationService);
	const listService = accessor.get(IListService);
	const explorerContext = getContext(listService.lastFocusedList, accessor.get(IViewletService));
	const stats = explorerContext.selection.length > 1 ? explorerContext.selection : [explorerContext.stat];

	const deleteFileAction = instantationService.createInstance(BaseDeleteFileAction, listService.lastFocusedList, stats, false);
	return deleteFileAction.run();
};

export const copyFileHandler = (accessor: ServicesAccessor) => {
	const instantationService = accessor.get(IInstantiationService);
	const listService = accessor.get(IListService);
	const explorerContext = getContext(listService.lastFocusedList, accessor.get(IViewletService));
	const stats = explorerContext.selection.length > 1 ? explorerContext.selection : [explorerContext.stat];

	const copyFileAction = instantationService.createInstance(CopyFileAction, listService.lastFocusedList, stats);
	return copyFileAction.run();
};

export const pasteFileHandler = (accessor: ServicesAccessor) => {
	const instantationService = accessor.get(IInstantiationService);
	const listService = accessor.get(IListService);
	const explorerContext = getContext(listService.lastFocusedList, accessor.get(IViewletService));

	return TPromise.join(filesToCopy.map(toCopy => {
		const pasteFileAction = instantationService.createInstance(PasteFileAction, listService.lastFocusedList, explorerContext.stat);
		return pasteFileAction.run(toCopy);
	}));
};
