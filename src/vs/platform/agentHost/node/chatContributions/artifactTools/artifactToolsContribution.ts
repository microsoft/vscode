/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { AgentHostArtifactToolsConfigKey, platformRootSchema } from '../../../common/agentHostSchema.js';
import { ARTIFACT_TOOLS_INSTRUCTION } from '../../shared/artifactServerTools.js';
import { AgentHostChatContributionRegistry, IAgentHostChatContribution, IAgentHostChatContributionContext, ISendContribution } from '../chatContribution.js';

/** Adds artifact-tool guidance when artifact tools are enabled. */
class ArtifactToolsContribution extends Disposable implements IAgentHostChatContribution {

	readonly id = 'artifactTools';
	readonly order = 200;

	constructor(private readonly _context: IAgentHostChatContributionContext) {
		super();
	}

	contributeSend(): ISendContribution | undefined {
		return this._context.agentConfigService.getRootValue(platformRootSchema, AgentHostArtifactToolsConfigKey)
			? { instructions: [ARTIFACT_TOOLS_INSTRUCTION] }
			: undefined;
	}
}

AgentHostChatContributionRegistry.register(ArtifactToolsContribution);
