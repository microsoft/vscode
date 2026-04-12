/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as glob from '../../../../base/common/glob.js';
import { Schemas } from '../../../../base/common/network.js';
import { posix } from '../../../../base/common/path.js';
import { basename } from '../../../../base/common/resources.js';
import { localize } from '../../../../nls.js';
import { workbenchConfigurationNodeBase } from '../../../common/configuration.js';
import { Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
export const IEditorResolverService = createDecorator('editorResolverService');
export const editorsAssociationsSettingId = 'workbench.editorAssociations';
const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
const editorAssociationsConfigurationNode = {
    ...workbenchConfigurationNodeBase,
    properties: {
        'workbench.editorAssociations': {
            type: 'object',
            markdownDescription: localize('editor.editorAssociations', "Configure [glob patterns](https://aka.ms/vscode-glob-patterns) to editors (for example `\"*.hex\": \"hexEditor.hexedit\"`). These have precedence over the default behavior."),
            additionalProperties: {
                type: 'string'
            }
        }
    }
};
configurationRegistry.registerConfiguration(editorAssociationsConfigurationNode);
//#endregion
//#region EditorResolverService types
export var RegisteredEditorPriority;
(function (RegisteredEditorPriority) {
    RegisteredEditorPriority["builtin"] = "builtin";
    RegisteredEditorPriority["option"] = "option";
    RegisteredEditorPriority["exclusive"] = "exclusive";
    RegisteredEditorPriority["default"] = "default";
})(RegisteredEditorPriority || (RegisteredEditorPriority = {}));
/**
 * If we didn't resolve an editor dictates what to do with the opening state
 * ABORT = Do not continue with opening the editor
 * NONE = Continue as if the resolution has been disabled as the service could not resolve one
 */
export var ResolvedStatus;
(function (ResolvedStatus) {
    ResolvedStatus[ResolvedStatus["ABORT"] = 1] = "ABORT";
    ResolvedStatus[ResolvedStatus["NONE"] = 2] = "NONE";
})(ResolvedStatus || (ResolvedStatus = {}));
//#endregion
//#region Util functions
export function priorityToRank(priority) {
    switch (priority) {
        case RegisteredEditorPriority.exclusive:
            return 5;
        case RegisteredEditorPriority.default:
            return 4;
        case RegisteredEditorPriority.builtin:
            return 3;
        // Text editor is priority 2
        case RegisteredEditorPriority.option:
        default:
            return 1;
    }
}
export function globMatchesResource(globPattern, resource) {
    const excludedSchemes = new Set([
        Schemas.extension,
        Schemas.webviewPanel,
        Schemas.vscodeWorkspaceTrust,
        Schemas.vscodeSettings
    ]);
    // We want to say that the above schemes match no glob patterns
    if (excludedSchemes.has(resource.scheme)) {
        return false;
    }
    const matchOnPath = typeof globPattern === 'string' && globPattern.indexOf(posix.sep) >= 0;
    const target = matchOnPath ? `${resource.scheme}:${resource.path}` : basename(resource);
    return glob.match(globPattern, target, { ignoreCase: true });
}
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxJQUFJLE1BQU0saUNBQWlDLENBQUM7QUFHeEQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFaEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSw4QkFBOEIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxVQUFVLElBQUksdUJBQXVCLEVBQThDLE1BQU0sb0VBQW9FLENBQUM7QUFFdkssT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQU01RSxNQUFNLENBQUMsTUFBTSxzQkFBc0IsR0FBRyxlQUFlLENBQXlCLHVCQUF1QixDQUFDLENBQUM7QUFhdkcsTUFBTSxDQUFDLE1BQU0sNEJBQTRCLEdBQUcsOEJBQThCLENBQUM7QUFFM0UsTUFBTSxxQkFBcUIsR0FBRyxRQUFRLENBQUMsRUFBRSxDQUF5Qix1QkFBdUIsQ0FBQyxhQUFhLENBQUMsQ0FBQztBQUV6RyxNQUFNLG1DQUFtQyxHQUF1QjtJQUMvRCxHQUFHLDhCQUE4QjtJQUNqQyxVQUFVLEVBQUU7UUFDWCw4QkFBOEIsRUFBRTtZQUMvQixJQUFJLEVBQUUsUUFBUTtZQUNkLG1CQUFtQixFQUFFLFFBQVEsQ0FBQywyQkFBMkIsRUFBRSw4S0FBOEssQ0FBQztZQUMxTyxvQkFBb0IsRUFBRTtnQkFDckIsSUFBSSxFQUFFLFFBQVE7YUFDZDtTQUNEO0tBQ0Q7Q0FDRCxDQUFDO0FBUUYscUJBQXFCLENBQUMscUJBQXFCLENBQUMsbUNBQW1DLENBQUMsQ0FBQztBQUNqRixZQUFZO0FBRVoscUNBQXFDO0FBQ3JDLE1BQU0sQ0FBTixJQUFZLHdCQUtYO0FBTEQsV0FBWSx3QkFBd0I7SUFDbkMsK0NBQW1CLENBQUE7SUFDbkIsNkNBQWlCLENBQUE7SUFDakIsbURBQXVCLENBQUE7SUFDdkIsK0NBQW1CLENBQUE7QUFDcEIsQ0FBQyxFQUxXLHdCQUF3QixLQUF4Qix3QkFBd0IsUUFLbkM7QUFFRDs7OztHQUlHO0FBQ0gsTUFBTSxDQUFOLElBQWtCLGNBR2pCO0FBSEQsV0FBa0IsY0FBYztJQUMvQixxREFBUyxDQUFBO0lBQ1QsbURBQVEsQ0FBQTtBQUNULENBQUMsRUFIaUIsY0FBYyxLQUFkLGNBQWMsUUFHL0I7QUFpSEQsWUFBWTtBQUVaLHdCQUF3QjtBQUN4QixNQUFNLFVBQVUsY0FBYyxDQUFDLFFBQWtDO0lBQ2hFLFFBQVEsUUFBUSxFQUFFLENBQUM7UUFDbEIsS0FBSyx3QkFBd0IsQ0FBQyxTQUFTO1lBQ3RDLE9BQU8sQ0FBQyxDQUFDO1FBQ1YsS0FBSyx3QkFBd0IsQ0FBQyxPQUFPO1lBQ3BDLE9BQU8sQ0FBQyxDQUFDO1FBQ1YsS0FBSyx3QkFBd0IsQ0FBQyxPQUFPO1lBQ3BDLE9BQU8sQ0FBQyxDQUFDO1FBQ1YsNEJBQTRCO1FBQzVCLEtBQUssd0JBQXdCLENBQUMsTUFBTSxDQUFDO1FBQ3JDO1lBQ0MsT0FBTyxDQUFDLENBQUM7SUFDWCxDQUFDO0FBQ0YsQ0FBQztBQUVELE1BQU0sVUFBVSxtQkFBbUIsQ0FBQyxXQUEyQyxFQUFFLFFBQWE7SUFDN0YsTUFBTSxlQUFlLEdBQUcsSUFBSSxHQUFHLENBQUM7UUFDL0IsT0FBTyxDQUFDLFNBQVM7UUFDakIsT0FBTyxDQUFDLFlBQVk7UUFDcEIsT0FBTyxDQUFDLG9CQUFvQjtRQUM1QixPQUFPLENBQUMsY0FBYztLQUN0QixDQUFDLENBQUM7SUFDSCwrREFBK0Q7SUFDL0QsSUFBSSxlQUFlLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO1FBQzFDLE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztJQUNELE1BQU0sV0FBVyxHQUFHLE9BQU8sV0FBVyxLQUFLLFFBQVEsSUFBSSxXQUFXLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDM0YsTUFBTSxNQUFNLEdBQUcsV0FBVyxDQUFDLENBQUMsQ0FBQyxHQUFHLFFBQVEsQ0FBQyxNQUFNLElBQUksUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDeEYsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLFdBQVcsRUFBRSxNQUFNLEVBQUUsRUFBRSxVQUFVLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztBQUM5RCxDQUFDO0FBQ0QsWUFBWSJ9