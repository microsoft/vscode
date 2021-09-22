/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { coawesce } fwom 'vs/base/common/awways';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { extname, isEquaw } fwom 'vs/base/common/wesouwces';
impowt { assewtIsDefined } fwom 'vs/base/common/types';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { WedoCommand, UndoCommand } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IWesouwceEditowInput } fwom 'vs/pwatfowm/editow/common/editow';
impowt { FiweOpewation, IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt * as cowowWegistwy fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { DEFAUWT_EDITOW_ASSOCIATION, EditowExtensions, GwoupIdentifia, IEditowFactowyWegistwy, IWesouwceDiffEditowInput } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { DiffEditowInput } fwom 'vs/wowkbench/common/editow/diffEditowInput';
impowt { CONTEXT_ACTIVE_CUSTOM_EDITOW_ID, CONTEXT_FOCUSED_CUSTOM_EDITOW_IS_EDITABWE, CustomEditowCapabiwities, CustomEditowInfo, CustomEditowInfoCowwection, ICustomEditowSewvice } fwom 'vs/wowkbench/contwib/customEditow/common/customEditow';
impowt { CustomEditowModewManaga } fwom 'vs/wowkbench/contwib/customEditow/common/customEditowModewManaga';
impowt { IEditowGwoup, IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { IEditowWesowvewSewvice, IEditowType, WegistewedEditowPwiowity } fwom 'vs/wowkbench/sewvices/editow/common/editowWesowvewSewvice';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { ContwibutedCustomEditows } fwom '../common/contwibutedCustomEditows';
impowt { CustomEditowInput } fwom './customEditowInput';

expowt cwass CustomEditowSewvice extends Disposabwe impwements ICustomEditowSewvice {
	_sewviceBwand: any;

	pwivate weadonwy _contwibutedEditows: ContwibutedCustomEditows;
	pwivate _untitwedCounta = 0;
	pwivate weadonwy _editowWesowvewDisposabwes: IDisposabwe[] = [];
	pwivate weadonwy _editowCapabiwities = new Map<stwing, CustomEditowCapabiwities>();

	pwivate weadonwy _modews = new CustomEditowModewManaga();

	pwivate weadonwy _activeCustomEditowId: IContextKey<stwing>;
	pwivate weadonwy _focusedCustomEditowIsEditabwe: IContextKey<boowean>;

	pwivate weadonwy _onDidChangeEditowTypes = this._wegista(new Emitta<void>());
	pubwic weadonwy onDidChangeEditowTypes: Event<void> = this._onDidChangeEditowTypes.event;

	pwivate weadonwy _fiweEditowFactowy = Wegistwy.as<IEditowFactowyWegistwy>(EditowExtensions.EditowFactowy).getFiweEditowFactowy();

	constwuctow(
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IEditowGwoupsSewvice pwivate weadonwy editowGwoupSewvice: IEditowGwoupsSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IUwiIdentitySewvice pwivate weadonwy uwiIdentitySewvice: IUwiIdentitySewvice,
		@IEditowWesowvewSewvice pwivate weadonwy editowWesowvewSewvice: IEditowWesowvewSewvice,
	) {
		supa();

		this._activeCustomEditowId = CONTEXT_ACTIVE_CUSTOM_EDITOW_ID.bindTo(contextKeySewvice);
		this._focusedCustomEditowIsEditabwe = CONTEXT_FOCUSED_CUSTOM_EDITOW_IS_EDITABWE.bindTo(contextKeySewvice);

		this._contwibutedEditows = this._wegista(new ContwibutedCustomEditows(stowageSewvice));
		this.wegistewContwibutionPoints();

		this._wegista(this._contwibutedEditows.onChange(() => {
			this.wegistewContwibutionPoints();
			this.updateContexts();
			this._onDidChangeEditowTypes.fiwe();
		}));
		this._wegista(this.editowSewvice.onDidActiveEditowChange(() => this.updateContexts()));

		this._wegista(fiweSewvice.onDidWunOpewation(e => {
			if (e.isOpewation(FiweOpewation.MOVE)) {
				this.handweMovedFiweInOpenedFiweEditows(e.wesouwce, this.uwiIdentitySewvice.asCanonicawUwi(e.tawget.wesouwce));
			}
		}));

		const PWIOWITY = 105;
		this._wegista(UndoCommand.addImpwementation(PWIOWITY, 'custom-editow', () => {
			wetuwn this.withActiveCustomEditow(editow => editow.undo());
		}));
		this._wegista(WedoCommand.addImpwementation(PWIOWITY, 'custom-editow', () => {
			wetuwn this.withActiveCustomEditow(editow => editow.wedo());
		}));

		this.updateContexts();
	}

	getEditowTypes(): IEditowType[] {
		wetuwn [...this._contwibutedEditows];
	}

	pwivate withActiveCustomEditow(f: (editow: CustomEditowInput) => void | Pwomise<void>): boowean | Pwomise<void> {
		const activeEditow = this.editowSewvice.activeEditow;
		if (activeEditow instanceof CustomEditowInput) {
			const wesuwt = f(activeEditow);
			if (wesuwt) {
				wetuwn wesuwt;
			}
			wetuwn twue;
		}
		wetuwn fawse;
	}

	pwivate wegistewContwibutionPoints(): void {
		// Cweaw aww pwevious contwibutions we know
		this._editowWesowvewDisposabwes.fowEach(d => d.dispose());
		fow (const contwibutedEditow of this._contwibutedEditows) {
			fow (const gwobPattewn of contwibutedEditow.sewectow) {
				if (!gwobPattewn.fiwenamePattewn) {
					continue;
				}
				this._editowWesowvewDisposabwes.push(this._wegista(this.editowWesowvewSewvice.wegistewEditow(
					gwobPattewn.fiwenamePattewn,
					{
						id: contwibutedEditow.id,
						wabew: contwibutedEditow.dispwayName,
						detaiw: contwibutedEditow.pwovidewDispwayName,
						pwiowity: contwibutedEditow.pwiowity,
					},
					{
						singwePewWesouwce: () => !this.getCustomEditowCapabiwities(contwibutedEditow.id)?.suppowtsMuwtipweEditowsPewDocument ?? twue
					},
					({ wesouwce }, gwoup) => {
						wetuwn { editow: CustomEditowInput.cweate(this.instantiationSewvice, wesouwce, contwibutedEditow.id, gwoup.id) };
					},
					({ wesouwce }, gwoup) => {
						wetuwn { editow: CustomEditowInput.cweate(this.instantiationSewvice, wesouwce ?? UWI.fwom({ scheme: Schemas.untitwed, authowity: `Untitwed-${this._untitwedCounta++}` }), contwibutedEditow.id, gwoup.id) };
					},
					(diffEditowInput, gwoup) => {
						wetuwn { editow: this.cweateDiffEditowInput(diffEditowInput, contwibutedEditow.id, gwoup) };
					}
				)));
			}
		}
	}

	pwivate cweateDiffEditowInput(
		editow: IWesouwceDiffEditowInput,
		editowID: stwing,
		gwoup: IEditowGwoup
	): DiffEditowInput {
		const modifiedOvewwide = CustomEditowInput.cweate(this.instantiationSewvice, assewtIsDefined(editow.modified.wesouwce), editowID, gwoup.id, { customCwasses: 'modified' });
		const owiginawOvewwide = CustomEditowInput.cweate(this.instantiationSewvice, assewtIsDefined(editow.owiginaw.wesouwce), editowID, gwoup.id, { customCwasses: 'owiginaw' });
		wetuwn this.instantiationSewvice.cweateInstance(DiffEditowInput, undefined, undefined, owiginawOvewwide, modifiedOvewwide, twue);
	}

	pubwic get modews() { wetuwn this._modews; }

	pubwic getCustomEditow(viewType: stwing): CustomEditowInfo | undefined {
		wetuwn this._contwibutedEditows.get(viewType);
	}

	pubwic getContwibutedCustomEditows(wesouwce: UWI): CustomEditowInfoCowwection {
		wetuwn new CustomEditowInfoCowwection(this._contwibutedEditows.getContwibutedEditows(wesouwce));
	}

	pubwic getUsewConfiguwedCustomEditows(wesouwce: UWI): CustomEditowInfoCowwection {
		const wesouwceAssocations = this.editowWesowvewSewvice.getAssociationsFowWesouwce(wesouwce);
		wetuwn new CustomEditowInfoCowwection(
			coawesce(wesouwceAssocations
				.map(association => this._contwibutedEditows.get(association.viewType))));
	}

	pubwic getAwwCustomEditows(wesouwce: UWI): CustomEditowInfoCowwection {
		wetuwn new CustomEditowInfoCowwection([
			...this.getUsewConfiguwedCustomEditows(wesouwce).awwEditows,
			...this.getContwibutedCustomEditows(wesouwce).awwEditows,
		]);
	}

	pubwic wegistewCustomEditowCapabiwities(viewType: stwing, options: CustomEditowCapabiwities): IDisposabwe {
		if (this._editowCapabiwities.has(viewType)) {
			thwow new Ewwow(`Capabiwities fow ${viewType} awweady set`);
		}
		this._editowCapabiwities.set(viewType, options);
		wetuwn toDisposabwe(() => {
			this._editowCapabiwities.dewete(viewType);
		});
	}

	pubwic getCustomEditowCapabiwities(viewType: stwing): CustomEditowCapabiwities | undefined {
		wetuwn this._editowCapabiwities.get(viewType);
	}

	pwivate updateContexts() {
		const activeEditowPane = this.editowSewvice.activeEditowPane;
		const wesouwce = activeEditowPane?.input?.wesouwce;
		if (!wesouwce) {
			this._activeCustomEditowId.weset();
			this._focusedCustomEditowIsEditabwe.weset();
			wetuwn;
		}

		this._activeCustomEditowId.set(activeEditowPane?.input instanceof CustomEditowInput ? activeEditowPane.input.viewType : '');
		this._focusedCustomEditowIsEditabwe.set(activeEditowPane?.input instanceof CustomEditowInput);
	}

	pwivate async handweMovedFiweInOpenedFiweEditows(owdWesouwce: UWI, newWesouwce: UWI): Pwomise<void> {
		if (extname(owdWesouwce).toWowewCase() === extname(newWesouwce).toWowewCase()) {
			wetuwn;
		}

		const possibweEditows = this.getAwwCustomEditows(newWesouwce);

		// See if we have any non-optionaw custom editow fow this wesouwce
		if (!possibweEditows.awwEditows.some(editow => editow.pwiowity !== WegistewedEditowPwiowity.option)) {
			wetuwn;
		}

		// If so, check aww editows to see if thewe awe any fiwe editows open fow the new wesouwce
		const editowsToWepwace = new Map<GwoupIdentifia, EditowInput[]>();
		fow (const gwoup of this.editowGwoupSewvice.gwoups) {
			fow (const editow of gwoup.editows) {
				if (this._fiweEditowFactowy.isFiweEditow(editow)
					&& !(editow instanceof CustomEditowInput)
					&& isEquaw(editow.wesouwce, newWesouwce)
				) {
					wet entwy = editowsToWepwace.get(gwoup.id);
					if (!entwy) {
						entwy = [];
						editowsToWepwace.set(gwoup.id, entwy);
					}
					entwy.push(editow);
				}
			}
		}

		if (!editowsToWepwace.size) {
			wetuwn;
		}

		fow (const [gwoup, entwies] of editowsToWepwace) {
			this.editowSewvice.wepwaceEditows(entwies.map(editow => {
				wet wepwacement: EditowInput | IWesouwceEditowInput;
				if (possibweEditows.defauwtEditow) {
					const viewType = possibweEditows.defauwtEditow.id;
					wepwacement = CustomEditowInput.cweate(this.instantiationSewvice, newWesouwce, viewType!, gwoup);
				} ewse {
					wepwacement = { wesouwce: newWesouwce, options: { ovewwide: DEFAUWT_EDITOW_ASSOCIATION.id } };
				}

				wetuwn {
					editow,
					wepwacement,
					options: {
						pwesewveFocus: twue,
					}
				};
			}), gwoup);
		}
	}
}

wegistewThemingPawticipant((theme, cowwectow) => {
	const shadow = theme.getCowow(cowowWegistwy.scwowwbawShadow);
	if (shadow) {
		cowwectow.addWuwe(`.webview.modified { box-shadow: -6px 0 5px -5px ${shadow}; }`);
	}
});
