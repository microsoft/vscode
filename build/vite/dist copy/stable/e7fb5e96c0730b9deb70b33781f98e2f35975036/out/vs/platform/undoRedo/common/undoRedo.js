/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from '../../instantiation/common/instantiation.js';
export const IUndoRedoService = createDecorator('undoRedoService');
export var UndoRedoElementType;
(function (UndoRedoElementType) {
    UndoRedoElementType[UndoRedoElementType["Resource"] = 0] = "Resource";
    UndoRedoElementType[UndoRedoElementType["Workspace"] = 1] = "Workspace";
})(UndoRedoElementType || (UndoRedoElementType = {}));
export class ResourceEditStackSnapshot {
    constructor(resource, elements) {
        this.resource = resource;
        this.elements = elements;
    }
}
export class UndoRedoGroup {
    static { this._ID = 0; }
    constructor() {
        this.id = UndoRedoGroup._ID++;
        this.order = 1;
    }
    nextOrder() {
        if (this.id === 0) {
            return 0;
        }
        return this.order++;
    }
    static { this.None = new UndoRedoGroup(); }
}
export class UndoRedoSource {
    static { this._ID = 0; }
    constructor() {
        this.id = UndoRedoSource._ID++;
        this.order = 1;
    }
    nextOrder() {
        if (this.id === 0) {
            return 0;
        }
        return this.order++;
    }
    static { this.None = new UndoRedoSource(); }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidW5kb1JlZG8uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS91bmRvUmVkby9jb21tb24vdW5kb1JlZG8udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFJaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBRTlFLE1BQU0sQ0FBQyxNQUFNLGdCQUFnQixHQUFHLGVBQWUsQ0FBbUIsaUJBQWlCLENBQUMsQ0FBQztBQUVyRixNQUFNLENBQU4sSUFBa0IsbUJBR2pCO0FBSEQsV0FBa0IsbUJBQW1CO0lBQ3BDLHFFQUFRLENBQUE7SUFDUix1RUFBUyxDQUFBO0FBQ1YsQ0FBQyxFQUhpQixtQkFBbUIsS0FBbkIsbUJBQW1CLFFBR3BDO0FBcUVELE1BQU0sT0FBTyx5QkFBeUI7SUFDckMsWUFDaUIsUUFBYSxFQUNiLFFBQWtCO1FBRGxCLGFBQVEsR0FBUixRQUFRLENBQUs7UUFDYixhQUFRLEdBQVIsUUFBUSxDQUFVO0lBQy9CLENBQUM7Q0FDTDtBQUVELE1BQU0sT0FBTyxhQUFhO2FBQ1YsUUFBRyxHQUFHLENBQUMsQ0FBQztJQUt2QjtRQUNDLElBQUksQ0FBQyxFQUFFLEdBQUcsYUFBYSxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQzlCLElBQUksQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDO0lBQ2hCLENBQUM7SUFFTSxTQUFTO1FBQ2YsSUFBSSxJQUFJLENBQUMsRUFBRSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ25CLE9BQU8sQ0FBQyxDQUFDO1FBQ1YsQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO0lBQ3JCLENBQUM7YUFFYSxTQUFJLEdBQUcsSUFBSSxhQUFhLEVBQUUsQ0FBQzs7QUFHMUMsTUFBTSxPQUFPLGNBQWM7YUFDWCxRQUFHLEdBQUcsQ0FBQyxDQUFDO0lBS3ZCO1FBQ0MsSUFBSSxDQUFDLEVBQUUsR0FBRyxjQUFjLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDL0IsSUFBSSxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUM7SUFDaEIsQ0FBQztJQUVNLFNBQVM7UUFDZixJQUFJLElBQUksQ0FBQyxFQUFFLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDbkIsT0FBTyxDQUFDLENBQUM7UUFDVixDQUFDO1FBQ0QsT0FBTyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDckIsQ0FBQzthQUVhLFNBQUksR0FBRyxJQUFJLGNBQWMsRUFBRSxDQUFDIn0=