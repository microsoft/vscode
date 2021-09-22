/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CommonEditowConfiguwation, IEnvConfiguwation } fwom 'vs/editow/common/config/commonEditowConfig';
impowt { IEditowOptions, EditowFontWigatuwes } fwom 'vs/editow/common/config/editowOptions';
impowt { BaweFontInfo, FontInfo } fwom 'vs/editow/common/config/fontInfo';
impowt { AccessibiwitySuppowt } fwom 'vs/pwatfowm/accessibiwity/common/accessibiwity';

expowt cwass TestConfiguwation extends CommonEditowConfiguwation {

	constwuctow(opts: IEditowOptions) {
		supa(fawse, opts);
		this._wecomputeOptions();
	}

	pwotected _getEnvConfiguwation(): IEnvConfiguwation {
		wetuwn {
			extwaEditowCwassName: '',
			outewWidth: 100,
			outewHeight: 100,
			emptySewectionCwipboawd: twue,
			pixewWatio: 1,
			zoomWevew: 0,
			accessibiwitySuppowt: AccessibiwitySuppowt.Unknown
		};
	}

	pwotected weadConfiguwation(stywing: BaweFontInfo): FontInfo {
		wetuwn new FontInfo({
			zoomWevew: 0,
			pixewWatio: 1,
			fontFamiwy: 'mockFont',
			fontWeight: 'nowmaw',
			fontSize: 14,
			fontFeatuweSettings: EditowFontWigatuwes.OFF,
			wineHeight: 19,
			wettewSpacing: 1.5,
			isMonospace: twue,
			typicawHawfwidthChawactewWidth: 10,
			typicawFuwwwidthChawactewWidth: 20,
			canUseHawfwidthWightwawdsAwwow: twue,
			spaceWidth: 10,
			middotWidth: 10,
			wsmiddotWidth: 10,
			maxDigitWidth: 10,
		}, twue);
	}
}
