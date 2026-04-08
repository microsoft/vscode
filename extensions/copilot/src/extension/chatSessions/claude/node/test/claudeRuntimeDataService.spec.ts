/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AgentInfo, Query } from '@anthropic-ai/claude-agent-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ILogService } from '../../../../../platform/log/common/logService';
import { mock } from '../../../../../util/common/test/simpleMock';
import { DisposableStore } from '../../../../../util/vs/base/common/lifecycle';
import { ClaudeRuntimeDataService } from '../claudeRuntimeDataService';

class TestLogService extends mock<ILogService>() {
	override trace() { }
	override error() { }
}

function createMockQuery(agents: AgentInfo[]): Pick<Query, 'supportedAgents'> {
	return {
		supportedAgents: vi.fn().mockResolvedValue(agents),
	};
}

describe('ClaudeRuntimeDataService', () => {
	let disposables: DisposableStore;
	let service: ClaudeRuntimeDataService;

	beforeEach(() => {
		disposables = new DisposableStore();
		service = disposables.add(new ClaudeRuntimeDataService(new TestLogService()));
	});

	afterEach(() => {
		disposables.dispose();
	});

	it('returns empty agents before first update', () => {
		expect(service.getAgents()).toEqual([]);
	});

	it('caches agents after update', async () => {
		const agents: AgentInfo[] = [
			{ name: 'Explore', description: 'Fast exploration' },
			{ name: 'Review', description: 'Code review', model: 'claude-3.5-sonnet' },
		];
		await service.update(createMockQuery(agents) as Query);

		expect(service.getAgents()).toEqual(agents);
	});

	it('fires onDidChange after update', async () => {
		let fired = false;
		disposables.add(service.onDidChange(() => { fired = true; }));

		await service.update(createMockQuery([]) as Query);
		expect(fired).toBe(true);
	});

	it('fires onDidChange even when supportedAgents fails', async () => {
		let fired = false;
		disposables.add(service.onDidChange(() => { fired = true; }));

		const query = {
			supportedAgents: vi.fn().mockRejectedValue(new Error('SDK error')),
		};
		await service.update(query as unknown as Query);

		expect(fired).toBe(true);
		// Previous cache should be preserved (empty in this case)
		expect(service.getAgents()).toEqual([]);
	});

	it('preserves previous cache on error', async () => {
		const agents: AgentInfo[] = [{ name: 'Explore', description: 'Agent' }];
		await service.update(createMockQuery(agents) as Query);

		const failingQuery = {
			supportedAgents: vi.fn().mockRejectedValue(new Error('fail')),
		};
		await service.update(failingQuery as unknown as Query);

		expect(service.getAgents()).toEqual(agents);
	});

	it('overwrites cache on subsequent updates', async () => {
		await service.update(createMockQuery([{ name: 'A', description: 'First' }]) as Query);
		expect(service.getAgents()).toHaveLength(1);

		await service.update(createMockQuery([{ name: 'B', description: 'Second' }, { name: 'C', description: 'Third' }]) as Query);
		expect(service.getAgents()).toHaveLength(2);
		expect(service.getAgents()[0].name).toBe('B');
	});
});
