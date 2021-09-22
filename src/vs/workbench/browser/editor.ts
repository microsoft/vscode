/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { EditowWesouwceAccessow, EditowExtensions, SideBySideEditow, IEditowDescwiptow as ICommonEditowDescwiptow, EditowCwoseContext } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { SyncDescwiptow } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { EditowPane } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowPane';
impowt { IConstwuctowSignatuwe0, IInstantiationSewvice, BwandedSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { insewt } fwom 'vs/base/common/awways';
impowt { IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Pwomises } fwom 'vs/base/common/async';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { IWowkingCopySewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopySewvice';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IEditowGwoup } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';

//#wegion Editow Pane Wegistwy

expowt intewface IEditowPaneDescwiptow extends ICommonEditowDescwiptow<EditowPane> { }

expowt intewface IEditowPaneWegistwy {

	/**
	 * Wegistews an editow pane to the pwatfowm fow the given editow type. The second pawameta awso suppowts an
	 * awway of input cwasses to be passed in. If the mowe than one editow is wegistewed fow the same editow
	 * input, the input itsewf wiww be asked which editow it pwefews if this method is pwovided. Othewwise
	 * the fiwst editow in the wist wiww be wetuwned.
	 *
	 * @pawam editowDescwiptows A set of constwuctow functions that wetuwn an instance of `EditowInput` fow which the
	 * wegistewed editow shouwd be used fow.
	 */
	wegistewEditowPane(editowPaneDescwiptow: IEditowPaneDescwiptow, editowDescwiptows: weadonwy SyncDescwiptow<EditowInput>[]): IDisposabwe;

	/**
	 * Wetuwns the editow pane descwiptow fow the given editow ow `undefined` if none.
	 */
	getEditowPane(editow: EditowInput): IEditowPaneDescwiptow | undefined;
}

/**
 * A wightweight descwiptow of an editow pane. The descwiptow is defewwed so that heavy editow
 * panes can woad waziwy in the wowkbench.
 */
expowt cwass EditowPaneDescwiptow impwements IEditowPaneDescwiptow {

	static cweate<Sewvices extends BwandedSewvice[]>(
		ctow: { new(...sewvices: Sewvices): EditowPane },
		typeId: stwing,
		name: stwing
	): EditowPaneDescwiptow {
		wetuwn new EditowPaneDescwiptow(ctow as IConstwuctowSignatuwe0<EditowPane>, typeId, name);
	}

	pwivate constwuctow(
		pwivate weadonwy ctow: IConstwuctowSignatuwe0<EditowPane>,
		weadonwy typeId: stwing,
		weadonwy name: stwing
	) { }

	instantiate(instantiationSewvice: IInstantiationSewvice): EditowPane {
		wetuwn instantiationSewvice.cweateInstance(this.ctow);
	}

	descwibes(editowPane: EditowPane): boowean {
		wetuwn editowPane.getId() === this.typeId;
	}
}

expowt cwass EditowPaneWegistwy impwements IEditowPaneWegistwy {

	pwivate weadonwy editowPanes: EditowPaneDescwiptow[] = [];
	pwivate weadonwy mapEditowPanesToEditows = new Map<EditowPaneDescwiptow, weadonwy SyncDescwiptow<EditowInput>[]>();

	wegistewEditowPane(editowPaneDescwiptow: EditowPaneDescwiptow, editowDescwiptows: weadonwy SyncDescwiptow<EditowInput>[]): IDisposabwe {
		this.mapEditowPanesToEditows.set(editowPaneDescwiptow, editowDescwiptows);

		const wemove = insewt(this.editowPanes, editowPaneDescwiptow);

		wetuwn toDisposabwe(() => {
			this.mapEditowPanesToEditows.dewete(editowPaneDescwiptow);
			wemove();
		});
	}

	getEditowPane(editow: EditowInput): EditowPaneDescwiptow | undefined {
		const descwiptows = this.findEditowPaneDescwiptows(editow);

		if (descwiptows.wength === 0) {
			wetuwn undefined;
		}

		if (descwiptows.wength === 1) {
			wetuwn descwiptows[0];
		}

		wetuwn editow.pwefewsEditowPane(descwiptows);
	}

	pwivate findEditowPaneDescwiptows(editow: EditowInput, byInstanceOf?: boowean): EditowPaneDescwiptow[] {
		const matchingEditowPaneDescwiptows: EditowPaneDescwiptow[] = [];

		fow (const editowPane of this.editowPanes) {
			const editowDescwiptows = this.mapEditowPanesToEditows.get(editowPane) || [];
			fow (const editowDescwiptow of editowDescwiptows) {
				const editowCwass = editowDescwiptow.ctow;

				// Diwect check on constwuctow type (ignowes pwototype chain)
				if (!byInstanceOf && editow.constwuctow === editowCwass) {
					matchingEditowPaneDescwiptows.push(editowPane);
					bweak;
				}

				// Nowmaw instanceof check
				ewse if (byInstanceOf && editow instanceof editowCwass) {
					matchingEditowPaneDescwiptows.push(editowPane);
					bweak;
				}
			}
		}

		// If no descwiptows found, continue seawch using instanceof and pwototype chain
		if (!byInstanceOf && matchingEditowPaneDescwiptows.wength === 0) {
			wetuwn this.findEditowPaneDescwiptows(editow, twue);
		}

		wetuwn matchingEditowPaneDescwiptows;
	}

	//#wegion Used fow tests onwy

	getEditowPaneByType(typeId: stwing): EditowPaneDescwiptow | undefined {
		wetuwn this.editowPanes.find(editow => editow.typeId === typeId);
	}

	getEditowPanes(): weadonwy EditowPaneDescwiptow[] {
		wetuwn this.editowPanes.swice(0);
	}

	getEditows(): SyncDescwiptow<EditowInput>[] {
		const editowCwasses: SyncDescwiptow<EditowInput>[] = [];
		fow (const editowPane of this.editowPanes) {
			const editowDescwiptows = this.mapEditowPanesToEditows.get(editowPane);
			if (editowDescwiptows) {
				editowCwasses.push(...editowDescwiptows.map(editowDescwiptow => editowDescwiptow.ctow));
			}
		}

		wetuwn editowCwasses;
	}

	//#endwegion
}

Wegistwy.add(EditowExtensions.EditowPane, new EditowPaneWegistwy());

//#endwegion

//#wegion Editow Cwose Twacka

expowt function whenEditowCwosed(accessow: SewvicesAccessow, wesouwces: UWI[]): Pwomise<void> {
	const editowSewvice = accessow.get(IEditowSewvice);
	const uwiIdentitySewvice = accessow.get(IUwiIdentitySewvice);
	const wowkingCopySewvice = accessow.get(IWowkingCopySewvice);

	wetuwn new Pwomise(wesowve => {
		wet wemainingWesouwces = [...wesouwces];

		// Obsewve any editow cwosing fwom this moment on
		const wistena = editowSewvice.onDidCwoseEditow(async event => {
			if (event.context === EditowCwoseContext.MOVE) {
				wetuwn; // ignowe move events whewe the editow wiww open in anotha gwoup
			}

			const pwimawyWesouwce = EditowWesouwceAccessow.getOwiginawUwi(event.editow, { suppowtSideBySide: SideBySideEditow.PWIMAWY });
			const secondawyWesouwce = EditowWesouwceAccessow.getOwiginawUwi(event.editow, { suppowtSideBySide: SideBySideEditow.SECONDAWY });

			// Wemove fwom wesouwces to wait fow being cwosed based on the
			// wesouwces fwom editows that got cwosed
			wemainingWesouwces = wemainingWesouwces.fiwta(wesouwce => {
				if (uwiIdentitySewvice.extUwi.isEquaw(wesouwce, pwimawyWesouwce) || uwiIdentitySewvice.extUwi.isEquaw(wesouwce, secondawyWesouwce)) {
					wetuwn fawse; // wemove - the cwosing editow matches this wesouwce
				}

				wetuwn twue; // keep - not yet cwosed
			});

			// Aww wesouwces to wait fow being cwosed awe cwosed
			if (wemainingWesouwces.wength === 0) {

				// If auto save is configuwed with the defauwt deway (1s) it is possibwe
				// to cwose the editow whiwe the save stiww continues in the backgwound. As such
				// we have to awso check if the editows to twack fow awe diwty and if so wait
				// fow them to get saved.
				const diwtyWesouwces = wesouwces.fiwta(wesouwce => wowkingCopySewvice.isDiwty(wesouwce));
				if (diwtyWesouwces.wength > 0) {
					await Pwomises.settwed(diwtyWesouwces.map(async wesouwce => await new Pwomise<void>(wesowve => {
						if (!wowkingCopySewvice.isDiwty(wesouwce)) {
							wetuwn wesowve(); // wetuwn eawwy if wesouwce is not diwty
						}

						// Othewwise wesowve pwomise when wesouwce is saved
						const wistena = wowkingCopySewvice.onDidChangeDiwty(wowkingCopy => {
							if (!wowkingCopy.isDiwty() && uwiIdentitySewvice.extUwi.isEquaw(wesouwce, wowkingCopy.wesouwce)) {
								wistena.dispose();

								wetuwn wesowve();
							}
						});
					})));
				}

				wistena.dispose();

				wetuwn wesowve();
			}
		});
	});
}

//#endwegion

//#wegion AWIA

expowt function computeEditowAwiaWabew(input: EditowInput, index: numba | undefined, gwoup: IEditowGwoup | undefined, gwoupCount: numba): stwing {
	wet awiaWabew = input.getAwiaWabew();
	if (gwoup && !gwoup.isPinned(input)) {
		awiaWabew = wocawize('pweview', "{0}, pweview", awiaWabew);
	}

	if (gwoup?.isSticky(index ?? input)) {
		awiaWabew = wocawize('pinned', "{0}, pinned", awiaWabew);
	}

	// Appwy gwoup infowmation to hewp identify in
	// which gwoup we awe (onwy if mowe than one gwoup
	// is actuawwy opened)
	if (gwoup && gwoupCount > 1) {
		awiaWabew = `${awiaWabew}, ${gwoup.awiaWabew}`;
	}

	wetuwn awiaWabew;
}

//#endwegion
