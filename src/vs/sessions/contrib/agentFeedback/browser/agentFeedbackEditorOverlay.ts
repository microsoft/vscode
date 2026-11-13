/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableMap, DisposableStore, MutableDisposable, combinedDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableFromEvent, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { Event } from '../../../../base/common/event.js';
import { Schemas } from '../../../../base/common/network.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { isCodeEditor, isDiffEditor } from '../../../../editor/browser/editorBrowser.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { EditorGroupView } from '../../../../workbench/browser/parts/editor/editorGroupView.js';
import { ViewEditorInput } from '../../../../workbench/browser/parts/editor/viewEditorInput.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { AgentEditorCommentsOverlayWidget } from '../../../../workbench/services/agentEditorComments/browser/agentEditorCommentsOverlayWidget.js';
import { shouldIncludeRawPRReviewComments } from './agentFeedbackService.js';
import { IAgentFeedbackService } from '../../../../workbench/contrib/sessions/browser/agentFeedback.js';
import { hasUnsubmittedAgentFeedback, hasSessionEditorComments, navigateNextFeedbackActionId, navigatePreviousFeedbackActionId, navigationBearingFakeActionId, submitFeedbackActionId } from './agentFeedbackEditorActions.js';
import { getActiveResourceCandidates, getFeedbackSessionCandidates } from './agentFeedbackEditorUtils.js';
import { Menus } from '../../../../workbench/contrib/sessions/browser/menus.js';
import { ICodeReviewService } from '../../../../workbench/contrib/sessions/browser/codeReviewService.js';
import { EmptyFileEditorInput } from '../../../../workbench/contrib/sessions/browser/emptyFileEditorInput.js';
import { getAcceptedAgentFeedbackCommentCount, getSessionEditorComments, ISessionEditorComment } from './sessionEditorComments.js';
import { ISessionHostService, SessionHostKind } from '../../../../workbench/services/sessions/browser/sessionHost.js';
import { ISession } from '../../../../workbench/services/sessions/common/session.js';

export interface IAgentFeedbackOverlayEditorGroup extends IEditorGroup {
	readonly editorPaneContainer: HTMLElement;
}

/**
 * The files whose feedback the overlay of an editor shows: none for an editor that shows no file, such as the empty
 * Files editor, or a view shown as an editor, such as the chat of a chat window, which is a view of the main window.
 */
export function getAgentFeedbackOverlayResourceCandidates(input: Parameters<typeof getActiveResourceCandidates>[0]): ReturnType<typeof getActiveResourceCandidates> {
	return input instanceof EmptyFileEditorInput || input instanceof ViewEditorInput ? [] : getActiveResourceCandidates(input);
}

/**
 * The comment that the navigation of a session should be anchored at once the file `resourceUri` is shown: its first
 * comment, unless the current anchor already is one of its comments, or `undefined` to keep the current anchor.
 */
export function getNavigationAnchorForResource(comments: readonly ISessionEditorComment[], currentAnchorId: string | undefined, resourceUri: URI): string | undefined {
	const commentsOfResource = comments.filter(comment => isEqual(comment.resourceUri, resourceUri) || comment.resourceUri.fsPath === resourceUri.fsPath);
	if (commentsOfResource.length === 0 || commentsOfResource.some(comment => comment.id === currentAnchorId)) {
		return undefined;
	}
	return commentsOfResource[0].id;
}

/**
 * The file that a diff editor shows: its modified side, or its original side when the modified side is the empty
 * synthetic document that stands in for a deleted file, such as in the Changes editor.
 */
export function getDiffEditorResource(model: { readonly original: { readonly uri: URI }; readonly modified: { readonly uri: URI } }): URI {
	const modified = model.modified.uri;
	return modified.scheme === Schemas.inMemory && modified.path.startsWith('/synthetic/') ? model.original.uri : modified;
}

export class AgentFeedbackOverlayController {

	private readonly _store = new DisposableStore();
	private readonly _domNode = document.createElement('div');

	constructor(
		group: IAgentFeedbackOverlayEditorGroup,
		/** The session of the window that owns the group if it shows a session of its own, such as a chat window. */
		hostSession: IObservable<ISession | undefined> | undefined,
		@IAgentFeedbackService agentFeedbackService: IAgentFeedbackService,
		@IInstantiationService instaService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICodeReviewService codeReviewService: ICodeReviewService,
	) {
		const container = group.editorPaneContainer;
		container.classList.add('agent-feedback-editor-overlay-host');
		this._store.add(toDisposable(() => container.classList.remove('agent-feedback-editor-overlay-host')));

		this._domNode.classList.add('agent-feedback-editor-overlay');
		this._domNode.style.position = 'absolute';
		this._domNode.style.bottom = '24px';
		this._domNode.style.right = '24px';
		this._domNode.style.zIndex = '100';

		const widget = this._store.add(instaService.createInstance(AgentEditorCommentsOverlayWidget, {
			menuId: Menus.AgentFeedbackEditorContent,
			submitActionId: submitFeedbackActionId,
			previousActionId: navigatePreviousFeedbackActionId,
			nextActionId: navigateNextFeedbackActionId,
			navigationBearingActionId: navigationBearingFakeActionId,
			telemetrySource: 'agentFeedback.overlayToolbar',
		}));
		this._domNode.appendChild(widget.getDomNode());
		this._store.add(toDisposable(() => this._domNode.remove()));
		const hasCommentsContext = hasSessionEditorComments.bindTo(contextKeyService);
		const hasAgentFeedbackContext = hasUnsubmittedAgentFeedback.bindTo(contextKeyService);

		const show = () => {
			if (!container.contains(this._domNode)) {
				container.appendChild(this._domNode);
			}
		};

		const hide = () => {
			if (container.contains(this._domNode)) {
				widget.hide();
				this._domNode.remove();
			}
		};

		const activeSignal = observableSignalFromEvent(this, Event.any(
			group.onDidActiveEditorChange,
			group.onDidModelChange,
			agentFeedbackService.onDidChangeFeedback,
			agentFeedbackService.onDidChangeFeedbackVisibility,
			agentFeedbackService.onDidChangeNavigation,
			agentFeedbackService.onDidChangeFeedbackScope,
		));

		// When another file becomes active within the editor, such as a file picked in the Changes editor, anchor the
		// navigation at that file's comments so that the counter shows where the user is. This only moves the counter:
		// it does not reveal or focus the comment, which would scroll the file away from where the user put it.
		const controlListener = this._store.add(new MutableDisposable());
		const syncNavigationAnchor = (pane: NonNullable<IEditorGroup['activeEditorPane']>) => {
			const control = pane.getControl();
			const diffModel = isDiffEditor(control) ? control.getModel() : undefined;
			const resourceUri = diffModel ? getDiffEditorResource(diffModel) : isCodeEditor(control) ? control.getModel()?.uri : undefined;
			if (!resourceUri) {
				return;
			}
			const candidates = getAgentFeedbackOverlayResourceCandidates(pane.input);
			for (const { sessionResource } of getFeedbackSessionCandidates(candidates, candidate => agentFeedbackService.getFeedbackSessionResource(candidate, hostSession?.get()))) {
				const comments = getSessionEditorComments(
					sessionResource,
					agentFeedbackService.getFeedback(sessionResource),
					codeReviewService.getPRReviewState(sessionResource).get(),
					agentFeedbackService.getVisibleResolvedFeedbackIds(sessionResource),
					shouldIncludeRawPRReviewComments(agentFeedbackService, sessionResource),
				);
				if (comments.length > 0) {
					const currentAnchorId = comments[agentFeedbackService.getNavigationBearing(sessionResource, comments).activeIdx]?.id;
					const anchorId = getNavigationAnchorForResource(comments, currentAnchorId, resourceUri);
					if (anchorId) {
						agentFeedbackService.setNavigationAnchor(sessionResource, anchorId, { reveal: false });
					}
					return;
				}
			}
		};
		const listenToActiveControl = () => {
			const pane = group.activeEditorPane;
			if (!pane) {
				controlListener.clear();
				return;
			}
			controlListener.value = pane.onDidChangeControl(() => syncNavigationAnchor(pane));
			// The editor may have shown its file before the group announced it as active.
			syncNavigationAnchor(pane);
		};
		listenToActiveControl();
		this._store.add(group.onDidActiveEditorChange(listenToActiveControl));

		this._store.add(autorun(r => {
			activeSignal.read(r);

			const activeInput = group.activeEditorPane?.input;
			const candidates = getAgentFeedbackOverlayResourceCandidates(activeInput);
			// In a window that shows a session of its own, such as a chat window, its files are that session's, whichever is active.
			const host = hostSession?.read(r);
			let navigationBearings = undefined;
			let acceptedFeedbackCount = 0;
			for (const { sessionResource } of getFeedbackSessionCandidates(candidates, candidate => agentFeedbackService.getFeedbackSessionResource(candidate, host))) {
				const comments = getSessionEditorComments(
					sessionResource,
					agentFeedbackService.getFeedback(sessionResource),
					codeReviewService.getPRReviewState(sessionResource).read(r),
					agentFeedbackService.getVisibleResolvedFeedbackIds(sessionResource),
					shouldIncludeRawPRReviewComments(agentFeedbackService, sessionResource),
				);
				if (comments.length > 0) {
					navigationBearings = agentFeedbackService.getNavigationBearing(sessionResource, comments);
					acceptedFeedbackCount = getAcceptedAgentFeedbackCommentCount(comments);
					break;
				}
			}

			if (!navigationBearings) {
				hasCommentsContext.set(false);
				hasAgentFeedbackContext.set(false);
				hide();
				return;
			}

			hasCommentsContext.set(true);
			hasAgentFeedbackContext.set(acceptedFeedbackCount > 0);
			widget.show(navigationBearings, acceptedFeedbackCount, group);
			show();
		}));
	}

	dispose(): void {
		this._store.dispose();
	}
}

export class AgentFeedbackEditorOverlay implements IWorkbenchContribution {

	static readonly ID = 'chat.agentFeedback.editorOverlay';

	private readonly _store = new DisposableStore();

	constructor(
		@IEditorGroupsService editorGroupsService: IEditorGroupsService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ISessionHostService sessionHostService: ISessionHostService,
	) {
		const editorGroups = observableFromEvent(
			this,
			Event.any(editorGroupsService.onDidAddGroup, editorGroupsService.onDidRemoveGroup),
			() => editorGroupsService.groups
		);

		const overlayWidgets = this._store.add(new DisposableMap<IEditorGroup>());

		this._store.add(autorun(r => {
			const groups = editorGroups.read(r);
			const toDelete = new Set(overlayWidgets.keys());

			for (const group of groups) {
				if (!(group instanceof EditorGroupView)) {
					continue;
				}

				toDelete.delete(group);

				if (!overlayWidgets.has(group)) {
					const scopedInstaService = instantiationService.createChild(
						new ServiceCollection([IContextKeyService, group.scopedContextKeyService])
					);

					// The session of the window of the group, if it shows a session of its own, such as a chat window: not the
					// main window, which floating editor windows belong to too.
					const hostSession = derived(reader => {
						const host = sessionHostService.getHostOfGroup(group, reader);
						return host && host.kind !== SessionHostKind.MainWindow ? host.session.read(reader) : undefined;
					});
					const ctrl = scopedInstaService.createInstance(AgentFeedbackOverlayController, group, hostSession);
					overlayWidgets.set(group, combinedDisposable(ctrl, scopedInstaService));
				}
			}

			for (const group of toDelete) {
				overlayWidgets.deleteAndDispose(group);
			}
		}));
	}

	dispose(): void {
		this._store.dispose();
	}
}
