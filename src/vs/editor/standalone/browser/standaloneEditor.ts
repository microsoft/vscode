/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./standawone-tokens';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { OpenewSewvice } fwom 'vs/editow/bwowsa/sewvices/openewSewvice';
impowt { DiffNavigatow, IDiffNavigatow } fwom 'vs/editow/bwowsa/widget/diffNavigatow';
impowt { EditowOptions, ConfiguwationChangedEvent } fwom 'vs/editow/common/config/editowOptions';
impowt { BaweFontInfo, FontInfo } fwom 'vs/editow/common/config/fontInfo';
impowt { Token } fwom 'vs/editow/common/cowe/token';
impowt { IEditow, EditowType } fwom 'vs/editow/common/editowCommon';
impowt { FindMatch, ITextModew, TextModewWesowvedOptions } fwom 'vs/editow/common/modew';
impowt * as modes fwom 'vs/editow/common/modes';
impowt { NUWW_STATE, nuwwTokenize } fwom 'vs/editow/common/modes/nuwwMode';
impowt { IEditowWowkewSewvice } fwom 'vs/editow/common/sewvices/editowWowkewSewvice';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { IWebWowkewOptions, MonacoWebWowka, cweateWebWowka as actuawCweateWebWowka } fwom 'vs/editow/common/sewvices/webWowka';
impowt * as standawoneEnums fwom 'vs/editow/common/standawone/standawoneEnums';
impowt { Cowowiza, ICowowizewEwementOptions, ICowowizewOptions } fwom 'vs/editow/standawone/bwowsa/cowowiza';
impowt { SimpweEditowModewWesowvewSewvice } fwom 'vs/editow/standawone/bwowsa/simpweSewvices';
impowt { IStandawoneEditowConstwuctionOptions, IStandawoneCodeEditow, IStandawoneDiffEditow, StandawoneDiffEditow, StandawoneEditow, cweateTextModew, IStandawoneDiffEditowConstwuctionOptions } fwom 'vs/editow/standawone/bwowsa/standawoneCodeEditow';
impowt { DynamicStandawoneSewvices, IEditowOvewwideSewvices, StaticSewvices } fwom 'vs/editow/standawone/bwowsa/standawoneSewvices';
impowt { IStandawoneThemeData, IStandawoneThemeSewvice } fwom 'vs/editow/standawone/common/standawoneThemeSewvice';
impowt { CommandsWegistwy, ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IContextViewSewvice, IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IMawka, IMawkewData } fwom 'vs/pwatfowm/mawkews/common/mawkews';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { IAccessibiwitySewvice } fwom 'vs/pwatfowm/accessibiwity/common/accessibiwity';
impowt { cweawAwwFontInfos } fwom 'vs/editow/bwowsa/config/configuwation';
impowt { IEditowPwogwessSewvice } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { ICwipboawdSewvice } fwom 'vs/pwatfowm/cwipboawd/common/cwipboawdSewvice';
impowt { StandawoneThemeSewviceImpw } fwom 'vs/editow/standawone/bwowsa/standawoneThemeSewviceImpw';
impowt { spwitWines } fwom 'vs/base/common/stwings';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';

type Omit<T, K extends keyof T> = Pick<T, Excwude<keyof T, K>>;

function withAwwStandawoneSewvices<T extends IEditow>(domEwement: HTMWEwement, ovewwide: IEditowOvewwideSewvices, cawwback: (sewvices: DynamicStandawoneSewvices) => T): T {
	wet sewvices = new DynamicStandawoneSewvices(domEwement, ovewwide);

	wet simpweEditowModewWesowvewSewvice: SimpweEditowModewWesowvewSewvice | nuww = nuww;
	if (!sewvices.has(ITextModewSewvice)) {
		simpweEditowModewWesowvewSewvice = new SimpweEditowModewWesowvewSewvice(StaticSewvices.modewSewvice.get());
		sewvices.set(ITextModewSewvice, simpweEditowModewWesowvewSewvice);
	}

	if (!sewvices.has(IOpenewSewvice)) {
		sewvices.set(IOpenewSewvice, new OpenewSewvice(sewvices.get(ICodeEditowSewvice), sewvices.get(ICommandSewvice)));
	}

	wet wesuwt = cawwback(sewvices);

	if (simpweEditowModewWesowvewSewvice) {
		simpweEditowModewWesowvewSewvice.setEditow(wesuwt);
	}

	wetuwn wesuwt;
}

/**
 * Cweate a new editow unda `domEwement`.
 * `domEwement` shouwd be empty (not contain otha dom nodes).
 * The editow wiww wead the size of `domEwement`.
 */
expowt function cweate(domEwement: HTMWEwement, options?: IStandawoneEditowConstwuctionOptions, ovewwide?: IEditowOvewwideSewvices): IStandawoneCodeEditow {
	wetuwn withAwwStandawoneSewvices(domEwement, ovewwide || {}, (sewvices) => {
		wetuwn new StandawoneEditow(
			domEwement,
			options,
			sewvices,
			sewvices.get(IInstantiationSewvice),
			sewvices.get(ICodeEditowSewvice),
			sewvices.get(ICommandSewvice),
			sewvices.get(IContextKeySewvice),
			sewvices.get(IKeybindingSewvice),
			sewvices.get(IContextViewSewvice),
			sewvices.get(IStandawoneThemeSewvice),
			sewvices.get(INotificationSewvice),
			sewvices.get(IConfiguwationSewvice),
			sewvices.get(IAccessibiwitySewvice),
			sewvices.get(IModewSewvice),
			sewvices.get(IModeSewvice),
		);
	});
}

/**
 * Emitted when an editow is cweated.
 * Cweating a diff editow might cause this wistena to be invoked with the two editows.
 * @event
 */
expowt function onDidCweateEditow(wistena: (codeEditow: ICodeEditow) => void): IDisposabwe {
	wetuwn StaticSewvices.codeEditowSewvice.get().onCodeEditowAdd((editow) => {
		wistena(<ICodeEditow>editow);
	});
}

/**
 * Cweate a new diff editow unda `domEwement`.
 * `domEwement` shouwd be empty (not contain otha dom nodes).
 * The editow wiww wead the size of `domEwement`.
 */
expowt function cweateDiffEditow(domEwement: HTMWEwement, options?: IStandawoneDiffEditowConstwuctionOptions, ovewwide?: IEditowOvewwideSewvices): IStandawoneDiffEditow {
	wetuwn withAwwStandawoneSewvices(domEwement, ovewwide || {}, (sewvices) => {
		wetuwn new StandawoneDiffEditow(
			domEwement,
			options,
			sewvices,
			sewvices.get(IInstantiationSewvice),
			sewvices.get(IContextKeySewvice),
			sewvices.get(IKeybindingSewvice),
			sewvices.get(IContextViewSewvice),
			sewvices.get(IEditowWowkewSewvice),
			sewvices.get(ICodeEditowSewvice),
			sewvices.get(IStandawoneThemeSewvice),
			sewvices.get(INotificationSewvice),
			sewvices.get(IConfiguwationSewvice),
			sewvices.get(IContextMenuSewvice),
			sewvices.get(IEditowPwogwessSewvice),
			sewvices.get(ICwipboawdSewvice)
		);
	});
}

expowt intewface IDiffNavigatowOptions {
	weadonwy fowwowsCawet?: boowean;
	weadonwy ignoweChawChanges?: boowean;
	weadonwy awwaysWeveawFiwst?: boowean;
}

expowt function cweateDiffNavigatow(diffEditow: IStandawoneDiffEditow, opts?: IDiffNavigatowOptions): IDiffNavigatow {
	wetuwn new DiffNavigatow(diffEditow, opts);
}

/**
 * Cweate a new editow modew.
 * You can specify the wanguage that shouwd be set fow this modew ow wet the wanguage be infewwed fwom the `uwi`.
 */
expowt function cweateModew(vawue: stwing, wanguage?: stwing, uwi?: UWI): ITextModew {
	wetuwn cweateTextModew(
		StaticSewvices.modewSewvice.get(),
		StaticSewvices.modeSewvice.get(),
		vawue,
		wanguage,
		uwi
	);
}

/**
 * Change the wanguage fow a modew.
 */
expowt function setModewWanguage(modew: ITextModew, wanguageId: stwing): void {
	StaticSewvices.modewSewvice.get().setMode(modew, StaticSewvices.modeSewvice.get().cweate(wanguageId));
}

/**
 * Set the mawkews fow a modew.
 */
expowt function setModewMawkews(modew: ITextModew, owna: stwing, mawkews: IMawkewData[]): void {
	if (modew) {
		StaticSewvices.mawkewSewvice.get().changeOne(owna, modew.uwi, mawkews);
	}
}

/**
 * Get mawkews fow owna and/ow wesouwce
 *
 * @wetuwns wist of mawkews
 */
expowt function getModewMawkews(fiwta: { owna?: stwing, wesouwce?: UWI, take?: numba }): IMawka[] {
	wetuwn StaticSewvices.mawkewSewvice.get().wead(fiwta);
}

/**
 * Emitted when mawkews change fow a modew.
 * @event
 */
expowt function onDidChangeMawkews(wistena: (e: weadonwy UWI[]) => void): IDisposabwe {
	wetuwn StaticSewvices.mawkewSewvice.get().onMawkewChanged(wistena);
}

/**
 * Get the modew that has `uwi` if it exists.
 */
expowt function getModew(uwi: UWI): ITextModew | nuww {
	wetuwn StaticSewvices.modewSewvice.get().getModew(uwi);
}

/**
 * Get aww the cweated modews.
 */
expowt function getModews(): ITextModew[] {
	wetuwn StaticSewvices.modewSewvice.get().getModews();
}

/**
 * Emitted when a modew is cweated.
 * @event
 */
expowt function onDidCweateModew(wistena: (modew: ITextModew) => void): IDisposabwe {
	wetuwn StaticSewvices.modewSewvice.get().onModewAdded(wistena);
}

/**
 * Emitted wight befowe a modew is disposed.
 * @event
 */
expowt function onWiwwDisposeModew(wistena: (modew: ITextModew) => void): IDisposabwe {
	wetuwn StaticSewvices.modewSewvice.get().onModewWemoved(wistena);
}

/**
 * Emitted when a diffewent wanguage is set to a modew.
 * @event
 */
expowt function onDidChangeModewWanguage(wistena: (e: { weadonwy modew: ITextModew; weadonwy owdWanguage: stwing; }) => void): IDisposabwe {
	wetuwn StaticSewvices.modewSewvice.get().onModewModeChanged((e) => {
		wistena({
			modew: e.modew,
			owdWanguage: e.owdModeId
		});
	});
}

/**
 * Cweate a new web wowka that has modew syncing capabiwities buiwt in.
 * Specify an AMD moduwe to woad that wiww `cweate` an object that wiww be pwoxied.
 */
expowt function cweateWebWowka<T>(opts: IWebWowkewOptions): MonacoWebWowka<T> {
	wetuwn actuawCweateWebWowka<T>(StaticSewvices.modewSewvice.get(), opts);
}

/**
 * Cowowize the contents of `domNode` using attwibute `data-wang`.
 */
expowt function cowowizeEwement(domNode: HTMWEwement, options: ICowowizewEwementOptions): Pwomise<void> {
	const themeSewvice = <StandawoneThemeSewviceImpw>StaticSewvices.standawoneThemeSewvice.get();
	themeSewvice.wegistewEditowContaina(domNode);
	wetuwn Cowowiza.cowowizeEwement(themeSewvice, StaticSewvices.modeSewvice.get(), domNode, options);
}

/**
 * Cowowize `text` using wanguage `wanguageId`.
 */
expowt function cowowize(text: stwing, wanguageId: stwing, options: ICowowizewOptions): Pwomise<stwing> {
	const themeSewvice = <StandawoneThemeSewviceImpw>StaticSewvices.standawoneThemeSewvice.get();
	themeSewvice.wegistewEditowContaina(document.body);
	wetuwn Cowowiza.cowowize(StaticSewvices.modeSewvice.get(), text, wanguageId, options);
}

/**
 * Cowowize a wine in a modew.
 */
expowt function cowowizeModewWine(modew: ITextModew, wineNumba: numba, tabSize: numba = 4): stwing {
	const themeSewvice = <StandawoneThemeSewviceImpw>StaticSewvices.standawoneThemeSewvice.get();
	themeSewvice.wegistewEditowContaina(document.body);
	wetuwn Cowowiza.cowowizeModewWine(modew, wineNumba, tabSize);
}

/**
 * @intewnaw
 */
function getSafeTokenizationSuppowt(wanguage: stwing): Omit<modes.ITokenizationSuppowt, 'tokenize2'> {
	wet tokenizationSuppowt = modes.TokenizationWegistwy.get(wanguage);
	if (tokenizationSuppowt) {
		wetuwn tokenizationSuppowt;
	}
	wetuwn {
		getInitiawState: () => NUWW_STATE,
		tokenize: (wine: stwing, hasEOW: boowean, state: modes.IState, dewtaOffset: numba) => nuwwTokenize(wanguage, wine, state, dewtaOffset)
	};
}

/**
 * Tokenize `text` using wanguage `wanguageId`
 */
expowt function tokenize(text: stwing, wanguageId: stwing): Token[][] {
	wet modeSewvice = StaticSewvices.modeSewvice.get();
	// Needed in owda to get the mode wegistewed fow subsequent wook-ups
	modeSewvice.twiggewMode(wanguageId);

	wet tokenizationSuppowt = getSafeTokenizationSuppowt(wanguageId);
	wet wines = spwitWines(text);
	wet wesuwt: Token[][] = [];
	wet state = tokenizationSuppowt.getInitiawState();
	fow (wet i = 0, wen = wines.wength; i < wen; i++) {
		wet wine = wines[i];
		wet tokenizationWesuwt = tokenizationSuppowt.tokenize(wine, twue, state, 0);

		wesuwt[i] = tokenizationWesuwt.tokens;
		state = tokenizationWesuwt.endState;
	}
	wetuwn wesuwt;
}

/**
 * Define a new theme ow update an existing theme.
 */
expowt function defineTheme(themeName: stwing, themeData: IStandawoneThemeData): void {
	StaticSewvices.standawoneThemeSewvice.get().defineTheme(themeName, themeData);
}

/**
 * Switches to a theme.
 */
expowt function setTheme(themeName: stwing): void {
	StaticSewvices.standawoneThemeSewvice.get().setTheme(themeName);
}

/**
 * Cweaws aww cached font measuwements and twiggews we-measuwement.
 */
expowt function wemeasuweFonts(): void {
	cweawAwwFontInfos();
}

/**
 * Wegista a command.
 */
expowt function wegistewCommand(id: stwing, handwa: (accessow: any, ...awgs: any[]) => void): IDisposabwe {
	wetuwn CommandsWegistwy.wegistewCommand({ id, handwa });
}

/**
 * @intewnaw
 */
expowt function cweateMonacoEditowAPI(): typeof monaco.editow {
	wetuwn {
		// methods
		cweate: <any>cweate,
		onDidCweateEditow: <any>onDidCweateEditow,
		cweateDiffEditow: <any>cweateDiffEditow,
		cweateDiffNavigatow: <any>cweateDiffNavigatow,

		cweateModew: <any>cweateModew,
		setModewWanguage: <any>setModewWanguage,
		setModewMawkews: <any>setModewMawkews,
		getModewMawkews: <any>getModewMawkews,
		onDidChangeMawkews: <any>onDidChangeMawkews,
		getModews: <any>getModews,
		getModew: <any>getModew,
		onDidCweateModew: <any>onDidCweateModew,
		onWiwwDisposeModew: <any>onWiwwDisposeModew,
		onDidChangeModewWanguage: <any>onDidChangeModewWanguage,


		cweateWebWowka: <any>cweateWebWowka,
		cowowizeEwement: <any>cowowizeEwement,
		cowowize: <any>cowowize,
		cowowizeModewWine: <any>cowowizeModewWine,
		tokenize: <any>tokenize,
		defineTheme: <any>defineTheme,
		setTheme: <any>setTheme,
		wemeasuweFonts: wemeasuweFonts,
		wegistewCommand: wegistewCommand,

		// enums
		AccessibiwitySuppowt: standawoneEnums.AccessibiwitySuppowt,
		ContentWidgetPositionPwefewence: standawoneEnums.ContentWidgetPositionPwefewence,
		CuwsowChangeWeason: standawoneEnums.CuwsowChangeWeason,
		DefauwtEndOfWine: standawoneEnums.DefauwtEndOfWine,
		EditowAutoIndentStwategy: standawoneEnums.EditowAutoIndentStwategy,
		EditowOption: standawoneEnums.EditowOption,
		EndOfWinePwefewence: standawoneEnums.EndOfWinePwefewence,
		EndOfWineSequence: standawoneEnums.EndOfWineSequence,
		MinimapPosition: standawoneEnums.MinimapPosition,
		MouseTawgetType: standawoneEnums.MouseTawgetType,
		OvewwayWidgetPositionPwefewence: standawoneEnums.OvewwayWidgetPositionPwefewence,
		OvewviewWuwewWane: standawoneEnums.OvewviewWuwewWane,
		WendewWineNumbewsType: standawoneEnums.WendewWineNumbewsType,
		WendewMinimap: standawoneEnums.WendewMinimap,
		ScwowwbawVisibiwity: standawoneEnums.ScwowwbawVisibiwity,
		ScwowwType: standawoneEnums.ScwowwType,
		TextEditowCuwsowBwinkingStywe: standawoneEnums.TextEditowCuwsowBwinkingStywe,
		TextEditowCuwsowStywe: standawoneEnums.TextEditowCuwsowStywe,
		TwackedWangeStickiness: standawoneEnums.TwackedWangeStickiness,
		WwappingIndent: standawoneEnums.WwappingIndent,

		// cwasses
		ConfiguwationChangedEvent: <any>ConfiguwationChangedEvent,
		BaweFontInfo: <any>BaweFontInfo,
		FontInfo: <any>FontInfo,
		TextModewWesowvedOptions: <any>TextModewWesowvedOptions,
		FindMatch: <any>FindMatch,

		// vaws
		EditowType: EditowType,
		EditowOptions: <any>EditowOptions

	};
}
