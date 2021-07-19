/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IOutputChannelModelService, AbstractOutputChannelModelService } from 'vs/workbench/contrib/output/common/outputChannelModel';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IFileService } from 'vs/platform/files/common/files';
import { toLocalISOString } from 'vs/base/common/date';
import { dirname, joinPath } from 'vs/base/common/resources';

export class OutputChannelModelService extends AbstractOutputChannelModelService implements IOutputChannelModelService {

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IFileService fileService: IFileService,
	) {
		super(joinPath(dirname(environmentService.logFile), toLocalISOString(new Date()).replace(/-|:|\.\d+Z$/g, '')), fileService, instantiationService);
	}
}

registerSingleton(IOutputChannelModelService, OutputChannelModelService);

