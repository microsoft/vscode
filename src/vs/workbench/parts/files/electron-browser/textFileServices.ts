/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import {TPromise} from 'vs/base/common/winjs.base';
import paths = require('vs/base/common/paths');
import strings = require('vs/base/common/strings');
import {isWindows, isLinux} from 'vs/base/common/platform';
import URI from 'vs/base/common/uri';
import {UntitledEditorModel} from 'vs/workbench/common/editor/untitledEditorModel';
import {ConfirmResult} from 'vs/workbench/common/editor';
import {IEventService} from 'vs/platform/event/common/event';
import {TextFileService as AbstractTextFileService} from 'vs/workbench/parts/files/common/textFileServices';
import {CACHE, TextFileEditorModel} from 'vs/workbench/parts/files/common/editors/textFileEditorModel';
import {ITextFileOperationResult, AutoSaveMode, IRawTextContent} from 'vs/workbench/parts/files/common/files';
import {IUntitledEditorService} from 'vs/workbench/services/untitled/common/untitledEditorService';
import {IFileService, IResolveContentOptions} from 'vs/platform/files/common/files';
import {BinaryEditorModel} from 'vs/workbench/common/editor/binaryEditorModel';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IWorkspaceContextService} from 'vs/workbench/services/workspace/common/contextService';
import {ILifecycleService} from 'vs/platform/lifecycle/common/lifecycle';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {IModeService} from 'vs/editor/common/services/modeService';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IWindowService} from 'vs/workbench/services/window/electron-browser/windowService';
import {IEditorGroupService} from 'vs/workbench/services/group/common/groupService';
import {IModelService} from 'vs/editor/common/services/modelService';
import {ModelBuilder} from 'vs/editor/node/model/modelBuilder';

export class TextFileService extends AbstractTextFileService {

	private static MAX_CONFIRM_FILES = 10;

	constructor(
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IFileService fileService: IFileService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@ILifecycleService private lifecycleService: ILifecycleService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IConfigurationService configurationService: IConfigurationService,
		@IEventService eventService: IEventService,
		@IModeService private modeService: IModeService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@IWindowService private windowService: IWindowService,
		@IModelService modelService: IModelService
	) {
		super(contextService, instantiationService, configurationService, telemetryService, editorService, editorGroupService, eventService, fileService, modelService);

		this.init();
	}

	protected registerListeners(): void {
		super.registerListeners();

		// Lifecycle
		this.lifecycleService.onWillShutdown(event => event.veto(this.beforeShutdown()));
		this.lifecycleService.onShutdown(this.onShutdown, this);
	}

	public resolveTextContent(resource: URI, options?: IResolveContentOptions): TPromise<IRawTextContent> {
		return this.fileService.resolveStreamContent(resource, options).then((streamContent) => {
			return ModelBuilder.fromStringStream(streamContent.value, this.modelService.getCreationOptions()).then((res) => {
				let r: IRawTextContent = {
					resource: streamContent.resource,
					name: streamContent.name,
					mtime: streamContent.mtime,
					etag: streamContent.etag,
					mime: streamContent.mime,
					encoding: streamContent.encoding,
					value: res.rawText,
					valueLogicalHash: res.hash
				};
				return r;
			});
		});
	}

	public beforeShutdown(): boolean | TPromise<boolean> {

		// Dirty files need treatment on shutdown
		if (this.getDirty().length) {

			// If auto save is enabled, save all files and then check again for dirty files
			if (this.getAutoSaveMode() !== AutoSaveMode.OFF) {
				return this.saveAll(false /* files only */).then(() => {
					if (this.getDirty().length) {
						return this.confirmBeforeShutdown(); // we still have dirty files around, so confirm normally
					}

					return false; // all good, no veto
				});
			}

			// Otherwise just confirm what to do
			return this.confirmBeforeShutdown();
		}

		return false; // no veto
	}

	private confirmBeforeShutdown(): boolean | TPromise<boolean> {
		let confirm = this.confirmSave();

		// Save
		if (confirm === ConfirmResult.SAVE) {
			return this.saveAll(true /* includeUntitled */).then(result => {
				if (result.results.some(r => !r.success)) {
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

	private onShutdown(): void {
		super.dispose();
	}

	public revertAll(resources?: URI[], force?: boolean): TPromise<ITextFileOperationResult> {

		// Revert files
		return super.revertAll(resources, force).then(r => {

			// Revert untitled
			const reverted = this.untitledEditorService.revertAll(resources);
			reverted.forEach(res => r.results.push({ source: res, success: true }));

			return r;
		});
	}

	public getDirty(resources?: URI[]): URI[] {

		// Collect files
		let dirty = super.getDirty(resources);

		// Add untitled ones
		if (!resources) {
			dirty.push(...this.untitledEditorService.getDirty());
		} else {
			let dirtyUntitled = resources.map(r => this.untitledEditorService.get(r)).filter(u => u && u.isDirty()).map(u => u.getResource());
			dirty.push(...dirtyUntitled);
		}

		return dirty;
	}

	public isDirty(resource?: URI): boolean {
		if (super.isDirty(resource)) {
			return true;
		}

		return this.untitledEditorService.getDirty().some(dirty => !resource || dirty.toString() === resource.toString());
	}

	public confirmSave(resources?: URI[]): ConfirmResult {
		if (!!this.contextService.getConfiguration().env.extensionDevelopmentPath) {
			return ConfirmResult.DONT_SAVE; // no veto when we are in extension dev mode because we cannot assum we run interactive (e.g. tests)
		}

		let resourcesToConfirm = this.getDirty(resources);
		if (resourcesToConfirm.length === 0) {
			return ConfirmResult.DONT_SAVE;
		}

		let message = [
			resourcesToConfirm.length === 1 ? nls.localize('saveChangesMessage', "Do you want to save the changes you made to {0}?", paths.basename(resourcesToConfirm[0].fsPath)) : nls.localize('saveChangesMessages', "Do you want to save the changes to the following {0} files?", resourcesToConfirm.length)
		];

		if (resourcesToConfirm.length > 1) {
			message.push('');
			message.push(...resourcesToConfirm.slice(0, TextFileService.MAX_CONFIRM_FILES).map(r => paths.basename(r.fsPath)));

			if (resourcesToConfirm.length > TextFileService.MAX_CONFIRM_FILES) {
				if (resourcesToConfirm.length - TextFileService.MAX_CONFIRM_FILES === 1) {
					message.push(nls.localize('moreFile', "...1 additional file not shown"));
				} else {
					message.push(nls.localize('moreFiles', "...{0} additional files not shown", resourcesToConfirm.length - TextFileService.MAX_CONFIRM_FILES));
				}
			}

			message.push('');
		}

		// Button order
		// Windows: Save | Don't Save | Cancel
		// Mac: Save | Cancel | Don't Save
		// Linux: Don't Save | Cancel | Save

		const save = { label: resourcesToConfirm.length > 1 ? this.mnemonicLabel(nls.localize({ key: 'saveAll', comment: ['&& denotes a mnemonic'] }, "&&Save All")) : this.mnemonicLabel(nls.localize({ key: 'save', comment: ['&& denotes a mnemonic'] }, "&&Save")), result: ConfirmResult.SAVE };
		const dontSave = { label: this.mnemonicLabel(nls.localize({ key: 'dontSave', comment: ['&& denotes a mnemonic'] }, "Do&&n't Save")), result: ConfirmResult.DONT_SAVE };
		const cancel = { label: nls.localize('cancel', "Cancel"), result: ConfirmResult.CANCEL };

		const buttons = [];
		if (isWindows) {
			buttons.push(save, dontSave, cancel);
		} else if (isLinux) {
			buttons.push(dontSave, cancel, save);
		} else {
			buttons.push(save, cancel, dontSave);
		}

		let opts: Electron.ShowMessageBoxOptions = {
			title: this.contextService.getConfiguration().env.appName,
			message: message.join('\n'),
			type: 'warning',
			detail: nls.localize('saveChangesDetail', "Your changes will be lost if you don't save them."),
			buttons: buttons.map(b => b.label),
			noLink: true,
			cancelId: buttons.indexOf(cancel)
		};

		if (isLinux) {
			opts.defaultId = 2;
		}

		const choice = this.windowService.getWindow().showMessageBox(opts);

		return buttons[choice].result;
	}

	private mnemonicLabel(label: string): string {
		if (!isWindows) {
			return label.replace(/\(&&\w\)|&&/g, ''); // no mnemonic support on mac/linux
		}

		return label.replace(/&&/g, '&');
	}

	public saveAll(includeUntitled?: boolean): TPromise<ITextFileOperationResult>;
	public saveAll(resources: URI[]): TPromise<ITextFileOperationResult>;
	public saveAll(arg1?: any): TPromise<ITextFileOperationResult> {

		// get all dirty
		let toSave: URI[] = [];
		if (Array.isArray(arg1)) {
			toSave = this.getDirty(arg1);
		} else {
			toSave = this.getDirty();
		}

		// split up between files and untitled
		let filesToSave: URI[] = [];
		let untitledToSave: URI[] = [];
		toSave.forEach(s => {
			if (s.scheme === 'file') {
				filesToSave.push(s);
			} else if ((Array.isArray(arg1) || arg1 === true /* includeUntitled */) && s.scheme === 'untitled') {
				untitledToSave.push(s);
			}
		});

		return this.doSaveAll(filesToSave, untitledToSave);
	}

	private doSaveAll(fileResources: URI[], untitledResources: URI[]): TPromise<ITextFileOperationResult> {

		// Handle files first that can just be saved
		return super.saveAll(fileResources).then(result => {

			// Preflight for untitled to handle cancellation from the dialog
			let targetsForUntitled: URI[] = [];
			for (let i = 0; i < untitledResources.length; i++) {
				let untitled = this.untitledEditorService.get(untitledResources[i]);
				if (untitled) {
					let targetPath: string;

					// Untitled with associated file path don't need to prompt
					if (this.untitledEditorService.hasAssociatedFilePath(untitled.getResource())) {
						targetPath = untitled.getResource().fsPath;
					}

					// Otherwise ask user
					else {
						targetPath = this.promptForPath(this.suggestFileName(untitledResources[i]));
						if (!targetPath) {
							return TPromise.as({
								results: [...fileResources, ...untitledResources].map(r => {
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

			// Handle untitled
			let untitledSaveAsPromises: TPromise<void>[] = [];
			targetsForUntitled.forEach((target, index) => {
				let untitledSaveAsPromise = this.saveAs(untitledResources[index], target).then(uri => {
					result.results.push({
						source: untitledResources[index],
						target: uri,
						success: !!uri
					});
				});

				untitledSaveAsPromises.push(untitledSaveAsPromise);
			});

			return TPromise.join(untitledSaveAsPromises).then(() => {
				return result;
			});
		});
	}

	public saveAs(resource: URI, target?: URI): TPromise<URI> {

		// Get to target resource
		if (!target) {
			let dialogPath = resource.fsPath;
			if (resource.scheme === 'untitled') {
				dialogPath = this.suggestFileName(resource);
			}

			const pathRaw = this.promptForPath(dialogPath);
			if (pathRaw) {
				target = URI.file(pathRaw);
			}
		}

		if (!target) {
			return TPromise.as(null); // user canceled
		}

		// Just save if target is same as models own resource
		if (resource.toString() === target.toString()) {
			return this.save(resource).then(() => resource);
		}

		// Do it
		return this.doSaveAs(resource, target);
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

		return modelPromise.then(model => {

			// We have a model: Use it (can be null e.g. if this file is binary and not a text file or was never opened before)
			if (model) {
				return this.doSaveTextFileAs(model, resource, target);
			}

			// Otherwise we can only copy
			return this.fileService.copyFile(resource, target);
		}).then(() => {

			// Revert the source
			return this.revert(resource).then(() => {

				// Done: return target
				return target;
			});
		});
	}

	private doSaveTextFileAs(sourceModel: TextFileEditorModel | UntitledEditorModel, resource: URI, target: URI): TPromise<void> {
		// create the target file empty if it does not exist already
		return this.fileService.resolveFile(target).then(stat => stat, () => null).then(stat => stat || this.fileService.createFile(target)).then(stat => {
			// resolve a model for the file (which can be binary if the file is not a text file)
			return this.editorService.resolveEditorModel({ resource: target }).then((targetModel: TextFileEditorModel) => {
				// binary model: delete the file and run the operation again
				if (targetModel instanceof BinaryEditorModel) {
					return this.fileService.del(target).then(() => this.doSaveTextFileAs(sourceModel, resource, target));
				}

				// text model: take over encoding and model value from source model
				targetModel.updatePreferredEncoding(sourceModel.getEncoding());
				targetModel.textEditorModel.setValue(sourceModel.getValue());

				// save model
				return targetModel.save();
			});
		});
	}

	private suggestFileName(untitledResource: URI): string {
		let workspace = this.contextService.getWorkspace();
		if (workspace) {
			return URI.file(paths.join(workspace.resource.fsPath, this.untitledEditorService.get(untitledResource).suggestFileName())).fsPath;
		}

		return this.untitledEditorService.get(untitledResource).suggestFileName();
	}

	private promptForPath(defaultPath?: string): string {
		return this.windowService.getWindow().showSaveDialog(this.getSaveDialogOptions(defaultPath ? paths.normalize(defaultPath, true) : void 0));
	}

	private getSaveDialogOptions(defaultPath?: string): Electron.SaveDialogOptions {
		let options: Electron.SaveDialogOptions = {
			defaultPath: defaultPath
		};

		// Filters are working flaky in Electron and there are bugs. On Windows they are working
		// somewhat but we see issues:
		// - https://github.com/electron/electron/issues/3556
		// - https://github.com/Microsoft/vscode/issues/451
		// - Bug on Windows: When "All Files" is picked, the path gets an extra ".*"
		// Until these issues are resolved, we disable the dialog file extension filtering.
		let disable = true; // Simply using if (true) flags the code afterwards as not reachable.
		if (disable) {
			return options;
		}

		interface IFilter { name: string; extensions: string[]; }

		// Build the file filter by using our known languages
		let ext: string = paths.extname(defaultPath);
		let matchingFilter: IFilter;
		let filters: IFilter[] = this.modeService.getRegisteredLanguageNames().map(languageName => {
			let extensions = this.modeService.getExtensions(languageName);
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