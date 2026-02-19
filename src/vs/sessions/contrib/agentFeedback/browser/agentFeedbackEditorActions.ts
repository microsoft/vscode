/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { URI } from '../../../../base/common/uri.js';
import { isEqual } from '../../../../base/common/resources.js';
import { EditorsOrder, IEditorIdentifier } from '../../../../workbench/common/editor.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { CHAT_CATEGORY } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { IAgentFeedbackService } from './agentFeedbackService.js';
import { getActiveResourceCandidates } from './agentFeedbackEditorUtils.js';
import { Menus } from '../../../browser/menus.js';

export const submitFeedbackActionId = 'agentFeedbackEditor.action.submit';
export const navigatePreviousFeedbackActionId = 'agentFeedbackEditor.action.navigatePrevious';
export const navigateNextFeedbackActionId = 'agentFeedbackEditor.action.navigateNext';
export const clearAllFeedbackActionId = 'agentFeedbackEditor.action.clearAll';
export const navigationBearingFakeActionId = 'agentFeedbackEditor.navigation.bearings';

abstract class AgentFeedbackEditorAction extends Action2 {

	constructor(desc: ConstructorParameters<typeof Action2>[0]) {
		super({
			category: CHAT_CATEGORY,
			...desc,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const agentFeedbackService = accessor.get(IAgentFeedbackService);

		const candidates = getActiveResourceCandidates(editorService.activeEditorPane?.input);
		const sessionResource = candidates
			.map(candidate => agentFeedbackService.getMostRecentSessionForResource(candidate))
			.find((value): value is URI => !!value);
		if (!sessionResource) {
			return;
		}

		return this.runWithSession(accessor, sessionResource);
	}

	abstract runWithSession(accessor: ServicesAccessor, sessionResource: URI): Promise<void> | void;
}

class SubmitFeedbackAction extends AgentFeedbackEditorAction {

	constructor() {
		super({
			id: submitFeedbackActionId,
			title: localize2('agentFeedback.submit', 'Submit Feedback'),
			shortTitle: localize2('agentFeedback.submitShort', 'Submit'),
			icon: Codicon.send,
			precondition: ChatContextKeys.enabled,
			menu: {
				id: Menus.AgentFeedbackEditorContent,
				group: 'a_submit',
				order: 0,
				when: ChatContextKeys.enabled,
			},
		});
	}

	override async runWithSession(accessor: ServicesAccessor, sessionResource: URI): Promise<void> {
		const chatWidgetService = accessor.get(IChatWidgetService);
		const agentFeedbackService = accessor.get(IAgentFeedbackService);
		const editorService = accessor.get(IEditorService);

		const widget = chatWidgetService.getWidgetBySessionResource(sessionResource);
		if (!widget) {
			return;
		}

		// Close all editors belonging to the session resource
		const editorsToClose: IEditorIdentifier[] = [];
		for (const { editor, groupId } of editorService.getEditors(EditorsOrder.SEQUENTIAL)) {
			const candidates = getActiveResourceCandidates(editor);
			const belongsToSession = candidates.some(uri =>
				isEqual(agentFeedbackService.getMostRecentSessionForResource(uri), sessionResource)
			);
			if (belongsToSession) {
				editorsToClose.push({ editor, groupId });
			}
		}
		if (editorsToClose.length) {
			await editorService.closeEditors(editorsToClose);
		}

		await widget.acceptInput('Act on the provided feedback');
	}
}

class NavigateFeedbackAction extends AgentFeedbackEditorAction {

	constructor(private readonly _next: boolean) {
		super({
			id: _next ? navigateNextFeedbackActionId : navigatePreviousFeedbackActionId,
			title: _next
				? localize2('agentFeedback.next', 'Go to Next Feedback Comment')
				: localize2('agentFeedback.previous', 'Go to Previous Feedback Comment'),
			icon: _next ? Codicon.arrowDown : Codicon.arrowUp,
			f1: true,
			precondition: ChatContextKeys.enabled,
			menu: {
				id: Menus.AgentFeedbackEditorContent,
				group: 'navigate',
				order: _next ? 2 : 1,
				when: ChatContextKeys.enabled,
			},
		});
	}

	override runWithSession(accessor: ServicesAccessor, sessionResource: URI): void {
		const agentFeedbackService = accessor.get(IAgentFeedbackService);
		const editorService = accessor.get(IEditorService);

		const feedback = agentFeedbackService.getNextFeedback(sessionResource, this._next);
		if (!feedback) {
			return;
		}

		editorService.openEditor({
			resource: feedback.resourceUri,
			options: {
				selection: feedback.range,
				preserveFocus: false,
				revealIfVisible: true,
			}
		});
	}
}

class ClearAllFeedbackAction extends AgentFeedbackEditorAction {

	constructor() {
		super({
			id: clearAllFeedbackActionId,
			title: localize2('agentFeedback.clear', 'Clear'),
			tooltip: localize2('agentFeedback.clearAllTooltip', 'Clear All Feedback'),
			icon: Codicon.clearAll,
			f1: true,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled),
			menu: {
				id: Menus.AgentFeedbackEditorContent,
				group: 'a_submit',
				order: 1,
				when: ChatContextKeys.enabled,
			},
		});
	}

	override runWithSession(accessor: ServicesAccessor, sessionResource: URI): void {
		const agentFeedbackService = accessor.get(IAgentFeedbackService);
		agentFeedbackService.clearFeedback(sessionResource);
	}
}

export function registerAgentFeedbackEditorActions(): void {
	registerAction2(SubmitFeedbackAction);
	registerAction2(class extends NavigateFeedbackAction { constructor() { super(false); } });
	registerAction2(class extends NavigateFeedbackAction { constructor() { super(true); } });
	registerAction2(ClearAllFeedbackAction);

	MenuRegistry.appendMenuItem(Menus.AgentFeedbackEditorContent, {
		command: {
			id: navigationBearingFakeActionId,
			title: localize('label', 'Navigation Status'),
			precondition: ContextKeyExpr.false(),
		},
		group: 'navigate',
		order: -1,
		when: ChatContextKeys.enabled,
	});
}
