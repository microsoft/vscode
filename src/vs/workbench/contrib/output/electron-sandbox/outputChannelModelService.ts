/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { join } from 'vs/base/common/path';
import { URI } from 'vs/base/common/uri';
import { IFileService } from 'vs/platform/files/common/files';
import { IOutputChannelModelService, AbstractOutputChannelModelService } from 'vs/workbench/contrib/output/common/outputChannelModel';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { toLocalISOString } from 'vs/base/common/date';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';

export class OutputChannelModelService extends AbstractOutputChannelModelService implements IOutputChannelModelService {

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IFileService fileService: IFileService,
		@INativeHostService nativeHostService: INativeHostService
	) {
		super(URI.file(join(environmentService.logsPath, `output_${nativeHostService.windowId}_${toLocalISOString(new Date()).replace(/-|:|\.\d+Z$/g, '')}`)), fileService, instantiationService);
	}

}

registerSingleton(IOutputChannelModelService, OutputChannelModelService);
