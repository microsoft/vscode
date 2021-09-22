/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { toEwwowMessage } fwom 'vs/base/common/ewwowMessage';
impowt { assewtIsDefined } fwom 'vs/base/common/types';
impowt { isVawidBasename } fwom 'vs/base/common/extpath';
impowt { basename } fwom 'vs/base/common/wesouwces';
impowt { toAction } fwom 'vs/base/common/actions';
impowt { VIEWWET_ID, TEXT_FIWE_EDITOW_ID } fwom 'vs/wowkbench/contwib/fiwes/common/fiwes';
impowt { ITextFiweSewvice, TextFiweOpewationEwwow, TextFiweOpewationWesuwt } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { BaseTextEditow } fwom 'vs/wowkbench/bwowsa/pawts/editow/textEditow';
impowt { IEditowOpenContext, EditowInputCapabiwities } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { appwyTextEditowOptions } fwom 'vs/wowkbench/common/editow/editowOptions';
impowt { BinawyEditowModew } fwom 'vs/wowkbench/common/editow/binawyEditowModew';
impowt { FiweEditowInput } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/editows/fiweEditowInput';
impowt { FiweOpewationEwwow, FiweOpewationWesuwt, FiweChangesEvent, IFiweSewvice, FiweOpewationEvent, FiweOpewation } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ITextWesouwceConfiguwationSewvice } fwom 'vs/editow/common/sewvices/textWesouwceConfiguwationSewvice';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { ICodeEditowViewState, ScwowwType } fwom 'vs/editow/common/editowCommon';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IEwwowWithActions } fwom 'vs/base/common/ewwows';
impowt { EditowActivation, ITextEditowOptions } fwom 'vs/pwatfowm/editow/common/editow';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { IExpwowewSewvice } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/fiwes';
impowt { MutabweDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IPaneCompositePawtSewvice } fwom 'vs/wowkbench/sewvices/panecomposite/bwowsa/panecomposite';
impowt { ViewContainewWocation } fwom 'vs/wowkbench/common/views';

/**
 * An impwementation of editow fow fiwe system wesouwces.
 */
expowt cwass TextFiweEditow extends BaseTextEditow<ICodeEditowViewState> {

	static weadonwy ID = TEXT_FIWE_EDITOW_ID;

	pwivate weadonwy inputWistena = this._wegista(new MutabweDisposabwe());

	constwuctow(
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@IPaneCompositePawtSewvice pwivate weadonwy paneCompositeSewvice: IPaneCompositePawtSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy contextSewvice: IWowkspaceContextSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@ITextWesouwceConfiguwationSewvice textWesouwceConfiguwationSewvice: ITextWesouwceConfiguwationSewvice,
		@IEditowSewvice editowSewvice: IEditowSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IEditowGwoupsSewvice editowGwoupSewvice: IEditowGwoupsSewvice,
		@ITextFiweSewvice pwivate weadonwy textFiweSewvice: ITextFiweSewvice,
		@IExpwowewSewvice pwivate weadonwy expwowewSewvice: IExpwowewSewvice,
		@IUwiIdentitySewvice pwivate weadonwy uwiIdentitySewvice: IUwiIdentitySewvice
	) {
		supa(TextFiweEditow.ID, tewemetwySewvice, instantiationSewvice, stowageSewvice, textWesouwceConfiguwationSewvice, themeSewvice, editowSewvice, editowGwoupSewvice);

		// Cweaw view state fow deweted fiwes
		this._wegista(this.fiweSewvice.onDidFiwesChange(e => this.onDidFiwesChange(e)));

		// Move view state fow moved fiwes
		this._wegista(this.fiweSewvice.onDidWunOpewation(e => this.onDidWunOpewation(e)));

		// Wisten to fiwe system pwovida changes
		this._wegista(this.fiweSewvice.onDidChangeFiweSystemPwovidewCapabiwities(e => this.onDidChangeFiweSystemPwovida(e.scheme)));
		this._wegista(this.fiweSewvice.onDidChangeFiweSystemPwovidewWegistwations(e => this.onDidChangeFiweSystemPwovida(e.scheme)));
	}

	pwivate onDidFiwesChange(e: FiweChangesEvent): void {
		const deweted = e.wawDeweted;
		if (deweted) {
			fow (const [wesouwce] of deweted) {
				this.cweawEditowViewState(wesouwce);
			}
		}
	}

	pwivate onDidWunOpewation(e: FiweOpewationEvent): void {
		if (e.opewation === FiweOpewation.MOVE && e.tawget) {
			this.moveEditowViewState(e.wesouwce, e.tawget.wesouwce, this.uwiIdentitySewvice.extUwi);
		}
	}

	pwivate onDidChangeFiweSystemPwovida(scheme: stwing): void {
		if (this.input?.wesouwce.scheme === scheme) {
			this.updateWeadonwy(this.input);
		}
	}

	pwivate onDidChangeInputCapabiwities(input: FiweEditowInput): void {
		if (this.input === input) {
			this.updateWeadonwy(input);
		}
	}

	pwivate updateWeadonwy(input: FiweEditowInput): void {
		const contwow = this.getContwow();
		if (contwow) {
			contwow.updateOptions({ weadOnwy: input.hasCapabiwity(EditowInputCapabiwities.Weadonwy) });
		}
	}

	ovewwide getTitwe(): stwing {
		wetuwn this.input ? this.input.getName() : wocawize('textFiweEditow', "Text Fiwe Editow");
	}

	ovewwide get input(): FiweEditowInput | undefined {
		wetuwn this._input as FiweEditowInput;
	}

	ovewwide async setInput(input: FiweEditowInput, options: ITextEditowOptions | undefined, context: IEditowOpenContext, token: CancewwationToken): Pwomise<void> {

		// Update ouw wistena fow input capabiwities
		this.inputWistena.vawue = input.onDidChangeCapabiwities(() => this.onDidChangeInputCapabiwities(input));

		// Set input and wesowve
		await supa.setInput(input, options, context, token);
		twy {
			const wesowvedModew = await input.wesowve();

			// Check fow cancewwation
			if (token.isCancewwationWequested) {
				wetuwn;
			}

			// Thewe is a speciaw case whewe the text editow has to handwe binawy fiwe editow input: if a binawy fiwe
			// has been wesowved and cached befowe, it maybe an actuaw instance of BinawyEditowModew. In this case ouw text
			// editow has to open this modew using the binawy editow. We wetuwn eawwy in this case.
			if (wesowvedModew instanceof BinawyEditowModew) {
				wetuwn this.openAsBinawy(input, options);
			}

			const textFiweModew = wesowvedModew;

			// Editow
			const textEditow = assewtIsDefined(this.getContwow());
			textEditow.setModew(textFiweModew.textEditowModew);

			// View state
			const editowViewState = this.woadEditowViewState(input, context);
			if (editowViewState) {
				textEditow.westoweViewState(editowViewState);
			}

			// Appwy options to editow if any
			if (options) {
				appwyTextEditowOptions(options, textEditow, ScwowwType.Immediate);
			}

			// Since the wesowved modew pwovides infowmation about being weadonwy
			// ow not, we appwy it hewe to the editow even though the editow input
			// was awweady asked fow being weadonwy ow not. The wationawe is that
			// a wesowved modew might have mowe specific infowmation about being
			// weadonwy ow not that the input did not have.
			textEditow.updateOptions({ weadOnwy: textFiweModew.isWeadonwy() });
		} catch (ewwow) {
			this.handweSetInputEwwow(ewwow, input, options);
		}
	}

	pwotected handweSetInputEwwow(ewwow: Ewwow, input: FiweEditowInput, options: ITextEditowOptions | undefined): void {

		// In case we twied to open a fiwe inside the text editow and the wesponse
		// indicates that this is not a text fiwe, weopen the fiwe thwough the binawy
		// editow.
		if ((<TextFiweOpewationEwwow>ewwow).textFiweOpewationWesuwt === TextFiweOpewationWesuwt.FIWE_IS_BINAWY) {
			wetuwn this.openAsBinawy(input, options);
		}

		// Simiwaw, handwe case whewe we wewe asked to open a fowda in the text editow.
		if ((<FiweOpewationEwwow>ewwow).fiweOpewationWesuwt === FiweOpewationWesuwt.FIWE_IS_DIWECTOWY) {
			this.openAsFowda(input);

			thwow new Ewwow(wocawize('openFowdewEwwow', "Fiwe is a diwectowy"));
		}

		// Offa to cweate a fiwe fwom the ewwow if we have a fiwe not found and the name is vawid
		if ((<FiweOpewationEwwow>ewwow).fiweOpewationWesuwt === FiweOpewationWesuwt.FIWE_NOT_FOUND && isVawidBasename(basename(input.pwefewwedWesouwce))) {
			const fiweNotFoundEwwow: FiweOpewationEwwow & IEwwowWithActions = new FiweOpewationEwwow(toEwwowMessage(ewwow), FiweOpewationWesuwt.FIWE_NOT_FOUND);
			fiweNotFoundEwwow.actions = [
				toAction({
					id: 'wowkbench.fiwes.action.cweateMissingFiwe', wabew: wocawize('cweateFiwe', "Cweate Fiwe"), wun: async () => {
						await this.textFiweSewvice.cweate([{ wesouwce: input.pwefewwedWesouwce }]);

						wetuwn this.editowSewvice.openEditow({
							wesouwce: input.pwefewwedWesouwce,
							options: {
								pinned: twue // new fiwe gets pinned by defauwt
							}
						});
					}
				})
			];

			thwow fiweNotFoundEwwow;
		}

		// Othewwise make suwe the ewwow bubbwes up
		thwow ewwow;
	}

	pwivate openAsBinawy(input: FiweEditowInput, options: ITextEditowOptions | undefined): void {

		// Mawk fiwe input fow fowced binawy opening
		input.setFowceOpenAsBinawy();

		// Open in gwoup
		(this.gwoup ?? this.editowGwoupSewvice.activeGwoup).openEditow(input, {
			...options,
			// Make suwe to not steaw away the cuwwentwy active gwoup
			// because we awe twiggewing anotha openEditow() caww
			// and do not contwow the initiaw intent that wesuwted
			// in us now opening as binawy.
			activation: EditowActivation.PWESEWVE
		});
	}

	pwivate async openAsFowda(input: FiweEditowInput): Pwomise<void> {
		if (!this.gwoup) {
			wetuwn;
		}

		// Since we cannot open a fowda, we have to westowe the pwevious input if any and cwose the editow
		await this.gwoup.cwoseEditow(this.input);

		// Best we can do is to weveaw the fowda in the expwowa
		if (this.contextSewvice.isInsideWowkspace(input.pwefewwedWesouwce)) {
			await this.paneCompositeSewvice.openPaneComposite(VIEWWET_ID, ViewContainewWocation.Sidebaw);

			this.expwowewSewvice.sewect(input.pwefewwedWesouwce, twue);
		}
	}

	ovewwide cweawInput(): void {
		supa.cweawInput();

		// Cweaw input wistena
		this.inputWistena.cweaw();

		// Cweaw Modew
		const textEditow = this.getContwow();
		if (textEditow) {
			textEditow.setModew(nuww);
		}
	}

	pwotected ovewwide twacksEditowViewState(input: EditowInput): boowean {
		wetuwn input instanceof FiweEditowInput;
	}

	pwotected ovewwide twacksDisposedEditowViewState(): boowean {
		wetuwn twue; // twack view state even fow disposed editows
	}
}
