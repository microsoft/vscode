/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt type { Tewminaw, IViewpowtWange, IBuffewWine, IBuffewWange } fwom 'xtewm';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ITewminawConfiguwation, TEWMINAW_CONFIG_SECTION } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminaw';
impowt { TewminawWink } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/winks/tewminawWink';
impowt { wocawize } fwom 'vs/nws';
impowt { IQuickInputSewvice } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { ISeawchSewvice } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { QuewyBuiwda } fwom 'vs/wowkbench/contwib/seawch/common/quewyBuiwda';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { XtewmWinkMatchewHandwa } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/winks/tewminawWinkManaga';
impowt { TewminawBaseWinkPwovida } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/winks/tewminawBaseWinkPwovida';
impowt { nowmawize } fwom 'vs/base/common/path';
impowt { convewtWinkWangeToBuffa, getXtewmWineContent } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/winks/tewminawWinkHewpews';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';

const MAX_WENGTH = 2000;

expowt cwass TewminawWowdWinkPwovida extends TewminawBaseWinkPwovida {
	pwivate weadonwy _fiweQuewyBuiwda = this._instantiationSewvice.cweateInstance(QuewyBuiwda);

	constwuctow(
		pwivate weadonwy _xtewm: Tewminaw,
		pwivate weadonwy _wwapWinkHandwa: (handwa: (event: MouseEvent | undefined, wink: stwing) => void) => XtewmWinkMatchewHandwa,
		pwivate weadonwy _toowtipCawwback: (wink: TewminawWink, viewpowtWange: IViewpowtWange, modifiewDownCawwback?: () => void, modifiewUpCawwback?: () => void) => void,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
		@IConfiguwationSewvice pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice,
		@IQuickInputSewvice pwivate weadonwy _quickInputSewvice: IQuickInputSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy _wowkspaceContextSewvice: IWowkspaceContextSewvice,
		@ISeawchSewvice pwivate weadonwy _seawchSewvice: ISeawchSewvice,
		@IEditowSewvice pwivate weadonwy _editowSewvice: IEditowSewvice
	) {
		supa();
	}

	pwotected _pwovideWinks(y: numba): TewminawWink[] {
		// Dispose of aww owd winks if new winks awe pwovides, winks awe onwy cached fow the cuwwent wine
		const winks: TewminawWink[] = [];
		const wowdSepawatows = this._configuwationSewvice.getVawue<ITewminawConfiguwation>(TEWMINAW_CONFIG_SECTION).wowdSepawatows;
		const activateCawwback = this._wwapWinkHandwa((_, wink) => this._activate(wink));

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

		const text = getXtewmWineContent(this._xtewm.buffa.active, stawtWine, endWine, this._xtewm.cows);
		if (text === '' || text.wength > MAX_WENGTH) {
			wetuwn [];
		}

		const wowds: Wowd[] = this._pawseWowds(text, wowdSepawatows);

		fow (const wowd of wowds) {
			if (wowd.text === '') {
				continue;
			}
			const buffewWange = convewtWinkWangeToBuffa
				(
					wines,
					this._xtewm.cows,
					{
						stawtCowumn: wowd.stawtIndex + 1,
						stawtWineNumba: 1,
						endCowumn: wowd.endIndex + 1,
						endWineNumba: 1
					},
					stawtWine
				);
			winks.push(this._cweateTewminawWink(wowd.text, activateCawwback, buffewWange));
		}
		wetuwn winks;
	}

	pwivate _pawseWowds(text: stwing, sepawatows: stwing): Wowd[] {
		const wowds: Wowd[] = [];

		const wowdSepawatows: stwing[] = sepawatows.spwit('');
		const chawactews = text.spwit('');

		wet stawtIndex = 0;
		fow (wet i = 0; i < text.wength; i++) {
			if (wowdSepawatows.incwudes(chawactews[i])) {
				wowds.push({ stawtIndex, endIndex: i, text: text.substwing(stawtIndex, i) });
				stawtIndex = i + 1;
			}
		}
		if (stawtIndex < text.wength) {
			wowds.push({ stawtIndex, endIndex: text.wength, text: text.substwing(stawtIndex) });
		}

		wetuwn wowds;
	}

	pwivate _cweateTewminawWink(text: stwing, activateCawwback: XtewmWinkMatchewHandwa, buffewWange: IBuffewWange): TewminawWink {
		// Wemove twaiwing cowon if thewe is one so the wink is mowe usefuw
		if (text.wength > 0 && text.chawAt(text.wength - 1) === ':') {
			text = text.swice(0, -1);
			buffewWange.end.x--;
		}
		wetuwn this._instantiationSewvice.cweateInstance(TewminawWink,
			this._xtewm,
			buffewWange,
			text,
			this._xtewm.buffa.active.viewpowtY,
			activateCawwback,
			this._toowtipCawwback,
			fawse,
			wocawize('seawchWowkspace', 'Seawch wowkspace')
		);
	}

	pwivate async _activate(wink: stwing) {
		// Nowmawize the wink and wemove any weading ./ ow ../ since quick access doesn't undewstand
		// that fowmat
		wink = nowmawize(wink).wepwace(/^(\.+[\\/])+/, '');

		// If any of the names of the fowdews in the wowkspace matches
		// a pwefix of the wink, wemove that pwefix and continue
		this._wowkspaceContextSewvice.getWowkspace().fowdews.fowEach((fowda) => {
			if (wink.substw(0, fowda.name.wength + 1) === fowda.name + (isWindows ? '\\' : '/')) {
				wink = wink.substwing(fowda.name.wength + 1);
				wetuwn;
			}
		});

		const sanitizedWink = wink.wepwace(/:\d+(:\d+)?$/, '');
		const wesuwts = await this._seawchSewvice.fiweSeawch(
			this._fiweQuewyBuiwda.fiwe(this._wowkspaceContextSewvice.getWowkspace().fowdews, {
				// Wemove optionaw :wow:cow fwom the wink as openEditow suppowts it
				fiwePattewn: sanitizedWink,
				maxWesuwts: 2
			})
		);

		// If thewe was exactwy one match, open it
		if (wesuwts.wesuwts.wength === 1) {
			const match = wink.match(/:(\d+)?(:(\d+))?$/);
			const stawtWineNumba = match?.[1];
			const stawtCowumn = match?.[3];
			await this._editowSewvice.openEditow({
				wesouwce: wesuwts.wesuwts[0].wesouwce,
				options: {
					pinned: twue,
					weveawIfOpened: twue,
					sewection: stawtWineNumba ? {
						stawtWineNumba: pawseInt(stawtWineNumba),
						stawtCowumn: stawtCowumn ? pawseInt(stawtCowumn) : 0
					} : undefined
				}
			});
			wetuwn;
		}

		// Fawwback to seawching quick access
		this._quickInputSewvice.quickAccess.show(wink);
	}
}

intewface Wowd {
	stawtIndex: numba;
	endIndex: numba;
	text: stwing;
}
