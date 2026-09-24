/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { chatUserInteractionAttributes, IChatUserInteractionTiming, ReportChatUserInteractionCommand } from '../../../../../platform/otel/common/chatUserInteraction.js';
import { ChatUserInteractionOTelService } from '../../browser/chatUserInteractionOTel.js';

suite('ChatUserInteractionOTel', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const timing: IChatUserInteractionTiming = {
		schemaVersion: 1, rendererId: 'renderer', interactionOrdinal: 1,
		result: 'hidden', requestPhase: 'unknown', timeToTermination: 0,
		windowVisible: false, windowFocused: false,
	};

	test('allowlists content-free fields and rejects invalid success or termination data', () => {
		const attributes = chatUserInteractionAttributes({ ...timing, prompt: 'private', chatSessionId: 'file:///private' });
		assert.strictEqual(attributes['vscode.chat.user_interaction.timeToTermination'], 0);
		assert.strictEqual(Object.keys(attributes).length, Object.keys(timing).length);
		for (const override of [
			{ timeToTermination: NaN }, { timeToTermination: -1 }, { timeToTermination: Infinity },
			{ interactionOrdinal: 0 }, { interactionOrdinal: 1.5 }, { schemaVersion: 2 },
			{ result: 'success' }, { result: 'bogus' }, { requestId: 'file:///private' },
			{ timeToFirstProgress: 0 }, { firstProgressKind: 'text' },
		]) {
			assert.throws(() => chatUserInteractionAttributes({ ...timing, ...override }));
		}
	});

	test('routes to the owning host or extension and flushes asynchronous deliveries', async () => {
		const calls: string[] = [];
		let release: () => void = () => { };
		const wait = new Promise<void>(resolve => { release = resolve; });
		const connection = upcastPartial<IAgentConnection>({
			reportUserInteraction: async () => { await wait; calls.push('host'); },
		});
		const resource = URI.parse('agent-host-copilotcli:/session');
		const service = new ChatUserInteractionOTelService(
			upcastPartial<IAgentHostConnectionsService>({
				ambientConnection: connection,
				resolveSessionResource: candidate => {
					assert.strictEqual(candidate, resource);
					return { connection, backendSession: URI.parse('copilotcli:/session'), connectionAuthority: 'local' };
				},
			}),
			upcastPartial<ICommandService>({
				executeCommand: async command => { calls.push(command); return undefined; },
			}),
			new NullLogService(),
		);
		disposables.add(CommandsRegistry.registerCommand(ReportChatUserInteractionCommand, () => { }));
		service.report({ ...timing, ...service.begin() }, resource, undefined);
		service.report({ ...timing, ...service.begin() }, undefined, 'local');
		const flushed = service.flush();
		assert.deepStrictEqual(calls, [ReportChatUserInteractionCommand]);
		release();
		assert.deepStrictEqual(await flushed, { schemaVersion: 1, started: 2, completed: 2, failed: 0 });
		assert.deepStrictEqual(calls, [ReportChatUserInteractionCommand, 'host']);
	});

	test('export failures are logged and surfaced by flush without rejecting the UI timer', async () => {
		const warnings: unknown[] = [];
		const service = new ChatUserInteractionOTelService(
			upcastPartial<IAgentHostConnectionsService>({
				ambientConnection: upcastPartial<IAgentConnection>({
					reportUserInteraction: async () => { throw new Error('transport disconnected'); },
				}),
			}),
			upcastPartial<ICommandService>({}),
			new class extends NullLogService {
				override warn(message: string, ...args: unknown[]) { warnings.push(message, ...args); }
			}(),
		);
		service.report({ ...timing, ...service.begin() }, undefined, 'agent-host-copilotcli');
		assert.strictEqual((await service.flush()).failed, 1);
		assert.strictEqual(warnings[0], '[ChatTTFP] OTel export failed');
	});

	test('routes early remote observations only to their host and fails unroutable observations', async () => {
		const calls: string[] = [];
		const warnings: string[] = [];
		const resource = URI.parse('remote-example-copilot:/session');
		const connection = upcastPartial<IAgentConnection>({
			reportUserInteraction: async () => { calls.push('remote'); },
		});
		const service = new ChatUserInteractionOTelService(
			upcastPartial<IAgentHostConnectionsService>({
				resolveSessionResource: candidate => {
					assert.strictEqual(candidate, resource);
					return { connection, backendSession: URI.parse('copilot:/session'), connectionAuthority: 'example' };
				},
			}),
			upcastPartial<ICommandService>({
				executeCommand: async command => { calls.push(command); return undefined; },
			}),
			new class extends NullLogService {
				override warn(message: string) { warnings.push(message); }
			}(),
		);
		disposables.add(CommandsRegistry.registerCommand(ReportChatUserInteractionCommand, () => { }));
		service.report({ ...timing, ...service.begin() }, resource, 'remote-agent-host');
		service.report({ ...timing, ...service.begin() }, undefined, 'remote-agent-host');
		assert.deepStrictEqual({ result: await service.flush(), calls, warnings }, {
			result: { schemaVersion: 1, started: 2, completed: 2, failed: 1 },
			calls: ['remote'],
			warnings: ['[ChatTTFP] OTel export failed'],
		});
	});
});
