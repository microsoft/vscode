/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IAgentHostService, type AgentProvider } from '../../../../../../platform/agentHost/common/agentService.js';
import { type ProtectedResourceMetadata } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { type RootState } from '../../../../../../platform/agentHost/common/state/sessionState.js';

export const IAgentHostProtectedResourcesService = createDecorator<IAgentHostProtectedResourcesService>('agentHostProtectedResourcesService');

/**
 * Tracks the protected resources each live agent-host provider currently
 * advertises, and signals — with the provider in the payload — when that set
 * changes. Consumers derive higher-level facts from the raw resources (e.g.
 * whether a session type requires GitHub Copilot sign-in right now: Claude in
 * native mode / Codex on OpenAI advertise the Copilot resource with
 * `required: false`, so they are usable without signing in) and filter
 * {@link onDidChange} to the provider they care about.
 *
 * This is the single source for that "resources + change signal" so consumers
 * don't each re-watch root state.
 */
export interface IAgentHostProtectedResourcesService {
	readonly _serviceBrand: undefined;

	/**
	 * Fires the {@link AgentProvider provider id} whose advertised
	 * protected-resource set just changed. The payload lets a consumer filter to
	 * the single provider it cares about (`Event.filter(onDidChange, p => p === id)`)
	 * rather than depending on the service to scope it.
	 */
	readonly onDidChange: Event<AgentProvider>;

	/**
	 * The protected resources the agent for `providerId` currently advertises, or
	 * `undefined` when no such agent is resolved yet (callers treat this as
	 * "not known" and fall back to a conservative default).
	 */
	getProtectedResources(providerId: AgentProvider): readonly ProtectedResourceMetadata[] | undefined;
}

export class AgentHostProtectedResourcesService extends Disposable implements IAgentHostProtectedResourcesService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<AgentProvider>());
	readonly onDidChange = this._onDidChange.event;

	/**
	 * Signature of the protected resources last seen per provider, so a change is
	 * emitted only when the advertised set actually changes (e.g. Claude switching
	 * between native and proxy) rather than on every root state update.
	 */
	private readonly _lastSignature = new Map<AgentProvider, string>();

	constructor(
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
	) {
		super();
		this._register(this._agentHostService.rootState.onDidChange(rootState => this._sync(rootState)));
		const initial = this._agentHostService.rootState.value;
		if (initial && !(initial instanceof Error)) {
			this._sync(initial);
		}
	}

	getProtectedResources(providerId: AgentProvider): readonly ProtectedResourceMetadata[] | undefined {
		const rootState = this._agentHostService.rootState.value;
		if (!rootState || rootState instanceof Error) {
			return undefined;
		}
		const agent = rootState.agents.find(a => a.provider === providerId);
		return agent ? agent.protectedResources ?? [] : undefined;
	}

	private _sync(rootState: RootState): void {
		const incoming = new Set(rootState.agents.map(a => a.provider));
		const changed: AgentProvider[] = [];

		for (const provider of [...this._lastSignature.keys()]) {
			if (!incoming.has(provider)) {
				this._lastSignature.delete(provider);
				changed.push(provider);
			}
		}

		for (const agent of rootState.agents) {
			const signature = JSON.stringify(
				(agent.protectedResources ?? []).map(resource => [resource.resource, resource.required !== false]),
			);
			if (this._lastSignature.get(agent.provider) !== signature) {
				this._lastSignature.set(agent.provider, signature);
				changed.push(agent.provider);
			}
		}

		for (const provider of changed) {
			this._onDidChange.fire(provider);
		}
	}
}

registerSingleton(IAgentHostProtectedResourcesService, AgentHostProtectedResourcesService, InstantiationType.Delayed);
