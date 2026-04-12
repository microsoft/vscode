/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { addDisposableListener, EventHelper, EventType, getWindow } from '../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../base/browser/keyboardEvent.js';
import { StandardMouseEvent } from '../../../base/browser/mouseEvent.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { isMacintosh } from '../../../base/common/platform.js';
export function registerOpenEditorListeners(element, onOpenEditor) {
    const disposables = new DisposableStore();
    disposables.add(addDisposableListener(element, EventType.CLICK, e => {
        if (e.detail === 2) {
            return; // ignore double click as it is handled below
        }
        EventHelper.stop(e, true);
        onOpenEditor(toOpenEditorOptions(new StandardMouseEvent(getWindow(element), e)));
    }));
    disposables.add(addDisposableListener(element, EventType.DBLCLICK, e => {
        EventHelper.stop(e, true);
        onOpenEditor(toOpenEditorOptions(new StandardMouseEvent(getWindow(element), e), true));
    }));
    disposables.add(addDisposableListener(element, EventType.KEY_DOWN, e => {
        const options = toOpenEditorOptions(new StandardKeyboardEvent(e));
        if (!options) {
            return;
        }
        EventHelper.stop(e, true);
        onOpenEditor(options);
    }));
    return disposables;
}
export function toOpenEditorOptions(event, isDoubleClick) {
    if (event instanceof StandardKeyboardEvent) {
        let preserveFocus = undefined;
        if (event.equals(3 /* KeyCode.Enter */) || (isMacintosh && event.equals(2048 /* KeyMod.CtrlCmd */ | 18 /* KeyCode.DownArrow */))) {
            preserveFocus = false;
        }
        else if (event.equals(10 /* KeyCode.Space */)) {
            preserveFocus = true;
        }
        if (typeof preserveFocus === 'undefined') {
            return;
        }
        return { editorOptions: { preserveFocus, pinned: !preserveFocus }, openToSide: false };
    }
    else {
        return { editorOptions: { preserveFocus: !isDoubleClick, pinned: isDoubleClick || event.middleButton }, openToSide: event.ctrlKey || event.metaKey || event.altKey };
    }
}
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxXQUFXLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ3hHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRXpFLE9BQU8sRUFBRSxlQUFlLEVBQWUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNqRixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFVL0QsTUFBTSxVQUFVLDJCQUEyQixDQUFDLE9BQW9CLEVBQUUsWUFBbUQ7SUFDcEgsTUFBTSxXQUFXLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztJQUUxQyxXQUFXLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLE9BQU8sRUFBRSxTQUFTLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxFQUFFO1FBQ25FLElBQUksQ0FBQyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUNwQixPQUFPLENBQUMsNkNBQTZDO1FBQ3RELENBQUM7UUFFRCxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUMxQixZQUFZLENBQUMsbUJBQW1CLENBQUMsSUFBSSxrQkFBa0IsQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2xGLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFSixXQUFXLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLE9BQU8sRUFBRSxTQUFTLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxFQUFFO1FBQ3RFLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBRTFCLFlBQVksQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLGtCQUFrQixDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQ3hGLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFSixXQUFXLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLE9BQU8sRUFBRSxTQUFTLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxFQUFFO1FBQ3RFLE1BQU0sT0FBTyxHQUFHLG1CQUFtQixDQUFDLElBQUkscUJBQXFCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNsRSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDZCxPQUFPO1FBQ1IsQ0FBQztRQUVELFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzFCLFlBQVksQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUN2QixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRUosT0FBTyxXQUFXLENBQUM7QUFDcEIsQ0FBQztBQUtELE1BQU0sVUFBVSxtQkFBbUIsQ0FBQyxLQUFpRCxFQUFFLGFBQXVCO0lBQzdHLElBQUksS0FBSyxZQUFZLHFCQUFxQixFQUFFLENBQUM7UUFDNUMsSUFBSSxhQUFhLEdBQXdCLFNBQVMsQ0FBQztRQUNuRCxJQUFJLEtBQUssQ0FBQyxNQUFNLHVCQUFlLElBQUksQ0FBQyxXQUFXLElBQUksS0FBSyxDQUFDLE1BQU0sQ0FBQyxzREFBa0MsQ0FBQyxDQUFDLEVBQUUsQ0FBQztZQUN0RyxhQUFhLEdBQUcsS0FBSyxDQUFDO1FBQ3ZCLENBQUM7YUFBTSxJQUFJLEtBQUssQ0FBQyxNQUFNLHdCQUFlLEVBQUUsQ0FBQztZQUN4QyxhQUFhLEdBQUcsSUFBSSxDQUFDO1FBQ3RCLENBQUM7UUFFRCxJQUFJLE9BQU8sYUFBYSxLQUFLLFdBQVcsRUFBRSxDQUFDO1lBQzFDLE9BQU87UUFDUixDQUFDO1FBRUQsT0FBTyxFQUFFLGFBQWEsRUFBRSxFQUFFLGFBQWEsRUFBRSxNQUFNLEVBQUUsQ0FBQyxhQUFhLEVBQUUsRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLENBQUM7SUFDeEYsQ0FBQztTQUFNLENBQUM7UUFDUCxPQUFPLEVBQUUsYUFBYSxFQUFFLEVBQUUsYUFBYSxFQUFFLENBQUMsYUFBYSxFQUFFLE1BQU0sRUFBRSxhQUFhLElBQUksS0FBSyxDQUFDLFlBQVksRUFBRSxFQUFFLFVBQVUsRUFBRSxLQUFLLENBQUMsT0FBTyxJQUFJLEtBQUssQ0FBQyxPQUFPLElBQUksS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDO0lBQ3RLLENBQUM7QUFDRixDQUFDO0FBRUQsWUFBWSJ9