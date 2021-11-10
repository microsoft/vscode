/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { GlobalMouseMoveMonitor } from 'vs/base/browser/globalMouseMoveMonitor';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { RunOnceScheduler } from 'vs/base/common/async';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { asCssVariableName } from 'vs/platform/theme/common/colorRegistry';
import { ThemeColor } from 'vs/platform/theme/common/themeService';

/**
 * Coordinates relative to the whole document (e.g. mouse event's pageX and pageY)
 */
export class PageCoordinates {
	_pageCoordinatesBrand: void = undefined;

	constructor(
		public readonly x: number,
		public readonly y: number
	) { }

	public toClientCoordinates(): ClientCoordinates {
		return new ClientCoordinates(this.x - dom.StandardWindow.scrollX, this.y - dom.StandardWindow.scrollY);
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

	public toPageCoordinates(): PageCoordinates {
		return new PageCoordinates(this.clientX + dom.StandardWindow.scrollX, this.clientY + dom.StandardWindow.scrollY);
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

export function createEditorPagePosition(editorViewDomNode: HTMLElement): EditorPagePosition {
	const editorPos = dom.getDomNodePagePosition(editorViewDomNode);
	return new EditorPagePosition(editorPos.left, editorPos.top, editorPos.width, editorPos.height);
}

export class EditorMouseEvent extends StandardMouseEvent {
	_editorMouseEventBrand: void = undefined;

	/**
	 * Coordinates relative to the whole document.
	 */
	public readonly pos: PageCoordinates;

	/**
	 * Editor's coordinates relative to the whole document.
	 */
	public readonly editorPos: EditorPagePosition;

	constructor(e: MouseEvent, editorViewDomNode: HTMLElement) {
		super(e);
		this.pos = new PageCoordinates(this.posx, this.posy);
		this.editorPos = createEditorPagePosition(editorViewDomNode);
	}
}

export interface EditorMouseEventMerger {
	(lastEvent: EditorMouseEvent | null, currentEvent: EditorMouseEvent): EditorMouseEvent;
}

export class EditorMouseEventFactory {

	private readonly _editorViewDomNode: HTMLElement;

	constructor(editorViewDomNode: HTMLElement) {
		this._editorViewDomNode = editorViewDomNode;
	}

	private _create(e: MouseEvent): EditorMouseEvent {
		return new EditorMouseEvent(e, this._editorViewDomNode);
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
		return dom.addDisposableListener(target, 'mousedown', (e: MouseEvent) => {
			callback(this._create(e));
		});
	}

	public onMouseLeave(target: HTMLElement, callback: (e: EditorMouseEvent) => void): IDisposable {
		return dom.addDisposableNonBubblingMouseOutListener(target, (e: MouseEvent) => {
			callback(this._create(e));
		});
	}

	public onMouseMoveThrottled(target: HTMLElement, callback: (e: EditorMouseEvent) => void, merger: EditorMouseEventMerger, minimumTimeMs: number): IDisposable {
		const myMerger: dom.IEventMerger<EditorMouseEvent, MouseEvent> = (lastEvent: EditorMouseEvent | null, currentEvent: MouseEvent): EditorMouseEvent => {
			return merger(lastEvent, this._create(currentEvent));
		};
		return dom.addDisposableThrottledListener<EditorMouseEvent, MouseEvent>(target, 'mousemove', callback, myMerger, minimumTimeMs);
	}
}

export class EditorPointerEventFactory {

	private readonly _editorViewDomNode: HTMLElement;

	constructor(editorViewDomNode: HTMLElement) {
		this._editorViewDomNode = editorViewDomNode;
	}

	private _create(e: MouseEvent): EditorMouseEvent {
		return new EditorMouseEvent(e, this._editorViewDomNode);
	}

	public onPointerUp(target: HTMLElement, callback: (e: EditorMouseEvent) => void): IDisposable {
		return dom.addDisposableListener(target, 'pointerup', (e: MouseEvent) => {
			callback(this._create(e));
		});
	}

	public onPointerDown(target: HTMLElement, callback: (e: EditorMouseEvent) => void): IDisposable {
		return dom.addDisposableListener(target, 'pointerdown', (e: MouseEvent) => {
			callback(this._create(e));
		});
	}

	public onPointerLeave(target: HTMLElement, callback: (e: EditorMouseEvent) => void): IDisposable {
		return dom.addDisposableNonBubblingPointerOutListener(target, (e: MouseEvent) => {
			callback(this._create(e));
		});
	}

	public onPointerMoveThrottled(target: HTMLElement, callback: (e: EditorMouseEvent) => void, merger: EditorMouseEventMerger, minimumTimeMs: number): IDisposable {
		const myMerger: dom.IEventMerger<EditorMouseEvent, MouseEvent> = (lastEvent: EditorMouseEvent | null, currentEvent: MouseEvent): EditorMouseEvent => {
			return merger(lastEvent, this._create(currentEvent));
		};
		return dom.addDisposableThrottledListener<EditorMouseEvent, MouseEvent>(target, 'pointermove', callback, myMerger, minimumTimeMs);
	}
}

export class GlobalEditorMouseMoveMonitor extends Disposable {

	private readonly _editorViewDomNode: HTMLElement;
	private readonly _globalMouseMoveMonitor: GlobalMouseMoveMonitor<EditorMouseEvent>;
	private _keydownListener: IDisposable | null;

	constructor(editorViewDomNode: HTMLElement) {
		super();
		this._editorViewDomNode = editorViewDomNode;
		this._globalMouseMoveMonitor = this._register(new GlobalMouseMoveMonitor<EditorMouseEvent>());
		this._keydownListener = null;
	}

	public startMonitoring(
		initialElement: HTMLElement,
		initialButtons: number,
		merger: EditorMouseEventMerger,
		mouseMoveCallback: (e: EditorMouseEvent) => void,
		onStopCallback: (browserEvent?: MouseEvent | KeyboardEvent) => void
	): void {

		// Add a <<capture>> keydown event listener that will cancel the monitoring
		// if something other than a modifier key is pressed
		this._keydownListener = dom.addStandardDisposableListener(<any>document, 'keydown', (e) => {
			const kb = e.toKeybinding();
			if (kb.isModifierKey()) {
				// Allow modifier keys
				return;
			}
			this._globalMouseMoveMonitor.stopMonitoring(true, e.browserEvent);
		}, true);

		const myMerger: dom.IEventMerger<EditorMouseEvent, MouseEvent> = (lastEvent: EditorMouseEvent | null, currentEvent: MouseEvent): EditorMouseEvent => {
			return merger(lastEvent, new EditorMouseEvent(currentEvent, this._editorViewDomNode));
		};

		this._globalMouseMoveMonitor.startMonitoring(initialElement, initialButtons, myMerger, mouseMoveCallback, (e) => {
			this._keydownListener!.dispose();
			onStopCallback(e);
		});
	}

	public stopMonitoring(): void {
		this._globalMouseMoveMonitor.stopMonitoring(true);
	}
}


/**
 * A helper to create dynamic css rules, bound to a class name.
 * Rules are reused.
 * Reference counting and delayed garbage collection ensure that no rules leak.
*/
export class DynamicCssRules {
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
			existingRule = new RefCountedCssRule(key, `dyn-rule-${counter}`,
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
	textDecoration?: string;
	color?: string | ThemeColor;
	backgroundColor?: string | ThemeColor;
	opacity?: string;
	verticalAlign?: string;

	margin?: string;
	padding?: string;
	width?: string;
	height?: string;
}

class RefCountedCssRule {
	private _referenceCount: number = 0;
	private _styleElement: HTMLStyleElement;

	constructor(
		public readonly key: string,
		public readonly className: string,
		_containerElement: HTMLElement | undefined,
		public readonly properties: CssProperties,
	) {
		this._styleElement = dom.createStyleSheet(
			_containerElement
		);

		this._styleElement.textContent = this.getCssText(this.className, this.properties);
	}

	private getCssText(className: string, properties: CssProperties): string {
		let str = `.${className} {`;
		for (const prop in properties) {
			const value = (properties as any)[prop] as string | ThemeColor;
			let cssValue;
			if (typeof value === 'object') {
				cssValue = `var(${asCssVariableName(value.id)})`;
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
		this._styleElement.remove();
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
