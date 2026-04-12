/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { ToolDataSource } from '../../../../chat/common/tools/languageModelToolsService.js';
import { RunInTerminalTool } from './runInTerminalTool.js';
export const KillTerminalToolData = {
    id: "kill_terminal" /* TerminalToolId.KillTerminal */,
    toolReferenceName: 'killTerminal',
    displayName: localize('killTerminalTool.displayName', 'Kill Terminal'),
    modelDescription: `Kill a terminal by its ID. Use this to clean up terminals that are no longer needed (e.g., after stopping a server or when a long-running task completes). The terminal ID is returned by ${"run_in_terminal" /* TerminalToolId.RunInTerminal */} in async mode (legacy: isBackground=true).`,
    icon: Codicon.terminal,
    source: ToolDataSource.Internal,
    inputSchema: {
        type: 'object',
        properties: {
            id: {
                type: 'string',
                description: `The ID of the persistent terminal to kill (returned by ${"run_in_terminal" /* TerminalToolId.RunInTerminal */} in async mode).`,
                pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
            },
        },
        required: [
            'id',
        ]
    }
};
export class KillTerminalTool extends Disposable {
    async prepareToolInvocation(_context, _token) {
        return {
            invocationMessage: localize('kill.progressive', "Killing terminal"),
            pastTenseMessage: localize('kill.past', "Killed terminal"),
        };
    }
    async invoke(invocation, _countTokens, _progress, _token) {
        const args = invocation.parameters;
        const execution = RunInTerminalTool.getExecution(args.id);
        if (!execution) {
            return {
                content: [{
                        kind: 'text',
                        value: `Error: No active terminal execution found with ID ${args.id}. The terminal may have already been killed or the ID is invalid.`
                    }]
            };
        }
        // Get the final output before killing
        const finalOutput = execution.getOutput();
        // Dispose the terminal instance (this kills the process)
        execution.instance.dispose();
        // Remove the execution from tracking
        RunInTerminalTool.removeExecution(args.id);
        const outputSummary = finalOutput
            ? `Final output before termination:\n${finalOutput}`
            : 'No output was captured.';
        return {
            content: [{
                    kind: 'text',
                    value: `Successfully killed persistent terminal ${args.id}. ${outputSummary}`
                }]
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoia2lsbFRlcm1pbmFsVG9vbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy9icm93c2VyL3Rvb2xzL2tpbGxUZXJtaW5hbFRvb2wudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN4RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDcEQsT0FBTyxFQUFFLGNBQWMsRUFBNkwsTUFBTSw0REFBNEQsQ0FBQztBQUN2UixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUczRCxNQUFNLENBQUMsTUFBTSxvQkFBb0IsR0FBYztJQUM5QyxFQUFFLG1EQUE2QjtJQUMvQixpQkFBaUIsRUFBRSxjQUFjO0lBQ2pDLFdBQVcsRUFBRSxRQUFRLENBQUMsOEJBQThCLEVBQUUsZUFBZSxDQUFDO0lBQ3RFLGdCQUFnQixFQUFFLDZMQUE2TCxvREFBNEIsNkNBQTZDO0lBQ3hSLElBQUksRUFBRSxPQUFPLENBQUMsUUFBUTtJQUN0QixNQUFNLEVBQUUsY0FBYyxDQUFDLFFBQVE7SUFDL0IsV0FBVyxFQUFFO1FBQ1osSUFBSSxFQUFFLFFBQVE7UUFDZCxVQUFVLEVBQUU7WUFDWCxFQUFFLEVBQUU7Z0JBQ0gsSUFBSSxFQUFFLFFBQVE7Z0JBQ2QsV0FBVyxFQUFFLDBEQUEwRCxvREFBNEIsa0JBQWtCO2dCQUNySCxPQUFPLEVBQUUsNEZBQTRGO2FBQ3JHO1NBQ0Q7UUFDRCxRQUFRLEVBQUU7WUFDVCxJQUFJO1NBQ0o7S0FDRDtDQUNELENBQUM7QUFNRixNQUFNLE9BQU8sZ0JBQWlCLFNBQVEsVUFBVTtJQUMvQyxLQUFLLENBQUMscUJBQXFCLENBQUMsUUFBMkMsRUFBRSxNQUF5QjtRQUNqRyxPQUFPO1lBQ04saUJBQWlCLEVBQUUsUUFBUSxDQUFDLGtCQUFrQixFQUFFLGtCQUFrQixDQUFDO1lBQ25FLGdCQUFnQixFQUFFLFFBQVEsQ0FBQyxXQUFXLEVBQUUsaUJBQWlCLENBQUM7U0FDMUQsQ0FBQztJQUNILENBQUM7SUFFRCxLQUFLLENBQUMsTUFBTSxDQUFDLFVBQTJCLEVBQUUsWUFBaUMsRUFBRSxTQUF1QixFQUFFLE1BQXlCO1FBQzlILE1BQU0sSUFBSSxHQUFHLFVBQVUsQ0FBQyxVQUFzQyxDQUFDO1FBRS9ELE1BQU0sU0FBUyxHQUFHLGlCQUFpQixDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDMUQsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ2hCLE9BQU87Z0JBQ04sT0FBTyxFQUFFLENBQUM7d0JBQ1QsSUFBSSxFQUFFLE1BQU07d0JBQ1osS0FBSyxFQUFFLHFEQUFxRCxJQUFJLENBQUMsRUFBRSxtRUFBbUU7cUJBQ3RJLENBQUM7YUFDRixDQUFDO1FBQ0gsQ0FBQztRQUVELHNDQUFzQztRQUN0QyxNQUFNLFdBQVcsR0FBRyxTQUFTLENBQUMsU0FBUyxFQUFFLENBQUM7UUFFMUMseURBQXlEO1FBQ3pELFNBQVMsQ0FBQyxRQUFRLENBQUMsT0FBTyxFQUFFLENBQUM7UUFFN0IscUNBQXFDO1FBQ3JDLGlCQUFpQixDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7UUFFM0MsTUFBTSxhQUFhLEdBQUcsV0FBVztZQUNoQyxDQUFDLENBQUMscUNBQXFDLFdBQVcsRUFBRTtZQUNwRCxDQUFDLENBQUMseUJBQXlCLENBQUM7UUFFN0IsT0FBTztZQUNOLE9BQU8sRUFBRSxDQUFDO29CQUNULElBQUksRUFBRSxNQUFNO29CQUNaLEtBQUssRUFBRSwyQ0FBMkMsSUFBSSxDQUFDLEVBQUUsS0FBSyxhQUFhLEVBQUU7aUJBQzdFLENBQUM7U0FDRixDQUFDO0lBQ0gsQ0FBQztDQUNEIn0=