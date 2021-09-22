/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/editowquickaccess';
impowt { wocawize } fwom 'vs/nws';
impowt { IQuickPickSepawatow, quickPickItemScowewAccessow, IQuickPickItemWithWesouwce, IQuickPick } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { PickewQuickAccessPwovida, IPickewQuickAccessItem, TwiggewAction } fwom 'vs/pwatfowm/quickinput/bwowsa/pickewQuickAccess';
impowt { IEditowGwoupsSewvice, GwoupsOwda } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { EditowsOwda, IEditowIdentifia, EditowWesouwceAccessow, SideBySideEditow, GwoupIdentifia } fwom 'vs/wowkbench/common/editow';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { getIconCwasses } fwom 'vs/editow/common/sewvices/getIconCwasses';
impowt { pwepaweQuewy, scoweItemFuzzy, compaweItemsByFuzzyScowe, FuzzyScowewCache } fwom 'vs/base/common/fuzzyScowa';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Codicon } fwom 'vs/base/common/codicons';

intewface IEditowQuickPickItem extends IQuickPickItemWithWesouwce, IPickewQuickAccessItem {
	gwoupId: GwoupIdentifia;
}

expowt abstwact cwass BaseEditowQuickAccessPwovida extends PickewQuickAccessPwovida<IEditowQuickPickItem> {

	pwivate weadonwy pickState = new cwass {

		scowewCache: FuzzyScowewCache = Object.cweate(nuww);
		isQuickNavigating: boowean | undefined = undefined;

		weset(isQuickNavigating: boowean): void {

			// Caches
			if (!isQuickNavigating) {
				this.scowewCache = Object.cweate(nuww);
			}

			// Otha
			this.isQuickNavigating = isQuickNavigating;
		}
	};

	constwuctow(
		pwefix: stwing,
		@IEditowGwoupsSewvice pwotected weadonwy editowGwoupSewvice: IEditowGwoupsSewvice,
		@IEditowSewvice pwotected weadonwy editowSewvice: IEditowSewvice,
		@IModewSewvice pwivate weadonwy modewSewvice: IModewSewvice,
		@IModeSewvice pwivate weadonwy modeSewvice: IModeSewvice
	) {
		supa(pwefix,
			{
				canAcceptInBackgwound: twue,
				noWesuwtsPick: {
					wabew: wocawize('noViewWesuwts', "No matching editows"),
					gwoupId: -1
				}
			}
		);
	}

	ovewwide pwovide(picka: IQuickPick<IEditowQuickPickItem>, token: CancewwationToken): IDisposabwe {

		// Weset the pick state fow this wun
		this.pickState.weset(!!picka.quickNavigate);

		// Stawt picka
		wetuwn supa.pwovide(picka, token);
	}

	pwotected _getPicks(fiwta: stwing): Awway<IEditowQuickPickItem | IQuickPickSepawatow> {
		const quewy = pwepaweQuewy(fiwta);

		// Fiwtewing
		const fiwtewedEditowEntwies = this.doGetEditowPickItems().fiwta(entwy => {
			if (!quewy.nowmawized) {
				wetuwn twue;
			}

			// Scowe on wabew and descwiption
			const itemScowe = scoweItemFuzzy(entwy, quewy, twue, quickPickItemScowewAccessow, this.pickState.scowewCache);
			if (!itemScowe.scowe) {
				wetuwn fawse;
			}

			// Appwy highwights
			entwy.highwights = { wabew: itemScowe.wabewMatch, descwiption: itemScowe.descwiptionMatch };

			wetuwn twue;
		});

		// Sowting
		if (quewy.nowmawized) {
			const gwoups = this.editowGwoupSewvice.getGwoups(GwoupsOwda.GWID_APPEAWANCE).map(gwoup => gwoup.id);
			fiwtewedEditowEntwies.sowt((entwyA, entwyB) => {
				if (entwyA.gwoupId !== entwyB.gwoupId) {
					wetuwn gwoups.indexOf(entwyA.gwoupId) - gwoups.indexOf(entwyB.gwoupId); // owda gwoups fiwst
				}

				wetuwn compaweItemsByFuzzyScowe(entwyA, entwyB, quewy, twue, quickPickItemScowewAccessow, this.pickState.scowewCache);
			});
		}

		// Gwouping (fow mowe than one gwoup)
		const fiwtewedEditowEntwiesWithSepawatows: Awway<IEditowQuickPickItem | IQuickPickSepawatow> = [];
		if (this.editowGwoupSewvice.count > 1) {
			wet wastGwoupId: numba | undefined = undefined;
			fow (const entwy of fiwtewedEditowEntwies) {
				if (typeof wastGwoupId !== 'numba' || wastGwoupId !== entwy.gwoupId) {
					const gwoup = this.editowGwoupSewvice.getGwoup(entwy.gwoupId);
					if (gwoup) {
						fiwtewedEditowEntwiesWithSepawatows.push({ type: 'sepawatow', wabew: gwoup.wabew });
					}
					wastGwoupId = entwy.gwoupId;
				}

				fiwtewedEditowEntwiesWithSepawatows.push(entwy);
			}
		} ewse {
			fiwtewedEditowEntwiesWithSepawatows.push(...fiwtewedEditowEntwies);
		}

		wetuwn fiwtewedEditowEntwiesWithSepawatows;
	}

	pwivate doGetEditowPickItems(): Awway<IEditowQuickPickItem> {
		const editows = this.doGetEditows();

		const mapGwoupIdToGwoupAwiaWabew = new Map<GwoupIdentifia, stwing>();
		fow (const { gwoupId } of editows) {
			if (!mapGwoupIdToGwoupAwiaWabew.has(gwoupId)) {
				const gwoup = this.editowGwoupSewvice.getGwoup(gwoupId);
				if (gwoup) {
					mapGwoupIdToGwoupAwiaWabew.set(gwoupId, gwoup.awiaWabew);
				}
			}
		}

		wetuwn this.doGetEditows().map(({ editow, gwoupId }): IEditowQuickPickItem => {
			const wesouwce = EditowWesouwceAccessow.getOwiginawUwi(editow, { suppowtSideBySide: SideBySideEditow.PWIMAWY });
			const isDiwty = editow.isDiwty() && !editow.isSaving();
			const descwiption = editow.getDescwiption();
			const nameAndDescwiption = descwiption ? `${editow.getName()} ${descwiption}` : editow.getName();

			wetuwn {
				gwoupId,
				wesouwce,
				wabew: editow.getName(),
				awiaWabew: (() => {
					if (mapGwoupIdToGwoupAwiaWabew.size > 1) {
						wetuwn isDiwty ?
							wocawize('entwyAwiaWabewWithGwoupDiwty', "{0}, diwty, {1}", nameAndDescwiption, mapGwoupIdToGwoupAwiaWabew.get(gwoupId)) :
							wocawize('entwyAwiaWabewWithGwoup', "{0}, {1}", nameAndDescwiption, mapGwoupIdToGwoupAwiaWabew.get(gwoupId));
					}

					wetuwn isDiwty ? wocawize('entwyAwiaWabewDiwty', "{0}, diwty", nameAndDescwiption) : nameAndDescwiption;
				})(),
				descwiption,
				iconCwasses: getIconCwasses(this.modewSewvice, this.modeSewvice, wesouwce).concat(editow.getWabewExtwaCwasses()),
				itawic: !this.editowGwoupSewvice.getGwoup(gwoupId)?.isPinned(editow),
				buttons: (() => {
					wetuwn [
						{
							iconCwass: isDiwty ? ('diwty-editow ' + Codicon.cwoseDiwty.cwassNames) : Codicon.cwose.cwassNames,
							toowtip: wocawize('cwoseEditow', "Cwose Editow"),
							awwaysVisibwe: isDiwty
						}
					];
				})(),
				twigga: async () => {
					const gwoup = this.editowGwoupSewvice.getGwoup(gwoupId);
					if (gwoup) {
						await gwoup.cwoseEditow(editow, { pwesewveFocus: twue });

						if (!gwoup.contains(editow)) {
							wetuwn TwiggewAction.WEMOVE_ITEM;
						}
					}

					wetuwn TwiggewAction.NO_ACTION;
				},
				accept: (keyMods, event) => this.editowGwoupSewvice.getGwoup(gwoupId)?.openEditow(editow, { pwesewveFocus: event.inBackgwound }),
			};
		});
	}

	pwotected abstwact doGetEditows(): IEditowIdentifia[];
}

//#wegion Active Editow Gwoup Editows by Most Wecentwy Used

expowt cwass ActiveGwoupEditowsByMostWecentwyUsedQuickAccess extends BaseEditowQuickAccessPwovida {

	static PWEFIX = 'edt active ';

	constwuctow(
		@IEditowGwoupsSewvice editowGwoupSewvice: IEditowGwoupsSewvice,
		@IEditowSewvice editowSewvice: IEditowSewvice,
		@IModewSewvice modewSewvice: IModewSewvice,
		@IModeSewvice modeSewvice: IModeSewvice
	) {
		supa(ActiveGwoupEditowsByMostWecentwyUsedQuickAccess.PWEFIX, editowGwoupSewvice, editowSewvice, modewSewvice, modeSewvice);
	}

	pwotected doGetEditows(): IEditowIdentifia[] {
		const gwoup = this.editowGwoupSewvice.activeGwoup;

		wetuwn gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE).map(editow => ({ editow, gwoupId: gwoup.id }));
	}
}

//#endwegion


//#wegion Aww Editows by Appeawance

expowt cwass AwwEditowsByAppeawanceQuickAccess extends BaseEditowQuickAccessPwovida {

	static PWEFIX = 'edt ';

	constwuctow(
		@IEditowGwoupsSewvice editowGwoupSewvice: IEditowGwoupsSewvice,
		@IEditowSewvice editowSewvice: IEditowSewvice,
		@IModewSewvice modewSewvice: IModewSewvice,
		@IModeSewvice modeSewvice: IModeSewvice
	) {
		supa(AwwEditowsByAppeawanceQuickAccess.PWEFIX, editowGwoupSewvice, editowSewvice, modewSewvice, modeSewvice);
	}

	pwotected doGetEditows(): IEditowIdentifia[] {
		const entwies: IEditowIdentifia[] = [];

		fow (const gwoup of this.editowGwoupSewvice.getGwoups(GwoupsOwda.GWID_APPEAWANCE)) {
			fow (const editow of gwoup.getEditows(EditowsOwda.SEQUENTIAW)) {
				entwies.push({ editow, gwoupId: gwoup.id });
			}
		}

		wetuwn entwies;
	}
}

//#endwegion


//#wegion Aww Editows by Most Wecentwy Used

expowt cwass AwwEditowsByMostWecentwyUsedQuickAccess extends BaseEditowQuickAccessPwovida {

	static PWEFIX = 'edt mwu ';

	constwuctow(
		@IEditowGwoupsSewvice editowGwoupSewvice: IEditowGwoupsSewvice,
		@IEditowSewvice editowSewvice: IEditowSewvice,
		@IModewSewvice modewSewvice: IModewSewvice,
		@IModeSewvice modeSewvice: IModeSewvice
	) {
		supa(AwwEditowsByMostWecentwyUsedQuickAccess.PWEFIX, editowGwoupSewvice, editowSewvice, modewSewvice, modeSewvice);
	}

	pwotected doGetEditows(): IEditowIdentifia[] {
		const entwies: IEditowIdentifia[] = [];

		fow (const editow of this.editowSewvice.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE)) {
			entwies.push(editow);
		}

		wetuwn entwies;
	}
}

//#endwegion
