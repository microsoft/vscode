/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export class TreeViewsDnDService {
    constructor() {
        this._dragOperations = new Map();
    }
    removeDragOperationTransfer(uuid) {
        if ((uuid && this._dragOperations.has(uuid))) {
            const operation = this._dragOperations.get(uuid);
            this._dragOperations.delete(uuid);
            return operation;
        }
        return undefined;
    }
    addDragOperationTransfer(uuid, transferPromise) {
        this._dragOperations.set(uuid, transferPromise);
    }
}
export class DraggedTreeItemsIdentifier {
    constructor(identifier) {
        this.identifier = identifier;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJlZVZpZXdzRG5kLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy90cmVlVmlld3NEbmQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFTaEcsTUFBTSxPQUFPLG1CQUFtQjtJQUFoQztRQUVTLG9CQUFlLEdBQXdDLElBQUksR0FBRyxFQUFFLENBQUM7SUFjMUUsQ0FBQztJQVpBLDJCQUEyQixDQUFDLElBQXdCO1FBQ25ELElBQUksQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLGVBQWUsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQzlDLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ2pELElBQUksQ0FBQyxlQUFlLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ2xDLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFDRCxPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBRUQsd0JBQXdCLENBQUMsSUFBWSxFQUFFLGVBQXVDO1FBQzdFLElBQUksQ0FBQyxlQUFlLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxlQUFlLENBQUMsQ0FBQztJQUNqRCxDQUFDO0NBQ0Q7QUFHRCxNQUFNLE9BQU8sMEJBQTBCO0lBRXRDLFlBQXFCLFVBQWtCO1FBQWxCLGVBQVUsR0FBVixVQUFVLENBQVE7SUFBSSxDQUFDO0NBQzVDIn0=