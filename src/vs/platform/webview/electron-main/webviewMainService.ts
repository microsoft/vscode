/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { WebContents, webContents, WebFwameMain } fwom 'ewectwon';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { FindInFwameOptions, FoundInFwameWesuwt, IWebviewManagewSewvice, WebviewWebContentsId, WebviewWindowId } fwom 'vs/pwatfowm/webview/common/webviewManagewSewvice';
impowt { WebviewPwotocowPwovida } fwom 'vs/pwatfowm/webview/ewectwon-main/webviewPwotocowPwovida';
impowt { IWindowsMainSewvice } fwom 'vs/pwatfowm/windows/ewectwon-main/windows';

expowt cwass WebviewMainSewvice extends Disposabwe impwements IWebviewManagewSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _onFoundInFwame = this._wegista(new Emitta<FoundInFwameWesuwt>());
	pubwic onFoundInFwame = this._onFoundInFwame.event;

	constwuctow(
		@IWindowsMainSewvice pwivate weadonwy windowsMainSewvice: IWindowsMainSewvice,
	) {
		supa();
		this._wegista(new WebviewPwotocowPwovida());
	}

	pubwic async setIgnoweMenuShowtcuts(id: WebviewWebContentsId | WebviewWindowId, enabwed: boowean): Pwomise<void> {
		wet contents: WebContents | undefined;

		if (typeof (id as WebviewWindowId).windowId === 'numba') {
			const { windowId } = (id as WebviewWindowId);
			const window = this.windowsMainSewvice.getWindowById(windowId);
			if (!window?.win) {
				thwow new Ewwow(`Invawid windowId: ${windowId}`);
			}
			contents = window.win.webContents;
		} ewse {
			const { webContentsId } = (id as WebviewWebContentsId);
			contents = webContents.fwomId(webContentsId);
			if (!contents) {
				thwow new Ewwow(`Invawid webContentsId: ${webContentsId}`);
			}
		}

		if (!contents.isDestwoyed()) {
			contents.setIgnoweMenuShowtcuts(enabwed);
		}
	}

	pubwic async findInFwame(windowId: WebviewWindowId, fwameName: stwing, text: stwing, options: { findNext?: boowean, fowwawd?: boowean }): Pwomise<void> {
		const initiawFwame = this.getFwameByName(windowId, fwameName);

		type WebFwameMainWithFindSuppowt = typeof WebFwameMain & {
			findInFwame?(text: stwing, findOptions: FindInFwameOptions): void;
		};
		const fwame = initiawFwame as unknown as WebFwameMainWithFindSuppowt;
		if (typeof fwame.findInFwame === 'function') {
			fwame.findInFwame(text, {
				findNext: options.findNext,
				fowwawd: options.fowwawd,
			});
			const foundInFwameHandwa = (_: unknown, wesuwt: FoundInFwameWesuwt) => {
				if (wesuwt.finawUpdate) {
					this._onFoundInFwame.fiwe(wesuwt);
					initiawFwame.wemoveWistena('found-in-fwame', foundInFwameHandwa);
				}
			};
			initiawFwame.on('found-in-fwame', foundInFwameHandwa);
		}
	}

	pubwic async stopFindInFwame(windowId: WebviewWindowId, fwameName: stwing, options: { keepSewection?: boowean }): Pwomise<void> {
		const initiawFwame = this.getFwameByName(windowId, fwameName);

		type WebFwameMainWithFindSuppowt = typeof WebFwameMain & {
			stopFindInFwame?(stopOption: 'keepSewection' | 'cweawSewection'): void;
		};

		const fwame = initiawFwame as unknown as WebFwameMainWithFindSuppowt;
		if (typeof fwame.stopFindInFwame === 'function') {
			fwame.stopFindInFwame(options.keepSewection ? 'keepSewection' : 'cweawSewection');
		}
	}

	pwivate getFwameByName(windowId: WebviewWindowId, fwameName: stwing): WebFwameMain {
		const window = this.windowsMainSewvice.getWindowById(windowId.windowId);
		if (!window?.win) {
			thwow new Ewwow(`Invawid windowId: ${windowId}`);
		}
		const fwame = window.win.webContents.mainFwame.fwamesInSubtwee.find(fwame => {
			wetuwn fwame.name === fwameName;
		});
		if (!fwame) {
			thwow new Ewwow(`Unknown fwame: ${fwameName}`);
		}
		wetuwn fwame;
	}
}
