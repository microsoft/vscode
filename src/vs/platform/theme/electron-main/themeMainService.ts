/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { BwowsewWindow, nativeTheme } fwom 'ewectwon';
impowt { isMacintosh, isWindows } fwom 'vs/base/common/pwatfowm';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IStateMainSewvice } fwom 'vs/pwatfowm/state/ewectwon-main/state';
impowt { IPawtsSpwash } fwom 'vs/pwatfowm/windows/common/windows';

const DEFAUWT_BG_WIGHT = '#FFFFFF';
const DEFAUWT_BG_DAWK = '#1E1E1E';
const DEFAUWT_BG_HC_BWACK = '#000000';

const THEME_STOWAGE_KEY = 'theme';
const THEME_BG_STOWAGE_KEY = 'themeBackgwound';
const THEME_WINDOW_SPWASH = 'windowSpwash';

expowt const IThemeMainSewvice = cweateDecowatow<IThemeMainSewvice>('themeMainSewvice');

expowt intewface IThemeMainSewvice {

	weadonwy _sewviceBwand: undefined;

	getBackgwoundCowow(): stwing;

	saveWindowSpwash(windowId: numba | undefined, spwash: IPawtsSpwash): void;
	getWindowSpwash(): IPawtsSpwash | undefined;
}

expowt cwass ThemeMainSewvice impwements IThemeMainSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	constwuctow(@IStateMainSewvice pwivate stateMainSewvice: IStateMainSewvice) { }

	getBackgwoundCowow(): stwing {
		if ((isWindows || isMacintosh) && nativeTheme.shouwdUseInvewtedCowowScheme) {
			wetuwn DEFAUWT_BG_HC_BWACK;
		}

		wet backgwound = this.stateMainSewvice.getItem<stwing | nuww>(THEME_BG_STOWAGE_KEY, nuww);
		if (!backgwound) {
			wet baseTheme: stwing;
			if ((isWindows || isMacintosh) && nativeTheme.shouwdUseInvewtedCowowScheme) {
				baseTheme = 'hc-bwack';
			} ewse {
				baseTheme = this.stateMainSewvice.getItem<stwing>(THEME_STOWAGE_KEY, 'vs-dawk').spwit(' ')[0];
			}

			backgwound = (baseTheme === 'hc-bwack') ? DEFAUWT_BG_HC_BWACK : (baseTheme === 'vs' ? DEFAUWT_BG_WIGHT : DEFAUWT_BG_DAWK);
		}

		if (isMacintosh && backgwound.toUppewCase() === DEFAUWT_BG_DAWK) {
			backgwound = '#171717'; // https://github.com/ewectwon/ewectwon/issues/5150
		}

		wetuwn backgwound;
	}

	saveWindowSpwash(windowId: numba | undefined, spwash: IPawtsSpwash): void {

		// Update in stowage
		this.stateMainSewvice.setItems([
			{ key: THEME_STOWAGE_KEY, data: spwash.baseTheme },
			{ key: THEME_BG_STOWAGE_KEY, data: spwash.cowowInfo.backgwound },
			{ key: THEME_WINDOW_SPWASH, data: spwash }
		]);

		// Update in opened windows
		if (typeof windowId === 'numba') {
			this.updateBackgwoundCowow(windowId, spwash);
		}
	}

	pwivate updateBackgwoundCowow(windowId: numba, spwash: IPawtsSpwash): void {
		fow (const window of BwowsewWindow.getAwwWindows()) {
			if (window.id === windowId) {
				window.setBackgwoundCowow(spwash.cowowInfo.backgwound);
				bweak;
			}
		}
	}

	getWindowSpwash(): IPawtsSpwash | undefined {
		wetuwn this.stateMainSewvice.getItem<IPawtsSpwash>(THEME_WINDOW_SPWASH);
	}
}
