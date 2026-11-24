/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { AuthenticateParams, IAgent, IAgentDescriptor, IAgentModelSource, IAgentModelSourceDescription } from '../../common/agent.js';
import { ModelSourceRetentionPolicy, type ModelSource, type RootState } from '../../common/state/protocol/state.js';
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

	modelSource(id: string): ModelSource | undefined {
		return this.rootState.modelSources?.find(modelSource => modelSource.id === id);
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
		return typeof source.definition.endpoint === 'string' ? { credentialResource: { resource: source.definition.endpoint }, credentialOrigins: [new URL(source.definition.endpoint).origin] } : {};
	}

	override setModelSources(sources: readonly IAgentModelSource[]): void {
		this.served.push(sources);
	}

	/** Resolves when the test lets the source's running turns finish. */
	readonly idle = new Map<string, DeferredPromise<void>>();
	readonly cancelledIdleWaits: string[] = [];

	override whenModelSourceIdle(id: string, token: CancellationToken): Promise<void> {
		const idle = new DeferredPromise<void>();
		this.idle.set(id, idle);
		const listener = token.onCancellationRequested(() => {
			this.cancelledIdleWaits.push(id);
			listener.dispose();
		});
		idle.p.finally(() => listener.dispose());
		return idle.p;
	}

	/** The last served sources, as `id: credential presence`. */
	get lastServed(): Record<string, boolean> | undefined {
		const last = this.served.at(-1);
		return last && Object.fromEntries(last.map(source => [source.id, source.credential !== undefined]));
	}

	/** The last served sources that are going away. */
	get lastDraining(): string[] | undefined {
		return this.served.at(-1)?.filter(source => source.draining).map(source => source.id);
	}
}

function set(modelSource: Partial<ModelSource> & Pick<ModelSource, 'id'>, definition: Record<string, unknown> = { endpoint: RESOURCE }): ClientModelSourceAction {
	return {
		type: ActionType.RootModelSourceSet,
		modelSource: { provider: 'copilotcli', displayName: 'Example', format: FORMAT, nonce: JSON.stringify(definition), ...modelSource },
		definition,
	};
}

function authenticate(registry: AgentHostModelSourceRegistry, modelSourceId: string, credentialNonce: string | undefined, token: string, options: { readonly resource?: string; readonly accountId?: string } = {}): number | 'ok' {
	const params: AuthenticateParams = { resource: options.resource ?? RESOURCE, token, ...(options.accountId ? { accountId: options.accountId } : {}) };
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
			const modelSource = state.modelSource('source');
			return { state: modelSource?.state, credentialOrigins: modelSource?.credentialOrigins, accountId: modelSource?.accountId, served: agent.lastServed };
		};

		registry.handleClientAction(set({ id: 'source' }), 'client-a', 1);
		const required = observe();
		const requiredNonce = state.modelSource('source')?.credentialNonce;
		const rejectedDeliveries = {
			staleNonce: authenticate(registry, 'source', 'stale', 'secret'),
			otherResource: authenticate(registry, 'source', requiredNonce, 'secret', { resource: 'https://other.example.test' }),
			unknownSource: authenticate(registry, 'missing', requiredNonce, 'secret'),
		};
		const delivered = authenticate(registry, 'source', requiredNonce, 'secret', { accountId: 'key-1' });
		const ready = observe();
		const readyNonce = state.modelSource('source')?.credentialNonce;

		// Another client registering the same definition, with a new name or retention, keeps the credential and its nonce.
		registry.handleClientAction(set({ id: 'source', displayName: 'Renamed', retention: ModelSourceRetentionPolicy.Host }), 'client-b', 1);
		const reregistered = { ...observe(), displayName: state.modelSource('source')?.displayName, sameNonce: state.modelSource('source')?.credentialNonce === readyNonce };
		// The same nonce must not carry a different definition, since the source keeps its credential.
		registry.handleClientAction(set({ id: 'source', nonce: JSON.stringify({ endpoint: RESOURCE }) }, { endpoint: 'https://evil.example.test/v1' }), 'client-b', 2);

		const revoked = authenticate(registry, 'source', readyNonce, '');
		const afterRevocation = observe();
		const revokedNonce = state.modelSource('source')?.credentialNonce;

		// A new definition drops any credential and starts over with a new nonce.
		registry.handleClientAction(set({ id: 'source' }, { endpoint: 'https://moved.example.test/v1' }), 'client-a', 2);
		const moved = observe();
		const distinctNonces = new Set([requiredNonce, readyNonce, revokedNonce, state.modelSource('source')?.credentialNonce]).size;

		assert.deepStrictEqual({ required, rejectedDeliveries, delivered, ready, reregistered, revoked, afterRevocation, moved, distinctNonces, rejections: state.rejections.length }, {
			required: { state: { kind: 'authRequired', reason: 'required' }, credentialOrigins: ['https://models.example.test'], accountId: undefined, served: {} },
			rejectedDeliveries: { staleNonce: -32011, otherResource: -32602, unknownSource: -32602 },
			delivered: 'ok',
			ready: { state: { kind: 'ready' }, credentialOrigins: ['https://models.example.test'], accountId: 'key-1', served: { source: true } },
			reregistered: { state: { kind: 'ready' }, credentialOrigins: ['https://models.example.test'], accountId: 'key-1', served: { source: true }, displayName: 'Renamed', sameNonce: true },
			revoked: 'ok',
			// A revoked key is never replayed, `accountId` still names it, and the models stay listed so selections keep resolving.
			afterRevocation: { state: { kind: 'authRequired', reason: 'revoked' }, credentialOrigins: ['https://models.example.test'], accountId: 'key-1', served: { source: false } },
			moved: { state: { kind: 'authRequired', reason: 'required' }, credentialOrigins: ['https://moved.example.test'], accountId: undefined, served: { source: false } },
			distinctNonces: 4,
			rejections: 1,
		});
	});

	test('drops a credential its endpoint rejected, so a client replaces it rather than sending it again', () => {
		const { registry, state, agent } = createRegistry();
		registry.handleClientAction(set({ id: 'source' }), 'client-a', 1);
		authenticate(registry, 'source', state.modelSource('source')?.credentialNonce, 'secret', { accountId: 'key-1' });
		const readyNonce = state.modelSource('source')?.credentialNonce;

		registry.rejectCredential('source');
		const rejected = { state: state.modelSource('source')?.state, accountId: state.modelSource('source')?.accountId, newNonce: state.modelSource('source')?.credentialNonce !== readyNonce, served: agent.lastServed };
		const servedCount = agent.served.length;
		// Without a credential there is nothing more to drop.
		registry.rejectCredential('source');

		assert.deepStrictEqual({ rejected, unchangedAfterRepeat: agent.served.length === servedCount }, {
			rejected: { state: { kind: 'authRequired', reason: 'rejected', description: 'The endpoint rejected the API key.' }, accountId: 'key-1', newNonce: true, served: { source: false } },
			unchangedAfterRepeat: true,
		});
	});

	test('lets running turns finish before removing a source its last contributor left, unless a client registers it again', async () => {
		const { registry, state, agent } = createRegistry();
		registry.handleClientAction(set({ id: 'source' }), 'client-a', 1);
		authenticate(registry, 'source', state.modelSource('source')?.credentialNonce, 'secret');
		registry.handleClientAction(set({ id: 'returning' }, {}), 'client-a', 2);

		registry.removeClient('client-a');
		const whileDraining = { remaining: state.rootState.modelSources?.map(modelSource => modelSource.id), served: agent.lastServed, draining: agent.lastDraining };
		// Another client registers one of them again before its turns finish.
		registry.handleClientAction(set({ id: 'returning' }, {}), 'client-b', 1);
		agent.idle.get('source')!.complete();
		agent.idle.get('returning')!.complete();
		await Promise.resolve();

		assert.deepStrictEqual({ whileDraining, cancelled: agent.cancelledIdleWaits, remaining: state.rootState.modelSources?.map(modelSource => modelSource.id), served: agent.lastServed, draining: agent.lastDraining }, {
			// Its credential stays for the running turns; the agent fails new work on it.
			whileDraining: { remaining: ['source', 'returning'], served: { source: true, returning: false }, draining: ['source', 'returning'] },
			cancelled: ['returning'],
			remaining: ['returning'],
			served: { returning: false },
			draining: [],
		});
	});

	test('rejects sources the agent cannot read, and removes a departed client\'s sources by retention', async () => {
		const { registry, state, agent } = createRegistry();

		registry.handleClientAction(set({ id: 'other-format', format: 'unknown/format@1' }), 'client-a', 1);
		registry.handleClientAction(set({ id: 'other-agent', provider: 'claude' }), 'client-a', 2);
		registry.handleClientAction(set({ id: 'host-fields', accountId: 'mine' }), 'client-a', 3);
		registry.handleClientAction(set({ id: 'invalid' }, { invalid: true }), 'client-a', 4);
		registry.handleClientAction(set({ id: 'keyless' }, {}), 'client-a', 5);
		registry.handleClientAction(set({ id: 'retained', retention: ModelSourceRetentionPolicy.Host }, {}), 'client-a', 6);
		registry.handleClientAction(set({ id: 'shared' }, {}), 'client-a', 7);
		registry.handleClientAction(set({ id: 'shared' }, {}), 'client-b', 1);
		// An update with a different definition makes its client the only contributor.
		registry.handleClientAction(set({ id: 'updated' }, {}), 'client-b', 2);
		registry.handleClientAction(set({ id: 'updated' }, { other: true }), 'client-a', 8);
		registry.handleClientAction(set({ id: 'removed' }, {}), 'client-b', 3);
		const registered = Object.fromEntries((state.rootState.modelSources ?? []).map(modelSource => [modelSource.id, modelSource.state?.kind]));
		const servedBeforeDeparture = agent.lastServed;

		// Removal applies to every client.
		registry.handleClientAction({ type: ActionType.RootModelSourceRemoved, id: 'removed' }, 'client-a', 9);
		registry.removeClient('client-a');
		for (const idle of agent.idle.values()) {
			idle.complete();
		}
		await Promise.resolve();

		assert.deepStrictEqual({
			rejections: state.rejections.length,
			registered,
			servedBeforeDeparture,
			remaining: (state.rootState.modelSources ?? []).map(modelSource => modelSource.id),
			servedAfterDeparture: agent.lastServed,
		}, {
			rejections: 3,
			registered: { invalid: 'error', keyless: 'ready', retained: 'ready', shared: 'ready', updated: 'ready', removed: 'ready' },
			servedBeforeDeparture: { keyless: false, retained: false, shared: false, updated: false, removed: false },
			// A source another client still contributes stays, and so does a host-retained one.
			remaining: ['retained', 'shared'],
			servedAfterDeparture: { retained: false, shared: false },
		});
	});
});
