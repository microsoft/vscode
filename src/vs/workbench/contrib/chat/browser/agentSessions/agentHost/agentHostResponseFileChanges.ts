/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable, derived, derivedOpts, IObservable, observableFromEvent } from '../../../../../../base/common/observable.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { isDefined } from '../../../../../../base/common/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { buildTurnChangesetUri, ChangesetKind } from '../../../../../../platform/agentHost/common/changesetUri.js';
import { normalizeFileEdit } from '../../../../../../platform/agentHost/common/fileEditDiff.js';
import { toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { StateComponents, type ChangesetFile, type ChangesetState, type SessionState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IEditSessionEntryDiff } from '../../../common/editing/chatEditingService.js';
import { IChatResponseFileChangesProvider } from '../../chatResponseFileChangesService.js';

const SUBSCRIPTION_OWNER = 'AgentHostResponseFileChangesProvider';

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

	/**
	 * Builds a two-level observable that owns a refcounted subscription to
	 * `component` at the (observable) resource. The outer observable acquires
	 * the subscription against the current resource and releases it when the
	 * resource changes or no one observes; the inner observable tracks the
	 * subscription's value.
	 */
	private _subscribe<T>(component: StateComponents.Session | StateComponents.Changeset, resourceObs: IObservable<URI | undefined>): IObservable<IObservable<T | Error | undefined>> {
		return derived(reader => {
			const resource = resourceObs.read(reader);
			if (!resource) {
				return constObservable(undefined);
			}
			const subscriptionRef = reader.store.add(this._connection.getSubscription(component, resource, SUBSCRIPTION_OWNER));
			return observableFromEvent(this, subscriptionRef.object.onDidChange, () => subscriptionRef.object.value as T | Error | undefined);
		});
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
