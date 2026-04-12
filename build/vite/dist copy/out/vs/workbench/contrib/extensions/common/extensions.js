/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { areSameExtensions } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { localize2 } from '../../../../nls.js';
export const VIEWLET_ID = 'workbench.view.extensions';
export const EXTENSIONS_CATEGORY = localize2('extensions', "Extensions");
export var ExtensionState;
(function (ExtensionState) {
    ExtensionState[ExtensionState["Installing"] = 0] = "Installing";
    ExtensionState[ExtensionState["Installed"] = 1] = "Installed";
    ExtensionState[ExtensionState["Uninstalling"] = 2] = "Uninstalling";
    ExtensionState[ExtensionState["Uninstalled"] = 3] = "Uninstalled";
})(ExtensionState || (ExtensionState = {}));
export var ExtensionRuntimeActionType;
(function (ExtensionRuntimeActionType) {
    ExtensionRuntimeActionType["ReloadWindow"] = "reloadWindow";
    ExtensionRuntimeActionType["RestartExtensions"] = "restartExtensions";
    ExtensionRuntimeActionType["DownloadUpdate"] = "downloadUpdate";
    ExtensionRuntimeActionType["ApplyUpdate"] = "applyUpdate";
    ExtensionRuntimeActionType["QuitAndInstall"] = "quitAndInstall";
})(ExtensionRuntimeActionType || (ExtensionRuntimeActionType = {}));
export const IExtensionsWorkbenchService = createDecorator('extensionsWorkbenchService');
export var ExtensionEditorTab;
(function (ExtensionEditorTab) {
    ExtensionEditorTab["Readme"] = "readme";
    ExtensionEditorTab["Features"] = "features";
    ExtensionEditorTab["Changelog"] = "changelog";
    ExtensionEditorTab["Dependencies"] = "dependencies";
    ExtensionEditorTab["ExtensionPack"] = "extensionPack";
})(ExtensionEditorTab || (ExtensionEditorTab = {}));
export const ConfigurationKey = 'extensions';
export const AutoUpdateConfigurationKey = 'extensions.autoUpdate';
export const AutoCheckUpdatesConfigurationKey = 'extensions.autoCheckUpdates';
export const CloseExtensionDetailsOnViewChangeKey = 'extensions.closeExtensionDetailsOnViewChange';
export const AutoRestartConfigurationKey = 'extensions.autoRestart';
let ExtensionContainers = class ExtensionContainers extends Disposable {
    constructor(containers, extensionsWorkbenchService) {
        super();
        this.containers = containers;
        this._register(extensionsWorkbenchService.onChange(this.update, this));
    }
    set extension(extension) {
        this.containers.forEach(c => c.extension = extension);
    }
    update(extension) {
        for (const container of this.containers) {
            if (extension && container.extension) {
                if (areSameExtensions(container.extension.identifier, extension.identifier)) {
                    if (container.extension.server && extension.server && container.extension.server !== extension.server) {
                        if (container.updateWhenCounterExtensionChanges) {
                            container.update();
                        }
                    }
                    else {
                        container.extension = extension;
                    }
                }
            }
            else {
                container.update();
            }
        }
    }
};
ExtensionContainers = __decorate([
    __param(1, IExtensionsWorkbenchService)
], ExtensionContainers);
export { ExtensionContainers };
export const WORKSPACE_RECOMMENDATIONS_VIEW_ID = 'workbench.views.extensions.workspaceRecommendations';
export const OUTDATED_EXTENSIONS_VIEW_ID = 'workbench.views.extensions.searchOutdated';
export const TOGGLE_IGNORE_EXTENSION_ACTION_ID = 'workbench.extensions.action.toggleIgnoreExtension';
export const SELECT_INSTALL_VSIX_EXTENSION_COMMAND_ID = 'workbench.extensions.action.installVSIX';
export const INSTALL_EXTENSION_FROM_VSIX_COMMAND_ID = 'workbench.extensions.command.installFromVSIX';
export const LIST_WORKSPACE_UNSUPPORTED_EXTENSIONS_COMMAND_ID = 'workbench.extensions.action.listWorkspaceUnsupportedExtensions';
// Context Keys
export const DefaultViewsContext = new RawContextKey('defaultExtensionViews', true);
export const HasOutdatedExtensionsContext = new RawContextKey('hasOutdatedExtensions', false);
export const CONTEXT_HAS_GALLERY = new RawContextKey('hasGallery', false);
export const CONTEXT_EXTENSIONS_GALLERY_STATUS = new RawContextKey('extensionsGalleryStatus', "unavailable" /* ExtensionGalleryManifestStatus.Unavailable */);
export const ExtensionResultsListFocused = new RawContextKey('extensionResultListFocused ', true);
export const SearchMcpServersContext = new RawContextKey('searchMcpServers', false);
export const SearchAgentPluginsContext = new RawContextKey('searchAgentPlugins', false);
// Context Menu Groups
export const THEME_ACTIONS_GROUP = '_theme_';
export const INSTALL_ACTIONS_GROUP = '0_install';
export const UPDATE_ACTIONS_GROUP = '0_update';
export const extensionsSearchActionsMenu = new MenuId('extensionsSearchActionsMenu');
export const extensionsFilterSubMenu = new MenuId('extensionsFilterSubMenu');
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBTTdGLE9BQU8sRUFBRSxVQUFVLEVBQWUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMvRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw0RUFBNEUsQ0FBQztBQUkvRyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFHckYsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBSXhFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUcvQyxNQUFNLENBQUMsTUFBTSxVQUFVLEdBQUcsMkJBQTJCLENBQUM7QUFDdEQsTUFBTSxDQUFDLE1BQU0sbUJBQW1CLEdBQUcsU0FBUyxDQUFDLFlBQVksRUFBRSxZQUFZLENBQUMsQ0FBQztBQVl6RSxNQUFNLENBQU4sSUFBa0IsY0FLakI7QUFMRCxXQUFrQixjQUFjO0lBQy9CLCtEQUFVLENBQUE7SUFDViw2REFBUyxDQUFBO0lBQ1QsbUVBQVksQ0FBQTtJQUNaLGlFQUFXLENBQUE7QUFDWixDQUFDLEVBTGlCLGNBQWMsS0FBZCxjQUFjLFFBSy9CO0FBRUQsTUFBTSxDQUFOLElBQWtCLDBCQU1qQjtBQU5ELFdBQWtCLDBCQUEwQjtJQUMzQywyREFBNkIsQ0FBQTtJQUM3QixxRUFBdUMsQ0FBQTtJQUN2QywrREFBaUMsQ0FBQTtJQUNqQyx5REFBMkIsQ0FBQTtJQUMzQiwrREFBaUMsQ0FBQTtBQUNsQyxDQUFDLEVBTmlCLDBCQUEwQixLQUExQiwwQkFBMEIsUUFNM0M7QUE2REQsTUFBTSxDQUFDLE1BQU0sMkJBQTJCLEdBQUcsZUFBZSxDQUE4Qiw0QkFBNEIsQ0FBQyxDQUFDO0FBZ0V0SCxNQUFNLENBQU4sSUFBa0Isa0JBTWpCO0FBTkQsV0FBa0Isa0JBQWtCO0lBQ25DLHVDQUFpQixDQUFBO0lBQ2pCLDJDQUFxQixDQUFBO0lBQ3JCLDZDQUF1QixDQUFBO0lBQ3ZCLG1EQUE2QixDQUFBO0lBQzdCLHFEQUErQixDQUFBO0FBQ2hDLENBQUMsRUFOaUIsa0JBQWtCLEtBQWxCLGtCQUFrQixRQU1uQztBQUVELE1BQU0sQ0FBQyxNQUFNLGdCQUFnQixHQUFHLFlBQVksQ0FBQztBQUM3QyxNQUFNLENBQUMsTUFBTSwwQkFBMEIsR0FBRyx1QkFBdUIsQ0FBQztBQUNsRSxNQUFNLENBQUMsTUFBTSxnQ0FBZ0MsR0FBRyw2QkFBNkIsQ0FBQztBQUM5RSxNQUFNLENBQUMsTUFBTSxvQ0FBb0MsR0FBRyw4Q0FBOEMsQ0FBQztBQUNuRyxNQUFNLENBQUMsTUFBTSwyQkFBMkIsR0FBRyx3QkFBd0IsQ0FBQztBQXlCN0QsSUFBTSxtQkFBbUIsR0FBekIsTUFBTSxtQkFBb0IsU0FBUSxVQUFVO0lBRWxELFlBQ2tCLFVBQWlDLEVBQ3JCLDBCQUF1RDtRQUVwRixLQUFLLEVBQUUsQ0FBQztRQUhTLGVBQVUsR0FBVixVQUFVLENBQXVCO1FBSWxELElBQUksQ0FBQyxTQUFTLENBQUMsMEJBQTBCLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztJQUN4RSxDQUFDO0lBRUQsSUFBSSxTQUFTLENBQUMsU0FBcUI7UUFDbEMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsU0FBUyxHQUFHLFNBQVMsQ0FBQyxDQUFDO0lBQ3ZELENBQUM7SUFFTyxNQUFNLENBQUMsU0FBaUM7UUFDL0MsS0FBSyxNQUFNLFNBQVMsSUFBSSxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDekMsSUFBSSxTQUFTLElBQUksU0FBUyxDQUFDLFNBQVMsRUFBRSxDQUFDO2dCQUN0QyxJQUFJLGlCQUFpQixDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsVUFBVSxFQUFFLFNBQVMsQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDO29CQUM3RSxJQUFJLFNBQVMsQ0FBQyxTQUFTLENBQUMsTUFBTSxJQUFJLFNBQVMsQ0FBQyxNQUFNLElBQUksU0FBUyxDQUFDLFNBQVMsQ0FBQyxNQUFNLEtBQUssU0FBUyxDQUFDLE1BQU0sRUFBRSxDQUFDO3dCQUN2RyxJQUFJLFNBQVMsQ0FBQyxpQ0FBaUMsRUFBRSxDQUFDOzRCQUNqRCxTQUFTLENBQUMsTUFBTSxFQUFFLENBQUM7d0JBQ3BCLENBQUM7b0JBQ0YsQ0FBQzt5QkFBTSxDQUFDO3dCQUNQLFNBQVMsQ0FBQyxTQUFTLEdBQUcsU0FBUyxDQUFDO29CQUNqQyxDQUFDO2dCQUNGLENBQUM7WUFDRixDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsU0FBUyxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ3BCLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztDQUNELENBQUE7QUEvQlksbUJBQW1CO0lBSTdCLFdBQUEsMkJBQTJCLENBQUE7R0FKakIsbUJBQW1CLENBK0IvQjs7QUFFRCxNQUFNLENBQUMsTUFBTSxpQ0FBaUMsR0FBRyxxREFBcUQsQ0FBQztBQUN2RyxNQUFNLENBQUMsTUFBTSwyQkFBMkIsR0FBRywyQ0FBMkMsQ0FBQztBQUN2RixNQUFNLENBQUMsTUFBTSxpQ0FBaUMsR0FBRyxtREFBbUQsQ0FBQztBQUNyRyxNQUFNLENBQUMsTUFBTSx3Q0FBd0MsR0FBRyx5Q0FBeUMsQ0FBQztBQUNsRyxNQUFNLENBQUMsTUFBTSxzQ0FBc0MsR0FBRyw4Q0FBOEMsQ0FBQztBQUVyRyxNQUFNLENBQUMsTUFBTSxnREFBZ0QsR0FBRyxnRUFBZ0UsQ0FBQztBQUVqSSxlQUFlO0FBQ2YsTUFBTSxDQUFDLE1BQU0sbUJBQW1CLEdBQUcsSUFBSSxhQUFhLENBQVUsdUJBQXVCLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFDN0YsTUFBTSxDQUFDLE1BQU0sNEJBQTRCLEdBQUcsSUFBSSxhQUFhLENBQVUsdUJBQXVCLEVBQUUsS0FBSyxDQUFDLENBQUM7QUFDdkcsTUFBTSxDQUFDLE1BQU0sbUJBQW1CLEdBQUcsSUFBSSxhQUFhLENBQVUsWUFBWSxFQUFFLEtBQUssQ0FBQyxDQUFDO0FBQ25GLE1BQU0sQ0FBQyxNQUFNLGlDQUFpQyxHQUFHLElBQUksYUFBYSxDQUFTLHlCQUF5QixpRUFBNkMsQ0FBQztBQUNsSixNQUFNLENBQUMsTUFBTSwyQkFBMkIsR0FBRyxJQUFJLGFBQWEsQ0FBVSw2QkFBNkIsRUFBRSxJQUFJLENBQUMsQ0FBQztBQUMzRyxNQUFNLENBQUMsTUFBTSx1QkFBdUIsR0FBRyxJQUFJLGFBQWEsQ0FBVSxrQkFBa0IsRUFBRSxLQUFLLENBQUMsQ0FBQztBQUM3RixNQUFNLENBQUMsTUFBTSx5QkFBeUIsR0FBRyxJQUFJLGFBQWEsQ0FBVSxvQkFBb0IsRUFBRSxLQUFLLENBQUMsQ0FBQztBQUVqRyxzQkFBc0I7QUFDdEIsTUFBTSxDQUFDLE1BQU0sbUJBQW1CLEdBQUcsU0FBUyxDQUFDO0FBQzdDLE1BQU0sQ0FBQyxNQUFNLHFCQUFxQixHQUFHLFdBQVcsQ0FBQztBQUNqRCxNQUFNLENBQUMsTUFBTSxvQkFBb0IsR0FBRyxVQUFVLENBQUM7QUFFL0MsTUFBTSxDQUFDLE1BQU0sMkJBQTJCLEdBQUcsSUFBSSxNQUFNLENBQUMsNkJBQTZCLENBQUMsQ0FBQztBQUNyRixNQUFNLENBQUMsTUFBTSx1QkFBdUIsR0FBRyxJQUFJLE1BQU0sQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDIn0=