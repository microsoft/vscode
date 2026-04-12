/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Position } from '../../common/core/position.js';
export class ViewUserInputEvents {
    constructor(coordinatesConverter) {
        this.onKeyDown = null;
        this.onKeyUp = null;
        this.onContextMenu = null;
        this.onMouseMove = null;
        this.onMouseLeave = null;
        this.onMouseDown = null;
        this.onMouseUp = null;
        this.onMouseDrag = null;
        this.onMouseDrop = null;
        this.onMouseDropCanceled = null;
        this.onMouseWheel = null;
        this._coordinatesConverter = coordinatesConverter;
    }
    emitKeyDown(e) {
        this.onKeyDown?.(e);
    }
    emitKeyUp(e) {
        this.onKeyUp?.(e);
    }
    emitContextMenu(e) {
        this.onContextMenu?.(this._convertViewToModelMouseEvent(e));
    }
    emitMouseMove(e) {
        this.onMouseMove?.(this._convertViewToModelMouseEvent(e));
    }
    emitMouseLeave(e) {
        this.onMouseLeave?.(this._convertViewToModelMouseEvent(e));
    }
    emitMouseDown(e) {
        this.onMouseDown?.(this._convertViewToModelMouseEvent(e));
    }
    emitMouseUp(e) {
        this.onMouseUp?.(this._convertViewToModelMouseEvent(e));
    }
    emitMouseDrag(e) {
        this.onMouseDrag?.(this._convertViewToModelMouseEvent(e));
    }
    emitMouseDrop(e) {
        this.onMouseDrop?.(this._convertViewToModelMouseEvent(e));
    }
    emitMouseDropCanceled() {
        this.onMouseDropCanceled?.();
    }
    emitMouseWheel(e) {
        this.onMouseWheel?.(e);
    }
    _convertViewToModelMouseEvent(e) {
        if (e.target) {
            return {
                event: e.event,
                target: this._convertViewToModelMouseTarget(e.target)
            };
        }
        return e;
    }
    _convertViewToModelMouseTarget(target) {
        return ViewUserInputEvents.convertViewToModelMouseTarget(target, this._coordinatesConverter);
    }
    static convertViewToModelMouseTarget(target, coordinatesConverter) {
        const result = { ...target };
        if (result.position) {
            result.position = coordinatesConverter.convertViewPositionToModelPosition(result.position);
        }
        if (result.range) {
            result.range = coordinatesConverter.convertViewRangeToModelRange(result.range);
        }
        if (result.type === 5 /* MouseTargetType.GUTTER_VIEW_ZONE */ || result.type === 8 /* MouseTargetType.CONTENT_VIEW_ZONE */) {
            result.detail = this.convertViewToModelViewZoneData(result.detail, coordinatesConverter);
        }
        return result;
    }
    static convertViewToModelViewZoneData(data, coordinatesConverter) {
        return {
            viewZoneId: data.viewZoneId,
            positionBefore: data.positionBefore ? coordinatesConverter.convertViewPositionToModelPosition(data.positionBefore) : data.positionBefore,
            positionAfter: data.positionAfter ? coordinatesConverter.convertViewPositionToModelPosition(data.positionAfter) : data.positionAfter,
            position: coordinatesConverter.convertViewPositionToModelPosition(data.position),
            afterLineNumber: coordinatesConverter.convertViewPositionToModelPosition(new Position(data.afterLineNumber, 1)).lineNumber,
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlld1VzZXJJbnB1dEV2ZW50cy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9icm93c2VyL3ZpZXcvdmlld1VzZXJJbnB1dEV2ZW50cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUtoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFPekQsTUFBTSxPQUFPLG1CQUFtQjtJQWdCL0IsWUFBWSxvQkFBMkM7UUFkaEQsY0FBUyxHQUF5QyxJQUFJLENBQUM7UUFDdkQsWUFBTyxHQUF5QyxJQUFJLENBQUM7UUFDckQsa0JBQWEsR0FBNEMsSUFBSSxDQUFDO1FBQzlELGdCQUFXLEdBQTRDLElBQUksQ0FBQztRQUM1RCxpQkFBWSxHQUFtRCxJQUFJLENBQUM7UUFDcEUsZ0JBQVcsR0FBNEMsSUFBSSxDQUFDO1FBQzVELGNBQVMsR0FBNEMsSUFBSSxDQUFDO1FBQzFELGdCQUFXLEdBQTRDLElBQUksQ0FBQztRQUM1RCxnQkFBVyxHQUFtRCxJQUFJLENBQUM7UUFDbkUsd0JBQW1CLEdBQStCLElBQUksQ0FBQztRQUN2RCxpQkFBWSxHQUEyQyxJQUFJLENBQUM7UUFLbEUsSUFBSSxDQUFDLHFCQUFxQixHQUFHLG9CQUFvQixDQUFDO0lBQ25ELENBQUM7SUFFTSxXQUFXLENBQUMsQ0FBaUI7UUFDbkMsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3JCLENBQUM7SUFFTSxTQUFTLENBQUMsQ0FBaUI7UUFDakMsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ25CLENBQUM7SUFFTSxlQUFlLENBQUMsQ0FBb0I7UUFDMUMsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDLElBQUksQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzdELENBQUM7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