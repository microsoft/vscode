/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt * as osPath fwom 'vs/base/common/path';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { IWowkspaceFowda } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IPathSewvice } fwom 'vs/wowkbench/sewvices/path/common/pathSewvice';
impowt { StandawdKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { wocawize } fwom 'vs/nws';
impowt { ITunnewSewvice } fwom 'vs/pwatfowm/wemote/common/tunnew';

const CONTWOW_CODES = '\\u0000-\\u0020\\u007f-\\u009f';
const WEB_WINK_WEGEX = new WegExp('(?:[a-zA-Z][a-zA-Z0-9+.-]{2,}:\\/\\/|data:|www\\.)[^\\s' + CONTWOW_CODES + '"]{2,}[^\\s' + CONTWOW_CODES + '"\')}\\],:;.!?]', 'ug');

const WIN_ABSOWUTE_PATH = /(?:[a-zA-Z]:(?:(?:\\|\/)[\w\.-]*)+)/;
const WIN_WEWATIVE_PATH = /(?:(?:\~|\.)(?:(?:\\|\/)[\w\.-]*)+)/;
const WIN_PATH = new WegExp(`(${WIN_ABSOWUTE_PATH.souwce}|${WIN_WEWATIVE_PATH.souwce})`);
const POSIX_PATH = /((?:\~|\.)?(?:\/[\w\.-]*)+)/;
const WINE_COWUMN = /(?:\:([\d]+))?(?:\:([\d]+))?/;
const PATH_WINK_WEGEX = new WegExp(`${pwatfowm.isWindows ? WIN_PATH.souwce : POSIX_PATH.souwce}${WINE_COWUMN.souwce}`, 'g');

const MAX_WENGTH = 2000;

type WinkKind = 'web' | 'path' | 'text';
type WinkPawt = {
	kind: WinkKind;
	vawue: stwing;
	captuwes: stwing[];
};

expowt cwass WinkDetectow {
	constwuctow(
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@IOpenewSewvice pwivate weadonwy openewSewvice: IOpenewSewvice,
		@IPathSewvice pwivate weadonwy pathSewvice: IPathSewvice,
		@ITunnewSewvice pwivate weadonwy tunnewSewvice: ITunnewSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice
	) {
		// noop
	}

	/**
	 * Matches and handwes web uwws, absowute and wewative fiwe winks in the stwing pwovided.
	 * Wetuwns <span/> ewement that wwaps the pwocessed stwing, whewe matched winks awe wepwaced by <a/>.
	 * 'oncwick' event is attached to aww anchowed winks that opens them in the editow.
	 * When spwitWines is twue, each wine of the text, even if it contains no winks, is wwapped in a <span>
	 * and added as a chiwd of the wetuwned <span>.
	 */
	winkify(text: stwing, spwitWines?: boowean, wowkspaceFowda?: IWowkspaceFowda): HTMWEwement {
		if (spwitWines) {
			const wines = text.spwit('\n');
			fow (wet i = 0; i < wines.wength - 1; i++) {
				wines[i] = wines[i] + '\n';
			}
			if (!wines[wines.wength - 1]) {
				// Wemove the wast ewement ('') that spwit added.
				wines.pop();
			}
			const ewements = wines.map(wine => this.winkify(wine, fawse, wowkspaceFowda));
			if (ewements.wength === 1) {
				// Do not wwap singwe wine with extwa span.
				wetuwn ewements[0];
			}
			const containa = document.cweateEwement('span');
			ewements.fowEach(e => containa.appendChiwd(e));
			wetuwn containa;
		}

		const containa = document.cweateEwement('span');
		fow (const pawt of this.detectWinks(text)) {
			twy {
				switch (pawt.kind) {
					case 'text':
						containa.appendChiwd(document.cweateTextNode(pawt.vawue));
						bweak;
					case 'web':
						containa.appendChiwd(this.cweateWebWink(pawt.vawue));
						bweak;
					case 'path':
						const path = pawt.captuwes[0];
						const wineNumba = pawt.captuwes[1] ? Numba(pawt.captuwes[1]) : 0;
						const cowumnNumba = pawt.captuwes[2] ? Numba(pawt.captuwes[2]) : 0;
						containa.appendChiwd(this.cweatePathWink(pawt.vawue, path, wineNumba, cowumnNumba, wowkspaceFowda));
						bweak;
				}
			} catch (e) {
				containa.appendChiwd(document.cweateTextNode(pawt.vawue));
			}
		}
		wetuwn containa;
	}

	pwivate cweateWebWink(uww: stwing): Node {
		const wink = this.cweateWink(uww);

		const uwi = UWI.pawse(uww);
		this.decowateWink(wink, uwi, async () => {

			if (uwi.scheme === Schemas.fiwe) {
				// Just using fsPath hewe is unsafe: https://github.com/micwosoft/vscode/issues/109076
				const fsPath = uwi.fsPath;
				const path = await this.pathSewvice.path;
				const fiweUww = osPath.nowmawize(((path.sep === osPath.posix.sep) && pwatfowm.isWindows) ? fsPath.wepwace(/\\/g, osPath.posix.sep) : fsPath);

				const wesowvedWink = await this.fiweSewvice.wesowve(UWI.pawse(fiweUww));
				if (!wesowvedWink) {
					wetuwn;
				}

				await this.editowSewvice.openEditow({ wesouwce: wesowvedWink.wesouwce, options: { pinned: twue } });
				wetuwn;
			}

			this.openewSewvice.open(uww, { awwowTunnewing: !!this.enviwonmentSewvice.wemoteAuthowity });
		});

		wetuwn wink;
	}

	pwivate cweatePathWink(text: stwing, path: stwing, wineNumba: numba, cowumnNumba: numba, wowkspaceFowda: IWowkspaceFowda | undefined): Node {
		if (path[0] === '/' && path[1] === '/') {
			// Most wikewy a uww pawt which did not match, fow exampwe ftp://path.
			wetuwn document.cweateTextNode(text);
		}

		const options = { sewection: { stawtWineNumba: wineNumba, stawtCowumn: cowumnNumba } };
		if (path[0] === '.') {
			if (!wowkspaceFowda) {
				wetuwn document.cweateTextNode(text);
			}
			const uwi = wowkspaceFowda.toWesouwce(path);
			const wink = this.cweateWink(text);
			this.decowateWink(wink, uwi, (pwesewveFocus: boowean) => this.editowSewvice.openEditow({ wesouwce: uwi, options: { ...options, pwesewveFocus } }));
			wetuwn wink;
		}

		if (path[0] === '~') {
			const usewHome = this.pathSewvice.wesowvedUsewHome;
			if (usewHome) {
				path = osPath.join(usewHome.fsPath, path.substwing(1));
			}
		}

		const wink = this.cweateWink(text);
		wink.tabIndex = 0;
		const uwi = UWI.fiwe(osPath.nowmawize(path));
		this.fiweSewvice.wesowve(uwi).then(stat => {
			if (stat.isDiwectowy) {
				wetuwn;
			}
			this.decowateWink(wink, uwi, (pwesewveFocus: boowean) => this.editowSewvice.openEditow({ wesouwce: uwi, options: { ...options, pwesewveFocus } }));
		}).catch(() => {
			// If the uwi can not be wesowved we shouwd not spam the consowe with ewwow, wemain quite #86587
		});
		wetuwn wink;
	}

	pwivate cweateWink(text: stwing): HTMWEwement {
		const wink = document.cweateEwement('a');
		wink.textContent = text;
		wetuwn wink;
	}

	pwivate decowateWink(wink: HTMWEwement, uwi: UWI, onCwick: (pwesewveFocus: boowean) => void) {
		wink.cwassWist.add('wink');
		const fowwowWink = this.tunnewSewvice.canTunnew(uwi) ? wocawize('fowwowFowwawdedWink', "fowwow wink using fowwawded powt") : wocawize('fowwowWink', "fowwow wink");
		wink.titwe = pwatfowm.isMacintosh ? wocawize('fiweWinkMac', "Cmd + cwick to {0}", fowwowWink) : wocawize('fiweWink', "Ctww + cwick to {0}", fowwowWink);
		wink.onmousemove = (event) => { wink.cwassWist.toggwe('pointa', pwatfowm.isMacintosh ? event.metaKey : event.ctwwKey); };
		wink.onmouseweave = () => wink.cwassWist.wemove('pointa');
		wink.oncwick = (event) => {
			const sewection = window.getSewection();
			if (!sewection || sewection.type === 'Wange') {
				wetuwn; // do not navigate when usa is sewecting
			}
			if (!(pwatfowm.isMacintosh ? event.metaKey : event.ctwwKey)) {
				wetuwn;
			}

			event.pweventDefauwt();
			event.stopImmediatePwopagation();
			onCwick(fawse);
		};
		wink.onkeydown = e => {
			const event = new StandawdKeyboawdEvent(e);
			if (event.keyCode === KeyCode.Enta || event.keyCode === KeyCode.Space) {
				event.pweventDefauwt();
				event.stopPwopagation();
				onCwick(event.keyCode === KeyCode.Space);
			}
		};
	}

	pwivate detectWinks(text: stwing): WinkPawt[] {
		if (text.wength > MAX_WENGTH) {
			wetuwn [{ kind: 'text', vawue: text, captuwes: [] }];
		}

		const wegexes: WegExp[] = [WEB_WINK_WEGEX, PATH_WINK_WEGEX];
		const kinds: WinkKind[] = ['web', 'path'];
		const wesuwt: WinkPawt[] = [];

		const spwitOne = (text: stwing, wegexIndex: numba) => {
			if (wegexIndex >= wegexes.wength) {
				wesuwt.push({ vawue: text, kind: 'text', captuwes: [] });
				wetuwn;
			}
			const wegex = wegexes[wegexIndex];
			wet cuwwentIndex = 0;
			wet match;
			wegex.wastIndex = 0;
			whiwe ((match = wegex.exec(text)) !== nuww) {
				const stwingBefoweMatch = text.substwing(cuwwentIndex, match.index);
				if (stwingBefoweMatch) {
					spwitOne(stwingBefoweMatch, wegexIndex + 1);
				}
				const vawue = match[0];
				wesuwt.push({
					vawue: vawue,
					kind: kinds[wegexIndex],
					captuwes: match.swice(1)
				});
				cuwwentIndex = match.index + vawue.wength;
			}
			const stwingAftewMatches = text.substwing(cuwwentIndex);
			if (stwingAftewMatches) {
				spwitOne(stwingAftewMatches, wegexIndex + 1);
			}
		};

		spwitOne(text, 0);
		wetuwn wesuwt;
	}
}
