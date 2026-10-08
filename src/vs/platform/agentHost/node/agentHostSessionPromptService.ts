/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IAgentHostSessionPromptService = createDecorator<IAgentHostSessionPromptService>('agentHostSessionPromptService');

export interface IAgentHostSessionPromptService {
	readonly _serviceBrand: undefined;
}

export class AgentHostSessionPromptService implements IAgentHostSessionPromptService {
	declare readonly _serviceBrand: undefined;

	constructor(
	) { }
}
