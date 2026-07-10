/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable, derived, derivedOpts, IObservable, mapObservableArrayCached, observableFromEvent } from '../../../../../../base/common/observable.js';
import { getComparisonKey, isEqual } from '../../../../../../base/common/resources.js';
import { isDefined } from '../../../../../../base/common/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { buildTurnChangesetUri, ChangesetKind } from '../../../../../../platform/agentHost/common/changesetUri.js';
import { normalizeFileEdit } from '../../../../../../platform/agentHost/common/fileEditDiff.js';
import { toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import {
	buildDefaultChatUri,
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
import { IEditSessionEntryDiff } from '../../../common/editing/chatEditingService.js';
import { IChatResponseFileChangesProvider } from '../../chatResponseFileChangesService.js';

const SUBSCRIPTION_OWNER = 'AgentHostResponseFileChangesProvider';

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
 */
export class AgentHostResponseFileChangesProvider extends Disposable implements IChatResponseFileChangesProvider {

	private readonly _perRequest = new Map<string, IObservable<readonly IEditSessionEntryDiff[]>>();
	private readonly _perRequestFileEdits = new Map<string, IObservable<readonly IEditSessionEntryDiff[]>>();

	constructor(
		private readonly _connection: IAgentConnection,
		private readonly _connectionAuthority: string,
		private readonly _resolveBackendSession: (sessionResource: URI) => URI | undefined,
	) {
		super();
	}

	getChangesForRequest(sessionResource: URI, requestId: string): IObservable<readonly IEditSessionEntryDiff[]> | undefined {
		const backendSession = this._resolveBackendSession(sessionResource);
		if (!backendSession || !requestId) {
			return undefined;
		}

		const key = `${backendSession.toString()}\0${requestId}`;
		let obs = this._perRequest.get(key);
		if (!obs) {
			obs = this._createDiffsObservable(backendSession, requestId);
			this._perRequest.set(key, obs);
		}
		return obs;
	}

	getFileEditsForRequest(sessionResource: URI, requestId: string): IObservable<readonly IEditSessionEntryDiff[]> | undefined {
		const backendSession = this._resolveBackendSession(sessionResource);
		if (!backendSession || !requestId) {
			return undefined;
		}

		const key = `${backendSession.toString()}\0${requestId}`;
		let obs = this._perRequestFileEdits.get(key);
		if (!obs) {
			obs = this._createFileEditDiffsObservable(backendSession, requestId);
			this._perRequestFileEdits.set(key, obs);
		}
		return obs;
	}

	private _createDiffsObservable(backendSession: URI, requestId: string): IObservable<readonly IEditSessionEntryDiff[]> {
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

		return derived(reader => {
			const changesetState = changesetStateObs.read(reader).read(reader);
			if (!changesetState || changesetState instanceof Error) {
				return [];
			}
			return changesetState.files
				.map(file => this._changesetFileToEntryDiff(file))
				.filter(isDefined);
		});
	}

	private _createFileEditDiffsObservable(backendSession: URI, requestId: string): IObservable<readonly IEditSessionEntryDiff[]> {
		const sessionStateObs = this._subscribe<SessionState>(StateComponents.Session, constObservable(backendSession));
		const defaultChatUri = URI.parse(buildDefaultChatUri(backendSession.toString()));

		const chatUrisObs = derivedOpts<readonly URI[]>({ equalsFn: uriArrayEquals }, reader => {
			const sessionState = sessionStateObs.read(reader).read(reader);
			if (!sessionState || sessionState instanceof Error) {
				return [defaultChatUri];
			}

			const uris = new Map<string, URI>();
			uris.set(defaultChatUri.toString(), defaultChatUri);
			for (const chat of sessionState.chats) {
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
			for (const obs of chatStateObs.read(reader)) {
				const chatState = obs.read(reader);
				if (!chatState || chatState instanceof Error) {
					continue;
				}
				const turn = chatState.activeTurn?.id === requestId
					? chatState.activeTurn
					: chatState.turns.find(turn => turn.id === requestId);
				if (turn) {
					return this._responsePartsToEntryDiffs(turn.responseParts);
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

	private _responsePartsToEntryDiffs(responseParts: readonly ResponsePart[]): IEditSessionEntryDiff[] {
		const byUri = new Map<string, IEditSessionEntryDiff>();
		for (const responsePart of responseParts) {
			if (responsePart.kind !== ResponsePartKind.ToolCall) {
				continue;
			}
			for (const fileEdit of getToolCallFileEdits(responsePart.toolCall)) {
				const diff = this._fileEditToEntryDiff(fileEdit);
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

	private _fileEditToEntryDiff(fileEdit: ISessionFileDiff): IEditSessionEntryDiff | undefined {
		const normalized = normalizeFileEdit(fileEdit);
		if (!normalized || !normalized.afterUri) {
			return undefined;
		}

		const modifiedURI = toAgentHostUri(normalized.afterUri, this._connectionAuthority);
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
			added: file.edit.diff?.added ?? 0,
			removed: file.edit.diff?.removed ?? 0,
			quitEarly: false,
			identical: false,
			isFinal: true,
			isBusy: false,
		};
	}
}
