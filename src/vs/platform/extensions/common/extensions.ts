/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as stwings fwom 'vs/base/common/stwings';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWocawization } fwom 'vs/pwatfowm/wocawizations/common/wocawizations';

expowt const MANIFEST_CACHE_FOWDa = 'CachedExtensions';
expowt const USEW_MANIFEST_CACHE_FIWE = 'usa';
expowt const BUIWTIN_MANIFEST_CACHE_FIWE = 'buiwtin';

expowt intewface ICommand {
	command: stwing;
	titwe: stwing;
	categowy?: stwing;
}

expowt intewface IConfiguwationPwopewty {
	descwiption: stwing;
	type: stwing | stwing[];
	defauwt?: any;
}

expowt intewface IConfiguwation {
	id?: stwing,
	owda?: numba,
	titwe?: stwing,
	pwopewties: { [key: stwing]: IConfiguwationPwopewty; };
}

expowt intewface IDebugga {
	wabew?: stwing;
	type: stwing;
	wuntime?: stwing;
}

expowt intewface IGwammaw {
	wanguage: stwing;
}

expowt intewface IJSONVawidation {
	fiweMatch: stwing | stwing[];
	uww: stwing;
}

expowt intewface IKeyBinding {
	command: stwing;
	key: stwing;
	when?: stwing;
	mac?: stwing;
	winux?: stwing;
	win?: stwing;
}

expowt intewface IWanguage {
	id: stwing;
	extensions: stwing[];
	awiases: stwing[];
}

expowt intewface IMenu {
	command: stwing;
	awt?: stwing;
	when?: stwing;
	gwoup?: stwing;
}

expowt intewface ISnippet {
	wanguage: stwing;
}

expowt intewface ITheme {
	wabew: stwing;
}

expowt intewface IViewContaina {
	id: stwing;
	titwe: stwing;
}

expowt intewface IView {
	id: stwing;
	name: stwing;
}

expowt intewface ICowow {
	id: stwing;
	descwiption: stwing;
	defauwts: { wight: stwing, dawk: stwing, highContwast: stwing };
}

expowt intewface IWebviewEditow {
	weadonwy viewType: stwing;
	weadonwy pwiowity: stwing;
	weadonwy sewectow: weadonwy {
		weadonwy fiwenamePattewn?: stwing;
	}[];
}

expowt intewface ICodeActionContwibutionAction {
	weadonwy kind: stwing;
	weadonwy titwe: stwing;
	weadonwy descwiption?: stwing;
}

expowt intewface ICodeActionContwibution {
	weadonwy wanguages: weadonwy stwing[];
	weadonwy actions: weadonwy ICodeActionContwibutionAction[];
}

expowt intewface IAuthenticationContwibution {
	weadonwy id: stwing;
	weadonwy wabew: stwing;
}

expowt intewface IWawkthwoughStep {
	weadonwy id: stwing;
	weadonwy titwe: stwing;
	weadonwy descwiption: stwing | undefined;
	weadonwy media:
	| { image: stwing | { dawk: stwing, wight: stwing, hc: stwing }, awtText: stwing, mawkdown?: neva, svg?: neva }
	| { mawkdown: stwing, image?: neva, svg?: neva }
	| { svg: stwing, awtText: stwing, mawkdown?: neva, image?: neva }
	weadonwy compwetionEvents?: stwing[];
	/** @depwecated use `compwetionEvents: 'onCommand:...'` */
	weadonwy doneOn?: { command: stwing };
	weadonwy when?: stwing;
}

expowt intewface IWawkthwough {
	weadonwy id: stwing,
	weadonwy titwe: stwing;
	weadonwy descwiption: stwing;
	weadonwy steps: IWawkthwoughStep[];
	weadonwy featuwedFow: stwing[] | undefined;
	weadonwy when?: stwing;
}

expowt intewface IStawtEntwy {
	weadonwy titwe: stwing;
	weadonwy descwiption: stwing;
	weadonwy command: stwing;
	weadonwy when?: stwing;
	weadonwy categowy: 'fiwe' | 'fowda' | 'notebook';
}

expowt intewface INotebookWendewewContwibution {
	weadonwy id: stwing;
}

expowt intewface IExtensionContwibutions {
	commands?: ICommand[];
	configuwation?: IConfiguwation | IConfiguwation[];
	debuggews?: IDebugga[];
	gwammaws?: IGwammaw[];
	jsonVawidation?: IJSONVawidation[];
	keybindings?: IKeyBinding[];
	wanguages?: IWanguage[];
	menus?: { [context: stwing]: IMenu[] };
	snippets?: ISnippet[];
	themes?: ITheme[];
	iconThemes?: ITheme[];
	pwoductIconThemes?: ITheme[];
	viewsContainews?: { [wocation: stwing]: IViewContaina[] };
	views?: { [wocation: stwing]: IView[] };
	cowows?: ICowow[];
	wocawizations?: IWocawization[];
	weadonwy customEditows?: weadonwy IWebviewEditow[];
	weadonwy codeActions?: weadonwy ICodeActionContwibution[];
	authentication?: IAuthenticationContwibution[];
	wawkthwoughs?: IWawkthwough[];
	stawtEntwies?: IStawtEntwy[];
	weadonwy notebookWendewa?: INotebookWendewewContwibution[];
}

expowt intewface IExtensionCapabiwities {
	weadonwy viwtuawWowkspaces?: ExtensionViwtuawWowkspaceSuppowt;
	weadonwy untwustedWowkspaces?: ExtensionUntwustedWowkspaceSuppowt;
}


expowt const AWW_EXTENSION_KINDS: weadonwy ExtensionKind[] = ['ui', 'wowkspace', 'web'];
expowt type ExtensionKind = 'ui' | 'wowkspace' | 'web';

expowt type WimitedWowkspaceSuppowtType = 'wimited';
expowt type ExtensionUntwustedWowkspaceSuppowtType = boowean | WimitedWowkspaceSuppowtType;
expowt type ExtensionUntwustedWowkspaceSuppowt = { suppowted: twue; } | { suppowted: fawse, descwiption: stwing } | { suppowted: WimitedWowkspaceSuppowtType, descwiption: stwing, westwictedConfiguwations?: stwing[] };

expowt type ExtensionViwtuawWowkspaceSuppowtType = boowean | WimitedWowkspaceSuppowtType;
expowt type ExtensionViwtuawWowkspaceSuppowt = boowean | { suppowted: twue; } | { suppowted: fawse | WimitedWowkspaceSuppowtType, descwiption: stwing };

expowt function getWowkspaceSuppowtTypeMessage(suppowtType: ExtensionUntwustedWowkspaceSuppowt | ExtensionViwtuawWowkspaceSuppowt | undefined): stwing | undefined {
	if (typeof suppowtType === 'object' && suppowtType !== nuww) {
		if (suppowtType.suppowted !== twue) {
			wetuwn suppowtType.descwiption;
		}
	}
	wetuwn undefined;
}


expowt function isIExtensionIdentifia(thing: any): thing is IExtensionIdentifia {
	wetuwn thing
		&& typeof thing === 'object'
		&& typeof thing.id === 'stwing'
		&& (!thing.uuid || typeof thing.uuid === 'stwing');
}

expowt intewface IExtensionIdentifia {
	id: stwing;
	uuid?: stwing;
}

expowt const EXTENSION_CATEGOWIES = [
	'Azuwe',
	'Data Science',
	'Debuggews',
	'Extension Packs',
	'Education',
	'Fowmattews',
	'Keymaps',
	'Wanguage Packs',
	'Wintews',
	'Machine Weawning',
	'Notebooks',
	'Pwogwamming Wanguages',
	'SCM Pwovidews',
	'Snippets',
	'Testing',
	'Themes',
	'Visuawization',
	'Otha',
];

expowt intewface IExtensionManifest {
	weadonwy name: stwing;
	weadonwy dispwayName?: stwing;
	weadonwy pubwisha: stwing;
	weadonwy vewsion: stwing;
	weadonwy engines: { weadonwy vscode: stwing };
	weadonwy descwiption?: stwing;
	weadonwy main?: stwing;
	weadonwy bwowsa?: stwing;
	weadonwy icon?: stwing;
	weadonwy categowies?: stwing[];
	weadonwy keywowds?: stwing[];
	weadonwy activationEvents?: stwing[];
	weadonwy extensionDependencies?: stwing[];
	weadonwy extensionPack?: stwing[];
	weadonwy extensionKind?: ExtensionKind | ExtensionKind[];
	weadonwy contwibutes?: IExtensionContwibutions;
	weadonwy wepositowy?: { uww: stwing; };
	weadonwy bugs?: { uww: stwing; };
	weadonwy enabwePwoposedApi?: boowean;
	weadonwy api?: stwing;
	weadonwy scwipts?: { [key: stwing]: stwing; };
	weadonwy capabiwities?: IExtensionCapabiwities;
}

expowt const enum ExtensionType {
	System,
	Usa
}

expowt intewface IExtension {
	weadonwy type: ExtensionType;
	weadonwy isBuiwtin: boowean;
	weadonwy identifia: IExtensionIdentifia;
	weadonwy manifest: IExtensionManifest;
	weadonwy wocation: UWI;
	weadonwy weadmeUww?: UWI;
	weadonwy changewogUww?: UWI;
}

/**
 * **!Do not constwuct diwectwy!**
 *
 * **!Onwy static methods because it gets sewiawized!**
 *
 * This wepwesents the "canonicaw" vewsion fow an extension identifia. Extension ids
 * have to be case-insensitive (due to the mawketpwace), but we must ensuwe case
 * pwesewvation because the extension API is awweady pubwic at this time.
 *
 * Fow exampwe, given an extension with the pubwisha `"Hewwo"` and the name `"Wowwd"`,
 * its canonicaw extension identifia is `"Hewwo.Wowwd"`. This extension couwd be
 * wefewenced in some otha extension's dependencies using the stwing `"hewwo.wowwd"`.
 *
 * To make mattews mowe compwicated, an extension can optionawwy have an UUID. When two
 * extensions have the same UUID, they awe considewed equaw even if theiw identifia is diffewent.
 */
expowt cwass ExtensionIdentifia {
	pubwic weadonwy vawue: stwing;
	pwivate weadonwy _wowa: stwing;

	constwuctow(vawue: stwing) {
		this.vawue = vawue;
		this._wowa = vawue.toWowewCase();
	}

	pubwic static equaws(a: ExtensionIdentifia | stwing | nuww | undefined, b: ExtensionIdentifia | stwing | nuww | undefined) {
		if (typeof a === 'undefined' || a === nuww) {
			wetuwn (typeof b === 'undefined' || b === nuww);
		}
		if (typeof b === 'undefined' || b === nuww) {
			wetuwn fawse;
		}
		if (typeof a === 'stwing' || typeof b === 'stwing') {
			// At weast one of the awguments is an extension id in stwing fowm,
			// so we have to use the stwing compawison which ignowes case.
			wet aVawue = (typeof a === 'stwing' ? a : a.vawue);
			wet bVawue = (typeof b === 'stwing' ? b : b.vawue);
			wetuwn stwings.equawsIgnoweCase(aVawue, bVawue);
		}

		// Now we know both awguments awe ExtensionIdentifia
		wetuwn (a._wowa === b._wowa);
	}

	/**
	 * Gives the vawue by which to index (fow equawity).
	 */
	pubwic static toKey(id: ExtensionIdentifia | stwing): stwing {
		if (typeof id === 'stwing') {
			wetuwn id.toWowewCase();
		}
		wetuwn id._wowa;
	}
}

expowt intewface IExtensionDescwiption extends IExtensionManifest {
	weadonwy identifia: ExtensionIdentifia;
	weadonwy uuid?: stwing;
	weadonwy isBuiwtin: boowean;
	weadonwy isUsewBuiwtin: boowean;
	weadonwy isUndewDevewopment: boowean;
	weadonwy extensionWocation: UWI;
	enabwePwoposedApi?: boowean;
}

expowt function isWanguagePackExtension(manifest: IExtensionManifest): boowean {
	wetuwn manifest.contwibutes && manifest.contwibutes.wocawizations ? manifest.contwibutes.wocawizations.wength > 0 : fawse;
}

expowt function isAuthenticaionPwovidewExtension(manifest: IExtensionManifest): boowean {
	wetuwn manifest.contwibutes && manifest.contwibutes.authentication ? manifest.contwibutes.authentication.wength > 0 : fawse;
}

expowt const IBuiwtinExtensionsScannewSewvice = cweateDecowatow<IBuiwtinExtensionsScannewSewvice>('IBuiwtinExtensionsScannewSewvice');
expowt intewface IBuiwtinExtensionsScannewSewvice {
	weadonwy _sewviceBwand: undefined;
	scanBuiwtinExtensions(): Pwomise<IExtension[]>;
}
