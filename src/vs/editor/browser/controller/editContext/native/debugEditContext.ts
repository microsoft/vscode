/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const COLOR_FOR_CONTROL_BOUNDS = 'blue';
const COLOR_FOR_SELECTION_BOUNDS = 'red';
const COLOR_FOR_CHARACTER_BOUNDS = 'green';

export class DebugEditContext extends EditContext {
	private _isDebugging = true;
	private _controlBounds: DOMRect | null = null;
	private _selectionBounds: DOMRect | null = null;
	private _characterBounds: { rangeStart: number; characterBounds: DOMRect[] } | null = null;

	constructor(options?: EditContextInit | undefined) {
		super(options);
	}

	override updateText(rangeStart: number, rangeEnd: number, text: string): void {
		super.updateText(rangeStart, rangeEnd, text);
		this.renderDebug();
	}
	override updateSelection(start: number, end: number): void {
		super.updateSelection(start, end);
		this.renderDebug();
	}
	override updateControlBounds(controlBounds: DOMRect): void {
		super.updateControlBounds(controlBounds);
		this._controlBounds = controlBounds;
		this.renderDebug();
	}
	override updateSelectionBounds(selectionBounds: DOMRect): void {
		super.updateSelectionBounds(selectionBounds);
		this._selectionBounds = selectionBounds;
		this.renderDebug();
	}
	override updateCharacterBounds(rangeStart: number, characterBounds: DOMRect[]): void {
		super.updateCharacterBounds(rangeStart, characterBounds);
		this._characterBounds = { rangeStart, characterBounds };
		this.renderDebug();
	}
	override attachedElements(): HTMLElement[] {
		return super.attachedElements();
	}

	override characterBounds(): DOMRect[] {
		return super.characterBounds();
	}

	private readonly _ontextupdateWrapper = new EventListenerWrapper('textupdate', this);
	private readonly _ontextformatupdateWrapper = new EventListenerWrapper('textformatupdate', this);
	private readonly _oncharacterboundsupdateWrapper = new EventListenerWrapper('characterboundsupdate', this);
	private readonly _oncompositionstartWrapper = new EventListenerWrapper('compositionstart', this);
	private readonly _oncompositionendWrapper = new EventListenerWrapper('compositionend', this);

	override get ontextupdate(): EventHandler | null { return this._ontextupdateWrapper.eventHandler; }
	override set ontextupdate(value: EventHandler | null) { this._ontextupdateWrapper.eventHandler = value; }
	override get ontextformatupdate(): EventHandler | null { return this._ontextformatupdateWrapper.eventHandler; }
	override set ontextformatupdate(value: EventHandler | null) { this._ontextformatupdateWrapper.eventHandler = value; }
	override get oncharacterboundsupdate(): EventHandler | null { return this._oncharacterboundsupdateWrapper.eventHandler; }
	override set oncharacterboundsupdate(value: EventHandler | null) { this._oncharacterboundsupdateWrapper.eventHandler = value; }
	override get oncompositionstart(): EventHandler | null { return this._oncompositionstartWrapper.eventHandler; }
	override set oncompositionstart(value: EventHandler | null) { this._oncompositionstartWrapper.eventHandler = value; }
	override get oncompositionend(): EventHandler | null { return this._oncompositionendWrapper.eventHandler; }
	override set oncompositionend(value: EventHandler | null) { this._oncompositionendWrapper.eventHandler = value; }


	private readonly _listenerMap = new Map<EventListenerOrEventListenerObject, EventListenerOrEventListenerObject>();

	override addEventListener<K extends keyof EditContextEventHandlersEventMap>(type: K, listener: (this: GlobalEventHandlers, ev: EditContextEventHandlersEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void;
	override addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void {
		if (!listener) { return; }

		const debugListener = (event: Event) => {
			if (this._isDebugging) {
				this.renderDebug();
				console.log(`DebugEditContex.on_${type}`, event);
			}
			if (typeof listener === 'function') {
				listener.call(this, event);
			} else if (typeof listener === 'object' && 'handleEvent' in listener) {
				listener.handleEvent(event);
			}
		};
		this._listenerMap.set(listener, debugListener);
		super.addEventListener(type, debugListener, options);
		this.renderDebug();
	}

	override removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions | undefined): void {
		if (!listener) { return; }
		const debugListener = this._listenerMap.get(listener);
		if (debugListener) {
			super.removeEventListener(type, debugListener, options);
			this._listenerMap.delete(listener);
		}
		this.renderDebug();
	}

	override dispatchEvent(event: Event): boolean {
		return super.dispatchEvent(event);
	}

	public startDebugging() {
		this._isDebugging = true;
		this.renderDebug();
	}

	public endDebugging() {
		this._isDebugging = false;
		this.renderDebug();
	}

	private _disposables: { dispose(): void }[] = [];

	public renderDebug() {
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
		this._disposables.push(createDiv(this.text, this.selectionStart, this.selectionEnd));
	}
}

function createDiv(text: string, selectionStart: number, selectionEnd: number) {
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

function createRect(rect: DOMRect, color: 'green' | 'blue' | 'red') {
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
	private _eventHandler: EventHandler | null = null;

	constructor(
		private readonly _eventType: string,
		private readonly _target: EventTarget,
	) {
	}

	get eventHandler(): EventHandler | null {
		return this._eventHandler;
	}

	set eventHandler(value: EventHandler | null) {
		if (this._eventHandler) {
			this._target.removeEventListener(this._eventType, this._eventHandler);
		}
		this._eventHandler = value;
		if (value) {
			this._target.addEventListener(this._eventType, value);
		}
	}
}
