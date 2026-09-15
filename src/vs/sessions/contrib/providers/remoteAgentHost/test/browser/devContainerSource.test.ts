/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AGENT_HOST_SCHEME, agentHostAuthority, toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { IRemoteAgentHostEntry, IRemoteAgentHostService, RemoteAgentHostEntryType } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IAgentHostSessionsProvider } from '../../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { devContainerSourcePath, getDevContainerSourceEntry, resolveDevContainerSourceConnection } from '../../browser/devContainerSource.js';

suite('Dev Container source connection', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const source: IRemoteAgentHostEntry = { name: 'Server', connection: { type: RemoteAgentHostEntryType.SSH, address: 'ssh:server', hostName: 'server' } };
	const workspace = URI.from({ scheme: AGENT_HOST_SCHEME, authority: agentHostAuthority('ssh:server'), path: '/workspace' });

	test('keeps source host paths independent of the desktop OS', () => {
		assert.deepStrictEqual([
			devContainerSourcePath(workspace),
			devContainerSourcePath(workspace.with({ path: '/c:/Users/test/project' })),
			devContainerSourcePath(toAgentHostUri(URI.from({ scheme: Schemas.file, authority: 'server', path: '/share/project' }), workspace.authority)),
			devContainerSourcePath(URI.file('/local/project')),
		], ['/workspace', '/c:/Users/test/project', '//server/share/project', URI.file('/local/project').fsPath]);
	});

	test('only accepts workspaces owned by configured SSH or Tunnel hosts', () => {
		const remoteService = new class extends mock<IRemoteAgentHostService>() {
			override readonly configuredEntries: readonly IRemoteAgentHostEntry[] = [
				source,
				{ name: 'Container', connection: { type: RemoteAgentHostEntryType.DevContainer, address: 'devcontainer:child', hostPath: '/workspace' } },
			];
		}();
		assert.deepStrictEqual([
			getDevContainerSourceEntry(workspace, remoteService),
			getDevContainerSourceEntry(URI.file('/workspace'), remoteService),
			getDevContainerSourceEntry(workspace.with({ authority: agentHostAuthority('ssh:missing') }), remoteService),
			getDevContainerSourceEntry(workspace.with({ authority: agentHostAuthority('devcontainer:child') }), remoteService),
		], [source, undefined, undefined, undefined]);
	});

	test('reconnects the owning provider before restoring its container', async () => {
		const connection = new class extends mock<IAgentConnection>() { }();
		let connected = false;
		let connectCalls = 0;
		const remoteService = new class extends mock<IRemoteAgentHostService>() {
			override readonly configuredEntries = [source];
			override getConnection(): IAgentConnection | undefined { return connected ? connection : undefined; }
		}();
		const provider = new class extends mock<IAgentHostSessionsProvider>() {
			override readonly id = 'agenthost-ssh-server';
			override readonly remoteAddress = 'ssh:server';
			override getSessionConfig() { return undefined; }
			override async connect(): Promise<void> { connected = true; connectCalls++; }
		}();
		const providersService = new class extends mock<ISessionsProvidersService>() {
			override getProviders() { return [provider]; }
		}();
		const first = await resolveDevContainerSourceConnection(workspace, remoteService, providersService, CancellationToken.None);
		const second = await resolveDevContainerSourceConnection(workspace, remoteService, providersService, CancellationToken.None);
		assert.deepStrictEqual({ first: first === connection, second: second === connection, connectCalls }, { first: true, second: true, connectCalls: 1 });
	});

	test('reports a removed source host instead of falling back to the desktop', async () => {
		const remoteService = new class extends mock<IRemoteAgentHostService>() {
			override readonly configuredEntries = [];
		}();
		await assert.rejects(resolveDevContainerSourceConnection(workspace, remoteService, new class extends mock<ISessionsProvidersService>() { }(), CancellationToken.None), /no longer configured/);
	});
});
