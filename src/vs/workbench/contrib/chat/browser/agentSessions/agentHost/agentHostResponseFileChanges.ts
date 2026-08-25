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
import { buildTurnChangesetUri, ChangesetKind } from '../../../../../../platform/agentHost/common/changesetUri.js';
import { normalizeFileEdit } from '../../../../../../platform/agentHost/common/fileEditDiff.js';
import { toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import {
	buildDefaultChatUri,
	ChangesetStatus,
	FileEditKind,
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
import { IChatResponseFileChangesProvider, IChatResponseFileEdit } from '../../chatResponseFileChangesService.js';

const SUBSCRIPTION_OWNER = 'AgentHostResponseFileChangesProvider';
const REQUEST_CACHE_CAPACITY = 1000;

/**
 * Where a turn's diffs came from, for tracing. `retained` means every source
 * was momentarily empty and the previous result was kept instead.
 */
type TurnDiffSource = 'unsupported' | 'changeset' | 'authoritativeEmpty' | 'response' | 'retained';

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
			obs = this._createFileEditDiffsObservable(backendSession, backendChat, requestId);
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
			if (!turnChangesetUriObs.read(reader)) {
				return select('unsupported', retained);
			}

			const changesetState = changesetStateObs.read(reader).read(reader);
			const changeset = changesetState instanceof Error ? undefined : changesetState;
			const changesetDiffs = changeset?.files
				.map(file => this._changesetFileToEntryDiff(file))
				.filter(isDefined);
			if (changesetDiffs?.length) {
				return select('changeset', changesetDiffs, changeset?.status);
			}
			if (changeset?.status === ChangesetStatus.Ready && retained.length === 0) {
				return select('authoritativeEmpty', [], changeset.status);
			}

			const responseDiffs = responseFileEditsObs.read(reader);
			return responseDiffs.length
				? select('response', responseDiffs, changeset?.status)
				: select('retained', retained, changeset?.status);
		});
	}

	private _createFileEditDiffsObservable(backendSession: URI, backendChat: URI | undefined, requestId: string): IObservable<readonly IChatResponseFileEdit[]> {
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
			return [];
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

	private _responsePartsToEntryDiffs(responseParts: readonly ResponsePart[], workspaceRoots: readonly URI[]): IChatResponseFileEdit[] {
		const byUri = new Map<string, IChatResponseFileEdit>();
		for (const responsePart of responseParts) {
			if (responsePart.kind !== ResponsePartKind.ToolCall) {
				continue;
			}
			for (const fileEdit of getToolCallFileEdits(responsePart.toolCall)) {
				const diff = this._fileEditToEntryDiff(fileEdit, workspaceRoots);
				if (!diff) {
					continue;
				}
				const key = getComparisonKey(diff.modifiedURI);
				const existing = byUri.get(key);
				if (existing) {
					existing.added += diff.added;
					existing.removed += diff.removed;
				} else {
					byUri.set(key, diff);
				}
			}
		}
		return [...byUri.values()];
	}

	private _fileEditToEntryDiff(fileEdit: ISessionFileDiff, workspaceRoots: readonly URI[]): IChatResponseFileEdit | undefined {
		const normalized = normalizeFileEdit(fileEdit);
		if (!normalized || !normalized.afterUri) {
			return undefined;
		}
		const afterUri = normalized.afterUri;

		const modifiedURI = toAgentHostUri(afterUri, this._connectionAuthority);
		const originalURI = normalized.kind === FileEditKind.Create || !normalized.beforeContentUri
			? modifiedURI
			: toAgentHostUri(normalized.beforeContentUri, this._connectionAuthority);
		const modifiedSnapshotURI = normalized.afterContentUri
			? toAgentHostUri(normalized.afterContentUri, this._connectionAuthority)
			: undefined;

		return {
			originalURI,
			modifiedURI,
			modifiedSnapshotURI,
			added: fileEdit.diff?.added ?? 0,
			removed: fileEdit.diff?.removed ?? 0,
			quitEarly: false,
			identical: false,
			isFinal: true,
			isBusy: false,
			isOutsideWorkspace: !workspaceRoots.some(root => isEqualOrParent(afterUri, root)),
		};
	}

	private _changesetFileToEntryDiff(file: ChangesetFile): IEditSessionEntryDiff | undefined {
		const normalized = normalizeFileEdit(file.edit);
		if (!normalized) {
			return undefined;
		}

		const modifiedURI = toAgentHostUri(normalized.resource, this._connectionAuthority);
		// For creates there is no before-content; fall back to the modified URI
		// so the entry still resolves. The collapsed summary uses the
		// server-provided counts below, so its +/- numbers stay correct
		// regardless; only an explicitly-opened diff of a created file shows no
		// delta.
		const originalURI = normalized.beforeContentUri
			? toAgentHostUri(normalized.beforeContentUri, this._connectionAuthority)
			: modifiedURI;

		// The frozen after-turn snapshot, when the changeset provides one. Lets
		// consumers show this turn's diff (before-snapshot -> after-snapshot)
		// rather than before-snapshot -> live file (which includes later turns).
		// Distinct from the checkpoint-ref readability fix (#323932): that made
		// these blobs readable; this line decides *which* snapshot to diff against.
		const modifiedSnapshotURI = normalized.afterContentUri
			? toAgentHostUri(normalized.afterContentUri, this._connectionAuthority)
			: undefined;

		return {
			originalURI,
			modifiedURI,
			modifiedSnapshotURI,
			isDeleted: normalized.kind === FileEditKind.Delete,
			added: file.edit.diff?.added ?? 0,
			removed: file.edit.diff?.removed ?? 0,
			quitEarly: false,
			identical: false,
			isFinal: true,
			isBusy: false,
		};
	}
}
