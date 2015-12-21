/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise, Promise} from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import {FileEditorInput} from 'vs/workbench/parts/files/browser/editors/fileEditorInput';
import {CACHE, TextFileEditorModel} from 'vs/workbench/parts/files/browser/editors/textFileEditorModel';
import {IResult, ITextFileOperationResult, ConfirmResult, ITextFileService} from 'vs/workbench/parts/files/common/files';
import {EventType} from 'vs/workbench/browser/events';
import {WorkingFilesModel} from 'vs/workbench/parts/files/browser/workingFilesModel';
import {IWorkspaceContextService} from 'vs/workbench/services/workspace/common/contextService';
import {IFileOperationResult, FileOperationResult} from 'vs/platform/files/common/files';
import {IEventService} from 'vs/platform/event/common/event';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {ILifecycleService} from 'vs/platform/lifecycle/common/lifecycle';

/**
 * The workbench file service implementation implements the raw file service spec and adds additional methods on top.
 *
 * It also adds diagnostics and logging around file system operations.
 */
export abstract class TextFileService implements ITextFileService {
	public serviceId = ITextFileService;

	private listenerToUnbind: () => void;
	private workingFilesModel: WorkingFilesModel;

	constructor(
		@IEventService private eventService: IEventService,
		@IWorkspaceContextService protected contextService: IWorkspaceContextService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILifecycleService private lifecycleService: ILifecycleService
	) {
		this.workingFilesModel = instantiationService.createInstance(WorkingFilesModel);

		this.registerListeners();
	}

	private registerListeners(): void {
		this.listenerToUnbind = this.eventService.addListener(EventType.WORKBENCH_OPTIONS_CHANGED, () => this.onOptionsChanged());
		if (this.lifecycleService) {
			this.lifecycleService.addBeforeShutdownParticipant(this);
			this.lifecycleService.onShutdown(this.dispose, this);
		}
	}

	protected onOptionsChanged(): void {
		CACHE.getAll().forEach((model) => model.updateOptions());
	}

	public getDirty(resource?: URI): URI[] {
		return this.getDirtyFileModels(resource).map((m) => m.getResource());
	}

	public isDirty(resource?: URI): boolean {
		return CACHE
			.getAll(resource)
			.some((model) => model.isDirty());
	}

	public save(resource: URI): TPromise<boolean> {
		return this.saveAll([resource]).then((result) => result.results.length === 1 && result.results[0].success);
	}

	public saveAll(arg1?: any /* URI[] */): TPromise<ITextFileOperationResult> {
		let dirtyFileModels = this.getDirtyFileModels(Array.isArray(arg1) ? arg1 : void 0 /* Save All */);

		let mapResourceToResult: { [resource: string]: IResult } = Object.create(null);
		dirtyFileModels.forEach((m) => {
			mapResourceToResult[m.getResource().toString()] = {
				source: m.getResource()
			};
		});

		return Promise.join(dirtyFileModels.map((model) => {
			return model.save().then(() => {
				if (!model.isDirty()) {
					mapResourceToResult[model.getResource().toString()].success = true;
				}
			});
		})).then((r) => {
			return {
				results: Object.keys(mapResourceToResult).map((k) => mapResourceToResult[k])
			};
		});
	}

	private getFileModels(resources?: URI[]): TextFileEditorModel[];
	private getFileModels(resource?: URI): TextFileEditorModel[];
	private getFileModels(arg1?: any): TextFileEditorModel[] {
		if (Array.isArray(arg1)) {
			let models: TextFileEditorModel[] = [];
			(<URI[]>arg1).forEach((resource) => {
				models.push(...this.getFileModels(resource));
			});

			return models;
		}

		return CACHE.getAll(<URI>arg1);
	}

	private getDirtyFileModels(resources?: URI[]): TextFileEditorModel[];
	private getDirtyFileModels(resource?: URI): TextFileEditorModel[];
	private getDirtyFileModels(arg1?: any): TextFileEditorModel[] {
		return this.getFileModels(arg1).filter((model) => model.isDirty());
	}

	public abstract saveAs(resource: URI, targetResource?: URI): TPromise<URI>;

	public confirmSave(resource?: URI): ConfirmResult {
		throw new Error('Unsupported');
	}

	public revert(resource: URI, force?: boolean): TPromise<boolean> {
		return this.revertAll([resource], force).then((result) => result.results.length === 1 && result.results[0].success);
	}

	public revertAll(resources?: URI[], force?: boolean): TPromise<ITextFileOperationResult> {
		let fileModels = force ? this.getFileModels(resources) : this.getDirtyFileModels(resources);

		let mapResourceToResult: { [resource: string]: IResult } = Object.create(null);
		fileModels.forEach((m) => {
			mapResourceToResult[m.getResource().toString()] = {
				source: m.getResource()
			};
		});

		return Promise.join(fileModels.map((model) => {
			return model.revert().then(() => {
				if (!model.isDirty()) {
					mapResourceToResult[model.getResource().toString()].success = true;
				}
			}, (error) => {

				// FileNotFound means the file got deleted meanwhile, so dispose this model
				if ((<IFileOperationResult>error).fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
					let clients = FileEditorInput.getAll(model.getResource());
					clients.forEach((input) => input.dispose(true));

					// also make sure to have it removed from any working files
					this.workingFilesModel.removeEntry(model.getResource());

					// store as successful revert
					mapResourceToResult[model.getResource().toString()].success = true;
				}

				// Otherwise bubble up the error
				else {
					return Promise.wrapError(error);
				}
			});
		})).then((r) => {
			return {
				results: Object.keys(mapResourceToResult).map((k) => mapResourceToResult[k])
			};
		});
	}

	public beforeShutdown(): boolean | TPromise<boolean> {

		// Propagate to working files model
		this.workingFilesModel.shutdown();

		return false; // no veto
	}

	public getWorkingFilesModel(): WorkingFilesModel {
		return this.workingFilesModel;
	}

	public dispose(): void {
		this.listenerToUnbind();

		this.workingFilesModel.dispose();

		// Clear all caches
		CACHE.clear();
	}
}