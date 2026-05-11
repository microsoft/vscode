/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { type McpServerSummary } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IStorageService, WillSaveStateReason } from '../../../../../../platform/storage/common/storage.js';
import { TestStorageService } from '../../../../../test/common/workbenchTestServices.js';
import { IAgentHostMcpAuthRegistry, AgentHostMcpAuthRegistry, type IAgentHostMcpAuthSessionEntry } from '../../../browser/agentSessions/agentHost/agentHostMcpAuthRegistry.js';

function makeEntry(): IAgentHostMcpAuthSessionEntry {
	return {
		mcpServers: observableValue<readonly McpServerSummary[]>('test', []),
		authenticate: async () => false,
	};
}

function createRegistry(disposables: DisposableStore, storage?: TestStorageService): { registry: IAgentHostMcpAuthRegistry; storage: TestStorageService } {
	const storageService = storage ?? disposables.add(new TestStorageService());
	const insta = disposables.add(new TestInstantiationService());
	insta.stub(IStorageService, storageService);
	insta.stub(ILogService, new NullLogService());
	const registry = disposables.add(insta.createInstance(AgentHostMcpAuthRegistry));
	return { registry, storage: storageService };
}

suite('AgentHostMcpAuthRegistry — session entries', () => {
	const disposables = new DisposableStore();
	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('registerSession + getEntry round-trip', () => {
		const { registry } = createRegistry(disposables);
		const sessionResource = URI.parse('vscode-chat-session:/local/abc');
		const entry = makeEntry();

		const registration = disposables.add(registry.registerSession(sessionResource, entry));
		assert.strictEqual(registry.getEntry(sessionResource), entry);

		registration.dispose();
		assert.strictEqual(registry.getEntry(sessionResource), undefined);
	});

	test('registerSession overwrites prior entry; disposing stale registration is a no-op', () => {
		const { registry } = createRegistry(disposables);
		const sessionResource = URI.parse('vscode-chat-session:/local/abc');
		const first = makeEntry();
		const second = makeEntry();

		const firstReg = registry.registerSession(sessionResource, first);
		const secondReg = disposables.add(registry.registerSession(sessionResource, second));

		// Overwriting must replace the entry.
		assert.strictEqual(registry.getEntry(sessionResource), second);

		// Disposing the FIRST registration must not clear the live SECOND entry.
		firstReg.dispose();
		assert.strictEqual(registry.getEntry(sessionResource), second);

		secondReg.dispose();
		assert.strictEqual(registry.getEntry(sessionResource), undefined);
	});
});

suite('AgentHostMcpAuthRegistry — persistent scope memory', () => {
	const disposables = new DisposableStore();
	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('remember + recall is host-scoped', () => {
		const { registry } = createRegistry(disposables);
		registry.remember('host-a', 'https://api.example.com', ['read', 'write']);

		assert.deepStrictEqual(registry.recall('host-a', 'https://api.example.com'), ['read', 'write']);
		assert.strictEqual(registry.recall('host-b', 'https://api.example.com'), undefined);
		assert.strictEqual(registry.recall('host-a', 'https://other.example.com'), undefined);
	});

	test('remember normalizes scopes (sorted, deduped)', () => {
		const { registry } = createRegistry(disposables);
		registry.remember('host-a', 'https://api.example.com', ['write', 'read', 'read']);
		assert.deepStrictEqual(registry.recall('host-a', 'https://api.example.com'), ['read', 'write']);
	});

	test('forget drops only the targeted (host, resource) entry', () => {
		const { registry } = createRegistry(disposables);
		registry.remember('host-a', 'https://api.example.com', ['read']);
		registry.remember('host-a', 'https://other.example.com', ['read']);
		registry.remember('host-b', 'https://api.example.com', ['read']);

		registry.forget('host-a', 'https://api.example.com');

		assert.strictEqual(registry.recall('host-a', 'https://api.example.com'), undefined);
		assert.deepStrictEqual(registry.recall('host-a', 'https://other.example.com'), ['read']);
		assert.deepStrictEqual(registry.recall('host-b', 'https://api.example.com'), ['read']);
	});

	test('mutations are buffered in-memory and only flushed on onWillSaveState', () => {
		const storage = new TestStorageService();
		disposables.add(storage);
		const { registry } = createRegistry(disposables, storage);

		registry.remember('host-a', 'https://api.example.com', ['read']);
		// Read-back through the registry sees the in-memory mutation
		// even before flush, but storage itself is still empty.
		assert.deepStrictEqual(registry.recall('host-a', 'https://api.example.com'), ['read']);
		assert.strictEqual(storage.get('agentHost.mcpAuth.consentedScopes', /* APPLICATION_SHARED */ -2), undefined);

		// Flush: now storage holds the serialized state.
		storage.testEmitWillSaveState(WillSaveStateReason.NONE);
		const raw = storage.get('agentHost.mcpAuth.consentedScopes', -2);
		assert.ok(raw, 'expected storage to be populated after flush');
		assert.deepStrictEqual(JSON.parse(raw!)['host-a']['https://api.example.com'].scopes, ['read']);
	});

	test('persisted state is reloaded by a fresh registry instance', () => {
		const storage = new TestStorageService();
		disposables.add(storage);

		// Round 1: write through registry A.
		const { registry: registryA } = createRegistry(disposables, storage);
		registryA.remember('host-a', 'https://api.example.com', ['read']);
		storage.testEmitWillSaveState(WillSaveStateReason.NONE);

		// Round 2: a brand-new registry sharing the same storage must
		// see the previously-remembered scopes.
		const disposables2 = new DisposableStore();
		try {
			const { registry: registryB } = createRegistry(disposables2, storage);
			assert.deepStrictEqual(registryB.recall('host-a', 'https://api.example.com'), ['read']);
		} finally {
			disposables2.dispose();
		}
	});

	test('flush is a no-op when no mutation occurred', () => {
		const storage = new TestStorageService();
		disposables.add(storage);
		const { registry } = createRegistry(disposables, storage);

		// Read-only: should not write storage.
		registry.recall('host-a', 'https://api.example.com');
		storage.testEmitWillSaveState(WillSaveStateReason.NONE);
		assert.strictEqual(storage.get('agentHost.mcpAuth.consentedScopes', -2), undefined);
	});

	test('forget clears empty host buckets', () => {
		const storage = new TestStorageService();
		disposables.add(storage);
		const { registry } = createRegistry(disposables, storage);

		registry.remember('host-a', 'https://api.example.com', ['read']);
		registry.forget('host-a', 'https://api.example.com');
		storage.testEmitWillSaveState(WillSaveStateReason.NONE);

		const raw = storage.get('agentHost.mcpAuth.consentedScopes', -2);
		assert.ok(raw);
		const parsed = JSON.parse(raw!);
		assert.strictEqual(parsed['host-a'], undefined, 'empty host bucket should be removed');
	});
});
