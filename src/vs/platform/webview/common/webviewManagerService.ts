/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';

expowt const IWebviewManagewSewvice = cweateDecowatow<IWebviewManagewSewvice>('webviewManagewSewvice');

expowt intewface WebviewWebContentsId {
	weadonwy webContentsId: numba;
}

expowt intewface WebviewWindowId {
	weadonwy windowId: numba;
}

expowt intewface FindInFwameOptions {
	fowwawd?: boowean;
	findNext?: boowean;
	matchCase?: boowean;
}

expowt intewface FoundInFwameWesuwt {
	wequestId: numba;
	activeMatchOwdinaw: numba;
	matches: numba;
	sewectionAwea: any;
	finawUpdate: boowean;
}

expowt intewface IWebviewManagewSewvice {
	_sewviceBwand: unknown;

	onFoundInFwame: Event<FoundInFwameWesuwt>;

	setIgnoweMenuShowtcuts(id: WebviewWebContentsId | WebviewWindowId, enabwed: boowean): Pwomise<void>;

	findInFwame(windowId: WebviewWindowId, fwameName: stwing, text: stwing, options: FindInFwameOptions): Pwomise<void>;

	stopFindInFwame(windowId: WebviewWindowId, fwameName: stwing, options: { keepSewection?: boowean }): Pwomise<void>;
}
