/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { combinedDisposable, Disposable, DisposableMap, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, observableFromEvent, observableSignalFromEvent } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { EditorGroupView } from '../../../../browser/parts/editor/editorGroupView.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../../common/editor.js';
import { AgentEditorCommentsOverlayWidget } from '../../../../services/agentEditorComments/browser/agentEditorCommentsOverlayWidget.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IListService } from '../../../../../platform/list/browser/listService.js';
import { resolveCommandsContext } from '../../../../browser/parts/editor/editorCommandsContext.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { CHAT_CATEGORY } from '../actions/chatActions.js';
import { IPlanReviewFeedbackService } from './planReviewFeedbackService.js';

const PlanReviewFeedbackEditorMenu = MenuId.for('planReviewFeedback.editorContent');
const hasPlanReviewFeedback = new RawContextKey<boolean>('planReviewFeedback.hasFeedback', false);
const submitPlanReviewFeedbackActionId = 'planReviewFeedback.action.submit';
const navigatePreviousPlanReviewFeedbackActionId = 'planReviewFeedback.action.navigatePrevious';
const navigateNextPlanReviewFeedbackActionId = 'planReviewFeedback.action.navigateNext';
const clearAllPlanReviewFeedbackActionId = 'planReviewFeedback.action.clearAll';
const navigationBearingFakeActionId = 'planReviewFeedback.navigation.bearings';

function getPlanReviewResource(input: Parameters<typeof EditorResourceAccessor.getOriginalUri>[0], feedbackService: IPlanReviewFeedbackService): URI | undefined {
	const resources = EditorResourceAccessor.getOriginalUri(input, { supportSideBySide: SideBySideEditor.BOTH });
	if (!resources) {
		return undefined;
	}
	if (URI.isUri(resources)) {
		return feedbackService.isActivePlanReview(resources) ? resources : undefined;
	}
	return [resources.secondary, resources.primary].find(resource => resource && feedbackService.isActivePlanReview(resource));
}

function getPlanReviewFromContext(accessor: ServicesAccessor, args: unknown[]): { resource: URI; group: IEditorGroup } | undefined {
	const editorService = accessor.get(IEditorService);
	const editorGroupsService = accessor.get(IEditorGroupsService);
	const resolvedContext = resolveCommandsContext(args, editorService, editorGroupsService, accessor.get(IListService));
	const groupedEditor = resolvedContext.groupedEditors[0];
	const group = groupedEditor?.group;
	const input = groupedEditor?.editors[0] ?? group?.activeEditor;
	const resource = getPlanReviewResource(input, accessor.get(IPlanReviewFeedbackService));
	return group && resource ? { resource, group } : undefined;
}

class SubmitPlanReviewFeedbackAction extends Action2 {

	constructor() {
		super({
			id: submitPlanReviewFeedbackActionId,
			title: localize2('planReviewFeedback.submit', 'Submit Feedback'),
			shortTitle: localize2('planReviewFeedback.submitShort', 'Submit'),
			icon: Codicon.send,
			category: CHAT_CATEGORY,
			precondition: ChatContextKeys.enabled,
			menu: {
				id: PlanReviewFeedbackEditorMenu,
				group: 'a_submit',
				order: 0,
				when: ContextKeyExpr.and(ChatContextKeys.enabled, hasPlanReviewFeedback),
			},
		});
	}

	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<boolean> {
		const review = getPlanReviewFromContext(accessor, args);
		if (!review) {
			return false;
		}
		return accessor.get(IPlanReviewFeedbackService).submitAllFeedback(review.resource);
	}
}

class NavigatePlanReviewFeedbackAction extends Action2 {

	constructor(private readonly _next: boolean) {
		super({
			id: _next ? navigateNextPlanReviewFeedbackActionId : navigatePreviousPlanReviewFeedbackActionId,
			title: _next
				? localize2('planReviewFeedback.next', 'Go to Next Feedback Comment')
				: localize2('planReviewFeedback.previous', 'Go to Previous Feedback Comment'),
			icon: _next ? Codicon.arrowDown : Codicon.arrowUp,
			category: CHAT_CATEGORY,
			f1: true,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, hasPlanReviewFeedback),
			menu: {
				id: PlanReviewFeedbackEditorMenu,
				group: 'navigate',
				order: _next ? 2 : 1,
				when: ContextKeyExpr.and(ChatContextKeys.enabled, hasPlanReviewFeedback),
			},
		});
	}

	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const review = getPlanReviewFromContext(accessor, args);
		if (!review) {
			return;
		}
		const item = accessor.get(IPlanReviewFeedbackService).getNextFeedback(review.resource, this._next);
		if (item) {
			await accessor.get(IEditorService).openEditor({
				resource: item.resource,
				options: {
					revealIfOpened: true,
					selection: { startLineNumber: item.line, startColumn: item.column },
				},
			}, review.group);
		}
	}
}

class ClearAllPlanReviewFeedbackAction extends Action2 {

	constructor() {
		super({
			id: clearAllPlanReviewFeedbackActionId,
			title: localize2('planReviewFeedback.clear', 'Clear'),
			tooltip: localize2('planReviewFeedback.clearAllTooltip', 'Clear All Feedback'),
			icon: Codicon.clearAll,
			category: CHAT_CATEGORY,
			f1: true,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, hasPlanReviewFeedback),
			menu: {
				id: PlanReviewFeedbackEditorMenu,
				group: 'a_submit',
				order: 1,
				when: ContextKeyExpr.and(ChatContextKeys.enabled, hasPlanReviewFeedback),
			},
		});
	}

	override run(accessor: ServicesAccessor, ...args: unknown[]): void {
		const review = getPlanReviewFromContext(accessor, args);
		if (review) {
			accessor.get(IPlanReviewFeedbackService).clearFeedback(review.resource);
		}
	}
}

class PlanReviewFeedbackOverlayController extends Disposable {

	constructor(
		container: HTMLElement,
		group: IEditorGroup,
		@IPlanReviewFeedbackService feedbackService: IPlanReviewFeedbackService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		const domNode = document.createElement('div');
		domNode.classList.add('plan-review-feedback-editor-overlay');
		domNode.style.position = 'absolute';
		domNode.style.bottom = '24px';
		domNode.style.right = '24px';
		domNode.style.zIndex = '100';
		this._register(toDisposable(() => domNode.remove()));

		const widget = this._register(instantiationService.createInstance(AgentEditorCommentsOverlayWidget, {
			menuId: PlanReviewFeedbackEditorMenu,
			submitActionId: submitPlanReviewFeedbackActionId,
			previousActionId: navigatePreviousPlanReviewFeedbackActionId,
			nextActionId: navigateNextPlanReviewFeedbackActionId,
			navigationBearingActionId: navigationBearingFakeActionId,
			telemetrySource: 'planReviewFeedback.overlayToolbar',
		}));
		domNode.appendChild(widget.getDomNode());
		const hasFeedbackContext = hasPlanReviewFeedback.bindTo(contextKeyService);
		const activeSignal = observableSignalFromEvent(
			this,
			Event.any(
				group.onDidActiveEditorChange,
				group.onDidModelChange,
				feedbackService.onDidChangeFeedback,
				feedbackService.onDidChangeNavigation,
				feedbackService.onDidChangeRegistrations,
			),
		);

		this._register(autorun(reader => {
			activeSignal.read(reader);
			const resource = getPlanReviewResource(group.activeEditorPane?.input, feedbackService);
			const count = resource ? feedbackService.getFeedback(resource).length : 0;
			hasFeedbackContext.set(count > 0);
			if (!resource || count === 0) {
				widget.hide();
				domNode.remove();
				return;
			}
			widget.show(feedbackService.getNavigationBearing(resource), count, group);
			if (!container.contains(domNode)) {
				container.appendChild(domNode);
			}
		}));
	}
}

export class PlanReviewFeedbackEditorOverlay extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'chat.planReviewFeedback.editorOverlay';

	constructor(
		@IEditorGroupsService editorGroupsService: IEditorGroupsService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
	) {
		super();
		if (environmentService.isSessionsWindow) {
			return;
		}
		const editorGroups = observableFromEvent(
			this,
			Event.any(editorGroupsService.onDidAddGroup, editorGroupsService.onDidRemoveGroup),
			() => editorGroupsService.groups,
		);
		const overlays = this._register(new DisposableMap<IEditorGroup>());
		this._register(autorun(reader => {
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
}

registerAction2(SubmitPlanReviewFeedbackAction);
registerAction2(class extends NavigatePlanReviewFeedbackAction { constructor() { super(false); } });
registerAction2(class extends NavigatePlanReviewFeedbackAction { constructor() { super(true); } });
registerAction2(ClearAllPlanReviewFeedbackAction);

MenuRegistry.appendMenuItem(PlanReviewFeedbackEditorMenu, {
	command: {
		id: navigationBearingFakeActionId,
		title: localize('planReviewFeedback.navigationStatus', 'Navigation Status'),
		precondition: ContextKeyExpr.false(),
	},
	group: 'navigate',
	order: -1,
	when: ContextKeyExpr.and(ChatContextKeys.enabled, hasPlanReviewFeedback),
});

registerWorkbenchContribution2(PlanReviewFeedbackEditorOverlay.ID, PlanReviewFeedbackEditorOverlay, WorkbenchPhase.AfterRestored);
