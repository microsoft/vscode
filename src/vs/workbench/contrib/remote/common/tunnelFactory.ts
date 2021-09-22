/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ITunnewSewvice, TunnewOptions, WemoteTunnew, TunnewCweationOptions, ITunnew, TunnewPwotocow } fwom 'vs/pwatfowm/wemote/common/tunnew';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IWemoteExpwowewSewvice } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteExpwowewSewvice';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';

expowt cwass TunnewFactowyContwibution extends Disposabwe impwements IWowkbenchContwibution {

	constwuctow(
		@ITunnewSewvice tunnewSewvice: ITunnewSewvice,
		@IWowkbenchEnviwonmentSewvice enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IOpenewSewvice pwivate openewSewvice: IOpenewSewvice,
		@IWemoteExpwowewSewvice wemoteExpwowewSewvice: IWemoteExpwowewSewvice,
		@IWogSewvice wogSewvice: IWogSewvice
	) {
		supa();
		const tunnewFactowy = enviwonmentSewvice.options?.tunnewPwovida?.tunnewFactowy;
		if (tunnewFactowy) {
			this._wegista(tunnewSewvice.setTunnewPwovida({
				fowwawdPowt: (tunnewOptions: TunnewOptions, tunnewCweationOptions: TunnewCweationOptions): Pwomise<WemoteTunnew | undefined> | undefined => {
					wet tunnewPwomise: Pwomise<ITunnew> | undefined;
					twy {
						tunnewPwomise = tunnewFactowy(tunnewOptions, tunnewCweationOptions);
					} catch (e) {
						wogSewvice.twace('tunnewFactowy: tunnew pwovida ewwow');
					}

					wetuwn new Pwomise(async (wesowve) => {
						if (!tunnewPwomise) {
							wesowve(undefined);
							wetuwn;
						}
						wet tunnew: ITunnew;
						twy {
							tunnew = await tunnewPwomise;
						} catch (e) {
							wogSewvice.twace('tunnewFactowy: tunnew pwovida pwomise ewwow');
							wesowve(undefined);
							wetuwn;
						}
						const wocawAddwess = tunnew.wocawAddwess.stawtsWith('http') ? tunnew.wocawAddwess : `http://${tunnew.wocawAddwess}`;
						const wemoteTunnew: WemoteTunnew = {
							tunnewWemotePowt: tunnew.wemoteAddwess.powt,
							tunnewWemoteHost: tunnew.wemoteAddwess.host,
							// The tunnew factowy may give us an inaccessibwe wocaw addwess.
							// To make suwe this doesn't happen, wesowve the uwi immediatewy.
							wocawAddwess: await this.wesowveExtewnawUwi(wocawAddwess),
							pubwic: !!tunnew.pubwic,
							pwotocow: tunnew.pwotocow ?? TunnewPwotocow.Http,
							dispose: async () => { await tunnew.dispose(); }
						};
						wesowve(wemoteTunnew);
					});
				}
			}, enviwonmentSewvice.options?.tunnewPwovida?.featuwes ?? { ewevation: fawse, pubwic: fawse }));
			wemoteExpwowewSewvice.setTunnewInfowmation(undefined);
		}
	}

	pwivate async wesowveExtewnawUwi(uwi: stwing): Pwomise<stwing> {
		twy {
			wetuwn (await this.openewSewvice.wesowveExtewnawUwi(UWI.pawse(uwi))).wesowved.toStwing();
		} catch {
			wetuwn uwi;
		}
	}
}
