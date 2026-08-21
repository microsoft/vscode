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
import { AgentHostArtifactToolsConfigKey, AgentHostMarkdownPlanRichLinksEnabledConfigKey, type ISchema, type SchemaDefinition, type SchemaValue } from '../../common/agentHostSchema.js';
import { SessionStatus, type SessionSummary } from '../../common/state/sessionState.js';
import type { IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { type IAgentHostChatContribution, type IAgentHostChatContributionContext, type IOutgoingTurn, type ITurnEnd, AgentHostChatContributionRegistry, AgentHostChatContributions } from '../../node/chatContributions/chatContribution.js';
import { ARTIFACT_TOOLS_INSTRUCTION } from '../../node/shared/artifactServerTools.js';
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

class SendOrderFirstContribution extends Disposable implements IAgentHostChatContribution {
	readonly id = 'sendOrderFirst';
	readonly order = 11;

	contributeSend(turn: IOutgoingTurn) {
		return turn.turnId === 'send-order' ? { instructions: ['first'] } : undefined;
	}
}

class SendOrderSecondContribution extends Disposable implements IAgentHostChatContribution {
	readonly id = 'sendOrderSecond';
	readonly order = 10;

	contributeSend(turn: IOutgoingTurn) {
		return turn.turnId === 'send-order' ? { instructions: ['second'] } : undefined;
	}
}

class AsyncSendContribution extends Disposable implements IAgentHostChatContribution {
	readonly id = 'asyncSend';
	readonly order = 20;

	async contributeSend(turn: IOutgoingTurn) {
		if (turn.turnId !== 'send-async') {
			return undefined;
		}
		await Promise.resolve();
		calls.push('async');
		return { instructions: ['async'] };
	}
}

class ThrowingSendContribution extends Disposable implements IAgentHostChatContribution {
	readonly id = 'throwingSend';
	readonly order = 30;

	contributeSend(turn: IOutgoingTurn) {
		if (turn.turnId === 'send-failure') {
			throw new Error('expected');
		}
		return undefined;
	}
}

class FollowingSendContribution extends Disposable implements IAgentHostChatContribution {
	readonly id = 'followingSend';
	readonly order = 31;

	contributeSend(turn: IOutgoingTurn) {
		return turn.turnId === 'send-failure' ? { instructions: ['following'] } : undefined;
	}
}

class EmptySendContribution extends Disposable implements IAgentHostChatContribution {
	readonly id = 'emptySend';
	readonly order = 40;

	contributeSend(turn: IOutgoingTurn) {
		if (turn.turnId === 'send-empty-array') {
			return { instructions: [] };
		}
		if (turn.turnId === 'send-empty-object') {
			return {};
		}
		return undefined;
	}
}

AgentHostChatContributionRegistry.register(OrderedFirstContribution);
AgentHostChatContributionRegistry.register(OrderedSecondContribution);
AgentHostChatContributionRegistry.register(OrderedThirdContribution);
AgentHostChatContributionRegistry.register(ThrowingContribution);
AgentHostChatContributionRegistry.register(FollowingContribution);
AgentHostChatContributionRegistry.register(ReasonContribution);
AgentHostChatContributionRegistry.register(OptionalContribution);
AgentHostChatContributionRegistry.register(SendOrderFirstContribution);
AgentHostChatContributionRegistry.register(SendOrderSecondContribution);
AgentHostChatContributionRegistry.register(AsyncSendContribution);
AgentHostChatContributionRegistry.register(ThrowingSendContribution);
AgentHostChatContributionRegistry.register(FollowingSendContribution);
AgentHostChatContributionRegistry.register(EmptySendContribution);

function createContext(observed?: string[], enableSendInstructions = false): IAgentHostChatContributionContext {
	const changesets = { _serviceBrand: undefined } as IAgentHostChangesetService;
	changesets.onTurnComplete = () => { };
	const agentConfigService = { _serviceBrand: undefined } as IAgentConfigurationService;
	agentConfigService.getEffectiveWorkingDirectories = () => undefined;
	agentConfigService.getRootValue = <D extends SchemaDefinition, K extends keyof D & string>(_schema: ISchema<D>, key: K): SchemaValue<D[K]> | undefined => {
		return enableSendInstructions && (key === AgentHostMarkdownPlanRichLinksEnabledConfigKey || key === AgentHostArtifactToolsConfigKey)
			? true as SchemaValue<D[K]>
			: undefined;
	};

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
		getSessionSurfaceMeta: () => enableSendInstructions ? { surface: 'terminal' as const, osName: 'Linux' } : undefined,
		prepareRenameInstruction: async () => enableSendInstructions ? 'rename instruction' : undefined,
	};
}

function turnEnd(turnId: string, reason: ITurnEnd['reason'] = { kind: 'success' }): ITurnEnd {
	return { session: 'agent-host-session://test', channel: 'agent-host-session://test', turnId, reason };
}

function outgoingTurn(turnId: string): IOutgoingTurn {
	return { session: 'agent-host-session://test', chat: 'agent-host-session://test', turnId };
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

	test('runs built-in send contributions in the original sequence', async () => {
		const contributions = disposables.add(new AgentHostChatContributions(createContext(undefined, true)));
		const instructions = await contributions.contributeSend(outgoingTurn('built-in-send-order'));

		assert.deepStrictEqual(instructions.map(instruction => {
			if (instruction.includes('<rich_plan_markdown>')) {
				return 'markdownPlanRichLinks';
			}
			if (instruction === ARTIFACT_TOOLS_INSTRUCTION) {
				return 'artifactTools';
			}
			if (instruction.includes('<terminal_chat>')) {
				return 'chatSurface';
			}
			if (instruction === 'rename instruction') {
				return 'renameInstruction';
			}
			return undefined;
		}), ['markdownPlanRichLinks', 'artifactTools', 'chatSurface', 'renameInstruction']);
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

	test('collects send instructions in contribution order', async () => {
		const contributions = disposables.add(new AgentHostChatContributions(createContext()));

		assert.deepStrictEqual(await contributions.contributeSend(outgoingTurn('send-order')), ['second', 'first']);
	});

	test('awaits asynchronous send contributions', async () => {
		const contributions = disposables.add(new AgentHostChatContributions(createContext()));

		assert.deepStrictEqual(await contributions.contributeSend(outgoingTurn('send-async')), ['async']);
		assert.deepStrictEqual(calls, ['async']);
	});

	test('isolates a failing send contribution', async () => {
		const contributions = disposables.add(new AgentHostChatContributions(createContext()));

		assert.deepStrictEqual(await contributions.contributeSend(outgoingTurn('send-failure')), ['following']);
	});

	test('omits empty send contribution results', async () => {
		const contributions = disposables.add(new AgentHostChatContributions(createContext()));

		assert.deepStrictEqual(await contributions.contributeSend(outgoingTurn('send-empty-array')), []);
		assert.deepStrictEqual(await contributions.contributeSend(outgoingTurn('send-empty-object')), []);
	});
});
