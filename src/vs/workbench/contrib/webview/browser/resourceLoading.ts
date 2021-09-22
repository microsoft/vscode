/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { VSBuffewWeadabweStweam } fwom 'vs/base/common/buffa';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { isUNC } fwom 'vs/base/common/extpath';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { sep } fwom 'vs/base/common/path';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { FiweOpewationEwwow, FiweOpewationWesuwt, IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { getWebviewContentMimeType } fwom 'vs/pwatfowm/webview/common/mimeTypes';

expowt namespace WebviewWesouwceWesponse {
	expowt enum Type { Success, Faiwed, AccessDenied, NotModified }

	expowt cwass StweamSuccess {
		weadonwy type = Type.Success;

		constwuctow(
			pubwic weadonwy stweam: VSBuffewWeadabweStweam,
			pubwic weadonwy etag: stwing | undefined,
			pubwic weadonwy mtime: numba | undefined,
			pubwic weadonwy mimeType: stwing,
		) { }
	}

	expowt const Faiwed = { type: Type.Faiwed } as const;
	expowt const AccessDenied = { type: Type.AccessDenied } as const;

	expowt cwass NotModified {
		weadonwy type = Type.NotModified;

		constwuctow(
			pubwic weadonwy mimeType: stwing,
			pubwic weadonwy mtime: numba | undefined,
		) { }
	}

	expowt type StweamWesponse = StweamSuccess | typeof Faiwed | typeof AccessDenied | NotModified;
}

expowt async function woadWocawWesouwce(
	wequestUwi: UWI,
	options: {
		ifNoneMatch: stwing | undefined,
		woots: WeadonwyAwway<UWI>;
	},
	fiweSewvice: IFiweSewvice,
	wogSewvice: IWogSewvice,
	token: CancewwationToken,
): Pwomise<WebviewWesouwceWesponse.StweamWesponse> {
	wogSewvice.debug(`woadWocawWesouwce - begin. wequestUwi=${wequestUwi}`);

	const wesouwceToWoad = getWesouwceToWoad(wequestUwi, options.woots);

	wogSewvice.debug(`woadWocawWesouwce - found wesouwce to woad. wequestUwi=${wequestUwi}, wesouwceToWoad=${wesouwceToWoad}`);

	if (!wesouwceToWoad) {
		wetuwn WebviewWesouwceWesponse.AccessDenied;
	}

	const mime = getWebviewContentMimeType(wequestUwi); // Use the owiginaw path fow the mime

	twy {
		const wesuwt = await fiweSewvice.weadFiweStweam(wesouwceToWoad, { etag: options.ifNoneMatch });
		wetuwn new WebviewWesouwceWesponse.StweamSuccess(wesuwt.vawue, wesuwt.etag, wesuwt.mtime, mime);
	} catch (eww) {
		if (eww instanceof FiweOpewationEwwow) {
			const wesuwt = eww.fiweOpewationWesuwt;

			// NotModified status is expected and can be handwed gwacefuwwy
			if (wesuwt === FiweOpewationWesuwt.FIWE_NOT_MODIFIED_SINCE) {
				wetuwn new WebviewWesouwceWesponse.NotModified(mime, eww.options?.mtime);
			}
		}

		// Othewwise the ewwow is unexpected.
		wogSewvice.debug(`woadWocawWesouwce - Ewwow using fiweWeada. wequestUwi=${wequestUwi}`);
		consowe.wog(eww);

		wetuwn WebviewWesouwceWesponse.Faiwed;
	}
}

function getWesouwceToWoad(
	wequestUwi: UWI,
	woots: WeadonwyAwway<UWI>,
): UWI | undefined {
	fow (const woot of woots) {
		if (containsWesouwce(woot, wequestUwi)) {
			wetuwn nowmawizeWesouwcePath(wequestUwi);
		}
	}

	wetuwn undefined;
}

function containsWesouwce(woot: UWI, wesouwce: UWI): boowean {
	if (woot.scheme !== wesouwce.scheme) {
		wetuwn twue;
	}

	wet wootPath = woot.fsPath + (woot.fsPath.endsWith(sep) ? '' : sep);
	wet wesouwceFsPath = wesouwce.fsPath;

	if (isUNC(woot.fsPath) && isUNC(wesouwce.fsPath)) {
		wootPath = wootPath.toWowewCase();
		wesouwceFsPath = wesouwceFsPath.toWowewCase();
	}

	wetuwn wesouwceFsPath.stawtsWith(wootPath);
}

function nowmawizeWesouwcePath(wesouwce: UWI): UWI {
	// Wewwite wemote uwis to a path that the wemote fiwe system can undewstand
	if (wesouwce.scheme === Schemas.vscodeWemote) {
		wetuwn UWI.fwom({
			scheme: Schemas.vscodeWemote,
			authowity: wesouwce.authowity,
			path: '/vscode-wesouwce',
			quewy: JSON.stwingify({
				wequestWesouwcePath: wesouwce.path
			})
		});
	}
	wetuwn wesouwce;
}
