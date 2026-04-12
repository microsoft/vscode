/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { addDisposableListener, EventType, getWindow } from '../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { isChrome, isMacintosh } from '../../../../../base/common/platform.js';
export class NotebookHorizontalTracker extends Disposable {
    constructor(_notebookEditor, _listViewScrollablement) {
        super();
        this._notebookEditor = _notebookEditor;
        this._listViewScrollablement = _listViewScrollablement;
        this._register(addDisposableListener(this._listViewScrollablement, EventType.MOUSE_WHEEL, (event) => {
            let deltaX = event.deltaX;
            let deltaY = event.deltaY;
            let wheelDeltaX = event.wheelDeltaX;
            let wheelDeltaY = event.wheelDeltaY;
            const wheelDelta = event.wheelDelta;
            const shiftConvert = !isMacintosh && event.shiftKey;
            if (shiftConvert && !deltaX) {
                deltaX = deltaY;
                deltaY = 0;
                wheelDeltaX = wheelDeltaY;
                wheelDeltaY = 0;
            }
            if (deltaX === 0) {
                return;
            }
            const hoveringOnEditor = this._notebookEditor.codeEditors.find(editor => {
                const editorLayout = editor[1].getLayoutInfo();
                if (editorLayout.contentWidth === editorLayout.width) {
                    // no overflow
                    return false;
                }
                const editorDOM = editor[1].getDomNode();
                if (editorDOM && editorDOM.contains(event.target)) {
                    return true;
                }
                return false;
            });
            if (!hoveringOnEditor) {
                return;
            }
            const targetWindow = getWindow(event);
            const evt = {
                deltaMode: event.deltaMode,
                deltaX: deltaX,
                deltaY: 0,
                deltaZ: 0,
                wheelDelta: wheelDelta && isChrome ? (wheelDelta / targetWindow.devicePixelRatio) : wheelDelta,
                wheelDeltaX: wheelDeltaX && isChrome ? (wheelDeltaX / targetWindow.devicePixelRatio) : wheelDeltaX,
                wheelDeltaY: 0,
                detail: event.detail,
                shiftKey: event.shiftKey,
                type: event.type,
                defaultPrevented: false,
                preventDefault: () => { },
                stopPropagation: () => { }
            };
            hoveringOnEditor[1].delegateScrollFromMouseWheelEvent(evt);
        }));
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tIb3Jpem9udGFsVHJhY2tlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvdmlld1BhcnRzL25vdGVib29rSG9yaXpvbnRhbFRyYWNrZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUVqRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDckUsT0FBTyxFQUFFLFFBQVEsRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUkvRSxNQUFNLE9BQU8seUJBQTBCLFNBQVEsVUFBVTtJQUN4RCxZQUNrQixlQUF3QyxFQUN4Qyx1QkFBb0M7UUFFckQsS0FBSyxFQUFFLENBQUM7UUFIUyxvQkFBZSxHQUFmLGVBQWUsQ0FBeUI7UUFDeEMsNEJBQXVCLEdBQXZCLHVCQUF1QixDQUFhO1FBSXJELElBQUksQ0FBQyxTQUFTLENBQUMscUJBQXFCLENBQUMsSUFBSSxDQUFDLHVCQUF1QixFQUFFLFNBQVMsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxLQUF1QixFQUFFLEVBQUU7WUFDckgsSUFBSSxNQUFNLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQztZQUMxQixJQUFJLE1BQU0sR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDO1lBQzFCLElBQUksV0FBVyxHQUFHLEtBQUssQ0FBQyxXQUFXLENBQUM7WUFDcEMsSUFBSSxXQUFXLEdBQUcsS0FBSyxDQUFDLFdBQVcsQ0FBQztZQUNwQyxNQUFNLFVBQVUsR0FBRyxLQUFLLENBQUMsVUFBVSxDQUFDO1lBRXBDLE1BQU0sWUFBWSxHQUFHLENBQUMsV0FBVyxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUM7WUFDcEQsSUFBSSxZQUFZLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztnQkFDN0IsTUFBTSxHQUFHLE1BQU0sQ0FBQztnQkFDaEIsTUFBTSxHQUFHLENBQUMsQ0FBQztnQkFDWCxXQUFXLEdBQUcsV0FBVyxDQUFDO2dCQUMxQixXQUFXLEdBQUcsQ0FBQyxDQUFDO1lBQ2pCLENBQUM7WUFFRCxJQUFJLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztnQkFDbEIsT0FBTztZQUNSLENBQUM7WUFFRCxNQUFNLGdCQUFnQixHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRTtnQkFDdkUsTUFBTSxZQUFZLEdBQUcsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLGFBQWEsRUFBRSxDQUFDO2dCQUMvQyxJQUFJLFlBQVksQ0FBQyxZQUFZLEtBQUssWUFBWSxDQUFDLEtBQUssRUFBRSxDQUFDO29CQUN0RCxjQUFjO29CQUNkLE9BQU8sS0FBSyxDQUFDO2dCQUNkLENBQUM7Z0JBRUQsTUFBTSxTQUFTLEdBQUcsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsRUFBRSxDQUFDO2dCQUN6QyxJQUFJLFNBQVMsSUFBSSxTQUFTLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxNQUFxQixDQUFDLEVBQUUsQ0FBQztvQkFDbEUsT0FBTyxJQUFJLENBQUM7Z0JBQ2IsQ0FBQztnQkFFRCxPQUFPLEtBQUssQ0FBQztZQUNkLENBQUMsQ0FBQyxDQUFDO1lBRUgsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7Z0JBQ3ZCLE9BQU87WUFDUixDQUFDO1lBRUQsTUFBTSxZQUFZLEdBQUcsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3RDLE1BQU0sR0FBRyxHQUFHO2dCQUNYLFNBQVMsRUFBRSxLQUFLLENBQUMsU0FBUztnQkFDMUIsTUFBTSxFQUFFLE1BQU07Z0JBQ2QsTUFBTSxFQUFFLENBQUM7Z0JBQ1QsTUFBTSxFQUFFLENBQUM7Z0JBQ1QsVUFBVSxFQUFFLFVBQVUsSUFBSSxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxHQUFHLFlBQVksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxVQUFVO2dCQUM5RixXQUFXLEVBQUUsV0FBVyxJQUFJLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLEdBQUcsWUFBWSxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVc7Z0JBQ2xHLFdBQVcsRUFBRSxDQUFDO2dCQUNkLE1BQU0sRUFBRSxLQUFLLENBQUMsTUFBTTtnQkFDcEIsUUFBUSxFQUFFLEtBQUssQ0FBQyxRQUFRO2dCQUN4QixJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUk7Z0JBQ2hCLGdCQUFnQixFQUFFLEtBQUs7Z0JBQ3ZCLGNBQWMsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDO2dCQUN6QixlQUFlLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQzthQUMxQixDQUFDO1lBRUQsZ0JBQWdCLENBQUMsQ0FBQyxDQUFzQixDQUFDLGlDQUFpQyxDQUFDLEdBQWtDLENBQUMsQ0FBQztRQUNqSCxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNEIn0=