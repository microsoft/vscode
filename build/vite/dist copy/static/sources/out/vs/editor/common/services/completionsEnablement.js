/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import product from '../../../platform/product/common/product.js';
import { isObject } from '../../../base/common/types.js';
/**
 * Get the completions enablement setting name from product configuration.
 */
function getCompletionsEnablementSettingName() {
    return product.defaultChatAgent?.completionsEnablementSetting;
}
/**
 * Checks if completions (e.g., Copilot) are enabled for a given language ID
 * using `IConfigurationService`.
 *
 * @param configurationService The configuration service to read settings from.
 * @param modeId The language ID to check. Defaults to '*' which checks the global setting.
 * @returns `true` if completions are enabled for the language, `false` otherwise.
 */
export function isCompletionsEnabled(configurationService, modeId = '*') {
    const settingName = getCompletionsEnablementSettingName();
    if (!settingName) {
        return false;
    }
    return isCompletionsEnabledFromObject(configurationService.getValue(settingName), modeId);
}
/**
 * Checks if completions (e.g., Copilot) are enabled for a given language ID
 * using `ITextResourceConfigurationService`.
 *
 * @param configurationService The text resource configuration service to read settings from.
 * @param modeId The language ID to check. Defaults to '*' which checks the global setting.
 * @returns `true` if completions are enabled for the language, `false` otherwise.
 */
export function isCompletionsEnabledWithTextResourceConfig(configurationService, resource, modeId = '*') {
    const settingName = getCompletionsEnablementSettingName();
    if (!settingName) {
        return false;
    }
    // Pass undefined as resource to get the global setting
    return isCompletionsEnabledFromObject(configurationService.getValue(resource, settingName), modeId);
}
/**
 * Checks if completions are enabled for a given language ID using a pre-fetched
 * completions enablement object.
 *
 * @param completionsEnablementObject The object containing per-language enablement settings.
 * @param modeId The language ID to check. Defaults to '*' which checks the global setting.
 * @returns `true` if completions are enabled for the language, `false` otherwise.
 */
export function isCompletionsEnabledFromObject(completionsEnablementObject, modeId = '*') {
    if (!isObject(completionsEnablementObject)) {
        return false; // default to disabled if setting is not available
    }
    if (typeof completionsEnablementObject[modeId] !== 'undefined') {
        return Boolean(completionsEnablementObject[modeId]); // go with setting if explicitly defined
    }
    return Boolean(completionsEnablementObject['*']); // fallback to global setting otherwise
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcGxldGlvbnNFbmFibGVtZW50LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9jb21wbGV0aW9uc0VuYWJsZW1lbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxPQUFPLE1BQU0sNkNBQTZDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBS3pEOztHQUVHO0FBQ0gsU0FBUyxtQ0FBbUM7SUFDM0MsT0FBTyxPQUFPLENBQUMsZ0JBQWdCLEVBQUUsNEJBQTRCLENBQUM7QUFDL0QsQ0FBQztBQUVEOzs7Ozs7O0dBT0c7QUFDSCxNQUFNLFVBQVUsb0JBQW9CLENBQUMsb0JBQTJDLEVBQUUsU0FBaUIsR0FBRztJQUNyRyxNQUFNLFdBQVcsR0FBRyxtQ0FBbUMsRUFBRSxDQUFDO0lBQzFELElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztRQUNsQixPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7SUFFRCxPQUFPLDhCQUE4QixDQUNwQyxvQkFBb0IsQ0FBQyxRQUFRLENBQTBCLFdBQVcsQ0FBQyxFQUNuRSxNQUFNLENBQ04sQ0FBQztBQUNILENBQUM7QUFFRDs7Ozs7OztHQU9HO0FBQ0gsTUFBTSxVQUFVLDBDQUEwQyxDQUFDLG9CQUF1RCxFQUFFLFFBQWEsRUFBRSxTQUFpQixHQUFHO0lBQ3RKLE1BQU0sV0FBVyxHQUFHLG1DQUFtQyxFQUFFLENBQUM7SUFDMUQsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBQ2xCLE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztJQUVELHVEQUF1RDtJQUN2RCxPQUFPLDhCQUE4QixDQUNwQyxvQkFBb0IsQ0FBQyxRQUFRLENBQTBCLFFBQVEsRUFBRSxXQUFXLENBQUMsRUFDN0UsTUFBTSxDQUNOLENBQUM7QUFDSCxDQUFDO0FBRUQ7Ozs7Ozs7R0FPRztBQUNILE1BQU0sVUFBVSw4QkFBOEIsQ0FBQywyQkFBZ0UsRUFBRSxTQUFpQixHQUFHO0lBQ3BJLElBQUksQ0FBQyxRQUFRLENBQUMsMkJBQTJCLENBQUMsRUFBRSxDQUFDO1FBQzVDLE9BQU8sS0FBSyxDQUFDLENBQUMsa0RBQWtEO0lBQ2pFLENBQUM7SUFFRCxJQUFJLE9BQU8sMkJBQTJCLENBQUMsTUFBTSxDQUFDLEtBQUssV0FBVyxFQUFFLENBQUM7UUFDaEUsT0FBTyxPQUFPLENBQUMsMkJBQTJCLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLHdDQUF3QztJQUM5RixDQUFDO0lBRUQsT0FBTyxPQUFPLENBQUMsMkJBQTJCLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLHVDQUF1QztBQUMxRixDQUFDIn0=