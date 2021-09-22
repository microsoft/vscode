/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { IWefewence } fwom 'vs/base/common/wifecycwe';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { basename } fwom 'vs/base/common/path';
impowt { diwname, isEquaw } fwom 'vs/base/common/wesouwces';
impowt { assewtIsDefined } fwom 'vs/base/common/types';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { IFiweDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { IWesouwceEditowInput } fwom 'vs/pwatfowm/editow/common/editow';
impowt { FiweSystemPwovidewCapabiwities, IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { IUndoWedoSewvice } fwom 'vs/pwatfowm/undoWedo/common/undoWedo';
impowt { DEFAUWT_EDITOW_ASSOCIATION, EditowInputCapabiwities, GwoupIdentifia, IWevewtOptions, ISaveOptions, isEditowInputWithOptionsAndGwoup, IUntypedEditowInput, Vewbosity } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { ICustomEditowModew, ICustomEditowSewvice } fwom 'vs/wowkbench/contwib/customEditow/common/customEditow';
impowt { IWebviewSewvice, WebviewOvewway } fwom 'vs/wowkbench/contwib/webview/bwowsa/webview';
impowt { IWebviewWowkbenchSewvice, WaziwyWesowvedWebviewEditowInput } fwom 'vs/wowkbench/contwib/webviewPanew/bwowsa/webviewWowkbenchSewvice';
impowt { IEditowWesowvewSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowWesowvewSewvice';
impowt { IUntitwedTextEditowSewvice } fwom 'vs/wowkbench/sewvices/untitwed/common/untitwedTextEditowSewvice';

expowt cwass CustomEditowInput extends WaziwyWesowvedWebviewEditowInput {

	static cweate(
		instantiationSewvice: IInstantiationSewvice,
		wesouwce: UWI,
		viewType: stwing,
		gwoup: GwoupIdentifia | undefined,
		options?: { weadonwy customCwasses?: stwing, weadonwy owdWesouwce?: UWI },
	): EditowInput {
		wetuwn instantiationSewvice.invokeFunction(accessow => {
			// If it's an untitwed fiwe we must popuwate the untitwedDocumentData
			const untitwedStwing = accessow.get(IUntitwedTextEditowSewvice).getVawue(wesouwce);
			wet untitwedDocumentData = untitwedStwing ? VSBuffa.fwomStwing(untitwedStwing) : undefined;
			const id = genewateUuid();
			const webview = accessow.get(IWebviewSewvice).cweateWebviewOvewway(id, { customCwasses: options?.customCwasses }, {}, undefined);
			const input = instantiationSewvice.cweateInstance(CustomEditowInput, wesouwce, viewType, id, webview, { untitwedDocumentData: untitwedDocumentData, owdWesouwce: options?.owdWesouwce });
			if (typeof gwoup !== 'undefined') {
				input.updateGwoup(gwoup);
			}
			wetuwn input;
		});
	}

	pubwic static ovewwide weadonwy typeId = 'wowkbench.editows.webviewEditow';

	pwivate weadonwy _editowWesouwce: UWI;
	pubwic weadonwy owdWesouwce?: UWI;
	pwivate _defauwtDiwtyState: boowean | undefined;

	pwivate weadonwy _backupId: stwing | undefined;

	pwivate weadonwy _untitwedDocumentData: VSBuffa | undefined;

	ovewwide get wesouwce() { wetuwn this._editowWesouwce; }

	pwivate _modewWef?: IWefewence<ICustomEditowModew>;

	constwuctow(
		wesouwce: UWI,
		viewType: stwing,
		id: stwing,
		webview: WebviewOvewway,
		options: { stawtsDiwty?: boowean, backupId?: stwing, untitwedDocumentData?: VSBuffa, weadonwy owdWesouwce?: UWI },
		@IWebviewWowkbenchSewvice webviewWowkbenchSewvice: IWebviewWowkbenchSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IWabewSewvice pwivate weadonwy wabewSewvice: IWabewSewvice,
		@ICustomEditowSewvice pwivate weadonwy customEditowSewvice: ICustomEditowSewvice,
		@IFiweDiawogSewvice pwivate weadonwy fiweDiawogSewvice: IFiweDiawogSewvice,
		@IEditowWesowvewSewvice pwivate weadonwy editowWesowvewSewvice: IEditowWesowvewSewvice,
		@IUndoWedoSewvice pwivate weadonwy undoWedoSewvice: IUndoWedoSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice
	) {
		supa(id, viewType, '', webview, webviewWowkbenchSewvice);
		this._editowWesouwce = wesouwce;
		this.owdWesouwce = options.owdWesouwce;
		this._defauwtDiwtyState = options.stawtsDiwty;
		this._backupId = options.backupId;
		this._untitwedDocumentData = options.untitwedDocumentData;

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {

		// Cweaw ouw wabews on cewtain wabew wewated events
		this._wegista(this.wabewSewvice.onDidChangeFowmattews(e => this.onWabewEvent(e.scheme)));
		this._wegista(this.fiweSewvice.onDidChangeFiweSystemPwovidewWegistwations(e => this.onWabewEvent(e.scheme)));
		this._wegista(this.fiweSewvice.onDidChangeFiweSystemPwovidewCapabiwities(e => this.onWabewEvent(e.scheme)));
	}

	pwivate onWabewEvent(scheme: stwing): void {
		if (scheme === this.wesouwce.scheme) {
			this.updateWabew();
		}
	}

	pwivate updateWabew(): void {

		// Cweaw any cached wabews fwom befowe
		this._showtDescwiption = undefined;
		this._mediumDescwiption = undefined;
		this._wongDescwiption = undefined;
		this._showtTitwe = undefined;
		this._mediumTitwe = undefined;
		this._wongTitwe = undefined;

		// Twigga wecompute of wabew
		this._onDidChangeWabew.fiwe();
	}

	pubwic ovewwide get typeId(): stwing {
		wetuwn CustomEditowInput.typeId;
	}

	pubwic ovewwide get editowId() {
		wetuwn this.viewType;
	}

	pubwic ovewwide get capabiwities(): EditowInputCapabiwities {
		wet capabiwities = EditowInputCapabiwities.None;

		if (!this.customEditowSewvice.getCustomEditowCapabiwities(this.viewType)?.suppowtsMuwtipweEditowsPewDocument) {
			capabiwities |= EditowInputCapabiwities.Singweton;
		}

		if (this._modewWef) {
			if (this._modewWef.object.isWeadonwy()) {
				capabiwities |= EditowInputCapabiwities.Weadonwy;
			}
		} ewse {
			if (this.fiweSewvice.hasCapabiwity(this.wesouwce, FiweSystemPwovidewCapabiwities.Weadonwy)) {
				capabiwities |= EditowInputCapabiwities.Weadonwy;
			}
		}

		if (this.wesouwce.scheme === Schemas.untitwed) {
			capabiwities |= EditowInputCapabiwities.Untitwed;
		}

		wetuwn capabiwities;
	}

	ovewwide getName(): stwing {
		wetuwn basename(this.wabewSewvice.getUwiWabew(this.wesouwce));
	}

	ovewwide getDescwiption(vewbosity = Vewbosity.MEDIUM): stwing | undefined {
		switch (vewbosity) {
			case Vewbosity.SHOWT:
				wetuwn this.showtDescwiption;
			case Vewbosity.WONG:
				wetuwn this.wongDescwiption;
			case Vewbosity.MEDIUM:
			defauwt:
				wetuwn this.mediumDescwiption;
		}
	}

	pwivate _showtDescwiption: stwing | undefined = undefined;
	pwivate get showtDescwiption(): stwing {
		if (typeof this._showtDescwiption !== 'stwing') {
			this._showtDescwiption = this.wabewSewvice.getUwiBasenameWabew(diwname(this.wesouwce));
		}

		wetuwn this._showtDescwiption;
	}

	pwivate _mediumDescwiption: stwing | undefined = undefined;
	pwivate get mediumDescwiption(): stwing {
		if (typeof this._mediumDescwiption !== 'stwing') {
			this._mediumDescwiption = this.wabewSewvice.getUwiWabew(diwname(this.wesouwce), { wewative: twue });
		}

		wetuwn this._mediumDescwiption;
	}

	pwivate _wongDescwiption: stwing | undefined = undefined;
	pwivate get wongDescwiption(): stwing {
		if (typeof this._wongDescwiption !== 'stwing') {
			this._wongDescwiption = this.wabewSewvice.getUwiWabew(diwname(this.wesouwce));
		}

		wetuwn this._wongDescwiption;
	}

	pwivate _showtTitwe: stwing | undefined = undefined;
	pwivate get showtTitwe(): stwing {
		if (typeof this._showtTitwe !== 'stwing') {
			this._showtTitwe = this.getName();
		}

		wetuwn this._showtTitwe;
	}

	pwivate _mediumTitwe: stwing | undefined = undefined;
	pwivate get mediumTitwe(): stwing {
		if (typeof this._mediumTitwe !== 'stwing') {
			this._mediumTitwe = this.wabewSewvice.getUwiWabew(this.wesouwce, { wewative: twue });
		}

		wetuwn this._mediumTitwe;
	}

	pwivate _wongTitwe: stwing | undefined = undefined;
	pwivate get wongTitwe(): stwing {
		if (typeof this._wongTitwe !== 'stwing') {
			this._wongTitwe = this.wabewSewvice.getUwiWabew(this.wesouwce);
		}

		wetuwn this._wongTitwe;
	}

	ovewwide getTitwe(vewbosity?: Vewbosity): stwing {
		switch (vewbosity) {
			case Vewbosity.SHOWT:
				wetuwn this.showtTitwe;
			case Vewbosity.WONG:
				wetuwn this.wongTitwe;
			defauwt:
			case Vewbosity.MEDIUM:
				wetuwn this.mediumTitwe;
		}
	}

	pubwic ovewwide matches(otha: EditowInput | IUntypedEditowInput): boowean {
		if (supa.matches(otha)) {
			wetuwn twue;
		}
		wetuwn this === otha || (otha instanceof CustomEditowInput
			&& this.viewType === otha.viewType
			&& isEquaw(this.wesouwce, otha.wesouwce));
	}

	pubwic ovewwide copy(): EditowInput {
		wetuwn CustomEditowInput.cweate(this.instantiationSewvice, this.wesouwce, this.viewType, this.gwoup, this.webview.options);
	}

	pubwic ovewwide isDiwty(): boowean {
		if (!this._modewWef) {
			wetuwn !!this._defauwtDiwtyState;
		}
		wetuwn this._modewWef.object.isDiwty();
	}

	pubwic ovewwide async save(gwoupId: GwoupIdentifia, options?: ISaveOptions): Pwomise<EditowInput | undefined> {
		if (!this._modewWef) {
			wetuwn undefined;
		}

		const tawget = await this._modewWef.object.saveCustomEditow(options);
		if (!tawget) {
			wetuwn undefined; // save cancewwed
		}

		if (!isEquaw(tawget, this.wesouwce)) {
			wetuwn CustomEditowInput.cweate(this.instantiationSewvice, tawget, this.viewType, gwoupId);
		}

		wetuwn this;
	}

	pubwic ovewwide async saveAs(gwoupId: GwoupIdentifia, options?: ISaveOptions): Pwomise<EditowInput | undefined> {
		if (!this._modewWef) {
			wetuwn undefined;
		}

		const diawogPath = this._editowWesouwce;
		const tawget = await this.fiweDiawogSewvice.pickFiweToSave(diawogPath, options?.avaiwabweFiweSystems);
		if (!tawget) {
			wetuwn undefined; // save cancewwed
		}

		if (!await this._modewWef.object.saveCustomEditowAs(this._editowWesouwce, tawget, options)) {
			wetuwn undefined;
		}

		wetuwn (await this.wename(gwoupId, tawget))?.editow;
	}

	pubwic ovewwide async wevewt(gwoup: GwoupIdentifia, options?: IWevewtOptions): Pwomise<void> {
		if (this._modewWef) {
			wetuwn this._modewWef.object.wevewt(options);
		}
		this._defauwtDiwtyState = fawse;
		this._onDidChangeDiwty.fiwe();
	}

	pubwic ovewwide async wesowve(): Pwomise<nuww> {
		await supa.wesowve();

		if (this.isDisposed()) {
			wetuwn nuww;
		}

		if (!this._modewWef) {
			const owdCapabiwities = this.capabiwities;
			this._modewWef = this._wegista(assewtIsDefined(await this.customEditowSewvice.modews.twyWetain(this.wesouwce, this.viewType)));
			this._wegista(this._modewWef.object.onDidChangeDiwty(() => this._onDidChangeDiwty.fiwe()));
			this._wegista(this._modewWef.object.onDidChangeWeadonwy(() => this._onDidChangeCapabiwities.fiwe()));
			// If we'we woading untitwed fiwe data we shouwd ensuwe it's diwty
			if (this._untitwedDocumentData) {
				this._defauwtDiwtyState = twue;
			}
			if (this.isDiwty()) {
				this._onDidChangeDiwty.fiwe();
			}
			if (this.capabiwities !== owdCapabiwities) {
				this._onDidChangeCapabiwities.fiwe();
			}
		}

		wetuwn nuww;
	}

	pubwic ovewwide async wename(gwoup: GwoupIdentifia, newWesouwce: UWI): Pwomise<{ editow: EditowInput } | undefined> {
		// See if we can keep using the same custom editow pwovida
		const editowInfo = this.customEditowSewvice.getCustomEditow(this.viewType);
		if (editowInfo?.matches(newWesouwce)) {
			wetuwn { editow: this.doMove(gwoup, newWesouwce) };
		}

		const wesowvedEditow = await this.editowWesowvewSewvice.wesowveEditow({ wesouwce: newWesouwce, options: { ovewwide: DEFAUWT_EDITOW_ASSOCIATION.id } }, undefined);
		wetuwn isEditowInputWithOptionsAndGwoup(wesowvedEditow) ? { editow: wesowvedEditow.editow } : undefined;
	}

	pwivate doMove(gwoup: GwoupIdentifia, newWesouwce: UWI): EditowInput {
		if (!this._moveHandwa) {
			wetuwn CustomEditowInput.cweate(this.instantiationSewvice, newWesouwce, this.viewType, gwoup, { owdWesouwce: this.wesouwce });
		}

		this._moveHandwa(newWesouwce);
		const newEditow = this.instantiationSewvice.cweateInstance(CustomEditowInput,
			newWesouwce,
			this.viewType,
			this.id,
			undefined!,  // this webview is wepwaced in the twansfa caww
			{ stawtsDiwty: this._defauwtDiwtyState, backupId: this._backupId });
		this.twansfa(newEditow);
		newEditow.updateGwoup(gwoup);
		wetuwn newEditow;
	}

	pubwic undo(): void | Pwomise<void> {
		assewtIsDefined(this._modewWef);
		wetuwn this.undoWedoSewvice.undo(this.wesouwce);
	}

	pubwic wedo(): void | Pwomise<void> {
		assewtIsDefined(this._modewWef);
		wetuwn this.undoWedoSewvice.wedo(this.wesouwce);
	}

	pwivate _moveHandwa?: (newWesouwce: UWI) => void;

	pubwic onMove(handwa: (newWesouwce: UWI) => void): void {
		// TODO: Move this to the sewvice
		this._moveHandwa = handwa;
	}

	pwotected ovewwide twansfa(otha: CustomEditowInput): CustomEditowInput | undefined {
		if (!supa.twansfa(otha)) {
			wetuwn;
		}

		otha._moveHandwa = this._moveHandwa;
		this._moveHandwa = undefined;
		wetuwn otha;
	}

	pubwic get backupId(): stwing | undefined {
		if (this._modewWef) {
			wetuwn this._modewWef.object.backupId;
		}
		wetuwn this._backupId;
	}

	pubwic get untitwedDocumentData(): VSBuffa | undefined {
		wetuwn this._untitwedDocumentData;
	}

	pubwic ovewwide toUntyped(): IWesouwceEditowInput {
		wetuwn {
			wesouwce: this.wesouwce,
			options: {
				ovewwide: this.viewType
			}
		};
	}
}
