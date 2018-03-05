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
import { IInstantiationService, ServicesAccessor, IConstructorSignature2 } from 'vs/platform/instantiation/common/instantiation';
import { ITextModel } from 'vs/editor/common/model';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { COPY_PATH_COMMAND_ID, REVEAL_IN_EXPLORER_COMMAND_ID, SAVE_ALL_COMMAND_ID, SAVE_ALL_LABEL, SAVE_ALL_IN_GROUP_COMMAND_ID } from 'vs/workbench/parts/files/electron-browser/fileCommands';
import { ITextModelService, ITextModelContentProvider } from 'vs/editor/common/services/resolverService';
import { IConfigurationService, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { once } from 'vs/base/common/event';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ICommandService, CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IListService, ListWidget } from 'vs/platform/list/browser/listService';
import { RawContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { distinctParents, basenameOrAuthority } from 'vs/base/common/resources';
import { Schemas } from 'vs/base/common/network';
import { IConfirmationService, IConfirmationResult, IConfirmation } from 'vs/platform/dialogs/common/dialogs';
import { getConfirmMessage } from 'vs/workbench/services/dialogs/electron-browser/dialogs';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';

export interface IEditableData {
	action: IAction;
	validator: IInputValidator;
}

export interface IFileViewletState {
	getEditableData(stat: IFileStat): IEditableData;
	setEditable(stat: IFileStat, editableData: IEditableData): void;
	clearEditable(stat: IFileStat): void;
}

export const NEW_FILE_COMMAND_ID = 'explorer.newFile';
export const NEW_FILE_LABEL = nls.localize('newFile', "New File");

export const NEW_FOLDER_COMMAND_ID = 'explorer.newFolder';
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
		private _notificationService: INotificationService
	) {
		super(id, label);
	}

	public get notificationService() {
		return this._notificationService;
	}

	protected onError(error: any): void {
		if (error.message === 'string') {
			error = error.message;
		}

		this._notificationService.error(toErrorMessage(error, false));
	}

	protected onErrorWithRetry(error: any, retry: () => TPromise<any>, extraAction?: Action): void {
		const actions = [
			new Action(this.id, nls.localize('retry', "Retry"), null, true, () => retry()),
		];

		if (extraAction) {
			actions.unshift(extraAction);
		}

		this._notificationService.notify({
			severity: Severity.Error,
			message: toErrorMessage(error, false),
			actions: { primary: actions }
		});
	}
}

export class BaseFileAction extends BaseErrorReportingAction {
	public element: FileStat;

	constructor(
		id: string,
		label: string,
		@IFileService protected fileService: IFileService,
		@INotificationService notificationService: INotificationService,
		@ITextFileService protected textFileService: ITextFileService
	) {
		super(id, label, notificationService);

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
		@INotificationService notificationService: INotificationService,
		@ITextFileService textFileService: ITextFileService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(TriggerRenameFileAction.ID, TRIGGER_RENAME_LABEL, fileService, notificationService, textFileService);

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
		@INotificationService notificationService: INotificationService,
		@ITextFileService textFileService: ITextFileService
	) {
		super(id, label, fileService, notificationService, textFileService);

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
		@INotificationService notificationService: INotificationService,
		@ITextFileService textFileService: ITextFileService,
		@IBackupFileService private backupFileService: IBackupFileService
	) {
		super(RenameFileAction.ID, nls.localize('rename', "Rename"), element, fileService, notificationService, textFileService);

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

			return this.backupFileService.backupResource(renamed, model.createSnapshot(), model.getVersionId());
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
		@INotificationService notificationService: INotificationService,
		@ITextFileService textFileService: ITextFileService
	) {
		super(id, label, fileService, notificationService, textFileService);

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
		@INotificationService notificationService: INotificationService,
		@ITextFileService textFileService: ITextFileService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super('explorer.newFile', NEW_FILE_LABEL, tree, true, instantiationService.createInstance(CreateFileAction, element), null, fileService, notificationService, textFileService);

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
		@INotificationService notificationService: INotificationService,
		@ITextFileService textFileService: ITextFileService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super('explorer.newFolder', NEW_FOLDER_LABEL, tree, false, instantiationService.createInstance(CreateFolderAction, element), null, fileService, notificationService, textFileService);

		this.class = 'explorer-action new-folder';
		this._updateEnablement();
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
		@INotificationService notificationService: INotificationService,
		@ITextFileService textFileService: ITextFileService
	) {
		super(CreateFileAction.ID, CreateFileAction.LABEL, element, fileService, notificationService, textFileService);

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
		@INotificationService notificationService: INotificationService,
		@ITextFileService textFileService: ITextFileService
	) {
		super(CreateFolderAction.ID, CreateFolderAction.LABEL, null, fileService, notificationService, textFileService);

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
		@INotificationService notificationService: INotificationService,
		@IConfirmationService private confirmationService: IConfirmationService,
		@ITextFileService textFileService: ITextFileService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		super('moveFileToTrash', MOVE_FILE_TO_TRASH_LABEL, fileService, notificationService, textFileService);

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

		const distinctElements = distinctParents(this.elements, e => e.resource);

		// Handle dirty
		let confirmDirtyPromise: TPromise<boolean> = TPromise.as(true);
		const dirty = this.textFileService.getDirty().filter(d => distinctElements.some(e => resources.isEqualOrParent(d, e.resource, !isLinux /* ignorecase */)));
		if (dirty.length) {
			let message: string;
			if (distinctElements.length > 1) {
				message = nls.localize('dirtyMessageFilesDelete', "You are deleting files with unsaved changes. Do you want to continue?");
			} else if (distinctElements[0].isDirectory) {
				if (dirty.length === 1) {
					message = nls.localize('dirtyMessageFolderOneDelete', "You are deleting a folder with unsaved changes in 1 file. Do you want to continue?");
				} else {
					message = nls.localize('dirtyMessageFolderDelete', "You are deleting a folder with unsaved changes in {0} files. Do you want to continue?", dirty.length);
				}
			} else {
				message = nls.localize('dirtyMessageFileDelete', "You are deleting a file with unsaved changes. Do you want to continue?");
			}

			confirmDirtyPromise = this.confirmationService.confirm({
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
				const message = distinctElements.length > 1 ? getConfirmMessage(nls.localize('confirmMoveTrashMessageMultiple', "Are you sure you want to delete the following {0} files?", distinctElements.length), distinctElements.map(e => e.resource))
					: distinctElements[0].isDirectory ? nls.localize('confirmMoveTrashMessageFolder', "Are you sure you want to delete '{0}' and its contents?", distinctElements[0].name)
						: nls.localize('confirmMoveTrashMessageFile', "Are you sure you want to delete '{0}'?", distinctElements[0].name);
				confirmDeletePromise = this.confirmationService.confirmWithCheckbox({
					message,
					detail: isWindows ? nls.localize('undoBin', "You can restore from the Recycle Bin.") : nls.localize('undoTrash', "You can restore from the Trash."),
					primaryButton,
					checkbox: {
						label: nls.localize('doNotAskAgain', "Do not ask me again")
					},
					type: 'question'
				});
			}

			// Confirm for deleting permanently
			else {
				const message = distinctElements.length > 1 ? getConfirmMessage(nls.localize('confirmDeleteMessageMultiple', "Are you sure you want to permanently delete the following {0} files?", distinctElements.length), distinctElements.map(e => e.resource))
					: distinctElements[0].isDirectory ? nls.localize('confirmDeleteMessageFolder', "Are you sure you want to permanently delete '{0}' and its contents?", distinctElements[0].name)
						: nls.localize('confirmDeleteMessageFile', "Are you sure you want to permanently delete '{0}'?", distinctElements[0].name);
				confirmDeletePromise = this.confirmationService.confirmWithCheckbox({
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
					const servicePromise = TPromise.join(distinctElements.map(e => this.fileService.del(e.resource, this.useTrash))).then(() => {
						if (distinctElements[0].parent) {
							this.tree.setFocus(distinctElements[0].parent); // move focus to parent
						}
					}, (error: any) => {

						// Handle error to delete file(s) from a modal confirmation dialog
						let errorMessage: string;
						let detailMessage: string;
						let primaryButton: string;
						if (this.useTrash) {
							errorMessage = isWindows ? nls.localize('binFailed', "Failed to delete using the Recycle Bin. Do you want to permanently delete instead?") : nls.localize('trashFailed', "Failed to delete using the Trash. Do you want to permanently delete instead?");
							detailMessage = nls.localize('irreversible', "This action is irreversible!");
							primaryButton = nls.localize({ key: 'deletePermanentlyButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Delete Permanently");
						} else {
							errorMessage = toErrorMessage(error, false);
							primaryButton = nls.localize({ key: 'retryButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Retry");
						}

						return this.confirmationService.confirm({
							message: errorMessage,
							detail: detailMessage,
							type: 'warning',
							primaryButton
						}).then(confirmed => {

							// Focus back to tree
							this.tree.domFocus();

							if (confirmed) {
								if (this.useTrash) {
									this.useTrash = false; // Delete Permanently
								}

								this.skipConfirm = true;

								return this.run();
							}

							return TPromise.as(void 0);
						});
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
		@IConfirmationService private confirmationService: IConfirmationService,
		@INotificationService notificationService: INotificationService,
		@ITextFileService textFileService: ITextFileService
	) {
		super('workbench.files.action.importFile', nls.localize('importFiles', "Import Files"), fileService, notificationService, textFileService);

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

						overwritePromise = this.confirmationService.confirm(confirm);
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
class CopyFileAction extends BaseFileAction {

	private tree: ITree;
	constructor(
		tree: ITree,
		private elements: FileStat[],
		@IFileService fileService: IFileService,
		@INotificationService notificationService: INotificationService,
		@ITextFileService textFileService: ITextFileService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IClipboardService private clipboardService: IClipboardService
	) {
		super('filesExplorer.copy', COPY_FILE_LABEL, fileService, notificationService, textFileService);

		this.tree = tree;
		this._updateEnablement();
	}

	public run(): TPromise<any> {

		// Write to clipboard as file/folder to copy
		this.clipboardService.writeFiles(this.elements.map(e => e.resource));

		// Remove highlight
		if (this.tree) {
			this.tree.clearHighlight();
		}

		this.tree.domFocus();

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
		@INotificationService notificationService: INotificationService,
		@ITextFileService textFileService: ITextFileService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(PasteFileAction.ID, PASTE_FILE_LABEL, fileService, notificationService, textFileService);

		this.tree = tree;
		this.element = element;
		if (!this.element) {
			const input: FileStat | Model = this.tree.getInput();
			this.element = input instanceof Model ? input.roots[0] : input;
		}
		this._updateEnablement();
	}

	public run(fileToPaste: URI): TPromise<any> {

		// Check if target is ancestor of pasted folder
		if (this.element.resource.toString() !== fileToPaste.toString() && resources.isEqualOrParent(this.element.resource, fileToPaste, !isLinux /* ignorecase */)) {
			throw new Error(nls.localize('fileIsAncestor', "File to paste is an ancestor of the destination folder"));
		}

		return this.fileService.resolveFile(fileToPaste).then(fileToPasteStat => {

			// Remove highlight
			if (this.tree) {
				this.tree.clearHighlight();
			}

			// Find target
			let target: FileStat;
			if (this.element.resource.toString() === fileToPaste.toString()) {
				target = this.element.parent;
			} else {
				target = this.element.isDirectory ? this.element : this.element.parent;
			}

			const targetFile = findValidPasteFileTarget(target, { resource: fileToPaste, isDirectory: fileToPasteStat.isDirectory });

			// Copy File
			return this.fileService.copyFile(fileToPaste, targetFile).then(stat => {
				if (!stat.isDirectory) {
					return this.editorService.openEditor({ resource: stat.resource, options: { pinned: true } });
				}

				return void 0;
			}, error => this.onError(error)).then(() => {
				this.tree.domFocus();
			});
		}, error => {
			this.onError(new Error(nls.localize('fileDeleted', "File to paste was deleted or moved meanwhile")));
		});
	}
}

// Duplicate File/Folder
export class DuplicateFileAction extends BaseFileAction {
	private tree: ITree;
	private target: FileStat;

	constructor(
		tree: ITree,
		fileToDuplicate: FileStat,
		target: FileStat,
		@IFileService fileService: IFileService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@INotificationService notificationService: INotificationService,
		@ITextFileService textFileService: ITextFileService
	) {
		super('workbench.files.action.duplicateFile', nls.localize('duplicateFile', "Duplicate"), fileService, notificationService, textFileService);

		this.tree = tree;
		this.element = fileToDuplicate;
		this.target = (target && target.isDirectory) ? target : fileToDuplicate.parent;
		this._updateEnablement();
	}

	public run(): TPromise<any> {

		// Remove highlight
		if (this.tree) {
			this.tree.clearHighlight();
		}

		// Copy File
		const result = this.fileService.copyFile(this.element.resource, findValidPasteFileTarget(this.target, { resource: this.element.resource, isDirectory: this.element.isDirectory })).then(stat => {
			if (!stat.isDirectory) {
				return this.editorService.openEditor({ resource: stat.resource, options: { pinned: true } });
			}

			return void 0;
		}, error => this.onError(error));

		return result;
	}
}

function findValidPasteFileTarget(targetFolder: FileStat, fileToPaste: { resource: URI, isDirectory?: boolean }): URI {
	let name = basenameOrAuthority(fileToPaste.resource);

	let candidate = targetFolder.resource.with({ path: paths.join(targetFolder.resource.path, name) });
	while (true) {
		if (!targetFolder.root.find(candidate)) {
			break;
		}

		name = incrementFileName(name, fileToPaste.isDirectory);
		candidate = targetFolder.resource.with({ path: paths.join(targetFolder.resource.path, name) });
	}

	return candidate;
}

function incrementFileName(name: string, isFolder: boolean): string {

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

// Global Compare with
export class GlobalCompareResourcesAction extends Action {

	public static readonly ID = 'workbench.files.action.compareFileWith';
	public static readonly LABEL = nls.localize('globalCompareFile', "Compare Active File With...");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@INotificationService private notificationService: INotificationService,
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
			this.notificationService.info(nls.localize('openFileToCompare', "Open a file first to compare it with another file."));
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
		@INotificationService notificationService: INotificationService,
	) {
		super(id, label, notificationService);

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
				view.getViewer().domFocus();
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
		@INotificationService private notificationService: INotificationService,
		@ICommandService private commandService: ICommandService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const resource = toResource(this.editorService.getActiveEditorInput(), { supportSideBySide: true });
		if (resource) {
			this.commandService.executeCommand(REVEAL_IN_EXPLORER_COMMAND_ID, resource);
		} else {
			this.notificationService.info(nls.localize('openFileToShow', "Open a file first to show it in the explorer"));
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
		@INotificationService private notificationService: INotificationService,
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const fileResource = toResource(this.editorService.getActiveEditorInput(), { supportSideBySide: true, filter: Schemas.file /* todo@remote */ });
		if (fileResource) {
			this.windowsService.openWindow([fileResource.fsPath], { forceNewWindow: true, forceOpenWorkspaceAsFile: true });
		} else {
			this.notificationService.info(nls.localize('openFileToShowInNewWindow', "Open a file first to open in new window"));
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

	const names: string[] = name.split(/[\\/]/).filter(part => !!part);

	// Do not allow to overwrite existing file
	if (!allowOverwriting) {
		let p = parent;
		const alreadyExisting = names.every((folderName) => {
			let { exists, child } = alreadyExists(p, folderName);

			if (!exists) {
				return false;
			} else {
				p = child;
				return true;
			}
		});

		if (alreadyExisting) {
			return nls.localize('fileNameExistsError', "A file or folder **{0}** already exists at this location. Please choose a different name.", name);
		}
	}

	// Invalid File name
	if (names.some((folderName) => !paths.isValidBasename(folderName))) {
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

function alreadyExists(parent: IFileStat, name: string): { exists: boolean, child: IFileStat | undefined } {
	let duplicateChild: IFileStat;

	if (parent.children) {
		let exists: boolean = parent.children.some((c) => {
			let found: boolean;
			if (isLinux) {
				found = c.name === name;
			} else {
				found = c.name.toLowerCase() === name.toLowerCase();
			}
			if (found) {
				duplicateChild = c;
			}
			return found;
		});
		return { exists, child: duplicateChild };
	}

	return { exists: false, child: undefined };
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
		@IFileService private fileService: IFileService
	) {
		super(id, label);

		this.enabled = true;
	}

	public run(): TPromise<any> {
		const resource: URI = toResource(this.editorService.getActiveEditorInput(), { supportSideBySide: true });
		if (resource && (this.fileService.canHandleResource(resource) || resource.scheme === Schemas.untitled)) {
			if (!this.registrationDisposal) {
				const provider = this.instantiationService.createInstance(ClipboardContentProvider);
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
function openExplorerAndRunAction(accessor: ServicesAccessor, constructor: IConstructorSignature2<ITree, IFileStat, Action>): TPromise<any> {
	const instantationService = accessor.get(IInstantiationService);
	const listService = accessor.get(IListService);
	const viewletService = accessor.get(IViewletService);
	const activeViewlet = viewletService.getActiveViewlet();
	let explorerPromise = TPromise.as(activeViewlet);
	if (!activeViewlet || activeViewlet.getId() !== VIEWLET_ID) {
		explorerPromise = viewletService.openViewlet(VIEWLET_ID, true);
	}

	return explorerPromise.then((explorer: ExplorerViewlet) => {
		const explorerView = explorer.getExplorerView();
		if (explorerView && explorerView.isVisible() && explorerView.isExpanded()) {
			explorerView.focus();
			const explorerContext = getContext(listService.lastFocusedList, viewletService);
			const action = instantationService.createInstance(constructor, listService.lastFocusedList, explorerContext.stat);

			return action.run(explorerContext);
		}

		return undefined;
	});
}

CommandsRegistry.registerCommand({
	id: NEW_FILE_COMMAND_ID,
	handler: (accessor) => {
		return openExplorerAndRunAction(accessor, NewFileAction);
	}
});

CommandsRegistry.registerCommand({
	id: NEW_FOLDER_COMMAND_ID,
	handler: (accessor) => {
		return openExplorerAndRunAction(accessor, NewFolderAction);
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
	const clipboardService = accessor.get(IClipboardService);
	const explorerContext = getContext(listService.lastFocusedList, accessor.get(IViewletService));

	return TPromise.join(distinctParents(clipboardService.readFiles(), r => r).map(toCopy => {
		const pasteFileAction = instantationService.createInstance(PasteFileAction, listService.lastFocusedList, explorerContext.stat);
		return pasteFileAction.run(toCopy);
	}));
};
