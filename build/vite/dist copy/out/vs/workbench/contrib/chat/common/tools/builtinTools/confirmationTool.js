/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ToolDataSource, ToolInvocationPresentation } from '../languageModelToolsService.js';
export const ConfirmationToolId = 'vscode_get_confirmation';
export const ConfirmationToolWithOptionsId = 'vscode_get_confirmation_with_options';
export const ModifiedFilesConfirmationToolId = 'vscode_get_modified_files_confirmation';
export const ConfirmationToolData = {
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
export const ConfirmationToolWithOptionsData = {
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
export const ModifiedFilesConfirmationToolData = {
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
export class ConfirmationTool {
    async prepareToolInvocation(context, token) {
        const parameters = context.parameters;
        if (!parameters.title || !parameters.message) {
            throw new Error('Missing required parameters for ConfirmationTool');
        }
        const confirmationType = parameters.confirmationType ?? 'basic';
        // Create different tool-specific data based on confirmation type
        let toolSpecificData;
        if (confirmationType === 'terminal') {
            // For terminal confirmations, use the terminal tool data structure
            toolSpecificData = {
                kind: 'terminal',
                commandLine: {
                    original: parameters.terminalCommand ?? ''
                },
                language: 'bash'
            };
        }
        else {
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
    async invoke(invocation, countTokens, progress, token) {
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
export class ModifiedFilesConfirmationTool {
    async prepareToolInvocation(context, token) {
        const parameters = context.parameters;
        if (!parameters.title || !parameters.message) {
            throw new Error('Missing required parameters for ModifiedFilesConfirmationTool');
        }
        if (!parameters.options?.length) {
            throw new Error('ModifiedFilesConfirmationTool requires at least one option');
        }
        const toolSpecificData = {
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
    async invoke(invocation, countTokens, progress, token) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlybWF0aW9uVG9vbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Rvb2xzL2J1aWx0aW5Ub29scy9jb25maXJtYXRpb25Ub29sLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFM0QsT0FBTyxFQUF1SSxjQUFjLEVBQUUsMEJBQTBCLEVBQWdCLE1BQU0saUNBQWlDLENBQUM7QUFFaFAsTUFBTSxDQUFDLE1BQU0sa0JBQWtCLEdBQUcseUJBQXlCLENBQUM7QUFDNUQsTUFBTSxDQUFDLE1BQU0sNkJBQTZCLEdBQUcsc0NBQXNDLENBQUM7QUFDcEYsTUFBTSxDQUFDLE1BQU0sK0JBQStCLEdBQUcsd0NBQXdDLENBQUM7QUFFeEYsTUFBTSxDQUFDLE1BQU0sb0JBQW9CLEdBQWM7SUFDOUMsRUFBRSxFQUFFLGtCQUFrQjtJQUN0QixXQUFXLEVBQUUsbUJBQW1CO0lBQ2hDLGdCQUFnQixFQUFFLCtIQUErSDtJQUNqSixNQUFNLEVBQUUsY0FBYyxDQUFDLFFBQVE7SUFDL0IsV0FBVyxFQUFFO1FBQ1osSUFBSSxFQUFFLFFBQVE7UUFDZCxVQUFVLEVBQUU7WUFDWCxLQUFLLEVBQUU7Z0JBQ04sSUFBSSxFQUFFLFFBQVE7Z0JBQ2QsV0FBVyxFQUFFLG1DQUFtQzthQUNoRDtZQUNELE9BQU8sRUFBRTtnQkFDUixJQUFJLEVBQUUsUUFBUTtnQkFDZCxXQUFXLEVBQUUsNENBQTRDO2FBQ3pEO1lBQ0QsZ0JBQWdCLEVBQUU7Z0JBQ2pCLElBQUksRUFBRSxRQUFRO2dCQUNkLElBQUksRUFBRSxDQUFDLE9BQU8sRUFBRSxVQUFVLENBQUM7Z0JBQzNC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