/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE } from '../../common/agentHostCheckpointService.js';
import { IAgentHostChangesetService } from '../../common/agentHostChangesetService.js';
import { IAgentHostChatContributions, type IAgentHostChatContribution, type IAgentHostChatContributionHost, type IOutgoingTurn, type ITurnEnd } from '../../common/agentHostChatContributionsService.js';
import { AgentHostArtifactToolsConfigKey, AgentHostMarkdownPlanRichLinksEnabledConfigKey, type ISchema, type SchemaDefinition, type SchemaValue } from '../../common/agentHostSchema.js';
import { withChatSurfaceMeta } from '../../common/meta/agentChatSurfaceMeta.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { SessionStatus } from '../../common/state/sessionState.js';
import { IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostChatContributions } from '../../node/agentHostChatContributionsService.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../node/agentHostStateManager.js';
import { registerBuiltInChatContributions } from '../../node/chatContributions/builtInChatContributions.js';
import { ARTIFACT_TOOLS_INSTRUCTION } from '../../node/shared/artifactServerTools.js';

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

function createConfigurationService(enableSendInstructions: boolean): IAgentConfigurationService {
	const agentConfigService = { _serviceBrand: undefined } as IAgentConfigurationService;
	agentConfigService.getEffectiveWorkingDirectories = () => undefined;
	agentConfigService.getRootValue = <D extends SchemaDefinition, K extends keyof D & string>(_schema: ISchema<D>, key: K): SchemaValue<D[K]> | undefined => {
		return enableSendInstructions && (key === AgentHostMarkdownPlanRichLinksEnabledConfigKey || key === AgentHostArtifactToolsConfigKey)
			? true as SchemaValue<D[K]>
			: undefined;
	};
	return agentConfigService;
}

function createContributions(disposables: ReturnType<typeof ensureNoDisposablesAreLeakedInTestSuite>, ...contributions: readonly IAgentHostChatContribution[]): AgentHostChatContributions {
	const service = new AgentHostChatContributions(new NullLogService());
	for (const contribution of contributions) {
		disposables.add(service.registerContribution(contribution));
	}
	return service;
}

function createBuiltInContributions(disposables: ReturnType<typeof ensureNoDisposablesAreLeakedInTestSuite>, observed?: string[], enableSendInstructions = false): AgentHostChatContributions {
	const logService = new NullLogService();
	const stateManager = disposables.add(new AgentHostStateManager(logService));
	stateManager.createSession({
		resource: 'agent-host-session://test',
		provider: 'test',
		title: 'Test',
		status: SessionStatus.IsRead,
		createdAt: '2025-01-01T00:00:00.000Z',
		modifiedAt: '2025-01-01T00:00:00.000Z',
		_meta: withChatSurfaceMeta(undefined, enableSendInstructions ? { surface: 'terminal', osName: 'Linux' } : undefined),
	});
	disposables.add(stateManager.onDidEmitEnvelope(envelope => {
		if (envelope.action.type === ActionType.SessionIsReadChanged) {
			observed?.push('markUnread');
		}
	}));
	const changesets = { _serviceBrand: undefined } as IAgentHostChangesetService;
	changesets.onTurnComplete = () => { };
	const checkpointService = observed ? {
		...NULL_CHECKPOINT_SERVICE,
		captureTurnCheckpoint: async () => { observed.push('checkpointAndChangeset'); },
	} as IAgentHostCheckpointService : NULL_CHECKPOINT_SERVICE;
	const service = disposables.add(new AgentHostChatContributions(logService));
	const agentConfigService = createConfigurationService(enableSendInstructions);
	const instantiationService = disposables.add(new InstantiationService(new ServiceCollection(
		[ILogService, logService],
		[IAgentHostCheckpointService, checkpointService],
		[IAgentHostChangesetService, changesets],
		[IAgentConfigurationService, agentConfigService],
		[IAgentHostStateManager, stateManager],
		[IAgentHostChatContributions, service],
	), /*strict*/ true));
	const host: IAgentHostChatContributionHost = {
		drainQueuedMessages: () => observed?.push('queueDrain'),
		notifyTurnComplete: () => observed?.push('gitRefresh'),
		refineTitleFromFirstTurn: () => observed?.push('titleRefinement'),
		prepareRenameInstruction: async () => enableSendInstructions ? 'rename instruction' : undefined,
	};
	disposables.add(service.registerHost(host));
	disposables.add(registerBuiltInChatContributions(service, instantiationService));
	return service;
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
		const contributions = disposables.add(createContributions(disposables, new OrderedFirstContribution(), new OrderedSecondContribution(), new OrderedThirdContribution()));
		contributions.turnEnd(turnEnd('ordered'));

		assert.deepStrictEqual(calls, ['second', 'first', 'third']);
	});

	test('runs built-in turn-end contributions in the original sequence', () => {
		const observed: string[] = [];
		const contributions = createBuiltInContributions(disposables, observed);
		contributions.turnEnd(turnEnd('built-in-order'));

		assert.deepStrictEqual(observed, ['checkpointAndChangeset', 'queueDrain', 'gitRefresh', 'titleRefinement', 'markUnread']);
	});

	test('runs built-in send contributions in the original sequence', async () => {
		const contributions = createBuiltInContributions(disposables, undefined, true);
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
		const contributions = disposables.add(createContributions(disposables, new ThrowingContribution(), new FollowingContribution()));
		contributions.turnEnd(turnEnd('throwing'));

		assert.deepStrictEqual(calls, ['following']);
	});

	test('propagates the terminal outcome reason', () => {
		const contributions = disposables.add(createContributions(disposables, new ReasonContribution()));
		contributions.turnEnd(turnEnd('reason', { kind: 'cancelled' }));

		assert.deepStrictEqual(calls, ['cancelled']);
	});

	test('skips contributions without an onTurnEnd hook', () => {
		const contributions = disposables.add(createContributions(disposables, new OptionalContribution()));
		contributions.turnEnd(turnEnd('optional'));

		assert.deepStrictEqual(calls, []);
	});

	test('collects send instructions in contribution order', async () => {
		const contributions = disposables.add(createContributions(disposables, new SendOrderFirstContribution(), new SendOrderSecondContribution()));

		assert.deepStrictEqual(await contributions.contributeSend(outgoingTurn('send-order')), ['second', 'first']);
	});

	test('awaits asynchronous send contributions', async () => {
		const contributions = disposables.add(createContributions(disposables, new AsyncSendContribution()));

		assert.deepStrictEqual(await contributions.contributeSend(outgoingTurn('send-async')), ['async']);
		assert.deepStrictEqual(calls, ['async']);
	});

	test('isolates a failing send contribution', async () => {
		const contributions = disposables.add(createContributions(disposables, new ThrowingSendContribution(), new FollowingSendContribution()));

		assert.deepStrictEqual(await contributions.contributeSend(outgoingTurn('send-failure')), ['following']);
	});

	test('omits empty send contribution results', async () => {
		const contributions = disposables.add(createContributions(disposables, new EmptySendContribution()));

		assert.deepStrictEqual(await contributions.contributeSend(outgoingTurn('send-empty-array')), []);
		assert.deepStrictEqual(await contributions.contributeSend(outgoingTurn('send-empty-object')), []);
	});
});
