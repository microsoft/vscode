/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IChatModifiedFilesConfirmationData, IChatTerminalToolInvocationData } from '../../chatService/chatService.js';
import { CountTokensCallback, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolInvocationPresentation, ToolProgress } from '../languageModelToolsService.js';

export const ConfirmationToolId = 'vscode_get_confirmation';
export const ConfirmationToolWithOptionsId = 'vscode_get_confirmation_with_options';
export const ModifiedFilesConfirmationToolId = 'vscode_get_modified_files_confirmation';

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

export const ConfirmationToolWithOptionsData: IToolData = {
	id: ConfirmationToolWithOptionsId,
	displayName: 'Confirmation Tool with Options',
	modelDescription: 'A tool that demonstrates different types of confirmations. Takes a title, message, and buttons.',
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
			buttons: {
				type: 'array',
				items: { type: 'string' },
				description: 'Custom button labels to display.'
			}
		},
		required: ['title', 'message', 'buttons'],
		additionalProperties: false
	}
};

export const ModifiedFilesConfirmationToolData: IToolData = {
	id: ModifiedFilesConfirmationToolId,
	displayName: 'Modified Files Confirmation Tool',
	modelDescription: 'A tool that shows a modified-files confirmation UI with a split primary button and a hardcoded cancel action.',
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
			options: {
				type: 'array',
				items: { type: 'string' },
				minItems: 1,
				description: 'Selectable option labels. The first option is used for the primary split button and the remaining options are placed in the dropdown menu.'
			},
			modifiedFiles: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						uri: {
							type: 'string',
							description: 'URI of the modified file.'
						},
						originalUri: {
							type: 'string',
							description: 'Optional original URI used when opening a diff.'
						},
						insertions: {
							type: 'number',
							description: 'Optional number of lines added.'
						},
						deletions: {
							type: 'number',
							description: 'Optional number of lines removed.'
						},
						title: {
							type: 'string',
							description: 'Optional title shown in the file tooltip.'
						},
						description: {
							type: 'string',
							description: 'Optional secondary label shown for the file entry.'
						}
					},
					required: ['uri'],
					additionalProperties: false
				},
				description: 'Modified files to show in the confirmation UI.'
			}
		},
		required: ['title', 'message', 'options', 'modifiedFiles'],
		additionalProperties: false
	}
};

export interface IConfirmationToolParams {
	title: string;
	message: string;
	confirmationType?: 'basic' | 'terminal';
	terminalCommand?: string;
	buttons?: string[];
}

export interface IModifiedFilesConfirmationToolParams {
	title: string;
	message: string;
	options: string[];
	modifiedFiles: {
		uri: string;
		originalUri?: string;
		insertions?: number;
		deletions?: number;
		title?: string;
		description?: string;
	}[];
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
				allowAutoConfirm: (parameters.buttons || []).length ? false : true, // We cannot auto confirm if there are custom buttons, as we don't know which one to select
				customButtons: parameters.buttons,
			},
			toolSpecificData,
			presentation: ToolInvocationPresentation.HiddenAfterComplete
		};
	}

	async invoke(invocation: IToolInvocation, countTokens: CountTokensCallback, progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		// If a custom button was selected, return the button label
		if (invocation.selectedCustomButton) {
			return {
				content: [{
					kind: 'text',
					value: invocation.selectedCustomButton
				}]
			};
		}

		// Default: return 'yes' for standard Allow confirmation
		return {
			content: [{
				kind: 'text',
				value: 'yes' // Consumers should check for this label to know whether the tool was confirmed or skipped
			}]
		};
	}
}

export class ModifiedFilesConfirmationTool implements IToolImpl {
	async prepareToolInvocation(context: IToolInvocationPreparationContext, token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const parameters = context.parameters as IModifiedFilesConfirmationToolParams;
		if (!parameters.title || !parameters.message) {
			throw new Error('Missing required parameters for ModifiedFilesConfirmationTool');
		}

		if (!parameters.options?.length) {
			throw new Error('ModifiedFilesConfirmationTool requires at least one option');
		}

		const toolSpecificData: IChatModifiedFilesConfirmationData = {
			kind: 'modifiedFilesConfirmation',
			options: parameters.options,
			modifiedFiles: parameters.modifiedFiles.map(file => ({
				uri: URI.parse(file.uri).toJSON(),
				originalUri: file.originalUri ? URI.parse(file.originalUri).toJSON() : undefined,
				insertions: file.insertions,
				deletions: file.deletions,
				title: file.title,
				description: file.description,
			})),
		};

		return {
			confirmationMessages: {
				title: parameters.title,
				message: new MarkdownString(parameters.message),
				allowAutoConfirm: false,
			},
			toolSpecificData,
			presentation: ToolInvocationPresentation.HiddenAfterComplete
		};
	}

	async invoke(invocation: IToolInvocation, countTokens: CountTokensCallback, progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		// If a custom button was selected, return the button label
		if (invocation.selectedCustomButton) {
			return {
				content: [{
					kind: 'text',
					value: invocation.selectedCustomButton
				}]
			};
		}

		// Default: return 'yes' for standard Allow confirmation
		return {
			content: [{
				kind: 'text',
				value: 'yes' // Consumers should check for this label to know whether the tool was confirmed or skipped
			}]
		};
	}
}
