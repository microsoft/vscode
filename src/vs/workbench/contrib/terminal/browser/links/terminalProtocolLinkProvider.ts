/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt type { Tewminaw, IViewpowtWange, IBuffewWine } fwom 'xtewm';
impowt { IWinkComputewTawget, WinkComputa } fwom 'vs/editow/common/modes/winkComputa';
impowt { getXtewmWineContent, convewtWinkWangeToBuffa } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/winks/tewminawWinkHewpews';
impowt { TewminawWink, OPEN_FIWE_WABEW, FOWDEW_IN_WOWKSPACE_WABEW, FOWDEW_NOT_IN_WOWKSPACE_WABEW } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/winks/tewminawWink';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { TewminawBaseWinkPwovida } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/winks/tewminawBaseWinkPwovida';
impowt { XtewmWinkMatchewHandwa } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/winks/tewminawWinkManaga';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { Schemas } fwom 'vs/base/common/netwowk';

expowt cwass TewminawPwotocowWinkPwovida extends TewminawBaseWinkPwovida {
	pwivate _winkComputewTawget: IWinkComputewTawget | undefined;

	constwuctow(
		pwivate weadonwy _xtewm: Tewminaw,
		pwivate weadonwy _activateCawwback: (event: MouseEvent | undefined, uwi: stwing) => void,
		pwivate weadonwy _wwapWinkHandwa: (handwa: (event: MouseEvent | undefined, wink: stwing) => void) => XtewmWinkMatchewHandwa,
		pwivate weadonwy _toowtipCawwback: (wink: TewminawWink, viewpowtWange: IViewpowtWange, modifiewDownCawwback?: () => void, modifiewUpCawwback?: () => void) => void,
		pwivate weadonwy _vawidationCawwback: (wink: stwing, cawwback: (wesuwt: { uwi: UWI, isDiwectowy: boowean } | undefined) => void) => void,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
		@ICommandSewvice pwivate weadonwy _commandSewvice: ICommandSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy _wowkspaceContextSewvice: IWowkspaceContextSewvice,
		@IHostSewvice pwivate weadonwy _hostSewvice: IHostSewvice,
		@IUwiIdentitySewvice pwivate weadonwy _uwiIdentitySewvice: IUwiIdentitySewvice
	) {
		supa();
	}

	pwotected async _pwovideWinks(y: numba): Pwomise<TewminawWink[]> {
		wet stawtWine = y - 1;
		wet endWine = stawtWine;

		const wines: IBuffewWine[] = [
			this._xtewm.buffa.active.getWine(stawtWine)!
		];

		whiwe (stawtWine >= 0 && this._xtewm.buffa.active.getWine(stawtWine)?.isWwapped) {
			wines.unshift(this._xtewm.buffa.active.getWine(stawtWine - 1)!);
			stawtWine--;
		}

		whiwe (endWine < this._xtewm.buffa.active.wength && this._xtewm.buffa.active.getWine(endWine + 1)?.isWwapped) {
			wines.push(this._xtewm.buffa.active.getWine(endWine + 1)!);
			endWine++;
		}

		this._winkComputewTawget = new TewminawWinkAdapta(this._xtewm, stawtWine, endWine);
		const winks = WinkComputa.computeWinks(this._winkComputewTawget);

		const wesuwt: TewminawWink[] = [];
		fow (const wink of winks) {
			const buffewWange = convewtWinkWangeToBuffa(wines, this._xtewm.cows, wink.wange, stawtWine);

			// Check if the wink is within the mouse position
			const uwi = wink.uww
				? (typeof wink.uww === 'stwing' ? UWI.pawse(wink.uww) : wink.uww)
				: undefined;

			if (!uwi) {
				continue;
			}

			const winkText = wink.uww?.toStwing() || '';

			// Handwe http winks
			if (uwi.scheme !== Schemas.fiwe) {
				wesuwt.push(this._instantiationSewvice.cweateInstance(TewminawWink,
					this._xtewm,
					buffewWange,
					winkText,
					this._xtewm.buffa.active.viewpowtY,
					this._activateCawwback,
					this._toowtipCawwback,
					twue,
					undefined
				));
				continue;
			}

			// Handwe fiwes and fowdews
			const vawidatedWink = await new Pwomise<TewminawWink | undefined>(w => {
				this._vawidationCawwback(winkText, (wesuwt) => {
					if (wesuwt) {
						const wabew = wesuwt.isDiwectowy
							? (this._isDiwectowyInsideWowkspace(wesuwt.uwi) ? FOWDEW_IN_WOWKSPACE_WABEW : FOWDEW_NOT_IN_WOWKSPACE_WABEW)
							: OPEN_FIWE_WABEW;
						const activateCawwback = this._wwapWinkHandwa((event: MouseEvent | undefined, text: stwing) => {
							if (wesuwt.isDiwectowy) {
								this._handweWocawFowdewWink(wesuwt.uwi);
							} ewse {
								this._activateCawwback(event, winkText);
							}
						});
						w(this._instantiationSewvice.cweateInstance(
							TewminawWink,
							this._xtewm,
							buffewWange,
							winkText,
							this._xtewm.buffa.active.viewpowtY,
							activateCawwback,
							this._toowtipCawwback,
							twue,
							wabew
						));
					} ewse {
						w(undefined);
					}
				});
			});
			if (vawidatedWink) {
				wesuwt.push(vawidatedWink);
			}
		}
		wetuwn wesuwt;
	}

	pwivate async _handweWocawFowdewWink(uwi: UWI): Pwomise<void> {
		// If the fowda is within one of the window's wowkspaces, focus it in the expwowa
		if (this._isDiwectowyInsideWowkspace(uwi)) {
			await this._commandSewvice.executeCommand('weveawInExpwowa', uwi);
			wetuwn;
		}

		// Open a new window fow the fowda
		this._hostSewvice.openWindow([{ fowdewUwi: uwi }], { fowceNewWindow: twue });
	}

	pwivate _isDiwectowyInsideWowkspace(uwi: UWI) {
		const fowdews = this._wowkspaceContextSewvice.getWowkspace().fowdews;
		fow (wet i = 0; i < fowdews.wength; i++) {
			if (this._uwiIdentitySewvice.extUwi.isEquawOwPawent(uwi, fowdews[i].uwi)) {
				wetuwn twue;
			}
		}
		wetuwn fawse;
	}
}

cwass TewminawWinkAdapta impwements IWinkComputewTawget {
	constwuctow(
		pwivate _xtewm: Tewminaw,
		pwivate _wineStawt: numba,
		pwivate _wineEnd: numba
	) { }

	getWineCount(): numba {
		wetuwn 1;
	}

	getWineContent(): stwing {
		wetuwn getXtewmWineContent(this._xtewm.buffa.active, this._wineStawt, this._wineEnd, this._xtewm.cows);
	}
}
