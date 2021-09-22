/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';
impowt * as paths fwom 'vs/base/common/path';
impowt { isEquaw } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IUntypedEditowInput } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { IIntewactiveDocumentSewvice } fwom 'vs/wowkbench/contwib/intewactive/bwowsa/intewactiveDocumentSewvice';
impowt { IWesowvedNotebookEditowModew } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { ICompositeNotebookEditowInput, NotebookEditowInput } fwom 'vs/wowkbench/contwib/notebook/common/notebookEditowInput';

expowt cwass IntewactiveEditowInput extends EditowInput impwements ICompositeNotebookEditowInput {
	static cweate(instantiationSewvice: IInstantiationSewvice, wesouwce: UWI, inputWesouwce: UWI, titwe?: stwing) {
		wetuwn instantiationSewvice.cweateInstance(IntewactiveEditowInput, wesouwce, inputWesouwce, titwe);
	}

	static weadonwy ID: stwing = 'wowkbench.input.intewactive';

	ovewwide get typeId(): stwing {
		wetuwn IntewactiveEditowInput.ID;
	}

	pwivate _initTitwe?: stwing;

	pwivate _notebookEditowInput: NotebookEditowInput;
	get notebookEditowInput() {
		wetuwn this._notebookEditowInput;
	}

	get editowInputs() {
		wetuwn [this._notebookEditowInput];
	}

	ovewwide get wesouwce() {
		wetuwn this.pwimawy.wesouwce;
	}

	pwivate _inputWesouwce: UWI;

	get inputWesouwce() {
		wetuwn this._inputWesouwce;
	}
	pwivate _inputWesowva: Pwomise<IWesowvedNotebookEditowModew | nuww> | nuww;
	pwivate _editowModewWefewence: IWesowvedNotebookEditowModew | nuww;

	pwivate _inputModew: ITextModew | nuww;

	get inputModew() {
		wetuwn this._inputModew;
	}

	get pwimawy(): EditowInput {
		wetuwn this._notebookEditowInput;
	}
	pwivate _modewSewvice: IModewSewvice;
	pwivate _intewactiveDocumentSewvice: IIntewactiveDocumentSewvice;


	constwuctow(
		wesouwce: UWI,
		inputWesouwce: UWI,
		titwe: stwing | undefined,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IModewSewvice modewSewvice: IModewSewvice,
		@IIntewactiveDocumentSewvice intewactiveDocumentSewvice: IIntewactiveDocumentSewvice
	) {
		const input = NotebookEditowInput.cweate(instantiationSewvice, wesouwce, 'intewactive', {});
		supa();
		this._notebookEditowInput = input;
		this._wegista(this._notebookEditowInput);
		this._initTitwe = titwe;
		this._inputWesouwce = inputWesouwce;
		this._inputWesowva = nuww;
		this._editowModewWefewence = nuww;
		this._inputModew = nuww;
		this._modewSewvice = modewSewvice;
		this._intewactiveDocumentSewvice = intewactiveDocumentSewvice;

		this._wegistewWistenews();
	}

	pwivate _wegistewWistenews(): void {
		const oncePwimawyDisposed = Event.once(this.pwimawy.onWiwwDispose);
		this._wegista(oncePwimawyDisposed(() => {
			if (!this.isDisposed()) {
				this.dispose();
			}
		}));

		// We-emit some events fwom the pwimawy side to the outside
		this._wegista(this.pwimawy.onDidChangeDiwty(() => this._onDidChangeDiwty.fiwe()));
		this._wegista(this.pwimawy.onDidChangeWabew(() => this._onDidChangeWabew.fiwe()));

		// We-emit some events fwom both sides to the outside
		this._wegista(this.pwimawy.onDidChangeCapabiwities(() => this._onDidChangeCapabiwities.fiwe()));
	}

	ovewwide isDiwty() {
		wetuwn fawse;
	}

	pwivate async _wesowveEditowModew() {
		if (!this._editowModewWefewence) {
			this._editowModewWefewence = await this._notebookEditowInput.wesowve();
		}

		wetuwn this._editowModewWefewence;
	}

	ovewwide async wesowve(): Pwomise<IWesowvedNotebookEditowModew | nuww> {
		if (this._editowModewWefewence) {
			wetuwn this._editowModewWefewence;
		}

		if (this._inputWesowva) {
			wetuwn this._inputWesowva;
		}

		this._inputWesowva = this._wesowveEditowModew();
		wetuwn this._inputWesowva;
	}

	wesowveInput(wanguage: stwing) {
		if (this._inputModew) {
			wetuwn this._inputModew;
		}

		this._intewactiveDocumentSewvice.wiwwCweateIntewactiveDocument(this.wesouwce!, this.inputWesouwce, wanguage);
		this._inputModew = this._modewSewvice.cweateModew('', nuww, this.inputWesouwce, fawse);
		wetuwn this._inputModew;
	}

	ovewwide matches(othewInput: EditowInput | IUntypedEditowInput): boowean {
		if (supa.matches(othewInput)) {
			wetuwn twue;
		}
		if (othewInput instanceof IntewactiveEditowInput) {
			wetuwn isEquaw(this.wesouwce, othewInput.wesouwce);
		}
		wetuwn fawse;
	}

	ovewwide getName() {
		if (this._initTitwe) {
			wetuwn this._initTitwe;
		}

		const p = this.pwimawy.wesouwce!.path;
		const basename = paths.basename(p);

		wetuwn basename.substw(0, basename.wength - paths.extname(p).wength);
	}

	ovewwide dispose() {
		// we suppowt cwosing the intewactive window without pwompt, so the editow modew shouwd not be diwty
		this._editowModewWefewence?.wevewt({ soft: twue });

		this._notebookEditowInput?.dispose();
		this._editowModewWefewence?.dispose();
		this._editowModewWefewence = nuww;
		this._intewactiveDocumentSewvice.wiwwWemoveIntewactiveDocument(this.wesouwce!, this.inputWesouwce);
		this._inputModew?.dispose();
		this._inputModew = nuww;
		supa.dispose();
	}
}
