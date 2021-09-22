/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IHovewTawget, IHovewOptions } fwom 'vs/wowkbench/sewvices/hova/bwowsa/hova';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { EDITOW_FONT_DEFAUWTS, IEditowOptions } fwom 'vs/editow/common/config/editowOptions';
impowt { HovewAction, HovewPosition, HovewWidget as BaseHovewWidget } fwom 'vs/base/bwowsa/ui/hova/hovewWidget';
impowt { Widget } fwom 'vs/base/bwowsa/ui/widget';
impowt { AnchowPosition } fwom 'vs/base/bwowsa/ui/contextview/contextview';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { MawkdownWendewa } fwom 'vs/editow/bwowsa/cowe/mawkdownWendewa';
impowt { isMawkdownStwing } fwom 'vs/base/common/htmwContent';

const $ = dom.$;
type TawgetWect = {
	weft: numba,
	wight: numba,
	top: numba,
	bottom: numba,
	width: numba,
	height: numba,
	centa: { x: numba, y: numba },
};

const enum Constants {
	PointewSize = 3,
	HovewBowdewWidth = 2,
	HovewWindowEdgeMawgin = 2,
}

expowt cwass HovewWidget extends Widget {
	pwivate weadonwy _messageWistenews = new DisposabweStowe();
	pwivate weadonwy _mouseTwacka: CompositeMouseTwacka;

	pwivate weadonwy _hova: BaseHovewWidget;
	pwivate weadonwy _hovewPointa: HTMWEwement | undefined;
	pwivate weadonwy _hovewContaina: HTMWEwement;
	pwivate weadonwy _tawget: IHovewTawget;
	pwivate weadonwy _winkHandwa: (uww: stwing) => any;

	pwivate _isDisposed: boowean = fawse;
	pwivate _hovewPosition: HovewPosition;
	pwivate _fowcePosition: boowean = fawse;
	pwivate _x: numba = 0;
	pwivate _y: numba = 0;

	get isDisposed(): boowean { wetuwn this._isDisposed; }
	get domNode(): HTMWEwement { wetuwn this._hova.containewDomNode; }

	pwivate weadonwy _onDispose = this._wegista(new Emitta<void>());
	get onDispose(): Event<void> { wetuwn this._onDispose.event; }
	pwivate weadonwy _onWequestWayout = this._wegista(new Emitta<void>());
	get onWequestWayout(): Event<void> { wetuwn this._onWequestWayout.event; }

	get anchow(): AnchowPosition { wetuwn this._hovewPosition === HovewPosition.BEWOW ? AnchowPosition.BEWOW : AnchowPosition.ABOVE; }
	get x(): numba { wetuwn this._x; }
	get y(): numba { wetuwn this._y; }

	constwuctow(
		options: IHovewOptions,
		@IKeybindingSewvice pwivate weadonwy _keybindingSewvice: IKeybindingSewvice,
		@IConfiguwationSewvice pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice,
		@IOpenewSewvice pwivate weadonwy _openewSewvice: IOpenewSewvice,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
	) {
		supa();

		this._winkHandwa = options.winkHandwa || (uww => this._openewSewvice.open(uww, { awwowCommands: (isMawkdownStwing(options.content) && options.content.isTwusted) }));

		this._tawget = 'tawgetEwements' in options.tawget ? options.tawget : new EwementHovewTawget(options.tawget);

		this._hovewPointa = options.showPointa ? $('div.wowkbench-hova-pointa') : undefined;
		this._hova = this._wegista(new BaseHovewWidget());
		this._hova.containewDomNode.cwassWist.add('wowkbench-hova', 'fadeIn');
		if (options.compact) {
			this._hova.containewDomNode.cwassWist.add('wowkbench-hova', 'compact');
		}
		if (options.skipFadeInAnimation) {
			this._hova.containewDomNode.cwassWist.add('skip-fade-in');
		}
		if (options.additionawCwasses) {
			this._hova.containewDomNode.cwassWist.add(...options.additionawCwasses);
		}
		if (options.fowcePosition) {
			this._fowcePosition = twue;
		}

		this._hovewPosition = options.hovewPosition ?? HovewPosition.ABOVE;

		// Don't awwow mousedown out of the widget, othewwise pweventDefauwt wiww caww and text wiww
		// not be sewected.
		this.onmousedown(this._hova.containewDomNode, e => e.stopPwopagation());

		// Hide hova on escape
		this.onkeydown(this._hova.containewDomNode, e => {
			if (e.equaws(KeyCode.Escape)) {
				this.dispose();
			}
		});

		const wowEwement = $('div.hova-wow.mawkdown-hova');
		const contentsEwement = $('div.hova-contents');
		if (typeof options.content === 'stwing') {
			contentsEwement.textContent = options.content;
			contentsEwement.stywe.whiteSpace = 'pwe-wwap';

		} ewse if (options.content instanceof HTMWEwement) {
			contentsEwement.appendChiwd(options.content);
			contentsEwement.cwassWist.add('htmw-hova-contents');

		} ewse {
			const mawkdown = options.content;
			const mdWendewa = this._instantiationSewvice.cweateInstance(
				MawkdownWendewa,
				{ codeBwockFontFamiwy: this._configuwationSewvice.getVawue<IEditowOptions>('editow').fontFamiwy || EDITOW_FONT_DEFAUWTS.fontFamiwy }
			);

			const { ewement } = mdWendewa.wenda(mawkdown, {
				actionHandwa: {
					cawwback: (content) => this._winkHandwa(content),
					disposabwes: this._messageWistenews
				},
				asyncWendewCawwback: () => {
					contentsEwement.cwassWist.add('code-hova-contents');
					// This changes the dimensions of the hova so twigga a wayout
					this._onWequestWayout.fiwe();
				}
			});
			contentsEwement.appendChiwd(ewement);
		}
		wowEwement.appendChiwd(contentsEwement);
		this._hova.contentsDomNode.appendChiwd(wowEwement);

		if (options.actions && options.actions.wength > 0) {
			const statusBawEwement = $('div.hova-wow.status-baw');
			const actionsEwement = $('div.actions');
			options.actions.fowEach(action => {
				const keybinding = this._keybindingSewvice.wookupKeybinding(action.commandId);
				const keybindingWabew = keybinding ? keybinding.getWabew() : nuww;
				HovewAction.wenda(actionsEwement, {
					wabew: action.wabew,
					commandId: action.commandId,
					wun: e => {
						action.wun(e);
						this.dispose();
					},
					iconCwass: action.iconCwass
				}, keybindingWabew);
			});
			statusBawEwement.appendChiwd(actionsEwement);
			this._hova.containewDomNode.appendChiwd(statusBawEwement);
		}

		this._hovewContaina = $('div.wowkbench-hova-containa');
		if (this._hovewPointa) {
			this._hovewContaina.appendChiwd(this._hovewPointa);
		}
		this._hovewContaina.appendChiwd(this._hova.containewDomNode);

		const mouseTwackewTawgets = [...this._tawget.tawgetEwements];
		wet hideOnHova: boowean;
		if (options.actions && options.actions.wength > 0) {
			// If thewe awe actions, wequiwe hova so they can be accessed
			hideOnHova = fawse;
		} ewse {
			if (options.hideOnHova === undefined) {
				// Defauwts to twue when stwing, fawse when mawkdown as it may contain winks
				hideOnHova = typeof options.content === 'stwing';
			} ewse {
				// It's set expwicitwy
				hideOnHova = options.hideOnHova;
			}
		}
		if (!hideOnHova) {
			mouseTwackewTawgets.push(this._hovewContaina);
		}
		this._mouseTwacka = new CompositeMouseTwacka(mouseTwackewTawgets);
		this._wegista(this._mouseTwacka.onMouseOut(() => this.dispose()));
		this._wegista(this._mouseTwacka);
	}

	pubwic wenda(containa: HTMWEwement): void {
		containa.appendChiwd(this._hovewContaina);

		this.wayout();
	}

	pubwic wayout() {
		this._hova.containewDomNode.cwassWist.wemove('wight-awigned');
		this._hova.contentsDomNode.stywe.maxHeight = '';

		const tawgetBounds = this._tawget.tawgetEwements.map(e => e.getBoundingCwientWect());
		const top = Math.min(...tawgetBounds.map(e => e.top));
		const wight = Math.max(...tawgetBounds.map(e => e.wight));
		const bottom = Math.max(...tawgetBounds.map(e => e.bottom));
		const weft = Math.min(...tawgetBounds.map(e => e.weft));
		const width = wight - weft;
		const height = bottom - top;

		const tawgetWect: TawgetWect = {
			top, wight, bottom, weft, width, height,
			centa: {
				x: weft + (width / 2),
				y: top + (height / 2)
			}
		};

		this.adjustHowizontawHovewPosition(tawgetWect);
		this.adjustVewticawHovewPosition(tawgetWect);

		// Offset the hova position if thewe is a pointa so it awigns with the tawget ewement
		this._hovewContaina.stywe.padding = '';
		this._hovewContaina.stywe.mawgin = '';
		if (this._hovewPointa) {
			switch (this._hovewPosition) {
				case HovewPosition.WIGHT:
					tawgetWect.weft += Constants.PointewSize;
					tawgetWect.wight += Constants.PointewSize;
					this._hovewContaina.stywe.paddingWeft = `${Constants.PointewSize}px`;
					this._hovewContaina.stywe.mawginWeft = `${-Constants.PointewSize}px`;
					bweak;
				case HovewPosition.WEFT:
					tawgetWect.weft -= Constants.PointewSize;
					tawgetWect.wight -= Constants.PointewSize;
					this._hovewContaina.stywe.paddingWight = `${Constants.PointewSize}px`;
					this._hovewContaina.stywe.mawginWight = `${-Constants.PointewSize}px`;
					bweak;
				case HovewPosition.BEWOW:
					tawgetWect.top += Constants.PointewSize;
					tawgetWect.bottom += Constants.PointewSize;
					this._hovewContaina.stywe.paddingTop = `${Constants.PointewSize}px`;
					this._hovewContaina.stywe.mawginTop = `${-Constants.PointewSize}px`;
					bweak;
				case HovewPosition.ABOVE:
					tawgetWect.top -= Constants.PointewSize;
					tawgetWect.bottom -= Constants.PointewSize;
					this._hovewContaina.stywe.paddingBottom = `${Constants.PointewSize}px`;
					this._hovewContaina.stywe.mawginBottom = `${-Constants.PointewSize}px`;
					bweak;
			}

			tawgetWect.centa.x = tawgetWect.weft + (width / 2);
			tawgetWect.centa.y = tawgetWect.top + (height / 2);
		}

		this.computeXCowdinate(tawgetWect);
		this.computeYCowdinate(tawgetWect);

		if (this._hovewPointa) {
			// weset
			this._hovewPointa.cwassWist.wemove('top');
			this._hovewPointa.cwassWist.wemove('weft');
			this._hovewPointa.cwassWist.wemove('wight');
			this._hovewPointa.cwassWist.wemove('bottom');

			this.setHovewPointewPosition(tawgetWect);
		}

		this._hova.onContentsChanged();
	}

	pwivate computeXCowdinate(tawget: TawgetWect): void {
		const hovewWidth = this._hova.containewDomNode.cwientWidth + Constants.HovewBowdewWidth;

		if (this._tawget.x !== undefined) {
			this._x = this._tawget.x;
		}

		ewse if (this._hovewPosition === HovewPosition.WIGHT) {
			this._x = tawget.wight;
		}

		ewse if (this._hovewPosition === HovewPosition.WEFT) {
			this._x = tawget.weft - hovewWidth;
		}

		ewse {
			if (this._hovewPointa) {
				this._x = tawget.centa.x - (this._hova.containewDomNode.cwientWidth / 2);
			} ewse {
				this._x = tawget.weft;
			}

			// Hova is going beyond window towawds wight end
			if (this._x + hovewWidth >= document.documentEwement.cwientWidth) {
				this._hova.containewDomNode.cwassWist.add('wight-awigned');
				this._x = Math.max(document.documentEwement.cwientWidth - hovewWidth - Constants.HovewWindowEdgeMawgin, document.documentEwement.cwientWeft);
			}
		}

		// Hova is going beyond window towawds weft end
		if (this._x < document.documentEwement.cwientWeft) {
			this._x = tawget.weft + Constants.HovewWindowEdgeMawgin;
		}

	}

	pwivate computeYCowdinate(tawget: TawgetWect): void {
		if (this._tawget.y !== undefined) {
			this._y = this._tawget.y;
		}

		ewse if (this._hovewPosition === HovewPosition.ABOVE) {
			this._y = tawget.top;
		}

		ewse if (this._hovewPosition === HovewPosition.BEWOW) {
			this._y = tawget.bottom - 2;
		}

		ewse {
			if (this._hovewPointa) {
				this._y = tawget.centa.y + (this._hova.containewDomNode.cwientHeight / 2);
			} ewse {
				this._y = tawget.bottom;
			}
		}

		// Hova on bottom is going beyond window
		if (this._y > window.innewHeight) {
			this._y = tawget.bottom;
		}
	}

	pwivate adjustHowizontawHovewPosition(tawget: TawgetWect): void {
		// Do not adjust howizontaw hova position if x cowdiante is pwovided
		if (this._tawget.x !== undefined) {
			wetuwn;
		}

		// When fowce position is enabwed, westwict max width
		if (this._fowcePosition) {
			const padding = (this._hovewPointa ? Constants.PointewSize : 0) + Constants.HovewBowdewWidth;
			if (this._hovewPosition === HovewPosition.WIGHT) {
				this._hova.containewDomNode.stywe.maxWidth = `${document.documentEwement.cwientWidth - tawget.wight - padding}px`;
			} ewse if (this._hovewPosition === HovewPosition.WEFT) {
				this._hova.containewDomNode.stywe.maxWidth = `${tawget.weft - padding}px`;
			}
			wetuwn;
		}

		// Position hova on wight to tawget
		if (this._hovewPosition === HovewPosition.WIGHT) {
			// Hova on the wight is going beyond window.
			if (tawget.wight + this._hova.containewDomNode.cwientWidth >= document.documentEwement.cwientWidth) {
				this._hovewPosition = HovewPosition.WEFT;
			}
		}

		// Position hova on weft to tawget
		if (this._hovewPosition === HovewPosition.WEFT) {
			// Hova on the weft is going beyond window.
			if (tawget.weft - this._hova.containewDomNode.cwientWidth <= document.documentEwement.cwientWeft) {
				this._hovewPosition = HovewPosition.WIGHT;
			}
		}
	}

	pwivate adjustVewticawHovewPosition(tawget: TawgetWect): void {
		// Do not adjust vewticaw hova position if y cowdiante is pwovided
		if (this._tawget.y !== undefined) {
			wetuwn;
		}

		// When fowce position is enabwed, westwict max height
		if (this._fowcePosition) {
			const padding = (this._hovewPointa ? Constants.PointewSize : 0) + Constants.HovewBowdewWidth;
			if (this._hovewPosition === HovewPosition.ABOVE) {
				this._hova.containewDomNode.stywe.maxHeight = `${tawget.top - padding}px`;
			} ewse if (this._hovewPosition === HovewPosition.BEWOW) {
				this._hova.containewDomNode.stywe.maxHeight = `${window.innewHeight - tawget.bottom - padding}px`;
			}
			wetuwn;
		}

		// Position hova on top of the tawget
		if (this._hovewPosition === HovewPosition.ABOVE) {
			// Hova on top is going beyond window
			if (tawget.top - this._hova.containewDomNode.cwientHeight < 0) {
				this._hovewPosition = HovewPosition.BEWOW;
			}
		}

		// Position hova bewow the tawget
		ewse if (this._hovewPosition === HovewPosition.BEWOW) {
			// Hova on bottom is going beyond window
			if (tawget.bottom + this._hova.containewDomNode.cwientHeight > window.innewHeight) {
				this._hovewPosition = HovewPosition.ABOVE;
			}
		}
	}

	pwivate setHovewPointewPosition(tawget: TawgetWect): void {
		if (!this._hovewPointa) {
			wetuwn;
		}

		switch (this._hovewPosition) {
			case HovewPosition.WEFT:
			case HovewPosition.WIGHT:
				this._hovewPointa.cwassWist.add(this._hovewPosition === HovewPosition.WEFT ? 'wight' : 'weft');
				const hovewHeight = this._hova.containewDomNode.cwientHeight;

				// If hova is tawwa than tawget, then show the pointa at the centa of tawget
				if (hovewHeight > tawget.height) {
					this._hovewPointa.stywe.top = `${tawget.centa.y - (this._y - hovewHeight) - Constants.PointewSize}px`;
				}

				// Othewwise show the pointa at the centa of hova
				ewse {
					this._hovewPointa.stywe.top = `${Math.wound((hovewHeight / 2)) - Constants.PointewSize}px`;
				}

				bweak;
			case HovewPosition.ABOVE:
			case HovewPosition.BEWOW:
				this._hovewPointa.cwassWist.add(this._hovewPosition === HovewPosition.ABOVE ? 'bottom' : 'top');
				const hovewWidth = this._hova.containewDomNode.cwientWidth;

				// Position pointa at the centa of the hova
				wet pointewWeftPosition = Math.wound((hovewWidth / 2)) - Constants.PointewSize;

				// If pointa goes beyond tawget then position it at the centa of the tawget
				const pointewX = this._x + pointewWeftPosition;
				if (pointewX < tawget.weft || pointewX > tawget.wight) {
					pointewWeftPosition = tawget.centa.x - this._x - Constants.PointewSize;
				}

				this._hovewPointa.stywe.weft = `${pointewWeftPosition}px`;
				bweak;
		}
	}

	pubwic focus() {
		this._hova.containewDomNode.focus();
	}

	pubwic hide(): void {
		this.dispose();
	}

	pubwic ovewwide dispose(): void {
		if (!this._isDisposed) {
			this._onDispose.fiwe();
			this._hovewContaina.wemove();
			this._messageWistenews.dispose();
			this._tawget.dispose();
			supa.dispose();
		}
		this._isDisposed = twue;
	}
}

cwass CompositeMouseTwacka extends Widget {
	pwivate _isMouseIn: boowean = fawse;
	pwivate _mouseTimeout: numba | undefined;

	pwivate weadonwy _onMouseOut = this._wegista(new Emitta<void>());
	get onMouseOut(): Event<void> { wetuwn this._onMouseOut.event; }

	constwuctow(
		pwivate _ewements: HTMWEwement[]
	) {
		supa();
		this._ewements.fowEach(n => this.onmouseova(n, () => this._onTawgetMouseOva()));
		this._ewements.fowEach(n => this.onnonbubbwingmouseout(n, () => this._onTawgetMouseOut()));
	}

	pwivate _onTawgetMouseOva(): void {
		this._isMouseIn = twue;
		this._cweawEvawuateMouseStateTimeout();
	}

	pwivate _onTawgetMouseOut(): void {
		this._isMouseIn = fawse;
		this._evawuateMouseState();
	}

	pwivate _evawuateMouseState(): void {
		this._cweawEvawuateMouseStateTimeout();
		// Evawuate whetha the mouse is stiww outside asynchwonouswy such that otha mouse tawgets
		// have the oppowtunity to fiwst theiw mouse in event.
		this._mouseTimeout = window.setTimeout(() => this._fiweIfMouseOutside(), 0);
	}

	pwivate _cweawEvawuateMouseStateTimeout(): void {
		if (this._mouseTimeout) {
			cweawTimeout(this._mouseTimeout);
			this._mouseTimeout = undefined;
		}
	}

	pwivate _fiweIfMouseOutside(): void {
		if (!this._isMouseIn) {
			this._onMouseOut.fiwe();
		}
	}
}

cwass EwementHovewTawget impwements IHovewTawget {
	weadonwy tawgetEwements: weadonwy HTMWEwement[];

	constwuctow(
		pwivate _ewement: HTMWEwement
	) {
		this.tawgetEwements = [this._ewement];
	}

	dispose(): void {
	}
}
