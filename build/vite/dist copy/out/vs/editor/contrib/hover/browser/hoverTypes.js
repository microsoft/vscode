/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export var HoverAnchorType;
(function (HoverAnchorType) {
    HoverAnchorType[HoverAnchorType["Range"] = 1] = "Range";
    HoverAnchorType[HoverAnchorType["ForeignElement"] = 2] = "ForeignElement";
})(HoverAnchorType || (HoverAnchorType = {}));
export class HoverRangeAnchor {
    constructor(priority, range, initialMousePosX, initialMousePosY) {
        this.priority = priority;
        this.range = range;
        this.initialMousePosX = initialMousePosX;
        this.initialMousePosY = initialMousePosY;
        this.type = 1 /* HoverAnchorType.Range */;
    }
    equals(other) {
        return (other.type === 1 /* HoverAnchorType.Range */ && this.range.equalsRange(other.range));
    }
    canAdoptVisibleHover(lastAnchor, showAtPosition) {
        return (lastAnchor.type === 1 /* HoverAnchorType.Range */ && showAtPosition.lineNumber === this.range.startLineNumber);
    }
}
export class HoverForeignElementAnchor {
    constructor(priority, owner, range, initialMousePosX, initialMousePosY, supportsMarkerHover) {
        this.priority = priority;
        this.owner = owner;
        this.range = range;
        this.initialMousePosX = initialMousePosX;
        this.initialMousePosY = initialMousePosY;
        this.supportsMarkerHover = supportsMarkerHover;
        this.type = 2 /* HoverAnchorType.ForeignElement */;
    }
    equals(other) {
        return (other.type === 2 /* HoverAnchorType.ForeignElement */ && this.owner === other.owner);
    }
    canAdoptVisibleHover(lastAnchor, showAtPosition) {
        return (lastAnchor.type === 2 /* HoverAnchorType.ForeignElement */ && this.owner === lastAnchor.owner);
    }
}
/**
 * Default implementation of IRenderedHoverParts.
 */
export class RenderedHoverParts {
    constructor(renderedHoverParts, disposables) {
        this.renderedHoverParts = renderedHoverParts;
        this.disposables = disposables;
    }
    dispose() {
        for (const part of this.renderedHoverParts) {
            part.dispose();
        }
        this.disposables?.dispose();
    }
}
export const HoverParticipantRegistry = (new class HoverParticipantRegistry {
    constructor() {
        this._participants = [];
    }
    register(ctor) {
        this._participants.push(ctor);
    }
    getAll() {
        return this._participants;
    }
}());
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaG92ZXJUeXBlcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL2hvdmVyL2Jyb3dzZXIvaG92ZXJUeXBlcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQXNDaEcsTUFBTSxDQUFOLElBQWtCLGVBR2pCO0FBSEQsV0FBa0IsZUFBZTtJQUNoQyx1REFBUyxDQUFBO0lBQ1QseUVBQWtCLENBQUE7QUFDbkIsQ0FBQyxFQUhpQixlQUFlLEtBQWYsZUFBZSxRQUdoQztBQUVELE1BQU0sT0FBTyxnQkFBZ0I7SUFFNUIsWUFDaUIsUUFBZ0IsRUFDaEIsS0FBWSxFQUNaLGdCQUFvQyxFQUNwQyxnQkFBb0M7UUFIcEMsYUFBUSxHQUFSLFFBQVEsQ0FBUTtRQUNoQixVQUFLLEdBQUwsS0FBSyxDQUFPO1FBQ1oscUJBQWdCLEdBQWhCLGdCQUFnQixDQUFvQjtRQUNwQyxxQkFBZ0IsR0FBaEIsZ0JBQWdCLENBQW9CO1FBTHJDLFNBQUksaUNBQXlCO0lBTzdDLENBQUM7SUFDTSxNQUFNLENBQUMsS0FBa0I7UUFDL0IsT0FBTyxDQUFDLEtBQUssQ0FBQyxJQUFJLGtDQUEwQixJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBQ3RGLENBQUM7SUFDTSxvQkFBb0IsQ0FBQyxVQUF1QixFQUFFLGNBQXdCO1FBQzVFLE9BQU8sQ0FBQyxVQUFVLENBQUMsSUFBSSxrQ0FBMEIsSUFBSSxjQUFjLENBQUMsVUFBVSxLQUFLLElBQUksQ0FBQyxLQUFLLENBQUMsZUFBZSxDQUFDLENBQUM7SUFDaEgsQ0FBQztDQUNEO0FBRUQsTUFBTSxPQUFPLHlCQUF5QjtJQUVyQyxZQUNpQixRQUFnQixFQUNoQixLQUE4QixFQUM5QixLQUFZLEVBQ1osZ0JBQW9DLEVBQ3BDLGdCQUFvQyxFQUNwQyxtQkFBd0M7UUFMeEMsYUFBUSxHQUFSLFFBQVEsQ0FBUTtRQUNoQixVQUFLLEdBQUwsS0FBSyxDQUF5QjtRQUM5QixVQUFLLEdBQUwsS0FBSyxDQUFPO1FBQ1oscUJBQWdCLEdBQWhCLGdCQUFnQixDQUFvQjtRQUNwQyxxQkFBZ0IsR0FBaEIsZ0JBQWdCLENBQW9CO1FBQ3BDLHdCQUFtQixHQUFuQixtQkFBbUIsQ0FBcUI7UUFQekMsU0FBSSwwQ0FBa0M7SUFTdEQsQ0FBQztJQUNNLE1BQU0sQ0FBQyxLQUFrQjtRQUMvQixPQUFPLENBQUMsS0FBSyxDQUFDLElBQUksMkNBQW1DLElBQUksSUFBSSxDQUFDLEtBQUssS0FBSyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDdEYsQ0FBQztJQUNNLG9CQUFvQixDQUFDLFVBQXVCLEVBQUUsY0FBd0I7UUFDNUUsT0FBTyxDQUFDLFVBQVUsQ0FBQyxJQUFJLDJDQUFtQyxJQUFJLElBQUksQ0FBQyxLQUFLLEtBQUssVUFBVSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ2hHLENBQUM7Q0FDRDtBQWlFRDs7R0FFRztBQUNILE1BQU0sT0FBTyxrQkFBa0I7SUFFOUIsWUFBNEIsa0JBQTJDLEVBQW1CLFdBQXlCO1FBQXZGLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBeUI7UUFBbUIsZ0JBQVcsR0FBWCxXQUFXLENBQWM7SUFBSSxDQUFDO0lBRXhILE9BQU87UUFDTixLQUFLLE1BQU0sSUFBSSxJQUFJLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1lBQzVDLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNoQixDQUFDO1FBQ0QsSUFBSSxDQUFDLFdBQVcsRUFBRSxPQUFPLEVBQUUsQ0FBQztJQUM3QixDQUFDO0NBQ0Q7QUFrQkQsTUFBTSxDQUFDLE1BQU0sd0JBQXdCLEdBQUcsQ0FBQyxJQUFJLE1BQU0sd0JBQXdCO0lBQTlCO1FBRTVDLGtCQUFhLEdBQWtDLEVBQUUsQ0FBQztJQVVuRCxDQUFDO0lBUk8sUUFBUSxDQUFvQyxJQUFrRjtRQUNwSSxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxJQUFtQyxDQUFDLENBQUM7SUFDOUQsQ0FBQztJQUVNLE1BQU07UUFDWixPQUFPLElBQUksQ0FBQyxhQUFhLENBQUM7SUFDM0IsQ0FBQztDQUVELEVBQUUsQ0FBQyxDQUFDIn0=