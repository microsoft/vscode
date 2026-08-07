/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CustomizationType, type AgentCustomization } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { agentHostAgentPickerStorageKey, resolveAgentHostAgent } from '../../../../../../platform/agentHost/common/customAgents.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';

suite('agentHostAgentPicker', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const alpha: AgentCustomization = { type: CustomizationType.Agent, id: 'agent://a', uri: 'agent://a', name: 'alpha' };
	const beta: AgentCustomization = { type: CustomizationType.Agent, id: 'agent://b', uri: 'agent://b', name: 'beta', description: 'b desc' };
	const agents: readonly AgentCustomization[] = [alpha, beta];

	suite('agentHostAgentPickerStorageKey', () => {
		test('builds a per-scheme storage key', () => {
			assert.strictEqual(
				agentHostAgentPickerStorageKey('agent-host-copilotcli'),
				'workbench.agentsession.agentHostAgentPicker.agent-host-copilotcli.selectedAgentUri',
			);
		});
	});

	suite('resolveAgentHostAgent', () => {
		test('returns the session-selected agent when its URI is in the list', () => {
			assert.deepStrictEqual(resolveAgentHostAgent(agents, 'agent://b', undefined), beta);
		});

		test('falls back to the stored URI when the session has no selection', () => {
			assert.strictEqual(resolveAgentHostAgent(agents, undefined, 'agent://a'), alpha);
		});

		test('returns undefined when neither session nor stored selection matches the list', () => {
			assert.strictEqual(resolveAgentHostAgent(agents, undefined, 'agent://missing'), undefined);
			assert.strictEqual(resolveAgentHostAgent(agents, 'agent://missing', undefined), undefined);
		});

		test('session selection wins over stored selection', () => {
			assert.deepStrictEqual(resolveAgentHostAgent(agents, 'agent://a', 'agent://b'), alpha);
		});

		test('falls through to stored URI when the session agent URI is not in the list', () => {
			// The session's recorded selection is no longer in the effective
			// agent list (e.g. the customization providing it was removed),
			// so the stored fallback is consulted.
			assert.deepStrictEqual(resolveAgentHostAgent(agents, 'agent://gone', 'agent://a'), alpha);
		});

		test('returns undefined for an empty agent list', () => {
			assert.strictEqual(resolveAgentHostAgent([], 'agent://a', 'agent://a'), undefined);
			assert.strictEqual(resolveAgentHostAgent([], undefined, undefined), undefined);
		});
	});

	// Round-trip coverage for "restore the last selected Custom Agent": a user
	// selects a custom agent in a Copilot Agent Host session, opens a NEW
	// (untitled) session, and the new session pre-selects that same agent. This
	// mirrors AgentHostAgentPickerContribution's write rule (`_setAgent`, which
	// persists the pick per session-resource scheme) and its new-session seed
	// (`_initAgent`, which for an untitled session with no session-level
	// selection resolves the stored URI against the session's available agents),
	// using a real in-memory storage service as the ledger.
	suite('restore last selected custom agent on a new session (round-trip)', () => {
		// `agent-host-copilotcli` is the Copilot Agent Host session-resource scheme.
		const SCHEME = 'agent-host-copilotcli';

		function createStorage(): InMemoryStorageService {
			return store.add(new InMemoryStorageService());
		}

		// Mirrors `_setAgent`: persist the user's pick per scheme, or clear it when
		// the default "Agent" (no custom agent) is chosen.
		function selectAgent(storage: InMemoryStorageService, scheme: string, agent: AgentCustomization | undefined): void {
			const key = agentHostAgentPickerStorageKey(scheme);
			if (agent) {
				storage.store(key, agent.uri, StorageScope.PROFILE, StorageTarget.MACHINE);
			} else {
				storage.remove(key, StorageScope.PROFILE);
			}
		}

		// Mirrors `_initAgent` for a NEW untitled session (no session-level
		// selection): the seeded agent is resolved from the stored URI against the
		// session's available agents.
		function seedNewUntitledSession(storage: InMemoryStorageService, scheme: string, sessionAgents: readonly AgentCustomization[]): AgentCustomization | undefined {
			const storedUri = storage.get(agentHostAgentPickerStorageKey(scheme), StorageScope.PROFILE);
			return resolveAgentHostAgent(sessionAgents, undefined, storedUri);
		}

		// Mirrors `_initAgent` for an ESTABLISHED (non-untitled) session: the
		// per-scheme stored seed is deliberately NOT consulted (`storedUri`
		// undefined), so the session keeps its own persisted agent rather than
		// inheriting the shared new-session default.
		function seedEstablishedSession(sessionAgents: readonly AgentCustomization[], sessionAgentUri: string | undefined): AgentCustomization | undefined {
			return resolveAgentHostAgent(sessionAgents, sessionAgentUri, undefined);
		}

		test('a new Copilot Agent Host session restores the last selected custom agent', () => {
			const storage = createStorage();
			selectAgent(storage, SCHEME, beta);
			assert.deepStrictEqual(seedNewUntitledSession(storage, SCHEME, agents), beta);
		});

		test('selecting the default Agent clears the stored custom agent', () => {
			const storage = createStorage();
			selectAgent(storage, SCHEME, beta);
			selectAgent(storage, SCHEME, undefined);
			assert.strictEqual(seedNewUntitledSession(storage, SCHEME, agents), undefined);
		});

		test('an established (non-untitled) session is not seeded from the stored agent', () => {
			const storage = createStorage();
			selectAgent(storage, SCHEME, beta);
			// The stored seed exists and WOULD apply to a new untitled session...
			assert.deepStrictEqual(seedNewUntitledSession(storage, SCHEME, agents), beta);
			// ...but an established session ignores it and keeps its own agent
			// (here: the default Agent, i.e. no session-level selection).
			assert.strictEqual(seedEstablishedSession(agents, undefined), undefined);
		});

		test('a stored agent that is no longer available is ignored', () => {
			const storage = createStorage();
			selectAgent(storage, SCHEME, beta);
			// `beta` was removed from the workspace; only `alpha` remains, so the new
			// session falls back to the default "Agent" rather than a stale pick.
			assert.strictEqual(seedNewUntitledSession(storage, SCHEME, [alpha]), undefined);
		});

		test('the stored custom agent is scoped per session-resource scheme', () => {
			const storage = createStorage();
			selectAgent(storage, SCHEME, beta);
			// A different agent-host provider (e.g. Claude) does not inherit the pick.
			assert.strictEqual(seedNewUntitledSession(storage, 'agent-host-claude', agents), undefined);
		});
	});
});
