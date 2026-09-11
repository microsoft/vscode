/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { IAgentService, IConnectionTrackerService } from '../../common/agentService.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { AgentHostManagementService } from '../../node/agentHostManagementService.js';

suite('AgentHostManagementService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const session = URI.parse('copilot:/session');
	const chat = URI.parse('ahp-chat:/chat');

	function createService(agentService: Partial<IAgentService>): AgentHostManagementService {
		return new AgentHostManagementService(
			upcastPartial<IAgentService>(agentService),
			upcastPartial<IConnectionTrackerService>({}),
			async () => { },
			upcastPartial<ISessionDataService>({}),
			new NullLogService(),
		);
	}

	test('routes local Canvas dismissal through the management channel', async () => {
		const calls: [URI, URI, string][] = [];
		const service = createService({ closeCanvas: async (session, chat, instanceId) => { calls.push([session, chat, instanceId]); } });
		await service.closeCanvas(session, chat, 'counter');
		assert.deepStrictEqual(calls, [[session, chat, 'counter']]);
	});

	test('propagates Canvas dismissal failure', async () => {
		const error = new Error('Canvas provider unavailable');
		const service = createService({ closeCanvas: async () => { throw error; } });
		await assert.rejects(service.closeCanvas(session, chat, 'counter'), error);
	});

	test('rejects unavailable Canvas dismissal', () => {
		const service = createService({});
		assert.throws(() => service.closeCanvas(session, chat, 'counter'), /Canvas dismissal is unavailable/);
	});

	test('routes direct Canvas listing and opening through management IPC', async () => {
		const canvas = { chat: chat.toString(), instanceId: 'counter', canvasTypeId: 'main', extensionId: 'project:counter' };
		const catalog = [{ canvasTypeId: 'main', extensionId: 'project:counter', displayName: 'Counter' }];
		const calls: object[] = [];
		const service = createService({
			listCanvases: async (session, chat) => { calls.push({ session, chat }); return catalog; },
			openCanvas: async (session, chat, extensionId, canvasTypeId, input) => { calls.push({ session, chat, extensionId, canvasTypeId, input }); return canvas; },
		});
		assert.deepStrictEqual({
			catalog: await service.listCanvases(session, chat),
			opened: await service.openCanvas(session, chat, 'project:counter', 'main', { count: 2 }),
			calls,
		}, {
			catalog, opened: canvas,
			calls: [{ session, chat }, { session, chat, extensionId: 'project:counter', canvasTypeId: 'main', input: { count: 2 } }],
		});
	});

	test('propagates unavailable and failed Canvas operations', async () => {
		const unsupported = createService({});
		assert.throws(() => unsupported.listCanvases(session, chat), /unavailable/);
		assert.throws(() => unsupported.openCanvas(session, chat, 'extension', 'main'), /unavailable/);
		const failed = createService({
			listCanvases: async () => { throw new Error('Catalog unavailable'); },
			openCanvas: async () => { throw new Error('Schema rejected'); },
		});
		await assert.rejects(failed.listCanvases(session, chat), /Catalog unavailable/);
		await assert.rejects(failed.openCanvas(session, chat, 'extension', 'main'), /Schema rejected/);
	});
});
