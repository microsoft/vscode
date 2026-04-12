/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { $ } from '../../dom.js';
import './dnd.css';
export function applyDragImage(event, container, label, extraClasses = []) {
    if (!event.dataTransfer) {
        return;
    }
    const dragImage = $('.monaco-drag-image');
    dragImage.textContent = label;
    dragImage.classList.add(...extraClasses);
    const getDragImageContainer = (e) => {
        while (e && !e.classList.contains('monaco-workbench')) {
            e = e.parentElement;
        }
        return e || container.ownerDocument.body;
    };
    const dragContainer = getDragImageContainer(container);
    dragContainer.appendChild(dragImage);
    event.dataTransfer.setDragImage(dragImage, -10, -10);
    // Removes the element when the DND operation is done
    setTimeout(() => dragImage.remove(), 0);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZG5kLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9icm93c2VyL3VpL2RuZC9kbmQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLENBQUMsRUFBRSxNQUFNLGNBQWMsQ0FBQztBQUNqQyxPQUFPLFdBQVcsQ0FBQztBQUVuQixNQUFNLFVBQVUsY0FBYyxDQUFDLEtBQWdCLEVBQUUsU0FBc0IsRUFBRSxLQUFhLEVBQUUsZUFBeUIsRUFBRTtJQUNsSCxJQUFJLENBQUMsS0FBSyxDQUFDLFlBQVksRUFBRSxDQUFDO1FBQ3pCLE9BQU87SUFDUixDQUFDO0lBRUQsTUFBTSxTQUFTLEdBQUcsQ0FBQyxDQUFDLG9CQUFvQixDQUFDLENBQUM7SUFDMUMsU0FBUyxDQUFDLFdBQVcsR0FBRyxLQUFLLENBQUM7SUFDOUIsU0FBUyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsR0FBRyxZQUFZLENBQUMsQ0FBQztJQUV6QyxNQUFNLHFCQUFxQixHQUFHLENBQUMsQ0FBcUIsRUFBRSxFQUFFO1FBQ3ZELE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsa0JBQWtCLENBQUMsRUFBRSxDQUFDO1lBQ3ZELENBQUMsR0FBRyxDQUFDLENBQUMsYUFBYSxDQUFDO1FBQ3JCLENBQUM7UUFDRCxPQUFPLENBQUMsSUFBSSxTQUFTLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQztJQUMxQyxDQUFDLENBQUM7SUFFRixNQUFNLGFBQWEsR0FBRyxxQkFBcUIsQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUN2RCxhQUFhLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQ3JDLEtBQUssQ0FBQyxZQUFZLENBQUMsWUFBWSxDQUFDLFNBQVMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBRXJELHFEQUFxRDtJQUNyRCxVQUFVLENBQUMsR0FBRyxFQUFFLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO0FBQ3pDLENBQUMifQ==