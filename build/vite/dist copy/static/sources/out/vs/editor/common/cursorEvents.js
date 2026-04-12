/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Describes the reason the cursor has changed its position.
 */
export var CursorChangeReason;
(function (CursorChangeReason) {
    /**
     * Unknown or not set.
     */
    CursorChangeReason[CursorChangeReason["NotSet"] = 0] = "NotSet";
    /**
     * A `model.setValue()` was called.
     */
    CursorChangeReason[CursorChangeReason["ContentFlush"] = 1] = "ContentFlush";
    /**
     * The `model` has been changed outside of this cursor and the cursor recovers its position from associated markers.
     */
    CursorChangeReason[CursorChangeReason["RecoverFromMarkers"] = 2] = "RecoverFromMarkers";
    /**
     * There was an explicit user gesture.
     */
    CursorChangeReason[CursorChangeReason["Explicit"] = 3] = "Explicit";
    /**
     * There was a Paste.
     */
    CursorChangeReason[CursorChangeReason["Paste"] = 4] = "Paste";
    /**
     * There was an Undo.
     */
    CursorChangeReason[CursorChangeReason["Undo"] = 5] = "Undo";
    /**
     * There was a Redo.
     */
    CursorChangeReason[CursorChangeReason["Redo"] = 6] = "Redo";
})(CursorChangeReason || (CursorChangeReason = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3Vyc29yRXZlbnRzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbW1vbi9jdXJzb3JFdmVudHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFLaEc7O0dBRUc7QUFDSCxNQUFNLENBQU4sSUFBa0Isa0JBNkJqQjtBQTdCRCxXQUFrQixrQkFBa0I7SUFDbkM7O09BRUc7SUFDSCwrREFBVSxDQUFBO0lBQ1Y7O09BRUc7SUFDSCwyRUFBZ0IsQ0FBQTtJQUNoQjs7T0FFRztJQUNILHVGQUFzQixDQUFBO0lBQ3RCOztPQUVHO0lBQ0gsbUVBQVksQ0FBQTtJQUNaOztPQUVHO0lBQ0gsNkRBQVMsQ0FBQTtJQUNUOztPQUVHO0lBQ0gsMkRBQVEsQ0FBQTtJQUNSOztPQUVHO0lBQ0gsMkRBQVEsQ0FBQTtBQUNULENBQUMsRUE3QmlCLGtCQUFrQixLQUFsQixrQkFBa0IsUUE2Qm5DIn0=