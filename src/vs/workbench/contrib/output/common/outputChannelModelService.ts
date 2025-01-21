/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { toLocalISOString } from '../../../../base/common/date.js';
import { joinPath } from '../../../../base/common/resources.js';
import { DelegatedOutputChannelModel, FileOutputChannelModel, IOutputChannelModel, MultiFileOutputChannelModel } from './outputChannelModel.js';
import { URI } from '../../../../base/common/uri.js';
import { ILanguageSelection } from '../../../../editor/common/languages/language.js';
import { IOutputContentSource } from '../../../services/output/common/output.js';

export const IOutputChannelModelService = createDecorator<IOutputChannelModelService>('outputChannelModelService');

export interface IOutputChannelModelService {
	readonly _serviceBrand: undefined;

	createOutputChannelModel(id: string, modelUri: URI, language: ILanguageSelection, source?: IOutputContentSource | ReadonlyArray<IOutputContentSource>): IOutputChannelModel;

}

export class OutputChannelModelService implements IOutputChannelModelService {

	declare readonly _serviceBrand: undefined;

	private readonly outputLocation: URI;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService
	) {
		this.outputLocation = joinPath(environmentService.windowLogsPath, `output_${toLocalISOString(new Date()).replace(/-|:|\.\d+Z$/g, '')}`);
	}

	createOutputChannelModel(id: string, modelUri: URI, language: ILanguageSelection, source?: IOutputContentSource | IOutputContentSource[]): IOutputChannelModel {
		return source ?
			Array.isArray(source) ? this.instantiationService.createInstance(MultiFileOutputChannelModel, modelUri, language, source)
				: this.instantiationService.createInstance(FileOutputChannelModel, modelUri, language, source)
			: this.instantiationService.createInstance(DelegatedOutputChannelModel, id, modelUri, language, this.outputLocation, this.outputDirPromise);
	}

	private _outputDir: Promise<void> | null = null;
	private get outputDirPromise(): Promise<void> {
		if (!this._outputDir) {
			this._outputDir = this.fileService.createFolder(this.outputLocation).then(() => undefined);
		}
		return this._outputDir;
	}

}

registerSingleton(IOutputChannelModelService, OutputChannelModelService, InstantiationType.Delayed);
