/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { NullLogService } from '../../../log/common/log.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NULL_CHECKPOINT_SERVICE, type IAgentHostCheckpointService } from '../../common/agentHostCheckpointService.js';
import type { IAgentHostChangesetService } from '../../common/agentHostChangesetService.js';
import { SessionStatus, type SessionSummary } from '../../common/state/sessionState.js';
import type { IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { type IAgentHostChatContribution, type IAgentHostChatContributionContext, type ITurnEnd, AgentHostChatContributionRegistry, AgentHostChatContributions } from '../../node/chatContributions/chatContribution.js';
import '../../node/chatContributions/chatContributions.contribution.js';

let calls: string[] = [];

class OrderedFirstContribution extends Disposable implements IAgentHostChatContribution {
	readonly id = 'orderedFirst';
	readonly order = 10;

	onTurnEnd(turn: ITurnEnd): void {
		if (turn.turnId === 'ordered') {
			calls.push('first');
		}
	}
}

class OrderedSecondContribution extends Disposable implements IAgentHostChatContribution {
	readonly id = 'orderedSecond';
	readonly order = 0;

	onTurnEnd(turn: ITurnEnd): void {
		if (turn.turnId === 'ordered') {
			calls.push('second');
		}
	}
}

class OrderedThirdContribution extends Disposable implements IAgentHostChatContribution {
	readonly id = 'orderedThird';
	readonly order = 10;

	onTurnEnd(turn: ITurnEnd): void {
		if (turn.turnId === 'ordered') {
			calls.push('third');
		}
	}
}

class ThrowingContribution extends Disposable implements IAgentHostChatContribution {
	readonly id = 'throwing';
	readonly order = 20;

	onTurnEnd(turn: ITurnEnd): void {
		if (turn.turnId === 'throwing') {
			throw new Error('expected');
		}
	}
}

class FollowingContribution extends Disposable implements IAgentHostChatContribution {
	readonly id = 'following';
	readonly order = 21;

	onTurnEnd(turn: ITurnEnd): void {
		if (turn.turnId === 'throwing') {
			calls.push('following');
		}
	}
}

class ReasonContribution extends Disposable implements IAgentHostChatContribution {
	readonly id = 'reason';

	onTurnEnd(turn: ITurnEnd): void {
		if (turn.turnId === 'reason') {
			calls.push(turn.reason.kind);
		}
	}
}

class OptionalContribution extends Disposable implements IAgentHostChatContribution {
	readonly id = 'optional';
}

AgentHostChatContributionRegistry.register(OrderedFirstContribution);
AgentHostChatContributionRegistry.register(OrderedSecondContribution);
AgentHostChatContributionRegistry.register(OrderedThirdContribution);
AgentHostChatContributionRegistry.register(ThrowingContribution);
AgentHostChatContributionRegistry.register(FollowingContribution);
AgentHostChatContributionRegistry.register(ReasonContribution);
AgentHostChatContributionRegistry.register(OptionalContribution);

function createContext(observed?: string[]): IAgentHostChatContributionContext {
	const changesets = { _serviceBrand: undefined } as IAgentHostChangesetService;
	changesets.onTurnComplete = () => { };
	const agentConfigService = { _serviceBrand: undefined } as IAgentConfigurationService;
	agentConfigService.getEffectiveWorkingDirectories = () => undefined;

	return {
		logService: new NullLogService(),
		checkpointService: observed ? {
			...NULL_CHECKPOINT_SERVICE,
			captureTurnCheckpoint: async () => { observed.push('checkpointAndChangeset'); },
		} as IAgentHostCheckpointService : NULL_CHECKPOINT_SERVICE,
		changesets,
		agentConfigService,
		dispatch: () => { },
		getSessionSummary: () => {
			if (!observed) {
				return undefined;
			}
			observed.push('markUnread');
			return { status: SessionStatus.IsRead } as SessionSummary;
		},
		drainQueuedMessages: () => observed?.push('queueDrain'),
		notifyTurnComplete: () => observed?.push('gitRefresh'),
		refineTitleFromFirstTurn: () => observed?.push('titleRefinement'),
	};
}

function turnEnd(turnId: string, reason: ITurnEnd['reason'] = { kind: 'success' }): ITurnEnd {
	return { session: 'agent-host-session://test', channel: 'agent-host-session://test', turnId, reason };
}

suite('AgentHostChatContributions', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		calls = [];
	});

	test('runs contributions in order while preserving registration order for ties', () => {
		const contributions = disposables.add(new AgentHostChatContributions(createContext()));
		contributions.turnEnd(turnEnd('ordered'));

		assert.deepStrictEqual(calls, ['second', 'first', 'third']);
	});

	test('runs built-in turn-end contributions in the original sequence', () => {
		const observed: string[] = [];
		const contributions = disposables.add(new AgentHostChatContributions(createContext(observed)));
		contributions.turnEnd(turnEnd('built-in-order'));

		assert.deepStrictEqual(observed, ['checkpointAndChangeset', 'queueDrain', 'gitRefresh', 'titleRefinement', 'markUnread']);
	});

	test('isolates a throwing contribution', () => {
		const contributions = disposables.add(new AgentHostChatContributions(createContext()));
		contributions.turnEnd(turnEnd('throwing'));

		assert.deepStrictEqual(calls, ['following']);
	});

	test('propagates the terminal outcome reason', () => {
		const contributions = disposables.add(new AgentHostChatContributions(createContext()));
		contributions.turnEnd(turnEnd('reason', { kind: 'cancelled' }));

		assert.deepStrictEqual(calls, ['cancelled']);
	});

	test('skips contributions without an onTurnEnd hook', () => {
		const contributions = disposables.add(new AgentHostChatContributions(createContext()));
		contributions.turnEnd(turnEnd('optional'));

		assert.deepStrictEqual(calls, []);
	});
});
