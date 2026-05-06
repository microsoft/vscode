/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IRemoteAgentHostConnectionInfo, RemoteAgentHostConnectionStatus } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { resolveEventsUri } from '../../browser/openSessionEventsFileActions.js';

suite('openSessionEventsFile resolveEventsUri', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const userHome = URI.file('/home/me');

	function makeRemoteConn(address: string, defaultDirectory: string | undefined): IRemoteAgentHostConnectionInfo {
		return {
			address,
			name: address,
			clientId: 'client-1',
			defaultDirectory,
			status: RemoteAgentHostConnectionStatus.connected,
		};
	}

	test('local AH copilotcli session resolves to ~/.copilot/session-state/<id>/events.jsonl', () => {
		const result = resolveEventsUri(URI.parse('agent-host-copilotcli:/abc'), userHome, () => undefined);
		assert.deepStrictEqual(
			{ kind: result.kind, resource: result.kind === 'ok' ? result.resource.toString() : undefined },
			{ kind: 'ok', resource: 'file:///home/me/.copilot/session-state/abc/events.jsonl' },
		);
	});

	test('EH CLI copilotcli session resolves to ~/.copilot/session-state/<id>/events.jsonl', () => {
		const result = resolveEventsUri(URI.parse('copilotcli:/abc'), userHome, () => undefined);
		assert.deepStrictEqual(
			{ kind: result.kind, resource: result.kind === 'ok' ? result.resource.toString() : undefined },
			{ kind: 'ok', resource: 'file:///home/me/.copilot/session-state/abc/events.jsonl' },
		);
	});

	test('remote copilotcli session wraps host events.jsonl in vscode-agent-host URI', () => {
		const conn = makeRemoteConn('localhost:4321', '/home/remote');
		const result = resolveEventsUri(
			URI.parse('remote-localhost__4321-copilotcli:/xyz'),
			userHome,
			authority => authority === 'localhost__4321' ? conn : undefined,
		);
		assert.deepStrictEqual(
			{ kind: result.kind, resource: result.kind === 'ok' ? result.resource.toString() : undefined },
			{ kind: 'ok', resource: 'vscode-agent-host://localhost__4321/file/-/home/remote/.copilot/session-state/xyz/events.jsonl' },
		);
	});

	test('remote scheme without an active connection returns remote-not-connected', () => {
		const result = resolveEventsUri(
			URI.parse('remote-myhost-copilotcli:/abc'),
			userHome,
			() => undefined,
		);
		assert.deepStrictEqual(result, { kind: 'remote-not-connected', authority: 'myhost' });
	});

	test('remote scheme without a defaultDirectory returns remote-no-home', () => {
		const conn = makeRemoteConn('myhost', undefined);
		const result = resolveEventsUri(
			URI.parse('remote-myhost-copilotcli:/abc'),
			userHome,
			authority => authority === 'myhost' ? conn : undefined,
		);
		assert.deepStrictEqual(result, { kind: 'remote-no-home', authority: 'myhost' });
	});

	test('unknown scheme returns unsupported-scheme', () => {
		const result = resolveEventsUri(URI.parse('claude:/abc'), userHome, () => undefined);
		assert.deepStrictEqual(result, { kind: 'unsupported-scheme', scheme: 'claude' });
	});

	test('missing session resource returns no-session', () => {
		const result = resolveEventsUri(undefined, userHome, () => undefined);
		assert.deepStrictEqual(result, { kind: 'no-session' });
	});
});
