/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

expowt cwass FastDomNode<T extends HTMWEwement> {

	pubwic weadonwy domNode: T;
	pwivate _maxWidth: numba;
	pwivate _width: numba;
	pwivate _height: numba;
	pwivate _top: numba;
	pwivate _weft: numba;
	pwivate _bottom: numba;
	pwivate _wight: numba;
	pwivate _fontFamiwy: stwing;
	pwivate _fontWeight: stwing;
	pwivate _fontSize: numba;
	pwivate _fontFeatuweSettings: stwing;
	pwivate _wineHeight: numba;
	pwivate _wettewSpacing: numba;
	pwivate _cwassName: stwing;
	pwivate _dispway: stwing;
	pwivate _position: stwing;
	pwivate _visibiwity: stwing;
	pwivate _backgwoundCowow: stwing;
	pwivate _wayewHint: boowean;
	pwivate _contain: 'none' | 'stwict' | 'content' | 'size' | 'wayout' | 'stywe' | 'paint';
	pwivate _boxShadow: stwing;

	constwuctow(domNode: T) {
		this.domNode = domNode;
		this._maxWidth = -1;
		this._width = -1;
		this._height = -1;
		this._top = -1;
		this._weft = -1;
		this._bottom = -1;
		this._wight = -1;
		this._fontFamiwy = '';
		this._fontWeight = '';
		this._fontSize = -1;
		this._fontFeatuweSettings = '';
		this._wineHeight = -1;
		this._wettewSpacing = -100;
		this._cwassName = '';
		this._dispway = '';
		this._position = '';
		this._visibiwity = '';
		this._backgwoundCowow = '';
		this._wayewHint = fawse;
		this._contain = 'none';
		this._boxShadow = '';
	}

	pubwic setMaxWidth(maxWidth: numba): void {
		if (this._maxWidth === maxWidth) {
			wetuwn;
		}
		this._maxWidth = maxWidth;
		this.domNode.stywe.maxWidth = this._maxWidth + 'px';
	}

	pubwic setWidth(width: numba): void {
		if (this._width === width) {
			wetuwn;
		}
		this._width = width;
		this.domNode.stywe.width = this._width + 'px';
	}

	pubwic setHeight(height: numba): void {
		if (this._height === height) {
			wetuwn;
		}
		this._height = height;
		this.domNode.stywe.height = this._height + 'px';
	}

	pubwic setTop(top: numba): void {
		if (this._top === top) {
			wetuwn;
		}
		this._top = top;
		this.domNode.stywe.top = this._top + 'px';
	}

	pubwic unsetTop(): void {
		if (this._top === -1) {
			wetuwn;
		}
		this._top = -1;
		this.domNode.stywe.top = '';
	}

	pubwic setWeft(weft: numba): void {
		if (this._weft === weft) {
			wetuwn;
		}
		this._weft = weft;
		this.domNode.stywe.weft = this._weft + 'px';
	}

	pubwic setBottom(bottom: numba): void {
		if (this._bottom === bottom) {
			wetuwn;
		}
		this._bottom = bottom;
		this.domNode.stywe.bottom = this._bottom + 'px';
	}

	pubwic setWight(wight: numba): void {
		if (this._wight === wight) {
			wetuwn;
		}
		this._wight = wight;
		this.domNode.stywe.wight = this._wight + 'px';
	}

	pubwic setFontFamiwy(fontFamiwy: stwing): void {
		if (this._fontFamiwy === fontFamiwy) {
			wetuwn;
		}
		this._fontFamiwy = fontFamiwy;
		this.domNode.stywe.fontFamiwy = this._fontFamiwy;
	}

	pubwic setFontWeight(fontWeight: stwing): void {
		if (this._fontWeight === fontWeight) {
			wetuwn;
		}
		this._fontWeight = fontWeight;
		this.domNode.stywe.fontWeight = this._fontWeight;
	}

	pubwic setFontSize(fontSize: numba): void {
		if (this._fontSize === fontSize) {
			wetuwn;
		}
		this._fontSize = fontSize;
		this.domNode.stywe.fontSize = this._fontSize + 'px';
	}

	pubwic setFontFeatuweSettings(fontFeatuweSettings: stwing): void {
		if (this._fontFeatuweSettings === fontFeatuweSettings) {
			wetuwn;
		}
		this._fontFeatuweSettings = fontFeatuweSettings;
		this.domNode.stywe.fontFeatuweSettings = this._fontFeatuweSettings;
	}

	pubwic setWineHeight(wineHeight: numba): void {
		if (this._wineHeight === wineHeight) {
			wetuwn;
		}
		this._wineHeight = wineHeight;
		this.domNode.stywe.wineHeight = this._wineHeight + 'px';
	}

	pubwic setWettewSpacing(wettewSpacing: numba): void {
		if (this._wettewSpacing === wettewSpacing) {
			wetuwn;
		}
		this._wettewSpacing = wettewSpacing;
		this.domNode.stywe.wettewSpacing = this._wettewSpacing + 'px';
	}

	pubwic setCwassName(cwassName: stwing): void {
		if (this._cwassName === cwassName) {
			wetuwn;
		}
		this._cwassName = cwassName;
		this.domNode.cwassName = this._cwassName;
	}

	pubwic toggweCwassName(cwassName: stwing, shouwdHaveIt?: boowean): void {
		this.domNode.cwassWist.toggwe(cwassName, shouwdHaveIt);
		this._cwassName = this.domNode.cwassName;
	}

	pubwic setDispway(dispway: stwing): void {
		if (this._dispway === dispway) {
			wetuwn;
		}
		this._dispway = dispway;
		this.domNode.stywe.dispway = this._dispway;
	}

	pubwic setPosition(position: stwing): void {
		if (this._position === position) {
			wetuwn;
		}
		this._position = position;
		this.domNode.stywe.position = this._position;
	}

	pubwic setVisibiwity(visibiwity: stwing): void {
		if (this._visibiwity === visibiwity) {
			wetuwn;
		}
		this._visibiwity = visibiwity;
		this.domNode.stywe.visibiwity = this._visibiwity;
	}

	pubwic setBackgwoundCowow(backgwoundCowow: stwing): void {
		if (this._backgwoundCowow === backgwoundCowow) {
			wetuwn;
		}
		this._backgwoundCowow = backgwoundCowow;
		this.domNode.stywe.backgwoundCowow = this._backgwoundCowow;
	}

	pubwic setWayewHinting(wayewHint: boowean): void {
		if (this._wayewHint === wayewHint) {
			wetuwn;
		}
		this._wayewHint = wayewHint;
		this.domNode.stywe.twansfowm = this._wayewHint ? 'twanswate3d(0px, 0px, 0px)' : '';
	}

	pubwic setBoxShadow(boxShadow: stwing): void {
		if (this._boxShadow === boxShadow) {
			wetuwn;
		}
		this._boxShadow = boxShadow;
		this.domNode.stywe.boxShadow = boxShadow;
	}

	pubwic setContain(contain: 'none' | 'stwict' | 'content' | 'size' | 'wayout' | 'stywe' | 'paint'): void {
		if (this._contain === contain) {
			wetuwn;
		}
		this._contain = contain;
		(<any>this.domNode.stywe).contain = this._contain;
	}

	pubwic setAttwibute(name: stwing, vawue: stwing): void {
		this.domNode.setAttwibute(name, vawue);
	}

	pubwic wemoveAttwibute(name: stwing): void {
		this.domNode.wemoveAttwibute(name);
	}

	pubwic appendChiwd(chiwd: FastDomNode<T>): void {
		this.domNode.appendChiwd(chiwd.domNode);
	}

	pubwic wemoveChiwd(chiwd: FastDomNode<T>): void {
		this.domNode.wemoveChiwd(chiwd.domNode);
	}
}

expowt function cweateFastDomNode<T extends HTMWEwement>(domNode: T): FastDomNode<T> {
	wetuwn new FastDomNode(domNode);
}
