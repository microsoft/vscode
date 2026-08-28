/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import type { BrandedService, IConstructorSignature } from '../../../instantiation/common/instantiation.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { ITelemetryService, TelemetryLevel } from '../../../telemetry/common/telemetry.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE } from '../../common/agentHostCheckpointService.js';
import { IAgentHostChangesetService } from '../../common/agentHostChangesetService.js';
import { AgentHostClientType } from '../../common/agentHostClientInfo.js';
import { IAgentHostGitStateService } from '../../common/agentHostGitStateService.js';
import { AgentHostLaunchKind, createUnknownAgentHostClientTelemetryContext } from '../../common/agentHostTelemetry.js';
import { createChatMementoKey, createSessionMementoKey, IAgentHostChatContributions, type IAgentHostChatContribution, type IAgentHostChatContributionContext, type IAgentHostChatContributionHost, type IHydrationContext, type IIncomingRequest, type IAppliedClientAction, type IDispatchedAction, type IOutgoingTurn, type IRestoredChat, type ITurnEnd, type IncomingRequestDisposition } from '../../common/agentHostChatContributionsService.js';
import { AgentHostArtifactToolsConfigKey, AgentHostMarkdownPlanRichLinksEnabledConfigKey, type ISchema, type SchemaDefinition, type SchemaValue } from '../../common/agentHostSchema.js';
import { withChatSurfaceMeta } from '../../common/meta/agentChatSurfaceMeta.js';
import { readAgentMessageDelegationMeta, toAgentMessageDelegationMeta } from '../../common/meta/agentMessageDelegationMeta.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { ChatOriginKind } from '../../common/state/protocol/state.js';
import { AH_META_IS_ARCHIVED_DB_KEY, AH_META_IS_READ_DB_KEY, buildChatUri, buildDefaultChatUri, buildSubagentChatUri, ChatInteractivity, MessageKind, PendingMessageKind, ResponsePartKind, SessionStatus, TurnState, type ISessionGitHubState, type Message, type PendingMessage, type Turn } from '../../common/state/sessionState.js';
import { IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostClientConnectionService, IAgentHostClientConnectionService } from '../../node/agentHostClientConnectionService.js';
import { AgentHostChatContributions } from '../../node/agentHostChatContributionsService.js';
import { IAgentHostProviderService } from '../../node/agentHostProviderService.js';
import { createTestAgentHostProviderService } from './testAgentHostProviderService.js';
import { IAgentHostSessionTitleController } from '../../node/agentHostSessionTitleController.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../node/agentHostStateManager.js';
import { IAgentHostTerminalManager } from '../../node/agentHostTerminalManager.js';
import { AgentHostLocalTurns, IAgentHostLocalTurns } from '../../node/agentHostLocalTurns.js';
import { AgentHostTelemetryReporter, IAgentHostTelemetryReporter } from '../../node/agentHostTelemetryReporter.js';
import { AgentHostToolCallTracker, IAgentHostToolCallTracker } from '../../node/agentHostToolCallTracker.js';
import { AgentHostTurnTracker, IAgentHostTurnTracker } from '../../node/agentHostTurnTracker.js';
import { AgentHostLocalCommands, IAgentHostLocalCommands } from '../../node/localCommands/localChatCommand.js';
import { registerBuiltInChatContributions } from '../../node/chatContributions/builtInChatContributions.js';
import { LocalCommandContribution } from '../../node/chatContributions/localCommand/localCommandContribution.js';
import { QueueDrainContribution } from '../../node/chatContributions/queueDrain/queueDrainContribution.js';
import { SessionTitleContribution } from '../../node/chatContributions/sessionTitle/sessionTitleContribution.js';
import { SideChatContribution } from '../../node/chatContributions/sideChat/sideChatContribution.js';
import { TurnDelegationContribution } from '../../node/chatContributions/turnDelegation/turnDelegationContribution.js';
import { injectSideChatContext } from '../../node/chatContributions/sideChat/sideChatContext.js';
import { ARTIFACT_TOOLS_INSTRUCTION } from '../../node/shared/artifactServerTools.js';
import { AGENT_HOST_TITLE_SOURCE_USER, customChatTitleMetadataKey, customChatTitleSourceMetadataKey, SESSION_CUSTOM_TITLE_KEY, SESSION_CUSTOM_TITLE_SOURCE_KEY } from '../../node/shared/persistSessionMetadata.js';
import { IAgentHostWorktreeIsolation, NullAgentHostWorktreeIsolation } from '../../node/shared/worktreeIsolation.js';
import { createSessionDataService, TestSessionDatabase } from '../common/sessionTestHelpers.js';
import { MockAgent } from './mockAgent.js';
import { TestAgentHostTerminalManager } from './testAgentHostTerminalManager.js';
import '../../node/localCommands/localChatCommands.contribution.js';

let calls: string[] = [];
let envelopeRejectionReasons: (string | undefined)[] = [];

abstract class TestContribution extends Disposable implements IAgentHostChatContribution {
	constructor(protected readonly _context: IAgentHostChatContributionContext, ..._services: BrandedService[]) {
		super();
	}
}

class RecordingTitleController implements IAgentHostSessionTitleController {
	declare readonly _serviceBrand: undefined;

	constructor(
		private readonly _observed: string[] | undefined,
		private readonly _sessionTitleInstruction: string | undefined,
	) { }

	readonly seededTitles: string[] = [];
	readonly provisionalTitles: string[] = [];
	readonly renamedTitles: { channel: string; chatChannel: string | undefined }[] = [];

	seedTitleFromFirstMessage(_channel: string, userPrompt: string): void {
		this.seededTitles.push(userPrompt);
	}

	seedProvisionalTitle(_channel: string, suggestedTitle: string): void {
		this.provisionalTitles.push(suggestedTitle);
	}
	refineTitleFromFirstTurn(): void {
		this._observed?.push('sessionTitle');
	}
	generateForkedTitle(): void { }
	async generateExternalSessionTitle(): Promise<void> { }
	cancelTitleGeneration(): void { }
	clearSession(): void { }
	markTitleAuto(): void { }
	markTitleRenamed(channel: string, chatChannel?: string): void {
		this.renamedTitles.push({ channel, chatChannel });
	}
	async prepareInstructionForAgent(): Promise<string | undefined> {
		return this._sessionTitleInstruction;
	}
}

class RecordingGitStateService implements IAgentHostGitStateService {
	declare readonly _serviceBrand: undefined;
	readonly onDidRefreshSessionGitState = Event.None;
	readonly onDidChangeSessionGitHubState = Event.None;

	constructor(private readonly _observed: string[] | undefined) { }

	async refreshSessionGitState(_sessionKey: string, _workingDirectory?: URI): Promise<void> { }
	async resolveSessionBaseBranchName(_sessionKey: string): Promise<string | undefined> { return undefined; }
	async setSessionGitHubState(_sessionKey: string, _state: ISessionGitHubState): Promise<void> { }
	async recordSessionMerge(_sessionKey: string, _commit: string): Promise<void> { }
	async attachSessionGitHubPullRequest(_sessionKey: string, _workingDirectory?: URI): Promise<void> {
		this._observed?.push('githubReferences');
	}
}

class RecordingWorktreeIsolation extends NullAgentHostWorktreeIsolation {

	constructor(private readonly _observed: string[] | undefined) {
		super();
	}

	override async applyRestoreAnnouncement(_sessionUri: URI, turns: readonly Turn[]): Promise<readonly Turn[]> {
		this._observed?.push('worktreeAnnouncement');
		return turns;
	}
}

/** Reads a string field from a recorded telemetry payload without asserting its shape. */
function readEventDataString(data: unknown, key: string): string | undefined {
	if (typeof data !== 'object' || data === null) {
		return undefined;
	}
	const record: Record<string, unknown> = { ...data };
	return typeof record[key] === 'string' ? record[key] : undefined;
}

class RecordingTelemetryService implements ITelemetryService {
	declare readonly _serviceBrand: undefined;
	readonly telemetryLevel = TelemetryLevel.USAGE;
	readonly sessionId = 'test-session';
	readonly machineId = 'test-machine';
	readonly sqmId = 'test-sqm';
	readonly devDeviceId = 'test-device';
	readonly firstSessionDate = '2025-01-01';
	readonly sendErrorTelemetry = false;
	readonly events: { readonly eventName: string; readonly data: unknown }[] = [];

	publicLog(): void { }
	publicLog2(eventName: string, data?: unknown): void {
		this.events.push({ eventName, data });
	}
	publicLogError(): void { }
	publicLogError2(): void { }
	setExperimentProperty(): void { }
	setCommonProperty(): void { }
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

class ThrowingActionContribution extends TestContribution {
	static readonly id = 'throwingAction';
	readonly order = 20;

	onDidApplyClientAction(): void {
		throw new Error('expected');
	}
}

class FollowingActionContribution extends TestContribution {
	static readonly id = 'followingAction';
	readonly order = 21;

	onDidApplyClientAction(): void {
		calls.push('followingAction');
	}
}

class OrderedFirstEnvelopeContribution extends TestContribution {
	static readonly id = 'orderedFirstEnvelope';
	readonly order = 10;

	onDidDispatchAction(): void {
		calls.push('first');
	}
}

class OrderedSecondEnvelopeContribution extends TestContribution {
	static readonly id = 'orderedSecondEnvelope';
	readonly order = 0;

	onDidDispatchAction(): void {
		calls.push('second');
	}
}

class OrderedThirdEnvelopeContribution extends TestContribution {
	static readonly id = 'orderedThirdEnvelope';
	readonly order = 10;

	onDidDispatchAction(): void {
		calls.push('third');
	}
}

class ThrowingEnvelopeContribution extends TestContribution {
	static readonly id = 'throwingEnvelope';
	readonly order = 20;

	onDidDispatchAction(): void {
		throw new Error('expected');
	}
}

class FollowingEnvelopeContribution extends TestContribution {
	static readonly id = 'followingEnvelope';
	readonly order = 21;

	onDidDispatchAction(): void {
		calls.push('followingEnvelope');
	}
}

class RejectionReasonEnvelopeContribution extends TestContribution {
	static readonly id = 'rejectionReasonEnvelope';

	onDidDispatchAction(envelope: IDispatchedAction): void {
		envelopeRejectionReasons.push(envelope.rejectionReason);
	}
}

class OrderedFirstOutgoingTurnContribution extends TestContribution {
	static readonly id = 'orderedFirstOutgoingTurn';
	readonly order = 10;

	onOutgoingTurn(): undefined {
		calls.push('first');
		return undefined;
	}
}

class OrderedSecondOutgoingTurnContribution extends TestContribution {
	static readonly id = 'orderedSecondOutgoingTurn';
	readonly order = 0;

	onOutgoingTurn(): undefined {
		calls.push('second');
		return undefined;
	}
}

class OrderedThirdOutgoingTurnContribution extends TestContribution {
	static readonly id = 'orderedThirdOutgoingTurn';
	readonly order = 10;

	onOutgoingTurn(): undefined {
		calls.push('third');
		return undefined;
	}
}

class ThrowingOutgoingTurnObserverContribution extends TestContribution {
	static readonly id = 'throwingOutgoingTurnObserver';
	readonly order = 20;

	onOutgoingTurn(): undefined {
		throw new Error('expected');
	}
}

class FollowingOutgoingTurnObserverContribution extends TestContribution {
	static readonly id = 'followingOutgoingTurnObserver';
	readonly order = 21;

	onOutgoingTurn(): undefined {
		calls.push('followingOutgoingTurn');
		return undefined;
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

class OutgoingTurnOrderFirstContribution extends TestContribution {
	static readonly id = 'outgoingTurnOrderFirst';
	readonly order = 11;

	onOutgoingTurn(turn: IOutgoingTurn) {
		return turn.turnId === 'send-order' ? { instructions: ['first'] } : undefined;
	}
}

class OutgoingTurnOrderSecondContribution extends TestContribution {
	static readonly id = 'outgoingTurnOrderSecond';
	readonly order = 10;

	onOutgoingTurn(turn: IOutgoingTurn) {
		return turn.turnId === 'send-order' ? { instructions: ['second'] } : undefined;
	}
}

class AsyncOutgoingTurnContribution extends TestContribution {
	static readonly id = 'asyncOutgoingTurn';
	readonly order = 20;

	async onOutgoingTurn(turn: IOutgoingTurn) {
		if (turn.turnId !== 'send-async') {
			return undefined;
		}
		await Promise.resolve();
		calls.push('async');
		return { instructions: ['async'] };
	}
}

class ThrowingOutgoingTurnContribution extends TestContribution {
	static readonly id = 'throwingOutgoingTurn';
	readonly order = 30;

	onOutgoingTurn(turn: IOutgoingTurn) {
		if (turn.turnId === 'send-failure') {
			throw new Error('expected');
		}
		return undefined;
	}
}

class FollowingOutgoingTurnContribution extends TestContribution {
	static readonly id = 'followingOutgoingTurn';
	readonly order = 31;

	onOutgoingTurn(turn: IOutgoingTurn) {
		return turn.turnId === 'send-failure' ? { instructions: ['following'] } : undefined;
	}
}

class EmptyOutgoingTurnContribution extends TestContribution {
	static readonly id = 'emptyOutgoingTurn';
	readonly order = 40;

	onOutgoingTurn(turn: IOutgoingTurn) {
		if (turn.turnId === 'send-empty-array') {
			return { instructions: [] };
		}
		if (turn.turnId === 'send-empty-object') {
			return {};
		}
		return undefined;
	}
}

class UndefinedIncomingRequestContribution extends TestContribution {
	static readonly id = 'undefinedIncomingRequest';

	onIncomingRequest(): undefined {
		return undefined;
	}
}

class AcceptingIncomingRequestContribution extends TestContribution {
	static readonly id = 'acceptingIncomingRequest';

	onIncomingRequest(): IncomingRequestDisposition {
		return { kind: 'accept' };
	}
}

class HandlingIncomingRequestContribution extends TestContribution {
	static readonly id = 'handlingIncomingRequest';
	readonly order = 10;

	onIncomingRequest(): IncomingRequestDisposition {
		calls.push('handled');
		return { kind: 'handled' };
	}
}

class SourceRecordingIncomingRequestContribution extends TestContribution {
	static readonly id = 'sourceRecordingIncomingRequest';

	onIncomingRequest(request: IIncomingRequest): IncomingRequestDisposition {
		calls.push(request.source);
		return { kind: 'accept' };
	}
}

class FirstRejectingIncomingRequestContribution extends TestContribution {
	static readonly id = 'firstRejectingIncomingRequest';
	readonly order = 10;

	onIncomingRequest(): IncomingRequestDisposition {
		calls.push('first');
		return { kind: 'reject', error: { errorType: 'first', message: 'first rejection' }, stage: 'validation' };
	}
}

class SecondRejectingIncomingRequestContribution extends TestContribution {
	static readonly id = 'secondRejectingIncomingRequest';
	readonly order = 20;

	onIncomingRequest(): IncomingRequestDisposition {
		calls.push('second');
		return { kind: 'reject', error: { errorType: 'second', message: 'second rejection' }, stage: 'validation' };
	}
}

class ThrowingIncomingRequestContribution extends TestContribution {
	static readonly id = 'throwingIncomingRequest';
	readonly order = 10;

	onIncomingRequest(): IncomingRequestDisposition {
		throw new Error('expected');
	}
}

class FollowingIncomingRequestContribution extends TestContribution {
	static readonly id = 'followingIncomingRequest';
	readonly order = 20;

	onIncomingRequest(): IncomingRequestDisposition {
		calls.push('following');
		return { kind: 'accept' };
	}
}

class FirstMessageReplacementContribution extends TestContribution {
	static readonly id = 'firstMessageReplacement';
	readonly order = 10;

	onOutgoingTurn(turn: IOutgoingTurn) {
		return turn.turnId === 'message-threading'
			? { text: 'first replacement' }
			: undefined;
	}
}

class SecondMessageReplacementContribution extends TestContribution {
	static readonly id = 'secondMessageReplacement';
	readonly order = 20;

	onOutgoingTurn(turn: IOutgoingTurn) {
		return turn.turnId === 'message-threading'
			? { text: `${turn.message.text} then second` }
			: undefined;
	}
}

class MessageObserverContribution extends TestContribution {
	static readonly id = 'messageObserver';
	readonly order = 30;

	onOutgoingTurn(turn: IOutgoingTurn) {
		if (turn.turnId === 'message-threading') {
			calls.push(turn.message.text);
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

class FirstChatHydrationContribution extends TestContribution {
	static readonly id = 'firstChatHydration';
	readonly order = 10;

	onHydrateChat(_context: IHydrationContext, restored: IRestoredChat): IRestoredChat {
		return { ...restored, title: 'first' };
	}
}

class SecondChatHydrationContribution extends TestContribution {
	static readonly id = 'secondChatHydration';
	readonly order = 20;

	onHydrateChat(_context: IHydrationContext, restored: IRestoredChat): IRestoredChat {
		return { ...restored, draft: { text: `${restored.title} draft`, origin: { kind: MessageKind.User } } };
	}
}

class AsyncChatHydrationContribution extends TestContribution {
	static readonly id = 'asyncChatHydration';
	readonly order = 10;

	async onHydrateChat(_context: IHydrationContext, restored: IRestoredChat): Promise<IRestoredChat> {
		await Promise.resolve();
		return { ...restored, title: 'async' };
	}
}

class PreviousChatHydrationContribution extends TestContribution {
	static readonly id = 'previousChatHydration';
	readonly order = 10;

	onHydrateChat(_context: IHydrationContext, restored: IRestoredChat): IRestoredChat {
		return { ...restored, title: 'previous', draft: { text: 'previous draft', origin: { kind: MessageKind.User } } };
	}
}

class ThrowingChatHydrationContribution extends TestContribution {
	static readonly id = 'throwingChatHydration';
	readonly order = 20;

	onHydrateChat(): IRestoredChat {
		throw new Error('expected');
	}
}

class FollowingChatHydrationContribution extends TestContribution {
	static readonly id = 'followingChatHydration';
	readonly order = 30;

	onHydrateChat(_context: IHydrationContext, restored: IRestoredChat): IRestoredChat {
		calls.push(`following:${restored.title}`);
		return restored;
	}
}

class BeforeSideChatHydrationContribution extends TestContribution {
	static readonly id = 'beforeSideChatHydration';
	readonly order = 450;

	onHydrateTurns(_context: IHydrationContext, turns: readonly Turn[]): readonly Turn[] {
		calls.push(turns.some(turn => turn.message.text.startsWith('<side-chat-context>')) ? 'beforeSideChat:seed' : 'beforeSideChat:plain');
		return turns;
	}
}

class AfterSideChatHydrationContribution extends TestContribution {
	static readonly id = 'afterSideChatHydration';
	readonly order = 600;

	onHydrateTurns(_context: IHydrationContext, turns: readonly Turn[]): readonly Turn[] {
		calls.push(turns.some(turn => turn.message.text.startsWith('<side-chat-context>')) ? 'afterSideChat:seed' : 'afterSideChat:plain');
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

function createSideChatContributions(disposables: ReturnType<typeof ensureNoDisposablesAreLeakedInTestSuite>, inheritedTurnId?: string, selectionText?: string) {
	const logService = new NullLogService();
	const stateManager = disposables.add(new AgentHostStateManager(logService));
	const session = 'agent-host-session://side-chat';
	const sourceChat = buildDefaultChatUri(session);
	const sideChat = buildChatUri(session, 'side');
	stateManager.createSession({
		resource: session,
		provider: 'test',
		title: 'Side Chat',
		status: SessionStatus.IsRead,
		createdAt: '2025-01-01T00:00:00.000Z',
		modifiedAt: '2025-01-01T00:00:00.000Z',
	});
	stateManager.addChat(session, sideChat, {
		title: 'Side Chat',
		origin: {
			kind: ChatOriginKind.SideChat,
			chat: sourceChat,
			turnId: 'source-turn',
			...(selectionText !== undefined ? { selection: { text: selectionText } } : {}),
		},
		...(inheritedTurnId !== undefined ? { inheritedTurnId } : {}),
	});
	const localTurns = new AgentHostLocalTurns(createSessionDataService(new TestSessionDatabase()), logService);
	const instantiationService = disposables.add(new InstantiationService(new ServiceCollection(
		[ILogService, logService],
		[IAgentHostStateManager, stateManager],
		[IAgentHostLocalTurns, localTurns],
	), /*strict*/ true));
	const service: IAgentHostChatContributions = disposables.add(new AgentHostChatContributions(logService, instantiationService));
	disposables.add(service.registerContribution(SideChatContribution));
	return { service, stateManager, session, sourceChat, sideChat, localTurns };
}

function createSessionTitleContributions(disposables: ReturnType<typeof ensureNoDisposablesAreLeakedInTestSuite>) {
	const logService = new NullLogService();
	const stateManager = disposables.add(new AgentHostStateManager(logService));
	const session = 'agent-host-session://session-title';
	const defaultChat = buildDefaultChatUri(session);
	const peerChat = buildChatUri(session, 'peer');
	stateManager.createSession({
		resource: session,
		provider: 'test',
		title: 'Initial',
		status: SessionStatus.IsRead,
		createdAt: '2025-01-01T00:00:00.000Z',
		modifiedAt: '2025-01-01T00:00:00.000Z',
	});
	stateManager.addChat(session, peerChat, { title: 'Peer' });

	const database = new TestSessionDatabase();
	const sessionDataService = createSessionDataService(database);
	const titleController = new RecordingTitleController(undefined, undefined);
	const services = new ServiceCollection(
		[ILogService, logService],
		[IAgentHostStateManager, stateManager],
		[ISessionDataService, sessionDataService],
		[IAgentHostSessionTitleController, titleController],
	);
	const instantiationService = disposables.add(new InstantiationService(services, /*strict*/ true));
	const service: IAgentHostChatContributions = disposables.add(new AgentHostChatContributions(logService, instantiationService));
	disposables.add(service.registerContribution(SessionTitleContribution));
	return { service, stateManager, database, titleController, session, defaultChat, peerChat };
}

function createTurnDelegationContributions(disposables: ReturnType<typeof ensureNoDisposablesAreLeakedInTestSuite>) {
	const logService = new NullLogService();
	const database = new TestSessionDatabase();
	const sessionDataService = createSessionDataService(database);
	const services = new ServiceCollection(
		[ILogService, logService],
		[ISessionDataService, sessionDataService],
	);
	const instantiationService = disposables.add(new InstantiationService(services, /*strict*/ true));
	const service: IAgentHostChatContributions = disposables.add(new AgentHostChatContributions(logService, instantiationService));
	disposables.add(service.registerContribution(TurnDelegationContribution));
	const session = 'copilot:/target';
	return { service, database, session, chat: buildDefaultChatUri(session) };
}

function createBuiltInContributions(disposables: ReturnType<typeof ensureNoDisposablesAreLeakedInTestSuite>, observed?: string[], enableSendInstructions = false, sessionStatus = SessionStatus.IsRead): { readonly service: AgentHostChatContributions; readonly stateManager: AgentHostStateManager; readonly database: TestSessionDatabase; readonly session: string } {
	const logService = new NullLogService();
	const stateManager = disposables.add(new AgentHostStateManager(logService));
	stateManager.createSession({
		resource: 'agent-host-session://test',
		provider: 'test',
		title: 'Test',
		status: sessionStatus,
		createdAt: '2025-01-01T00:00:00.000Z',
		modifiedAt: '2025-01-01T00:00:00.000Z',
		_meta: withChatSurfaceMeta(undefined, enableSendInstructions ? { surface: 'terminal', osName: 'Linux' } : undefined),
	});
	if (observed) {
		stateManager.dispatchServerAction(buildDefaultChatUri('agent-host-session://test'), queuedMessage('queue-order', 'queue order'));
	}
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
	const sessionDataService = createSessionDataService(usageDatabase);
	const services = new ServiceCollection(
		[ILogService, logService],
		[IAgentHostCheckpointService, checkpointService],
		[IAgentHostChangesetService, changesets],
		[IAgentConfigurationService, agentConfigService],
		[IAgentHostStateManager, stateManager],
		[IAgentHostGitStateService, new RecordingGitStateService(observed)],
		[ISessionDataService, sessionDataService],
		[IAgentHostTerminalManager, disposables.add(new TestAgentHostTerminalManager())],
		[IAgentHostWorktreeIsolation, new RecordingWorktreeIsolation(observed)],
		[IAgentHostClientConnectionService, disposables.add(new AgentHostClientConnectionService())],
	);
	services.set(IAgentHostSessionTitleController, new RecordingTitleController(observed, enableSendInstructions ? 'rename instruction' : undefined));
	const queueAgent = new MockAgent();
	services.set(IAgentHostProviderService, createTestAgentHostProviderService(() => queueAgent));
	services.set(IAgentHostLocalTurns, new AgentHostLocalTurns(sessionDataService, logService));
	const instantiationService = disposables.add(new InstantiationService(services, /*strict*/ true));
	const service = disposables.add(new AgentHostChatContributions(logService, instantiationService));
	services.set(IAgentHostChatContributions, service);
	const telemetryReporter = new AgentHostTelemetryReporter(new RecordingTelemetryService());
	services.set(IAgentHostTelemetryReporter, telemetryReporter);
	services.set(IAgentHostTurnTracker, disposables.add(instantiationService.createInstance(AgentHostTurnTracker)));
	services.set(IAgentHostToolCallTracker, disposables.add(instantiationService.createInstance(AgentHostToolCallTracker)));
	const localCommands = disposables.add(instantiationService.createInstance(AgentHostLocalCommands));
	services.set(IAgentHostLocalCommands, localCommands);
	const host: IAgentHostChatContributionHost = {
		hostLaunchKind: AgentHostLaunchKind.Unknown,
		sendTurnMessage: () => observed?.push('queueDrain'),
	};
	disposables.add(service.registerHost(host));
	disposables.add(registerBuiltInChatContributions(service));
	return { service, stateManager, database: usageDatabase, session: 'agent-host-session://test' };
}

function createQueueDrainContributions(disposables: ReturnType<typeof ensureNoDisposablesAreLeakedInTestSuite>) {
	const logService = new NullLogService();
	const stateManager = disposables.add(new AgentHostStateManager(logService));
	const session = 'agent-host-session://queue';
	const chat = buildDefaultChatUri(session);
	stateManager.createSession({
		resource: session,
		provider: 'test',
		title: 'Queue',
		status: SessionStatus.IsRead,
		createdAt: '2025-01-01T00:00:00.000Z',
		modifiedAt: '2025-01-01T00:00:00.000Z',
	});
	const sessionDataService = createSessionDataService(new TestSessionDatabase());
	const services = new ServiceCollection(
		[ILogService, logService],
		[IAgentHostStateManager, stateManager],
		[ISessionDataService, sessionDataService],
		[IAgentHostTerminalManager, disposables.add(new TestAgentHostTerminalManager())],
		[IAgentHostClientConnectionService, disposables.add(new AgentHostClientConnectionService())],
	);
	const mockAgent = new MockAgent();
	let agent: MockAgent | undefined = mockAgent;
	const pendingMessages: (PendingMessage | undefined)[] = [];
	mockAgent.setPendingMessages = (_chat, steeringMessage) => pendingMessages.push(steeringMessage);
	services.set(IAgentHostProviderService, createTestAgentHostProviderService(() => agent));
	services.set(IAgentHostLocalTurns, new AgentHostLocalTurns(sessionDataService, logService));
	const instantiationService = disposables.add(new InstantiationService(services, /*strict*/ true));
	const service = disposables.add(new AgentHostChatContributions(logService, instantiationService));
	services.set(IAgentHostChatContributions, service);
	const titleController = new RecordingTitleController(undefined, undefined);
	services.set(IAgentHostSessionTitleController, titleController);
	const telemetryService = new RecordingTelemetryService();
	const telemetryReporter = new AgentHostTelemetryReporter(telemetryService);
	services.set(IAgentHostTelemetryReporter, telemetryReporter);
	const turnTracker = disposables.add(instantiationService.createInstance(AgentHostTurnTracker));
	services.set(IAgentHostTurnTracker, turnTracker);
	services.set(IAgentHostToolCallTracker, disposables.add(instantiationService.createInstance(AgentHostToolCallTracker)));
	const localCommands = disposables.add(instantiationService.createInstance(AgentHostLocalCommands));
	services.set(IAgentHostLocalCommands, localCommands);
	const admitted: { channel: string; message: Message; clientId: string | undefined; hostLaunchKind: AgentHostLaunchKind }[] = [];
	disposables.add(service.registerHost({
		hostLaunchKind: AgentHostLaunchKind.VSCodeMainProcess,
		sendTurnMessage: options => admitted.push({ channel: options.turnChannel, message: options.message, clientId: options.senderClientId, hostLaunchKind: options.clientContext.hostLaunchKind }),
	}));
	disposables.add(service.registerContribution(LocalCommandContribution as unknown as IConstructorSignature<IAgentHostChatContribution, [IAgentHostChatContributionContext]> & { readonly id: string }));
	disposables.add(service.registerContribution(QueueDrainContribution as unknown as IConstructorSignature<IAgentHostChatContribution, [IAgentHostChatContributionContext]> & { readonly id: string }));
	return { service, stateManager, session, chat, pendingMessages, admitted, titleController, telemetryService, clearAgent: () => agent = undefined };
}

function appliedClientAction(channel: string, session: string, action: IAppliedClientAction['action'], clientId = 'client'): IAppliedClientAction {
	return {
		channel,
		session,
		action,
		clientId,
		clientContext: createUnknownAgentHostClientTelemetryContext(AgentHostClientType.EditorWindow),
	};
}

function dispatchedAction(channel: string, session: string, action: IDispatchedAction['action'], rejectionReason?: string): IDispatchedAction {
	return {
		channel,
		session,
		action,
		rejectionReason,
	};
}

function queuedMessage(id: string, text: string): { type: ActionType.ChatPendingMessageSet; kind: PendingMessageKind.Queued; id: string; message: Message } {
	return { type: ActionType.ChatPendingMessageSet, kind: PendingMessageKind.Queued, id, message: { text, origin: { kind: MessageKind.User } } };
}

function turnEnd(turnId: string, reason: ITurnEnd['reason'] = { kind: 'success' }): ITurnEnd {
	return { session: 'agent-host-session://test', channel: buildDefaultChatUri('agent-host-session://test'), turnId, reason };
}

function outgoingTurn(turnId: string, text = turnId): IOutgoingTurn {
	return {
		session: 'agent-host-session://test',
		chat: 'agent-host-session://test',
		message: { text, origin: { kind: MessageKind.User } },
		turnId,
	};
}

function incomingRequest(session = 'agent-host-session://test', chat = buildDefaultChatUri(session), source: IIncomingRequest['source'] = 'direct'): IIncomingRequest {
	return {
		session,
		chat,
		turnChannel: chat,
		message: { text: 'incoming request', origin: { kind: MessageKind.User } },
		turnId: 'incoming-request',
		source,
		clientId: 'client',
		clientContext: createUnknownAgentHostClientTelemetryContext(AgentHostClientType.EditorWindow),
	};
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
		envelopeRejectionReasons = [];
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

	test('deleteMemento drops a keyed entry so it is recreated from its factory', () => {
		const keyed = createChatMementoKey<number, [messageId: string]>('deletable', () => 0);
		disposables.add(createContributions(disposables, FirstMementoContribution));
		const context = FirstMementoContribution.context!;
		const kept = context.memento(keyed, 'agent-host-chat://first', 'keep');
		const dropped = context.memento(keyed, 'agent-host-chat://first', 'drop');
		kept.set(1, undefined);
		dropped.set(2, undefined);

		context.deleteMemento(keyed, 'agent-host-chat://first', 'drop');

		assert.deepStrictEqual([
			context.memento(keyed, 'agent-host-chat://first', 'keep').get(),
			context.memento(keyed, 'agent-host-chat://first', 'drop').get(),
		], [1, 0]);
	});

	test('rejects a second registration of the same contribution id', () => {
		const contributions = disposables.add(createContributions(disposables, FirstMementoContribution));

		assert.throws(() => contributions.registerContribution(FirstMementoContribution), /already registered/);
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

	test('queue drain skips active, steering, and empty chats', () => {
		const active = createQueueDrainContributions(disposables);
		active.stateManager.dispatchServerAction(active.chat, queuedMessage('active', 'active'));
		active.stateManager.dispatchServerAction(active.chat, {
			type: ActionType.ChatTurnStarted,
			turnId: 'active-turn',
			startedAt: '2025-01-01T00:00:00.000Z',
			message: { text: 'running', origin: { kind: MessageKind.User } },
		});
		active.service.turnEnd({ session: active.session, channel: active.chat, turnId: 'active-turn', reason: { kind: 'localCommand' } });

		const steering = createQueueDrainContributions(disposables);
		steering.stateManager.dispatchServerAction(steering.chat, queuedMessage('queued', 'queued'));
		steering.stateManager.dispatchServerAction(steering.chat, {
			type: ActionType.ChatPendingMessageSet,
			kind: PendingMessageKind.Steering,
			id: 'steering',
			message: { text: 'steering', origin: { kind: MessageKind.User } },
		});
		steering.service.turnEnd({ session: steering.session, channel: steering.chat, turnId: 'steering-turn', reason: { kind: 'localCommand' } });

		const empty = createQueueDrainContributions(disposables);
		empty.service.turnEnd({ session: empty.session, channel: empty.chat, turnId: 'empty-turn', reason: { kind: 'localCommand' } });

		assert.deepStrictEqual([active.admitted, steering.admitted, empty.admitted], [[], [], []]);
	});

	test('queue drain captures senders, handles pending actions, and honors reordering', () => {
		const queue = createQueueDrainContributions(disposables);
		queue.stateManager.dispatchServerAction(queue.chat, {
			type: ActionType.ChatTurnStarted,
			turnId: 'active-turn',
			startedAt: '2025-01-01T00:00:00.000Z',
			message: { text: 'running', origin: { kind: MessageKind.User } },
		});
		const first = queuedMessage('first', 'first');
		const second = queuedMessage('second', 'second');
		const reordered: IAppliedClientAction['action'] = { type: ActionType.ChatQueuedMessagesReordered, order: ['second', 'first'] };
		const removed: IAppliedClientAction['action'] = { type: ActionType.ChatPendingMessageRemoved, kind: PendingMessageKind.Queued, id: 'first' };
		queue.stateManager.dispatchServerAction(queue.chat, first);
		queue.service.didApplyClientAction(appliedClientAction(queue.chat, queue.session, first, 'first-client'));
		queue.stateManager.dispatchServerAction(queue.chat, second);
		queue.service.didApplyClientAction(appliedClientAction(queue.chat, queue.session, second, 'second-client'));
		queue.stateManager.dispatchServerAction(queue.chat, reordered);
		queue.service.didApplyClientAction(appliedClientAction(queue.chat, queue.session, reordered, 'reorder-client'));
		queue.stateManager.dispatchServerAction(queue.chat, removed);
		queue.service.didApplyClientAction(appliedClientAction(queue.chat, queue.session, removed, 'remove-client'));
		queue.stateManager.dispatchServerAction(queue.chat, { type: ActionType.ChatTurnComplete, turnId: 'active-turn', duration: 1 });
		queue.service.turnEnd({ session: queue.session, channel: queue.chat, turnId: 'active-turn', reason: { kind: 'localCommand' } });

		assert.deepStrictEqual({
			pendingMessages: queue.pendingMessages.map(message => message?.message.text),
			admitted: queue.admitted.map(admission => [admission.message.text, admission.clientId]),
		}, {
			pendingMessages: [undefined, undefined, undefined, undefined],
			admitted: [['second', 'second-client']],
		});
	});

	test('queue drain defers stale queued actions until a resumable turn completes', () => {
		const queue = createQueueDrainContributions(disposables);
		queue.stateManager.dispatchServerAction(queue.chat, {
			type: ActionType.ChatTurnStarted,
			turnId: 'resumable-turn',
			startedAt: '2025-01-01T00:00:00.000Z',
			message: { text: 'running', origin: { kind: MessageKind.User } },
		});
		queue.stateManager.dispatchServerAction(queue.chat, {
			type: ActionType.ChatError,
			turnId: 'resumable-turn',
			duration: 1,
			part: { kind: ResponsePartKind.Error, error: { errorType: 'requestFailed', message: 'failed' }, resumable: true },
		});
		const queued = queuedMessage('queued', 'queued');
		queue.stateManager.dispatchServerAction(queue.chat, queued);
		queue.service.didApplyClientAction(appliedClientAction(queue.chat, queue.session, queued));
		const admittedWhileFailed = queue.admitted.map(admission => admission.message.text);

		queue.stateManager.dispatchServerAction(queue.chat, { type: ActionType.ChatTurnResume, turnId: 'resumable-turn' });
		queue.stateManager.dispatchServerAction(queue.chat, { type: ActionType.ChatTurnComplete, turnId: 'resumable-turn', duration: 2 });
		queue.service.turnEnd({ session: queue.session, channel: queue.chat, turnId: 'resumable-turn', reason: { kind: 'success' } });

		assert.deepStrictEqual({
			admittedWhileFailed,
			admittedAfterCompletion: queue.admitted.map(admission => admission.message.text),
		}, {
			admittedWhileFailed: [],
			admittedAfterCompletion: ['queued'],
		});
	});

	test('queue drain falls back after chat-memento eviction', () => {
		const queue = createQueueDrainContributions(disposables);
		queue.stateManager.dispatchServerAction(queue.chat, {
			type: ActionType.ChatTurnStarted,
			turnId: 'active-turn',
			startedAt: '2025-01-01T00:00:00.000Z',
			message: { text: 'running', origin: { kind: MessageKind.User } },
		});
		const action = queuedMessage('queued', 'queued');
		queue.stateManager.dispatchServerAction(queue.chat, action);
		queue.service.didApplyClientAction(appliedClientAction(queue.chat, queue.session, action, 'original-client'));
		queue.service.disposeChatState(queue.chat);
		queue.stateManager.dispatchServerAction(queue.chat, { type: ActionType.ChatTurnComplete, turnId: 'active-turn', duration: 1 });
		queue.service.turnEnd({ session: queue.session, channel: queue.chat, turnId: 'active-turn', reason: { kind: 'localCommand' } });

		assert.deepStrictEqual(queue.admitted, [{
			channel: queue.chat,
			message: { text: 'queued', origin: { kind: MessageKind.User } },
			clientId: undefined,
			hostLaunchKind: AgentHostLaunchKind.VSCodeMainProcess,
		}]);
	});

	test('queue drain dispatches no-agent errors itself', () => {
		const queue = createQueueDrainContributions(disposables);
		const actions: ActionType[] = [];
		const errorTypes: string[] = [];
		disposables.add(queue.stateManager.onDidEmitEnvelope(envelope => {
			if (envelope.action.type === ActionType.ChatPendingMessageSet || envelope.action.type === ActionType.ChatTurnStarted || envelope.action.type === ActionType.ChatError) {
				actions.push(envelope.action.type);
			}
			if (envelope.action.type === ActionType.ChatError) {
				errorTypes.push(envelope.action.part.error.errorType);
			}
		}));
		queue.clearAgent();
		const action = queuedMessage('queued', 'queued');
		queue.stateManager.dispatchServerAction(queue.chat, action);
		queue.service.didApplyClientAction(appliedClientAction(queue.chat, queue.session, action));

		assert.deepStrictEqual({ actions, errorTypes }, {
			actions: [ActionType.ChatPendingMessageSet, ActionType.ChatTurnStarted, ActionType.ChatError],
			errorTypes: ['noAgent'],
		});
	});

	test('queue drain intercepts local commands and seeds their suggested title', async () => {
		const queue = createQueueDrainContributions(disposables);
		const action = queuedMessage('rename', '/rename Suggested title');
		queue.stateManager.dispatchServerAction(queue.chat, action);
		queue.service.didApplyClientAction(appliedClientAction(queue.chat, queue.session, action));
		await Promise.resolve();
		await Promise.resolve();

		assert.deepStrictEqual({
			admitted: queue.admitted,
			provisionalTitles: queue.titleController.provisionalTitles,
		}, {
			admitted: [],
			provisionalTitles: ['Suggested title'],
		});
	});

	test('queue drain reports queued telemetry source', () => {
		const queue = createQueueDrainContributions(disposables);
		const action = queuedMessage('queued', 'queued');
		queue.stateManager.dispatchServerAction(queue.chat, action);
		queue.service.didApplyClientAction(appliedClientAction(queue.chat, queue.session, action));

		assert.ok(queue.telemetryService.events.some(event =>
			event.eventName === 'agentHost.userMessageSent'
			&& readEventDataString(event.data, 'source') === 'queued'
		));
	});

	test('runs contributions in order while preserving registration order for ties', () => {
		const contributions = disposables.add(createContributions(disposables, OrderedFirstContribution, OrderedSecondContribution, OrderedThirdContribution));
		contributions.turnEnd(turnEnd('ordered'));

		assert.deepStrictEqual(calls, ['second', 'first', 'third']);
	});

	test('runs envelope contributions in order while preserving registration order for ties', () => {
		const contributions = disposables.add(createContributions(disposables, OrderedFirstEnvelopeContribution, OrderedSecondEnvelopeContribution, OrderedThirdEnvelopeContribution));
		contributions.didDispatchAction(dispatchedAction('agent-host-chat://test', 'agent-host-session://test', { type: ActionType.ChatQueuedMessagesReordered, order: [] }));

		assert.deepStrictEqual(calls, ['second', 'first', 'third']);
	});

	test('dispatches outgoing turns in contribution order while preserving registration order for ties', async () => {
		const contributions = disposables.add(createContributions(disposables, OrderedFirstOutgoingTurnContribution, OrderedSecondOutgoingTurnContribution, OrderedThirdOutgoingTurnContribution));
		await contributions.outgoingTurn(outgoingTurn('ordered'));

		assert.deepStrictEqual(calls, ['second', 'first', 'third']);
	});

	test('runs built-in turn-end contributions in the original sequence', () => {
		const observed: string[] = [];
		const contributions = createBuiltInContributions(disposables, observed);
		contributions.service.turnEnd(turnEnd('built-in-order'));

		assert.deepStrictEqual(observed, ['checkpointAndChangeset', 'queueDrain', 'githubReferences', 'sessionTitle', 'markUnread']);
	});

	test('resumable errors defer checkpoint capture until the logical turn ends', () => {
		const observed: string[] = [];
		const contributions = createBuiltInContributions(disposables, observed);
		contributions.service.turnEnd(turnEnd('resumable-error', {
			kind: 'error',
			error: { errorType: 'requestFailed', message: 'failed' },
			resumable: true,
		}));

		assert.deepStrictEqual({
			checkpointAndChangeset: observed.includes('checkpointAndChangeset'),
			queueDrain: observed.includes('queueDrain'),
			markUnread: observed.includes('markUnread'),
		}, {
			checkpointAndChangeset: false,
			queueDrain: false,
			markUnread: true,
		});
	});

	test('does not resurface a read session when an admission-rejected turn ends', () => {
		const contributions = createBuiltInContributions(disposables);
		const readChanges: boolean[] = [];
		disposables.add(contributions.stateManager.onDidEmitEnvelope(envelope => {
			if (envelope.action.type === ActionType.SessionIsReadChanged) {
				readChanges.push(envelope.action.isRead);
			}
		}));

		contributions.service.turnEnd(turnEnd('rejected', {
			kind: 'rejected',
			error: { errorType: 'noAgent', message: 'No agent found for session' },
		}));
		const rejectedReadChanges = [...readChanges];
		contributions.service.turnEnd(turnEnd('error', {
			kind: 'error',
			error: { errorType: 'requestFailed', message: 'failed' },
			resumable: false,
		}));

		assert.deepStrictEqual({
			rejectedReadChanges,
			errorReadChanges: readChanges,
		}, {
			rejectedReadChanges: [],
			errorReadChanges: [false],
		});
	});

	test('skips all built-in turn-end contributions for rejected requests', () => {
		const observed: string[] = [];
		const contributions = createBuiltInContributions(disposables, observed);
		contributions.service.turnEnd(turnEnd('rejected', {
			kind: 'rejected',
			error: { errorType: 'noAgent', message: 'No agent found for session' },
		}));

		assert.deepStrictEqual({
			checkpointAndChangeset: observed.includes('checkpointAndChangeset'),
			queueDrain: observed.includes('queueDrain'),
			githubReferences: observed.includes('githubReferences'),
			sessionTitle: observed.includes('sessionTitle'),
			markUnread: observed.includes('markUnread'),
		}, {
			checkpointAndChangeset: false,
			queueDrain: false,
			githubReferences: false,
			sessionTitle: false,
			markUnread: false,
		});
	});

	test('drains the queue but skips other turn-end contributions for local commands', () => {
		const observed: string[] = [];
		const contributions = createBuiltInContributions(disposables, observed);
		contributions.service.turnEnd(turnEnd('local-command', { kind: 'localCommand' }));

		assert.deepStrictEqual({
			queueDrain: observed.includes('queueDrain'),
			checkpointAndChangeset: observed.includes('checkpointAndChangeset'),
			githubReferences: observed.includes('githubReferences'),
			sessionTitle: observed.includes('sessionTitle'),
			markUnread: observed.includes('markUnread'),
		}, {
			queueDrain: true,
			checkpointAndChangeset: false,
			githubReferences: false,
			sessionTitle: false,
			markUnread: false,
		});
	});

	test('runs built-in outgoing-turn contributions in the original sequence', async () => {
		const contributions = createBuiltInContributions(disposables, undefined, true);
		const sideChat = buildChatUri(contributions.session, 'side');
		contributions.stateManager.addChat(contributions.session, sideChat, {
			title: 'Side Chat',
			origin: { kind: ChatOriginKind.SideChat, chat: buildDefaultChatUri(contributions.session), turnId: 'source-turn' },
		});
		const result = await contributions.service.outgoingTurn({
			session: contributions.session,
			chat: sideChat,
			message: { text: 'built-in-send-order', origin: { kind: MessageKind.User } },
			turnId: 'built-in-send-order',
		});

		assert.deepStrictEqual((result.instructions ?? []).map(instruction => {
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
				return 'sessionTitle';
			}
			return undefined;
		}), ['markdownPlanRichLinks', 'artifactTools', 'chatSurface', 'sessionTitle']);
		assert.deepStrictEqual(result.message, { text: injectSideChatContext('built-in-send-order'), origin: { kind: MessageKind.User } });
	});

	test('updates and persists an independent chat title', async () => {
		const titles = createSessionTitleContributions(disposables);
		const action = { type: ActionType.SessionTitleChanged, title: 'Renamed peer' } as const;
		titles.stateManager.dispatchServerAction(titles.peerChat, action);
		titles.service.didApplyClientAction(appliedClientAction(titles.peerChat, titles.session, action));

		assert.deepStrictEqual({
			chatTitle: titles.stateManager.getChatState(titles.peerChat)?.title,
			persistedTitle: await titles.database.getMetadata(customChatTitleMetadataKey(titles.peerChat)),
			persistedSource: await titles.database.getMetadata(customChatTitleSourceMetadataKey(titles.peerChat)),
			renamedTitles: titles.titleController.renamedTitles,
		}, {
			chatTitle: 'Renamed peer',
			persistedTitle: 'Renamed peer',
			persistedSource: AGENT_HOST_TITLE_SOURCE_USER,
			renamedTitles: [{ channel: titles.session, chatChannel: titles.peerChat }],
		});
	});

	test('cascades a default chat title to the session', async () => {
		const titles = createSessionTitleContributions(disposables);
		const action = { type: ActionType.SessionTitleChanged, title: 'Renamed default' } as const;
		const channels: string[] = [];
		disposables.add(titles.stateManager.onDidEmitEnvelope(envelope => {
			if (envelope.action.type === ActionType.SessionTitleChanged) {
				channels.push(envelope.channel);
			}
		}));
		titles.stateManager.dispatchServerAction(titles.defaultChat, action);
		titles.service.didApplyClientAction(appliedClientAction(titles.defaultChat, titles.session, action));

		assert.deepStrictEqual({
			channels,
			sessionTitle: titles.stateManager.getSessionState(titles.session)?.title,
			chatTitle: titles.stateManager.getChatState(titles.defaultChat)?.title,
			persistedSessionTitle: await titles.database.getMetadata(SESSION_CUSTOM_TITLE_KEY),
			persistedSessionSource: await titles.database.getMetadata(SESSION_CUSTOM_TITLE_SOURCE_KEY),
			persistedChatTitle: await titles.database.getMetadata(customChatTitleMetadataKey(titles.defaultChat)),
			persistedChatSource: await titles.database.getMetadata(customChatTitleSourceMetadataKey(titles.defaultChat)),
			renamedTitles: titles.titleController.renamedTitles,
		}, {
			channels: [titles.defaultChat, titles.session],
			sessionTitle: 'Renamed default',
			chatTitle: 'Renamed default',
			persistedSessionTitle: 'Renamed default',
			persistedSessionSource: AGENT_HOST_TITLE_SOURCE_USER,
			persistedChatTitle: 'Renamed default',
			persistedChatSource: AGENT_HOST_TITLE_SOURCE_USER,
			renamedTitles: [
				{ channel: titles.session, chatChannel: titles.defaultChat },
				{ channel: titles.session, chatChannel: undefined },
			],
		});
	});

	test('persists a session channel title', async () => {
		const titles = createSessionTitleContributions(disposables);
		const action = { type: ActionType.SessionTitleChanged, title: 'Renamed session' } as const;
		titles.stateManager.dispatchServerAction(titles.session, action);
		titles.service.didApplyClientAction(appliedClientAction(titles.session, titles.session, action));

		assert.deepStrictEqual({
			sessionTitle: titles.stateManager.getSessionState(titles.session)?.title,
			persistedTitle: await titles.database.getMetadata(SESSION_CUSTOM_TITLE_KEY),
			persistedSource: await titles.database.getMetadata(SESSION_CUSTOM_TITLE_SOURCE_KEY),
			renamedTitles: titles.titleController.renamedTitles,
		}, {
			sessionTitle: 'Renamed session',
			persistedTitle: 'Renamed session',
			persistedSource: AGENT_HOST_TITLE_SOURCE_USER,
			renamedTitles: [{ channel: titles.session, chatChannel: undefined }],
		});
	});

	test('runs built-in hydration contributions in the original sequence', async () => {
		const observed: string[] = [];
		const contributions = createBuiltInContributions(disposables, observed);
		disposables.add(contributions.service.registerContribution(BeforeSideChatHydrationContribution));
		disposables.add(contributions.service.registerContribution(AfterSideChatHydrationContribution));
		const sideChat = buildChatUri(contributions.session, 'side');
		contributions.stateManager.addChat(contributions.session, sideChat, {
			title: 'Side Chat',
			origin: { kind: ChatOriginKind.SideChat, chat: buildDefaultChatUri(contributions.session), turnId: 'source-turn' },
		});

		const turns = await contributions.service.hydrateTurns({ session: contributions.session, chat: sideChat }, [
			hydrationTurn('inherited'),
			{ ...hydrationTurn('built-in-hydration-order'), message: { text: injectSideChatContext('side question'), origin: { kind: MessageKind.User } } },
		]);

		assert.deepStrictEqual(observed, ['persistedTurnUsage']);
		assert.deepStrictEqual(calls, ['beforeSideChat:seed', 'afterSideChat:plain']);
		assert.deepStrictEqual(turns.map(turn => [turn.id, turn.message.text]), [['built-in-hydration-order', 'side question']]);
	});

	test('persists and restores agent-authored turn delegation through a provider turn id', async () => {
		const contributions = createTurnDelegationContributions(disposables);
		const delegation = {
			sourceSession: 'copilot:/source',
			sourceChat: buildDefaultChatUri('copilot:/source'),
			sourceTurnId: 'source-turn',
		};
		await contributions.service.outgoingTurn({
			session: contributions.session,
			chat: contributions.chat,
			turnId: 'host-turn',
			message: {
				text: 'delegated prompt',
				origin: { kind: MessageKind.Agent },
				_meta: toAgentMessageDelegationMeta(delegation),
			},
		});
		const [directlyRestored] = await contributions.service.hydrateTurns(
			{ session: contributions.session, chat: contributions.chat },
			[hydrationTurn('host-turn')],
		);
		await contributions.database.setTurnEventId('host-turn', 'provider-turn');
		const [providerRestored] = await contributions.service.hydrateTurns(
			{ session: contributions.session, chat: contributions.chat },
			[hydrationTurn('provider-turn')],
		);

		assert.deepStrictEqual(
			[directlyRestored, providerRestored].map(turn => ({
				origin: turn.message.origin,
				delegation: readAgentMessageDelegationMeta(turn.message),
			})),
			[
				{ origin: { kind: MessageKind.Agent }, delegation },
				{ origin: { kind: MessageKind.Agent }, delegation },
			],
		);
	});

	test('isolates a throwing contribution', () => {
		const contributions = disposables.add(createContributions(disposables, ThrowingContribution, FollowingContribution));
		contributions.turnEnd(turnEnd('throwing'));

		assert.deepStrictEqual(calls, ['following']);
	});

	test('isolates a throwing action contribution', () => {
		const contributions = disposables.add(createContributions(disposables, ThrowingActionContribution, FollowingActionContribution));
		contributions.didApplyClientAction(appliedClientAction('agent-host-chat://test', 'agent-host-session://test', { type: ActionType.ChatQueuedMessagesReordered, order: [] }));

		assert.deepStrictEqual(calls, ['followingAction']);
	});

	test('isolates a throwing envelope contribution', () => {
		const contributions = disposables.add(createContributions(disposables, ThrowingEnvelopeContribution, FollowingEnvelopeContribution));
		contributions.didDispatchAction(dispatchedAction('agent-host-chat://test', 'agent-host-session://test', { type: ActionType.ChatQueuedMessagesReordered, order: [] }));

		assert.deepStrictEqual(calls, ['followingEnvelope']);
	});

	test('passes envelope rejection reasons to contributions', () => {
		const contributions = disposables.add(createContributions(disposables, RejectionReasonEnvelopeContribution));
		const action = { type: ActionType.ChatQueuedMessagesReordered, order: [] as string[] } as const;
		contributions.didDispatchAction(dispatchedAction('agent-host-chat://test', 'agent-host-session://test', action, 'rejected'));
		contributions.didDispatchAction(dispatchedAction('agent-host-chat://test', 'agent-host-session://test', action));

		assert.deepStrictEqual(envelopeRejectionReasons, ['rejected', undefined]);
	});

	test('skips rejected session flags while persisting config values', async () => {
		const contributions = createBuiltInContributions(disposables);
		const config = { mode: 'plan', autoApprove: 'default' };
		contributions.stateManager.setSessionConfig(contributions.session, {
			schema: { type: 'object', properties: {} },
			values: config,
		});
		contributions.service.didDispatchAction(dispatchedAction(contributions.session, contributions.session, { type: ActionType.SessionIsReadChanged, isRead: false }, 'rejected'));
		contributions.service.didDispatchAction(dispatchedAction(contributions.session, contributions.session, { type: ActionType.SessionIsArchivedChanged, isArchived: true }, 'rejected'));
		contributions.service.didDispatchAction(dispatchedAction(contributions.session, contributions.session, { type: ActionType.SessionConfigChanged, config: { mode: 'interactive' } }, 'rejected'));
		await Promise.resolve();

		assert.deepStrictEqual({
			isRead: await contributions.database.getMetadata(AH_META_IS_READ_DB_KEY),
			isArchived: await contributions.database.getMetadata(AH_META_IS_ARCHIVED_DB_KEY),
			configValues: await contributions.database.getMetadata('configValues'),
		}, {
			isRead: undefined,
			isArchived: undefined,
			configValues: JSON.stringify(config),
		});
	});

	test('persists turn usage from envelopes but skips subagent chats', async () => {
		const contributions = createBuiltInContributions(disposables);
		const usage = { inputTokens: 10, outputTokens: 5 };
		const chat = buildDefaultChatUri(contributions.session);
		const subagentChat = buildSubagentChatUri(contributions.session, 'tool-call');
		contributions.service.didDispatchAction(dispatchedAction(chat, contributions.session, { type: ActionType.ChatUsage, turnId: 'parent-turn', usage }));
		contributions.service.didDispatchAction(dispatchedAction(subagentChat, contributions.session, { type: ActionType.ChatUsage, turnId: 'subagent-turn', usage }));
		await Promise.resolve();

		assert.deepStrictEqual([...(await contributions.database.getTurnUsages()).entries()], [
			['parent-turn', JSON.stringify(usage)],
		]);
	});

	test('isolates a throwing outgoing-turn contribution', async () => {
		const contributions = disposables.add(createContributions(disposables, ThrowingOutgoingTurnObserverContribution, FollowingOutgoingTurnObserverContribution));
		await contributions.outgoingTurn(outgoingTurn('failure'));

		assert.deepStrictEqual(calls, ['followingOutgoingTurn']);
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

	test('collects outgoing-turn instructions in contribution order', async () => {
		const contributions = disposables.add(createContributions(disposables, OutgoingTurnOrderFirstContribution, OutgoingTurnOrderSecondContribution));

		assert.deepStrictEqual(await contributions.outgoingTurn(outgoingTurn('send-order')), {
			instructions: ['second', 'first'],
			message: { text: 'send-order', origin: { kind: MessageKind.User } },
		});
	});

	test('awaits asynchronous outgoing-turn contributions', async () => {
		const contributions = disposables.add(createContributions(disposables, AsyncOutgoingTurnContribution));

		assert.deepStrictEqual(await contributions.outgoingTurn(outgoingTurn('send-async')), {
			instructions: ['async'],
			message: { text: 'send-async', origin: { kind: MessageKind.User } },
		});
		assert.deepStrictEqual(calls, ['async']);
	});

	test('isolates a failing outgoing-turn contribution', async () => {
		const contributions = disposables.add(createContributions(disposables, ThrowingOutgoingTurnContribution, FollowingOutgoingTurnContribution));

		assert.deepStrictEqual(await contributions.outgoingTurn(outgoingTurn('send-failure')), {
			instructions: ['following'],
			message: { text: 'send-failure', origin: { kind: MessageKind.User } },
		});
	});

	test('omits empty outgoing-turn contribution results', async () => {
		const contributions = disposables.add(createContributions(disposables, EmptyOutgoingTurnContribution));

		assert.deepStrictEqual(await contributions.outgoingTurn(outgoingTurn('send-empty-array')), {
			message: { text: 'send-empty-array', origin: { kind: MessageKind.User } },
		});
		assert.deepStrictEqual(await contributions.outgoingTurn(outgoingTurn('send-empty-object')), {
			message: { text: 'send-empty-object', origin: { kind: MessageKind.User } },
		});
	});

	test('accepts incoming requests when no contribution objects', () => {
		const contributions = disposables.add(createContributions(disposables, UndefinedIncomingRequestContribution, AcceptingIncomingRequestContribution));

		assert.deepStrictEqual(contributions.incomingRequest(incomingRequest()), { kind: 'accept' });
	});

	test('stops at a handled incoming-request disposition in contribution order', () => {
		const contributions = disposables.add(createContributions(disposables, FollowingIncomingRequestContribution, HandlingIncomingRequestContribution));

		assert.deepStrictEqual({
			disposition: contributions.incomingRequest(incomingRequest()),
			calls,
		}, {
			disposition: { kind: 'handled' },
			calls: ['handled'],
		});
	});

	test('passes incoming request sources to contributions', () => {
		const contributions = disposables.add(createContributions(disposables, SourceRecordingIncomingRequestContribution));
		contributions.incomingRequest(incomingRequest(undefined, undefined, 'queued'));
		contributions.incomingRequest(incomingRequest());

		assert.deepStrictEqual(calls, ['queued', 'direct']);
	});

	test('stops at the first non-accept incoming-request disposition in contribution order', () => {
		const contributions = disposables.add(createContributions(disposables, SecondRejectingIncomingRequestContribution, FirstRejectingIncomingRequestContribution));

		assert.deepStrictEqual(contributions.incomingRequest(incomingRequest()), {
			kind: 'reject',
			error: { errorType: 'first', message: 'first rejection' },
			stage: 'validation',
		});
		assert.deepStrictEqual(calls, ['first']);
	});

	test('fails closed when an incoming-request contribution throws', () => {
		const contributions = disposables.add(createContributions(disposables, ThrowingIncomingRequestContribution, FollowingIncomingRequestContribution));

		assert.deepStrictEqual(contributions.incomingRequest(incomingRequest()), {
			kind: 'reject',
			error: {
				errorType: 'internalError',
				message: 'Turn admission contribution \'throwingIncomingRequest\' failed',
			},
			stage: 'validation',
		});
		assert.deepStrictEqual(calls, []);
	});

	test('skips contributions without an onIncomingRequest hook', () => {
		const contributions = disposables.add(createContributions(disposables, OrderedFirstContribution));

		assert.deepStrictEqual(contributions.incomingRequest(incomingRequest()), { kind: 'accept' });
	});

	test('rejects incoming requests for archived sessions and read-only chats', () => {
		const archived = createBuiltInContributions(disposables, undefined, false, SessionStatus.IsRead | SessionStatus.IsArchived);
		const readOnly = createBuiltInContributions(disposables);
		const readOnlyChat = buildChatUri(readOnly.session, 'read-only');
		readOnly.stateManager.addChat(readOnly.session, readOnlyChat, { title: 'Read-only', interactivity: ChatInteractivity.ReadOnly });

		assert.deepStrictEqual({
			archived: archived.service.incomingRequest(incomingRequest(archived.session)),
			readOnly: readOnly.service.incomingRequest(incomingRequest(readOnly.session, readOnlyChat)),
		}, {
			archived: {
				kind: 'reject',
				error: {
					errorType: 'archived',
					message: 'This session is archived and read-only. Restore the session to continue the conversation.',
				},
				stage: 'validation',
			},
			readOnly: {
				kind: 'reject',
				error: {
					errorType: 'readOnly',
					message: 'This chat is read-only.',
				},
				stage: 'validation',
			},
		});
	});

	test('handles local commands before rejecting archived and read-only chats', () => {
		const archived = createBuiltInContributions(disposables, undefined, false, SessionStatus.IsRead | SessionStatus.IsArchived);
		const readOnly = createBuiltInContributions(disposables);
		const readOnlyChat = buildChatUri(readOnly.session, 'read-only');
		readOnly.stateManager.addChat(readOnly.session, readOnlyChat, { title: 'Read-only', interactivity: ChatInteractivity.ReadOnly });

		assert.deepStrictEqual({
			archived: archived.service.incomingRequest({
				...incomingRequest(archived.session),
				message: { text: '/rename Archived', origin: { kind: MessageKind.User } },
			}),
			readOnly: readOnly.service.incomingRequest({
				...incomingRequest(readOnly.session, readOnlyChat),
				message: { text: '/rename Read-only', origin: { kind: MessageKind.User } },
			}),
		}, {
			archived: { kind: 'handled' },
			readOnly: { kind: 'handled' },
		});
	});

	test('threads outgoing messages through contributions in order', async () => {
		const contributions = disposables.add(createContributions(disposables, MessageObserverContribution, SecondMessageReplacementContribution, FirstMessageReplacementContribution));

		assert.deepStrictEqual(await contributions.outgoingTurn(outgoingTurn('message-threading')), {
			message: { text: 'first replacement then second', origin: { kind: MessageKind.User } },
		});
		assert.deepStrictEqual(calls, ['first replacement then second']);
	});

	test('omits source transcript for a completed side-chat source turn', async () => {
		const sideChat = createSideChatContributions(disposables, undefined, 'MOONVALE99');
		sideChat.stateManager.dispatchServerAction(sideChat.sourceChat, {
			type: ActionType.ChatTurnStarted,
			turnId: 'source-turn',
			startedAt: '2025-01-01T00:00:00.000Z',
			message: { text: 'source question', origin: { kind: MessageKind.User } },
		});
		sideChat.stateManager.dispatchServerAction(sideChat.sourceChat, {
			type: ActionType.ChatTurnComplete,
			turnId: 'source-turn',
			duration: 1,
		});

		const firstMessage = { text: 'side question', origin: { kind: MessageKind.User } };
		const first = await sideChat.service.outgoingTurn({
			session: sideChat.session,
			chat: sideChat.sideChat,
			message: firstMessage,
			turnId: 'side-turn',
		});

		sideChat.stateManager.dispatchServerAction(sideChat.sideChat, {
			type: ActionType.ChatTurnStarted,
			turnId: 'side-turn',
			startedAt: '2025-01-01T00:00:00.000Z',
			message: firstMessage,
		});
		sideChat.stateManager.dispatchServerAction(sideChat.sideChat, {
			type: ActionType.ChatTurnComplete,
			turnId: 'side-turn',
			duration: 1,
		});
		sideChat.service.turnEnd({
			session: sideChat.session,
			channel: sideChat.sideChat,
			turnId: 'side-turn',
			reason: { kind: 'success' },
		});
		const later = await sideChat.service.outgoingTurn({
			session: sideChat.session,
			chat: sideChat.sideChat,
			message: { text: 'follow up', origin: { kind: MessageKind.User } },
			turnId: 'later-turn',
		});

		assert.deepStrictEqual({
			firstMessage: first.message.text,
			laterMessage: later.message.text,
		}, {
			firstMessage: injectSideChatContext('side question', undefined, undefined, 'MOONVALE99'),
			laterMessage: 'follow up',
		});
	});

	test('includes source transcript for an active side-chat source turn', async () => {
		const sideChat = createSideChatContributions(disposables);
		sideChat.stateManager.dispatchServerAction(sideChat.sourceChat, {
			type: ActionType.ChatTurnStarted,
			turnId: 'source-turn',
			startedAt: '2025-01-01T00:00:00.000Z',
			message: { text: 'source question', origin: { kind: MessageKind.User } },
		});

		const first = await sideChat.service.outgoingTurn({
			session: sideChat.session,
			chat: sideChat.sideChat,
			message: { text: 'side question', origin: { kind: MessageKind.User } },
			turnId: 'side-turn',
		});

		assert.strictEqual(first.message.text, injectSideChatContext('side question', undefined, 'User request:\nsource question'));
	});

	test('includes only local context after the active side-chat fork anchor', async () => {
		const sideChat = createSideChatContributions(disposables);
		sideChat.stateManager.dispatchServerAction(sideChat.sourceChat, {
			type: ActionType.ChatTurnStarted,
			turnId: 'source-concrete',
			startedAt: '2025-01-01T00:00:00.000Z',
			message: { text: 'source question', origin: { kind: MessageKind.User } },
		});
		sideChat.stateManager.dispatchServerAction(sideChat.sourceChat, {
			type: ActionType.ChatTurnComplete,
			turnId: 'source-concrete',
			duration: 1,
		});
		sideChat.stateManager.dispatchServerAction(sideChat.sourceChat, {
			type: ActionType.ChatTurnStarted,
			turnId: 'local-turn',
			startedAt: '2025-01-01T00:00:01.000Z',
			message: { text: '!command', origin: { kind: MessageKind.User } },
		});
		sideChat.stateManager.dispatchServerAction(sideChat.sourceChat, {
			type: ActionType.ChatTurnComplete,
			turnId: 'local-turn',
			duration: 1,
		});
		sideChat.localTurns.noteInMemory(sideChat.session, sideChat.sourceChat, 'local-turn', 'source-concrete', 1);
		sideChat.stateManager.dispatchServerAction(sideChat.sourceChat, {
			type: ActionType.ChatTurnStarted,
			turnId: 'source-turn',
			startedAt: '2025-01-01T00:00:02.000Z',
			message: { text: 'still running', origin: { kind: MessageKind.User } },
		});

		const first = await sideChat.service.outgoingTurn({
			session: sideChat.session,
			chat: sideChat.sideChat,
			message: { text: 'side question', origin: { kind: MessageKind.User } },
			turnId: 'side-turn',
		});

		assert.strictEqual(first.message.text, injectSideChatContext('side question', undefined, 'User request:\n!command\n\n---\n\nUser request:\nstill running'));
	});

	test('injects context after failed or cancelled first side-chat attempts', async () => {
		const reasons: readonly ITurnEnd['reason'][] = [
			{ kind: 'error', error: { errorType: 'test', message: 'failed' }, resumable: false },
			{ kind: 'cancelled' },
		];
		for (const reason of reasons) {
			const sideChat = createSideChatContributions(disposables);
			const firstMessage = { text: 'first attempt', origin: { kind: MessageKind.User } };
			await sideChat.service.outgoingTurn({
				session: sideChat.session,
				chat: sideChat.sideChat,
				message: firstMessage,
				turnId: 'first-turn',
			});
			sideChat.stateManager.dispatchServerAction(sideChat.sideChat, {
				type: ActionType.ChatTurnStarted,
				turnId: 'first-turn',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: firstMessage,
			});
			if (reason.kind === 'error') {
				sideChat.stateManager.dispatchServerAction(sideChat.sideChat, {
					type: ActionType.ChatError,
					turnId: 'first-turn',
					duration: 1,
					part: {
						kind: ResponsePartKind.Error,
						error: reason.error,
					},
				});
			} else {
				sideChat.stateManager.dispatchServerAction(sideChat.sideChat, {
					type: ActionType.ChatTurnCancelled,
					turnId: 'first-turn',
					duration: 1,
				});
			}
			sideChat.service.turnEnd({
				session: sideChat.session,
				channel: sideChat.sideChat,
				turnId: 'first-turn',
				reason,
			});

			const retry = await sideChat.service.outgoingTurn({
				session: sideChat.session,
				chat: sideChat.sideChat,
				message: { text: 'retry', origin: { kind: MessageKind.User } },
				turnId: 'retry-turn',
			});

			assert.strictEqual(retry.message.text, injectSideChatContext('retry'));
		}
	});

	test('includes source transcript for a host-injected local source turn', async () => {
		const sideChat = createSideChatContributions(disposables);
		const localMessage = { text: '/rename Side Chat', origin: { kind: MessageKind.User } };
		sideChat.stateManager.dispatchServerAction(sideChat.sourceChat, {
			type: ActionType.ChatTurnStarted,
			turnId: 'source-turn',
			startedAt: '2025-01-01T00:00:00.000Z',
			message: localMessage,
		});
		sideChat.stateManager.dispatchServerAction(sideChat.sourceChat, {
			type: ActionType.ChatTurnComplete,
			turnId: 'source-turn',
			duration: 1,
		});
		sideChat.localTurns.noteInMemory(sideChat.session, sideChat.sourceChat, 'source-turn', undefined, 1);

		const firstProviderMessage = await sideChat.service.outgoingTurn({
			session: sideChat.session,
			chat: sideChat.sideChat,
			message: { text: 'side question', origin: { kind: MessageKind.User } },
			turnId: 'provider-turn',
		});

		assert.strictEqual(firstProviderMessage.message.text, injectSideChatContext('side question', undefined, 'User request:\n/rename Side Chat'));
	});

	test('strips inherited turns and context while hydrating a side chat', async () => {
		const sideChat = createSideChatContributions(disposables, 'inherited');
		const turns = await sideChat.service.hydrateTurns(
			{ session: sideChat.session, chat: sideChat.sideChat },
			[
				hydrationTurn('inherited'),
				{ ...hydrationTurn('seed'), message: { text: injectSideChatContext('side question'), origin: { kind: MessageKind.User } } },
				hydrationTurn('follow-up'),
			],
		);

		assert.deepStrictEqual(turns.map(turn => [turn.id, turn.message.text]), [
			['seed', 'side question'],
			['follow-up', 'follow-up'],
		]);
	});

	test('uses the host-persisted inherited turn id before the side chat sends its first turn', async () => {
		const sideChat = createSideChatContributions(disposables, 'inherited');
		const turns = await sideChat.service.hydrateTurns(
			{ session: sideChat.session, chat: sideChat.sideChat },
			[hydrationTurn('inherited'), hydrationTurn('side-turn')],
		);

		assert.deepStrictEqual(turns.map(turn => turn.id), ['side-turn']);
	});

	test('does not re-inject context after hydration finds a completed side-chat turn', async () => {
		const sideChat = createSideChatContributions(disposables, 'inherited');
		await sideChat.service.hydrateTurns(
			{ session: sideChat.session, chat: sideChat.sideChat },
			[
				hydrationTurn('inherited'),
				{ ...hydrationTurn('seed'), message: { text: injectSideChatContext('side question'), origin: { kind: MessageKind.User } } },
			],
		);

		const later = await sideChat.service.outgoingTurn({
			session: sideChat.session,
			chat: sideChat.sideChat,
			message: { text: 'follow up', origin: { kind: MessageKind.User } },
			turnId: 'later-turn',
		});

		assert.strictEqual(later.message.text, 'follow up');
	});

	test('finds the side-chat boundary from its seed marker without a persisted inherited turn id', async () => {
		const sideChat = createSideChatContributions(disposables);
		const turns = await sideChat.service.hydrateTurns(
			{ session: sideChat.session, chat: sideChat.sideChat },
			[
				hydrationTurn('inherited'),
				{ ...hydrationTurn('seed'), message: { text: injectSideChatContext('side question'), origin: { kind: MessageKind.User } } },
				hydrationTurn('follow-up'),
			],
		);

		assert.deepStrictEqual(turns.map(turn => turn.id), ['seed', 'follow-up']);
	});

	test('preserves side-chat history when its boundary cannot be located', async () => {
		const sideChat = createSideChatContributions(disposables);
		const input = [hydrationTurn('restored-turn')];

		assert.strictEqual(await sideChat.service.hydrateTurns({ session: sideChat.session, chat: sideChat.sideChat }, input), input);
	});

	test('leaves a non-side-chat origin untouched', async () => {
		const sideChat = createSideChatContributions(disposables);
		const ordinaryChat = buildChatUri(sideChat.session, 'ordinary');
		sideChat.stateManager.addChat(sideChat.session, ordinaryChat, { title: 'Ordinary' });
		const input = [hydrationTurn('ordinary')];

		assert.strictEqual(await sideChat.service.hydrateTurns({ session: sideChat.session, chat: ordinaryChat }, input), input);
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

	test('threads restored chat state through contributions in order', async () => {
		const contributions = disposables.add(createContributions(disposables, SecondChatHydrationContribution, FirstChatHydrationContribution));

		const restored = await contributions.hydrateChat(hydrationContext(), {});

		assert.deepStrictEqual(restored, {
			title: 'first',
			draft: { text: 'first draft', origin: { kind: MessageKind.User } },
		});
	});

	test('awaits asynchronous chat hydration contributions', async () => {
		const contributions = disposables.add(createContributions(disposables, SecondChatHydrationContribution, AsyncChatHydrationContribution));

		assert.deepStrictEqual(await contributions.hydrateChat(hydrationContext(), {}), {
			title: 'async',
			draft: { text: 'async draft', origin: { kind: MessageKind.User } },
		});
	});

	test('preserves the previous chat state when a hydration contribution fails', async () => {
		const contributions = disposables.add(createContributions(disposables, FollowingChatHydrationContribution, ThrowingChatHydrationContribution, PreviousChatHydrationContribution));

		const restored = await contributions.hydrateChat(hydrationContext(), {});

		assert.deepStrictEqual({ calls, restored }, {
			calls: ['following:previous'],
			restored: {
				title: 'previous',
				draft: { text: 'previous draft', origin: { kind: MessageKind.User } },
			},
		});
	});

	test('skips contributions without an onHydrateChat hook', async () => {
		const contributions = disposables.add(createContributions(disposables, OrderedFirstContribution));
		const restored = { title: 'initial' };

		assert.strictEqual(await contributions.hydrateChat(hydrationContext(), restored), restored);
	});

	test('runs built-in chat hydration contributions in the original sequence', async () => {
		const contributions = createBuiltInContributions(disposables);
		const chat = buildChatUri(contributions.session, 'peer');
		const titleKey = customChatTitleMetadataKey(chat);
		const draft = { text: 'Restored draft', origin: { kind: MessageKind.User } };
		await contributions.database.setMetadata(titleKey, 'Restored title');
		await contributions.database.setChatDraft(URI.parse(chat), draft);
		const getMetadata = contributions.database.getMetadata.bind(contributions.database);
		const getChatDraft = contributions.database.getChatDraft.bind(contributions.database);
		contributions.database.getMetadata = async key => {
			if (key === titleKey) {
				calls.push('sessionTitle');
			}
			return getMetadata(key);
		};
		contributions.database.getChatDraft = async resource => {
			calls.push('chatDraft');
			return getChatDraft(resource);
		};

		const restored = await contributions.service.hydrateChat({ session: contributions.session, chat }, {});

		assert.deepStrictEqual({ calls, restored }, {
			calls: ['sessionTitle', 'chatDraft'],
			restored: {
				title: 'Restored title',
				draft,
			},
		});
	});
});
