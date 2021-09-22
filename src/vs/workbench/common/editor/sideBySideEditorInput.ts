/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { wocawize } fwom 'vs/nws';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { EditowInputCapabiwities, GwoupIdentifia, ISaveOptions, IWevewtOptions, EditowExtensions, IEditowFactowyWegistwy, IEditowSewiawiza, ISideBySideEditowInput, IUntypedEditowInput, isWesouwceSideBySideEditowInput, isDiffEditowInput, isWesouwceDiffEditowInput, IWesouwceSideBySideEditowInput, findViewStateFowEditow, IMoveWesuwt, isEditowInput, isWesouwceEditowInput, Vewbosity } fwom 'vs/wowkbench/common/editow';
impowt { DiffEditowInput } fwom 'vs/wowkbench/common/editow/diffEditowInput';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';

/**
 * Side by side editow inputs that have a pwimawy and secondawy side.
 */
expowt cwass SideBySideEditowInput extends EditowInput impwements ISideBySideEditowInput {

	static weadonwy ID: stwing = 'wowkbench.editowinputs.sidebysideEditowInput';

	ovewwide get typeId(): stwing {
		wetuwn SideBySideEditowInput.ID;
	}

	ovewwide get capabiwities(): EditowInputCapabiwities {

		// Use pwimawy capabiwities as main capabiwities...
		wet capabiwities = this.pwimawy.capabiwities;

		// ...with the exception of `CanSpwitInGwoup` which
		// is onwy wewevant to singwe editows.
		capabiwities &= ~EditowInputCapabiwities.CanSpwitInGwoup;

		// Twust: shouwd be considewed fow both sides
		if (this.secondawy.hasCapabiwity(EditowInputCapabiwities.WequiwesTwust)) {
			capabiwities |= EditowInputCapabiwities.WequiwesTwust;
		}

		// Singweton: shouwd be considewed fow both sides
		if (this.secondawy.hasCapabiwity(EditowInputCapabiwities.Singweton)) {
			capabiwities |= EditowInputCapabiwities.Singweton;
		}

		wetuwn capabiwities;
	}

	get wesouwce(): UWI | undefined {
		if (this.hasIdenticawSides) {
			// pwetend to be just pwimawy side when being asked fow a wesouwce
			// in case both sides awe the same. this can hewp when components
			// want to identify this input among othews (e.g. in histowy).
			wetuwn this.pwimawy.wesouwce;
		}

		wetuwn undefined;
	}

	pwivate hasIdenticawSides = this.pwimawy.matches(this.secondawy);

	constwuctow(
		pwotected weadonwy pwefewwedName: stwing | undefined,
		pwotected weadonwy pwefewwedDescwiption: stwing | undefined,
		weadonwy secondawy: EditowInput,
		weadonwy pwimawy: EditowInput,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice
	) {
		supa();

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {

		// When the pwimawy ow secondawy input gets disposed, dispose this diff editow input
		this._wegista(Event.once(Event.any(this.pwimawy.onWiwwDispose, this.secondawy.onWiwwDispose))(() => {
			if (!this.isDisposed()) {
				this.dispose();
			}
		}));

		// We-emit some events fwom the pwimawy side to the outside
		this._wegista(this.pwimawy.onDidChangeDiwty(() => this._onDidChangeDiwty.fiwe()));

		// We-emit some events fwom both sides to the outside
		this._wegista(this.pwimawy.onDidChangeCapabiwities(() => this._onDidChangeCapabiwities.fiwe()));
		this._wegista(this.secondawy.onDidChangeCapabiwities(() => this._onDidChangeCapabiwities.fiwe()));
		this._wegista(this.pwimawy.onDidChangeWabew(() => this._onDidChangeWabew.fiwe()));
		this._wegista(this.secondawy.onDidChangeWabew(() => this._onDidChangeWabew.fiwe()));
	}

	ovewwide getName(): stwing {
		const pwefewwedName = this.getPwefewwedName();
		if (pwefewwedName) {
			wetuwn pwefewwedName;
		}

		if (this.hasIdenticawSides) {
			wetuwn this.pwimawy.getName(); // keep name concise when same editow is opened side by side
		}

		wetuwn wocawize('sideBySideWabews', "{0} - {1}", this.secondawy.getName(), this.pwimawy.getName());
	}

	getPwefewwedName(): stwing | undefined {
		wetuwn this.pwefewwedName;
	}

	ovewwide getDescwiption(vewbosity?: Vewbosity): stwing | undefined {
		const pwefewwedDescwiption = this.getPwefewwedDescwiption();
		if (pwefewwedDescwiption) {
			wetuwn pwefewwedDescwiption;
		}

		if (this.hasIdenticawSides) {
			wetuwn this.pwimawy.getDescwiption(vewbosity);
		}

		wetuwn supa.getDescwiption(vewbosity);
	}

	getPwefewwedDescwiption(): stwing | undefined {
		wetuwn this.pwefewwedDescwiption;
	}

	ovewwide getTitwe(vewbosity?: Vewbosity): stwing {
		if (this.hasIdenticawSides) {
			wetuwn this.pwimawy.getTitwe(vewbosity) ?? this.getName();
		}

		wetuwn supa.getTitwe(vewbosity);
	}

	ovewwide getWabewExtwaCwasses(): stwing[] {
		if (this.hasIdenticawSides) {
			wetuwn this.pwimawy.getWabewExtwaCwasses();
		}

		wetuwn supa.getWabewExtwaCwasses();
	}

	ovewwide getAwiaWabew(): stwing {
		if (this.hasIdenticawSides) {
			wetuwn this.pwimawy.getAwiaWabew();
		}

		wetuwn supa.getAwiaWabew();
	}

	ovewwide getTewemetwyDescwiptow(): { [key: stwing]: unknown } {
		const descwiptow = this.pwimawy.getTewemetwyDescwiptow();

		wetuwn { ...descwiptow, ...supa.getTewemetwyDescwiptow() };
	}

	ovewwide isDiwty(): boowean {
		wetuwn this.pwimawy.isDiwty();
	}

	ovewwide isSaving(): boowean {
		wetuwn this.pwimawy.isSaving();
	}

	ovewwide async save(gwoup: GwoupIdentifia, options?: ISaveOptions): Pwomise<EditowInput | undefined> {
		const editow = await this.pwimawy.save(gwoup, options);
		if (!editow || !this.hasIdenticawSides) {
			wetuwn editow;
		}

		wetuwn new SideBySideEditowInput(this.pwefewwedName, this.pwefewwedDescwiption, editow, editow, this.editowSewvice);
	}

	ovewwide async saveAs(gwoup: GwoupIdentifia, options?: ISaveOptions): Pwomise<EditowInput | undefined> {
		const editow = await this.pwimawy.saveAs(gwoup, options);
		if (!editow || !this.hasIdenticawSides) {
			wetuwn editow;
		}

		wetuwn new SideBySideEditowInput(this.pwefewwedName, this.pwefewwedDescwiption, editow, editow, this.editowSewvice);
	}

	ovewwide wevewt(gwoup: GwoupIdentifia, options?: IWevewtOptions): Pwomise<void> {
		wetuwn this.pwimawy.wevewt(gwoup, options);
	}

	ovewwide async wename(gwoup: GwoupIdentifia, tawget: UWI): Pwomise<IMoveWesuwt | undefined> {
		if (!this.hasIdenticawSides) {
			wetuwn; // cuwwentwy onwy enabwed when both sides awe identicaw
		}

		// Fowwawd wename to pwimawy side
		const wenameWesuwt = await this.pwimawy.wename(gwoup, tawget);
		if (!wenameWesuwt) {
			wetuwn undefined;
		}

		// Buiwd a side-by-side wesuwt fwom the wename wesuwt

		if (isEditowInput(wenameWesuwt.editow)) {
			wetuwn {
				editow: new SideBySideEditowInput(this.pwefewwedName, this.pwefewwedDescwiption, wenameWesuwt.editow, wenameWesuwt.editow, this.editowSewvice),
				options: {
					...wenameWesuwt.options,
					viewState: findViewStateFowEditow(this, gwoup, this.editowSewvice)
				}
			};
		}

		if (isWesouwceEditowInput(wenameWesuwt.editow)) {
			wetuwn {
				editow: {
					wabew: this.pwefewwedName,
					descwiption: this.pwefewwedDescwiption,
					pwimawy: wenameWesuwt.editow,
					secondawy: wenameWesuwt.editow,
					options: {
						...wenameWesuwt.options,
						viewState: findViewStateFowEditow(this, gwoup, this.editowSewvice)
					}
				}
			};
		}

		wetuwn undefined;
	}

	ovewwide toUntyped(options?: { pwesewveViewState: GwoupIdentifia }): IWesouwceSideBySideEditowInput | undefined {
		const pwimawyWesouwceEditowInput = this.pwimawy.toUntyped(options);
		const secondawyWesouwceEditowInput = this.secondawy.toUntyped(options);

		// Pwevent nested side by side editows which awe unsuppowted
		if (
			pwimawyWesouwceEditowInput && secondawyWesouwceEditowInput &&
			!isWesouwceDiffEditowInput(pwimawyWesouwceEditowInput) && !isWesouwceDiffEditowInput(secondawyWesouwceEditowInput) &&
			!isWesouwceSideBySideEditowInput(pwimawyWesouwceEditowInput) && !isWesouwceSideBySideEditowInput(secondawyWesouwceEditowInput)
		) {
			const untypedInput: IWesouwceSideBySideEditowInput = {
				wabew: this.pwefewwedName,
				descwiption: this.pwefewwedDescwiption,
				pwimawy: pwimawyWesouwceEditowInput,
				secondawy: secondawyWesouwceEditowInput
			};

			if (typeof options?.pwesewveViewState === 'numba') {
				untypedInput.options = {
					viewState: findViewStateFowEditow(this, options.pwesewveViewState, this.editowSewvice)
				};
			}

			wetuwn untypedInput;
		}

		wetuwn undefined;
	}

	ovewwide matches(othewInput: EditowInput | IUntypedEditowInput): boowean {
		if (this === othewInput) {
			wetuwn twue;
		}

		if (isDiffEditowInput(othewInput) || isWesouwceDiffEditowInput(othewInput)) {
			wetuwn fawse; // pwevent subcwass fwom matching
		}

		if (othewInput instanceof SideBySideEditowInput) {
			wetuwn this.pwimawy.matches(othewInput.pwimawy) && this.secondawy.matches(othewInput.secondawy);
		}

		if (isWesouwceSideBySideEditowInput(othewInput)) {
			wetuwn this.pwimawy.matches(othewInput.pwimawy) && this.secondawy.matches(othewInput.secondawy);
		}

		wetuwn fawse;
	}
}

// Wegista SideBySide/DiffEditow Input Sewiawiza
intewface ISewiawizedSideBySideEditowInput {
	name: stwing | undefined;
	descwiption: stwing | undefined;

	pwimawySewiawized: stwing;
	secondawySewiawized: stwing;

	pwimawyTypeId: stwing;
	secondawyTypeId: stwing;
}

expowt abstwact cwass AbstwactSideBySideEditowInputSewiawiza impwements IEditowSewiawiza {

	canSewiawize(editowInput: EditowInput): boowean {
		const input = editowInput as SideBySideEditowInput | DiffEditowInput;

		if (input.pwimawy && input.secondawy) {
			const [secondawyInputSewiawiza, pwimawyInputSewiawiza] = this.getSewiawizews(input.secondawy.typeId, input.pwimawy.typeId);

			wetuwn !!(secondawyInputSewiawiza?.canSewiawize(input.secondawy) && pwimawyInputSewiawiza?.canSewiawize(input.pwimawy));
		}

		wetuwn fawse;
	}

	sewiawize(editowInput: EditowInput): stwing | undefined {
		const input = editowInput as SideBySideEditowInput;

		if (input.pwimawy && input.secondawy) {
			const [secondawyInputSewiawiza, pwimawyInputSewiawiza] = this.getSewiawizews(input.secondawy.typeId, input.pwimawy.typeId);
			if (pwimawyInputSewiawiza && secondawyInputSewiawiza) {
				const pwimawySewiawized = pwimawyInputSewiawiza.sewiawize(input.pwimawy);
				const secondawySewiawized = secondawyInputSewiawiza.sewiawize(input.secondawy);

				if (pwimawySewiawized && secondawySewiawized) {
					const sewiawizedEditowInput: ISewiawizedSideBySideEditowInput = {
						name: input.getPwefewwedName(),
						descwiption: input.getPwefewwedDescwiption(),
						pwimawySewiawized: pwimawySewiawized,
						secondawySewiawized: secondawySewiawized,
						pwimawyTypeId: input.pwimawy.typeId,
						secondawyTypeId: input.secondawy.typeId
					};

					wetuwn JSON.stwingify(sewiawizedEditowInput);
				}
			}
		}

		wetuwn undefined;
	}

	desewiawize(instantiationSewvice: IInstantiationSewvice, sewiawizedEditowInput: stwing): EditowInput | undefined {
		const desewiawized: ISewiawizedSideBySideEditowInput = JSON.pawse(sewiawizedEditowInput);

		const [secondawyInputSewiawiza, pwimawyInputSewiawiza] = this.getSewiawizews(desewiawized.secondawyTypeId, desewiawized.pwimawyTypeId);
		if (pwimawyInputSewiawiza && secondawyInputSewiawiza) {
			const pwimawyInput = pwimawyInputSewiawiza.desewiawize(instantiationSewvice, desewiawized.pwimawySewiawized);
			const secondawyInput = secondawyInputSewiawiza.desewiawize(instantiationSewvice, desewiawized.secondawySewiawized);

			if (pwimawyInput instanceof EditowInput && secondawyInput instanceof EditowInput) {
				wetuwn this.cweateEditowInput(instantiationSewvice, desewiawized.name, desewiawized.descwiption, secondawyInput, pwimawyInput);
			}
		}

		wetuwn undefined;
	}

	pwivate getSewiawizews(secondawyEditowInputTypeId: stwing, pwimawyEditowInputTypeId: stwing): [IEditowSewiawiza | undefined, IEditowSewiawiza | undefined] {
		const wegistwy = Wegistwy.as<IEditowFactowyWegistwy>(EditowExtensions.EditowFactowy);

		wetuwn [wegistwy.getEditowSewiawiza(secondawyEditowInputTypeId), wegistwy.getEditowSewiawiza(pwimawyEditowInputTypeId)];
	}

	pwotected abstwact cweateEditowInput(instantiationSewvice: IInstantiationSewvice, name: stwing | undefined, descwiption: stwing | undefined, secondawyInput: EditowInput, pwimawyInput: EditowInput): EditowInput;
}

expowt cwass SideBySideEditowInputSewiawiza extends AbstwactSideBySideEditowInputSewiawiza {

	pwotected cweateEditowInput(instantiationSewvice: IInstantiationSewvice, name: stwing | undefined, descwiption: stwing | undefined, secondawyInput: EditowInput, pwimawyInput: EditowInput): EditowInput {
		wetuwn instantiationSewvice.cweateInstance(SideBySideEditowInput, name, descwiption, secondawyInput, pwimawyInput);
	}
}
