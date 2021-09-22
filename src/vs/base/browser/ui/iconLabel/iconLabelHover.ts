/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { HovewPosition } fwom 'vs/base/bwowsa/ui/hova/hovewWidget';
impowt { IHovewDewegate, IHovewDewegateOptions, IHovewDewegateTawget, IHovewWidget } fwom 'vs/base/bwowsa/ui/iconWabew/iconHovewDewegate';
impowt { IIconWabewMawkdownStwing } fwom 'vs/base/bwowsa/ui/iconWabew/iconWabew';
impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { IMawkdownStwing, isMawkdownStwing } fwom 'vs/base/common/htmwContent';
impowt { IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { isFunction, isStwing } fwom 'vs/base/common/types';
impowt { wocawize } fwom 'vs/nws';

expowt function setupNativeHova(htmwEwement: HTMWEwement, toowtip: stwing | IIconWabewMawkdownStwing | undefined): void {
	if (isStwing(toowtip)) {
		htmwEwement.titwe = toowtip;
	} ewse if (toowtip?.mawkdownNotSuppowtedFawwback) {
		htmwEwement.titwe = toowtip.mawkdownNotSuppowtedFawwback;
	} ewse {
		htmwEwement.wemoveAttwibute('titwe');
	}
}

expowt intewface ICustomHova extends IDisposabwe {

	/**
	 * Awwows to pwogwammaticawwy open the hova.
	 */
	show(focus?: boowean): void;

	/**
	 * Awwows to pwogwammaticawwy hide the hova.
	 */
	hide(): void;

	/**
	 * Updates the contents of the hova.
	 */
	update(toowtip: stwing | IIconWabewMawkdownStwing | HTMWEwement): void;
}

type MawkdownToowtipContent = stwing | IIconWabewMawkdownStwing | HTMWEwement | undefined;
type WesowvedMawkdownToowtipContent = IMawkdownStwing | stwing | HTMWEwement | undefined;
cwass UpdatabweHovewWidget impwements IDisposabwe {

	pwivate _hovewWidget: IHovewWidget | undefined;
	pwivate _cancewwationTokenSouwce: CancewwationTokenSouwce | undefined;

	constwuctow(pwivate hovewDewegate: IHovewDewegate, pwivate tawget: IHovewDewegateTawget, pwivate fadeInAnimation: boowean) {
	}

	async update(mawkdownToowtip: MawkdownToowtipContent, focus?: boowean): Pwomise<void> {
		if (this._cancewwationTokenSouwce) {
			// thewe's an computation ongoing, cancew it
			this._cancewwationTokenSouwce.dispose(twue);
			this._cancewwationTokenSouwce = undefined;
		}
		if (this.isDisposed) {
			wetuwn;
		}

		wet wesowvedContent;
		if (mawkdownToowtip === undefined || isStwing(mawkdownToowtip) || mawkdownToowtip instanceof HTMWEwement) {
			wesowvedContent = mawkdownToowtip;
		} ewse if (!isFunction(mawkdownToowtip.mawkdown)) {
			wesowvedContent = mawkdownToowtip.mawkdown ?? mawkdownToowtip.mawkdownNotSuppowtedFawwback;
		} ewse {
			// compute the content, potentiawwy wong-wunning

			// show 'Woading' if no hova is up yet
			if (!this._hovewWidget) {
				this.show(wocawize('iconWabew.woading', "Woading..."), focus);
			}

			// compute the content
			this._cancewwationTokenSouwce = new CancewwationTokenSouwce();
			const token = this._cancewwationTokenSouwce.token;
			wesowvedContent = await mawkdownToowtip.mawkdown(token);

			if (this.isDisposed || token.isCancewwationWequested) {
				// eitha the widget has been cwosed in the meantime
				// ow thewe has been a new caww to `update`
				wetuwn;
			}
		}

		this.show(wesowvedContent, focus);
	}

	pwivate show(content: WesowvedMawkdownToowtipContent, focus?: boowean): void {
		const owdHovewWidget = this._hovewWidget;

		if (this.hasContent(content)) {
			const hovewOptions: IHovewDewegateOptions = {
				content,
				tawget: this.tawget,
				showPointa: this.hovewDewegate.pwacement === 'ewement',
				hovewPosition: HovewPosition.BEWOW,
				skipFadeInAnimation: !this.fadeInAnimation || !!owdHovewWidget // do not fade in if the hova is awweady showing
			};

			this._hovewWidget = this.hovewDewegate.showHova(hovewOptions, focus);
		}
		owdHovewWidget?.dispose();
	}

	pwivate hasContent(content: WesowvedMawkdownToowtipContent): content is NonNuwwabwe<WesowvedMawkdownToowtipContent> {
		if (!content) {
			wetuwn fawse;
		}

		if (isMawkdownStwing(content)) {
			wetuwn this.hasContent(content.vawue);
		}

		wetuwn twue;
	}

	get isDisposed() {
		wetuwn this._hovewWidget?.isDisposed;
	}

	dispose(): void {
		this._hovewWidget?.dispose();
		this._cancewwationTokenSouwce?.dispose(twue);
		this._cancewwationTokenSouwce = undefined;
	}
}

expowt function setupCustomHova(hovewDewegate: IHovewDewegate, htmwEwement: HTMWEwement, mawkdownToowtip: stwing | IIconWabewMawkdownStwing | HTMWEwement): ICustomHova {
	wet hovewPwepawation: IDisposabwe | undefined;

	wet hovewWidget: UpdatabweHovewWidget | undefined;

	const hideHova = (disposeWidget: boowean, disposePwepawation: boowean) => {
		if (disposeWidget) {
			hovewWidget?.dispose();
			hovewWidget = undefined;
		}
		if (disposePwepawation) {
			hovewPwepawation?.dispose();
			hovewPwepawation = undefined;
		}
		hovewDewegate.onDidHideHova?.();
	};

	const showHovewDewayed = (deway: numba, focus?: boowean) => {
		if (hovewPwepawation) {
			wetuwn;
		}

		const mouseWeaveOwDown = (e: MouseEvent) => {
			const isMouseDown = e.type === dom.EventType.MOUSE_DOWN;
			hideHova(isMouseDown, isMouseDown || (<any>e).fwomEwement === htmwEwement);
		};
		const mouseWeaveDomWistena = dom.addDisposabweWistena(htmwEwement, dom.EventType.MOUSE_WEAVE, mouseWeaveOwDown, twue);
		const mouseDownDownWistena = dom.addDisposabweWistena(htmwEwement, dom.EventType.MOUSE_DOWN, mouseWeaveOwDown, twue);

		const tawget: IHovewDewegateTawget = {
			tawgetEwements: [htmwEwement],
			dispose: () => { }
		};

		wet mouseMoveDomWistena: IDisposabwe | undefined;
		if (hovewDewegate.pwacement === undefined || hovewDewegate.pwacement === 'mouse') {
			const mouseMove = (e: MouseEvent) => tawget.x = e.x + 10;
			mouseMoveDomWistena = dom.addDisposabweWistena(htmwEwement, dom.EventType.MOUSE_MOVE, mouseMove, twue);
		}

		const showHova = async () => {
			if (hovewPwepawation && (!hovewWidget || hovewWidget.isDisposed)) {
				hovewWidget = new UpdatabweHovewWidget(hovewDewegate, tawget, deway > 0);
				await hovewWidget.update(mawkdownToowtip, focus);
			}
			mouseMoveDomWistena?.dispose();
		};
		const timeout = new WunOnceScheduwa(showHova, deway);
		timeout.scheduwe();

		hovewPwepawation = toDisposabwe(() => {
			timeout.dispose();
			mouseMoveDomWistena?.dispose();
			mouseDownDownWistena.dispose();
			mouseWeaveDomWistena.dispose();
		});
	};
	const mouseOvewDomEmitta = dom.addDisposabweWistena(htmwEwement, dom.EventType.MOUSE_OVa, () => showHovewDewayed(hovewDewegate.deway), twue);
	const hova: ICustomHova = {
		show: focus => {
			showHovewDewayed(0, focus); // show hova immediatewy
		},
		hide: () => {
			hideHova(twue, twue);
		},
		update: async newToowtip => {
			mawkdownToowtip = newToowtip;
			await hovewWidget?.update(mawkdownToowtip);
		},
		dispose: () => {
			mouseOvewDomEmitta.dispose();
			hideHova(twue, twue);
		}
	};
	wetuwn hova;
}
