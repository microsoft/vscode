/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../../common/views.js';
import { ChatViewContainerId } from '../../../chat/browser/chat.js';

/** What happened to the chat part, or to the Chat view because of it. */
export type AgentsChatPartAction = 'open' | 'close' | 'restore' | 'hideChatView' | 'restoreChatView';

type AgentsChatPartEvent = {
	action: AgentsChatPartAction;
	tabCount: number;
	chatViewLocation: 'auxiliarybar' | 'panel' | 'sidebar' | 'none';
};

type AgentsChatPartClassification = {
	action: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'What happened: the chat part opened, closed or restored after a reload, or the Chat view was hidden or shown again because of it.' };
	tabCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'How many chat tabs the chat part has after the action.' };
	chatViewLocation: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Where the Chat view is: Secondary Side Bar, panel, Primary Side Bar, or none.' };
	owner: 'sandy081';
	comment: 'Tracks how the chat part beside the editor area of an editor window with the Sessions view is used, and how it hides and shows the Chat view.';
};

/** Logs what happened to the chat part. Carries no resources, titles or names. */
export function logAgentsChatPartAction(telemetryService: ITelemetryService, viewDescriptorService: IViewDescriptorService, action: AgentsChatPartAction, tabCount: number): void {
	telemetryService.publicLog2<AgentsChatPartEvent, AgentsChatPartClassification>('agentsView.chatPart', {
		action,
		tabCount,
		chatViewLocation: chatViewLocationOf(viewDescriptorService),
	});
}

function chatViewLocationOf(viewDescriptorService: IViewDescriptorService): AgentsChatPartEvent['chatViewLocation'] {
	const container = viewDescriptorService.getViewContainerById(ChatViewContainerId);
	switch (container ? viewDescriptorService.getViewContainerLocation(container) : null) {
		case ViewContainerLocation.AuxiliaryBar: return 'auxiliarybar';
		case ViewContainerLocation.Panel: return 'panel';
		case ViewContainerLocation.Sidebar: return 'sidebar';
		default: return 'none';
	}
}
