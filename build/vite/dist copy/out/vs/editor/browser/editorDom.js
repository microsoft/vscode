/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as dom from '../../base/browser/dom.js';
import * as domStylesheetsJs from '../../base/browser/domStylesheets.js';
import { GlobalPointerMoveMonitor } from '../../base/browser/globalPointerMoveMonitor.js';
import { StandardMouseEvent } from '../../base/browser/mouseEvent.js';
import { RunOnceScheduler } from '../../base/common/async.js';
import { Disposable, DisposableMap, DisposableStore } from '../../base/common/lifecycle.js';
import { asCssVariable } from '../../platform/theme/common/colorRegistry.js';
/**
 * Coordinates relative to the whole document (e.g. mouse event's pageX and pageY)
 */
export class PageCoordinates {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this._pageCoordinatesBrand = undefined;
    }
    toClientCoordinates(targetWindow) {
        return new ClientCoordinates(this.x - targetWindow.scrollX, this.y - targetWindow.scrollY);
    }
}
/**
 * Coordinates within the application's client area (i.e. origin is document's scroll position).
 *
 * For example, clicking in the top-left corner of the client area will
 * always result in a mouse event with a client.x value of 0, regardless
 * of whether the page is scrolled horizontally.
 */
export class ClientCoordinates {
    constructor(clientX, clientY) {
        this.clientX = clientX;
        this.clientY = clientY;
        this._clientCoordinatesBrand = undefined;
    }
    toPageCoordinates(targetWindow) {
        return new PageCoordinates(this.clientX + targetWindow.scrollX, this.clientY + targetWindow.scrollY);
    }
}
/**
 * The position of the editor in the page.
 */
export class EditorPagePosition {
    constructor(x, y, width, height) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this._editorPagePositionBrand = undefined;
    }
}
/**
 * Coordinates relative to the (top;left) of the editor that can be used safely with other internal editor metrics.
 * **NOTE**: This position is obtained by taking page coordinates and transforming them relative to the
 * editor's (top;left) position in a way in which scale transformations are taken into account.
 * **NOTE**: These coordinates could be negative if the mouse position is outside the editor.
 */
export class CoordinatesRelativeToEditor {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this._positionRelativeToEditorBrand = undefined;
    }
}
export function createEditorPagePosition(editorViewDomNode) {
    const editorPos = dom.getDomNodePagePosition(editorViewDomNode);
    return new EditorPagePosition(editorPos.left, editorPos.top, editorPos.width, editorPos.height);
}
export function createCoordinatesRelativeToEditor(editorViewDomNode, editorPagePosition, pos) {
    // The editor's page position is read from the DOM using getBoundingClientRect().
    //
    // getBoundingClientRect() returns the actual dimensions, while offsetWidth and offsetHeight
    // reflect the unscaled size. We can use this difference to detect a transform:scale()
    // and we will apply the transformation in inverse to get mouse coordinates that make sense inside the editor.
    //
    // This could be expanded to cover rotation as well maybe by walking the DOM up from `editorViewDomNode`
    // and computing the effective transformation matrix using getComputedStyle(element).transform.
    //
    const scaleX = editorPagePosition.width / editorViewDomNode.offsetWidth;
    const scaleY = editorPagePosition.height / editorViewDomNode.offsetHeight;
    // Adjust mouse offsets if editor appears to be scaled via transforms
    const relativeX = (pos.x - editorPagePosition.x) / scaleX;
    const relativeY = (pos.y - editorPagePosition.y) / scaleY;
    return new CoordinatesRelativeToEditor(relativeX, relativeY);
}
export class EditorMouseEvent extends StandardMouseEvent {
    constructor(e, isFromPointerCapture, editorViewDomNode) {
        super(dom.getWindow(editorViewDomNode), e);
        this._editorMouseEventBrand = undefined;
        this.isFromPointerCapture = isFromPointerCapture;
        this.pos = new PageCoordinates(this.posx, this.posy);
        this.editorPos = createEditorPagePosition(editorViewDomNode);
        this.relativePos = createCoordinatesRelativeToEditor(editorViewDomNode, this.editorPos, this.pos);
    }
}
export class EditorMouseEventFactory {
    constructor(editorViewDomNode) {
        this._editorViewDomNode = editorViewDomNode;
    }
    _create(e) {
        return new EditorMouseEvent(e, false, this._editorViewDomNode);
    }
    onContextMenu(target, callback) {
        return dom.addDisposableListener(target, dom.EventType.CONTEXT_MENU, (e) => {
            callback(this._create(e));
        });
    }
    onMouseUp(target, callback) {
        return dom.addDisposableListener(target, dom.EventType.MOUSE_UP, (e) => {
            callback(this._create(e));
        });
    }
    onMouseDown(target, callback) {
        return dom.addDisposableListener(target, dom.EventType.MOUSE_DOWN, (e) => {
            callback(this._create(e));
        });
    }
    onPointerDown(target, callback) {
        return dom.addDisposableListener(target, dom.EventType.POINTER_DOWN, (e) => {
            callback(this._create(e), e.pointerId);
        });
    }
    onMouseLeave(target, callback) {
        return dom.addDisposableListener(target, dom.EventType.MOUSE_LEAVE, (e) => {
            callback(this._create(e));
        });
    }
    onMouseMove(target, callback) {
        return dom.addDisposableListener(target, dom.EventType.MOUSE_MOVE, (e) => callback(this._create(e)));
    }
}
export class EditorPointerEventFactory {
    constructor(editorViewDomNode) {
        this._editorViewDomNode = editorViewDomNode;
    }
    _create(e) {
        return new EditorMouseEvent(e, false, this._editorViewDomNode);
    }
    onPointerUp(target, callback) {
        return dom.addDisposableListener(target, 'pointerup', (e) => {
            callback(this._create(e));
        });
    }
    onPointerDown(target, callback) {
        return dom.addDisposableListener(target, dom.EventType.POINTER_DOWN, (e) => {
            callback(this._create(e), e.pointerId);
        });
    }
    onPointerLeave(target, callback) {
        return dom.addDisposableListener(target, dom.EventType.POINTER_LEAVE, (e) => {
            callback(this._create(e));
        });
    }
    onPointerMove(target, callback) {
        return dom.addDisposableListener(target, 'pointermove', (e) => callback(this._create(e)));
    }
}
export class GlobalEditorPointerMoveMonitor extends Disposable {
    constructor(editorViewDomNode) {
        super();
        this._editorViewDomNode = editorViewDomNode;
        this._globalPointerMoveMonitor = this._register(new GlobalPointerMoveMonitor());
        this._keydownListener = null;
    }
    startMonitoring(initialElement, pointerId, initialButtons, pointerMoveCallback, onStopCallback) {
        // Add a <<capture>> keydown event listener that will cancel the monitoring
        // if something other than a modifier key is pressed
        this._keydownListener = dom.addStandardDisposableListener(initialElement.ownerDocument, 'keydown', (e) => {
            const chord = e.toKeyCodeChord();
            if (chord.isModifierKey()) {
                // Allow modifier keys
                return;
            }
            this._globalPointerMoveMonitor.stopMonitoring(true, e.browserEvent);
        }, true);
        this._globalPointerMoveMonitor.startMonitoring(initialElement, pointerId, initialButtons, (e) => {
            pointerMoveCallback(new EditorMouseEvent(e, true, this._editorViewDomNode));
        }, (e) => {
            this._keydownListener.dispose();
            onStopCallback(e);
        });
    }
    stopMonitoring() {
        this._globalPointerMoveMonitor.stopMonitoring(true);
    }
}
/**
 * A helper to create dynamic css rules, bound to a class name.
 * Rules are reused.
 * Reference counting and delayed garbage collection ensure that no rules leak.
*/
export class DynamicCssRules {
    static { this._idPool = 0; }
    constructor(_editor) {
        this._editor = _editor;
        this._instanceId = ++DynamicCssRules._idPool;
        this._counter = 0;
        this._rules = new DisposableMap();
        // We delay garbage collection so that hanging rules can be reused.
        this._garbageCollectionScheduler = new RunOnceScheduler(() => this.garbageCollect(), 1000);
    }
    dispose() {
        this._rules.dispose();
        this._garbageCollectionScheduler.dispose();
    }
    createClassNameRef(options) {
        const rule = this.getOrCreateRule(options);
        rule.increaseRefCount();
        return {
            className: rule.className,
            dispose: () => {
                rule.decreaseRefCount();
                this._garbageCollectionScheduler.schedule();
            }
        };
    }
    getOrCreateRule(properties) {
        const key = this.computeUniqueKey(properties);
        let existingRule = this._rules.get(key);
        if (!existingRule) {
            const counter = this._counter++;
            existingRule = new RefCountedCssRule(key, `dyn-rule-${this._instanceId}-${counter}`, dom.isInShadowDOM(this._editor.getContainerDomNode())
                ? this._editor.getContainerDomNode()
                : undefined, properties);
            this._rules.set(key, existingRule);
        }
        return existingRule;
    }
    computeUniqueKey(properties) {
        return JSON.stringify(properties);
    }
    garbageCollect() {
        for (const rule of this._rules.values()) {
            if (!rule.hasReferences()) {
                this._rules.deleteAndDispose(rule.key);
            }
        }
    }
}
class RefCountedCssRule {
    constructor(key, className, _containerElement, properties) {
        this.key = key;
        this.className = className;
        this.properties = properties;
        this._referenceCount = 0;
        this._styleElementDisposables = new DisposableStore();
        this._styleElement = domStylesheetsJs.createStyleSheet(_containerElement, undefined, this._styleElementDisposables);
        this._styleElement.textContent = this.getCssText(this.className, this.properties);
    }
    getCssText(className, properties) {
        let str = `.${className} {`;
        for (const prop in properties) {
            const value = properties[prop];
            let cssValue;
            if (typeof value === 'object') {
                cssValue = asCssVariable(value.id);
            }
            else {
                cssValue = value;
            }
            const cssPropName = camelToDashes(prop);
            str += `\n\t${cssPropName}: ${cssValue};`;
        }
        str += `\n}`;
        return str;
    }
    dispose() {
        this._styleElementDisposables.dispose();
        this._styleElement = undefined;
    }
    increaseRefCount() {
        this._referenceCount++;
    }
    decreaseRefCount() {
        this._referenceCount--;
    }
    hasReferences() {
        return this._referenceCount > 0;
    }
}
function camelToDashes(str) {
    return str.replace(/(^[A-Z])/, ([first]) => first.toLowerCase())
        .replace(/([A-Z])/g, ([letter]) => `-${letter.toLowerCase()}`);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yRG9tLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRG9tLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sMkJBQTJCLENBQUM7QUFDakQsT0FBTyxLQUFLLGdCQUFnQixNQUFNLHNDQUFzQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQzlELE9BQU8sRUFBRSxVQUFVLEVBQUUsYUFBYSxFQUFFLGVBQWUsRUFBZSxNQUFNLGdDQUFnQyxDQUFDO0FBRXpHLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUc3RTs7R0FFRztBQUNILE1BQU0sT0FBTyxlQUFlO0lBRzNCLFlBQ2lCLENBQVMsRUFDVCxDQUFTO1FBRFQsTUFBQyxHQUFELENBQUMsQ0FBUTtRQUNULE1BQUMsR0FBRCxDQUFDLENBQVE7UUFKMUIsMEJBQXFCLEdBQVMsU0FBUyxDQUFDO0lBS3BDLENBQUM7SUFFRSxtQkFBbUIsQ0FBQyxZQUFvQjtRQUM5QyxPQUFPLElBQUksaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxZQUFZLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDLEdBQUcsWUFBWSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQzVGLENBQUM7Q0FDRDtBQUVEOzs7Ozs7R0FNRztBQUNILE1BQU0sT0FBTyxpQkFBaUI7SUFHN0IsWUFDaUIsT0FBZSxFQUNmLE9BQWU7UUFEZixZQUFPLEdBQVAsT0FBTyxDQUFRO1FBQ2YsWUFBTyxHQUFQLE9BQU8s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