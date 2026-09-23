/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, toDisposable, type IDisposable } from '../../../base/common/lifecycle.js';
import { NKeyMap } from '../../../base/common/map.js';
import { observableValue, type ISettableObservable } from '../../../base/common/observable.js';
import { IInstantiationService, type IConstructorSignature } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, IAgentHostChatContributionHost, IAgentHostChatContributions, IChatMementoKey, IHydrationContext, IIncomingRequest, IAppliedClientAction, IDispatchedAction, IOutgoingTurn, IOutgoingTurnContributionResult, IncomingRequestDisposition, IRestoredChat, ISessionMementoKey, ITurnEnd } from '../common/agentHostChatContributionsService.js';
import { isAhpChatChannel, parseRequiredSessionUriFromChatUri, type Turn, type URI as ProtocolURI } from '../common/state/sessionState.js';

type MementoKeySegment = string | boolean | number;
type MementoMap = NKeyMap<ISettableObservable<unknown>, [ProtocolURI, string, ...MementoKeySegment[]]>;

interface IRegisteredContribution {
	readonly id: string;
	readonly contribution: IAgentHostChatContribution;
	readonly context: AgentHostChatContributionContext;
	readonly index: number;
}

class AgentHostChatContributionContext implements IAgentHostChatContributionContext {
	private readonly _chatMementos: MementoMap = new NKeyMap();
	private readonly _sessionMementos: MementoMap = new NKeyMap();
	private readonly _chatsBySession = new Map<ProtocolURI, Set<ProtocolURI>>();

	constructor(readonly contributionId: string) { }

	memento<T, TExtra extends readonly MementoKeySegment[]>(key: IChatMementoKey<T, TExtra> | ISessionMementoKey<T, TExtra>, resource: ProtocolURI, ...extra: TExtra): ISettableObservable<T> {
		const mementos = key.scope === 'chat' ? this._chatMementos : this._sessionMementos;
		const existing = mementos.get(resource, key.debugName, ...extra) as ISettableObservable<T> | undefined;
		if (existing) {
			return existing;
		}
		const memento = observableValue(this, key.create());
		mementos.set(memento, resource, key.debugName, ...extra);
		if (key.scope === 'chat') {
			this._registerChat(resource);
		}
		return memento;
	}

	deleteMemento<T, TExtra extends readonly MementoKeySegment[]>(key: IChatMementoKey<T, TExtra> | ISessionMementoKey<T, TExtra>, resource: ProtocolURI, ...extra: TExtra): void {
		const mementos = key.scope === 'chat' ? this._chatMementos : this._sessionMementos;
		mementos.delete(resource, key.debugName, ...extra);
	}

	disposeChatState(chat: ProtocolURI): void {
		this._chatMementos.deleteAll(chat);
		const session = this._owningSession(chat);
		const chats = this._chatsBySession.get(session);
		if (chats?.delete(chat) && chats.size === 0) {
			this._chatsBySession.delete(session);
		}
	}

	disposeSessionState(session: ProtocolURI): void {
		this._sessionMementos.deleteAll(session);
		const chats = this._chatsBySession.get(session);
		if (chats) {
			for (const chat of chats) {
				this._chatMementos.deleteAll(chat);
			}
			this._chatsBySession.delete(session);
		}
	}

	private _registerChat(chat: ProtocolURI): void {
		const session = this._owningSession(chat);
		let chats = this._chatsBySession.get(session);
		if (!chats) {
			chats = new Set();
			this._chatsBySession.set(session, chats);
		}
		chats.add(chat);
	}

	private _owningSession(chat: ProtocolURI): ProtocolURI {
		return isAhpChatChannel(chat) ? parseRequiredSessionUriFromChatUri(chat) : chat;
	}
}

export class AgentHostChatContributions extends Disposable implements IAgentHostChatContributions {
	declare readonly _serviceBrand: undefined;

	private readonly _contributionRegistrations = this._register(new DisposableMap<IAgentHostChatContribution>());
	private readonly _registeredContributions = new Map<IAgentHostChatContribution, IRegisteredContribution>();
	private _nextContributionIndex = 0;
	private _host: IAgentHostChatContributionHost | undefined;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
	}

	registerContribution(contributionCtor: IConstructorSignature<IAgentHostChatContribution, [context: IAgentHostChatContributionContext]> & { readonly id: string }): IDisposable {
		// Check the stable id before constructing: the instance below is always
		// new, so testing the registration map for it could never detect a repeat
		// registration and the contribution's constructor would run twice.
		for (const registration of this._registeredContributions.values()) {
			if (registration.id === contributionCtor.id) {
				throw new Error(`Chat contribution already registered: ${contributionCtor.id}`);
			}
		}
		const context = new AgentHostChatContributionContext(contributionCtor.id);
		const contribution = this._instantiationService.createInstance(contributionCtor, context);
		this._registeredContributions.set(contribution, { id: contributionCtor.id, contribution, context, index: this._nextContributionIndex++ });
		this._contributionRegistrations.set(contribution, toDisposable(() => {
			this._registeredContributions.delete(contribution);
			contribution.dispose();
		}));
		return toDisposable(() => this._contributionRegistrations.deleteAndDispose(contribution));
	}

	registerHost(host: IAgentHostChatContributionHost): IDisposable {
		if (this._host !== undefined) {
			throw new Error('Chat contribution host already registered');
		}
		this._host = host;
		return toDisposable(() => {
			if (this._host === host) {
				this._host = undefined;
			}
		});
	}

	getHost(): IAgentHostChatContributionHost | undefined {
		return this._host;
	}

	turnEnd(turn: ITurnEnd): void {
		for (const registration of this._getOrderedContributions()) {
			const { contribution } = registration;
			if (!contribution.onTurnEnd) {
				continue;
			}
			try {
				contribution.onTurnEnd(turn);
			} catch (err) {
				this._logContributionFailure(registration, err);
			}
		}
	}

	didApplyClientAction(action: IAppliedClientAction): void {
		for (const registration of this._getOrderedContributions()) {
			const { contribution } = registration;
			if (!contribution.onDidApplyClientAction) {
				continue;
			}
			try {
				contribution.onDidApplyClientAction(action);
			} catch (err) {
				this._logContributionFailure(registration, err);
			}
		}
	}

	didDispatchAction(dispatched: IDispatchedAction): void {
		for (const registration of this._getOrderedContributions()) {
			const { contribution } = registration;
			if (!contribution.onDidDispatchAction) {
				continue;
			}
			try {
				contribution.onDidDispatchAction(dispatched);
			} catch (err) {
				this._logContributionFailure(registration, err);
			}
		}
	}

	async outgoingTurn(turn: IOutgoingTurn): Promise<IOutgoingTurnContributionResult> {
		const instructions: string[] = [];
		let message = turn.message;
		for (const registration of this._getOrderedContributions()) {
			const { contribution } = registration;
			if (!contribution.onOutgoingTurn) {
				continue;
			}
			try {
				const result = await contribution.onOutgoingTurn({ ...turn, message });
				if (result?.instructions) {
					instructions.push(...result.instructions);
				}
				if (result?.text !== undefined) {
					message = { ...message, text: result.text };
				}
			} catch (err) {
				this._logContributionFailure(registration, err);
			}
		}
		return {
			...(instructions.length ? { instructions } : {}),
			message,
		};
	}

	/**
	 * Admits an incoming request through ordered contribution gates.
	 *
	 * Unlike every other contribution dispatcher, this fails CLOSED: a throwing
	 * contribution rejects the request instead of being isolated and skipped.
	 * Treating a failure as an accept could run work in a read-only or archived
	 * session whose worktree no longer exists.
	 */
	incomingRequest(request: IIncomingRequest): IncomingRequestDisposition {
		for (const registration of this._getOrderedContributions()) {
			const { contribution } = registration;
			if (!contribution.onIncomingRequest) {
				continue;
			}
			try {
				const disposition = contribution.onIncomingRequest(request);
				if (disposition && disposition.kind !== 'accept') {
					return disposition;
				}
			} catch (err) {
				this._logContributionFailure(registration, err);
				return {
					kind: 'reject',
					error: {
						errorType: 'internalError',
						message: `Turn admission contribution '${registration.id}' failed`,
					},
					stage: 'validation',
				};
			}
		}
		return { kind: 'accept' };
	}

	async hydrateTurns(context: IHydrationContext, turns: readonly Turn[]): Promise<readonly Turn[]> {
		let hydratedTurns = turns;
		for (const registration of this._getOrderedContributions()) {
			const { contribution } = registration;
			if (!contribution.onHydrateTurns) {
				continue;
			}
			try {
				hydratedTurns = await contribution.onHydrateTurns(context, hydratedTurns);
			} catch (err) {
				this._logContributionFailure(registration, err);
			}
		}
		return hydratedTurns;
	}

	async hydrateChat(context: IHydrationContext, restored: IRestoredChat): Promise<IRestoredChat> {
		let hydrated = restored;
		for (const registration of this._getOrderedContributions()) {
			const { contribution } = registration;
			if (!contribution.onHydrateChat) {
				continue;
			}
			try {
				hydrated = await contribution.onHydrateChat(context, hydrated);
			} catch (err) {
				this._logContributionFailure(registration, err);
			}
		}
		return hydrated;
	}

	disposeChatState(chat: ProtocolURI): void {
		for (const context of this._contributionContexts()) {
			context.disposeChatState(chat);
		}
	}

	disposeSessionState(session: ProtocolURI): void {
		for (const context of this._contributionContexts()) {
			context.disposeSessionState(session);
		}
	}

	private _getOrderedContributions(): readonly IRegisteredContribution[] {
		return [...this._registeredContributions.values()].sort((a, b) =>
			(a.contribution.order ?? 0) - (b.contribution.order ?? 0) || a.index - b.index
		);
	}

	private _contributionContexts(): Iterable<AgentHostChatContributionContext> {
		return Array.from(this._registeredContributions.values(), registration => registration.context);
	}

	private _logContributionFailure(registration: IRegisteredContribution, err: unknown): void {
		this._logService.error(`[AgentHostChatContributions] Contribution '${registration.id}' failed: ${err instanceof Error ? err.message : String(err)}`, err);
	}
}
