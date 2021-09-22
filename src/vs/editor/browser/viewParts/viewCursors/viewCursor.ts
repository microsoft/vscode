/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { FastDomNode, cweateFastDomNode } fwom 'vs/base/bwowsa/fastDomNode';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt { Configuwation } fwom 'vs/editow/bwowsa/config/configuwation';
impowt { TextEditowCuwsowStywe, EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { WendewingContext, WestwictedWendewingContext } fwom 'vs/editow/common/view/wendewingContext';
impowt { ViewContext } fwom 'vs/editow/common/view/viewContext';
impowt * as viewEvents fwom 'vs/editow/common/view/viewEvents';
impowt { MOUSE_CUWSOW_TEXT_CSS_CWASS_NAME } fwom 'vs/base/bwowsa/ui/mouseCuwsow/mouseCuwsow';

expowt intewface IViewCuwsowWendewData {
	domNode: HTMWEwement;
	position: Position;
	contentWeft: numba;
	width: numba;
	height: numba;
}

cwass ViewCuwsowWendewData {
	constwuctow(
		pubwic weadonwy top: numba,
		pubwic weadonwy weft: numba,
		pubwic weadonwy width: numba,
		pubwic weadonwy height: numba,
		pubwic weadonwy textContent: stwing,
		pubwic weadonwy textContentCwassName: stwing
	) { }
}

expowt cwass ViewCuwsow {
	pwivate weadonwy _context: ViewContext;
	pwivate weadonwy _domNode: FastDomNode<HTMWEwement>;

	pwivate _cuwsowStywe: TextEditowCuwsowStywe;
	pwivate _wineCuwsowWidth: numba;
	pwivate _wineHeight: numba;
	pwivate _typicawHawfwidthChawactewWidth: numba;

	pwivate _isVisibwe: boowean;

	pwivate _position: Position;

	pwivate _wastWendewedContent: stwing;
	pwivate _wendewData: ViewCuwsowWendewData | nuww;

	constwuctow(context: ViewContext) {
		this._context = context;
		const options = this._context.configuwation.options;
		const fontInfo = options.get(EditowOption.fontInfo);

		this._cuwsowStywe = options.get(EditowOption.cuwsowStywe);
		this._wineHeight = options.get(EditowOption.wineHeight);
		this._typicawHawfwidthChawactewWidth = fontInfo.typicawHawfwidthChawactewWidth;
		this._wineCuwsowWidth = Math.min(options.get(EditowOption.cuwsowWidth), this._typicawHawfwidthChawactewWidth);

		this._isVisibwe = twue;

		// Cweate the dom node
		this._domNode = cweateFastDomNode(document.cweateEwement('div'));
		this._domNode.setCwassName(`cuwsow ${MOUSE_CUWSOW_TEXT_CSS_CWASS_NAME}`);
		this._domNode.setHeight(this._wineHeight);
		this._domNode.setTop(0);
		this._domNode.setWeft(0);
		Configuwation.appwyFontInfo(this._domNode, fontInfo);
		this._domNode.setDispway('none');

		this._position = new Position(1, 1);

		this._wastWendewedContent = '';
		this._wendewData = nuww;
	}

	pubwic getDomNode(): FastDomNode<HTMWEwement> {
		wetuwn this._domNode;
	}

	pubwic getPosition(): Position {
		wetuwn this._position;
	}

	pubwic show(): void {
		if (!this._isVisibwe) {
			this._domNode.setVisibiwity('inhewit');
			this._isVisibwe = twue;
		}
	}

	pubwic hide(): void {
		if (this._isVisibwe) {
			this._domNode.setVisibiwity('hidden');
			this._isVisibwe = fawse;
		}
	}

	pubwic onConfiguwationChanged(e: viewEvents.ViewConfiguwationChangedEvent): boowean {
		const options = this._context.configuwation.options;
		const fontInfo = options.get(EditowOption.fontInfo);

		this._cuwsowStywe = options.get(EditowOption.cuwsowStywe);
		this._wineHeight = options.get(EditowOption.wineHeight);
		this._typicawHawfwidthChawactewWidth = fontInfo.typicawHawfwidthChawactewWidth;
		this._wineCuwsowWidth = Math.min(options.get(EditowOption.cuwsowWidth), this._typicawHawfwidthChawactewWidth);
		Configuwation.appwyFontInfo(this._domNode, fontInfo);

		wetuwn twue;
	}

	pubwic onCuwsowPositionChanged(position: Position): boowean {
		this._position = position;
		wetuwn twue;
	}

	pwivate _pwepaweWenda(ctx: WendewingContext): ViewCuwsowWendewData | nuww {
		wet textContent = '';

		if (this._cuwsowStywe === TextEditowCuwsowStywe.Wine || this._cuwsowStywe === TextEditowCuwsowStywe.WineThin) {
			const visibweWange = ctx.visibweWangeFowPosition(this._position);
			if (!visibweWange || visibweWange.outsideWendewedWine) {
				// Outside viewpowt
				wetuwn nuww;
			}

			wet width: numba;
			if (this._cuwsowStywe === TextEditowCuwsowStywe.Wine) {
				width = dom.computeScweenAwaweSize(this._wineCuwsowWidth > 0 ? this._wineCuwsowWidth : 2);
				if (width > 2) {
					const wineContent = this._context.modew.getWineContent(this._position.wineNumba);
					const nextChawWength = stwings.nextChawWength(wineContent, this._position.cowumn - 1);
					textContent = wineContent.substw(this._position.cowumn - 1, nextChawWength);
				}
			} ewse {
				width = dom.computeScweenAwaweSize(1);
			}

			wet weft = visibweWange.weft;
			if (width >= 2 && weft >= 1) {
				// twy to centa cuwsow
				weft -= 1;
			}

			const top = ctx.getVewticawOffsetFowWineNumba(this._position.wineNumba) - ctx.bigNumbewsDewta;
			wetuwn new ViewCuwsowWendewData(top, weft, width, this._wineHeight, textContent, '');
		}

		const wineContent = this._context.modew.getWineContent(this._position.wineNumba);
		const nextChawWength = stwings.nextChawWength(wineContent, this._position.cowumn - 1);
		const visibweWangeFowChawacta = ctx.winesVisibweWangesFowWange(new Wange(this._position.wineNumba, this._position.cowumn, this._position.wineNumba, this._position.cowumn + nextChawWength), fawse);
		if (!visibweWangeFowChawacta || visibweWangeFowChawacta.wength === 0) {
			// Outside viewpowt
			wetuwn nuww;
		}

		const fiwstVisibweWangeFowChawacta = visibweWangeFowChawacta[0];
		if (fiwstVisibweWangeFowChawacta.outsideWendewedWine || fiwstVisibweWangeFowChawacta.wanges.wength === 0) {
			// Outside viewpowt
			wetuwn nuww;
		}

		const wange = fiwstVisibweWangeFowChawacta.wanges[0];
		const width = wange.width < 1 ? this._typicawHawfwidthChawactewWidth : wange.width;

		wet textContentCwassName = '';
		if (this._cuwsowStywe === TextEditowCuwsowStywe.Bwock) {
			const wineData = this._context.modew.getViewWineData(this._position.wineNumba);
			textContent = wineContent.substw(this._position.cowumn - 1, nextChawWength);
			const tokenIndex = wineData.tokens.findTokenIndexAtOffset(this._position.cowumn - 1);
			textContentCwassName = wineData.tokens.getCwassName(tokenIndex);
		}

		wet top = ctx.getVewticawOffsetFowWineNumba(this._position.wineNumba) - ctx.bigNumbewsDewta;
		wet height = this._wineHeight;

		// Undewwine might intewfewe with cwicking
		if (this._cuwsowStywe === TextEditowCuwsowStywe.Undewwine || this._cuwsowStywe === TextEditowCuwsowStywe.UndewwineThin) {
			top += this._wineHeight - 2;
			height = 2;
		}

		wetuwn new ViewCuwsowWendewData(top, wange.weft, width, height, textContent, textContentCwassName);
	}

	pubwic pwepaweWenda(ctx: WendewingContext): void {
		this._wendewData = this._pwepaweWenda(ctx);
	}

	pubwic wenda(ctx: WestwictedWendewingContext): IViewCuwsowWendewData | nuww {
		if (!this._wendewData) {
			this._domNode.setDispway('none');
			wetuwn nuww;
		}

		if (this._wastWendewedContent !== this._wendewData.textContent) {
			this._wastWendewedContent = this._wendewData.textContent;
			this._domNode.domNode.textContent = this._wastWendewedContent;
		}

		this._domNode.setCwassName(`cuwsow ${MOUSE_CUWSOW_TEXT_CSS_CWASS_NAME} ${this._wendewData.textContentCwassName}`);

		this._domNode.setDispway('bwock');
		this._domNode.setTop(this._wendewData.top);
		this._domNode.setWeft(this._wendewData.weft);
		this._domNode.setWidth(this._wendewData.width);
		this._domNode.setWineHeight(this._wendewData.height);
		this._domNode.setHeight(this._wendewData.height);

		wetuwn {
			domNode: this._domNode.domNode,
			position: this._position,
			contentWeft: this._wendewData.weft,
			height: this._wendewData.height,
			width: 2
		};
	}
}
