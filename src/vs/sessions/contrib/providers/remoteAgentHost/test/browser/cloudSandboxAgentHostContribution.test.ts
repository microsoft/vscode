/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentSessionMetadata } from '../../../../../../platform/agentHost/common/agentService.js';
import {
	CloudSandboxEnabledSettingId,
	ICloudSandboxApiService,
	cloudSandboxAddress,
	type ICloudSandboxDiscoveredSession,
	type ICloudSandboxDiscoveryResult,
} from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { IRemoteAgentHostService, RemoteAgentHostsEnabledSettingId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IAuthenticationService } from '../../../../../../workbench/services/authentication/common/authentication.js';
import { IChatSessionsService } from '../../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IAgentHostFilterService } from '../../../../../services/agentHostFilter/common/agentHostFilter.js';
import { ISessionsProvider } from '../../../../../services/sessions/common/sessionsProvider.js';
import { ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { CloudSandboxAgentHostContribution } from '../../browser/cloudSandboxAgentHostContribution.js';
import { IRemoteAgentHostConnectionCustomizationService } from '../../browser/remoteAgentHostConnectionCustomization.js';
import { IRemoteAgentHostSessionsProviderConfig, RemoteAgentHostSessionsProvider } from '../../browser/remoteAgentHostSessionsProvider.js';

class StubProvider extends mock<RemoteAgentHostSessionsProvider>() {
	readonly seeded: IAgentSessionMetadata[] = [];

	override readonly id: string;

	constructor(readonly config: IRemoteAgentHostSessionsProviderConfig) {
		super();
		this.id = `agenthost-${config.address}`;
	}

	/**
	 * Records seeds, de-duplicating by session id. Unlike the real provider this does not model
	 * the project backfill on an already-seeded session — that path is covered against the real
	 * provider in `remoteAgentHostSessionsProvider.test.ts`.
	 */
	override seedSessions(metas: readonly IAgentSessionMetadata[]): void {
		for (const meta of metas) {
			if (!this.seeded.some(seen => seen.session.toString() === meta.session.toString())) {
				this.seeded.push(meta);
			}
		}
	}

	override dispose(): void { /* noop */ }
}

class TestCloudSandboxContribution extends CloudSandboxAgentHostContribution {
	readonly stubProviders = new Map<string, StubProvider>();

	protected override _instantiateProvider(config: IRemoteAgentHostSessionsProviderConfig): RemoteAgentHostSessionsProvider {
		const stub = new StubProvider(config);
		this.stubProviders.set(config.address, stub);
		return stub as unknown as RemoteAgentHostSessionsProvider;
	}
}

class StubSessionsProvidersService extends Disposable {
	declare readonly _serviceBrand: undefined;
	readonly onDidChangeProviders = Event.None;
	registerProvider(_provider: ISessionsProvider): IDisposable { return toDisposable(() => { }); }
	getProviders(): ISessionsProvider[] { return []; }
}

/**
 * Creates the contribution with a discovery result, and resolves once the constructor's eager
 * `_discoverAndSeed()` pass has committed its seeds.
 */
async function createContribution(store: Pick<DisposableStore, 'add'>, sessions: readonly ICloudSandboxDiscoveredSession[]): Promise<TestCloudSandboxContribution> {
	const discoveryHandlers: (() => Promise<void>)[] = [];
	const instantiationService = store.add(new TestInstantiationService());

	instantiationService.stub(ICloudSandboxApiService, new class extends mock<ICloudSandboxApiService>() {
		override async listSessions(_token: CancellationToken): Promise<ICloudSandboxDiscoveryResult> {
			return { kind: 'complete', sessions };
		}
	}());
	instantiationService.stub(IRemoteAgentHostService, new class extends mock<IRemoteAgentHostService>() {
		override readonly onDidChangeConnections = Event.None;
		override readonly connections = [];
		override async removeRemoteAgentHost(): Promise<void> { }
	}());
	instantiationService.stub(IRemoteAgentHostConnectionCustomizationService, new class extends mock<IRemoteAgentHostConnectionCustomizationService>() {
		override register(): IDisposable { return toDisposable(() => { }); }
	}());
	instantiationService.stub(ISessionsProvidersService, store.add(new StubSessionsProvidersService()) as unknown as ISessionsProvidersService);
	instantiationService.stub(IAgentHostFilterService, new class extends mock<IAgentHostFilterService>() {
		override registerDiscoveryHandler(handler: () => Promise<void>): IDisposable {
			discoveryHandlers.push(handler);
			return toDisposable(() => { });
		}
	}());
	instantiationService.stub(IConfigurationService, new TestConfigurationService({
		[CloudSandboxEnabledSettingId]: true,
		[RemoteAgentHostsEnabledSettingId]: true,
	}));
	instantiationService.stub(IAuthenticationService, new class extends mock<IAuthenticationService>() {
		override readonly onDidChangeSessions = Event.None;
		override readonly onDidRegisterAuthenticationProvider = Event.None;
	}());
	instantiationService.stub(INotificationService, new class extends mock<INotificationService>() { }());
	instantiationService.stub(IChatSessionsService, new class extends mock<IChatSessionsService>() { }());
	instantiationService.stub(ILogService, new NullLogService());

	const contribution = store.add(instantiationService.createInstance(TestCloudSandboxContribution));
	// The constructor kicks off discovery eagerly; re-running the registered handler awaits it,
	// because `_discoverAndSeed` serializes onto the in-flight pass.
	await Promise.all(discoveryHandlers.map(handler => handler()));
	return contribution;
}

function discoveredSession(overrides?: Partial<ICloudSandboxDiscoveredSession>): ICloudSandboxDiscoveredSession {
	return {
		environmentId: 'env-1',
		sessionId: 'sess-1',
		taskId: 'task-1',
		name: 'Change port to 5555',
		repoName: 'osortega/simple-server',
		updatedAt: '2026-08-05T12:00:00Z',
		...overrides,
	};
}

suite('CloudSandboxAgentHostContribution', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('seeds the discovered repository so a never-opened session is not workspace-less', async () => {
		// Without a project the workspace is undefined and the session groups under "Unknown".
		// The seeded shape matches what the host reports on connect, so reconciling is a no-op.
		const contribution = await createContribution(store, [discoveredSession()]);

		const provider = contribution.stubProviders.get(cloudSandboxAddress('env-1'));
		assert.deepStrictEqual(provider?.seeded.map(m => ({
			session: m.session.toString(),
			summary: m.summary,
			project: m.project && { uri: m.project.uri.toString(), displayName: m.project.displayName },
		})), [{
			session: 'copilot:/sess-1',
			summary: 'Change port to 5555',
			project: { uri: 'https://github.com/osortega/simple-server', displayName: 'osortega/simple-server' },
		}]);
	});

	test('omits the project when discovery could not resolve a repository', async () => {
		const contribution = await createContribution(store, [discoveredSession({ repoName: undefined })]);

		const provider = contribution.stubProviders.get(cloudSandboxAddress('env-1'));
		assert.strictEqual(provider?.seeded[0]?.project, undefined);
	});

	test('opts sandbox providers out of the [host] workspace-label suffix', async () => {
		// Each sandbox is its own provider named after its task, so the suffix would put every
		// session in a workspace group of one.
		const contribution = await createContribution(store, [
			discoveredSession(),
			discoveredSession({ environmentId: 'env-2', sessionId: 'sess-2', taskId: 'task-2', name: 'hi' }),
		]);

		assert.deepStrictEqual([...contribution.stubProviders.values()].map(p => ({
			name: p.config.name,
			omitHostFromWorkspaceLabel: p.config.omitHostFromWorkspaceLabel,
		})), [
			{ name: 'Change port to 5555', omitHostFromWorkspaceLabel: true },
			{ name: 'hi', omitHostFromWorkspaceLabel: true },
		]);
	});
});
