/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import {Promise, TPromise} from 'vs/base/common/winjs.base';
import {Registry} from 'vs/platform/platform';
import {IEditorModesRegistry, Extensions as ModesExtensions} from 'vs/editor/common/modes/modesRegistry';
import paths = require('vs/base/common/paths');
import strings = require('vs/base/common/strings');
import {isWindows} from 'vs/base/common/platform';
import URI from 'vs/base/common/uri';
import {Action} from 'vs/base/common/actions';
import {UntitledEditorModel} from 'vs/workbench/browser/parts/editor/untitledEditorModel';
import {TextFileService as BrowserTextFileService} from 'vs/workbench/parts/files/browser/textFileServices';
import {CACHE, TextFileEditorModel} from 'vs/workbench/parts/files/browser/editors/textFileEditorModel';
import {ITextFileOperationResult, ConfirmResult} from 'vs/workbench/parts/files/common/files';
import {IWorkbenchActionRegistry, Extensions as ActionExtensions} from 'vs/workbench/browser/actionRegistry';
import {SyncActionDescriptor} from 'vs/platform/actions/common/actions';
import {IUntitledEditorService} from 'vs/workbench/services/untitled/browser/untitledEditorService';
import {IMessageService, Severity} from 'vs/platform/message/common/message'
import {IFileService} from 'vs/platform/files/common/files';
import {IInstantiationService, INullService} from 'vs/platform/instantiation/common/instantiation';
import {IEventService} from 'vs/platform/event/common/event';
import {IWorkspaceContextService} from 'vs/workbench/services/workspace/common/contextService';
import {ILifecycleService} from 'vs/platform/lifecycle/common/lifecycle';

import remote = require('remote');
import ipc = require('ipc');

const Dialog = remote.require('dialog');

export class TextFileService extends BrowserTextFileService {

	constructor(
		@IEventService eventService: IEventService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IFileService private fileService: IFileService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@ILifecycleService lifecycleService: ILifecycleService
	) {
		super(eventService, contextService, instantiationService, lifecycleService);

		this.registerAutoSaveActions();
	}

	protected onOptionsChanged(): void {
		super.onOptionsChanged();

		this.registerAutoSaveActions();
	}

	private registerAutoSaveActions(): void {
		let workbenchActionsRegistry = <IWorkbenchActionRegistry>Registry.as(ActionExtensions.WorkbenchActions);
		workbenchActionsRegistry.unregisterWorkbenchAction(ToggleAutoSaveAction.ID);
		workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(ToggleAutoSaveAction, ToggleAutoSaveAction.ID, this.contextService.isAutoSaveEnabled() ? nls.localize('disableAutoSave', "Disable Auto Save") : nls.localize('enableAutoSave', "Enable Auto Save")), nls.localize('filesCategory', "Files"));
	}

	public beforeShutdown(): boolean | TPromise<boolean> {
		super.beforeShutdown();

		if (!!this.contextService.getConfiguration().env.pluginDevelopmentPath) {
			return false; // no veto when we are in plugin dev mode because we want to reload often
		}

		// Dirty files need treatment on shutdown
		if (this.getDirty().length) {
			let confirm = this.confirmSave();

			// Save
			if (confirm === ConfirmResult.SAVE) {
				return this.saveAll(true /* includeUntitled */).then((result) => {

					// Dispose saved untitled ones to not leave them around as dirty
					result.results.forEach((res) => {
						if (res.success && res.source.scheme === 'untitled') {
							let input = this.untitledEditorService.get(res.source);
							if (input) {
								input.dispose();
							}
						}
					});

					if (result.results.some((r) => !r.success)) {
						return true; // veto if some saves failed
					}

					return false; // no veto
				});
			}

			// Don't Save
			else if (confirm === ConfirmResult.DONT_SAVE) {
				return false; // no veto
			}

			// Cancel
			else if (confirm === ConfirmResult.CANCEL) {
				return true; // veto
			}
		}

		return false; // no veto
	}

	public revertAll(resources?: URI[], force?: boolean): TPromise<ITextFileOperationResult> {

		// Revert files
		return super.revertAll(resources, force).then((r) => {

			// Revert untitled
			let untitledInputs = this.untitledEditorService.getAll(resources);
			untitledInputs.forEach((input) => {
				if (input) {
					input.dispose();

					r.results.push({
						source: input.getResource(),
						success: true
					});
				}
			});

			return r;
		});
	}

	public getDirty(resource?: URI): URI[] {

		// Collect files
		let dirty = super.getDirty(resource);

		// Add untitled ones
		if (!resource) {
			dirty.push(...this.untitledEditorService.getDirty());
		} else {
			let input = this.untitledEditorService.get(resource);
			if (input && input.isDirty()) {
				dirty.push(input.getResource());
			}
		}

		return dirty;
	}

	public isDirty(resource?: URI): boolean {
		if (super.isDirty(resource)) {
			return true;
		}

		return this.untitledEditorService.getDirty().some((dirty) => !resource || dirty.toString() === resource.toString());
	}

	public confirmSave(resource?: URI): ConfirmResult {
		let resourcesToConfirm = this.getDirty(resource);
		if (resourcesToConfirm.length === 0) {
			return ConfirmResult.DONT_SAVE;
		}

		let message = [
			resourcesToConfirm.length === 1 ? nls.localize('saveChangesMessage', "Do you want to save the changes you made to {0}?", paths.basename(resourcesToConfirm[0].fsPath)) : nls.localize('saveChangesMessages', "Do you want to save the changes to the following files?")
		];

		if (resourcesToConfirm.length > 1) {
			message.push('');
			message.push(...resourcesToConfirm.map((r) => paths.basename(r.fsPath)));
			message.push('');
		}

		let opts: remote.IMessageBoxOptions = {
			title: this.contextService.getConfiguration().env.appName,
			message: message.join('\n'),
			type: 'warning',
			detail: nls.localize('saveChangesDetail', "Your changes will be lost if you don't save them."),
			buttons: [
				resourcesToConfirm.length > 1 ? nls.localize('saveAll', "Save All") : nls.localize('save', "Save"),
				nls.localize('cancel', "Cancel"),
				nls.localize('dontSave', "Don't Save")
			],
			noLink: true,
			cancelId: 1
		};

		let res = Dialog.showMessageBox(remote.getCurrentWindow(), opts);
		switch (res) {
			case 0:
				return ConfirmResult.SAVE;
			case 1:
				return ConfirmResult.CANCEL;
		}

		return ConfirmResult.DONT_SAVE;
	}

	public saveAll(includeUntitled?: boolean): TPromise<ITextFileOperationResult>;
	public saveAll(resources: URI[]): TPromise<ITextFileOperationResult>;
	public saveAll(arg1?: any): TPromise<ITextFileOperationResult> {

		// get all dirty
		let toSave: URI[] = [];
		if (Array.isArray(arg1)) {
			(<URI[]>arg1).forEach((r) => {
				toSave.push(...this.getDirty(r));
			});
		} else {
			toSave = this.getDirty();
		}

		// split up between files and untitled
		let filesToSave: URI[] = [];
		let untitledToSave: URI[] = [];
		toSave.forEach((s) => {
			if (s.scheme === 'file') {
				filesToSave.push(s);
			} else if ((Array.isArray(arg1) || arg1 === true /* includeUntitled */) && s.scheme === 'untitled') {
				untitledToSave.push(s);
			}
		});

		return this.doSaveAll(filesToSave, untitledToSave);
	}

	private doSaveAll(fileResources: URI[], untitledResources: URI[]): TPromise<ITextFileOperationResult> {

		// Preflight for untitled to handle cancellation from the dialog
		let targetsForUntitled: URI[] = [];
		for (let i = 0; i < untitledResources.length; i++) {
			let untitled = this.untitledEditorService.get(untitledResources[i]);
			if (untitled) {
				let targetPath: string;

				// Untitled with associated file path dont need to prompt
				if (this.untitledEditorService.hasAssociatedFilePath(untitled.getResource())) {
					targetPath = untitled.getResource().fsPath;
				}

				// Otherwise ask user
				else {
					targetPath = this.promptForPathSync(this.suggestFileName(untitledResources[i]));
					if (!targetPath) {
						return Promise.as({
							results: [...fileResources, ...untitledResources].map((r) => {
								return {
									source: r
								};
							})
						});
					}
				}

				targetsForUntitled.push(URI.file(targetPath));
			}
		}

		// Handle files
		return super.saveAll(fileResources).then((result) => {

			// Handle untitled
			let untitledSaveAsPromises: Promise[] = [];
			targetsForUntitled.forEach((target, index) => {
				let untitledSaveAsPromise = this.saveAs(untitledResources[index], target).then((uri) => {
					result.results.push({
						source: untitledResources[index],
						target: uri,
						success: !!uri
					});
				});

				untitledSaveAsPromises.push(untitledSaveAsPromise);
			});

			return Promise.join(untitledSaveAsPromises).then(() => {
				return result;
			});
		});
	}

	public saveAs(resource: URI, target?: URI): TPromise<URI> {

		// Get to target resource
		let targetPromise: TPromise<URI>;
		if (target) {
			targetPromise = Promise.as(target);
		} else {
			let dialogPath = resource.fsPath;
			if (resource.scheme === 'untitled') {
				dialogPath = this.suggestFileName(resource);
			}

			targetPromise = this.promptForPathAsync(dialogPath).then((path) => path ? URI.file(path) : null);
		}

		return targetPromise.then((target) => {
			if (!target) {
				return null; // user canceled
			}

			// Just save if target is same as models own resource
			if (resource.toString() === target.toString()) {
				return this.save(resource).then(() => resource);
			}

			// Do it
			return this.doSaveAs(resource, target);
		});
	}

	private doSaveAs(resource: URI, target?: URI): TPromise<URI> {

		// Retrieve text model from provided resource if any
		let modelPromise: TPromise<TextFileEditorModel | UntitledEditorModel> = TPromise.as(null);
		if (resource.scheme === 'file') {
			modelPromise = TPromise.as(CACHE.get(resource));
		} else if (resource.scheme === 'untitled') {
			let untitled = this.untitledEditorService.get(resource);
			if (untitled) {
				modelPromise = untitled.resolve();
			}
		}

		return modelPromise.then((model) => {

			// We have a model: Use it (can be null e.g. if this file is binary and not a text file or was never opened before)
			if (model) {
				return this.fileService.updateContent(target, model.getValue(), { charset: model.getEncoding() }).then(() => {
					return target;
				});
			}

			// Otherwise we can only copy
			return this.fileService.copyFile(resource, target).then(() => target);
		});
	}

	private suggestFileName(untitledResource: URI): string {
		let workspace = this.contextService.getWorkspace();
		if (workspace) {
			return URI.file(paths.join(workspace.resource.fsPath, this.untitledEditorService.get(untitledResource).suggestFileName())).fsPath;
		}

		return this.untitledEditorService.get(untitledResource).suggestFileName();
	}

	private promptForPathAsync(defaultPath?: string): TPromise<string> {
		return new TPromise<string>((c, e) => {
			Dialog.showSaveDialog(remote.getCurrentWindow(), this.getSaveDialogOptions(defaultPath ? paths.normalize(defaultPath, true) : void 0), (path) => {
				if (path && isWindows) {
					path = strings.rtrim(path, '.*'); // Bug on Windows: When "All Files" is picked, the path gets an extra ".*"
				}

				c(path);
			});
		});
	}

	private promptForPathSync(defaultPath?: string): string {
		let path = Dialog.showSaveDialog(remote.getCurrentWindow(), this.getSaveDialogOptions(defaultPath ? paths.normalize(defaultPath, true) : void 0));
		if (path && isWindows) {
			path = strings.rtrim(path, '.*'); // Bug on Windows: When "All Files" is picked, the path gets an extra ".*"
		}

		return path;
	}

	private getSaveDialogOptions(defaultPath?: string): remote.ISaveDialogOptions {
		let options: remote.ISaveDialogOptions = {
			defaultPath: defaultPath
		};

		// Filters are only working well on Windows it seems
		if (!isWindows) {
			return options;
		}

		interface IFilter { name: string, extensions: string[] };

		// Build the file filter by using our known languages
		let ext: string = paths.extname(defaultPath);
		let matchingFilter: IFilter;
		let modesRegistry = <IEditorModesRegistry>Registry.as(ModesExtensions.EditorModes);
		let filters: IFilter[] = modesRegistry.getRegisteredLanguageNames().map(languageName => {
			let extensions = modesRegistry.getExtensions(languageName);
			if (!extensions || !extensions.length) {
				return null;
			}

			let filter: IFilter = { name: languageName, extensions: extensions.map(e => strings.trim(e, '.')) };

			if (ext && extensions.indexOf(ext) >= 0) {
				matchingFilter = filter;

				return null; // matching filter will be added last to the top
			}

			return filter;
		}).filter(f => !!f);

		// Filters are a bit weird on Windows, based on having a match or not:
		// Match: we put the matching filter first so that it shows up selected and the all files last
		// No match: we put the all files filter first
		let allFilesFilter = { name: nls.localize('allFiles', "All Files"), extensions: ['*'] };
		if (matchingFilter) {
			filters.unshift(matchingFilter);
			filters.push(allFilesFilter);
		} else {
			filters.unshift(allFilesFilter);
		}

		options.filters = filters;

		return options;
	}
}

class ToggleAutoSaveAction extends Action {

	public static ID = 'workbench.action.files.toggleAutoSave';

	constructor(id: string, label: string, @INullService ns) {
		super(id, label);
	}

	public run(): Promise {
		ipc.send('vscode:toggleAutoSave');

		return Promise.as(true);
	}
}