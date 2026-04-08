/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './agentFeedbackEditorInputContribution.js';
import './agentFeedbackEditorWidgetContribution.js';
import './agentFeedbackOverviewRulerContribution.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, observableFromEvent } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService, ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { AgentFeedbackService, IAgentFeedbackService } from './agentFeedbackService.js';
import { AgentFeedbackAttachmentContribution } from './agentFeedbackAttachment.js';
import { AgentFeedbackAttachmentWidget } from './agentFeedbackAttachmentWidget.js';
import { AgentFeedbackEditorOverlay } from './agentFeedbackEditorOverlay.js';
import { hasActiveSessionAgentFeedback, registerAgentFeedbackEditorActions, submitActiveSessionFeedbackActionId } from './agentFeedbackEditorActions.js';
import { IChatAttachmentWidgetRegistry } from '../../../../workbench/contrib/chat/browser/attachments/chatAttachmentWidgetRegistry.js';
import { IAgentFeedbackVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

/**
 * Sets the `hasActiveSessionAgentFeedback` context key to true when the
 * currently active session has pending agent feedback items.
 */
class ActiveSessionFeedbackContextContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.activeSessionFeedbackContext';

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IAgentFeedbackService agentFeedbackService: IAgentFeedbackService,
		@ISessionsManagementService sessionManagementService: ISessionsManagementService,
	) {
		super();

		const contextKey = hasActiveSessionAgentFeedback.bindTo(contextKeyService);
		const menuRegistration = this._register(new MutableDisposable());

		const feedbackChanged = observableFromEvent(
			this,
			agentFeedbackService.onDidChangeFeedback,
			e => e,
		);

		this._register(autorun(reader => {
			feedbackChanged.read(reader);
			const activeSession = sessionManagementService.activeSession.read(reader);
			menuRegistration.clear();
			if (!activeSession) {
				contextKey.set(false);
				return;
			}
			const feedback = agentFeedbackService.getFeedback(activeSession.resource);
			const count = feedback.length;
			contextKey.set(count > 0);

			if (count > 0) {
				menuRegistration.value = MenuRegistry.appendMenuItem(MenuId.ChatEditingSessionApplySubmenu, {
					command: {
						id: submitActiveSessionFeedbackActionId,
						icon: Codicon.comment,
						title: localize('agentFeedback.submitFeedbackCount', "Submit Feedback ({0})", count),
					},
					group: 'navigation',
					order: 3,
					when: ContextKeyExpr.and(IsSessionsWindowContext, hasActiveSessionAgentFeedback),
				});
			}
		}));
	}
}

registerWorkbenchContribution2(ActiveSessionFeedbackContextContribution.ID, ActiveSessionFeedbackContextContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(AgentFeedbackEditorOverlay.ID, AgentFeedbackEditorOverlay, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(AgentFeedbackAttachmentContribution.ID, AgentFeedbackAttachmentContribution, WorkbenchPhase.AfterRestored);

registerAgentFeedbackEditorActions();

registerSingleton(IAgentFeedbackService, AgentFeedbackService, InstantiationType.Delayed);

// Register the custom attachment widget for agentFeedback attachments
class AgentFeedbackAttachmentWidgetContribution {
	static readonly ID = 'workbench.contrib.agentFeedbackAttachmentWidgetFactory';
	constructor(
		@IChatAttachmentWidgetRegistry registry: IChatAttachmentWidgetRegistry,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		registry.registerFactory('agentFeedback', (attachment, options, container) => {
			return instantiationService.createInstance(AgentFeedbackAttachmentWidget, attachment as IAgentFeedbackVariableEntry, options, container);
		});
	}
}
registerWorkbenchContribution2(AgentFeedbackAttachmentWidgetContribution.ID, AgentFeedbackAttachmentWidgetContribution, WorkbenchPhase.AfterRestored);
