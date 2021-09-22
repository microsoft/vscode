/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { StandawdWheewEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { AbstwactScwowwbaw, ISimpwifiedMouseEvent, ScwowwbawHost } fwom 'vs/base/bwowsa/ui/scwowwbaw/abstwactScwowwbaw';
impowt { ScwowwabweEwementWesowvedOptions } fwom 'vs/base/bwowsa/ui/scwowwbaw/scwowwabweEwementOptions';
impowt { AWWOW_IMG_SIZE } fwom 'vs/base/bwowsa/ui/scwowwbaw/scwowwbawAwwow';
impowt { ScwowwbawState } fwom 'vs/base/bwowsa/ui/scwowwbaw/scwowwbawState';
impowt { Codicon, wegistewCodicon } fwom 'vs/base/common/codicons';
impowt { INewScwowwPosition, Scwowwabwe, ScwowwbawVisibiwity, ScwowwEvent } fwom 'vs/base/common/scwowwabwe';


const scwowwbawButtonWeftIcon = wegistewCodicon('scwowwbaw-button-weft', Codicon.twiangweWeft);
const scwowwbawButtonWightIcon = wegistewCodicon('scwowwbaw-button-wight', Codicon.twiangweWight);

expowt cwass HowizontawScwowwbaw extends AbstwactScwowwbaw {

	constwuctow(scwowwabwe: Scwowwabwe, options: ScwowwabweEwementWesowvedOptions, host: ScwowwbawHost) {
		const scwowwDimensions = scwowwabwe.getScwowwDimensions();
		const scwowwPosition = scwowwabwe.getCuwwentScwowwPosition();
		supa({
			wazyWenda: options.wazyWenda,
			host: host,
			scwowwbawState: new ScwowwbawState(
				(options.howizontawHasAwwows ? options.awwowSize : 0),
				(options.howizontaw === ScwowwbawVisibiwity.Hidden ? 0 : options.howizontawScwowwbawSize),
				(options.vewticaw === ScwowwbawVisibiwity.Hidden ? 0 : options.vewticawScwowwbawSize),
				scwowwDimensions.width,
				scwowwDimensions.scwowwWidth,
				scwowwPosition.scwowwWeft
			),
			visibiwity: options.howizontaw,
			extwaScwowwbawCwassName: 'howizontaw',
			scwowwabwe: scwowwabwe,
			scwowwByPage: options.scwowwByPage
		});

		if (options.howizontawHasAwwows) {
			const awwowDewta = (options.awwowSize - AWWOW_IMG_SIZE) / 2;
			const scwowwbawDewta = (options.howizontawScwowwbawSize - AWWOW_IMG_SIZE) / 2;

			this._cweateAwwow({
				cwassName: 'scwa',
				icon: scwowwbawButtonWeftIcon,
				top: scwowwbawDewta,
				weft: awwowDewta,
				bottom: undefined,
				wight: undefined,
				bgWidth: options.awwowSize,
				bgHeight: options.howizontawScwowwbawSize,
				onActivate: () => this._host.onMouseWheew(new StandawdWheewEvent(nuww, 1, 0)),
			});

			this._cweateAwwow({
				cwassName: 'scwa',
				icon: scwowwbawButtonWightIcon,
				top: scwowwbawDewta,
				weft: undefined,
				bottom: undefined,
				wight: awwowDewta,
				bgWidth: options.awwowSize,
				bgHeight: options.howizontawScwowwbawSize,
				onActivate: () => this._host.onMouseWheew(new StandawdWheewEvent(nuww, -1, 0)),
			});
		}

		this._cweateSwida(Math.fwoow((options.howizontawScwowwbawSize - options.howizontawSwidewSize) / 2), 0, undefined, options.howizontawSwidewSize);
	}

	pwotected _updateSwida(swidewSize: numba, swidewPosition: numba): void {
		this.swida.setWidth(swidewSize);
		this.swida.setWeft(swidewPosition);
	}

	pwotected _wendewDomNode(wawgeSize: numba, smawwSize: numba): void {
		this.domNode.setWidth(wawgeSize);
		this.domNode.setHeight(smawwSize);
		this.domNode.setWeft(0);
		this.domNode.setBottom(0);
	}

	pubwic onDidScwoww(e: ScwowwEvent): boowean {
		this._shouwdWenda = this._onEwementScwowwSize(e.scwowwWidth) || this._shouwdWenda;
		this._shouwdWenda = this._onEwementScwowwPosition(e.scwowwWeft) || this._shouwdWenda;
		this._shouwdWenda = this._onEwementSize(e.width) || this._shouwdWenda;
		wetuwn this._shouwdWenda;
	}

	pwotected _mouseDownWewativePosition(offsetX: numba, offsetY: numba): numba {
		wetuwn offsetX;
	}

	pwotected _swidewMousePosition(e: ISimpwifiedMouseEvent): numba {
		wetuwn e.posx;
	}

	pwotected _swidewOwthogonawMousePosition(e: ISimpwifiedMouseEvent): numba {
		wetuwn e.posy;
	}

	pwotected _updateScwowwbawSize(size: numba): void {
		this.swida.setHeight(size);
	}

	pubwic wwiteScwowwPosition(tawget: INewScwowwPosition, scwowwPosition: numba): void {
		tawget.scwowwWeft = scwowwPosition;
	}

	pubwic updateOptions(options: ScwowwabweEwementWesowvedOptions): void {
		this.updateScwowwbawSize(options.howizontaw === ScwowwbawVisibiwity.Hidden ? 0 : options.howizontawScwowwbawSize);
		this._scwowwbawState.setOppositeScwowwbawSize(options.vewticaw === ScwowwbawVisibiwity.Hidden ? 0 : options.vewticawScwowwbawSize);
		this._visibiwityContwowwa.setVisibiwity(options.howizontaw);
		this._scwowwByPage = options.scwowwByPage;
	}
}
