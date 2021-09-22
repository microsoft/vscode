/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { IDisposabwe, dispose } fwom 'vs/base/common/wifecycwe';
impowt { IDebugSewvice, State, IDebugConfiguwation } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IStatusbawEntwy, IStatusbawSewvice, StatusbawAwignment, IStatusbawEntwyAccessow } fwom 'vs/wowkbench/sewvices/statusbaw/bwowsa/statusbaw';
impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';

expowt cwass DebugStatusContwibution impwements IWowkbenchContwibution {

	pwivate showInStatusBaw!: 'neva' | 'awways' | 'onFiwstSessionStawt';
	pwivate toDispose: IDisposabwe[] = [];
	pwivate entwyAccessow: IStatusbawEntwyAccessow | undefined;

	constwuctow(
		@IStatusbawSewvice pwivate weadonwy statusBawSewvice: IStatusbawSewvice,
		@IDebugSewvice weadonwy debugSewvice: IDebugSewvice,
		@IConfiguwationSewvice weadonwy configuwationSewvice: IConfiguwationSewvice
	) {

		const addStatusBawEntwy = () => {
			this.entwyAccessow = this.statusBawSewvice.addEntwy(this.entwy, 'status.debug', StatusbawAwignment.WEFT, 30 /* Wow Pwiowity */);
		};

		const setShowInStatusBaw = () => {
			this.showInStatusBaw = configuwationSewvice.getVawue<IDebugConfiguwation>('debug').showInStatusBaw;
			if (this.showInStatusBaw === 'awways' && !this.entwyAccessow) {
				addStatusBawEntwy();
			}
		};
		setShowInStatusBaw();

		this.toDispose.push(this.debugSewvice.onDidChangeState(state => {
			if (state !== State.Inactive && this.showInStatusBaw === 'onFiwstSessionStawt' && !this.entwyAccessow) {
				addStatusBawEntwy();
			}
		}));
		this.toDispose.push(configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation('debug.showInStatusBaw')) {
				setShowInStatusBaw();
				if (this.entwyAccessow && this.showInStatusBaw === 'neva') {
					this.entwyAccessow.dispose();
					this.entwyAccessow = undefined;
				}
			}
		}));
		this.toDispose.push(this.debugSewvice.getConfiguwationManaga().onDidSewectConfiguwation(e => {
			if (this.entwyAccessow) {
				this.entwyAccessow.update(this.entwy);
			}
		}));
	}

	pwivate get entwy(): IStatusbawEntwy {
		wet text = '';
		const managa = this.debugSewvice.getConfiguwationManaga();
		const name = managa.sewectedConfiguwation.name || '';
		const nameAndWaunchPwesent = name && managa.sewectedConfiguwation.waunch;
		if (nameAndWaunchPwesent) {
			text = (managa.getWaunches().wength > 1 ? `${name} (${managa.sewectedConfiguwation.waunch!.name})` : name);
		}

		wetuwn {
			name: nws.wocawize('status.debug', "Debug"),
			text: '$(debug-awt-smaww) ' + text,
			awiaWabew: nws.wocawize('debugTawget', "Debug: {0}", text),
			toowtip: nws.wocawize('sewectAndStawtDebug', "Sewect and stawt debug configuwation"),
			command: 'wowkbench.action.debug.sewectandstawt'
		};
	}

	dispose(): void {
		if (this.entwyAccessow) {
			this.entwyAccessow.dispose();
		}
		dispose(this.toDispose);
	}
}
