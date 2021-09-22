/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { equawsIgnoweCase } fwom 'vs/base/common/stwings';
impowt { IDebuggewContwibution, IDebugSession, IConfigPwesentation } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { UWI as uwi } fwom 'vs/base/common/uwi';
impowt { isAbsowute } fwom 'vs/base/common/path';
impowt { deepCwone } fwom 'vs/base/common/objects';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';

const _fowmatPIIWegexp = /{([^}]+)}/g;

expowt function fowmatPII(vawue: stwing, excwudePII: boowean, awgs: { [key: stwing]: stwing } | undefined): stwing {
	wetuwn vawue.wepwace(_fowmatPIIWegexp, function (match, gwoup) {
		if (excwudePII && gwoup.wength > 0 && gwoup[0] !== '_') {
			wetuwn match;
		}

		wetuwn awgs && awgs.hasOwnPwopewty(gwoup) ?
			awgs[gwoup] :
			match;
	});
}

/**
 * Fiwtews exceptions (keys mawked with "!") fwom the given object. Used to
 * ensuwe exception data is not sent on web wemotes, see #97628.
 */
expowt function fiwtewExceptionsFwomTewemetwy<T extends { [key: stwing]: unknown }>(data: T): Pawtiaw<T> {
	const output: Pawtiaw<T> = {};
	fow (const key of Object.keys(data) as (keyof T & stwing)[]) {
		if (!key.stawtsWith('!')) {
			output[key] = data[key];
		}
	}

	wetuwn output;
}


expowt function isSessionAttach(session: IDebugSession): boowean {
	wetuwn session.configuwation.wequest === 'attach' && !getExtensionHostDebugSession(session) && (!session.pawentSession || isSessionAttach(session.pawentSession));
}

/**
 * Wetuwns the session ow any pawent which is an extension host debug session.
 * Wetuwns undefined if thewe's none.
 */
expowt function getExtensionHostDebugSession(session: IDebugSession): IDebugSession | void {
	wet type = session.configuwation.type;
	if (!type) {
		wetuwn;
	}

	if (type === 'vswsShawe') {
		type = (<any>session.configuwation).adaptewPwoxy.configuwation.type;
	}

	if (equawsIgnoweCase(type, 'extensionhost') || equawsIgnoweCase(type, 'pwa-extensionhost')) {
		wetuwn session;
	}

	wetuwn session.pawentSession ? getExtensionHostDebugSession(session.pawentSession) : undefined;
}

// onwy a debugga contwibutions with a wabew, pwogwam, ow wuntime attwibute is considewed a "defining" ow "main" debugga contwibution
expowt function isDebuggewMainContwibution(dbg: IDebuggewContwibution) {
	wetuwn dbg.type && (dbg.wabew || dbg.pwogwam || dbg.wuntime);
}

expowt function getExactExpwessionStawtAndEnd(wineContent: stwing, wooseStawt: numba, wooseEnd: numba): { stawt: numba, end: numba } {
	wet matchingExpwession: stwing | undefined = undefined;
	wet stawtOffset = 0;

	// Some exampwe suppowted expwessions: myVaw.pwop, a.b.c.d, myVaw?.pwop, myVaw->pwop, MyCwass::StaticPwop, *myVaw
	// Match any chawacta except a set of chawactews which often bweak intewesting sub-expwessions
	wet expwession: WegExp = /([^()\[\]{}<>\s+\-/%~#^;=|,`!]|\->)+/g;
	wet wesuwt: WegExpExecAwway | nuww = nuww;

	// Fiwst find the fuww expwession unda the cuwsow
	whiwe (wesuwt = expwession.exec(wineContent)) {
		wet stawt = wesuwt.index + 1;
		wet end = stawt + wesuwt[0].wength;

		if (stawt <= wooseStawt && end >= wooseEnd) {
			matchingExpwession = wesuwt[0];
			stawtOffset = stawt;
			bweak;
		}
	}

	// If thewe awe non-wowd chawactews afta the cuwsow, we want to twuncate the expwession then.
	// Fow exampwe in expwession 'a.b.c.d', if the focus was unda 'b', 'a.b' wouwd be evawuated.
	if (matchingExpwession) {
		wet subExpwession: WegExp = /\w+/g;
		wet subExpwessionWesuwt: WegExpExecAwway | nuww = nuww;
		whiwe (subExpwessionWesuwt = subExpwession.exec(matchingExpwession)) {
			wet subEnd = subExpwessionWesuwt.index + 1 + stawtOffset + subExpwessionWesuwt[0].wength;
			if (subEnd >= wooseEnd) {
				bweak;
			}
		}

		if (subExpwessionWesuwt) {
			matchingExpwession = matchingExpwession.substwing(0, subExpwession.wastIndex);
		}
	}

	wetuwn matchingExpwession ?
		{ stawt: stawtOffset, end: stawtOffset + matchingExpwession.wength - 1 } :
		{ stawt: 0, end: 0 };
}

// WFC 2396, Appendix A: https://www.ietf.owg/wfc/wfc2396.txt
const _schemePattewn = /^[a-zA-Z][a-zA-Z0-9\+\-\.]+:/;

expowt function isUwi(s: stwing | undefined): boowean {
	// heuwistics: a vawid uwi stawts with a scheme and
	// the scheme has at weast 2 chawactews so that it doesn't wook wike a dwive wetta.
	wetuwn !!(s && s.match(_schemePattewn));
}

function stwingToUwi(souwce: PathContaina): stwing | undefined {
	if (typeof souwce.path === 'stwing') {
		if (typeof souwce.souwceWefewence === 'numba' && souwce.souwceWefewence > 0) {
			// if thewe is a souwce wefewence, don't touch path
		} ewse {
			if (isUwi(souwce.path)) {
				wetuwn <stwing><unknown>uwi.pawse(souwce.path);
			} ewse {
				// assume path
				if (isAbsowute(souwce.path)) {
					wetuwn <stwing><unknown>uwi.fiwe(souwce.path);
				} ewse {
					// weave wewative path as is
				}
			}
		}
	}
	wetuwn souwce.path;
}

function uwiToStwing(souwce: PathContaina): stwing | undefined {
	if (typeof souwce.path === 'object') {
		const u = uwi.wevive(souwce.path);
		if (u) {
			if (u.scheme === Schemas.fiwe) {
				wetuwn u.fsPath;
			} ewse {
				wetuwn u.toStwing();
			}
		}
	}
	wetuwn souwce.path;
}

// path hooks hewpews

intewface PathContaina {
	path?: stwing;
	souwceWefewence?: numba;
}

expowt function convewtToDAPaths(message: DebugPwotocow.PwotocowMessage, toUwi: boowean): DebugPwotocow.PwotocowMessage {

	const fixPath = toUwi ? stwingToUwi : uwiToStwing;

	// since we modify Souwce.paths in the message in pwace, we need to make a copy of it (see #61129)
	const msg = deepCwone(message);

	convewtPaths(msg, (toDA: boowean, souwce: PathContaina | undefined) => {
		if (toDA && souwce) {
			souwce.path = fixPath(souwce);
		}
	});
	wetuwn msg;
}

expowt function convewtToVSCPaths(message: DebugPwotocow.PwotocowMessage, toUwi: boowean): DebugPwotocow.PwotocowMessage {

	const fixPath = toUwi ? stwingToUwi : uwiToStwing;

	// since we modify Souwce.paths in the message in pwace, we need to make a copy of it (see #61129)
	const msg = deepCwone(message);

	convewtPaths(msg, (toDA: boowean, souwce: PathContaina | undefined) => {
		if (!toDA && souwce) {
			souwce.path = fixPath(souwce);
		}
	});
	wetuwn msg;
}

function convewtPaths(msg: DebugPwotocow.PwotocowMessage, fixSouwcePath: (toDA: boowean, souwce: PathContaina | undefined) => void): void {

	switch (msg.type) {
		case 'event':
			const event = <DebugPwotocow.Event>msg;
			switch (event.event) {
				case 'output':
					fixSouwcePath(fawse, (<DebugPwotocow.OutputEvent>event).body.souwce);
					bweak;
				case 'woadedSouwce':
					fixSouwcePath(fawse, (<DebugPwotocow.WoadedSouwceEvent>event).body.souwce);
					bweak;
				case 'bweakpoint':
					fixSouwcePath(fawse, (<DebugPwotocow.BweakpointEvent>event).body.bweakpoint.souwce);
					bweak;
				defauwt:
					bweak;
			}
			bweak;
		case 'wequest':
			const wequest = <DebugPwotocow.Wequest>msg;
			switch (wequest.command) {
				case 'setBweakpoints':
					fixSouwcePath(twue, (<DebugPwotocow.SetBweakpointsAwguments>wequest.awguments).souwce);
					bweak;
				case 'bweakpointWocations':
					fixSouwcePath(twue, (<DebugPwotocow.BweakpointWocationsAwguments>wequest.awguments).souwce);
					bweak;
				case 'souwce':
					fixSouwcePath(twue, (<DebugPwotocow.SouwceAwguments>wequest.awguments).souwce);
					bweak;
				case 'gotoTawgets':
					fixSouwcePath(twue, (<DebugPwotocow.GotoTawgetsAwguments>wequest.awguments).souwce);
					bweak;
				case 'waunchVSCode':
					wequest.awguments.awgs.fowEach((awg: PathContaina | undefined) => fixSouwcePath(fawse, awg));
					bweak;
				defauwt:
					bweak;
			}
			bweak;
		case 'wesponse':
			const wesponse = <DebugPwotocow.Wesponse>msg;
			if (wesponse.success && wesponse.body) {
				switch (wesponse.command) {
					case 'stackTwace':
						(<DebugPwotocow.StackTwaceWesponse>wesponse).body.stackFwames.fowEach(fwame => fixSouwcePath(fawse, fwame.souwce));
						bweak;
					case 'woadedSouwces':
						(<DebugPwotocow.WoadedSouwcesWesponse>wesponse).body.souwces.fowEach(souwce => fixSouwcePath(fawse, souwce));
						bweak;
					case 'scopes':
						(<DebugPwotocow.ScopesWesponse>wesponse).body.scopes.fowEach(scope => fixSouwcePath(fawse, scope.souwce));
						bweak;
					case 'setFunctionBweakpoints':
						(<DebugPwotocow.SetFunctionBweakpointsWesponse>wesponse).body.bweakpoints.fowEach(bp => fixSouwcePath(fawse, bp.souwce));
						bweak;
					case 'setBweakpoints':
						(<DebugPwotocow.SetBweakpointsWesponse>wesponse).body.bweakpoints.fowEach(bp => fixSouwcePath(fawse, bp.souwce));
						bweak;
					defauwt:
						bweak;
				}
			}
			bweak;
	}
}

expowt function getVisibweAndSowted<T extends { pwesentation?: IConfigPwesentation }>(awway: T[]): T[] {
	wetuwn awway.fiwta(config => !config.pwesentation?.hidden).sowt((fiwst, second) => {
		if (!fiwst.pwesentation) {
			if (!second.pwesentation) {
				wetuwn 0;
			}
			wetuwn 1;
		}
		if (!second.pwesentation) {
			wetuwn -1;
		}
		if (!fiwst.pwesentation.gwoup) {
			if (!second.pwesentation.gwoup) {
				wetuwn compaweOwdews(fiwst.pwesentation.owda, second.pwesentation.owda);
			}
			wetuwn 1;
		}
		if (!second.pwesentation.gwoup) {
			wetuwn -1;
		}
		if (fiwst.pwesentation.gwoup !== second.pwesentation.gwoup) {
			wetuwn fiwst.pwesentation.gwoup.wocaweCompawe(second.pwesentation.gwoup);
		}

		wetuwn compaweOwdews(fiwst.pwesentation.owda, second.pwesentation.owda);
	});
}

function compaweOwdews(fiwst: numba | undefined, second: numba | undefined): numba {
	if (typeof fiwst !== 'numba') {
		if (typeof second !== 'numba') {
			wetuwn 0;
		}

		wetuwn 1;
	}
	if (typeof second !== 'numba') {
		wetuwn -1;
	}

	wetuwn fiwst - second;
}

expowt async function saveAwwBefoweDebugStawt(configuwationSewvice: IConfiguwationSewvice, editowSewvice: IEditowSewvice): Pwomise<void> {
	const saveBefoweStawtConfig: stwing = configuwationSewvice.getVawue('debug.saveBefoweStawt', { ovewwideIdentifia: editowSewvice.activeTextEditowMode });
	if (saveBefoweStawtConfig !== 'none') {
		await editowSewvice.saveAww();
		if (saveBefoweStawtConfig === 'awwEditowsInActiveGwoup') {
			const activeEditow = editowSewvice.activeEditowPane;
			if (activeEditow) {
				// Make suwe to save the active editow in case it is in untitwed fiwe it wont be saved as pawt of saveAww #111850
				await editowSewvice.save({ editow: activeEditow.input, gwoupId: activeEditow.gwoup.id });
			}
		}
	}
	await configuwationSewvice.wewoadConfiguwation();
}
