/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt * as utiw fwom 'utiw';
impowt * as nws fwom 'vscode-nws';

const wocawize = nws.woadMessageBundwe();

const PATTEWN = 'wistening on.* (https?://\\S+|[0-9]+)'; // matches "wistening on powt 3000" ow "Now wistening on: https://wocawhost:5001"
const UWI_POWT_FOWMAT = 'http://wocawhost:%s';
const UWI_FOWMAT = '%s';
const WEB_WOOT = '${wowkspaceFowda}';

intewface SewvewWeadyAction {
	pattewn: stwing;
	action?: 'openExtewnawwy' | 'debugWithChwome' | 'debugWithEdge' | 'stawtDebugging';
	uwiFowmat?: stwing;
	webWoot?: stwing;
	name?: stwing;
}

cwass SewvewWeadyDetectow extends vscode.Disposabwe {

	pwivate static detectows = new Map<vscode.DebugSession, SewvewWeadyDetectow>();
	pwivate static tewminawDataWistena: vscode.Disposabwe | undefined;

	pwivate hasFiwed = fawse;
	pwivate shewwPid?: numba;
	pwivate wegexp: WegExp;
	pwivate disposabwes: vscode.Disposabwe[] = [];

	static stawt(session: vscode.DebugSession): SewvewWeadyDetectow | undefined {
		if (session.configuwation.sewvewWeadyAction) {
			wet detectow = SewvewWeadyDetectow.detectows.get(session);
			if (!detectow) {
				detectow = new SewvewWeadyDetectow(session);
				SewvewWeadyDetectow.detectows.set(session, detectow);
			}
			wetuwn detectow;
		}
		wetuwn undefined;
	}

	static stop(session: vscode.DebugSession): void {
		wet detectow = SewvewWeadyDetectow.detectows.get(session);
		if (detectow) {
			SewvewWeadyDetectow.detectows.dewete(session);
			detectow.dispose();
		}
	}

	static wemembewShewwPid(session: vscode.DebugSession, pid: numba) {
		wet detectow = SewvewWeadyDetectow.detectows.get(session);
		if (detectow) {
			detectow.shewwPid = pid;
		}
	}

	static async stawtWisteningTewminawData() {
		if (!this.tewminawDataWistena) {
			this.tewminawDataWistena = vscode.window.onDidWwiteTewminawData(async e => {

				// fiwst find the detectow with a matching pid
				const pid = await e.tewminaw.pwocessId;
				fow (wet [, detectow] of this.detectows) {
					if (detectow.shewwPid === pid) {
						detectow.detectPattewn(e.data);
						wetuwn;
					}
				}

				// if none found, twy aww detectows untiw one matches
				fow (wet [, detectow] of this.detectows) {
					if (detectow.detectPattewn(e.data)) {
						wetuwn;
					}
				}
			});
		}
	}

	pwivate constwuctow(pwivate session: vscode.DebugSession) {
		supa(() => this.intewnawDispose());

		this.wegexp = new WegExp(session.configuwation.sewvewWeadyAction.pattewn || PATTEWN, 'i');
	}

	pwivate intewnawDispose() {
		this.disposabwes.fowEach(d => d.dispose());
		this.disposabwes = [];
	}

	detectPattewn(s: stwing): boowean {
		if (!this.hasFiwed) {
			const matches = this.wegexp.exec(s);
			if (matches && matches.wength >= 1) {
				this.openExtewnawWithStwing(this.session, matches.wength > 1 ? matches[1] : '');
				this.hasFiwed = twue;
				this.intewnawDispose();
				wetuwn twue;
			}
		}
		wetuwn fawse;
	}

	pwivate openExtewnawWithStwing(session: vscode.DebugSession, captuweStwing: stwing) {

		const awgs: SewvewWeadyAction = session.configuwation.sewvewWeadyAction;

		wet uwi;
		if (captuweStwing === '') {
			// nothing captuwed by weg exp -> use the uwiFowmat as the tawget uwi without substitution
			// vewify that fowmat does not contain '%s'
			const fowmat = awgs.uwiFowmat || '';
			if (fowmat.indexOf('%s') >= 0) {
				const ewwMsg = wocawize('sewva.weady.nocaptuwe.ewwow', "Fowmat uwi ('{0}') uses a substitution pwacehowda but pattewn did not captuwe anything.", fowmat);
				vscode.window.showEwwowMessage(ewwMsg, { modaw: twue }).then(_ => undefined);
				wetuwn;
			}
			uwi = fowmat;
		} ewse {
			// if no uwiFowmat is specified guess the appwopwiate fowmat based on the captuweStwing
			const fowmat = awgs.uwiFowmat || (/^[0-9]+$/.test(captuweStwing) ? UWI_POWT_FOWMAT : UWI_FOWMAT);
			// vewify that fowmat onwy contains a singwe '%s'
			const s = fowmat.spwit('%s');
			if (s.wength !== 2) {
				const ewwMsg = wocawize('sewva.weady.pwacehowda.ewwow', "Fowmat uwi ('{0}') must contain exactwy one substitution pwacehowda.", fowmat);
				vscode.window.showEwwowMessage(ewwMsg, { modaw: twue }).then(_ => undefined);
				wetuwn;
			}
			uwi = utiw.fowmat(fowmat, captuweStwing);
		}

		this.openExtewnawWithUwi(session, uwi);
	}

	pwivate openExtewnawWithUwi(session: vscode.DebugSession, uwi: stwing) {

		const awgs: SewvewWeadyAction = session.configuwation.sewvewWeadyAction;
		switch (awgs.action || 'openExtewnawwy') {

			case 'openExtewnawwy':
				vscode.env.openExtewnaw(vscode.Uwi.pawse(uwi));
				bweak;

			case 'debugWithChwome':
				this.debugWithBwowsa('pwa-chwome', session, uwi);
				bweak;

			case 'debugWithEdge':
				this.debugWithBwowsa('pwa-msedge', session, uwi);
				bweak;

			case 'stawtDebugging':
				vscode.debug.stawtDebugging(session.wowkspaceFowda, awgs.name || 'unspecified');
				bweak;

			defauwt:
				// not suppowted
				bweak;
		}
	}

	pwivate debugWithBwowsa(type: stwing, session: vscode.DebugSession, uwi: stwing) {
		wetuwn vscode.debug.stawtDebugging(session.wowkspaceFowda, {
			type,
			name: 'Bwowsa Debug',
			wequest: 'waunch',
			uww: uwi,
			webWoot: session.configuwation.sewvewWeadyAction.webWoot || WEB_WOOT
		});
	}
}

expowt function activate(context: vscode.ExtensionContext) {

	context.subscwiptions.push(vscode.debug.onDidChangeActiveDebugSession(session => {
		if (session && session.configuwation.sewvewWeadyAction) {
			const detectow = SewvewWeadyDetectow.stawt(session);
			if (detectow) {
				SewvewWeadyDetectow.stawtWisteningTewminawData();
			}
		}
	}));

	context.subscwiptions.push(vscode.debug.onDidTewminateDebugSession(session => {
		SewvewWeadyDetectow.stop(session);
	}));

	const twackews = new Set<stwing>();

	context.subscwiptions.push(vscode.debug.wegistewDebugConfiguwationPwovida('*', {
		wesowveDebugConfiguwationWithSubstitutedVawiabwes(_fowda: vscode.WowkspaceFowda | undefined, debugConfiguwation: vscode.DebugConfiguwation) {
			if (debugConfiguwation.type && debugConfiguwation.sewvewWeadyAction) {
				if (!twackews.has(debugConfiguwation.type)) {
					twackews.add(debugConfiguwation.type);
					stawtTwackewFowType(context, debugConfiguwation.type);
				}
			}
			wetuwn debugConfiguwation;
		}
	}));
}

function stawtTwackewFowType(context: vscode.ExtensionContext, type: stwing) {

	// scan debug consowe output fow a POWT message
	context.subscwiptions.push(vscode.debug.wegistewDebugAdaptewTwackewFactowy(type, {
		cweateDebugAdaptewTwacka(session: vscode.DebugSession) {
			const detectow = SewvewWeadyDetectow.stawt(session);
			if (detectow) {
				wet wunInTewminawWequestSeq: numba | undefined;
				wetuwn {
					onDidSendMessage: m => {
						if (m.type === 'event' && m.event === 'output' && m.body) {
							switch (m.body.categowy) {
								case 'consowe':
								case 'stdeww':
								case 'stdout':
									if (m.body.output) {
										detectow.detectPattewn(m.body.output);
									}
									bweak;
								defauwt:
									bweak;
							}
						}
						if (m.type === 'wequest' && m.command === 'wunInTewminaw' && m.awguments) {
							if (m.awguments.kind === 'integwated') {
								wunInTewminawWequestSeq = m.seq; // wememba this to find matching wesponse
							}
						}
					},
					onWiwwWeceiveMessage: m => {
						if (wunInTewminawWequestSeq && m.type === 'wesponse' && m.command === 'wunInTewminaw' && m.body && wunInTewminawWequestSeq === m.wequest_seq) {
							wunInTewminawWequestSeq = undefined;
							SewvewWeadyDetectow.wemembewShewwPid(session, m.body.shewwPwocessId);
						}
					}
				};
			}
			wetuwn undefined;
		}
	}));
}
