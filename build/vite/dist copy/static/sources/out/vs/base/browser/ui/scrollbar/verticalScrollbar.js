/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { StandardWheelEvent } from '../../mouseEvent.js';
import { AbstractScrollbar } from './abstractScrollbar.js';
import { ARROW_IMG_SIZE } from './scrollbarArrow.js';
import { ScrollbarState } from './scrollbarState.js';
import { Codicon } from '../../../common/codicons.js';
export class VerticalScrollbar extends AbstractScrollbar {
    constructor(scrollable, options, host) {
        const scrollDimensions = scrollable.getScrollDimensions();
        const scrollPosition = scrollable.getCurrentScrollPosition();
        super({
            lazyRender: options.lazyRender,
            host: host,
            scrollbarState: new ScrollbarState((options.verticalHasArrows ? options.arrowSize : 0), (options.vertical === 2 /* ScrollbarVisibility.Hidden */ ? 0 : options.verticalScrollbarSize), 
            // give priority to vertical scroll bar over horizontal and let it scroll all the way to the bottom
            0, scrollDimensions.height, scrollDimensions.scrollHeight, scrollPosition.scrollTop),
            visibility: options.vertical,
            extraScrollbarClassName: 'vertical',
            scrollable: scrollable,
            scrollByPage: options.scrollByPage
        });
        if (options.verticalHasArrows) {
            const arrowDelta = (options.arrowSize - ARROW_IMG_SIZE) / 2;
            const scrollbarDelta = (options.verticalScrollbarSize - ARROW_IMG_SIZE) / 2;
            this._createArrow({
                className: 'scra',
                icon: Codicon.scrollbarButtonUp,
                top: arrowDelta,
                left: scrollbarDelta,
                bottom: undefined,
                right: undefined,
                bgWidth: options.verticalScrollbarSize,
                bgHeight: options.arrowSize,
                onActivate: () => this._host.onMouseWheel(new StandardWheelEvent(null, 0, 1)),
            });
            this._createArrow({
                className: 'scra',
                icon: Codicon.scrollbarButtonDown,
                top: undefined,
                left: scrollbarDelta,
                bottom: arrowDelta,
                right: undefined,
                bgWidth: options.verticalScrollbarSize,
                bgHeight: options.arrowSize,
                onActivate: () => this._host.onMouseWheel(new StandardWheelEvent(null, 0, -1)),
            });
        }
        this._createSlider(0, Math.floor((options.verticalScrollbarSize - options.verticalSliderSize) / 2), options.verticalSliderSize, undefined);
    }
    _updateSlider(sliderSize, sliderPosition) {
        this.slider.setHeight(sliderSize);
        this.slider.setTop(sliderPosition);
    }
    _renderDomNode(largeSize, smallSize) {
        this.domNode.setWidth(smallSize);
        this.domNode.setHeight(largeSize);
        this.domNode.setRight(0);
        this.domNode.setTop(0);
    }
    onDidScroll(e) {
        this._shouldRender = this._onElementScrollSize(e.scrollHeight) || this._shouldRender;
        this._shouldRender = this._onElementScrollPosition(e.scrollTop) || this._shouldRender;
        this._shouldRender = this._onElementSize(e.height) || this._shouldRender;
        return this._shouldRender;
    }
    _pointerDownRelativePosition(offsetX, offsetY) {
        return offsetY;
    }
    _sliderPointerPosition(e) {
        return e.pageY;
    }
    _sliderOrthogonalPointerPosition(e) {
        return e.pageX;
    }
    _updateScrollbarSize(size) {
        this.slider.setWidth(size);
    }
    writeScrollPosition(target, scrollPosition) {
        target.scrollTop = scrollPosition;
    }
    updateOptions(options) {
        this.updateScrollbarSize(options.vertical === 2 /* ScrollbarVisibility.Hidden */ ? 0 : options.verticalScrollbarSize);
        // give priority to vertical scroll bar over horizontal and let it scroll all the way to the bottom
        this._scrollbarState.setOppositeScrollbarSize(0);
        this._visibilityController.setVisibility(options.vertical);
        this._scrollByPage = options.scrollByPage;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmVydGljYWxTY3JvbGxiYXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL2Jyb3dzZXIvdWkvc2Nyb2xsYmFyL3ZlcnRpY2FsU2Nyb2xsYmFyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBQ3pELE9BQU8sRUFBRSxpQkFBaUIsRUFBMEMsTUFBTSx3QkFBd0IsQ0FBQztBQUVuRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFDckQsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBQ3JELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUt0RCxNQUFNLE9BQU8saUJBQWtCLFNBQVEsaUJBQWlCO0lBRXZELFlBQVksVUFBc0IsRUFBRSxPQUF5QyxFQUFFLElBQW1CO1FBQ2pHLE1BQU0sZ0JBQWdCLEdBQUcsVUFBVSxDQUFDLG1CQUFtQixFQUFFLENBQUM7UUFDMUQsTUFBTSxjQUFjLEdBQUcsVUFBVSxDQUFDLHdCQUF3QixFQUFFLENBQUM7UUFDN0QsS0FBSyxDQUFDO1lBQ0wsVUFBVSxFQUFFLE9BQU8sQ0FBQyxVQUFVO1lBQzlCLElBQUksRUFBRSxJQUFJO1lBQ1YsY0FBYyxFQUFFLElBQUksY0FBYyxDQUNqQyxDQUFDLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQ25ELENBQUMsT0FBTyxDQUFDLFFBQVEsdUNBQStCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLHFCQUFxQixDQUFDO1lBQ3JGLG1HQUFtRztZQUNuRyxDQUFDLEVBQ0QsZ0JBQWdCLENBQUMsTUFBTSxFQUN2QixnQkFBZ0IsQ0FBQyxZQUFZLEVBQzdCLGNBQWMsQ0FBQyxTQUFTLENBQ3hCO1lBQ0QsVUFBVSxFQUFFLE9BQU8sQ0FBQyxRQUFRO1lBQzVCLHVCQUF1QixFQUFFLFVBQVU7WUFDbkMsVUFBVSxFQUFFLFVBQVU7WUFDdEIsWUFBWSxFQUFFLE9BQU8sQ0FBQyxZQUFZO1NBQ2xDLENBQUMsQ0FBQztRQUVILElBQUksT0FBTyxDQUFDLGlCQUFpQixFQUFFLENBQUM7WUFDL0IsTUFBTSxVQUFVLEdBQUcsQ0FBQyxPQUFPLENBQUMsU0FBUyxHQUFHLGNBQWMsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUM1RCxNQUFNLGNBQWMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxxQkFBcUIsR0FBRyxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUM7WUFFNUUsSUFBSSxDQUFDLFlBQVksQ0FBQztnQkFDakIsU0FBUyxFQUFFLE1BQU07Z0JBQ2pCLElBQUksRUFBRSxPQUFPLENBQUMsaUJBQWlCO2dCQUMvQixHQUFHLEVBQUUsVUFBVTtnQkFDZixJQUFJLEVBQUUsY0FBYztnQkFDcEIsTUFBTSxFQUFFLFNBQVM7Z0JBQ2pCLEtBQUssRUFBRSxTQUFTO2dCQUNoQixPQUFPLEVBQUUsT0FBTyxDQUFDLHFCQUFxQjtnQkFDdEMsUUFBUSxFQUFFLE9BQU8sQ0FBQyxTQUFTO2dCQUMzQixVQUFVLEVBQUUsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUMsSUFBSSxrQkFBa0IsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO2FBQzdFLENBQUMsQ0FBQztZQUVILElBQUksQ0FBQyxZQUFZLENBQUM7Z0JBQ2pCLFNBQVMsRUFBRSxNQUFNO2dCQUNqQixJQUFJLEVBQUUsT0FBTyxDQUFDLG1CQUFtQjtnQkFDakMsR0FBRyxFQUFFLFNBQVM7Z0JBQ2QsSUFBSSxFQUFFLGNBQWM7Z0JBQ3BCLE1BQU0sRUFBRSxVQUFVO2dCQUNsQixLQUFLLEVBQUUsU0FBUztnQkFDaEIsT0FBTyxFQUFFLE9BQU8sQ0FBQyxxQkFBcUI7Z0JBQ3RDLFFBQVEsRUFBRSxPQUFPLENBQUMsU0FBUztnQkFDM0IsVUFBVSxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDLElBQUksa0JBQWtCLENBQUMsSUFBSSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO2FBQzlFLENBQUMsQ0FBQztRQUNKLENBQUM7UUFFRCxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsT0FBTyxDQUFDLHFCQUFxQixHQUFHLE9BQU8sQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxrQkFBa0IsRUFBRSxTQUFTLENBQUMsQ0FBQztJQUM1SSxDQUFDO0lBRVMsYUFBYSxDQUFDLFVBQWtCLEVBQUUsY0FBc0I7UUFDakUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDbEMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDLENBQUM7SUFDcEMsQ0FBQztJQUVTLGNBQWMsQ0FBQyxTQUFpQixFQUFFLFNBQWlCO1FBQzVELElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ2pDLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ2xDLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3pCLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3hCLENBQUM7SUFFTSxXQUFXLENBQUMsQ0FBYztRQUNoQyxJQUFJLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsWUFBWSxDQUFDLElBQUksSUFBSSxDQUFDLGFBQWEsQ0FBQztRQUNyRixJQUFJLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLElBQUksSUFBSSxDQUFDLGFBQWEsQ0FBQztRQUN0RixJQUFJLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLElBQUksQ0FBQyxhQUFhLENBQUM7UUFDekUsT0FBTyxJQUFJLENBQUMsYUFBYSxDQUFDO0lBQzNCLENBQUM7SUFFUyw0QkFBNEIsQ0FBQyxPQUFlLEVBQUUsT0FBZTtRQUN0RSxPQUFPLE9BQU8sQ0FBQztJQUNoQixDQUFDO0lBRVMsc0JBQXNCLENBQUMsQ0FBMEI7UUFDMUQsT0FBTyxDQUFDLENBQUMsS0FBSyxDQUFDO0lBQ2hCLENBQUM7SUFFUyxnQ0FBZ0MsQ0FBQyxDQUEwQjtRQUNwRSxPQUFPLENBQUMsQ0FBQyxLQUFLLENBQUM7SUFDaEIsQ0FBQztJQUVTLG9CQUFvQixDQUFDLElBQVk7UUFDMUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDNUIsQ0FBQztJQUVNLG1CQUFtQixDQUFDLE1BQTBCLEVBQUUsY0FBc0I7UUFDNUUsTUFBTSxDQUFDLFNBQVMsR0FBRyxjQUFjLENBQUM7SUFDbkMsQ0FBQztJQUVNLGFBQWEsQ0FBQyxPQUF5QztRQUM3RCxJQUFJLENBQUMsbUJBQW1CLENBQUMsT0FBTyxDQUFDLFFBQVEsdUNBQStCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLHFCQUFxQixDQUFDLENBQUM7UUFDOUcsbUdBQW1HO1FBQ25HLElBQUksQ0FBQyxlQUFlLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDakQsSUFBSSxDQUFDLHFCQUFxQixDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDM0QsSUFBSSxDQUFDLGFBQWEsR0FBRyxPQUFPLENBQUMsWUFBWSxDQUFDO0lBQzNDLENBQUM7Q0FFRCJ9