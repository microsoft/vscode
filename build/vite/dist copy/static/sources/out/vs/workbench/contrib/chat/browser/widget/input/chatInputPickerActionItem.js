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
import { getActiveWindow } from '../../../../../../base/browser/dom.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { ActionWidgetDropdownActionViewItem } from '../../../../../../platform/actions/browser/actionWidgetDropdownActionViewItem.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
/**
 * Base class for chat input picker action items (model picker, mode picker, session target picker).
 * Provides common anchor resolution logic for dropdown positioning.
 */
let ChatInputPickerActionViewItem = class ChatInputPickerActionViewItem extends ActionWidgetDropdownActionViewItem {
    constructor(action, actionWidgetOptions, pickerOptions, actionWidgetService, keybindingService, contextKeyService, telemetryService) {
        // Inject the anchor getter into the options
        const optionsWithAnchor = {
            ...actionWidgetOptions,
            getAnchor: () => this.getAnchorElement(),
        };
        super(action, optionsWithAnchor, actionWidgetService, keybindingService, contextKeyService, telemetryService);
        this.pickerOptions = pickerOptions;
        this._register(autorun(reader => {
            const hideChevrons = this.pickerOptions.hideChevrons.read(reader);
            if (this.element) {
                this.element.classList.toggle('hide-chevrons', hideChevrons);
                this.renderLabel(this.element);
            }
        }));
    }
    /**
     * Returns the anchor element for the dropdown.
     * Falls back to the overflow anchor if this element is not in the DOM.
     */
    getAnchorElement() {
        if (this.element && getActiveWindow().document.contains(this.element)) {
            return this.element;
        }
        return this.pickerOptions.getOverflowAnchor?.() ?? this.element;
    }
    render(container) {
        super.render(container);
        container.classList.add('chat-input-picker-item');
        // Apply initial collapsed state now that this.element exists
        const hideChevrons = this.pickerOptions.hideChevrons.get();
        if (this.element) {
            this.element.classList.toggle('hide-chevrons', hideChevrons);
            this.renderLabel(this.element);
        }
    }
};
ChatInputPickerActionViewItem = __decorate([
    __param(3, IActionWidgetService),
    __param(4, IKeybindingService),
    __param(5, IContextKeyService),
    __param(6, ITelemetryService)
], ChatInputPickerActionViewItem);
export { ChatInputPickerActionViewItem };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdElucHV0UGlja2VyQWN0aW9uSXRlbS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvaW5wdXQvY2hhdElucHV0UGlja2VyQWN0aW9uSXRlbS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFHeEUsT0FBTyxFQUFFLE9BQU8sRUFBZSxNQUFNLDZDQUE2QyxDQUFDO0FBQ25GLE9BQU8sRUFBRSxrQ0FBa0MsRUFBRSxNQUFNLGtGQUFrRixDQUFDO0FBQ3RJLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGlFQUFpRSxDQUFDO0FBRXZHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBaUI3Rjs7O0dBR0c7QUFDSSxJQUFlLDZCQUE2QixHQUE1QyxNQUFlLDZCQUE4QixTQUFRLGtDQUFrQztJQUU3RixZQUNDLE1BQWUsRUFDZixtQkFBa0YsRUFDL0QsYUFBc0MsRUFDbkMsbUJBQXlDLEVBQzNDLGlCQUFxQyxFQUNyQyxpQkFBcUMsRUFDdEMsZ0JBQW1DO1FBRXRELDRDQUE0QztRQUM1QyxNQUFNLGlCQUFpQixHQUFrRTtZQUN4RixHQUFHLG1CQUFtQjtZQUN0QixTQUFTLEVBQUUsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLGdCQUFnQixFQUFFO1NBQ3hDLENBQUM7UUFFRixLQUFLLENBQUMsTUFBTSxFQUFFLGlCQUFpQixFQUFFLG1CQUFtQixFQUFFLGlCQUFpQixFQUFFLGlCQUFpQixFQUFFLGdCQUFnQixDQUFDLENBQUM7UUFaM0Ysa0JBQWEsR0FBYixhQUFhLENBQXlCO1FBY3pELElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFO1lBQy9CLE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUNsRSxJQUFJLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDbEIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLGVBQWUsRUFBRSxZQUFZLENBQUMsQ0FBQztnQkFDN0QsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDaEMsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQ7OztPQUdHO0lBQ08sZ0JBQWdCO1FBQ3pCLElBQUksSUFBSSxDQUFDLE9BQU8sSUFBSSxlQUFlLEVBQUUsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ3ZFLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQztRQUNyQixDQUFDO1FBQ0QsT0FBTyxJQUFJLENBQUMsYUFBYSxDQUFDLGlCQUFpQixFQUFFLEVBQUUsSUFBSSxJQUFJLENBQUMsT0FBUSxDQUFDO0lBQ2xFLENBQUM7SUFFUSxNQUFNLENBQUMsU0FBc0I7UUFDckMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUN4QixTQUFTLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO1FBRWxELDZEQUE2RDtRQUM3RCxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLFlBQVksQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUMzRCxJQUFJLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNsQixJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsZUFBZSxFQUFFLFlBQVksQ0FBQyxDQUFDO1lBQzdELElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ2hDLENBQUM7SUFDRixDQUFDO0NBQ0QsQ0FBQTtBQWxEcUIsNkJBQTZCO0lBTWhELFdBQUEsb0JBQW9CLENBQUE7SUFDcEIsV0FBQSxrQkFBa0IsQ0FBQTtJQUNsQixXQUFBLGtCQUFrQixDQUFBO0lBQ2xCLFdBQUEsaUJBQWlCLENBQUE7R0FURSw2QkFBNkIsQ0FrRGxEIn0=