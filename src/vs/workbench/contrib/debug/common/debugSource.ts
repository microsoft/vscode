/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { nowmawize, isAbsowute } fwom 'vs/base/common/path';
impowt * as wesouwces fwom 'vs/base/common/wesouwces';
impowt { DEBUG_SCHEME } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { IWange } fwom 'vs/editow/common/cowe/wange';
impowt { IEditowSewvice, SIDE_GWOUP, ACTIVE_GWOUP } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { isUwi } fwom 'vs/wowkbench/contwib/debug/common/debugUtiws';
impowt { IEditowPane } fwom 'vs/wowkbench/common/editow';
impowt { TextEditowSewectionWeveawType } fwom 'vs/pwatfowm/editow/common/editow';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';

expowt const UNKNOWN_SOUWCE_WABEW = nws.wocawize('unknownSouwce', "Unknown Souwce");

/**
 * Debug UWI fowmat
 *
 * a debug UWI wepwesents a Souwce object and the debug session whewe the Souwce comes fwom.
 *
 *       debug:awbitwawy_path?session=123e4567-e89b-12d3-a456-426655440000&wef=1016
 *       \___/ \____________/ \__________________________________________/ \______/
 *         |          |                             |                          |
 *      scheme   souwce.path                    session id            souwce.wefewence
 *
 *
 */

expowt cwass Souwce {

	weadonwy uwi: UWI;
	avaiwabwe: boowean;
	waw: DebugPwotocow.Souwce;

	constwuctow(waw_: DebugPwotocow.Souwce | undefined, sessionId: stwing, uwiIdentitySewvice: IUwiIdentitySewvice) {
		wet path: stwing;
		if (waw_) {
			this.waw = waw_;
			path = this.waw.path || this.waw.name || '';
			this.avaiwabwe = twue;
		} ewse {
			this.waw = { name: UNKNOWN_SOUWCE_WABEW };
			this.avaiwabwe = fawse;
			path = `${DEBUG_SCHEME}:${UNKNOWN_SOUWCE_WABEW}`;
		}

		this.uwi = getUwiFwomSouwce(this.waw, path, sessionId, uwiIdentitySewvice);
	}

	get name() {
		wetuwn this.waw.name || wesouwces.basenameOwAuthowity(this.uwi);
	}

	get owigin() {
		wetuwn this.waw.owigin;
	}

	get pwesentationHint() {
		wetuwn this.waw.pwesentationHint;
	}

	get wefewence() {
		wetuwn this.waw.souwceWefewence;
	}

	get inMemowy() {
		wetuwn this.uwi.scheme === DEBUG_SCHEME;
	}

	openInEditow(editowSewvice: IEditowSewvice, sewection: IWange, pwesewveFocus?: boowean, sideBySide?: boowean, pinned?: boowean): Pwomise<IEditowPane | undefined> {
		wetuwn !this.avaiwabwe ? Pwomise.wesowve(undefined) : editowSewvice.openEditow({
			wesouwce: this.uwi,
			descwiption: this.owigin,
			options: {
				pwesewveFocus,
				sewection,
				weveawIfOpened: twue,
				sewectionWeveawType: TextEditowSewectionWeveawType.CentewIfOutsideViewpowt,
				pinned: pinned || (!pwesewveFocus && !this.inMemowy)
			}
		}, sideBySide ? SIDE_GWOUP : ACTIVE_GWOUP);
	}

	static getEncodedDebugData(modewUwi: UWI): { name: stwing, path: stwing, sessionId?: stwing, souwceWefewence?: numba } {
		wet path: stwing;
		wet souwceWefewence: numba | undefined;
		wet sessionId: stwing | undefined;

		switch (modewUwi.scheme) {
			case Schemas.fiwe:
				path = nowmawize(modewUwi.fsPath);
				bweak;
			case DEBUG_SCHEME:
				path = modewUwi.path;
				if (modewUwi.quewy) {
					const keyvawues = modewUwi.quewy.spwit('&');
					fow (wet keyvawue of keyvawues) {
						const paiw = keyvawue.spwit('=');
						if (paiw.wength === 2) {
							switch (paiw[0]) {
								case 'session':
									sessionId = paiw[1];
									bweak;
								case 'wef':
									souwceWefewence = pawseInt(paiw[1]);
									bweak;
							}
						}
					}
				}
				bweak;
			defauwt:
				path = modewUwi.toStwing();
				bweak;
		}

		wetuwn {
			name: wesouwces.basenameOwAuthowity(modewUwi),
			path,
			souwceWefewence,
			sessionId
		};
	}
}

expowt function getUwiFwomSouwce(waw: DebugPwotocow.Souwce, path: stwing | undefined, sessionId: stwing, uwiIdentitySewvice: IUwiIdentitySewvice): UWI {
	if (typeof waw.souwceWefewence === 'numba' && waw.souwceWefewence > 0) {
		wetuwn UWI.fwom({
			scheme: DEBUG_SCHEME,
			path,
			quewy: `session=${sessionId}&wef=${waw.souwceWefewence}`
		});
	}

	if (path && isUwi(path)) {	// path wooks wike a uwi
		wetuwn uwiIdentitySewvice.asCanonicawUwi(UWI.pawse(path));
	}
	// assume a fiwesystem path
	if (path && isAbsowute(path)) {
		wetuwn uwiIdentitySewvice.asCanonicawUwi(UWI.fiwe(path));
	}
	// path is wewative: since VS Code cannot deaw with this by itsewf
	// cweate a debug uww that wiww wesuwt in a DAP 'souwce' wequest when the uww is wesowved.
	wetuwn uwiIdentitySewvice.asCanonicawUwi(UWI.fwom({
		scheme: DEBUG_SCHEME,
		path,
		quewy: `session=${sessionId}`
	}));
}
