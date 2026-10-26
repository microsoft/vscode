/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import type { IAgentSessionMetadata } from '../../common/agent.js';
import { AgentChatMoveRefusal, AgentChatMoveRefusedError } from '../../common/agentHostChatMove.js';
import type { IAgentServerToolDefinition } from '../../common/agentServerTools.js';
import { AGENT_HOST_SESSION_LINK_SCHEME, buildOpenSessionLinkUri, parseOpenSessionLinkChatId, parseOpenSessionLinkUri } from '../../common/openSessionLink.js';
import { SessionServerToolName } from '../../common/serverToolNames.js';
import { getAgentHostChatId, isAhpChatChannel, type ToolDefinition, type URI as ProtocolURI } from '../../common/state/sessionState.js';
import type { IServerToolDisplay, IServerToolDisplayResult, IServerToolDisplaySource, IServerToolGroup } from './agentServerToolHost.js';
import { resolveDefaultChat, resolveKnownSession, resolveLinkedChat, sessionToolRequiresConfirmation, type ISessionServerToolAccessor, type ISessionServerToolMove, type SessionServerToolMoveAnchor } from './sessionServerTools.js';

/** Process-wide backstop against runaway `move_session` calls, independent of the per-call user confirmation. */
const maxMovedSessions = 50;

const moveSessionRelationshipValues = ['nested', 'independent'] as const;
type MoveSessionRelationship = typeof moveSessionRelationshipValues[number];

const moveSessionInputSchema: ToolDefinition['inputSchema'] = {
	type: 'object',
	properties: {
		session: { type: 'string', description: 'What to move: an `agent-host-session://` link or a session URI from `list_sessions`. A link carrying a chat id moves that nested session; a session without one moves the whole session, which must have no nested sessions. Omit to move the chat this tool runs in.' },
		relationship: {
			type: 'string',
			enum: [...moveSessionRelationshipValues],
			description: 'Use `independent` to make a nested session its own top-level session; `into` and `after` must then be omitted. Otherwise omit it; defaults to `nested`.',
		},
		into: { type: 'string', description: 'Required unless `relationship` is `independent`, which forbids it: the session to move it into, as a session URI from `list_sessions` or an `agent-host-session://` link. Pass its current session to reorder it there.' },
		after: { type: 'string', description: 'Only with `into`; forbidden with `independent`: an `agent-host-session://` link to a nested session of `into`, or to `into`\'s main session, to place it after. Omit to place it at the end.' },
	},
};

/** The `move_session` tool, offered only while moving chats is enabled. */
export const moveSessionToolDefinition: IAgentServerToolDefinition = {
	name: SessionServerToolName.MoveSession,
	title: 'Move Session',
	description: 'Move a nested session or a whole session when the user asks to reorganize sessions: reorder a nested session within its session, move it into another session, make it its own session (`independent`), or move a session that has no nested sessions into another session as a nested session. Pass `into` for every move except `independent`, which takes neither `into` nor `after`. Use this only when the user asks to move or reorganize sessions; never to tidy up sessions on your own. To start new work, use `create_session` instead. A moved session keeps its history, folders and running work, including a session without a workspace; both sessions must use the same agent. Get links from `list_sessions` or `get_current_session`: a session\'s `openLink`, or for a nested session the `openLink` listed for it in the session\'s `chats`. The user is asked to confirm every move. When it moves the chat this tool runs in, the move happens after this turn ends: make it your final tool call.',
	inputSchema: moveSessionInputSchema,
	annotations: { readOnlyHint: false },
	topLevelChatOnly: true,
	deferLoading: true,
};

/** What a `move_session` call does, for its result and display. */
export type MoveSessionOperation = 'reorder' | 'move' | 'promote' | 'session';

/** Validated `move_session` arguments, resolved against the known sessions and their recorded chats. */
export interface IResolvedMoveSessionArgs {
	readonly operation: MoveSessionOperation;
	readonly move: ISessionServerToolMove;
	/** The chat that moves: the named nested session, or the main session of a whole session. */
	readonly chat: URI;
	/** Whether the move includes the chat this tool runs in, so it waits for the end of the turn. */
	readonly self: boolean;
}

interface IMoveSessionArgs {
	readonly session?: unknown;
	readonly relationship?: unknown;
	readonly into?: unknown;
	readonly after?: unknown;
}

function invalidInput(message: string): Error {
	return new Error(`Invalid ${SessionServerToolName.MoveSession} input: ${message}`);
}

function getOptionalString(value: unknown, field: string): string | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (typeof value !== 'string' || value.length === 0) {
		throw invalidInput(`${field} must be a non-empty string.`);
	}
	return value;
}

function getRelationship(value: unknown): MoveSessionRelationship {
	const relationship = getOptionalString(value, 'relationship') ?? 'nested';
	if (!(moveSessionRelationshipValues as readonly string[]).includes(relationship)) {
		throw invalidInput(`relationship must be one of ${moveSessionRelationshipValues.join(', ')}.`);
	}
	return relationship as MoveSessionRelationship;
}

/** Looks up the known session a session input names: a session URI or an `agent-host-session://` link. */
export type MoveSessionLookup = (input: string) => Promise<IAgentSessionMetadata | undefined>;

/**
 * A {@link MoveSessionLookup} over the session list, read once per call. It resolves links against the same data
 * `list_sessions` returns, where they come from: a session that isn't loaded is listed with its chats, which a
 * single-session read doesn't return.
 */
export function createMoveSessionLookup(listSessions: () => Promise<readonly IAgentSessionMetadata[]>): MoveSessionLookup {
	let listed: Promise<readonly IAgentSessionMetadata[]> | undefined;
	return async input => {
		listed ??= listSessions();
		const sessions = await listed;
		const session = resolveKnownSession(input, sessions);
		return session && sessions.find(candidate => candidate.session.toString() === session.toString());
	};
}

/**
 * Resolves `move_session` arguments. Sessions are named only by links and session URIs of known sessions; a chat only
 * by a link's chat id, matched against that session's recorded chats, or as the calling chat, whose session is its
 * recorded owner. A chat URI is never read for its owner.
 */
export async function getMoveSessionArgs(rawArgs: unknown, lookup: MoveSessionLookup, currentChat: ProtocolURI | undefined, getChatOwner: (chat: ProtocolURI) => ProtocolURI | undefined, getDefaultChat: (session: ProtocolURI) => ProtocolURI | undefined): Promise<IResolvedMoveSessionArgs> {
	const args = (rawArgs ?? {}) as IMoveSessionArgs;
	const relationship = getRelationship(args.relationship);
	const sessionInput = getOptionalString(args.session, 'session');
	const intoInput = getOptionalString(args.into, 'into');
	const afterInput = getOptionalString(args.after, 'after');
	if (relationship === 'independent' && (intoInput !== undefined || afterInput !== undefined)) {
		throw invalidInput('omit `into` and `after` with relationship "independent".');
	}
	if (relationship === 'nested' && intoInput === undefined) {
		throw invalidInput('`into` is required unless relationship is "independent".');
	}

	let session: URI;
	let chat: URI;
	let sessions: readonly IAgentSessionMetadata[];
	if (sessionInput !== undefined) {
		const known = await lookup(sessionInput);
		if (!known) {
			throw invalidInput('session must be an `agent-host-session://` link or the URI of a known session (see list_sessions).');
		}
		session = known.session;
		sessions = [known];
		const chatId = parseOpenSessionLinkChatId(sessionInput);
		const linked = chatId !== undefined ? resolveLinkedChat(sessions, session, chatId) : resolveDefaultChat(sessions, session, getDefaultChat);
		if (!linked) {
			throw invalidInput(chatId !== undefined ? 'session\'s chat id must name a nested session of that session (see list_sessions).' : 'the session has no main session.');
		}
		chat = linked;
	} else {
		const owner = currentChat !== undefined ? getChatOwner(currentChat) : undefined;
		if (currentChat === undefined || owner === undefined) {
			throw invalidInput('session is required when this tool does not run in a chat.');
		}
		session = URI.parse(owner);
		chat = URI.parse(currentChat);
		const known = await lookup(owner);
		sessions = known ? [known] : [];
	}
	const defaultChat = resolveDefaultChat(sessions, session, getDefaultChat);
	const wholeSession = defaultChat !== undefined && isEqual(chat, defaultChat);
	// A whole session moves with every chat it has, so it includes the calling chat when that is one of them.
	const self = currentChat !== undefined && (wholeSession ? getChatOwner(currentChat) === session.toString() : chat.toString() === URI.parse(currentChat).toString());

	if (relationship === 'independent') {
		if (wholeSession) {
			throw invalidInput('it is already its own session. To make a nested session its own session, pass its link with its chat id.');
		}
		return { operation: 'promote', move: { kind: 'chat', session, chat, destination: { kind: 'newSession' } }, chat, self };
	}

	const intoSession = await lookup(intoInput!);
	if (!intoSession) {
		throw invalidInput('into must be an `agent-host-session://` link or the URI of a known session (see list_sessions).');
	}
	const into = intoSession.session;
	let after: SessionServerToolMoveAnchor = 'end';
	if (afterInput !== undefined) {
		const afterSession = await lookup(afterInput);
		const afterChatId = parseOpenSessionLinkChatId(afterInput);
		const anchor = afterSession && isEqual(afterSession.session, into)
			? afterChatId !== undefined ? resolveLinkedChat([intoSession], into, afterChatId) : resolveDefaultChat([intoSession], into, getDefaultChat)
			: undefined;
		if (!anchor) {
			throw invalidInput('after must be a link to a nested session of `into`, or to its main session. Omit it to place the session at the end.');
		}
		if (isEqual(anchor, chat)) {
			throw invalidInput('after must name another session than the one that moves.');
		}
		after = anchor;
	}
	if (wholeSession) {
		return { operation: 'session', move: { kind: 'session', session, destination: into, after }, chat, self };
	}
	return {
		operation: isEqual(into, session) ? 'reorder' : 'move',
		move: { kind: 'chat', session, chat, destination: { kind: 'session', session: into, after } },
		chat,
		self,
	};
}

/** One actionable sentence for the model for each reason the host refuses a move. */
const refusalMessages: { readonly [K in AgentChatMoveRefusal]: string } = {
	[AgentChatMoveRefusal.Disabled]: 'Moving sessions is turned off; tell the user it needs the `chat.agentHost.moveChats.enabled` setting.',
	[AgentChatMoveRefusal.NotMovable]: 'This can\'t be moved: a main session, a subagent\'s chat or a hidden chat stays in its session; to move a whole session, pass its link without a chat id.',
	[AgentChatMoveRefusal.DestinationNotFound]: 'The destination session wasn\'t found, can\'t be opened, or is the session itself; check it with `list_sessions`.',
	[AgentChatMoveRefusal.InvalidAnchor]: '`after` must name another nested session or the main session of `into`; check it with `list_sessions`, or omit `after` to place it at the end.',
	[AgentChatMoveRefusal.DifferentProvider]: 'Sessions only move between sessions of the same agent; pick a destination session that uses the same agent.',
	[AgentChatMoveRefusal.SessionArchived]: 'One of the sessions is archived; ask the user to unarchive it first.',
	[AgentChatMoveRefusal.SessionNotReady]: 'One of the sessions isn\'t ready yet; wait until its current setup or first message finishes, then try again.',
	[AgentChatMoveRefusal.SessionQuarantined]: 'One of the sessions is changing its workspace or can\'t run turns; try again after that finishes.',
	[AgentChatMoveRefusal.ConversionInProgress]: 'This nested session is changing its workspace; try again after that finishes.',
	[AgentChatMoveRefusal.WorktreeFolder]: 'This nested session works in its own worktree that a nested session staying behind also uses; move that one too, or leave both.',
	[AgentChatMoveRefusal.Workspaceless]: 'This can\'t be moved: its folder is also used by a nested session that stays behind, or it has no folder; move those nested sessions too, or leave this one.',
	[AgentChatMoveRefusal.AgentMergeOwner]: 'This runs Agent Merge for a folder of its session; ask the user to turn Agent Merge off first.',
	[AgentChatMoveRefusal.DestinationSingleFolder]: 'The destination\'s agent supports one folder per session and this works in another folder; pick a destination in the same folder.',
	[AgentChatMoveRefusal.LegacyCatalog]: 'One of the sessions can\'t be reorganized right now because its nested sessions can\'t be verified; try again later.',
	[AgentChatMoveRefusal.Conflict]: 'The sessions changed while moving; check them with `list_sessions` and try again.',
	[AgentChatMoveRefusal.Unsupported]: 'This nested session has no conversation of its own yet, so it can\'t become its own session.',
	[AgentChatMoveRefusal.NotSingleChat]: 'This session has nested sessions; move them out first, or move each nested session on its own.',
	[AgentChatMoveRefusal.NotStarted]: 'This nested session has no messages yet; it can become its own session after its first message.',
	[AgentChatMoveRefusal.DifferentCredentialOwner]: 'Sessions with different credential owners can\'t be combined; pick a destination that uses the same account, or move it to its own session.',
};

/** For a whole session, `notMovable` means it isn't a session of its own anymore or couldn't be opened, not the reasons a nested session stays. */
const sessionNotMovableMessage = 'This session can\'t be moved: it couldn\'t be opened or is no longer a session of its own; check it with `list_sessions` and try again.';

/** The model-facing message for a refused move; `wholeSession` when it moves a whole session. */
export function getMoveRefusalMessage(reason: AgentChatMoveRefusal, wholeSession: boolean): string {
	return `Cannot move: ${wholeSession && reason === AgentChatMoveRefusal.NotMovable ? sessionNotMovableMessage : refusalMessages[reason]}`;
}

/**
 * Turns a host refusal into the model-facing error. An anchor the tool chose itself (`end`) that is gone by the time
 * the move runs means the destination changed meanwhile, not that the model passed a wrong `after`.
 */
function toMoveToolError(error: unknown, move: ISessionServerToolMove): unknown {
	if (!(error instanceof AgentChatMoveRefusedError)) {
		return error;
	}
	const after = move.kind === 'session' ? move.after : move.destination.kind === 'session' ? move.destination.after : undefined;
	const reason = error.reason === AgentChatMoveRefusal.InvalidAnchor && after === 'end' ? AgentChatMoveRefusal.Conflict : error.reason;
	return new Error(getMoveRefusalMessage(reason, move.kind === 'session'));
}

const scheduledMoveResultPrefix = 'This chat will be';

/** Builds the model-facing `move_session` result. */
export function formatMoveSessionResult(args: IResolvedMoveSessionArgs, session: URI): string {
	switch (args.operation) {
		case 'reorder':
			return `Nested session reordered in its session (${buildOpenSessionLinkUri(session, getAgentHostChatId(args.chat))}).`;
		case 'move':
			return `Nested session moved into ${buildOpenSessionLinkUri(session)} (${buildOpenSessionLinkUri(session, getAgentHostChatId(args.chat))}).`;
		case 'promote':
			return `Nested session moved to its own session (${buildOpenSessionLinkUri(session)}).`;
		case 'session':
			return `Session moved into ${buildOpenSessionLinkUri(session)} as a nested session (${buildOpenSessionLinkUri(session, getAgentHostChatId(args.chat))}).`;
	}
}

/** Builds the model-facing result of a move of the calling chat, which waits for the end of its turn. */
export function formatScheduledMoveSessionResult(args: IResolvedMoveSessionArgs): string {
	const destination = args.move.kind === 'session' ? args.move.destination : args.move.destination.kind === 'session' ? args.move.destination.session : undefined;
	const what = args.operation === 'promote'
		? 'moved to its own session'
		: args.operation === 'reorder'
			? 'reordered in its session'
			: `moved into ${buildOpenSessionLinkUri(destination!)}`;
	return `${scheduledMoveResultPrefix} ${what} when this turn ends. Make this your final tool call: reply with one short sentence, then end the turn. Do not call ${SessionServerToolName.MoveSession} again for this chat.`;
}

/** The operation a call's arguments describe, read from the arguments alone for display. */
function getDisplayedOperation(args: unknown): { readonly operation: MoveSessionOperation | undefined; readonly self: boolean } {
	if (args === undefined || args === null || typeof args !== 'object') {
		return { operation: undefined, self: false };
	}
	const input = args as IMoveSessionArgs;
	const self = input.session === undefined;
	if (input.relationship === 'independent') {
		return { operation: 'promote', self };
	}
	if (typeof input.session !== 'string') {
		return { operation: undefined, self };
	}
	if (parseOpenSessionLinkChatId(input.session) === undefined) {
		return { operation: 'session', self };
	}
	const session = parseOpenSessionLinkUri(input.session)?.toString();
	const into = typeof input.into === 'string' ? parseOpenSessionLinkUri(input.into)?.toString() ?? input.into : undefined;
	return { operation: session !== undefined && session === into ? 'reorder' : 'move', self };
}

/** Whether the host knows the session, and with a chat id the chat of it, that a link names (see `isKnownSessionLink`). */
type KnownSessionLinkCheck = (session: URI, chatId: string | undefined) => boolean;

/**
 * A Markdown link to the session or nested session a `move_session` argument names, labeled {@link label}. The link
 * is rebuilt from the parsed session and chat id, and only for one {@link isKnown} confirms; anything else shows the
 * label alone.
 */
function linkTo(label: string, input: unknown, isKnown: KnownSessionLinkCheck): string {
	if (typeof input !== 'string') {
		return label;
	}
	let link: string | undefined;
	try {
		const session = parseOpenSessionLinkUri(input) ?? URI.parse(input, true);
		// A chat URI names no session: it is shown as the label alone.
		const chatId = parseOpenSessionLinkChatId(input);
		link = session.scheme && session.scheme !== AGENT_HOST_SESSION_LINK_SCHEME && !isAhpChatChannel(session.toString()) && isKnown(session, chatId) ? buildOpenSessionLinkUri(session, chatId) : undefined;
	} catch {
		link = undefined;
	}
	return link ? `[${label}](<${link.replace(/[<>]/g, encodeURIComponent)}>)` : label;
}

function getMoveSessionDisplay(args: unknown, result: IServerToolDisplayResult | undefined, isKnown: KnownSessionLinkCheck): IServerToolDisplay {
	const { operation, self } = getDisplayedOperation(args);
	const input = (args !== null && typeof args === 'object' ? args : {}) as IMoveSessionArgs;
	const scheduled = result?.success === true && result.text?.startsWith(scheduledMoveResultPrefix) === true;
	const scheduledPastTense = localize('toolComplete.moveSession.scheduled', "Scheduled move");
	const into = linkTo(localize('toolConfirm.moveSession.destination', "the destination session"), input.into, isKnown);
	if (self) {
		const promote = operation === 'promote';
		return {
			displayName: localize('toolName.moveSession', "Move Session"),
			invocationMessage: localize('toolInvoke.moveSession.self', "Scheduling a move of this chat"),
			pastTenseMessage: scheduled ? scheduledPastTense : localize('toolComplete.moveSession.self', "Processed move of this chat"),
			confirmationTitle: promote ? localize('toolConfirm.moveSession.self.promote.title', "Move This Chat to Its Own Session?") : localize('toolConfirm.moveSession.self.title', "Move This Chat?"),
			confirmationMessage: {
				markdown: promote
					? localize('toolConfirm.moveSession.self.promote', "Make this chat its own session when this turn ends? It keeps its history and folders.")
					: localize('toolConfirm.moveSession.self', "Move this chat into {0} when this turn ends? It keeps its history and folders.", into),
			},
			hideConfirmationInput: true,
		};
	}
	const nested = linkTo(localize('toolConfirm.moveSession.nested', "this nested session"), input.session, isKnown);
	switch (operation) {
		case 'reorder':
			return {
				displayName: localize('toolName.moveSession', "Move Session"),
				invocationMessage: localize('toolInvoke.moveSession.reorder', "Reordering nested session"),
				pastTenseMessage: localize('toolComplete.moveSession.reorder', "Reordered nested session"),
				confirmationTitle: localize('toolConfirm.moveSession.reorder.title', "Reorder Nested Session?"),
				confirmationMessage: { markdown: localize('toolConfirm.moveSession.reorder', "Move {0} to a new position in its session?", nested) },
				hideConfirmationInput: true,
			};
		case 'move':
			return {
				displayName: localize('toolName.moveSession', "Move Session"),
				invocationMessage: localize('toolInvoke.moveSession.move', "Moving nested session"),
				pastTenseMessage: localize('toolComplete.moveSession.move', "Moved nested session"),
				confirmationTitle: localize('toolConfirm.moveSession.move.title', "Move Nested Session?"),
				confirmationMessage: { markdown: localize('toolConfirm.moveSession.move', "Move {0} into {1}? It keeps its history and folders.", nested, into) },
				hideConfirmationInput: true,
			};
		case 'promote':
			return {
				displayName: localize('toolName.moveSession', "Move Session"),
				invocationMessage: localize('toolInvoke.moveSession.promote', "Moving nested session to its own session"),
				pastTenseMessage: localize('toolComplete.moveSession.promote', "Moved nested session to its own session"),
				confirmationTitle: localize('toolConfirm.moveSession.promote.title', "Move to Its Own Session?"),
				confirmationMessage: { markdown: localize('toolConfirm.moveSession.promote', "Make {0} its own session? It keeps its history and folders.", nested) },
				hideConfirmationInput: true,
			};
		case 'session':
			return {
				displayName: localize('toolName.moveSession', "Move Session"),
				invocationMessage: localize('toolInvoke.moveSession.session', "Moving session"),
				pastTenseMessage: localize('toolComplete.moveSession.session', "Moved session"),
				confirmationTitle: localize('toolConfirm.moveSession.session.title', "Move Session?"),
				confirmationMessage: { markdown: localize('toolConfirm.moveSession.session', "Move {0} into {1} as a nested session? It keeps its history and folders.", linkTo(localize('toolConfirm.moveSession.wholeSession', "this session"), input.session, isKnown), into) },
				hideConfirmationInput: true,
			};
		default:
			return {
				displayName: localize('toolName.moveSession', "Move Session"),
				invocationMessage: localize('toolInvoke.moveSession', "Moving session"),
				pastTenseMessage: localize('toolComplete.moveSession', "Processed session move"),
				confirmationTitle: localize('toolConfirm.moveSession.title', "Move Session?"),
				confirmationMessage: localize('toolConfirm.moveSession', "Move this session?"),
			};
	}
}

/**
 * How `move_session` is displayed where no host runs it (restored history): with nothing to check links against, it
 * names sessions without links.
 */
export const moveSessionToolDisplay: IServerToolDisplaySource = {
	definitions: [moveSessionToolDefinition],
	getDisplay: (_toolName, args, result) => getMoveSessionDisplay(args, result, () => false),
};

/**
 * Creates the `move_session` server-tool group. It is a group of its own, never materialized, so that its tool follows
 * the `chatMoves.enabled` setting on every read: with the setting off it adds nothing to any tool list.
 */
export function createSessionMoveToolGroup(accessor: ISessionServerToolAccessor, areAgentOrchestrationLimitsEnabled: () => boolean): IServerToolGroup {
	let movedSessionCount = 0;
	return {
		definitions: moveSessionToolDisplay.definitions,
		// Confirmations link only sessions and chats the host knows.
		getDisplay: (_toolName, args, result) => getMoveSessionDisplay(args, result, (session, chatId) => accessor.isKnownSessionLink(session, chatId)),
		isEnabled: toolName => toolName === SessionServerToolName.MoveSession && accessor.isChatMoveEnabled(),
		isEnabledForSession: (_toolName, sessionUri) => accessor.supportsChatMoves(URI.parse(sessionUri)),
		canRequireConfirmation: toolName => sessionToolRequiresConfirmation(toolName),
		async execute(_stateManager, context, _toolName, rawArgs): Promise<string> {
			if (!accessor.isChatMoveEnabled()) {
				throw new Error(getMoveRefusalMessage(AgentChatMoveRefusal.Disabled, false));
			}
			if (areAgentOrchestrationLimitsEnabled() && movedSessionCount >= maxMovedSessions) {
				throw new Error(`Refusing to move more than ${maxMovedSessions} sessions from server tools in this process.`);
			}
			// Reserved before any await, so concurrent calls can't pass the limit together; released when the move doesn't happen.
			movedSessionCount++;
			let moved = false;
			try {
				const currentChat = isAhpChatChannel(context.chatUri) ? context.chatUri : undefined;
				const args = await getMoveSessionArgs(rawArgs, createMoveSessionLookup(() => accessor.listSessions()), currentChat, chat => accessor.getChatOwner(chat), session => accessor.getDefaultChat(session));
				try {
					if (args.self) {
						if (!context.turnId) {
							throw new Error(`${SessionServerToolName.MoveSession} must run from an active chat turn to move the chat it runs in.`);
						}
						await accessor.checkChatMove(args.move);
						accessor.scheduleChatMove(currentChat!, context.turnId, args.move);
						moved = true;
						return formatScheduledMoveSessionResult(args);
					}
					const session = await accessor.applyChatMove(args.move);
					moved = true;
					return formatMoveSessionResult(args, session);
				} catch (error) {
					throw toMoveToolError(error, args.move);
				}
			} finally {
				if (!moved) {
					movedSessionCount--;
				}
			}
		},
	};
}
