/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { combinedDisposable, Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, observableFromEvent, observableSignalFromEvent } from '../../../../../base/common/observable.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { localize } from '../../../../../nls.js';
import { EditorGroupView } from '../../../../browser/parts/editor/editorGroupView.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { EditorFeedbackOverlayWidget } from '../feedback/editorFeedbackOverlayWidget.js';
import { clearAllPlanReviewFeedbackActionId, hasPlanReviewFeedback, navigationBearingFakeActionId, PlanReviewFeedbackMenuId } from './planReviewFeedbackEditorActions.js';
import { IPlanReviewFeedbackService } from './planReviewFeedbackService.js';

class PlanReviewFeedbackOverlayController extends Disposable {

	constructor(
		container: HTMLElement,
		group: IEditorGroup,
		@IPlanReviewFeedbackService planReviewFeedbackService: IPlanReviewFeedbackService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		const overlay = document.createElement('div');
		overlay.classList.add('agent-feedback-editor-overlay');
		overlay.style.position = 'absolute';
		overlay.style.bottom = '24px';
		overlay.style.right = '24px';
		overlay.style.zIndex = '101';
		this._register(toDisposable(() => overlay.remove()));

		const widget = this._register(instantiationService.createInstance(EditorFeedbackOverlayWidget));
		overlay.appendChild(widget.getDomNode());
		const hasFeedbackContext = hasPlanReviewFeedback.bindTo(contextKeyService);
		const activeSignal = observableSignalFromEvent(this, Event.any(
			group.onDidActiveEditorChange,
			group.onDidModelChange,
			planReviewFeedbackService.onDidChangeFeedback,
			planReviewFeedbackService.onDidChangeNavigation,
			planReviewFeedbackService.onDidChangeRegistrations,
		));

		this._register(autorun(reader => {
			activeSignal.read(reader);
			const resource = group.activeEditor?.resource;
			const review = resource ? planReviewFeedbackService.getPlanReview(resource) : undefined;
			if (!resource || !review) {
				hasFeedbackContext.set(false);
				widget.hide();
				overlay.remove();
				return;
			}

			if (!container.contains(overlay)) {
				container.appendChild(overlay);
			}
			const feedbackCount = planReviewFeedbackService.getFeedback(resource).length;
			hasFeedbackContext.set(feedbackCount > 0);
			widget.showPlan({
				key: resource.toString(),
				actions: review.actions,
				feedbackCount,
				input: review.canProvideFeedback ? {
					placeholder: localize('planReviewFeedback.overallFeedback', 'Overall Feedback'),
					ariaLabel: localize('planReviewFeedback.overallFeedbackAriaLabel', 'Overall plan feedback'),
				} : undefined,
				submitFeedbackLabel: localize('planReviewFeedback.submitFeedback', 'Submit Feedback'),
				submitFeedbackWithCountLabel: count => localize('planReviewFeedback.submitFeedbackWithCount', 'Submit Feedback ({0})', count),
				rejectLabel: localize('planReviewFeedback.reject', 'Reject'),
				onSubmitFeedback: value => review.submitFeedback(value),
				onSubmitAction: action => review.submitAction(action),
				onReject: review.reject,
				navigation: {
					menuId: PlanReviewFeedbackMenuId,
					bearingActionId: navigationBearingFakeActionId,
					clearActionId: clearAllPlanReviewFeedbackActionId,
					bearings: planReviewFeedbackService.getNavigationBearing(resource),
				},
			});
		}));
	}
}

export class PlanReviewFeedbackEditorOverlay implements IWorkbenchContribution {

	static readonly ID = 'chat.planReviewFeedback.editorOverlay';

	private readonly _store = new DisposableStore();

	constructor(
		@IEditorGroupsService editorGroupsService: IEditorGroupsService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		const editorGroups = observableFromEvent(
			this,
			Event.any(editorGroupsService.onDidAddGroup, editorGroupsService.onDidRemoveGroup),
			() => editorGroupsService.groups,
		);
		const overlays = this._store.add(new DisposableMap<IEditorGroup>());
		this._store.add(autorun(reader => {
			const groups = editorGroups.read(reader);
			const toDelete = new Set(overlays.keys());
			for (const group of groups) {
				if (!(group instanceof EditorGroupView)) {
					continue;
				}
				toDelete.delete(group);
				if (!overlays.has(group)) {
					const scopedInstantiationService = instantiationService.createChild(
						new ServiceCollection([IContextKeyService, group.scopedContextKeyService]),
					);
					const controller = scopedInstantiationService.createInstance(PlanReviewFeedbackOverlayController, group.element, group);
					overlays.set(group, combinedDisposable(controller, scopedInstantiationService));
				}
			}
			for (const group of toDelete) {
				overlays.deleteAndDispose(group);
			}
		}));
	}

	dispose(): void {
		this._store.dispose();
	}
}

registerWorkbenchContribution2(PlanReviewFeedbackEditorOverlay.ID, PlanReviewFeedbackEditorOverlay, WorkbenchPhase.AfterRestored);
