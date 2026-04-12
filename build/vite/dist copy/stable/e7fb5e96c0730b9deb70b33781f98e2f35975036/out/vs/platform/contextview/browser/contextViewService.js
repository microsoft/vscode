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
import { ContextView } from '../../../base/browser/ui/contextview/contextview.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ILayoutService } from '../../layout/browser/layoutService.js';
import { getWindow } from '../../../base/browser/dom.js';
let ContextViewHandler = class ContextViewHandler extends Disposable {
    constructor(layoutService) {
        super();
        this.layoutService = layoutService;
        this.contextView = this._register(new ContextView(this.layoutService.mainContainer, 1 /* ContextViewDOMPosition.ABSOLUTE */));
        this.layout();
        this._register(layoutService.onDidLayoutContainer(() => this.layout()));
    }
    // ContextView
    showContextView(delegate, container, shadowRoot) {
        let domPosition;
        if (container) {
            if (container === this.layoutService.getContainer(getWindow(container))) {
                domPosition = 1 /* ContextViewDOMPosition.ABSOLUTE */;
            }
            else if (shadowRoot) {
                domPosition = 3 /* ContextViewDOMPosition.FIXED_SHADOW */;
            }
            else {
                domPosition = 2 /* ContextViewDOMPosition.FIXED */;
            }
        }
        else {
            domPosition = 1 /* ContextViewDOMPosition.ABSOLUTE */;
        }
        this.contextView.setContainer(container ?? this.layoutService.activeContainer, domPosition);
        this.contextView.show(delegate);
        const openContextView = {
            close: () => {
                if (this.openContextView === openContextView) {
                    this.hideContextView();
                }
            }
        };
        this.openContextView = openContextView;
        return openContextView;
    }
    layout() {
        this.contextView.layout();
    }
    hideContextView(data) {
        this.contextView.hide(data);
        this.openContextView = undefined;
    }
};
ContextViewHandler = __decorate([
    __param(0, ILayoutService)
], ContextViewHandler);
export { ContextViewHandler };
export class ContextViewService extends ContextViewHandler {
    getContextViewElement() {
        return this.contextView.getViewElement();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGV4dFZpZXdTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlld1NlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFdBQVcsRUFBZ0QsTUFBTSxxREFBcUQsQ0FBQztBQUNoSSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDL0QsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRXZFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUVsRCxJQUFNLGtCQUFrQixHQUF4QixNQUFNLGtCQUFtQixTQUFRLFVBQVU7SUFLakQsWUFDa0MsYUFBNkI7UUFFOUQsS0FBSyxFQUFFLENBQUM7UUFGeUIsa0JBQWEsR0FBYixhQUFhLENBQWdCO1FBSTlELElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLFdBQVcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLGFBQWEsMENBQWtDLENBQUMsQ0FBQztRQUV0SCxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDZCxJQUFJLENBQUMsU0FBUyxDQUFDLGFBQWEsQ0FBQyxvQkFBb0IsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ3pFLENBQUM7SUFFRCxjQUFjO0lBRWQsZUFBZSxDQUFDLFFBQThCLEVBQUUsU0FBdUIsRUFBRSxVQUFvQjtRQUM1RixJQUFJLFdBQW1DLENBQUM7UUFDeEMsSUFBSSxTQUFTLEVBQUUsQ0FBQztZQUNmLElBQUksU0FBUyxLQUFLLElBQUksQ0FBQyxhQUFhLENBQUMsWUFBWSxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLENBQUM7Z0JBQ3pFLFdBQVcsMENBQWtDLENBQUM7WUFDL0MsQ0FBQztpQkFBTSxJQUFJLFVBQVUsRUFBRSxDQUFDO2dCQUN2QixXQUFXLDhDQUFzQyxDQUFDO1lBQ25ELENBQUM7aUJBQU0sQ0FBQztnQkFDUCxXQUFXLHVDQUErQixDQUFDO1lBQzVDLENBQUM7UUFDRixDQUFDO2FBQU0sQ0FBQztZQUNQLFdBQVcsMENBQWtDLENBQUM7UUFDL0MsQ0FBQztRQUVELElBQUksQ0FBQyxXQUFXLENBQUMsWUFBWSxDQUFDLFNBQVMsSUFBSSxJQUFJLENBQUMsYUFBYSxDQUFDLGVBQWUsRUFBRSxXQUFXLENBQUMsQ0FBQztRQUU1RixJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUVoQyxNQUFNLGVBQWUsR0FBcUI7WUFDekMsS0FBSyxFQUFFLEdBQUcsRUFBRTtnQkFDWCxJQUFJLElBQUksQ0FBQyxlQUFlLEtBQUssZUFBZSxFQUFFLENBQUM7b0JBQzlDLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztnQkFDeEIsQ0FBQztZQUNGLENBQUM7U0FDRCxDQUFDO1FBRUYsSUFBSSxDQUFDLGVBQWUsR0FBRyxlQUFlLENBQUM7UUFDdkMsT0FBTyxlQUFlLENBQUM7SUFDeEIsQ0FBQztJQUVELE1BQU07UUFDTCxJQUFJLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxDQUFDO0lBQzNCLENBQUM7SUFFRCxlQUFlLENBQUMsSUFBYztRQUM3QixJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUM1QixJQUFJLENBQUMsZUFBZSxHQUFHLFNBQVMsQ0FBQztJQUNsQyxDQUFDO0NBQ0QsQ0FBQTtBQXhEWSxrQkFBa0I7SUFNNUIsV0FBQSxjQUFjLENBQUE7R0FOSixrQkFBa0IsQ0F3RDlCOztBQUVELE1BQU0sT0FBTyxrQkFBbUIsU0FBUSxrQkFBa0I7SUFJekQscUJBQXFCO1FBQ3BCLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQyxjQUFjLEVBQUUsQ0FBQztJQUMxQyxDQUFDO0NBQ0QifQ==