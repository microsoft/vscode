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
var NavigableContainerManager_1;
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../platform/contextkey/common/contextkey.js';
import { KeybindingsRegistry } from '../../../platform/keybinding/common/keybindingsRegistry.js';
import { WorkbenchListFocusContextKey, WorkbenchListScrollAtBottomContextKey, WorkbenchListScrollAtTopContextKey } from '../../../platform/list/browser/listService.js';
import { combinedDisposable, toDisposable, Disposable } from '../../../base/common/lifecycle.js';
import { registerWorkbenchContribution2 } from '../../common/contributions.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
function handleFocusEventsGroup(group, handler, onPartFocusChange) {
    const focusedIndices = new Set();
    return combinedDisposable(...group.map((events, index) => combinedDisposable(events.onDidFocus(() => {
        onPartFocusChange?.(index, 'focus');
        if (!focusedIndices.size) {
            handler(true);
        }
        focusedIndices.add(index);
    }), events.onDidBlur(() => {
        onPartFocusChange?.(index, 'blur');
        focusedIndices.delete(index);
        if (!focusedIndices.size) {
            handler(false);
        }
    }))));
}
const NavigableContainerFocusedContextKey = new RawContextKey('navigableContainerFocused', false);
let NavigableContainerManager = class NavigableContainerManager {
    static { NavigableContainerManager_1 = this; }
    static { this.ID = 'workbench.contrib.navigableContainerManager'; }
    constructor(contextKeyService, logService, configurationService) {
        this.logService = logService;
        this.configurationService = configurationService;
        this.containers = new Set();
        this.focused = NavigableContainerFocusedContextKey.bindTo(contextKeyService);
        NavigableContainerManager_1.INSTANCE = this;
    }
    dispose() {
        this.containers.clear();
        this.focused.reset();
        NavigableContainerManager_1.INSTANCE = undefined;
    }
    get debugEnabled() {
        return this.configurationService.getValue('workbench.navigibleContainer.enableDebug');
    }
    log(msg, ...args) {
        if (this.debugEnabled) {
            this.logService.debug(msg, ...args);
        }
    }
    static register(container) {
        const instance = this.INSTANCE;
        if (!instance) {
            return Disposable.None;
        }
        instance.containers.add(container);
        instance.log('NavigableContainerManager.register', container.name);
        return combinedDisposable(handleFocusEventsGroup(container.focusNotifiers, (isFocus) => {
            if (isFocus) {
                instance.log('NavigableContainerManager.focus', container.name);
                instance.focused.set(true);
                instance.lastContainer = container;
            }
            else {
                instance.log('NavigableContainerManager.blur', container.name, instance.lastContainer?.name);
                if (instance.lastContainer === container) {
                    instance.focused.set(false);
                    instance.lastContainer = undefined;
                }
            }
        }, (index, event) => {
            instance.log('NavigableContainerManager.partFocusChange', container.name, index, event);
        }), toDisposable(() => {
            instance.containers.delete(container);
            instance.log('NavigableContainerManager.unregister', container.name, instance.lastContainer?.name);
            if (instance.lastContainer === container) {
                instance.focused.set(false);
                instance.lastContainer = undefined;
            }
        }));
    }
    static getActive() {
        return this.INSTANCE?.lastContainer;
    }
};
NavigableContainerManager = NavigableContainerManager_1 = __decorate([
    __param(0, IContextKeyService),
    __param(1, ILogService),
    __param(2, IConfigurationService)
], NavigableContainerManager);
export function registerNavigableContainer(container) {
    return NavigableContainerManager.register(container);
}
registerWorkbenchContribution2(NavigableContainerManager.ID, NavigableContainerManager, 1 /* WorkbenchPhase.BlockStartup */);
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'widgetNavigation.focusPrevious',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: ContextKeyExpr.and(NavigableContainerFocusedContextKey, ContextKeyExpr.or(WorkbenchListFocusContextKey?.negate(), WorkbenchListScrollAtTopContextKey)),
    primary: 2048 /* KeyMod.CtrlCmd */ | 16 /* KeyCode.UpArrow */,
    handler: () => {
        const activeContainer = NavigableContainerManager.getActive();
        activeContainer?.focusPreviousWidget();
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'widgetNavigation.focusNext',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: ContextKeyExpr.and(NavigableContainerFocusedContextKey, ContextKeyExpr.or(WorkbenchListFocusContextKey?.negate(), WorkbenchListScrollAtBottomContextKey)),
    primary: 2048 /* KeyMod.CtrlCmd */ | 18 /* KeyCode.DownArrow */,
    handler: () => {
        const activeContainer = NavigableContainerManager.getActive();
        activeContainer?.focusNextWidget();
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2lkZ2V0TmF2aWdhdGlvbkNvbW1hbmRzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2Jyb3dzZXIvYWN0aW9ucy93aWRnZXROYXZpZ2F0aW9uQ29tbWFuZHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBRSxjQUFjLEVBQWUsa0JBQWtCLEVBQUUsYUFBYSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDbkksT0FBTyxFQUFvQixtQkFBbUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25ILE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxxQ0FBcUMsRUFBRSxrQ0FBa0MsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBRXhLLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxZQUFZLEVBQWUsVUFBVSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDOUcsT0FBTyxFQUFrQiw4QkFBOEIsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQy9GLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNsRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQTBCaEcsU0FBUyxzQkFBc0IsQ0FBQyxLQUFnQyxFQUFFLE9BQW1DLEVBQUUsaUJBQTBEO0lBQ2hLLE1BQU0sY0FBYyxHQUFHLElBQUksR0FBRyxFQUFVLENBQUM7SUFDekMsT0FBTyxrQkFBa0IsQ0FBQyxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQyxrQkFBa0IsQ0FDM0UsTUFBTSxDQUFDLFVBQVUsQ0FBQyxHQUFHLEVBQUU7UUFDdEIsaUJBQWlCLEVBQUUsQ0FBQyxLQUFLLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDcEMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJ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