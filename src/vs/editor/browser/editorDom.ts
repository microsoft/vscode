/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../base/browser/dom.js';
import * as domStylesheetsJs from '../../base/browser/domStylesheets.js';
import { GlobalPointerMoveMonitor } from '../../base/browser/globalPointerMoveMonitor.js';
import { StandardMouseEvent } from '../../base/browser/mouseEvent.js';
import { RunOnceScheduler } from '../../base/common/async.js';
import { Disposable, DisposableStore, IDisposable } from '../../base/common/lifecycle.js';
import { ICodeEditor } from './editorBrowser.js';
import { asCssVariable } from '../../platform/theme/common/colorRegistry.js';
import { ThemeColor } from '../../base/common/themables.js';

/**
 * Coordinates relative to the whole document (e.g. mouse event's pageX and pageY)
 */
export class PageCoordinates {
	_pageCoordinatesBrand: void = undefined;

	constructor(
		public readonly x: number,
		public readonly y: number
	) { }

	public toClientCoordinates(targetWindow: Window): ClientCoordinates {
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
	_clientCoordinatesBrand: void = undefined;

	constructor(
		public readonly clientX: number,
		public readonly clientY: number
	) { }

	public toPageCoordinates(targetWindow: Window): PageCoordinates {
		return new PageCoordinates(this.clientX + targetWindow.scrollX, this.clientY + targetWindow.scrollY);
	}
}

/**
 * The position of the editor in the page.
 */
export class EditorPagePosition {
	_editorPagePositionBrand: void = undefined;

	constructor(
		public readonly x: number,
		public readonly y: number,
		public readonly width: number,
		public readonly height: number
	) { }
}

/**
 * Coordinates relative to the the (top;left) of the editor that can be used safely with other internal editor metrics.
 * **NOTE**: This position is obtained by taking page coordinates and transforming them relative to the
 * editor's (top;left) position in a way in which scale transformations are taken into account.
 * **NOTE**: These coordinates could be negative if the mouse position is outside the editor.
 */
export class CoordinatesRelativeToEditor {
	_positionRelativeToEditorBrand: void = undefined;

	constructor(
		public readonly x: number,
		public readonly y: number
	) { }
}

export function createEditorPagePosition(editorViewDomNode: HTMLElement): EditorPagePosition {
	const editorPos = dom.getDomNodePagePosition(editorViewDomNode);
	return new EditorPagePosition(editorPos.left, editorPos.top, editorPos.width, editorPos.height);
}

export function createCoordinatesRelativeToEditor(editorViewDomNode: HTMLElement, editorPagePosition: EditorPagePosition, pos: PageCoordinates) {
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
	_editorMouseEventBrand: void = undefined;

	/**
	 * If the event is a result of using `setPointerCapture`, the `event.target`
	 * does not necessarily reflect the position in the editor.
	 */
	public readonly isFromPointerCapture: boolean;

	/**
	 * Coordinates relative to the whole document.
	 */
	public readonly pos: PageCoordinates;

	/**
	 * Editor's coordinates relative to the whole document.
	 */
	public readonly editorPos: EditorPagePosition;

	/**
	 * Coordinates relative to the (top;left) of the editor.
	 * *NOTE*: These coordinates are preferred because they take into account transformations applied to the editor.
	 * *NOTE*: These coordinates could be negative if the mouse position is outside the editor.
	 */
	public readonly relativePos: CoordinatesRelativeToEditor;

	constructor(e: MouseEvent, isFromPointerCapture: boolean, editorViewDomNode: HTMLElement) {
		super(dom.getWindow(editorViewDomNode), e);
		this.isFromPointerCapture = isFromPointerCapture;
		this.pos = new PageCoordinates(this.posx, this.posy);
		this.editorPos = createEditorPagePosition(editorViewDomNode);
		this.relativePos = createCoordinatesRelativeToEditor(editorViewDomNode, this.editorPos, this.pos);
	}
}

export class EditorMouseEventFactory {

	private readonly _editorViewDomNode: HTMLElement;

	constructor(editorViewDomNode: HTMLElement) {
		this._editorViewDomNode = editorViewDomNode;
	}

	private _create(e: MouseEvent): EditorMouseEvent {
		return new EditorMouseEvent(e, false, this._editorViewDomNode);
	}

	public onContextMenu(target: HTMLElement, callback: (e: EditorMouseEvent) => void): IDisposable {
		return dom.addDisposableListener(target, 'contextmenu', (e: MouseEvent) => {
			callback(this._create(e));
		});
	}

	public onMouseUp(target: HTMLElement, callback: (e: EditorMouseEvent) => void): IDisposable {
		return dom.addDisposableListener(target, 'mouseup', (e: MouseEvent) => {
			callback(this._create(e));
		});
	}

	public onMouseDown(target: HTMLElement, callback: (e: EditorMouseEvent) => void): IDisposable {
		return dom.addDisposableListener(target, dom.EventType.MOUSE_DOWN, (e: MouseEvent) => {
			callback(this._create(e));
		});
	}

	public onPointerDown(target: HTMLElement, callback: (e: EditorMouseEvent, pointerId: number) => void): IDisposable {
		return dom.addDisposableListener(target, dom.EventType.POINTER_DOWN, (e: PointerEvent) => {
			callback(this._create(e), e.pointerId);
		});
	}

	public onMouseLeave(target: HTMLElement, callback: (e: EditorMouseEvent) => void): IDisposable {
		return dom.addDisposableListener(target, dom.EventType.MOUSE_LEAVE, (e: MouseEvent) => {
			callback(this._create(e));
		});
	}

	public onMouseMove(target: HTMLElement, callback: (e: EditorMouseEvent) => void): IDisposable {
		return dom.addDisposableListener(target, 'mousemove', (e) => callback(this._create(e)));
	}
}

export class EditorPointerEventFactory {

	private readonly _editorViewDomNode: HTMLElement;

	constructor(editorViewDomNode: HTMLElement) {
		this._editorViewDomNode = editorViewDomNode;
	}

	private _create(e: MouseEvent): EditorMouseEvent {
		return new EditorMouseEvent(e, false, this._editorViewDomNode);
	}

	public onPointerUp(target: HTMLElement, callback: (e: EditorMouseEvent) => void): IDisposable {
		return dom.addDisposableListener(target, 'pointerup', (e: MouseEvent) => {
			callback(this._create(e));
		});
	}

	public onPointerDown(target: HTMLElement, callback: (e: EditorMouseEvent, pointerId: number) => void): IDisposable {
		return dom.addDisposableListener(target, dom.EventType.POINTER_DOWN, (e: PointerEvent) => {
			callback(this._create(e), e.pointerId);
		});
	}

	public onPointerLeave(target: HTMLElement, callback: (e: EditorMouseEvent) => void): IDisposable {
		return dom.addDisposableListener(target, dom.EventType.POINTER_LEAVE, (e: MouseEvent) => {
			callback(this._create(e));
		});
	}

	public onPointerMove(target: HTMLElement, callback: (e: EditorMouseEvent) => void): IDisposable {
		return dom.addDisposableListener(target, 'pointermove', (e) => callback(this._create(e)));
	}
}

export class GlobalEditorPointerMoveMonitor extends Disposable {

	private readonly _editorViewDomNode: HTMLElement;
	private readonly _globalPointerMoveMonitor: GlobalPointerMoveMonitor;
	private _keydownListener: IDisposable | null;

	constructor(editorViewDomNode: HTMLElement) {
		super();
		this._editorViewDomNode = editorViewDomNode;
		this._globalPointerMoveMonitor = this._register(new GlobalPointerMoveMonitor());
		this._keydownListener = null;
	}

	public startMonitoring(
		initialElement: Element,
		pointerId: number,
		initialButtons: number,
		pointerMoveCallback: (e: EditorMouseEvent) => void,
		onStopCallback: (browserEvent?: PointerEvent | KeyboardEvent) => void
	): void {

		// Add a <<capture>> keydown event listener that will cancel the monitoring
		// if something other than a modifier key is pressed
		this._keydownListener = dom.addStandardDisposableListener(<any>initialElement.ownerDocument, 'keydown', (e) => {
			const chord = e.toKeyCodeChord();
			if (chord.isModifierKey()) {
				// Allow modifier keys
				return;
			}
			this._globalPointerMoveMonitor.stopMonitoring(true, e.browserEvent);
		}, true);

		this._globalPointerMoveMonitor.startMonitoring(
			initialElement,
			pointerId,
			initialButtons,
			(e) => {
				pointerMoveCallback(new EditorMouseEvent(e, true, this._editorViewDomNode));
			},
			(e) => {
				this._keydownListener!.dispose();
				onStopCallback(e);
			}
		);
	}

	public stopMonitoring(): void {
		this._globalPointerMoveMonitor.stopMonitoring(true);
	}
}


/**
 * A helper to create dynamic css rules, bound to a class name.
 * Rules are reused.
 * Reference counting and delayed garbage collection ensure that no rules leak.
*/
export class DynamicCssRules {
	private static _idPool = 0;
	private readonly _instanceId = ++DynamicCssRules._idPool;
	private _counter = 0;
	private readonly _rules = new Map<string, RefCountedCssRule>();

	// We delay garbage collection so that hanging rules can be reused.
	private readonly _garbageCollectionScheduler = new RunOnceScheduler(() => this.garbageCollect(), 1000);

	constructor(private readonly _editor: ICodeEditor) {
	}

	public createClassNameRef(options: CssProperties): ClassNameReference {
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

	private getOrCreateRule(properties: CssProperties): RefCountedCssRule {
		const key = this.computeUniqueKey(properties);
		let existingRule = this._rules.get(key);
		if (!existingRule) {
			const counter = this._counter++;
			existingRule = new RefCountedCssRule(key, `dyn-rule-${this._instanceId}-${counter}`,
				dom.isInShadowDOM(this._editor.getContainerDomNode())
					? this._editor.getContainerDomNode()
					: undefined,
				properties
			);
			this._rules.set(key, existingRule);
		}
		return existingRule;
	}

	private computeUniqueKey(properties: CssProperties): string {
		return JSON.stringify(properties);
	}

	private garbageCollect() {
		for (const rule of this._rules.values()) {
			if (!rule.hasReferences()) {
				this._rules.delete(rule.key);
				rule.dispose();
			}
		}
	}
}

export interface ClassNameReference extends IDisposable {
	className: string;
}

export interface CssProperties {
	border?: string;
	borderColor?: string | ThemeColor;
	borderRadius?: string;
	fontStyle?: string;
	fontWeight?: string;
	fontSize?: string;
	fontFamily?: string;
	unicodeBidi?: string;
	textDecoration?: string;
	color?: string | ThemeColor;
	backgroundColor?: string | ThemeColor;
	opacity?: string;
	verticalAlign?: string;
	cursor?: string;
	margin?: string;
	padding?: string;
	width?: string;
	height?: string;
	display?: string;
}

class RefCountedCssRule {
	private _referenceCount: number = 0;
	private _styleElement: HTMLStyleElement | undefined;
	private readonly _styleElementDisposables: DisposableStore;

	constructor(
		public readonly key: string,
		public readonly className: string,
		_containerElement: HTMLElement | undefined,
		public readonly properties: CssProperties,
	) {
		this._styleElementDisposables = new DisposableStore();
		this._styleElement = domStylesheetsJs.createStyleSheet(_containerElement, undefined, this._styleElementDisposables);
		this._styleElement.textContent = this.getCssText(this.className, this.properties);
	}

	private getCssText(className: string, properties: CssProperties): string {
		let str = `.${className} {`;
		for (const prop in properties) {
			const value = (properties as any)[prop] as string | ThemeColor;
			let cssValue;
			if (typeof value === 'object') {
				cssValue = asCssVariable(value.id);
			} else {
				cssValue = value;
			}

			const cssPropName = camelToDashes(prop);
			str += `\n\t${cssPropName}: ${cssValue};`;
		}
		str += `\n}`;
		return str;
	}

	public dispose(): void {
		this._styleElementDisposables.dispose();
		this._styleElement = undefined;
	}

	public increaseRefCount(): void {
		this._referenceCount++;
	}

	public decreaseRefCount(): void {
		this._referenceCount--;
	}

	public hasReferences(): boolean {
		return this._referenceCount > 0;
	}
}

function camelToDashes(str: string): string {
	return str.replace(/(^[A-Z])/, ([first]) => first.toLowerCase())
		.replace(/([A-Z])/g, ([letter]) => `-${letter.toLowerCase()}`);
}
