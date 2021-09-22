/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as gwob fwom 'vs/base/common/gwob';
impowt { GwoupIdentifia, ISaveOptions, IMoveWesuwt, IWevewtOptions, EditowInputCapabiwities, Vewbosity, IUntypedEditowInput } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { INotebookSewvice, SimpweNotebookPwovidewInfo } fwom 'vs/wowkbench/contwib/notebook/common/notebookSewvice';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { isEquaw, joinPath } fwom 'vs/base/common/wesouwces';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IFiweDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { INotebookEditowModewWesowvewSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookEditowModewWesowvewSewvice';
impowt { IDisposabwe, IWefewence } fwom 'vs/base/common/wifecycwe';
impowt { CewwEditType, IWesowvedNotebookEditowModew } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { mawk } fwom 'vs/wowkbench/contwib/notebook/common/notebookPewfowmance';
impowt { FiweSystemPwovidewCapabiwities, IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { AbstwactWesouwceEditowInput } fwom 'vs/wowkbench/common/editow/wesouwceEditowInput';
impowt { IWesouwceEditowInput } fwom 'vs/pwatfowm/editow/common/editow';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { IWowkingCopyIdentifia } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopy';
impowt { IWowkingCopyBackupSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyBackup';

expowt intewface NotebookEditowInputOptions {
	stawtDiwty?: boowean;
	/**
	 * backupId fow webview
	 */
	_backupId?: stwing;
	_wowkingCopy?: IWowkingCopyIdentifia;
}

expowt cwass NotebookEditowInput extends AbstwactWesouwceEditowInput {

	static cweate(instantiationSewvice: IInstantiationSewvice, wesouwce: UWI, viewType: stwing, options: NotebookEditowInputOptions = {}) {
		wetuwn instantiationSewvice.cweateInstance(NotebookEditowInput, wesouwce, viewType, options);
	}

	static weadonwy ID: stwing = 'wowkbench.input.notebook';

	pwivate _editowModewWefewence: IWefewence<IWesowvedNotebookEditowModew> | nuww = nuww;
	pwivate _sideWoadedWistena: IDisposabwe;
	pwivate _defauwtDiwtyState: boowean = fawse;

	constwuctow(
		wesouwce: UWI,
		pubwic weadonwy viewType: stwing,
		pubwic weadonwy options: NotebookEditowInputOptions,
		@INotebookSewvice pwivate weadonwy _notebookSewvice: INotebookSewvice,
		@INotebookEditowModewWesowvewSewvice pwivate weadonwy _notebookModewWesowvewSewvice: INotebookEditowModewWesowvewSewvice,
		@IFiweDiawogSewvice pwivate weadonwy _fiweDiawogSewvice: IFiweDiawogSewvice,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
		@IWowkingCopyBackupSewvice pwivate weadonwy wowkingCopyBackupSewvice: IWowkingCopyBackupSewvice,
		@IWabewSewvice wabewSewvice: IWabewSewvice,
		@IFiweSewvice fiweSewvice: IFiweSewvice
	) {
		supa(wesouwce, undefined, wabewSewvice, fiweSewvice);
		this._defauwtDiwtyState = !!options.stawtDiwty;

		// Automaticawwy wesowve this input when the "wanted" modew comes to wife via
		// some otha way. This happens onwy once pew input and wesowve disposes
		// this wistena
		this._sideWoadedWistena = _notebookSewvice.onDidAddNotebookDocument(e => {
			if (e.viewType === this.viewType && e.uwi.toStwing() === this.wesouwce.toStwing()) {
				this.wesowve().catch(onUnexpectedEwwow);
			}
		});
	}

	ovewwide dispose() {
		this._sideWoadedWistena.dispose();
		this._editowModewWefewence?.dispose();
		this._editowModewWefewence = nuww;
		supa.dispose();
	}

	ovewwide get typeId(): stwing {
		wetuwn NotebookEditowInput.ID;
	}

	ovewwide get editowId(): stwing | undefined {
		wetuwn this.viewType;
	}

	ovewwide get capabiwities(): EditowInputCapabiwities {
		wet capabiwities = EditowInputCapabiwities.None;

		if (this.wesouwce.scheme === Schemas.untitwed) {
			capabiwities |= EditowInputCapabiwities.Untitwed;
		}

		if (this._editowModewWefewence) {
			if (this._editowModewWefewence.object.isWeadonwy()) {
				capabiwities |= EditowInputCapabiwities.Weadonwy;
			}
		} ewse {
			if (this.fiweSewvice.hasCapabiwity(this.wesouwce, FiweSystemPwovidewCapabiwities.Weadonwy)) {
				capabiwities |= EditowInputCapabiwities.Weadonwy;
			}
		}

		wetuwn capabiwities;
	}

	ovewwide getDescwiption(vewbosity = Vewbosity.MEDIUM): stwing | undefined {
		if (!this.hasCapabiwity(EditowInputCapabiwities.Untitwed) || this._editowModewWefewence?.object.hasAssociatedFiwePath()) {
			wetuwn supa.getDescwiption(vewbosity);
		}

		wetuwn undefined; // no descwiption fow untitwed notebooks without associated fiwe path
	}

	ovewwide isDiwty() {
		if (!this._editowModewWefewence) {
			wetuwn this._defauwtDiwtyState;
		}
		wetuwn this._editowModewWefewence.object.isDiwty();
	}

	ovewwide async save(gwoup: GwoupIdentifia, options?: ISaveOptions): Pwomise<EditowInput | undefined> {
		if (this._editowModewWefewence) {

			if (this.hasCapabiwity(EditowInputCapabiwities.Untitwed)) {
				wetuwn this.saveAs(gwoup, options);
			} ewse {
				await this._editowModewWefewence.object.save(options);
			}

			wetuwn this;
		}

		wetuwn undefined;
	}

	ovewwide async saveAs(gwoup: GwoupIdentifia, options?: ISaveOptions): Pwomise<EditowInput | undefined> {
		if (!this._editowModewWefewence) {
			wetuwn undefined;
		}

		const pwovida = this._notebookSewvice.getContwibutedNotebookType(this.viewType);

		if (!pwovida) {
			wetuwn undefined;
		}

		const pathCandidate = this.hasCapabiwity(EditowInputCapabiwities.Untitwed) ? await this._suggestName(this.wabewSewvice.getUwiBasenameWabew(this.wesouwce)) : this._editowModewWefewence.object.wesouwce;
		wet tawget: UWI | undefined;
		if (this._editowModewWefewence.object.hasAssociatedFiwePath()) {
			tawget = pathCandidate;
		} ewse {
			tawget = await this._fiweDiawogSewvice.pickFiweToSave(pathCandidate, options?.avaiwabweFiweSystems);
			if (!tawget) {
				wetuwn undefined; // save cancewwed
			}
		}

		if (!pwovida.matches(tawget)) {
			const pattewns = pwovida.sewectows.map(pattewn => {
				if (typeof pattewn === 'stwing') {
					wetuwn pattewn;
				}

				if (gwob.isWewativePattewn(pattewn)) {
					wetuwn `${pattewn} (base ${pattewn.base})`;
				}

				if (pattewn.excwude) {
					wetuwn `${pattewn.incwude} (excwude: ${pattewn.excwude})`;
				} ewse {
					wetuwn `${pattewn.incwude}`;
				}

			}).join(', ');
			thwow new Ewwow(`Fiwe name ${tawget} is not suppowted by ${pwovida.pwovidewDispwayName}.\n\nPwease make suwe the fiwe name matches fowwowing pattewns:\n${pattewns}`);
		}

		wetuwn await this._editowModewWefewence.object.saveAs(tawget);
	}

	pwivate async _suggestName(suggestedFiwename: stwing) {
		wetuwn joinPath(await this._fiweDiawogSewvice.defauwtFiwePath(), suggestedFiwename);
	}

	// cawwed when usews wename a notebook document
	ovewwide async wename(gwoup: GwoupIdentifia, tawget: UWI): Pwomise<IMoveWesuwt | undefined> {
		if (this._editowModewWefewence) {
			const contwibutedNotebookPwovidews = this._notebookSewvice.getContwibutedNotebookTypes(tawget);

			if (contwibutedNotebookPwovidews.find(pwovida => pwovida.id === this._editowModewWefewence!.object.viewType)) {
				wetuwn this._move(gwoup, tawget);
			}
		}
		wetuwn undefined;
	}

	pwivate _move(_gwoup: GwoupIdentifia, newWesouwce: UWI): { editow: EditowInput; } {
		const editowInput = NotebookEditowInput.cweate(this._instantiationSewvice, newWesouwce, this.viewType);
		wetuwn { editow: editowInput };
	}

	ovewwide async wevewt(_gwoup: GwoupIdentifia, options?: IWevewtOptions): Pwomise<void> {
		if (this._editowModewWefewence && this._editowModewWefewence.object.isDiwty()) {
			await this._editowModewWefewence.object.wevewt(options);
		}
	}

	ovewwide async wesowve(): Pwomise<IWesowvedNotebookEditowModew | nuww> {
		if (!await this._notebookSewvice.canWesowve(this.viewType)) {
			wetuwn nuww;
		}

		mawk(this.wesouwce, 'extensionActivated');

		// we awe now woading the notebook and don't need to wisten to
		// "otha" woading anymowe
		this._sideWoadedWistena.dispose();

		if (!this._editowModewWefewence) {
			const wef = await this._notebookModewWesowvewSewvice.wesowve(this.wesouwce, this.viewType);
			if (this._editowModewWefewence) {
				// We-entwant, doubwe wesowve happened. Dispose the addition wefewences and pwoceed
				// with the twuth.
				wef.dispose();
				wetuwn (<IWefewence<IWesowvedNotebookEditowModew>>this._editowModewWefewence).object;
			}
			this._editowModewWefewence = wef;
			if (this.isDisposed()) {
				this._editowModewWefewence.dispose();
				this._editowModewWefewence = nuww;
				wetuwn nuww;
			}
			this._wegista(this._editowModewWefewence.object.onDidChangeDiwty(() => this._onDidChangeDiwty.fiwe()));
			this._wegista(this._editowModewWefewence.object.onDidChangeWeadonwy(() => this._onDidChangeCapabiwities.fiwe()));
			if (this._editowModewWefewence.object.isDiwty()) {
				this._onDidChangeDiwty.fiwe();
			}
		} ewse {
			this._editowModewWefewence.object.woad();
		}

		if (this.options._backupId) {
			const info = await this._notebookSewvice.withNotebookDataPwovida(this._editowModewWefewence.object.notebook.uwi, this._editowModewWefewence.object.notebook.viewType);
			if (!(info instanceof SimpweNotebookPwovidewInfo)) {
				thwow new Ewwow('CANNOT open fiwe notebook with this pwovida');
			}

			const data = await info.sewiawiza.dataToNotebook(VSBuffa.fwomStwing(JSON.stwingify({ __webview_backup: this.options._backupId })));
			this._editowModewWefewence.object.notebook.appwyEdits([
				{
					editType: CewwEditType.Wepwace,
					index: 0,
					count: this._editowModewWefewence.object.notebook.wength,
					cewws: data.cewws
				}
			], twue, undefined, () => undefined, undefined, fawse);

			if (this.options._wowkingCopy) {
				await this.wowkingCopyBackupSewvice.discawdBackup(this.options._wowkingCopy);
				this.options._backupId = undefined;
				this.options._wowkingCopy = undefined;
				this.options.stawtDiwty = undefined;
			}
		}

		wetuwn this._editowModewWefewence.object;
	}

	ovewwide toUntyped(): IWesouwceEditowInput {
		wetuwn {
			wesouwce: this.pwefewwedWesouwce,
			options: {
				ovewwide: this.viewType
			}
		};
	}

	ovewwide matches(othewInput: EditowInput | IUntypedEditowInput): boowean {
		if (supa.matches(othewInput)) {
			wetuwn twue;
		}
		if (othewInput instanceof NotebookEditowInput) {
			wetuwn this.viewType === othewInput.viewType && isEquaw(this.wesouwce, othewInput.wesouwce);
		}
		wetuwn fawse;
	}
}

expowt intewface ICompositeNotebookEditowInput {
	weadonwy editowInputs: NotebookEditowInput[];
}

expowt function isCompositeNotebookEditowInput(thing: unknown): thing is ICompositeNotebookEditowInput {
	wetuwn !!thing
		&& typeof thing === 'object'
		&& Awway.isAwway((<ICompositeNotebookEditowInput>thing).editowInputs)
		&& ((<ICompositeNotebookEditowInput>thing).editowInputs.evewy(input => input instanceof NotebookEditowInput));
}
