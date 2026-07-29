/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isHTMLElement } from '../../../../base/browser/dom.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../../editor/browser/editorExtensions.js';
import { Range } from '../../../../editor/common/core/range.js';
import { IEditorContribution, ScrollType } from '../../../../editor/common/editorCommon.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { isIChatSessionFileChange2 } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ISessionFileChange } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ICodeReviewService, IPRReviewState } from '../../codeReview/browser/codeReviewService.js';
import { AgentFeedbackEditorWidget, IComposerDraft, IComposerDraftState } from './agentFeedbackEditorWidget.js';
import { IAgentFeedbackService } from './agentFeedbackService.js';
import { getSessionEditorComments, groupNearbySessionEditorComments, ISessionEditorComment } from './sessionEditorComments.js';

/**
 * Editor contribution that manages agent feedback widgets.
 * Groups feedback items and creates combined widgets for nearby items.
 * Widgets start collapsed and expand when navigated to.
 */
export class AgentFeedbackEditorWidgetContribution extends Disposable implements IEditorContribution {

	static readonly ID = 'agentFeedback.editorWidgetContribution';

	private readonly _widgets: AgentFeedbackEditorWidget[] = [];
	private readonly _widgetListeners = this._register(new DisposableStore());
	private _sessionResource: URI | undefined;

	/**
	 * Composer state shared across widget rebuilds. Without this, any unrelated
	 * feedback / review state change would dispose the active widget and discard
	 * the textarea the user was typing in.
	 */
	private readonly _composerDraftState: IComposerDraftState = {
		drafts: new Map<string, IComposerDraft>(),
		focusedCommentId: undefined,
	};

	constructor(
		private readonly _editor: ICodeEditor,
		@IAgentFeedbackService private readonly _agentFeedbackService: IAgentFeedbackService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ICodeReviewService private readonly _codeReviewService: ICodeReviewService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this._store.add(this._agentFeedbackService.onDidChangeNavigation(sessionResource => {
			if (this._sessionResource && sessionResource.toString() === this._sessionResource.toString()) {
				this._handleNavigation();
			}
		}));

		const rebuildSignal = observableSignalFromEvent(this, Event.any(
			this._agentFeedbackService.onDidChangeFeedback,
			this._agentFeedbackService.onDidChangeFeedbackScope,
			this._editor.onDidChangeModel,
		));

		this._store.add(Event.any(this._editor.onDidScrollChange, this._editor.onDidLayoutChange)(() => {
			for (const widget of this._widgets) {
				widget.relayout();
			}
		}));

		this._store.add(autorun(reader => {
			rebuildSignal.read(reader);
			this._resolveSession();
			if (!this._sessionResource) {
				this._clearWidgets();
				return;
			}

			this._rebuildWidgets(
				this._codeReviewService.getPRReviewState(this._sessionResource).read(reader),
			);
			this._handleNavigation();
		}));
	}

	private _resolveSession(): void {
		const model = this._editor.getModel();
		if (!model) {
			this._sessionResource = undefined;
			return;
		}
		this._sessionResource = this._agentFeedbackService.getFeedbackSessionResource(model.uri);
	}

	private _rebuildWidgets(
		prReviewState: IPRReviewState | undefined = this._sessionResource ? this._codeReviewService.getPRReviewState(this._sessionResource).get() : undefined,
	): void {
		this._clearWidgets();

		if (!this._sessionResource) {
			return;
		}

		const model = this._editor.getModel();
		if (!model) {
			return;
		}

		const comments = getSessionEditorComments(
			this._sessionResource,
			this._agentFeedbackService.getFeedback(this._sessionResource),
			prReviewState,
		);
		const fileComments = this._getCommentsForModel(model.uri, comments);
		if (fileComments.length === 0) {
			return;
		}

		const groups = groupNearbySessionEditorComments(fileComments, 5);

		// Create widgets in reverse file order so that widgets further up in the
		// file are added to the DOM last and therefore render on top of widgets
		// further down.
		for (let i = groups.length - 1; i >= 0; i--) {
			const group = groups[i];
			const widget = this._instantiationService.createInstance(AgentFeedbackEditorWidget, this._editor, group, this._sessionResource, this._composerDraftState);
			this._widgets.push(widget);

			// Ensure only one widget is expanded per file at a time: when a
			// widget expands, collapse all others.
			this._widgetListeners.add(widget.onDidExpand(() => {
				for (const other of this._widgets) {
					if (other !== widget && other.isExpanded) {
						other.collapse();
					}
				}
			}));

			widget.layout(group[0].range.startLineNumber);
			widget.restoreComposerFocus();
		}

		this._pruneOrphanedComposerDrafts();
	}

	/**
	 * Remove draft entries for comments that no longer exist in any widget.
	 * Without this, deleted comments would leave drafts in the map forever.
	 */
	private _pruneOrphanedComposerDrafts(): void {
		if (this._composerDraftState.drafts.size === 0 && this._composerDraftState.focusedCommentId === undefined) {
			return;
		}
		const knownCommentIds = new Set<string>();
		for (const widget of this._widgets) {
			for (const commentId of widget.getCommentIds()) {
				knownCommentIds.add(commentId);
			}
		}
		for (const commentId of [...this._composerDraftState.drafts.keys()]) {
			if (!knownCommentIds.has(commentId)) {
				this._composerDraftState.drafts.delete(commentId);
			}
		}
		if (this._composerDraftState.focusedCommentId !== undefined && !knownCommentIds.has(this._composerDraftState.focusedCommentId)) {
			this._composerDraftState.focusedCommentId = undefined;
		}
	}

	private _getCommentsForModel(resourceUri: URI, comments: readonly ISessionEditorComment[]): readonly ISessionEditorComment[] {
		const change = this._getSessionChangeForResource(resourceUri);
		if (!change) {
			return comments.filter(comment => isEqual(comment.resourceUri, resourceUri));
		}

		if (!this._isCurrentOrModifiedResource(change, resourceUri)) {
			return [];
		}

		return comments.filter(comment => comment.resourceUri.fsPath === resourceUri.fsPath);
	}

	private _getSessionChangeForResource(resourceUri: URI): ISessionFileChange | undefined {
		if (!this._sessionResource) {
			return undefined;
		}

		const changes = this._sessionsManagementService.getSession(this._sessionResource)?.changes.get();
		if (!changes) {
			return undefined;
		}

		return changes.find(change => this._changeMatchesFsPath(change, resourceUri));
	}

	private _changeMatchesFsPath(change: ISessionFileChange, resourceUri: URI): boolean {
		if (isIChatSessionFileChange2(change)) {
			return change.uri.fsPath === resourceUri.fsPath
				|| change.modifiedUri?.fsPath === resourceUri.fsPath
				|| change.originalUri?.fsPath === resourceUri.fsPath;
		}

		return change.modifiedUri.fsPath === resourceUri.fsPath
			|| change.originalUri?.fsPath === resourceUri.fsPath;
	}

	private _isCurrentOrModifiedResource(change: ISessionFileChange, resourceUri: URI): boolean {
		if (isIChatSessionFileChange2(change)) {
			return isEqual(change.uri, resourceUri) || (change.modifiedUri ? isEqual(change.modifiedUri, resourceUri) : false);
		}

		return isEqual(change.modifiedUri, resourceUri);
	}

	private _handleNavigation(): void {
		if (!this._sessionResource) {
			return;
		}

		const model = this._editor.getModel();
		if (!model) {
			return;
		}

		const comments = getSessionEditorComments(
			this._sessionResource,
			this._agentFeedbackService.getFeedback(this._sessionResource),
			this._codeReviewService.getPRReviewState(this._sessionResource).get(),
		);
		const bearing = this._agentFeedbackService.getNavigationBearing(this._sessionResource, comments);
		if (bearing.activeIdx < 0) {
			return;
		}

		const activeFeedback = comments[bearing.activeIdx];
		if (!activeFeedback) {
			return;
		}

		if (this._getCommentsForModel(model.uri, [activeFeedback]).length === 0) {
			for (const widget of this._widgets) {
				widget.collapse();
			}
			return;
		}

		// Expand the widget containing the active feedback, collapse all others
		for (const widget of this._widgets) {
			if (widget.containsFeedback(activeFeedback.id)) {
				widget.expand();
				widget.focusFeedback(activeFeedback.id);
			} else {
				widget.collapse();
			}
		}

		// Reveal the feedback range in the editor
		const range = new Range(
			activeFeedback.range.startLineNumber, 1,
			activeFeedback.range.endLineNumber, 1
		);
		this._editor.revealRangeInCenterIfOutsideViewport(range, ScrollType.Smooth);
	}

	private _clearWidgets(): void {
		// Capture focus before teardown: the textarea's blur would clear it.
		this._captureFocusedComposerCommentId();

		this._widgetListeners.clear();
		for (const widget of this._widgets) {
			widget.dispose();
		}
		this._widgets.length = 0;
	}

	private _captureFocusedComposerCommentId(): void {
		// Always recompute — the previous value may be stale (e.g. the user clicked elsewhere after typing).
		this._composerDraftState.focusedCommentId = undefined;
		if (this._widgets.length === 0) {
			return;
		}
		const activeElement = this._editor.getDomNode()?.ownerDocument.activeElement;
		if (!isHTMLElement(activeElement)) {
			return;
		}
		for (const widget of this._widgets) {
			const commentId = widget.findComposerCommentIdForElement(activeElement);
			if (commentId !== undefined) {
				this._composerDraftState.focusedCommentId = commentId;
				return;
			}
		}
	}

	override dispose(): void {
		this._clearWidgets();
		super.dispose();
	}
}

registerEditorContribution(AgentFeedbackEditorWidgetContribution.ID, AgentFeedbackEditorWidgetContribution, EditorContributionInstantiation.Eventually);
