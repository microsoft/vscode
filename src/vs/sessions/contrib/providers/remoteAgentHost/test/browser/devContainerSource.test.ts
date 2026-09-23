/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AGENT_HOST_SCHEME, agentHostAuthority, toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { getEntryAddress, IRemoteAgentHostConnectionInfo, IRemoteAgentHostEntry, IRemoteAgentHostService, RemoteAgentHostEntryType } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IAgentHostSessionsProvider } from '../../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { devContainerSourcePath, getDevContainerSourceEntry, resolveDevContainerSourceConnection } from '../../browser/devContainerSource.js';

suite('Dev Container source connection', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const source: IRemoteAgentHostEntry = { name: 'Server', connection: { type: RemoteAgentHostEntryType.SSH, address: 'ssh:server', hostName: 'server' } };
	const wslSource: IRemoteAgentHostEntry = { name: 'Ubuntu', connection: { type: RemoteAgentHostEntryType.WSL, address: 'wsl:Ubuntu', distro: 'Ubuntu' } };
	const otherDistro: IRemoteAgentHostEntry = { name: 'Fedora', connection: { type: RemoteAgentHostEntryType.WSL, address: 'wsl:Fedora', distro: 'Fedora' } };
	const workspace = URI.from({ scheme: AGENT_HOST_SCHEME, authority: agentHostAuthority('ssh:server'), path: '/workspace' });

	test('keeps source host paths independent of the desktop OS', () => {
		assert.deepStrictEqual([
			devContainerSourcePath(workspace),
			devContainerSourcePath(workspace.with({ path: '/c:/Users/test/project' })),
			devContainerSourcePath(toAgentHostUri(URI.from({ scheme: Schemas.file, authority: 'server', path: '/share/project' }), workspace.authority)),
			devContainerSourcePath(URI.file('/local/project')),
		], ['/workspace', '/c:/Users/test/project', '//server/share/project', URI.file('/local/project').fsPath]);
	});

	test('only accepts workspaces owned by configured SSH, Tunnel, or WSL hosts', () => {
		const remoteService = new class extends mock<IRemoteAgentHostService>() {
			override readonly configuredEntries: readonly IRemoteAgentHostEntry[] = [
				source,
				wslSource,
				otherDistro,
				{ name: 'Container', connection: { type: RemoteAgentHostEntryType.DevContainer, address: 'devcontainer:child', hostPath: '/workspace' } },
				{ name: 'WebSocket', connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'localhost:4321' } },
			];
		}();
		assert.deepStrictEqual([
			getDevContainerSourceEntry(workspace, remoteService),
			getDevContainerSourceEntry(workspace.with({ authority: agentHostAuthority('wsl:Ubuntu') }), remoteService),
			getDevContainerSourceEntry(workspace.with({ authority: agentHostAuthority('wsl:Fedora') }), remoteService),
			getDevContainerSourceEntry(URI.file('/workspace'), remoteService),
			getDevContainerSourceEntry(workspace.with({ authority: agentHostAuthority('ssh:missing') }), remoteService),
			getDevContainerSourceEntry(workspace.with({ authority: agentHostAuthority('wsl:missing') }), remoteService),
			getDevContainerSourceEntry(workspace.with({ authority: agentHostAuthority('devcontainer:child') }), remoteService),
			getDevContainerSourceEntry(workspace.with({ authority: agentHostAuthority('localhost:4321') }), remoteService),
		], [source, wslSource, otherDistro, undefined, undefined, undefined, undefined, undefined]);
	});

	for (const [entry, useProvider] of [[source, true], [source, false], [wslSource, true], [wslSource, false]] as const) {
		test(`waits for the ${useProvider ? 'provider' : 'service'}-started ${entry.connection.type} connection before restoring its container`, async () => {
			const address = getEntryAddress(entry);
			const sourceWorkspace = workspace.with({ authority: agentHostAuthority(address) });
			const connection = new class extends mock<IAgentConnection>() { }();
			const ready = new DeferredPromise<void>();
			const waiting = new DeferredPromise<void>();
			let connected = false;
			let connectCalls = 0;
			let waitCalls = 0;
			const remoteService = new class extends mock<IRemoteAgentHostService>() {
				override readonly configuredEntries = [source, wslSource, otherDistro];
				override getConnection(): IAgentConnection | undefined { return connected ? connection : undefined; }
				override reconnect(actualAddress: string): void {
					assert.strictEqual(actualAddress, address);
					connectCalls++;
				}
				override async waitForConnection(actualAddress: string): Promise<IRemoteAgentHostConnectionInfo> {
					assert.strictEqual(actualAddress, address);
					waitCalls++;
					await waiting.complete();
					await ready.p;
					connected = true;
					return new class extends mock<IRemoteAgentHostConnectionInfo>() { }();
				}
			}();
			const provider = new class extends mock<IAgentHostSessionsProvider>() {
				override readonly id = `agenthost-${agentHostAuthority(address)}`;
				override readonly remoteAddress = address;
				override getSessionConfig() { return undefined; }
				override async connect(): Promise<void> { connectCalls++; }
			}();
			const providersService = new class extends mock<ISessionsProvidersService>() {
				override getProviders() { return useProvider ? [provider] : []; }
			}();
			let resolved = false;
			const connecting = resolveDevContainerSourceConnection(sourceWorkspace, remoteService, providersService, CancellationToken.None).then(value => {
				resolved = true;
				return value;
			});
			await waiting.p;
			const resolvedBeforeReady = resolved;
			await ready.complete();
			const first = await connecting;
			const second = await resolveDevContainerSourceConnection(sourceWorkspace, remoteService, providersService, CancellationToken.None);
			assert.deepStrictEqual({ resolvedBeforeReady, first: first === connection, second: second === connection, connectCalls, waitCalls }, {
				resolvedBeforeReady: false, first: true, second: true, connectCalls: 1, waitCalls: 1,
			});
		});
	}

	test('reports a removed source host instead of falling back to the desktop', async () => {
		const remoteService = new class extends mock<IRemoteAgentHostService>() {
			override readonly configuredEntries = [];
		}();
		await assert.rejects(resolveDevContainerSourceConnection(workspace, remoteService, new class extends mock<ISessionsProvidersService>() { }(), CancellationToken.None), /no longer configured/);
	});
});
