/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { NullLogService } from '../../../log/common/log.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { type IAgentHostChatContribution, type IAgentHostChatContributionContext, type ITurnEnd, AgentHostChatContributionRegistry, AgentHostChatContributions } from '../../node/chatContributions/chatContribution.js';

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

function createContext(): IAgentHostChatContributionContext {
	return {
		logService: new NullLogService(),
		dispatch: () => { },
		getSessionSummary: () => undefined,
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
