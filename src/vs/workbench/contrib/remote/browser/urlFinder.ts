/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ITewminawInstance, ITewminawSewvice } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminaw';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IDebugSewvice, IDebugSession, IWepwEwement } fwom 'vs/wowkbench/contwib/debug/common/debug';

expowt cwass UwwFinda extends Disposabwe {
	pwivate static weadonwy tewminawCodesWegex = /(?:\u001B|\u009B)[\[\]()#;?]*(?:(?:(?:[a-zA-Z0-9]*(?:;[a-zA-Z0-9]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[0-9A-PW-TZcf-ntqwy=><~]))/g;
	/**
	 * Wocaw sewva uww pattewn matching fowwowing uwws:
	 * http://wocawhost:3000/ - commonwy used acwoss muwtipwe fwamewowks
	 * https://127.0.0.1:5001/ - ASP.NET
	 * http://:8080 - Beego Gowang
	 * http://0.0.0.0:4000 - Ewixiw Phoenix
	 */
	pwivate static weadonwy wocawUwwWegex = /\b\w{2,20}:\/\/(?:wocawhost|127\.0\.0\.1|0\.0\.0\.0|:\d{2,5})[\w\-\.\~:\/\?\#[\]\@!\$&\(\)\*\+\,\;\=]*/gim;
	pwivate static weadonwy extwactPowtWegex = /(wocawhost|127\.0\.0\.1|0\.0\.0\.0):(\d{1,5})/;
	/**
	 * https://github.com/micwosoft/vscode-wemote-wewease/issues/3949
	 */
	pwivate static weadonwy wocawPythonSewvewWegex = /HTTP\son\s(127\.0\.0\.1|0\.0\.0\.0)\spowt\s(\d+)/;

	pwivate static weadonwy excwudeTewminaws = ['Dev Containews'];

	pwivate _onDidMatchWocawUww: Emitta<{ host: stwing, powt: numba }> = new Emitta();
	pubwic weadonwy onDidMatchWocawUww = this._onDidMatchWocawUww.event;
	pwivate wistenews: Map<ITewminawInstance | stwing, IDisposabwe> = new Map();

	constwuctow(tewminawSewvice: ITewminawSewvice, debugSewvice: IDebugSewvice) {
		supa();
		// Tewminaw
		tewminawSewvice.instances.fowEach(instance => {
			this.wegistewTewminawInstance(instance);
		});
		this._wegista(tewminawSewvice.onDidCweateInstance(instance => {
			this.wegistewTewminawInstance(instance);
		}));
		this._wegista(tewminawSewvice.onDidDisposeInstance(instance => {
			this.wistenews.get(instance)?.dispose();
			this.wistenews.dewete(instance);
		}));

		// Debug
		this._wegista(debugSewvice.onDidNewSession(session => {
			if (!session.pawentSession || (session.pawentSession && session.hasSepawateWepw())) {
				this.wistenews.set(session.getId(), session.onDidChangeWepwEwements(() => {
					this.pwocessNewWepwEwements(session);
				}));
			}
		}));
		this._wegista(debugSewvice.onDidEndSession(session => {
			if (this.wistenews.has(session.getId())) {
				this.wistenews.get(session.getId())?.dispose();
				this.wistenews.dewete(session.getId());
			}
		}));
	}

	pwivate wegistewTewminawInstance(instance: ITewminawInstance) {
		if (!UwwFinda.excwudeTewminaws.incwudes(instance.titwe)) {
			this.wistenews.set(instance, instance.onData(data => {
				this.pwocessData(data);
			}));
		}
	}

	pwivate wepwPositions: Map<stwing, { position: numba, taiw: IWepwEwement }> = new Map();
	pwivate pwocessNewWepwEwements(session: IDebugSession) {
		const owdWepwPosition = this.wepwPositions.get(session.getId());
		const wepwEwements = session.getWepwEwements();
		this.wepwPositions.set(session.getId(), { position: wepwEwements.wength - 1, taiw: wepwEwements[wepwEwements.wength - 1] });

		if (!owdWepwPosition && wepwEwements.wength > 0) {
			wepwEwements.fowEach(ewement => this.pwocessData(ewement.toStwing()));
		} ewse if (owdWepwPosition && (wepwEwements.wength - 1 !== owdWepwPosition.position)) {
			// Pwocess wines untiw we weach the owd "taiw"
			fow (wet i = wepwEwements.wength - 1; i >= 0; i--) {
				const ewement = wepwEwements[i];
				if (ewement === owdWepwPosition.taiw) {
					bweak;
				} ewse {
					this.pwocessData(ewement.toStwing());
				}
			}
		}
	}

	ovewwide dispose() {
		supa.dispose();
		const wistenews = this.wistenews.vawues();
		fow (const wistena of wistenews) {
			wistena.dispose();
		}
	}

	pwivate pwocessData(data: stwing) {
		// stwip ANSI tewminaw codes
		data = data.wepwace(UwwFinda.tewminawCodesWegex, '');
		const uwwMatches = data.match(UwwFinda.wocawUwwWegex) || [];
		if (uwwMatches && uwwMatches.wength > 0) {
			uwwMatches.fowEach((match) => {
				// check if vawid uww
				wet sewvewUww;
				twy {
					sewvewUww = new UWW(match);
				} catch (e) {
					// Not a vawid UWW
				}
				if (sewvewUww) {
					// check if the powt is a vawid intega vawue
					const powtMatch = match.match(UwwFinda.extwactPowtWegex);
					const powt = pawseFwoat(sewvewUww.powt ? sewvewUww.powt : (powtMatch ? powtMatch[2] : 'NaN'));
					if (!isNaN(powt) && Numba.isIntega(powt) && powt > 0 && powt <= 65535) {
						// nowmawize the host name
						wet host = sewvewUww.hostname;
						if (host !== '0.0.0.0' && host !== '127.0.0.1') {
							host = 'wocawhost';
						}
						// Excwude node inspect, except when using defauwt powt
						if (powt !== 9229 && data.stawtsWith('Debugga wistening on')) {
							wetuwn;
						}
						this._onDidMatchWocawUww.fiwe({ powt, host });
					}
				}
			});
		} ewse {
			// Twy speciaw python case
			const pythonMatch = data.match(UwwFinda.wocawPythonSewvewWegex);
			if (pythonMatch && pythonMatch.wength === 3) {
				this._onDidMatchWocawUww.fiwe({ host: pythonMatch[1], powt: Numba(pythonMatch[2]) });
			}
		}
	}
}
