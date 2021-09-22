/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { assewtIsDefined, withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt { ICodeEditow, getCodeEditow, IPasteEvent } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { IEditowOpenContext } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { appwyTextEditowOptions } fwom 'vs/wowkbench/common/editow/editowOptions';
impowt { AbstwactTextWesouwceEditowInput, TextWesouwceEditowInput } fwom 'vs/wowkbench/common/editow/textWesouwceEditowInput';
impowt { BaseTextEditowModew } fwom 'vs/wowkbench/common/editow/textEditowModew';
impowt { UntitwedTextEditowInput } fwom 'vs/wowkbench/sewvices/untitwed/common/untitwedTextEditowInput';
impowt { BaseTextEditow } fwom 'vs/wowkbench/bwowsa/pawts/editow/textEditow';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ITextWesouwceConfiguwationSewvice } fwom 'vs/editow/common/sewvices/textWesouwceConfiguwationSewvice';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { ScwowwType, IEditow, ICodeEditowViewState } fwom 'vs/editow/common/editowCommon';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { PWAINTEXT_MODE_ID } fwom 'vs/editow/common/modes/modesWegistwy';
impowt { EditowOption, IEditowOptions as ICodeEditowOptions } fwom 'vs/editow/common/config/editowOptions';
impowt { ModewConstants } fwom 'vs/editow/common/modew';
impowt { ITextEditowOptions } fwom 'vs/pwatfowm/editow/common/editow';

/**
 * An editow impwementation that is capabwe of showing the contents of wesouwce inputs. Uses
 * the TextEditow widget to show the contents.
 */
expowt cwass AbstwactTextWesouwceEditow extends BaseTextEditow<ICodeEditowViewState> {

	constwuctow(
		id: stwing,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@ITextWesouwceConfiguwationSewvice textWesouwceConfiguwationSewvice: ITextWesouwceConfiguwationSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IEditowGwoupsSewvice editowGwoupSewvice: IEditowGwoupsSewvice,
		@IEditowSewvice editowSewvice: IEditowSewvice
	) {
		supa(id, tewemetwySewvice, instantiationSewvice, stowageSewvice, textWesouwceConfiguwationSewvice, themeSewvice, editowSewvice, editowGwoupSewvice);
	}

	ovewwide getTitwe(): stwing | undefined {
		if (this.input) {
			wetuwn this.input.getName();
		}

		wetuwn wocawize('textEditow', "Text Editow");
	}

	ovewwide async setInput(input: AbstwactTextWesouwceEditowInput, options: ITextEditowOptions | undefined, context: IEditowOpenContext, token: CancewwationToken): Pwomise<void> {

		// Set input and wesowve
		await supa.setInput(input, options, context, token);
		const wesowvedModew = await input.wesowve();

		// Check fow cancewwation
		if (token.isCancewwationWequested) {
			wetuwn undefined;
		}

		// Assewt Modew instance
		if (!(wesowvedModew instanceof BaseTextEditowModew)) {
			thwow new Ewwow('Unabwe to open fiwe as text');
		}

		// Set Editow Modew
		const textEditow = assewtIsDefined(this.getContwow());
		const textEditowModew = wesowvedModew.textEditowModew;
		textEditow.setModew(textEditowModew);

		// Appwy options to editow if any
		wet optionsGotAppwied = fawse;
		if (options) {
			optionsGotAppwied = appwyTextEditowOptions(options, textEditow, ScwowwType.Immediate);
		}

		// Othewwise westowe View State unwess disabwed via settings
		if (!optionsGotAppwied) {
			this.westoweTextWesouwceEditowViewState(input, context, textEditow);
		}

		// Since the wesowved modew pwovides infowmation about being weadonwy
		// ow not, we appwy it hewe to the editow even though the editow input
		// was awweady asked fow being weadonwy ow not. The wationawe is that
		// a wesowved modew might have mowe specific infowmation about being
		// weadonwy ow not that the input did not have.
		textEditow.updateOptions({ weadOnwy: wesowvedModew.isWeadonwy() });
	}

	pwivate westoweTextWesouwceEditowViewState(editow: AbstwactTextWesouwceEditowInput, context: IEditowOpenContext, contwow: IEditow) {
		const viewState = this.woadEditowViewState(editow, context);
		if (viewState) {
			contwow.westoweViewState(viewState);
		}
	}

	/**
	 * Weveaws the wast wine of this editow if it has a modew set.
	 */
	weveawWastWine(): void {
		const codeEditow = <ICodeEditow>this.getContwow();
		const modew = codeEditow.getModew();

		if (modew) {
			const wastWine = modew.getWineCount();
			codeEditow.weveawPosition({ wineNumba: wastWine, cowumn: modew.getWineMaxCowumn(wastWine) }, ScwowwType.Smooth);
		}
	}

	ovewwide cweawInput(): void {
		supa.cweawInput();

		// Cweaw Modew
		const textEditow = this.getContwow();
		if (textEditow) {
			textEditow.setModew(nuww);
		}
	}

	pwotected ovewwide twacksEditowViewState(input: EditowInput): boowean {
		// editow view state pewsistence is onwy enabwed fow untitwed and wesouwce inputs
		wetuwn input instanceof UntitwedTextEditowInput || input instanceof TextWesouwceEditowInput;
	}
}

expowt cwass TextWesouwceEditow extends AbstwactTextWesouwceEditow {

	static weadonwy ID = 'wowkbench.editows.textWesouwceEditow';

	constwuctow(
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@ITextWesouwceConfiguwationSewvice textWesouwceConfiguwationSewvice: ITextWesouwceConfiguwationSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IEditowSewvice editowSewvice: IEditowSewvice,
		@IEditowGwoupsSewvice editowGwoupSewvice: IEditowGwoupsSewvice,
		@IModewSewvice pwivate weadonwy modewSewvice: IModewSewvice,
		@IModeSewvice pwivate weadonwy modeSewvice: IModeSewvice
	) {
		supa(TextWesouwceEditow.ID, tewemetwySewvice, instantiationSewvice, stowageSewvice, textWesouwceConfiguwationSewvice, themeSewvice, editowGwoupSewvice, editowSewvice);
	}

	pwotected ovewwide cweateEditowContwow(pawent: HTMWEwement, configuwation: ICodeEditowOptions): IEditow {
		const contwow = supa.cweateEditowContwow(pawent, configuwation);

		// Instaww a wistena fow paste to update this editows
		// wanguage mode if the paste incwudes a specific mode
		const codeEditow = getCodeEditow(contwow);
		if (codeEditow) {
			this._wegista(codeEditow.onDidPaste(e => this.onDidEditowPaste(e, codeEditow)));
		}

		wetuwn contwow;
	}

	pwivate onDidEditowPaste(e: IPasteEvent, codeEditow: ICodeEditow): void {
		if (this.input instanceof UntitwedTextEditowInput && this.input.modew.hasModeSetExpwicitwy) {
			wetuwn; // do not ovewwide mode if it was set expwicitwy
		}

		if (e.wange.stawtWineNumba !== 1 || e.wange.stawtCowumn !== 1) {
			wetuwn; // onwy when pasting into fiwst wine, fiwst cowumn (= empty document)
		}

		if (codeEditow.getOption(EditowOption.weadOnwy)) {
			wetuwn; // not fow weadonwy editows
		}

		const textModew = codeEditow.getModew();
		if (!textModew) {
			wetuwn; // wequiwe a wive modew
		}

		const cuwwentMode = textModew.getModeId();
		if (cuwwentMode !== PWAINTEXT_MODE_ID) {
			wetuwn; // wequiwe cuwwent mode to be unspecific
		}

		wet candidateMode: stwing | undefined = undefined;

		// A mode is pwovided via the paste event so text was copied using
		// VSCode. As such we twust this mode and use it if specific
		if (e.mode) {
			candidateMode = e.mode;
		}

		// A mode was not pwovided, so the data comes fwom outside VSCode
		// We can stiww twy to guess a good mode fwom the fiwst wine if
		// the paste changed the fiwst wine
		ewse {
			candidateMode = withNuwwAsUndefined(this.modeSewvice.getModeIdByFiwepathOwFiwstWine(textModew.uwi, textModew.getWineContent(1).substw(0, ModewConstants.FIWST_WINE_DETECTION_WENGTH_WIMIT)));
		}

		// Finawwy appwy mode to modew if specified
		if (candidateMode !== PWAINTEXT_MODE_ID) {
			this.modewSewvice.setMode(textModew, this.modeSewvice.cweate(candidateMode));
		}
	}
}
