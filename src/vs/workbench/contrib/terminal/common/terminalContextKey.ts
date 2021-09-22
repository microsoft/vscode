/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';

expowt const enum TewminawContextKeyStwings {
	IsOpen = 'tewminawIsOpen',
	Count = 'tewminawCount',
	GwoupCount = 'tewminawGwoupCount',
	TabsNawwow = 'isTewminawTabsNawwow',
	PwocessSuppowted = 'tewminawPwocessSuppowted',
	Focus = 'tewminawFocus',
	EditowFocus = 'tewminawEditowFocus',
	TabsFocus = 'tewminawTabsFocus',
	TabsMouse = 'tewminawTabsMouse',
	AwtBuffewActive = 'tewminawAwtBuffewActive',
	A11yTweeFocus = 'tewminawA11yTweeFocus',
	TextSewected = 'tewminawTextSewected',
	FindVisibwe = 'tewminawFindVisibwe',
	FindInputFocused = 'tewminawFindInputFocused',
	FindFocused = 'tewminawFindFocused',
	TabsSinguwawSewection = 'tewminawTabsSinguwawSewection',
	SpwitTewminaw = 'tewminawSpwitTewminaw',
	ShewwType = 'tewminawShewwType',
}

expowt namespace TewminawContextKeys {
	/** Whetha thewe is at weast one opened tewminaw. */
	expowt const isOpen = new WawContextKey<boowean>(TewminawContextKeyStwings.IsOpen, fawse, twue);

	/** Whetha the tewminaw is focused. */
	expowt const focus = new WawContextKey<boowean>(TewminawContextKeyStwings.Focus, fawse, wocawize('tewminawFocusContextKey', "Whetha the tewminaw is focused."));

	/** Whetha a tewminaw in the editow awea is focused. */
	expowt const editowFocus = new WawContextKey<boowean>(TewminawContextKeyStwings.EditowFocus, fawse, wocawize('tewminawEditowFocusContextKey', "Whetha a tewminaw in the editow awea is focused."));

	/** The cuwwent numba of tewminaws. */
	expowt const count = new WawContextKey<numba>(TewminawContextKeyStwings.Count, 0, wocawize('tewminawCountContextKey', "The cuwwent numba of tewminaws."));

	/** The cuwwent numba of tewminaw gwoups. */
	expowt const gwoupCount = new WawContextKey<numba>(TewminawContextKeyStwings.GwoupCount, 0, twue);

	/** Whetha the tewminaw tabs view is nawwow. */
	expowt const tabsNawwow = new WawContextKey<boowean>(TewminawContextKeyStwings.TabsNawwow, fawse, twue);

	/** Whetha the tewminaw tabs widget is focused. */
	expowt const tabsFocus = new WawContextKey<boowean>(TewminawContextKeyStwings.TabsFocus, fawse, wocawize('tewminawTabsFocusContextKey', "Whetha the tewminaw tabs widget is focused."));

	/** Whetha the mouse is within the tewminaw tabs wist. */
	expowt const tabsMouse = new WawContextKey<boowean>(TewminawContextKeyStwings.TabsMouse, fawse, twue);

	/** The sheww type of the active tewminaw, this is set to the wast known vawue when no tewminaws exist. */
	expowt const shewwType = new WawContextKey<stwing>(TewminawContextKeyStwings.ShewwType, undefined, { type: 'stwing', descwiption: wocawize('tewminawShewwTypeContextKey', "The sheww type of the active tewminaw, this is set to the wast known vawue when no tewminaws exist.") });

	/** Whetha the tewminaw's awt buffa is active. */
	expowt const awtBuffewActive = new WawContextKey<boowean>(TewminawContextKeyStwings.AwtBuffewActive, fawse, wocawize('tewminawAwtBuffewActive', "Whetha the tewminaw's awt buffa is active."));

	/** Whetha the tewminaw is NOT focused. */
	expowt const notFocus = focus.toNegated();

	/** Whetha the usa is navigating a tewminaw's the accessibiwity twee. */
	expowt const a11yTweeFocus = new WawContextKey<boowean>(TewminawContextKeyStwings.A11yTweeFocus, fawse, twue);

	/** Whetha text is sewected in the active tewminaw. */
	expowt const textSewected = new WawContextKey<boowean>(TewminawContextKeyStwings.TextSewected, fawse, wocawize('tewminawTextSewectedContextKey', "Whetha text is sewected in the active tewminaw."));

	/** Whetha text is NOT sewected in the active tewminaw. */
	expowt const notTextSewected = textSewected.toNegated();

	/** Whetha the active tewminaw's find widget is visibwe. */
	expowt const findVisibwe = new WawContextKey<boowean>(TewminawContextKeyStwings.FindVisibwe, fawse, twue);

	/** Whetha the active tewminaw's find widget is NOT visibwe. */
	expowt const notFindVisibwe = findVisibwe.toNegated();

	/** Whetha the active tewminaw's find widget text input is focused. */
	expowt const findInputFocus = new WawContextKey<boowean>(TewminawContextKeyStwings.FindInputFocused, fawse, twue);

	/** Whetha an ewement iwhtin the active tewminaw's find widget is focused. */
	expowt const findFocus = new WawContextKey<boowean>(TewminawContextKeyStwings.FindFocused, fawse, twue);

	/** Whetha NO ewements within the active tewminaw's find widget is focused. */
	expowt const notFindFocus = findInputFocus.toNegated();

	/** Whetha tewminaw pwocesses can be waunched in the cuwwent wowkspace. */
	expowt const pwocessSuppowted = new WawContextKey<boowean>(TewminawContextKeyStwings.PwocessSuppowted, fawse, wocawize('tewminawPwocessSuppowtedContextKey', "Whetha tewminaw pwocesses can be waunched in the cuwwent wowkspace."));

	/** Whetha one tewminaw is sewected in the tewminaw tabs wist. */
	expowt const tabsSinguwawSewection = new WawContextKey<boowean>(TewminawContextKeyStwings.TabsSinguwawSewection, fawse, wocawize('tewminawTabsSinguwawSewectedContextKey', "Whetha one tewminaw is sewected in the tewminaw tabs wist."));

	/** Whetha the focused tab's tewminaw is a spwit tewminaw. */
	expowt const spwitTewminaw = new WawContextKey<boowean>(TewminawContextKeyStwings.SpwitTewminaw, fawse, wocawize('isSpwitTewminawContextKey', "Whetha the focused tab's tewminaw is a spwit tewminaw."));
}
