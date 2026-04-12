/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export class InternalEditorAction {
    constructor(id, label, alias, metadata, _precondition, _run, _contextKeyService) {
        this.id = id;
        this.label = label;
        this.alias = alias;
        this.metadata = metadata;
        this._precondition = _precondition;
        this._run = _run;
        this._contextKeyService = _contextKeyService;
    }
    isSupported() {
        return this._contextKeyService.contextMatchesRules(this._precondition);
    }
    run(args) {
        if (!this.isSupported()) {
            return Promise.resolve(undefined);
        }
        return this._run(args);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yQWN0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbW1vbi9lZGl0b3JBY3Rpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFNaEcsTUFBTSxPQUFPLG9CQUFvQjtJQUVoQyxZQUNpQixFQUFVLEVBQ1YsS0FBYSxFQUNiLEtBQWEsRUFDYixRQUFzQyxFQUNyQyxhQUErQyxFQUMvQyxJQUFzQyxFQUN0QyxrQkFBc0M7UUFOdkMsT0FBRSxHQUFGLEVBQUUsQ0FBUTtRQUNWLFVBQUssR0FBTCxLQUFLLENBQVE7UUFDYixVQUFLLEdBQUwsS0FBSyxDQUFRO1FBQ2IsYUFBUSxHQUFSLFFBQVEsQ0FBOEI7UUFDckMsa0JBQWEsR0FBYixhQUFhLENBQWtDO1FBQy9DLFNBQUksR0FBSixJQUFJLENBQWtDO1FBQ3RDLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBb0I7SUFDcEQsQ0FBQztJQUVFLFdBQVc7UUFDakIsT0FBTyxJQUFJLENBQUMsa0JBQWtCLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO0lBQ3hFLENBQUM7SUFFTSxHQUFHLENBQUMsSUFBYTtRQUN2QixJQUFJLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxFQUFFLENBQUM7WUFDekIsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ25DLENBQUM7UUFFRCxPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDeEIsQ0FBQztDQUNEIn0=