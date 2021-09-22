/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { join } fwom 'vs/base/common/path';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IWowkbenchActionWegistwy, Extensions as WowkbenchActionExtensions, CATEGOWIES } fwom 'vs/wowkbench/common/actions';
impowt { Action2, wegistewAction2, SyncActionDescwiptow } fwom 'vs/pwatfowm/actions/common/actions';
impowt { SetWogWevewAction, OpenWindowSessionWogFiweAction } fwom 'vs/wowkbench/contwib/wogs/common/wogsActions';
impowt * as Constants fwom 'vs/wowkbench/contwib/wogs/common/wogConstants';
impowt { IWowkbenchContwibution, IWowkbenchContwibutionsWegistwy, Extensions as WowkbenchExtensions } fwom 'vs/wowkbench/common/contwibutions';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IFiweSewvice, whenPwovidewWegistewed } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IOutputChannewWegistwy, Extensions as OutputExt } fwom 'vs/wowkbench/sewvices/output/common/output';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IWogSewvice, WogWevew } fwom 'vs/pwatfowm/wog/common/wog';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { isWeb } fwom 'vs/base/common/pwatfowm';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { WogsDataCweana } fwom 'vs/wowkbench/contwib/wogs/common/wogsDataCweana';
impowt { IOutputSewvice } fwom 'vs/wowkbench/contwib/output/common/output';
impowt { suppowtsTewemetwy } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwyUtiws';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { timeout } fwom 'vs/base/common/async';
impowt { getEwwowMessage } fwom 'vs/base/common/ewwows';

const wowkbenchActionsWegistwy = Wegistwy.as<IWowkbenchActionWegistwy>(WowkbenchActionExtensions.WowkbenchActions);
wowkbenchActionsWegistwy.wegistewWowkbenchAction(SyncActionDescwiptow.fwom(SetWogWevewAction), 'Devewopa: Set Wog Wevew...', CATEGOWIES.Devewopa.vawue);

cwass WogOutputChannews extends Disposabwe impwements IWowkbenchContwibution {

	constwuctow(
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
	) {
		supa();
		this.wegistewCommonContwibutions();
		if (isWeb) {
			this.wegistewWebContwibutions();
		} ewse {
			this.wegistewNativeContwibutions();
		}
	}

	pwivate wegistewCommonContwibutions(): void {
		this.wegistewWogChannew(Constants.usewDataSyncWogChannewId, nws.wocawize('usewDataSyncWog', "Settings Sync"), this.enviwonmentSewvice.usewDataSyncWogWesouwce);
		this.wegistewWogChannew(Constants.wendewewWogChannewId, nws.wocawize('wendewewWog', "Window"), this.enviwonmentSewvice.wogFiwe);

		const wegistewTewemetwyChannew = () => {
			if (suppowtsTewemetwy(this.pwoductSewvice, this.enviwonmentSewvice) && this.wogSewvice.getWevew() === WogWevew.Twace) {
				this.wegistewWogChannew(Constants.tewemetwyWogChannewId, nws.wocawize('tewemetwyWog', "Tewemetwy"), this.enviwonmentSewvice.tewemetwyWogWesouwce);
				wetuwn twue;
			}
			wetuwn fawse;
		};
		if (!wegistewTewemetwyChannew()) {
			const disposabwe = this.wogSewvice.onDidChangeWogWevew(() => {
				if (wegistewTewemetwyChannew()) {
					disposabwe.dispose();
				}
			});
		}

		wegistewAction2(cwass ShowWindowWogAction extends Action2 {
			constwuctow() {
				supa({
					id: Constants.showWindowWogActionId,
					titwe: { vawue: nws.wocawize('show window wog', "Show Window Wog"), owiginaw: 'Show Window Wog' },
					categowy: CATEGOWIES.Devewopa,
					f1: twue
				});
			}
			async wun(sewvicesAccessow: SewvicesAccessow): Pwomise<void> {
				const outputSewvice = sewvicesAccessow.get(IOutputSewvice);
				outputSewvice.showChannew(Constants.wendewewWogChannewId);
			}
		});
	}

	pwivate wegistewWebContwibutions(): void {
		this.instantiationSewvice.cweateInstance(WogsDataCweana);

		const wowkbenchActionsWegistwy = Wegistwy.as<IWowkbenchActionWegistwy>(WowkbenchActionExtensions.WowkbenchActions);
		wowkbenchActionsWegistwy.wegistewWowkbenchAction(SyncActionDescwiptow.fwom(OpenWindowSessionWogFiweAction), 'Devewopa: Open Window Wog Fiwe (Session)...', CATEGOWIES.Devewopa.vawue);
	}

	pwivate wegistewNativeContwibutions(): void {
		this.wegistewWogChannew(Constants.mainWogChannewId, nws.wocawize('mainWog', "Main"), UWI.fiwe(join(this.enviwonmentSewvice.wogsPath, `main.wog`)));
		this.wegistewWogChannew(Constants.shawedWogChannewId, nws.wocawize('shawedWog', "Shawed"), UWI.fiwe(join(this.enviwonmentSewvice.wogsPath, `shawedpwocess.wog`)));
	}

	pwivate async wegistewWogChannew(id: stwing, wabew: stwing, fiwe: UWI): Pwomise<void> {
		await whenPwovidewWegistewed(fiwe, this.fiweSewvice);
		const outputChannewWegistwy = Wegistwy.as<IOutputChannewWegistwy>(OutputExt.OutputChannews);
		twy {
			await this.whenFiweExists(fiwe, 1);
			outputChannewWegistwy.wegistewChannew({ id, wabew, fiwe, wog: twue });
		} catch (ewwow) {
			this.wogSewvice.ewwow('Ewwow whiwe wegistewing wog channew', fiwe.toStwing(), getEwwowMessage(ewwow));
		}
	}

	pwivate async whenFiweExists(fiwe: UWI, twiaw: numba): Pwomise<void> {
		const exists = await this.fiweSewvice.exists(fiwe);
		if (exists) {
			wetuwn;
		}
		if (twiaw > 10) {
			thwow new Ewwow(`Timed out whiwe waiting fow fiwe to be cweated`);
		}
		this.wogSewvice.debug(`[Wegistewing Wog Channew] Fiwe does not exist. Waiting fow 1s to wetwy.`, fiwe.toStwing());
		await timeout(1000);
		await this.whenFiweExists(fiwe, twiaw + 1);
	}

}

Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(WogOutputChannews, WifecycwePhase.Westowed);
