/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IFeedbackPullRequest } from '../../../../platform/agentHost/common/meta/agentFeedbackAnnotations.js';
import { ICodeReviewSuggestion } from './codeReviewService.js';
import { ISession, ISessionFileChange } from '../../../services/sessions/common/session.js';
import { AgentFeedbackKind, AgentFeedbackState, type IAgentFeedback } from './agentFeedbackModel.js';
import { IAgentFeedbackVariableEntry } from '../../chat/common/attachments/chatVariableEntries.js';

// --- Types --------------------------------------------------------------------

// The core feedback model (`IAgentFeedback` and the `AgentFeedbackKind` /
// `AgentFeedbackState` enums) lives in `agentFeedbackModel.ts` so the storage
// backends can depend on it without a dependency cycle back through this
// service.

/** Shared feedback scope for every undefined or uncreated active session. */
export const AGENT_FEEDBACK_NEW_SESSION_RESOURCE = URI.from({ scheme: 'agent-feedback', path: '/new-session' });

export interface INavigableSessionComment {
	readonly id: string;
}

/** Options for {@link IAgentFeedbackService.acceptFeedback}. */
export interface IAcceptFeedbackOptions {
	/**
	 * Flag the accepted item as pending reveal to the agent so the
	 * `viewUnreviewedComments` server tool returns it (and only the items
	 * revealed in the same invocation).
	 */
	readonly revealToAgent?: boolean;
}

export interface IAgentFeedbackChangeEvent {
	readonly sessionResource: URI;
	readonly feedbackItems: readonly IAgentFeedback[];
}

export interface IAgentFeedbackNavigationBearing {
	readonly activeIdx: number;
	readonly totalCount: number;
	/** Whether editors should reveal and focus the anchored item. `false` when the anchor was set without revealing it; a missing value means `true`. */
	readonly reveal?: boolean;
}

export interface IAgentFeedbackNavigationChangeEvent {
	readonly sessionResource: URI;
	/** Whether editors should reveal and focus the comment the navigation is now anchored at. */
	readonly reveal: boolean;
}

export interface IAgentFeedbackCommentRevealEvent {
	readonly sessionResource: URI;
	readonly commentId: string;
	readonly resourceUri: URI;
}

/** Fired when a brand-new agent feedback item is added by the user. */
export interface IAgentFeedbackAddedEvent {
	readonly sessionResource: URI;
	readonly feedback: IAgentFeedback;
	readonly hasExistingFeedbackForFile: boolean;
}

/** Fired when an existing PR/code-review comment is converted into agent feedback. */
export interface IAgentFeedbackConvertedEvent {
	readonly sessionResource: URI;
	readonly feedback: IAgentFeedback;
	readonly kind: AgentFeedbackKind.AgentReview | AgentFeedbackKind.PRReview;
	readonly hasExistingFeedbackForFile: boolean;
}

/** Fired when a reply is appended to an existing feedback thread. */
export interface IAgentFeedbackReplyAddedEvent {
	readonly sessionResource: URI;
	readonly feedback: IAgentFeedback;
	readonly replyCount: number;
}

/** Fired when feedback items are submitted to the agent for action. */
export interface IAgentFeedbackSubmittedEvent {
	readonly sessionResource: URI;
	readonly totalCount: number;
	readonly userCount: number;
	readonly codeReviewCount: number;
	readonly prReviewCount: number;
	readonly replyCount: number;
}

/** Controls which accepted feedback items are submitted and the request used for them. */
export interface ISubmitFeedbackOptions {
	readonly query?: string;
	/** Selected feedback for Agent Host requests. Other providers submit their complete reactive attachment. */
	readonly feedbackIds?: readonly string[];
	/**
	 * The chat to send the request to, when it differs from the feedback's
	 * session resource: feedback is read and marked under the session, and the
	 * request goes to this chat.
	 */
	readonly targetChat?: URI;
	/** Submit Agent Host feedback without requiring or focusing a chat widget. */
	readonly backgroundSubmit?: (query: string, attachment: IAgentFeedbackVariableEntry) => Promise<boolean>;
	readonly onRequestAccepted?: () => void;
}

// --- Service Interface --------------------------------------------------------

export const IAgentFeedbackService = createDecorator<IAgentFeedbackService>('agentFeedbackService');

export interface IAgentFeedbackService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeFeedback: Event<IAgentFeedbackChangeEvent>;
	readonly onDidChangeFeedbackVisibility: Event<URI>;
	readonly onDidChangeNavigation: Event<IAgentFeedbackNavigationChangeEvent>;
	readonly onDidRevealSessionComment: Event<IAgentFeedbackCommentRevealEvent>;
	/** Fired when {@link getFeedbackSessionResource} may resolve differently. */
	readonly onDidChangeFeedbackScope: Event<void>;

	/**
	 * The feedback scope of the active session view: the active session itself,
	 * or {@link AGENT_FEEDBACK_NEW_SESSION_RESOURCE} while it is undefined or
	 * uncreated. Unlike {@link getFeedbackSessionResource} this is not
	 * file-scoped, so it always resolves to a scope.
	 */
	readonly activeFeedbackSessionResource: IObservable<URI>;

	/** Fired when a new user-authored feedback item is added. */
	readonly onDidAddFeedback: Event<IAgentFeedbackAddedEvent>;
	/** Fired when an external review comment is converted into agent feedback. */
	readonly onDidConvertFeedback: Event<IAgentFeedbackConvertedEvent>;
	/** Fired when a reply is appended to an existing feedback thread. */
	readonly onDidAddReply: Event<IAgentFeedbackReplyAddedEvent>;
	/** Fired when feedback items are submitted to the agent. */
	readonly onDidSubmitFeedback: Event<IAgentFeedbackSubmittedEvent>;

	/**
	 * Add a feedback item for the given session. {@link kind} (defaults to
	 * {@link AgentFeedbackKind.UserReview}) classifies the origin of the
	 * feedback. {@link state} (defaults
	 * to {@link AgentFeedbackState.Accepted}) sets the initial lifecycle state
	 * and selects which lifecycle event is fired.
	 */
	addFeedback(sessionResource: URI, resourceUri: URI, range: IRange, text: string, suggestion?: ICodeReviewSuggestion, context?: IAgentFeedbackContext, sourcePRReviewCommentId?: string, kind?: AgentFeedbackKind, state?: AgentFeedbackState, sourcePullRequest?: IFeedbackPullRequest, sourcePRReviewCommentAuthor?: string): IAgentFeedback;

	/**
	 * Accept a feedback item that is currently in the
	 * {@link AgentFeedbackState.Created} state, transitioning it to
	 * {@link AgentFeedbackState.Accepted} so it becomes submittable and is
	 * attached to the chat input.
	 *
	 * When {@link IAcceptFeedbackOptions.revealToAgent} is set, the item is
	 * additionally flagged as pending reveal to the agent so the
	 * `viewUnreviewedComments` server tool returns exactly the comments the user
	 * chose to reveal for that invocation.
	 */
	acceptFeedback(sessionResource: URI, feedbackId: string, options?: IAcceptFeedbackOptions): void;

	/**
	 * Remove a single feedback item.
	 */
	removeFeedback(sessionResource: URI, feedbackId: string): void;

	/**
	 * Update the text of an existing feedback item.
	 */
	updateFeedback(sessionResource: URI, feedbackId: string, newText: string): void;
	/** Backfill missing PR-review source details without replacing known values. */
	updateFeedbackSourcePullRequest(sessionResource: URI, feedbackId: string, sourcePullRequest: IFeedbackPullRequest, sourcePRReviewCommentAuthor?: string): void;

	/**
	 * Mark an existing feedback item as resolved. Resolving moves the item to
	 * {@link AgentFeedbackState.Resolved}; un-resolving returns it to
	 * {@link AgentFeedbackState.Submitted}.
	 */
	setFeedbackResolved(sessionResource: URI, feedbackId: string, resolved: boolean): void;

	/**
	 * Append a reply to an existing feedback item, making it part of the same
	 * comment thread.
	 */
	addReply(sessionResource: URI, feedbackId: string, replyText: string): void;

	/**
	 * Get all feedback items for a session.
	 */
	getFeedback(sessionResource: URI): readonly IAgentFeedback[];
	/** Whether feedback for this session is owned by an Agent Host annotations channel. */
	isAgentHostSession(sessionResource: URI): boolean;

	/** Show resolved feedback items in editor comment surfaces for this window. */
	showFeedbackInEditor(sessionResource: URI, feedbackIds: readonly string[]): void;

	/** Hide a resolved feedback item that was explicitly shown in editor comment surfaces. */
	hideFeedbackInEditor(sessionResource: URI, feedbackId: string): void;

	/** Get resolved feedback item ids that were explicitly shown in editor comment surfaces. */
	getVisibleResolvedFeedbackIds(sessionResource: URI): ReadonlySet<string>;

	/**
	 * Whether {@link getFeedback} reflects the authoritative item set for the
	 * session. For agent-host sessions this is `false` until the session's
	 * annotations snapshot has been received; for other sessions it is always
	 * `true`. Callers that seed feedback from another source must wait for this
	 * to avoid acting on a transiently-empty list.
	 */
	hasLoadedFeedback(sessionResource: URI): boolean;

	/**
	 * Resolve the session that owns the given file resource. Returns the
	 * session that was active when the file's editor was first opened; if the
	 * file has never been tracked, falls back to the currently active session.
	 * A window that shows one session other than the main window's, such as a
	 * chat window, passes it as `hostSession`: the file belongs to it there,
	 * whichever session is active.
	 * Returns `undefined` when the file is not eligible for feedback (an
	 * output-channel resource) or when there is no created session to scope to.
	 */
	getSessionForFile(resourceUri: URI, hostSession?: ISession): ISession | undefined;

	/** File changes for the focused chat in the given session. */
	getChatChanges(sessionResource: URI): readonly ISessionFileChange[];

	/**
	 * Resolve the feedback scope shown for a file in the current session view, or
	 * in the window of `hostSession` (see {@link getSessionForFile}), or
	 * `undefined` when the file is out of scope.
	 */
	getFeedbackSessionResource(resourceUri: URI, hostSession?: ISession): URI | undefined;
	registerFeedbackResourceScope(resourceUri: URI, sessionResource: URI): IDisposable;

	/**
	 * Resolve the most recently updated session that has feedback for a given resource.
	 */
	getMostRecentSessionForResource(resourceUri: URI): URI | undefined;

	/**
	 * Set the navigation anchor to a specific feedback item, open its editor, and fire a navigation event.
	 */
	revealFeedback(sessionResource: URI, feedbackId: string): Promise<void>;

	/**
	 * Open an editor for the given session comment (feedback or code-review) at its range
	 * and set it as the navigation anchor.
	 */
	revealSessionComment(sessionResource: URI, commentId: string, resourceUri: URI, range: IRange): Promise<void>;

	/**
	 * Navigate to next/previous feedback item in a session.
	 */
	getNextFeedback(sessionResource: URI, next: boolean): IAgentFeedback | undefined;
	getNextNavigableItem<T extends INavigableSessionComment>(sessionResource: URI, items: readonly T[], next: boolean): T | undefined;
	/**
	 * Anchor the navigation of a session at an item. Unless `reveal` is `false`, editors reveal and focus the item.
	 */
	setNavigationAnchor(sessionResource: URI, itemId: string | undefined, options?: { readonly reveal?: boolean }): void;

	/**
	 * Get the current navigation bearings for a session.
	 */
	getNavigationBearing(sessionResource: URI, items?: readonly INavigableSessionComment[]): IAgentFeedbackNavigationBearing;

	/**
	 * Clear all feedback items for a session (e.g., after sending).
	 */
	clearFeedback(sessionResource: URI): void;

	/**
	 * Mark all accepted feedback items for the session as submitted, firing
	 * {@link onDidSubmitFeedback} with the per-kind counts of the items that
	 * were submitted. Agent-host sessions move the items to
	 * {@link AgentFeedbackState.Submitted} so they stay visible until the agent
	 * resolves them; other providers have no such agent loop, so the items move
	 * straight to {@link AgentFeedbackState.Resolved}. No-op when there are no
	 * accepted items.
	 */
	markFeedbackSubmitted(sessionResource: URI, feedbackIds?: readonly string[]): void;

	/**
	 * Submit the currently accumulated accepted feedback for the session to the
	 * agent and mark those items as submitted. Waits for the session's chat model to be loaded
	 * into a chat widget, then resolves once the request has been accepted by that widget — which,
	 * while another request is in progress, means it was queued rather than sent. Returns whether
	 * the feedback was submitted.
	 */
	submitFeedback(sessionResource: URI, options?: ISubmitFeedbackOptions): Promise<boolean>;

	/**
	 * Add a feedback item and then submit the feedback. Waits for the
	 * attachment to be updated in the chat widget before submitting.
	 */
	addFeedbackAndSubmit(sessionResource: URI, resourceUri: URI, range: IRange, text: string, suggestion?: ICodeReviewSuggestion, context?: IAgentFeedbackContext, sourcePRReviewCommentId?: string, kind?: AgentFeedbackKind): Promise<void>;
}

export interface IAgentFeedbackContext {
	readonly codeSelection?: string;
	readonly diffHunks?: string;
}
