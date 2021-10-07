/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { parseSavedSearchEditor, parseSerializedSearchEditor } from 'vs/workbench/contrib/searchEditor/browser/searchEditorSerialization';
import { IWorkingCopyBackupService } from 'vs/workbench/services/workingCopy/common/workingCopyBackup';
import { SearchConfiguration } from './searchEditorInput';
import { assertIsDefined } from 'vs/base/common/types';
import { createTextBufferFactoryFromStream } from 'vs/editor/common/model/textModel';
import { SearchEditorWorkingCopyTypeId } from 'vs/workbench/contrib/searchEditor/browser/constants';
import { Emitter } from 'vs/base/common/event';
import { ResourceMap } from 'vs/base/common/map';

export type SearchEditorData = { resultsModel: ITextModel, configurationModel: SearchConfigurationModel };

export class SearchConfigurationModel {
	private _onConfigDidUpdate = new Emitter<SearchConfiguration>();
	public readonly onConfigDidUpdate = this._onConfigDidUpdate.event;

	constructor(public config: Readonly<SearchConfiguration>) { }
	updateConfig(config: SearchConfiguration) { this.config = config; this._onConfigDidUpdate.fire(config); }
}

export class SearchEditorModel {
	constructor(
		private resource: URI,
		@IWorkingCopyBackupService readonly workingCopyBackupService: IWorkingCopyBackupService,
	) {
	}

	async resolve(): Promise<SearchEditorData> {
		return assertIsDefined(searchEditorModelFactory.models.get(this.resource)).resolve();
	}
}

class SearchEditorModelFactory {
	models = new ResourceMap<{ resolve: () => Promise<SearchEditorData> }>();

	constructor() { }

	initializeModelFromExistingModel(accessor: ServicesAccessor, resource: URI, config: SearchConfiguration) {
		if (this.models.has(resource)) {
			throw Error('Unable to contruct model for resource that already exists');
		}

		const modeService = accessor.get(IModeService);
		const modelService = accessor.get(IModelService);
		const instantiationService = accessor.get(IInstantiationService);
		const workingCopyBackupService = accessor.get(IWorkingCopyBackupService);

		let ongoingResolve: Promise<SearchEditorData> | undefined;

		this.models.set(resource, {
			resolve: () => {
				if (!ongoingResolve) {
					ongoingResolve = (async () => {

						const backup = await this.tryFetchModelFromBackupService(resource, modeService, modelService, workingCopyBackupService, instantiationService);
						if (backup) {
							return backup;
						}

						return Promise.resolve({
							resultsModel: modelService.getModel(resource) ?? modelService.createModel('', modeService.create('search-result'), resource),
							configurationModel: new SearchConfigurationModel(config)
						});
					})();
				}
				return ongoingResolve;
			}
		});
	}

	initializeModelFromRawData(accessor: ServicesAccessor, resource: URI, config: SearchConfiguration, contents: string | undefined) {
		if (this.models.has(resource)) {
			throw Error('Unable to contruct model for resource that already exists');
		}

		const modeService = accessor.get(IModeService);
		const modelService = accessor.get(IModelService);
		const instantiationService = accessor.get(IInstantiationService);
		const workingCopyBackupService = accessor.get(IWorkingCopyBackupService);

		let ongoingResolve: Promise<SearchEditorData> | undefined;

		this.models.set(resource, {
			resolve: () => {
				if (!ongoingResolve) {
					ongoingResolve = (async () => {

						const backup = await this.tryFetchModelFromBackupService(resource, modeService, modelService, workingCopyBackupService, instantiationService);
						if (backup) {
							return backup;
						}

						return Promise.resolve({
							resultsModel: modelService.createModel(contents ?? '', modeService.create('search-result'), resource),
							configurationModel: new SearchConfigurationModel(config)
						});
					})();
				}
				return ongoingResolve;
			}
		});
	}

	initializeModelFromExistingFile(accessor: ServicesAccessor, resource: URI, existingFile: URI) {
		if (this.models.has(resource)) {
			throw Error('Unable to contruct model for resource that already exists');
		}

		const modeService = accessor.get(IModeService);
		const modelService = accessor.get(IModelService);
		const instantiationService = accessor.get(IInstantiationService);
		const workingCopyBackupService = accessor.get(IWorkingCopyBackupService);

		let ongoingResolve: Promise<SearchEditorData> | undefined;

		this.models.set(resource, {
			resolve: async () => {
				if (!ongoingResolve) {
					ongoingResolve = (async () => {

						const backup = await this.tryFetchModelFromBackupService(resource, modeService, modelService, workingCopyBackupService, instantiationService);
						if (backup) {
							return backup;
						}

						const { text, config } = await instantiationService.invokeFunction(parseSavedSearchEditor, existingFile);
						return ({
							resultsModel: modelService.createModel(text ?? '', modeService.create('search-result'), resource),
							configurationModel: new SearchConfigurationModel(config)
						});
					})();
				}
				return ongoingResolve;
			}
		});
	}

	private async tryFetchModelFromBackupService(resource: URI, modeService: IModeService, modelService: IModelService, workingCopyBackupService: IWorkingCopyBackupService, instantiationService: IInstantiationService): Promise<SearchEditorData | undefined> {
		const backup = await workingCopyBackupService.resolve({ resource, typeId: SearchEditorWorkingCopyTypeId });

		let model = modelService.getModel(resource);
		if (!model && backup) {
			const factory = await createTextBufferFactoryFromStream(backup.value);

			model = modelService.createModel(factory, modeService.create('search-result'), resource);
		}

		if (model) {
			const existingFile = model.getValue();
			const { text, config } = parseSerializedSearchEditor(existingFile);
			modelService.destroyModel(resource);
			return ({
				resultsModel: modelService.createModel(text ?? '', modeService.create('search-result'), resource),
				configurationModel: new SearchConfigurationModel(config)
			});
		}
		else {
			return undefined;
		}
	}
}

export const searchEditorModelFactory = new SearchEditorModelFactory();
