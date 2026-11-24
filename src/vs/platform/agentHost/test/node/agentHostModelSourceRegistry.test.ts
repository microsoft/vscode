/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { AuthenticateParams, IAgent, IAgentDescriptor, IAgentModelSource, IAgentModelSourceDescription } from '../../common/agent.js';
import { ModelSourceRetentionPolicy, type ModelSourceRegistration, type RootState } from '../../common/state/protocol/state.js';
import { ActionType, type ActionOrigin, type ClientModelSourceAction, type RootAction, type StateAction } from '../../common/state/sessionActions.js';
import { AuthenticateTargetKind, ProtocolError } from '../../common/state/sessionProtocol.js';
import { rootReducer } from '../../common/state/sessionReducers.js';
import { createRootState } from '../../common/state/sessionState.js';
import { AgentHostModelSourceRegistry, type IAgentHostModelSourceRegistryState } from '../../node/agentHostModelSourceRegistry.js';

const FORMAT = 'example.test/model-source@1';
const RESOURCE = 'https://models.example.test/v1';

class TestRegistryState implements IAgentHostModelSourceRegistryState {
	rootState: RootState = createRootState();
	readonly rejections: string[] = [];

	dispatchServerAction(_channel: string, action: StateAction): void {
		this.rootState = rootReducer(this.rootState, action as RootAction);
	}

	dispatchClientAction(_channel: string, action: ClientModelSourceAction, _origin: ActionOrigin): unknown {
		this.rootState = rootReducer(this.rootState, action);
		return this.rootState;
	}

	rejectClientAction(_channel: string, _action: StateAction, _origin: ActionOrigin, reason: string): void {
		this.rejections.push(reason);
	}

	registration(id: string): ModelSourceRegistration | undefined {
		return this.rootState.modelSourceRegistrations?.find(registration => registration.id === id);
	}
}

/** An agent that reads `{ endpoint?, invalid? }` definitions and records the sources it is asked to serve. */
class TestAgent extends mock<IAgent>() {
	readonly served: (readonly IAgentModelSource[])[] = [];

	override getDescriptor(): IAgentDescriptor {
		return { provider: 'copilotcli', displayName: 'Test', description: '', capabilities: { modelSourceRegistration: { formats: [FORMAT] } } };
	}

	override describeModelSource(source: Pick<IAgentModelSource, 'definition'>): IAgentModelSourceDescription {
		if (source.definition.invalid) {
			throw new Error('The definition is not valid.');
		}
		return typeof source.definition.endpoint === 'string' ? { credentialResource: { resource: source.definition.endpoint } } : {};
	}

	override setModelSources(sources: readonly IAgentModelSource[]): void {
		this.served.push(sources);
	}

	/** The last served sources, as `id: credential presence`. */
	get lastServed(): Record<string, boolean> | undefined {
		const last = this.served.at(-1);
		return last && Object.fromEntries(last.map(source => [source.id, source.credential !== undefined]));
	}
}

function set(registration: Partial<ModelSourceRegistration> & Pick<ModelSourceRegistration, 'id'>, clientId = 'client-a'): ClientModelSourceAction {
	return {
		type: ActionType.RootModelSourceRegistrationSet,
		registration: { provider: 'copilotcli', displayName: 'Example', format: FORMAT, definition: { endpoint: RESOURCE }, clientId, ...registration },
	};
}

function authenticate(registry: AgentHostModelSourceRegistry, modelSourceId: string, credentialNonce: string | undefined, token: string, resource = RESOURCE): number | 'ok' {
	const params: AuthenticateParams = { resource, token };
	try {
		registry.authenticate(params, { kind: AuthenticateTargetKind.ModelSource, modelSourceId, credentialNonce: credentialNonce ?? '' });
		return 'ok';
	} catch (error) {
		return error instanceof ProtocolError ? error.code : -1;
	}
}

suite('AgentHostModelSourceRegistry', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createRegistry(): { registry: AgentHostModelSourceRegistry; state: TestRegistryState; agent: TestAgent } {
		const state = new TestRegistryState();
		const agent = new TestAgent();
		const registry = store.add(new AgentHostModelSourceRegistry(state, provider => provider === 'copilotcli' ? agent : undefined, new NullLogService()));
		return { registry, state, agent };
	}

	test('asks for a credential, holds it in memory, and fences every change with a new nonce', () => {
		const { registry, state, agent } = createRegistry();
		const observe = () => {
			const registration = state.registration('source');
			return { state: registration?.state, credentialResource: registration?.credentialResource?.resource, served: agent.lastServed };
		};

		registry.handleClientAction(set({ id: 'source' }), 'client-a', 1);
		const required = observe();
		const requiredNonce = state.registration('source')?.credentialNonce;
		const rejectedDeliveries = {
			staleNonce: authenticate(registry, 'source', 'stale', 'secret'),
			otherResource: authenticate(registry, 'source', requiredNonce, 'secret', 'https://other.example.test'),
			unknownSource: authenticate(registry, 'missing', requiredNonce, 'secret'),
		};
		const delivered = authenticate(registry, 'source', requiredNonce, 'secret');
		const ready = observe();
		const readyNonce = state.registration('source')?.credentialNonce;

		// A new name, client, or retention keeps the credential and its nonce.
		registry.handleClientAction(set({ id: 'source', displayName: 'Renamed', clientId: 'client-b', retention: ModelSourceRetentionPolicy.Host }, 'client-b'), 'client-b', 2);
		const renamed = { ...observe(), sameNonce: state.registration('source')?.credentialNonce === readyNonce };

		const revoked = authenticate(registry, 'source', readyNonce, '');
		const afterRevocation = observe();
		const revokedNonce = state.registration('source')?.credentialNonce;

		// A changed definition drops any credential and starts over with a new nonce.
		registry.handleClientAction(set({ id: 'source', definition: { endpoint: 'https://moved.example.test/v1' } }), 'client-a', 3);
		const moved = observe();
		const distinctNonces = new Set([requiredNonce, readyNonce, revokedNonce, state.registration('source')?.credentialNonce]).size;

		assert.deepStrictEqual({ required, rejectedDeliveries, delivered, ready, renamed, revoked, afterRevocation, moved, distinctNonces, rejections: state.rejections }, {
			required: { state: { kind: 'authRequired', reason: 'required' }, credentialResource: RESOURCE, served: {} },
			rejectedDeliveries: { staleNonce: -32011, otherResource: -32602, unknownSource: -32602 },
			delivered: 'ok',
			ready: { state: { kind: 'ready' }, credentialResource: RESOURCE, served: { source: true } },
			renamed: { state: { kind: 'ready' }, credentialResource: RESOURCE, served: { source: true }, sameNonce: true },
			revoked: 'ok',
			// A revoked key is never replayed, and the source's models stay listed so selections keep resolving.
			afterRevocation: { state: { kind: 'authRequired', reason: 'expired' }, credentialResource: RESOURCE, served: { source: false } },
			moved: { state: { kind: 'authRequired', reason: 'required' }, credentialResource: 'https://moved.example.test/v1', served: { source: false } },
			distinctNonces: 4,
			rejections: [],
		});
	});

	test('rejects registrations the agent cannot read, and removes a departed client\'s sources by retention', () => {
		const { registry, state, agent } = createRegistry();

		registry.handleClientAction(set({ id: 'other-client' }), 'client-b', 1);
		registry.handleClientAction(set({ id: 'other-format', format: 'unknown/format@1' }), 'client-a', 2);
		registry.handleClientAction(set({ id: 'other-agent', provider: 'claude' }), 'client-a', 3);
		registry.handleClientAction(set({ id: 'host-fields', credentialNonce: 'mine' }), 'client-a', 4);
		registry.handleClientAction(set({ id: 'invalid', definition: { invalid: true } }), 'client-a', 5);
		registry.handleClientAction(set({ id: 'keyless', definition: {} }), 'client-a', 6);
		registry.handleClientAction(set({ id: 'retained', definition: {}, retention: ModelSourceRetentionPolicy.Host }), 'client-a', 7);
		const registered = Object.fromEntries((state.rootState.modelSourceRegistrations ?? []).map(registration => [registration.id, registration.state?.kind]));
		const servedBeforeDeparture = agent.lastServed;

		registry.removeClient('client-a');

		assert.deepStrictEqual({
			rejections: state.rejections.length,
			registered,
			servedBeforeDeparture,
			remaining: (state.rootState.modelSourceRegistrations ?? []).map(registration => registration.id),
			servedAfterDeparture: agent.lastServed,
		}, {
			rejections: 4,
			registered: { invalid: 'error', keyless: 'ready', retained: 'ready' },
			servedBeforeDeparture: { keyless: false, retained: false },
			remaining: ['retained'],
			servedAfterDeparture: { retained: false },
		});
	});
});
