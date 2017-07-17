/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IWorkspacesMainService, IWorkspaceIdentifier, IStoredWorkspace, WORKSPACE_EXTENSION, IWorkspaceSavedEvent, WORKSPACE_FILTER } from "vs/platform/workspaces/common/workspaces";
import { TPromise } from "vs/base/common/winjs.base";
import { isParent } from "vs/platform/files/common/files";
import { IEnvironmentService } from "vs/platform/environment/common/environment";
import { extname, join, dirname } from "path";
import { mkdirp, writeFile, exists } from "vs/base/node/pfs";
import { readFileSync } from "fs";
import { isLinux, isWindows } from "vs/base/common/platform";
import { copy, delSync } from "vs/base/node/extfs";
import { nfcall } from "vs/base/common/async";
import { localize } from "vs/nls";
import Event, { Emitter } from "vs/base/common/event";
import { ILogService } from "vs/platform/log/common/log";
import { ILifecycleService, IWindowUnloadEvent, UnloadReason } from "vs/platform/lifecycle/electron-main/lifecycleMain";
import { dialog } from 'electron';

enum ConfirmResult {
	SAVE,
	DONT_SAVE,
	CANCEL
}

export class WorkspacesMainService implements IWorkspacesMainService {

	public _serviceBrand: any;

	protected workspacesHome: string;

	private _onWorkspaceSaved: Emitter<IWorkspaceSavedEvent>;
	private _onWorkspaceDeleted: Emitter<IWorkspaceIdentifier>;

	constructor(
		@IEnvironmentService private environmentService: IEnvironmentService,
		@ILogService private logService: ILogService,
		@ILifecycleService private lifecycleService: ILifecycleService
	) {
		this.workspacesHome = environmentService.workspacesHome;

		this._onWorkspaceSaved = new Emitter<IWorkspaceSavedEvent>();
		this._onWorkspaceDeleted = new Emitter<IWorkspaceIdentifier>();

		this.registerListeners();
	}

	private registerListeners(): void {
		this.lifecycleService.onBeforeWindowUnload(e => this.onBeforeWindowUnload(e));
	}

	private onBeforeWindowUnload(e: IWindowUnloadEvent): void {
		const windowClosing = e.reason === UnloadReason.CLOSE;
		const windowLoading = e.reason === UnloadReason.LOAD;
		if (!windowClosing && !windowLoading) {
			return; // only interested when window is closing or loading
		}

		const workspace = e.window.openedWorkspace;
		if (!workspace || !this.isUntitledWorkspace(workspace)) {
			return; // only care about untitled workspaces to ask for saving
		}

		this.promptToSaveWorkspace(e, workspace);
	}

	private promptToSaveWorkspace(e: IWindowUnloadEvent, workspace: IWorkspaceIdentifier): void {
		const save = { label: this.mnemonicLabel(localize({ key: 'save', comment: ['&& denotes a mnemonic'] }, "&&Save")), result: ConfirmResult.SAVE };
		const dontSave = { label: this.mnemonicLabel(localize({ key: 'doNotSave', comment: ['&& denotes a mnemonic'] }, "Do&&n't Save")), result: ConfirmResult.DONT_SAVE };
		const cancel = { label: localize('cancel', "Cancel"), result: ConfirmResult.CANCEL };

		const buttons: { label: string; result: ConfirmResult; }[] = [];
		if (isWindows) {
			buttons.push(save, dontSave, cancel);
		} else if (isLinux) {
			buttons.push(dontSave, cancel, save);
		} else {
			buttons.push(save, cancel, dontSave);
		}

		const options: Electron.ShowMessageBoxOptions = {
			title: this.environmentService.appNameLong,
			message: localize('saveWorkspaceMessage', "Do you want to save the workspace opened in this window?"),
			detail: localize('saveWorkspaceDetail', "Your workspace will be deleted if you don't save it."),
			noLink: true,
			type: 'warning',
			buttons: buttons.map(button => button.label),
			cancelId: buttons.indexOf(cancel)
		};

		if (isLinux) {
			options.defaultId = 2;
		}

		const res = dialog.showMessageBox(e.window.win, options);

		switch (buttons[res].result) {

			// Cancel: veto unload
			case ConfirmResult.CANCEL:
				e.veto(true);
				break;

			// Don't Save: delete workspace
			case ConfirmResult.DONT_SAVE:
				this.deleteWorkspace(workspace);
				e.veto(false);
				break;

			// Save: save workspace, but do not veto unload
			case ConfirmResult.SAVE: {
				const target = dialog.showSaveDialog({
					buttonLabel: localize('saveButton', "Save"),
					title: localize('saveWorkspace', "Save Workspace"),
					filters: WORKSPACE_FILTER
				});

				if (target) {
					e.veto(this.saveWorkspace(workspace, target).then(() => false, () => false));
				} else {
					e.veto(true); // keep veto if no target was provided
				}
			}
		}
	}

	private mnemonicLabel(label: string): string {
		if (!isWindows) {
			return label.replace(/\(&&\w\)|&&/g, ''); // no mnemonic support on mac/linux
		}

		return label.replace(/&&/g, '&');
	}

	public get onWorkspaceSaved(): Event<IWorkspaceSavedEvent> {
		return this._onWorkspaceSaved.event;
	}

	public get onWorkspaceDeleted(): Event<IWorkspaceIdentifier> {
		return this._onWorkspaceDeleted.event;
	}

	public resolveWorkspaceSync(path: string): IWorkspaceIdentifier {
		const isWorkspace = this.isInsideWorkspacesHome(path) || extname(path) === `.${WORKSPACE_EXTENSION}`;
		if (!isWorkspace) {
			return null; // does not look like a valid workspace config file
		}

		try {
			const workspace = JSON.parse(readFileSync(path, 'utf8')) as IStoredWorkspace;
			if (typeof workspace.id !== 'string' || !Array.isArray(workspace.folders) || workspace.folders.length === 0) {
				this.logService.log(`${path} looks like an invalid workspace file.`);

				return null; // looks like an invalid workspace file
			}

			return {
				id: workspace.id,
				configPath: path
			};
		} catch (error) {
			this.logService.log(`${path} cannot be parsed as JSON file (${error}).`);

			return null; // unable to read or parse as workspace file
		}
	}

	private isInsideWorkspacesHome(path: string): boolean {
		return isParent(path, this.environmentService.workspacesHome, !isLinux /* ignore case */);
	}

	public createWorkspace(folders: string[]): TPromise<IWorkspaceIdentifier> {
		if (!folders.length) {
			return TPromise.wrapError(new Error('Creating a workspace requires at least one folder.'));
		}

		const workspaceId = this.nextWorkspaceId();
		const workspaceConfigFolder = join(this.workspacesHome, workspaceId);
		const workspaceConfigPath = join(workspaceConfigFolder, 'workspace.json');

		return mkdirp(workspaceConfigFolder).then(() => {
			const storedWorkspace: IStoredWorkspace = {
				id: workspaceId,
				folders
			};

			return writeFile(workspaceConfigPath, JSON.stringify(storedWorkspace, null, '\t')).then(() => ({
				id: workspaceId,
				configPath: workspaceConfigPath
			}));
		});
	}

	private nextWorkspaceId(): string {
		return (Date.now() + Math.round(Math.random() * 1000)).toString();
	}

	public isUntitledWorkspace(workspace: IWorkspaceIdentifier): boolean {
		return this.isInsideWorkspacesHome(workspace.configPath);
	}

	public saveWorkspace(workspace: IWorkspaceIdentifier, target: string): TPromise<IWorkspaceIdentifier> {
		return exists(target).then(exists => {
			if (exists) {
				return TPromise.wrapError(new Error(localize('targetExists', "A workspace with the same name already exists at the provided location.")));
			}

			return nfcall(copy, workspace.configPath, target).then(() => {
				const savedWorkspace = this.resolveWorkspaceSync(target);

				// Event
				this._onWorkspaceSaved.fire({ workspace: savedWorkspace, oldConfigPath: workspace.configPath });

				// Delete untitled workspace
				this.deleteWorkspace(workspace);

				return savedWorkspace;
			});
		});
	}

	protected deleteWorkspace(workspace: IWorkspaceIdentifier): void {
		if (!this.isUntitledWorkspace(workspace)) {
			return; // only supported for untitled workspaces
		}

		// Delete from disk
		delSync(dirname(workspace.configPath));

		// Event
		this._onWorkspaceDeleted.fire(workspace);
	}
}