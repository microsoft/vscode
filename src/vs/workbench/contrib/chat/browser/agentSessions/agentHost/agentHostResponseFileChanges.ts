/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { arrayEquals } from '../../../../../../base/common/equals.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { LRUCache } from '../../../../../../base/common/map.js';
import { constObservable, derived, derivedObservableWithCache, derivedOpts, IObservable, mapObservableArrayCached, observableFromEvent, observableSignal, observableValue, transaction } from '../../../../../../base/common/observable.js';
import { getComparisonKey, isEqual, isEqualOrParent } from '../../../../../../base/common/resources.js';
import { isDefined } from '../../../../../../base/common/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { buildBranchChangesetUri, buildTurnChangesetUri, ChangesetKind } from '../../../../../../platform/agentHost/common/changesetUri.js';
import { normalizeFileEdit } from '../../../../../../platform/agentHost/common/fileEditDiff.js';
import { toAgentHostContentUri, toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import {
	buildDefaultChatUri,
	ChangesetStatus,
	FileEditKind,
	isHostNoticeTurn,
	readSessionEhcliLastMigratedTurn,
	ResponsePartKind,
	StateComponents,
	ToolCallStatus,
	ToolResultContentType,
	type ActiveTurn,
	type ChangesetFile,
	type ChangesetState,
	type ComponentToState,
	type ISessionFileDiff,
	type SessionState,
	type ToolCallState,
	type Turn
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
type TurnDiffSource = 'unsupported' | 'changeset' | 'authoritativeEmpty' | 'hostNotice' | 'response' | 'branchFallback' | 'retained';

interface IResponseFileEdits {
	readonly diffs: readonly IChatResponseFileEdit[];
	readonly hasValidEdits: boolean;
}

interface IChatTurnSource {
	readonly turnsById: IObservable<ReadonlyMap<string, Turn>>;
	readonly activeTurnId: IObservable<string | undefined>;
	readonly activeTurn: IObservable<ActiveTurn | undefined>;
}

interface ISessionFileChangesSource {
	readonly state: IObservable<SessionState | Error | undefined>;
	readonly workspaceRoots: IObservable<readonly URI[]>;
	readonly chatUris: IObservable<readonly string[]>;
}

interface ISharedSource<T> {
	observe(): IObservable<T>;
}

const EMPTY_RESPONSE_FILE_EDITS: IResponseFileEdits = { diffs: [], hasValidEdits: false };

function isHostNotice(turn: Turn | ActiveTurn | undefined): boolean {
	return !!turn?.message?.origin && isHostNoticeTurn(turn);
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
	return changesetEditToEntryDiff(file.edit, connectionAuthority);
}

function changesetEditToEntryDiff(edit: ISessionFileDiff, connectionAuthority: string): IEditSessionEntryDiff | undefined {
	const normalized = normalizeFileEdit(edit);
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
		added: edit.diff?.added ?? 0,
		removed: edit.diff?.removed ?? 0,
		quitEarly: false,
		identical: false,
		isFinal: true,
		isBusy: false,
	};
}

/** Supplies per-response changes from lazy host changesets, retaining displayed diffs across recomputes and reconnects. */
export class AgentHostResponseFileChangesProvider extends Disposable implements IChatResponseFileChangesProvider {

	private readonly _perRequest = new LRUCache<string, IObservable<readonly IEditSessionEntryDiff[]>>(REQUEST_CACHE_CAPACITY);
	private readonly _perRequestFileEdits = new LRUCache<string, IObservable<readonly IChatResponseFileEdit[]>>(REQUEST_CACHE_CAPACITY);
	private readonly _sessionSources = new LRUCache<string, ISharedSource<ISessionFileChangesSource>>(REQUEST_CACHE_CAPACITY);
	private readonly _chatSources = new LRUCache<string, ISharedSource<IChatTurnSource>>(REQUEST_CACHE_CAPACITY);

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
			const source = this._getSessionSource(backendSession);
			const turn = this._createTurnObservable(source, backendChat, requestId);
			const fileEdits = this._createFileEditDiffsObservable(source, turn);
			obs = derived(reader => fileEdits.read(reader).diffs);
			this._perRequestFileEdits.set(key, obs);
		}
		return obs;
	}

	private _createDiffsObservable(backendSession: URI, backendChat: URI | undefined, requestId: string): IObservable<readonly IEditSessionEntryDiff[]> {
		const source = this._getSessionSource(backendSession);
		const turn = this._createTurnObservable(source, backendChat, requestId);
		const isHostNoticeObs = turn.map(isHostNotice);

		const turnChangesetUriObs = derivedOpts<URI | undefined>({ equalsFn: isEqual }, reader => {
			const sessionState = source.read(reader).state.read(reader);
			if (!sessionState || sessionState instanceof Error) {
				return undefined;
			}
			const supportsTurnChangeset = sessionState.changesets?.some(c => c.changeKind === ChangesetKind.Turn);
			if (!supportsTurnChangeset) {
				return undefined;
			}
			return URI.parse(buildTurnChangesetUri(backendSession.toString(), requestId));
		});

		const changesetStateObs = this._subscribeChangeset(turnChangesetUriObs);
		const changesetStatusObs = changesetStateObs.map(state => state instanceof Error ? undefined : state?.status);
		const changesetDiffsObs = this._createChangesetDiffsObservable(changesetStateObs);
		const responseFileEditsObs = this._createFileEditDiffsObservable(source, turn);
		const branchFallbackObs = this._createBranchFallbackDiffsObservable(backendSession, source, requestId);

		let lastSource: TurnDiffSource | undefined;
		const select = (source: TurnDiffSource, diffs: readonly IEditSessionEntryDiff[], status?: ChangesetStatus): readonly IEditSessionEntryDiff[] => {
			if (source !== lastSource) {
				lastSource = source;
				this._logService.trace(`[AgentHostResponseFileChanges] ${backendSession.toString()} turn ${requestId}: diffs from '${source}' (files=${diffs.length}, changesetStatus=${status ?? 'none'})`);
			}
			return diffs;
		};

		// A recompute can temporarily empty a changeset; only Ready can establish an initially empty result.
		return derivedObservableWithCache<readonly IEditSessionEntryDiff[]>(this, (reader, lastValue) => {
			const retained = lastValue ?? [];
			if (isHostNoticeObs.read(reader)) {
				return select('hostNotice', AUTHORITATIVE_EMPTY_CHAT_RESPONSE_FILE_CHANGES);
			}

			const turnUri = turnChangesetUriObs.read(reader);
			const changesetStatus = turnUri ? changesetStatusObs.read(reader) : undefined;
			const changesetDiffs = changesetDiffsObs.read(reader);
			if (changesetDiffs.length) {
				return select('changeset', changesetDiffs, changesetStatus);
			}

			const branchDiffs = branchFallbackObs.read(reader);
			if (branchDiffs.length) {
				return select('branchFallback', branchDiffs, changesetStatus);
			}

			if (!turnUri) {
				return select('unsupported', retained);
			}
			if (changesetStatus === ChangesetStatus.Ready && retained.length === 0) {
				return select('authoritativeEmpty', AUTHORITATIVE_EMPTY_CHAT_RESPONSE_FILE_CHANGES, changesetStatus);
			}

			const responseFileEdits = responseFileEditsObs.read(reader);
			return responseFileEdits.hasValidEdits
				? select('response', responseFileEdits.diffs.length > 0 ? responseFileEdits.diffs : AUTHORITATIVE_EMPTY_CHAT_RESPONSE_FILE_CHANGES, changesetStatus)
				: select('retained', retained, changesetStatus);
		});
	}

	/** Falls back to branch changes only for the recorded migration-boundary turn, which has no checkpoint (#333642). */
	private _createBranchFallbackDiffsObservable(backendSession: URI, source: IObservable<ISessionFileChangesSource>, requestId: string): IObservable<readonly IEditSessionEntryDiff[]> {
		const branchChangesetUriObs = derivedOpts<URI | undefined>({ equalsFn: isEqual }, reader => {
			const sessionState = source.read(reader).state.read(reader);
			if (!sessionState || sessionState instanceof Error) {
				return undefined;
			}
			if (readSessionEhcliLastMigratedTurn(sessionState._meta) !== requestId) {
				return undefined;
			}
			return URI.parse(buildBranchChangesetUri(backendSession.toString()));
		});

		return this._createChangesetDiffsObservable(this._subscribeChangeset(branchChangesetUriObs));
	}

	private _createChangesetDiffsObservable(state: IObservable<ChangesetState | Error | undefined>): IObservable<readonly IEditSessionEntryDiff[]> {
		const files = state.map(changeset => changeset instanceof Error ? undefined : changeset?.files);
		const edits = derivedOpts<readonly ISessionFileDiff[]>({ equalsFn: arrayEquals }, reader => files.read(reader)?.map(file => file.edit) ?? []);
		const diffs = mapObservableArrayCached(this, edits, edit => changesetEditToEntryDiff(edit, this._connectionAuthority));
		return derivedOpts({ equalsFn: arrayEquals }, reader => diffs.read(reader).filter(isDefined));
	}

	private _getSessionSource(backendSession: URI): IObservable<ISessionFileChangesSource> {
		const key = backendSession.toString();
		let source = this._sessionSources.get(key);
		if (!source) {
			source = this._createSharedSource(StateComponents.Session, backendSession, subscription => {
				const state = observableFromEvent(this, subscription.onDidChange, () => subscription.value);
				const workspaceRootUris = derivedOpts<readonly string[]>({ equalsFn: arrayEquals }, reader => {
					const session = state.read(reader);
					if (!session || session instanceof Error) {
						return [];
					}
					return [...new Set([session.project?.uri, ...(session.workingDirectories ?? [])].filter((root): root is string => !!root))];
				});
				const workspaceRoots = workspaceRootUris.map(roots => roots.map(root => URI.parse(root)));
				const chatUris = derivedOpts<readonly string[]>({ equalsFn: arrayEquals }, reader => {
					const session = state.read(reader);
					return [...new Set([
						buildDefaultChatUri(key),
						...(session && !(session instanceof Error) ? session.chats?.map(chat => chat.resource) ?? [] : []),
					])];
				});
				return { state, workspaceRoots, chatUris };
			});
			this._sessionSources.set(key, source);
		}
		return source.observe();
	}

	private _getChatSource(chatUri: URI): IObservable<IChatTurnSource> {
		const key = chatUri.toString();
		let source = this._chatSources.get(key);
		if (!source) {
			source = this._createSharedSource(StateComponents.Chat, chatUri, (subscription, store) => {
				const turns = observableValue<readonly Turn[] | undefined>(this, undefined);
				const activeTurn = observableValue<ActiveTurn | undefined>(this, undefined);
				const activeTurnId = observableValue<string | undefined>(this, undefined);
				const update = () => {
					const value = subscription.value;
					const chat = value instanceof Error ? undefined : value;
					transaction(tx => {
						turns.set(chat?.turns, tx);
						activeTurnId.set(chat?.activeTurn?.id, tx);
						activeTurn.set(chat?.activeTurn, tx);
					});
				};
				// Filter at the event boundary so streamed tokens cannot invalidate historical observers.
				store.add(subscription.onDidChange(update));
				update();
				return {
					turnsById: turns.map(turns => new Map(turns?.map(turn => [turn.id, turn]))),
					activeTurn,
					activeTurnId,
				};
			});
			this._chatSources.set(key, source);
		}
		return source.observe();
	}

	/** Shares a lazy projection, retrying a failed subscription only when another request starts observing it. */
	private _createSharedSource<T extends StateComponents.Session | StateComponents.Chat, S>(
		component: T,
		resource: URI,
		createSource: (subscription: IAgentSubscription<ComponentToState[T]>, store: DisposableStore) => S,
	): ISharedSource<S> {
		const retry = observableSignal(this);
		let currentSubscription: IAgentSubscription<ComponentToState[T]> | undefined;
		const shared = derived(this, reader => {
			retry.read(reader);
			const ref = reader.store.add(this._connection.getSubscription(component, resource, SUBSCRIPTION_OWNER));
			currentSubscription = ref.object;
			reader.store.add(toDisposable(() => currentSubscription = undefined));
			return createSource(ref.object, reader.store);
		});
		return {
			observe: () => {
				// This dependency-free boundary runs once per observation, not when the shared source changes.
				const acquisition = derived(this, () => {
					if (currentSubscription?.value instanceof Error) {
						retry.trigger(undefined);
					}
					return shared;
				});
				return derived(reader => acquisition.read(reader).read(reader));
			},
		};
	}

	private _createTurnObservable(source: IObservable<ISessionFileChangesSource>, backendChat: URI | undefined, requestId: string): IObservable<Turn | ActiveTurn | undefined> {
		const chats = backendChat
			? constObservable([this._getChatSource(backendChat)])
			: mapObservableArrayCached(this, derived(reader => source.read(reader).chatUris.read(reader)), uri => this._getChatSource(URI.parse(uri)));
		return derived(reader => {
			for (const chatSource of chats.read(reader)) {
				const chat = chatSource.read(reader);
				if (chat.activeTurnId.read(reader) === requestId) {
					return chat.activeTurn.read(reader);
				}
				const turn = chat.turnsById.read(reader).get(requestId);
				if (turn) {
					return turn;
				}
			}
			return undefined;
		});
	}

	private _createFileEditDiffsObservable(source: IObservable<ISessionFileChangesSource>, turn: IObservable<Turn | ActiveTurn | undefined>): IObservable<IResponseFileEdits> {
		const responseParts = turn.map(turn => isHostNotice(turn) ? undefined : turn?.responseParts);
		const fileEdits = derivedOpts<readonly ISessionFileDiff[]>({ equalsFn: arrayEquals }, reader => {
			const edits: ISessionFileDiff[] = [];
			for (const part of responseParts.read(reader) ?? []) {
				if (part.kind === ResponsePartKind.ToolCall) {
					edits.push(...getToolCallFileEdits(part.toolCall));
				}
			}
			return edits;
		});
		return derived(reader => {
			const edits = fileEdits.read(reader);
			return edits.length > 0
				? this._fileEditsToEntryDiffs(edits, source.read(reader).workspaceRoots.read(reader))
				: EMPTY_RESPONSE_FILE_EDITS;
		});
	}

	/** Acquires a refcounted subscription only while observed, releasing it when its resource changes or observers leave. */
	private _subscribeChangeset(resourceObs: IObservable<URI | undefined>): IObservable<ChangesetState | Error | undefined> {
		const subscription = derived(reader => {
			const resource = resourceObs.read(reader);
			if (!resource) {
				return constObservable(undefined);
			}
			const subscriptionRef = reader.store.add(this._connection.getSubscription(StateComponents.Changeset, resource, SUBSCRIPTION_OWNER));
			return observableFromEvent(this, subscriptionRef.object.onDidChange, () => subscriptionRef.object.value);
		});
		return derived(reader => subscription.read(reader).read(reader));
	}

	private _fileEditsToEntryDiffs(fileEdits: readonly ISessionFileDiff[], workspaceRoots: readonly URI[]): IResponseFileEdits {
		const byUri = new Map<string, IChatResponseFileEdit>();
		let hasValidEdits = false;
		for (const fileEdit of fileEdits) {
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
