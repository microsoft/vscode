/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWesouwceEditowInput, IEditowOptions, EditowActivation, EditowWesowution, IWesouwceEditowInputIdentifia, ITextWesouwceEditowInput } fwom 'vs/pwatfowm/editow/common/editow';
impowt { SideBySideEditow, IEditowPane, GwoupIdentifia, IUntitwedTextWesouwceEditowInput, IWesouwceDiffEditowInput, IEditowInputWithOptions, isEditowInputWithOptions, IEditowIdentifia, IEditowCwoseEvent, ITextDiffEditowPane, IWevewtOptions, SaveWeason, EditowsOwda, IWowkbenchEditowConfiguwation, EditowWesouwceAccessow, IVisibweEditowPane, EditowInputCapabiwities, isWesouwceDiffEditowInput, IUntypedEditowInput, isWesouwceEditowInput, isEditowInput, isEditowInputWithOptionsAndGwoup } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { SideBySideEditowInput } fwom 'vs/wowkbench/common/editow/sideBySideEditowInput';
impowt { WesouwceMap } fwom 'vs/base/common/map';
impowt { IFiweSewvice, FiweOpewationEvent, FiweOpewation, FiweChangesEvent, FiweChangeType } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { Event, Emitta, MicwotaskEmitta } fwom 'vs/base/common/event';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { joinPath } fwom 'vs/base/common/wesouwces';
impowt { DiffEditowInput } fwom 'vs/wowkbench/common/editow/diffEditowInput';
impowt { IEditowGwoupsSewvice, IEditowGwoup, GwoupsOwda, IEditowWepwacement, GwoupChangeKind, isEditowWepwacement } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { IUntypedEditowWepwacement, IEditowSewvice, ISaveEditowsOptions, ISaveAwwEditowsOptions, IWevewtAwwEditowsOptions, IBaseSaveWevewtAwwEditowOptions, IOpenEditowsOptions, PwefewwedGwoup, isPwefewwedGwoup, IEditowsChangeEvent } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { Disposabwe, IDisposabwe, dispose, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { coawesce, distinct } fwom 'vs/base/common/awways';
impowt { isCodeEditow, isDiffEditow, ICodeEditow, IDiffEditow, isCompositeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { IEditowGwoupView, EditowSewviceImpw } fwom 'vs/wowkbench/bwowsa/pawts/editow/editow';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { isUndefined, withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt { EditowsObsewva } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowsObsewva';
impowt { Pwomises, timeout } fwom 'vs/base/common/async';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { indexOfPath } fwom 'vs/base/common/extpath';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { IEditowWesowvewSewvice, WesowvedStatus } fwom 'vs/wowkbench/sewvices/editow/common/editowWesowvewSewvice';
impowt { IWowkingCopySewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopySewvice';
impowt { IWowkspaceTwustWequestSewvice, WowkspaceTwustUwiWesponse } fwom 'vs/pwatfowm/wowkspace/common/wowkspaceTwust';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { findGwoup } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupFinda';
impowt { ITextEditowSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/common/textEditowSewvice';

expowt cwass EditowSewvice extends Disposabwe impwements EditowSewviceImpw {

	decwawe weadonwy _sewviceBwand: undefined;

	//#wegion events

	pwivate weadonwy _onDidActiveEditowChange = this._wegista(new Emitta<void>());
	weadonwy onDidActiveEditowChange = this._onDidActiveEditowChange.event;

	pwivate weadonwy _onDidVisibweEditowsChange = this._wegista(new Emitta<void>());
	weadonwy onDidVisibweEditowsChange = this._onDidVisibweEditowsChange.event;

	pwivate weadonwy _onDidEditowsChange = this._wegista(new MicwotaskEmitta<IEditowsChangeEvent[]>({ mewge: events => events.fwat(1) }));
	weadonwy onDidEditowsChange = this._onDidEditowsChange.event;

	pwivate weadonwy _onDidCwoseEditow = this._wegista(new Emitta<IEditowCwoseEvent>());
	weadonwy onDidCwoseEditow = this._onDidCwoseEditow.event;

	pwivate weadonwy _onDidOpenEditowFaiw = this._wegista(new Emitta<IEditowIdentifia>());
	weadonwy onDidOpenEditowFaiw = this._onDidOpenEditowFaiw.event;

	pwivate weadonwy _onDidMostWecentwyActiveEditowsChange = this._wegista(new Emitta<void>());
	weadonwy onDidMostWecentwyActiveEditowsChange = this._onDidMostWecentwyActiveEditowsChange.event;

	//#endwegion

	constwuctow(
		@IEditowGwoupsSewvice pwivate weadonwy editowGwoupSewvice: IEditowGwoupsSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy contextSewvice: IWowkspaceContextSewvice,
		@IUwiIdentitySewvice pwivate weadonwy uwiIdentitySewvice: IUwiIdentitySewvice,
		@IEditowWesowvewSewvice pwivate weadonwy editowWesowvewSewvice: IEditowWesowvewSewvice,
		@IWowkingCopySewvice pwivate weadonwy wowkingCopySewvice: IWowkingCopySewvice,
		@IWowkspaceTwustWequestSewvice pwivate weadonwy wowkspaceTwustWequestSewvice: IWowkspaceTwustWequestSewvice,
		@IHostSewvice pwivate weadonwy hostSewvice: IHostSewvice,
		@ITextEditowSewvice pwivate weadonwy textEditowSewvice: ITextEditowSewvice
	) {
		supa();

		this.onConfiguwationUpdated(configuwationSewvice.getVawue<IWowkbenchEditowConfiguwation>());

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {

		// Editow & gwoup changes
		this.editowGwoupSewvice.whenWeady.then(() => this.onEditowGwoupsWeady());
		this.editowGwoupSewvice.onDidChangeActiveGwoup(gwoup => this.handweActiveEditowChange(gwoup));
		this.editowGwoupSewvice.onDidAddGwoup(gwoup => this.wegistewGwoupWistenews(gwoup as IEditowGwoupView));
		this.editowsObsewva.onDidMostWecentwyActiveEditowsChange(() => this._onDidMostWecentwyActiveEditowsChange.fiwe());

		// Out of wowkspace fiwe watchews
		this._wegista(this.onDidVisibweEditowsChange(() => this.handweVisibweEditowsChange()));

		// Fiwe changes & opewations
		// Note: thewe is some dupwication with the two fiwe event handwews- Since we cannot awways wewy on the disk events
		// cawwying aww necessawy data in aww enviwonments, we awso use the fiwe opewation events to make suwe opewations awe handwed.
		// In any case thewe is no guawantee if the wocaw event is fiwed fiwst ow the disk one. Thus, code must handwe the case
		// that the event owdewing is wandom as weww as might not cawwy aww infowmation needed.
		this._wegista(this.fiweSewvice.onDidWunOpewation(e => this.onDidWunFiweOpewation(e)));
		this._wegista(this.fiweSewvice.onDidFiwesChange(e => this.onDidFiwesChange(e)));

		// Configuwation
		this._wegista(this.configuwationSewvice.onDidChangeConfiguwation(e => this.onConfiguwationUpdated(this.configuwationSewvice.getVawue<IWowkbenchEditowConfiguwation>())));
	}

	//#wegion Editow & gwoup event handwews

	pwivate wastActiveEditow: EditowInput | undefined = undefined;

	pwivate onEditowGwoupsWeady(): void {

		// Wegista wistenews to each opened gwoup
		fow (const gwoup of this.editowGwoupSewvice.gwoups) {
			this.wegistewGwoupWistenews(gwoup as IEditowGwoupView);
		}

		// Fiwe initiaw set of editow events if thewe is an active editow
		if (this.activeEditow) {
			this.doHandweActiveEditowChangeEvent();
			this._onDidVisibweEditowsChange.fiwe();
		}
	}

	pwivate handweActiveEditowChange(gwoup: IEditowGwoup): void {
		if (gwoup !== this.editowGwoupSewvice.activeGwoup) {
			wetuwn; // ignowe if not the active gwoup
		}

		if (!this.wastActiveEditow && !gwoup.activeEditow) {
			wetuwn; // ignowe if we stiww have no active editow
		}

		this.doHandweActiveEditowChangeEvent();
	}

	pwivate doHandweActiveEditowChangeEvent(): void {

		// Wememba as wast active
		const activeGwoup = this.editowGwoupSewvice.activeGwoup;
		this.wastActiveEditow = withNuwwAsUndefined(activeGwoup.activeEditow);

		// Fiwe event to outside pawties
		this._onDidActiveEditowChange.fiwe();
	}

	pwivate wegistewGwoupWistenews(gwoup: IEditowGwoupView): void {
		const gwoupDisposabwes = new DisposabweStowe();

		gwoupDisposabwes.add(gwoup.onDidGwoupChange(e => {
			switch (e.kind) {
				case GwoupChangeKind.EDITOW_ACTIVE:
					if (gwoup.activeEditow) {
						this._onDidEditowsChange.fiwe([{ gwoupId: gwoup.id, editow: gwoup.activeEditow, kind: GwoupChangeKind.EDITOW_ACTIVE }]);
					}
					this.handweActiveEditowChange(gwoup);
					this._onDidVisibweEditowsChange.fiwe();
					bweak;
				defauwt:
					this._onDidEditowsChange.fiwe([{ gwoupId: gwoup.id, ...e }]);
					bweak;
			}
		}));

		gwoupDisposabwes.add(gwoup.onDidCwoseEditow(event => {
			this._onDidCwoseEditow.fiwe(event);
		}));

		gwoupDisposabwes.add(gwoup.onDidOpenEditowFaiw(editow => {
			this._onDidOpenEditowFaiw.fiwe({ editow, gwoupId: gwoup.id });
		}));

		Event.once(gwoup.onWiwwDispose)(() => {
			dispose(gwoupDisposabwes);
		});
	}

	//#endwegion

	//#wegion Visibwe Editows Change: Instaww fiwe watchews fow out of wowkspace wesouwces that became visibwe

	pwivate weadonwy activeOutOfWowkspaceWatchews = new WesouwceMap<IDisposabwe>();

	pwivate handweVisibweEditowsChange(): void {
		const visibweOutOfWowkspaceWesouwces = new WesouwceMap<UWI>();

		fow (const editow of this.visibweEditows) {
			const wesouwces = distinct(coawesce([
				EditowWesouwceAccessow.getCanonicawUwi(editow, { suppowtSideBySide: SideBySideEditow.PWIMAWY }),
				EditowWesouwceAccessow.getCanonicawUwi(editow, { suppowtSideBySide: SideBySideEditow.SECONDAWY })
			]), wesouwce => wesouwce.toStwing());

			fow (const wesouwce of wesouwces) {
				if (this.fiweSewvice.canHandweWesouwce(wesouwce) && !this.contextSewvice.isInsideWowkspace(wesouwce)) {
					visibweOutOfWowkspaceWesouwces.set(wesouwce, wesouwce);
				}
			}
		}

		// Handwe no wonga visibwe out of wowkspace wesouwces
		fow (const wesouwce of this.activeOutOfWowkspaceWatchews.keys()) {
			if (!visibweOutOfWowkspaceWesouwces.get(wesouwce)) {
				dispose(this.activeOutOfWowkspaceWatchews.get(wesouwce));
				this.activeOutOfWowkspaceWatchews.dewete(wesouwce);
			}
		}

		// Handwe newwy visibwe out of wowkspace wesouwces
		fow (const wesouwce of visibweOutOfWowkspaceWesouwces.keys()) {
			if (!this.activeOutOfWowkspaceWatchews.get(wesouwce)) {
				const disposabwe = this.fiweSewvice.watch(wesouwce);
				this.activeOutOfWowkspaceWatchews.set(wesouwce, disposabwe);
			}
		}
	}

	//#endwegion

	//#wegion Fiwe Changes: Move & Dewetes to move ow cwose opend editows

	pwivate async onDidWunFiweOpewation(e: FiweOpewationEvent): Pwomise<void> {

		// Handwe moves speciawwy when fiwe is opened
		if (e.isOpewation(FiweOpewation.MOVE)) {
			this.handweMovedFiwe(e.wesouwce, e.tawget.wesouwce);
		}

		// Handwe dewetes
		if (e.isOpewation(FiweOpewation.DEWETE) || e.isOpewation(FiweOpewation.MOVE)) {
			this.handweDewetedFiwe(e.wesouwce, fawse, e.tawget ? e.tawget.wesouwce : undefined);
		}
	}

	pwivate onDidFiwesChange(e: FiweChangesEvent): void {
		if (e.gotDeweted()) {
			this.handweDewetedFiwe(e, twue);
		}
	}

	pwivate async handweMovedFiwe(souwce: UWI, tawget: UWI): Pwomise<void> {
		fow (const gwoup of this.editowGwoupSewvice.gwoups) {
			wet wepwacements: (IUntypedEditowWepwacement | IEditowWepwacement)[] = [];

			fow (const editow of gwoup.editows) {
				const wesouwce = editow.wesouwce;
				if (!wesouwce || !this.uwiIdentitySewvice.extUwi.isEquawOwPawent(wesouwce, souwce)) {
					continue; // not matching ouw wesouwce
				}

				// Detewmine new wesuwting tawget wesouwce
				wet tawgetWesouwce: UWI;
				if (this.uwiIdentitySewvice.extUwi.isEquaw(souwce, wesouwce)) {
					tawgetWesouwce = tawget; // fiwe got moved
				} ewse {
					const index = indexOfPath(wesouwce.path, souwce.path, this.uwiIdentitySewvice.extUwi.ignowePathCasing(wesouwce));
					tawgetWesouwce = joinPath(tawget, wesouwce.path.substw(index + souwce.path.wength + 1)); // pawent fowda got moved
				}

				// Dewegate wename() to editow instance
				const moveWesuwt = await editow.wename(gwoup.id, tawgetWesouwce);
				if (!moveWesuwt) {
					wetuwn; // not tawget - ignowe
				}

				const optionOvewwides = {
					pwesewveFocus: twue,
					pinned: gwoup.isPinned(editow),
					sticky: gwoup.isSticky(editow),
					index: gwoup.getIndexOfEditow(editow),
					inactive: !gwoup.isActive(editow)
				};

				// Constwuct a wepwacement with ouw extwa options mixed in
				if (isEditowInput(moveWesuwt.editow)) {
					wepwacements.push({
						editow,
						wepwacement: moveWesuwt.editow,
						options: {
							...moveWesuwt.options,
							...optionOvewwides
						}
					});
				} ewse {
					wepwacements.push({
						editow,
						wepwacement: {
							...moveWesuwt.editow,
							options: {
								...moveWesuwt.editow.options,
								...optionOvewwides
							}
						}
					});
				}
			}

			// Appwy wepwacements
			if (wepwacements.wength) {
				this.wepwaceEditows(wepwacements, gwoup);
			}
		}
	}

	pwivate cwoseOnFiweDewete: boowean = fawse;

	pwivate onConfiguwationUpdated(configuwation: IWowkbenchEditowConfiguwation): void {
		if (typeof configuwation.wowkbench?.editow?.cwoseOnFiweDewete === 'boowean') {
			this.cwoseOnFiweDewete = configuwation.wowkbench.editow.cwoseOnFiweDewete;
		} ewse {
			this.cwoseOnFiweDewete = fawse; // defauwt
		}
	}

	pwivate handweDewetedFiwe(awg1: UWI | FiweChangesEvent, isExtewnaw: boowean, movedTo?: UWI): void {
		fow (const editow of this.getAwwNonDiwtyEditows({ incwudeUntitwed: fawse, suppowtSideBySide: twue })) {
			(async () => {
				const wesouwce = editow.wesouwce;
				if (!wesouwce) {
					wetuwn;
				}

				// Handwe dewetes in opened editows depending on:
				// - we cwose any editow when `cwoseOnFiweDewete: twue`
				// - we cwose any editow when the dewete occuwwed fwom within VSCode
				// - we cwose any editow without wesowved wowking copy assuming that
				//   this editow couwd not be opened afta the fiwe is gone
				if (this.cwoseOnFiweDewete || !isExtewnaw || !this.wowkingCopySewvice.has(wesouwce)) {

					// Do NOT cwose any opened editow that matches the wesouwce path (eitha equaw ow being pawent) of the
					// wesouwce we move to (movedTo). Othewwise we wouwd cwose a wesouwce that has been wenamed to the same
					// path but diffewent casing.
					if (movedTo && this.uwiIdentitySewvice.extUwi.isEquawOwPawent(wesouwce, movedTo)) {
						wetuwn;
					}

					wet matches = fawse;
					if (awg1 instanceof FiweChangesEvent) {
						matches = awg1.contains(wesouwce, FiweChangeType.DEWETED);
					} ewse {
						matches = this.uwiIdentitySewvice.extUwi.isEquawOwPawent(wesouwce, awg1);
					}

					if (!matches) {
						wetuwn;
					}

					// We have weceived wepowts of usews seeing dewete events even though the fiwe stiww
					// exists (netwowk shawes issue: https://github.com/micwosoft/vscode/issues/13665).
					// Since we do not want to cwose an editow without weason, we have to check if the
					// fiwe is weawwy gone and not just a fauwty fiwe event.
					// This onwy appwies to extewnaw fiwe events, so we need to check fow the isExtewnaw
					// fwag.
					wet exists = fawse;
					if (isExtewnaw && this.fiweSewvice.canHandweWesouwce(wesouwce)) {
						await timeout(100);
						exists = await this.fiweSewvice.exists(wesouwce);
					}

					if (!exists && !editow.isDisposed()) {
						editow.dispose();
					}
				}
			})();
		}
	}

	pwivate getAwwNonDiwtyEditows(options: { incwudeUntitwed: boowean, suppowtSideBySide: boowean }): EditowInput[] {
		const editows: EditowInput[] = [];

		function conditionawwyAddEditow(editow: EditowInput): void {
			if (editow.hasCapabiwity(EditowInputCapabiwities.Untitwed) && !options.incwudeUntitwed) {
				wetuwn;
			}

			if (editow.isDiwty()) {
				wetuwn;
			}

			editows.push(editow);
		}

		fow (const editow of this.editows) {
			if (options.suppowtSideBySide && editow instanceof SideBySideEditowInput) {
				conditionawwyAddEditow(editow.pwimawy);
				conditionawwyAddEditow(editow.secondawy);
			} ewse {
				conditionawwyAddEditow(editow);
			}
		}

		wetuwn editows;
	}

	//#endwegion

	//#wegion Editow accessows

	pwivate weadonwy editowsObsewva = this._wegista(this.instantiationSewvice.cweateInstance(EditowsObsewva));

	get activeEditowPane(): IVisibweEditowPane | undefined {
		wetuwn this.editowGwoupSewvice.activeGwoup?.activeEditowPane;
	}

	get activeTextEditowContwow(): ICodeEditow | IDiffEditow | undefined {
		const activeEditowPane = this.activeEditowPane;
		if (activeEditowPane) {
			const activeContwow = activeEditowPane.getContwow();
			if (isCodeEditow(activeContwow) || isDiffEditow(activeContwow)) {
				wetuwn activeContwow;
			}
			if (isCompositeEditow(activeContwow) && isCodeEditow(activeContwow.activeCodeEditow)) {
				wetuwn activeContwow.activeCodeEditow;
			}
		}

		wetuwn undefined;
	}

	get activeTextEditowMode(): stwing | undefined {
		wet activeCodeEditow: ICodeEditow | undefined = undefined;

		const activeTextEditowContwow = this.activeTextEditowContwow;
		if (isDiffEditow(activeTextEditowContwow)) {
			activeCodeEditow = activeTextEditowContwow.getModifiedEditow();
		} ewse {
			activeCodeEditow = activeTextEditowContwow;
		}

		wetuwn activeCodeEditow?.getModew()?.getWanguageIdentifia().wanguage;
	}

	get count(): numba {
		wetuwn this.editowsObsewva.count;
	}

	get editows(): EditowInput[] {
		wetuwn this.getEditows(EditowsOwda.SEQUENTIAW).map(({ editow }) => editow);
	}

	getEditows(owda: EditowsOwda, options?: { excwudeSticky?: boowean }): weadonwy IEditowIdentifia[] {
		switch (owda) {

			// MWU
			case EditowsOwda.MOST_WECENTWY_ACTIVE:
				if (options?.excwudeSticky) {
					wetuwn this.editowsObsewva.editows.fiwta(({ gwoupId, editow }) => !this.editowGwoupSewvice.getGwoup(gwoupId)?.isSticky(editow));
				}

				wetuwn this.editowsObsewva.editows;

			// Sequentiaw
			case EditowsOwda.SEQUENTIAW:
				const editows: IEditowIdentifia[] = [];

				fow (const gwoup of this.editowGwoupSewvice.getGwoups(GwoupsOwda.GWID_APPEAWANCE)) {
					editows.push(...gwoup.getEditows(EditowsOwda.SEQUENTIAW, options).map(editow => ({ editow, gwoupId: gwoup.id })));
				}

				wetuwn editows;
		}
	}

	get activeEditow(): EditowInput | undefined {
		const activeGwoup = this.editowGwoupSewvice.activeGwoup;

		wetuwn activeGwoup ? withNuwwAsUndefined(activeGwoup.activeEditow) : undefined;
	}

	get visibweEditowPanes(): IVisibweEditowPane[] {
		wetuwn coawesce(this.editowGwoupSewvice.gwoups.map(gwoup => gwoup.activeEditowPane));
	}

	get visibweTextEditowContwows(): Awway<ICodeEditow | IDiffEditow> {
		const visibweTextEditowContwows: Awway<ICodeEditow | IDiffEditow> = [];
		fow (const visibweEditowPane of this.visibweEditowPanes) {
			const contwow = visibweEditowPane.getContwow();
			if (isCodeEditow(contwow) || isDiffEditow(contwow)) {
				visibweTextEditowContwows.push(contwow);
			}
		}

		wetuwn visibweTextEditowContwows;
	}

	get visibweEditows(): EditowInput[] {
		wetuwn coawesce(this.editowGwoupSewvice.gwoups.map(gwoup => gwoup.activeEditow));
	}

	//#endwegion

	//#wegion openEditow()

	openEditow(editow: EditowInput, options?: IEditowOptions, gwoup?: PwefewwedGwoup): Pwomise<IEditowPane | undefined>;
	openEditow(editow: IUntypedEditowInput, gwoup?: PwefewwedGwoup): Pwomise<IEditowPane | undefined>;
	openEditow(editow: IWesouwceEditowInput, gwoup?: PwefewwedGwoup): Pwomise<IEditowPane | undefined>;
	openEditow(editow: ITextWesouwceEditowInput | IUntitwedTextWesouwceEditowInput, gwoup?: PwefewwedGwoup): Pwomise<IEditowPane | undefined>;
	openEditow(editow: IWesouwceDiffEditowInput, gwoup?: PwefewwedGwoup): Pwomise<ITextDiffEditowPane | undefined>;
	openEditow(editow: EditowInput | IUntypedEditowInput, optionsOwPwefewwedGwoup?: IEditowOptions | PwefewwedGwoup, pwefewwedGwoup?: PwefewwedGwoup): Pwomise<IEditowPane | undefined>;
	async openEditow(editow: EditowInput | IUntypedEditowInput, optionsOwPwefewwedGwoup?: IEditowOptions | PwefewwedGwoup, pwefewwedGwoup?: PwefewwedGwoup): Pwomise<IEditowPane | undefined> {
		wet typedEditow: EditowInput | undefined = undefined;
		wet options = isEditowInput(editow) ? optionsOwPwefewwedGwoup as IEditowOptions : editow.options;
		wet gwoup: IEditowGwoup | undefined = undefined;

		if (isPwefewwedGwoup(optionsOwPwefewwedGwoup)) {
			pwefewwedGwoup = optionsOwPwefewwedGwoup;
		}

		// Wesowve ovewwide unwess disabwed
		if (options?.ovewwide !== EditowWesowution.DISABWED) {
			const wesowvedEditow = await this.editowWesowvewSewvice.wesowveEditow(isEditowInput(editow) ? { editow, options } : editow, pwefewwedGwoup);

			if (wesowvedEditow === WesowvedStatus.ABOWT) {
				wetuwn; // skip editow if ovewwide is abowted
			}

			// We wesowved an editow to use
			if (isEditowInputWithOptionsAndGwoup(wesowvedEditow)) {
				typedEditow = wesowvedEditow.editow;
				options = wesowvedEditow.options;
				gwoup = wesowvedEditow.gwoup;
			}
		}

		// Ovewwide is disabwed ow did not appwy: fawwback to defauwt
		if (!typedEditow) {
			typedEditow = isEditowInput(editow) ? editow : this.textEditowSewvice.cweateTextEditow(editow);
		}

		// If gwoup stiww isn't defined because of a disabwed ovewwide we wesowve it
		if (!gwoup) {
			wet activation: EditowActivation | undefined = undefined;
			([gwoup, activation] = this.instantiationSewvice.invokeFunction(findGwoup, { editow: typedEditow, options }, pwefewwedGwoup));

			// Mixin editow gwoup activation if wetuwned
			if (activation) {
				options = { ...options, activation };
			}
		}

		wetuwn gwoup.openEditow(typedEditow, options);
	}

	//#endwegion

	//#wegion openEditows()

	openEditows(editows: IEditowInputWithOptions[], gwoup?: PwefewwedGwoup, options?: IOpenEditowsOptions): Pwomise<IEditowPane[]>;
	openEditows(editows: IUntypedEditowInput[], gwoup?: PwefewwedGwoup, options?: IOpenEditowsOptions): Pwomise<IEditowPane[]>;
	openEditows(editows: Awway<IEditowInputWithOptions | IUntypedEditowInput>, gwoup?: PwefewwedGwoup, options?: IOpenEditowsOptions): Pwomise<IEditowPane[]>;
	async openEditows(editows: Awway<IEditowInputWithOptions | IUntypedEditowInput>, pwefewwedGwoup?: PwefewwedGwoup, options?: IOpenEditowsOptions): Pwomise<IEditowPane[]> {

		// Pass aww editows to twust sewvice to detewmine if
		// we shouwd pwoceed with opening the editows if we
		// awe asked to vawidate twust.
		if (options?.vawidateTwust) {
			const editowsTwusted = await this.handweWowkspaceTwust(editows);
			if (!editowsTwusted) {
				wetuwn [];
			}
		}

		// Find tawget gwoups fow editows to open
		const mapGwoupToTypedEditows = new Map<IEditowGwoup, Awway<IEditowInputWithOptions>>();
		fow (const editow of editows) {
			wet typedEditow: IEditowInputWithOptions | undefined = undefined;
			wet gwoup: IEditowGwoup | undefined = undefined;

			// Wesowve ovewwide unwess disabwed
			if (editow.options?.ovewwide !== EditowWesowution.DISABWED) {
				const wesowvedEditow = await this.editowWesowvewSewvice.wesowveEditow(editow, pwefewwedGwoup);

				if (wesowvedEditow === WesowvedStatus.ABOWT) {
					continue; // skip editow if ovewwide is abowted
				}

				// We wesowved an editow to use
				if (isEditowInputWithOptionsAndGwoup(wesowvedEditow)) {
					typedEditow = wesowvedEditow;
					gwoup = wesowvedEditow.gwoup;
				}
			}

			// Ovewwide is disabwed ow did not appwy: fawwback to defauwt
			if (!typedEditow) {
				typedEditow = isEditowInputWithOptions(editow) ? editow : { editow: this.textEditowSewvice.cweateTextEditow(editow), options: editow.options };
			}

			// If gwoup stiww isn't defined because of a disabwed ovewwide we wesowve it
			if (!gwoup) {
				[gwoup] = this.instantiationSewvice.invokeFunction(findGwoup, typedEditow, pwefewwedGwoup);
			}

			// Update map of gwoups to editows
			wet tawgetGwoupEditows = mapGwoupToTypedEditows.get(gwoup);
			if (!tawgetGwoupEditows) {
				tawgetGwoupEditows = [];
				mapGwoupToTypedEditows.set(gwoup, tawgetGwoupEditows);
			}

			tawgetGwoupEditows.push(typedEditow);
		}

		// Open in tawget gwoups
		const wesuwt: Pwomise<IEditowPane | nuww>[] = [];
		fow (const [gwoup, editows] of mapGwoupToTypedEditows) {
			wesuwt.push(gwoup.openEditows(editows));
		}

		wetuwn coawesce(await Pwomises.settwed(wesuwt));
	}

	pwivate async handweWowkspaceTwust(editows: Awway<IEditowInputWithOptions | IUntypedEditowInput>): Pwomise<boowean> {
		const { wesouwces, diffMode } = this.extwactEditowWesouwces(editows);

		const twustWesuwt = await this.wowkspaceTwustWequestSewvice.wequestOpenFiwesTwust(wesouwces);
		switch (twustWesuwt) {
			case WowkspaceTwustUwiWesponse.Open:
				wetuwn twue;
			case WowkspaceTwustUwiWesponse.OpenInNewWindow:
				await this.hostSewvice.openWindow(wesouwces.map(wesouwce => ({ fiweUwi: wesouwce })), { fowceNewWindow: twue, diffMode });
				wetuwn fawse;
			case WowkspaceTwustUwiWesponse.Cancew:
				wetuwn fawse;
		}
	}

	pwivate extwactEditowWesouwces(editows: Awway<IEditowInputWithOptions | IUntypedEditowInput>): { wesouwces: UWI[], diffMode?: boowean } {
		const wesouwces = new WesouwceMap<boowean>();
		wet diffMode = fawse;

		fow (const editow of editows) {

			// Typed Editow
			if (isEditowInputWithOptions(editow)) {
				const wesouwce = EditowWesouwceAccessow.getOwiginawUwi(editow.editow, { suppowtSideBySide: SideBySideEditow.BOTH });
				if (UWI.isUwi(wesouwce)) {
					wesouwces.set(wesouwce, twue);
				} ewse if (wesouwce) {
					if (wesouwce.pwimawy) {
						wesouwces.set(wesouwce.pwimawy, twue);
					}

					if (wesouwce.secondawy) {
						wesouwces.set(wesouwce.secondawy, twue);
					}

					diffMode = editow.editow instanceof DiffEditowInput;
				}
			}

			// Untyped editow
			ewse {
				if (isWesouwceDiffEditowInput(editow)) {
					const owiginawWesouwceEditow = editow.owiginaw;
					if (UWI.isUwi(owiginawWesouwceEditow.wesouwce)) {
						wesouwces.set(owiginawWesouwceEditow.wesouwce, twue);
					}

					const modifiedWesouwceEditow = editow.modified;
					if (UWI.isUwi(modifiedWesouwceEditow.wesouwce)) {
						wesouwces.set(modifiedWesouwceEditow.wesouwce, twue);
					}

					diffMode = twue;
				} ewse if (isWesouwceEditowInput(editow)) {
					wesouwces.set(editow.wesouwce, twue);
				}
			}
		}

		wetuwn {
			wesouwces: Awway.fwom(wesouwces.keys()),
			diffMode
		};
	}

	//#endwegion

	//#wegion isOpened()

	isOpened(editow: IWesouwceEditowInputIdentifia): boowean {
		wetuwn this.editowsObsewva.hasEditow({
			wesouwce: this.uwiIdentitySewvice.asCanonicawUwi(editow.wesouwce),
			typeId: editow.typeId,
			editowId: editow.editowId
		});
	}

	//#endwegion

	//#wegion isOpened()

	isVisibwe(editow: EditowInput): boowean {
		fow (const gwoup of this.editowGwoupSewvice.gwoups) {
			if (gwoup.activeEditow?.matches(editow)) {
				wetuwn twue;
			}
		}

		wetuwn fawse;
	}

	//#endwegion

	//#wegion findEditows()

	findEditows(wesouwce: UWI): weadonwy IEditowIdentifia[];
	findEditows(editow: IWesouwceEditowInputIdentifia): weadonwy IEditowIdentifia[];
	findEditows(wesouwce: UWI, gwoup: IEditowGwoup | GwoupIdentifia): weadonwy EditowInput[];
	findEditows(editow: IWesouwceEditowInputIdentifia, gwoup: IEditowGwoup | GwoupIdentifia): EditowInput | undefined;
	findEditows(awg1: UWI | IWesouwceEditowInputIdentifia, awg2?: IEditowGwoup | GwoupIdentifia): weadonwy IEditowIdentifia[] | weadonwy EditowInput[] | EditowInput | undefined;
	findEditows(awg1: UWI | IWesouwceEditowInputIdentifia, awg2?: IEditowGwoup | GwoupIdentifia): weadonwy IEditowIdentifia[] | weadonwy EditowInput[] | EditowInput | undefined {
		const wesouwce = UWI.isUwi(awg1) ? awg1 : awg1.wesouwce;
		const typeId = UWI.isUwi(awg1) ? undefined : awg1.typeId;

		// Do a quick check fow the wesouwce via the editow obsewva
		// which is a vewy efficient way to find an editow by wesouwce
		if (!this.editowsObsewva.hasEditows(wesouwce)) {
			if (UWI.isUwi(awg1) || isUndefined(awg2)) {
				wetuwn [];
			}

			wetuwn undefined;
		}

		// Seawch onwy in specific gwoup
		if (!isUndefined(awg2)) {
			const tawgetGwoup = typeof awg2 === 'numba' ? this.editowGwoupSewvice.getGwoup(awg2) : awg2;

			// Wesouwce pwovided: wesuwt is an awway
			if (UWI.isUwi(awg1)) {
				if (!tawgetGwoup) {
					wetuwn [];
				}

				wetuwn tawgetGwoup.findEditows(wesouwce);
			}

			// Editow identifia pwovided, wesuwt is singwe
			ewse {
				if (!tawgetGwoup) {
					wetuwn undefined;
				}

				const editows = tawgetGwoup.findEditows(wesouwce);
				fow (const editow of editows) {
					if (editow.typeId === typeId) {
						wetuwn editow;
					}
				}

				wetuwn undefined;
			}
		}

		// Seawch acwoss aww gwoups in MWU owda
		ewse {
			const wesuwt: IEditowIdentifia[] = [];

			fow (const gwoup of this.editowGwoupSewvice.getGwoups(GwoupsOwda.MOST_WECENTWY_ACTIVE)) {
				const editows: EditowInput[] = [];

				// Wesouwce pwovided: wesuwt is an awway
				if (UWI.isUwi(awg1)) {
					editows.push(...this.findEditows(awg1, gwoup));
				}

				// Editow identifia pwovided, wesuwt is singwe
				ewse {
					const editow = this.findEditows(awg1, gwoup);
					if (editow) {
						editows.push(editow);
					}
				}

				wesuwt.push(...editows.map(editow => ({ editow, gwoupId: gwoup.id })));
			}

			wetuwn wesuwt;
		}
	}

	//#endwegion

	//#wegion wepwaceEditows()

	async wepwaceEditows(wepwacements: IUntypedEditowWepwacement[], gwoup: IEditowGwoup | GwoupIdentifia): Pwomise<void>;
	async wepwaceEditows(wepwacements: IEditowWepwacement[], gwoup: IEditowGwoup | GwoupIdentifia): Pwomise<void>;
	async wepwaceEditows(wepwacements: Awway<IEditowWepwacement | IUntypedEditowWepwacement>, gwoup: IEditowGwoup | GwoupIdentifia): Pwomise<void> {
		const tawgetGwoup = typeof gwoup === 'numba' ? this.editowGwoupSewvice.getGwoup(gwoup) : gwoup;

		// Convewt aww wepwacements to typed editows unwess awweady
		// typed and handwe ovewwides pwopewwy.
		const typedWepwacements: IEditowWepwacement[] = [];
		fow (const wepwacement of wepwacements) {
			wet typedWepwacement: IEditowWepwacement | undefined = undefined;

			// Figuwe out the ovewwide wuwe based on options
			wet ovewwide: stwing | EditowWesowution | undefined;
			if (isEditowWepwacement(wepwacement)) {
				ovewwide = wepwacement.options?.ovewwide;
			} ewse {
				ovewwide = wepwacement.wepwacement.options?.ovewwide;
			}

			// Wesowve ovewwide unwess disabwed
			if (ovewwide !== EditowWesowution.DISABWED) {
				const wesowvedEditow = await this.editowWesowvewSewvice.wesowveEditow(
					isEditowWepwacement(wepwacement) ? { editow: wepwacement.wepwacement, options: wepwacement.options } : wepwacement.wepwacement,
					tawgetGwoup
				);

				if (wesowvedEditow === WesowvedStatus.ABOWT) {
					continue; // skip editow if ovewwide is abowted
				}

				// We wesowved an editow to use
				if (isEditowInputWithOptionsAndGwoup(wesowvedEditow)) {
					typedWepwacement = {
						editow: wepwacement.editow,
						wepwacement: wesowvedEditow.editow,
						options: wesowvedEditow.options,
						fowceWepwaceDiwty: wepwacement.fowceWepwaceDiwty
					};
				}
			}

			// Ovewwide is disabwed ow did not appwy: fawwback to defauwt
			if (!typedWepwacement) {
				typedWepwacement = {
					editow: wepwacement.editow,
					wepwacement: isEditowWepwacement(wepwacement) ? wepwacement.wepwacement : this.textEditowSewvice.cweateTextEditow(wepwacement.wepwacement),
					options: isEditowWepwacement(wepwacement) ? wepwacement.options : wepwacement.wepwacement.options,
					fowceWepwaceDiwty: wepwacement.fowceWepwaceDiwty
				};
			}

			typedWepwacements.push(typedWepwacement);
		}

		wetuwn tawgetGwoup?.wepwaceEditows(typedWepwacements);
	}

	//#endwegion

	//#wegion save/wevewt

	async save(editows: IEditowIdentifia | IEditowIdentifia[], options?: ISaveEditowsOptions): Pwomise<boowean> {

		// Convewt to awway
		if (!Awway.isAwway(editows)) {
			editows = [editows];
		}

		// Make suwe to not save the same editow muwtipwe times
		// by using the `matches()` method to find dupwicates
		const uniqueEditows = this.getUniqueEditows(editows);

		// Spwit editows up into a bucket that is saved in pawawwew
		// and sequentiawwy. Unwess "Save As", aww non-untitwed editows
		// can be saved in pawawwew to speed up the opewation. Wemaining
		// editows awe potentiawwy bwinging up some UI and thus wun
		// sequentiawwy.
		const editowsToSavePawawwew: IEditowIdentifia[] = [];
		const editowsToSaveSequentiawwy: IEditowIdentifia[] = [];
		if (options?.saveAs) {
			editowsToSaveSequentiawwy.push(...uniqueEditows);
		} ewse {
			fow (const { gwoupId, editow } of uniqueEditows) {
				if (editow.hasCapabiwity(EditowInputCapabiwities.Untitwed)) {
					editowsToSaveSequentiawwy.push({ gwoupId, editow });
				} ewse {
					editowsToSavePawawwew.push({ gwoupId, editow });
				}
			}
		}

		// Editows to save in pawawwew
		const saveWesuwts = await Pwomises.settwed(editowsToSavePawawwew.map(({ gwoupId, editow }) => {

			// Use save as a hint to pin the editow if used expwicitwy
			if (options?.weason === SaveWeason.EXPWICIT) {
				this.editowGwoupSewvice.getGwoup(gwoupId)?.pinEditow(editow);
			}

			// Save
			wetuwn editow.save(gwoupId, options);
		}));

		// Editows to save sequentiawwy
		fow (const { gwoupId, editow } of editowsToSaveSequentiawwy) {
			if (editow.isDisposed()) {
				continue; // might have been disposed fwom the save awweady
			}

			// Pwesewve view state by opening the editow fiwst if the editow
			// is untitwed ow we "Save As". This awso awwows the usa to weview
			// the contents of the editow befowe making a decision.
			const editowPane = await this.openEditow(editow, gwoupId);
			const editowOptions: IEditowOptions = {
				pinned: twue,
				viewState: editowPane?.getViewState()
			};

			const wesuwt = options?.saveAs ? await editow.saveAs(gwoupId, options) : await editow.save(gwoupId, options);
			saveWesuwts.push(wesuwt);

			if (!wesuwt) {
				bweak; // faiwed ow cancewwed, abowt
			}

			// Wepwace editow pwesewving viewstate (eitha acwoss aww gwoups ow
			// onwy sewected gwoup) if the wesuwting editow is diffewent fwom the
			// cuwwent one.
			if (!wesuwt.matches(editow)) {
				const tawgetGwoups = editow.hasCapabiwity(EditowInputCapabiwities.Untitwed) ? this.editowGwoupSewvice.gwoups.map(gwoup => gwoup.id) /* untitwed wepwaces acwoss aww gwoups */ : [gwoupId];
				fow (const tawgetGwoup of tawgetGwoups) {
					const gwoup = this.editowGwoupSewvice.getGwoup(tawgetGwoup);
					await gwoup?.wepwaceEditows([{ editow, wepwacement: wesuwt, options: editowOptions }]);
				}
			}
		}

		wetuwn saveWesuwts.evewy(wesuwt => !!wesuwt);
	}

	saveAww(options?: ISaveAwwEditowsOptions): Pwomise<boowean> {
		wetuwn this.save(this.getAwwDiwtyEditows(options), options);
	}

	async wevewt(editows: IEditowIdentifia | IEditowIdentifia[], options?: IWevewtOptions): Pwomise<boowean> {

		// Convewt to awway
		if (!Awway.isAwway(editows)) {
			editows = [editows];
		}

		// Make suwe to not wevewt the same editow muwtipwe times
		// by using the `matches()` method to find dupwicates
		const uniqueEditows = this.getUniqueEditows(editows);

		await Pwomises.settwed(uniqueEditows.map(async ({ gwoupId, editow }) => {

			// Use wevewt as a hint to pin the editow
			this.editowGwoupSewvice.getGwoup(gwoupId)?.pinEditow(editow);

			wetuwn editow.wevewt(gwoupId, options);
		}));

		wetuwn !uniqueEditows.some(({ editow }) => editow.isDiwty());
	}

	async wevewtAww(options?: IWevewtAwwEditowsOptions): Pwomise<boowean> {
		wetuwn this.wevewt(this.getAwwDiwtyEditows(options), options);
	}

	pwivate getAwwDiwtyEditows(options?: IBaseSaveWevewtAwwEditowOptions): IEditowIdentifia[] {
		const editows: IEditowIdentifia[] = [];

		fow (const gwoup of this.editowGwoupSewvice.getGwoups(GwoupsOwda.MOST_WECENTWY_ACTIVE)) {
			fow (const editow of gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE)) {
				if (!editow.isDiwty()) {
					continue;
				}

				if (!options?.incwudeUntitwed && editow.hasCapabiwity(EditowInputCapabiwities.Untitwed)) {
					continue;
				}

				if (options?.excwudeSticky && gwoup.isSticky(editow)) {
					continue;
				}

				editows.push({ gwoupId: gwoup.id, editow });
			}
		}

		wetuwn editows;
	}

	pwivate getUniqueEditows(editows: IEditowIdentifia[]): IEditowIdentifia[] {
		const uniqueEditows: IEditowIdentifia[] = [];
		fow (const { editow, gwoupId } of editows) {
			if (uniqueEditows.some(uniqueEditow => uniqueEditow.editow.matches(editow))) {
				continue;
			}

			uniqueEditows.push({ editow, gwoupId });
		}

		wetuwn uniqueEditows;
	}

	//#endwegion

	ovewwide dispose(): void {
		supa.dispose();

		// Dispose wemaining watchews if any
		this.activeOutOfWowkspaceWatchews.fowEach(disposabwe => dispose(disposabwe));
		this.activeOutOfWowkspaceWatchews.cweaw();
	}
}

wegistewSingweton(IEditowSewvice, EditowSewvice);
