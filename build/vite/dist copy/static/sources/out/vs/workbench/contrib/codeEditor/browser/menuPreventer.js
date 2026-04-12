/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from '../../../../base/common/lifecycle.js';
import { registerEditorContribution } from '../../../../editor/browser/editorExtensions.js';
/**
 * Prevents the top-level menu from showing up when doing Alt + Click in the editor
 */
export class MenuPreventer extends Disposable {
    static { this.ID = 'editor.contrib.menuPreventer'; }
    constructor(editor) {
        super();
        this._editor = editor;
        this._altListeningMouse = false;
        this._altMouseTriggered = false;
        // A global crossover handler to prevent menu bar from showing up
        // When <alt> is hold, we will listen to mouse events and prevent
        // the release event up <alt> if the mouse is triggered.
        this._register(this._editor.onMouseDown((e) => {
            if (this._altListeningMouse) {
                this._altMouseTriggered = true;
            }
        }));
        this._register(this._editor.onKeyDown((e) => {
            if (e.equals(512 /* KeyMod.Alt */)) {
                if (!this._altListeningMouse) {
                    this._altMouseTriggered = false;
                }
                this._altListeningMouse = true;
            }
        }));
        this._register(this._editor.onKeyUp((e) => {
            if (e.equals(512 /* KeyMod.Alt */)) {
                if (this._altMouseTriggered) {
                    e.preventDefault();
                }
                this._altListeningMouse = false;
                this._altMouseTriggered = false;
            }
        }));
    }
}
registerEditorContribution(MenuPreventer.ID, MenuPreventer, 2 /* EditorContributionInstantiation.BeforeFirstInteraction */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWVudVByZXZlbnRlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NvZGVFZGl0b3IvYnJvd3Nlci9tZW51UHJldmVudGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUVsRSxPQUFPLEVBQW1DLDBCQUEwQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFHN0g7O0dBRUc7QUFDSCxNQUFNLE9BQU8sYUFBYyxTQUFRLFVBQVU7YUFFckIsT0FBRSxHQUFHLDhCQUE4QixDQUFDO0lBTTNELFlBQVksTUFBbUI7UUFDOUIsS0FBSyxFQUFFLENBQUM7UUFDUixJQUFJLENBQUMsT0FBTyxHQUFHLE1BQU0sQ0FBQztRQUN0QixJQUFJLENBQUMsa0JBQWtCLEdBQUcsS0FBSyxDQUFDO1FBQ2hDLElBQUksQ0FBQyxrQkFBa0IsR0FBRyxLQUFLLENBQUM7UUFFaEMsaUVBQWlFO1FBQ2pFLGlFQUFpRTtRQUNqRSx3REFBd0Q7UUFFeEQsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFO1lBQzdDLElBQUksSUFBSSxDQUFDLGtCQUFrQixFQUFFLENBQUM7Z0JBQzdCLElBQUksQ0FBQyxrQkFBa0IsR0FBRyxJQUFJLENBQUM7WUFDaEMsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUU7WUFDM0MsSUFBSSxDQUFDLENBQUMsTUFBTSxzQkFBWSxFQUFFLENBQUM7Z0JBQzFCLElBQUksQ0FBQyxJQUFJLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztvQkFDOUIsSUFBSSxDQUFDLGtCQUFrQixHQUFHLEtBQUssQ0FBQztnQkFDakMsQ0FBQztnQkFDRCxJQUFJLENBQUMsa0JBQWtCLEdBQUcsSUFBSSxDQUFDO1lBQ2hDLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFO1lBQ3pDLElBQUksQ0FBQyxDQUFDLE1BQU0sc0JBQVksRUFBRSxDQUFDO2dCQUMxQixJQUFJLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO29CQUM3QixDQUFDLENBQUMsY0FBYyxFQUFFLENBQUM7Z0JBQ3BCLENBQUM7Z0JBQ0QsSUFBSSxDQUFDLGtCQUFrQixHQUFHLEtBQUssQ0FBQztnQkFDaEMsSUFBSSxDQUFDLGtCQUFrQixHQUFHLEtBQUssQ0FBQztZQUNqQyxDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7O0FBR0YsMEJBQTBCLENBQUMsYUFBYSxDQUFDLEVBQUUsRUFBRSxhQUFhLGlFQUF5RCxDQUFDIn0=