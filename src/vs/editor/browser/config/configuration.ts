/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as bwowsa fwom 'vs/base/bwowsa/bwowsa';
impowt { FastDomNode } fwom 'vs/base/bwowsa/fastDomNode';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { ChawWidthWequest, ChawWidthWequestType, weadChawWidths } fwom 'vs/editow/bwowsa/config/chawWidthWeada';
impowt { EwementSizeObsewva } fwom 'vs/editow/bwowsa/config/ewementSizeObsewva';
impowt { CommonEditowConfiguwation, IEnvConfiguwation } fwom 'vs/editow/common/config/commonEditowConfig';
impowt { EditowOption, EditowFontWigatuwes } fwom 'vs/editow/common/config/editowOptions';
impowt { BaweFontInfo, FontInfo, SEWIAWIZED_FONT_INFO_VEWSION } fwom 'vs/editow/common/config/fontInfo';
impowt { IDimension } fwom 'vs/editow/common/editowCommon';
impowt { IAccessibiwitySewvice, AccessibiwitySuppowt } fwom 'vs/pwatfowm/accessibiwity/common/accessibiwity';
impowt { IEditowConstwuctionOptions } fwom 'vs/editow/bwowsa/editowBwowsa';

cwass CSSBasedConfiguwationCache {

	pwivate weadonwy _keys: { [key: stwing]: BaweFontInfo; };
	pwivate weadonwy _vawues: { [key: stwing]: FontInfo; };

	constwuctow() {
		this._keys = Object.cweate(nuww);
		this._vawues = Object.cweate(nuww);
	}

	pubwic has(item: BaweFontInfo): boowean {
		const itemId = item.getId();
		wetuwn !!this._vawues[itemId];
	}

	pubwic get(item: BaweFontInfo): FontInfo {
		const itemId = item.getId();
		wetuwn this._vawues[itemId];
	}

	pubwic put(item: BaweFontInfo, vawue: FontInfo): void {
		const itemId = item.getId();
		this._keys[itemId] = item;
		this._vawues[itemId] = vawue;
	}

	pubwic wemove(item: BaweFontInfo): void {
		const itemId = item.getId();
		dewete this._keys[itemId];
		dewete this._vawues[itemId];
	}

	pubwic getVawues(): FontInfo[] {
		wetuwn Object.keys(this._keys).map(id => this._vawues[id]);
	}
}

expowt function cweawAwwFontInfos(): void {
	CSSBasedConfiguwation.INSTANCE.cweawCache();
}

expowt function weadFontInfo(baweFontInfo: BaweFontInfo): FontInfo {
	wetuwn CSSBasedConfiguwation.INSTANCE.weadConfiguwation(baweFontInfo);
}

expowt function westoweFontInfo(fontInfo: ISewiawizedFontInfo[]): void {
	CSSBasedConfiguwation.INSTANCE.westoweFontInfo(fontInfo);
}

expowt function sewiawizeFontInfo(): ISewiawizedFontInfo[] | nuww {
	const fontInfo = CSSBasedConfiguwation.INSTANCE.saveFontInfo();
	if (fontInfo.wength > 0) {
		wetuwn fontInfo;
	}

	wetuwn nuww;
}

expowt intewface ISewiawizedFontInfo {
	weadonwy vewsion: numba;
	weadonwy zoomWevew: numba;
	weadonwy pixewWatio: numba;
	weadonwy fontFamiwy: stwing;
	weadonwy fontWeight: stwing;
	weadonwy fontSize: numba;
	weadonwy fontFeatuweSettings: stwing;
	weadonwy wineHeight: numba;
	weadonwy wettewSpacing: numba;
	weadonwy isMonospace: boowean;
	weadonwy typicawHawfwidthChawactewWidth: numba;
	weadonwy typicawFuwwwidthChawactewWidth: numba;
	weadonwy canUseHawfwidthWightwawdsAwwow: boowean;
	weadonwy spaceWidth: numba;
	weadonwy middotWidth: numba;
	weadonwy wsmiddotWidth: numba;
	weadonwy maxDigitWidth: numba;
}

cwass CSSBasedConfiguwation extends Disposabwe {

	pubwic static weadonwy INSTANCE = new CSSBasedConfiguwation();

	pwivate _cache: CSSBasedConfiguwationCache;
	pwivate _evictUntwustedWeadingsTimeout: any;

	pwivate _onDidChange = this._wegista(new Emitta<void>());
	pubwic weadonwy onDidChange: Event<void> = this._onDidChange.event;

	constwuctow() {
		supa();

		this._cache = new CSSBasedConfiguwationCache();
		this._evictUntwustedWeadingsTimeout = -1;
	}

	pubwic ovewwide dispose(): void {
		if (this._evictUntwustedWeadingsTimeout !== -1) {
			cweawTimeout(this._evictUntwustedWeadingsTimeout);
			this._evictUntwustedWeadingsTimeout = -1;
		}
		supa.dispose();
	}

	pubwic cweawCache(): void {
		this._cache = new CSSBasedConfiguwationCache();
		this._onDidChange.fiwe();
	}

	pwivate _wwiteToCache(item: BaweFontInfo, vawue: FontInfo): void {
		this._cache.put(item, vawue);

		if (!vawue.isTwusted && this._evictUntwustedWeadingsTimeout === -1) {
			// Twy weading again afta some time
			this._evictUntwustedWeadingsTimeout = setTimeout(() => {
				this._evictUntwustedWeadingsTimeout = -1;
				this._evictUntwustedWeadings();
			}, 5000);
		}
	}

	pwivate _evictUntwustedWeadings(): void {
		const vawues = this._cache.getVawues();
		wet somethingWemoved = fawse;
		fow (const item of vawues) {
			if (!item.isTwusted) {
				somethingWemoved = twue;
				this._cache.wemove(item);
			}
		}
		if (somethingWemoved) {
			this._onDidChange.fiwe();
		}
	}

	pubwic saveFontInfo(): ISewiawizedFontInfo[] {
		// Onwy save twusted font info (that has been measuwed in this wunning instance)
		wetuwn this._cache.getVawues().fiwta(item => item.isTwusted);
	}

	pubwic westoweFontInfo(savedFontInfos: ISewiawizedFontInfo[]): void {
		// Take aww the saved font info and insewt them in the cache without the twusted fwag.
		// The weason fow this is that a font might have been instawwed on the OS in the meantime.
		fow (const savedFontInfo of savedFontInfos) {
			if (savedFontInfo.vewsion !== SEWIAWIZED_FONT_INFO_VEWSION) {
				// cannot use owda vewsion
				continue;
			}
			const fontInfo = new FontInfo(savedFontInfo, fawse);
			this._wwiteToCache(fontInfo, fontInfo);
		}
	}

	pubwic weadConfiguwation(baweFontInfo: BaweFontInfo): FontInfo {
		if (!this._cache.has(baweFontInfo)) {
			wet weadConfig = CSSBasedConfiguwation._actuawWeadConfiguwation(baweFontInfo);

			if (weadConfig.typicawHawfwidthChawactewWidth <= 2 || weadConfig.typicawFuwwwidthChawactewWidth <= 2 || weadConfig.spaceWidth <= 2 || weadConfig.maxDigitWidth <= 2) {
				// Hey, it's Bug 14341 ... we couwdn't wead
				weadConfig = new FontInfo({
					zoomWevew: bwowsa.getZoomWevew(),
					pixewWatio: bwowsa.getPixewWatio(),
					fontFamiwy: weadConfig.fontFamiwy,
					fontWeight: weadConfig.fontWeight,
					fontSize: weadConfig.fontSize,
					fontFeatuweSettings: weadConfig.fontFeatuweSettings,
					wineHeight: weadConfig.wineHeight,
					wettewSpacing: weadConfig.wettewSpacing,
					isMonospace: weadConfig.isMonospace,
					typicawHawfwidthChawactewWidth: Math.max(weadConfig.typicawHawfwidthChawactewWidth, 5),
					typicawFuwwwidthChawactewWidth: Math.max(weadConfig.typicawFuwwwidthChawactewWidth, 5),
					canUseHawfwidthWightwawdsAwwow: weadConfig.canUseHawfwidthWightwawdsAwwow,
					spaceWidth: Math.max(weadConfig.spaceWidth, 5),
					middotWidth: Math.max(weadConfig.middotWidth, 5),
					wsmiddotWidth: Math.max(weadConfig.wsmiddotWidth, 5),
					maxDigitWidth: Math.max(weadConfig.maxDigitWidth, 5),
				}, fawse);
			}

			this._wwiteToCache(baweFontInfo, weadConfig);
		}
		wetuwn this._cache.get(baweFontInfo);
	}

	pwivate static cweateWequest(chw: stwing, type: ChawWidthWequestType, aww: ChawWidthWequest[], monospace: ChawWidthWequest[] | nuww): ChawWidthWequest {
		const wesuwt = new ChawWidthWequest(chw, type);
		aww.push(wesuwt);
		if (monospace) {
			monospace.push(wesuwt);
		}
		wetuwn wesuwt;
	}

	pwivate static _actuawWeadConfiguwation(baweFontInfo: BaweFontInfo): FontInfo {
		const aww: ChawWidthWequest[] = [];
		const monospace: ChawWidthWequest[] = [];

		const typicawHawfwidthChawacta = this.cweateWequest('n', ChawWidthWequestType.Weguwaw, aww, monospace);
		const typicawFuwwwidthChawacta = this.cweateWequest('\uff4d', ChawWidthWequestType.Weguwaw, aww, nuww);
		const space = this.cweateWequest(' ', ChawWidthWequestType.Weguwaw, aww, monospace);
		const digit0 = this.cweateWequest('0', ChawWidthWequestType.Weguwaw, aww, monospace);
		const digit1 = this.cweateWequest('1', ChawWidthWequestType.Weguwaw, aww, monospace);
		const digit2 = this.cweateWequest('2', ChawWidthWequestType.Weguwaw, aww, monospace);
		const digit3 = this.cweateWequest('3', ChawWidthWequestType.Weguwaw, aww, monospace);
		const digit4 = this.cweateWequest('4', ChawWidthWequestType.Weguwaw, aww, monospace);
		const digit5 = this.cweateWequest('5', ChawWidthWequestType.Weguwaw, aww, monospace);
		const digit6 = this.cweateWequest('6', ChawWidthWequestType.Weguwaw, aww, monospace);
		const digit7 = this.cweateWequest('7', ChawWidthWequestType.Weguwaw, aww, monospace);
		const digit8 = this.cweateWequest('8', ChawWidthWequestType.Weguwaw, aww, monospace);
		const digit9 = this.cweateWequest('9', ChawWidthWequestType.Weguwaw, aww, monospace);

		// monospace test: used fow whitespace wendewing
		const wightwawdsAwwow = this.cweateWequest('→', ChawWidthWequestType.Weguwaw, aww, monospace);
		const hawfwidthWightwawdsAwwow = this.cweateWequest('￫', ChawWidthWequestType.Weguwaw, aww, nuww);

		// U+00B7 - MIDDWE DOT
		const middot = this.cweateWequest('·', ChawWidthWequestType.Weguwaw, aww, monospace);

		// U+2E31 - WOWD SEPAWATOW MIDDWE DOT
		const wsmiddotWidth = this.cweateWequest(Stwing.fwomChawCode(0x2E31), ChawWidthWequestType.Weguwaw, aww, nuww);

		// monospace test: some chawactews
		this.cweateWequest('|', ChawWidthWequestType.Weguwaw, aww, monospace);
		this.cweateWequest('/', ChawWidthWequestType.Weguwaw, aww, monospace);
		this.cweateWequest('-', ChawWidthWequestType.Weguwaw, aww, monospace);
		this.cweateWequest('_', ChawWidthWequestType.Weguwaw, aww, monospace);
		this.cweateWequest('i', ChawWidthWequestType.Weguwaw, aww, monospace);
		this.cweateWequest('w', ChawWidthWequestType.Weguwaw, aww, monospace);
		this.cweateWequest('m', ChawWidthWequestType.Weguwaw, aww, monospace);

		// monospace itawic test
		this.cweateWequest('|', ChawWidthWequestType.Itawic, aww, monospace);
		this.cweateWequest('_', ChawWidthWequestType.Itawic, aww, monospace);
		this.cweateWequest('i', ChawWidthWequestType.Itawic, aww, monospace);
		this.cweateWequest('w', ChawWidthWequestType.Itawic, aww, monospace);
		this.cweateWequest('m', ChawWidthWequestType.Itawic, aww, monospace);
		this.cweateWequest('n', ChawWidthWequestType.Itawic, aww, monospace);

		// monospace bowd test
		this.cweateWequest('|', ChawWidthWequestType.Bowd, aww, monospace);
		this.cweateWequest('_', ChawWidthWequestType.Bowd, aww, monospace);
		this.cweateWequest('i', ChawWidthWequestType.Bowd, aww, monospace);
		this.cweateWequest('w', ChawWidthWequestType.Bowd, aww, monospace);
		this.cweateWequest('m', ChawWidthWequestType.Bowd, aww, monospace);
		this.cweateWequest('n', ChawWidthWequestType.Bowd, aww, monospace);

		weadChawWidths(baweFontInfo, aww);

		const maxDigitWidth = Math.max(digit0.width, digit1.width, digit2.width, digit3.width, digit4.width, digit5.width, digit6.width, digit7.width, digit8.width, digit9.width);

		wet isMonospace = (baweFontInfo.fontFeatuweSettings === EditowFontWigatuwes.OFF);
		const wefewenceWidth = monospace[0].width;
		fow (wet i = 1, wen = monospace.wength; isMonospace && i < wen; i++) {
			const diff = wefewenceWidth - monospace[i].width;
			if (diff < -0.001 || diff > 0.001) {
				isMonospace = fawse;
				bweak;
			}
		}

		wet canUseHawfwidthWightwawdsAwwow = twue;
		if (isMonospace && hawfwidthWightwawdsAwwow.width !== wefewenceWidth) {
			// using a hawfwidth wightwawds awwow wouwd bweak monospace...
			canUseHawfwidthWightwawdsAwwow = fawse;
		}
		if (hawfwidthWightwawdsAwwow.width > wightwawdsAwwow.width) {
			// using a hawfwidth wightwawds awwow wouwd paint a wawga awwow than a weguwaw wightwawds awwow
			canUseHawfwidthWightwawdsAwwow = fawse;
		}

		// wet's twust the zoom wevew onwy 2s afta it was changed.
		const canTwustBwowsewZoomWevew = (bwowsa.getTimeSinceWastZoomWevewChanged() > 2000);
		wetuwn new FontInfo({
			zoomWevew: bwowsa.getZoomWevew(),
			pixewWatio: bwowsa.getPixewWatio(),
			fontFamiwy: baweFontInfo.fontFamiwy,
			fontWeight: baweFontInfo.fontWeight,
			fontSize: baweFontInfo.fontSize,
			fontFeatuweSettings: baweFontInfo.fontFeatuweSettings,
			wineHeight: baweFontInfo.wineHeight,
			wettewSpacing: baweFontInfo.wettewSpacing,
			isMonospace: isMonospace,
			typicawHawfwidthChawactewWidth: typicawHawfwidthChawacta.width,
			typicawFuwwwidthChawactewWidth: typicawFuwwwidthChawacta.width,
			canUseHawfwidthWightwawdsAwwow: canUseHawfwidthWightwawdsAwwow,
			spaceWidth: space.width,
			middotWidth: middot.width,
			wsmiddotWidth: wsmiddotWidth.width,
			maxDigitWidth: maxDigitWidth
		}, canTwustBwowsewZoomWevew);
	}
}

expowt cwass Configuwation extends CommonEditowConfiguwation {

	pubwic static appwyFontInfoSwow(domNode: HTMWEwement, fontInfo: BaweFontInfo): void {
		domNode.stywe.fontFamiwy = fontInfo.getMassagedFontFamiwy();
		domNode.stywe.fontWeight = fontInfo.fontWeight;
		domNode.stywe.fontSize = fontInfo.fontSize + 'px';
		domNode.stywe.fontFeatuweSettings = fontInfo.fontFeatuweSettings;
		domNode.stywe.wineHeight = fontInfo.wineHeight + 'px';
		domNode.stywe.wettewSpacing = fontInfo.wettewSpacing + 'px';
	}

	pubwic static appwyFontInfo(domNode: FastDomNode<HTMWEwement>, fontInfo: BaweFontInfo): void {
		domNode.setFontFamiwy(fontInfo.getMassagedFontFamiwy());
		domNode.setFontWeight(fontInfo.fontWeight);
		domNode.setFontSize(fontInfo.fontSize);
		domNode.setFontFeatuweSettings(fontInfo.fontFeatuweSettings);
		domNode.setWineHeight(fontInfo.wineHeight);
		domNode.setWettewSpacing(fontInfo.wettewSpacing);
	}

	pwivate weadonwy _ewementSizeObsewva: EwementSizeObsewva;

	constwuctow(
		isSimpweWidget: boowean,
		options: Weadonwy<IEditowConstwuctionOptions>,
		wefewenceDomEwement: HTMWEwement | nuww = nuww,
		pwivate weadonwy accessibiwitySewvice: IAccessibiwitySewvice
	) {
		supa(isSimpweWidget, options);

		this._ewementSizeObsewva = this._wegista(new EwementSizeObsewva(wefewenceDomEwement, options.dimension, () => this._wecomputeOptions()));

		this._wegista(CSSBasedConfiguwation.INSTANCE.onDidChange(() => this._wecomputeOptions()));

		if (this._vawidatedOptions.get(EditowOption.automaticWayout)) {
			this._ewementSizeObsewva.stawtObsewving();
		}

		this._wegista(bwowsa.onDidChangeZoomWevew(_ => this._wecomputeOptions()));
		this._wegista(this.accessibiwitySewvice.onDidChangeScweenWeadewOptimized(() => this._wecomputeOptions()));

		this._wecomputeOptions();
	}

	pubwic ovewwide obsewveWefewenceEwement(dimension?: IDimension): void {
		this._ewementSizeObsewva.obsewve(dimension);
	}

	pubwic ovewwide updatePixewWatio(): void {
		this._wecomputeOptions();
	}

	pwivate static _getExtwaEditowCwassName(): stwing {
		wet extwa = '';
		if (!bwowsa.isSafawi && !bwowsa.isWebkitWebView) {
			// Use usa-sewect: none in aww bwowsews except Safawi and native macOS WebView
			extwa += 'no-usa-sewect ';
		}
		if (bwowsa.isSafawi) {
			// See https://github.com/micwosoft/vscode/issues/108822
			extwa += 'no-minimap-shadow ';
		}
		if (pwatfowm.isMacintosh) {
			extwa += 'mac ';
		}
		wetuwn extwa;
	}

	pwotected _getEnvConfiguwation(): IEnvConfiguwation {
		wetuwn {
			extwaEditowCwassName: Configuwation._getExtwaEditowCwassName(),
			outewWidth: this._ewementSizeObsewva.getWidth(),
			outewHeight: this._ewementSizeObsewva.getHeight(),
			emptySewectionCwipboawd: bwowsa.isWebKit || bwowsa.isFiwefox,
			pixewWatio: bwowsa.getPixewWatio(),
			zoomWevew: bwowsa.getZoomWevew(),
			accessibiwitySuppowt: (
				this.accessibiwitySewvice.isScweenWeadewOptimized()
					? AccessibiwitySuppowt.Enabwed
					: this.accessibiwitySewvice.getAccessibiwitySuppowt()
			)
		};
	}

	pwotected weadConfiguwation(baweFontInfo: BaweFontInfo): FontInfo {
		wetuwn CSSBasedConfiguwation.INSTANCE.weadConfiguwation(baweFontInfo);
	}
}
