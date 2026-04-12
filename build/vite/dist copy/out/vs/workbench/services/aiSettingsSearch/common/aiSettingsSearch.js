/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
export const IAiSettingsSearchService = createDecorator('IAiSettingsSearchService');
export var AiSettingsSearchResultKind;
(function (AiSettingsSearchResultKind) {
    AiSettingsSearchResultKind[AiSettingsSearchResultKind["EMBEDDED"] = 1] = "EMBEDDED";
    AiSettingsSearchResultKind[AiSettingsSearchResultKind["LLM_RANKED"] = 2] = "LLM_RANKED";
    AiSettingsSearchResultKind[AiSettingsSearchResultKind["CANCELED"] = 3] = "CANCELED";
})(AiSettingsSearchResultKind || (AiSettingsSearchResultKind = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWlTZXR0aW5nc1NlYXJjaC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9haVNldHRpbmdzU2VhcmNoL2NvbW1vbi9haVNldHRpbmdzU2VhcmNoLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBS2hHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUU3RixNQUFNLENBQUMsTUFBTSx3QkFBd0IsR0FBRyxlQUFlLENBQTJCLDBCQUEwQixDQUFDLENBQUM7QUFFOUcsTUFBTSxDQUFOLElBQVksMEJBSVg7QUFKRCxXQUFZLDBCQUEwQjtJQUNyQyxtRkFBWSxDQUFBO0lBQ1osdUZBQWMsQ0FBQTtJQUNkLG1GQUFZLENBQUE7QUFDYixDQUFDLEVBSlcsMEJBQTBCLEtBQTFCLDBCQUEwQixRQUlyQyJ9