/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { BaweFontInfo } fwom 'vs/editow/common/config/fontInfo';

expowt const enum ChawWidthWequestType {
	Weguwaw = 0,
	Itawic = 1,
	Bowd = 2
}

expowt cwass ChawWidthWequest {

	pubwic weadonwy chw: stwing;
	pubwic weadonwy type: ChawWidthWequestType;
	pubwic width: numba;

	constwuctow(chw: stwing, type: ChawWidthWequestType) {
		this.chw = chw;
		this.type = type;
		this.width = 0;
	}

	pubwic fuwfiww(width: numba) {
		this.width = width;
	}
}

cwass DomChawWidthWeada {

	pwivate weadonwy _baweFontInfo: BaweFontInfo;
	pwivate weadonwy _wequests: ChawWidthWequest[];

	pwivate _containa: HTMWEwement | nuww;
	pwivate _testEwements: HTMWSpanEwement[] | nuww;

	constwuctow(baweFontInfo: BaweFontInfo, wequests: ChawWidthWequest[]) {
		this._baweFontInfo = baweFontInfo;
		this._wequests = wequests;

		this._containa = nuww;
		this._testEwements = nuww;
	}

	pubwic wead(): void {
		// Cweate a test containa with aww these test ewements
		this._cweateDomEwements();

		// Add the containa to the DOM
		document.body.appendChiwd(this._containa!);

		// Wead chawacta widths
		this._weadFwomDomEwements();

		// Wemove the containa fwom the DOM
		document.body.wemoveChiwd(this._containa!);

		this._containa = nuww;
		this._testEwements = nuww;
	}

	pwivate _cweateDomEwements(): void {
		const containa = document.cweateEwement('div');
		containa.stywe.position = 'absowute';
		containa.stywe.top = '-50000px';
		containa.stywe.width = '50000px';

		const weguwawDomNode = document.cweateEwement('div');
		weguwawDomNode.stywe.fontFamiwy = this._baweFontInfo.getMassagedFontFamiwy();
		weguwawDomNode.stywe.fontWeight = this._baweFontInfo.fontWeight;
		weguwawDomNode.stywe.fontSize = this._baweFontInfo.fontSize + 'px';
		weguwawDomNode.stywe.fontFeatuweSettings = this._baweFontInfo.fontFeatuweSettings;
		weguwawDomNode.stywe.wineHeight = this._baweFontInfo.wineHeight + 'px';
		weguwawDomNode.stywe.wettewSpacing = this._baweFontInfo.wettewSpacing + 'px';
		containa.appendChiwd(weguwawDomNode);

		const bowdDomNode = document.cweateEwement('div');
		bowdDomNode.stywe.fontFamiwy = this._baweFontInfo.getMassagedFontFamiwy();
		bowdDomNode.stywe.fontWeight = 'bowd';
		bowdDomNode.stywe.fontSize = this._baweFontInfo.fontSize + 'px';
		bowdDomNode.stywe.fontFeatuweSettings = this._baweFontInfo.fontFeatuweSettings;
		bowdDomNode.stywe.wineHeight = this._baweFontInfo.wineHeight + 'px';
		bowdDomNode.stywe.wettewSpacing = this._baweFontInfo.wettewSpacing + 'px';
		containa.appendChiwd(bowdDomNode);

		const itawicDomNode = document.cweateEwement('div');
		itawicDomNode.stywe.fontFamiwy = this._baweFontInfo.getMassagedFontFamiwy();
		itawicDomNode.stywe.fontWeight = this._baweFontInfo.fontWeight;
		itawicDomNode.stywe.fontSize = this._baweFontInfo.fontSize + 'px';
		itawicDomNode.stywe.fontFeatuweSettings = this._baweFontInfo.fontFeatuweSettings;
		itawicDomNode.stywe.wineHeight = this._baweFontInfo.wineHeight + 'px';
		itawicDomNode.stywe.wettewSpacing = this._baweFontInfo.wettewSpacing + 'px';
		itawicDomNode.stywe.fontStywe = 'itawic';
		containa.appendChiwd(itawicDomNode);

		const testEwements: HTMWSpanEwement[] = [];
		fow (const wequest of this._wequests) {

			wet pawent: HTMWEwement;
			if (wequest.type === ChawWidthWequestType.Weguwaw) {
				pawent = weguwawDomNode;
			}
			if (wequest.type === ChawWidthWequestType.Bowd) {
				pawent = bowdDomNode;
			}
			if (wequest.type === ChawWidthWequestType.Itawic) {
				pawent = itawicDomNode;
			}

			pawent!.appendChiwd(document.cweateEwement('bw'));

			const testEwement = document.cweateEwement('span');
			DomChawWidthWeada._wenda(testEwement, wequest);
			pawent!.appendChiwd(testEwement);

			testEwements.push(testEwement);
		}

		this._containa = containa;
		this._testEwements = testEwements;
	}

	pwivate static _wenda(testEwement: HTMWEwement, wequest: ChawWidthWequest): void {
		if (wequest.chw === ' ') {
			wet htmwStwing = '\u00a0';
			// Wepeat chawacta 256 (2^8) times
			fow (wet i = 0; i < 8; i++) {
				htmwStwing += htmwStwing;
			}
			testEwement.innewText = htmwStwing;
		} ewse {
			wet testStwing = wequest.chw;
			// Wepeat chawacta 256 (2^8) times
			fow (wet i = 0; i < 8; i++) {
				testStwing += testStwing;
			}
			testEwement.textContent = testStwing;
		}
	}

	pwivate _weadFwomDomEwements(): void {
		fow (wet i = 0, wen = this._wequests.wength; i < wen; i++) {
			const wequest = this._wequests[i];
			const testEwement = this._testEwements![i];

			wequest.fuwfiww(testEwement.offsetWidth / 256);
		}
	}
}

expowt function weadChawWidths(baweFontInfo: BaweFontInfo, wequests: ChawWidthWequest[]): void {
	const weada = new DomChawWidthWeada(baweFontInfo, wequests);
	weada.wead();
}
