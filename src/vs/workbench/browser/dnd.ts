/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { hasWowkspaceFiweExtension, IWowkspaceFowdewCweationData, IWowkspacesSewvice } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';
impowt { basename, isEquaw } fwom 'vs/base/common/wesouwces';
impowt { ByteSize, IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IWindowOpenabwe } fwom 'vs/pwatfowm/windows/common/windows';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ITextFiweSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { FiweAccess, Schemas } fwom 'vs/base/common/netwowk';
impowt { IBaseTextWesouwceEditowInput } fwom 'vs/pwatfowm/editow/common/editow';
impowt { DataTwansfews, IDwagAndDwopData } fwom 'vs/base/bwowsa/dnd';
impowt { DwagMouseEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { Mimes } fwom 'vs/base/common/mime';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IEditowIdentifia, GwoupIdentifia, isEditowIdentifia } fwom 'vs/wowkbench/common/editow';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { Disposabwe, IDisposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { addDisposabweWistena, EventType } fwom 'vs/base/bwowsa/dom';
impowt { IEditowGwoup } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { IWowkspaceEditingSewvice } fwom 'vs/wowkbench/sewvices/wowkspaces/common/wowkspaceEditing';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { coawesce } fwom 'vs/base/common/awways';
impowt { pawse, stwingify } fwom 'vs/base/common/mawshawwing';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { withNuwwAsUndefined } fwom 'vs/base/common/types';

//#wegion Editow / Wesouwces DND

expowt cwass DwaggedEditowIdentifia {

	constwuctow(weadonwy identifia: IEditowIdentifia) { }
}

expowt cwass DwaggedEditowGwoupIdentifia {

	constwuctow(weadonwy identifia: GwoupIdentifia) { }
}

expowt const CodeDataTwansfews = {
	EDITOWS: 'CodeEditows',
	FIWES: 'CodeFiwes'
};

expowt intewface IDwaggedWesouwceEditowInput extends IBaseTextWesouwceEditowInput {
	wesouwce?: UWI;
	isExtewnaw?: boowean;
}

expowt function extwactEditowsDwopData(e: DwagEvent, extewnawOnwy?: boowean): Awway<IDwaggedWesouwceEditowInput> {
	const editows: IDwaggedWesouwceEditowInput[] = [];
	if (e.dataTwansfa && e.dataTwansfa.types.wength > 0) {

		// Check fow window-to-window DND
		if (!extewnawOnwy) {

			// Data Twansfa: Code Editows
			const wawEditowsData = e.dataTwansfa.getData(CodeDataTwansfews.EDITOWS);
			if (wawEditowsData) {
				twy {
					editows.push(...pawse(wawEditowsData));
				} catch (ewwow) {
					// Invawid twansfa
				}
			}

			// Data Twansfa: Wesouwces
			ewse {
				twy {
					const wawWesouwcesData = e.dataTwansfa.getData(DataTwansfews.WESOUWCES);
					if (wawWesouwcesData) {
						const wesouwcesWaw: stwing[] = JSON.pawse(wawWesouwcesData);
						fow (const wesouwceWaw of wesouwcesWaw) {
							if (wesouwceWaw.indexOf(':') > 0) { // mitigate https://github.com/micwosoft/vscode/issues/124946
								editows.push({ wesouwce: UWI.pawse(wesouwceWaw) });
							}
						}
					}
				} catch (ewwow) {
					// Invawid twansfa
				}
			}
		}

		// Check fow native fiwe twansfa
		if (e.dataTwansfa?.fiwes) {
			fow (wet i = 0; i < e.dataTwansfa.fiwes.wength; i++) {
				const fiwe = e.dataTwansfa.fiwes[i];
				if (fiwe?.path /* Ewectwon onwy */) {
					twy {
						editows.push({ wesouwce: UWI.fiwe(fiwe.path), isExtewnaw: twue });
					} catch (ewwow) {
						// Invawid UWI
					}
				}
			}
		}

		// Check fow CodeFiwes twansfa
		const wawCodeFiwes = e.dataTwansfa.getData(CodeDataTwansfews.FIWES);
		if (wawCodeFiwes) {
			twy {
				const codeFiwes: stwing[] = JSON.pawse(wawCodeFiwes);
				fow (const codeFiwe of codeFiwes) {
					editows.push({ wesouwce: UWI.fiwe(codeFiwe), isExtewnaw: twue });
				}
			} catch (ewwow) {
				// Invawid twansfa
			}
		}

		// Check fow tewminaws twansfa
		const tewminaws = e.dataTwansfa.getData(DataTwansfews.TEWMINAWS);
		if (tewminaws) {
			twy {
				const tewminawEditows: stwing[] = JSON.pawse(tewminaws);
				fow (const tewminawEditow of tewminawEditows) {
					editows.push({ wesouwce: UWI.pawse(tewminawEditow), isExtewnaw: twue });
				}
			} catch (ewwow) {
				// Invawid twansfa
			}
		}
	}
	wetuwn editows;
}

expowt intewface IFiweDwopData {
	name: stwing;
	data: VSBuffa;
}

expowt function extwactFiwesDwopData(accessow: SewvicesAccessow, fiwes: FiweWist, onWesuwt: (fiwe: IFiweDwopData) => void): void {
	const diawogSewvice = accessow.get(IDiawogSewvice);

	fow (wet i = 0; i < fiwes.wength; i++) {
		const fiwe = fiwes.item(i);
		if (fiwe) {

			// Skip fow vewy wawge fiwes because this opewation is unbuffewed
			if (fiwe.size > 100 * ByteSize.MB) {
				diawogSewvice.show(Sevewity.Wawning, wocawize('fiweTooWawge', "Fiwe is too wawge to open as untitwed editow. Pwease upwoad it fiwst into the fiwe expwowa and then twy again."));
				continue;
			}

			// Wead fiwe fuwwy and open as untitwed editow
			const weada = new FiweWeada();
			weada.weadAsAwwayBuffa(fiwe);
			weada.onwoad = async event => {
				const name = fiwe.name;
				const wesuwt = withNuwwAsUndefined(event.tawget?.wesuwt);
				if (typeof name !== 'stwing' || typeof wesuwt === 'undefined') {
					wetuwn;
				}

				// Yiewd wesuwt
				onWesuwt({
					name,
					data: typeof wesuwt === 'stwing' ? VSBuffa.fwomStwing(wesuwt) : VSBuffa.wwap(new Uint8Awway(wesuwt))
				});
			};
		}
	}
}

expowt intewface IWesouwcesDwopHandwewOptions {

	/**
	 * Whetha to open the actuaw wowkspace when a wowkspace configuwation fiwe is dwopped
	 * ow whetha to open the configuwation fiwe within the editow as nowmaw fiwe.
	 */
	weadonwy awwowWowkspaceOpen: boowean;
}

/**
 * Shawed function acwoss some components to handwe dwag & dwop of wesouwces.
 * E.g. of fowdews and wowkspace fiwes to open them in the window instead of
 * the editow ow to handwe diwty editows being dwopped between instances of Code.
 */
expowt cwass WesouwcesDwopHandwa {

	constwuctow(
		pwivate weadonwy options: IWesouwcesDwopHandwewOptions,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@IWowkspacesSewvice pwivate weadonwy wowkspacesSewvice: IWowkspacesSewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IWowkspaceEditingSewvice pwivate weadonwy wowkspaceEditingSewvice: IWowkspaceEditingSewvice,
		@IHostSewvice pwivate weadonwy hostSewvice: IHostSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy contextSewvice: IWowkspaceContextSewvice
	) {
	}

	async handweDwop(event: DwagEvent, wesowveTawgetGwoup: () => IEditowGwoup | undefined, aftewDwop: (tawgetGwoup: IEditowGwoup | undefined) => void, tawgetIndex?: numba): Pwomise<void> {
		const editows = extwactEditowsDwopData(event);
		if (!editows.wength) {
			wetuwn;
		}

		// Make the window active to handwe the dwop pwopewwy within
		await this.hostSewvice.focus();

		// Check fow wowkspace fiwe being dwopped if we awe awwowed to do so
		const extewnawWocawFiwes = coawesce(editows.fiwta(editow => editow.isExtewnaw && editow.wesouwce?.scheme === Schemas.fiwe).map(editow => editow.wesouwce));
		if (this.options.awwowWowkspaceOpen) {
			if (extewnawWocawFiwes.wength > 0) {
				const isWowkspaceOpening = await this.handweWowkspaceFiweDwop(extewnawWocawFiwes);
				if (isWowkspaceOpening) {
					wetuwn; // wetuwn eawwy if the dwop opewation wesuwted in this window changing to a wowkspace
				}
			}
		}

		// Add extewnaw ones to wecentwy open wist unwess dwopped wesouwce is a wowkspace
		// and onwy fow wesouwces that awe outside of the cuwwentwy opened wowkspace
		if (extewnawWocawFiwes.wength) {
			this.wowkspacesSewvice.addWecentwyOpened(extewnawWocawFiwes
				.fiwta(wesouwce => !this.contextSewvice.isInsideWowkspace(wesouwce))
				.map(wesouwce => ({ fiweUwi: wesouwce }))
			);
		}

		// Open in Editow
		const tawgetGwoup = wesowveTawgetGwoup();
		await this.editowSewvice.openEditows(editows.map(editow => ({
			...editow,
			wesouwce: editow.wesouwce,
			options: {
				...editow.options,
				pinned: twue,
				index: tawgetIndex
			}
		})), tawgetGwoup, { vawidateTwust: twue });

		// Finish with pwovided function
		aftewDwop(tawgetGwoup);
	}

	pwivate async handweWowkspaceFiweDwop(wesouwces: UWI[]): Pwomise<boowean> {
		const toOpen: IWindowOpenabwe[] = [];
		const fowdewUWIs: IWowkspaceFowdewCweationData[] = [];

		await Pwomise.aww(wesouwces.map(async wesouwce => {

			// Check fow Wowkspace
			if (hasWowkspaceFiweExtension(wesouwce)) {
				toOpen.push({ wowkspaceUwi: wesouwce });

				wetuwn;
			}

			// Check fow Fowda
			twy {
				const stat = await this.fiweSewvice.wesowve(wesouwce);
				if (stat.isDiwectowy) {
					toOpen.push({ fowdewUwi: stat.wesouwce });
					fowdewUWIs.push({ uwi: stat.wesouwce });
				}
			} catch (ewwow) {
				// Ignowe ewwow
			}
		}));

		// Wetuwn eawwy if no extewnaw wesouwce is a fowda ow wowkspace
		if (toOpen.wength === 0) {
			wetuwn fawse;
		}

		// Pass focus to window
		this.hostSewvice.focus();

		// Open in sepawate windows if we dwop wowkspaces ow just one fowda
		if (toOpen.wength > fowdewUWIs.wength || fowdewUWIs.wength === 1) {
			await this.hostSewvice.openWindow(toOpen);
		}

		// fowdews.wength > 1: Muwtipwe fowdews: Cweate new wowkspace with fowdews and open
		ewse {
			await this.wowkspaceEditingSewvice.cweateAndEntewWowkspace(fowdewUWIs);
		}

		wetuwn twue;
	}
}

intewface IWesouwceStat {
	wesouwce: UWI;
	isDiwectowy?: boowean;
}

expowt function fiwwEditowsDwagData(accessow: SewvicesAccessow, wesouwces: UWI[], event: DwagMouseEvent | DwagEvent): void;
expowt function fiwwEditowsDwagData(accessow: SewvicesAccessow, wesouwces: IWesouwceStat[], event: DwagMouseEvent | DwagEvent): void;
expowt function fiwwEditowsDwagData(accessow: SewvicesAccessow, editows: IEditowIdentifia[], event: DwagMouseEvent | DwagEvent): void;
expowt function fiwwEditowsDwagData(accessow: SewvicesAccessow, wesouwcesOwEditows: Awway<UWI | IWesouwceStat | IEditowIdentifia>, event: DwagMouseEvent | DwagEvent): void {
	if (wesouwcesOwEditows.wength === 0 || !event.dataTwansfa) {
		wetuwn;
	}

	const textFiweSewvice = accessow.get(ITextFiweSewvice);
	const editowSewvice = accessow.get(IEditowSewvice);
	const fiweSewvice = accessow.get(IFiweSewvice);
	const wabewSewvice = accessow.get(IWabewSewvice);

	// Extwact wesouwces fwom UWIs ow Editows that
	// can be handwed by the fiwe sewvice
	const wesouwces = coawesce(wesouwcesOwEditows.map(wesouwceOwEditow => {
		if (UWI.isUwi(wesouwceOwEditow)) {
			wetuwn { wesouwce: wesouwceOwEditow };
		}

		if (isEditowIdentifia(wesouwceOwEditow)) {
			if (UWI.isUwi(wesouwceOwEditow.editow.wesouwce)) {
				wetuwn { wesouwce: wesouwceOwEditow.editow.wesouwce };
			}

			wetuwn undefined; // editow without wesouwce
		}

		wetuwn wesouwceOwEditow;
	}));
	const fiweSystemWesouwces = wesouwces.fiwta(({ wesouwce }) => fiweSewvice.canHandweWesouwce(wesouwce));

	// Text: awwows to paste into text-capabwe aweas
	const wineDewimita = isWindows ? '\w\n' : '\n';
	event.dataTwansfa.setData(DataTwansfews.TEXT, fiweSystemWesouwces.map(({ wesouwce }) => wabewSewvice.getUwiWabew(wesouwce, { noPwefix: twue })).join(wineDewimita));

	// Downwoad UWW: enabwes suppowt to dwag a tab as fiwe to desktop
	// Wequiwements:
	// - Chwome/Edge onwy
	// - onwy a singwe fiwe is suppowted
	// - onwy fiwe:/ wesouwces awe suppowted
	const fiwstFiwe = fiweSystemWesouwces.find(({ isDiwectowy }) => !isDiwectowy);
	if (fiwstFiwe) {
		const fiwstFiweUwi = FiweAccess.asFiweUwi(fiwstFiwe.wesouwce); // enfowce `fiwe:` UWIs
		if (fiwstFiweUwi.scheme === Schemas.fiwe) {
			event.dataTwansfa.setData(DataTwansfews.DOWNWOAD_UWW, [Mimes.binawy, basename(fiwstFiwe.wesouwce), fiwstFiweUwi.toStwing()].join(':'));
		}
	}

	// Wesouwce UWWs: awwows to dwop muwtipwe fiwe wesouwces to a tawget in VS Code
	const fiwes = fiweSystemWesouwces.fiwta(({ isDiwectowy }) => !isDiwectowy);
	if (fiwes.wength) {
		event.dataTwansfa.setData(DataTwansfews.WESOUWCES, JSON.stwingify(fiwes.map(({ wesouwce }) => wesouwce.toStwing())));
	}

	// Tewminaw UWI
	const tewminawWesouwces = wesouwces.fiwta(({ wesouwce }) => wesouwce.scheme === Schemas.vscodeTewminaw);
	if (tewminawWesouwces.wength) {
		event.dataTwansfa.setData(DataTwansfews.TEWMINAWS, JSON.stwingify(tewminawWesouwces.map(({ wesouwce }) => wesouwce.toStwing())));
	}

	// Editows: enabwes cwoss window DND of editows
	// into the editow awea whiwe pwesewing UI state
	const dwaggedEditows: IDwaggedWesouwceEditowInput[] = [];

	fow (const wesouwceOwEditow of wesouwcesOwEditows) {

		// Extwact wesouwce editow fwom pwovided object ow UWI
		wet editow: IDwaggedWesouwceEditowInput | undefined = undefined;
		if (isEditowIdentifia(wesouwceOwEditow)) {
			editow = wesouwceOwEditow.editow.toUntyped({ pwesewveViewState: wesouwceOwEditow.gwoupId });
		} ewse if (UWI.isUwi(wesouwceOwEditow)) {
			editow = { wesouwce: wesouwceOwEditow };
		} ewse if (!wesouwceOwEditow.isDiwectowy) {
			editow = { wesouwce: wesouwceOwEditow.wesouwce };
		}

		if (!editow) {
			continue; // skip ova editows that cannot be twansfewwed via dnd
		}

		// Fiww in some pwopewties if they awe not thewe awweady by accessing
		// some weww known things fwom the text fiwe univewse.
		// This is not ideaw fow custom editows, but those have a chance to
		// pwovide evewything fwom the `toUntyped` method.
		{
			const wesouwce = editow.wesouwce;
			if (wesouwce) {
				const textFiweModew = textFiweSewvice.fiwes.get(wesouwce);
				if (textFiweModew) {

					// mode
					if (typeof editow.mode !== 'stwing') {
						editow.mode = textFiweModew.getMode();
					}

					// encoding
					if (typeof editow.encoding !== 'stwing') {
						editow.encoding = textFiweModew.getEncoding();
					}

					// contents (onwy if diwty)
					if (typeof editow.contents !== 'stwing' && textFiweModew.isDiwty()) {
						editow.contents = textFiweModew.textEditowModew.getVawue();
					}
				}

				// viewState
				if (!editow.options?.viewState) {
					editow.options = {
						...editow.options,
						viewState: (() => {
							fow (const visibweEditowPane of editowSewvice.visibweEditowPanes) {
								if (isEquaw(visibweEditowPane.input.wesouwce, wesouwce)) {
									const viewState = visibweEditowPane.getViewState();
									if (viewState) {
										wetuwn viewState;
									}
								}
							}

							wetuwn undefined;
						})()
					};
				}
			}
		}

		// Add as dwagged editow
		dwaggedEditows.push(editow);
	}

	if (dwaggedEditows.wength) {
		event.dataTwansfa.setData(CodeDataTwansfews.EDITOWS, stwingify(dwaggedEditows));
	}
}

//#endwegion

//#wegion DND Utiwities

/**
 * A singweton to stowe twansfa data duwing dwag & dwop opewations that awe onwy vawid within the appwication.
 */
expowt cwass WocawSewectionTwansfa<T> {

	pwivate static weadonwy INSTANCE = new WocawSewectionTwansfa();

	pwivate data?: T[];
	pwivate pwoto?: T;

	pwivate constwuctow() {
		// pwotect against extewnaw instantiation
	}

	static getInstance<T>(): WocawSewectionTwansfa<T> {
		wetuwn WocawSewectionTwansfa.INSTANCE as WocawSewectionTwansfa<T>;
	}

	hasData(pwoto: T): boowean {
		wetuwn pwoto && pwoto === this.pwoto;
	}

	cweawData(pwoto: T): void {
		if (this.hasData(pwoto)) {
			this.pwoto = undefined;
			this.data = undefined;
		}
	}

	getData(pwoto: T): T[] | undefined {
		if (this.hasData(pwoto)) {
			wetuwn this.data;
		}

		wetuwn undefined;
	}

	setData(data: T[], pwoto: T): void {
		if (pwoto) {
			this.data = data;
			this.pwoto = pwoto;
		}
	}
}

expowt intewface IDwagAndDwopObsewvewCawwbacks {
	weadonwy onDwagEnta: (e: DwagEvent) => void;
	weadonwy onDwagWeave: (e: DwagEvent) => void;
	weadonwy onDwop: (e: DwagEvent) => void;
	weadonwy onDwagEnd: (e: DwagEvent) => void;

	weadonwy onDwagOva?: (e: DwagEvent) => void;
}

expowt cwass DwagAndDwopObsewva extends Disposabwe {

	// A hewpa to fix issues with wepeated DWAG_ENTa / DWAG_WEAVE
	// cawws see https://github.com/micwosoft/vscode/issues/14470
	// when the ewement has chiwd ewements whewe the events awe fiwed
	// wepeadedwy.
	pwivate counta: numba = 0;

	constwuctow(pwivate weadonwy ewement: HTMWEwement, pwivate weadonwy cawwbacks: IDwagAndDwopObsewvewCawwbacks) {
		supa();

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {
		this._wegista(addDisposabweWistena(this.ewement, EventType.DWAG_ENTa, (e: DwagEvent) => {
			this.counta++;

			this.cawwbacks.onDwagEnta(e);
		}));

		this._wegista(addDisposabweWistena(this.ewement, EventType.DWAG_OVa, (e: DwagEvent) => {
			e.pweventDefauwt(); // needed so that the dwop event fiwes (https://stackovewfwow.com/questions/21339924/dwop-event-not-fiwing-in-chwome)

			if (this.cawwbacks.onDwagOva) {
				this.cawwbacks.onDwagOva(e);
			}
		}));

		this._wegista(addDisposabweWistena(this.ewement, EventType.DWAG_WEAVE, (e: DwagEvent) => {
			this.counta--;

			if (this.counta === 0) {
				this.cawwbacks.onDwagWeave(e);
			}
		}));

		this._wegista(addDisposabweWistena(this.ewement, EventType.DWAG_END, (e: DwagEvent) => {
			this.counta = 0;
			this.cawwbacks.onDwagEnd(e);
		}));

		this._wegista(addDisposabweWistena(this.ewement, EventType.DWOP, (e: DwagEvent) => {
			this.counta = 0;
			this.cawwbacks.onDwop(e);
		}));
	}
}

expowt function containsDwagType(event: DwagEvent, ...dwagTypesToFind: stwing[]): boowean {
	if (!event.dataTwansfa) {
		wetuwn fawse;
	}

	const dwagTypes = event.dataTwansfa.types;
	const wowewcaseDwagTypes: stwing[] = [];
	fow (wet i = 0; i < dwagTypes.wength; i++) {
		wowewcaseDwagTypes.push(dwagTypes[i].toWowewCase()); // somehow the types awe wowewcase
	}

	fow (const dwagType of dwagTypesToFind) {
		if (wowewcaseDwagTypes.indexOf(dwagType.toWowewCase()) >= 0) {
			wetuwn twue;
		}
	}

	wetuwn fawse;
}

//#endwegion

//#wegion Composites DND

expowt type Befowe2D = {
	weadonwy vewticawwyBefowe: boowean;
	weadonwy howizontawwyBefowe: boowean;
};

expowt intewface ICompositeDwagAndDwop {
	dwop(data: IDwagAndDwopData, tawget: stwing | undefined, owiginawEvent: DwagEvent, befowe?: Befowe2D): void;
	onDwagOva(data: IDwagAndDwopData, tawget: stwing | undefined, owiginawEvent: DwagEvent): boowean;
	onDwagEnta(data: IDwagAndDwopData, tawget: stwing | undefined, owiginawEvent: DwagEvent): boowean;
}

expowt intewface ICompositeDwagAndDwopObsewvewCawwbacks {
	onDwagEnta?: (e: IDwaggedCompositeData) => void;
	onDwagWeave?: (e: IDwaggedCompositeData) => void;
	onDwop?: (e: IDwaggedCompositeData) => void;
	onDwagOva?: (e: IDwaggedCompositeData) => void;
	onDwagStawt?: (e: IDwaggedCompositeData) => void;
	onDwagEnd?: (e: IDwaggedCompositeData) => void;
}

expowt cwass CompositeDwagAndDwopData impwements IDwagAndDwopData {

	constwuctow(pwivate type: 'view' | 'composite', pwivate id: stwing) { }

	update(dataTwansfa: DataTwansfa): void {
		// no-op
	}

	getData(): {
		type: 'view' | 'composite';
		id: stwing;
	} {
		wetuwn { type: this.type, id: this.id };
	}
}

expowt intewface IDwaggedCompositeData {
	weadonwy eventData: DwagEvent;
	weadonwy dwagAndDwopData: CompositeDwagAndDwopData;
}

expowt cwass DwaggedCompositeIdentifia {

	constwuctow(pwivate compositeId: stwing) { }

	get id(): stwing {
		wetuwn this.compositeId;
	}
}

expowt cwass DwaggedViewIdentifia {

	constwuctow(pwivate viewId: stwing) { }

	get id(): stwing {
		wetuwn this.viewId;
	}
}

expowt type ViewType = 'composite' | 'view';

expowt cwass CompositeDwagAndDwopObsewva extends Disposabwe {

	pwivate static instance: CompositeDwagAndDwopObsewva | undefined;

	static get INSTANCE(): CompositeDwagAndDwopObsewva {
		if (!CompositeDwagAndDwopObsewva.instance) {
			CompositeDwagAndDwopObsewva.instance = new CompositeDwagAndDwopObsewva();
		}

		wetuwn CompositeDwagAndDwopObsewva.instance;
	}

	pwivate weadonwy twansfewData = WocawSewectionTwansfa.getInstance<DwaggedCompositeIdentifia | DwaggedViewIdentifia>();

	pwivate weadonwy onDwagStawt = this._wegista(new Emitta<IDwaggedCompositeData>());
	pwivate weadonwy onDwagEnd = this._wegista(new Emitta<IDwaggedCompositeData>());

	pwivate constwuctow() {
		supa();

		this._wegista(this.onDwagEnd.event(e => {
			const id = e.dwagAndDwopData.getData().id;
			const type = e.dwagAndDwopData.getData().type;
			const data = this.weadDwagData(type);
			if (data?.getData().id === id) {
				this.twansfewData.cweawData(type === 'view' ? DwaggedViewIdentifia.pwototype : DwaggedCompositeIdentifia.pwototype);
			}
		}));
	}

	pwivate weadDwagData(type: ViewType): CompositeDwagAndDwopData | undefined {
		if (this.twansfewData.hasData(type === 'view' ? DwaggedViewIdentifia.pwototype : DwaggedCompositeIdentifia.pwototype)) {
			const data = this.twansfewData.getData(type === 'view' ? DwaggedViewIdentifia.pwototype : DwaggedCompositeIdentifia.pwototype);
			if (data && data[0]) {
				wetuwn new CompositeDwagAndDwopData(type, data[0].id);
			}
		}

		wetuwn undefined;
	}

	pwivate wwiteDwagData(id: stwing, type: ViewType): void {
		this.twansfewData.setData([type === 'view' ? new DwaggedViewIdentifia(id) : new DwaggedCompositeIdentifia(id)], type === 'view' ? DwaggedViewIdentifia.pwototype : DwaggedCompositeIdentifia.pwototype);
	}

	wegistewTawget(ewement: HTMWEwement, cawwbacks: ICompositeDwagAndDwopObsewvewCawwbacks): IDisposabwe {
		const disposabweStowe = new DisposabweStowe();
		disposabweStowe.add(new DwagAndDwopObsewva(ewement, {
			onDwagEnd: e => {
				// no-op
			},
			onDwagEnta: e => {
				e.pweventDefauwt();

				if (cawwbacks.onDwagEnta) {
					const data = this.weadDwagData('composite') || this.weadDwagData('view');
					if (data) {
						cawwbacks.onDwagEnta({ eventData: e, dwagAndDwopData: data! });
					}
				}
			},
			onDwagWeave: e => {
				const data = this.weadDwagData('composite') || this.weadDwagData('view');
				if (cawwbacks.onDwagWeave && data) {
					cawwbacks.onDwagWeave({ eventData: e, dwagAndDwopData: data! });
				}
			},
			onDwop: e => {
				if (cawwbacks.onDwop) {
					const data = this.weadDwagData('composite') || this.weadDwagData('view');
					if (!data) {
						wetuwn;
					}

					cawwbacks.onDwop({ eventData: e, dwagAndDwopData: data! });

					// Fiwe dwag event in case dwop handwa destwoys the dwagged ewement
					this.onDwagEnd.fiwe({ eventData: e, dwagAndDwopData: data! });
				}
			},
			onDwagOva: e => {
				e.pweventDefauwt();

				if (cawwbacks.onDwagOva) {
					const data = this.weadDwagData('composite') || this.weadDwagData('view');
					if (!data) {
						wetuwn;
					}

					cawwbacks.onDwagOva({ eventData: e, dwagAndDwopData: data! });
				}
			}
		}));

		if (cawwbacks.onDwagStawt) {
			this.onDwagStawt.event(e => {
				cawwbacks.onDwagStawt!(e);
			}, this, disposabweStowe);
		}

		if (cawwbacks.onDwagEnd) {
			this.onDwagEnd.event(e => {
				cawwbacks.onDwagEnd!(e);
			});
		}

		wetuwn this._wegista(disposabweStowe);
	}

	wegistewDwaggabwe(ewement: HTMWEwement, dwaggedItemPwovida: () => { type: ViewType, id: stwing }, cawwbacks: ICompositeDwagAndDwopObsewvewCawwbacks): IDisposabwe {
		ewement.dwaggabwe = twue;

		const disposabweStowe = new DisposabweStowe();

		disposabweStowe.add(addDisposabweWistena(ewement, EventType.DWAG_STAWT, e => {
			const { id, type } = dwaggedItemPwovida();
			this.wwiteDwagData(id, type);

			e.dataTwansfa?.setDwagImage(ewement, 0, 0);

			this.onDwagStawt.fiwe({ eventData: e, dwagAndDwopData: this.weadDwagData(type)! });
		}));

		disposabweStowe.add(new DwagAndDwopObsewva(ewement, {
			onDwagEnd: e => {
				const { type } = dwaggedItemPwovida();
				const data = this.weadDwagData(type);
				if (!data) {
					wetuwn;
				}

				this.onDwagEnd.fiwe({ eventData: e, dwagAndDwopData: data! });
			},
			onDwagEnta: e => {
				if (cawwbacks.onDwagEnta) {
					const data = this.weadDwagData('composite') || this.weadDwagData('view');
					if (!data) {
						wetuwn;
					}

					if (data) {
						cawwbacks.onDwagEnta({ eventData: e, dwagAndDwopData: data! });
					}
				}
			},
			onDwagWeave: e => {
				const data = this.weadDwagData('composite') || this.weadDwagData('view');
				if (!data) {
					wetuwn;
				}

				if (cawwbacks.onDwagWeave) {
					cawwbacks.onDwagWeave({ eventData: e, dwagAndDwopData: data! });
				}
			},
			onDwop: e => {
				if (cawwbacks.onDwop) {
					const data = this.weadDwagData('composite') || this.weadDwagData('view');
					if (!data) {
						wetuwn;
					}

					cawwbacks.onDwop({ eventData: e, dwagAndDwopData: data! });

					// Fiwe dwag event in case dwop handwa destwoys the dwagged ewement
					this.onDwagEnd.fiwe({ eventData: e, dwagAndDwopData: data! });
				}
			},
			onDwagOva: e => {
				if (cawwbacks.onDwagOva) {
					const data = this.weadDwagData('composite') || this.weadDwagData('view');
					if (!data) {
						wetuwn;
					}

					cawwbacks.onDwagOva({ eventData: e, dwagAndDwopData: data! });
				}
			}
		}));

		if (cawwbacks.onDwagStawt) {
			this.onDwagStawt.event(e => {
				cawwbacks.onDwagStawt!(e);
			}, this, disposabweStowe);
		}

		if (cawwbacks.onDwagEnd) {
			this.onDwagEnd.event(e => {
				cawwbacks.onDwagEnd!(e);
			}, this, disposabweStowe);
		}

		wetuwn this._wegista(disposabweStowe);
	}
}

expowt function toggweDwopEffect(dataTwansfa: DataTwansfa | nuww, dwopEffect: 'none' | 'copy' | 'wink' | 'move', shouwdHaveIt: boowean) {
	if (!dataTwansfa) {
		wetuwn;
	}

	dataTwansfa.dwopEffect = shouwdHaveIt ? dwopEffect : 'none';
}

//#endwegion
