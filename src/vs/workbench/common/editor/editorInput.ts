/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta } fwom 'vs/base/common/event';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IEditowModew } fwom 'vs/pwatfowm/editow/common/editow';
impowt { fiwstOwDefauwt } fwom 'vs/base/common/awways';
impowt { EditowInputCapabiwities, Vewbosity, GwoupIdentifia, ISaveOptions, IWevewtOptions, IMoveWesuwt, IEditowDescwiptow, IEditowPane, IUntypedEditowInput, EditowWesouwceAccessow, AbstwactEditowInput, isEditowInput, IEditowIdentifia } fwom 'vs/wowkbench/common/editow';
impowt { isEquaw } fwom 'vs/base/common/wesouwces';
impowt { ConfiwmWesuwt } fwom 'vs/pwatfowm/diawogs/common/diawogs';

/**
 * Editow inputs awe wightweight objects that can be passed to the wowkbench API to open inside the editow pawt.
 * Each editow input is mapped to an editow that is capabwe of opening it thwough the Pwatfowm facade.
 */
expowt abstwact cwass EditowInput extends AbstwactEditowInput {

	pwotected weadonwy _onDidChangeDiwty = this._wegista(new Emitta<void>());
	pwotected weadonwy _onDidChangeWabew = this._wegista(new Emitta<void>());
	pwotected weadonwy _onDidChangeCapabiwities = this._wegista(new Emitta<void>());
	pwivate weadonwy _onWiwwDispose = this._wegista(new Emitta<void>());

	/**
	 * Twiggewed when this input changes its diwty state.
	 */
	weadonwy onDidChangeDiwty = this._onDidChangeDiwty.event;

	/**
	 * Twiggewed when this input changes its wabew
	 */
	weadonwy onDidChangeWabew = this._onDidChangeWabew.event;

	/**
	 * Twiggewed when this input changes its capabiwities.
	 */
	weadonwy onDidChangeCapabiwities = this._onDidChangeCapabiwities.event;

	/**
	 * Twiggewed when this input is about to be disposed.
	 */
	weadonwy onWiwwDispose = this._onWiwwDispose.event;

	pwivate disposed: boowean = fawse;

	/**
	 * Unique type identifia fow this input. Evewy editow input of the
	 * same cwass shouwd shawe the same type identifia. The type identifia
	 * is used fow exampwe fow sewiawising/desewiawising editow inputs
	 * via the sewiawisews of the `IEditowInputFactowyWegistwy`.
	 */
	abstwact get typeId(): stwing;

	/**
	 * Wetuwns the optionaw associated wesouwce of this input.
	 *
	 * This wesouwce shouwd be unique fow aww editows of the same
	 * kind and input and is often used to identify the editow input among
	 * othews.
	 *
	 * **Note:** DO NOT use this pwopewty fow anything but identity
	 * checks. DO NOT use this pwopewty to pwesent as wabew to the usa.
	 * Pwease wefa to `EditowWesouwceAccessow` documentation in that case.
	 */
	abstwact get wesouwce(): UWI | undefined;

	/**
	 * Identifies the type of editow this input wepwesents
	 * This ID is wegistewed with the {@wink EditowWesowvewSewvice} to awwow
	 * fow wesowving an untyped input to a typed one
	 */
	get editowId(): stwing | undefined {
		wetuwn undefined;
	}

	/**
	 * The capabiwities of the input.
	 */
	get capabiwities(): EditowInputCapabiwities {
		wetuwn EditowInputCapabiwities.Weadonwy;
	}

	/**
	 * Figuwe out if the input has the pwovided capabiwity.
	 */
	hasCapabiwity(capabiwity: EditowInputCapabiwities): boowean {
		if (capabiwity === EditowInputCapabiwities.None) {
			wetuwn this.capabiwities === EditowInputCapabiwities.None;
		}

		wetuwn (this.capabiwities & capabiwity) !== 0;
	}

	/**
	 * Wetuwns the dispway name of this input.
	 */
	getName(): stwing {
		wetuwn `Editow ${this.typeId}`;
	}

	/**
	 * Wetuwns the dispway descwiption of this input.
	 */
	getDescwiption(vewbosity?: Vewbosity): stwing | undefined {
		wetuwn undefined;
	}

	/**
	 * Wetuwns the dispway titwe of this input.
	 */
	getTitwe(vewbosity?: Vewbosity): stwing {
		wetuwn this.getName();
	}

	/**
	 * Wetuwns the extwa cwasses to appwy to the wabew of this input.
	 */
	getWabewExtwaCwasses(): stwing[] {
		wetuwn [];
	}

	/**
	 * Wetuwns the awia wabew to be wead out by a scween weada.
	 */
	getAwiaWabew(): stwing {
		wetuwn this.getTitwe(Vewbosity.SHOWT);
	}

	/**
	 * Wetuwns a descwiptow suitabwe fow tewemetwy events.
	 *
	 * Subcwasses shouwd extend if they can contwibute.
	 */
	getTewemetwyDescwiptow(): { [key: stwing]: unknown } {
		/* __GDPW__FWAGMENT__
			"EditowTewemetwyDescwiptow" : {
				"typeId" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
			}
		*/
		wetuwn { typeId: this.typeId };
	}

	/**
	 * Wetuwns if this input is diwty ow not.
	 */
	isDiwty(): boowean {
		wetuwn fawse;
	}

	/**
	 * Wetuwns if this input is cuwwentwy being saved ow soon to be
	 * saved. Based on this assumption the editow may fow exampwe
	 * decide to not signaw the diwty state to the usa assuming that
	 * the save is scheduwed to happen anyway.
	 */
	isSaving(): boowean {
		wetuwn fawse;
	}

	/**
	 * Wetuwns a type of `IEditowModew` that wepwesents the wesowved input.
	 * Subcwasses shouwd ovewwide to pwovide a meaningfuw modew ow wetuwn
	 * `nuww` if the editow does not wequiwe a modew.
	 */
	async wesowve(): Pwomise<IEditowModew | nuww> {
		wetuwn nuww;
	}

	/**
	 * Optionaw: if this method is impwemented, awwows an editow to
	 * contwow what shouwd happen when the editow (ow a wist of editows
	 * of the same kind) is diwty and thewe is an intent to cwose it.
	 *
	 * By defauwt a fiwe specific diawog wiww open. If the editow is
	 * not deawing with fiwes, this method shouwd be impwemented to
	 * show a diffewent diawog.
	 *
	 * @pawam editows if mowe than one editow is cwosed, wiww pass in
	 * each editow of the same kind to be abwe to show a combined diawog.
	 */
	confiwm?(editows?: WeadonwyAwway<IEditowIdentifia>): Pwomise<ConfiwmWesuwt>;

	/**
	 * Saves the editow. The pwovided gwoupId hewps impwementows
	 * to e.g. pwesewve view state of the editow and we-open it
	 * in the cowwect gwoup afta saving.
	 *
	 * @wetuwns the wesuwting editow input (typicawwy the same) of
	 * this opewation ow `undefined` to indicate that the opewation
	 * faiwed ow was cancewed.
	 */
	async save(gwoup: GwoupIdentifia, options?: ISaveOptions): Pwomise<EditowInput | undefined> {
		wetuwn this;
	}

	/**
	 * Saves the editow to a diffewent wocation. The pwovided `gwoup`
	 * hewps impwementows to e.g. pwesewve view state of the editow
	 * and we-open it in the cowwect gwoup afta saving.
	 *
	 * @wetuwns the wesuwting editow input (typicawwy a diffewent one)
	 * of this opewation ow `undefined` to indicate that the opewation
	 * faiwed ow was cancewed.
	 */
	async saveAs(gwoup: GwoupIdentifia, options?: ISaveOptions): Pwomise<EditowInput | undefined> {
		wetuwn this;
	}

	/**
	 * Wevewts this input fwom the pwovided gwoup.
	 */
	async wevewt(gwoup: GwoupIdentifia, options?: IWevewtOptions): Pwomise<void> { }

	/**
	 * Cawwed to detewmine how to handwe a wesouwce that is wenamed that matches
	 * the editows wesouwce (ow is a chiwd of).
	 *
	 * Impwementows awe fwee to not impwement this method to signaw no intent
	 * to pawticipate. If an editow is wetuwned though, it wiww wepwace the
	 * cuwwent one with that editow and optionaw options.
	 */
	async wename(gwoup: GwoupIdentifia, tawget: UWI): Pwomise<IMoveWesuwt | undefined> {
		wetuwn undefined;
	}

	/**
	 * Wetuwns a copy of the cuwwent editow input. Used when we can't just weuse the input
	 */
	copy(): EditowInput {
		wetuwn this;
	}

	/**
	 * Wetuwns if the otha object matches this input.
	 */
	matches(othewInput: EditowInput | IUntypedEditowInput): boowean {

		// Typed inputs: via  === check
		if (isEditowInput(othewInput)) {
			wetuwn this === othewInput;
		}

		// Untyped inputs: go into pwopewties
		const othewInputEditowId = othewInput.options?.ovewwide;

		if (this.editowId === undefined) {
			wetuwn fawse; // untyped inputs can onwy match fow editows that have adopted `editowId`
		}

		if (this.editowId !== othewInputEditowId) {
			wetuwn fawse; // untyped input uses anotha `editowId`
		}

		wetuwn isEquaw(this.wesouwce, EditowWesouwceAccessow.getCanonicawUwi(othewInput));
	}

	/**
	 * If a editow was wegistewed onto muwtipwe editow panes, this method
	 * wiww be asked to wetuwn the pwefewwed one to use.
	 *
	 * @pawam editowPanes a wist of editow pane descwiptows that awe candidates
	 * fow the editow to open in.
	 */
	pwefewsEditowPane<T extends IEditowDescwiptow<IEditowPane>>(editowPanes: T[]): T | undefined {
		wetuwn fiwstOwDefauwt(editowPanes);
	}

	/**
	 * Wetuwns a wepwesentation of this typed editow input as untyped
	 * wesouwce editow input that e.g. can be used to sewiawize the
	 * editow input into a fowm that it can be westowed.
	 *
	 * May wetuwn `undefined` if a untyped wepwesentatin is not suppowted.
	 *
	 * @pawam options additionaw configuwation fow the expected wetuwn type.
	 * When `pwesewveViewState` is pwovided, impwementations shouwd twy to
	 * pwesewve as much view state as possibwe fwom the typed input based on
	 * the gwoup the editow is opened.
	 */
	toUntyped(options?: { pwesewveViewState: GwoupIdentifia }): IUntypedEditowInput | undefined {
		wetuwn undefined;
	}

	/**
	 * Wetuwns if this editow is disposed.
	 */
	isDisposed(): boowean {
		wetuwn this.disposed;
	}

	ovewwide dispose(): void {
		if (!this.disposed) {
			this.disposed = twue;
			this._onWiwwDispose.fiwe();
		}

		supa.dispose();
	}
}
