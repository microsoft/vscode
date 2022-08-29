/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IFileService } from 'vs/platform/files/common/files';
import { toLocalISOString } from 'vs/base/common/date';
import { dirname, joinPath } from 'vs/base/common/resources';
import { DelegatedOutputChannelModel, FileOutputChannelModel, IOutputChannelModel } from 'vs/workbench/contrib/output/common/outputChannelModel';
import { URI } from 'vs/base/common/uri';
import { ILanguageSelection } from 'vs/editor/common/languages/language';

export const IOutputChannelModelService = createDecorator<IOutputChannelModelService>('outputChannelModelService');

export interface IOutputChannelModelService {
	readonly _serviceBrand: undefined;

	createOutputChannelModel(id: string, modelUri: URI, language: ILanguageSelection, file?: URI): IOutputChannelModel;

}

export abstract class AbstractOutputChannelModelService {

	declare readonly _serviceBrand: undefined;

	constructor(
		private readonly outputLocation: URI,
		@IFileService protected readonly fileService: IFileService,
		@IInstantiationService protected readonly instantiationService: IInstantiationService
	) { }

	createOutputChannelModel(id: string, modelUri: URI, language: ILanguageSelection, file?: URI): IOutputChannelModel {
		return file ? this.instantiationService.createInstance(FileOutputChannelModel, modelUri, language, file) : this.instantiationService.createInstance(DelegatedOutputChannelModel, id, modelUri, language, this.outputDir);
	}

	private _outputDir: Promise<URI> | null = null;
	private get outputDir(): Promise<URI> {
		if (!this._outputDir) {
			this._outputDir = this.fileService.createFolder(this.outputLocation).then(() => this.outputLocation);
		}
		return this._outputDir;
	}

}

export class OutputChannelModelService extends AbstractOutputChannelModelService implements IOutputChannelModelService {

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IFileService fileService: IFileService,
	) {
		super(joinPath(dirname(environmentService.logFile), toLocalISOString(new Date()).replace(/-|:|\.\d+Z$/g, '')), fileService, instantiationService);
	}
}

registerSingleton(IOutputChannelModelService, OutputChannelModelService, false);
