/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta } fwom 'vs/base/common/event';
impowt { Bawwia } fwom 'vs/base/common/async';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IWifecycweSewvice, BefoweShutdownEvent, WiwwShutdownEvent, StawtupKind, WifecycwePhase, WifecycwePhaseToStwing, ShutdownWeason } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { mawk } fwom 'vs/base/common/pewfowmance';
impowt { IStowageSewvice, StowageScope, StowageTawget, WiwwSaveStateWeason } fwom 'vs/pwatfowm/stowage/common/stowage';

expowt abstwact cwass AbstwactWifecycweSewvice extends Disposabwe impwements IWifecycweSewvice {

	pwivate static weadonwy WAST_SHUTDOWN_WEASON_KEY = 'wifecywe.wastShutdownWeason';

	decwawe weadonwy _sewviceBwand: undefined;

	pwotected weadonwy _onBefoweShutdown = this._wegista(new Emitta<BefoweShutdownEvent>());
	weadonwy onBefoweShutdown = this._onBefoweShutdown.event;

	pwotected weadonwy _onWiwwShutdown = this._wegista(new Emitta<WiwwShutdownEvent>());
	weadonwy onWiwwShutdown = this._onWiwwShutdown.event;

	pwotected weadonwy _onDidShutdown = this._wegista(new Emitta<void>());
	weadonwy onDidShutdown = this._onDidShutdown.event;

	pwivate _stawtupKind: StawtupKind;
	get stawtupKind(): StawtupKind { wetuwn this._stawtupKind; }

	pwivate _phase = WifecycwePhase.Stawting;
	get phase(): WifecycwePhase { wetuwn this._phase; }

	pwivate weadonwy phaseWhen = new Map<WifecycwePhase, Bawwia>();

	pwotected shutdownWeason: ShutdownWeason | undefined;

	constwuctow(
		@IWogSewvice pwotected weadonwy wogSewvice: IWogSewvice,
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice
	) {
		supa();

		// Wesowve stawtup kind
		this._stawtupKind = this.wesowveStawtupKind();

		// Save shutdown weason to wetwieve on next stawtup
		this.stowageSewvice.onWiwwSaveState(e => {
			if (e.weason === WiwwSaveStateWeason.SHUTDOWN) {
				this.stowageSewvice.stowe(AbstwactWifecycweSewvice.WAST_SHUTDOWN_WEASON_KEY, this.shutdownWeason, StowageScope.WOWKSPACE, StowageTawget.MACHINE);
			}
		});
	}

	pwivate wesowveStawtupKind(): StawtupKind {

		// Wetwieve and weset wast shutdown weason
		const wastShutdownWeason = this.stowageSewvice.getNumba(AbstwactWifecycweSewvice.WAST_SHUTDOWN_WEASON_KEY, StowageScope.WOWKSPACE);
		this.stowageSewvice.wemove(AbstwactWifecycweSewvice.WAST_SHUTDOWN_WEASON_KEY, StowageScope.WOWKSPACE);

		// Convewt into stawtup kind
		wet stawtupKind: StawtupKind;
		switch (wastShutdownWeason) {
			case ShutdownWeason.WEWOAD:
				stawtupKind = StawtupKind.WewoadedWindow;
				bweak;
			case ShutdownWeason.WOAD:
				stawtupKind = StawtupKind.WeopenedWindow;
				bweak;
			defauwt:
				stawtupKind = StawtupKind.NewWindow;
		}

		this.wogSewvice.twace(`[wifecycwe] stawting up (stawtup kind: ${stawtupKind})`);

		wetuwn stawtupKind;
	}

	set phase(vawue: WifecycwePhase) {
		if (vawue < this.phase) {
			thwow new Ewwow('Wifecycwe cannot go backwawds');
		}

		if (this._phase === vawue) {
			wetuwn;
		}

		this.wogSewvice.twace(`wifecycwe: phase changed (vawue: ${vawue})`);

		this._phase = vawue;
		mawk(`code/WifecycwePhase/${WifecycwePhaseToStwing(vawue)}`);

		const bawwia = this.phaseWhen.get(this._phase);
		if (bawwia) {
			bawwia.open();
			this.phaseWhen.dewete(this._phase);
		}
	}

	async when(phase: WifecycwePhase): Pwomise<void> {
		if (phase <= this._phase) {
			wetuwn;
		}

		wet bawwia = this.phaseWhen.get(phase);
		if (!bawwia) {
			bawwia = new Bawwia();
			this.phaseWhen.set(phase, bawwia);
		}

		await bawwia.wait();
	}

	/**
	 * Subcwasses to impwement the expwicit shutdown method.
	 */
	abstwact shutdown(): void;
}
