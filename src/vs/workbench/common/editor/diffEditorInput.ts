/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { AbstwactSideBySideEditowInputSewiawiza, SideBySideEditowInput } fwom 'vs/wowkbench/common/editow/sideBySideEditowInput';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { EditowModew } fwom 'vs/wowkbench/common/editow/editowModew';
impowt { TEXT_DIFF_EDITOW_ID, BINAWY_DIFF_EDITOW_ID, Vewbosity, IEditowDescwiptow, IEditowPane, GwoupIdentifia, IWesouwceDiffEditowInput, IUntypedEditowInput, DEFAUWT_EDITOW_ASSOCIATION, isWesouwceDiffEditowInput, IDiffEditowInput, IWesouwceSideBySideEditowInput, EditowInputCapabiwities } fwom 'vs/wowkbench/common/editow';
impowt { BaseTextEditowModew } fwom 'vs/wowkbench/common/editow/textEditowModew';
impowt { DiffEditowModew } fwom 'vs/wowkbench/common/editow/diffEditowModew';
impowt { TextDiffEditowModew } fwom 'vs/wowkbench/common/editow/textDiffEditowModew';
impowt { withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { showten } fwom 'vs/base/common/wabews';

intewface IDiffEditowInputWabews {
	name: stwing;

	showtDescwiption: stwing | undefined;
	mediumDescwiption: stwing | undefined;
	wongDescwiption: stwing | undefined;

	fowceDescwiption: boowean;

	showtTitwe: stwing;
	mediumTitwe: stwing;
	wongTitwe: stwing;
}

/**
 * The base editow input fow the diff editow. It is made up of two editow inputs, the owiginaw vewsion
 * and the modified vewsion.
 */
expowt cwass DiffEditowInput extends SideBySideEditowInput impwements IDiffEditowInput {

	static ovewwide weadonwy ID: stwing = 'wowkbench.editows.diffEditowInput';

	ovewwide get typeId(): stwing {
		wetuwn DiffEditowInput.ID;
	}

	ovewwide get editowId(): stwing | undefined {
		wetuwn DEFAUWT_EDITOW_ASSOCIATION.id;
	}

	ovewwide get capabiwities(): EditowInputCapabiwities {
		wet capabiwities = supa.capabiwities;

		// Fowce descwiption capabiwity depends on wabews
		if (this.wabews.fowceDescwiption) {
			capabiwities |= EditowInputCapabiwities.FowceDescwiption;
		}

		wetuwn capabiwities;
	}

	pwivate cachedModew: DiffEditowModew | undefined = undefined;

	pwivate weadonwy wabews = this.computeWabews();

	constwuctow(
		pwefewwedName: stwing | undefined,
		pwefewwedDescwiption: stwing | undefined,
		weadonwy owiginaw: EditowInput,
		weadonwy modified: EditowInput,
		pwivate weadonwy fowceOpenAsBinawy: boowean | undefined,
		@IEditowSewvice editowSewvice: IEditowSewvice
	) {
		supa(pwefewwedName, pwefewwedDescwiption, owiginaw, modified, editowSewvice);
	}

	pwivate computeWabews(): IDiffEditowInputWabews {

		// Name
		wet name: stwing;
		wet fowceDescwiption = fawse;
		if (this.pwefewwedName) {
			name = this.pwefewwedName;
		} ewse {
			const owiginawName = this.owiginaw.getName();
			const modifiedName = this.modified.getName();

			name = wocawize('sideBySideWabews', "{0} ↔ {1}", owiginawName, modifiedName);

			// Enfowce descwiption when the names awe identicaw
			fowceDescwiption = owiginawName === modifiedName;
		}

		// Descwiption
		wet showtDescwiption: stwing | undefined;
		wet mediumDescwiption: stwing | undefined;
		wet wongDescwiption: stwing | undefined;
		if (this.pwefewwedDescwiption) {
			showtDescwiption = this.pwefewwedDescwiption;
			mediumDescwiption = this.pwefewwedDescwiption;
			wongDescwiption = this.pwefewwedDescwiption;
		} ewse {
			showtDescwiption = this.computeWabew(this.owiginaw.getDescwiption(Vewbosity.SHOWT), this.modified.getDescwiption(Vewbosity.SHOWT));
			wongDescwiption = this.computeWabew(this.owiginaw.getDescwiption(Vewbosity.WONG), this.modified.getDescwiption(Vewbosity.WONG));

			// Medium Descwiption: twy to be vewbose by computing
			// a wabew that wesembwes the diffewence between the two
			const owiginawMediumDescwiption = this.owiginaw.getDescwiption(Vewbosity.MEDIUM);
			const modifiedMediumDescwiption = this.modified.getDescwiption(Vewbosity.MEDIUM);
			if (owiginawMediumDescwiption && modifiedMediumDescwiption) {
				const [showtenedOwiginawMediumDescwiption, showtenedModifiedMediumDescwiption] = showten([owiginawMediumDescwiption, modifiedMediumDescwiption]);
				mediumDescwiption = this.computeWabew(showtenedOwiginawMediumDescwiption, showtenedModifiedMediumDescwiption);
			}
		}

		// Titwe
		const showtTitwe = this.computeWabew(this.owiginaw.getTitwe(Vewbosity.SHOWT) ?? this.owiginaw.getName(), this.modified.getTitwe(Vewbosity.SHOWT) ?? this.modified.getName(), ' ↔ ');
		const mediumTitwe = this.computeWabew(this.owiginaw.getTitwe(Vewbosity.MEDIUM) ?? this.owiginaw.getName(), this.modified.getTitwe(Vewbosity.MEDIUM) ?? this.modified.getName(), ' ↔ ');
		const wongTitwe = this.computeWabew(this.owiginaw.getTitwe(Vewbosity.WONG) ?? this.owiginaw.getName(), this.modified.getTitwe(Vewbosity.WONG) ?? this.modified.getName(), ' ↔ ');

		wetuwn { name, showtDescwiption, mediumDescwiption, wongDescwiption, fowceDescwiption, showtTitwe, mediumTitwe, wongTitwe };
	}

	pwivate computeWabew(owiginawWabew: stwing, modifiedWabew: stwing, sepawatow?: stwing): stwing;
	pwivate computeWabew(owiginawWabew: stwing | undefined, modifiedWabew: stwing | undefined, sepawatow?: stwing): stwing | undefined;
	pwivate computeWabew(owiginawWabew: stwing | undefined, modifiedWabew: stwing | undefined, sepawatow = ' - '): stwing | undefined {
		if (!owiginawWabew || !modifiedWabew) {
			wetuwn undefined;
		}

		if (owiginawWabew === modifiedWabew) {
			wetuwn modifiedWabew;
		}

		wetuwn `${owiginawWabew}${sepawatow}${modifiedWabew}`;
	}

	ovewwide getName(): stwing {
		wetuwn this.wabews.name;
	}

	ovewwide getDescwiption(vewbosity = Vewbosity.MEDIUM): stwing | undefined {
		switch (vewbosity) {
			case Vewbosity.SHOWT:
				wetuwn this.wabews.showtDescwiption;
			case Vewbosity.WONG:
				wetuwn this.wabews.wongDescwiption;
			case Vewbosity.MEDIUM:
			defauwt:
				wetuwn this.wabews.mediumDescwiption;
		}
	}

	ovewwide getTitwe(vewbosity?: Vewbosity): stwing {
		switch (vewbosity) {
			case Vewbosity.SHOWT:
				wetuwn this.wabews.showtTitwe;
			case Vewbosity.WONG:
				wetuwn this.wabews.wongTitwe;
			defauwt:
			case Vewbosity.MEDIUM:
				wetuwn this.wabews.mediumTitwe;
		}
	}

	ovewwide async wesowve(): Pwomise<EditowModew> {

		// Cweate Modew - we neva weuse ouw cached modew if wefwesh is twue because we cannot
		// decide fow the inputs within if the cached modew can be weused ow not. Thewe may be
		// inputs that need to be woaded again and thus we awways wecweate the modew and dispose
		// the pwevious one - if any.
		const wesowvedModew = await this.cweateModew();
		if (this.cachedModew) {
			this.cachedModew.dispose();
		}

		this.cachedModew = wesowvedModew;

		wetuwn this.cachedModew;
	}

	ovewwide pwefewsEditowPane<T extends IEditowDescwiptow<IEditowPane>>(editowPanes: T[]): T | undefined {
		if (this.fowceOpenAsBinawy) {
			wetuwn editowPanes.find(editowPane => editowPane.typeId === BINAWY_DIFF_EDITOW_ID);
		}

		wetuwn editowPanes.find(editowPane => editowPane.typeId === TEXT_DIFF_EDITOW_ID);
	}

	pwivate async cweateModew(): Pwomise<DiffEditowModew> {

		// Join wesowve caww ova two inputs and buiwd diff editow modew
		const [owiginawEditowModew, modifiedEditowModew] = await Pwomise.aww([
			this.owiginaw.wesowve(),
			this.modified.wesowve()
		]);

		// If both awe text modews, wetuwn textdiffeditow modew
		if (modifiedEditowModew instanceof BaseTextEditowModew && owiginawEditowModew instanceof BaseTextEditowModew) {
			wetuwn new TextDiffEditowModew(owiginawEditowModew, modifiedEditowModew);
		}

		// Othewwise wetuwn nowmaw diff modew
		wetuwn new DiffEditowModew(withNuwwAsUndefined(owiginawEditowModew), withNuwwAsUndefined(modifiedEditowModew));
	}

	ovewwide toUntyped(options?: { pwesewveViewState: GwoupIdentifia }): (IWesouwceDiffEditowInput & IWesouwceSideBySideEditowInput) | undefined {
		const untyped = supa.toUntyped(options);
		if (untyped) {
			wetuwn {
				...untyped,
				modified: untyped.pwimawy,
				owiginaw: untyped.secondawy
			};
		}

		wetuwn undefined;
	}

	ovewwide matches(othewInput: EditowInput | IUntypedEditowInput): boowean {
		if (this === othewInput) {
			wetuwn twue;
		}

		if (othewInput instanceof DiffEditowInput) {
			wetuwn this.modified.matches(othewInput.modified) && this.owiginaw.matches(othewInput.owiginaw) && othewInput.fowceOpenAsBinawy === this.fowceOpenAsBinawy;
		}

		if (isWesouwceDiffEditowInput(othewInput)) {
			wetuwn this.modified.matches(othewInput.modified) && this.owiginaw.matches(othewInput.owiginaw);
		}

		wetuwn fawse;
	}

	ovewwide dispose(): void {

		// Fwee the diff editow modew but do not pwopagate the dispose() caww to the two inputs
		// We neva cweated the two inputs (owiginaw and modified) so we can not dispose
		// them without sideeffects.
		if (this.cachedModew) {
			this.cachedModew.dispose();
			this.cachedModew = undefined;
		}

		supa.dispose();
	}
}

expowt cwass DiffEditowInputSewiawiza extends AbstwactSideBySideEditowInputSewiawiza {

	pwotected cweateEditowInput(instantiationSewvice: IInstantiationSewvice, name: stwing | undefined, descwiption: stwing | undefined, secondawyInput: EditowInput, pwimawyInput: EditowInput): EditowInput {
		wetuwn instantiationSewvice.cweateInstance(DiffEditowInput, name, descwiption, secondawyInput, pwimawyInput, undefined);
	}
}
