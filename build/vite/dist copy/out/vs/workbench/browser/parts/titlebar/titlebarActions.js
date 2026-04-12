/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize, localize2 } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ACCOUNTS_ACTIVITY_ID, GLOBAL_ACTIVITY_ID } from '../../../common/activity.js';
import { IsMainWindowFullscreenContext, IsCompactTitleBarContext, TitleBarStyleContext, TitleBarVisibleContext } from '../../../common/contextkeys.js';
// --- Context Menu Actions --- //
export class ToggleTitleBarConfigAction extends Action2 {
    constructor(section, title, description, order, when) {
        super({
            id: `toggle.${section}`,
            title,
            metadata: description ? { description } : undefined,
            toggled: ContextKeyExpr.equals(`config.${section}`, true),
            menu: [
                {
                    id: MenuId.TitleBarContext,
                    when,
                    order,
                    group: '2_config'
                },
                {
                    id: MenuId.TitleBarTitleContext,
                    when,
                    order,
                    group: '2_config'
                }
            ]
        });
        this.section = section;
    }
    run(accessor, ...args) {
        const configService = accessor.get(IConfigurationService);
        const value = configService.getValue(this.section);
        configService.updateValue(this.section, !value);
    }
}
registerAction2(class ToggleCommandCenter extends ToggleTitleBarConfigAction {
    constructor() {
        super("window.commandCenter" /* LayoutSettings.COMMAND_CENTER */, localize('toggle.commandCenter', 'Command Center'), localize('toggle.commandCenterDescription', "Toggle visibility of the Command Center in title bar"), 1, IsCompactTitleBarContext.toNegated());
    }
});
registerAction2(class ToggleNavigationControl extends ToggleTitleBarConfigAction {
    constructor() {
        super('workbench.navigationControl.enabled', localize('toggle.navigation', 'Navigation Controls'), localize('toggle.navigationDescription', "Toggle visibility of the Navigation Controls in title bar"), 2, ContextKeyExpr.and(IsCompactTitleBarContext.toNegated(), ContextKeyExpr.has(`config.${"window.commandCenter" /* LayoutSettings.COMMAND_CENTER */}`)));
    }
});
registerAction2(class ToggleLayoutControl extends ToggleTitleBarConfigAction {
    constructor() {
        super("workbench.layoutControl.enabled" /* LayoutSettings.LAYOUT_ACTIONS */, localize('toggle.layout', 'Layout Controls'), localize('toggle.layoutDescription', "Toggle visibility of the Layout Controls in title bar"), 4);
    }
});
registerAction2(class ToggleNotificationsButton extends ToggleTitleBarConfigAction {
    constructor() {
        super("workbench.notifications.showInTitleBar" /* NotificationsSettings.NOTIFICATIONS_BUTTON */, localize('toggle.notifications', 'Notifications'), localize('toggle.notificationsDescription', "Toggle visibility of the Notifications button in title bar"), 5, ContextKeyExpr.equals(`config.${"workbench.notifications.position" /* NotificationsSettings.NOTIFICATIONS_POSITION */}`, "top-right" /* NotificationsPosition.TOP_RIGHT */));
    }
});
registerAction2(class ToggleCustomTitleBar extends Action2 {
    constructor() {
        super({
            id: `toggle.${"window.customTitleBarVisibility" /* TitleBarSetting.CUSTOM_TITLE_BAR_VISIBILITY */}`,
            title: localize('toggle.hideCustomTitleBar', 'Hide Custom Title Bar'),
            menu: [
                { id: MenuId.TitleBarContext, order: 0, when: ContextKeyExpr.equals(TitleBarStyleContext.key, "native" /* TitlebarStyle.NATIVE */), group: '3_toggle' },
                { id: MenuId.TitleBarTitleContext, order: 0, when: ContextKeyExpr.equals(TitleBarStyleContext.key, "native" /* TitlebarStyle.NATIVE */), group: '3_toggle' },
            ]
        });
    }
    run(accessor, ...args) {
        const configService = accessor.get(IConfigurationService);
        configService.updateValue("window.customTitleBarVisibility" /* TitleBarSetting.CUSTOM_TITLE_BAR_VISIBILITY */, "never" /* CustomTitleBarVisibility.NEVER */);
    }
});
registerAction2(class ToggleCustomTitleBarWindowed extends Action2 {
    constructor() {
        super({
            id: `toggle.${"window.customTitleBarVisibility" /* TitleBarSetting.CUSTOM_TITLE_BAR_VISIBILITY */}.windowed`,
            title: localize('toggle.hideCustomTitleBarInFullScreen', 'Hide Custom Title Bar In Full Screen'),
            menu: [
                { id: MenuId.TitleBarContext, order: 1, when: IsMainWindowFullscreenContext, group: '3_toggle' },
                { id: MenuId.TitleBarTitleContext, order: 1, when: IsMainWindowFullscreenContext, group: '3_toggle' },
            ]
        });
    }
    run(accessor, ...args) {
        const configService = accessor.get(IConfigurationService);
        configService.updateValue("window.customTitleBarVisibility" /* TitleBarSetting.CUSTOM_TITLE_BAR_VISIBILITY */, "windowed" /* CustomTitleBarVisibility.WINDOWED */);
    }
});
class ToggleCustomTitleBar extends Action2 {
    constructor() {
        super({
            id: `toggle.toggleCustomTitleBar`,
            title: localize('toggle.customTitleBar', 'Custom Title Bar'),
            toggled: TitleBarVisibleContext,
            menu: [
                {
                    id: MenuId.MenubarAppearanceMenu,
                    order: 6,
                    when: ContextKeyExpr.or(ContextKeyExpr.and(ContextKeyExpr.equals(TitleBarStyleContext.key, "native" /* TitlebarStyle.NATIVE */), ContextKeyExpr.and(ContextKeyExpr.equals('config.workbench.layoutControl.enabled', false), ContextKeyExpr.equals('config.window.commandCenter', false), ContextKeyExpr.notEquals('config.workbench.editor.editorActionsLocation', 'titleBar'), ContextKeyExpr.notEquals('config.workbench.activityBar.location', 'top'), ContextKeyExpr.notEquals('config.workbench.activityBar.location', 'bottom'))?.negate()), IsMainWindowFullscreenContext),
                    group: '2_workbench_layout'
                },
            ],
        });
    }
    run(accessor, ...args) {
        const configService = accessor.get(IConfigurationService);
        const contextKeyService = accessor.get(IContextKeyService);
        const titleBarVisibility = configService.getValue("window.customTitleBarVisibility" /* TitleBarSetting.CUSTOM_TITLE_BAR_VISIBILITY */);
        switch (titleBarVisibility) {
            case "never" /* CustomTitleBarVisibility.NEVER */:
                configService.updateValue("window.customTitleBarVisibility" /* TitleBarSetting.CUSTOM_TITLE_BAR_VISIBILITY */, "auto" /* CustomTitleBarVisibility.AUTO */);
                break;
            case "windowed" /* CustomTitleBarVisibility.WINDOWED */: {
                const isFullScreen = IsMainWindowFullscreenContext.evaluate(contextKeyService.getContext(null));
                if (isFullScreen) {
                    configService.updateValue("window.customTitleBarVisibility" /* TitleBarSetting.CUSTOM_TITLE_BAR_VISIBILITY */, "auto" /* CustomTitleBarVisibility.AUTO */);
                }
                else {
                    configService.updateValue("window.customTitleBarVisibility" /* TitleBarSetting.CUSTOM_TITLE_BAR_VISIBILITY */, "never" /* CustomTitleBarVisibility.NEVER */);
                }
                break;
            }
            case "auto" /* CustomTitleBarVisibility.AUTO */:
            default:
                configService.updateValue("window.customTitleBarVisibility" /* TitleBarSetting.CUSTOM_TITLE_BAR_VISIBILITY */, "never" /* CustomTitleBarVisibility.NEVER */);
                break;
        }
    }
}
registerAction2(ToggleCustomTitleBar);
registerAction2(class ShowCustomTitleBar extends Action2 {
    constructor() {
        super({
            id: `showCustomTitleBar`,
            title: localize2('showCustomTitleBar', "Show Custom Title Bar"),
            precondition: TitleBarVisibleContext.negate(),
            f1: true
        });
    }
    run(accessor, ...args) {
        const configService = accessor.get(IConfigurationService);
        configService.updateValue("window.customTitleBarVisibility" /* TitleBarSetting.CUSTOM_TITLE_BAR_VISIBILITY */, "auto" /* CustomTitleBarVisibility.AUTO */);
    }
});
registerAction2(class HideCustomTitleBar extends Action2 {
    constructor() {
        super({
            id: `hideCustomTitleBar`,
            title: localize2('hideCustomTitleBar', "Hide Custom Title Bar"),
            precondition: TitleBarVisibleContext,
            f1: true
        });
    }
    run(accessor, ...args) {
        const configService = accessor.get(IConfigurationService);
        configService.updateValue("window.customTitleBarVisibility" /* TitleBarSetting.CUSTOM_TITLE_BAR_VISIBILITY */, "never" /* CustomTitleBarVisibility.NEVER */);
    }
});
registerAction2(class HideCustomTitleBar extends Action2 {
    constructor() {
        super({
            id: `hideCustomTitleBarInFullScreen`,
            title: localize2('hideCustomTitleBarInFullScreen', "Hide Custom Title Bar In Full Screen"),
            precondition: ContextKeyExpr.and(TitleBarVisibleContext, IsMainWindowFullscreenContext),
            f1: true
        });
    }
    run(accessor, ...args) {
        const configService = accessor.get(IConfigurationService);
        configService.updateValue("window.customTitleBarVisibility" /* TitleBarSetting.CUSTOM_TITLE_BAR_VISIBILITY */, "windowed" /* CustomTitleBarVisibility.WINDOWED */);
    }
});
registerAction2(class ToggleEditorActions extends Action2 {
    static { this.settingsID = `workbench.editor.editorActionsLocation`; }
    constructor() {
        const titleBarContextCondition = ContextKeyExpr.and(ContextKeyExpr.equals(`config.workbench.editor.showTabs`, 'none').negate(), ContextKeyExpr.equals(`config.${ToggleEditorActions.settingsID}`, 'default'))?.negate();
        super({
            id: `toggle.${ToggleEditorActions.settingsID}`,
            title: localize('toggle.editorActions', 'Editor Actions'),
            toggled: ContextKeyExpr.equals(`config.${ToggleEditorActions.settingsID}`, 'hidden').negate(),
            menu: [
                { id: MenuId.TitleBarContext, order: 3, when: titleBarContextCondition, group: '2_config' },
                { id: MenuId.TitleBarTitleContext, order: 3, when: titleBarContextCondition, group: '2_config' }
            ]
        });
    }
    run(accessor, ...args) {
        const configService = accessor.get(IConfigurationService);
        const storageService = accessor.get(IStorageService);
        const location = configService.getValue(ToggleEditorActions.settingsID);
        if (location === 'hidden') {
            const showTabs = configService.getValue("workbench.editor.showTabs" /* LayoutSettings.EDITOR_TABS_MODE */);
            // If tabs are visible, then set the editor actions to be in the title bar
            if (showTabs !== 'none') {
                configService.updateValue(ToggleEditorActions.settingsID, 'titleBar');
            }
            // If tabs are not visible, then set the editor actions to the last location the were before being hidden
            else {
                const storedValue = storageService.get(ToggleEditorActions.settingsID, 0 /* StorageScope.PROFILE */);
                configService.updateValue(ToggleEditorActions.settingsID, storedValue ?? 'default');
            }
            storageService.remove(ToggleEditorActions.settingsID, 0 /* StorageScope.PROFILE */);
        }
        // Store the current value (titleBar or default) in the storage service for later to restore
        else {
            configService.updateValue(ToggleEditorActions.settingsID, 'hidden');
            storageService.store(ToggleEditorActions.settingsID, location, 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        }
    }
});
// --- Toolbar actions --- //
export const ACCOUNTS_ACTIVITY_TILE_ACTION = {
    id: ACCOUNTS_ACTIVITY_ID,
    label: localize('accounts', "Accounts"),
    tooltip: localize('accounts', "Accounts"),
    class: undefined,
    enabled: true,
    run: function () { }
};
export const GLOBAL_ACTIVITY_TITLE_ACTION = {
    id: GLOBAL_ACTIVITY_ID,
    label: localize('manage', "Manage"),
    tooltip: localize('manage', "Manage"),
    class: undefined,
    enabled: true,
    run: function () { }
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGl0bGViYXJBY3Rpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2Jyb3dzZXIvcGFydHMvdGl0bGViYXIvdGl0bGViYXJBY3Rpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBb0IsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzNFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBRW5HLE9BQU8sRUFBRSxlQUFlLEVBQStCLE1BQU0sZ0RBQWdELENBQUM7QUFFOUcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDbEcsT0FBTyxFQUFFLGNBQWMsRUFBd0Isa0JBQWtCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUNoSSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUV2RixPQUFPLEVBQUUsNkJBQTZCLEVBQUUsd0JBQXdCLEVBQUUsb0JBQW9CLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUl2SixrQ0FBa0M7QUFFbEMsTUFBTSxPQUFPLDBCQUEyQixTQUFRLE9BQU87SUFFdEQsWUFBNkIsT0FBZSxFQUFFLEtBQWEsRUFBRSxXQUFrRCxFQUFFLEtBQWEsRUFBRSxJQUEyQjtRQUUxSixLQUFLLENBQUM7WUFDTCxFQUFFLEVBQUUsVUFBVSxPQUFPLEVBQUU7WUFDdkIsS0FBSztZQUNMLFFBQVEsRUFBRSxXQUFXLENBQUMsQ0FBQyxDQUFDLEVBQUUsV0FBVyxFQUFFLENBQUMsQ0FBQyxDQUFDLFNBQVM7WUFDbkQsT0FBTyxFQUFFLGNBQWMsQ0FBQyxNQUFNLENBQUMsVUFBVSxPQUFPLEVBQUUsRUFBRSxJQUFJLENBQUM7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