/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { localize } from '../../../../../nls.js';
import { ChatInputNotificationActionKind, IChatInputNotificationCommandAction } from '../widget/input/chatInputNotificationService.js';

export const copilotHarnessIntroductionCopyVariants = ['current', 'capabilities', 'agent', 'original'] as const;
export type CopilotHarnessIntroductionCopyVariant = typeof copilotHarnessIntroductionCopyVariants[number];

export const copilotHarnessIntroductionButtonVariants = ['dismiss', 'feedback'] as const;
export type CopilotHarnessIntroductionButtonVariant = typeof copilotHarnessIntroductionButtonVariants[number];

export const copilotHarnessIntroductionLearnMoreCommandId = 'workbench.action.chat.agentsParallelWork.learnMore';
export const copilotHarnessIntroductionFeedbackCommandId = 'workbench.action.chat.agentsParallelWork.feedback';

export function getCopilotHarnessIntroductionContent(
	copy: CopilotHarnessIntroductionCopyVariant = 'current',
	buttons: CopilotHarnessIntroductionButtonVariant = 'dismiss',
): { title: string; description: string; actions: IChatInputNotificationCommandAction[]; dismissible: boolean } {
	const feedbackUrl = 'https://github.com/microsoft/vscode/issues';
	let title = localize('copilotHarnessTitle', "You're using a new Copilot experience");
	let description: string;
	switch (copy) {
		case 'current':
			description = localize('copilotHarnessDescription', "This agent harness opens up new ways to work across windows and apps. Continue as usual, and [let us know]({0}) how it goes.", feedbackUrl);
			break;
		case 'capabilities':
			description = localize('copilotHarnessCapabilitiesDescription', "This agent harness brings new capabilities to the way you already work. If anything seems off, [let us know]({0}).", feedbackUrl);
			break;
		case 'agent':
			title = localize('copilotHarnessAgentTitle', "You're using a new Copilot agent");
			description = localize('copilotHarnessAgentDescription', "Continue your sessions across windows and apps, without changing how you work. [Let us know]({0}) how it goes.", feedbackUrl);
			break;
		case 'original':
			description = localize('copilotHarnessOriginalDescription', "This new implementation unlocks exciting new capabilities, while previous agent harnesses remain available. If anything seems off, [let us know]({0}).", feedbackUrl);
			break;
	}

	const feedbackButtons = buttons === 'feedback';
	const actions: IChatInputNotificationCommandAction[] = [{
		kind: ChatInputNotificationActionKind.Command,
		label: localize('learnMore', "Learn More"),
		telemetryActionId: 'docsLink',
		commandId: copilotHarnessIntroductionLearnMoreCommandId,
		primary: false,
		...(feedbackButtons ? { leading: true, outlined: true } : { filled: true }),
		keepOpen: true,
	}, {
		kind: ChatInputNotificationActionKind.Command,
		label: localize('gotIt', "{0} Got it!", `$(${Codicon.thumbsup.id})`),
		ariaLabel: localize('gotItAriaLabel', "Got it!"),
		telemetryActionId: 'thumbsUp',
		commandId: copilotHarnessIntroductionFeedbackCommandId,
		commandArgs: [true],
		primary: true,
		keepOpen: true,
	}];
	if (feedbackButtons) {
		actions.push({
			kind: ChatInputNotificationActionKind.Command,
			label: `$(${Codicon.thumbsdown.id})`,
			ariaLabel: localize('unhelpful', "Not Helpful"),
			iconOnly: true,
			tooltip: localize('unhelpfulTooltip', "Not Helpful"),
			telemetryActionId: 'thumbsDown',
			commandId: copilotHarnessIntroductionFeedbackCommandId,
			commandArgs: [false],
			primary: false,
			keepOpen: true,
		});
	}

	return { title, description, actions, dismissible: !feedbackButtons };
}
