/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { IAgentConnection } from '../../../../platform/agentHost/common/agentService.js';
import { IAgentSubscription } from '../../../../platform/agentHost/common/state/agentSubscription.js';
import { ActionType } from '../../../../platform/agentHost/common/state/protocol/common/actions.js';
import { Annotation, AnnotationEntry, AnnotationsState, StateComponents, StringOrMarkdown } from '../../../../platform/agentHost/common/state/sessionState.js';
import { TextRange } from '../../../../platform/agentHost/common/state/protocol/common/state.js';
import { FEEDBACK_ANNOTATION_META_KEY, readFeedbackAnnotationMeta, type AgentFeedbackKindValue, type AgentFeedbackStateValue, type IFeedbackAnnotationMeta } from '../../../../platform/agentHost/common/meta/agentFeedbackAnnotations.js';
import { ICodeReviewSuggestion } from '../../codeReview/browser/codeReviewService.js';
import { IAgentHostSessionsProvider, isAgentHostProviderId } from '../../../common/agentHostSessionsProvider.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { AgentFeedbackKind, AgentFeedbackState, IAgentFeedback } from './agentFeedbackModel.js';

// --- Backend interface --------------------------------------------------------

/**
 * Storage strategy for the per-session feedback item list used by
 * {@link IAgentFeedbackService}. A backend owns ONLY the list of feedback
 * items keyed by session; all events, telemetry, navigation anchors, recency
 * ordering and submit behavior live in the service.
 *
 * {@link onDidChangeItems} fires whenever the items for a session change,
 * whether due to a local mutation or (for the annotations-backed
 * implementation) an externally-driven update arriving over the protocol.
 */
export interface IAgentFeedbackItemsBackend {
	readonly onDidChangeItems: Event<URI>;

	/** Returns the feedback items for a session in stable display order. */
	getItems(sessionResource: URI): readonly IAgentFeedback[];

	/**
	 * Whether {@link getItems} reflects the authoritative item set for the
	 * session. For the in-memory backend this is always `true`; for the
	 * annotations-backed backend it is `false` until the session's annotations
	 * snapshot has been received, so callers that seed items (e.g. mirroring PR
	 * review comments) can avoid acting on a transiently-empty list.
	 */
	hasLoaded(sessionResource: URI): boolean;

	/** Adds a new feedback item or replaces an existing one with the same id. */
	upsert(feedback: IAgentFeedback): void;

	/** Removes a single feedback item. */
	remove(sessionResource: URI, feedbackId: string): void;

	/** Removes all feedback items for a session. */
	clear(sessionResource: URI): void;

	/** Returns the session resources that currently hold at least one item. */
	getSessionsWithItems(): URI[];
}

// --- Ordering -----------------------------------------------------------------

/**
 * Orders feedback items for display: files are grouped by the order in which
 * they first appear in {@link items}, and within a file items are sorted by
 * {@link IAgentFeedback.range} start line. Uses a stable sort so items sharing
 * a file and start line keep their relative order.
 */
export function orderFeedbackItems(items: readonly IAgentFeedback[]): IAgentFeedback[] {
	const fileOrder = new Map<string, number>();
	for (const item of items) {
		const key = item.resourceUri.toString();
		if (!fileOrder.has(key)) {
			fileOrder.set(key, fileOrder.size);
		}
	}
	return items.slice().sort((a, b) => {
		const fa = fileOrder.get(a.resourceUri.toString())!;
		const fb = fileOrder.get(b.resourceUri.toString())!;
		if (fa !== fb) {
			return fa - fb;
		}
		return a.range.startLineNumber - b.range.startLineNumber;
	});
}

// --- In-memory backend --------------------------------------------------------

/**
 * Client-side, in-memory feedback store used for every non-agent-host
 * provider. State is not persisted and is cleared on session close.
 */
export class InMemoryAgentFeedbackItemsBackend extends Disposable implements IAgentFeedbackItemsBackend {

	private readonly _onDidChangeItems = this._register(new Emitter<URI>());
	readonly onDidChangeItems = this._onDidChangeItems.event;

	/** sessionResource → feedback items (insertion order; display order applied on read) */
	private readonly _bySession = new Map<string, IAgentFeedback[]>();
	private readonly _sessionResourceByKey = new Map<string, URI>();

	getItems(sessionResource: URI): readonly IAgentFeedback[] {
		return orderFeedbackItems(this._bySession.get(sessionResource.toString()) ?? []);
	}

	hasLoaded(_sessionResource: URI): boolean {
		// In-memory state is always authoritative; there is nothing to await.
		return true;
	}

	upsert(feedback: IAgentFeedback): void {
		const key = feedback.sessionResource.toString();
		let items = this._bySession.get(key);
		if (!items) {
			items = [];
			this._bySession.set(key, items);
			this._sessionResourceByKey.set(key, feedback.sessionResource);
		}
		const idx = items.findIndex(f => f.id === feedback.id);
		if (idx >= 0) {
			items[idx] = feedback;
		} else {
			items.push(feedback);
		}
		this._onDidChangeItems.fire(feedback.sessionResource);
	}

	remove(sessionResource: URI, feedbackId: string): void {
		const key = sessionResource.toString();
		const items = this._bySession.get(key);
		if (!items) {
			return;
		}
		const idx = items.findIndex(f => f.id === feedbackId);
		if (idx < 0) {
			return;
		}
		items.splice(idx, 1);
		if (!items.length) {
			this._bySession.delete(key);
			this._sessionResourceByKey.delete(key);
		}
		this._onDidChangeItems.fire(sessionResource);
	}

	clear(sessionResource: URI): void {
		const key = sessionResource.toString();
		if (this._bySession.delete(key)) {
			this._sessionResourceByKey.delete(key);
			this._onDidChangeItems.fire(sessionResource);
		}
	}

	getSessionsWithItems(): URI[] {
		return [...this._sessionResourceByKey.values()];
	}
}

// --- Annotations-backed backend -----------------------------------------------

/**
 * Client-side typed view of a feedback annotation's `_meta`, resolved from the
 * shared wire shape: {@link kind}/{@link state} as the client enums and
 * {@link suggestion} as the concrete {@link ICodeReviewSuggestion} (the shared
 * reader validates it only as opaque data, since its shape lives in this layer).
 */
interface IFeedbackMetaView {
	readonly kind: AgentFeedbackKind;
	readonly state: AgentFeedbackState;
	readonly sessionResource: string;
	readonly suggestion?: ICodeReviewSuggestion;
	readonly codeSelection?: string;
	readonly diffHunks?: string;
	readonly sourcePRReviewCommentId?: string;
	readonly pendingAgentReveal?: boolean;
}

const KIND_FROM_VALUE: Record<AgentFeedbackKindValue, AgentFeedbackKind> = {
	user: AgentFeedbackKind.UserReview,
	codeReview: AgentFeedbackKind.AgentReview,
	prReview: AgentFeedbackKind.PRReview,
};

const STATE_FROM_VALUE: Record<AgentFeedbackStateValue, AgentFeedbackState> = {
	created: AgentFeedbackState.Created,
	accepted: AgentFeedbackState.Accepted,
	submitted: AgentFeedbackState.Submitted,
	resolved: AgentFeedbackState.Resolved,
};

function asCodeReviewSuggestion(suggestion: unknown): ICodeReviewSuggestion | undefined {
	// `suggestion` is opaque client-only data this backend itself serialized from
	// an `ICodeReviewSuggestion`; validate the shape we depend on (an `edits`
	// array) and trust the round-tripped contents.
	if (suggestion && typeof suggestion === 'object' && Array.isArray((suggestion as { edits?: unknown }).edits)) {
		return suggestion as ICodeReviewSuggestion;
	}
	return undefined;
}

/**
 * Resolves the shared feedback `_meta` (validated by
 * {@link readFeedbackAnnotationMeta}) into the client-typed
 * {@link IFeedbackMetaView}, returning `undefined` for annotations that aren't
 * feedback items.
 */
function readFeedbackMeta(annotation: Annotation): IFeedbackMetaView | undefined {
	const base = readFeedbackAnnotationMeta(annotation);
	if (!base) {
		return undefined;
	}
	return {
		kind: KIND_FROM_VALUE[base.kind],
		state: STATE_FROM_VALUE[base.state],
		sessionResource: base.sessionResource,
		suggestion: asCodeReviewSuggestion(base.suggestion),
		codeSelection: base.codeSelection,
		diffHunks: base.diffHunks,
		sourcePRReviewCommentId: base.sourcePRReviewCommentId,
		pendingAgentReveal: base.pendingAgentReveal,
	};
}

function toTextRange(range: IRange): TextRange {
	return {
		start: { line: range.startLineNumber - 1, character: range.startColumn - 1 },
		end: { line: range.endLineNumber - 1, character: range.endColumn - 1 },
	};
}

function fromTextRange(range: TextRange | undefined): IRange {
	if (!range) {
		return { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 };
	}
	return {
		startLineNumber: range.start.line + 1,
		startColumn: range.start.character + 1,
		endLineNumber: range.end.line + 1,
		endColumn: range.end.character + 1,
	};
}

function entryText(text: StringOrMarkdown): string {
	return typeof text === 'string' ? text : text.markdown;
}

function feedbackToAnnotation(feedback: IAgentFeedback): Annotation {
	const entries: AnnotationEntry[] = [{ id: `${feedback.id}:0`, text: feedback.text }];
	for (let i = 0; i < (feedback.replies?.length ?? 0); i++) {
		entries.push({ id: `${feedback.id}:r${i}`, text: feedback.replies![i] });
	}
	const meta: IFeedbackAnnotationMeta = {
		kind: feedback.kind,
		state: feedback.state,
		sessionResource: feedback.sessionResource.toString(),
		suggestion: feedback.suggestion,
		codeSelection: feedback.codeSelection,
		diffHunks: feedback.diffHunks,
		sourcePRReviewCommentId: feedback.sourcePRReviewCommentId,
		pendingAgentReveal: feedback.pendingAgentReveal,
	};
	return {
		id: feedback.id,
		turnId: '',
		resource: feedback.resourceUri.toString(),
		range: toTextRange(feedback.range),
		resolved: feedback.state === AgentFeedbackState.Resolved,
		entries,
		_meta: { [FEEDBACK_ANNOTATION_META_KEY]: meta },
	};
}

function annotationToFeedback(annotation: Annotation, sessionResource: URI): IAgentFeedback | undefined {
	const entries = annotation.entries ?? [];
	const meta = readFeedbackMeta(annotation);
	// The annotations channel is generic and may carry annotations produced by
	// other features. Only annotations that carry feedback metadata are feedback
	// items; everything else is ignored so feedback never surfaces or mutates
	// unrelated annotations.
	if (!meta || !entries.length) {
		return undefined;
	}
	const replies = entries.slice(1).map(e => entryText(e.text));
	return {
		id: annotation.id,
		text: entryText(entries[0].text),
		resourceUri: URI.parse(annotation.resource),
		range: fromTextRange(annotation.range),
		sessionResource,
		suggestion: meta?.suggestion,
		codeSelection: meta?.codeSelection,
		diffHunks: meta?.diffHunks,
		kind: meta?.kind ?? AgentFeedbackKind.UserReview,
		sourcePRReviewCommentId: meta?.sourcePRReviewCommentId,
		replies: replies.length ? replies : undefined,
		state: annotation.resolved ? AgentFeedbackState.Resolved : (meta?.state ?? AgentFeedbackState.Accepted),
		pendingAgentReveal: meta?.pendingAgentReveal,
	};
}

interface ITrackedChannel {
	readonly connection: IAgentConnection;
	readonly annotationsUri: URI;
	readonly subscription: IAgentSubscription<AnnotationsState>;
}

/**
 * Feedback store backed by the agent host's annotations channel. Feedback
 * items round-trip as {@link Annotation}s on `<session>/annotations`, mutated
 * via the `annotations/set` upsert (and `annotations/removed`) actions, with
 * feedback semantics carried in {@link Annotation._meta}.
 *
 * A per-session subscription is acquired lazily and held for the backend's
 * lifetime so reads are synchronous and server-driven changes surface via
 * {@link onDidChangeItems}. A local cache backs reads before the first
 * snapshot arrives.
 */
export class AnnotationsAgentFeedbackItemsBackend extends Disposable implements IAgentFeedbackItemsBackend {

	private static readonly OWNER = 'AnnotationsAgentFeedbackItemsBackend';

	private readonly _onDidChangeItems = this._register(new Emitter<URI>());
	readonly onDidChangeItems = this._onDidChangeItems.event;

	private readonly _channels = this._register(new DisposableMap<string, DisposableStore>());
	private readonly _channelBySession = new Map<string, ITrackedChannel>();
	private readonly _sessionResourceByKey = new Map<string, URI>();
	/** Local cache so reads work before the first snapshot arrives. */
	private readonly _cacheBySession = new Map<string, IAgentFeedback[]>();
	/**
	 * Signature of the feedback set we last fired {@link onDidChangeItems} for,
	 * per session. The annotations channel is shared and may carry non-feedback
	 * annotations; comparing signatures means churn from those does not fire a
	 * spurious feedback-items change (which would bump recency / navigation).
	 */
	private readonly _signatureBySession = new Map<string, string>();
	/**
	 * Sessions whose annotations snapshot has been received. Used to fire
	 * {@link onDidChangeItems} exactly once when loading completes (even when the
	 * loaded feedback set is empty), so consumers that seed feedback can wait for
	 * the authoritative set before acting.
	 */
	private readonly _loadedBySession = new Set<string>();

	constructor(
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
	) {
		super();

		// Release a session's annotations subscription when the session is
		// permanently deleted. Otherwise the per-session wire subscription
		// acquired lazily in `_ensureChannel` would be held for the lifetime of
		// this (singleton-owned) backend.
		this._register(this._sessionsManagementService.onDidDeleteSession(session => this._releaseChannel(session.resource)));
	}

	getItems(sessionResource: URI): readonly IAgentFeedback[] {
		const channel = this._ensureChannel(sessionResource);
		if (channel && this._hasSnapshot(channel.subscription)) {
			return orderFeedbackItems(this._decode(channel.subscription, sessionResource));
		}
		return orderFeedbackItems(this._cacheBySession.get(sessionResource.toString()) ?? []);
	}

	hasLoaded(sessionResource: URI): boolean {
		// Only authoritative once the session's annotations snapshot has been
		// received; until then `getItems` falls back to the (possibly empty)
		// local cache and must not be treated as the full item set.
		const channel = this._ensureChannel(sessionResource);
		return channel ? this._hasSnapshot(channel.subscription) : false;
	}

	upsert(feedback: IAgentFeedback): void {
		const channel = this._ensureChannel(feedback.sessionResource);
		this._cacheUpsert(feedback);
		if (!channel) {
			this._onDidChangeItems.fire(feedback.sessionResource);
			return;
		}
		channel.connection.dispatch(channel.annotationsUri.toString(), {
			type: ActionType.AnnotationsSet,
			annotation: feedbackToAnnotation(feedback),
		});
		if (!this._hasSnapshot(channel.subscription)) {
			this._onDidChangeItems.fire(feedback.sessionResource);
		}
	}

	remove(sessionResource: URI, feedbackId: string): void {
		const channel = this._ensureChannel(sessionResource);
		this._cacheRemove(sessionResource, feedbackId);
		if (!channel) {
			this._onDidChangeItems.fire(sessionResource);
			return;
		}
		channel.connection.dispatch(channel.annotationsUri.toString(), {
			type: ActionType.AnnotationsRemoved,
			annotationId: feedbackId,
		});
		if (!this._hasSnapshot(channel.subscription)) {
			this._onDidChangeItems.fire(sessionResource);
		}
	}

	clear(sessionResource: URI): void {
		const items = this.getItems(sessionResource);
		const channel = this._ensureChannel(sessionResource);
		this._cacheBySession.delete(sessionResource.toString());
		if (channel) {
			for (const item of items) {
				channel.connection.dispatch(channel.annotationsUri.toString(), {
					type: ActionType.AnnotationsRemoved,
					annotationId: item.id,
				});
			}
		}
		this._onDidChangeItems.fire(sessionResource);
	}

	getSessionsWithItems(): URI[] {
		const result: URI[] = [];
		for (const resource of this._sessionResourceByKey.values()) {
			if (this.getItems(resource).length > 0) {
				result.push(resource);
			}
		}
		return result;
	}

	/**
	 * Returns the annotations channel URI backing the given session's feedback,
	 * or `undefined` when the session is not an agent-host session (or no channel
	 * could be resolved). Each feedback item id is an annotation id on this
	 * channel, so callers can reference specific comments by id.
	 */
	getAnnotationsChannelResource(sessionResource: URI): URI | undefined {
		return this._ensureChannel(sessionResource)?.annotationsUri;
	}

	private _hasSnapshot(subscription: IAgentSubscription<AnnotationsState>): boolean {
		const value = subscription.value;
		return value !== undefined && !(value instanceof Error);
	}

	private _decode(subscription: IAgentSubscription<AnnotationsState>, sessionResource: URI): IAgentFeedback[] {
		const value = subscription.value;
		if (!value || value instanceof Error) {
			return [];
		}
		const items: IAgentFeedback[] = [];
		for (const annotation of value.annotations) {
			const feedback = annotationToFeedback(annotation, sessionResource);
			if (feedback) {
				items.push(feedback);
			}
		}
		return items;
	}

	/**
	 * Fire {@link onDidChangeItems} only when the session's feedback set actually
	 * changed. The annotations channel is generic and may carry annotations from
	 * other features; without this guard their churn would bump feedback recency
	 * ordering and navigation even though no feedback changed.
	 */
	private _onAnnotationsChange(sessionResource: URI): void {
		const key = sessionResource.toString();
		const channel = this._channelBySession.get(key);
		if (!channel) {
			return;
		}
		// Fire once when the snapshot first arrives so consumers learn that the
		// feedback set is now authoritative, even if it is empty (and thus has
		// the same — empty — signature as before loading).
		if (this._hasSnapshot(channel.subscription) && !this._loadedBySession.has(key)) {
			this._loadedBySession.add(key);
			this._signatureBySession.set(key, this._feedbackSignature(channel.subscription));
			this._onDidChangeItems.fire(sessionResource);
			return;
		}
		const signature = this._feedbackSignature(channel.subscription);
		if (this._signatureBySession.get(key) === signature) {
			return;
		}
		this._signatureBySession.set(key, signature);
		this._onDidChangeItems.fire(sessionResource);
	}

	/**
	 * A stable signature of the feedback-bearing annotations in the
	 * subscription's current snapshot (sorted by id). Excludes annotations
	 * without feedback metadata so unrelated annotation activity on the shared
	 * channel is ignored.
	 */
	private _feedbackSignature(subscription: IAgentSubscription<AnnotationsState>): string {
		const value = subscription.value;
		if (!value || value instanceof Error) {
			return '';
		}
		const feedback = value.annotations
			.map(annotation => ({ annotation, meta: readFeedbackMeta(annotation) }))
			.filter(({ annotation, meta }) => meta !== undefined && (annotation.entries?.length ?? 0) > 0)
			.map(({ annotation, meta }) => ({
				id: annotation.id,
				resource: annotation.resource,
				range: annotation.range,
				resolved: annotation.resolved,
				entries: annotation.entries,
				meta,
			}))
			.sort((a, b) => a.id.localeCompare(b.id));
		return JSON.stringify(feedback);
	}

	private _cacheUpsert(feedback: IAgentFeedback): void {
		const key = feedback.sessionResource.toString();
		let items = this._cacheBySession.get(key);
		if (!items) {
			items = [];
			this._cacheBySession.set(key, items);
		}
		const idx = items.findIndex(f => f.id === feedback.id);
		if (idx >= 0) {
			items[idx] = feedback;
		} else {
			items.push(feedback);
		}
	}

	private _cacheRemove(sessionResource: URI, feedbackId: string): void {
		const key = sessionResource.toString();
		const items = this._cacheBySession.get(key);
		if (!items) {
			return;
		}
		const idx = items.findIndex(f => f.id === feedbackId);
		if (idx >= 0) {
			items.splice(idx, 1);
		}
	}

	private _releaseChannel(sessionResource: URI): void {
		const key = sessionResource.toString();
		this._channels.deleteAndDispose(key);
		this._channelBySession.delete(key);
		this._sessionResourceByKey.delete(key);
		this._cacheBySession.delete(key);
		this._signatureBySession.delete(key);
		this._loadedBySession.delete(key);
	}

	private _ensureChannel(sessionResource: URI): ITrackedChannel | undefined {
		const key = sessionResource.toString();
		const existing = this._channelBySession.get(key);
		if (existing) {
			return existing;
		}

		const session = this._sessionsManagementService.getSession(sessionResource);
		if (!session || !isAgentHostProviderId(session.providerId)) {
			return undefined;
		}
		const provider = this._sessionsProvidersService.getProvider<IAgentHostSessionsProvider>(session.providerId);
		if (!provider?.getFeedbackAnnotationsChannel) {
			return undefined;
		}
		const resolved = provider.getFeedbackAnnotationsChannel(session.sessionId);
		if (!resolved) {
			return undefined;
		}

		const store = new DisposableStore();
		const ref = store.add(resolved.connection.getSubscription(StateComponents.Annotations, resolved.annotationsUri, AnnotationsAgentFeedbackItemsBackend.OWNER));
		const channel: ITrackedChannel = {
			connection: resolved.connection,
			annotationsUri: resolved.annotationsUri,
			subscription: ref.object,
		};
		this._signatureBySession.set(key, this._feedbackSignature(ref.object));
		if (this._hasSnapshot(ref.object)) {
			this._loadedBySession.add(key);
		}
		store.add(ref.object.onDidChange(() => this._onAnnotationsChange(sessionResource)));

		this._channels.set(key, store);
		this._channelBySession.set(key, channel);
		this._sessionResourceByKey.set(key, sessionResource);
		return channel;
	}
}
