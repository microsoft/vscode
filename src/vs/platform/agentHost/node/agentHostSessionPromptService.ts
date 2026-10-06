/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { type IAgentCreateSessionConfig } from '../common/agent.js';
import { IAgentService } from '../common/agentService.js';
import { buildDefaultChatUri, MessageKind } from '../common/state/sessionState.js';
import { IAgentHostTurnService } from './agentHostTurnService.js';

export const IAgentHostSessionPromptService = createDecorator<IAgentHostSessionPromptService>('agentHostSessionPromptService');

export interface IAgentHostSessionPromptService {
	readonly _serviceBrand: undefined;
	startSessionPrompt(config: IAgentCreateSessionConfig, prompt: string): Promise<URI>;
}

export class AgentHostSessionPromptService implements IAgentHostSessionPromptService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IAgentService private readonly _agentService: IAgentService,
		@IAgentHostTurnService private readonly _turnService: IAgentHostTurnService,
	) { }

	async startSessionPrompt(config: IAgentCreateSessionConfig, prompt: string): Promise<URI> {
		const session = await this._agentService.createSession(config);
		try {
			this._turnService.startTurnMessage(URI.parse(buildDefaultChatUri(session.toString())), {
				text: prompt,
				origin: { kind: MessageKind.User },
			});
			return session;
		} catch (error) {
			await this._agentService.disposeSession(session);
			throw error;
		}
	}
}
