/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { localize } from '../../../../../../nls.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { parseWorkflowMessagePresentation, type WorkflowMessagePresentation } from '../../../../../../platform/workflow/common/workflowMessage.js';
import { parseWorkflowPrompt } from '../../../../../../platform/workflow/common/workflowPrompt.js';
import { IChatRequestViewModel } from '../../../common/model/chatViewModel.js';
import { ChatAutomatedRequestContentPart, getAutomatedRequestSummaryLabel } from './chatAutomatedRequestContentPart.js';
import './media/chatWorkflowContent.css';

export function getWorkflowRequestPresentation(element: IChatRequestViewModel): WorkflowMessagePresentation | undefined {
	return element.isSystemInitiated && element.systemInitiatedLabel === undefined
		? parseWorkflowMessagePresentation(element.requestSource) : undefined;
}

function getWorkflowParticipant(presentation: WorkflowMessagePresentation): string {
	return localize('chat.workflow.participant', "Workflow {0}", presentation.workflowLabel);
}

function getWorkflowTitle(presentation: WorkflowMessagePresentation): string {
	switch (presentation.reason) {
		case 'repair':
			return localize('chat.workflow.repair', "Repair: {0}", presentation.checkpointLabel);
		case 'missing_proof':
			return localize('chat.workflow.missingProof', "Proof Needed: {0}", presentation.checkpointLabel);
		case 'resume':
		case 'reconcile':
			return localize('chat.workflow.continue', "Continue: {0}", presentation.checkpointLabel);
		default:
			return presentation.checkpointLabel;
	}
}

export function getWorkflowRequestLabel(presentation: WorkflowMessagePresentation): string {
	return getAutomatedRequestSummaryLabel(getWorkflowTitle(presentation), getWorkflowParticipant(presentation));
}

export class ChatWorkflowContentPart extends ChatAutomatedRequestContentPart {
	constructor(
		presentation: WorkflowMessagePresentation,
		message: string,
		timestamp: number | undefined,
		@IHoverService hoverService: IHoverService,
	) {
		const details = parseWorkflowPrompt(message);
		super({
			title: getWorkflowTitle(presentation),
			participant: getWorkflowParticipant(presentation),
			timestamp,
			agentMessage: details ? { text: message, showDetailsLabel: localize('chat.workflow.showDetails', "Show Checkpoint Details") } : undefined,
		}, hoverService);
		this.domNode.classList.add('chat-workflow');
		if (details) {
			dom.append(this.content, dom.$('.chat-workflow-instructions', undefined, details.instructions));
			const proof = dom.append(this.content, dom.$('.chat-workflow-proof'));
			dom.append(proof, dom.$('span.chat-workflow-proof-label', undefined, localize('chat.workflow.proofSchema', "Proof Schema:")));
			dom.append(proof, dom.$('pre.chat-workflow-proof-schema', undefined, details.proofSchema));
		} else {
			dom.append(this.content, dom.$('.chat-automated-request-message-body', undefined, message));
		}
	}
}
