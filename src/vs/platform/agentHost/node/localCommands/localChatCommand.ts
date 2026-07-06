/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../log/common/log.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { ActionType, StateAction } from '../../common/state/sessionActions.js';
import { isAhpChatChannel, parseRequiredSessionUriFromChatUri, ResponsePartKind, ToolCallStatus, ToolResultContentType, type ISessionWithDefaultChat, type Turn, type URI as ProtocolURI } from '../../common/state/sessionState.js';
import { AgentHostLocalTurns } from '../agentHostLocalTurns.js';
import { IAgentHostTerminalManager } from '../agentHostTerminalManager.js';
import { AgentHostStateManager } from '../agentHostStateManager.js';
import { persistSessionMetadata } from '../shared/persistSessionMetadata.js';

/**
 * A just-started chat turn offered to the local-command dispatcher before it is
 * forwarded to the agent SDK.
 */
export interface ILocalChatCommandRequest {
	/** The chat channel the turn was started on (default or peer chat). */
	readonly turnChannel: ProtocolURI;
	/** The turn identifier opened by the reducer for this message. */
	readonly turnId: string;
	/** The raw user message text. */
	readonly text: string;
}

/**
 * The narrow set of agent-host capabilities a {@link ILocalChatCommand} may use
 * to fulfil a request. Keeps commands decoupled from `AgentSideEffects`
 * internals — they emit response content by dispatching server actions and read
 * conversation state, plus the few extra capabilities specific commands need
 * (terminal execution, chat rename/persist).
 */
export interface ILocalChatCommandContext {
	readonly logService: ILogService;
	readonly terminalManager: IAgentHostTerminalManager;
	/** Dispatch a server-originated action on a channel. */
	dispatch(channel: ProtocolURI, action: StateAction): void;
	/** Read the merged session/chat state for a session or chat channel. */
	getState(channel: ProtocolURI): ISessionWithDefaultChat | undefined;
	/** Rename a single chat (independently of the session title). */
	updateChatTitle(session: ProtocolURI, chat: ProtocolURI, title: string): void;
	/** Persist a session-metadata key/value pair (e.g. a custom title). */
	persistSessionFlag(session: ProtocolURI, key: string, value: string): void;
}

/**
 * A generic, agent-agnostic chat command handled entirely by the agent host
 * (never forwarded to the agent SDK) — for example `/rename` or `!command`.
 *
 * A command decides synchronously whether it applies (so the caller knows
 * immediately not to forward the message), then performs its work — emitting
 * response parts/tool calls via {@link ILocalChatCommandContext}. The
 * {@link AgentHostLocalCommands} dispatcher owns the common tail: completing the
 * turn, optionally persisting it as a local turn (so it survives reload and
 * anchors fork/truncate), and draining the message queue.
 */
export interface ILocalChatCommand extends IDisposable {
	/** Stable identifier for logging/telemetry. */
	readonly name: string;
	/**
	 * Whether the completed turn should be persisted as a host-injected local
	 * turn (survives reload; anchors fork/truncate to the preceding concrete
	 * turn). Most user-visible commands want `true`.
	 */
	readonly recordsLocalTurn: boolean;
	/**
	 * Synchronously decide whether this command handles `request`. Returns a
	 * thunk that performs the (possibly async) work when it does, or `undefined`
	 * to decline so the dispatcher tries the next command (and ultimately
	 * forwards the message to the agent).
	 */
	tryHandle(request: ILocalChatCommandRequest): (() => Promise<void>) | undefined;
}

/** Constructs a {@link ILocalChatCommand} bound to a context. */
export interface ILocalChatCommandCtor {
	new(context: ILocalChatCommandContext): ILocalChatCommand;
}

/**
 * Global registry of {@link ILocalChatCommand} constructors. Command modules
 * register themselves at load time; {@link AgentHostLocalCommands} instantiates
 * all registered commands per session-effects instance with its context.
 */
class LocalChatCommandRegistryImpl {
	private readonly _ctors: ILocalChatCommandCtor[] = [];

	register(ctor: ILocalChatCommandCtor): void {
		this._ctors.push(ctor);
	}

	createAll(context: ILocalChatCommandContext): ILocalChatCommand[] {
		return this._ctors.map(ctor => new ctor(context));
	}
}

export const LocalChatCommandRegistry = new LocalChatCommandRegistryImpl();

/**
 * Dispatches just-started turns to the registered {@link ILocalChatCommand}s
 * and owns everything a host-handled command needs end-to-end: it builds the
 * {@link ILocalChatCommandContext} from the state manager and injected services,
 * runs the first accepting command, then performs the common tail — completing
 * the turn, persisting it as a local turn (so it survives reload and anchors
 * fork/truncate), and asking the owner to drain the message queue.
 */
export class AgentHostLocalCommands extends Disposable {

	private readonly _commands: readonly ILocalChatCommand[];

	constructor(
		private readonly _stateManager: AgentHostStateManager,
		private readonly _localTurns: AgentHostLocalTurns,
		/**
		 * Invoked after a handled turn is completed so the owner can start the
		 * next queued message. Draining re-enters the agent-send pipeline, which
		 * is the owner's concern — not the dispatcher's.
		 */
		private readonly _notifyTurnConsumable: (turnChannel: ProtocolURI) => void,
		@ILogService private readonly _logService: ILogService,
		@IAgentHostTerminalManager private readonly _terminalManager: IAgentHostTerminalManager,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
	) {
		super();
		const context: ILocalChatCommandContext = {
			logService: this._logService,
			terminalManager: this._terminalManager,
			dispatch: (channel, action) => this._stateManager.dispatchServerAction(channel, action),
			getState: channel => this._stateManager.getSessionState(channel),
			updateChatTitle: (session, chat, title) => this._stateManager.updateChatTitle(session, chat, title),
			persistSessionFlag: (session, key, value) => persistSessionMetadata(this._sessionDataService, this._logService, session, key, value),
		};
		this._commands = LocalChatCommandRegistry.createAll(context).map(command => this._register(command));
	}

	/**
	 * Offers `request` to each command. Returns `true` when one handled it (the
	 * caller MUST NOT forward the message to the agent), `false` otherwise.
	 */
	tryHandle(request: ILocalChatCommandRequest): boolean {
		for (const command of this._commands) {
			const work = command.tryHandle(request);
			if (work) {
				void this._run(command, work, request);
				return true;
			}
		}
		return false;
	}

	private async _run(command: ILocalChatCommand, work: () => Promise<void>, request: ILocalChatCommandRequest): Promise<void> {
		try {
			await work();
		} catch (err) {
			this._logService.error(`[AgentHostLocalCommands] Command '${command.name}' failed: ${err instanceof Error ? err.message : String(err)}`, err);
		} finally {
			// Common tail for every host-handled command: close out the turn the
			// reducer opened, optionally persist it as a local turn (so it
			// survives reload and anchors fork/truncate), then let the owner
			// drain any messages queued behind it.
			this._stateManager.dispatchServerAction(request.turnChannel, { type: ActionType.ChatTurnComplete, turnId: request.turnId });
			if (command.recordsLocalTurn) {
				this._recordLocalTurn(request.turnChannel, request.turnId);
			}
			this._notifyTurnConsumable(request.turnChannel);
		}
	}

	/**
	 * Records the just-completed turn `turnId` as a host-injected local turn so
	 * it survives reload and fork/truncate can resolve it to the preceding
	 * concrete turn. Works uniformly for the default chat and any peer chat —
	 * the turn is keyed by its chat channel. Live terminal references are
	 * stripped from the payload (the PTY does not survive a reload).
	 */
	private _recordLocalTurn(turnChannel: ProtocolURI, turnId: string): void {
		const chat = turnChannel;
		const session = isAhpChatChannel(turnChannel) ? parseRequiredSessionUriFromChatUri(turnChannel) : turnChannel;
		const turns = this._stateManager.getSessionState(turnChannel)?.turns;
		if (!turns) {
			return;
		}
		const index = turns.findIndex(t => t.id === turnId);
		if (index < 0) {
			return;
		}
		// Anchor = the nearest preceding turn in this chat that is not itself a
		// local turn.
		let anchorTurnId: string | undefined;
		for (let i = index - 1; i >= 0; i--) {
			if (!this._localTurns.isLocal(chat, turns[i].id)) {
				anchorTurnId = turns[i].id;
				break;
			}
		}
		this._localTurns.record(session, chat, sanitizeLocalTurnForPersistence(turns[index]), anchorTurnId);
	}
}

/**
 * Prepares a host-injected local turn for persistence by dropping live
 * {@link ToolResultContentType.Terminal} references from its tool calls — the
 * PTY does not survive a reload, so only the captured output (text) is kept.
 */
function sanitizeLocalTurnForPersistence(turn: Turn): Turn {
	const responseParts = turn.responseParts.map(part => {
		if (part.kind !== ResponsePartKind.ToolCall) {
			return part;
		}
		const tc = part.toolCall;
		// Only these tool-call states carry `content` (a live terminal ref lives here).
		if (tc.status !== ToolCallStatus.Running && tc.status !== ToolCallStatus.Completed && tc.status !== ToolCallStatus.PendingResultConfirmation) {
			return part;
		}
		if (!tc.content) {
			return part;
		}
		const content = tc.content.filter(c => c.type !== ToolResultContentType.Terminal);
		if (content.length === tc.content.length) {
			return part;
		}
		return { ...part, toolCall: { ...tc, content } };
	});
	return { ...turn, responseParts };
}
