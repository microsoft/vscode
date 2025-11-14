/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Event } from '../../../../base/common/event.js';
import { ContextKeyExpr, IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ChatContextKeys } from '../../chat/common/chatContextKeys.js';

export interface IRemoteCodingAgent {
	id: string;
	command: string;
	displayName: string;
	description?: string;
	followUpRegex?: string;
	when?: string;
}

export interface IRemoteCodingAgentsService {
	readonly _serviceBrand: undefined;
	getRegisteredAgents(): IRemoteCodingAgent[];
	getAvailableAgents(): IRemoteCodingAgent[];
	registerAgent(agent: IRemoteCodingAgent): void;
}

export const IRemoteCodingAgentsService = createDecorator<IRemoteCodingAgentsService>('remoteCodingAgentsService');

export class RemoteCodingAgentsService extends Disposable implements IRemoteCodingAgentsService {
	readonly _serviceBrand: undefined;
	private readonly _ctxHasRemoteCodingAgent: IContextKey<boolean>;
	private readonly agents: IRemoteCodingAgent[] = [];
	private readonly contextKeys = new Set<string>();

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService
	) {
		super();
		this._ctxHasRemoteCodingAgent = ChatContextKeys.hasRemoteCodingAgent.bindTo(this.contextKeyService);

		// Listen for context changes and re-evaluate agent availability
		this._register(Event.filter(contextKeyService.onDidChangeContext, e => e.affectsSome(this.contextKeys))(() => {
			this.updateContextKeys();
		}));
	}

	getRegisteredAgents(): IRemoteCodingAgent[] {
		return [...this.agents];
	}

	getAvailableAgents(): IRemoteCodingAgent[] {
		return this.agents.filter(agent => this.isAgentAvailable(agent));
	}

	registerAgent(agent: IRemoteCodingAgent): void {
		// Check if agent already exists
		const existingIndex = this.agents.findIndex(a => a.id === agent.id);
		if (existingIndex >= 0) {
			// Update existing agent
			this.agents[existingIndex] = agent;
		} else {
			// Add new agent
			this.agents.push(agent);
		}

		// Track context keys from the when condition
		if (agent.when) {
			const whenExpr = ContextKeyExpr.deserialize(agent.when);
			if (whenExpr) {
				for (const key of whenExpr.keys()) {
					this.contextKeys.add(key);
				}
			}
		}

		this.updateContextKeys();
	}

	private isAgentAvailable(agent: IRemoteCodingAgent): boolean {
		if (!agent.when) {
			return true;
		}

		const whenExpr = ContextKeyExpr.deserialize(agent.when);
		return !whenExpr || this.contextKeyService.contextMatchesRules(whenExpr);
	}

	private updateContextKeys(): void {
		const hasAvailableAgent = this.getAvailableAgents().length > 0;
		this._ctxHasRemoteCodingAgent.set(hasAvailableAgent);
	}
}

registerSingleton(IRemoteCodingAgentsService, RemoteCodingAgentsService, InstantiationType.Delayed);
