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
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
export class ToggleMultiCursorModifierAction extends Action2 {
    static { this.ID = 'workbench.action.toggleMultiCursorModifier'; }
    static { this.multiCursorModifierConfigurationKey = 'editor.multiCursorModifier'; }
    constructor() {
        super({
            id: ToggleMultiCursorModifierAction.ID,
            title: localize2('toggleLocation', 'Toggle Multi-Cursor Modifier'),
            f1: true
        });
    }
    run(accessor) {
        const configurationService = accessor.get(IConfigurationService);
        const editorConf = configurationService.getValue('editor');
        const newValue = (editorConf.multiCursorModifier === 'ctrlCmd' ? 'alt' : 'ctrlCmd');
        return configurationService.updateValue(ToggleMultiCursorModifierAction.multiCursorModifierConfigurationKey, newValue);
    }
}
const multiCursorModifier = new RawContextKey('multiCursorModifier', 'altKey');
let MultiCursorModifierContextKeyController = class MultiCursorModifierContextKeyController extends Disposable {
    constructor(configurationService, contextKeyService) {
        super();
        this.configurationService = configurationService;
        this._multiCursorModifier = multiCursorModifier.bindTo(contextKeyService);
        this._update();
        this._register(configurationService.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('editor.multiCursorModifier')) {
                this._update();
            }
        }));
    }
    _update() {
        const editorConf = this.configurationService.getValue('editor');
        const value = (editorConf.multiCursorModifier === 'ctrlCmd' ? 'ctrlCmd' : 'altKey');
        this._multiCursorModifier.set(value);
    }
};
MultiCursorModifierContextKeyController = __decorate([
    __param(0, IConfigurationService),
    __param(1, IContextKeyService)
], MultiCursorModifierContextKeyController);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(MultiCursorModifierContextKeyController, 3 /* LifecyclePhase.Restored */);
registerAction2(ToggleMultiCursorModifierAction);
MenuRegistry.appendMenuItem(MenuId.MenubarSelectionMenu, {
    group: '4_config',
    command: {
        id: ToggleMultiCursorModifierAction.ID,
        title: localize('miMultiCursorAlt', "Switch to Alt+Click for Multi-Cursor")
    },
    when: multiCursorModifier.isEqualTo('ctrlCmd'),
    order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarSelectionMenu, {
    group: '4_config',
    command: {
        id: ToggleMultiCursorModifierAction.ID,
        title: (isMacintosh
            ? localize('miMultiCursorCmd', "Switch to Cmd+Click for Multi-Cursor")
            : localize('miMultiCursorCtrl', "Switch to Ctrl+Click for Multi-Cursor"))
    },
    when: multiCursorModifier.isEqualTo('altKey'),
    order: 1
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9nZ2xlTXVsdGlDdXJzb3JNb2RpZmllci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NvZGVFZGl0b3IvYnJvd3Nlci90b2dnbGVNdWx0aUN1cnNvck1vZGlmaWVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUN6RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxZQUFZLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDaEgsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFlLGtCQUFrQixFQUFFLGFBQWEsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBRXRILE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUM1RSxPQUFPLEVBQTJELFVBQVUsSUFBSSxtQkFBbUIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRzlJLE1BQU0sT0FBTywrQkFBZ0MsU0FBUSxPQUFPO2FBRTNDLE9BQUUsR0FBRyw0Q0FBNEMsQ0FBQzthQUUxQyx3Q0FBbUMsR0FBRyw0QkFBNEIsQ0FBQztJQUUzRjtRQUNDLEtBQUssQ0FBQztZQUNMLEVBQUUsRUFBRSwrQkFBK0IsQ0FBQyxFQUFFO1lBQ3RDLEtBQUssRUFBRSxTQUFTLENBQUMsZ0JBQWdCLEVBQUUsOEJBQThCLENBQUM7WUFDbEUsRUFBRSxFQUFFLElBQUk7U0FDUixDQUFDLENBQUM7SUFDSixDQUFDO0lBRVEsR0FBRyxDQUFDLFFBQTBCO1FBQ3RDLE1BQU0sb0JBQW9CLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO1FBRWpFLE1BQU0sVUFBVSxHQUFHLG9CQUFvQixDQUFDLFFBQVEsQ0FBNkMsUUFBUSxDQUFDLENBQUM7UUFDdkcsTUFBTSxRQUFRLEdBQXNCLENBQUMsVUFBVSxDQUFDLG1CQUFtQixLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUV2RyxPQUFPLG9CQUFvQixDQUFDLFdBQVcsQ0FBQywrQkFBK0IsQ0FBQyxtQ0FBbUMsRUFBRSxRQUFRLENBQUMsQ0FBQztJQUN4SCxDQUFDOztBQUdGLE1BQU0sbUJBQW1CLEdBQUcsSUFBSSxhQUFhLENBQVMscUJBQXFCLEVBQUUsUUFBUSxDQUFDLENBQUM7QUFFdkYsSUFBTSx1Q0FBdUMsR0FBN0MsTUFBTSx1Q0FBd0MsU0FBUSxVQUFVO0lBSS9ELFlBQ3lDLG9CQUEyQyxFQUMvRCxpQkFBcUM7UUFFekQsS0FBSyxFQUFFLENBQUM7UUFIZ0MseUJBQW9CLEdBQXBCLG9CQUFvQixDQUF1QjtRQUluRixJQUFJLENBQUMsb0JBQW9CLEdBQUcsbUJBQW1CLENBQUMsTUFBTSxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFFMUUsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2YsSUFBSSxDQUFDLFNBQVMsQ0FBQyxvQkFBb0IsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFO1lBQ2xFLElBQUksQ0FBQyxDQUFDLG9CQUFvQixDQUFDLDRCQUE0QixDQUFDLEVBQUUsQ0FBQztnQkFDMUQsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ2hCLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVPLE9BQU87UUFDZCxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsUUFBUSxDQUE2QyxRQUFRLENBQUMsQ0FBQztRQUM1RyxNQUFNLEtBQUssR0FBRyxDQUFDLFVBQVUsQ0FBQyxtQkFBbUIsS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDcEYsSUFBSSxDQUFDLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUN0QyxDQUFDO0NBQ0QsQ0FBQTtBQXhCSyx1Q0FBdUM7SUFLMUMsV0FBQSxxQkFBcUIsQ0FBQTtJQUNyQixXQUFBLGtCQUFrQixDQUFBO0dBTmYsdUNBQXVDLENBd0I1QztBQUVELFFBQVEsQ0FBQyxFQUFFLENBQWtDLG1CQUFtQixDQUFDLFNBQVMsQ0FBQyxDQUFDLDZCQUE2QixDQUFDLHVDQUF1QyxrQ0FBMEIsQ0FBQztBQUU1SyxlQUFlLENBQUMsK0JBQStCLENBQUMsQ0FBQztBQUVqRCxZQUFZLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxvQkFBb0IsRUFBRTtJQUN4RCxLQUFLLEVBQUUsVUFBVTtJQUNqQixPQUFPLEVBQUU7UUFDUixFQUFFLEVBQUUsK0JBQStCLENBQUMsRUFBRTtRQUN0QyxLQUFLLEVBQUUsUUFBUSxDQUFDLGtCQUFrQixFQUFFLHNDQUFzQyxDQUFDO0tBQzNFO0lBQ0QsSUFBSSxFQUFFLG1CQUFtQixDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUM7SUFDOUMsS0FBSyxFQUFFLENBQUM7Q0FDUixDQUFDLENBQUM7QUFDSCxZQUFZLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxvQkFBb0IsRUFBRTtJQUN4RCxLQUFLLEVBQUUsVUFBVTtJQUNqQixPQUFPLEVBQUU7UUFDUixFQUFFLEVBQUUsK0JBQStCLENBQUMsRUFBRTtRQUN0QyxLQUFLLEVBQUUsQ0FDTixXQUFXO1lBQ1YsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxrQkFBa0IsRUFBRSxzQ0FBc0MsQ0FBQztZQUN0RSxDQUFDLENBQUMsUUFBUSxDQUFDLG1CQUFtQixFQUFFLHVDQUF1QyxDQUFDLENBQ3pFO0tBQ0Q7SUFDRCxJQUFJLEVBQUUsbUJBQW1CLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQztJQUM3QyxLQUFLLEVBQUUsQ0FBQztDQUNSLENBQUMsQ0FBQyJ9