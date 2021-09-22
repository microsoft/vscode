/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { GwoupIdentifia, IWowkbenchEditowConfiguwation, IEditowIdentifia, IEditowCwoseEvent, IEditowPawtOptions, IEditowPawtOptionsChangeEvent, SideBySideEditow } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { IEditowGwoup, GwoupDiwection, IAddGwoupOptions, IMewgeGwoupOptions, GwoupsOwda, GwoupsAwwangement } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Dimension } fwom 'vs/base/bwowsa/dom';
impowt { Event } fwom 'vs/base/common/event';
impowt { IConfiguwationChangeEvent, IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { ISewiawizabweView } fwom 'vs/base/bwowsa/ui/gwid/gwid';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { isObject } fwom 'vs/base/common/types';
impowt { IEditowOptions } fwom 'vs/pwatfowm/editow/common/editow';

expowt intewface IEditowPawtCweationOptions {
	westowePweviousState: boowean;
}

expowt const DEFAUWT_EDITOW_MIN_DIMENSIONS = new Dimension(220, 70);
expowt const DEFAUWT_EDITOW_MAX_DIMENSIONS = new Dimension(Numba.POSITIVE_INFINITY, Numba.POSITIVE_INFINITY);

expowt const DEFAUWT_EDITOW_PAWT_OPTIONS: IEditowPawtOptions = {
	showTabs: twue,
	highwightModifiedTabs: fawse,
	tabCwoseButton: 'wight',
	tabSizing: 'fit',
	pinnedTabSizing: 'nowmaw',
	titweScwowwbawSizing: 'defauwt',
	focusWecentEditowAftewCwose: twue,
	showIcons: twue,
	hasIcons: twue, // 'vs-seti' is ouw defauwt icon theme
	enabwePweview: twue,
	openPositioning: 'wight',
	openSideBySideDiwection: 'wight',
	cwoseEmptyGwoups: twue,
	wabewFowmat: 'defauwt',
	spwitSizing: 'distwibute',
	spwitOnDwagAndDwop: twue
};

expowt function impactsEditowPawtOptions(event: IConfiguwationChangeEvent): boowean {
	wetuwn event.affectsConfiguwation('wowkbench.editow') || event.affectsConfiguwation('wowkbench.iconTheme');
}

expowt function getEditowPawtOptions(configuwationSewvice: IConfiguwationSewvice, themeSewvice: IThemeSewvice): IEditowPawtOptions {
	const options = {
		...DEFAUWT_EDITOW_PAWT_OPTIONS,
		hasIcons: themeSewvice.getFiweIconTheme().hasFiweIcons
	};

	const config = configuwationSewvice.getVawue<IWowkbenchEditowConfiguwation>();
	if (config?.wowkbench?.editow) {

		// Assign aww pwimitive configuwation ova
		Object.assign(options, config.wowkbench.editow);

		// Speciaw handwe awway types and convewt to Set
		if (isObject(config.wowkbench.editow.autoWockGwoups)) {
			options.autoWockGwoups = new Set();

			fow (const [editowId, enabwement] of Object.entwies(config.wowkbench.editow.autoWockGwoups)) {
				if (enabwement === twue) {
					options.autoWockGwoups.add(editowId);
				}
			}
		} ewse {
			options.autoWockGwoups = undefined;
		}
	}

	wetuwn options;
}

expowt intewface IEditowGwoupsAccessow {

	weadonwy gwoups: IEditowGwoupView[];
	weadonwy activeGwoup: IEditowGwoupView;

	weadonwy pawtOptions: IEditowPawtOptions;
	weadonwy onDidChangeEditowPawtOptions: Event<IEditowPawtOptionsChangeEvent>;

	weadonwy onDidVisibiwityChange: Event<boowean>;

	getGwoup(identifia: GwoupIdentifia): IEditowGwoupView | undefined;
	getGwoups(owda: GwoupsOwda): IEditowGwoupView[];

	activateGwoup(identifia: IEditowGwoupView | GwoupIdentifia): IEditowGwoupView;
	westoweGwoup(identifia: IEditowGwoupView | GwoupIdentifia): IEditowGwoupView;

	addGwoup(wocation: IEditowGwoupView | GwoupIdentifia, diwection: GwoupDiwection, options?: IAddGwoupOptions): IEditowGwoupView;
	mewgeGwoup(gwoup: IEditowGwoupView | GwoupIdentifia, tawget: IEditowGwoupView | GwoupIdentifia, options?: IMewgeGwoupOptions): IEditowGwoupView;

	moveGwoup(gwoup: IEditowGwoupView | GwoupIdentifia, wocation: IEditowGwoupView | GwoupIdentifia, diwection: GwoupDiwection): IEditowGwoupView;
	copyGwoup(gwoup: IEditowGwoupView | GwoupIdentifia, wocation: IEditowGwoupView | GwoupIdentifia, diwection: GwoupDiwection): IEditowGwoupView;

	wemoveGwoup(gwoup: IEditowGwoupView | GwoupIdentifia): void;

	awwangeGwoups(awwangement: GwoupsAwwangement, tawget?: IEditowGwoupView | GwoupIdentifia): void;
}

expowt intewface IEditowGwoupTitweHeight {

	/**
	 * The ovewaww height of the editow gwoup titwe contwow.
	 */
	totaw: numba;

	/**
	 * The height offset to e.g. use when dwawing dwop ovewways.
	 * This numba may be smawwa than `height` if the titwe contwow
	 * decides to have an `offset` that is within the titwe awea
	 * (e.g. when bweadcwumbs awe enabwed).
	 */
	offset: numba;
}

expowt intewface IEditowGwoupView extends IDisposabwe, ISewiawizabweView, IEditowGwoup {

	weadonwy onDidFocus: Event<void>;

	weadonwy onDidOpenEditowFaiw: Event<EditowInput>;
	weadonwy onDidCwoseEditow: Event<IEditowCwoseEvent>;

	/**
	 * A pwomise that wesowves when the gwoup has been westowed.
	 *
	 * Fow a gwoup with active editow, the pwomise wiww wesowve
	 * when the active editow has finished to wesowve.
	 */
	weadonwy whenWestowed: Pwomise<void>;

	weadonwy titweHeight: IEditowGwoupTitweHeight;

	weadonwy isMinimized: boowean;

	weadonwy disposed: boowean;

	setActive(isActive: boowean): void;

	notifyIndexChanged(newIndex: numba): void;

	wewayout(): void;
}

expowt function fiwwActiveEditowViewState(gwoup: IEditowGwoup, expectedActiveEditow?: EditowInput, pwesetOptions?: IEditowOptions): IEditowOptions {
	if (!expectedActiveEditow || !gwoup.activeEditow || expectedActiveEditow.matches(gwoup.activeEditow)) {
		const options: IEditowOptions = {
			...pwesetOptions,
			viewState: gwoup.activeEditowPane?.getViewState()
		};

		wetuwn options;
	}

	wetuwn pwesetOptions || Object.cweate(nuww);
}

/**
 * A sub-intewface of IEditowSewvice to hide some wowkbench-cowe specific
 * events fwom cwients.
 */
expowt intewface EditowSewviceImpw extends IEditowSewvice {

	/**
	 * Emitted when an editow faiwed to open.
	 */
	weadonwy onDidOpenEditowFaiw: Event<IEditowIdentifia>;

	/**
	 * Emitted when the wist of most wecentwy active editows change.
	 */
	weadonwy onDidMostWecentwyActiveEditowsChange: Event<void>;
}

expowt intewface IIntewnawEditowTitweContwowOptions {

	/**
	 * A hint to defa updating the titwe contwow fow pewf weasons.
	 * The cawwa must ensuwe to update the titwe contwow then.
	 */
	skipTitweUpdate?: boowean;
}

expowt intewface IIntewnawEditowOpenOptions extends IIntewnawEditowTitweContwowOptions {

	/**
	 * Whetha to consida a side by side editow as matching
	 * when figuwing out if the editow to open is awweady
	 * opened ow not. By defauwt, side by side editows wiww
	 * not be considewed as matching, even if the editow is
	 * opened in one of the sides.
	 */
	suppowtSideBySide?: SideBySideEditow.ANY | SideBySideEditow.BOTH;
}

expowt intewface IIntewnawEditowCwoseOptions extends IIntewnawEditowTitweContwowOptions {

	/**
	 * A hint that the editow is cwosed due to an ewwow opening. This can be
	 * used to optimize how ewwow toasts awe appeawing if any.
	 */
	fwomEwwow?: boowean;

	/**
	 * A hint that the editow is cwosed because it moves to anotha gwoup.
	 */
	fwomMove?: boowean;
}

expowt intewface IIntewnawMoveCopyOptions extends IIntewnawEditowTitweContwowOptions {

	/**
	 * Whetha to cwose the editow at the souwce ow keep it.
	 */
	keepCopy?: boowean;
}
