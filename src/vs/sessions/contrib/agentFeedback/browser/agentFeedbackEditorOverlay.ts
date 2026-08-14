/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableMap, DisposableStore, combinedDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, observableFromEvent, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { Event } from '../../../../base/common/event.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { EditorGroupView } from '../../../../workbench/browser/parts/editor/editorGroupView.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { AgentEditorCommentsOverlayWidget } from '../../../../workbench/services/agentEditorComments/browser/agentEditorCommentsOverlayWidget.js';
import { IAgentFeedbackService } from './agentFeedbackService.js';
import { hasUnsubmittedAgentFeedback, hasSessionEditorComments, navigateNextFeedbackActionId, navigatePreviousFeedbackActionId, navigationBearingFakeActionId, submitFeedbackActionId } from './agentFeedbackEditorActions.js';
import { getActiveResourceCandidates } from './agentFeedbackEditorUtils.js';
import { Menus } from '../../../browser/menus.js';
import { ICodeReviewService } from '../../codeReview/browser/codeReviewService.js';
import { getAcceptedAgentFeedbackCommentCount, getSessionEditorComments } from './sessionEditorComments.js';

export interface IAgentFeedbackOverlayEditorGroup extends IEditorGroup {
	readonly editorPaneContainer: HTMLElement;
}

export class AgentFeedbackOverlayController {

	private readonly _store = new DisposableStore();
	private readonly _domNode = document.createElement('div');

	constructor(
		group: IAgentFeedbackOverlayEditorGroup,
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
			agentFeedbackService.onDidChangeNavigation,
			agentFeedbackService.onDidChangeFeedbackScope,
		));

		this._store.add(autorun(r => {
			activeSignal.read(r);

			const candidates = getActiveResourceCandidates(group.activeEditorPane?.input);
			let navigationBearings = undefined;
			let acceptedFeedbackCount = 0;
			for (const candidate of candidates) {
				const sessionResource = agentFeedbackService.getFeedbackSessionResource(candidate);
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

					const ctrl = scopedInstaService.createInstance(AgentFeedbackOverlayController, group);
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
