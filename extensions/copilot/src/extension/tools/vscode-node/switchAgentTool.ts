/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { LanguageModelTextPart, LanguageModelToolResult, MarkdownString } from '../../../vscodeTypes';
import { PlanAgentProvider } from '../../agents/vscode-node/planAgentProvider';
import { ToolName } from '../common/toolNames';
import { ICopilotTool, ToolRegistry } from '../common/toolsRegistry';

interface ISwitchAgentParams {
	agentName: string;
}

export class SwitchAgentTool implements ICopilotTool<ISwitchAgentParams> {
	public static readonly toolName = ToolName.SwitchAgent;
	public static readonly nonDeferred = true;

	async invoke(options: vscode.LanguageModelToolInvocationOptions<ISwitchAgentParams>, token: CancellationToken): Promise<vscode.LanguageModelToolResult> {
		const { agentName } = options.input;

		// Only 'Plan' is supported
		if (agentName !== 'Plan') {
			throw new Error(vscode.l10n.t('Only "Plan" agent is supported'));
		}

		const planAgentBody = PlanAgentProvider.buildAgentBody();

		// Execute command to switch agent
		await vscode.commands.executeCommand('workbench.action.chat.toggleAgentMode', {
			modeId: agentName,
			sessionResource: options.chatSessionResource
		});

		return new LanguageModelToolResult([
			new LanguageModelTextPart(`Switched to ${agentName} agent. You are now the ${agentName} agent. This tool may no longer be available in the new agent.\n\n${planAgentBody}`)
		]);
	}

	prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<ISwitchAgentParams>, token: vscode.CancellationToken): vscode.ProviderResult<vscode.PreparedToolInvocation> {
		const { agentName } = options.input;

		if (agentName !== 'Plan') {
			throw new Error(vscode.l10n.t('Only "Plan" agent is supported. Received: "{0}"', agentName));
		}

		return {
			invocationMessage: new MarkdownString(vscode.l10n.t('Switching to {0} agent', agentName)),
			pastTenseMessage: new MarkdownString(vscode.l10n.t('Switched to {0} agent', agentName))
		};
	}
}

ToolRegistry.registerTool(SwitchAgentTool);
