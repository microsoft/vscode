/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
/**
 * Activation events for prompt file providers.
 */
export const CUSTOM_AGENT_PROVIDER_ACTIVATION_EVENT = 'onCustomAgentProvider';
export const INSTRUCTIONS_PROVIDER_ACTIVATION_EVENT = 'onInstructionsProvider';
export const PROMPT_FILE_PROVIDER_ACTIVATION_EVENT = 'onPromptFileProvider';
export const SKILL_PROVIDER_ACTIVATION_EVENT = 'onSkillProvider';
/**
 * Provides prompt services.
 */
export const IPromptsService = createDecorator('IPromptsService');
/**
 * Where the prompt is stored.
 */
export var PromptsStorage;
(function (PromptsStorage) {
    PromptsStorage["local"] = "local";
    PromptsStorage["user"] = "user";
    PromptsStorage["extension"] = "extension";
    PromptsStorage["plugin"] = "plugin";
})(PromptsStorage || (PromptsStorage = {}));
export function isExtensionPromptPath(obj) {
    return obj.storage === PromptsStorage.extension;
}
export function isCustomAgentVisibility(obj) {
    if (typeof obj !== 'object' || obj === null) {
        return false;
    }
    const v = obj;
    return typeof v.userInvocable === 'boolean' && typeof v.agentInvocable === 'boolean';
}
/**
 * Type of agent instruction file.
 */
export var AgentInstructionFileType;
(function (AgentInstructionFileType) {
    AgentInstructionFileType["agentsMd"] = "agentsMd";
    AgentInstructionFileType["claudeMd"] = "claudeMd";
    AgentInstructionFileType["copilotInstructionsMd"] = "copilotInstructionsMd";
})(AgentInstructionFileType || (AgentInstructionFileType = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvbXB0c1NlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9wcm9tcHRTeW50YXgvc2VydmljZS9wcm9tcHRzU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQVNoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFRbkc7O0dBRUc7QUFDSCxNQUFNLENBQUMsTUFBTSxzQ0FBc0MsR0FBRyx1QkFBdUIsQ0FBQztBQUM5RSxNQUFNLENBQUMsTUFBTSxzQ0FBc0MsR0FBRyx3QkFBd0IsQ0FBQztBQUMvRSxNQUFNLENBQUMsTUFBTSxxQ0FBcUMsR0FBRyxzQkFBc0IsQ0FBQztBQUM1RSxNQUFNLENBQUMsTUFBTSwrQkFBK0IsR0FBRyxpQkFBaUIsQ0FBQztBQXlCakU7O0dBRUc7QUFDSCxNQUFNLENBQUMsTUFBTSxlQUFlLEdBQUcsZUFBZSxDQUFrQixpQkFBaUIsQ0FBQyxDQUFDO0FBRW5GOztHQUVHO0FBQ0gsTUFBTSxDQUFOLElBQVksY0FLWDtBQUxELFdBQVksY0FBYztJQUN6QixpQ0FBZSxDQUFBO0lBQ2YsK0JBQWEsQ0FBQTtJQUNiLHlDQUF1QixDQUFBO0lBQ3ZCLG1DQUFpQixDQUFBO0FBQ2xCLENBQUMsRUFMVyxjQUFjLEtBQWQsY0FBYyxRQUt6QjtBQXNERCxNQUFNLFVBQVUscUJBQXFCLENBQUMsR0FBZ0I7SUFDckQsT0FBTyxHQUFHLENBQUMsT0FBTyxLQUFLLGNBQWMsQ0FBQyxTQUFTLENBQUM7QUFDakQsQ0FBQztBQXNDRCxNQUFNLFVBQVUsdUJBQXVCLENBQUMsR0FBWTtJQUNuRCxJQUFJLE9BQU8sR0FBRyxLQUFLLFFBQVEsSUFBSSxHQUFHLEtBQUssSUFBSSxFQUFFLENBQUM7UUFDN0MsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBQ0QsTUFBTSxDQUFDLEdBQUcsR0FBNEQsQ0FBQztJQUN2RSxPQUFPLE9BQU8sQ0FBQyxDQUFDLGFBQWEsS0FBSyxTQUFTLElBQUksT0FBTyxDQUFDLENBQUMsY0FBYyxLQUFLLFNBQVMsQ0FBQztBQUN0RixDQUFDO0FBeUtEOztHQUVHO0FBQ0gsTUFBTSxDQUFOLElBQVksd0JBSVg7QUFKRCxXQUFZLHdCQUF3QjtJQUNuQyxpREFBcUIsQ0FBQTtJQUNyQixpREFBcUIsQ0FBQTtJQUNyQiwyRUFBK0MsQ0FBQTtBQUNoRCxDQUFDLEVBSlcsd0JBQXdCLEtBQXhCLHdCQUF3QixRQUluQyJ9