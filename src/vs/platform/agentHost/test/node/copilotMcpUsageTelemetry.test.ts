/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestDataTelemetryService } from '../../../telemetry/test/common/testTelemetryService.js';
import { CopilotMcpUsageTelemetry } from '../../node/copilot/copilotMcpUsageTelemetry.js';

suite('Copilot MCP usage telemetry', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const context = {
		agentSessionId: 'session', chatSessionId: 'chat', sdkSessionId: 'sdk', turnId: 'turn',
		routingEnabled: false, toolSearchActive: true, configuredServerCount: 2,
	};
	const emptyCounts = {
		mcpToolCalls: 0, mcpToolSuccesses: 0, mcpToolErrors: 0, mcpToolCancellations: 0,
		routingToolCalls: 0, routingToolSuccesses: 0, routingToolErrors: 0, routingToolCancellations: 0,
		searches: 0, searchesReturningRoutingTools: 0, serversUsed: 0,
	};

	for (const routingEnabled of [false, true]) {
		test(`keeps zero-use turns in the denominator with routing=${routingEnabled}`, () => {
			const telemetry = new TestDataTelemetryService();
			const tracker = store.add(new CopilotMcpUsageTelemetry({ ...context, routingEnabled }, telemetry));
			tracker.complete('success');
			tracker.dispose();
			assert.deepStrictEqual(telemetry.events, [
				{ name: 'agentHost.mcpUsageStarted', data: { ...context, routingEnabled } },
				{ name: 'agentHost.mcpUsageCompleted', data: { ...context, routingEnabled, ...emptyCounts, result: 'success' } },
			]);
		});
	}

	test('separates proxy activation from real MCP success and deduplicates calls and servers', () => {
		const telemetry = new TestDataTelemetryService();
		const tracker = store.add(new CopilotMcpUsageTelemetry({ ...context, routingEnabled: true }, telemetry));
		tracker.recordToolStart('proxy', 'private-server', true);
		tracker.recordToolComplete('proxy', { success: true, pastTenseMessage: 'Connected' });
		tracker.recordToolStart('proxy', 'private-server', true);
		tracker.recordToolComplete('proxy', { success: true, pastTenseMessage: 'Duplicate' });
		for (const id of ['first', 'second']) {
			tracker.recordToolStart(id, 'private-server', false);
			tracker.recordToolComplete(id, { success: true, pastTenseMessage: 'Used MCP' });
		}
		tracker.recordSearch(true);
		tracker.recordSearch(false);
		tracker.complete('success');
		assert.deepStrictEqual(telemetry.events[1], {
			name: 'agentHost.mcpUsageCompleted',
			data: {
				...context, routingEnabled: true, ...emptyCounts, result: 'success',
				mcpToolCalls: 2, mcpToolSuccesses: 2, serversUsed: 1,
				routingToolCalls: 1, routingToolSuccesses: 1, searches: 2, searchesReturningRoutingTools: 1,
			},
		});
	});

	test('retains failed, cancelled and unfinished attempts without turning them into use', () => {
		const telemetry = new TestDataTelemetryService();
		const tracker = store.add(new CopilotMcpUsageTelemetry(context, telemetry));
		for (const routing of [false, true]) {
			for (const code of ['failure', 'denied', 'cancelled', 'rejected']) {
				const id = `${routing}-${code}`;
				tracker.recordToolStart(id, 'private-server', routing);
				tracker.recordToolComplete(id, { success: false, pastTenseMessage: 'Failed', error: { code, message: 'Not collected' } });
			}
			tracker.recordToolStart(`unfinished-${routing}`, 'private-server', routing);
		}
		tracker.recordToolComplete('unobserved-start', { success: true, pastTenseMessage: 'Not counted' });
		tracker.dispose();
		tracker.recordToolComplete('unfinished-false', { success: true, pastTenseMessage: 'Late' });
		tracker.recordToolStart('late-start', 'another-private-server', false);
		tracker.recordSearch(true);
		tracker.complete('success');
		assert.deepStrictEqual(telemetry.events, [
			{ name: 'agentHost.mcpUsageStarted', data: context },
			{
				name: 'agentHost.mcpUsageCompleted',
				data: {
					...context, ...emptyCounts, result: 'interrupted',
					mcpToolCalls: 5, mcpToolErrors: 1, mcpToolCancellations: 3,
					routingToolCalls: 5, routingToolErrors: 1, routingToolCancellations: 3,
				},
			},
		]);
	});
});
