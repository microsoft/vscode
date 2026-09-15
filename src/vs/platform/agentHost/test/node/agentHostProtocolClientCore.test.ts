/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { hasKey } from '../../../../base/common/types.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentHostClientState, AgentHostProtocolClientCore } from '../../common/agentHostProtocolClient.js';
import { PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS } from '../../common/state/protocol/version/registry.js';
import type { JsonRpcRequest, ProtocolMessage } from '../../common/state/sessionProtocol.js';
import type { IProtocolTransport } from '../../common/state/sessionTransport.js';

class ScriptedServerTransport extends Disposable implements IProtocolTransport {

	private readonly _onMessage = this._register(new Emitter<ProtocolMessage>());
	readonly onMessage = this._onMessage.event;

	private readonly _onClose = this._register(new Emitter<void>());
	readonly onClose = this._onClose.event;

	initializeRequest: JsonRpcRequest | undefined;

	send(message: Parameters<IProtocolTransport['send']>[0]): void {
		if (!hasKey(message, { method: true, id: true }) || message.method !== 'initialize') {
			throw new Error(`Unexpected client message: ${JSON.stringify(message)}`);
		}
		this.initializeRequest = message;
		queueMicrotask(() => this._onMessage.fire({
			jsonrpc: '2.0',
			id: message.id,
			result: {
				protocolVersion: PROTOCOL_VERSION,
				serverSeq: 7,
				snapshots: [],
				completionTriggerCharacters: ['@'],
			},
		}));
	}
}

suite('AgentHostProtocolClientCore', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('initializes against a scripted server without browser services', async () => {
		const transport = new ScriptedServerTransport();
		const client = disposables.add(new AgentHostProtocolClientCore(
			'scripted.agent-host',
			transport,
			{ clientId: 'headless-client' },
			new NullLogService(),
		));

		await client.connect();

		const request = transport.initializeRequest;
		if (!request) {
			throw new Error('Expected initialize request');
		}
		const params = request.params as {
			readonly channel: string;
			readonly clientId: string;
			readonly protocolVersions: readonly string[];
			readonly initialSubscriptions: readonly string[];
			readonly _meta: Record<string, unknown>;
		};
		assert.deepStrictEqual({
			request: {
				method: request.method,
				channel: params.channel,
				clientId: params.clientId,
				protocolVersions: params.protocolVersions,
				initialSubscriptions: params.initialSubscriptions,
				meta: params._meta,
			},
			connectionState: client.connectionState,
			initializeResult: client.initializeResult.get(),
			completionTriggerCharacters: await client.getCompletionTriggerCharacters(),
		}, {
			request: {
				method: 'initialize',
				channel: 'ahp-root://',
				clientId: 'headless-client',
				protocolVersions: SUPPORTED_PROTOCOL_VERSIONS.filter(version => version !== '0.8.0'),
				initialSubscriptions: ['ahp-root://'],
				meta: {},
			},
			connectionState: AgentHostClientState.Connected,
			initializeResult: {
				protocolVersion: PROTOCOL_VERSION,
				serverSeq: 7,
				snapshots: [],
				completionTriggerCharacters: ['@'],
			},
			completionTriggerCharacters: ['@'],
		});
	});
});
