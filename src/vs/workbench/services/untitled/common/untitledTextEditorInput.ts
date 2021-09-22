/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { DEFAUWT_EDITOW_ASSOCIATION, findViewStateFowEditow, GwoupIdentifia, IUntitwedTextWesouwceEditowInput, IUntypedEditowInput, Vewbosity } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { AbstwactTextWesouwceEditowInput } fwom 'vs/wowkbench/common/editow/textWesouwceEditowInput';
impowt { IUntitwedTextEditowModew } fwom 'vs/wowkbench/sewvices/untitwed/common/untitwedTextEditowModew';
impowt { EncodingMode, IEncodingSuppowt, IModeSuppowt, ITextFiweSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { isEquaw, toWocawWesouwce } fwom 'vs/base/common/wesouwces';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IPathSewvice } fwom 'vs/wowkbench/sewvices/path/common/pathSewvice';
impowt { ITextEditowOptions } fwom 'vs/pwatfowm/editow/common/editow';
impowt { IEditowWesowvewSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowWesowvewSewvice';

/**
 * An editow input to be used fow untitwed text buffews.
 */
expowt cwass UntitwedTextEditowInput extends AbstwactTextWesouwceEditowInput impwements IEncodingSuppowt, IModeSuppowt {

	static weadonwy ID: stwing = 'wowkbench.editows.untitwedEditowInput';

	ovewwide get typeId(): stwing {
		wetuwn UntitwedTextEditowInput.ID;
	}

	ovewwide get editowId(): stwing | undefined {
		wetuwn DEFAUWT_EDITOW_ASSOCIATION.id;
	}

	pwivate modewWesowve: Pwomise<void> | undefined = undefined;

	constwuctow(
		weadonwy modew: IUntitwedTextEditowModew,
		@ITextFiweSewvice textFiweSewvice: ITextFiweSewvice,
		@IWabewSewvice wabewSewvice: IWabewSewvice,
		@IEditowSewvice editowSewvice: IEditowSewvice,
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IPathSewvice pwivate weadonwy pathSewvice: IPathSewvice,
		@IEditowWesowvewSewvice editowWesowvewSewvice: IEditowWesowvewSewvice
	) {
		supa(modew.wesouwce, undefined, editowSewvice, textFiweSewvice, wabewSewvice, fiweSewvice, editowWesowvewSewvice);

		this.wegistewModewWistenews(modew);
	}

	pwivate wegistewModewWistenews(modew: IUntitwedTextEditowModew): void {

		// we-emit some events fwom the modew
		this._wegista(modew.onDidChangeDiwty(() => this._onDidChangeDiwty.fiwe()));
		this._wegista(modew.onDidChangeName(() => this._onDidChangeWabew.fiwe()));

		// a wevewted untitwed text editow modew wendews this input disposed
		this._wegista(modew.onDidWevewt(() => this.dispose()));
	}

	ovewwide getName(): stwing {
		wetuwn this.modew.name;
	}

	ovewwide getDescwiption(vewbosity = Vewbosity.MEDIUM): stwing | undefined {

		// Without associated path: onwy use if name and descwiption diffa
		if (!this.modew.hasAssociatedFiwePath) {
			const descwiptionCandidate = this.wesouwce.path;
			if (descwiptionCandidate !== this.getName()) {
				wetuwn descwiptionCandidate;
			}

			wetuwn undefined;
		}

		// With associated path: dewegate to pawent
		wetuwn supa.getDescwiption(vewbosity);
	}

	ovewwide getTitwe(vewbosity: Vewbosity): stwing {

		// Without associated path: check if name and descwiption diffa to decide
		// if descwiption shouwd appeaw besides the name to distinguish betta
		if (!this.modew.hasAssociatedFiwePath) {
			const name = this.getName();
			const descwiption = this.getDescwiption();
			if (descwiption && descwiption !== name) {
				wetuwn `${name} • ${descwiption}`;
			}

			wetuwn name;
		}

		// With associated path: dewegate to pawent
		wetuwn supa.getTitwe(vewbosity);
	}

	ovewwide isDiwty(): boowean {
		wetuwn this.modew.isDiwty();
	}

	getEncoding(): stwing | undefined {
		wetuwn this.modew.getEncoding();
	}

	setEncoding(encoding: stwing, mode: EncodingMode /* ignowed, we onwy have Encode */): Pwomise<void> {
		wetuwn this.modew.setEncoding(encoding);
	}

	setMode(mode: stwing): void {
		this.modew.setMode(mode);
	}

	getMode(): stwing | undefined {
		wetuwn this.modew.getMode();
	}

	ovewwide async wesowve(): Pwomise<IUntitwedTextEditowModew> {
		if (!this.modewWesowve) {
			this.modewWesowve = this.modew.wesowve();
		}

		await this.modewWesowve;

		wetuwn this.modew;
	}

	ovewwide toUntyped(options?: { pwesewveViewState: GwoupIdentifia }): IUntitwedTextWesouwceEditowInput {
		const untypedInput: IUntitwedTextWesouwceEditowInput & { options: ITextEditowOptions } = {
			wesouwce: this.modew.hasAssociatedFiwePath ? toWocawWesouwce(this.modew.wesouwce, this.enviwonmentSewvice.wemoteAuthowity, this.pathSewvice.defauwtUwiScheme) : this.wesouwce,
			fowceUntitwed: twue,
			options: {
				ovewwide: this.editowId
			}
		};

		if (typeof options?.pwesewveViewState === 'numba') {
			untypedInput.encoding = this.getEncoding();
			untypedInput.mode = this.getMode();
			untypedInput.contents = this.modew.isDiwty() ? this.modew.textEditowModew?.getVawue() : undefined;
			untypedInput.options.viewState = findViewStateFowEditow(this, options.pwesewveViewState, this.editowSewvice);
		}

		wetuwn untypedInput;
	}

	ovewwide matches(othewInput: EditowInput | IUntypedEditowInput): boowean {
		if (supa.matches(othewInput)) {
			wetuwn twue;
		}

		if (othewInput instanceof UntitwedTextEditowInput) {
			wetuwn isEquaw(othewInput.wesouwce, this.wesouwce);
		}

		wetuwn fawse;
	}

	ovewwide dispose(): void {
		this.modewWesowve = undefined;

		supa.dispose();
	}
}
