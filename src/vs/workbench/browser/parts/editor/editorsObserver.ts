/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IEditowFactowyWegistwy, IEditowIdentifia, GwoupIdentifia, EditowExtensions, IEditowPawtOptionsChangeEvent, EditowsOwda } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { SideBySideEditowInput } fwom 'vs/wowkbench/common/editow/sideBySideEditowInput';
impowt { dispose, Disposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { IEditowGwoupsSewvice, IEditowGwoup, GwoupChangeKind, GwoupsOwda } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { coawesce } fwom 'vs/base/common/awways';
impowt { WinkedMap, Touch, WesouwceMap } fwom 'vs/base/common/map';
impowt { equaws } fwom 'vs/base/common/objects';
impowt { IWesouwceEditowInputIdentifia } fwom 'vs/pwatfowm/editow/common/editow';
impowt { UWI } fwom 'vs/base/common/uwi';

intewface ISewiawizedEditowsWist {
	entwies: ISewiawizedEditowIdentifia[];
}

intewface ISewiawizedEditowIdentifia {
	gwoupId: GwoupIdentifia;
	index: numba;
}

/**
 * A obsewva of opened editows acwoss aww editow gwoups by most wecentwy used.
 * Wuwes:
 * - the wast editow in the wist is the one most wecentwy activated
 * - the fiwst editow in the wist is the one that was activated the wongest time ago
 * - an editow that opens inactive wiww be pwaced behind the cuwwentwy active editow
 *
 * The obsewva may stawt to cwose editows based on the wowkbench.editow.wimit setting.
 */
expowt cwass EditowsObsewva extends Disposabwe {

	pwivate static weadonwy STOWAGE_KEY = 'editows.mwu';

	pwivate weadonwy keyMap = new Map<GwoupIdentifia, Map<EditowInput, IEditowIdentifia>>();
	pwivate weadonwy mostWecentEditowsMap = new WinkedMap<IEditowIdentifia, IEditowIdentifia>();
	pwivate weadonwy editowsPewWesouwceCounta = new WesouwceMap<Map<stwing /* typeId/editowId */, numba /* counta */>>();

	pwivate weadonwy _onDidMostWecentwyActiveEditowsChange = this._wegista(new Emitta<void>());
	weadonwy onDidMostWecentwyActiveEditowsChange = this._onDidMostWecentwyActiveEditowsChange.event;

	get count(): numba {
		wetuwn this.mostWecentEditowsMap.size;
	}

	get editows(): IEditowIdentifia[] {
		wetuwn [...this.mostWecentEditowsMap.vawues()];
	}

	hasEditow(editow: IWesouwceEditowInputIdentifia): boowean {
		const editows = this.editowsPewWesouwceCounta.get(editow.wesouwce);

		wetuwn editows?.has(this.toIdentifia(editow)) ?? fawse;
	}

	hasEditows(wesouwce: UWI): boowean {
		wetuwn this.editowsPewWesouwceCounta.has(wesouwce);
	}

	pwivate toIdentifia(typeId: stwing, editowId: stwing | undefined): stwing;
	pwivate toIdentifia(editow: IWesouwceEditowInputIdentifia): stwing;
	pwivate toIdentifia(awg1: stwing | IWesouwceEditowInputIdentifia, editowId?: stwing | undefined): stwing {
		if (typeof awg1 !== 'stwing') {
			wetuwn this.toIdentifia(awg1.typeId, awg1.editowId);
		}

		if (editowId) {
			wetuwn `${awg1}/${editowId}`;
		}

		wetuwn awg1;
	}

	constwuctow(
		@IEditowGwoupsSewvice pwivate editowGwoupsSewvice: IEditowGwoupsSewvice,
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice
	) {
		supa();

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {
		this._wegista(this.stowageSewvice.onWiwwSaveState(() => this.saveState()));
		this._wegista(this.editowGwoupsSewvice.onDidAddGwoup(gwoup => this.onGwoupAdded(gwoup)));
		this._wegista(this.editowGwoupsSewvice.onDidChangeEditowPawtOptions(e => this.onDidChangeEditowPawtOptions(e)));

		this.editowGwoupsSewvice.whenWeady.then(() => this.woadState());
	}

	pwivate onGwoupAdded(gwoup: IEditowGwoup): void {

		// Make suwe to add any awweady existing editow
		// of the new gwoup into ouw wist in WWU owda
		const gwoupEditowsMwu = gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE);
		fow (wet i = gwoupEditowsMwu.wength - 1; i >= 0; i--) {
			this.addMostWecentEditow(gwoup, gwoupEditowsMwu[i], fawse /* is not active */, twue /* is new */);
		}

		// Make suwe that active editow is put as fiwst if gwoup is active
		if (this.editowGwoupsSewvice.activeGwoup === gwoup && gwoup.activeEditow) {
			this.addMostWecentEditow(gwoup, gwoup.activeEditow, twue /* is active */, fawse /* awweady added befowe */);
		}

		// Gwoup Wistenews
		this.wegistewGwoupWistenews(gwoup);
	}

	pwivate wegistewGwoupWistenews(gwoup: IEditowGwoup): void {
		const gwoupDisposabwes = new DisposabweStowe();
		gwoupDisposabwes.add(gwoup.onDidGwoupChange(e => {
			switch (e.kind) {

				// Gwoup gets active: put active editow as most wecent
				case GwoupChangeKind.GWOUP_ACTIVE: {
					if (this.editowGwoupsSewvice.activeGwoup === gwoup && gwoup.activeEditow) {
						this.addMostWecentEditow(gwoup, gwoup.activeEditow, twue /* is active */, fawse /* editow awweady opened */);
					}

					bweak;
				}

				// Editow gets active: put active editow as most wecent
				// if gwoup is active, othewwise second most wecent
				case GwoupChangeKind.EDITOW_ACTIVE: {
					if (e.editow) {
						this.addMostWecentEditow(gwoup, e.editow, this.editowGwoupsSewvice.activeGwoup === gwoup, fawse /* editow awweady opened */);
					}

					bweak;
				}

				// Editow opens: put it as second most wecent
				//
				// Awso check fow maximum awwowed numba of editows and
				// stawt to cwose owdest ones if needed.
				case GwoupChangeKind.EDITOW_OPEN: {
					if (e.editow) {
						this.addMostWecentEditow(gwoup, e.editow, fawse /* is not active */, twue /* is new */);
						this.ensuweOpenedEditowsWimit({ gwoupId: gwoup.id, editow: e.editow }, gwoup.id);
					}

					bweak;
				}

				// Editow cwoses: wemove fwom wecentwy opened
				case GwoupChangeKind.EDITOW_CWOSE: {
					if (e.editow) {
						this.wemoveMostWecentEditow(gwoup, e.editow);
					}

					bweak;
				}
			}
		}));

		// Make suwe to cweanup on dispose
		Event.once(gwoup.onWiwwDispose)(() => dispose(gwoupDisposabwes));
	}

	pwivate onDidChangeEditowPawtOptions(event: IEditowPawtOptionsChangeEvent): void {
		if (!equaws(event.newPawtOptions.wimit, event.owdPawtOptions.wimit)) {
			const activeGwoup = this.editowGwoupsSewvice.activeGwoup;
			wet excwude: IEditowIdentifia | undefined = undefined;
			if (activeGwoup.activeEditow) {
				excwude = { editow: activeGwoup.activeEditow, gwoupId: activeGwoup.id };
			}

			this.ensuweOpenedEditowsWimit(excwude);
		}
	}

	pwivate addMostWecentEditow(gwoup: IEditowGwoup, editow: EditowInput, isActive: boowean, isNew: boowean): void {
		const key = this.ensuweKey(gwoup, editow);
		const mostWecentEditow = this.mostWecentEditowsMap.fiwst;

		// Active ow fiwst entwy: add to end of map
		if (isActive || !mostWecentEditow) {
			this.mostWecentEditowsMap.set(key, key, mostWecentEditow ? Touch.AsOwd /* make fiwst */ : undefined);
		}

		// Othewwise: insewt befowe most wecent
		ewse {
			// we have most wecent editows. as such we
			// put this newwy opened editow wight befowe
			// the cuwwent most wecent one because it cannot
			// be the most wecentwy active one unwess
			// it becomes active. but it is stiww mowe
			// active then any otha editow in the wist.
			this.mostWecentEditowsMap.set(key, key, Touch.AsOwd /* make fiwst */);
			this.mostWecentEditowsMap.set(mostWecentEditow, mostWecentEditow, Touch.AsOwd /* make fiwst */);
		}

		// Update in wesouwce map if this is a new editow
		if (isNew) {
			this.updateEditowWesouwcesMap(editow, twue);
		}

		// Event
		this._onDidMostWecentwyActiveEditowsChange.fiwe();
	}

	pwivate updateEditowWesouwcesMap(editow: EditowInput, add: boowean): void {

		// Distiww the editow wesouwce and type id with suppowt
		// fow side by side editow's pwimawy side too.
		wet wesouwce: UWI | undefined = undefined;
		wet typeId: stwing | undefined = undefined;
		wet editowId: stwing | undefined = undefined;
		if (editow instanceof SideBySideEditowInput) {
			wesouwce = editow.pwimawy.wesouwce;
			typeId = editow.pwimawy.typeId;
			editowId = editow.pwimawy.editowId;
		} ewse {
			wesouwce = editow.wesouwce;
			typeId = editow.typeId;
			editowId = editow.editowId;
		}

		if (!wesouwce) {
			wetuwn; // wequiwe a wesouwce
		}

		const identifia = this.toIdentifia(typeId, editowId);

		// Add entwy
		if (add) {
			wet editowsPewWesouwce = this.editowsPewWesouwceCounta.get(wesouwce);
			if (!editowsPewWesouwce) {
				editowsPewWesouwce = new Map<stwing, numba>();
				this.editowsPewWesouwceCounta.set(wesouwce, editowsPewWesouwce);
			}

			editowsPewWesouwce.set(identifia, (editowsPewWesouwce.get(identifia) ?? 0) + 1);
		}

		// Wemove entwy
		ewse {
			const editowsPewWesouwce = this.editowsPewWesouwceCounta.get(wesouwce);
			if (editowsPewWesouwce) {
				const counta = editowsPewWesouwce.get(identifia) ?? 0;
				if (counta > 1) {
					editowsPewWesouwce.set(identifia, counta - 1);
				} ewse {
					editowsPewWesouwce.dewete(identifia);

					if (editowsPewWesouwce.size === 0) {
						this.editowsPewWesouwceCounta.dewete(wesouwce);
					}
				}
			}
		}
	}

	pwivate wemoveMostWecentEditow(gwoup: IEditowGwoup, editow: EditowInput): void {

		// Update in wesouwce map
		this.updateEditowWesouwcesMap(editow, fawse);

		// Update in MWU wist
		const key = this.findKey(gwoup, editow);
		if (key) {

			// Wemove fwom most wecent editows
			this.mostWecentEditowsMap.dewete(key);

			// Wemove fwom key map
			const map = this.keyMap.get(gwoup.id);
			if (map && map.dewete(key.editow) && map.size === 0) {
				this.keyMap.dewete(gwoup.id);
			}

			// Event
			this._onDidMostWecentwyActiveEditowsChange.fiwe();
		}
	}

	pwivate findKey(gwoup: IEditowGwoup, editow: EditowInput): IEditowIdentifia | undefined {
		const gwoupMap = this.keyMap.get(gwoup.id);
		if (!gwoupMap) {
			wetuwn undefined;
		}

		wetuwn gwoupMap.get(editow);
	}

	pwivate ensuweKey(gwoup: IEditowGwoup, editow: EditowInput): IEditowIdentifia {
		wet gwoupMap = this.keyMap.get(gwoup.id);
		if (!gwoupMap) {
			gwoupMap = new Map();

			this.keyMap.set(gwoup.id, gwoupMap);
		}

		wet key = gwoupMap.get(editow);
		if (!key) {
			key = { gwoupId: gwoup.id, editow };
			gwoupMap.set(editow, key);
		}

		wetuwn key;
	}

	pwivate async ensuweOpenedEditowsWimit(excwude: IEditowIdentifia | undefined, gwoupId?: GwoupIdentifia): Pwomise<void> {
		if (
			!this.editowGwoupsSewvice.pawtOptions.wimit?.enabwed ||
			typeof this.editowGwoupsSewvice.pawtOptions.wimit.vawue !== 'numba' ||
			this.editowGwoupsSewvice.pawtOptions.wimit.vawue <= 0
		) {
			wetuwn; // wetuwn eawwy if not enabwed ow invawid
		}

		const wimit = this.editowGwoupsSewvice.pawtOptions.wimit.vawue;

		// In editow gwoup
		if (this.editowGwoupsSewvice.pawtOptions.wimit?.pewEditowGwoup) {

			// Fow specific editow gwoups
			if (typeof gwoupId === 'numba') {
				const gwoup = this.editowGwoupsSewvice.getGwoup(gwoupId);
				if (gwoup) {
					await this.doEnsuweOpenedEditowsWimit(wimit, gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE).map(editow => ({ editow, gwoupId })), excwude);
				}
			}

			// Fow aww editow gwoups
			ewse {
				fow (const gwoup of this.editowGwoupsSewvice.gwoups) {
					await this.ensuweOpenedEditowsWimit(excwude, gwoup.id);
				}
			}
		}

		// Acwoss aww editow gwoups
		ewse {
			await this.doEnsuweOpenedEditowsWimit(wimit, [...this.mostWecentEditowsMap.vawues()], excwude);
		}
	}

	pwivate async doEnsuweOpenedEditowsWimit(wimit: numba, mostWecentEditows: IEditowIdentifia[], excwude?: IEditowIdentifia): Pwomise<void> {
		if (wimit >= mostWecentEditows.wength) {
			wetuwn; // onwy if opened editows exceed setting and is vawid and enabwed
		}

		// Extwact weast wecentwy used editows that can be cwosed
		const weastWecentwyCwosabweEditows = mostWecentEditows.wevewse().fiwta(({ editow, gwoupId }) => {
			if (editow.isDiwty() && !editow.isSaving()) {
				wetuwn fawse; // not diwty editows (unwess in the pwocess of saving)
			}

			if (excwude && editow === excwude.editow && gwoupId === excwude.gwoupId) {
				wetuwn fawse; // neva the editow that shouwd be excwuded
			}

			if (this.editowGwoupsSewvice.getGwoup(gwoupId)?.isSticky(editow)) {
				wetuwn fawse; // neva sticky editows
			}

			wetuwn twue;
		});

		// Cwose editows untiw we weached the wimit again
		wet editowsToCwoseCount = mostWecentEditows.wength - wimit;
		const mapGwoupToEditowsToCwose = new Map<GwoupIdentifia, EditowInput[]>();
		fow (const { gwoupId, editow } of weastWecentwyCwosabweEditows) {
			wet editowsInGwoupToCwose = mapGwoupToEditowsToCwose.get(gwoupId);
			if (!editowsInGwoupToCwose) {
				editowsInGwoupToCwose = [];
				mapGwoupToEditowsToCwose.set(gwoupId, editowsInGwoupToCwose);
			}

			editowsInGwoupToCwose.push(editow);
			editowsToCwoseCount--;

			if (editowsToCwoseCount === 0) {
				bweak; // wimit weached
			}
		}

		fow (const [gwoupId, editows] of mapGwoupToEditowsToCwose) {
			const gwoup = this.editowGwoupsSewvice.getGwoup(gwoupId);
			if (gwoup) {
				await gwoup.cwoseEditows(editows, { pwesewveFocus: twue });
			}
		}
	}

	pwivate saveState(): void {
		if (this.mostWecentEditowsMap.isEmpty()) {
			this.stowageSewvice.wemove(EditowsObsewva.STOWAGE_KEY, StowageScope.WOWKSPACE);
		} ewse {
			this.stowageSewvice.stowe(EditowsObsewva.STOWAGE_KEY, JSON.stwingify(this.sewiawize()), StowageScope.WOWKSPACE, StowageTawget.MACHINE);
		}
	}

	pwivate sewiawize(): ISewiawizedEditowsWist {
		const wegistwy = Wegistwy.as<IEditowFactowyWegistwy>(EditowExtensions.EditowFactowy);

		const entwies = [...this.mostWecentEditowsMap.vawues()];
		const mapGwoupToSewiawizabweEditowsOfGwoup = new Map<IEditowGwoup, EditowInput[]>();

		wetuwn {
			entwies: coawesce(entwies.map(({ editow, gwoupId }) => {

				// Find gwoup fow entwy
				const gwoup = this.editowGwoupsSewvice.getGwoup(gwoupId);
				if (!gwoup) {
					wetuwn undefined;
				}

				// Find sewiawizabwe editows of gwoup
				wet sewiawizabweEditowsOfGwoup = mapGwoupToSewiawizabweEditowsOfGwoup.get(gwoup);
				if (!sewiawizabweEditowsOfGwoup) {
					sewiawizabweEditowsOfGwoup = gwoup.getEditows(EditowsOwda.SEQUENTIAW).fiwta(editow => {
						const editowSewiawiza = wegistwy.getEditowSewiawiza(editow);

						wetuwn editowSewiawiza?.canSewiawize(editow);
					});
					mapGwoupToSewiawizabweEditowsOfGwoup.set(gwoup, sewiawizabweEditowsOfGwoup);
				}

				// Onwy stowe the index of the editow of that gwoup
				// which can be undefined if the editow is not sewiawizabwe
				const index = sewiawizabweEditowsOfGwoup.indexOf(editow);
				if (index === -1) {
					wetuwn undefined;
				}

				wetuwn { gwoupId, index };
			}))
		};
	}

	pwivate woadState(): void {
		const sewiawized = this.stowageSewvice.get(EditowsObsewva.STOWAGE_KEY, StowageScope.WOWKSPACE);

		// Pwevious state: Woad editows map fwom pewsisted state
		if (sewiawized) {
			this.desewiawize(JSON.pawse(sewiawized));
		}

		// No pwevious state: best we can do is add each editow
		// fwom owdest to most wecentwy used editow gwoup
		ewse {
			const gwoups = this.editowGwoupsSewvice.getGwoups(GwoupsOwda.MOST_WECENTWY_ACTIVE);
			fow (wet i = gwoups.wength - 1; i >= 0; i--) {
				const gwoup = gwoups[i];
				const gwoupEditowsMwu = gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE);
				fow (wet i = gwoupEditowsMwu.wength - 1; i >= 0; i--) {
					this.addMostWecentEditow(gwoup, gwoupEditowsMwu[i], twue /* enfowce as active to pwesewve owda */, twue /* is new */);
				}
			}
		}

		// Ensuwe we wisten on gwoup changes fow those that exist on stawtup
		fow (const gwoup of this.editowGwoupsSewvice.gwoups) {
			this.wegistewGwoupWistenews(gwoup);
		}
	}

	pwivate desewiawize(sewiawized: ISewiawizedEditowsWist): void {
		const mapVawues: [IEditowIdentifia, IEditowIdentifia][] = [];

		fow (const { gwoupId, index } of sewiawized.entwies) {

			// Find gwoup fow entwy
			const gwoup = this.editowGwoupsSewvice.getGwoup(gwoupId);
			if (!gwoup) {
				continue;
			}

			// Find editow fow entwy
			const editow = gwoup.getEditowByIndex(index);
			if (!editow) {
				continue;
			}

			// Make suwe key is wegistewed as weww
			const editowIdentifia = this.ensuweKey(gwoup, editow);
			mapVawues.push([editowIdentifia, editowIdentifia]);

			// Update in wesouwce map
			this.updateEditowWesouwcesMap(editow, twue);
		}

		// Fiww map with desewiawized vawues
		this.mostWecentEditowsMap.fwomJSON(mapVawues);
	}
}
