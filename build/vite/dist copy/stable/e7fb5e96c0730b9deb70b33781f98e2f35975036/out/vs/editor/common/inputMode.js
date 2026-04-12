/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../base/common/event.js';
class InputModeImpl {
    constructor() {
        this._inputMode = 'insert';
        this._onDidChangeInputMode = new Emitter();
        this.onDidChangeInputMode = this._onDidChangeInputMode.event;
    }
    getInputMode() {
        return this._inputMode;
    }
    setInputMode(inputMode) {
        this._inputMode = inputMode;
        this._onDidChangeInputMode.fire(this._inputMode);
    }
}
/**
 * Controls the type mode, whether insert or overtype
 */
export const InputMode = new InputModeImpl();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5wdXRNb2RlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbW1vbi9pbnB1dE1vZGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLDRCQUE0QixDQUFDO0FBRTVELE1BQU0sYUFBYTtJQUFuQjtRQUVTLGVBQVUsR0FBMEIsUUFBUSxDQUFDO1FBQ3BDLDBCQUFxQixHQUFHLElBQUksT0FBTyxFQUF5QixDQUFDO1FBQzlELHlCQUFvQixHQUFpQyxJQUFJLENBQUMscUJBQXFCLENBQUMsS0FBSyxDQUFDO0lBVXZHLENBQUM7SUFSTyxZQUFZO1FBQ2xCLE9BQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQztJQUN4QixDQUFDO0lBRU0sWUFBWSxDQUFDLFNBQWdDO1FBQ25ELElBQUksQ0FBQyxVQUFVLEdBQUcsU0FBUyxDQUFDO1FBQzVCLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQ2xELENBQUM7Q0FDRDtBQUVEOztHQUVHO0FBQ0gsTUFBTSxDQUFDLE1BQU0sU0FBUyxHQUFHLElBQUksYUFBYSxFQUFFLENBQUMifQ==