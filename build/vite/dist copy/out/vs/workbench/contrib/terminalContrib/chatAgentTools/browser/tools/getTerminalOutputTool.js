/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { ToolDataSource } from '../../../../chat/common/tools/languageModelToolsService.js';
import { RunInTerminalTool } from './runInTerminalTool.js';
export const GetTerminalOutputToolData = {
    id: "get_terminal_output" /* TerminalToolId.GetTerminalOutput */,
    toolReferenceName: 'getTerminalOutput',
    legacyToolReferenceFullNames: ['runCommands/getTerminalOutput'],
    displayName: localize('getTerminalOutputTool.displayName', 'Get Terminal Output'),
    modelDescription: `Get output from a persistent terminal session previously started with ${"run_in_terminal" /* TerminalToolId.RunInTerminal */} in async mode (legacy: isBackground=true). The ID must be the exact opaque value returned by ${"run_in_terminal" /* TerminalToolId.RunInTerminal */}; terminal names, labels, and integers are not valid IDs.`,
    icon: Codicon.terminal,
    source: ToolDataSource.Internal,
    inputSchema: {
        type: 'object',
        properties: {
            id: {
                type: 'string',
                description: `The ID of the persistent terminal to check (returned by ${"run_in_terminal" /* TerminalToolId.RunInTerminal */} in async mode). This must be the exact opaque ID returned by that tool; terminal names, labels, or integers are invalid.`,
                pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
            },
        },
        required: [
            'id',
        ]
    }
};
export class GetTerminalOutputTool extends Disposable {
    async prepareToolInvocation(context, token) {
        return {
            invocationMessage: localize('getTerminalOutput.progressive', "Checking terminal output"),
            pastTenseMessage: localize('getTerminalOutput.past', "Checked terminal output"),
        };
    }
    async invoke(invocation, _countTokens, _progress, token) {
        const args = invocation.parameters;
        const execution = RunInTerminalTool.getExecution(args.id);
        if (!execution) {
            return {
                content: [{
                        kind: 'text',
                        value: `Error: No active terminal execution found with ID ${args.id}. The ID must be the exact value returned by ${"run_in_terminal" /* TerminalToolId.RunInTerminal */} in async mode.`
                    }]
            };
        }
        return {
            content: [{
                    kind: 'text',
                    value: `Output of terminal ${args.id}:\n${execution.getOutput()}`
                }]
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2V0VGVybWluYWxPdXRwdXRUb29sLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL2NoYXRBZ2VudFRvb2xzL2Jyb3dzZXIvdG9vbHMvZ2V0VGVybWluYWxPdXRwdXRUb29sLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDeEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3BELE9BQU8sRUFBRSxjQUFjLEVBQTZMLE1BQU0sNERBQTRELENBQUM7QUFDdlIsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFHM0QsTUFBTSxDQUFDLE1BQU0seUJBQXlCLEdBQWM7SUFDbkQsRUFBRSw4REFBa0M7SUFDcEMsaUJBQWlCLEVBQUUsbUJBQW1CO0lBQ3RDLDRCQUE0QixFQUFFLENBQUMsK0JBQStCLENBQUM7SUFDL0QsV0FBVyxFQUFFLFFBQVEsQ0FBQyxtQ0FBbUMsRUFBRSxxQkFBcUIsQ0FBQztJQUNqRixnQkFBZ0IsRUFBRSx5RUFBeUUsb0RBQTRCLGlHQUFpRyxvREFBNEIsMkRBQTJEO0lBQy9TLElBQUksRUFBRSxPQUFPLENBQUMsUUFBUTtJQUN0QixNQUFNLEVBQUUsY0FBYyxDQUFDLFFBQVE7SUFDL0IsV0FBVyxFQUFFO1FBQ1osSUFBSSxFQUFFLFFBQVE7UUFDZCxVQUFVLEVBQUU7WUFDWCxFQUFFLEVBQUU7Z0JBQ0gsSUFBSSxFQUFFLFFBQVE7Z0JBQ2QsV0FBVyxFQUFFLDJEQUEyRCxvREFBNEIsMkhBQTJIO2dCQUMvTixPQUFPLEVBQUUsNEZBQTRGO2FBQ3JHO1NBQ0Q7UUFDRCxRQUFRLEVBQUU7WUFDVCxJQUFJO1NBQ0o7S0FDRDtDQUNELENBQUM7QUFNRixNQUFNLE9BQU8scUJBQXNCLFNBQVEsVUFBVTtJQUNwRCxLQUFLLENBQUMscUJBQXFCLENBQUMsT0FBMEMsRUFBRSxLQUF3QjtRQUMvRixPQUFPO1lBQ04saUJBQWlCLEVBQUUsUUFBUSxDQUFDLCtCQUErQixFQUFFLDBCQUEwQixDQUFDO1lBQ3hGLGdCQUFnQixFQUFFLFFBQVEsQ0FBQyx3QkFBd0IsRUFBRSx5QkFBeUIsQ0FBQztTQUMvRSxDQUFDO0lBQ0gsQ0FBQztJQUVELEtBQUssQ0FBQyxNQUFNLENBQUMsVUFBMkIsRUFBRSxZQUFpQyxFQUFFLFNBQXVCLEVBQUUsS0FBd0I7UUFDN0gsTUFBTSxJQUFJLEdBQUcsVUFBVSxDQUFDLFVBQTJDLENBQUM7UUFDcEUsTUFBTSxTQUFTLEdBQUcsaUJBQWlCLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUMxRCxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDaEIsT0FBTztnQkFDTixPQUFPLEVBQUUsQ0FBQzt3QkFDVCxJQUFJLEVBQUUsTUFBTTt3QkFDWixLQUFLLEVBQUUscURBQXFELElBQUksQ0FBQyxFQUFFLGdEQUFnRCxvREFBNEIsaUJBQWlCO3FCQUNoSyxDQUFDO2FBQ0YsQ0FBQztRQUNILENBQUM7UUFFRCxPQUFPO1lBQ04sT0FBTyxFQUFFLENBQUM7b0JBQ1QsSUFBSSxFQUFFLE1BQU07b0JBQ1osS0FBSyxFQUFFLHNCQUFzQixJQUFJLENBQUMsRUFBRSxNQUFNLFNBQVMsQ0FBQyxTQUFTLEVBQUUsRUFBRTtpQkFDakUsQ0FBQztTQUNGLENBQUM7SUFDSCxDQUFDO0NBQ0QifQ==