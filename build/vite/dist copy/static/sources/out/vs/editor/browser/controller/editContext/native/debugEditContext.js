/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { EditContext } from './editContextFactory.js';
const COLOR_FOR_CONTROL_BOUNDS = 'blue';
const COLOR_FOR_SELECTION_BOUNDS = 'red';
const COLOR_FOR_CHARACTER_BOUNDS = 'green';
export class DebugEditContext {
    constructor(window, options) {
        this._isDebugging = true;
        this._controlBounds = null;
        this._selectionBounds = null;
        this._characterBounds = null;
        this._ontextupdateWrapper = new EventListenerWrapper('textupdate', this);
        this._ontextformatupdateWrapper = new EventListenerWrapper('textformatupdate', this);
        this._oncharacterboundsupdateWrapper = new EventListenerWrapper('characterboundsupdate', this);
        this._oncompositionstartWrapper = new EventListenerWrapper('compositionstart', this);
        this._oncompositionendWrapper = new EventListenerWrapper('compositionend', this);
        this._listenerMap = new Map();
        this._disposables = [];
        this._editContext = EditContext.create(window, options);
    }
    get text() {
        return this._editContext.text;
    }
    get selectionStart() {
        return this._editContext.selectionStart;
    }
    get selectionEnd() {
        return this._editContext.selectionEnd;
    }
    get characterBoundsRangeStart() {
        return this._editContext.characterBoundsRangeStart;
    }
    updateText(rangeStart, rangeEnd, text) {
        this._editContext.updateText(rangeStart, rangeEnd, text);
        this.renderDebug();
    }
    updateSelection(start, end) {
        this._editContext.updateSelection(start, end);
        this.renderDebug();
    }
    updateControlBounds(controlBounds) {
        this._editContext.updateControlBounds(controlBounds);
        this._controlBounds = controlBounds;
        this.renderDebug();
    }
    updateSelectionBounds(selectionBounds) {
        this._editContext.updateSelectionBounds(selectionBounds);
        this._selectionBounds = selectionBounds;
        this.renderDebug();
    }
    updateCharacterBounds(rangeStart, characterBounds) {
        this._editContext.updateCharacterBounds(rangeStart, characterBounds);
        this._characterBounds = { rangeStart, characterBounds };
        this.renderDebug();
    }
    attachedElements() {
        return this._editContext.attachedElements();
    }
    characterBounds() {
        return this._editContext.characterBounds();
    }
    get ontextupdate() { return this._ontextupdateWrapper.eventHandler; }
    set ontextupdate(value) { this._ontextupdateWrapper.eventHandler = value; }
    get ontextformatupdate() { return this._ontextformatupdateWrapper.eventHandler; }
    set ontextformatupdate(value) { this._ontextformatupdateWrapper.eventHandler = value; }
    get oncharacterboundsupdate() { return this._oncharacterboundsupdateWrapper.eventHandler; }
    set oncharacterboundsupdate(value) { this._oncharacterboundsupdateWrapper.eventHandler = value; }
    get oncompositionstart() { return this._oncompositionstartWrapper.eventHandler; }
    set oncompositionstart(value) { this._oncompositionstartWrapper.eventHandler = value; }
    get oncompositionend() { return this._oncompositionendWrapper.eventHandler; }
    set oncompositionend(value) { this._oncompositionendWrapper.eventHandler = value; }
    addEventListener(type, listener, options) {
        if (!listener) {
            return;
        }
        const debugListener = (event) => {
            if (this._isDebugging) {
                this.renderDebug();
                console.log(`DebugEditContex.on_${type}`, event);
            }
            if (typeof listener === 'function') {
                listener.call(this, event);
            }
            else if (typeof listener === 'object' && 'handleEvent' in listener) {
                listener.handleEvent(event);
            }
        };
        this._listenerMap.set(listener, debugListener);
        this._editContext.addEventListener(type, debugListener, options);
        this.renderDebug();
    }
    removeEventListener(type, listener, options) {
        if (!listener) {
            return;
        }
        const debugListener = this._listenerMap.get(listener);
        if (debugListener) {
            this._editContext.removeEventListener(type, debugListener, options);
            this._listenerMap.delete(listener);
        }
        this.renderDebug();
    }
    dispatchEvent(event) {
        return this._editContext.dispatchEvent(event);
    }
    startDebugging() {
        this._isDebugging = true;
        this.renderDebug();
    }
    endDebugging() {
        this._isDebugging = false;
        this.renderDebug();
    }
    renderDebug() {
        this._disposables.forEach(d => d.dispose());
        this._disposables = [];
        if (!this._isDebugging || this._listenerMap.size === 0) {
            return;
        }
        if (this._controlBounds) {
            this._disposables.push(createRect(this._controlBounds, COLOR_FOR_CONTROL_BOUNDS));
        }
        if (this._selectionBounds) {
            this._disposables.push(createRect(this._selectionBounds, COLOR_FOR_SELECTION_BOUNDS));
        }
        if (this._characterBounds) {
            for (const rect of this._characterBounds.characterBounds) {
                this._disposables.push(createRect(rect, COLOR_FOR_CHARACTER_BOUNDS));
            }
        }
        this._disposables.push(createDiv(this._editContext.text, this._editContext.selectionStart, this._editContext.selectionEnd));
    }
}
function createDiv(text, selectionStart, selectionEnd) {
    const ret = document.createElement('div');
    ret.className = 'debug-rect-marker';
    ret.style.position = 'absolute';
    ret.style.zIndex = '999999999';
    ret.style.bottom = '50px';
    ret.style.left = '60px';
    ret.style.backgroundColor = 'white';
    ret.style.border = '1px solid black';
    ret.style.padding = '5px';
    ret.style.whiteSpace = 'pre';
    ret.style.font = '12px monospace';
    ret.style.pointerEvents = 'none';
    const before = text.substring(0, selectionStart);
    const selected = text.substring(selectionStart, selectionEnd) || '|';
    const after = text.substring(selectionEnd) + ' ';
    const beforeNode = document.createTextNode(before);
    ret.appendChild(beforeNode);
    const selectedNode = document.createElement('span');
    selectedNode.style.backgroundColor = 'yellow';
    selectedNode.appendChild(document.createTextNode(selected));
    selectedNode.style.minWidth = '2px';
    selectedNode.style.minHeight = '16px';
    ret.appendChild(selectedNode);
    const afterNode = document.createTextNode(after);
    ret.appendChild(afterNode);
    // eslint-disable-next-line no-restricted-syntax
    document.body.appendChild(ret);
    return {
        dispose: () => {
            ret.remove();
        }
    };
}
function createRect(rect, color) {
    const ret = document.createElement('div');
    ret.className = 'debug-rect-marker';
    ret.style.position = 'absolute';
    ret.style.zIndex = '999999999';
    ret.style.outline = `2px solid ${color}`;
    ret.style.pointerEvents = 'none';
    ret.style.top = rect.top + 'px';
    ret.style.left = rect.left + 'px';
    ret.style.width = rect.width + 'px';
    ret.style.height = rect.height + 'px';
    // eslint-disable-next-line no-restricted-syntax
    document.body.appendChild(ret);
    return {
        dispose: () => {
            ret.remove();
        }
    };
}
class EventListenerWrapper {
    constructor(_eventType, _target) {
        this._eventType = _eventType;
        this._target = _target;
        this._eventHandler = null;
    }
    get eventHandler() {
        return this._eventHandler;
    }
    set eventHandler(value) {
        if (this._eventHandler) {
            this._target.removeEventListener(this._eventType, this._eventHandler);
        }
        this._eventHandler = value;
        if (value) {
            this._target.addEventListener(this._eventType, value);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWdFZGl0Q29udGV4dC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9icm93c2VyL2NvbnRyb2xsZXIvZWRpdENvbnRleHQvbmF0aXZlL2RlYnVnRWRpdENvbnRleHQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBRXRELE1BQU0sd0JBQXdCLEdBQUcsTUFBTSxDQUFDO0FBQ3hDLE1BQU0sMEJBQTBCLEdBQUcsS0FBSyxDQUFDO0FBQ3pDLE1BQU0sMEJBQTBCLEdBQUcsT0FBTyxDQUFDO0FBRTNDLE1BQU0sT0FBTyxnQkFBZ0I7SUFRNUIsWUFBWSxNQUFjLEVBQUUsT0FBcUM7UUFQekQsaUJBQVksR0FBRyxJQUFJLENBQUM7UUFDcEIsbUJBQWMsR0FBbUIsSUFBSSxDQUFDO1FBQ3RDLHFCQUFnQixHQUFtQixJQUFJLENBQUM7UUFDeEMscUJBQWdCLEdBQThELElBQUksQ0FBQztRQXVEMUUseUJBQW9CLEdBQUcsSUFBSSxvQkFBb0IsQ0FBQyxZQUFZLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDcEUsK0JBQTBCLEdBQUcsSUFBSSxvQkFBb0IsQ0FBQyxrQkFBa0IsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNoRixvQ0FBK0IsR0FBRyxJQUFJLG9CQUFvQixDQUFDLHVCQUF1QixFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzFGLCtCQUEwQixHQUFHLElBQUksb0JBQW9CLENBQUMsa0JBQWtCLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDaEYsNkJBQXdCLEdBQUcsSUFBSSxvQkFBb0IsQ0FBQyxnQkFBZ0IsRUFBRSxJQUFJLENBQUMsQ0FBQztRQWM1RSxpQkFBWSxHQUFHLElBQUksR0FBRyxFQUEwRSxDQUFDO1FBOEMxRyxpQkFBWSxHQUEwQixFQUFFLENBQUM7UUFs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