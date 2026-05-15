/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command, commands, InlineCompletionItem, Uri } from 'vscode';
import { Disposable } from '../../../../../util/vs/base/common/lifecycle';
import { IInstantiationService, ServicesAccessor } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { collectCompletionDiagnostics, formatDiagnosticsAsMarkdown } from '../../lib/src/diagnostics';
import { telemetry, TelemetryData } from '../../lib/src/telemetry';
import { CMDSendCompletionsFeedbackChat } from './constants';

export const sendCompletionFeedbackCommand: Command = {
	command: CMDSendCompletionsFeedbackChat,
	title: 'Send Copilot Completion Feedback',
	tooltip: 'Send feedback about the last shown Copilot completion item',
};

export class CopilotCompletionFeedbackTracker extends Disposable {
	private lastShownCopilotCompletionItem: InlineCompletionItem | undefined;

	constructor(@IInstantiationService private readonly instantiationService: IInstantiationService) {
		super();
		this._register(commands.registerCommand(sendCompletionFeedbackCommand.command, async () => {
			const commandArg: unknown = this.lastShownCopilotCompletionItem?.command?.arguments?.[0];
			let telemetryArg: TelemetryData | undefined;
			if (commandArg && typeof commandArg === 'object' && 'telemetry' in commandArg) {
				if (commandArg.telemetry instanceof TelemetryData) {
					telemetryArg = commandArg.telemetry;
				}
			}
			this.instantiationService.invokeFunction(telemetry, 'ghostText.sentFeedback', telemetryArg);

			await this.instantiationService.invokeFunction(openGitHubIssue, this.lastShownCopilotCompletionItem, telemetryArg);
		}));
	}

	trackItem(item: InlineCompletionItem) {
		this.lastShownCopilotCompletionItem = item;
	}
}

async function openGitHubIssue(
	accessor: ServicesAccessor,
	item: InlineCompletionItem | undefined,
	telemetry: TelemetryData | undefined
) {
	const body = generateGitHubIssueBody(accessor, item, telemetry);
	await commands.executeCommand('workbench.action.openIssueReporter', {
		extensionId: 'github.copilot',
		uri: Uri.parse('https://github.com/microsoft/vscode'),
		data: body,
	});
}

function generateGitHubIssueBody(
	accessor: ServicesAccessor,
	item: InlineCompletionItem | undefined,
	telemetry: TelemetryData | undefined
) {
	const diagnostics = collectCompletionDiagnostics(accessor, telemetry);
	const formattedDiagnostics = formatDiagnosticsAsMarkdown(diagnostics);
	if (typeof item?.insertText !== 'string') {
		return '';
	}

	return `## Copilot Completion Feedback
### Describe the issue, feedback, or steps to reproduce it:


### Completion text:
\`\`\`
${item.insertText}
\`\`\`

<details>
<summary>Diagnostics</summary>

${formattedDiagnostics}

</details>
`;
}
