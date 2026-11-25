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
	/** The type of each action the host dispatched, in order. */
	readonly dispatched: string[] = [];

	dispatchServerAction(_channel: string, action: StateAction): void {
		this.dispatched.push(action.type);
		this.rootState = rootReducer(this.rootState, action as RootAction);
	}

	dispatchClientAction(_channel: string, action: ClientModelSourceAction, _origin: ActionOrigin): unknown {
		this.dispatched.push(action.type);
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
		return { provider: 'copilotcli', displayName: 'Test', description: '', capabilities: { modelSourceRegistration: { formats: [{ format: FORMAT }] } } };
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

function register(id: string, definition: Record<string, unknown> = { endpoint: RESOURCE }, options: { readonly provider?: string; readonly format?: string; readonly displayName?: string; readonly retention?: ModelSourceRetentionPolicy } = {}): Extract<ClientModelSourceAction, { readonly type: ActionType.RootModelSourceRegisterRequested }> {
	return {
		type: ActionType.RootModelSourceRegisterRequested,
		modelSourceId: id,
		provider: options.provider ?? 'copilotcli',
		displayName: options.displayName ?? 'Example',
		registration: { format: options.format ?? FORMAT, definition, ...(options.retention ? { retention: options.retention } : {}) },
	};
}

function authenticate(registry: AgentHostModelSourceRegistry, modelSourceId: string, token: string, options: { readonly resource?: string; readonly accountId?: string } = {}): number | 'ok' {
	const params: AuthenticateParams = { resource: options.resource ?? RESOURCE, token, ...(options.accountId ? { accountId: options.accountId } : {}) };
	try {
		registry.authenticate(params, { kind: AuthenticateTargetKind.ModelSource, modelSourceId });
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

	test('asks for a credential, holds it in memory, and drops it when the definition changes', () => {
		const { registry, state, agent } = createRegistry();
		const observe = () => {
			const modelSource = state.modelSource('source');
			return { state: modelSource?.state, accountId: modelSource?.accountId, served: agent.lastServed };
		};

		registry.handleClientAction(register('source'), 'client-a', 1);
		const required = { ...observe(), definition: state.modelSource('source')?.registration?.definition };
		const order = [...state.dispatched];
		const rejectedDeliveries = {
			otherResource: authenticate(registry, 'source', 'secret', { resource: 'https://other.example.test' }),
			unknownSource: authenticate(registry, 'missing', 'secret'),
		};
		const delivered = authenticate(registry, 'source', 'secret', { accountId: 'key-1' });
		// A later delivery replaces the credential the host holds.
		const replaced = authenticate(registry, 'source', 'secret-2', { accountId: 'key-2' });
		const ready = observe();

		// Another client registering the same definition, with a new name or retention, keeps the credential.
		registry.handleClientAction(register('source', undefined, { displayName: 'Renamed', retention: ModelSourceRetentionPolicy.Host }), 'client-b', 1);
		const reregistered = { ...observe(), displayName: state.modelSource('source')?.displayName };

		const revoked = authenticate(registry, 'source', '');
		const afterRevocation = observe();

		// A new definition drops any credential and starts over.
		registry.handleClientAction(register('source', { endpoint: 'https://moved.example.test/v1' }), 'client-a', 2);
		const moved = { ...observe(), resource: state.modelSource('source')?.credentialResource?.resource };

		assert.deepStrictEqual({ required, order, rejectedDeliveries, delivered, replaced, ready, reregistered, revoked, afterRevocation, moved, rejections: state.rejections.length }, {
			// The host's state keeps the definition, so every client can check where a key would go.
			required: { state: { kind: 'authRequired', reason: 'required' }, accountId: undefined, served: {}, definition: { endpoint: RESOURCE } },
			// The host publishes the source before it confirms the request, so the client finds it then.
			order: [ActionType.RootModelSourceSet, ActionType.RootModelSourceRegisterRequested],
			rejectedDeliveries: { otherResource: -32602, unknownSource: -32602 },
			delivered: 'ok',
			replaced: 'ok',
			ready: { state: { kind: 'ready' }, accountId: 'key-2', served: { source: true } },
			reregistered: { state: { kind: 'ready' }, accountId: 'key-2', served: { source: true }, displayName: 'Renamed' },
			revoked: 'ok',
			// A revoked key is never replayed, `accountId` still names it, and the models stay listed so selections keep resolving.
			afterRevocation: { state: { kind: 'authRequired', reason: 'revoked' }, accountId: 'key-2', served: { source: false } },
			moved: { state: { kind: 'authRequired', reason: 'required' }, accountId: undefined, served: { source: false }, resource: 'https://moved.example.test/v1' },
			rejections: 0,
		});
	});

	test('drops a credential its endpoint rejected, so a client replaces it rather than sending it again', () => {
		const { registry, state, agent } = createRegistry();
		registry.handleClientAction(register('source'), 'client-a', 1);
		authenticate(registry, 'source', 'secret', { accountId: 'key-1' });

		// A turn that started before this key was delivered was refused with an earlier one.
		registry.rejectCredential('source', 0);
		const keptForEarlierTurn = state.modelSource('source')?.state;
		registry.rejectCredential('source', Date.now());
		const rejected = { state: state.modelSource('source')?.state, accountId: state.modelSource('source')?.accountId, served: agent.lastServed };
		const servedCount = agent.served.length;
		// Without a credential there is nothing more to drop.
		registry.rejectCredential('source', Date.now());

		assert.deepStrictEqual({ keptForEarlierTurn, rejected, unchangedAfterRepeat: agent.served.length === servedCount }, {
			keptForEarlierTurn: { kind: 'ready' },
			rejected: { state: { kind: 'authRequired', reason: 'rejected', description: 'The endpoint rejected the API key.' }, accountId: 'key-1', served: { source: false } },
			unchangedAfterRepeat: true,
		});
	});

	test('lets running turns finish before removing a source its last contributor left, unless a client registers it again', async () => {
		const { registry, state, agent } = createRegistry();
		registry.handleClientAction(register('source'), 'client-a', 1);
		authenticate(registry, 'source', 'secret');
		registry.handleClientAction(register('returning', {}), 'client-a', 2);

		registry.removeClient('client-a');
		const whileDraining = { remaining: state.rootState.modelSources?.map(modelSource => modelSource.id), served: agent.lastServed, draining: agent.lastDraining };
		// Another client registers one of them again before its turns finish.
		registry.handleClientAction(register('returning', {}), 'client-b', 1);
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

		registry.handleClientAction(register('other-format', undefined, { format: 'unknown/format@1' }), 'client-a', 1);
		registry.handleClientAction(register('other-agent', undefined, { provider: 'claude' }), 'client-a', 2);
		registry.handleClientAction({ ...register('malformed'), registration: JSON.parse(`{ "format": "${FORMAT}", "definition": "not an object" }`) }, 'client-a', 3);
		registry.handleClientAction(register('invalid', { invalid: true }), 'client-a', 4);
		registry.handleClientAction(register('keyless', {}), 'client-a', 5);
		registry.handleClientAction(register('retained', {}, { retention: ModelSourceRetentionPolicy.Host }), 'client-a', 6);
		registry.handleClientAction(register('shared', {}), 'client-a', 7);
		registry.handleClientAction(register('shared', {}), 'client-b', 1);
		// An update with a different definition makes its client the only contributor.
		registry.handleClientAction(register('updated', {}), 'client-b', 2);
		registry.handleClientAction(register('updated', { other: true }), 'client-a', 8);
		registry.handleClientAction(register('removed', {}), 'client-b', 3);
		const registered = Object.fromEntries((state.rootState.modelSources ?? []).map(modelSource => [modelSource.id, modelSource.state.kind]));
		const servedBeforeDeparture = agent.lastServed;

		// Removal applies to every client.
		registry.handleClientAction({ type: ActionType.RootModelSourceRemoved, modelSourceId: 'removed' }, 'client-a', 9);
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
			// A definition the agent can't read isn't stored for every client to read.
			rejections: 4,
			registered: { keyless: 'ready', retained: 'ready', shared: 'ready', updated: 'ready', removed: 'ready' },
			servedBeforeDeparture: { keyless: false, retained: false, shared: false, updated: false, removed: false },
			// A source another client still contributes stays, and so does a host-retained one.
			remaining: ['retained', 'shared'],
			servedAfterDeparture: { retained: false, shared: false },
		});
	});
});
