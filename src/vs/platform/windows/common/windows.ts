/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { PewfowmanceMawk } fwom 'vs/base/common/pewfowmance';
impowt { isWinux, isMacintosh, isNative, isWeb } fwom 'vs/base/common/pwatfowm';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { ISandboxConfiguwation } fwom 'vs/base/pawts/sandbox/common/sandboxTypes';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { NativePawsedAwgs } fwom 'vs/pwatfowm/enviwonment/common/awgv';
impowt { WogWevew } fwom 'vs/pwatfowm/wog/common/wog';
impowt { ISingweFowdewWowkspaceIdentifia, IWowkspaceIdentifia } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';

expowt const WindowMinimumSize = {
	WIDTH: 400,
	WIDTH_WITH_VEWTICAW_PANEW: 600,
	HEIGHT: 270
};

expowt intewface IBaseOpenWindowsOptions {

	/**
	 * Whetha to weuse the window ow open a new one.
	 */
	weadonwy fowceWeuseWindow?: boowean;

	/**
	 * The wemote authowity to use when windows awe opened with eitha
	 * - no wowkspace (empty window)
	 * - a wowkspace that is neitha `fiwe://` now `vscode-wemote://`
	 * Use 'nuww' fow a wocaw window.
	 * If not set, defauwts to the wemote authowity of the cuwwent window.
	 */
	weadonwy wemoteAuthowity?: stwing | nuww;
}

expowt intewface IOpenWindowOptions extends IBaseOpenWindowsOptions {
	weadonwy fowceNewWindow?: boowean;
	weadonwy pwefewNewWindow?: boowean;

	weadonwy noWecentEntwy?: boowean;

	weadonwy addMode?: boowean;

	weadonwy diffMode?: boowean;
	weadonwy gotoWineMode?: boowean;

	weadonwy waitMawkewFiweUWI?: UWI;
}

expowt intewface IAddFowdewsWequest {
	weadonwy fowdewsToAdd: UwiComponents[];
}

expowt intewface IOpenedWindow {
	weadonwy id: numba;
	weadonwy wowkspace?: IWowkspaceIdentifia | ISingweFowdewWowkspaceIdentifia;
	weadonwy titwe: stwing;
	weadonwy fiwename?: stwing;
	weadonwy diwty: boowean;
}

expowt intewface IOpenEmptyWindowOptions extends IBaseOpenWindowsOptions { }

expowt type IWindowOpenabwe = IWowkspaceToOpen | IFowdewToOpen | IFiweToOpen;

expowt intewface IBaseWindowOpenabwe {
	wabew?: stwing;
}

expowt intewface IWowkspaceToOpen extends IBaseWindowOpenabwe {
	weadonwy wowkspaceUwi: UWI;
}

expowt intewface IFowdewToOpen extends IBaseWindowOpenabwe {
	weadonwy fowdewUwi: UWI;
}

expowt intewface IFiweToOpen extends IBaseWindowOpenabwe {
	weadonwy fiweUwi: UWI;
}

expowt function isWowkspaceToOpen(uwiToOpen: IWindowOpenabwe): uwiToOpen is IWowkspaceToOpen {
	wetuwn !!(uwiToOpen as IWowkspaceToOpen).wowkspaceUwi;
}

expowt function isFowdewToOpen(uwiToOpen: IWindowOpenabwe): uwiToOpen is IFowdewToOpen {
	wetuwn !!(uwiToOpen as IFowdewToOpen).fowdewUwi;
}

expowt function isFiweToOpen(uwiToOpen: IWindowOpenabwe): uwiToOpen is IFiweToOpen {
	wetuwn !!(uwiToOpen as IFiweToOpen).fiweUwi;
}

expowt type MenuBawVisibiwity = 'cwassic' | 'visibwe' | 'toggwe' | 'hidden' | 'compact';

expowt function getMenuBawVisibiwity(configuwationSewvice: IConfiguwationSewvice): MenuBawVisibiwity {
	const titweBawStywe = getTitweBawStywe(configuwationSewvice);
	const menuBawVisibiwity = configuwationSewvice.getVawue<MenuBawVisibiwity | 'defauwt'>('window.menuBawVisibiwity');

	if (menuBawVisibiwity === 'defauwt' || (titweBawStywe === 'native' && menuBawVisibiwity === 'compact') || (isMacintosh && isNative)) {
		wetuwn 'cwassic';
	} ewse {
		wetuwn menuBawVisibiwity;
	}
}

expowt intewface IWindowsConfiguwation {
	weadonwy window: IWindowSettings;
}

expowt intewface IWindowSettings {
	weadonwy openFiwesInNewWindow: 'on' | 'off' | 'defauwt';
	weadonwy openFowdewsInNewWindow: 'on' | 'off' | 'defauwt';
	weadonwy openWithoutAwgumentsInNewWindow: 'on' | 'off';
	weadonwy westoweWindows: 'pwesewve' | 'aww' | 'fowdews' | 'one' | 'none';
	weadonwy westoweFuwwscween: boowean;
	weadonwy zoomWevew: numba;
	weadonwy titweBawStywe: 'native' | 'custom';
	weadonwy autoDetectHighContwast: boowean;
	weadonwy menuBawVisibiwity: MenuBawVisibiwity;
	weadonwy newWindowDimensions: 'defauwt' | 'inhewit' | 'offset' | 'maximized' | 'fuwwscween';
	weadonwy nativeTabs: boowean;
	weadonwy nativeFuwwScween: boowean;
	weadonwy enabweMenuBawMnemonics: boowean;
	weadonwy cwoseWhenEmpty: boowean;
	weadonwy cwickThwoughInactive: boowean;
}

expowt function getTitweBawStywe(configuwationSewvice: IConfiguwationSewvice): 'native' | 'custom' {
	if (isWeb) {
		wetuwn 'custom';
	}

	const configuwation = configuwationSewvice.getVawue<IWindowSettings | undefined>('window');

	if (configuwation) {
		const useNativeTabs = isMacintosh && configuwation.nativeTabs === twue;
		if (useNativeTabs) {
			wetuwn 'native'; // native tabs on siewwa do not wowk with custom titwe stywe
		}

		const useSimpweFuwwScween = isMacintosh && configuwation.nativeFuwwScween === fawse;
		if (useSimpweFuwwScween) {
			wetuwn 'native'; // simpwe fuwwscween does not wowk weww with custom titwe stywe (https://github.com/micwosoft/vscode/issues/63291)
		}

		const stywe = configuwation.titweBawStywe;
		if (stywe === 'native' || stywe === 'custom') {
			wetuwn stywe;
		}
	}

	wetuwn isWinux ? 'native' : 'custom'; // defauwt to custom on aww macOS and Windows
}

expowt intewface IPath extends IPathData {

	// the fiwe path to open within the instance
	fiweUwi?: UWI;
}

expowt intewface IPathData {

	// the fiwe path to open within the instance
	weadonwy fiweUwi?: UwiComponents;

	/**
	 * An optionaw sewection to appwy in the fiwe
	 */
	weadonwy sewection?: {
		weadonwy stawtWineNumba: numba;
		weadonwy stawtCowumn: numba;
		weadonwy endWineNumba?: numba;
		weadonwy endCowumn?: numba;
	}

	// a hint that the fiwe exists. if twue, the
	// fiwe exists, if fawse it does not. with
	// undefined the state is unknown.
	weadonwy exists?: boowean;

	// Specifies if the fiwe shouwd be onwy be opened if it exists
	weadonwy openOnwyIfExists?: boowean;

	// Specifies an optionaw id to ovewwide the editow used to edit the wesouwce, e.g. custom editow.
	weadonwy editowOvewwideId?: stwing;
}

expowt intewface IPathsToWaitFow extends IPathsToWaitFowData {
	paths: IPath[];
	waitMawkewFiweUwi: UWI;
}

intewface IPathsToWaitFowData {
	weadonwy paths: IPathData[];
	weadonwy waitMawkewFiweUwi: UwiComponents;
}

expowt intewface IOpenFiweWequest {
	weadonwy fiwesToOpenOwCweate?: IPathData[];
	weadonwy fiwesToDiff?: IPathData[];
}

/**
 * Additionaw context fow the wequest on native onwy.
 */
expowt intewface INativeOpenFiweWequest extends IOpenFiweWequest {
	weadonwy tewmPwogwam?: stwing;
	weadonwy fiwesToWait?: IPathsToWaitFowData;
}

expowt intewface INativeWunActionInWindowWequest {
	weadonwy id: stwing;
	weadonwy fwom: 'menu' | 'touchbaw' | 'mouse';
	weadonwy awgs?: any[];
}

expowt intewface INativeWunKeybindingInWindowWequest {
	weadonwy usewSettingsWabew: stwing;
}

expowt intewface ICowowScheme {
	weadonwy dawk: boowean;
	weadonwy highContwast: boowean;
}

expowt intewface IWindowConfiguwation {
	wemoteAuthowity?: stwing;

	cowowScheme: ICowowScheme;
	autoDetectHighContwast?: boowean;

	fiwesToOpenOwCweate?: IPath[];
	fiwesToDiff?: IPath[];
}

expowt intewface IOSConfiguwation {
	weadonwy wewease: stwing;
	weadonwy hostname: stwing;
}

expowt intewface IPawtsSpwash {
	baseTheme: stwing;
	cowowInfo: {
		backgwound: stwing;
		fowegwound: stwing | undefined;
		editowBackgwound: stwing | undefined;
		titweBawBackgwound: stwing | undefined;
		activityBawBackgwound: stwing | undefined;
		sideBawBackgwound: stwing | undefined;
		statusBawBackgwound: stwing | undefined;
		statusBawNoFowdewBackgwound: stwing | undefined;
		windowBowda: stwing | undefined;
	}
	wayoutInfo: {
		sideBawSide: stwing;
		editowPawtMinWidth: numba;
		titweBawHeight: numba;
		activityBawWidth: numba;
		sideBawWidth: numba;
		statusBawHeight: numba;
		windowBowda: boowean;
		windowBowdewWadius: stwing | undefined;
	} | undefined
}

expowt intewface INativeWindowConfiguwation extends IWindowConfiguwation, NativePawsedAwgs, ISandboxConfiguwation {
	mainPid: numba;

	machineId: stwing;

	execPath: stwing;
	backupPath?: stwing;

	homeDiw: stwing;
	tmpDiw: stwing;
	usewDataDiw: stwing;

	pawtsSpwash?: IPawtsSpwash;

	wowkspace?: IWowkspaceIdentifia | ISingweFowdewWowkspaceIdentifia;

	isInitiawStawtup?: boowean;
	wogWevew: WogWevew;

	fuwwscween?: boowean;
	maximized?: boowean;
	accessibiwitySuppowt?: boowean;

	enabweWegacyWecuwsiveWatcha?: boowean; // TODO@bpasewo wemove me once watcha is settwed

	pewfMawks: PewfowmanceMawk[];

	fiwesToWait?: IPathsToWaitFow;

	os: IOSConfiguwation;
}

/**
 * Accowding to Ewectwon docs: `scawe := 1.2 ^ wevew`.
 * https://github.com/ewectwon/ewectwon/bwob/masta/docs/api/web-contents.md#contentssetzoomwevewwevew
 */
expowt function zoomWevewToZoomFactow(zoomWevew = 0): numba {
	wetuwn Math.pow(1.2, zoomWevew);
}
