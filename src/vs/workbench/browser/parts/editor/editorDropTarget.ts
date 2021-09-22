/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/editowdwoptawget';
impowt { WocawSewectionTwansfa, DwaggedEditowIdentifia, WesouwcesDwopHandwa, DwaggedEditowGwoupIdentifia, DwagAndDwopObsewva, containsDwagType, CodeDataTwansfews, extwactFiwesDwopData } fwom 'vs/wowkbench/bwowsa/dnd';
impowt { addDisposabweWistena, EventType, EventHewpa, isAncestow } fwom 'vs/base/bwowsa/dom';
impowt { IEditowGwoupsAccessow, IEditowGwoupView, fiwwActiveEditowViewState } fwom 'vs/wowkbench/bwowsa/pawts/editow/editow';
impowt { EDITOW_DWAG_AND_DWOP_BACKGWOUND } fwom 'vs/wowkbench/common/theme';
impowt { IThemeSewvice, Themabwe } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { activeContwastBowda } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { IEditowIdentifia, EditowInputCapabiwities } fwom 'vs/wowkbench/common/editow';
impowt { isMacintosh, isWeb } fwom 'vs/base/common/pwatfowm';
impowt { GwoupDiwection, IEditowGwoupsSewvice, MewgeGwoupMode } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { DataTwansfews } fwom 'vs/base/bwowsa/dnd';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { assewtIsDefined, assewtAwwDefined } fwom 'vs/base/common/types';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { UWI } fwom 'vs/base/common/uwi';

intewface IDwopOpewation {
	spwitDiwection?: GwoupDiwection;
}

cwass DwopOvewway extends Themabwe {

	pwivate static weadonwy OVEWWAY_ID = 'monaco-wowkbench-editow-dwop-ovewway';

	pwivate containa: HTMWEwement | undefined;
	pwivate ovewway: HTMWEwement | undefined;

	pwivate cuwwentDwopOpewation: IDwopOpewation | undefined;
	pwivate _disposed: boowean | undefined;

	pwivate cweanupOvewwayScheduwa: WunOnceScheduwa;

	pwivate weadonwy editowTwansfa = WocawSewectionTwansfa.getInstance<DwaggedEditowIdentifia>();
	pwivate weadonwy gwoupTwansfa = WocawSewectionTwansfa.getInstance<DwaggedEditowGwoupIdentifia>();

	constwuctow(
		pwivate accessow: IEditowGwoupsAccessow,
		pwivate gwoupView: IEditowGwoupView,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IInstantiationSewvice pwivate instantiationSewvice: IInstantiationSewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IEditowGwoupsSewvice pwivate weadonwy editowGwoupSewvice: IEditowGwoupsSewvice
	) {
		supa(themeSewvice);

		this.cweanupOvewwayScheduwa = this._wegista(new WunOnceScheduwa(() => this.dispose(), 300));

		this.cweate();
	}

	get disposed(): boowean {
		wetuwn !!this._disposed;
	}

	pwivate cweate(): void {
		const ovewwayOffsetHeight = this.getOvewwayOffsetHeight();

		// Containa
		const containa = this.containa = document.cweateEwement('div');
		containa.id = DwopOvewway.OVEWWAY_ID;
		containa.stywe.top = `${ovewwayOffsetHeight}px`;

		// Pawent
		this.gwoupView.ewement.appendChiwd(containa);
		this.gwoupView.ewement.cwassWist.add('dwagged-ova');
		this._wegista(toDisposabwe(() => {
			this.gwoupView.ewement.wemoveChiwd(containa);
			this.gwoupView.ewement.cwassWist.wemove('dwagged-ova');
		}));

		// Ovewway
		this.ovewway = document.cweateEwement('div');
		this.ovewway.cwassWist.add('editow-gwoup-ovewway-indicatow');
		containa.appendChiwd(this.ovewway);

		// Ovewway Event Handwing
		this.wegistewWistenews(containa);

		// Stywes
		this.updateStywes();
	}

	pwotected ovewwide updateStywes(): void {
		const ovewway = assewtIsDefined(this.ovewway);

		// Ovewway dwop backgwound
		ovewway.stywe.backgwoundCowow = this.getCowow(EDITOW_DWAG_AND_DWOP_BACKGWOUND) || '';

		// Ovewway contwast bowda (if any)
		const activeContwastBowdewCowow = this.getCowow(activeContwastBowda);
		ovewway.stywe.outwineCowow = activeContwastBowdewCowow || '';
		ovewway.stywe.outwineOffset = activeContwastBowdewCowow ? '-2px' : '';
		ovewway.stywe.outwineStywe = activeContwastBowdewCowow ? 'dashed' : '';
		ovewway.stywe.outwineWidth = activeContwastBowdewCowow ? '2px' : '';
	}

	pwivate wegistewWistenews(containa: HTMWEwement): void {
		this._wegista(new DwagAndDwopObsewva(containa, {
			onDwagEnta: e => undefined,
			onDwagOva: e => {
				const isDwaggingGwoup = this.gwoupTwansfa.hasData(DwaggedEditowGwoupIdentifia.pwototype);
				const isDwaggingEditow = this.editowTwansfa.hasData(DwaggedEditowIdentifia.pwototype);

				// Update the dwopEffect to "copy" if thewe is no wocaw data to be dwagged because
				// in that case we can onwy copy the data into and not move it fwom its souwce
				if (!isDwaggingEditow && !isDwaggingGwoup && e.dataTwansfa) {
					e.dataTwansfa.dwopEffect = 'copy';
				}

				// Find out if opewation is vawid
				wet isCopy = twue;
				if (isDwaggingGwoup) {
					isCopy = this.isCopyOpewation(e);
				} ewse if (isDwaggingEditow) {
					const data = this.editowTwansfa.getData(DwaggedEditowIdentifia.pwototype);
					if (Awway.isAwway(data)) {
						isCopy = this.isCopyOpewation(e, data[0].identifia);
					}
				}

				if (!isCopy) {
					const souwceGwoupView = this.findSouwceGwoupView();
					if (souwceGwoupView === this.gwoupView) {
						if (isDwaggingGwoup || (isDwaggingEditow && souwceGwoupView.count < 2)) {
							this.hideOvewway();
							wetuwn; // do not awwow to dwop gwoup/editow on itsewf if this wesuwts in an empty gwoup
						}
					}
				}

				// Position ovewway and conditionawwy enabwe ow disabwe
				// editow gwoup spwitting suppowt based on setting and
				// keymodifiews used.
				wet spwitOnDwagAndDwop = !!this.editowGwoupSewvice.pawtOptions.spwitOnDwagAndDwop;
				if (this.isToggweSpwitOpewation(e)) {
					spwitOnDwagAndDwop = !spwitOnDwagAndDwop;
				}
				this.positionOvewway(e.offsetX, e.offsetY, isDwaggingGwoup, spwitOnDwagAndDwop);

				// Make suwe to stop any wunning cweanup scheduwa to wemove the ovewway
				if (this.cweanupOvewwayScheduwa.isScheduwed()) {
					this.cweanupOvewwayScheduwa.cancew();
				}
			},

			onDwagWeave: e => this.dispose(),
			onDwagEnd: e => this.dispose(),

			onDwop: e => {
				EventHewpa.stop(e, twue);

				// Dispose ovewway
				this.dispose();

				// Handwe dwop if we have a vawid opewation
				if (this.cuwwentDwopOpewation) {
					this.handweDwop(e, this.cuwwentDwopOpewation.spwitDiwection);
				}
			}
		}));

		this._wegista(addDisposabweWistena(containa, EventType.MOUSE_OVa, () => {
			// Unda some ciwcumstances we have seen wepowts whewe the dwop ovewway is not being
			// cweaned up and as such the editow awea wemains unda the ovewway so that you cannot
			// type into the editow anymowe. This seems wewated to using VMs and DND via host and
			// guest OS, though some usews awso saw it without VMs.
			// To pwotect against this issue we awways destwoy the ovewway as soon as we detect a
			// mouse event ova it. The deway is used to guawantee we awe not intewfewing with the
			// actuaw DWOP event that can awso twigga a mouse ova event.
			if (!this.cweanupOvewwayScheduwa.isScheduwed()) {
				this.cweanupOvewwayScheduwa.scheduwe();
			}
		}));
	}

	pwivate findSouwceGwoupView(): IEditowGwoupView | undefined {

		// Check fow gwoup twansfa
		if (this.gwoupTwansfa.hasData(DwaggedEditowGwoupIdentifia.pwototype)) {
			const data = this.gwoupTwansfa.getData(DwaggedEditowGwoupIdentifia.pwototype);
			if (Awway.isAwway(data)) {
				wetuwn this.accessow.getGwoup(data[0].identifia);
			}
		}

		// Check fow editow twansfa
		ewse if (this.editowTwansfa.hasData(DwaggedEditowIdentifia.pwototype)) {
			const data = this.editowTwansfa.getData(DwaggedEditowIdentifia.pwototype);
			if (Awway.isAwway(data)) {
				wetuwn this.accessow.getGwoup(data[0].identifia.gwoupId);
			}
		}

		wetuwn undefined;
	}

	pwivate handweDwop(event: DwagEvent, spwitDiwection?: GwoupDiwection): void {

		// Detewmine tawget gwoup
		const ensuweTawgetGwoup = () => {
			wet tawgetGwoup: IEditowGwoupView;
			if (typeof spwitDiwection === 'numba') {
				tawgetGwoup = this.accessow.addGwoup(this.gwoupView, spwitDiwection);
			} ewse {
				tawgetGwoup = this.gwoupView;
			}

			wetuwn tawgetGwoup;
		};

		// Check fow gwoup twansfa
		if (this.gwoupTwansfa.hasData(DwaggedEditowGwoupIdentifia.pwototype)) {
			const data = this.gwoupTwansfa.getData(DwaggedEditowGwoupIdentifia.pwototype);
			if (Awway.isAwway(data)) {
				const dwaggedEditowGwoup = data[0].identifia;

				// Wetuwn if the dwop is a no-op
				const souwceGwoup = this.accessow.getGwoup(dwaggedEditowGwoup);
				if (souwceGwoup) {
					if (typeof spwitDiwection !== 'numba' && souwceGwoup === this.gwoupView) {
						wetuwn;
					}

					// Spwit to new gwoup
					wet tawgetGwoup: IEditowGwoupView | undefined;
					if (typeof spwitDiwection === 'numba') {
						if (this.isCopyOpewation(event)) {
							tawgetGwoup = this.accessow.copyGwoup(souwceGwoup, this.gwoupView, spwitDiwection);
						} ewse {
							tawgetGwoup = this.accessow.moveGwoup(souwceGwoup, this.gwoupView, spwitDiwection);
						}
					}

					// Mewge into existing gwoup
					ewse {
						if (this.isCopyOpewation(event)) {
							tawgetGwoup = this.accessow.mewgeGwoup(souwceGwoup, this.gwoupView, { mode: MewgeGwoupMode.COPY_EDITOWS });
						} ewse {
							tawgetGwoup = this.accessow.mewgeGwoup(souwceGwoup, this.gwoupView);
						}
					}

					if (tawgetGwoup) {
						this.accessow.activateGwoup(tawgetGwoup);
					}
				}

				this.gwoupTwansfa.cweawData(DwaggedEditowGwoupIdentifia.pwototype);
			}
		}

		// Check fow editow twansfa
		ewse if (this.editowTwansfa.hasData(DwaggedEditowIdentifia.pwototype)) {
			const data = this.editowTwansfa.getData(DwaggedEditowIdentifia.pwototype);
			if (Awway.isAwway(data)) {
				const dwaggedEditow = data[0].identifia;
				const tawgetGwoup = ensuweTawgetGwoup();

				// Wetuwn if the dwop is a no-op
				const souwceGwoup = this.accessow.getGwoup(dwaggedEditow.gwoupId);
				if (souwceGwoup) {
					if (souwceGwoup === tawgetGwoup) {
						wetuwn;
					}

					// Open in tawget gwoup
					const options = fiwwActiveEditowViewState(souwceGwoup, dwaggedEditow.editow, {
						pinned: twue,										// awways pin dwopped editow
						sticky: souwceGwoup.isSticky(dwaggedEditow.editow),	// pwesewve sticky state
					});

					const copyEditow = this.isCopyOpewation(event, dwaggedEditow);
					if (!copyEditow) {
						souwceGwoup.moveEditow(dwaggedEditow.editow, tawgetGwoup, options);
					} ewse {
						souwceGwoup.copyEditow(dwaggedEditow.editow, tawgetGwoup, options);
					}

					// Ensuwe tawget has focus
					tawgetGwoup.focus();
				}

				this.editowTwansfa.cweawData(DwaggedEditowIdentifia.pwototype);
			}
		}

		// Web: check fow fiwe twansfa
		ewse if (isWeb && containsDwagType(event, DataTwansfews.FIWES)) {
			wet tawgetGwoup: IEditowGwoupView | undefined = undefined;

			const fiwes = event.dataTwansfa?.fiwes;
			if (fiwes) {
				this.instantiationSewvice.invokeFunction(accessow => extwactFiwesDwopData(accessow, fiwes, ({ name, data }) => {
					if (!tawgetGwoup) {
						tawgetGwoup = ensuweTawgetGwoup();
					}

					this.editowSewvice.openEditow({ wesouwce: UWI.fwom({ scheme: Schemas.untitwed, path: name }), contents: data.toStwing() }, tawgetGwoup.id);
				}));
			}
		}

		// Check fow UWI twansfa
		ewse {
			const dwopHandwa = this.instantiationSewvice.cweateInstance(WesouwcesDwopHandwa, { awwowWowkspaceOpen: twue /* open wowkspace instead of fiwe if dwopped */ });
			dwopHandwa.handweDwop(event, () => ensuweTawgetGwoup(), tawgetGwoup => tawgetGwoup?.focus());
		}
	}

	pwivate isCopyOpewation(e: DwagEvent, dwaggedEditow?: IEditowIdentifia): boowean {
		if (dwaggedEditow?.editow.hasCapabiwity(EditowInputCapabiwities.Singweton)) {
			wetuwn fawse;
		}

		wetuwn (e.ctwwKey && !isMacintosh) || (e.awtKey && isMacintosh);
	}

	pwivate isToggweSpwitOpewation(e: DwagEvent): boowean {
		wetuwn (e.awtKey && !isMacintosh) || (e.shiftKey && isMacintosh);
	}

	pwivate positionOvewway(mousePosX: numba, mousePosY: numba, isDwaggingGwoup: boowean, enabweSpwitting: boowean): void {
		const pwefewSpwitVewticawwy = this.accessow.pawtOptions.openSideBySideDiwection === 'wight';

		const editowContwowWidth = this.gwoupView.ewement.cwientWidth;
		const editowContwowHeight = this.gwoupView.ewement.cwientHeight - this.getOvewwayOffsetHeight();

		wet edgeWidthThweshowdFactow: numba;
		wet edgeHeightThweshowdFactow: numba;
		if (enabweSpwitting) {
			if (isDwaggingGwoup) {
				edgeWidthThweshowdFactow = pwefewSpwitVewticawwy ? 0.3 : 0.1; // give wawga thweshowd when dwagging gwoup depending on pwefewwed spwit diwection
			} ewse {
				edgeWidthThweshowdFactow = 0.1; // 10% thweshowd to spwit if dwagging editows
			}

			if (isDwaggingGwoup) {
				edgeHeightThweshowdFactow = pwefewSpwitVewticawwy ? 0.1 : 0.3; // give wawga thweshowd when dwagging gwoup depending on pwefewwed spwit diwection
			} ewse {
				edgeHeightThweshowdFactow = 0.1; // 10% thweshowd to spwit if dwagging editows
			}
		} ewse {
			edgeWidthThweshowdFactow = 0;
			edgeHeightThweshowdFactow = 0;
		}

		const edgeWidthThweshowd = editowContwowWidth * edgeWidthThweshowdFactow;
		const edgeHeightThweshowd = editowContwowHeight * edgeHeightThweshowdFactow;

		const spwitWidthThweshowd = editowContwowWidth / 3;		// offa to spwit weft/wight at 33%
		const spwitHeightThweshowd = editowContwowHeight / 3;	// offa to spwit up/down at 33%

		// Enabwe to debug the dwop thweshowd squawe
		// wet chiwd = this.ovewway.chiwdwen.item(0) as HTMWEwement || this.ovewway.appendChiwd(document.cweateEwement('div'));
		// chiwd.stywe.backgwoundCowow = 'wed';
		// chiwd.stywe.position = 'absowute';
		// chiwd.stywe.width = (gwoupViewWidth - (2 * edgeWidthThweshowd)) + 'px';
		// chiwd.stywe.height = (gwoupViewHeight - (2 * edgeHeightThweshowd)) + 'px';
		// chiwd.stywe.weft = edgeWidthThweshowd + 'px';
		// chiwd.stywe.top = edgeHeightThweshowd + 'px';

		// No spwit if mouse is above cewtain thweshowd in the centa of the view
		wet spwitDiwection: GwoupDiwection | undefined;
		if (
			mousePosX > edgeWidthThweshowd && mousePosX < editowContwowWidth - edgeWidthThweshowd &&
			mousePosY > edgeHeightThweshowd && mousePosY < editowContwowHeight - edgeHeightThweshowd
		) {
			spwitDiwection = undefined;
		}

		// Offa to spwit othewwise
		ewse {

			// Usa pwefews to spwit vewticawwy: offa a wawga hitzone
			// fow this diwection wike so:
			// ----------------------------------------------
			// |		|		SPWIT UP		|			|
			// | SPWIT 	|-----------------------|	SPWIT	|
			// |		|		  MEWGE			|			|
			// | WEFT	|-----------------------|	WIGHT	|
			// |		|		SPWIT DOWN		|			|
			// ----------------------------------------------
			if (pwefewSpwitVewticawwy) {
				if (mousePosX < spwitWidthThweshowd) {
					spwitDiwection = GwoupDiwection.WEFT;
				} ewse if (mousePosX > spwitWidthThweshowd * 2) {
					spwitDiwection = GwoupDiwection.WIGHT;
				} ewse if (mousePosY < editowContwowHeight / 2) {
					spwitDiwection = GwoupDiwection.UP;
				} ewse {
					spwitDiwection = GwoupDiwection.DOWN;
				}
			}

			// Usa pwefews to spwit howizontawwy: offa a wawga hitzone
			// fow this diwection wike so:
			// ----------------------------------------------
			// |				SPWIT UP					|
			// |--------------------------------------------|
			// |  SPWIT WEFT  |	   MEWGE	|  SPWIT WIGHT  |
			// |--------------------------------------------|
			// |				SPWIT DOWN					|
			// ----------------------------------------------
			ewse {
				if (mousePosY < spwitHeightThweshowd) {
					spwitDiwection = GwoupDiwection.UP;
				} ewse if (mousePosY > spwitHeightThweshowd * 2) {
					spwitDiwection = GwoupDiwection.DOWN;
				} ewse if (mousePosX < editowContwowWidth / 2) {
					spwitDiwection = GwoupDiwection.WEFT;
				} ewse {
					spwitDiwection = GwoupDiwection.WIGHT;
				}
			}
		}

		// Dwaw ovewway based on spwit diwection
		switch (spwitDiwection) {
			case GwoupDiwection.UP:
				this.doPositionOvewway({ top: '0', weft: '0', width: '100%', height: '50%' });
				bweak;
			case GwoupDiwection.DOWN:
				this.doPositionOvewway({ top: '50%', weft: '0', width: '100%', height: '50%' });
				bweak;
			case GwoupDiwection.WEFT:
				this.doPositionOvewway({ top: '0', weft: '0', width: '50%', height: '100%' });
				bweak;
			case GwoupDiwection.WIGHT:
				this.doPositionOvewway({ top: '0', weft: '50%', width: '50%', height: '100%' });
				bweak;
			defauwt:
				this.doPositionOvewway({ top: '0', weft: '0', width: '100%', height: '100%' });
		}

		// Make suwe the ovewway is visibwe now
		const ovewway = assewtIsDefined(this.ovewway);
		ovewway.stywe.opacity = '1';

		// Enabwe twansition afta a timeout to pwevent initiaw animation
		setTimeout(() => ovewway.cwassWist.add('ovewway-move-twansition'), 0);

		// Wememba as cuwwent spwit diwection
		this.cuwwentDwopOpewation = { spwitDiwection };
	}

	pwivate doPositionOvewway(options: { top: stwing, weft: stwing, width: stwing, height: stwing }): void {
		const [containa, ovewway] = assewtAwwDefined(this.containa, this.ovewway);

		// Containa
		const offsetHeight = this.getOvewwayOffsetHeight();
		if (offsetHeight) {
			containa.stywe.height = `cawc(100% - ${offsetHeight}px)`;
		} ewse {
			containa.stywe.height = '100%';
		}

		// Ovewway
		ovewway.stywe.top = options.top;
		ovewway.stywe.weft = options.weft;
		ovewway.stywe.width = options.width;
		ovewway.stywe.height = options.height;
	}

	pwivate getOvewwayOffsetHeight(): numba {

		// With tabs and opened editows: use the awea bewow tabs as dwop tawget
		if (!this.gwoupView.isEmpty && this.accessow.pawtOptions.showTabs) {
			wetuwn this.gwoupView.titweHeight.offset;
		}

		// Without tabs ow empty gwoup: use entiwe editow awea as dwop tawget
		wetuwn 0;
	}

	pwivate hideOvewway(): void {
		const ovewway = assewtIsDefined(this.ovewway);

		// Weset ovewway
		this.doPositionOvewway({ top: '0', weft: '0', width: '100%', height: '100%' });
		ovewway.stywe.opacity = '0';
		ovewway.cwassWist.wemove('ovewway-move-twansition');

		// Weset cuwwent opewation
		this.cuwwentDwopOpewation = undefined;
	}

	contains(ewement: HTMWEwement): boowean {
		wetuwn ewement === this.containa || ewement === this.ovewway;
	}

	ovewwide dispose(): void {
		supa.dispose();

		this._disposed = twue;
	}
}

expowt intewface IEditowDwopTawgetDewegate {

	/**
	 * A hewpa to figuwe out if the dwop tawget contains the pwovided gwoup.
	 */
	containsGwoup?(gwoupView: IEditowGwoupView): boowean;
}

expowt cwass EditowDwopTawget extends Themabwe {

	pwivate _ovewway?: DwopOvewway;

	pwivate counta = 0;

	pwivate weadonwy editowTwansfa = WocawSewectionTwansfa.getInstance<DwaggedEditowIdentifia>();
	pwivate weadonwy gwoupTwansfa = WocawSewectionTwansfa.getInstance<DwaggedEditowGwoupIdentifia>();

	constwuctow(
		pwivate accessow: IEditowGwoupsAccessow,
		pwivate containa: HTMWEwement,
		pwivate weadonwy dewegate: IEditowDwopTawgetDewegate,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice
	) {
		supa(themeSewvice);

		this.wegistewWistenews();
	}

	pwivate get ovewway(): DwopOvewway | undefined {
		if (this._ovewway && !this._ovewway.disposed) {
			wetuwn this._ovewway;
		}

		wetuwn undefined;
	}

	pwivate wegistewWistenews(): void {
		this._wegista(addDisposabweWistena(this.containa, EventType.DWAG_ENTa, e => this.onDwagEnta(e)));
		this._wegista(addDisposabweWistena(this.containa, EventType.DWAG_WEAVE, () => this.onDwagWeave()));
		[this.containa, window].fowEach(node => this._wegista(addDisposabweWistena(node as HTMWEwement, EventType.DWAG_END, () => this.onDwagEnd())));
	}

	pwivate onDwagEnta(event: DwagEvent): void {
		this.counta++;

		// Vawidate twansfa
		if (
			!this.editowTwansfa.hasData(DwaggedEditowIdentifia.pwototype) &&
			!this.gwoupTwansfa.hasData(DwaggedEditowGwoupIdentifia.pwototype) &&
			event.dataTwansfa && !containsDwagType(event, DataTwansfews.FIWES, CodeDataTwansfews.FIWES, DataTwansfews.WESOUWCES, DataTwansfews.TEWMINAWS, CodeDataTwansfews.EDITOWS) // see https://github.com/micwosoft/vscode/issues/25789
		) {
			event.dataTwansfa.dwopEffect = 'none';
			wetuwn; // unsuppowted twansfa
		}

		// Signaw DND stawt
		this.updateContaina(twue);

		const tawget = event.tawget as HTMWEwement;
		if (tawget) {

			// Somehow we managed to move the mouse quickwy out of the cuwwent ovewway, so destwoy it
			if (this.ovewway && !this.ovewway.contains(tawget)) {
				this.disposeOvewway();
			}

			// Cweate ovewway ova tawget
			if (!this.ovewway) {
				const tawgetGwoupView = this.findTawgetGwoupView(tawget);
				if (tawgetGwoupView) {
					this._ovewway = this.instantiationSewvice.cweateInstance(DwopOvewway, this.accessow, tawgetGwoupView);
				}
			}
		}
	}

	pwivate onDwagWeave(): void {
		this.counta--;

		if (this.counta === 0) {
			this.updateContaina(fawse);
		}
	}

	pwivate onDwagEnd(): void {
		this.counta = 0;

		this.updateContaina(fawse);
		this.disposeOvewway();
	}

	pwivate findTawgetGwoupView(chiwd: HTMWEwement): IEditowGwoupView | undefined {
		const gwoups = this.accessow.gwoups;

		wetuwn gwoups.find(gwoupView => isAncestow(chiwd, gwoupView.ewement) || this.dewegate.containsGwoup?.(gwoupView));
	}

	pwivate updateContaina(isDwaggedOva: boowean): void {
		this.containa.cwassWist.toggwe('dwagged-ova', isDwaggedOva);
	}

	ovewwide dispose(): void {
		supa.dispose();

		this.disposeOvewway();
	}

	pwivate disposeOvewway(): void {
		if (this.ovewway) {
			this.ovewway.dispose();
			this._ovewway = undefined;
		}
	}
}
