/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import type { IAgent } from '../common/agent.js';

export const IAgentHostProviderLocator = createDecorator<IAgentHostProviderLocator>('agentHostProviderLocator');

/** Resolves the provider currently responsible for a session. */
export interface IAgentHostProviderLocator {
	readonly _serviceBrand: undefined;
	getAgent(session: URI | string): IAgent | undefined;
}

export class AgentHostProviderLocator implements IAgentHostProviderLocator {

	declare readonly _serviceBrand: undefined;

	constructor(
		private readonly _getAgent: (session: URI | string) => IAgent | undefined,
	) { }

	getAgent(session: URI | string): IAgent | undefined {
		return this._getAgent(session);
	}
}
