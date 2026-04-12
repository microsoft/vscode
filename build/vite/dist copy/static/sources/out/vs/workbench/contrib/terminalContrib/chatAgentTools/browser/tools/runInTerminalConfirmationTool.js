/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from '../../../../../../base/common/codicons.js';
import { localize } from '../../../../../../nls.js';
import { ToolDataSource, ToolInvocationPresentation } from '../../../../chat/common/tools/languageModelToolsService.js';
import { RunInTerminalTool } from './runInTerminalTool.js';
export const ConfirmTerminalCommandToolData = {
    id: "vscode_get_terminal_confirmation" /* TerminalToolId.ConfirmTerminalCommand */,
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
            goal: {
                type: 'string',
                description: 'A short description of the goal or purpose of the command.'
            },
            mode: {
                type: 'string',
                enum: ['sync', 'async'],
                description: 'Execution mode this command would use if run.'
            },
        },
        required: [
            'command',
            'explanation',
            'goal',
            'mode',
        ]
    }
};
export class ConfirmTerminalCommandTool extends RunInTerminalTool {
    get _enableCommandLineSandboxRewriting() {
        return false;
    }
    async prepareToolInvocation(context, token) {
        const preparedInvocation = await super.prepareToolInvocation(context, token);
        if (preparedInvocation) {
            preparedInvocation.presentation = ToolInvocationPresentation.HiddenAfterComplete;
        }
        return preparedInvocation;
    }
    async invoke(invocation, countTokens, progress, token) {
        // This is a confirmation-only tool - just return success
        return {
            content: [{
                    kind: 'text',
                    value: 'yes'
                }]
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicnVuSW5UZXJtaW5hbENvbmZpcm1hdGlvblRvb2wuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvY2hhdEFnZW50VG9vbHMvYnJvd3Nlci90b29scy9ydW5JblRlcm1pbmFsQ29uZmlybWF0aW9uVG9vbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDcEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3BELE9BQU8sRUFBNEgsY0FBYyxFQUFFLDBCQUEwQixFQUFnQixNQUFNLDREQUE0RCxDQUFDO0FBQ2hRLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBRzNELE1BQU0sQ0FBQyxNQUFNLDhCQUE4QixHQUFjO0lBQ3hELEVBQUUsZ0ZBQXVDO0lBQ3pDLFdBQVcsRUFBRSxRQUFRLENBQUMsd0NBQXdDLEVBQUUsMEJBQTBCLENBQUM7SUFDM0YsZ0JBQWdCLEVBQUU7UUFDakIscUdBQXFHO1FBQ3JHLEVBQUU7UUFDRixjQUFjO1FBQ2Qsb0VBQW9FO1FBQ3BFLG9HQUFvRztRQUNwRyxnRUFBZ0U7UUFDaEUsRUFBRTtRQUNGLGdCQUFnQjtRQUNoQiw2Q0FBNkM7UUFDN0MsMkNBQTJDO1FBQzNDLHdEQUF3RDtRQUN4RCwyREFBMkQ7UUFDM0Qsb0NBQW9DO1FBQ3BDLEVBQUU7UUFDRixpRUFBaUU7S0FDakUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDO0lBQ1osZUFBZSxFQUFFLFFBQVEsQ0FBQyw0Q0FBNEMsRUFBRSx1Q0FBdUMsQ0FBQztJQUNoSCxNQUFNLEVBQUUsY0FBYyxDQUFDLFFBQVE7SUFDL0IsSUFBSSxFQUFFLE9BQU8sQ0FBQyxNQUFNO0lBQ3BCLFdBQVcsRUFBRTtRQUNaLElBQUksRUFBRSxRQUFRO1FBQ2QsVUFBVSxFQUFFO1lBQ1gsT0FBTyxFQUFFO2dCQUNSLElBQUksRUFBRSxRQUFRO2dCQUNkLFdBQVcsRUFBRSx1Q0FBdUM7YUFDcEQ7WUFDRCxXQUFXLEVBQUU7Z0JBQ1osSUFBSSxFQUFFLFFBQVE7Z0JBQ2QsV0FBVyxFQUFFLGlIQUFpSDthQUM5SDtZQUNELElBQUksRUFBRTtnQkFDTCxJQUFJLEVBQUUsUUFBUTtnQkFDZCxXQUFXLEVBQUUsNERBQTREO2FBQ3pFO1lBQ0QsSUFBSSxFQUFFO2dCQUNMLElBQUksRUFBRSxRQUFRO2dCQUNkLElBQUksRUFBRSxDQUFDLE1BQU0sRUFBRSxPQUFPLENBQUM7Z0JBQ3ZCLFdBQVcsRUFBRSwrQ0FBK0M7YUFDNUQ7U0FDRDtRQUNELFFBQVEsRUFBRTtZQUNULFNBQVM7WUFDVCxhQUFhO1lBQ2IsTUFBTTtZQUNOLE1BQU07U0FDTjtLQUNEO0NBQ0QsQ0FBQztBQUVGLE1BQU0sT0FBTywwQkFBMkIsU0FBUSxpQkFBaUI7SUFDaEUsSUFBYSxrQ0FBa0M7UUFDOUMsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBRVEsS0FBSyxDQUFDLHFCQUFxQixDQUFDLE9BQTBDLEVBQUUsS0FBd0I7UUFDeEcsTUFBTSxrQkFBa0IsR0FBRyxNQUFNLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxPQUFPLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDN0UsSUFBSSxrQkFBa0IsRUFBRSxDQUFDO1lBQ3hCLGtCQUFrQixDQUFDLFlBQVksR0FBRywwQkFBMEIsQ0FBQyxtQkFBbUIsQ0FBQztRQUNsRixDQUFDO1FBQ0QsT0FBTyxrQkFBa0IsQ0FBQztJQUMzQixDQUFDO0lBQ1EsS0FBSyxDQUFDLE1BQU0sQ0FBQyxVQUEyQixFQUFFLFdBQWdDLEVBQUUsUUFBc0IsRUFBRSxLQUF3QjtRQUNwSSx5REFBeUQ7UUFDekQsT0FBTztZQUNOLE9BQU8sRUFBRSxDQUFDO29CQUNULElBQUksRUFBRSxNQUFNO29CQUNaLEtBQUssRUFBRSxLQUFLO2lCQUNaLENBQUM7U0FDRixDQUFDO0lBQ0gsQ0FBQztDQUNEIn0=