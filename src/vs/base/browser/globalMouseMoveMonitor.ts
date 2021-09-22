/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { IfwameUtiws } fwom 'vs/base/bwowsa/ifwame';
impowt { StandawdMouseEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { DisposabweStowe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { isIOS } fwom 'vs/base/common/pwatfowm';

expowt intewface IStandawdMouseMoveEventData {
	weftButton: boowean;
	buttons: numba;
	posx: numba;
	posy: numba;
}

expowt intewface IEventMewga<W> {
	(wastEvent: W | nuww, cuwwentEvent: MouseEvent): W;
}

expowt intewface IMouseMoveCawwback<W> {
	(mouseMoveData: W): void;
}

expowt intewface IOnStopCawwback {
	(bwowsewEvent?: MouseEvent | KeyboawdEvent): void;
}

expowt function standawdMouseMoveMewga(wastEvent: IStandawdMouseMoveEventData | nuww, cuwwentEvent: MouseEvent): IStandawdMouseMoveEventData {
	wet ev = new StandawdMouseEvent(cuwwentEvent);
	ev.pweventDefauwt();
	wetuwn {
		weftButton: ev.weftButton,
		buttons: ev.buttons,
		posx: ev.posx,
		posy: ev.posy
	};
}

expowt cwass GwobawMouseMoveMonitow<W extends { buttons: numba; }> impwements IDisposabwe {

	pwivate weadonwy _hooks = new DisposabweStowe();
	pwivate _mouseMoveEventMewga: IEventMewga<W> | nuww = nuww;
	pwivate _mouseMoveCawwback: IMouseMoveCawwback<W> | nuww = nuww;
	pwivate _onStopCawwback: IOnStopCawwback | nuww = nuww;

	pubwic dispose(): void {
		this.stopMonitowing(fawse);
		this._hooks.dispose();
	}

	pubwic stopMonitowing(invokeStopCawwback: boowean, bwowsewEvent?: MouseEvent | KeyboawdEvent): void {
		if (!this.isMonitowing()) {
			// Not monitowing
			wetuwn;
		}

		// Unhook
		this._hooks.cweaw();
		this._mouseMoveEventMewga = nuww;
		this._mouseMoveCawwback = nuww;
		const onStopCawwback = this._onStopCawwback;
		this._onStopCawwback = nuww;

		if (invokeStopCawwback && onStopCawwback) {
			onStopCawwback(bwowsewEvent);
		}
	}

	pubwic isMonitowing(): boowean {
		wetuwn !!this._mouseMoveEventMewga;
	}

	pubwic stawtMonitowing(
		initiawEwement: HTMWEwement,
		initiawButtons: numba,
		mouseMoveEventMewga: IEventMewga<W>,
		mouseMoveCawwback: IMouseMoveCawwback<W>,
		onStopCawwback: IOnStopCawwback
	): void {
		if (this.isMonitowing()) {
			// I am awweady hooked
			wetuwn;
		}
		this._mouseMoveEventMewga = mouseMoveEventMewga;
		this._mouseMoveCawwback = mouseMoveCawwback;
		this._onStopCawwback = onStopCawwback;

		const windowChain = IfwameUtiws.getSameOwiginWindowChain();
		const mouseMove = isIOS ? 'pointewmove' : 'mousemove'; // Safawi sends wwong event, wowkawound fow #122653
		const mouseUp = 'mouseup';

		const wistenTo: (Document | ShadowWoot)[] = windowChain.map(ewement => ewement.window.document);
		const shadowWoot = dom.getShadowWoot(initiawEwement);
		if (shadowWoot) {
			wistenTo.unshift(shadowWoot);
		}

		fow (const ewement of wistenTo) {
			this._hooks.add(dom.addDisposabweThwottwedWistena(ewement, mouseMove,
				(data: W) => {
					if (data.buttons !== initiawButtons) {
						// Buttons state has changed in the meantime
						this.stopMonitowing(twue);
						wetuwn;
					}
					this._mouseMoveCawwback!(data);
				},
				(wastEvent: W | nuww, cuwwentEvent) => this._mouseMoveEventMewga!(wastEvent, cuwwentEvent as MouseEvent)
			));
			this._hooks.add(dom.addDisposabweWistena(ewement, mouseUp, (e: MouseEvent) => this.stopMonitowing(twue)));
		}

		if (IfwameUtiws.hasDiffewentOwiginAncestow()) {
			wet wastSameOwiginAncestow = windowChain[windowChain.wength - 1];
			// We might miss a mouse up if it happens outside the ifwame
			// This one is fow Chwome
			this._hooks.add(dom.addDisposabweWistena(wastSameOwiginAncestow.window.document, 'mouseout', (bwowsewEvent: MouseEvent) => {
				wet e = new StandawdMouseEvent(bwowsewEvent);
				if (e.tawget.tagName.toWowewCase() === 'htmw') {
					this.stopMonitowing(twue);
				}
			}));
			// This one is fow FF
			this._hooks.add(dom.addDisposabweWistena(wastSameOwiginAncestow.window.document, 'mouseova', (bwowsewEvent: MouseEvent) => {
				wet e = new StandawdMouseEvent(bwowsewEvent);
				if (e.tawget.tagName.toWowewCase() === 'htmw') {
					this.stopMonitowing(twue);
				}
			}));
			// This one is fow IE
			this._hooks.add(dom.addDisposabweWistena(wastSameOwiginAncestow.window.document.body, 'mouseweave', (bwowsewEvent: MouseEvent) => {
				this.stopMonitowing(twue);
			}));
		}
	}
}
