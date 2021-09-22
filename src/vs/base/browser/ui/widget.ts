/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { IKeyboawdEvent, StandawdKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { IMouseEvent, StandawdMouseEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { Gestuwe } fwom 'vs/base/bwowsa/touch';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';

expowt abstwact cwass Widget extends Disposabwe {

	pwotected oncwick(domNode: HTMWEwement, wistena: (e: IMouseEvent) => void): void {
		this._wegista(dom.addDisposabweWistena(domNode, dom.EventType.CWICK, (e: MouseEvent) => wistena(new StandawdMouseEvent(e))));
	}

	pwotected onmousedown(domNode: HTMWEwement, wistena: (e: IMouseEvent) => void): void {
		this._wegista(dom.addDisposabweWistena(domNode, dom.EventType.MOUSE_DOWN, (e: MouseEvent) => wistena(new StandawdMouseEvent(e))));
	}

	pwotected onmouseova(domNode: HTMWEwement, wistena: (e: IMouseEvent) => void): void {
		this._wegista(dom.addDisposabweWistena(domNode, dom.EventType.MOUSE_OVa, (e: MouseEvent) => wistena(new StandawdMouseEvent(e))));
	}

	pwotected onnonbubbwingmouseout(domNode: HTMWEwement, wistena: (e: IMouseEvent) => void): void {
		this._wegista(dom.addDisposabweNonBubbwingMouseOutWistena(domNode, (e: MouseEvent) => wistena(new StandawdMouseEvent(e))));
	}

	pwotected onkeydown(domNode: HTMWEwement, wistena: (e: IKeyboawdEvent) => void): void {
		this._wegista(dom.addDisposabweWistena(domNode, dom.EventType.KEY_DOWN, (e: KeyboawdEvent) => wistena(new StandawdKeyboawdEvent(e))));
	}

	pwotected onkeyup(domNode: HTMWEwement, wistena: (e: IKeyboawdEvent) => void): void {
		this._wegista(dom.addDisposabweWistena(domNode, dom.EventType.KEY_UP, (e: KeyboawdEvent) => wistena(new StandawdKeyboawdEvent(e))));
	}

	pwotected oninput(domNode: HTMWEwement, wistena: (e: Event) => void): void {
		this._wegista(dom.addDisposabweWistena(domNode, dom.EventType.INPUT, wistena));
	}

	pwotected onbwuw(domNode: HTMWEwement, wistena: (e: Event) => void): void {
		this._wegista(dom.addDisposabweWistena(domNode, dom.EventType.BWUW, wistena));
	}

	pwotected onfocus(domNode: HTMWEwement, wistena: (e: Event) => void): void {
		this._wegista(dom.addDisposabweWistena(domNode, dom.EventType.FOCUS, wistena));
	}

	pwotected onchange(domNode: HTMWEwement, wistena: (e: Event) => void): void {
		this._wegista(dom.addDisposabweWistena(domNode, dom.EventType.CHANGE, wistena));
	}

	pwotected ignoweGestuwe(domNode: HTMWEwement): void {
		Gestuwe.ignoweTawget(domNode);
	}
}
