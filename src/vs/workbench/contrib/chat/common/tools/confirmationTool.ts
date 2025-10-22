/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { IChatTerminalToolInvocationData } from '../chatService.js';
import { CountTokensCallback, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolInvocationPresentation, ToolProgress } from '../languageModelToolsService.js';

export const ConfirmationToolId = 'vscode_get_confirmation';

export const ConfirmationToolData: IToolData = {
	id: ConfirmationToolId,
	displayName: 'Confirmation Tool',
	modelDescription: 'A tool that demonstrates different types of confirmations. Takes a title, message, and confirmation type (basic or terminal).',
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {
			title: {
				type: 'string',
				description: 'Title for the confirmation dialog'
			},
			message: {
				type: 'string',
				description: 'Message to show in the confirmation dialog'
			},
			confirmationType: {
				type: 'string',
				enum: ['basic', 'terminal'],
				description: 'Type of confirmation to show - basic for simple confirmation, terminal for terminal command confirmation'
			},
			terminalCommand: {
				type: 'string',
				description: 'Terminal command to show (only used when confirmationType is "terminal")'
			}
		},
		required: ['title', 'message', 'confirmationType'],
		additionalProperties: false
	}
};

export interface IConfirmationToolParams {
	title: string;
	message: string;
	confirmationType?: 'basic' | 'terminal';
	terminalCommand?: string;
}

export class ConfirmationTool implements IToolImpl {
	async prepareToolInvocation(context: IToolInvocationPreparationContext, token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const parameters = context.parameters as IConfirmationToolParams;
		if (!parameters.title || !parameters.message) {
			throw new Error('Missing required parameters for ConfirmationTool');
		}

		const confirmationType = parameters.confirmationType ?? 'basic';

		// Create different tool-specific data based on confirmation type
		let toolSpecificData: IChatTerminalToolInvocationData | undefined;

		if (confirmationType === 'terminal') {
			// For terminal confirmations, use the terminal tool data structure
			toolSpecificData = {
				kind: 'terminal',
				commandLine: {
					original: parameters.terminalCommand ?? ''
				},
				language: 'bash'
			};
		} else {
			// For basic confirmations, don't set toolSpecificData - this will use the default confirmation UI
			toolSpecificData = undefined;
		}

		return {
			confirmationMessages: {
				title: parameters.title,
				message: new MarkdownString(parameters.message),
				allowAutoConfirm: true
			},
			toolSpecificData,
			presentation: ToolInvocationPresentation.HiddenAfterComplete
		};
	}

	async invoke(invocation: IToolInvocation, countTokens: CountTokensCallback, progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		// This is a no-op tool - just return success
		return {
			content: [{
				kind: 'text',
				value: 'yes' // Consumers should check for this label to know whether the tool was confirmed or skipped
			}]
		};
	}
}
