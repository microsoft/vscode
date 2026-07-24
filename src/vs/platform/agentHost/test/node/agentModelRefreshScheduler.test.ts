/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { observableValue } from '../../../../base/common/observable.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { IAgent, IAgentDescriptor } from '../../common/agentService.js';
import { AgentModelRefreshScheduler } from '../../node/agentModelRefreshScheduler.js';

/**
 * Minimal stand-in for a provider: the scheduler only ever reads the descriptor
 * (for logging) and calls `refreshModels`.
 */
class TestAgent {
	refreshCount = 0;
	/** When set, `refreshModels` rejects with this instead of resolving. */
	refreshError: Error | undefined;

	constructor(private readonly _provider: string) { }

	getDescriptor(): IAgentDescriptor {
		return { provider: this._provider, displayName: this._provider, description: this._provider };
	}

	async refreshModels(): Promise<void> {
		this.refreshCount++;
		if (this.refreshError) {
			throw this.refreshError;
		}
	}
}

/** A provider that predates `refreshModels` and must simply be skipped. */
class LegacyTestAgent {
	getDescriptor(): IAgentDescriptor {
		return { provider: 'legacy', displayName: 'legacy', description: 'legacy' };
	}
}

function asAgents(...agents: readonly (TestAgent | LegacyTestAgent)[]): readonly IAgent[] {
	return agents as unknown as readonly IAgent[];
}

suite('AgentModelRefreshScheduler', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const INTERVAL_MS = 2;

	function createScheduler(agents: ReturnType<typeof observableValue<readonly IAgent[]>>): AgentModelRefreshScheduler {
		return disposables.add(new AgentModelRefreshScheduler(agents, INTERVAL_MS, new NullLogService()));
	}

	/** Waits for the tick-driven condition, bounded so a failure fails fast. */
	async function waitFor(condition: () => boolean): Promise<void> {
		for (let i = 0; i < 500 && !condition(); i++) {
			await timeout(INTERVAL_MS);
		}
	}

	test('ticks every registered agent repeatedly and stops on dispose', async () => {
		const copilot = new TestAgent('copilotcli');
		const claude = new TestAgent('claude');
		const agents = observableValue<readonly IAgent[]>('agents', asAgents(copilot, claude));
		const scheduler = createScheduler(agents);

		await waitFor(() => copilot.refreshCount >= 2 && claude.refreshCount >= 2);
		scheduler.dispose();
		const countsAtDispose = { copilot: copilot.refreshCount, claude: claude.refreshCount };
		await timeout(INTERVAL_MS * 10);

		assert.deepStrictEqual({
			tickedRepeatedly: countsAtDispose.copilot >= 2 && countsAtDispose.claude >= 2,
			copilotAfterDispose: copilot.refreshCount,
			claudeAfterDispose: claude.refreshCount,
		}, {
			tickedRepeatedly: true,
			copilotAfterDispose: countsAtDispose.copilot,
			claudeAfterDispose: countsAtDispose.claude,
		});
	});

	test('does not tick while no agents are registered, and starts once one appears', async () => {
		const agents = observableValue<readonly IAgent[]>('agents', []);
		createScheduler(agents);

		await timeout(INTERVAL_MS * 10);
		const agent = new TestAgent('copilotcli');
		agents.set(asAgents(agent), undefined);
		await waitFor(() => agent.refreshCount >= 1);

		assert.ok(agent.refreshCount >= 1, 'expected the scheduler to tick after an agent was registered');
	});

	test('registering another agent does not postpone the next tick', () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			const first = new TestAgent('copilotcli');
			const second = new TestAgent('codex');
			const agents = observableValue<readonly IAgent[]>('agents', asAgents(first));
			const scheduler = createScheduler(agents);

			await timeout(INTERVAL_MS - 1);
			agents.set(asAgents(first, second), undefined);
			await timeout(1);
			scheduler.dispose();

			assert.deepStrictEqual({
				first: first.refreshCount,
				second: second.refreshCount,
			}, {
				first: 1,
				second: 1,
			});
		});
	});

	test('a failing or unimplemented refresh does not stop the other agents or later ticks', async () => {
		const failing = new TestAgent('failing');
		failing.refreshError = new Error('boom');
		const healthy = new TestAgent('healthy');
		const agents = observableValue<readonly IAgent[]>('agents', asAgents(failing, new LegacyTestAgent(), healthy));
		createScheduler(agents);

		await waitFor(() => healthy.refreshCount >= 3);

		assert.ok(healthy.refreshCount >= 3, 'expected ticks to continue past a rejecting agent');
	});
});
