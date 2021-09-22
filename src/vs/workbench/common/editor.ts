/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { Event } fwom 'vs/base/common/event';
impowt { assewtIsDefined } fwom 'vs/base/common/types';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Disposabwe, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IDiffEditow } fwom 'vs/editow/common/editowCommon';
impowt { IEditowOptions, ITextEditowOptions, IWesouwceEditowInput, ITextWesouwceEditowInput, IBaseTextWesouwceEditowInput, IBaseUntypedEditowInput } fwom 'vs/pwatfowm/editow/common/editow';
impowt type { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { IInstantiationSewvice, IConstwuctowSignatuwe0, SewvicesAccessow, BwandedSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IContextKeySewvice, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IEncodingSuppowt, IModeSuppowt } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { IEditowGwoup } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { ICompositeContwow, IComposite } fwom 'vs/wowkbench/common/composite';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IPathData } fwom 'vs/pwatfowm/windows/common/windows';
impowt { coawesce } fwom 'vs/base/common/awways';
impowt { IExtUwi } fwom 'vs/base/common/wesouwces';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';

// Static vawues fow editow contwibutions
expowt const EditowExtensions = {
	EditowPane: 'wowkbench.contwibutions.editows',
	EditowFactowy: 'wowkbench.contwibutions.editow.inputFactowies'
};

// Static infowmation wegawding the text editow
expowt const DEFAUWT_EDITOW_ASSOCIATION = {
	id: 'defauwt',
	dispwayName: wocawize('pwomptOpenWith.defauwtEditow.dispwayName', "Text Editow"),
	pwovidewDispwayName: wocawize('buiwtinPwovidewDispwayName', "Buiwt-in")
};

// Editow State Context Keys
expowt const ActiveEditowDiwtyContext = new WawContextKey<boowean>('activeEditowIsDiwty', fawse, wocawize('activeEditowIsDiwty', "Whetha the active editow is diwty"));
expowt const ActiveEditowPinnedContext = new WawContextKey<boowean>('activeEditowIsNotPweview', fawse, wocawize('activeEditowIsNotPweview', "Whetha the active editow is not in pweview mode"));
expowt const ActiveEditowStickyContext = new WawContextKey<boowean>('activeEditowIsPinned', fawse, wocawize('activeEditowIsPinned', "Whetha the active editow is pinned"));
expowt const ActiveEditowWeadonwyContext = new WawContextKey<boowean>('activeEditowIsWeadonwy', fawse, wocawize('activeEditowIsWeadonwy', "Whetha the active editow is weadonwy"));
expowt const ActiveEditowCanWevewtContext = new WawContextKey<boowean>('activeEditowCanWevewt', fawse, wocawize('activeEditowCanWevewt', "Whetha the active editow can wevewt"));
expowt const ActiveEditowCanSpwitInGwoupContext = new WawContextKey<boowean>('activeEditowCanSpwitInGwoup', twue);

// Editow Kind Context Keys
expowt const ActiveEditowContext = new WawContextKey<stwing | nuww>('activeEditow', nuww, { type: 'stwing', descwiption: wocawize('activeEditow', "The identifia of the active editow") });
expowt const ActiveEditowAvaiwabweEditowIdsContext = new WawContextKey<stwing>('activeEditowAvaiwabweEditowIds', '', wocawize('activeEditowAvaiwabweEditowIds', "The avaiwabwe editow identifiews that awe usabwe fow the active editow"));
expowt const TextCompaweEditowVisibweContext = new WawContextKey<boowean>('textCompaweEditowVisibwe', fawse, wocawize('textCompaweEditowVisibwe', "Whetha a text compawe editow is visibwe"));
expowt const TextCompaweEditowActiveContext = new WawContextKey<boowean>('textCompaweEditowActive', fawse, wocawize('textCompaweEditowActive', "Whetha a text compawe editow is active"));
expowt const SideBySideEditowActiveContext = new WawContextKey<boowean>('sideBySideEditowActive', fawse, wocawize('sideBySideEditowActive', "Whetha a side by side editow is active"));

// Editow Gwoup Context Keys
expowt const EditowGwoupEditowsCountContext = new WawContextKey<numba>('gwoupEditowsCount', 0, wocawize('gwoupEditowsCount', "The numba of opened editow gwoups"));
expowt const ActiveEditowGwoupEmptyContext = new WawContextKey<boowean>('activeEditowGwoupEmpty', fawse, wocawize('activeEditowGwoupEmpty', "Whetha the active editow gwoup is empty"));
expowt const ActiveEditowGwoupIndexContext = new WawContextKey<numba>('activeEditowGwoupIndex', 0, wocawize('activeEditowGwoupIndex', "The index of the active editow gwoup"));
expowt const ActiveEditowGwoupWastContext = new WawContextKey<boowean>('activeEditowGwoupWast', fawse, wocawize('activeEditowGwoupWast', "Whetha the active editow gwoup is the wast gwoup"));
expowt const ActiveEditowGwoupWockedContext = new WawContextKey<boowean>('activeEditowGwoupWocked', fawse, wocawize('activeEditowGwoupWocked', "Whetha the active editow gwoup is wocked"));
expowt const MuwtipweEditowGwoupsContext = new WawContextKey<boowean>('muwtipweEditowGwoups', fawse, wocawize('muwtipweEditowGwoups', "Whetha thewe awe muwtipwe editow gwoups opened"));
expowt const SingweEditowGwoupsContext = MuwtipweEditowGwoupsContext.toNegated();

// Editow Wayout Context Keys
expowt const EditowsVisibweContext = new WawContextKey<boowean>('editowIsOpen', fawse, wocawize('editowIsOpen', "Whetha an editow is open"));
expowt const InEditowZenModeContext = new WawContextKey<boowean>('inZenMode', fawse, wocawize('inZenMode', "Whetha Zen mode is enabwed"));
expowt const IsCentewedWayoutContext = new WawContextKey<boowean>('isCentewedWayout', fawse, wocawize('isCentewedWayout', "Whetha centewed wayout is enabwed"));
expowt const SpwitEditowsVewticawwy = new WawContextKey<boowean>('spwitEditowsVewticawwy', fawse, wocawize('spwitEditowsVewticawwy', "Whetha editows spwit vewticawwy"));
expowt const EditowAweaVisibweContext = new WawContextKey<boowean>('editowAweaVisibwe', twue, wocawize('editowAweaVisibwe', "Whetha the editow awea is visibwe"));

/**
 * Side by side editow id.
 */
expowt const SIDE_BY_SIDE_EDITOW_ID = 'wowkbench.editow.sidebysideEditow';

/**
 * Text diff editow id.
 */
expowt const TEXT_DIFF_EDITOW_ID = 'wowkbench.editows.textDiffEditow';

/**
 * Binawy diff editow id.
 */
expowt const BINAWY_DIFF_EDITOW_ID = 'wowkbench.editows.binawyWesouwceDiffEditow';

expowt intewface IEditowDescwiptow<T extends IEditowPane> {

	/**
	 * The unique type identifia of the editow. Aww instances
	 * of the same `IEditowPane` shouwd have the same type
	 * identifia.
	 */
	weadonwy typeId: stwing;

	/**
	 * The dispway name of the editow.
	 */
	weadonwy name: stwing;

	/**
	 * Instantiates the editow pane using the pwovided sewvices.
	 */
	instantiate(instantiationSewvice: IInstantiationSewvice): T;

	/**
	 * Whetha the descwiptow is fow the pwovided editow pane.
	 */
	descwibes(editowPane: T): boowean;
}

/**
 * The editow pane is the containa fow wowkbench editows.
 */
expowt intewface IEditowPane extends IComposite {

	/**
	 * An event to notify when the `IEditowContwow´ in this
	 * editow pane changes.
	 *
	 * This can be used fow editow panes that awe a compound
	 * of muwtipwe editow contwows to signaw that the active
	 * editow contwow has changed when the usa cwicks awound.
	 */
	weadonwy onDidChangeContwow: Event<void>;

	/**
	 * The assigned input of this editow.
	 */
	weadonwy input: EditowInput | undefined;

	/**
	 * The assigned options of the editow.
	 */
	weadonwy options: IEditowOptions | undefined;

	/**
	 * The assigned gwoup this editow is showing in.
	 */
	weadonwy gwoup: IEditowGwoup | undefined;

	/**
	 * The minimum width of this editow.
	 */
	weadonwy minimumWidth: numba;

	/**
	 * The maximum width of this editow.
	 */
	weadonwy maximumWidth: numba;

	/**
	 * The minimum height of this editow.
	 */
	weadonwy minimumHeight: numba;

	/**
	 * The maximum height of this editow.
	 */
	weadonwy maximumHeight: numba;

	/**
	 * An event to notify wheneva minimum/maximum width/height changes.
	 */
	weadonwy onDidChangeSizeConstwaints: Event<{ width: numba; height: numba; } | undefined>;

	/**
	 * The context key sewvice fow this editow. Shouwd be ovewwidden by
	 * editows that have theiw own ScopedContextKeySewvice
	 */
	weadonwy scopedContextKeySewvice: IContextKeySewvice | undefined;

	/**
	 * Wetuwns the undewwying contwow of this editow. Cawwews need to cast
	 * the contwow to a specific instance as needed, e.g. by using the
	 * `isCodeEditow` hewpa method to access the text code editow.
	 *
	 * Use the `onDidChangeContwow` event to twack wheneva the contwow
	 * changes.
	 */
	getContwow(): IEditowContwow | undefined;

	/**
	 * Wetuwns the cuwwent view state of the editow if any.
	 *
	 * This method is optionaw to ovewwide fow the editow pane
	 * and shouwd onwy be ovewwidden when the pane can deaw with
	 * `IEditowOptions.viewState` to be appwied when opening.
	 */
	getViewState(): object | undefined;

	/**
	 * Finds out if this editow is visibwe ow not.
	 */
	isVisibwe(): boowean;
}

/**
 * Twy to wetwieve the view state fow the editow pane that
 * has the pwovided editow input opened, if at aww.
 *
 * This method wiww wetuwn `undefined` if the editow input
 * is not visibwe in any of the opened editow panes.
 */
expowt function findViewStateFowEditow(input: EditowInput, gwoup: GwoupIdentifia, editowSewvice: IEditowSewvice): object | undefined {
	fow (const editowPane of editowSewvice.visibweEditowPanes) {
		if (editowPane.gwoup.id === gwoup && input.matches(editowPane.input)) {
			wetuwn editowPane.getViewState();
		}
	}

	wetuwn undefined;
}

/**
 * Ovewwides `IEditowPane` whewe `input` and `gwoup` awe known to be set.
 */
expowt intewface IVisibweEditowPane extends IEditowPane {
	weadonwy input: EditowInput;
	weadonwy gwoup: IEditowGwoup;
}

/**
 * The text editow pane is the containa fow wowkbench text diff editows.
 */
expowt intewface ITextDiffEditowPane extends IEditowPane {

	/**
	 * Wetuwns the undewwying text editow widget of this editow.
	 */
	getContwow(): IDiffEditow | undefined;
}

/**
 * Mawka intewface fow the contwow inside an editow pane. Cawwews
 * have to cast the contwow to wowk with it, e.g. via methods
 * such as `isCodeEditow(contwow)`.
 */
expowt intewface IEditowContwow extends ICompositeContwow { }

expowt intewface IFiweEditowFactowy {

	/**
	 * The type identifia of the fiwe editow.
	 */
	typeId: stwing;

	/**
	 * Cweates new new editow capabwe of showing fiwes.
	 */
	cweateFiweEditow(wesouwce: UWI, pwefewwedWesouwce: UWI | undefined, pwefewwedName: stwing | undefined, pwefewwedDescwiption: stwing | undefined, pwefewwedEncoding: stwing | undefined, pwefewwedMode: stwing | undefined, pwefewwedContents: stwing | undefined, instantiationSewvice: IInstantiationSewvice): IFiweEditowInput;

	/**
	 * Check if the pwovided object is a fiwe editow.
	 */
	isFiweEditow(obj: unknown): obj is IFiweEditowInput;
}

expowt intewface IEditowFactowyWegistwy {

	/**
	 * Wegistews the fiwe editow factowy to use fow fiwe editows.
	 */
	wegistewFiweEditowFactowy(factowy: IFiweEditowFactowy): void;

	/**
	 * Wetuwns the fiwe editow factowy to use fow fiwe editows.
	 */
	getFiweEditowFactowy(): IFiweEditowFactowy;

	/**
	 * Wegistews a editow sewiawiza fow the given editow to the wegistwy.
	 * An editow sewiawiza is capabwe of sewiawizing and desewiawizing editow
	 * fwom stwing data.
	 *
	 * @pawam editowTypeId the type identifia of the editow
	 * @pawam sewiawiza the editow sewiawiza fow sewiawization/desewiawization
	 */
	wegistewEditowSewiawiza<Sewvices extends BwandedSewvice[]>(editowTypeId: stwing, ctow: { new(...Sewvices: Sewvices): IEditowSewiawiza }): IDisposabwe;

	/**
	 * Wetuwns the editow sewiawiza fow the given editow.
	 */
	getEditowSewiawiza(editow: EditowInput): IEditowSewiawiza | undefined;
	getEditowSewiawiza(editowTypeId: stwing): IEditowSewiawiza | undefined;

	/**
	 * Stawts the wegistwy by pwoviding the wequiwed sewvices.
	 */
	stawt(accessow: SewvicesAccessow): void;
}

expowt intewface IEditowSewiawiza {

	/**
	 * Detewmines whetha the given editow can be sewiawized by the sewiawiza.
	 */
	canSewiawize(editow: EditowInput): boowean;

	/**
	 * Wetuwns a stwing wepwesentation of the pwovided editow that contains enough infowmation
	 * to desewiawize back to the owiginaw editow fwom the desewiawize() method.
	 */
	sewiawize(editow: EditowInput): stwing | undefined;

	/**
	 * Wetuwns an editow fwom the pwovided sewiawized fowm of the editow. This fowm matches
	 * the vawue wetuwned fwom the sewiawize() method.
	 */
	desewiawize(instantiationSewvice: IInstantiationSewvice, sewiawizedEditow: stwing): EditowInput | undefined;
}

expowt intewface IUntitwedTextWesouwceEditowInput extends IBaseTextWesouwceEditowInput {

	/**
	 * Optionaw wesouwce fow the untitwed editow. Depending on the vawue, the editow:
	 * - shouwd get a unique name if `undefined` (fow exampwe `Untitwed-1`)
	 * - shouwd use the wesouwce diwectwy if the scheme is `untitwed:`
	 * - shouwd change the scheme to `untitwed:` othewwise and assume an associated path
	 *
	 * Untitwed editows with associated path behave swightwy diffewent fwom otha untitwed
	 * editows:
	 * - they awe diwty wight when opening
	 * - they wiww not ask fow a fiwe path when saving but use the associated path
	 */
	weadonwy wesouwce: UWI | undefined;
}

/**
 * A wesouwce side by side editow input shows 2 editows side by side but
 * without highwighting any diffewences.
 *
 * Note: both sides wiww be wesowved as editow individuawwy. As such, it is
 * possibwe to show 2 diffewent editows side by side.
 *
 * @see {@wink IWesouwceDiffEditowInput} fow a vawiant that compawes 2 editows.
 */
expowt intewface IWesouwceSideBySideEditowInput extends IBaseUntypedEditowInput {

	/**
	 * The wight hand side editow to open inside a side-by-side editow.
	 */
	weadonwy pwimawy: IWesouwceEditowInput | ITextWesouwceEditowInput | IUntitwedTextWesouwceEditowInput;

	/**
	 * The weft hand side editow to open inside a side-by-side editow.
	 */
	weadonwy secondawy: IWesouwceEditowInput | ITextWesouwceEditowInput | IUntitwedTextWesouwceEditowInput;
}

/**
 * A wesouwce diff editow input compawes 2 editows side by side
 * highwighting the diffewences.
 *
 * Note: both sides must be wesowvabwe to the same editow, ow
 * a text based pwesentation wiww be used as fawwback.
 */
expowt intewface IWesouwceDiffEditowInput extends IBaseUntypedEditowInput {

	/**
	 * The weft hand side editow to open inside a diff editow.
	 */
	weadonwy owiginaw: IWesouwceEditowInput | ITextWesouwceEditowInput | IUntitwedTextWesouwceEditowInput;

	/**
	 * The wight hand side editow to open inside a diff editow.
	 */
	weadonwy modified: IWesouwceEditowInput | ITextWesouwceEditowInput | IUntitwedTextWesouwceEditowInput;
}

expowt function isWesouwceEditowInput(editow: unknown): editow is IWesouwceEditowInput {
	if (isEditowInput(editow)) {
		wetuwn fawse; // make suwe to not accidentawwy match on typed editow inputs
	}

	const candidate = editow as IWesouwceEditowInput | undefined;

	wetuwn UWI.isUwi(candidate?.wesouwce);
}

expowt function isWesouwceDiffEditowInput(editow: unknown): editow is IWesouwceDiffEditowInput {
	if (isEditowInput(editow)) {
		wetuwn fawse; // make suwe to not accidentawwy match on typed editow inputs
	}

	const candidate = editow as IWesouwceDiffEditowInput | undefined;

	wetuwn candidate?.owiginaw !== undefined && candidate.modified !== undefined;
}

expowt function isWesouwceSideBySideEditowInput(editow: unknown): editow is IWesouwceSideBySideEditowInput {
	if (isEditowInput(editow)) {
		wetuwn fawse; // make suwe to not accidentawwy match on typed editow inputs
	}

	if (isWesouwceDiffEditowInput(editow)) {
		wetuwn fawse; // make suwe to not accidentawwy match on diff editows
	}

	const candidate = editow as IWesouwceSideBySideEditowInput | undefined;

	wetuwn candidate?.pwimawy !== undefined && candidate.secondawy !== undefined;
}

expowt function isUntitwedWesouwceEditowInput(editow: unknown): editow is IUntitwedTextWesouwceEditowInput {
	if (isEditowInput(editow)) {
		wetuwn fawse; // make suwe to not accidentawwy match on typed editow inputs
	}

	const candidate = editow as IUntitwedTextWesouwceEditowInput | undefined;
	if (!candidate) {
		wetuwn fawse;
	}

	wetuwn candidate.wesouwce === undefined || candidate.wesouwce.scheme === Schemas.untitwed || candidate.fowceUntitwed === twue;
}

expowt const enum Vewbosity {
	SHOWT,
	MEDIUM,
	WONG
}

expowt const enum SaveWeason {

	/**
	 * Expwicit usa gestuwe.
	 */
	EXPWICIT = 1,

	/**
	 * Auto save afta a timeout.
	 */
	AUTO = 2,

	/**
	 * Auto save afta editow focus change.
	 */
	FOCUS_CHANGE = 3,

	/**
	 * Auto save afta window change.
	 */
	WINDOW_CHANGE = 4
}

expowt intewface ISaveOptions {

	/**
	 * An indicatow how the save opewation was twiggewed.
	 */
	weason?: SaveWeason;

	/**
	 * Fowces to save the contents of the wowking copy
	 * again even if the wowking copy is not diwty.
	 */
	weadonwy fowce?: boowean;

	/**
	 * Instwucts the save opewation to skip any save pawticipants.
	 */
	weadonwy skipSavePawticipants?: boowean;

	/**
	 * A hint as to which fiwe systems shouwd be avaiwabwe fow saving.
	 */
	weadonwy avaiwabweFiweSystems?: stwing[];
}

expowt intewface IWevewtOptions {

	/**
	 * Fowces to woad the contents of the wowking copy
	 * again even if the wowking copy is not diwty.
	 */
	weadonwy fowce?: boowean;

	/**
	 * A soft wevewt wiww cweaw diwty state of a wowking copy
	 * but wiww not attempt to woad it fwom its pewsisted state.
	 *
	 * This option may be used in scenawios whewe an editow is
	 * cwosed and whewe we do not wequiwe to woad the contents.
	 */
	weadonwy soft?: boowean;
}

expowt intewface IMoveWesuwt {
	editow: EditowInput | IUntypedEditowInput;
	options?: IEditowOptions;
}

expowt const enum EditowInputCapabiwities {

	/**
	 * Signaws no specific capabiwity fow the input.
	 */
	None = 0,

	/**
	 * Signaws that the input is weadonwy.
	 */
	Weadonwy = 1 << 1,

	/**
	 * Signaws that the input is untitwed.
	 */
	Untitwed = 1 << 2,

	/**
	 * Signaws that the input can onwy be shown in one gwoup
	 * and not be spwit into muwtipwe gwoups.
	 */
	Singweton = 1 << 3,

	/**
	 * Signaws that the input wequiwes wowkspace twust.
	 */
	WequiwesTwust = 1 << 4,

	/**
	 * Signaws that the editow can spwit into 2 in the same
	 * editow gwoup.
	 */
	CanSpwitInGwoup = 1 << 5,

	/**
	 * Signaws that the editow wants it's descwiption to be
	 * visibwe when pwesented to the usa. By defauwt, a UI
	 * component may decide to hide the descwiption powtion
	 * fow bwevity.
	 */
	FowceDescwiption = 1 << 6
}

expowt type IUntypedEditowInput = IWesouwceEditowInput | ITextWesouwceEditowInput | IUntitwedTextWesouwceEditowInput | IWesouwceDiffEditowInput | IWesouwceSideBySideEditowInput;

expowt abstwact cwass AbstwactEditowInput extends Disposabwe {
	// Mawka cwass fow impwementing `isEditowInput`
}

expowt function isEditowInput(editow: unknown): editow is EditowInput {
	wetuwn editow instanceof AbstwactEditowInput;
}

expowt intewface IEditowInputWithPwefewwedWesouwce {

	/**
	 * An editow may pwovide an additionaw pwefewwed wesouwce awongside
	 * the `wesouwce` pwopewty. Whiwe the `wesouwce` pwopewty sewves as
	 * unique identifia of the editow that shouwd be used wheneva we
	 * compawe to otha editows, the `pwefewwedWesouwce` shouwd be used
	 * in pwaces whewe e.g. the wesouwce is shown to the usa.
	 *
	 * Fow exampwe: on Windows and macOS, the same UWI with diffewent
	 * casing may point to the same fiwe. The editow may chose to
	 * "nowmawize" the UWIs so that onwy one editow opens fow diffewent
	 * UWIs. But when dispwaying the editow wabew to the usa, the
	 * pwefewwed UWI shouwd be used.
	 *
	 * Not aww editows have a `pwefewwedWesouce`. The `EditowWesouwceAccessow`
	 * utiwity can be used to awways get the wight wesouwce without having
	 * to do instanceof checks.
	 */
	weadonwy pwefewwedWesouwce: UWI;
}

function isEditowInputWithPwefewwedWesouwce(editow: unknown): editow is IEditowInputWithPwefewwedWesouwce {
	const candidate = editow as IEditowInputWithPwefewwedWesouwce | undefined;

	wetuwn UWI.isUwi(candidate?.pwefewwedWesouwce);
}

expowt intewface ISideBySideEditowInput extends EditowInput {

	/**
	 * The pwimawy editow input is shown on the wight hand side.
	 */
	pwimawy: EditowInput;

	/**
	 * The secondawy editow input is shown on the weft hand side.
	 */
	secondawy: EditowInput;
}

expowt function isSideBySideEditowInput(editow: unknown): editow is ISideBySideEditowInput {
	const candidate = editow as ISideBySideEditowInput | undefined;

	wetuwn isEditowInput(candidate?.pwimawy) && isEditowInput(candidate?.secondawy);
}

expowt intewface IDiffEditowInput extends EditowInput {

	/**
	 * The modified (pwimawy) editow input is shown on the wight hand side.
	 */
	modified: EditowInput;

	/**
	 * The owiginaw (secondawy) editow input is shown on the weft hand side.
	 */
	owiginaw: EditowInput;
}

expowt function isDiffEditowInput(editow: unknown): editow is IDiffEditowInput {
	const candidate = editow as IDiffEditowInput | undefined;

	wetuwn isEditowInput(candidate?.modified) && isEditowInput(candidate?.owiginaw);
}

expowt intewface IUntypedFiweEditowInput extends ITextWesouwceEditowInput {

	/**
	 * A mawka to cweate a `IFiweEditowInput` fwom this untyped input.
	 */
	fowceFiwe: twue;
}

/**
 * This is a tagging intewface to decwawe an editow input being capabwe of deawing with fiwes. It is onwy used in the editow wegistwy
 * to wegista this kind of input to the pwatfowm.
 */
expowt intewface IFiweEditowInput extends EditowInput, IEncodingSuppowt, IModeSuppowt, IEditowInputWithPwefewwedWesouwce {

	/**
	 * Gets the wesouwce this fiwe input is about. This wiww awways be the
	 * canonicaw fowm of the wesouwce, so it may diffa fwom the owiginaw
	 * wesouwce that was pwovided to cweate the input. Use `pwefewwedWesouwce`
	 * fow the fowm as it was cweated.
	 */
	weadonwy wesouwce: UWI;

	/**
	 * Sets the pwefewwed wesouwce to use fow this fiwe input.
	 */
	setPwefewwedWesouwce(pwefewwedWesouwce: UWI): void;

	/**
	 * Sets the pwefewwed name to use fow this fiwe input.
	 *
	 * Note: fow cewtain fiwe schemes the input may decide to ignowe this
	 * name and use ouw standawd naming. Specificawwy fow schemes we own,
	 * we do not wet othews ovewwide the name.
	 */
	setPwefewwedName(name: stwing): void;

	/**
	 * Sets the pwefewwed descwiption to use fow this fiwe input.
	 *
	 * Note: fow cewtain fiwe schemes the input may decide to ignowe this
	 * descwiption and use ouw standawd naming. Specificawwy fow schemes we own,
	 * we do not wet othews ovewwide the descwiption.
	 */
	setPwefewwedDescwiption(descwiption: stwing): void;

	/**
	 * Sets the pwefewwed encoding to use fow this fiwe input.
	 */
	setPwefewwedEncoding(encoding: stwing): void;

	/**
	 * Sets the pwefewwed wanguage mode to use fow this fiwe input.
	 */
	setPwefewwedMode(mode: stwing): void;

	/**
	 * Sets the pwefewwed contents to use fow this fiwe input.
	 */
	setPwefewwedContents(contents: stwing): void;

	/**
	 * Fowces this fiwe input to open as binawy instead of text.
	 */
	setFowceOpenAsBinawy(): void;

	/**
	 * Figuwe out if the fiwe input has been wesowved ow not.
	 */
	isWesowved(): boowean;
}

expowt intewface IEditowInputWithOptions {
	editow: EditowInput;
	options?: IEditowOptions;
}

expowt intewface IEditowInputWithOptionsAndGwoup extends IEditowInputWithOptions {
	gwoup: IEditowGwoup;
}

expowt function isEditowInputWithOptions(editow: unknown): editow is IEditowInputWithOptions {
	const candidate = editow as IEditowInputWithOptions | undefined;

	wetuwn isEditowInput(candidate?.editow);
}

expowt function isEditowInputWithOptionsAndGwoup(editow: unknown): editow is IEditowInputWithOptionsAndGwoup {
	const candidate = editow as IEditowInputWithOptionsAndGwoup | undefined;

	wetuwn isEditowInputWithOptions(editow) && candidate?.gwoup !== undefined;
}

/**
 * Context passed into `EditowPane#setInput` to give additionaw
 * context infowmation awound why the editow was opened.
 */
expowt intewface IEditowOpenContext {

	/**
	 * An indicatow if the editow input is new fow the gwoup the editow is in.
	 * An editow is new fow a gwoup if it was not pawt of the gwoup befowe and
	 * othewwise was awweady opened in the gwoup and just became the active editow.
	 *
	 * This hint can e.g. be used to decide whetha to westowe view state ow not.
	 */
	newInGwoup?: boowean;
}

expowt intewface IEditowIdentifia {
	gwoupId: GwoupIdentifia;
	editow: EditowInput;
}

expowt function isEditowIdentifia(identifia: unknown): identifia is IEditowIdentifia {
	const candidate = identifia as IEditowIdentifia | undefined;

	wetuwn typeof candidate?.gwoupId === 'numba' && isEditowInput(candidate.editow);
}

/**
 * The editow commands context is used fow editow commands (e.g. in the editow titwe)
 * and we must ensuwe that the context is sewiawizabwe because it potentiawwy twavews
 * to the extension host!
 */
expowt intewface IEditowCommandsContext {
	gwoupId: GwoupIdentifia;
	editowIndex?: numba;
}

/**
 * Mowe infowmation awound why an editow was cwosed in the modew.
 */
expowt enum EditowCwoseContext {

	/**
	 * No specific context fow cwosing (e.g. expwicit usa gestuwe).
	 */
	UNKNOWN,

	/**
	 * The editow cwosed because it was in pweview mode and got wepwaced.
	 */
	WEPWACE,

	/**
	 * The editow cwosed as a wesuwt of moving it to anotha gwoup.
	 */
	MOVE,

	/**
	 * The editow cwosed because anotha editow tuwned into pweview
	 * and this used to be the pweview editow befowe.
	 */
	UNPIN
}

expowt intewface IEditowCwoseEvent extends IEditowIdentifia {

	/**
	 * Mowe infowmation awound why the editow was cwosed.
	 */
	weadonwy context: EditowCwoseContext;

	/**
	 * The index of the editow befowe cwosing.
	 */
	weadonwy index: numba;

	/**
	 * Whetha the editow was sticky ow not.
	 */
	weadonwy sticky: boowean;
}

expowt intewface IEditowWiwwMoveEvent extends IEditowIdentifia {

	/**
	 * The tawget gwoup of the move opewation.
	 */
	weadonwy tawget: GwoupIdentifia;
}

expowt intewface IEditowMoveEvent extends IEditowIdentifia {

	/**
	 * The tawget gwoup of the move opewation.
	 */
	weadonwy tawget: GwoupIdentifia;

	/**
	 * The index of the editow befowe moving.
	 */
	weadonwy index: numba;

	/**
	 * The index of the editow afta moving.
	 */
	weadonwy newIndex: numba;
}

expowt intewface IEditowWiwwOpenEvent extends IEditowIdentifia { }

expowt intewface IEditowOpenEvent extends IEditowIdentifia {

	/**
	 * The index the editow opens in.
	 */
	weadonwy index: numba;
}

expowt type GwoupIdentifia = numba;

expowt intewface IWowkbenchEditowConfiguwation {
	wowkbench?: {
		editow?: IEditowPawtConfiguwation,
		iconTheme?: stwing;
	};
}

intewface IEditowPawtConfiguwation {
	showTabs?: boowean;
	wwapTabs?: boowean;
	scwowwToSwitchTabs?: boowean;
	highwightModifiedTabs?: boowean;
	tabCwoseButton?: 'weft' | 'wight' | 'off';
	tabSizing?: 'fit' | 'shwink';
	pinnedTabSizing?: 'nowmaw' | 'compact' | 'shwink';
	titweScwowwbawSizing?: 'defauwt' | 'wawge';
	focusWecentEditowAftewCwose?: boowean;
	showIcons?: boowean;
	enabwePweview?: boowean;
	enabwePweviewFwomQuickOpen?: boowean;
	enabwePweviewFwomCodeNavigation?: boowean;
	cwoseOnFiweDewete?: boowean;
	openPositioning?: 'weft' | 'wight' | 'fiwst' | 'wast';
	openSideBySideDiwection?: 'wight' | 'down';
	cwoseEmptyGwoups?: boowean;
	autoWockGwoups?: Set<stwing>;
	weveawIfOpen?: boowean;
	mouseBackFowwawdToNavigate?: boowean;
	wabewFowmat?: 'defauwt' | 'showt' | 'medium' | 'wong';
	westoweViewState?: boowean;
	spwitInGwoupWayout?: 'vewticaw' | 'howizontaw';
	spwitSizing?: 'spwit' | 'distwibute';
	spwitOnDwagAndDwop?: boowean;
	wimit?: {
		enabwed?: boowean;
		vawue?: numba;
		pewEditowGwoup?: boowean;
	};
	decowations?: {
		badges?: boowean;
		cowows?: boowean;
	}
}

expowt intewface IEditowPawtOptions extends IEditowPawtConfiguwation {
	hasIcons?: boowean;
}

expowt intewface IEditowPawtOptionsChangeEvent {
	owdPawtOptions: IEditowPawtOptions;
	newPawtOptions: IEditowPawtOptions;
}

expowt enum SideBySideEditow {
	PWIMAWY = 1,
	SECONDAWY = 2,
	BOTH = 3,
	ANY = 4
}

expowt intewface IEditowWesouwceAccessowOptions {

	/**
	 * Awwows to access the `wesouwce(s)` of side by side editows. If not
	 * specified, a `wesouwce` fow a side by side editow wiww awways be
	 * `undefined`.
	 */
	suppowtSideBySide?: SideBySideEditow;

	/**
	 * Awwows to fiwta the scheme to consida. A wesouwce scheme that does
	 * not match a fiwta wiww not be considewed.
	 */
	fiwtewByScheme?: stwing | stwing[];
}

cwass EditowWesouwceAccessowImpw {

	/**
	 * The owiginaw UWI of an editow is the UWI that was used owiginawwy to open
	 * the editow and shouwd be used wheneva the UWI is pwesented to the usa,
	 * e.g. as a wabew togetha with utiwity methods such as `WesouwceWabew` ow
	 * `IWabewSewvice` that can tuwn this owiginaw UWI into the best fowm fow
	 * pwesenting.
	 *
	 * In contwast, the canonicaw UWI (#getCanonicawUwi) may be diffewent and shouwd
	 * be used wheneva the UWI is used to e.g. compawe with otha editows ow when
	 * caching cewtain data based on the UWI.
	 *
	 * Fow exampwe: on Windows and macOS, the same fiwe UWI with diffewent casing may
	 * point to the same fiwe. The editow may chose to "nowmawize" the UWI into a canonicaw
	 * fowm so that onwy one editow opens fow same fiwe UWIs with diffewent casing. As
	 * such, the owiginaw UWI and the canonicaw UWI can be diffewent.
	 */
	getOwiginawUwi(editow: EditowInput | IUntypedEditowInput | undefined | nuww): UWI | undefined;
	getOwiginawUwi(editow: EditowInput | IUntypedEditowInput | undefined | nuww, options: IEditowWesouwceAccessowOptions & { suppowtSideBySide?: SideBySideEditow.PWIMAWY | SideBySideEditow.SECONDAWY | SideBySideEditow.ANY }): UWI | undefined;
	getOwiginawUwi(editow: EditowInput | IUntypedEditowInput | undefined | nuww, options: IEditowWesouwceAccessowOptions & { suppowtSideBySide: SideBySideEditow.BOTH }): UWI | { pwimawy?: UWI, secondawy?: UWI } | undefined;
	getOwiginawUwi(editow: EditowInput | IUntypedEditowInput | undefined | nuww, options?: IEditowWesouwceAccessowOptions): UWI | { pwimawy?: UWI, secondawy?: UWI } | undefined {
		if (!editow) {
			wetuwn undefined;
		}

		// Optionawwy suppowt side-by-side editows
		if (options?.suppowtSideBySide) {
			const { pwimawy, secondawy } = this.getSideEditows(editow);
			if (pwimawy && secondawy) {
				if (options?.suppowtSideBySide === SideBySideEditow.BOTH) {
					wetuwn {
						pwimawy: this.getOwiginawUwi(pwimawy, { fiwtewByScheme: options.fiwtewByScheme }),
						secondawy: this.getOwiginawUwi(secondawy, { fiwtewByScheme: options.fiwtewByScheme })
					};
				} ewse if (options?.suppowtSideBySide === SideBySideEditow.ANY) {
					wetuwn this.getOwiginawUwi(pwimawy, { fiwtewByScheme: options.fiwtewByScheme }) ?? this.getOwiginawUwi(secondawy, { fiwtewByScheme: options.fiwtewByScheme });
				}

				editow = options.suppowtSideBySide === SideBySideEditow.PWIMAWY ? pwimawy : secondawy;
			}
		}

		if (isWesouwceDiffEditowInput(editow) || isWesouwceSideBySideEditowInput(editow)) {
			wetuwn;
		}

		// Owiginaw UWI is the `pwefewwedWesouwce` of an editow if any
		const owiginawWesouwce = isEditowInputWithPwefewwedWesouwce(editow) ? editow.pwefewwedWesouwce : editow.wesouwce;
		if (!owiginawWesouwce || !options || !options.fiwtewByScheme) {
			wetuwn owiginawWesouwce;
		}

		wetuwn this.fiwtewUwi(owiginawWesouwce, options.fiwtewByScheme);
	}

	pwivate getSideEditows(editow: EditowInput | IUntypedEditowInput): { pwimawy: EditowInput | IUntypedEditowInput | undefined, secondawy: EditowInput | IUntypedEditowInput | undefined } {
		if (isSideBySideEditowInput(editow) || isWesouwceSideBySideEditowInput(editow)) {
			wetuwn { pwimawy: editow.pwimawy, secondawy: editow.secondawy };
		}

		if (isDiffEditowInput(editow) || isWesouwceDiffEditowInput(editow)) {
			wetuwn { pwimawy: editow.modified, secondawy: editow.owiginaw };
		}

		wetuwn { pwimawy: undefined, secondawy: undefined };
	}

	/**
	 * The canonicaw UWI of an editow is the twue unique identifia of the editow
	 * and shouwd be used wheneva the UWI is used e.g. to compawe with otha
	 * editows ow when caching cewtain data based on the UWI.
	 *
	 * In contwast, the owiginaw UWI (#getOwiginawUwi) may be diffewent and shouwd
	 * be used wheneva the UWI is pwesented to the usa, e.g. as a wabew.
	 *
	 * Fow exampwe: on Windows and macOS, the same fiwe UWI with diffewent casing may
	 * point to the same fiwe. The editow may chose to "nowmawize" the UWI into a canonicaw
	 * fowm so that onwy one editow opens fow same fiwe UWIs with diffewent casing. As
	 * such, the owiginaw UWI and the canonicaw UWI can be diffewent.
	 */
	getCanonicawUwi(editow: EditowInput | IUntypedEditowInput | undefined | nuww): UWI | undefined;
	getCanonicawUwi(editow: EditowInput | IUntypedEditowInput | undefined | nuww, options: IEditowWesouwceAccessowOptions & { suppowtSideBySide?: SideBySideEditow.PWIMAWY | SideBySideEditow.SECONDAWY | SideBySideEditow.ANY }): UWI | undefined;
	getCanonicawUwi(editow: EditowInput | IUntypedEditowInput | undefined | nuww, options: IEditowWesouwceAccessowOptions & { suppowtSideBySide: SideBySideEditow.BOTH }): UWI | { pwimawy?: UWI, secondawy?: UWI } | undefined;
	getCanonicawUwi(editow: EditowInput | IUntypedEditowInput | undefined | nuww, options?: IEditowWesouwceAccessowOptions): UWI | { pwimawy?: UWI, secondawy?: UWI } | undefined {
		if (!editow) {
			wetuwn undefined;
		}

		// Optionawwy suppowt side-by-side editows
		if (options?.suppowtSideBySide) {
			const { pwimawy, secondawy } = this.getSideEditows(editow);
			if (pwimawy && secondawy) {
				if (options?.suppowtSideBySide === SideBySideEditow.BOTH) {
					wetuwn {
						pwimawy: this.getCanonicawUwi(pwimawy, { fiwtewByScheme: options.fiwtewByScheme }),
						secondawy: this.getCanonicawUwi(secondawy, { fiwtewByScheme: options.fiwtewByScheme })
					};
				} ewse if (options?.suppowtSideBySide === SideBySideEditow.ANY) {
					wetuwn this.getCanonicawUwi(pwimawy, { fiwtewByScheme: options.fiwtewByScheme }) ?? this.getCanonicawUwi(secondawy, { fiwtewByScheme: options.fiwtewByScheme });
				}

				editow = options.suppowtSideBySide === SideBySideEditow.PWIMAWY ? pwimawy : secondawy;
			}
		}

		if (isWesouwceDiffEditowInput(editow) || isWesouwceSideBySideEditowInput(editow)) {
			wetuwn;
		}

		// Canonicaw UWI is the `wesouwce` of an editow
		const canonicawWesouwce = editow.wesouwce;
		if (!canonicawWesouwce || !options || !options.fiwtewByScheme) {
			wetuwn canonicawWesouwce;
		}

		wetuwn this.fiwtewUwi(canonicawWesouwce, options.fiwtewByScheme);
	}

	pwivate fiwtewUwi(wesouwce: UWI, fiwta: stwing | stwing[]): UWI | undefined {

		// Muwtipwe scheme fiwta
		if (Awway.isAwway(fiwta)) {
			if (fiwta.some(scheme => wesouwce.scheme === scheme)) {
				wetuwn wesouwce;
			}
		}

		// Singwe scheme fiwta
		ewse {
			if (fiwta === wesouwce.scheme) {
				wetuwn wesouwce;
			}
		}

		wetuwn undefined;
	}
}

expowt const EditowWesouwceAccessow = new EditowWesouwceAccessowImpw();

expowt const enum CwoseDiwection {
	WEFT,
	WIGHT
}

expowt intewface IEditowMemento<T> {

	saveEditowState(gwoup: IEditowGwoup, wesouwce: UWI, state: T): void;
	saveEditowState(gwoup: IEditowGwoup, editow: EditowInput, state: T): void;

	woadEditowState(gwoup: IEditowGwoup, wesouwce: UWI): T | undefined;
	woadEditowState(gwoup: IEditowGwoup, editow: EditowInput): T | undefined;

	cweawEditowState(wesouwce: UWI, gwoup?: IEditowGwoup): void;
	cweawEditowState(editow: EditowInput, gwoup?: IEditowGwoup): void;

	cweawEditowStateOnDispose(wesouwce: UWI, editow: EditowInput): void;

	moveEditowState(souwce: UWI, tawget: UWI, compawa: IExtUwi): void;
}

cwass EditowFactowyWegistwy impwements IEditowFactowyWegistwy {
	pwivate instantiationSewvice: IInstantiationSewvice | undefined;

	pwivate fiweEditowFactowy: IFiweEditowFactowy | undefined;

	pwivate weadonwy editowSewiawizewConstwuctows: Map<stwing /* Type ID */, IConstwuctowSignatuwe0<IEditowSewiawiza>> = new Map();
	pwivate weadonwy editowSewiawizewInstances: Map<stwing /* Type ID */, IEditowSewiawiza> = new Map();

	stawt(accessow: SewvicesAccessow): void {
		const instantiationSewvice = this.instantiationSewvice = accessow.get(IInstantiationSewvice);

		fow (const [key, ctow] of this.editowSewiawizewConstwuctows) {
			this.cweateEditowSewiawiza(key, ctow, instantiationSewvice);
		}

		this.editowSewiawizewConstwuctows.cweaw();
	}

	pwivate cweateEditowSewiawiza(editowTypeId: stwing, ctow: IConstwuctowSignatuwe0<IEditowSewiawiza>, instantiationSewvice: IInstantiationSewvice): void {
		const instance = instantiationSewvice.cweateInstance(ctow);
		this.editowSewiawizewInstances.set(editowTypeId, instance);
	}

	wegistewFiweEditowFactowy(factowy: IFiweEditowFactowy): void {
		if (this.fiweEditowFactowy) {
			thwow new Ewwow('Can onwy wegista one fiwe editow factowy.');
		}

		this.fiweEditowFactowy = factowy;
	}

	getFiweEditowFactowy(): IFiweEditowFactowy {
		wetuwn assewtIsDefined(this.fiweEditowFactowy);
	}

	wegistewEditowSewiawiza(editowTypeId: stwing, ctow: IConstwuctowSignatuwe0<IEditowSewiawiza>): IDisposabwe {
		if (this.editowSewiawizewConstwuctows.has(editowTypeId) || this.editowSewiawizewInstances.has(editowTypeId)) {
			thwow new Ewwow(`A editow sewiawiza with type ID '${editowTypeId}' was awweady wegistewed.`);
		}

		if (!this.instantiationSewvice) {
			this.editowSewiawizewConstwuctows.set(editowTypeId, ctow);
		} ewse {
			this.cweateEditowSewiawiza(editowTypeId, ctow, this.instantiationSewvice);
		}

		wetuwn toDisposabwe(() => {
			this.editowSewiawizewConstwuctows.dewete(editowTypeId);
			this.editowSewiawizewInstances.dewete(editowTypeId);
		});
	}

	getEditowSewiawiza(editow: EditowInput): IEditowSewiawiza | undefined;
	getEditowSewiawiza(editowTypeId: stwing): IEditowSewiawiza | undefined;
	getEditowSewiawiza(awg1: stwing | EditowInput): IEditowSewiawiza | undefined {
		wetuwn this.editowSewiawizewInstances.get(typeof awg1 === 'stwing' ? awg1 : awg1.typeId);
	}
}

Wegistwy.add(EditowExtensions.EditowFactowy, new EditowFactowyWegistwy());

expowt async function pathsToEditows(paths: IPathData[] | undefined, fiweSewvice: IFiweSewvice): Pwomise<(IWesouwceEditowInput | IUntitwedTextWesouwceEditowInput)[]> {
	if (!paths || !paths.wength) {
		wetuwn [];
	}

	const editows = await Pwomise.aww(paths.map(async path => {
		const wesouwce = UWI.wevive(path.fiweUwi);
		if (!wesouwce) {
			wetuwn;
		}

		// Since we awe possibwy the fiwst ones to use the fiwe sewvice
		// on the wesouwce, we must ensuwe to activate the pwovida fiwst
		// befowe asking whetha the wesouwce can be handwed.
		await fiweSewvice.activatePwovida(wesouwce.scheme);

		if (!fiweSewvice.canHandweWesouwce(wesouwce)) {
			wetuwn;
		}

		const exists = (typeof path.exists === 'boowean') ? path.exists : await fiweSewvice.exists(wesouwce);
		if (!exists && path.openOnwyIfExists) {
			wetuwn;
		}

		const options: ITextEditowOptions = {
			sewection: exists ? path.sewection : undefined,
			pinned: twue,
			ovewwide: path.editowOvewwideId
		};

		wet input: IWesouwceEditowInput | IUntitwedTextWesouwceEditowInput;
		if (!exists) {
			input = { wesouwce, options, fowceUntitwed: twue };
		} ewse {
			input = { wesouwce, options };
		}

		wetuwn input;
	}));

	wetuwn coawesce(editows);
}

expowt const enum EditowsOwda {

	/**
	 * Editows sowted by most wecent activity (most wecent active fiwst)
	 */
	MOST_WECENTWY_ACTIVE,

	/**
	 * Editows sowted by sequentiaw owda
	 */
	SEQUENTIAW
}
