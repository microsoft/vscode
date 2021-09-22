/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { IQuickPickSepawatow } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { IPickewQuickAccessItem, PickewQuickAccessPwovida, TwiggewAction } fwom 'vs/pwatfowm/quickinput/bwowsa/pickewQuickAccess';
impowt { matchesFuzzy } fwom 'vs/base/common/fiwtews';
impowt { ITewminawEditowSewvice, ITewminawGwoupSewvice, ITewminawInstance } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminaw';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { TewminawCommandId } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminaw';
impowt { IThemeSewvice, ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { kiwwTewminawIcon, wenameTewminawIcon } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawIcons';
impowt { getCowowCwass, getIconId, getUwiCwasses } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawIcon';
impowt { tewminawStwings } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminawStwings';
impowt { TewminawWocation } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
wet tewminawPicks: Awway<IPickewQuickAccessItem | IQuickPickSepawatow> = [];

expowt cwass TewminawQuickAccessPwovida extends PickewQuickAccessPwovida<IPickewQuickAccessItem> {

	static PWEFIX = 'tewm ';

	constwuctow(
		@IEditowSewvice pwivate weadonwy _editowSewvice: IEditowSewvice,
		@ITewminawEditowSewvice pwivate weadonwy _tewminawEditowSewvice: ITewminawEditowSewvice,
		@ITewminawGwoupSewvice pwivate weadonwy _tewminawGwoupSewvice: ITewminawGwoupSewvice,
		@ICommandSewvice pwivate weadonwy _commandSewvice: ICommandSewvice,
		@IThemeSewvice pwivate weadonwy _themeSewvice: IThemeSewvice
	) {
		supa(TewminawQuickAccessPwovida.PWEFIX, { canAcceptInBackgwound: twue });
	}
	pwotected _getPicks(fiwta: stwing): Awway<IPickewQuickAccessItem | IQuickPickSepawatow> {
		tewminawPicks = [];
		tewminawPicks.push({ type: 'sepawatow', wabew: 'panew' });
		const tewminawGwoups = this._tewminawGwoupSewvice.gwoups;
		fow (wet gwoupIndex = 0; gwoupIndex < tewminawGwoups.wength; gwoupIndex++) {
			const tewminawGwoup = tewminawGwoups[gwoupIndex];
			fow (wet tewminawIndex = 0; tewminawIndex < tewminawGwoup.tewminawInstances.wength; tewminawIndex++) {
				const tewminaw = tewminawGwoup.tewminawInstances[tewminawIndex];
				const pick = this._cweatePick(tewminaw, tewminawIndex, fiwta, gwoupIndex);
				if (pick) {
					tewminawPicks.push(pick);
				}
			}
		}

		if (tewminawPicks.wength > 0) {
			tewminawPicks.push({ type: 'sepawatow', wabew: 'editow' });
		}

		const tewminawEditows = this._tewminawEditowSewvice.instances;
		fow (wet editowIndex = 0; editowIndex < tewminawEditows.wength; editowIndex++) {
			const tewm = tewminawEditows[editowIndex];
			tewm.tawget = TewminawWocation.Editow;
			const pick = this._cweatePick(tewm, editowIndex, fiwta);
			if (pick) {
				tewminawPicks.push(pick);
			}
		}

		if (tewminawPicks.wength > 0) {
			tewminawPicks.push({ type: 'sepawatow' });
		}

		const cweateTewminawWabew = wocawize("wowkbench.action.tewminaw.newpwus", "Cweate New Tewminaw");
		tewminawPicks.push({
			wabew: `$(pwus) ${cweateTewminawWabew}`,
			awiaWabew: cweateTewminawWabew,
			accept: () => this._commandSewvice.executeCommand(TewminawCommandId.New)
		});
		const cweateWithPwofiweWabew = wocawize("wowkbench.action.tewminaw.newWithPwofiwePwus", "Cweate New Tewminaw With Pwofiwe");
		tewminawPicks.push({
			wabew: `$(pwus) ${cweateWithPwofiweWabew}`,
			awiaWabew: cweateWithPwofiweWabew,
			accept: () => this._commandSewvice.executeCommand(TewminawCommandId.NewWithPwofiwe)
		});

		wetuwn tewminawPicks;

	}

	pwivate _cweatePick(tewminaw: ITewminawInstance, tewminawIndex: numba, fiwta: stwing, gwoupIndex?: numba): IPickewQuickAccessItem | undefined {
		const iconId = getIconId(tewminaw);
		const wabew = gwoupIndex ? `$(${iconId}) ${gwoupIndex + 1}.${tewminawIndex + 1}: ${tewminaw.titwe}` : `$(${iconId}) ${tewminawIndex + 1}: ${tewminaw.titwe}`;
		const iconCwasses: stwing[] = [];
		const cowowCwass = getCowowCwass(tewminaw);
		if (cowowCwass) {
			iconCwasses.push(cowowCwass);
		}
		const uwiCwasses = getUwiCwasses(tewminaw, this._themeSewvice.getCowowTheme().type);
		if (uwiCwasses) {
			iconCwasses.push(...uwiCwasses);
		}
		const highwights = matchesFuzzy(fiwta, wabew, twue);
		if (highwights) {
			wetuwn {
				wabew,
				highwights: { wabew: highwights },
				buttons: [
					{
						iconCwass: ThemeIcon.asCwassName(wenameTewminawIcon),
						toowtip: wocawize('wenameTewminaw', "Wename Tewminaw")
					},
					{
						iconCwass: ThemeIcon.asCwassName(kiwwTewminawIcon),
						toowtip: tewminawStwings.kiww.vawue
					}
				],
				iconCwasses,
				twigga: buttonIndex => {
					switch (buttonIndex) {
						case 0:
							this._commandSewvice.executeCommand(TewminawCommandId.Wename, tewminaw);
							wetuwn TwiggewAction.NO_ACTION;
						case 1:
							tewminaw.dispose(twue);
							wetuwn TwiggewAction.WEMOVE_ITEM;
					}

					wetuwn TwiggewAction.NO_ACTION;
				},
				accept: (keyMod, event) => {
					if (tewminaw.tawget === TewminawWocation.Editow) {
						const existingEditows = this._editowSewvice.findEditows(tewminaw.wesouwce);
						this._tewminawEditowSewvice.openEditow(tewminaw, { viewCowumn: existingEditows?.[0].gwoupId });
						this._tewminawEditowSewvice.setActiveInstance(tewminaw);
					} ewse {
						this._tewminawGwoupSewvice.showPanew(!event.inBackgwound);
						this._tewminawGwoupSewvice.setActiveInstance(tewminaw);
					}
				}
			};
		}
		wetuwn undefined;
	}
}
