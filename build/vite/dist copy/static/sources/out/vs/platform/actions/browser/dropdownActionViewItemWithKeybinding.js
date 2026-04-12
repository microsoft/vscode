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
import { DropdownMenuActionViewItem } from '../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import { IContextKeyService } from '../../contextkey/common/contextkey.js';
import { IKeybindingService } from '../../keybinding/common/keybinding.js';
let DropdownMenuActionViewItemWithKeybinding = class DropdownMenuActionViewItemWithKeybinding extends DropdownMenuActionViewItem {
    constructor(action, menuActionsOrProvider, contextMenuProvider, options = Object.create(null), keybindingService, contextKeyService) {
        super(action, menuActionsOrProvider, contextMenuProvider, options);
        this.keybindingService = keybindingService;
        this.contextKeyService = contextKeyService;
    }
    getTooltip() {
        const tooltip = this.action.tooltip ?? this.action.label;
        return this.keybindingService.appendKeybinding(tooltip, this.action.id, this.contextKeyService);
    }
};
DropdownMenuActionViewItemWithKeybinding = __decorate([
    __param(4, IKeybindingService),
    __param(5, IContextKeyService)
], DropdownMenuActionViewItemWithKeybinding);
export { DropdownMenuActionViewItemWithKeybinding };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZHJvcGRvd25BY3Rpb25WaWV3SXRlbVdpdGhLZXliaW5kaW5nLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL2Ryb3Bkb3duQWN0aW9uVmlld0l0ZW1XaXRoS2V5YmluZGluZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUloRyxPQUFPLEVBQUUsMEJBQTBCLEVBQXNDLE1BQU0sNkRBQTZELENBQUM7QUFFN0ksT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDM0UsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFFcEUsSUFBTSx3Q0FBd0MsR0FBOUMsTUFBTSx3Q0FBeUMsU0FBUSwwQkFBMEI7SUFDdkYsWUFDQyxNQUFlLEVBQ2YscUJBQTJELEVBQzNELG1CQUF5QyxFQUN6QyxVQUE4QyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUM1QixpQkFBcUMsRUFDckMsaUJBQXFDO1FBRTFFLEtBQUssQ0FBQyxNQUFNLEVBQUUscUJBQXFCLEVBQUUsbUJBQW1CLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFIOUIsc0JBQWlCLEdBQWpCLGlCQUFpQixDQUFvQjtRQUNyQyxzQkFBaUIsR0FBakIsaUJBQWlCLENBQW9CO0lBRzNFLENBQUM7SUFFa0IsVUFBVTtRQUM1QixNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQztRQUN6RCxPQUFPLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLEVBQUUsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUM7SUFDakcsQ0FBQztDQUNELENBQUE7QUFoQlksd0NBQXdDO0lBTWxELFdBQUEsa0JBQWtCLENBQUE7SUFDbEIsV0FBQSxrQkFBa0IsQ0FBQTtHQVBSLHdDQUF3QyxDQWdCcEQifQ==