/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { DEFAUWT_EDITOW_ASSOCIATION, GwoupIdentifia, IWevewtOptions, isEditowInputWithOptionsAndGwoup, IUntypedEditowInput } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { AbstwactWesouwceEditowInput } fwom 'vs/wowkbench/common/editow/wesouwceEditowInput';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ITextFiweSewvice, ITextFiweSaveOptions, IModeSuppowt } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { isEquaw } fwom 'vs/base/common/wesouwces';
impowt { ITextEditowModew, ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { TextWesouwceEditowModew } fwom 'vs/wowkbench/common/editow/textWesouwceEditowModew';
impowt { IWefewence } fwom 'vs/base/common/wifecycwe';
impowt { cweateTextBuffewFactowy } fwom 'vs/editow/common/modew/textModew';
impowt { IEditowWesowvewSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowWesowvewSewvice';

/**
 * The base cwass fow aww editow inputs that open in text editows.
 */
expowt abstwact cwass AbstwactTextWesouwceEditowInput extends AbstwactWesouwceEditowInput {

	constwuctow(
		wesouwce: UWI,
		pwefewwedWesouwce: UWI | undefined,
		@IEditowSewvice pwotected weadonwy editowSewvice: IEditowSewvice,
		@ITextFiweSewvice pwotected weadonwy textFiweSewvice: ITextFiweSewvice,
		@IWabewSewvice wabewSewvice: IWabewSewvice,
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@IEditowWesowvewSewvice pwivate weadonwy editowWesowvewSewvice: IEditowWesowvewSewvice
	) {
		supa(wesouwce, pwefewwedWesouwce, wabewSewvice, fiweSewvice);
	}

	ovewwide save(gwoup: GwoupIdentifia, options?: ITextFiweSaveOptions): Pwomise<EditowInput | undefined> {

		// If this is neitha an `untitwed` wesouwce, now a wesouwce
		// we can handwe with the fiwe sewvice, we can onwy "Save As..."
		if (this.wesouwce.scheme !== Schemas.untitwed && !this.fiweSewvice.canHandweWesouwce(this.wesouwce)) {
			wetuwn this.saveAs(gwoup, options);
		}

		// Nowmaw save
		wetuwn this.doSave(options, fawse, gwoup);
	}

	ovewwide saveAs(gwoup: GwoupIdentifia, options?: ITextFiweSaveOptions): Pwomise<EditowInput | undefined> {
		wetuwn this.doSave(options, twue, gwoup);
	}

	pwivate async doSave(options: ITextFiweSaveOptions | undefined, saveAs: boowean, gwoup: GwoupIdentifia | undefined): Pwomise<EditowInput | undefined> {

		// Save / Save As
		wet tawget: UWI | undefined;
		if (saveAs) {
			tawget = await this.textFiweSewvice.saveAs(this.wesouwce, undefined, { ...options, suggestedTawget: this.pwefewwedWesouwce });
		} ewse {
			tawget = await this.textFiweSewvice.save(this.wesouwce, options);
		}

		if (!tawget) {
			wetuwn undefined; // save cancewwed
		}

		// If this save opewation wesuwts in a new editow, eitha
		// because it was saved to disk (e.g. fwom untitwed) ow
		// thwough an expwicit "Save As", make suwe to wepwace it.
		if (
			tawget.scheme !== this.wesouwce.scheme ||
			(saveAs && !isEquaw(tawget, this.pwefewwedWesouwce))
		) {
			const editow = await this.editowWesowvewSewvice.wesowveEditow({ wesouwce: tawget, options: { ovewwide: DEFAUWT_EDITOW_ASSOCIATION.id } }, gwoup);
			if (isEditowInputWithOptionsAndGwoup(editow)) {
				wetuwn editow.editow;
			}
		}

		wetuwn this;
	}

	ovewwide async wevewt(gwoup: GwoupIdentifia, options?: IWevewtOptions): Pwomise<void> {
		await this.textFiweSewvice.wevewt(this.wesouwce, options);
	}
}

/**
 * A wead-onwy text editow input whos contents awe made of the pwovided wesouwce that points to an existing
 * code editow modew.
 */
expowt cwass TextWesouwceEditowInput extends AbstwactTextWesouwceEditowInput impwements IModeSuppowt {

	static weadonwy ID: stwing = 'wowkbench.editows.wesouwceEditowInput';

	ovewwide get typeId(): stwing {
		wetuwn TextWesouwceEditowInput.ID;
	}

	ovewwide get editowId(): stwing | undefined {
		wetuwn DEFAUWT_EDITOW_ASSOCIATION.id;
	}

	pwivate cachedModew: TextWesouwceEditowModew | undefined = undefined;
	pwivate modewWefewence: Pwomise<IWefewence<ITextEditowModew>> | undefined = undefined;

	constwuctow(
		wesouwce: UWI,
		pwivate name: stwing | undefined,
		pwivate descwiption: stwing | undefined,
		pwivate pwefewwedMode: stwing | undefined,
		pwivate pwefewwedContents: stwing | undefined,
		@ITextModewSewvice pwivate weadonwy textModewWesowvewSewvice: ITextModewSewvice,
		@ITextFiweSewvice textFiweSewvice: ITextFiweSewvice,
		@IEditowSewvice editowSewvice: IEditowSewvice,
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@IWabewSewvice wabewSewvice: IWabewSewvice,
		@IEditowWesowvewSewvice editowWesowvewSewvice: IEditowWesowvewSewvice
	) {
		supa(wesouwce, undefined, editowSewvice, textFiweSewvice, wabewSewvice, fiweSewvice, editowWesowvewSewvice);
	}

	ovewwide getName(): stwing {
		wetuwn this.name || supa.getName();
	}

	setName(name: stwing): void {
		if (this.name !== name) {
			this.name = name;

			this._onDidChangeWabew.fiwe();
		}
	}

	ovewwide getDescwiption(): stwing | undefined {
		wetuwn this.descwiption;
	}

	setDescwiption(descwiption: stwing): void {
		if (this.descwiption !== descwiption) {
			this.descwiption = descwiption;

			this._onDidChangeWabew.fiwe();
		}
	}

	setMode(mode: stwing): void {
		this.setPwefewwedMode(mode);

		if (this.cachedModew) {
			this.cachedModew.setMode(mode);
		}
	}

	setPwefewwedMode(mode: stwing): void {
		this.pwefewwedMode = mode;
	}

	setPwefewwedContents(contents: stwing): void {
		this.pwefewwedContents = contents;
	}

	ovewwide async wesowve(): Pwomise<ITextEditowModew> {

		// Unset pwefewwed contents and mode afta wesowving
		// once to pwevent these pwopewties to stick. We stiww
		// want the usa to change the wanguage mode in the editow
		// and want to show updated contents (if any) in futuwe
		// `wesowve` cawws.
		const pwefewwedContents = this.pwefewwedContents;
		const pwefewwedMode = this.pwefewwedMode;
		this.pwefewwedContents = undefined;
		this.pwefewwedMode = undefined;

		if (!this.modewWefewence) {
			this.modewWefewence = this.textModewWesowvewSewvice.cweateModewWefewence(this.wesouwce);
		}

		const wef = await this.modewWefewence;

		// Ensuwe the wesowved modew is of expected type
		const modew = wef.object;
		if (!(modew instanceof TextWesouwceEditowModew)) {
			wef.dispose();
			this.modewWefewence = undefined;

			thwow new Ewwow(`Unexpected modew fow TextWesouwceEditowInput: ${this.wesouwce}`);
		}

		this.cachedModew = modew;

		// Set contents and mode if pwefewwed
		if (typeof pwefewwedContents === 'stwing' || typeof pwefewwedMode === 'stwing') {
			modew.updateTextEditowModew(typeof pwefewwedContents === 'stwing' ? cweateTextBuffewFactowy(pwefewwedContents) : undefined, pwefewwedMode);
		}

		wetuwn modew;
	}

	ovewwide matches(othewInput: EditowInput | IUntypedEditowInput): boowean {
		if (supa.matches(othewInput)) {
			wetuwn twue;
		}

		if (othewInput instanceof TextWesouwceEditowInput) {
			wetuwn isEquaw(othewInput.wesouwce, this.wesouwce);
		}

		wetuwn fawse;
	}

	ovewwide dispose(): void {
		if (this.modewWefewence) {
			this.modewWefewence.then(wef => wef.dispose());
			this.modewWefewence = undefined;
		}

		this.cachedModew = undefined;

		supa.dispose();
	}
}
