/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './agentFeedbackEditorInputContribution.js';
import './agentFeedbackLineDecorationContribution.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { AgentFeedbackService, IAgentFeedbackService } from './agentFeedbackService.js';
import { AgentFeedbackAttachmentContribution } from './agentFeedbackAttachment.js';
import { AgentFeedbackAttachmentWidget } from './agentFeedbackAttachmentWidget.js';
import { AgentFeedbackEditorOverlay } from './agentFeedbackEditorOverlay.js';
import { registerAgentFeedbackEditorActions } from './agentFeedbackEditorActions.js';
import { IChatAttachmentWidgetRegistry } from '../../../../workbench/contrib/chat/browser/attachments/chatAttachmentWidgetRegistry.js';
import { IAgentFeedbackVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';

registerWorkbenchContribution2(AgentFeedbackEditorOverlay.ID, AgentFeedbackEditorOverlay, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(AgentFeedbackAttachmentContribution.ID, AgentFeedbackAttachmentContribution, WorkbenchPhase.AfterRestored);

registerAgentFeedbackEditorActions();

registerSingleton(IAgentFeedbackService, AgentFeedbackService, InstantiationType.Delayed);

// Register the custom attachment widget for agentFeedback attachments
class AgentFeedbackAttachmentWidgetContribution {
	static readonly ID = 'workbench.contrib.agentFeedbackAttachmentWidgetFactory';
	constructor(@IChatAttachmentWidgetRegistry registry: IChatAttachmentWidgetRegistry) {
		registry.registerFactory('agentFeedback', (instantiationService, attachment, options, container) => {
			return instantiationService.createInstance(AgentFeedbackAttachmentWidget, attachment as IAgentFeedbackVariableEntry, options, container);
		});
	}
}
registerWorkbenchContribution2(AgentFeedbackAttachmentWidgetContribution.ID, AgentFeedbackAttachmentWidgetContribution, WorkbenchPhase.AfterRestored);
