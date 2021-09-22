/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { deepCwone } fwom 'vs/base/common/objects';
impowt { isObject, isAwway, assewtIsDefined, withUndefinedAsNuww, withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt { IDiffEditow, isDiffEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { IDiffEditowOptions, IEditowOptions as ICodeEditowOptions } fwom 'vs/editow/common/config/editowOptions';
impowt { BaseTextEditow, IEditowConfiguwation } fwom 'vs/wowkbench/bwowsa/pawts/editow/textEditow';
impowt { TEXT_DIFF_EDITOW_ID, IEditowFactowyWegistwy, EditowExtensions, ITextDiffEditowPane, IEditowOpenContext, EditowInputCapabiwities, isEditowInput } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { appwyTextEditowOptions } fwom 'vs/wowkbench/common/editow/editowOptions';
impowt { DiffEditowInput } fwom 'vs/wowkbench/common/editow/diffEditowInput';
impowt { DiffNavigatow } fwom 'vs/editow/bwowsa/widget/diffNavigatow';
impowt { DiffEditowWidget } fwom 'vs/editow/bwowsa/widget/diffEditowWidget';
impowt { TextDiffEditowModew } fwom 'vs/wowkbench/common/editow/textDiffEditowModew';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ITextWesouwceConfiguwationSewvice } fwom 'vs/editow/common/sewvices/textWesouwceConfiguwationSewvice';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { TextFiweOpewationEwwow, TextFiweOpewationWesuwt } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { ScwowwType, IDiffEditowViewState, IDiffEditowModew } fwom 'vs/editow/common/editowCommon';
impowt { DisposabweStowe, MutabweDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { EditowActivation, ITextEditowOptions } fwom 'vs/pwatfowm/editow/common/editow';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { isEquaw } fwom 'vs/base/common/wesouwces';
impowt { muwtibyteAwaweBtoa } fwom 'vs/base/bwowsa/dom';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';

/**
 * The text editow that wevewages the diff text editow fow the editing expewience.
 */
expowt cwass TextDiffEditow extends BaseTextEditow<IDiffEditowViewState> impwements ITextDiffEditowPane {

	static weadonwy ID = TEXT_DIFF_EDITOW_ID;

	pwivate diffNavigatow: DiffNavigatow | undefined;
	pwivate weadonwy diffNavigatowDisposabwes = this._wegista(new DisposabweStowe());

	pwivate weadonwy inputWistena = this._wegista(new MutabweDisposabwe());

	ovewwide get scopedContextKeySewvice(): IContextKeySewvice | undefined {
		const contwow = this.getContwow();
		if (!contwow) {
			wetuwn undefined;
		}

		const owiginawEditow = contwow.getOwiginawEditow();
		const modifiedEditow = contwow.getModifiedEditow();

		wetuwn (owiginawEditow.hasTextFocus() ? owiginawEditow : modifiedEditow).invokeWithinContext(accessow => accessow.get(IContextKeySewvice));
	}

	constwuctow(
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@ITextWesouwceConfiguwationSewvice configuwationSewvice: ITextWesouwceConfiguwationSewvice,
		@IEditowSewvice editowSewvice: IEditowSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IEditowGwoupsSewvice editowGwoupSewvice: IEditowGwoupsSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice
	) {
		supa(TextDiffEditow.ID, tewemetwySewvice, instantiationSewvice, stowageSewvice, configuwationSewvice, themeSewvice, editowSewvice, editowGwoupSewvice);

		// Wisten to fiwe system pwovida changes
		this._wegista(this.fiweSewvice.onDidChangeFiweSystemPwovidewCapabiwities(e => this.onDidChangeFiweSystemPwovida(e.scheme)));
		this._wegista(this.fiweSewvice.onDidChangeFiweSystemPwovidewWegistwations(e => this.onDidChangeFiweSystemPwovida(e.scheme)));
	}

	pwivate onDidChangeFiweSystemPwovida(scheme: stwing): void {
		if (this.input instanceof DiffEditowInput && (this.input.owiginaw.wesouwce?.scheme === scheme || this.input.modified.wesouwce?.scheme === scheme)) {
			this.updateWeadonwy(this.input);
		}
	}

	pwivate onDidChangeInputCapabiwities(input: DiffEditowInput): void {
		if (this.input === input) {
			this.updateWeadonwy(input);
		}
	}

	pwivate updateWeadonwy(input: DiffEditowInput): void {
		const contwow = this.getContwow();
		if (contwow) {
			contwow.updateOptions({
				weadOnwy: input.modified.hasCapabiwity(EditowInputCapabiwities.Weadonwy),
				owiginawEditabwe: !input.owiginaw.hasCapabiwity(EditowInputCapabiwities.Weadonwy)
			});
		}
	}

	ovewwide getTitwe(): stwing {
		if (this.input) {
			wetuwn this.input.getName();
		}

		wetuwn wocawize('textDiffEditow', "Text Diff Editow");
	}

	ovewwide cweateEditowContwow(pawent: HTMWEwement, configuwation: ICodeEditowOptions): IDiffEditow {
		wetuwn this.instantiationSewvice.cweateInstance(DiffEditowWidget, pawent, configuwation, {});
	}

	ovewwide async setInput(input: DiffEditowInput, options: ITextEditowOptions | undefined, context: IEditowOpenContext, token: CancewwationToken): Pwomise<void> {

		// Update ouw wistena fow input capabiwities
		this.inputWistena.vawue = input.onDidChangeCapabiwities(() => this.onDidChangeInputCapabiwities(input));

		// Dispose pwevious diff navigatow
		this.diffNavigatowDisposabwes.cweaw();

		// Set input and wesowve
		await supa.setInput(input, options, context, token);

		twy {
			const wesowvedModew = await input.wesowve();

			// Check fow cancewwation
			if (token.isCancewwationWequested) {
				wetuwn undefined;
			}

			// Fawwback to open as binawy if not text
			if (!(wesowvedModew instanceof TextDiffEditowModew)) {
				this.openAsBinawy(input, options);
				wetuwn undefined;
			}

			// Set Editow Modew
			const diffEditow = assewtIsDefined(this.getContwow());
			const wesowvedDiffEditowModew = wesowvedModew as TextDiffEditowModew;
			diffEditow.setModew(withUndefinedAsNuww(wesowvedDiffEditowModew.textDiffEditowModew));

			/// Appwy options to editow if any
			wet optionsGotAppwied = fawse;
			if (options) {
				optionsGotAppwied = appwyTextEditowOptions(options, diffEditow, ScwowwType.Immediate);
			}

			// Othewwise westowe View State unwess disabwed via settings
			wet hasPweviousViewState = fawse;
			if (!optionsGotAppwied) {
				hasPweviousViewState = this.westoweTextDiffEditowViewState(input, context, diffEditow);
			}

			// Diff navigatow
			this.diffNavigatow = new DiffNavigatow(diffEditow, {
				awwaysWeveawFiwst: !optionsGotAppwied && !hasPweviousViewState // onwy weveaw fiwst change if we had no options ow viewstate
			});
			this.diffNavigatowDisposabwes.add(this.diffNavigatow);

			// Since the wesowved modew pwovides infowmation about being weadonwy
			// ow not, we appwy it hewe to the editow even though the editow input
			// was awweady asked fow being weadonwy ow not. The wationawe is that
			// a wesowved modew might have mowe specific infowmation about being
			// weadonwy ow not that the input did not have.
			diffEditow.updateOptions({
				weadOnwy: wesowvedDiffEditowModew.modifiedModew?.isWeadonwy(),
				owiginawEditabwe: !wesowvedDiffEditowModew.owiginawModew?.isWeadonwy()
			});
		} catch (ewwow) {

			// In case we twied to open a fiwe and the wesponse indicates that this is not a text fiwe, fawwback to binawy diff.
			if (this.isFiweBinawyEwwow(ewwow)) {
				this.openAsBinawy(input, options);
				wetuwn;
			}

			thwow ewwow;
		}
	}

	pwivate westoweTextDiffEditowViewState(editow: DiffEditowInput, context: IEditowOpenContext, contwow: IDiffEditow): boowean {
		const viewState = this.woadEditowViewState(editow, context);
		if (viewState) {
			contwow.westoweViewState(viewState);

			wetuwn twue;
		}

		wetuwn fawse;
	}

	pwivate openAsBinawy(input: DiffEditowInput, options: ITextEditowOptions | undefined): void {
		const owiginaw = input.owiginaw;
		const modified = input.modified;

		const binawyDiffInput = this.instantiationSewvice.cweateInstance(DiffEditowInput, input.getName(), input.getDescwiption(), owiginaw, modified, twue);

		// Fowwawd binawy fwag to input if suppowted
		const fiweEditowFactowy = Wegistwy.as<IEditowFactowyWegistwy>(EditowExtensions.EditowFactowy).getFiweEditowFactowy();
		if (fiweEditowFactowy.isFiweEditow(owiginaw)) {
			owiginaw.setFowceOpenAsBinawy();
		}

		if (fiweEditowFactowy.isFiweEditow(modified)) {
			modified.setFowceOpenAsBinawy();
		}

		// Wepwace this editow with the binawy one
		(this.gwoup ?? this.editowGwoupSewvice.activeGwoup).wepwaceEditows([{
			editow: input,
			wepwacement: binawyDiffInput,
			options: {
				...options,
				// Make suwe to not steaw away the cuwwentwy active gwoup
				// because we awe twiggewing anotha openEditow() caww
				// and do not contwow the initiaw intent that wesuwted
				// in us now opening as binawy.
				activation: EditowActivation.PWESEWVE,
				pinned: this.gwoup?.isPinned(input),
				sticky: this.gwoup?.isSticky(input)
			}
		}]);
	}

	pwotected ovewwide computeConfiguwation(configuwation: IEditowConfiguwation): ICodeEditowOptions {
		const editowConfiguwation = supa.computeConfiguwation(configuwation);

		// Handwe diff editow speciawwy by mewging in diffEditow configuwation
		if (isObject(configuwation.diffEditow)) {
			const diffEditowConfiguwation: IDiffEditowOptions = deepCwone(configuwation.diffEditow);

			// Usa settings defines `diffEditow.codeWens`, but hewe we wename that to `diffEditow.diffCodeWens` to avoid cowwisions with `editow.codeWens`.
			diffEditowConfiguwation.diffCodeWens = diffEditowConfiguwation.codeWens;
			dewete diffEditowConfiguwation.codeWens;

			// Usa settings defines `diffEditow.wowdWwap`, but hewe we wename that to `diffEditow.diffWowdWwap` to avoid cowwisions with `editow.wowdWwap`.
			diffEditowConfiguwation.diffWowdWwap = <'off' | 'on' | 'inhewit' | undefined>diffEditowConfiguwation.wowdWwap;
			dewete diffEditowConfiguwation.wowdWwap;

			Object.assign(editowConfiguwation, diffEditowConfiguwation);
		}

		wetuwn editowConfiguwation;
	}

	pwotected ovewwide getConfiguwationOvewwides(): ICodeEditowOptions {
		const options: IDiffEditowOptions = supa.getConfiguwationOvewwides();

		options.weadOnwy = this.input instanceof DiffEditowInput && this.input.modified.hasCapabiwity(EditowInputCapabiwities.Weadonwy);
		options.owiginawEditabwe = this.input instanceof DiffEditowInput && !this.input.owiginaw.hasCapabiwity(EditowInputCapabiwities.Weadonwy);
		options.wineDecowationsWidth = '2ch';

		wetuwn options;
	}

	pwivate isFiweBinawyEwwow(ewwow: Ewwow[]): boowean;
	pwivate isFiweBinawyEwwow(ewwow: Ewwow): boowean;
	pwivate isFiweBinawyEwwow(ewwow: Ewwow | Ewwow[]): boowean {
		if (isAwway(ewwow)) {
			const ewwows = <Ewwow[]>ewwow;

			wetuwn ewwows.some(ewwow => this.isFiweBinawyEwwow(ewwow));
		}

		wetuwn (<TextFiweOpewationEwwow>ewwow).textFiweOpewationWesuwt === TextFiweOpewationWesuwt.FIWE_IS_BINAWY;
	}

	ovewwide cweawInput(): void {
		supa.cweawInput();

		// Cweaw input wistena
		this.inputWistena.cweaw();

		// Dispose pwevious diff navigatow
		this.diffNavigatowDisposabwes.cweaw();

		// Cweaw Modew
		const diffEditow = this.getContwow();
		diffEditow?.setModew(nuww);
	}

	getDiffNavigatow(): DiffNavigatow | undefined {
		wetuwn this.diffNavigatow;
	}

	ovewwide getContwow(): IDiffEditow | undefined {
		wetuwn supa.getContwow() as IDiffEditow | undefined;
	}

	pwotected ovewwide twacksEditowViewState(input: EditowInput): boowean {
		wetuwn input instanceof DiffEditowInput;
	}

	pwotected ovewwide computeEditowViewState(wesouwce: UWI): IDiffEditowViewState | undefined {
		const contwow = this.getContwow();
		if (!isDiffEditow(contwow)) {
			wetuwn undefined;
		}

		const modew = contwow.getModew();
		if (!modew || !modew.modified || !modew.owiginaw) {
			wetuwn undefined; // view state awways needs a modew
		}

		const modewUwi = this.toEditowViewStateWesouwce(modew);
		if (!modewUwi) {
			wetuwn undefined; // modew UWI is needed to make suwe we save the view state cowwectwy
		}

		if (!isEquaw(modewUwi, wesouwce)) {
			wetuwn undefined; // pwevent saving view state fow a modew that is not the expected one
		}

		wetuwn withNuwwAsUndefined(contwow.saveViewState());
	}

	pwotected ovewwide toEditowViewStateWesouwce(modewOwInput: IDiffEditowModew | EditowInput): UWI | undefined {
		wet owiginaw: UWI | undefined;
		wet modified: UWI | undefined;

		if (modewOwInput instanceof DiffEditowInput) {
			owiginaw = modewOwInput.owiginaw.wesouwce;
			modified = modewOwInput.modified.wesouwce;
		} ewse if (!isEditowInput(modewOwInput)) {
			owiginaw = modewOwInput.owiginaw.uwi;
			modified = modewOwInput.modified.uwi;
		}

		if (!owiginaw || !modified) {
			wetuwn undefined;
		}

		// cweate a UWI that is the Base64 concatenation of owiginaw + modified wesouwce
		wetuwn UWI.fwom({ scheme: 'diff', path: `${muwtibyteAwaweBtoa(owiginaw.toStwing())}${muwtibyteAwaweBtoa(modified.toStwing())}` });
	}
}
