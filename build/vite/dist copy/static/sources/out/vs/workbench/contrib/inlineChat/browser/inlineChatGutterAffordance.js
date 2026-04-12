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
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter } from '../../../../base/common/event.js';
import { constObservable, derived, observableFromEvent, observableValue } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { LineRange } from '../../../../editor/common/core/ranges/lineRange.js';
import { CodeActionController } from '../../../../editor/contrib/codeAction/browser/codeActionController.js';
import { InlineEditsGutterIndicator, InlineEditsGutterIndicatorData, InlineSuggestionGutterMenuData, SimpleInlineSuggestModel } from '../../../../editor/contrib/inlineCompletions/browser/view/inlineEdits/components/gutterIndicatorView.js';
import { InlineEditTabAction } from '../../../../editor/contrib/inlineCompletions/browser/view/inlineEdits/inlineEditsViewInterface.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IMenuService, MenuId, MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IUserInteractionService } from '../../../../platform/userInteraction/browser/userInteractionService.js';
let InlineChatGutterAffordance = class InlineChatGutterAffordance extends InlineEditsGutterIndicator {
    constructor(myEditorObs, selection, _keybindingService, hoverService, instantiationService, accessibilityService, themeService, userInteractionService, menuService, contextKeyService) {
        const menu = menuService.createMenu(MenuId.InlineChatEditorAffordance, contextKeyService);
        const menuObs = observableFromEvent(menu.onDidChange, () => menu.getActions({ renderShortTitle: false }));
        const codeActionController = CodeActionController.get(myEditorObs.editor);
        const lightBulbObs = codeActionController?.lightBulbState;
        const data = derived(r => {
            const value = selection.read(r);
            if (!value) {
                return undefined;
            }
            const commandGroups = [];
            for (const [, groupActions] of menuObs.read(r)) {
                const group = [];
                for (const action of groupActions) {
                    if (action instanceof MenuItemAction) {
                        group.push({
                            command: { id: action.item.id, title: action.label },
                            icon: ThemeIcon.isThemeIcon(action.item.icon) ? action.item.icon : undefined
                        });
                    }
                }
                if (group.length > 0) {
                    commandGroups.push(group);
                }
            }
            // Use the cursor position (active end of selection) to determine the line
            const cursorPosition = value.getPosition();
            const lineRange = new LineRange(cursorPosition.lineNumber, cursorPosition.lineNumber + 1);
            // Create minimal gutter menu data (empty for prototype)
            const gutterMenuData = new InlineSuggestionGutterMenuData(undefined, // action
            '', // displayName
            commandGroups, // extensionCommands
            undefined, // alternativeAction
            undefined, // modelInfo
            undefined, // setModelId
            true);
            // Use lightbulb icon/color when code actions are available, otherwise sparkle
            const lightBulbInfo = lightBulbObs?.read(r);
            const icon = lightBulbInfo ? lightBulbInfo.icon : Codicon.sparkle;
            return new InlineEditsGutterIndicatorData(gutterMenuData, lineRange, new SimpleInlineSuggestModel(() => { }, () => { }), undefined, // altAction
            { icon });
        });
        const focusIsInMenu = observableValue({}, false);
        super(myEditorObs, data, constObservable(InlineEditTabAction.Inactive), constObservable(0), constObservable(false), focusIsInMenu, hoverService, instantiationService, accessibilityService, themeService, userInteractionService);
        this._onDidRunAction = this._store.add(new Emitter());
        this.onDidRunAction = this._onDidRunAction.event;
        this._store.add(menu);
        this._store.add(this.onDidCloseWithCommand(commandId => this._onDidRunAction.fire(commandId)));
    }
};
InlineChatGutterAffordance = __decorate([
    __param(2, IKeybindingService),
    __param(3, IHoverService),
    __param(4, IInstantiationService),
    __param(5, IAccessibilityService),
    __param(6, IThemeService),
    __param(7, IUserInteractionService),
    __param(8, IMenuService),
    __param(9, IContextKeyService)
], InlineChatGutterAffordance);
export { InlineChatGutterAffordance };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5saW5lQ2hhdEd1dHRlckFmZm9yZGFuY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9pbmxpbmVDaGF0L2Jyb3dzZXIvaW5saW5lQ2hhdEd1dHRlckFmZm9yZGFuY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE9BQU8sRUFBZSxtQkFBbUIsRUFBRSxlQUFlLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNwSSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFakUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBRy9FLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHVFQUF1RSxDQUFDO0FBQzdHLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSw4QkFBOEIsRUFBRSw4QkFBOEIsRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHlHQUF5RyxDQUFDO0FBQy9PLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLG1HQUFtRyxDQUFDO0FBQ3hJLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxFQUFFLGNBQWMsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUU1RSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNu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