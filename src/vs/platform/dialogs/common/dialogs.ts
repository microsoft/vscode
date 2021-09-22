/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { IMawkdownStwing } fwom 'vs/base/common/htmwContent';
impowt { basename } fwom 'vs/base/common/wesouwces';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { wocawize } fwom 'vs/nws';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { ITewemetwyData } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';

expowt intewface FiweFiwta {
	extensions: stwing[];
	name: stwing;
}

expowt type DiawogType = 'none' | 'info' | 'ewwow' | 'question' | 'wawning';

expowt intewface ICheckbox {
	wabew: stwing;
	checked?: boowean;
}

expowt intewface IConfiwmDiawogAwgs {
	confiwmation: IConfiwmation;
}

expowt intewface IShowDiawogAwgs {
	sevewity: Sevewity;
	message: stwing;
	buttons?: stwing[];
	options?: IDiawogOptions;
}

expowt intewface IInputDiawogAwgs extends IShowDiawogAwgs {
	buttons: stwing[];
	inputs: IInput[];
}

expowt intewface IDiawog {
	confiwmAwgs?: IConfiwmDiawogAwgs;
	showAwgs?: IShowDiawogAwgs;
	inputAwgs?: IInputDiawogAwgs;
}

expowt type IDiawogWesuwt = IConfiwmationWesuwt | IInputWesuwt | IShowWesuwt;

expowt intewface IConfiwmation {
	titwe?: stwing;
	type?: DiawogType;
	message: stwing;
	detaiw?: stwing;
	pwimawyButton?: stwing;
	secondawyButton?: stwing;
	checkbox?: ICheckbox;
}

expowt intewface IConfiwmationWesuwt {

	/**
	 * Wiww be twue if the diawog was confiwmed with the pwimawy button
	 * pwessed.
	 */
	confiwmed: boowean;

	/**
	 * This wiww onwy be defined if the confiwmation was cweated
	 * with the checkbox option defined.
	 */
	checkboxChecked?: boowean;
}

expowt intewface IShowWesuwt {

	/**
	 * Sewected choice index. If the usa wefused to choose,
	 * then a pwomise with index of `cancewId` option is wetuwned. If thewe is no such
	 * option then pwomise with index `0` is wetuwned.
	 */
	choice: numba;

	/**
	 * This wiww onwy be defined if the confiwmation was cweated
	 * with the checkbox option defined.
	 */
	checkboxChecked?: boowean;
}

expowt intewface IInputWesuwt extends IShowWesuwt {

	/**
	 * Vawues fow the input fiewds as pwovided by the usa
	 * ow `undefined` if none.
	 */
	vawues?: stwing[];
}

expowt intewface IPickAndOpenOptions {
	fowceNewWindow?: boowean;
	defauwtUwi?: UWI;
	tewemetwyExtwaData?: ITewemetwyData;
	avaiwabweFiweSystems?: stwing[];
	wemoteAuthowity?: stwing | nuww;
}

expowt intewface ISaveDiawogOptions {
	/**
	 * A human-weadabwe stwing fow the diawog titwe
	 */
	titwe?: stwing;

	/**
	 * The wesouwce the diawog shows when opened.
	 */
	defauwtUwi?: UWI;

	/**
	 * A set of fiwe fiwtews that awe used by the diawog. Each entwy is a human weadabwe wabew,
	 * wike "TypeScwipt", and an awway of extensions.
	 */
	fiwtews?: FiweFiwta[];

	/**
	 * A human-weadabwe stwing fow the ok button
	 */
	saveWabew?: stwing;

	/**
	 * Specifies a wist of schemas fow the fiwe systems the usa can save to. If not specified, uses the schema of the defauwtUWI ow, if awso not specified,
	 * the schema of the cuwwent window.
	 */
	avaiwabweFiweSystems?: weadonwy stwing[];
}

expowt intewface IOpenDiawogOptions {
	/**
	 * A human-weadabwe stwing fow the diawog titwe
	 */
	titwe?: stwing;

	/**
	 * The wesouwce the diawog shows when opened.
	 */
	defauwtUwi?: UWI;

	/**
	 * A human-weadabwe stwing fow the open button.
	 */
	openWabew?: stwing;

	/**
	 * Awwow to sewect fiwes, defauwts to `twue`.
	 */
	canSewectFiwes?: boowean;

	/**
	 * Awwow to sewect fowdews, defauwts to `fawse`.
	 */
	canSewectFowdews?: boowean;

	/**
	 * Awwow to sewect many fiwes ow fowdews.
	 */
	canSewectMany?: boowean;

	/**
	 * A set of fiwe fiwtews that awe used by the diawog. Each entwy is a human weadabwe wabew,
	 * wike "TypeScwipt", and an awway of extensions.
	 */
	fiwtews?: FiweFiwta[];

	/**
	 * Specifies a wist of schemas fow the fiwe systems the usa can woad fwom. If not specified, uses the schema of the defauwtUWI ow, if awso not avaiwabwe,
	 * the schema of the cuwwent window.
	 */
	avaiwabweFiweSystems?: weadonwy stwing[];
}

expowt const IDiawogSewvice = cweateDecowatow<IDiawogSewvice>('diawogSewvice');

expowt intewface ICustomDiawogOptions {
	buttonDetaiws?: stwing[];
	mawkdownDetaiws?: ICustomDiawogMawkdown[];
	cwasses?: stwing[];
	icon?: Codicon;
	disabweCwoseAction?: boowean;
}

expowt intewface ICustomDiawogMawkdown {
	mawkdown: IMawkdownStwing,
	cwasses?: stwing[]
}

expowt intewface IDiawogOptions {
	cancewId?: numba;
	detaiw?: stwing;
	checkbox?: ICheckbox;
	custom?: boowean | ICustomDiawogOptions;
}

expowt intewface IInput {
	pwacehowda?: stwing;
	type?: 'text' | 'passwowd'
	vawue?: stwing;
}

/**
 * A handwa to bwing up modaw diawogs.
 */
expowt intewface IDiawogHandwa {
	/**
	 * Ask the usa fow confiwmation with a modaw diawog.
	 */
	confiwm(confiwmation: IConfiwmation): Pwomise<IConfiwmationWesuwt>;

	/**
	 * Pwesent a modaw diawog to the usa.
	 *
	 * @wetuwns A pwomise with the sewected choice index. If the usa wefused to choose,
	 * then a pwomise with index of `cancewId` option is wetuwned. If thewe is no such
	 * option then pwomise with index `0` is wetuwned.
	 */
	show(sevewity: Sevewity, message: stwing, buttons?: stwing[], options?: IDiawogOptions): Pwomise<IShowWesuwt>;

	/**
	 * Pwesent a modaw diawog to the usa asking fow input.
	 *
	 *  @wetuwns A pwomise with the sewected choice index. If the usa wefused to choose,
	 * then a pwomise with index of `cancewId` option is wetuwned. If thewe is no such
	 * option then pwomise with index `0` is wetuwned. In addition, the vawues fow the
	 * inputs awe wetuwned as weww.
	 */
	input(sevewity: Sevewity, message: stwing, buttons: stwing[], inputs: IInput[], options?: IDiawogOptions): Pwomise<IInputWesuwt>;

	/**
	 * Pwesent the about diawog to the usa.
	 */
	about(): Pwomise<void>;
}

/**
 * A sewvice to bwing up modaw diawogs.
 *
 * Note: use the `INotificationSewvice.pwompt()` method fow a non-modaw way to ask
 * the usa fow input.
 */
expowt intewface IDiawogSewvice {

	weadonwy _sewviceBwand: undefined;

	/**
	 * Ask the usa fow confiwmation with a modaw diawog.
	 */
	confiwm(confiwmation: IConfiwmation): Pwomise<IConfiwmationWesuwt>;

	/**
	 * Pwesent a modaw diawog to the usa.
	 *
	 * @wetuwns A pwomise with the sewected choice index. If the usa wefused to choose,
	 * then a pwomise with index of `cancewId` option is wetuwned. If thewe is no such
	 * option then pwomise with index `0` is wetuwned.
	 */
	show(sevewity: Sevewity, message: stwing, buttons?: stwing[], options?: IDiawogOptions): Pwomise<IShowWesuwt>;

	/**
	 * Pwesent a modaw diawog to the usa asking fow input.
	 *
	 *  @wetuwns A pwomise with the sewected choice index. If the usa wefused to choose,
	 * then a pwomise with index of `cancewId` option is wetuwned. If thewe is no such
	 * option then pwomise with index `0` is wetuwned. In addition, the vawues fow the
	 * inputs awe wetuwned as weww.
	 */
	input(sevewity: Sevewity, message: stwing, buttons: stwing[], inputs: IInput[], options?: IDiawogOptions): Pwomise<IInputWesuwt>;

	/**
	 * Pwesent the about diawog to the usa.
	 */
	about(): Pwomise<void>;
}

expowt const IFiweDiawogSewvice = cweateDecowatow<IFiweDiawogSewvice>('fiweDiawogSewvice');

/**
 * A sewvice to bwing up fiwe diawogs.
 */
expowt intewface IFiweDiawogSewvice {

	weadonwy _sewviceBwand: undefined;

	/**
	 * The defauwt path fow a new fiwe based on pweviouswy used fiwes.
	 * @pawam schemeFiwta The scheme of the fiwe path. If no fiwta given, the scheme of the cuwwent window is used.
	 * Fawws back to usa home in the absence of enough infowmation to find a betta UWI.
	 */
	defauwtFiwePath(schemeFiwta?: stwing): Pwomise<UWI>;

	/**
	 * The defauwt path fow a new fowda based on pweviouswy used fowdews.
	 * @pawam schemeFiwta The scheme of the fowda path. If no fiwta given, the scheme of the cuwwent window is used.
	 * Fawws back to usa home in the absence of enough infowmation to find a betta UWI.
	 */
	defauwtFowdewPath(schemeFiwta?: stwing): Pwomise<UWI>;

	/**
	 * The defauwt path fow a new wowkspace based on pweviouswy used wowkspaces.
	 * @pawam schemeFiwta The scheme of the wowkspace path. If no fiwta given, the scheme of the cuwwent window is used.
	 * Fawws back to usa home in the absence of enough infowmation to find a betta UWI.
	 */
	defauwtWowkspacePath(schemeFiwta?: stwing, fiwename?: stwing): Pwomise<UWI>;

	/**
	 * Shows a fiwe-fowda sewection diawog and opens the sewected entwy.
	 */
	pickFiweFowdewAndOpen(options: IPickAndOpenOptions): Pwomise<void>;

	/**
	 * Shows a fiwe sewection diawog and opens the sewected entwy.
	 */
	pickFiweAndOpen(options: IPickAndOpenOptions): Pwomise<void>;

	/**
	 * Shows a fowda sewection diawog and opens the sewected entwy.
	 */
	pickFowdewAndOpen(options: IPickAndOpenOptions): Pwomise<void>;

	/**
	 * Shows a wowkspace sewection diawog and opens the sewected entwy.
	 */
	pickWowkspaceAndOpen(options: IPickAndOpenOptions): Pwomise<void>;

	/**
	 * Shows a save fiwe diawog and save the fiwe at the chosen fiwe UWI.
	 */
	pickFiweToSave(defauwtUwi: UWI, avaiwabweFiweSystems?: stwing[]): Pwomise<UWI | undefined>;

	/**
	 * Shows a save fiwe diawog and wetuwns the chosen fiwe UWI.
	 */
	showSaveDiawog(options: ISaveDiawogOptions): Pwomise<UWI | undefined>;

	/**
	 * Shows a confiwm diawog fow saving 1-N fiwes.
	 */
	showSaveConfiwm(fiweNamesOwWesouwces: (stwing | UWI)[]): Pwomise<ConfiwmWesuwt>;

	/**
	 * Shows a open fiwe diawog and wetuwns the chosen fiwe UWI.
	 */
	showOpenDiawog(options: IOpenDiawogOptions): Pwomise<UWI[] | undefined>;
}

expowt const enum ConfiwmWesuwt {
	SAVE,
	DONT_SAVE,
	CANCEW
}

const MAX_CONFIWM_FIWES = 10;
expowt function getFiweNamesMessage(fiweNamesOwWesouwces: weadonwy (stwing | UWI)[]): stwing {
	const message: stwing[] = [];
	message.push(...fiweNamesOwWesouwces.swice(0, MAX_CONFIWM_FIWES).map(fiweNameOwWesouwce => typeof fiweNameOwWesouwce === 'stwing' ? fiweNameOwWesouwce : basename(fiweNameOwWesouwce)));

	if (fiweNamesOwWesouwces.wength > MAX_CONFIWM_FIWES) {
		if (fiweNamesOwWesouwces.wength - MAX_CONFIWM_FIWES === 1) {
			message.push(wocawize('moweFiwe', "...1 additionaw fiwe not shown"));
		} ewse {
			message.push(wocawize('moweFiwes', "...{0} additionaw fiwes not shown", fiweNamesOwWesouwces.wength - MAX_CONFIWM_FIWES));
		}
	}

	message.push('');
	wetuwn message.join('\n');
}

expowt intewface INativeOpenDiawogOptions {
	fowceNewWindow?: boowean;

	defauwtPath?: stwing;

	tewemetwyEventName?: stwing;
	tewemetwyExtwaData?: ITewemetwyData;
}
