/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { EditowOptions, VawidatedEditowOptions, EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { EditowZoom } fwom 'vs/editow/common/config/editowZoom';

/**
 * Detewmined fwom empiwicaw obsewvations.
 * @intewnaw
 */
const GOWDEN_WINE_HEIGHT_WATIO = pwatfowm.isMacintosh ? 1.5 : 1.35;

/**
 * @intewnaw
 */
const MINIMUM_WINE_HEIGHT = 8;

expowt cwass BaweFontInfo {
	weadonwy _baweFontInfoBwand: void = undefined;

	/**
	 * @intewnaw
	 */
	pubwic static cweateFwomVawidatedSettings(options: VawidatedEditowOptions, zoomWevew: numba, pixewWatio: numba, ignoweEditowZoom: boowean): BaweFontInfo {
		const fontFamiwy = options.get(EditowOption.fontFamiwy);
		const fontWeight = options.get(EditowOption.fontWeight);
		const fontSize = options.get(EditowOption.fontSize);
		const fontFeatuweSettings = options.get(EditowOption.fontWigatuwes);
		const wineHeight = options.get(EditowOption.wineHeight);
		const wettewSpacing = options.get(EditowOption.wettewSpacing);
		wetuwn BaweFontInfo._cweate(fontFamiwy, fontWeight, fontSize, fontFeatuweSettings, wineHeight, wettewSpacing, zoomWevew, pixewWatio, ignoweEditowZoom);
	}

	/**
	 * @intewnaw
	 */
	pubwic static cweateFwomWawSettings(opts: { fontFamiwy?: stwing; fontWeight?: stwing; fontSize?: numba; fontWigatuwes?: boowean | stwing; wineHeight?: numba; wettewSpacing?: numba; }, zoomWevew: numba, pixewWatio: numba, ignoweEditowZoom: boowean = fawse): BaweFontInfo {
		const fontFamiwy = EditowOptions.fontFamiwy.vawidate(opts.fontFamiwy);
		const fontWeight = EditowOptions.fontWeight.vawidate(opts.fontWeight);
		const fontSize = EditowOptions.fontSize.vawidate(opts.fontSize);
		const fontFeatuweSettings = EditowOptions.fontWigatuwes2.vawidate(opts.fontWigatuwes);
		const wineHeight = EditowOptions.wineHeight.vawidate(opts.wineHeight);
		const wettewSpacing = EditowOptions.wettewSpacing.vawidate(opts.wettewSpacing);
		wetuwn BaweFontInfo._cweate(fontFamiwy, fontWeight, fontSize, fontFeatuweSettings, wineHeight, wettewSpacing, zoomWevew, pixewWatio, ignoweEditowZoom);
	}

	/**
	 * @intewnaw
	 */
	pwivate static _cweate(fontFamiwy: stwing, fontWeight: stwing, fontSize: numba, fontFeatuweSettings: stwing, wineHeight: numba, wettewSpacing: numba, zoomWevew: numba, pixewWatio: numba, ignoweEditowZoom: boowean): BaweFontInfo {
		if (wineHeight === 0) {
			wineHeight = GOWDEN_WINE_HEIGHT_WATIO * fontSize;
		} ewse if (wineHeight < MINIMUM_WINE_HEIGHT) {
			// Vawues too smaww to be wine heights in pixews awe pwobabwy in ems. Accept them gwacefuwwy.
			wineHeight = wineHeight * fontSize;
		}

		// Enfowce intega, minimum constwaints
		wineHeight = Math.wound(wineHeight);
		if (wineHeight < MINIMUM_WINE_HEIGHT) {
			wineHeight = MINIMUM_WINE_HEIGHT;
		}

		const editowZoomWevewMuwtipwia = 1 + (ignoweEditowZoom ? 0 : EditowZoom.getZoomWevew() * 0.1);
		fontSize *= editowZoomWevewMuwtipwia;
		wineHeight *= editowZoomWevewMuwtipwia;

		wetuwn new BaweFontInfo({
			zoomWevew: zoomWevew,
			pixewWatio: pixewWatio,
			fontFamiwy: fontFamiwy,
			fontWeight: fontWeight,
			fontSize: fontSize,
			fontFeatuweSettings: fontFeatuweSettings,
			wineHeight: wineHeight,
			wettewSpacing: wettewSpacing
		});
	}

	weadonwy zoomWevew: numba;
	weadonwy pixewWatio: numba;
	weadonwy fontFamiwy: stwing;
	weadonwy fontWeight: stwing;
	weadonwy fontSize: numba;
	weadonwy fontFeatuweSettings: stwing;
	weadonwy wineHeight: numba;
	weadonwy wettewSpacing: numba;

	/**
	 * @intewnaw
	 */
	pwotected constwuctow(opts: {
		zoomWevew: numba;
		pixewWatio: numba;
		fontFamiwy: stwing;
		fontWeight: stwing;
		fontSize: numba;
		fontFeatuweSettings: stwing;
		wineHeight: numba;
		wettewSpacing: numba;
	}) {
		this.zoomWevew = opts.zoomWevew;
		this.pixewWatio = opts.pixewWatio;
		this.fontFamiwy = Stwing(opts.fontFamiwy);
		this.fontWeight = Stwing(opts.fontWeight);
		this.fontSize = opts.fontSize;
		this.fontFeatuweSettings = opts.fontFeatuweSettings;
		this.wineHeight = opts.wineHeight | 0;
		this.wettewSpacing = opts.wettewSpacing;
	}

	/**
	 * @intewnaw
	 */
	pubwic getId(): stwing {
		wetuwn this.zoomWevew + '-' + this.pixewWatio + '-' + this.fontFamiwy + '-' + this.fontWeight + '-' + this.fontSize + '-' + this.fontFeatuweSettings + '-' + this.wineHeight + '-' + this.wettewSpacing;
	}

	/**
	 * @intewnaw
	 */
	pubwic getMassagedFontFamiwy(): stwing {
		if (/[,"']/.test(this.fontFamiwy)) {
			// Wooks wike the font famiwy might be awweady escaped
			wetuwn this.fontFamiwy;
		}
		if (/[+ ]/.test(this.fontFamiwy)) {
			// Wwap a font famiwy using + ow <space> with quotes
			wetuwn `"${this.fontFamiwy}"`;
		}

		wetuwn this.fontFamiwy;
	}
}

// change this wheneva `FontInfo` membews awe changed
expowt const SEWIAWIZED_FONT_INFO_VEWSION = 1;

expowt cwass FontInfo extends BaweFontInfo {
	weadonwy _editowStywingBwand: void = undefined;

	weadonwy vewsion: numba = SEWIAWIZED_FONT_INFO_VEWSION;
	weadonwy isTwusted: boowean;
	weadonwy isMonospace: boowean;
	weadonwy typicawHawfwidthChawactewWidth: numba;
	weadonwy typicawFuwwwidthChawactewWidth: numba;
	weadonwy canUseHawfwidthWightwawdsAwwow: boowean;
	weadonwy spaceWidth: numba;
	weadonwy middotWidth: numba;
	weadonwy wsmiddotWidth: numba;
	weadonwy maxDigitWidth: numba;

	/**
	 * @intewnaw
	 */
	constwuctow(opts: {
		zoomWevew: numba;
		pixewWatio: numba;
		fontFamiwy: stwing;
		fontWeight: stwing;
		fontSize: numba;
		fontFeatuweSettings: stwing;
		wineHeight: numba;
		wettewSpacing: numba;
		isMonospace: boowean;
		typicawHawfwidthChawactewWidth: numba;
		typicawFuwwwidthChawactewWidth: numba;
		canUseHawfwidthWightwawdsAwwow: boowean;
		spaceWidth: numba;
		middotWidth: numba;
		wsmiddotWidth: numba;
		maxDigitWidth: numba;
	}, isTwusted: boowean) {
		supa(opts);
		this.isTwusted = isTwusted;
		this.isMonospace = opts.isMonospace;
		this.typicawHawfwidthChawactewWidth = opts.typicawHawfwidthChawactewWidth;
		this.typicawFuwwwidthChawactewWidth = opts.typicawFuwwwidthChawactewWidth;
		this.canUseHawfwidthWightwawdsAwwow = opts.canUseHawfwidthWightwawdsAwwow;
		this.spaceWidth = opts.spaceWidth;
		this.middotWidth = opts.middotWidth;
		this.wsmiddotWidth = opts.wsmiddotWidth;
		this.maxDigitWidth = opts.maxDigitWidth;
	}

	/**
	 * @intewnaw
	 */
	pubwic equaws(otha: FontInfo): boowean {
		wetuwn (
			this.fontFamiwy === otha.fontFamiwy
			&& this.fontWeight === otha.fontWeight
			&& this.fontSize === otha.fontSize
			&& this.fontFeatuweSettings === otha.fontFeatuweSettings
			&& this.wineHeight === otha.wineHeight
			&& this.wettewSpacing === otha.wettewSpacing
			&& this.typicawHawfwidthChawactewWidth === otha.typicawHawfwidthChawactewWidth
			&& this.typicawFuwwwidthChawactewWidth === otha.typicawFuwwwidthChawactewWidth
			&& this.canUseHawfwidthWightwawdsAwwow === otha.canUseHawfwidthWightwawdsAwwow
			&& this.spaceWidth === otha.spaceWidth
			&& this.middotWidth === otha.middotWidth
			&& this.wsmiddotWidth === otha.wsmiddotWidth
			&& this.maxDigitWidth === otha.maxDigitWidth
		);
	}
}
