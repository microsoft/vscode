/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ViewEventHandler } from '../../common/viewEventHandler.js';
export class ViewPart extends ViewEventHandler {
    constructor(context) {
        super();
        this._context = context;
        this._context.addEventHandler(this);
    }
    dispose() {
        this._context.removeEventHandler(this);
        super.dispose();
    }
    onBeforeRender(viewportData) {
    }
}
export var PartFingerprint;
(function (PartFingerprint) {
    PartFingerprint[PartFingerprint["None"] = 0] = "None";
    PartFingerprint[PartFingerprint["ContentWidgets"] = 1] = "ContentWidgets";
    PartFingerprint[PartFingerprint["OverflowingContentWidgets"] = 2] = "OverflowingContentWidgets";
    PartFingerprint[PartFingerprint["OverflowGuard"] = 3] = "OverflowGuard";
    PartFingerprint[PartFingerprint["OverlayWidgets"] = 4] = "OverlayWidgets";
    PartFingerprint[PartFingerprint["OverflowingOverlayWidgets"] = 5] = "OverflowingOverlayWidgets";
    PartFingerprint[PartFingerprint["ScrollableElement"] = 6] = "ScrollableElement";
    PartFingerprint[PartFingerprint["TextArea"] = 7] = "TextArea";
    PartFingerprint[PartFingerprint["ViewLines"] = 8] = "ViewLines";
    PartFingerprint[PartFingerprint["Minimap"] = 9] = "Minimap";
    PartFingerprint[PartFingerprint["ViewLinesGpu"] = 10] = "ViewLinesGpu";
})(PartFingerprint || (PartFingerprint = {}));
export class PartFingerprints {
    static write(target, partId) {
        target.setAttribute('data-mprt', String(partId));
    }
    static read(target) {
        const r = target.getAttribute('data-mprt');
        if (r === null) {
            return 0 /* PartFingerprint.None */;
        }
        return parseInt(r, 10);
    }
    static collect(child, stopAt) {
        const result = [];
        let resultLen = 0;
        while (child && child !== child.ownerDocument.body) {
            if (child === stopAt) {
                break;
            }
            if (child.nodeType === child.ELEMENT_NODE) {
                result[resultLen++] = this.read(child);
            }
            child = child.parentElement;
        }
        const r = new Uint8Array(resultLen);
        for (let i = 0; i < resultLen; i++) {
            r[i] = result[resultLen - i - 1];
        }
        return r;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlld1BhcnQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvYnJvd3Nlci92aWV3L3ZpZXdQYXJ0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBS2hHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBR3BFLE1BQU0sT0FBZ0IsUUFBUyxTQUFRLGdCQUFnQjtJQUl0RCxZQUFZLE9BQW9CO1FBQy9CLEtBQUssRUFBRSxDQUFDO1FBQ1IsSUFBSSxDQUFDLFFBQVEsR0FBRyxPQUFPLENBQUM7UUFDeEIsSUFBSSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDckMsQ0FBQztJQUVlLE9BQU87UUFDdEIsSUFBSSxDQUFDLFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN2QyxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDakIsQ0FBQztJQUVNLGNBQWMsQ0FBQyxZQUEwQjtJQUNoRCxDQUFDO0NBSUQ7QUFFRCxNQUFNLENBQU4sSUFBa0IsZUFZakI7QUFaRCxXQUFrQixlQUFlO0lBQ2hDLHFEQUFJLENBQUE7SUFDSix5RUFBYyxDQUFBO0lBQ2QsK0ZBQXlCLENBQUE7SUFDekIsdUVBQWEsQ0FBQTtJQUNiLHlFQUFjLENBQUE7SUFDZCwrRkFBeUIsQ0FBQTtJQUN6QiwrRUFBaUIsQ0FBQTtJQUNqQiw2REFBUSxDQUFBO0lBQ1IsK0RBQVMsQ0FBQTtJQUNULDJEQUFPLENBQUE7SUFDUCxzRUFBWSxDQUFBO0FBQ2IsQ0FBQyxFQVppQixlQUFlLEtBQWYsZUFBZSxRQVloQztBQUVELE1BQU0sT0FBTyxnQkFBZ0I7SUFFckIsTUFBTSxDQUFDLEtBQUssQ0FBQyxNQUEwQyxFQUFFLE1BQXVCO1FBQ3RGLE1BQU0sQ0FBQyxZQUFZLENBQUMsV0FBVyxFQUFFLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO0lBQ2xELENBQUM7SUFFTSxNQUFNLENBQUMsSUFBSSxDQUFDLE1BQWU7UUFDakMsTUFBTSxDQUFDLEdBQUcsTUFBTSxDQUFDLFlBQVksQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUMzQyxJQUFJLENBQUMsS0FBSyxJQUFJLEVBQUUsQ0FBQztZQUNoQixvQ0FBNEI7UUFDN0IsQ0FBQztRQUNELE9BQU8sUUFBUSxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUN4QixDQUFDO0lBRU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFxQixFQUFFLE1BQWU7UUFDM0QsTUFBTSxNQUFNLEdBQXNCLEVBQUUsQ0FBQztRQUNyQyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7UUFFbEIsT0FBTyxLQUFLLElBQUksS0FBSyxLQUFLLEtBQUssQ0FBQyxhQUFhLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDcEQsSUFBSSxLQUFLLEtBQUssTUFBTSxFQUFFLENBQUM7Z0JBQ3RCLE1BQU07WUFDUCxDQUFDO1lBQ0QsSUFBSSxLQUFLLENBQUMsUUFBUSxLQUFLLEtBQUssQ0FBQyxZQUFZLEVBQUUsQ0FBQztnQkFDM0MsTUFBTSxDQUFDLFNBQVMsRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUN4QyxDQUFDO1lBQ0QsS0FBSyxHQUFHLEtBQUssQ0FBQyxhQUFhLENBQUM7UUFDN0IsQ0FBQztRQUVELE1BQU0sQ0FBQyxHQUFHLElBQUksVUFBVSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ3BDLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxTQUFTLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNwQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLFNBQVMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDbEMsQ0FBQztRQUNELE9BQU8sQ0FBQyxDQUFDO0lBQ1YsQ0FBQztDQUNEIn0=