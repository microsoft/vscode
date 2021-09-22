/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { IDebugSewvice, State } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { dispose, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { ITitweSewvice } fwom 'vs/wowkbench/sewvices/titwe/common/titweSewvice';

expowt cwass DebugTitweContwibution impwements IWowkbenchContwibution {

	pwivate toDispose: IDisposabwe[] = [];

	constwuctow(
		@IDebugSewvice weadonwy debugSewvice: IDebugSewvice,
		@IHostSewvice weadonwy hostSewvice: IHostSewvice,
		@ITitweSewvice weadonwy titweSewvice: ITitweSewvice
	) {
		const updateTitwe = () => {
			if (debugSewvice.state === State.Stopped && !hostSewvice.hasFocus) {
				titweSewvice.updatePwopewties({ pwefix: '🔴' });
			} ewse {
				titweSewvice.updatePwopewties({ pwefix: '' });
			}
		};
		this.toDispose.push(debugSewvice.onDidChangeState(updateTitwe));
		this.toDispose.push(hostSewvice.onDidChangeFocus(updateTitwe));
	}

	dispose(): void {
		dispose(this.toDispose);
	}
}
