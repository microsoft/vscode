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
import { FEEDBACK_ANNOTATION_META_KEY } from '../../../../platform/agentHost/common/agentFeedbackAnnotations.js';
import { ICodeReviewSuggestion } from '../../codeReview/browser/codeReviewService.js';
import { IAgentHostSessionsProvider, isAgentHostProviderId } from '../../../common/agentHostSessionsProvider.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { AgentFeedbackKind, AgentFeedbackState, IAgentFeedback } from './agentFeedbackService.js';

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

/** Namespaced key under {@link Annotation._meta} carrying feedback semantics. */
const FEEDBACK_META_KEY = FEEDBACK_ANNOTATION_META_KEY;

/**
 * Feedback semantics carried in an annotation's {@link Annotation._meta}.
 * Everything not expressible by the annotation's own fields lives here.
 */
interface IFeedbackAnnotationMeta {
	readonly kind: AgentFeedbackKind;
	readonly state: AgentFeedbackState;
	readonly sessionResource: string;
	readonly suggestion?: ICodeReviewSuggestion;
	readonly codeSelection?: string;
	readonly diffHunks?: string;
	readonly sourcePRReviewCommentId?: string;
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
	};
	return {
		id: feedback.id,
		turnId: '',
		resource: feedback.resourceUri.toString(),
		range: toTextRange(feedback.range),
		resolved: feedback.state === AgentFeedbackState.Resolved,
		entries,
		_meta: { [FEEDBACK_META_KEY]: meta },
	};
}

function annotationToFeedback(annotation: Annotation, sessionResource: URI): IAgentFeedback | undefined {
	const entries = annotation.entries ?? [];
	if (!entries.length) {
		return undefined;
	}
	const meta = annotation._meta?.[FEEDBACK_META_KEY] as IFeedbackAnnotationMeta | undefined;
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

	constructor(
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
	) {
		super();
	}

	getItems(sessionResource: URI): readonly IAgentFeedback[] {
		const channel = this._ensureChannel(sessionResource);
		if (channel && this._hasSnapshot(channel.subscription)) {
			return orderFeedbackItems(this._decode(channel.subscription, sessionResource));
		}
		return orderFeedbackItems(this._cacheBySession.get(sessionResource.toString()) ?? []);
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
		store.add(ref.object.onDidChange(() => this._onDidChangeItems.fire(sessionResource)));

		this._channels.set(key, store);
		this._channelBySession.set(key, channel);
		this._sessionResourceByKey.set(key, sessionResource);
		return channel;
	}
}
