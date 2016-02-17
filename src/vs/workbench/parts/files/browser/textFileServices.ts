/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import errors = require('vs/base/common/errors');
import {ListenerUnbind} from 'vs/base/common/eventEmitter';
import Event, {Emitter} from 'vs/base/common/event';
import {FileEditorInput} from 'vs/workbench/parts/files/browser/editors/fileEditorInput';
import {CACHE, TextFileEditorModel} from 'vs/workbench/parts/files/common/editors/textFileEditorModel';
import {IResult, ITextFileOperationResult, ConfirmResult, ITextFileService, IAutoSaveConfiguration, AutoSaveMode} from 'vs/workbench/parts/files/common/files';
import {EventType} from 'vs/workbench/common/events';
import {WorkingFilesModel} from 'vs/workbench/parts/files/common/workingFilesModel';
import {IWorkspaceContextService} from 'vs/workbench/services/workspace/common/contextService';
import {IFilesConfiguration, IFileOperationResult, FileOperationResult, AutoSaveConfiguration} from 'vs/platform/files/common/files';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {ILifecycleService} from 'vs/platform/lifecycle/common/lifecycle';
import {IEventService} from 'vs/platform/event/common/event';
import {IConfigurationService, IConfigurationServiceEvent, ConfigurationServiceEventTypes} from 'vs/platform/configuration/common/configuration';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';

/**
 * The workbench file service implementation implements the raw file service spec and adds additional methods on top.
 *
 * It also adds diagnostics and logging around file system operations.
 */
export abstract class TextFileService implements ITextFileService {

	public serviceId = ITextFileService;

	private listenerToUnbind: ListenerUnbind[];
	private _workingFilesModel: WorkingFilesModel;

	private _onAutoSaveConfigurationChange: Emitter<IAutoSaveConfiguration>;

	private configuredAutoSaveDelay: number;
	private configuredAutoSaveOnFocusChange: boolean;

	constructor(
		@IWorkspaceContextService protected contextService: IWorkspaceContextService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IConfigurationService private configurationService: IConfigurationService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IEventService private eventService: IEventService
	) {
		this.listenerToUnbind = [];
		this._onAutoSaveConfigurationChange = new Emitter<IAutoSaveConfiguration>();
	}

	protected init(): void {
		this.registerListeners();
		this.loadConfiguration();
	}

	public get onAutoSaveConfigurationChange(): Event<IAutoSaveConfiguration> {
		return this._onAutoSaveConfigurationChange.event;
	}

	private get workingFilesModel(): WorkingFilesModel {
		if (!this._workingFilesModel) {
			this._workingFilesModel = this.instantiationService.createInstance(WorkingFilesModel);
		}

		return this._workingFilesModel;
	}

	private registerListeners(): void {

		// Lifecycle
		this.lifecycleService.addBeforeShutdownParticipant(this);
		this.lifecycleService.onShutdown(this.dispose, this);

		// Configuration changes
		this.listenerToUnbind.push(this.configurationService.addListener(ConfigurationServiceEventTypes.UPDATED, (e: IConfigurationServiceEvent) => this.onConfigurationChange(e.config)));

		// Editor focus change
		window.addEventListener('blur', () => this.onEditorFocusChange(), true);
		this.listenerToUnbind.push(this.eventService.addListener(EventType.EDITOR_INPUT_CHANGED, () => this.onEditorFocusChange()));
	}

	private onEditorFocusChange(): void {
		if (this.configuredAutoSaveOnFocusChange && this.getDirty().length) {
			this.saveAll().done(null, errors.onUnexpectedError); // save dirty files when we change focus in the editor area
		}
	}

	private loadConfiguration(): void {
		this.configurationService.loadConfiguration().done((configuration: IFilesConfiguration) => {
			this.onConfigurationChange(configuration);

			// we want to find out about this setting from telemetry
			this.telemetryService.publicLog('autoSave', this.getAutoSaveConfiguration());
		}, errors.onUnexpectedError);
	}

	private onConfigurationChange(configuration: IFilesConfiguration): void {
		const wasAutoSaveEnabled = (this.getAutoSaveMode() !== AutoSaveMode.OFF);

		const autoSaveMode = (configuration && configuration.files && configuration.files.autoSave) || AutoSaveConfiguration.OFF;
		switch (autoSaveMode) {
			case AutoSaveConfiguration.AFTER_DELAY:
				this.configuredAutoSaveDelay = configuration && configuration.files && configuration.files.autoSaveDelay;
				this.configuredAutoSaveOnFocusChange = false;
				break;

			case AutoSaveConfiguration.ON_FOCUS_CHANGE:
				this.configuredAutoSaveDelay = void 0;
				this.configuredAutoSaveOnFocusChange = true;
				break;

			default:
				this.configuredAutoSaveDelay = void 0;
				this.configuredAutoSaveOnFocusChange = false;
				break;
		}

		// Emit as event
		this._onAutoSaveConfigurationChange.fire(this.getAutoSaveConfiguration());

		// save all dirty when enabling auto save
		if (!wasAutoSaveEnabled && this.getAutoSaveMode() !== AutoSaveMode.OFF) {
			this.saveAll().done(null, errors.onUnexpectedError);
		}
	}

	public getDirty(resources?: URI[]): URI[] {
		return this.getDirtyFileModels(resources).map((m) => m.getResource());
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

		return TPromise.join(dirtyFileModels.map((model) => {
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

	public confirmSave(resources?: URI[]): ConfirmResult {
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

		return TPromise.join(fileModels.map((model) => {
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
					return TPromise.wrapError(error);
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

	public getAutoSaveMode(): AutoSaveMode {
		if (this.configuredAutoSaveOnFocusChange) {
			return AutoSaveMode.ON_FOCUS_CHANGE;
		}

		if (this.configuredAutoSaveDelay && this.configuredAutoSaveDelay > 0) {
			return this.configuredAutoSaveDelay <= 1000 ? AutoSaveMode.AFTER_SHORT_DELAY :  AutoSaveMode.AFTER_LONG_DELAY;
		}

		return AutoSaveMode.OFF;
	}

	public getAutoSaveConfiguration(): IAutoSaveConfiguration {
		return {
			autoSaveDelay: this.configuredAutoSaveDelay && this.configuredAutoSaveDelay > 0 ? this.configuredAutoSaveDelay : void 0,
			autoSaveFocusChange: this.configuredAutoSaveOnFocusChange
		};
	}

	public dispose(): void {
		while (this.listenerToUnbind.length) {
			this.listenerToUnbind.pop()();
		}

		this.workingFilesModel.dispose();

		// Clear all caches
		CACHE.clear();
	}
}