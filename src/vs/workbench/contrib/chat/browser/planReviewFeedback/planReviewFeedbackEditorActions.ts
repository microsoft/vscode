/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { URI } from '../../../../../base/common/uri.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { isCodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { IPlanReviewFeedbackService } from './planReviewFeedbackService.js';
import { CHAT_CATEGORY } from '../actions/chatActions.js';

export const PlanReviewFeedbackMenuId = MenuId.for('planReviewFeedback.editorContent');

export const hasPlanReviewFeedback = new RawContextKey<boolean>('planReviewFeedback.hasFeedback', false);

export const submitPlanReviewFeedbackActionId = 'planReviewFeedback.action.submit';
export const navigatePreviousPlanReviewFeedbackActionId = 'planReviewFeedback.action.navigatePrevious';
export const navigateNextPlanReviewFeedbackActionId = 'planReviewFeedback.action.navigateNext';
export const clearAllPlanReviewFeedbackActionId = 'planReviewFeedback.action.clearAll';
export const navigationBearingFakeActionId = 'planReviewFeedback.navigation.bearings';

function getActivePlanUri(accessor: ServicesAccessor): URI | undefined {
	const editorService = accessor.get(IEditorService);
	const planReviewFeedbackService = accessor.get(IPlanReviewFeedbackService);

	const activeEditor = editorService.activeEditor;
	if (!activeEditor) {
		return undefined;
	}

	const resource = activeEditor.resource;
	if (!resource) {
		return undefined;
	}

	if (planReviewFeedbackService.isActivePlanReview(resource)) {
		return resource;
	}

	return undefined;
}

class SubmitPlanReviewFeedbackAction extends Action2 {

	constructor() {
		super({
			id: submitPlanReviewFeedbackActionId,
			title: localize2('planReviewFeedback.submit', 'Submit Feedback'),
			shortTitle: localize2('planReviewFeedback.submitShort', 'Submit'),
			icon: Codicon.send,
			category: CHAT_CATEGORY,
			precondition: hasPlanReviewFeedback,
			menu: {
				id: PlanReviewFeedbackMenuId,
				group: 'a_submit',
				order: 0,
				when: hasPlanReviewFeedback,
			},
		});
	}

	override run(accessor: ServicesAccessor): void {
		const planUri = getActivePlanUri(accessor);
		if (!planUri) {
			return;
		}

		const planReviewFeedbackService = accessor.get(IPlanReviewFeedbackService);
		planReviewFeedbackService.submitAllFeedback(planUri);
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
			precondition: hasPlanReviewFeedback,
			menu: {
				id: PlanReviewFeedbackMenuId,
				group: 'navigate',
				order: _next ? 2 : 1,
				when: hasPlanReviewFeedback,
			},
		});
	}

	override run(accessor: ServicesAccessor): void {
		const planUri = getActivePlanUri(accessor);
		if (!planUri) {
			return;
		}

		const planReviewFeedbackService = accessor.get(IPlanReviewFeedbackService);
		const editorService = accessor.get(IEditorService);

		const item = planReviewFeedbackService.getNextFeedback(planUri, this._next);
		if (!item) {
			return;
		}

		// Reveal the feedback item in the editor
		const editor = editorService.activeTextEditorControl;
		if (editor && isCodeEditor(editor)) {
			editor.revealLineInCenter(item.line);
			editor.setPosition({ lineNumber: item.line, column: item.column });
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
			precondition: hasPlanReviewFeedback,
			menu: {
				id: PlanReviewFeedbackMenuId,
				group: 'a_submit',
				order: 1,
				when: hasPlanReviewFeedback,
			},
		});
	}

	override run(accessor: ServicesAccessor): void {
		const planUri = getActivePlanUri(accessor);
		if (!planUri) {
			return;
		}

		const planReviewFeedbackService = accessor.get(IPlanReviewFeedbackService);
		planReviewFeedbackService.clearFeedback(planUri);
	}
}

export function registerPlanReviewFeedbackEditorActions(): void {
	registerAction2(SubmitPlanReviewFeedbackAction);
	registerAction2(class extends NavigatePlanReviewFeedbackAction { constructor() { super(false); } });
	registerAction2(class extends NavigatePlanReviewFeedbackAction { constructor() { super(true); } });
	registerAction2(ClearAllPlanReviewFeedbackAction);

	MenuRegistry.appendMenuItem(PlanReviewFeedbackMenuId, {
		command: {
			id: navigationBearingFakeActionId,
			title: localize('label', 'Navigation Status'),
			precondition: ContextKeyExpr.false(),
		},
		group: 'navigate',
		order: -1,
		when: hasPlanReviewFeedback,
	});
}
