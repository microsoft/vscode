/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { ContextKeyExpr, IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ChatContextKeys } from '../../chat/common/chatContextKeys.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ILogService } from '../../../../platform/log/common/log.js';

export interface IRemoteCodingAgent {
	id: string;
	command: string;
	displayName: string;
	description?: string;
	followUpRegex?: string;
	when?: string;
}


export interface IRemoteCodingAgentInformation {
	id: number;
	number: number;
	title: string;
	user: {
		login: string;
	};
	html_url: string;
	state: string;
	created_at: string;
	updated_at: string;
}

export interface IRemoteCodingAgentInformationProvider {
	provideCodingAgentsInformation(token: CancellationToken): AsyncIterable<IRemoteCodingAgentInformation>;
	onDidSelectItem: (codingAgentId: string) => void;
}

export interface IRemoteCodingAgentsService {
	readonly _serviceBrand: undefined;
	getRegisteredAgents(): IRemoteCodingAgent[];
	getAvailableAgents(): IRemoteCodingAgent[];
	registerAgent(agent: IRemoteCodingAgent): void;

	// Information provider methods
	onDidChangeAgentInformation: Event<IRemoteCodingAgentInformationUpdate>;
	updateCodingAgentsInformation(handle: number, information: IRemoteCodingAgentInformation): void;
	provideCodingAgentsInformation(token: CancellationToken): AsyncIterable<IRemoteCodingAgentInformation>;
	registerCodingAgentInformationProvider(handle: number, provider: IRemoteCodingAgentInformationProvider): IDisposable;
	onDidSelectItem(handle: number, codingAgentId: string): void;
	hasRemoteCodingAgentProviders: boolean;
}

export interface IRemoteCodingAgentInformationUpdate {
	handle: number;
	information: IRemoteCodingAgentInformation;
}

export const IRemoteCodingAgentsService = createDecorator<IRemoteCodingAgentsService>('remoteCodingAgentsService');

export class RemoteCodingAgentsService extends Disposable implements IRemoteCodingAgentsService {
	readonly _serviceBrand: undefined;
	private readonly _ctxHasRemoteCodingAgent: IContextKey<boolean>;
	private readonly agents: IRemoteCodingAgent[] = [];
	private readonly contextKeys = new Set<string>();
	private _providers: Map<number, IRemoteCodingAgentInformationProvider> = new Map();
	// event to signal updates
	private readonly _onDidChangeAgentInformation = new Emitter<IRemoteCodingAgentInformationUpdate>();
	readonly onDidChangeAgentInformation: Event<IRemoteCodingAgentInformationUpdate> = this._onDidChangeAgentInformation.event;

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ILogService private readonly _logService: ILogService,
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

	public updateCodingAgentsInformation(handle: number, information: IRemoteCodingAgentInformation): void {
		this._onDidChangeAgentInformation.fire({
			handle,
			information
		});
	}

	public onDidSelectItem(handle: number, codingAgentId: string): void {
		const provider = this._providers.get(handle);
		if (provider) {
			provider.onDidSelectItem(codingAgentId);
		} else {
			this._logService.error(`No provider registered for handle ${handle}`);
		}
	}

	public async *provideCodingAgentsInformation(token: CancellationToken): AsyncIterable<IRemoteCodingAgentInformation> {
		// Iterate through all registered providers and yield their results
		for (const [handle, provider] of this._providers) {
			try {
				// Call the provider's method - note: we need to map from the provider's API to our internal types
				// For now, assuming the provider can directly provide IRemoteCodingAgentInformation
				// In a real implementation, you might need to adapt the TextSearchResult2 to IRemoteCodingAgentInformation
				if (provider.provideCodingAgentsInformation) {
					for await (const result of provider.provideCodingAgentsInformation(token)) {
						// Assuming the provider returns results compatible with IRemoteCodingAgentInformation
						// You might need to transform TextSearchResult2 to IRemoteCodingAgentInformation here
						yield result as any; // Type assertion for now - you'd implement proper mapping
					}
				}
			} catch (error) {
				this._logService.error(`Error getting coding agents information from provider ${handle}:`, error);
			}

			if (token.isCancellationRequested) {
				break;
			}
		}
	}

	public registerCodingAgentInformationProvider(handle: number, provider: IRemoteCodingAgentInformationProvider): IDisposable {
		this._providers.set(handle, provider);
		return {
			dispose: () => {
				this._providers.delete(handle);
			}
		};
	}

	public get hasRemoteCodingAgentProviders(): boolean {
		return this._providers.size > 0;
	}
}

registerSingleton(IRemoteCodingAgentsService, RemoteCodingAgentsService, InstantiationType.Delayed);
