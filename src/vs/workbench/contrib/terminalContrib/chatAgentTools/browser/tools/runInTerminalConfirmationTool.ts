/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { CountTokensCallback, IPreparedToolInvocation, IToolData, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolInvocationPresentation, ToolProgress } from '../../../../chat/common/tools/languageModelToolsService.js';
import { RunInTerminalTool } from './runInTerminalTool.js';

export const ConfirmTerminalCommandToolData: IToolData = {
	id: 'vscode_get_terminal_confirmation',
	displayName: localize('confirmTerminalCommandTool.displayName', 'Confirm Terminal Command'),
	modelDescription: [
		'This tool allows you to get explicit user confirmation for a terminal command without executing it.',
		'',
		'When to use:',
		'- When you need to verify user approval before executing a command',
		'- When you want to show command details, auto-approval status, and simplified versions to the user',
		'- When you need the user to review a potentially risky command',
		'',
		'The tool will:',
		'- Show the command with syntax highlighting',
		'- Display auto-approval status if enabled',
		'- Show simplified version of the command if applicable',
		'- Provide custom actions for creating auto-approval rules',
		'- Return approval/rejection status',
		'',
		'After confirmation, use a tool to actually execute the command.'
	].join('\n'),
	userDescription: localize('confirmTerminalCommandTool.userDescription', 'Tool for confirming terminal commands'),
	source: ToolDataSource.Internal,
	icon: Codicon.shield,
	inputSchema: {
		type: 'object',
		properties: {
			command: {
				type: 'string',
				description: 'The command to confirm with the user.'
			},
			explanation: {
				type: 'string',
				description: 'A one-sentence description of what the command does. This will be shown to the user in the confirmation dialog.'
			},
			isBackground: {
				type: 'boolean',
				description: 'Whether the command would start a background process. This provides context for the confirmation.'
			},
		},
		required: [
			'command',
			'explanation',
			'isBackground',
		]
	}
};

export class ConfirmTerminalCommandTool extends RunInTerminalTool {
	override async prepareToolInvocation(context: IToolInvocationPreparationContext, token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		// Safe-guard: If session is the chat provider specific id
		// then convert it to the session id understood by chat service
		try {
			const sessionUri = context.chatSessionId ? URI.parse(context.chatSessionId) : undefined;
			const sessionId = sessionUri ? this._chatService.getSession(sessionUri)?.sessionId : undefined;
			if (sessionId) {
				context.chatSessionId = sessionId;
			}
		}
		catch {
			// Ignore parse errors or session lookup failures; fallback to using the original chatSessionId.
		}
		const preparedInvocation = await super.prepareToolInvocation(context, token);
		if (preparedInvocation) {
			preparedInvocation.presentation = ToolInvocationPresentation.HiddenAfterComplete;
		}
		return preparedInvocation;
	}
	override async invoke(invocation: IToolInvocation, countTokens: CountTokensCallback, progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		// This is a confirmation-only tool - just return success
		return {
			content: [{
				kind: 'text',
				value: 'yes'
			}]
		};
	}
}
