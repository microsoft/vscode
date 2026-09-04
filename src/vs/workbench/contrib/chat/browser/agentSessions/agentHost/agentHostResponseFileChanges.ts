/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { LRUCache } from '../../../../../../base/common/map.js';
import { constObservable, derived, derivedObservableWithCache, derivedOpts, IObservable, mapObservableArrayCached, observableFromEvent } from '../../../../../../base/common/observable.js';
import { getComparisonKey, isEqual, isEqualOrParent } from '../../../../../../base/common/resources.js';
import { isDefined } from '../../../../../../base/common/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { buildBranchChangesetUri, buildTurnChangesetUri, ChangesetKind } from '../../../../../../platform/agentHost/common/changesetUri.js';
import { normalizeFileEdit } from '../../../../../../platform/agentHost/common/fileEditDiff.js';
import { toAgentHostContentUri, toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import {
	buildDefaultChatUri,
	ChangesetStatus,
	FileEditKind,
	readSessionEhcliLastMigratedTurn,
	ResponsePartKind,
	StateComponents,
	ToolCallStatus,
	ToolResultContentType,
	type ChangesetFile,
	type ChangesetState,
	type ChatState,
	type ISessionFileDiff,
	type ResponsePart,
	type SessionState,
	type ToolCallState
} from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IEditSessionEntryDiff } from '../../../common/editing/chatEditingService.js';
import { AUTHORITATIVE_EMPTY_CHAT_RESPONSE_FILE_CHANGES, IChatResponseFileChangesProvider, IChatResponseFileEdit } from '../../chatResponseFileChangesService.js';

const SUBSCRIPTION_OWNER = 'AgentHostResponseFileChangesProvider';
const REQUEST_CACHE_CAPACITY = 1000;

/**
 * Where a turn's diffs came from, for tracing. `retained` means every source
 * was momentarily empty and the previous result was kept instead.
 */
type TurnDiffSource = 'unsupported' | 'loading' | 'changeset' | 'authoritativeEmpty' | 'response' | 'branchFallback' | 'retained';

interface IResponseFileEdits {
	readonly diffs: readonly IChatResponseFileEdit[];
	readonly hasValidEdits: boolean;
}

const EMPTY_RESPONSE_FILE_EDITS: IResponseFileEdits = { diffs: [], hasValidEdits: false };

function uriArrayEquals(a: readonly URI[], b: readonly URI[]): boolean {
	return a.length === b.length && a.every((uri, index) => isEqual(uri, b[index]));
}

function getToolCallFileEdits(toolCall: ToolCallState): ISessionFileDiff[] {
	const edits: ISessionFileDiff[] = [];
	if (toolCall.status === ToolCallStatus.Running
		|| toolCall.status === ToolCallStatus.Completed
		|| toolCall.status === ToolCallStatus.PendingResultConfirmation) {
		for (const content of toolCall.content ?? []) {
			if (content.type === ToolResultContentType.FileEdit) {
				edits.push(content);
			}
		}
	} else if (toolCall.status === ToolCallStatus.PendingConfirmation) {
		edits.push(...(toolCall.edits?.items ?? []));
	}
	return edits;
}

/** Maps one Agent Host changeset file into the diff shape used by chat editors. */
export function agentHostChangesetFileToEntryDiff(file: ChangesetFile, connectionAuthority: string): IEditSessionEntryDiff | undefined {
	const normalized = normalizeFileEdit(file.edit);
	if (!normalized) {
		return undefined;
	}

	const modifiedURI = toAgentHostUri(normalized.resource, connectionAuthority);
	const originalURI = normalized.beforeContentUri
		? toAgentHostContentUri(normalized.beforeContentUri, connectionAuthority)
		: modifiedURI;
	const modifiedSnapshotURI = normalized.afterContentUri
		? toAgentHostContentUri(normalized.afterContentUri, connectionAuthority)
		: undefined;

	return {
		originalURI,
		modifiedURI,
		modifiedSnapshotURI,
		isCreated: normalized.kind === FileEditKind.Create,
		isDeleted: normalized.kind === FileEditKind.Delete,
		added: file.edit.diff?.added ?? 0,
		removed: file.edit.diff?.removed ?? 0,
		quitEarly: false,
		identical: false,
		isFinal: true,
		isBusy: false,
	};
}

/**
 * Supplies the chat "Changed N files" summary for agent host responses from the
 * authoritative per-turn changeset the host computes server-side (the same
 * source backing the Agents-app Changes view), rather than from the chat
 * editing session.
 *
 * For each `(sessionResource, requestId)` it subscribes to the session's
 * per-turn changeset — `requestId` is the agent host turn id — and maps its
 * files into {@link IEditSessionEntryDiff} entries. Subscriptions are acquired
 * lazily inside the returned observable (so they exist only while a summary is
 * actually observing the diffs) and the per-request observables are memoized so
 * repeated lookups share one subscription.
 *
 * The per-request diffs are monotonic: a turn that has reported changes keeps
 * them, because every recompute, resubscribe and reconnect passes through a
 * window where the client can see no files and consumers hide themselves when
 * a turn reports nothing.
 */
export class AgentHostResponseFileChangesProvider extends Disposable implements IChatResponseFileChangesProvider {

	private readonly _perRequest = new LRUCache<string, IObservable<readonly IEditSessionEntryDiff[]>>(REQUEST_CACHE_CAPACITY);
	private readonly _perRequestFileEdits = new LRUCache<string, IObservable<readonly IChatResponseFileEdit[]>>(REQUEST_CACHE_CAPACITY);

	constructor(
		private readonly _connection: IAgentConnection,
		private readonly _connectionAuthority: string,
		private readonly _resolveBackendSession: (sessionResource: URI) => URI | undefined,
		private readonly _resolveBackendChat: ((sessionResource: URI) => URI | undefined) | undefined,
		private readonly _logService: ILogService,
	) {
		super();
	}

	getChangesForRequest(sessionResource: URI, requestId: string): IObservable<readonly IEditSessionEntryDiff[]> | undefined {
		const backendSession = this._resolveBackendSession(sessionResource);
		if (!backendSession || !requestId) {
			return undefined;
		}

		const backendChat = this._resolveBackendChat?.(sessionResource);
		const key = `${backendSession.toString()}\0${backendChat?.toString() ?? ''}\0${requestId}`;
		let obs = this._perRequest.get(key);
		if (!obs) {
			obs = this._createDiffsObservable(backendSession, backendChat, requestId);
			this._perRequest.set(key, obs);
		}
		return obs;
	}

	getFileEditsForRequest(sessionResource: URI, requestId: string): IObservable<readonly IChatResponseFileEdit[]> | undefined {
		const backendSession = this._resolveBackendSession(sessionResource);
		if (!backendSession || !requestId) {
			return undefined;
		}

		const backendChat = this._resolveBackendChat?.(sessionResource);
		const key = `${backendSession.toString()}\0${backendChat?.toString() ?? ''}\0${requestId}`;
		let obs = this._perRequestFileEdits.get(key);
		if (!obs) {
			const fileEdits = this._createFileEditDiffsObservable(backendSession, backendChat, requestId);
			obs = derived(reader => fileEdits.read(reader).diffs);
			this._perRequestFileEdits.set(key, obs);
		}
		return obs;
	}

	private _createDiffsObservable(backendSession: URI, backendChat: URI | undefined, requestId: string): IObservable<readonly IEditSessionEntryDiff[]> {
		// Resolve the per-turn changeset URI, but only when the agent actually
		// advertises a `turn` changeset in its catalogue. Agents that don't
		// support per-turn changesets never produce a turn-changeset URI, so
		// the summary stays empty (and self-hidden) for them.
		const sessionStateObs = this._subscribe<SessionState>(StateComponents.Session, constObservable(backendSession));

		const turnChangesetUriObs = derivedOpts<URI | undefined>({ equalsFn: isEqual }, reader => {
			const sessionState = sessionStateObs.read(reader).read(reader);
			if (!sessionState || sessionState instanceof Error) {
				return undefined;
			}
			const supportsTurnChangeset = sessionState.changesets?.some(c => c.changeKind === ChangesetKind.Turn);
			if (!supportsTurnChangeset) {
				return undefined;
			}
			return URI.parse(buildTurnChangesetUri(backendSession.toString(), requestId));
		});

		const changesetStateObs = this._subscribe<ChangesetState>(StateComponents.Changeset, turnChangesetUriObs);
		const responseFileEditsObs = this._createFileEditDiffsObservable(backendSession, backendChat, requestId);
		const defaultChatUri = URI.parse(buildDefaultChatUri(backendSession.toString()));
		const isPeerChat = backendChat !== undefined && !isEqual(backendChat, defaultChatUri);
		// Migrated legacy Copilot CLI sessions have no per-turn checkpoints, so
		// their turn changeset is always empty even when the session committed
		// real work on its branch. Fall back to the session-wide branch changeset
		// (the same source the Agents window shows) so those changes surface in
		// the chat editor too. Strictly scoped to adopted sessions' latest turn,
		// so native sessions and earlier turns are completely unaffected (#333642).
		const branchFallbackObs = this._createBranchFallbackDiffsObservable(backendSession, requestId);

		let lastSource: TurnDiffSource | undefined;
		const select = (source: TurnDiffSource, diffs: readonly IEditSessionEntryDiff[], status?: ChangesetStatus): readonly IEditSessionEntryDiff[] => {
			if (source !== lastSource) {
				lastSource = source;
				this._logService.trace(`[AgentHostResponseFileChanges] ${backendSession.toString()} turn ${requestId}: diffs from '${source}' (files=${diffs.length}, changesetStatus=${status ?? 'none'})`);
			}
			return diffs;
		};

		// Recomputes restart from `{ status: Computing, files: [] }`, so an empty
		// changeset only means "this turn changed nothing" while `Ready` and
		// before anything has been shown.
		return derivedObservableWithCache<readonly IEditSessionEntryDiff[]>(this, (reader, lastValue) => {
			const retained = lastValue ?? [];

			const turnUri = turnChangesetUriObs.read(reader);
			const changesetState = turnUri ? changesetStateObs.read(reader).read(reader) : undefined;
			const changeset = changesetState instanceof Error ? undefined : changesetState;
			const changesetDiffs = changeset?.files
				.map(file => agentHostChangesetFileToEntryDiff(file, this._connectionAuthority))
				.filter(isDefined);
			// A non-empty per-turn changeset is always authoritative (e.g. a turn
			// added after migration, which does have checkpoints), so it takes
			// precedence over the branch fallback.
			if (changesetDiffs?.length) {
				return select('changeset', changesetDiffs, changeset?.status);
			}

			// The per-turn sources produced nothing. For a migrated session's
			// latest turn the session-wide branch changeset carries the committed
			// work; `branchFallbackObs` is empty for every non-adopted case, so the
			// remaining branches below stay byte-for-byte identical for native
			// sessions.
			const branchDiffs = branchFallbackObs.read(reader);
			if (branchDiffs.length) {
				return select('branchFallback', branchDiffs, changeset?.status);
			}

			if (!turnUri) {
				return select('unsupported', retained);
			}
			if (changeset?.status === ChangesetStatus.Ready && retained.length === 0) {
				return select('authoritativeEmpty', AUTHORITATIVE_EMPTY_CHAT_RESPONSE_FILE_CHANGES, changeset.status);
			}
			// Default chats wait for their checkpoint so restored response edits never flash different stats.
			if (!isPeerChat && (changesetState === undefined || changeset?.status === ChangesetStatus.Computing)) {
				return select('loading', retained, changeset?.status);
			}

			const responseFileEdits = responseFileEditsObs.read(reader);
			return responseFileEdits.hasValidEdits
				? select('response', responseFileEdits.diffs.length > 0 ? responseFileEdits.diffs : AUTHORITATIVE_EMPTY_CHAT_RESPONSE_FILE_CHANGES, changeset?.status)
				: select('retained', retained, changeset?.status);
		});
	}

	/**
	 * The session-wide branch changeset, exposed as a per-turn fallback but only
	 * for the specific turn recorded as an adopted legacy Copilot CLI session's
	 * final migrated turn. That turn has no per-turn checkpoint, so without this
	 * its committed-on-branch work never appears in the chat editor (#333642).
	 * Every other case — native sessions, earlier turns, and any turn added after
	 * adoption (which has its own real per-turn changeset) — yields an empty list,
	 * so this never alters the changes shown for those turns.
	 */
	private _createBranchFallbackDiffsObservable(backendSession: URI, requestId: string): IObservable<readonly IEditSessionEntryDiff[]> {
		const sessionStateObs = this._subscribe<SessionState>(StateComponents.Session, constObservable(backendSession));

		const branchChangesetUriObs = derivedOpts<URI | undefined>({ equalsFn: isEqual }, reader => {
			const sessionState = sessionStateObs.read(reader).read(reader);
			if (!sessionState || sessionState instanceof Error) {
				return undefined;
			}
			// Gate on the durable migration boundary rather than "latest turn": a
			// post-adoption no-op turn is also an authoritatively-empty latest turn,
			// and must show its own (empty) changes, not the historical aggregate.
			if (readSessionEhcliLastMigratedTurn(sessionState._meta) !== requestId) {
				return undefined;
			}
			return URI.parse(buildBranchChangesetUri(backendSession.toString()));
		});

		const branchChangesetStateObs = this._subscribe<ChangesetState>(StateComponents.Changeset, branchChangesetUriObs);

		return derived(reader => {
			if (!branchChangesetUriObs.read(reader)) {
				return [];
			}
			const state = branchChangesetStateObs.read(reader).read(reader);
			const changeset = state instanceof Error ? undefined : state;
			return changeset?.files
				.map(file => agentHostChangesetFileToEntryDiff(file, this._connectionAuthority))
				.filter(isDefined) ?? [];
		});
	}

	private _createFileEditDiffsObservable(backendSession: URI, backendChat: URI | undefined, requestId: string): IObservable<IResponseFileEdits> {
		const sessionStateObs = this._subscribe<SessionState>(StateComponents.Session, constObservable(backendSession));
		const defaultChatUri = URI.parse(buildDefaultChatUri(backendSession.toString()));

		const chatUrisObs = derivedOpts<readonly URI[]>({ equalsFn: uriArrayEquals }, reader => {
			if (backendChat) {
				return [backendChat];
			}
			const sessionState = sessionStateObs.read(reader).read(reader);
			if (!sessionState || sessionState instanceof Error) {
				return [defaultChatUri];
			}

			const uris = new Map<string, URI>();
			uris.set(defaultChatUri.toString(), defaultChatUri);
			for (const chat of sessionState.chats ?? []) {
				const uri = URI.parse(chat.resource);
				uris.set(uri.toString(), uri);
			}
			return [...uris.values()];
		});

		const chatStateObs = mapObservableArrayCached(this, chatUrisObs, chatUri => {
			const obs = this._subscribe<ChatState>(StateComponents.Chat, constObservable(chatUri));
			return derived(reader => obs.read(reader).read(reader));
		}, chatUri => chatUri.toString());

		return derived(reader => {
			const sessionState = sessionStateObs.read(reader).read(reader);
			const workspaceRoots: URI[] = [];
			if (sessionState && !(sessionState instanceof Error)) {
				const roots = new Map<string, URI>();
				for (const root of [sessionState.project?.uri, ...(sessionState.workingDirectories ?? [])]) {
					if (root) {
						const uri = URI.parse(root);
						roots.set(uri.toString(), uri);
					}
				}
				workspaceRoots.push(...roots.values());
			}
			for (const obs of chatStateObs.read(reader)) {
				const chatState = obs.read(reader);
				if (!chatState || chatState instanceof Error) {
					continue;
				}
				const turn = chatState.activeTurn?.id === requestId
					? chatState.activeTurn
					: chatState.turns.find(turn => turn.id === requestId);
				if (turn) {
					return this._responsePartsToEntryDiffs(turn.responseParts, workspaceRoots);
				}
			}
			return EMPTY_RESPONSE_FILE_EDITS;
		});
	}

	/**
	 * Builds a two-level observable that owns a refcounted subscription to
	 * `component` at the (observable) resource. The outer observable acquires
	 * the subscription against the current resource and releases it when the
	 * resource changes or no one observes; the inner observable tracks the
	 * subscription's value.
	 */
	private _subscribe<T>(component: StateComponents.Session | StateComponents.Changeset | StateComponents.Chat, resourceObs: IObservable<URI | undefined>): IObservable<IObservable<T | Error | undefined>> {
		return derived(reader => {
			const resource = resourceObs.read(reader);
			if (!resource) {
				return constObservable(undefined);
			}
			const subscriptionRef = reader.store.add(this._connection.getSubscription(component, resource, SUBSCRIPTION_OWNER));
			return observableFromEvent(this, subscriptionRef.object.onDidChange, () => subscriptionRef.object.value as T | Error | undefined);
		});
	}

	private _responsePartsToEntryDiffs(responseParts: readonly ResponsePart[], workspaceRoots: readonly URI[]): IResponseFileEdits {
		const byUri = new Map<string, IChatResponseFileEdit>();
		let hasValidEdits = false;
		for (const responsePart of responseParts) {
			if (responsePart.kind !== ResponsePartKind.ToolCall) {
				continue;
			}
			for (const fileEdit of getToolCallFileEdits(responsePart.toolCall)) {
				const diff = this._fileEditToEntryDiff(fileEdit, workspaceRoots);
				if (!diff) {
					continue;
				}
				hasValidEdits = true;
				const key = getComparisonKey(diff.modifiedURI);
				const existing = byUri.get(key);
				if (existing) {
					existing.added += diff.added;
					existing.removed += diff.removed;
					existing.modifiedURI = diff.modifiedURI;
					existing.modifiedSnapshotURI = diff.modifiedSnapshotURI;
					existing.isDeleted = diff.isDeleted;
					// A file created and then deleted within the turn has no net diff to present.
					if (existing.isCreated && existing.isDeleted) {
						byUri.delete(key);
					}
				} else {
					byUri.set(key, diff);
				}
			}
		}
		return { diffs: [...byUri.values()], hasValidEdits };
	}

	private _fileEditToEntryDiff(fileEdit: ISessionFileDiff, workspaceRoots: readonly URI[]): IChatResponseFileEdit | undefined {
		const normalized = normalizeFileEdit(fileEdit);
		if (!normalized) {
			return undefined;
		}
		const resource = normalized.resource;

		const modifiedURI = toAgentHostUri(resource, this._connectionAuthority);
		const originalURI = normalized.kind === FileEditKind.Create || !normalized.beforeContentUri
			? modifiedURI
			: toAgentHostContentUri(normalized.beforeContentUri, this._connectionAuthority);
		const modifiedSnapshotURI = normalized.afterContentUri
			? toAgentHostContentUri(normalized.afterContentUri, this._connectionAuthority)
			: undefined;

		return {
			originalURI,
			modifiedURI,
			modifiedSnapshotURI,
			isCreated: normalized.kind === FileEditKind.Create,
			isDeleted: normalized.kind === FileEditKind.Delete,
			added: fileEdit.diff?.added ?? 0,
			removed: fileEdit.diff?.removed ?? 0,
			quitEarly: false,
			identical: false,
			isFinal: true,
			isBusy: false,
			isOutsideWorkspace: !workspaceRoots.some(root => isEqualOrParent(resource, root)),
		};
	}

}
