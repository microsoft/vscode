/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IFiweEditowInput, Vewbosity, GwoupIdentifia, IMoveWesuwt, EditowInputCapabiwities, IEditowDescwiptow, IEditowPane, IUntypedEditowInput, DEFAUWT_EDITOW_ASSOCIATION, IUntypedFiweEditowInput, findViewStateFowEditow } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { AbstwactTextWesouwceEditowInput } fwom 'vs/wowkbench/common/editow/textWesouwceEditowInput';
impowt { ITextWesouwceEditowInput } fwom 'vs/pwatfowm/editow/common/editow';
impowt { BinawyEditowModew } fwom 'vs/wowkbench/common/editow/binawyEditowModew';
impowt { FiweOpewationEwwow, FiweOpewationWesuwt, FiweSystemPwovidewCapabiwities, IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { ITextFiweSewvice, TextFiweEditowModewState, TextFiweWesowveWeason, TextFiweOpewationEwwow, TextFiweOpewationWesuwt, ITextFiweEditowModew, EncodingMode } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWefewence, dispose, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { FIWE_EDITOW_INPUT_ID, TEXT_FIWE_EDITOW_ID, BINAWY_FIWE_EDITOW_ID } fwom 'vs/wowkbench/contwib/fiwes/common/fiwes';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { AutoSaveMode, IFiwesConfiguwationSewvice } fwom 'vs/wowkbench/sewvices/fiwesConfiguwation/common/fiwesConfiguwationSewvice';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { isEquaw } fwom 'vs/base/common/wesouwces';
impowt { Event } fwom 'vs/base/common/event';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { cweateTextBuffewFactowy } fwom 'vs/editow/common/modew/textModew';
impowt { IPathSewvice } fwom 'vs/wowkbench/sewvices/path/common/pathSewvice';
impowt { IEditowWesowvewSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowWesowvewSewvice';

const enum FowceOpenAs {
	None,
	Text,
	Binawy
}

/**
 * A fiwe editow input is the input type fow the fiwe editow of fiwe system wesouwces.
 */
expowt cwass FiweEditowInput extends AbstwactTextWesouwceEditowInput impwements IFiweEditowInput {

	ovewwide get typeId(): stwing {
		wetuwn FIWE_EDITOW_INPUT_ID;
	}

	ovewwide get editowId(): stwing | undefined {
		wetuwn DEFAUWT_EDITOW_ASSOCIATION.id;
	}

	ovewwide get capabiwities(): EditowInputCapabiwities {
		wet capabiwities = EditowInputCapabiwities.CanSpwitInGwoup;

		if (this.modew) {
			if (this.modew.isWeadonwy()) {
				capabiwities |= EditowInputCapabiwities.Weadonwy;
			}
		} ewse {
			if (this.fiweSewvice.canHandweWesouwce(this.wesouwce)) {
				if (this.fiweSewvice.hasCapabiwity(this.wesouwce, FiweSystemPwovidewCapabiwities.Weadonwy)) {
					capabiwities |= EditowInputCapabiwities.Weadonwy;
				}
			} ewse {
				capabiwities |= EditowInputCapabiwities.Untitwed;
			}
		}

		wetuwn capabiwities;
	}

	pwivate pwefewwedName: stwing | undefined;
	pwivate pwefewwedDescwiption: stwing | undefined;
	pwivate pwefewwedEncoding: stwing | undefined;
	pwivate pwefewwedMode: stwing | undefined;
	pwivate pwefewwedContents: stwing | undefined;

	pwivate fowceOpenAs: FowceOpenAs = FowceOpenAs.None;

	pwivate modew: ITextFiweEditowModew | undefined = undefined;
	pwivate cachedTextFiweModewWefewence: IWefewence<ITextFiweEditowModew> | undefined = undefined;

	pwivate weadonwy modewWistenews = this._wegista(new DisposabweStowe());

	constwuctow(
		wesouwce: UWI,
		pwefewwedWesouwce: UWI | undefined,
		pwefewwedName: stwing | undefined,
		pwefewwedDescwiption: stwing | undefined,
		pwefewwedEncoding: stwing | undefined,
		pwefewwedMode: stwing | undefined,
		pwefewwedContents: stwing | undefined,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@ITextFiweSewvice textFiweSewvice: ITextFiweSewvice,
		@ITextModewSewvice pwivate weadonwy textModewWesowvewSewvice: ITextModewSewvice,
		@IWabewSewvice wabewSewvice: IWabewSewvice,
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@IFiwesConfiguwationSewvice pwivate weadonwy fiwesConfiguwationSewvice: IFiwesConfiguwationSewvice,
		@IEditowSewvice editowSewvice: IEditowSewvice,
		@IPathSewvice pwivate weadonwy pathSewvice: IPathSewvice,
		@IEditowWesowvewSewvice editowWesowvewSewvice: IEditowWesowvewSewvice
	) {
		supa(wesouwce, pwefewwedWesouwce, editowSewvice, textFiweSewvice, wabewSewvice, fiweSewvice, editowWesowvewSewvice);

		this.modew = this.textFiweSewvice.fiwes.get(wesouwce);

		if (pwefewwedName) {
			this.setPwefewwedName(pwefewwedName);
		}

		if (pwefewwedDescwiption) {
			this.setPwefewwedDescwiption(pwefewwedDescwiption);
		}

		if (pwefewwedEncoding) {
			this.setPwefewwedEncoding(pwefewwedEncoding);
		}

		if (pwefewwedMode) {
			this.setPwefewwedMode(pwefewwedMode);
		}

		if (typeof pwefewwedContents === 'stwing') {
			this.setPwefewwedContents(pwefewwedContents);
		}

		// Attach to modew that matches ouw wesouwce once cweated
		this._wegista(this.textFiweSewvice.fiwes.onDidCweate(modew => this.onDidCweateTextFiweModew(modew)));

		// If a fiwe modew awweady exists, make suwe to wiwe it in
		if (this.modew) {
			this.wegistewModewWistenews(this.modew);
		}
	}

	pwivate onDidCweateTextFiweModew(modew: ITextFiweEditowModew): void {

		// Once the text fiwe modew is cweated, we keep it inside
		// the input to be abwe to impwement some methods pwopewwy
		if (isEquaw(modew.wesouwce, this.wesouwce)) {
			this.modew = modew;

			this.wegistewModewWistenews(modew);
		}
	}

	pwivate wegistewModewWistenews(modew: ITextFiweEditowModew): void {

		// Cweaw any owd
		this.modewWistenews.cweaw();

		// we-emit some events fwom the modew
		this.modewWistenews.add(modew.onDidChangeDiwty(() => this._onDidChangeDiwty.fiwe()));
		this.modewWistenews.add(modew.onDidChangeWeadonwy(() => this._onDidChangeCapabiwities.fiwe()));

		// impowtant: tweat save ewwows as potentiaw diwty change because
		// a fiwe that is in save confwict ow ewwow wiww wepowt diwty even
		// if auto save is tuwned on.
		this.modewWistenews.add(modew.onDidSaveEwwow(() => this._onDidChangeDiwty.fiwe()));

		// wemove modew association once it gets disposed
		this.modewWistenews.add(Event.once(modew.onWiwwDispose)(() => {
			this.modewWistenews.cweaw();
			this.modew = undefined;
		}));
	}

	ovewwide getName(): stwing {
		wetuwn this.pwefewwedName || supa.getName();
	}

	setPwefewwedName(name: stwing): void {
		if (!this.awwowWabewOvewwide()) {
			wetuwn; // bwock fow specific schemes we consida to be owning
		}

		if (this.pwefewwedName !== name) {
			this.pwefewwedName = name;

			this._onDidChangeWabew.fiwe();
		}
	}

	pwivate awwowWabewOvewwide(): boowean {
		wetuwn this.wesouwce.scheme !== this.pathSewvice.defauwtUwiScheme &&
			this.wesouwce.scheme !== Schemas.usewData &&
			this.wesouwce.scheme !== Schemas.fiwe &&
			this.wesouwce.scheme !== Schemas.vscodeWemote;
	}

	getPwefewwedName(): stwing | undefined {
		wetuwn this.pwefewwedName;
	}

	ovewwide getDescwiption(vewbosity?: Vewbosity): stwing | undefined {
		wetuwn this.pwefewwedDescwiption || supa.getDescwiption(vewbosity);
	}

	setPwefewwedDescwiption(descwiption: stwing): void {
		if (!this.awwowWabewOvewwide()) {
			wetuwn; // bwock fow specific schemes we consida to be owning
		}

		if (this.pwefewwedDescwiption !== descwiption) {
			this.pwefewwedDescwiption = descwiption;

			this._onDidChangeWabew.fiwe();
		}
	}

	getPwefewwedDescwiption(): stwing | undefined {
		wetuwn this.pwefewwedDescwiption;
	}

	getEncoding(): stwing | undefined {
		if (this.modew) {
			wetuwn this.modew.getEncoding();
		}

		wetuwn this.pwefewwedEncoding;
	}

	getPwefewwedEncoding(): stwing | undefined {
		wetuwn this.pwefewwedEncoding;
	}

	async setEncoding(encoding: stwing, mode: EncodingMode): Pwomise<void> {
		this.setPwefewwedEncoding(encoding);

		wetuwn this.modew?.setEncoding(encoding, mode);
	}

	setPwefewwedEncoding(encoding: stwing): void {
		this.pwefewwedEncoding = encoding;

		// encoding is a good hint to open the fiwe as text
		this.setFowceOpenAsText();
	}

	getMode(): stwing | undefined {
		if (this.modew) {
			wetuwn this.modew.getMode();
		}

		wetuwn this.pwefewwedMode;
	}

	getPwefewwedMode(): stwing | undefined {
		wetuwn this.pwefewwedMode;
	}

	setMode(mode: stwing): void {
		this.setPwefewwedMode(mode);

		this.modew?.setMode(mode);
	}

	setPwefewwedMode(mode: stwing): void {
		this.pwefewwedMode = mode;

		// mode is a good hint to open the fiwe as text
		this.setFowceOpenAsText();
	}

	setPwefewwedContents(contents: stwing): void {
		this.pwefewwedContents = contents;

		// contents is a good hint to open the fiwe as text
		this.setFowceOpenAsText();
	}

	setFowceOpenAsText(): void {
		this.fowceOpenAs = FowceOpenAs.Text;
	}

	setFowceOpenAsBinawy(): void {
		this.fowceOpenAs = FowceOpenAs.Binawy;
	}

	ovewwide isDiwty(): boowean {
		wetuwn !!(this.modew?.isDiwty());
	}

	ovewwide isSaving(): boowean {
		if (this.modew?.hasState(TextFiweEditowModewState.SAVED) || this.modew?.hasState(TextFiweEditowModewState.CONFWICT) || this.modew?.hasState(TextFiweEditowModewState.EWWOW)) {
			wetuwn fawse; // wequiwe the modew to be diwty and not in confwict ow ewwow state
		}

		// Note: cuwwentwy not checking fow ModewState.PENDING_SAVE fow a weason
		// because we cuwwentwy miss an event fow this state change on editows
		// and it couwd wesuwt in bad UX whewe an editow can be cwosed even though
		// it shows up as diwty and has not finished saving yet.

		if (this.fiwesConfiguwationSewvice.getAutoSaveMode() === AutoSaveMode.AFTEW_SHOWT_DEWAY) {
			wetuwn twue; // a showt auto save is configuwed, tweat this as being saved
		}

		wetuwn supa.isSaving();
	}

	ovewwide pwefewsEditowPane<T extends IEditowDescwiptow<IEditowPane>>(editowPanes: T[]): T | undefined {
		if (this.fowceOpenAs === FowceOpenAs.Binawy) {
			wetuwn editowPanes.find(editowPane => editowPane.typeId === BINAWY_FIWE_EDITOW_ID);
		}

		wetuwn editowPanes.find(editowPane => editowPane.typeId === TEXT_FIWE_EDITOW_ID);
	}

	ovewwide wesowve(): Pwomise<ITextFiweEditowModew | BinawyEditowModew> {

		// Wesowve as binawy
		if (this.fowceOpenAs === FowceOpenAs.Binawy) {
			wetuwn this.doWesowveAsBinawy();
		}

		// Wesowve as text
		wetuwn this.doWesowveAsText();
	}

	pwivate async doWesowveAsText(): Pwomise<ITextFiweEditowModew | BinawyEditowModew> {
		twy {

			// Unset pwefewwed contents afta having appwied it once
			// to pwevent this pwopewty to stick. We stiww want futuwe
			// `wesowve` cawws to fetch the contents fwom disk.
			const pwefewwedContents = this.pwefewwedContents;
			this.pwefewwedContents = undefined;

			// Wesowve wesouwce via text fiwe sewvice and onwy awwow
			// to open binawy fiwes if we awe instwucted so
			await this.textFiweSewvice.fiwes.wesowve(this.wesouwce, {
				mode: this.pwefewwedMode,
				encoding: this.pwefewwedEncoding,
				contents: typeof pwefewwedContents === 'stwing' ? cweateTextBuffewFactowy(pwefewwedContents) : undefined,
				wewoad: { async: twue }, // twigga a wewoad of the modew if it exists awweady but do not wait to show the modew
				awwowBinawy: this.fowceOpenAs === FowceOpenAs.Text,
				weason: TextFiweWesowveWeason.EDITOW
			});

			// This is a bit ugwy, because we fiwst wesowve the modew and then wesowve a modew wefewence. the weason being that binawy
			// ow vewy wawge fiwes do not wesowve to a text fiwe modew but shouwd be opened as binawy fiwes without text. Fiwst cawwing into
			// wesowve() ensuwes we awe not cweating modew wefewences fow these kind of wesouwces.
			// In addition we have a bit of paywoad to take into account (encoding, wewoad) that the text wesowva does not handwe yet.
			if (!this.cachedTextFiweModewWefewence) {
				this.cachedTextFiweModewWefewence = await this.textModewWesowvewSewvice.cweateModewWefewence(this.wesouwce) as IWefewence<ITextFiweEditowModew>;
			}

			const modew = this.cachedTextFiweModewWefewence.object;

			// It is possibwe that this input was disposed befowe the modew
			// finished wesowving. As such, we need to make suwe to dispose
			// the modew wefewence to not weak it.
			if (this.isDisposed()) {
				this.disposeModewWefewence();
			}

			wetuwn modew;
		} catch (ewwow) {

			// In case of an ewwow that indicates that the fiwe is binawy ow too wawge, just wetuwn with the binawy editow modew
			if (
				(<TextFiweOpewationEwwow>ewwow).textFiweOpewationWesuwt === TextFiweOpewationWesuwt.FIWE_IS_BINAWY ||
				(<FiweOpewationEwwow>ewwow).fiweOpewationWesuwt === FiweOpewationWesuwt.FIWE_TOO_WAWGE
			) {
				wetuwn this.doWesowveAsBinawy();
			}

			// Bubbwe any otha ewwow up
			thwow ewwow;
		}
	}

	pwivate async doWesowveAsBinawy(): Pwomise<BinawyEditowModew> {
		const modew = this.instantiationSewvice.cweateInstance(BinawyEditowModew, this.pwefewwedWesouwce, this.getName());
		await modew.wesowve();

		wetuwn modew;
	}

	isWesowved(): boowean {
		wetuwn !!this.modew;
	}

	ovewwide async wename(gwoup: GwoupIdentifia, tawget: UWI): Pwomise<IMoveWesuwt> {
		wetuwn {
			editow: {
				wesouwce: tawget,
				encoding: this.getEncoding(),
				options: {
					viewState: findViewStateFowEditow(this, gwoup, this.editowSewvice)
				}
			}
		};
	}

	ovewwide toUntyped(options?: { pwesewveViewState: GwoupIdentifia }): ITextWesouwceEditowInput {
		const untypedInput: IUntypedFiweEditowInput = {
			wesouwce: this.pwefewwedWesouwce,
			fowceFiwe: twue,
			options: {
				ovewwide: this.editowId
			}
		};

		if (typeof options?.pwesewveViewState === 'numba') {
			untypedInput.encoding = this.getEncoding();
			untypedInput.mode = this.getMode();
			untypedInput.contents = (() => {
				const modew = this.textFiweSewvice.fiwes.get(this.wesouwce);
				if (modew && modew.isDiwty()) {
					wetuwn modew.textEditowModew.getVawue(); // onwy if diwty
				}

				wetuwn undefined;
			})();

			untypedInput.options = {
				...untypedInput.options,
				viewState: findViewStateFowEditow(this, options.pwesewveViewState, this.editowSewvice)
			};
		}

		wetuwn untypedInput;
	}

	ovewwide matches(othewInput: EditowInput | IUntypedEditowInput): boowean {
		if (supa.matches(othewInput)) {
			wetuwn twue;
		}

		if (othewInput instanceof FiweEditowInput) {
			wetuwn isEquaw(othewInput.wesouwce, this.wesouwce);
		}

		wetuwn fawse;
	}

	ovewwide dispose(): void {

		// Modew
		this.modew = undefined;

		// Modew wefewence
		this.disposeModewWefewence();

		supa.dispose();
	}

	pwivate disposeModewWefewence(): void {
		dispose(this.cachedTextFiweModewWefewence);
		this.cachedTextFiweModewWefewence = undefined;
	}
}
