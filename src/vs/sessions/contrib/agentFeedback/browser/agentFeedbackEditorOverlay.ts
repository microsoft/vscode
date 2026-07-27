/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableMap, DisposableStore, combinedDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, observableFromEvent, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { Event } from '../../../../base/common/event.js';
import { DisposableResizeObserver, getWindow } from '../../../../base/browser/dom.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { EditorGroupView } from '../../../../workbench/browser/parts/editor/editorGroupView.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IAgentFeedbackService } from './agentFeedbackService.js';
import { clearAllFeedbackActionId, hasUnsubmittedAgentFeedback, hasSessionEditorComments, navigateNextFeedbackActionId, navigatePreviousFeedbackActionId, navigationBearingFakeActionId, submitFeedbackActionId } from './agentFeedbackEditorActions.js';
import { localize } from '../../../../nls.js';
import { getActiveResourceCandidates } from './agentFeedbackEditorUtils.js';
import { Menus } from '../../../browser/menus.js';
import { ICodeReviewService } from '../../codeReview/browser/codeReviewService.js';
import { getAcceptedAgentFeedbackCommentCount, getSessionEditorComments } from './sessionEditorComments.js';
import { EditorFeedbackOverlayWidget } from '../../../../workbench/contrib/chat/browser/feedback/editorFeedbackOverlayWidget.js';
import { IPlanReviewFeedbackService } from '../../../../workbench/contrib/chat/browser/planReviewFeedback/planReviewFeedbackService.js';

export { EditorFeedbackOverlayWidget as AgentFeedbackOverlayWidget };

class AgentFeedbackOverlayController {

	private readonly _store = new DisposableStore();
	private readonly _domNode = document.createElement('div');

	constructor(
		container: HTMLElement,
		group: IEditorGroup,
		@IAgentFeedbackService agentFeedbackService: IAgentFeedbackService,
		@IInstantiationService instaService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICodeReviewService codeReviewService: ICodeReviewService,
		@IPlanReviewFeedbackService planReviewFeedbackService: IPlanReviewFeedbackService,
	) {
		this._domNode.classList.add('agent-feedback-editor-overlay');
		this._domNode.style.position = 'absolute';
		this._domNode.style.bottom = '24px';
		this._domNode.style.right = '24px';
		this._domNode.style.zIndex = '100';

		const widget = this._store.add(instaService.createInstance(EditorFeedbackOverlayWidget));
		this._domNode.appendChild(widget.getDomNode());
		widget.layout(container.clientWidth);
		const resizeObserver = this._store.add(new DisposableResizeObserver('AgentFeedbackOverlay.layout', entries => {
			widget.layout(entries[0]?.contentRect.width ?? container.clientWidth);
		}, getWindow(container)));
		this._store.add(resizeObserver.observe(container));
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
			agentFeedbackService.onDidChangeNavigation,
			planReviewFeedbackService.onDidChangeRegistrations,
		));

		this._store.add(autorun(r => {
			activeSignal.read(r);

			const candidates = getActiveResourceCandidates(group.activeEditorPane?.input);
			if (candidates.some(candidate => planReviewFeedbackService.isActivePlanReview(candidate))) {
				hasCommentsContext.set(false);
				hasAgentFeedbackContext.set(false);
				hide();
				return;
			}
			let navigationBearings = undefined;
			let acceptedFeedbackCount = 0;
			for (const candidate of candidates) {
				const sessionResource = agentFeedbackService.getSessionForFile(candidate)?.resource;
				if (!sessionResource) {
					continue;
				}

				const comments = getSessionEditorComments(
					sessionResource,
					agentFeedbackService.getFeedback(sessionResource),
					codeReviewService.getPRReviewState(sessionResource).read(r),
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

			hasCommentsContext.set(navigationBearings.totalCount > 0);
			hasAgentFeedbackContext.set(acceptedFeedbackCount > 0);
			widget.showMenu(navigationBearings, acceptedFeedbackCount, {
				menuId: Menus.AgentFeedbackEditorContent,
				navigationBearingActionId: navigationBearingFakeActionId,
				navigatePreviousActionId: navigatePreviousFeedbackActionId,
				navigateNextActionId: navigateNextFeedbackActionId,
				submitActionId: submitFeedbackActionId,
				clearActionId: clearAllFeedbackActionId,
				submitLabel: count => count > 0
					? localize('agentFeedback.submitCountShort', 'Submit {0}', count)
					: localize('agentFeedback.submitFeedback', 'Submit Feedback'),
				editorGroup: group,
			});
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

					const ctrl = scopedInstaService.createInstance(AgentFeedbackOverlayController, group.element, group);
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
