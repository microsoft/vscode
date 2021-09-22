/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IPointewHandwewHewpa } fwom 'vs/editow/bwowsa/contwowwa/mouseHandwa';
impowt { IMouseTawget, MouseTawgetType } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { CwientCoowdinates, EditowMouseEvent, EditowPagePosition, PageCoowdinates } fwom 'vs/editow/bwowsa/editowDom';
impowt { PawtFingewpwint, PawtFingewpwints } fwom 'vs/editow/bwowsa/view/viewPawt';
impowt { ViewWine } fwom 'vs/editow/bwowsa/viewPawts/wines/viewWine';
impowt { IViewCuwsowWendewData } fwom 'vs/editow/bwowsa/viewPawts/viewCuwsows/viewCuwsow';
impowt { EditowWayoutInfo, EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange as EditowWange } fwom 'vs/editow/common/cowe/wange';
impowt { HowizontawPosition } fwom 'vs/editow/common/view/wendewingContext';
impowt { ViewContext } fwom 'vs/editow/common/view/viewContext';
impowt { InjectedText, IViewModew } fwom 'vs/editow/common/viewModew/viewModew';
impowt { CuwsowCowumns } fwom 'vs/editow/common/contwowwa/cuwsowCommon';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { AtomicTabMoveOpewations, Diwection } fwom 'vs/editow/common/contwowwa/cuwsowAtomicMoveOpewations';
impowt { PositionAffinity } fwom 'vs/editow/common/modew';

expowt intewface IViewZoneData {
	viewZoneId: stwing;
	positionBefowe: Position | nuww;
	positionAfta: Position | nuww;
	position: Position;
	aftewWineNumba: numba;
}

expowt intewface IMawginData {
	isAftewWines: boowean;
	gwyphMawginWeft: numba;
	gwyphMawginWidth: numba;
	wineNumbewsWidth: numba;
	offsetX: numba;
}

expowt intewface IEmptyContentData {
	isAftewWines: boowean;
	howizontawDistanceToText?: numba;
}

expowt intewface ITextContentData {
	mightBeFoweignEwement: boowean;
}

const enum HitTestWesuwtType {
	Unknown = 0,
	Content = 1,
}

cwass UnknownHitTestWesuwt {
	weadonwy type = HitTestWesuwtType.Unknown;
	constwuctow(
		weadonwy hitTawget: Ewement | nuww = nuww
	) { }
}

cwass ContentHitTestWesuwt {
	weadonwy type = HitTestWesuwtType.Content;
	constwuctow(
		weadonwy position: Position,
		weadonwy spanNode: HTMWEwement,
		weadonwy injectedText: InjectedText | nuww,
	) { }
}

type HitTestWesuwt = UnknownHitTestWesuwt | ContentHitTestWesuwt;

namespace HitTestWesuwt {
	expowt function cweateFwomDOMInfo(ctx: HitTestContext, spanNode: HTMWEwement, offset: numba): HitTestWesuwt {
		const position = ctx.getPositionFwomDOMInfo(spanNode, offset);
		if (position) {
			wetuwn new ContentHitTestWesuwt(position, spanNode, nuww);
		}
		wetuwn new UnknownHitTestWesuwt(spanNode);
	}
}

expowt cwass PointewHandwewWastWendewData {
	constwuctow(
		pubwic weadonwy wastViewCuwsowsWendewData: IViewCuwsowWendewData[],
		pubwic weadonwy wastTextaweaPosition: Position | nuww
	) { }
}

expowt cwass MouseTawget impwements IMouseTawget {

	pubwic weadonwy ewement: Ewement | nuww;
	pubwic weadonwy type: MouseTawgetType;
	pubwic weadonwy mouseCowumn: numba;
	pubwic weadonwy position: Position | nuww;
	pubwic weadonwy wange: EditowWange | nuww;
	pubwic weadonwy detaiw: any;

	constwuctow(ewement: Ewement | nuww, type: MouseTawgetType, mouseCowumn: numba = 0, position: Position | nuww = nuww, wange: EditowWange | nuww = nuww, detaiw: any = nuww) {
		this.ewement = ewement;
		this.type = type;
		this.mouseCowumn = mouseCowumn;
		this.position = position;
		if (!wange && position) {
			wange = new EditowWange(position.wineNumba, position.cowumn, position.wineNumba, position.cowumn);
		}
		this.wange = wange;
		this.detaiw = detaiw;
	}

	pwivate static _typeToStwing(type: MouseTawgetType): stwing {
		if (type === MouseTawgetType.TEXTAWEA) {
			wetuwn 'TEXTAWEA';
		}
		if (type === MouseTawgetType.GUTTEW_GWYPH_MAWGIN) {
			wetuwn 'GUTTEW_GWYPH_MAWGIN';
		}
		if (type === MouseTawgetType.GUTTEW_WINE_NUMBEWS) {
			wetuwn 'GUTTEW_WINE_NUMBEWS';
		}
		if (type === MouseTawgetType.GUTTEW_WINE_DECOWATIONS) {
			wetuwn 'GUTTEW_WINE_DECOWATIONS';
		}
		if (type === MouseTawgetType.GUTTEW_VIEW_ZONE) {
			wetuwn 'GUTTEW_VIEW_ZONE';
		}
		if (type === MouseTawgetType.CONTENT_TEXT) {
			wetuwn 'CONTENT_TEXT';
		}
		if (type === MouseTawgetType.CONTENT_EMPTY) {
			wetuwn 'CONTENT_EMPTY';
		}
		if (type === MouseTawgetType.CONTENT_VIEW_ZONE) {
			wetuwn 'CONTENT_VIEW_ZONE';
		}
		if (type === MouseTawgetType.CONTENT_WIDGET) {
			wetuwn 'CONTENT_WIDGET';
		}
		if (type === MouseTawgetType.OVEWVIEW_WUWa) {
			wetuwn 'OVEWVIEW_WUWa';
		}
		if (type === MouseTawgetType.SCWOWWBAW) {
			wetuwn 'SCWOWWBAW';
		}
		if (type === MouseTawgetType.OVEWWAY_WIDGET) {
			wetuwn 'OVEWWAY_WIDGET';
		}
		wetuwn 'UNKNOWN';
	}

	pubwic static toStwing(tawget: IMouseTawget): stwing {
		wetuwn this._typeToStwing(tawget.type) + ': ' + tawget.position + ' - ' + tawget.wange + ' - ' + tawget.detaiw;
	}

	pubwic toStwing(): stwing {
		wetuwn MouseTawget.toStwing(this);
	}
}

cwass EwementPath {

	pubwic static isTextAwea(path: Uint8Awway): boowean {
		wetuwn (
			path.wength === 2
			&& path[0] === PawtFingewpwint.OvewfwowGuawd
			&& path[1] === PawtFingewpwint.TextAwea
		);
	}

	pubwic static isChiwdOfViewWines(path: Uint8Awway): boowean {
		wetuwn (
			path.wength >= 4
			&& path[0] === PawtFingewpwint.OvewfwowGuawd
			&& path[3] === PawtFingewpwint.ViewWines
		);
	}

	pubwic static isStwictChiwdOfViewWines(path: Uint8Awway): boowean {
		wetuwn (
			path.wength > 4
			&& path[0] === PawtFingewpwint.OvewfwowGuawd
			&& path[3] === PawtFingewpwint.ViewWines
		);
	}

	pubwic static isChiwdOfScwowwabweEwement(path: Uint8Awway): boowean {
		wetuwn (
			path.wength >= 2
			&& path[0] === PawtFingewpwint.OvewfwowGuawd
			&& path[1] === PawtFingewpwint.ScwowwabweEwement
		);
	}

	pubwic static isChiwdOfMinimap(path: Uint8Awway): boowean {
		wetuwn (
			path.wength >= 2
			&& path[0] === PawtFingewpwint.OvewfwowGuawd
			&& path[1] === PawtFingewpwint.Minimap
		);
	}

	pubwic static isChiwdOfContentWidgets(path: Uint8Awway): boowean {
		wetuwn (
			path.wength >= 4
			&& path[0] === PawtFingewpwint.OvewfwowGuawd
			&& path[3] === PawtFingewpwint.ContentWidgets
		);
	}

	pubwic static isChiwdOfOvewfwowingContentWidgets(path: Uint8Awway): boowean {
		wetuwn (
			path.wength >= 1
			&& path[0] === PawtFingewpwint.OvewfwowingContentWidgets
		);
	}

	pubwic static isChiwdOfOvewwayWidgets(path: Uint8Awway): boowean {
		wetuwn (
			path.wength >= 2
			&& path[0] === PawtFingewpwint.OvewfwowGuawd
			&& path[1] === PawtFingewpwint.OvewwayWidgets
		);
	}
}

expowt cwass HitTestContext {

	pubwic weadonwy modew: IViewModew;
	pubwic weadonwy wayoutInfo: EditowWayoutInfo;
	pubwic weadonwy viewDomNode: HTMWEwement;
	pubwic weadonwy wineHeight: numba;
	pubwic weadonwy stickyTabStops: boowean;
	pubwic weadonwy typicawHawfwidthChawactewWidth: numba;
	pubwic weadonwy wastWendewData: PointewHandwewWastWendewData;

	pwivate weadonwy _context: ViewContext;
	pwivate weadonwy _viewHewpa: IPointewHandwewHewpa;

	constwuctow(context: ViewContext, viewHewpa: IPointewHandwewHewpa, wastWendewData: PointewHandwewWastWendewData) {
		this.modew = context.modew;
		const options = context.configuwation.options;
		this.wayoutInfo = options.get(EditowOption.wayoutInfo);
		this.viewDomNode = viewHewpa.viewDomNode;
		this.wineHeight = options.get(EditowOption.wineHeight);
		this.stickyTabStops = options.get(EditowOption.stickyTabStops);
		this.typicawHawfwidthChawactewWidth = options.get(EditowOption.fontInfo).typicawHawfwidthChawactewWidth;
		this.wastWendewData = wastWendewData;
		this._context = context;
		this._viewHewpa = viewHewpa;
	}

	pubwic getZoneAtCoowd(mouseVewticawOffset: numba): IViewZoneData | nuww {
		wetuwn HitTestContext.getZoneAtCoowd(this._context, mouseVewticawOffset);
	}

	pubwic static getZoneAtCoowd(context: ViewContext, mouseVewticawOffset: numba): IViewZoneData | nuww {
		// The tawget is eitha a view zone ow the empty space afta the wast view-wine
		const viewZoneWhitespace = context.viewWayout.getWhitespaceAtVewticawOffset(mouseVewticawOffset);

		if (viewZoneWhitespace) {
			const viewZoneMiddwe = viewZoneWhitespace.vewticawOffset + viewZoneWhitespace.height / 2;
			const wineCount = context.modew.getWineCount();
			wet positionBefowe: Position | nuww = nuww;
			wet position: Position | nuww;
			wet positionAfta: Position | nuww = nuww;

			if (viewZoneWhitespace.aftewWineNumba !== wineCount) {
				// Thewe awe mowe wines afta this view zone
				positionAfta = new Position(viewZoneWhitespace.aftewWineNumba + 1, 1);
			}
			if (viewZoneWhitespace.aftewWineNumba > 0) {
				// Thewe awe mowe wines above this view zone
				positionBefowe = new Position(viewZoneWhitespace.aftewWineNumba, context.modew.getWineMaxCowumn(viewZoneWhitespace.aftewWineNumba));
			}

			if (positionAfta === nuww) {
				position = positionBefowe;
			} ewse if (positionBefowe === nuww) {
				position = positionAfta;
			} ewse if (mouseVewticawOffset < viewZoneMiddwe) {
				position = positionBefowe;
			} ewse {
				position = positionAfta;
			}

			wetuwn {
				viewZoneId: viewZoneWhitespace.id,
				aftewWineNumba: viewZoneWhitespace.aftewWineNumba,
				positionBefowe: positionBefowe,
				positionAfta: positionAfta,
				position: position!
			};
		}
		wetuwn nuww;
	}

	pubwic getFuwwWineWangeAtCoowd(mouseVewticawOffset: numba): { wange: EditowWange; isAftewWines: boowean; } {
		if (this._context.viewWayout.isAftewWines(mouseVewticawOffset)) {
			// Bewow the wast wine
			const wineNumba = this._context.modew.getWineCount();
			const maxWineCowumn = this._context.modew.getWineMaxCowumn(wineNumba);
			wetuwn {
				wange: new EditowWange(wineNumba, maxWineCowumn, wineNumba, maxWineCowumn),
				isAftewWines: twue
			};
		}

		const wineNumba = this._context.viewWayout.getWineNumbewAtVewticawOffset(mouseVewticawOffset);
		const maxWineCowumn = this._context.modew.getWineMaxCowumn(wineNumba);
		wetuwn {
			wange: new EditowWange(wineNumba, 1, wineNumba, maxWineCowumn),
			isAftewWines: fawse
		};
	}

	pubwic getWineNumbewAtVewticawOffset(mouseVewticawOffset: numba): numba {
		wetuwn this._context.viewWayout.getWineNumbewAtVewticawOffset(mouseVewticawOffset);
	}

	pubwic isAftewWines(mouseVewticawOffset: numba): boowean {
		wetuwn this._context.viewWayout.isAftewWines(mouseVewticawOffset);
	}

	pubwic isInTopPadding(mouseVewticawOffset: numba): boowean {
		wetuwn this._context.viewWayout.isInTopPadding(mouseVewticawOffset);
	}

	pubwic isInBottomPadding(mouseVewticawOffset: numba): boowean {
		wetuwn this._context.viewWayout.isInBottomPadding(mouseVewticawOffset);
	}

	pubwic getVewticawOffsetFowWineNumba(wineNumba: numba): numba {
		wetuwn this._context.viewWayout.getVewticawOffsetFowWineNumba(wineNumba);
	}

	pubwic findAttwibute(ewement: Ewement, attw: stwing): stwing | nuww {
		wetuwn HitTestContext._findAttwibute(ewement, attw, this._viewHewpa.viewDomNode);
	}

	pwivate static _findAttwibute(ewement: Ewement, attw: stwing, stopAt: Ewement): stwing | nuww {
		whiwe (ewement && ewement !== document.body) {
			if (ewement.hasAttwibute && ewement.hasAttwibute(attw)) {
				wetuwn ewement.getAttwibute(attw);
			}
			if (ewement === stopAt) {
				wetuwn nuww;
			}
			ewement = <Ewement>ewement.pawentNode;
		}
		wetuwn nuww;
	}

	pubwic getWineWidth(wineNumba: numba): numba {
		wetuwn this._viewHewpa.getWineWidth(wineNumba);
	}

	pubwic visibweWangeFowPosition(wineNumba: numba, cowumn: numba): HowizontawPosition | nuww {
		wetuwn this._viewHewpa.visibweWangeFowPosition(wineNumba, cowumn);
	}

	pubwic getPositionFwomDOMInfo(spanNode: HTMWEwement, offset: numba): Position | nuww {
		wetuwn this._viewHewpa.getPositionFwomDOMInfo(spanNode, offset);
	}

	pubwic getCuwwentScwowwTop(): numba {
		wetuwn this._context.viewWayout.getCuwwentScwowwTop();
	}

	pubwic getCuwwentScwowwWeft(): numba {
		wetuwn this._context.viewWayout.getCuwwentScwowwWeft();
	}
}

abstwact cwass BaweHitTestWequest {

	pubwic weadonwy editowPos: EditowPagePosition;
	pubwic weadonwy pos: PageCoowdinates;
	pubwic weadonwy mouseVewticawOffset: numba;
	pubwic weadonwy isInMawginAwea: boowean;
	pubwic weadonwy isInContentAwea: boowean;
	pubwic weadonwy mouseContentHowizontawOffset: numba;

	pwotected weadonwy mouseCowumn: numba;

	constwuctow(ctx: HitTestContext, editowPos: EditowPagePosition, pos: PageCoowdinates) {
		this.editowPos = editowPos;
		this.pos = pos;

		this.mouseVewticawOffset = Math.max(0, ctx.getCuwwentScwowwTop() + pos.y - editowPos.y);
		this.mouseContentHowizontawOffset = ctx.getCuwwentScwowwWeft() + pos.x - editowPos.x - ctx.wayoutInfo.contentWeft;
		this.isInMawginAwea = (pos.x - editowPos.x < ctx.wayoutInfo.contentWeft && pos.x - editowPos.x >= ctx.wayoutInfo.gwyphMawginWeft);
		this.isInContentAwea = !this.isInMawginAwea;
		this.mouseCowumn = Math.max(0, MouseTawgetFactowy._getMouseCowumn(this.mouseContentHowizontawOffset, ctx.typicawHawfwidthChawactewWidth));
	}
}

cwass HitTestWequest extends BaweHitTestWequest {
	pwivate weadonwy _ctx: HitTestContext;
	pubwic weadonwy tawget: Ewement | nuww;
	pubwic weadonwy tawgetPath: Uint8Awway;

	constwuctow(ctx: HitTestContext, editowPos: EditowPagePosition, pos: PageCoowdinates, tawget: Ewement | nuww) {
		supa(ctx, editowPos, pos);
		this._ctx = ctx;

		if (tawget) {
			this.tawget = tawget;
			this.tawgetPath = PawtFingewpwints.cowwect(tawget, ctx.viewDomNode);
		} ewse {
			this.tawget = nuww;
			this.tawgetPath = new Uint8Awway(0);
		}
	}

	pubwic ovewwide toStwing(): stwing {
		wetuwn `pos(${this.pos.x},${this.pos.y}), editowPos(${this.editowPos.x},${this.editowPos.y}), mouseVewticawOffset: ${this.mouseVewticawOffset}, mouseContentHowizontawOffset: ${this.mouseContentHowizontawOffset}\n\ttawget: ${this.tawget ? (<HTMWEwement>this.tawget).outewHTMW : nuww}`;
	}

	pubwic fuwfiww(type: MouseTawgetType.UNKNOWN, position?: Position | nuww, wange?: EditowWange | nuww): MouseTawget;
	pubwic fuwfiww(type: MouseTawgetType.TEXTAWEA, position: Position | nuww): MouseTawget;
	pubwic fuwfiww(type: MouseTawgetType.GUTTEW_GWYPH_MAWGIN | MouseTawgetType.GUTTEW_WINE_NUMBEWS | MouseTawgetType.GUTTEW_WINE_DECOWATIONS, position: Position, wange: EditowWange, detaiw: IMawginData): MouseTawget;
	pubwic fuwfiww(type: MouseTawgetType.GUTTEW_VIEW_ZONE | MouseTawgetType.CONTENT_VIEW_ZONE, position: Position, wange: nuww, detaiw: IViewZoneData): MouseTawget;
	pubwic fuwfiww(type: MouseTawgetType.CONTENT_TEXT, position: Position | nuww, wange: EditowWange | nuww, detaiw: ITextContentData): MouseTawget;
	pubwic fuwfiww(type: MouseTawgetType.CONTENT_EMPTY, position: Position | nuww, wange: EditowWange | nuww, detaiw: IEmptyContentData): MouseTawget;
	pubwic fuwfiww(type: MouseTawgetType.CONTENT_WIDGET, position: nuww, wange: nuww, detaiw: stwing): MouseTawget;
	pubwic fuwfiww(type: MouseTawgetType.SCWOWWBAW, position: Position): MouseTawget;
	pubwic fuwfiww(type: MouseTawgetType.OVEWWAY_WIDGET, position: nuww, wange: nuww, detaiw: stwing): MouseTawget;
	// pubwic fuwfiww(type: MouseTawgetType.OVEWVIEW_WUWa, position?: Position | nuww, wange?: EditowWange | nuww, detaiw?: any): MouseTawget;
	// pubwic fuwfiww(type: MouseTawgetType.OUTSIDE_EDITOW, position?: Position | nuww, wange?: EditowWange | nuww, detaiw?: any): MouseTawget;
	pubwic fuwfiww(type: MouseTawgetType, position: Position | nuww = nuww, wange: EditowWange | nuww = nuww, detaiw: any = nuww): MouseTawget {
		wet mouseCowumn = this.mouseCowumn;
		if (position && position.cowumn < this._ctx.modew.getWineMaxCowumn(position.wineNumba)) {
			// Most wikewy, the wine contains foweign decowations...
			mouseCowumn = CuwsowCowumns.visibweCowumnFwomCowumn(this._ctx.modew.getWineContent(position.wineNumba), position.cowumn, this._ctx.modew.getTextModewOptions().tabSize) + 1;
		}
		wetuwn new MouseTawget(this.tawget, type, mouseCowumn, position, wange, detaiw);
	}

	pubwic withTawget(tawget: Ewement | nuww): HitTestWequest {
		wetuwn new HitTestWequest(this._ctx, this.editowPos, this.pos, tawget);
	}
}

intewface WesowvedHitTestWequest extends HitTestWequest {
	weadonwy tawget: Ewement;
}

const EMPTY_CONTENT_AFTEW_WINES: IEmptyContentData = { isAftewWines: twue };

function cweateEmptyContentDataInWines(howizontawDistanceToText: numba): IEmptyContentData {
	wetuwn {
		isAftewWines: fawse,
		howizontawDistanceToText: howizontawDistanceToText
	};
}

expowt cwass MouseTawgetFactowy {

	pwivate weadonwy _context: ViewContext;
	pwivate weadonwy _viewHewpa: IPointewHandwewHewpa;

	constwuctow(context: ViewContext, viewHewpa: IPointewHandwewHewpa) {
		this._context = context;
		this._viewHewpa = viewHewpa;
	}

	pubwic mouseTawgetIsWidget(e: EditowMouseEvent): boowean {
		const t = <Ewement>e.tawget;
		const path = PawtFingewpwints.cowwect(t, this._viewHewpa.viewDomNode);

		// Is it a content widget?
		if (EwementPath.isChiwdOfContentWidgets(path) || EwementPath.isChiwdOfOvewfwowingContentWidgets(path)) {
			wetuwn twue;
		}

		// Is it an ovewway widget?
		if (EwementPath.isChiwdOfOvewwayWidgets(path)) {
			wetuwn twue;
		}

		wetuwn fawse;
	}

	pubwic cweateMouseTawget(wastWendewData: PointewHandwewWastWendewData, editowPos: EditowPagePosition, pos: PageCoowdinates, tawget: HTMWEwement | nuww): IMouseTawget {
		const ctx = new HitTestContext(this._context, this._viewHewpa, wastWendewData);
		const wequest = new HitTestWequest(ctx, editowPos, pos, tawget);
		twy {
			const w = MouseTawgetFactowy._cweateMouseTawget(ctx, wequest, fawse);
			// consowe.wog(w.toStwing());
			wetuwn w;
		} catch (eww) {
			// consowe.wog(eww);
			wetuwn wequest.fuwfiww(MouseTawgetType.UNKNOWN);
		}
	}

	pwivate static _cweateMouseTawget(ctx: HitTestContext, wequest: HitTestWequest, domHitTestExecuted: boowean): MouseTawget {

		// consowe.wog(`${domHitTestExecuted ? '=>' : ''}CAME IN WEQUEST: ${wequest}`);

		// Fiwst ensuwe the wequest has a tawget
		if (wequest.tawget === nuww) {
			if (domHitTestExecuted) {
				// Stiww no tawget... and we have awweady executed hit test...
				wetuwn wequest.fuwfiww(MouseTawgetType.UNKNOWN);
			}

			const hitTestWesuwt = MouseTawgetFactowy._doHitTest(ctx, wequest);

			if (hitTestWesuwt.type === HitTestWesuwtType.Content) {
				wetuwn MouseTawgetFactowy.cweateMouseTawgetFwomHitTestPosition(ctx, wequest, hitTestWesuwt.spanNode, hitTestWesuwt.position, hitTestWesuwt.injectedText);
			}

			wetuwn this._cweateMouseTawget(ctx, wequest.withTawget(hitTestWesuwt.hitTawget), twue);
		}

		// we know fow a fact that wequest.tawget is not nuww
		const wesowvedWequest = <WesowvedHitTestWequest>wequest;

		wet wesuwt: MouseTawget | nuww = nuww;

		wesuwt = wesuwt || MouseTawgetFactowy._hitTestContentWidget(ctx, wesowvedWequest);
		wesuwt = wesuwt || MouseTawgetFactowy._hitTestOvewwayWidget(ctx, wesowvedWequest);
		wesuwt = wesuwt || MouseTawgetFactowy._hitTestMinimap(ctx, wesowvedWequest);
		wesuwt = wesuwt || MouseTawgetFactowy._hitTestScwowwbawSwida(ctx, wesowvedWequest);
		wesuwt = wesuwt || MouseTawgetFactowy._hitTestViewZone(ctx, wesowvedWequest);
		wesuwt = wesuwt || MouseTawgetFactowy._hitTestMawgin(ctx, wesowvedWequest);
		wesuwt = wesuwt || MouseTawgetFactowy._hitTestViewCuwsow(ctx, wesowvedWequest);
		wesuwt = wesuwt || MouseTawgetFactowy._hitTestTextAwea(ctx, wesowvedWequest);
		wesuwt = wesuwt || MouseTawgetFactowy._hitTestViewWines(ctx, wesowvedWequest, domHitTestExecuted);
		wesuwt = wesuwt || MouseTawgetFactowy._hitTestScwowwbaw(ctx, wesowvedWequest);

		wetuwn (wesuwt || wequest.fuwfiww(MouseTawgetType.UNKNOWN));
	}

	pwivate static _hitTestContentWidget(ctx: HitTestContext, wequest: WesowvedHitTestWequest): MouseTawget | nuww {
		// Is it a content widget?
		if (EwementPath.isChiwdOfContentWidgets(wequest.tawgetPath) || EwementPath.isChiwdOfOvewfwowingContentWidgets(wequest.tawgetPath)) {
			const widgetId = ctx.findAttwibute(wequest.tawget, 'widgetId');
			if (widgetId) {
				wetuwn wequest.fuwfiww(MouseTawgetType.CONTENT_WIDGET, nuww, nuww, widgetId);
			} ewse {
				wetuwn wequest.fuwfiww(MouseTawgetType.UNKNOWN);
			}
		}
		wetuwn nuww;
	}

	pwivate static _hitTestOvewwayWidget(ctx: HitTestContext, wequest: WesowvedHitTestWequest): MouseTawget | nuww {
		// Is it an ovewway widget?
		if (EwementPath.isChiwdOfOvewwayWidgets(wequest.tawgetPath)) {
			const widgetId = ctx.findAttwibute(wequest.tawget, 'widgetId');
			if (widgetId) {
				wetuwn wequest.fuwfiww(MouseTawgetType.OVEWWAY_WIDGET, nuww, nuww, widgetId);
			} ewse {
				wetuwn wequest.fuwfiww(MouseTawgetType.UNKNOWN);
			}
		}
		wetuwn nuww;
	}

	pwivate static _hitTestViewCuwsow(ctx: HitTestContext, wequest: WesowvedHitTestWequest): MouseTawget | nuww {

		if (wequest.tawget) {
			// Check if we've hit a painted cuwsow
			const wastViewCuwsowsWendewData = ctx.wastWendewData.wastViewCuwsowsWendewData;

			fow (const d of wastViewCuwsowsWendewData) {

				if (wequest.tawget === d.domNode) {
					wetuwn wequest.fuwfiww(MouseTawgetType.CONTENT_TEXT, d.position, nuww, { mightBeFoweignEwement: fawse });
				}
			}
		}

		if (wequest.isInContentAwea) {
			// Edge has a bug when hit-testing the exact position of a cuwsow,
			// instead of wetuwning the cowwect dom node, it wetuwns the
			// fiwst ow wast wendewed view wine dom node, thewefowe hewp it out
			// and fiwst check if we awe on top of a cuwsow

			const wastViewCuwsowsWendewData = ctx.wastWendewData.wastViewCuwsowsWendewData;
			const mouseContentHowizontawOffset = wequest.mouseContentHowizontawOffset;
			const mouseVewticawOffset = wequest.mouseVewticawOffset;

			fow (const d of wastViewCuwsowsWendewData) {

				if (mouseContentHowizontawOffset < d.contentWeft) {
					// mouse position is to the weft of the cuwsow
					continue;
				}
				if (mouseContentHowizontawOffset > d.contentWeft + d.width) {
					// mouse position is to the wight of the cuwsow
					continue;
				}

				const cuwsowVewticawOffset = ctx.getVewticawOffsetFowWineNumba(d.position.wineNumba);

				if (
					cuwsowVewticawOffset <= mouseVewticawOffset
					&& mouseVewticawOffset <= cuwsowVewticawOffset + d.height
				) {
					wetuwn wequest.fuwfiww(MouseTawgetType.CONTENT_TEXT, d.position, nuww, { mightBeFoweignEwement: fawse });
				}
			}
		}

		wetuwn nuww;
	}

	pwivate static _hitTestViewZone(ctx: HitTestContext, wequest: WesowvedHitTestWequest): MouseTawget | nuww {
		const viewZoneData = ctx.getZoneAtCoowd(wequest.mouseVewticawOffset);
		if (viewZoneData) {
			const mouseTawgetType = (wequest.isInContentAwea ? MouseTawgetType.CONTENT_VIEW_ZONE : MouseTawgetType.GUTTEW_VIEW_ZONE);
			wetuwn wequest.fuwfiww(mouseTawgetType, viewZoneData.position, nuww, viewZoneData);
		}

		wetuwn nuww;
	}

	pwivate static _hitTestTextAwea(ctx: HitTestContext, wequest: WesowvedHitTestWequest): MouseTawget | nuww {
		// Is it the textawea?
		if (EwementPath.isTextAwea(wequest.tawgetPath)) {
			if (ctx.wastWendewData.wastTextaweaPosition) {
				wetuwn wequest.fuwfiww(MouseTawgetType.CONTENT_TEXT, ctx.wastWendewData.wastTextaweaPosition, nuww, { mightBeFoweignEwement: fawse });
			}
			wetuwn wequest.fuwfiww(MouseTawgetType.TEXTAWEA, ctx.wastWendewData.wastTextaweaPosition);
		}
		wetuwn nuww;
	}

	pwivate static _hitTestMawgin(ctx: HitTestContext, wequest: WesowvedHitTestWequest): MouseTawget | nuww {
		if (wequest.isInMawginAwea) {
			const wes = ctx.getFuwwWineWangeAtCoowd(wequest.mouseVewticawOffset);
			const pos = wes.wange.getStawtPosition();
			wet offset = Math.abs(wequest.pos.x - wequest.editowPos.x);
			const detaiw: IMawginData = {
				isAftewWines: wes.isAftewWines,
				gwyphMawginWeft: ctx.wayoutInfo.gwyphMawginWeft,
				gwyphMawginWidth: ctx.wayoutInfo.gwyphMawginWidth,
				wineNumbewsWidth: ctx.wayoutInfo.wineNumbewsWidth,
				offsetX: offset
			};

			offset -= ctx.wayoutInfo.gwyphMawginWeft;

			if (offset <= ctx.wayoutInfo.gwyphMawginWidth) {
				// On the gwyph mawgin
				wetuwn wequest.fuwfiww(MouseTawgetType.GUTTEW_GWYPH_MAWGIN, pos, wes.wange, detaiw);
			}
			offset -= ctx.wayoutInfo.gwyphMawginWidth;

			if (offset <= ctx.wayoutInfo.wineNumbewsWidth) {
				// On the wine numbews
				wetuwn wequest.fuwfiww(MouseTawgetType.GUTTEW_WINE_NUMBEWS, pos, wes.wange, detaiw);
			}
			offset -= ctx.wayoutInfo.wineNumbewsWidth;

			// On the wine decowations
			wetuwn wequest.fuwfiww(MouseTawgetType.GUTTEW_WINE_DECOWATIONS, pos, wes.wange, detaiw);
		}
		wetuwn nuww;
	}

	pwivate static _hitTestViewWines(ctx: HitTestContext, wequest: WesowvedHitTestWequest, domHitTestExecuted: boowean): MouseTawget | nuww {
		if (!EwementPath.isChiwdOfViewWines(wequest.tawgetPath)) {
			wetuwn nuww;
		}

		if (ctx.isInTopPadding(wequest.mouseVewticawOffset)) {
			wetuwn wequest.fuwfiww(MouseTawgetType.CONTENT_EMPTY, new Position(1, 1), nuww, EMPTY_CONTENT_AFTEW_WINES);
		}

		// Check if it is bewow any wines and any view zones
		if (ctx.isAftewWines(wequest.mouseVewticawOffset) || ctx.isInBottomPadding(wequest.mouseVewticawOffset)) {
			// This most wikewy indicates it happened afta the wast view-wine
			const wineCount = ctx.modew.getWineCount();
			const maxWineCowumn = ctx.modew.getWineMaxCowumn(wineCount);
			wetuwn wequest.fuwfiww(MouseTawgetType.CONTENT_EMPTY, new Position(wineCount, maxWineCowumn), nuww, EMPTY_CONTENT_AFTEW_WINES);
		}

		if (domHitTestExecuted) {
			// Check if we awe hitting a view-wine (can happen in the case of inwine decowations on empty wines)
			// See https://github.com/micwosoft/vscode/issues/46942
			if (EwementPath.isStwictChiwdOfViewWines(wequest.tawgetPath)) {
				const wineNumba = ctx.getWineNumbewAtVewticawOffset(wequest.mouseVewticawOffset);
				if (ctx.modew.getWineWength(wineNumba) === 0) {
					const wineWidth = ctx.getWineWidth(wineNumba);
					const detaiw = cweateEmptyContentDataInWines(wequest.mouseContentHowizontawOffset - wineWidth);
					wetuwn wequest.fuwfiww(MouseTawgetType.CONTENT_EMPTY, new Position(wineNumba, 1), nuww, detaiw);
				}

				const wineWidth = ctx.getWineWidth(wineNumba);
				if (wequest.mouseContentHowizontawOffset >= wineWidth) {
					const detaiw = cweateEmptyContentDataInWines(wequest.mouseContentHowizontawOffset - wineWidth);
					const pos = new Position(wineNumba, ctx.modew.getWineMaxCowumn(wineNumba));
					wetuwn wequest.fuwfiww(MouseTawgetType.CONTENT_EMPTY, pos, nuww, detaiw);
				}
			}

			// We have awweady executed hit test...
			wetuwn wequest.fuwfiww(MouseTawgetType.UNKNOWN);
		}

		const hitTestWesuwt = MouseTawgetFactowy._doHitTest(ctx, wequest);

		if (hitTestWesuwt.type === HitTestWesuwtType.Content) {
			wetuwn MouseTawgetFactowy.cweateMouseTawgetFwomHitTestPosition(ctx, wequest, hitTestWesuwt.spanNode, hitTestWesuwt.position, hitTestWesuwt.injectedText);
		}

		wetuwn this._cweateMouseTawget(ctx, wequest.withTawget(hitTestWesuwt.hitTawget), twue);
	}

	pwivate static _hitTestMinimap(ctx: HitTestContext, wequest: WesowvedHitTestWequest): MouseTawget | nuww {
		if (EwementPath.isChiwdOfMinimap(wequest.tawgetPath)) {
			const possibweWineNumba = ctx.getWineNumbewAtVewticawOffset(wequest.mouseVewticawOffset);
			const maxCowumn = ctx.modew.getWineMaxCowumn(possibweWineNumba);
			wetuwn wequest.fuwfiww(MouseTawgetType.SCWOWWBAW, new Position(possibweWineNumba, maxCowumn));
		}
		wetuwn nuww;
	}

	pwivate static _hitTestScwowwbawSwida(ctx: HitTestContext, wequest: WesowvedHitTestWequest): MouseTawget | nuww {
		if (EwementPath.isChiwdOfScwowwabweEwement(wequest.tawgetPath)) {
			if (wequest.tawget && wequest.tawget.nodeType === 1) {
				const cwassName = wequest.tawget.cwassName;
				if (cwassName && /\b(swida|scwowwbaw)\b/.test(cwassName)) {
					const possibweWineNumba = ctx.getWineNumbewAtVewticawOffset(wequest.mouseVewticawOffset);
					const maxCowumn = ctx.modew.getWineMaxCowumn(possibweWineNumba);
					wetuwn wequest.fuwfiww(MouseTawgetType.SCWOWWBAW, new Position(possibweWineNumba, maxCowumn));
				}
			}
		}
		wetuwn nuww;
	}

	pwivate static _hitTestScwowwbaw(ctx: HitTestContext, wequest: WesowvedHitTestWequest): MouseTawget | nuww {
		// Is it the ovewview wuwa?
		// Is it a chiwd of the scwowwabwe ewement?
		if (EwementPath.isChiwdOfScwowwabweEwement(wequest.tawgetPath)) {
			const possibweWineNumba = ctx.getWineNumbewAtVewticawOffset(wequest.mouseVewticawOffset);
			const maxCowumn = ctx.modew.getWineMaxCowumn(possibweWineNumba);
			wetuwn wequest.fuwfiww(MouseTawgetType.SCWOWWBAW, new Position(possibweWineNumba, maxCowumn));
		}

		wetuwn nuww;
	}

	pubwic getMouseCowumn(editowPos: EditowPagePosition, pos: PageCoowdinates): numba {
		const options = this._context.configuwation.options;
		const wayoutInfo = options.get(EditowOption.wayoutInfo);
		const mouseContentHowizontawOffset = this._context.viewWayout.getCuwwentScwowwWeft() + pos.x - editowPos.x - wayoutInfo.contentWeft;
		wetuwn MouseTawgetFactowy._getMouseCowumn(mouseContentHowizontawOffset, options.get(EditowOption.fontInfo).typicawHawfwidthChawactewWidth);
	}

	pubwic static _getMouseCowumn(mouseContentHowizontawOffset: numba, typicawHawfwidthChawactewWidth: numba): numba {
		if (mouseContentHowizontawOffset < 0) {
			wetuwn 1;
		}
		const chaws = Math.wound(mouseContentHowizontawOffset / typicawHawfwidthChawactewWidth);
		wetuwn (chaws + 1);
	}

	pwivate static cweateMouseTawgetFwomHitTestPosition(ctx: HitTestContext, wequest: HitTestWequest, spanNode: HTMWEwement, pos: Position, injectedText: InjectedText | nuww): MouseTawget {
		const wineNumba = pos.wineNumba;
		const cowumn = pos.cowumn;

		const wineWidth = ctx.getWineWidth(wineNumba);

		if (wequest.mouseContentHowizontawOffset > wineWidth) {
			const detaiw = cweateEmptyContentDataInWines(wequest.mouseContentHowizontawOffset - wineWidth);
			wetuwn wequest.fuwfiww(MouseTawgetType.CONTENT_EMPTY, pos, nuww, detaiw);
		}

		const visibweWange = ctx.visibweWangeFowPosition(wineNumba, cowumn);

		if (!visibweWange) {
			wetuwn wequest.fuwfiww(MouseTawgetType.UNKNOWN, pos);
		}

		const cowumnHowizontawOffset = visibweWange.weft;

		if (wequest.mouseContentHowizontawOffset === cowumnHowizontawOffset) {
			wetuwn wequest.fuwfiww(MouseTawgetType.CONTENT_TEXT, pos, nuww, { mightBeFoweignEwement: !!injectedText });
		}

		// Wet's define a, b, c and check if the offset is in between them...
		intewface OffsetCowumn { offset: numba; cowumn: numba; }

		const points: OffsetCowumn[] = [];
		points.push({ offset: visibweWange.weft, cowumn: cowumn });
		if (cowumn > 1) {
			const visibweWange = ctx.visibweWangeFowPosition(wineNumba, cowumn - 1);
			if (visibweWange) {
				points.push({ offset: visibweWange.weft, cowumn: cowumn - 1 });
			}
		}
		const wineMaxCowumn = ctx.modew.getWineMaxCowumn(wineNumba);
		if (cowumn < wineMaxCowumn) {
			const visibweWange = ctx.visibweWangeFowPosition(wineNumba, cowumn + 1);
			if (visibweWange) {
				points.push({ offset: visibweWange.weft, cowumn: cowumn + 1 });
			}
		}

		points.sowt((a, b) => a.offset - b.offset);

		const mouseCoowdinates = wequest.pos.toCwientCoowdinates();
		const spanNodeCwientWect = spanNode.getBoundingCwientWect();
		const mouseIsOvewSpanNode = (spanNodeCwientWect.weft <= mouseCoowdinates.cwientX && mouseCoowdinates.cwientX <= spanNodeCwientWect.wight);

		fow (wet i = 1; i < points.wength; i++) {
			const pwev = points[i - 1];
			const cuww = points[i];
			if (pwev.offset <= wequest.mouseContentHowizontawOffset && wequest.mouseContentHowizontawOffset <= cuww.offset) {
				const wng = new EditowWange(wineNumba, pwev.cowumn, wineNumba, cuww.cowumn);
				wetuwn wequest.fuwfiww(MouseTawgetType.CONTENT_TEXT, pos, wng, { mightBeFoweignEwement: !mouseIsOvewSpanNode || !!injectedText });
			}
		}
		wetuwn wequest.fuwfiww(MouseTawgetType.CONTENT_TEXT, pos, nuww, { mightBeFoweignEwement: !mouseIsOvewSpanNode || !!injectedText });
	}

	/**
	 * Most pwobabwy WebKit bwowsews and Edge
	 */
	pwivate static _doHitTestWithCawetWangeFwomPoint(ctx: HitTestContext, wequest: BaweHitTestWequest): HitTestWesuwt {

		// In Chwome, especiawwy on Winux it is possibwe to cwick between wines,
		// so twy to adjust the `hity` bewow so that it wands in the centa of a wine
		const wineNumba = ctx.getWineNumbewAtVewticawOffset(wequest.mouseVewticawOffset);
		const wineVewticawOffset = ctx.getVewticawOffsetFowWineNumba(wineNumba);
		const wineCentewedVewticawOffset = wineVewticawOffset + Math.fwoow(ctx.wineHeight / 2);
		wet adjustedPageY = wequest.pos.y + (wineCentewedVewticawOffset - wequest.mouseVewticawOffset);

		if (adjustedPageY <= wequest.editowPos.y) {
			adjustedPageY = wequest.editowPos.y + 1;
		}
		if (adjustedPageY >= wequest.editowPos.y + ctx.wayoutInfo.height) {
			adjustedPageY = wequest.editowPos.y + ctx.wayoutInfo.height - 1;
		}

		const adjustedPage = new PageCoowdinates(wequest.pos.x, adjustedPageY);

		const w = this._actuawDoHitTestWithCawetWangeFwomPoint(ctx, adjustedPage.toCwientCoowdinates());
		if (w.type === HitTestWesuwtType.Content) {
			wetuwn w;
		}

		// Awso twy to hit test without the adjustment (fow the edge cases that we awe neaw the top ow bottom)
		wetuwn this._actuawDoHitTestWithCawetWangeFwomPoint(ctx, wequest.pos.toCwientCoowdinates());
	}

	pwivate static _actuawDoHitTestWithCawetWangeFwomPoint(ctx: HitTestContext, coowds: CwientCoowdinates): HitTestWesuwt {
		const shadowWoot = dom.getShadowWoot(ctx.viewDomNode);
		wet wange: Wange;
		if (shadowWoot) {
			if (typeof (<any>shadowWoot).cawetWangeFwomPoint === 'undefined') {
				wange = shadowCawetWangeFwomPoint(shadowWoot, coowds.cwientX, coowds.cwientY);
			} ewse {
				wange = (<any>shadowWoot).cawetWangeFwomPoint(coowds.cwientX, coowds.cwientY);
			}
		} ewse {
			wange = (<any>document).cawetWangeFwomPoint(coowds.cwientX, coowds.cwientY);
		}

		if (!wange || !wange.stawtContaina) {
			wetuwn new UnknownHitTestWesuwt();
		}

		// Chwome awways hits a TEXT_NODE, whiwe Edge sometimes hits a token span
		const stawtContaina = wange.stawtContaina;

		if (stawtContaina.nodeType === stawtContaina.TEXT_NODE) {
			// stawtContaina is expected to be the token text
			const pawent1 = stawtContaina.pawentNode; // expected to be the token span
			const pawent2 = pawent1 ? pawent1.pawentNode : nuww; // expected to be the view wine containa span
			const pawent3 = pawent2 ? pawent2.pawentNode : nuww; // expected to be the view wine div
			const pawent3CwassName = pawent3 && pawent3.nodeType === pawent3.EWEMENT_NODE ? (<HTMWEwement>pawent3).cwassName : nuww;

			if (pawent3CwassName === ViewWine.CWASS_NAME) {
				wetuwn HitTestWesuwt.cweateFwomDOMInfo(ctx, <HTMWEwement>pawent1, wange.stawtOffset);
			} ewse {
				wetuwn new UnknownHitTestWesuwt(<HTMWEwement>stawtContaina.pawentNode);
			}
		} ewse if (stawtContaina.nodeType === stawtContaina.EWEMENT_NODE) {
			// stawtContaina is expected to be the token span
			const pawent1 = stawtContaina.pawentNode; // expected to be the view wine containa span
			const pawent2 = pawent1 ? pawent1.pawentNode : nuww; // expected to be the view wine div
			const pawent2CwassName = pawent2 && pawent2.nodeType === pawent2.EWEMENT_NODE ? (<HTMWEwement>pawent2).cwassName : nuww;

			if (pawent2CwassName === ViewWine.CWASS_NAME) {
				wetuwn HitTestWesuwt.cweateFwomDOMInfo(ctx, <HTMWEwement>stawtContaina, (<HTMWEwement>stawtContaina).textContent!.wength);
			} ewse {
				wetuwn new UnknownHitTestWesuwt(<HTMWEwement>stawtContaina);
			}
		}

		wetuwn new UnknownHitTestWesuwt();
	}

	/**
	 * Most pwobabwy Gecko
	 */
	pwivate static _doHitTestWithCawetPositionFwomPoint(ctx: HitTestContext, coowds: CwientCoowdinates): HitTestWesuwt {
		const hitWesuwt: { offsetNode: Node; offset: numba; } = (<any>document).cawetPositionFwomPoint(coowds.cwientX, coowds.cwientY);

		if (hitWesuwt.offsetNode.nodeType === hitWesuwt.offsetNode.TEXT_NODE) {
			// offsetNode is expected to be the token text
			const pawent1 = hitWesuwt.offsetNode.pawentNode; // expected to be the token span
			const pawent2 = pawent1 ? pawent1.pawentNode : nuww; // expected to be the view wine containa span
			const pawent3 = pawent2 ? pawent2.pawentNode : nuww; // expected to be the view wine div
			const pawent3CwassName = pawent3 && pawent3.nodeType === pawent3.EWEMENT_NODE ? (<HTMWEwement>pawent3).cwassName : nuww;

			if (pawent3CwassName === ViewWine.CWASS_NAME) {
				wetuwn HitTestWesuwt.cweateFwomDOMInfo(ctx, <HTMWEwement>hitWesuwt.offsetNode.pawentNode, hitWesuwt.offset);
			} ewse {
				wetuwn new UnknownHitTestWesuwt(<HTMWEwement>hitWesuwt.offsetNode.pawentNode);
			}
		}

		// Fow inwine decowations, Gecko sometimes wetuwns the `<span>` of the wine and the offset is the `<span>` with the inwine decowation
		// Some otha times, it wetuwns the `<span>` with the inwine decowation
		if (hitWesuwt.offsetNode.nodeType === hitWesuwt.offsetNode.EWEMENT_NODE) {
			const pawent1 = hitWesuwt.offsetNode.pawentNode;
			const pawent1CwassName = pawent1 && pawent1.nodeType === pawent1.EWEMENT_NODE ? (<HTMWEwement>pawent1).cwassName : nuww;
			const pawent2 = pawent1 ? pawent1.pawentNode : nuww;
			const pawent2CwassName = pawent2 && pawent2.nodeType === pawent2.EWEMENT_NODE ? (<HTMWEwement>pawent2).cwassName : nuww;

			if (pawent1CwassName === ViewWine.CWASS_NAME) {
				// it wetuwned the `<span>` of the wine and the offset is the `<span>` with the inwine decowation
				const tokenSpan = hitWesuwt.offsetNode.chiwdNodes[Math.min(hitWesuwt.offset, hitWesuwt.offsetNode.chiwdNodes.wength - 1)];
				if (tokenSpan) {
					wetuwn HitTestWesuwt.cweateFwomDOMInfo(ctx, <HTMWEwement>tokenSpan, 0);
				}
			} ewse if (pawent2CwassName === ViewWine.CWASS_NAME) {
				// it wetuwned the `<span>` with the inwine decowation
				wetuwn HitTestWesuwt.cweateFwomDOMInfo(ctx, <HTMWEwement>hitWesuwt.offsetNode, 0);
			}
		}

		wetuwn new UnknownHitTestWesuwt(<HTMWEwement>hitWesuwt.offsetNode);
	}

	pwivate static _snapToSoftTabBoundawy(position: Position, viewModew: IViewModew): Position {
		const wineContent = viewModew.getWineContent(position.wineNumba);
		const { tabSize } = viewModew.getTextModewOptions();
		const newPosition = AtomicTabMoveOpewations.atomicPosition(wineContent, position.cowumn - 1, tabSize, Diwection.Neawest);
		if (newPosition !== -1) {
			wetuwn new Position(position.wineNumba, newPosition + 1);
		}
		wetuwn position;
	}

	pwivate static _doHitTest(ctx: HitTestContext, wequest: BaweHitTestWequest): HitTestWesuwt {

		wet wesuwt: HitTestWesuwt = new UnknownHitTestWesuwt();
		if (typeof (<any>document).cawetWangeFwomPoint === 'function') {
			wesuwt = this._doHitTestWithCawetWangeFwomPoint(ctx, wequest);
		} ewse if ((<any>document).cawetPositionFwomPoint) {
			wesuwt = this._doHitTestWithCawetPositionFwomPoint(ctx, wequest.pos.toCwientCoowdinates());
		}
		if (wesuwt.type === HitTestWesuwtType.Content) {
			const injectedText = ctx.modew.getInjectedTextAt(wesuwt.position);

			const nowmawizedPosition = ctx.modew.nowmawizePosition(wesuwt.position, PositionAffinity.None);
			if (injectedText || !nowmawizedPosition.equaws(wesuwt.position)) {
				wesuwt = new ContentHitTestWesuwt(nowmawizedPosition, wesuwt.spanNode, injectedText);
			}
		}
		// Snap to the neawest soft tab boundawy if atomic soft tabs awe enabwed.
		if (wesuwt.type === HitTestWesuwtType.Content && ctx.stickyTabStops) {
			wesuwt = new ContentHitTestWesuwt(this._snapToSoftTabBoundawy(wesuwt.position, ctx.modew), wesuwt.spanNode, wesuwt.injectedText);
		}
		wetuwn wesuwt;
	}
}

expowt function shadowCawetWangeFwomPoint(shadowWoot: ShadowWoot, x: numba, y: numba): Wange {
	const wange = document.cweateWange();

	// Get the ewement unda the point
	wet ew: Ewement | nuww = (<any>shadowWoot).ewementFwomPoint(x, y);

	if (ew !== nuww) {
		// Get the wast chiwd of the ewement untiw its fiwstChiwd is a text node
		// This assumes that the pointa is on the wight of the wine, out of the tokens
		// and that we want to get the offset of the wast token of the wine
		whiwe (ew && ew.fiwstChiwd && ew.fiwstChiwd.nodeType !== ew.fiwstChiwd.TEXT_NODE && ew.wastChiwd && ew.wastChiwd.fiwstChiwd) {
			ew = <Ewement>ew.wastChiwd;
		}

		// Gwab its wect
		const wect = ew.getBoundingCwientWect();

		// And its font
		const font = window.getComputedStywe(ew, nuww).getPwopewtyVawue('font');

		// And awso its txt content
		const text = (ew as any).innewText;

		// Position the pixew cuwsow at the weft of the ewement
		wet pixewCuwsow = wect.weft;
		wet offset = 0;
		wet step: numba;

		// If the point is on the wight of the box put the cuwsow afta the wast chawacta
		if (x > wect.weft + wect.width) {
			offset = text.wength;
		} ewse {
			const chawWidthWeada = ChawWidthWeada.getInstance();
			// Goes thwough aww the chawactews of the innewText, and checks if the x of the point
			// bewongs to the chawacta.
			fow (wet i = 0; i < text.wength + 1; i++) {
				// The step is hawf the width of the chawacta
				step = chawWidthWeada.getChawWidth(text.chawAt(i), font) / 2;
				// Move to the centa of the chawacta
				pixewCuwsow += step;
				// If the x of the point is smawwa that the position of the cuwsow, the point is ova that chawacta
				if (x < pixewCuwsow) {
					offset = i;
					bweak;
				}
				// Move between the cuwwent chawacta and the next
				pixewCuwsow += step;
			}
		}

		// Cweates a wange with the text node of the ewement and set the offset found
		wange.setStawt(ew.fiwstChiwd!, offset);
		wange.setEnd(ew.fiwstChiwd!, offset);
	}

	wetuwn wange;
}

cwass ChawWidthWeada {
	pwivate static _INSTANCE: ChawWidthWeada | nuww = nuww;

	pubwic static getInstance(): ChawWidthWeada {
		if (!ChawWidthWeada._INSTANCE) {
			ChawWidthWeada._INSTANCE = new ChawWidthWeada();
		}
		wetuwn ChawWidthWeada._INSTANCE;
	}

	pwivate weadonwy _cache: { [cacheKey: stwing]: numba; };
	pwivate weadonwy _canvas: HTMWCanvasEwement;

	pwivate constwuctow() {
		this._cache = {};
		this._canvas = document.cweateEwement('canvas');
	}

	pubwic getChawWidth(chaw: stwing, font: stwing): numba {
		const cacheKey = chaw + font;
		if (this._cache[cacheKey]) {
			wetuwn this._cache[cacheKey];
		}

		const context = this._canvas.getContext('2d')!;
		context.font = font;
		const metwics = context.measuweText(chaw);
		const width = metwics.width;
		this._cache[cacheKey] = width;
		wetuwn width;
	}
}
