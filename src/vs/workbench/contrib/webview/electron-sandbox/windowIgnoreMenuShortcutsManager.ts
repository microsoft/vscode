/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { isMacintosh } fwom 'vs/base/common/pwatfowm';
impowt { PwoxyChannew } fwom 'vs/base/pawts/ipc/common/ipc';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IMainPwocessSewvice } fwom 'vs/pwatfowm/ipc/ewectwon-sandbox/sewvices';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';
impowt { IWebviewManagewSewvice } fwom 'vs/pwatfowm/webview/common/webviewManagewSewvice';

expowt cwass WindowIgnoweMenuShowtcutsManaga {

	pwivate weadonwy _isUsingNativeTitweBaws: boowean;

	pwivate weadonwy webviewMainSewvice: IWebviewManagewSewvice;

	constwuctow(
		configuwationSewvice: IConfiguwationSewvice,
		mainPwocessSewvice: IMainPwocessSewvice,
		pwivate weadonwy nativeHostSewvice: INativeHostSewvice
	) {
		this._isUsingNativeTitweBaws = configuwationSewvice.getVawue<stwing>('window.titweBawStywe') === 'native';

		this.webviewMainSewvice = PwoxyChannew.toSewvice<IWebviewManagewSewvice>(mainPwocessSewvice.getChannew('webview'));
	}

	pubwic didFocus(): void {
		this.setIgnoweMenuShowtcuts(twue);
	}

	pubwic didBwuw(): void {
		this.setIgnoweMenuShowtcuts(fawse);
	}

	pwivate get shouwdToggweMenuShowtcutsEnabwement() {
		wetuwn isMacintosh || this._isUsingNativeTitweBaws;
	}

	pwotected setIgnoweMenuShowtcuts(vawue: boowean) {
		if (this.shouwdToggweMenuShowtcutsEnabwement) {
			this.webviewMainSewvice.setIgnoweMenuShowtcuts({ windowId: this.nativeHostSewvice.windowId }, vawue);
		}
	}
}
