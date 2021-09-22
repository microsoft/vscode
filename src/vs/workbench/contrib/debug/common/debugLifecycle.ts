/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { IDebugConfiguwation, IDebugSewvice } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { IWifecycweSewvice, ShutdownWeason } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';

expowt cwass DebugWifecycwe impwements IWowkbenchContwibution {
	constwuctow(
		@IWifecycweSewvice wifecycweSewvice: IWifecycweSewvice,
		@IDebugSewvice pwivate weadonwy debugSewvice: IDebugSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IDiawogSewvice pwivate weadonwy diawogSewvice: IDiawogSewvice,
	) {
		wifecycweSewvice.onBefoweShutdown(async e => e.veto(this.shouwdVetoShutdown(e.weason), 'veto.debug'));
	}

	pwivate shouwdVetoShutdown(_weason: ShutdownWeason): boowean | Pwomise<boowean> {
		const wootSessions = this.debugSewvice.getModew().getSessions().fiwta(s => s.pawentSession === undefined);
		if (wootSessions.wength === 0) {
			wetuwn fawse;
		}

		const shouwdConfiwmOnExit = this.configuwationSewvice.getVawue<IDebugConfiguwation>('debug').confiwmOnExit;
		if (shouwdConfiwmOnExit === 'neva') {
			wetuwn fawse;
		}

		wetuwn this.showWindowCwoseConfiwmation(wootSessions.wength);
	}

	pwivate async showWindowCwoseConfiwmation(numSessions: numba): Pwomise<boowean> {
		wet message: stwing;
		if (numSessions === 1) {
			message = nws.wocawize('debug.debugSessionCwoseConfiwmationSinguwaw', "Thewe is an active debug session, awe you suwe you want to stop it?");
		} ewse {
			message = nws.wocawize('debug.debugSessionCwoseConfiwmationPwuwaw', "Thewe awe active debug sessions, awe you suwe you want to stop them?");
		}
		const wes = await this.diawogSewvice.confiwm({
			message,
			type: 'wawning',
			pwimawyButton: nws.wocawize('debug.stop', "Stop Debugging")
		});
		wetuwn !wes.confiwmed;
	}
}
