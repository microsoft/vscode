/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Uri } from 'vscode';
import { IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { INativeEnvService } from '../../../../platform/env/common/envService';
import { ILogService } from '../../../../platform/log/common/logService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { createServiceIdentifier } from '../../../../util/common/services';
import { Disposable } from '../../../../util/vs/base/common/lifecycle';
import { ResourceSet } from '../../../../util/vs/base/common/map';
import { Schemas } from '../../../../util/vs/base/common/network';
import { dirname } from '../../../../util/vs/base/common/resources';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { IPromptsService } from '../../../../platform/promptFiles/common/promptsService';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { isEnabledForCopilotCLI } from './copilotCli';
import { resolveSkillConfigLocations } from '../../common/skillConfigLocations';

export interface ICopilotCLISkills {
	readonly _serviceBrand: undefined;
	getSkillsLocations(token: CancellationToken): Promise<Uri[]>;
}

export const ICopilotCLISkills = createServiceIdentifier<ICopilotCLISkills>('ICopilotCLISkills');

export class CopilotCLISkills extends Disposable implements ICopilotCLISkills {
	declare _serviceBrand: undefined;
	constructor(
		@ILogService protected readonly logService: ILogService,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@INativeEnvService private readonly envService: INativeEnvService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@IPromptsService private readonly promptsService: IPromptsService,
	) {
		super();
	}

	public async getSkillsLocations(token: CancellationToken): Promise<Uri[]> {
		const configSkillLocationUris = new ResourceSet();
		for (const uri of resolveSkillConfigLocations(this.configurationService, this.envService, this.workspaceService)) {
			configSkillLocationUris.add(uri);
		}
		(await this.promptsService.getSkills(token))
			.filter(isEnabledForCopilotCLI)
			.filter(s => s.uri.scheme === Schemas.file)
			.map(s => s.uri)
			.map(uri => dirname(dirname(uri)))
			.forEach(uri => configSkillLocationUris.add(uri));

		return Array.from(configSkillLocationUris);
	}
}
