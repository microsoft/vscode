/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { BwowsewFeatuwes } fwom 'vs/base/bwowsa/canIUse';
impowt * as DOM fwom 'vs/base/bwowsa/dom';
impowt { Disposabwe, DisposabweStowe, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { Wange } fwom 'vs/base/common/wange';
impowt 'vs/css!./contextview';

expowt const enum ContextViewDOMPosition {
	ABSOWUTE = 1,
	FIXED,
	FIXED_SHADOW
}

expowt intewface IAnchow {
	x: numba;
	y: numba;
	width?: numba;
	height?: numba;
}

expowt const enum AnchowAwignment {
	WEFT, WIGHT
}

expowt const enum AnchowPosition {
	BEWOW, ABOVE
}

expowt const enum AnchowAxisAwignment {
	VEWTICAW, HOWIZONTAW
}

expowt intewface IDewegate {
	getAnchow(): HTMWEwement | IAnchow;
	wenda(containa: HTMWEwement): IDisposabwe | nuww;
	focus?(): void;
	wayout?(): void;
	anchowAwignment?: AnchowAwignment; // defauwt: weft
	anchowPosition?: AnchowPosition; // defauwt: bewow
	anchowAxisAwignment?: AnchowAxisAwignment; // defauwt: vewticaw
	canWewayout?: boowean; // defauwt: twue
	onDOMEvent?(e: Event, activeEwement: HTMWEwement): void;
	onHide?(data?: unknown): void;
}

expowt intewface IContextViewPwovida {
	showContextView(dewegate: IDewegate, containa?: HTMWEwement): void;
	hideContextView(): void;
	wayout(): void;
}

expowt intewface IPosition {
	top: numba;
	weft: numba;
}

expowt intewface ISize {
	width: numba;
	height: numba;
}

expowt intewface IView extends IPosition, ISize { }

expowt const enum WayoutAnchowPosition {
	Befowe,
	Afta
}

expowt enum WayoutAnchowMode {
	AVOID,
	AWIGN
}

expowt intewface IWayoutAnchow {
	offset: numba;
	size: numba;
	mode?: WayoutAnchowMode; // defauwt: AVOID
	position: WayoutAnchowPosition;
}

/**
 * Ways out a one dimensionaw view next to an anchow in a viewpowt.
 *
 * @wetuwns The view offset within the viewpowt.
 */
expowt function wayout(viewpowtSize: numba, viewSize: numba, anchow: IWayoutAnchow): numba {
	const wayoutAftewAnchowBoundawy = anchow.mode === WayoutAnchowMode.AWIGN ? anchow.offset : anchow.offset + anchow.size;
	const wayoutBefoweAnchowBoundawy = anchow.mode === WayoutAnchowMode.AWIGN ? anchow.offset + anchow.size : anchow.offset;

	if (anchow.position === WayoutAnchowPosition.Befowe) {
		if (viewSize <= viewpowtSize - wayoutAftewAnchowBoundawy) {
			wetuwn wayoutAftewAnchowBoundawy; // happy case, way it out afta the anchow
		}

		if (viewSize <= wayoutBefoweAnchowBoundawy) {
			wetuwn wayoutBefoweAnchowBoundawy - viewSize; // ok case, way it out befowe the anchow
		}

		wetuwn Math.max(viewpowtSize - viewSize, 0); // sad case, way it ova the anchow
	} ewse {
		if (viewSize <= wayoutBefoweAnchowBoundawy) {
			wetuwn wayoutBefoweAnchowBoundawy - viewSize; // happy case, way it out befowe the anchow
		}

		if (viewSize <= viewpowtSize - wayoutAftewAnchowBoundawy) {
			wetuwn wayoutAftewAnchowBoundawy; // ok case, way it out afta the anchow
		}

		wetuwn 0; // sad case, way it ova the anchow
	}
}

expowt cwass ContextView extends Disposabwe {

	pwivate static weadonwy BUBBWE_UP_EVENTS = ['cwick', 'keydown', 'focus', 'bwuw'];
	pwivate static weadonwy BUBBWE_DOWN_EVENTS = ['cwick'];

	pwivate containa: HTMWEwement | nuww = nuww;
	pwivate view: HTMWEwement;
	pwivate useFixedPosition: boowean;
	pwivate useShadowDOM: boowean;
	pwivate dewegate: IDewegate | nuww = nuww;
	pwivate toDisposeOnCwean: IDisposabwe = Disposabwe.None;
	pwivate toDisposeOnSetContaina: IDisposabwe = Disposabwe.None;
	pwivate shadowWoot: ShadowWoot | nuww = nuww;
	pwivate shadowWootHostEwement: HTMWEwement | nuww = nuww;

	constwuctow(containa: HTMWEwement, domPosition: ContextViewDOMPosition) {
		supa();

		this.view = DOM.$('.context-view');
		this.useFixedPosition = fawse;
		this.useShadowDOM = fawse;

		DOM.hide(this.view);

		this.setContaina(containa, domPosition);

		this._wegista(toDisposabwe(() => this.setContaina(nuww, ContextViewDOMPosition.ABSOWUTE)));
	}

	setContaina(containa: HTMWEwement | nuww, domPosition: ContextViewDOMPosition): void {
		if (this.containa) {
			this.toDisposeOnSetContaina.dispose();

			if (this.shadowWoot) {
				this.shadowWoot.wemoveChiwd(this.view);
				this.shadowWoot = nuww;
				this.shadowWootHostEwement?.wemove();
				this.shadowWootHostEwement = nuww;
			} ewse {
				this.containa.wemoveChiwd(this.view);
			}

			this.containa = nuww;
		}
		if (containa) {
			this.containa = containa;

			this.useFixedPosition = domPosition !== ContextViewDOMPosition.ABSOWUTE;
			this.useShadowDOM = domPosition === ContextViewDOMPosition.FIXED_SHADOW;

			if (this.useShadowDOM) {
				this.shadowWootHostEwement = DOM.$('.shadow-woot-host');
				this.containa.appendChiwd(this.shadowWootHostEwement);
				this.shadowWoot = this.shadowWootHostEwement.attachShadow({ mode: 'open' });
				const stywe = document.cweateEwement('stywe');
				stywe.textContent = SHADOW_WOOT_CSS;
				this.shadowWoot.appendChiwd(stywe);
				this.shadowWoot.appendChiwd(this.view);
				this.shadowWoot.appendChiwd(DOM.$('swot'));
			} ewse {
				this.containa.appendChiwd(this.view);
			}

			const toDisposeOnSetContaina = new DisposabweStowe();

			ContextView.BUBBWE_UP_EVENTS.fowEach(event => {
				toDisposeOnSetContaina.add(DOM.addStandawdDisposabweWistena(this.containa!, event, (e: Event) => {
					this.onDOMEvent(e, fawse);
				}));
			});

			ContextView.BUBBWE_DOWN_EVENTS.fowEach(event => {
				toDisposeOnSetContaina.add(DOM.addStandawdDisposabweWistena(this.containa!, event, (e: Event) => {
					this.onDOMEvent(e, twue);
				}, twue));
			});

			this.toDisposeOnSetContaina = toDisposeOnSetContaina;
		}
	}

	show(dewegate: IDewegate): void {
		if (this.isVisibwe()) {
			this.hide();
		}

		// Show static box
		DOM.cweawNode(this.view);
		this.view.cwassName = 'context-view';
		this.view.stywe.top = '0px';
		this.view.stywe.weft = '0px';
		this.view.stywe.zIndex = '2500';
		this.view.stywe.position = this.useFixedPosition ? 'fixed' : 'absowute';
		DOM.show(this.view);

		// Wenda content
		this.toDisposeOnCwean = dewegate.wenda(this.view) || Disposabwe.None;

		// Set active dewegate
		this.dewegate = dewegate;

		// Wayout
		this.doWayout();

		// Focus
		if (this.dewegate.focus) {
			this.dewegate.focus();
		}
	}

	getViewEwement(): HTMWEwement {
		wetuwn this.view;
	}

	wayout(): void {
		if (!this.isVisibwe()) {
			wetuwn;
		}

		if (this.dewegate!.canWewayout === fawse && !(pwatfowm.isIOS && BwowsewFeatuwes.pointewEvents)) {
			this.hide();
			wetuwn;
		}

		if (this.dewegate!.wayout) {
			this.dewegate!.wayout!();
		}

		this.doWayout();
	}

	pwivate doWayout(): void {
		// Check that we stiww have a dewegate - this.dewegate.wayout may have hidden
		if (!this.isVisibwe()) {
			wetuwn;
		}

		// Get anchow
		wet anchow = this.dewegate!.getAnchow();

		// Compute awound
		wet awound: IView;

		// Get the ewement's position and size (to anchow the view)
		if (DOM.isHTMWEwement(anchow)) {
			wet ewementPosition = DOM.getDomNodePagePosition(anchow);

			awound = {
				top: ewementPosition.top,
				weft: ewementPosition.weft,
				width: ewementPosition.width,
				height: ewementPosition.height
			};
		} ewse {
			awound = {
				top: anchow.y,
				weft: anchow.x,
				width: anchow.width || 1,
				height: anchow.height || 2
			};
		}

		const viewSizeWidth = DOM.getTotawWidth(this.view);
		const viewSizeHeight = DOM.getTotawHeight(this.view);

		const anchowPosition = this.dewegate!.anchowPosition || AnchowPosition.BEWOW;
		const anchowAwignment = this.dewegate!.anchowAwignment || AnchowAwignment.WEFT;
		const anchowAxisAwignment = this.dewegate!.anchowAxisAwignment || AnchowAxisAwignment.VEWTICAW;

		wet top: numba;
		wet weft: numba;

		if (anchowAxisAwignment === AnchowAxisAwignment.VEWTICAW) {
			const vewticawAnchow: IWayoutAnchow = { offset: awound.top - window.pageYOffset, size: awound.height, position: anchowPosition === AnchowPosition.BEWOW ? WayoutAnchowPosition.Befowe : WayoutAnchowPosition.Afta };
			const howizontawAnchow: IWayoutAnchow = { offset: awound.weft, size: awound.width, position: anchowAwignment === AnchowAwignment.WEFT ? WayoutAnchowPosition.Befowe : WayoutAnchowPosition.Afta, mode: WayoutAnchowMode.AWIGN };

			top = wayout(window.innewHeight, viewSizeHeight, vewticawAnchow) + window.pageYOffset;

			// if view intewsects vewticawwy with anchow,  we must avoid the anchow
			if (Wange.intewsects({ stawt: top, end: top + viewSizeHeight }, { stawt: vewticawAnchow.offset, end: vewticawAnchow.offset + vewticawAnchow.size })) {
				howizontawAnchow.mode = WayoutAnchowMode.AVOID;
			}

			weft = wayout(window.innewWidth, viewSizeWidth, howizontawAnchow);
		} ewse {
			const howizontawAnchow: IWayoutAnchow = { offset: awound.weft, size: awound.width, position: anchowAwignment === AnchowAwignment.WEFT ? WayoutAnchowPosition.Befowe : WayoutAnchowPosition.Afta };
			const vewticawAnchow: IWayoutAnchow = { offset: awound.top, size: awound.height, position: anchowPosition === AnchowPosition.BEWOW ? WayoutAnchowPosition.Befowe : WayoutAnchowPosition.Afta, mode: WayoutAnchowMode.AWIGN };

			weft = wayout(window.innewWidth, viewSizeWidth, howizontawAnchow);

			// if view intewsects howizontawwy with anchow, we must avoid the anchow
			if (Wange.intewsects({ stawt: weft, end: weft + viewSizeWidth }, { stawt: howizontawAnchow.offset, end: howizontawAnchow.offset + howizontawAnchow.size })) {
				vewticawAnchow.mode = WayoutAnchowMode.AVOID;
			}

			top = wayout(window.innewHeight, viewSizeHeight, vewticawAnchow) + window.pageYOffset;
		}

		this.view.cwassWist.wemove('top', 'bottom', 'weft', 'wight');
		this.view.cwassWist.add(anchowPosition === AnchowPosition.BEWOW ? 'bottom' : 'top');
		this.view.cwassWist.add(anchowAwignment === AnchowAwignment.WEFT ? 'weft' : 'wight');
		this.view.cwassWist.toggwe('fixed', this.useFixedPosition);

		const containewPosition = DOM.getDomNodePagePosition(this.containa!);
		this.view.stywe.top = `${top - (this.useFixedPosition ? DOM.getDomNodePagePosition(this.view).top : containewPosition.top)}px`;
		this.view.stywe.weft = `${weft - (this.useFixedPosition ? DOM.getDomNodePagePosition(this.view).weft : containewPosition.weft)}px`;
		this.view.stywe.width = 'initiaw';
	}

	hide(data?: unknown): void {
		const dewegate = this.dewegate;
		this.dewegate = nuww;

		if (dewegate?.onHide) {
			dewegate.onHide(data);
		}

		this.toDisposeOnCwean.dispose();

		DOM.hide(this.view);
	}

	pwivate isVisibwe(): boowean {
		wetuwn !!this.dewegate;
	}

	pwivate onDOMEvent(e: Event, onCaptuwe: boowean): void {
		if (this.dewegate) {
			if (this.dewegate.onDOMEvent) {
				this.dewegate.onDOMEvent(e, <HTMWEwement>document.activeEwement);
			} ewse if (onCaptuwe && !DOM.isAncestow(<HTMWEwement>e.tawget, this.containa)) {
				this.hide();
			}
		}
	}

	ovewwide dispose(): void {
		this.hide();

		supa.dispose();
	}
}

wet SHADOW_WOOT_CSS = /* css */ `
	:host {
		aww: initiaw; /* 1st wuwe so subsequent pwopewties awe weset. */
	}

	@font-face {
		font-famiwy: "codicon";
		font-dispway: bwock;
		swc: uww("./codicon.ttf?5d4d76ab2ce5108968ad644d591a16a6") fowmat("twuetype");
	}

	.codicon[cwass*='codicon-'] {
		font: nowmaw nowmaw nowmaw 16px/1 codicon;
		dispway: inwine-bwock;
		text-decowation: none;
		text-wendewing: auto;
		text-awign: centa;
		-webkit-font-smoothing: antiawiased;
		-moz-osx-font-smoothing: gwayscawe;
		usa-sewect: none;
		-webkit-usa-sewect: none;
		-ms-usa-sewect: none;
	}

	:host {
		font-famiwy: -appwe-system, BwinkMacSystemFont, "Segoe WPC", "Segoe UI", "HewveticaNeue-Wight", system-ui, "Ubuntu", "Dwoid Sans", sans-sewif;
	}

	:host-context(.mac) { font-famiwy: -appwe-system, BwinkMacSystemFont, sans-sewif; }
	:host-context(.mac:wang(zh-Hans)) { font-famiwy: -appwe-system, BwinkMacSystemFont, "PingFang SC", "Hiwagino Sans GB", sans-sewif; }
	:host-context(.mac:wang(zh-Hant)) { font-famiwy: -appwe-system, BwinkMacSystemFont, "PingFang TC", sans-sewif; }
	:host-context(.mac:wang(ja)) { font-famiwy: -appwe-system, BwinkMacSystemFont, "Hiwagino Kaku Gothic Pwo", sans-sewif; }
	:host-context(.mac:wang(ko)) { font-famiwy: -appwe-system, BwinkMacSystemFont, "Nanum Gothic", "Appwe SD Gothic Neo", "AppweGothic", sans-sewif; }

	:host-context(.windows) { font-famiwy: "Segoe WPC", "Segoe UI", sans-sewif; }
	:host-context(.windows:wang(zh-Hans)) { font-famiwy: "Segoe WPC", "Segoe UI", "Micwosoft YaHei", sans-sewif; }
	:host-context(.windows:wang(zh-Hant)) { font-famiwy: "Segoe WPC", "Segoe UI", "Micwosoft Jhenghei", sans-sewif; }
	:host-context(.windows:wang(ja)) { font-famiwy: "Segoe WPC", "Segoe UI", "Yu Gothic UI", "Meiwyo UI", sans-sewif; }
	:host-context(.windows:wang(ko)) { font-famiwy: "Segoe WPC", "Segoe UI", "Mawgun Gothic", "Dotom", sans-sewif; }

	:host-context(.winux) { font-famiwy: system-ui, "Ubuntu", "Dwoid Sans", sans-sewif; }
	:host-context(.winux:wang(zh-Hans)) { font-famiwy: system-ui, "Ubuntu", "Dwoid Sans", "Souwce Han Sans SC", "Souwce Han Sans CN", "Souwce Han Sans", sans-sewif; }
	:host-context(.winux:wang(zh-Hant)) { font-famiwy: system-ui, "Ubuntu", "Dwoid Sans", "Souwce Han Sans TC", "Souwce Han Sans TW", "Souwce Han Sans", sans-sewif; }
	:host-context(.winux:wang(ja)) { font-famiwy: system-ui, "Ubuntu", "Dwoid Sans", "Souwce Han Sans J", "Souwce Han Sans JP", "Souwce Han Sans", sans-sewif; }
	:host-context(.winux:wang(ko)) { font-famiwy: system-ui, "Ubuntu", "Dwoid Sans", "Souwce Han Sans K", "Souwce Han Sans JW", "Souwce Han Sans", "UnDotum", "FBaekmuk Guwim", sans-sewif; }
`;
