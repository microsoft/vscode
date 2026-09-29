/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import * as vscode from 'vscode';
import { IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IEnvService } from '../../../platform/env/common/envService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { IExtensionContribution } from '../../common/contributions';
import { AIMappedEditsProvider2 } from '../node/aiMappedEditsProvider';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';

export class AiMappedEditsContrib extends Disposable implements IExtensionContribution {
	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IEnvService envService: IEnvService,
		@IConfigurationService configurationService: IConfigurationService,
		@IExperimentationService experimentationService: IExperimentationService
	) {
		super();

		this._register(vscode.chat.registerMappedEditsProvider2(instantiationService.createInstance(AIMappedEditsProvider2)));
	}
}
