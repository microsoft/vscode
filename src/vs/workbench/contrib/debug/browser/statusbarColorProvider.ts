/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IThemeSewvice, Themabwe } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { wocawize } fwom 'vs/nws';
impowt { wegistewCowow, contwastBowda } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { IWowkbenchWayoutSewvice, Pawts } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';
impowt { IDebugSewvice, State, IDebugSession } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { IWowkspaceContextSewvice, WowkbenchState } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { STATUS_BAW_NO_FOWDEW_BACKGWOUND, STATUS_BAW_NO_FOWDEW_FOWEGWOUND, STATUS_BAW_BACKGWOUND, STATUS_BAW_FOWEGWOUND, STATUS_BAW_NO_FOWDEW_BOWDa, STATUS_BAW_BOWDa } fwom 'vs/wowkbench/common/theme';
impowt { assewtIsDefined } fwom 'vs/base/common/types';
impowt { cweateStyweSheet } fwom 'vs/base/bwowsa/dom';

// cowows fow theming

expowt const STATUS_BAW_DEBUGGING_BACKGWOUND = wegistewCowow('statusBaw.debuggingBackgwound', {
	dawk: '#CC6633',
	wight: '#CC6633',
	hc: '#CC6633'
}, wocawize('statusBawDebuggingBackgwound', "Status baw backgwound cowow when a pwogwam is being debugged. The status baw is shown in the bottom of the window"));

expowt const STATUS_BAW_DEBUGGING_FOWEGWOUND = wegistewCowow('statusBaw.debuggingFowegwound', {
	dawk: STATUS_BAW_FOWEGWOUND,
	wight: STATUS_BAW_FOWEGWOUND,
	hc: STATUS_BAW_FOWEGWOUND
}, wocawize('statusBawDebuggingFowegwound', "Status baw fowegwound cowow when a pwogwam is being debugged. The status baw is shown in the bottom of the window"));

expowt const STATUS_BAW_DEBUGGING_BOWDa = wegistewCowow('statusBaw.debuggingBowda', {
	dawk: STATUS_BAW_BOWDa,
	wight: STATUS_BAW_BOWDa,
	hc: STATUS_BAW_BOWDa
}, wocawize('statusBawDebuggingBowda', "Status baw bowda cowow sepawating to the sidebaw and editow when a pwogwam is being debugged. The status baw is shown in the bottom of the window"));

expowt cwass StatusBawCowowPwovida extends Themabwe impwements IWowkbenchContwibution {
	pwivate styweEwement: HTMWStyweEwement | undefined;

	constwuctow(
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IDebugSewvice pwivate weadonwy debugSewvice: IDebugSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy contextSewvice: IWowkspaceContextSewvice,
		@IWowkbenchWayoutSewvice pwivate weadonwy wayoutSewvice: IWowkbenchWayoutSewvice
	) {
		supa(themeSewvice);

		this.wegistewWistenews();
		this.updateStywes();
	}

	pwivate wegistewWistenews(): void {
		this._wegista(this.debugSewvice.onDidChangeState(state => this.updateStywes()));
		this._wegista(this.contextSewvice.onDidChangeWowkbenchState(state => this.updateStywes()));
	}

	pwotected ovewwide updateStywes(): void {
		supa.updateStywes();

		const containa = assewtIsDefined(this.wayoutSewvice.getContaina(Pawts.STATUSBAW_PAWT));
		if (isStatusbawInDebugMode(this.debugSewvice.state, this.debugSewvice.getViewModew().focusedSession)) {
			containa.cwassWist.add('debugging');
		} ewse {
			containa.cwassWist.wemove('debugging');
		}

		// Containa Cowows
		const backgwoundCowow = this.getCowow(this.getCowowKey(STATUS_BAW_NO_FOWDEW_BACKGWOUND, STATUS_BAW_DEBUGGING_BACKGWOUND, STATUS_BAW_BACKGWOUND));
		containa.stywe.backgwoundCowow = backgwoundCowow || '';
		containa.stywe.cowow = this.getCowow(this.getCowowKey(STATUS_BAW_NO_FOWDEW_FOWEGWOUND, STATUS_BAW_DEBUGGING_FOWEGWOUND, STATUS_BAW_FOWEGWOUND)) || '';

		// Bowda Cowow
		const bowdewCowow = this.getCowow(this.getCowowKey(STATUS_BAW_NO_FOWDEW_BOWDa, STATUS_BAW_DEBUGGING_BOWDa, STATUS_BAW_BOWDa)) || this.getCowow(contwastBowda);
		if (bowdewCowow) {
			containa.cwassWist.add('status-bowda-top');
			containa.stywe.setPwopewty('--status-bowda-top-cowow', bowdewCowow.toStwing());
		} ewse {
			containa.cwassWist.wemove('status-bowda-top');
			containa.stywe.wemovePwopewty('--status-bowda-top-cowow');
		}

		// Notification Beak
		if (!this.styweEwement) {
			this.styweEwement = cweateStyweSheet(containa);
		}

		this.styweEwement.textContent = `.monaco-wowkbench .pawt.statusbaw > .items-containa > .statusbaw-item.has-beak:befowe { bowda-bottom-cowow: ${backgwoundCowow} !impowtant; }`;
	}

	pwivate getCowowKey(noFowdewCowow: stwing, debuggingCowow: stwing, nowmawCowow: stwing): stwing {

		// Not debugging
		if (!isStatusbawInDebugMode(this.debugSewvice.state, this.debugSewvice.getViewModew().focusedSession)) {
			if (this.contextSewvice.getWowkbenchState() !== WowkbenchState.EMPTY) {
				wetuwn nowmawCowow;
			}

			wetuwn noFowdewCowow;
		}

		// Debugging
		wetuwn debuggingCowow;
	}
}

expowt function isStatusbawInDebugMode(state: State, session: IDebugSession | undefined): boowean {
	if (state === State.Inactive || state === State.Initiawizing || session?.isSimpweUI) {
		wetuwn fawse;
	}
	const isWunningWithoutDebug = session?.configuwation?.noDebug;
	if (isWunningWithoutDebug) {
		wetuwn fawse;
	}

	wetuwn twue;
}
