/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BashInput } from '@anthropic-ai/claude-agent-sdk/sdk-tools';
import { CancellationToken } from '../../../../../util/vs/base/common/cancellation';
import { LanguageModelTextPart } from '../../../../../vscodeTypes';
import { ToolName } from '../../../../tools/common/toolNames';
import { IToolsService } from '../../../../tools/common/toolsService';
import { ClaudeToolPermissionContext, ClaudeToolPermissionResult, IClaudeToolPermissionHandler } from '../claudeToolPermission';
import { registerToolPermissionHandler } from '../claudeToolPermissionRegistry';
import { ClaudeToolNames } from '../claudeTools';

/**
 * Default deny message when user declines a tool
 */
const DenyToolMessage = 'The user declined to run the tool';

/**
 * Handler for the Bash tool.
 * Uses terminal-style confirmation with the command highlighted.
 * See: src/extension/agents/copilotcli/node/permissionHelpers.ts#L126-L127
 */
export class BashToolHandler implements IClaudeToolPermissionHandler<ClaudeToolNames.Bash> {
	public readonly toolNames = [ClaudeToolNames.Bash] as const;

	constructor(
		@IToolsService private readonly toolsService: IToolsService,
	) { }

	public async handle(
		_toolName: ClaudeToolNames.Bash,
		input: BashInput,
		context: ClaudeToolPermissionContext
	): Promise<ClaudeToolPermissionResult> {
		try {
			const result = await this.toolsService.invokeTool(ToolName.CoreTerminalConfirmationTool, {
				input: {
					message: input.description || input.command,
					command: input.command,
					isBackground: input.run_in_background ?? false
				},
				toolInvocationToken: context.toolInvocationToken,
			}, CancellationToken.None);

			const firstResultPart = result.content.at(0);
			if (firstResultPart instanceof LanguageModelTextPart && firstResultPart.value === 'yes') {
				return {
					behavior: 'allow',
					updatedInput: input as unknown as Record<string, unknown>
				};
			}
		} catch { }

		return {
			behavior: 'deny',
			message: DenyToolMessage
		};
	}
}

// Self-register the handler
registerToolPermissionHandler(
	[ClaudeToolNames.Bash],
	BashToolHandler
);
