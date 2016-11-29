/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import paths = require('vs/base/common/paths');
import DOM = require('vs/base/browser/dom');
import errors = require('vs/base/common/errors');
import objects = require('vs/base/common/objects');
import Event, { Emitter } from 'vs/base/common/event';
import { IResult, ITextFileOperationResult, ITextFileService, IRawTextContent, IAutoSaveConfiguration, AutoSaveMode, SaveReason, ITextFileEditorModelManager, ITextFileEditorModel, ISaveOptions } from 'vs/workbench/services/textfile/common/textfiles';
import { ConfirmResult } from 'vs/workbench/common/editor';
import { ILifecycleService, ShutdownReason } from 'vs/platform/lifecycle/common/lifecycle';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IFileService, IResolveContentOptions, IFilesConfiguration, IFileOperationResult, FileOperationResult, AutoSaveConfiguration } from 'vs/platform/files/common/files';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { UntitledEditorModel } from 'vs/workbench/common/editor/untitledEditorModel';
import { TextFileEditorModelManager } from 'vs/workbench/services/textfile/common/textFileEditorModelManager';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IBackupService } from 'vs/workbench/services/backup/common/backup';
import { IMessageService, Severity } from 'vs/platform/message/common/message';

/**
 * The workbench file service implementation implements the raw file service spec and adds additional methods on top.
 *
 * It also adds diagnostics and logging around file system operations.
 */
export abstract class TextFileService implements ITextFileService {

	public _serviceBrand: any;

	private toUnbind: IDisposable[];
	private _models: TextFileEditorModelManager;

	private _onFilesAssociationChange: Emitter<void>;
	private currentFilesAssociationConfig: { [key: string]: string; };

	private _onAutoSaveConfigurationChange: Emitter<IAutoSaveConfiguration>;
	private configuredAutoSaveDelay: number;
	private configuredAutoSaveOnFocusChange: boolean;
	private configuredAutoSaveOnWindowChange: boolean;

	constructor(
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IConfigurationService private configurationService: IConfigurationService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IFileService protected fileService: IFileService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IBackupService private backupService: IBackupService,
		@IMessageService private messageService: IMessageService
	) {
		this.toUnbind = [];

		this._onAutoSaveConfigurationChange = new Emitter<IAutoSaveConfiguration>();
		this.toUnbind.push(this._onAutoSaveConfigurationChange);

		this._onFilesAssociationChange = new Emitter<void>();
		this.toUnbind.push(this._onFilesAssociationChange);

		this._models = this.instantiationService.createInstance(TextFileEditorModelManager);

		const configuration = this.configurationService.getConfiguration<IFilesConfiguration>();
		this.currentFilesAssociationConfig = configuration && configuration.files && configuration.files.associations;

		this.onConfigurationChange(configuration);

		this.telemetryService.publicLog('autoSave', this.getAutoSaveConfiguration());

		this.registerListeners();
	}

	public get models(): ITextFileEditorModelManager {
		return this._models;
	}

	abstract resolveTextContent(resource: URI, options?: IResolveContentOptions): TPromise<IRawTextContent>;

	abstract promptForPath(defaultPath?: string): string;

	abstract confirmSave(resources?: URI[]): ConfirmResult;

	public get onAutoSaveConfigurationChange(): Event<IAutoSaveConfiguration> {
		return this._onAutoSaveConfigurationChange.event;
	}

	public get onFilesAssociationChange(): Event<void> {
		return this._onFilesAssociationChange.event;
	}

	private registerListeners(): void {

		// Lifecycle
		this.lifecycleService.onWillShutdown(event => event.veto(this.beforeShutdown(event.reason)));
		this.lifecycleService.onShutdown(this.dispose, this);

		// Configuration changes
		this.toUnbind.push(this.configurationService.onDidUpdateConfiguration(e => this.onConfigurationChange(e.config)));

		// Application & Editor focus change
		this.toUnbind.push(DOM.addDisposableListener(window, DOM.EventType.BLUR, () => this.onWindowFocusLost()));
		this.toUnbind.push(DOM.addDisposableListener(window, DOM.EventType.BLUR, () => this.onEditorFocusChanged(), true));
		this.toUnbind.push(this.editorGroupService.onEditorsChanged(() => this.onEditorFocusChanged()));
	}

	private beforeShutdown(reason: ShutdownReason): boolean | TPromise<boolean> {

		// Dirty files need treatment on shutdown
		const dirty = this.getDirty();
		if (dirty.length) {

			// If auto save is enabled, save all files and then check again for dirty files
			let handleAutoSave: TPromise<URI[] /* remaining dirty resources */>;
			if (this.getAutoSaveMode() !== AutoSaveMode.OFF) {
				handleAutoSave = this.saveAll(false /* files only */).then(() => this.getDirty());
			} else {
				handleAutoSave = TPromise.as(dirty);
			}

			return handleAutoSave.then(dirty => {

				// If we still have dirty files, we either have untitled ones or files that cannot be saved
				// or auto save was not enabled and as such we did not save any dirty files to disk automatically
				if (dirty.length) {

					// If hot exit is enabled, backup dirty files and allow to exit without confirmation
					if (this.backupService.isHotExitEnabled) {
						return this.backupService.backupBeforeShutdown(dirty, this.models, reason).then(result => {
							if (result.didBackup) {
								return this.noVeto({ cleanUpBackups: false }); // no veto and no backup cleanup (since backup was successful)
							}

							// since a backup did not happen, we have to confirm for the dirty files now
							return this.confirmBeforeShutdown();
						}, errors => {
							const firstError = errors[0];
							this.messageService.show(Severity.Error, nls.localize('files.backup.failSave', "Files could not be backed up (Error: {0}), try saving your files to exit.", firstError.message));

							return true; // veto, the backups failed
						});
					}

					// Otherwise just confirm from the user what to do with the dirty files
					return this.confirmBeforeShutdown();
				}
			});
		}

		// No dirty files: no veto
		return this.noVeto({ cleanUpBackups: true });
	}

	private confirmBeforeShutdown(): boolean | TPromise<boolean> {
		const confirm = this.confirmSave();

		// Save
		if (confirm === ConfirmResult.SAVE) {
			return this.saveAll(true /* includeUntitled */).then(result => {
				if (result.results.some(r => !r.success)) {
					return true; // veto if some saves failed
				}

				return this.noVeto({ cleanUpBackups: true });
			});
		}

		// Don't Save
		else if (confirm === ConfirmResult.DONT_SAVE) {
			return this.noVeto({ cleanUpBackups: true });
		}

		// Cancel
		else if (confirm === ConfirmResult.CANCEL) {
			return true; // veto
		}
	}

	private noVeto(options: { cleanUpBackups: boolean }): boolean | TPromise<boolean> {
		if (!options.cleanUpBackups) {
			return false;
		}

		return this.backupService.cleanupBackupsBeforeShutdown().then(() => false, () => false);
	}

	private onWindowFocusLost(): void {
		if (this.configuredAutoSaveOnWindowChange && this.isDirty()) {
			this.saveAll(void 0, SaveReason.WINDOW_CHANGE).done(null, errors.onUnexpectedError);
		}
	}

	private onEditorFocusChanged(): void {
		if (this.configuredAutoSaveOnFocusChange && this.isDirty()) {
			this.saveAll(void 0, SaveReason.FOCUS_CHANGE).done(null, errors.onUnexpectedError);
		}
	}

	private onConfigurationChange(configuration: IFilesConfiguration): void {
		const wasAutoSaveEnabled = (this.getAutoSaveMode() !== AutoSaveMode.OFF);

		const autoSaveMode = (configuration && configuration.files && configuration.files.autoSave) || AutoSaveConfiguration.OFF;
		switch (autoSaveMode) {
			case AutoSaveConfiguration.AFTER_DELAY:
				this.configuredAutoSaveDelay = configuration && configuration.files && configuration.files.autoSaveDelay;
				this.configuredAutoSaveOnFocusChange = false;
				this.configuredAutoSaveOnWindowChange = false;
				break;

			case AutoSaveConfiguration.ON_FOCUS_CHANGE:
				this.configuredAutoSaveDelay = void 0;
				this.configuredAutoSaveOnFocusChange = true;
				this.configuredAutoSaveOnWindowChange = false;
				break;

			case AutoSaveConfiguration.ON_WINDOW_CHANGE:
				this.configuredAutoSaveDelay = void 0;
				this.configuredAutoSaveOnFocusChange = false;
				this.configuredAutoSaveOnWindowChange = true;
				break;

			default:
				this.configuredAutoSaveDelay = void 0;
				this.configuredAutoSaveOnFocusChange = false;
				this.configuredAutoSaveOnWindowChange = false;
				break;
		}

		// Emit as event
		this._onAutoSaveConfigurationChange.fire(this.getAutoSaveConfiguration());

		// save all dirty when enabling auto save
		if (!wasAutoSaveEnabled && this.getAutoSaveMode() !== AutoSaveMode.OFF) {
			this.saveAll().done(null, errors.onUnexpectedError);
		}

		// Check for change in files associations
		const filesAssociation = configuration && configuration.files && configuration.files.associations;
		if (!objects.equals(this.currentFilesAssociationConfig, filesAssociation)) {
			this.currentFilesAssociationConfig = filesAssociation;
			this._onFilesAssociationChange.fire();
		}
	}

	public getDirty(resources?: URI[]): URI[] {

		// Collect files
		const dirty = this.getDirtyFileModels(resources).map(m => m.getResource());

		// Add untitled ones
		if (!resources) {
			dirty.push(...this.untitledEditorService.getDirty());
		} else {
			const dirtyUntitled = resources.map(r => this.untitledEditorService.get(r)).filter(u => u && u.isDirty()).map(u => u.getResource());
			dirty.push(...dirtyUntitled);
		}

		return dirty;
	}

	public isDirty(resource?: URI): boolean {

		// Check for dirty file
		if (this._models.getAll(resource).some(model => model.isDirty())) {
			return true;
		}

		// Check for dirty untitled
		return this.untitledEditorService.getDirty().some(dirty => !resource || dirty.toString() === resource.toString());
	}

	public save(resource: URI, options?: ISaveOptions): TPromise<boolean> {

		// touch resource if options tell so and file is not dirty
		if (options && options.force && resource.scheme === 'file' && !this.isDirty(resource)) {
			return this.fileService.touchFile(resource).then(() => true, () => true /* gracefully ignore errors if just touching */);
		}

		return this.saveAll([resource]).then(result => result.results.length === 1 && result.results[0].success);
	}

	public saveAll(includeUntitled?: boolean, reason?: SaveReason): TPromise<ITextFileOperationResult>;
	public saveAll(resources: URI[], reason?: SaveReason): TPromise<ITextFileOperationResult>;
	public saveAll(arg1?: any, reason?: SaveReason): TPromise<ITextFileOperationResult> {

		// get all dirty
		let toSave: URI[] = [];
		if (Array.isArray(arg1)) {
			toSave = this.getDirty(arg1);
		} else {
			toSave = this.getDirty();
		}

		// split up between files and untitled
		const filesToSave: URI[] = [];
		const untitledToSave: URI[] = [];
		toSave.forEach(s => {
			if (s.scheme === 'file') {
				filesToSave.push(s);
			} else if ((Array.isArray(arg1) || arg1 === true /* includeUntitled */) && s.scheme === 'untitled') {
				untitledToSave.push(s);
			}
		});

		return this.doSaveAll(filesToSave, untitledToSave, reason);
	}

	private doSaveAll(fileResources: URI[], untitledResources: URI[], reason?: SaveReason): TPromise<ITextFileOperationResult> {

		// Handle files first that can just be saved
		return this.doSaveAllFiles(fileResources, reason).then(result => {

			// Preflight for untitled to handle cancellation from the dialog
			const targetsForUntitled: URI[] = [];
			for (let i = 0; i < untitledResources.length; i++) {
				const untitled = this.untitledEditorService.get(untitledResources[i]);
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
			const untitledSaveAsPromises: TPromise<void>[] = [];
			targetsForUntitled.forEach((target, index) => {
				const untitledSaveAsPromise = this.saveAs(untitledResources[index], target).then(uri => {
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

	private doSaveAllFiles(arg1?: any /* URI[] */, reason?: SaveReason): TPromise<ITextFileOperationResult> {
		const dirtyFileModels = this.getDirtyFileModels(Array.isArray(arg1) ? arg1 : void 0 /* Save All */);

		const mapResourceToResult: { [resource: string]: IResult } = Object.create(null);
		dirtyFileModels.forEach(m => {
			mapResourceToResult[m.getResource().toString()] = {
				source: m.getResource()
			};
		});

		return TPromise.join(dirtyFileModels.map(model => {
			return model.save({ reason }).then(() => {
				if (!model.isDirty()) {
					mapResourceToResult[model.getResource().toString()].success = true;
				}
			});
		})).then(r => {
			return {
				results: Object.keys(mapResourceToResult).map(k => mapResourceToResult[k])
			};
		});
	}

	private getFileModels(resources?: URI[]): ITextFileEditorModel[];
	private getFileModels(resource?: URI): ITextFileEditorModel[];
	private getFileModels(arg1?: any): ITextFileEditorModel[] {
		if (Array.isArray(arg1)) {
			const models: ITextFileEditorModel[] = [];
			(<URI[]>arg1).forEach(resource => {
				models.push(...this.getFileModels(resource));
			});

			return models;
		}

		return this._models.getAll(<URI>arg1);
	}

	private getDirtyFileModels(resources?: URI[]): ITextFileEditorModel[];
	private getDirtyFileModels(resource?: URI): ITextFileEditorModel[];
	private getDirtyFileModels(arg1?: any): ITextFileEditorModel[] {
		return this.getFileModels(arg1).filter(model => model.isDirty());
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
		let modelPromise: TPromise<ITextFileEditorModel | UntitledEditorModel> = TPromise.as(null);
		if (resource.scheme === 'file') {
			modelPromise = TPromise.as(this._models.get(resource));
		} else if (resource.scheme === 'untitled') {
			const untitled = this.untitledEditorService.get(resource);
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

	private doSaveTextFileAs(sourceModel: ITextFileEditorModel | UntitledEditorModel, resource: URI, target: URI): TPromise<void> {

		// create the target file empty if it does not exist already
		return this.fileService.resolveFile(target).then(stat => stat, () => null).then(stat => stat || this.fileService.createFile(target)).then(stat => {

			// resolve a model for the file (which can be binary if the file is not a text file)
			return this.models.loadOrCreate(target).then((targetModel: ITextFileEditorModel) => {

				// take over encoding and model value from source model
				targetModel.updatePreferredEncoding(sourceModel.getEncoding());
				targetModel.textEditorModel.setValue(sourceModel.getValue());

				// save model
				return targetModel.save();
			}, error => {

				// binary model: delete the file and run the operation again
				if ((<IFileOperationResult>error).fileOperationResult === FileOperationResult.FILE_IS_BINARY || (<IFileOperationResult>error).fileOperationResult === FileOperationResult.FILE_TOO_LARGE) {
					return this.fileService.del(target).then(() => this.doSaveTextFileAs(sourceModel, resource, target));
				}

				return TPromise.wrapError(error);
			});
		});
	}

	private suggestFileName(untitledResource: URI): string {
		const workspace = this.contextService.getWorkspace();
		if (workspace) {
			return URI.file(paths.join(workspace.resource.fsPath, this.untitledEditorService.get(untitledResource).suggestFileName())).fsPath;
		}

		return this.untitledEditorService.get(untitledResource).suggestFileName();
	}

	public revert(resource: URI, force?: boolean): TPromise<boolean> {
		return this.revertAll([resource], force).then(result => result.results.length === 1 && result.results[0].success);
	}

	public revertAll(resources?: URI[], force?: boolean): TPromise<ITextFileOperationResult> {

		// Revert files first
		return this.doRevertAllFiles(resources, force).then(operation => {

			// Revert untitled
			const reverted = this.untitledEditorService.revertAll(resources);
			reverted.forEach(res => operation.results.push({ source: res, success: true }));

			return operation;
		});
	}

	private doRevertAllFiles(resources?: URI[], force?: boolean): TPromise<ITextFileOperationResult> {
		const fileModels = force ? this.getFileModels(resources) : this.getDirtyFileModels(resources);

		const mapResourceToResult: { [resource: string]: IResult } = Object.create(null);
		fileModels.forEach(m => {
			mapResourceToResult[m.getResource().toString()] = {
				source: m.getResource()
			};
		});

		return TPromise.join(fileModels.map(model => {
			return model.revert().then(() => {
				if (!model.isDirty()) {
					mapResourceToResult[model.getResource().toString()].success = true;
				}
			}, error => {

				// FileNotFound means the file got deleted meanwhile, so still record as successful revert
				if ((<IFileOperationResult>error).fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
					mapResourceToResult[model.getResource().toString()].success = true;
				}

				// Otherwise bubble up the error
				else {
					return TPromise.wrapError(error);
				}
			});
		})).then(r => {
			return {
				results: Object.keys(mapResourceToResult).map(k => mapResourceToResult[k])
			};
		});
	}

	public getAutoSaveMode(): AutoSaveMode {
		if (this.configuredAutoSaveOnFocusChange) {
			return AutoSaveMode.ON_FOCUS_CHANGE;
		}

		if (this.configuredAutoSaveOnWindowChange) {
			return AutoSaveMode.ON_WINDOW_CHANGE;
		}

		if (this.configuredAutoSaveDelay && this.configuredAutoSaveDelay > 0) {
			return this.configuredAutoSaveDelay <= 1000 ? AutoSaveMode.AFTER_SHORT_DELAY : AutoSaveMode.AFTER_LONG_DELAY;
		}

		return AutoSaveMode.OFF;
	}

	public getAutoSaveConfiguration(): IAutoSaveConfiguration {
		return {
			autoSaveDelay: this.configuredAutoSaveDelay && this.configuredAutoSaveDelay > 0 ? this.configuredAutoSaveDelay : void 0,
			autoSaveFocusChange: this.configuredAutoSaveOnFocusChange,
			autoSaveApplicationChange: this.configuredAutoSaveOnWindowChange
		};
	}

	public dispose(): void {
		this.toUnbind = dispose(this.toUnbind);

		// Clear all caches
		this._models.clear();
	}
}