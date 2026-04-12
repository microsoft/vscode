/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
export var NotebookDiffViewEventType;
(function (NotebookDiffViewEventType) {
    NotebookDiffViewEventType[NotebookDiffViewEventType["LayoutChanged"] = 1] = "LayoutChanged";
    NotebookDiffViewEventType[NotebookDiffViewEventType["CellLayoutChanged"] = 2] = "CellLayoutChanged";
    // MetadataChanged = 2,
    // CellStateChanged = 3
})(NotebookDiffViewEventType || (NotebookDiffViewEventType = {}));
export class NotebookDiffLayoutChangedEvent {
    constructor(source, value) {
        this.source = source;
        this.value = value;
        this.type = NotebookDiffViewEventType.LayoutChanged;
    }
}
export class NotebookCellLayoutChangedEvent {
    constructor(source) {
        this.source = source;
        this.type = NotebookDiffViewEventType.CellLayoutChanged;
    }
}
export class NotebookDiffEditorEventDispatcher extends Disposable {
    constructor() {
        super(...arguments);
        this._onDidChangeLayout = this._register(new Emitter());
        this.onDidChangeLayout = this._onDidChangeLayout.event;
        this._onDidChangeCellLayout = this._register(new Emitter());
        this.onDidChangeCellLayout = this._onDidChangeCellLayout.event;
    }
    emit(events) {
        for (let i = 0, len = events.length; i < len; i++) {
            const e = events[i];
            switch (e.type) {
                case NotebookDiffViewEventType.LayoutChanged:
                    this._onDidChangeLayout.fire(e);
                    break;
                case NotebookDiffViewEventType.CellLayoutChanged:
                    this._onDidChangeCellLayout.fire(e);
                    break;
            }
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXZlbnREaXNwYXRjaGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svYnJvd3Nlci9kaWZmL2V2ZW50RGlzcGF0Y2hlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBSXJFLE1BQU0sQ0FBTixJQUFZLHlCQUtYO0FBTEQsV0FBWSx5QkFBeUI7SUFDcEMsMkZBQWlCLENBQUE7SUFDakIsbUdBQXFCLENBQUE7SUFDckIsdUJBQXVCO0lBQ3ZCLHVCQUF1QjtBQUN4QixDQUFDLEVBTFcseUJBQXlCLEtBQXpCLHlCQUF5QixRQUtwQztBQUVELE1BQU0sT0FBTyw4QkFBOEI7SUFHMUMsWUFBcUIsTUFBaUMsRUFBVyxLQUF5QjtRQUFyRSxXQUFNLEdBQU4sTUFBTSxDQUEyQjtRQUFXLFVBQUssR0FBTCxLQUFLLENBQW9CO1FBRjFFLFNBQUksR0FBRyx5QkFBeUIsQ0FBQyxhQUFhLENBQUM7SUFJL0QsQ0FBQztDQUNEO0FBRUQsTUFBTSxPQUFPLDhCQUE4QjtJQUcxQyxZQUFxQixNQUE4QjtRQUE5QixXQUFNLEdBQU4sTUFBTSxDQUF3QjtRQUZuQyxTQUFJLEdBQUcseUJBQXlCLENBQUMsaUJBQWlCLENBQUM7SUFJbkUsQ0FBQztDQUNEO0FBSUQsTUFBTSxPQUFPLGlDQUFrQyxTQUFRLFVBQVU7SUFBakU7O1FBQ29CLHVCQUFrQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQWtDLENBQUMsQ0FBQztRQUM3RixzQkFBaUIsR0FBRyxJQUFJLENBQUMsa0JBQWtCLENBQUMsS0FBSyxDQUFDO1FBRXhDLDJCQUFzQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQWtDLENBQUMsQ0FBQztRQUNqRywwQkFBcUIsR0FBRyxJQUFJLENBQUMsc0JBQXNCLENBQUMsS0FBSyxDQUFDO0lBZ0JwRSxDQUFDO0lBZEEsSUFBSSxDQUFDLE1BQStCO1FBQ25DLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEdBQUcsR0FBRyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxHQUFHLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNuRCxNQUFNLENBQUMsR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFcEIsUUFBUSxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ2hCLEtBQUsseUJBQXlCLENBQUMsYUFBYTtvQkFDM0MsSUFBSSxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDaEMsTUFBTTtnQkFDUCxLQUFLLHlCQUF5QixDQUFDLGlCQUFpQjtvQkFDL0MsSUFBSSxDQUFDLHNCQUFzQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDcEMsTUFBTTtZQUNSLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztDQUNEIn0=