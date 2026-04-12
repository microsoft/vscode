/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../../../base/common/event.js';
const someEvent = new Emitter().event;
/**
 * Add stub methods as needed
 */
export class MockObjectTree {
    get onDidChangeFocus() { return someEvent; }
    get onDidChangeSelection() { return someEvent; }
    get onDidOpen() { return someEvent; }
    get onMouseClick() { return someEvent; }
    get onMouseDblClick() { return someEvent; }
    get onContextMenu() { return someEvent; }
    get onKeyDown() { return someEvent; }
    get onKeyUp() { return someEvent; }
    get onKeyPress() { return someEvent; }
    get onDidFocus() { return someEvent; }
    get onDidBlur() { return someEvent; }
    get onDidChangeCollapseState() { return someEvent; }
    get onDidChangeRenderNodeCount() { return someEvent; }
    get onDidDispose() { return someEvent; }
    get lastVisibleElement() { return this.elements[this.elements.length - 1]; }
    constructor(elements) {
        this.elements = elements;
    }
    domFocus() { }
    collapse(location, recursive = false) {
        return true;
    }
    expand(location, recursive = false) {
        return true;
    }
    navigate(start) {
        const startIdx = start ? this.elements.indexOf(start) :
            undefined;
        return new ArrayNavigator(this.elements, startIdx);
    }
    getParentElement(elem) {
        return elem.parent();
    }
    dispose() {
    }
}
class ArrayNavigator {
    constructor(elements, index = 0) {
        this.elements = elements;
        this.index = index;
    }
    current() {
        return this.elements[this.index];
    }
    previous() {
        return this.elements[--this.index];
    }
    first() {
        this.index = 0;
        return this.elements[this.index];
    }
    last() {
        this.index = this.elements.length - 1;
        return this.elements[this.index];
    }
    next() {
        return this.elements[++this.index];
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9ja1NlYXJjaFRyZWUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9zZWFyY2gvdGVzdC9icm93c2VyL21vY2tTZWFyY2hUcmVlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUk5RCxNQUFNLFNBQVMsR0FBRyxJQUFJLE9BQU8sRUFBRSxDQUFDLEtBQUssQ0FBQztBQUV0Qzs7R0FFRztBQUNILE1BQU0sT0FBTyxjQUFjO0lBRTFCLElBQUksZ0JBQWdCLEtBQUssT0FBTyxTQUFTLENBQUMsQ0FBQyxDQUFDO0lBQzVDLElBQUksb0JBQW9CLEtBQUssT0FBTyxTQUFTLENBQUMsQ0FBQyxDQUFDO0lBQ2hELElBQUksU0FBUyxLQUFLLE9BQU8sU0FBUyxDQUFDLENBQUMsQ0FBQztJQUVyQyxJQUFJLFlBQVksS0FBSyxPQUFPLFNBQVMsQ0FBQyxDQUFDLENBQUM7SUFDeEMsSUFBSSxlQUFlLEtBQUssT0FBTyxTQUFTLENBQUMsQ0FBQyxDQUFDO0lBQzNDLElBQUksYUFBYSxLQUFLLE9BQU8sU0FBUyxDQUFDLENBQUMsQ0FBQztJQUV6QyxJQUFJLFNBQVMsS0FBSyxPQUFPLFNBQVMsQ0FBQyxDQUFDLENBQUM7SUFDckMsSUFBSSxPQUFPLEtBQUssT0FBTyxTQUFTLENBQUMsQ0FBQyxDQUFDO0lBQ25DLElBQUksVUFBVSxLQUFLLE9BQU8sU0FBUyxDQUFDLENBQUMsQ0FBQztJQUV0QyxJQUFJLFVBQVUsS0FBSyxPQUFPLFNBQVMsQ0FBQyxDQUFDLENBQUM7SUFDdEMsSUFBSSxTQUFTLEtBQUssT0FBTyxTQUFTLENBQUMsQ0FBQyxDQUFDO0lBRXJDLElBQUksd0JBQXdCLEtBQUssT0FBTyxTQUFTLENBQUMsQ0FBQyxDQUFDO0lBQ3BELElBQUksMEJBQTBCLEtBQUssT0FBTyxTQUFTLENBQUMsQ0FBQyxDQUFDO0lBRXRELElBQUksWUFBWSxLQUFLLE9BQU8sU0FBUyxDQUFDLENBQUMsQ0FBQztJQUN4QyxJQUFJLGtCQUFrQixLQUFLLE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFNUUsWUFBb0IsUUFBZTtRQUFmLGFBQVEsR0FBUixRQUFRLENBQU87SUFBSSxDQUFDO0lBRXhDLFFBQVEsS0FBVyxDQUFDO0lBRXBCLFFBQVEsQ0FBQyxRQUFjLEVBQUUsWUFBcUIsS0FBSztRQUNsRCxPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFFRCxNQUFNLENBQUMsUUFBYyxFQUFFLFlBQXFCLEtBQUs7UUFDaEQsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBRUQsUUFBUSxDQUFDLEtBQVk7UUFDcEIsTUFBTSxRQUFRLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQ3RELFNBQVMsQ0FBQztRQUVYLE9BQU8sSUFBSSxjQUFjLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxRQUFRLENBQUMsQ0FBQztJQUNwRCxDQUFDO0lBRUQsZ0JBQWdCLENBQUMsSUFBcUI7UUFDckMsT0FBTyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7SUFDdEIsQ0FBQztJQUVELE9BQU87SUFDUCxDQUFDO0NBQ0Q7QUFFRCxNQUFNLGNBQWM7SUFDbkIsWUFBb0IsUUFBYSxFQUFVLFFBQVEsQ0FBQztRQUFoQyxhQUFRLEdBQVIsUUFBUSxDQUFLO1FBQVUsVUFBSyxHQUFMLEtBQUssQ0FBSTtJQUFJLENBQUM7SUFFekQsT0FBTztRQUNOLE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDbEMsQ0FBQztJQUVELFFBQVE7UUFDUCxPQUFPLElBQUksQ0FBQyxRQUFRLENBQUMsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDcEMsQ0FBQztJQUVELEtBQUs7UUFDSixJQUFJLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQztRQUNmLE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDbEMsQ0FBQztJQUVELElBQUk7UUFDSCxJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQztRQUN0QyxPQUFPLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ2xDLENBQUM7SUFFRCxJQUFJO1FBQ0gsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ3BDLENBQUM7Q0FDRCJ9