/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { basename } from '../../../../../base/common/resources.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
export const IAgentPluginService = createDecorator('agentPluginService');
export function getCanonicalPluginCommandId(plugin, commandName) {
    const pluginSegment = basename(plugin.uri);
    const prefix = normalizePluginToken(pluginSegment);
    const normalizedCommand = normalizePluginToken(commandName);
    if (normalizedCommand.startsWith(`${prefix}:`)) {
        return normalizedCommand;
    }
    return `${prefix}:${normalizedCommand}`;
}
function normalizePluginToken(value) {
    return value
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9_.:-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^[-:.]+|[-:.]+$/g, '');
}
class AgentPluginDiscoveryRegistry {
    constructor() {
        this._discovery = [];
    }
    register(descriptor) {
        this._discovery.push(descriptor);
    }
    getAll() {
        return this._discovery;
    }
}
export const agentPluginDiscoveryRegistry = new AgentPluginDiscoveryRegistry();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRQbHVnaW5TZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vcGx1Z2lucy9hZ2VudFBsdWdpblNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFJaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBR25FLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQU1oRyxNQUFNLENBQUMsTUFBTSxtQkFBbUIsR0FBRyxlQUFlLENBQXNCLG9CQUFvQixDQUFDLENBQUM7QUE0QzlGLE1BQU0sVUFBVSwyQkFBMkIsQ0FBQyxNQUE2QixFQUFFLFdBQW1CO0lBQzdGLE1BQU0sYUFBYSxHQUFHLFFBQVEsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDM0MsTUFBTSxNQUFNLEdBQUcsb0JBQW9CLENBQUMsYUFBYSxDQUFDLENBQUM7SUFDbkQsTUFBTSxpQkFBaUIsR0FBRyxvQkFBb0IsQ0FBQyxXQUFXLENBQUMsQ0FBQztJQUM1RCxJQUFJLGlCQUFpQixDQUFDLFVBQVUsQ0FBQyxHQUFHLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztRQUNoRCxPQUFPLGlCQUFpQixDQUFDO0lBQzFCLENBQUM7SUFFRCxPQUFPLEdBQUcsTUFBTSxJQUFJLGlCQUFpQixFQUFFLENBQUM7QUFDekMsQ0FBQztBQUVELFNBQVMsb0JBQW9CLENBQUMsS0FBYTtJQUMxQyxPQUFPLEtBQUs7U0FDVixJQUFJLEVBQUU7U0FDTixXQUFXLEVBQUU7U0FDYixPQUFPLENBQUMsTUFBTSxFQUFFLEdBQUcsQ0FBQztTQUNwQixPQUFPLENBQUMsZ0JBQWdCLEVBQUUsR0FBRyxDQUFDO1NBQzlCLE9BQU8sQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDO1NBQ25CLE9BQU8sQ0FBQyxrQkFBa0IsRUFBRSxFQUFFLENBQUMsQ0FBQztBQUNuQyxDQUFDO0FBRUQsTUFBTSw0QkFBNEI7SUFBbEM7UUFDa0IsZUFBVSxHQUE2QyxFQUFFLENBQUM7SUFTNUUsQ0FBQztJQVBBLFFBQVEsQ0FBQyxVQUFrRDtRQUMxRCxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztJQUNsQyxDQUFDO0lBRUQsTUFBTTtRQUNMLE9BQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQztJQUN4QixDQUFDO0NBQ0Q7QUFFRCxNQUFNLENBQUMsTUFBTSw0QkFBNEIsR0FBRyxJQUFJLDRCQUE0QixFQUFFLENBQUMifQ==