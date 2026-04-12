/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CONTEXT_DEBUG_PROTOCOL_VARIABLE_MENU_CONTEXT, CONTEXT_VARIABLE_EVALUATE_NAME_PRESENT, CONTEXT_CAN_VIEW_MEMORY, CONTEXT_VARIABLE_IS_READONLY, CONTEXT_VARIABLE_TYPE, CONTEXT_DEBUG_TYPE } from './debug.js';
/**
 * Gets a context key overlay that has context for the given variable.
 */
export function getContextForVariable(parentContext, variable, additionalContext = []) {
    const session = variable.getSession();
    const contextKeys = [
        [CONTEXT_DEBUG_PROTOCOL_VARIABLE_MENU_CONTEXT.key, variable.variableMenuContext || ''],
        [CONTEXT_VARIABLE_EVALUATE_NAME_PRESENT.key, !!variable.evaluateName],
        [CONTEXT_CAN_VIEW_MEMORY.key, !!session?.capabilities.supportsReadMemoryRequest && variable.memoryReference !== undefined],
        [CONTEXT_VARIABLE_IS_READONLY.key, !!variable.presentationHint?.attributes?.includes('readOnly') || variable.presentationHint?.lazy],
        [CONTEXT_VARIABLE_TYPE.key, variable.type],
        [CONTEXT_DEBUG_TYPE.key, session?.configuration.type],
        ...additionalContext,
    ];
    return parentContext.createOverlay(contextKeys);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWdDb250ZXh0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZGVidWcvY29tbW9uL2RlYnVnQ29udGV4dC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEVBQUUsNENBQTRDLEVBQUUsc0NBQXNDLEVBQUUsdUJBQXVCLEVBQUUsNEJBQTRCLEVBQUUscUJBQXFCLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFJcE47O0dBRUc7QUFDSCxNQUFNLFVBQVUscUJBQXFCLENBQUMsYUFBaUMsRUFBRSxRQUFrQixFQUFFLG9CQUF5QyxFQUFFO0lBQ3ZJLE1BQU0sT0FBTyxHQUFHLFFBQVEsQ0FBQyxVQUFVLEVBQUUsQ0FBQztJQUN0QyxNQUFNLFdBQVcsR0FBd0I7UUFDeEMsQ0FBQyw0Q0FBNEMsQ0FBQyxHQUFHLEVBQUUsUUFBUSxDQUFDLG1CQUFtQixJQUFJLEVBQUUsQ0FBQztRQUN0RixDQUFDLHNDQUFzQyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQztRQUNyRSxDQUFDLHVCQUF1QixDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsT0FBTyxFQUFFLFlBQVksQ0FBQyx5QkFBeUIsSUFBSSxRQUFRLENBQUMsZUFBZSxLQUFLLFNBQVMsQ0FBQztRQUMxSCxDQUFDLDRCQUE0QixDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLGdCQUFnQixFQUFFLFVBQVUsRUFBRSxRQUFRLENBQUMsVUFBVSxDQUFDLElBQUksUUFBUSxDQUFDLGdCQUFnQixFQUFFLElBQUksQ0FBQztRQUNwSSxDQUFDLHFCQUFxQixDQUFDLEdBQUcsRUFBRSxRQUFRLENBQUMsSUFBSSxDQUFDO1FBQzFDLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFLE9BQU8sRUFBRSxhQUFhLENBQUMsSUFBSSxDQUFDO1FBQ3JELEdBQUcsaUJBQWlCO0tBQ3BCLENBQUM7SUFFRixPQUFPLGFBQWEsQ0FBQyxhQUFhLENBQUMsV0FBVyxDQUFDLENBQUM7QUFDakQsQ0FBQyJ9