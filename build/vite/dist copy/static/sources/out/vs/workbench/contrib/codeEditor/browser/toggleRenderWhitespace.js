/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
const renderWhitespaceSetting = 'editor.renderWhitespace';
class RenderWhitespaceNoneAction extends Action2 {
    static { this.ID = 'editor.action.renderWhitespace.none'; }
    constructor() {
        super({
            id: RenderWhitespaceNoneAction.ID,
            title: localize2('renderWhitespace.setNone', "Set Render Whitespace to None"),
            shortTitle: localize2('renderWhitespace.none', "None"),
            category: Categories.View,
            f1: false,
            toggled: ContextKeyExpr.equals(`config.${renderWhitespaceSetting}`, 'none'),
            menu: { id: MenuId.EditorRenderWhitespaceSubmenu, group: '1_config', order: 1 },
        });
    }
    run(accessor) {
        return accessor.get(IConfigurationService).updateValue(renderWhitespaceSetting, 'none');
    }
}
class RenderWhitespaceBoundaryAction extends Action2 {
    static { this.ID = 'editor.action.renderWhitespace.boundary'; }
    constructor() {
        super({
            id: RenderWhitespaceBoundaryAction.ID,
            title: localize2('renderWhitespace.setBoundary', "Set Render Whitespace to Boundary"),
            shortTitle: localize2('renderWhitespace.boundary', "Boundary"),
            category: Categories.View,
            f1: false,
            toggled: ContextKeyExpr.equals(`config.${renderWhitespaceSetting}`, 'boundary'),
            menu: { id: MenuId.EditorRenderWhitespaceSubmenu, group: '1_config', order: 2 },
        });
    }
    run(accessor) {
        return accessor.get(IConfigurationService).updateValue(renderWhitespaceSetting, 'boundary');
    }
}
class RenderWhitespaceSelectionAction extends Action2 {
    static { this.ID = 'editor.action.renderWhitespace.selection'; }
    constructor() {
        super({
            id: RenderWhitespaceSelectionAction.ID,
            title: localize2('renderWhitespace.setSelection', "Set Render Whitespace to Selection"),
            shortTitle: localize2('renderWhitespace.selection', "Selection"),
            category: Categories.View,
            f1: false,
            toggled: ContextKeyExpr.equals(`config.${renderWhitespaceSetting}`, 'selection'),
            menu: { id: MenuId.EditorRenderWhitespaceSubmenu, group: '1_config', order: 3 },
        });
    }
    run(accessor) {
        return accessor.get(IConfigurationService).updateValue(renderWhitespaceSetting, 'selection');
    }
}
class RenderWhitespaceTrailingAction extends Action2 {
    static { this.ID = 'editor.action.renderWhitespace.trailing'; }
    constructor() {
        super({
            id: RenderWhitespaceTrailingAction.ID,
            title: localize2('renderWhitespace.setTrailing', "Set Render Whitespace to Trailing"),
            shortTitle: localize2('renderWhitespace.trailing', "Trailing"),
            category: Categories.View,
            f1: false,
            toggled: ContextKeyExpr.equals(`config.${renderWhitespaceSetting}`, 'trailing'),
            menu: { id: MenuId.EditorRenderWhitespaceSubmenu, group: '1_config', order: 4 },
        });
    }
    run(accessor) {
        return accessor.get(IConfigurationService).updateValue(renderWhitespaceSetting, 'trailing');
    }
}
class RenderWhitespaceAllAction extends Action2 {
    static { this.ID = 'editor.action.renderWhitespace.all'; }
    constructor() {
        super({
            id: RenderWhitespaceAllAction.ID,
            title: localize2('renderWhitespace.setAll', "Set Render Whitespace to All"),
            shortTitle: localize2('renderWhitespace.all', "All"),
            category: Categories.View,
            f1: false,
            toggled: ContextKeyExpr.equals(`config.${renderWhitespaceSetting}`, 'all'),
            menu: { id: MenuId.EditorRenderWhitespaceSubmenu, group: '1_config', order: 5 },
        });
    }
    run(accessor) {
        return accessor.get(IConfigurationService).updateValue(renderWhitespaceSetting, 'all');
    }
}
class ToggleRenderWhitespaceAction extends Action2 {
    static { this.ID = 'editor.action.toggleRenderWhitespace'; }
    constructor() {
        super({
            id: ToggleRenderWhitespaceAction.ID,
            title: localize2('toggleRenderWhitespace', "Toggle Render Whitespace"),
            category: Categories.View,
            f1: true,
        });
    }
    run(accessor) {
        const configurationService = accessor.get(IConfigurationService);
        const renderWhitespace = configurationService.getValue(renderWhitespaceSetting);
        let newRenderWhitespace;
        if (renderWhitespace === 'none') {
            newRenderWhitespace = 'all';
        }
        else {
            newRenderWhitespace = 'none';
        }
        return configurationService.updateValue(renderWhitespaceSetting, newRenderWhitespace);
    }
}
registerAction2(RenderWhitespaceNoneAction);
registerAction2(RenderWhitespaceBoundaryAction);
registerAction2(RenderWhitespaceSelectionAction);
registerAction2(RenderWhitespaceTrailingAction);
registerAction2(RenderWhitespaceAllAction);
registerAction2(ToggleRenderWhitespaceAction);
MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
    submenu: MenuId.EditorRenderWhitespaceSubmenu,
    title: localize('renderWhitespace', "Render Whitespace"),
    group: '4_editor',
    order: 4
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9nZ2xlUmVuZGVyV2hpdGVzcGFjZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NvZGVFZGl0b3IvYnJvd3Nlci90b2dnbGVSZW5kZXJXaGl0ZXNwYWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDekQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsWUFBWSxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2hILE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN0RixPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sOERBQThELENBQUM7QUFHMUYsTUFBTSx1QkFBdUIsR0FBRyx5QkFBeUIsQ0FBQztBQUUxRCxNQUFNLDBCQUEyQixTQUFRLE9BQU87YUFDL0IsT0FBRSxHQUFHLHFDQUFxQyxDQUFDO0lBQzNEO1FBQ0MsS0FBSyxDQUFDO1lBQ0wsRUFBRSxFQUFFLDBCQUEwQixDQUFDLEVBQUU7WUFDakMsS0FBSyxFQUFFLFNBQVMsQ0FBQywwQkFBMEIsRUFBRSwrQkFBK0IsQ0FBQztZQUM3RSxVQUFVLEVBQUUsU0FBUyxDQUFDLHVCQUF1QixFQUFFLE1BQU0sQ0FBQztZQUN0RCxRQUFRLEVBQUUsVUFBVSxDQUFDLElBQUk7WUFDekIsRUFBRSxFQUFFLEtBQUs7WUFDVCxPQUFPLEVBQUUsY0FBYyxDQUFDLE1BQU0sQ0FBQyxVQUFVLHVCQUF1QixFQUFFLEVBQUUsTUFBTSxDQUFDO1lBQzNFLElBQUksRUFBRSxFQUFFLEVBQUUsRUFBRSxNQUFNLENBQUMsNkJBQTZCLEVBQUUsS0FBSyxFQUFF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