/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { AgentHostArtifactToolsConfigKey, platformRootSchema } from '../../../common/agentHostSchema.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, ISendContribution } from '../../../common/agentHostChatContributionsService.js';
import { IAgentConfigurationService } from '../../agentConfigurationService.js';
import { ARTIFACT_TOOLS_INSTRUCTION } from '../../shared/artifactServerTools.js';

/** Adds artifact-tool guidance when artifact tools are enabled. */
export class ArtifactToolsContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'artifactTools';
	readonly order = 200;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@IAgentConfigurationService private readonly _agentConfigService: IAgentConfigurationService,
	) {
		super();
	}

	onOutgoingTurn(): ISendContribution | undefined {
		return this._agentConfigService.getRootValue(platformRootSchema, AgentHostArtifactToolsConfigKey)
			? { instructions: [ARTIFACT_TOOLS_INSTRUCTION] }
			: undefined;
	}
}
