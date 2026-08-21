/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Disposable } from '../../../../base/common/lifecycle.js';
import type { BrandedService, IConstructorSignature } from '../../../instantiation/common/instantiation.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE } from '../../common/agentHostCheckpointService.js';
import { IAgentHostChangesetService } from '../../common/agentHostChangesetService.js';
import { createChatMementoKey, createSessionMementoKey, IAgentHostChatContributions, type IAgentHostChatContribution, type IAgentHostChatContributionContext, type IAgentHostChatContributionHost, type IHydrationContext, type IOutgoingTurn, type ITurnEnd } from '../../common/agentHostChatContributionsService.js';
import { AgentHostArtifactToolsConfigKey, AgentHostMarkdownPlanRichLinksEnabledConfigKey, type ISchema, type SchemaDefinition, type SchemaValue } from '../../common/agentHostSchema.js';
import { withChatSurfaceMeta } from '../../common/meta/agentChatSurfaceMeta.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { buildChatUri, buildDefaultChatUri, MessageKind, SessionStatus, TurnState, type Turn } from '../../common/state/sessionState.js';
import { IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostChatContributions } from '../../node/agentHostChatContributionsService.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../node/agentHostStateManager.js';
import { registerBuiltInChatContributions } from '../../node/chatContributions/builtInChatContributions.js';
import { ARTIFACT_TOOLS_INSTRUCTION } from '../../node/shared/artifactServerTools.js';
import { createSessionDataService, TestSessionDatabase } from '../common/sessionTestHelpers.js';

let calls: string[] = [];

abstract class TestContribution extends Disposable implements IAgentHostChatContribution {
	constructor(protected readonly _context: IAgentHostChatContributionContext, ..._services: BrandedService[]) {
		super();
	}
}

class FirstMementoContribution extends TestContribution {
	static readonly id = 'firstMemento';
	static context: IAgentHostChatContributionContext | undefined;

	constructor(context: IAgentHostChatContributionContext, ...services: BrandedService[]) {
		super(context, ...services);
		FirstMementoContribution.context = context;
	}
}

class SecondMementoContribution extends TestContribution {
	static readonly id = 'secondMemento';
	static context: IAgentHostChatContributionContext | undefined;

	constructor(context: IAgentHostChatContributionContext, ...services: BrandedService[]) {
		super(context, ...services);
		SecondMementoContribution.context = context;
	}
}

class OrderedFirstContribution extends TestContribution {
	static readonly id = 'orderedFirst';
	readonly order = 10;

	onTurnEnd(turn: ITurnEnd): void {
		if (turn.turnId === 'ordered') {
			calls.push('first');
		}
	}
}

class OrderedSecondContribution extends TestContribution {
	static readonly id = 'orderedSecond';
	readonly order = 0;

	onTurnEnd(turn: ITurnEnd): void {
		if (turn.turnId === 'ordered') {
			calls.push('second');
		}
	}
}

class OrderedThirdContribution extends TestContribution {
	static readonly id = 'orderedThird';
	readonly order = 10;

	onTurnEnd(turn: ITurnEnd): void {
		if (turn.turnId === 'ordered') {
			calls.push('third');
		}
	}
}

class ThrowingContribution extends TestContribution {
	static readonly id = 'throwing';
	readonly order = 20;

	onTurnEnd(turn: ITurnEnd): void {
		if (turn.turnId === 'throwing') {
			throw new Error('expected');
		}
	}
}

class FollowingContribution extends TestContribution {
	static readonly id = 'following';
	readonly order = 21;

	onTurnEnd(turn: ITurnEnd): void {
		if (turn.turnId === 'throwing') {
			calls.push('following');
		}
	}
}

class ReasonContribution extends TestContribution {
	static readonly id = 'reason';

	onTurnEnd(turn: ITurnEnd): void {
		if (turn.turnId === 'reason') {
			calls.push(turn.reason.kind);
		}
	}
}

class OptionalContribution extends TestContribution {
	static readonly id = 'optional';
}

class SendOrderFirstContribution extends TestContribution {
	static readonly id = 'sendOrderFirst';
	readonly order = 11;

	contributeSend(turn: IOutgoingTurn) {
		return turn.turnId === 'send-order' ? { instructions: ['first'] } : undefined;
	}
}

class SendOrderSecondContribution extends TestContribution {
	static readonly id = 'sendOrderSecond';
	readonly order = 10;

	contributeSend(turn: IOutgoingTurn) {
		return turn.turnId === 'send-order' ? { instructions: ['second'] } : undefined;
	}
}

class AsyncSendContribution extends TestContribution {
	static readonly id = 'asyncSend';
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

class ThrowingSendContribution extends TestContribution {
	static readonly id = 'throwingSend';
	readonly order = 30;

	contributeSend(turn: IOutgoingTurn) {
		if (turn.turnId === 'send-failure') {
			throw new Error('expected');
		}
		return undefined;
	}
}

class FollowingSendContribution extends TestContribution {
	static readonly id = 'followingSend';
	readonly order = 31;

	contributeSend(turn: IOutgoingTurn) {
		return turn.turnId === 'send-failure' ? { instructions: ['following'] } : undefined;
	}
}

class EmptySendContribution extends TestContribution {
	static readonly id = 'emptySend';
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

class FirstHydrationContribution extends TestContribution {
	static readonly id = 'firstHydration';
	readonly order = 10;

	onHydrateTurns(_context: IHydrationContext, turns: readonly Turn[]): readonly Turn[] {
		calls.push(`first:${turns.map(turn => turn.id).join(',')}`);
		return [...turns, hydrationTurn('first')];
	}
}

class SecondHydrationContribution extends TestContribution {
	static readonly id = 'secondHydration';
	readonly order = 20;

	onHydrateTurns(_context: IHydrationContext, turns: readonly Turn[]): readonly Turn[] {
		calls.push(`second:${turns.map(turn => turn.id).join(',')}`);
		return [...turns, hydrationTurn('second')];
	}
}

class AsyncHydrationContribution extends TestContribution {
	static readonly id = 'asyncHydration';

	async onHydrateTurns(_context: IHydrationContext, turns: readonly Turn[]): Promise<readonly Turn[]> {
		await Promise.resolve();
		calls.push('async');
		return [...turns, hydrationTurn('async')];
	}
}

class PreviousHydrationContribution extends TestContribution {
	static readonly id = 'previousHydration';
	readonly order = 10;

	onHydrateTurns(_context: IHydrationContext, turns: readonly Turn[]): readonly Turn[] {
		return [...turns, hydrationTurn('previous')];
	}
}

class ThrowingHydrationContribution extends TestContribution {
	static readonly id = 'throwingHydration';
	readonly order = 20;

	onHydrateTurns(): readonly Turn[] {
		throw new Error('expected');
	}
}

class FollowingHydrationContribution extends TestContribution {
	static readonly id = 'followingHydration';
	readonly order = 30;

	onHydrateTurns(_context: IHydrationContext, turns: readonly Turn[]): readonly Turn[] {
		calls.push(`following:${turns.map(turn => turn.id).join(',')}`);
		return turns;
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

function createContributions(disposables: ReturnType<typeof ensureNoDisposablesAreLeakedInTestSuite>, ...contributions: readonly (IConstructorSignature<IAgentHostChatContribution, [IAgentHostChatContributionContext]> & { readonly id: string })[]): AgentHostChatContributions {
	const logService = new NullLogService();
	const instantiationService = disposables.add(new InstantiationService(new ServiceCollection(
		[ILogService, logService],
	), /*strict*/ true));
	const service = new AgentHostChatContributions(logService, instantiationService);
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
	const usageDatabase = new TestSessionDatabase();
	const originalGetTurnUsages = usageDatabase.getTurnUsages.bind(usageDatabase);
	usageDatabase.getTurnUsages = async () => {
		observed?.push('persistedTurnUsage');
		return originalGetTurnUsages();
	};
	const agentConfigService = createConfigurationService(enableSendInstructions);
	const services = new ServiceCollection(
		[ILogService, logService],
		[IAgentHostCheckpointService, checkpointService],
		[IAgentHostChangesetService, changesets],
		[IAgentConfigurationService, agentConfigService],
		[IAgentHostStateManager, stateManager],
		[ISessionDataService, createSessionDataService(usageDatabase)],
	);
	const instantiationService = disposables.add(new InstantiationService(services, /*strict*/ true));
	const service = disposables.add(new AgentHostChatContributions(logService, instantiationService));
	services.set(IAgentHostChatContributions, service);
	const host: IAgentHostChatContributionHost = {
		drainQueuedMessages: () => observed?.push('queueDrain'),
		notifyTurnComplete: () => observed?.push('gitRefresh'),
		refineTitleFromFirstTurn: () => observed?.push('titleRefinement'),
		prepareRenameInstruction: async () => enableSendInstructions ? 'rename instruction' : undefined,
		applyWorktreeRestoreAnnouncement: async (_session, turns) => {
			observed?.push('worktreeAnnouncement');
			return turns;
		},
	};
	disposables.add(service.registerHost(host));
	disposables.add(registerBuiltInChatContributions(service));
	return service;
}

function turnEnd(turnId: string, reason: ITurnEnd['reason'] = { kind: 'success' }): ITurnEnd {
	return { session: 'agent-host-session://test', channel: 'agent-host-session://test', turnId, reason };
}

function outgoingTurn(turnId: string): IOutgoingTurn {
	return { session: 'agent-host-session://test', chat: 'agent-host-session://test', turnId };
}

function hydrationContext(): IHydrationContext {
	const session = 'agent-host-session://test';
	return { session, chat: buildDefaultChatUri(session) };
}

function hydrationTurn(id: string): Turn {
	return {
		id,
		state: TurnState.Complete,
		message: { text: id, origin: { kind: MessageKind.User } },
		responseParts: [],
		usage: undefined,
	};
}

suite('AgentHostChatContributions', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		calls = [];
		FirstMementoContribution.context = undefined;
		SecondMementoContribution.context = undefined;
	});

	test('creates contribution-scoped mementos from their factories', () => {
		let factoryCalls = 0;
		const sharedName = createChatMementoKey<number>('shared', () => ++factoryCalls);
		const contributions = disposables.add(createContributions(disposables, FirstMementoContribution, SecondMementoContribution));
		const first = FirstMementoContribution.context!.memento(sharedName, 'agent-host-chat://first');
		const firstAgain = FirstMementoContribution.context!.memento(sharedName, 'agent-host-chat://first');
		const second = SecondMementoContribution.context!.memento(sharedName, 'agent-host-chat://first');

		assert.strictEqual(first, firstAgain);
		assert.deepStrictEqual([first.get(), second.get(), factoryCalls], [1, 2, 2]);
		contributions.dispose();
	});

	test('distinguishes memento extra key segments and evicts chat state', () => {
		const keyed = createChatMementoKey<number, [messageId: string, retry: number]>('keyed', () => 0);
		const contributions = disposables.add(createContributions(disposables, FirstMementoContribution));
		const context = FirstMementoContribution.context!;
		const first = context.memento(keyed, 'agent-host-chat://first', 'one', 0);
		const second = context.memento(keyed, 'agent-host-chat://first', 'two', 0);
		const retained = context.memento(keyed, 'agent-host-chat://second', 'one', 0);
		first.set(1, undefined);
		second.set(2, undefined);
		retained.set(3, undefined);

		contributions.disposeChatState('agent-host-chat://first');

		assert.deepStrictEqual([first.get(), second.get()], [1, 2]);
		assert.notStrictEqual(context.memento(keyed, 'agent-host-chat://first', 'one', 0), first);
		assert.strictEqual(context.memento(keyed, 'agent-host-chat://first', 'one', 0).get(), 0);
		assert.strictEqual(context.memento(keyed, 'agent-host-chat://second', 'one', 0), retained);
	});

	test('evicts session state and all supplied chat state without affecting other chats', () => {
		const chatKey = createChatMementoKey<number>('chat', () => 0);
		const sessionKey = createSessionMementoKey<number>('session', () => 0);
		const contributions = disposables.add(createContributions(disposables, FirstMementoContribution));
		const context = FirstMementoContribution.context!;
		const sessionResource = 'agent-host-session://session';
		const firstChatResource = buildChatUri(sessionResource, 'first');
		const secondChatResource = buildChatUri(sessionResource, 'second');
		const retainedChatResource = buildChatUri('agent-host-session://retained', 'retained');
		const firstChat = context.memento(chatKey, firstChatResource);
		const secondChat = context.memento(chatKey, secondChatResource);
		const retainedChat = context.memento(chatKey, retainedChatResource);
		const session = context.memento(sessionKey, sessionResource);

		contributions.disposeSessionState(sessionResource);

		assert.notStrictEqual(context.memento(chatKey, firstChatResource), firstChat);
		assert.notStrictEqual(context.memento(chatKey, secondChatResource), secondChat);
		assert.strictEqual(context.memento(chatKey, retainedChatResource), retainedChat);
		assert.notStrictEqual(context.memento(sessionKey, sessionResource), session);
	});

	test('supports queued-sender mementos keyed by message id', () => {
		interface IQueuedMessageSender {
			readonly messageId: string;
		}
		const queuedSender = createChatMementoKey<IQueuedMessageSender | undefined, [messageId: string]>('queueDrain.sender', () => undefined);
		const contributions = disposables.add(createContributions(disposables, FirstMementoContribution));
		const context = FirstMementoContribution.context!;
		const sender = context.memento(queuedSender, 'agent-host-chat://queue', 'message-1');
		sender.set({ messageId: 'message-1' }, undefined);

		assert.deepStrictEqual(sender.get(), { messageId: 'message-1' });
		assert.strictEqual(context.memento(queuedSender, 'agent-host-chat://queue', 'message-2').get(), undefined);
		contributions.disposeChatState('agent-host-chat://queue');
		assert.strictEqual(context.memento(queuedSender, 'agent-host-chat://queue', 'message-1').get(), undefined);
	});

	test('runs contributions in order while preserving registration order for ties', () => {
		const contributions = disposables.add(createContributions(disposables, OrderedFirstContribution, OrderedSecondContribution, OrderedThirdContribution));
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

	test('runs built-in hydration contributions in the original sequence', async () => {
		const observed: string[] = [];
		const contributions = createBuiltInContributions(disposables, observed);

		await contributions.hydrateTurns(hydrationContext(), [hydrationTurn('built-in-hydration-order')]);

		assert.deepStrictEqual(observed, ['persistedTurnUsage', 'worktreeAnnouncement']);
	});

	test('isolates a throwing contribution', () => {
		const contributions = disposables.add(createContributions(disposables, ThrowingContribution, FollowingContribution));
		contributions.turnEnd(turnEnd('throwing'));

		assert.deepStrictEqual(calls, ['following']);
	});

	test('propagates the terminal outcome reason', () => {
		const contributions = disposables.add(createContributions(disposables, ReasonContribution));
		contributions.turnEnd(turnEnd('reason', { kind: 'cancelled' }));

		assert.deepStrictEqual(calls, ['cancelled']);
	});

	test('skips contributions without an onTurnEnd hook', () => {
		const contributions = disposables.add(createContributions(disposables, OptionalContribution));
		contributions.turnEnd(turnEnd('optional'));

		assert.deepStrictEqual(calls, []);
	});

	test('collects send instructions in contribution order', async () => {
		const contributions = disposables.add(createContributions(disposables, SendOrderFirstContribution, SendOrderSecondContribution));

		assert.deepStrictEqual(await contributions.contributeSend(outgoingTurn('send-order')), ['second', 'first']);
	});

	test('awaits asynchronous send contributions', async () => {
		const contributions = disposables.add(createContributions(disposables, AsyncSendContribution));

		assert.deepStrictEqual(await contributions.contributeSend(outgoingTurn('send-async')), ['async']);
		assert.deepStrictEqual(calls, ['async']);
	});

	test('isolates a failing send contribution', async () => {
		const contributions = disposables.add(createContributions(disposables, ThrowingSendContribution, FollowingSendContribution));

		assert.deepStrictEqual(await contributions.contributeSend(outgoingTurn('send-failure')), ['following']);
	});

	test('omits empty send contribution results', async () => {
		const contributions = disposables.add(createContributions(disposables, EmptySendContribution));

		assert.deepStrictEqual(await contributions.contributeSend(outgoingTurn('send-empty-array')), []);
		assert.deepStrictEqual(await contributions.contributeSend(outgoingTurn('send-empty-object')), []);
	});

	test('threads hydrated turns through contributions in order', async () => {
		const contributions = disposables.add(createContributions(disposables, SecondHydrationContribution, FirstHydrationContribution));

		const turns = await contributions.hydrateTurns(hydrationContext(), [hydrationTurn('initial')]);

		assert.deepStrictEqual(calls, ['first:initial', 'second:initial,first']);
		assert.deepStrictEqual(turns.map(turn => turn.id), ['initial', 'first', 'second']);
	});

	test('awaits asynchronous hydration contributions', async () => {
		const contributions = disposables.add(createContributions(disposables, AsyncHydrationContribution));

		const turns = await contributions.hydrateTurns(hydrationContext(), []);

		assert.deepStrictEqual(calls, ['async']);
		assert.deepStrictEqual(turns.map(turn => turn.id), ['async']);
	});

	test('preserves the previous turns when a hydration contribution fails', async () => {
		const contributions = disposables.add(createContributions(disposables, FollowingHydrationContribution, ThrowingHydrationContribution, PreviousHydrationContribution));

		const turns = await contributions.hydrateTurns(hydrationContext(), []);

		assert.deepStrictEqual(calls, ['following:previous']);
		assert.deepStrictEqual(turns.map(turn => turn.id), ['previous']);
	});
});
