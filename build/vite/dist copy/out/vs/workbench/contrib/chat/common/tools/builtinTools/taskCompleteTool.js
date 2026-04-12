/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ToolDataSource, ToolInvocationPresentation } from '../languageModelToolsService.js';
export const TaskCompleteToolId = 'task_complete';
/**
 * Message sent to the agent when the session goes idle without task completion.
 */
export const AUTOPILOT_CONTINUATION_MESSAGE = 'You have not yet marked the task as complete using the task_complete tool. ' +
    'You MUST call task_complete when done — whether the task involved code changes, answering a question, or any other interaction.\n\n' +
    'Do NOT repeat or restate your previous response. Pick up where you left off.\n\n' +
    'If you were planning, stop planning and start implementing. ' +
    'You are not done until you have fully completed the task.\n\n' +
    'IMPORTANT: Do NOT call task_complete if:\n' +
    '- You have open questions or ambiguities — make good decisions and keep working\n' +
    '- You encountered an error — try to resolve it or find an alternative approach\n' +
    '- There are remaining steps — complete them first\n\n' +
    'When you ARE done, first provide a brief text summary of what was accomplished, then call task_complete. ' +
    'Both the summary message and the tool call are required.\n\n' +
    'Keep working autonomously until the task is truly finished, then call task_complete.';
export const TaskCompleteToolData = {
    id: TaskCompleteToolId,
    displayName: 'Task Complete',
    modelDescription: 'Signal that the user\'s task is fully done. You MUST call this tool when your work is complete — ' +
        'whether you made code changes, answered a question, or completed any other kind of task. ' +
        'Provide a brief summary of what was accomplished. ' +
        'Do not restate the summary in your message text — it is shown to the user directly.\n\n' +
        'IMPORTANT: Before calling this tool, you MUST output a brief text message summarizing what was done. ' +
        'The task is not complete until both your summary message AND this tool call are present.\n\n' +
        'When to call:\n' +
        '- After answering the user\'s question or completing a conversational request\n' +
        '- After you have completed ALL requested changes\n' +
        '- After verifying results: tests pass, terminal commands succeeded, tool calls returned expected output\n\n' +
        'When NOT to call:\n' +
        '- If a terminal command failed or produced unexpected output\n' +
        '- If an MCP or external tool call returned an error\n' +
        '- If you encountered errors you have not resolved\n' +
        '- If there are remaining steps to complete\n' +
        '- If you have not verified your changes work',
    source: ToolDataSource.Internal,
    inputSchema: {
        type: 'object',
        properties: {
            summary: {
                type: 'string',
                description: 'Brief summary of what was accomplished. Omit for trivial interactions.',
            },
        },
    },
};
export class TaskCompleteTool {
    async prepareToolInvocation(_context, _token) {
        return {
            presentation: ToolInvocationPresentation.Hidden,
        };
    }
    async invoke(invocation, _countTokens, _progress, _token) {
        const params = invocation.parameters;
        const summary = params?.summary ?? 'All done!';
        return {
            content: [{
                    kind: 'text',
                    value: summary,
                }],
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGFza0NvbXBsZXRlVG9vbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Rvb2xzL2J1aWx0aW5Ub29scy90YXNrQ29tcGxldGVUb29sLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBa0gsY0FBYyxFQUFFLDBCQUEwQixFQUFxQyxNQUFNLGlDQUFpQyxDQUFDO0FBRWhQLE1BQU0sQ0FBQyxNQUFNLGtCQUFrQixHQUFHLGVBQWUsQ0FBQztBQUVsRDs7R0FFRztBQUNILE1BQU0sQ0FBQyxNQUFNLDhCQUE4QixHQUMxQyw2RUFBNkU7SUFDN0UscUlBQXFJO0lBQ3JJLGtGQUFrRjtJQUNsRiw4REFBOEQ7SUFDOUQsK0RBQStEO0lBQy9ELDRDQUE0QztJQUM1QyxtRkFBbUY7SUFDbkYsa0ZBQWtGO0lBQ2xGLHVEQUF1RDtJQUN2RCwyR0FBMkc7SUFDM0csOERBQThEO0lBQzlELHNGQUFzRixDQUFDO0FBRXhGLE1BQU0sQ0FBQyxNQUFNLG9CQUFvQixHQUFjO0lBQzlDLEVBQUUsRUFBRSxrQkFBa0I7SUFDdEIsV0FBVyxFQUFFLGVBQWU7SUFDNUIsZ0JBQWdCLEVBQ2YsbUdBQW1HO1FBQ25HLDJGQUEyRjtRQUMzRixvREFBb0Q7UUFDcEQseUZBQXlGO1FBQ3pGLHVHQUF1RztRQUN2Ryw4RkFBOEY7UUFDOUYsaUJBQWlCO1FBQ2pCLGlGQUFpRjtRQUNqRixvREFBb0Q7UUFDcEQsNkdBQTZHO1FBQzdHLHFCQUFxQjtRQUNyQixnRUFBZ0U7UUFDaEUsdURBQXVEO1FBQ3ZELHFEQUFxRDtRQUNyRCw4Q0FBOEM7UUFDOUMsOENBQThDO0lBQy9DLE1BQU0sRUFBRSxjQUFjLENBQUMsUUFBUTtJQUMvQixXQUFXLEVBQUU7UUFDWixJQUFJLEVBQUUsUUFBUTtRQUNkLFVBQVUsRUFBRTtZQUNYLE9BQU8sRUFBRTtnQkFDUixJQUFJLEVBQUUsUUFBUTtnQkFDZCxXQUFXLEVBQUUsd0VBQXdFO2FBQ3JGO1NBQ0Q7S0FDRDtDQUNELENBQUM7QUFFRixNQUFNLE9BQU8sZ0JBQWdCO0lBQzVCLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxRQUEyQyxFQUFFLE1BQXlCO1FBQ2pHLE9BQU87WUFDTixZQUFZLEVBQUUsMEJBQTBCLENBQUMsTUFBTTtTQUMvQyxDQUFDO0lBQ0gsQ0FBQztJQUVELEtBQUssQ0FBQyxNQUFNLENBQUMsVUFBMkIsRUFBRSxZQUFpQyxFQUFFLFNBQXVCLEVBQUUsTUFBeUI7UUFDOUgsTUFBTSxNQUFNLEdBQUcsVUFBVSxDQUFDLFVBQWtDLENBQUM7UUFDN0QsTUFBTSxPQUFPLEdBQUcsTUFBTSxFQUFFLE9BQU8sSUFBSSxXQUFXLENBQUM7UUFDL0MsT0FBTztZQUNOLE9BQU8sRUFBRSxDQUFDO29CQUNULElBQUksRUFBRSxNQUFNO29CQUNaLEtBQUssRUFBRSxPQUFPO2lCQUNkLENBQUM7U0FDRixDQUFDO0lBQ0gsQ0FBQztDQUNEIn0=