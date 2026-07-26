/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService, ILoggerService, NullLoggerService } from '../../../../../../platform/log/common/log.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { CustomizationType, McpServerCustomization, McpServerStatus } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { ContributionEnablementState } from '../../../common/enablement.js';
import { AbstractAgentHostCustomizationService, IAgentHostCustomizationTarget } from '../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { IOutputService } from '../../../../../services/output/common/output.js';

/** A dispatched `setCustomizationEnabled(rawId, enabled)` call recorded by a {@link FakeTarget}. */
interface IDispatchedToggle {
	readonly rawId: string;
	readonly enabled: boolean;
}

/**
 * A minimal, mutable stand-in for {@link IAgentHostCustomizationTarget}. Mirrors how the real
 * agent-host targets behave: `setCustomizationEnabled` both records the call (so tests can assert
 * on it) and mutates the backing customization's `enabled` flag (so a subsequent `getMcpServers`
 * reflects the new live state), just like dispatching the protocol action does for the real
 * session state subscription.
 */
class FakeTarget implements IAgentHostCustomizationTarget {
	readonly dispatched: IDispatchedToggle[] = [];

	constructor(
		readonly customizations: McpServerCustomization[],
		readonly workingDirectory?: string,
	) { }

	authenticate(): Promise<unknown> { return Promise.resolve(undefined); }
	setCustomizationEnabled(rawId: string, enabled: boolean): void {
		this.dispatched.push({ rawId, enabled });
		const server = this.customizations.find(c => c.id === rawId);
		if (server) {
			server.enabled = enabled;
		}
	}
	startMcpServer(): Promise<void> { return Promise.resolve(); }
	stopMcpServer(): Promise<void> { return Promise.resolve(); }
	setRootConfigValue(): void { /* no-op */ }
}

function mcpServer(id: string, name: string, enabled: boolean): McpServerCustomization {
	return {
		type: CustomizationType.McpServer,
		id,
		uri: `file:///${id}`,
		name,
		enabled,
		state: { kind: McpServerStatus.Stopped },
	};
}

class TestAgentHostCustomizationService extends AbstractAgentHostCustomizationService {
	private readonly _targets = new ResourceMap<FakeTarget>();

	constructor(
		instantiationService: TestInstantiationService,
		logService: ILogService,
		storageService: IStorageService,
	) {
		super(instantiationService, logService, storageService);
	}

	setTarget(sessionResource: URI, target: FakeTarget): void {
		this._targets.set(sessionResource, target);
	}

	/** Exposes the protected cleanup hook so tests can simulate a session going away. */
	forgetSession(sessionResource: URI): void {
		this._targets.delete(sessionResource);
		this._clearMcpServerTracking(sessionResource);
	}

	protected override _resolveTarget(sessionResource: URI): IAgentHostCustomizationTarget | undefined {
		return this._targets.get(sessionResource);
	}

}

suite('AbstractAgentHostCustomizationService - MCP server enablement', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createSut() {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ILoggerService, store.add(new NullLoggerService()));
		instantiationService.stub(IOutputService, {
			getChannel: () => undefined,
			getChannelDescriptor: () => undefined,
			showChannel: async () => { },
		});
		const sut = store.add(new TestAgentHostCustomizationService(instantiationService, new NullLogService(), store.add(new InMemoryStorageService())));
		return sut;
	}

	// Two sessions of the *same* host/provider (identical scheme, different authority -- i.e.
	// different session ids). Durable policy must be shared across them.
	const sessionA1 = URI.from({ scheme: 'agent-host-copilotcli', authority: 'session-a1', path: '/' });
	const sessionA2 = URI.from({ scheme: 'agent-host-copilotcli', authority: 'session-a2', path: '/' });
	// A session on a *different* host/provider (different scheme) that happens to expose a
	// same-named server. Its durable policy must be independent.
	const sessionB = URI.from({ scheme: 'remote-hostB-copilotcli', authority: 'session-b', path: '/' });

	test('scopes durable enablement by host scheme + server name, never by session id', () => {
		const sut = createSut();

		// No policy recorded yet: both sessions read the default, even though they're different
		// sessions of the same host.
		assert.strictEqual(sut.getMcpServerEnablement(sessionA1, 'GitHub'), ContributionEnablementState.EnabledProfile);
		assert.strictEqual(sut.getMcpServerEnablement(sessionA2, 'GitHub'), ContributionEnablementState.EnabledProfile);

		sut.setMcpServerEnablement(sessionA1, 'GitHub', ContributionEnablementState.DisabledProfile);

		// Same host (scheme), different session id: the policy carries over because the key never
		// includes a per-session id.
		assert.strictEqual(sut.getMcpServerEnablement(sessionA2, 'GitHub'), ContributionEnablementState.DisabledProfile);

		// Different host (scheme) with a server of the same name: unaffected.
		assert.strictEqual(sut.getMcpServerEnablement(sessionB, 'GitHub'), ContributionEnablementState.EnabledProfile);
	});

	test('scopes workspace enablement by working directory without scoping profile enablement', () => {
		const sut = createSut();
		sut.setTarget(sessionA1, new FakeTarget([mcpServer('gh-1', 'GitHub', true)], 'file:///repo-a'));
		sut.setTarget(sessionA2, new FakeTarget([mcpServer('gh-2', 'GitHub', true)], 'file:///repo-b'));

		sut.setMcpServerEnablement(sessionA1, 'GitHub', ContributionEnablementState.DisabledWorkspace);
		assert.deepStrictEqual({
			repoA: sut.getMcpServerEnablement(sessionA1, 'GitHub'),
			repoB: sut.getMcpServerEnablement(sessionA2, 'GitHub'),
		}, {
			repoA: ContributionEnablementState.DisabledWorkspace,
			repoB: ContributionEnablementState.EnabledProfile,
		});

		sut.setMcpServerEnablement(sessionA1, 'GitHub', ContributionEnablementState.DisabledProfile);
		assert.deepStrictEqual({
			repoA: sut.getMcpServerEnablement(sessionA1, 'GitHub'),
			repoB: sut.getMcpServerEnablement(sessionA2, 'GitHub'),
		}, {
			repoA: ContributionEnablementState.DisabledProfile,
			repoB: ContributionEnablementState.DisabledProfile,
		});
	});

	test('getMcpServers is pure and prepare applies an explicit durable policy', () => {
		const sut = createSut();
		sut.setMcpServerEnablement(sessionA1, 'GitHub', ContributionEnablementState.DisabledProfile);

		const target = new FakeTarget([mcpServer('gh-1', 'GitHub', true)]);
		sut.setTarget(sessionA1, target);

		const [server] = sut.getMcpServers(sessionA1);
		assert.strictEqual(server.enabled, true);
		assert.deepStrictEqual(target.dispatched, []);

		sut.prepareMcpServersForTurn(sessionA1);
		assert.deepStrictEqual(target.dispatched, [{ rawId: 'gh-1', enabled: false }]);

		const otherTarget = new FakeTarget([mcpServer('other-1', 'Other', true)]);
		sut.setTarget(sessionA2, otherTarget);
		sut.prepareMcpServersForTurn(sessionA2);
		assert.deepStrictEqual(otherTarget.dispatched, []);
	});

	test('getMcpServers provides a stable diagnostics output channel id without creating a logger', () => {
		const sut = createSut();
		sut.setTarget(sessionA1, new FakeTarget([mcpServer('gh-1', 'GitHub', true)]));

		const [first] = sut.getMcpServers(sessionA1);
		const [second] = sut.getMcpServers(sessionA1);

		assert.ok(first.logOutputChannelId);
		assert.strictEqual(second.logOutputChannelId, first.logOutputChannelId);
	});

	test('does not reapply unchanged durable policy, preserving a later session-level toggle', () => {
		const sut = createSut();
		sut.setMcpServerEnablement(sessionA1, 'GitHub', ContributionEnablementState.DisabledProfile);

		const target = new FakeTarget([mcpServer('gh-1', 'GitHub', true)]);
		sut.setTarget(sessionA1, target);

		sut.prepareMcpServersForTurn(sessionA1);
		const [server] = sut.getMcpServers(sessionA1);
		assert.strictEqual(server.enabled, false);

		server.setEnabled(true);
		assert.strictEqual(target.dispatched.length, 2);
		assert.deepStrictEqual(target.dispatched[1], { rawId: 'gh-1', enabled: true });

		sut.prepareMcpServersForTurn(sessionA1);
		assert.strictEqual(target.customizations[0].enabled, true);
		assert.strictEqual(target.dispatched.length, 2);
	});

	test('shares prepare state across chats in the same backend session', () => {
		const sut = createSut();
		const target = new FakeTarget([mcpServer('gh-1', 'GitHub', true)]);
		sut.setTarget(sessionA1, target);
		sut.setMcpServerEnablement(sessionA1, 'GitHub', ContributionEnablementState.DisabledProfile);

		sut.prepareMcpServersForTurn(sessionA1);
		const [server] = sut.getMcpServers(sessionA1);
		server.setEnabled(true);
		sut.prepareMcpServersForTurn(sessionA1.with({ fragment: 'peer-chat' }));

		assert.deepStrictEqual(target.dispatched, [
			{ rawId: 'gh-1', enabled: false },
			{ rawId: 'gh-1', enabled: true },
		]);
	});

	test('applies changed durable policy independently before each session turn', () => {
		const sut = createSut();

		const targetA1 = new FakeTarget([mcpServer('gh-1', 'GitHub', true)]);
		const targetA2 = new FakeTarget([mcpServer('gh-2', 'GitHub', true)]);
		const targetB = new FakeTarget([mcpServer('gh-3', 'GitHub', true)]);
		sut.setTarget(sessionA1, targetA1);
		sut.setTarget(sessionA2, targetA2);
		sut.setTarget(sessionB, targetB);

		sut.setMcpServerEnablement(sessionA1, 'GitHub', ContributionEnablementState.DisabledProfile);
		assert.deepStrictEqual([targetA1.dispatched, targetA2.dispatched, targetB.dispatched], [[], [], []]);

		sut.prepareMcpServersForTurn(sessionA1);
		assert.deepStrictEqual(targetA1.dispatched, [{ rawId: 'gh-1', enabled: false }]);
		assert.deepStrictEqual(targetA2.dispatched, []);

		sut.prepareMcpServersForTurn(sessionA2);
		assert.deepStrictEqual(targetA2.dispatched, [{ rawId: 'gh-2', enabled: false }]);

		sut.prepareMcpServersForTurn(sessionB);
		assert.deepStrictEqual(targetB.dispatched, []);
		assert.strictEqual(sut.getMcpServerEnablement(sessionA2, 'GitHub'), ContributionEnablementState.DisabledProfile);
	});

	test('applies a durable reset to EnabledProfile on the next turn', () => {
		const sut = createSut();
		const target = new FakeTarget([mcpServer('gh-1', 'GitHub', true)]);
		sut.setTarget(sessionA1, target);

		sut.setMcpServerEnablement(sessionA1, 'GitHub', ContributionEnablementState.DisabledProfile);
		sut.prepareMcpServersForTurn(sessionA1);
		sut.setMcpServerEnablement(sessionA1, 'GitHub', ContributionEnablementState.EnabledProfile);
		assert.deepStrictEqual(target.dispatched, [{ rawId: 'gh-1', enabled: false }]);

		sut.prepareMcpServersForTurn(sessionA1);
		assert.deepStrictEqual(target.dispatched, [
			{ rawId: 'gh-1', enabled: false },
			{ rawId: 'gh-1', enabled: true },
		]);
	});

	test('prunes servers that disappear and reapplies policy if they return', () => {
		const sut = createSut();
		const target = new FakeTarget([mcpServer('gh-1', 'GitHub', true)]);
		sut.setTarget(sessionA1, target);
		sut.prepareMcpServersForTurn(sessionA1);

		target.customizations.splice(0);
		sut.prepareMcpServersForTurn(sessionA1);
		sut.setMcpServerEnablement(sessionA1, 'GitHub', ContributionEnablementState.DisabledProfile);
		assert.deepStrictEqual(target.dispatched, []);

		target.customizations.push(mcpServer('gh-1', 'GitHub', true));
		sut.prepareMcpServersForTurn(sessionA1);
		assert.deepStrictEqual(target.dispatched, [{ rawId: 'gh-1', enabled: false }]);
	});

	test('forgetting a session resets its prepare state without clearing durable policy', () => {
		const sut = createSut();
		const target = new FakeTarget([mcpServer('gh-1', 'GitHub', true)]);
		sut.setTarget(sessionA1, target);
		sut.setMcpServerEnablement(sessionA1, 'GitHub', ContributionEnablementState.DisabledProfile);
		sut.prepareMcpServersForTurn(sessionA1);

		sut.forgetSession(sessionA1);
		sut.setTarget(sessionA1, target);
		target.customizations[0].enabled = true;
		sut.prepareMcpServersForTurn(sessionA1);

		assert.deepStrictEqual(target.dispatched, [
			{ rawId: 'gh-1', enabled: false },
			{ rawId: 'gh-1', enabled: false },
		]);
	});
});
