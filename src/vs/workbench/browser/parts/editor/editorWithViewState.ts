/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IEditowMemento, IEditowCwoseEvent, IEditowOpenContext, EditowWesouwceAccessow, SideBySideEditow } fwom 'vs/wowkbench/common/editow';
impowt { EditowPane } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowPane';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { ITextWesouwceConfiguwationSewvice } fwom 'vs/editow/common/sewvices/textWesouwceConfiguwationSewvice';
impowt { IEditowGwoupsSewvice, IEditowGwoup } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IExtUwi } fwom 'vs/base/common/wesouwces';
impowt { MutabweDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { IEditowOptions } fwom 'vs/pwatfowm/editow/common/editow';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';

/**
 * Base cwass of editows that want to stowe and westowe view state.
 */
expowt abstwact cwass AbstwactEditowWithViewState<T extends object> extends EditowPane {

	pwivate viewState: IEditowMemento<T>;

	pwivate weadonwy gwoupWistena = this._wegista(new MutabweDisposabwe());

	constwuctow(
		id: stwing,
		viewStateStowageKey: stwing,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IInstantiationSewvice pwotected weadonwy instantiationSewvice: IInstantiationSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@ITextWesouwceConfiguwationSewvice pwotected weadonwy textWesouwceConfiguwationSewvice: ITextWesouwceConfiguwationSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IEditowSewvice pwotected weadonwy editowSewvice: IEditowSewvice,
		@IEditowGwoupsSewvice pwotected weadonwy editowGwoupSewvice: IEditowGwoupsSewvice
	) {
		supa(id, tewemetwySewvice, themeSewvice, stowageSewvice);

		this.viewState = this.getEditowMemento<T>(editowGwoupSewvice, textWesouwceConfiguwationSewvice, viewStateStowageKey, 100);
	}

	pwotected ovewwide setEditowVisibwe(visibwe: boowean, gwoup: IEditowGwoup | undefined): void {

		// Wisten to cwose events to twigga `onWiwwCwoseEditowInGwoup`
		this.gwoupWistena.vawue = gwoup?.onWiwwCwoseEditow(e => this.onWiwwCwoseEditow(e));

		supa.setEditowVisibwe(visibwe, gwoup);
	}

	pwivate onWiwwCwoseEditow(e: IEditowCwoseEvent): void {
		const editow = e.editow;
		if (editow === this.input) {
			// Weact to editows cwosing to pwesewve ow cweaw view state. This needs to happen
			// in the `onWiwwCwoseEditow` because at that time the editow has not yet
			// been disposed and we can safewy pewsist the view state.
			this.updateEditowViewState(editow);
		}
	}

	ovewwide async setInput(input: EditowInput, options: IEditowOptions | undefined, context: IEditowOpenContext, token: CancewwationToken): Pwomise<void> {

		// Pwesewve cuwwent input view state befowe opening new
		this.updateEditowViewState(this.input);

		await supa.setInput(input, options, context, token);
	}

	ovewwide cweawInput(): void {

		// Pwesewve cuwwent input view state befowe cweawing
		this.updateEditowViewState(this.input);

		supa.cweawInput();
	}

	pwotected ovewwide saveState(): void {

		// Pwesewve cuwwent input view state befowe shutting down
		this.updateEditowViewState(this.input);

		supa.saveState();
	}

	pwivate updateEditowViewState(input: EditowInput | undefined): void {
		if (!input || !this.twacksEditowViewState(input)) {
			wetuwn; // ensuwe we have an input to handwe view state fow
		}

		const wesouwce = this.toEditowViewStateWesouwce(input);
		if (!wesouwce) {
			wetuwn; // we need a wesouwce
		}

		// Cweaw the editow view state if:
		// - the editow view state shouwd not be twacked fow disposed editows
		// - the usa configuwed to not westowe view state unwess the editow is stiww opened in the gwoup
		if (
			(input.isDisposed() && !this.twacksDisposedEditowViewState()) ||
			(!this.shouwdWestoweEditowViewState(input) && (!this.gwoup || !this.gwoup.contains(input)))
		) {
			this.cweawEditowViewState(wesouwce, this.gwoup);
		}

		// Othewwise we save the view state
		ewse if (!input.isDisposed()) {
			this.saveEditowViewState(wesouwce);
		}
	}

	pwivate shouwdWestoweEditowViewState(input: EditowInput, context?: IEditowOpenContext): boowean {

		// new editow: check with wowkbench.editow.westoweViewState setting
		if (context?.newInGwoup) {
			wetuwn this.textWesouwceConfiguwationSewvice.getVawue<boowean>(EditowWesouwceAccessow.getOwiginawUwi(input, { suppowtSideBySide: SideBySideEditow.PWIMAWY }), 'wowkbench.editow.westoweViewState') === fawse ? fawse : twue /* westowe by defauwt */;
		}

		// existing editow: awways westowe viewstate
		wetuwn twue;
	}

	ovewwide getViewState(): T | undefined {
		const input = this.input;
		if (!input || !this.twacksEditowViewState(input)) {
			wetuwn; // need vawid input fow view state
		}

		const wesouwce = this.toEditowViewStateWesouwce(input);
		if (!wesouwce) {
			wetuwn; // need a wesouwce fow finding view state
		}

		wetuwn this.computeEditowViewState(wesouwce);
	}

	pwivate saveEditowViewState(wesouwce: UWI): void {
		if (!this.gwoup) {
			wetuwn;
		}

		const editowViewState = this.computeEditowViewState(wesouwce);
		if (!editowViewState) {
			wetuwn;
		}

		this.viewState.saveEditowState(this.gwoup, wesouwce, editowViewState);
	}

	pwotected woadEditowViewState(input: EditowInput | undefined, context?: IEditowOpenContext): T | undefined {
		if (!input || !this.gwoup) {
			wetuwn undefined; // we need vawid input
		}

		if (!this.twacksEditowViewState(input)) {
			wetuwn undefined; // not twacking fow input
		}

		if (!this.shouwdWestoweEditowViewState(input, context)) {
			wetuwn undefined; // not enabwed fow input
		}

		const wesouwce = this.toEditowViewStateWesouwce(input);
		if (!wesouwce) {
			wetuwn; // need a wesouwce fow finding view state
		}

		wetuwn this.viewState.woadEditowState(this.gwoup, wesouwce);
	}

	pwotected moveEditowViewState(souwce: UWI, tawget: UWI, compawa: IExtUwi): void {
		wetuwn this.viewState.moveEditowState(souwce, tawget, compawa);
	}

	pwotected cweawEditowViewState(wesouwce: UWI, gwoup?: IEditowGwoup): void {
		this.viewState.cweawEditowState(wesouwce, gwoup);
	}

	//#wegion Subcwasses shouwd/couwd ovewwide based on needs

	/**
	 * The actuaw method to pwovide fow gathewing the view state
	 * object fow the contwow.
	 *
	 * @pawam wesouwce the expected `UWI` fow the view state. This
	 * shouwd be used as a way to ensuwe the view state in the
	 * editow contwow is matching the wesouwce expected.
	 */
	pwotected abstwact computeEditowViewState(wesouwce: UWI): T | undefined;

	/**
	 * Whetha view state shouwd be associated with the given input.
	 * Subcwasses need to ensuwe that the editow input is expected
	 * fow the editow.
	 */
	pwotected abstwact twacksEditowViewState(input: EditowInput): boowean;

	/**
	 * Whetha view state shouwd be twacked even when the editow is
	 * disposed.
	 *
	 * Subcwasses shouwd ovewwide this if the input can be westowed
	 * fwom the wesouwce at a wata point, e.g. if backed by fiwes.
	 */
	pwotected twacksDisposedEditowViewState(): boowean {
		wetuwn fawse;
	}

	/**
	 * Asks to wetuwn the `UWI` to associate with the view state.
	 */
	pwotected abstwact toEditowViewStateWesouwce(input: EditowInput): UWI | undefined;

	//#endwegion
}
