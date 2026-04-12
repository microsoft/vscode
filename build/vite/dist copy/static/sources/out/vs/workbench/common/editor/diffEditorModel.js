/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { EditorModel } from './editorModel.js';
/**
 * The base editor model for the diff editor. It is made up of two editor models, the original version
 * and the modified version.
 */
export class DiffEditorModel extends EditorModel {
    get originalModel() { return this._originalModel; }
    get modifiedModel() { return this._modifiedModel; }
    constructor(originalModel, modifiedModel) {
        super();
        this._originalModel = originalModel;
        this._modifiedModel = modifiedModel;
    }
    async resolve() {
        await Promise.all([
            this._originalModel?.resolve(),
            this._modifiedModel?.resolve()
        ]);
    }
    isResolved() {
        return !!(this._originalModel?.isResolved() && this._modifiedModel?.isResolved());
    }
    dispose() {
        // Do not propagate the dispose() call to the two models inside. We never created the two models
        // (original and modified) so we can not dispose them without sideeffects. Rather rely on the
        // models getting disposed when their related inputs get disposed from the diffEditorInput.
        super.dispose();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGlmZkVkaXRvck1vZGVsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbW1vbi9lZGl0b3IvZGlmZkVkaXRvck1vZGVsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxrQkFBa0IsQ0FBQztBQUcvQzs7O0dBR0c7QUFDSCxNQUFNLE9BQU8sZUFBZ0IsU0FBUSxXQUFXO0lBRy9DLElBQUksYUFBYSxLQUF5QyxPQUFPLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDO0lBR3ZGLElBQUksYUFBYSxLQUF5QyxPQUFPLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDO0lBRXZGLFlBQVksYUFBaUQsRUFBRSxhQUFpRDtRQUMvRyxLQUFLLEVBQUUsQ0FBQztRQUVSLElBQUksQ0FBQyxjQUFjLEdBQUcsYUFBYSxDQUFDO1FBQ3BDLElBQUksQ0FBQyxjQUFjLEdBQUcsYUFBYSxDQUFDO0lBQ3JDLENBQUM7SUFFUSxLQUFLLENBQUMsT0FBTztRQUNyQixNQUFNLE9BQU8sQ0FBQyxHQUFHLENBQUM7WUFDakIsSUFBSSxDQUFDLGNBQWMsRUFBRSxPQUFPLEVBQUU7WUFDOUIsSUFBSSxDQUFDLGNBQWMsRUFBRSxPQUFPLEVBQUU7U0FDOUIsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVRLFVBQVU7UUFDbEIsT0FBTyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLFVBQVUsRUFBRSxJQUFJLElBQUksQ0FBQyxjQUFjLEVBQUUsVUFBVSxFQUFFLENBQUMsQ0FBQztJQUNuRixDQUFDO0lBRVEsT0FBTztRQUVmLGdHQUFnRztRQUNoRyw2RkFBNkY7UUFDN0YsMkZBQTJGO1FBRTNGLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUNqQixDQUFDO0NBQ0QifQ==