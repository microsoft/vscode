/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export interface IRemoteCodingAgent {
	id: string;
	command: string;
	displayName: string;
	description?: string;
}

export interface IRemoteCodingAgentsService {
	readonly _serviceBrand: undefined;
	getRegisteredAgents(): IRemoteCodingAgent[];
	registerAgent(agent: IRemoteCodingAgent): void;
}

export const IRemoteCodingAgentsService = createDecorator<IRemoteCodingAgentsService>('remoteCodingAgentsService');

export class RemoteCodingAgentsService implements IRemoteCodingAgentsService {
	readonly _serviceBrand: undefined;

	private agents: IRemoteCodingAgent[] = [];

	getRegisteredAgents(): IRemoteCodingAgent[] {
		return this.agents;
	}

	registerAgent(agent: IRemoteCodingAgent): void {
		if (!this.agents.includes(agent)) {
			this.agents.push(agent);
		}
	}
}

registerSingleton(IRemoteCodingAgentsService, RemoteCodingAgentsService, InstantiationType.Delayed);
