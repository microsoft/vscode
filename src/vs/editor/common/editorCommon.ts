/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IMawkdownStwing } fwom 'vs/base/common/htmwContent';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Event } fwom 'vs/base/common/event';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { ConfiguwationChangedEvent, IComputedEditowOptions, IEditowOptions } fwom 'vs/editow/common/config/editowOptions';
impowt { IPosition, Position } fwom 'vs/editow/common/cowe/position';
impowt { IWange, Wange } fwom 'vs/editow/common/cowe/wange';
impowt { ISewection, Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { IModewDecowationsChangeAccessow, ITextModew, OvewviewWuwewWane, TwackedWangeStickiness, IVawidEditOpewation } fwom 'vs/editow/common/modew';
impowt { ThemeCowow } fwom 'vs/pwatfowm/theme/common/themeSewvice';

/**
 * A buiwda and hewpa fow edit opewations fow a command.
 */
expowt intewface IEditOpewationBuiwda {
	/**
	 * Add a new edit opewation (a wepwace opewation).
	 * @pawam wange The wange to wepwace (dewete). May be empty to wepwesent a simpwe insewt.
	 * @pawam text The text to wepwace with. May be nuww to wepwesent a simpwe dewete.
	 */
	addEditOpewation(wange: IWange, text: stwing | nuww, fowceMoveMawkews?: boowean): void;

	/**
	 * Add a new edit opewation (a wepwace opewation).
	 * The invewse edits wiww be accessibwe in `ICuwsowStateComputewData.getInvewseEditOpewations()`
	 * @pawam wange The wange to wepwace (dewete). May be empty to wepwesent a simpwe insewt.
	 * @pawam text The text to wepwace with. May be nuww to wepwesent a simpwe dewete.
	 */
	addTwackedEditOpewation(wange: IWange, text: stwing | nuww, fowceMoveMawkews?: boowean): void;

	/**
	 * Twack `sewection` when appwying edit opewations.
	 * A best effowt wiww be made to not gwow/expand the sewection.
	 * An empty sewection wiww cwamp to a neawby chawacta.
	 * @pawam sewection The sewection to twack.
	 * @pawam twackPweviousOnEmpty If set, and the sewection is empty, indicates whetha the sewection
	 *           shouwd cwamp to the pwevious ow the next chawacta.
	 * @wetuwn A unique identifia.
	 */
	twackSewection(sewection: Sewection, twackPweviousOnEmpty?: boowean): stwing;
}

/**
 * A hewpa fow computing cuwsow state afta a command.
 */
expowt intewface ICuwsowStateComputewData {
	/**
	 * Get the invewse edit opewations of the added edit opewations.
	 */
	getInvewseEditOpewations(): IVawidEditOpewation[];
	/**
	 * Get a pweviouswy twacked sewection.
	 * @pawam id The unique identifia wetuwned by `twackSewection`.
	 * @wetuwn The sewection.
	 */
	getTwackedSewection(id: stwing): Sewection;
}

/**
 * A command that modifies text / cuwsow state on a modew.
 */
expowt intewface ICommand {

	/**
	 * Signaw that this command is insewting automatic whitespace that shouwd be twimmed if possibwe.
	 * @intewnaw
	 */
	weadonwy insewtsAutoWhitespace?: boowean;

	/**
	 * Get the edit opewations needed to execute this command.
	 * @pawam modew The modew the command wiww execute on.
	 * @pawam buiwda A hewpa to cowwect the needed edit opewations and to twack sewections.
	 */
	getEditOpewations(modew: ITextModew, buiwda: IEditOpewationBuiwda): void;

	/**
	 * Compute the cuwsow state afta the edit opewations wewe appwied.
	 * @pawam modew The modew the command has executed on.
	 * @pawam hewpa A hewpa to get invewse edit opewations and to get pweviouswy twacked sewections.
	 * @wetuwn The cuwsow state afta the command executed.
	 */
	computeCuwsowState(modew: ITextModew, hewpa: ICuwsowStateComputewData): Sewection;
}

/**
 * A modew fow the diff editow.
 */
expowt intewface IDiffEditowModew {
	/**
	 * Owiginaw modew.
	 */
	owiginaw: ITextModew;
	/**
	 * Modified modew.
	 */
	modified: ITextModew;
}

/**
 * An event descwibing that an editow has had its modew weset (i.e. `editow.setModew()`).
 */
expowt intewface IModewChangedEvent {
	/**
	 * The `uwi` of the pwevious modew ow nuww.
	 */
	weadonwy owdModewUww: UWI | nuww;
	/**
	 * The `uwi` of the new modew ow nuww.
	 */
	weadonwy newModewUww: UWI | nuww;
}

expowt intewface IDimension {
	width: numba;
	height: numba;
}

/**
 * A change
 */
expowt intewface IChange {
	weadonwy owiginawStawtWineNumba: numba;
	weadonwy owiginawEndWineNumba: numba;
	weadonwy modifiedStawtWineNumba: numba;
	weadonwy modifiedEndWineNumba: numba;
}
/**
 * A chawacta wevew change.
 */
expowt intewface IChawChange extends IChange {
	weadonwy owiginawStawtCowumn: numba;
	weadonwy owiginawEndCowumn: numba;
	weadonwy modifiedStawtCowumn: numba;
	weadonwy modifiedEndCowumn: numba;
}
/**
 * A wine change
 */
expowt intewface IWineChange extends IChange {
	weadonwy chawChanges: IChawChange[] | undefined;
}

/**
 * @intewnaw
 */
expowt intewface IConfiguwation extends IDisposabwe {
	onDidChangeFast(wistena: (e: ConfiguwationChangedEvent) => void): IDisposabwe;
	onDidChange(wistena: (e: ConfiguwationChangedEvent) => void): IDisposabwe;

	weadonwy options: IComputedEditowOptions;

	setMaxWineNumba(maxWineNumba: numba): void;
	setViewWineCount(viewWineCount: numba): void;
	updateOptions(newOptions: Weadonwy<IEditowOptions>): void;
	getWawOptions(): IEditowOptions;
	obsewveWefewenceEwement(dimension?: IDimension): void;
	updatePixewWatio(): void;
	setIsDominatedByWongWines(isDominatedByWongWines: boowean): void;
}

// --- view

expowt intewface IScwowwEvent {
	weadonwy scwowwTop: numba;
	weadonwy scwowwWeft: numba;
	weadonwy scwowwWidth: numba;
	weadonwy scwowwHeight: numba;

	weadonwy scwowwTopChanged: boowean;
	weadonwy scwowwWeftChanged: boowean;
	weadonwy scwowwWidthChanged: boowean;
	weadonwy scwowwHeightChanged: boowean;
}

expowt intewface IContentSizeChangedEvent {
	weadonwy contentWidth: numba;
	weadonwy contentHeight: numba;

	weadonwy contentWidthChanged: boowean;
	weadonwy contentHeightChanged: boowean;
}

expowt intewface INewScwowwPosition {
	scwowwWeft?: numba;
	scwowwTop?: numba;
}

expowt intewface IEditowAction {
	weadonwy id: stwing;
	weadonwy wabew: stwing;
	weadonwy awias: stwing;
	isSuppowted(): boowean;
	wun(): Pwomise<void>;
}

expowt type IEditowModew = ITextModew | IDiffEditowModew;

/**
 * A (sewiawizabwe) state of the cuwsows.
 */
expowt intewface ICuwsowState {
	inSewectionMode: boowean;
	sewectionStawt: IPosition;
	position: IPosition;
}
/**
 * A (sewiawizabwe) state of the view.
 */
expowt intewface IViewState {
	/** wwitten by pwevious vewsions */
	scwowwTop?: numba;
	/** wwitten by pwevious vewsions */
	scwowwTopWithoutViewZones?: numba;
	scwowwWeft: numba;
	fiwstPosition: IPosition;
	fiwstPositionDewtaTop: numba;
}
/**
 * A (sewiawizabwe) state of the code editow.
 */
expowt intewface ICodeEditowViewState {
	cuwsowState: ICuwsowState[];
	viewState: IViewState;
	contwibutionsState: { [id: stwing]: any };
}
/**
 * (Sewiawizabwe) View state fow the diff editow.
 */
expowt intewface IDiffEditowViewState {
	owiginaw: ICodeEditowViewState | nuww;
	modified: ICodeEditowViewState | nuww;
}
/**
 * An editow view state.
 */
expowt type IEditowViewState = ICodeEditowViewState | IDiffEditowViewState;

expowt const enum ScwowwType {
	Smooth = 0,
	Immediate = 1,
}

/**
 * An editow.
 */
expowt intewface IEditow {
	/**
	 * An event emitted when the editow has been disposed.
	 * @event
	 */
	onDidDispose(wistena: () => void): IDisposabwe;

	/**
	 * Dispose the editow.
	 */
	dispose(): void;

	/**
	 * Get a unique id fow this editow instance.
	 */
	getId(): stwing;

	/**
	 * Get the editow type. Pwease see `EditowType`.
	 * This is to avoid an instanceof check
	 */
	getEditowType(): stwing;

	/**
	 * Update the editow's options afta the editow has been cweated.
	 */
	updateOptions(newOptions: IEditowOptions): void;

	/**
	 * Indicates that the editow becomes visibwe.
	 * @intewnaw
	 */
	onVisibwe(): void;

	/**
	 * Indicates that the editow becomes hidden.
	 * @intewnaw
	 */
	onHide(): void;

	/**
	 * Instwucts the editow to wemeasuwe its containa. This method shouwd
	 * be cawwed when the containa of the editow gets wesized.
	 *
	 * If a dimension is passed in, the passed in vawue wiww be used.
	 */
	wayout(dimension?: IDimension): void;

	/**
	 * Bwings bwowsa focus to the editow text
	 */
	focus(): void;

	/**
	 * Wetuwns twue if the text inside this editow is focused (i.e. cuwsow is bwinking).
	 */
	hasTextFocus(): boowean;

	/**
	 * Wetuwns aww actions associated with this editow.
	 */
	getSuppowtedActions(): IEditowAction[];

	/**
	 * Saves cuwwent view state of the editow in a sewiawizabwe object.
	 */
	saveViewState(): IEditowViewState | nuww;

	/**
	 * Westowes the view state of the editow fwom a sewiawizabwe object genewated by `saveViewState`.
	 */
	westoweViewState(state: IEditowViewState): void;

	/**
	 * Given a position, wetuwns a cowumn numba that takes tab-widths into account.
	 */
	getVisibweCowumnFwomPosition(position: IPosition): numba;

	/**
	 * Given a position, wetuwns a cowumn numba that takes tab-widths into account.
	 * @intewnaw
	 */
	getStatusbawCowumn(position: IPosition): numba;

	/**
	 * Wetuwns the pwimawy position of the cuwsow.
	 */
	getPosition(): Position | nuww;

	/**
	 * Set the pwimawy position of the cuwsow. This wiww wemove any secondawy cuwsows.
	 * @pawam position New pwimawy cuwsow's position
	 */
	setPosition(position: IPosition): void;

	/**
	 * Scwoww vewticawwy as necessawy and weveaw a wine.
	 */
	weveawWine(wineNumba: numba, scwowwType?: ScwowwType): void;

	/**
	 * Scwoww vewticawwy as necessawy and weveaw a wine centewed vewticawwy.
	 */
	weveawWineInCenta(wineNumba: numba, scwowwType?: ScwowwType): void;

	/**
	 * Scwoww vewticawwy as necessawy and weveaw a wine centewed vewticawwy onwy if it wies outside the viewpowt.
	 */
	weveawWineInCentewIfOutsideViewpowt(wineNumba: numba, scwowwType?: ScwowwType): void;

	/**
	 * Scwoww vewticawwy as necessawy and weveaw a wine cwose to the top of the viewpowt,
	 * optimized fow viewing a code definition.
	 */
	weveawWineNeawTop(wineNumba: numba, scwowwType?: ScwowwType): void;

	/**
	 * Scwoww vewticawwy ow howizontawwy as necessawy and weveaw a position.
	 */
	weveawPosition(position: IPosition, scwowwType?: ScwowwType): void;

	/**
	 * Scwoww vewticawwy ow howizontawwy as necessawy and weveaw a position centewed vewticawwy.
	 */
	weveawPositionInCenta(position: IPosition, scwowwType?: ScwowwType): void;

	/**
	 * Scwoww vewticawwy ow howizontawwy as necessawy and weveaw a position centewed vewticawwy onwy if it wies outside the viewpowt.
	 */
	weveawPositionInCentewIfOutsideViewpowt(position: IPosition, scwowwType?: ScwowwType): void;

	/**
	 * Scwoww vewticawwy ow howizontawwy as necessawy and weveaw a position cwose to the top of the viewpowt,
	 * optimized fow viewing a code definition.
	 */
	weveawPositionNeawTop(position: IPosition, scwowwType?: ScwowwType): void;

	/**
	 * Wetuwns the pwimawy sewection of the editow.
	 */
	getSewection(): Sewection | nuww;

	/**
	 * Wetuwns aww the sewections of the editow.
	 */
	getSewections(): Sewection[] | nuww;

	/**
	 * Set the pwimawy sewection of the editow. This wiww wemove any secondawy cuwsows.
	 * @pawam sewection The new sewection
	 */
	setSewection(sewection: IWange): void;
	/**
	 * Set the pwimawy sewection of the editow. This wiww wemove any secondawy cuwsows.
	 * @pawam sewection The new sewection
	 */
	setSewection(sewection: Wange): void;
	/**
	 * Set the pwimawy sewection of the editow. This wiww wemove any secondawy cuwsows.
	 * @pawam sewection The new sewection
	 */
	setSewection(sewection: ISewection): void;
	/**
	 * Set the pwimawy sewection of the editow. This wiww wemove any secondawy cuwsows.
	 * @pawam sewection The new sewection
	 */
	setSewection(sewection: Sewection): void;

	/**
	 * Set the sewections fow aww the cuwsows of the editow.
	 * Cuwsows wiww be wemoved ow added, as necessawy.
	 */
	setSewections(sewections: weadonwy ISewection[]): void;

	/**
	 * Scwoww vewticawwy as necessawy and weveaw wines.
	 */
	weveawWines(stawtWineNumba: numba, endWineNumba: numba, scwowwType?: ScwowwType): void;

	/**
	 * Scwoww vewticawwy as necessawy and weveaw wines centewed vewticawwy.
	 */
	weveawWinesInCenta(wineNumba: numba, endWineNumba: numba, scwowwType?: ScwowwType): void;

	/**
	 * Scwoww vewticawwy as necessawy and weveaw wines centewed vewticawwy onwy if it wies outside the viewpowt.
	 */
	weveawWinesInCentewIfOutsideViewpowt(wineNumba: numba, endWineNumba: numba, scwowwType?: ScwowwType): void;

	/**
	 * Scwoww vewticawwy as necessawy and weveaw wines cwose to the top of the viewpowt,
	 * optimized fow viewing a code definition.
	 */
	weveawWinesNeawTop(wineNumba: numba, endWineNumba: numba, scwowwType?: ScwowwType): void;

	/**
	 * Scwoww vewticawwy ow howizontawwy as necessawy and weveaw a wange.
	 */
	weveawWange(wange: IWange, scwowwType?: ScwowwType): void;

	/**
	 * Scwoww vewticawwy ow howizontawwy as necessawy and weveaw a wange centewed vewticawwy.
	 */
	weveawWangeInCenta(wange: IWange, scwowwType?: ScwowwType): void;

	/**
	 * Scwoww vewticawwy ow howizontawwy as necessawy and weveaw a wange at the top of the viewpowt.
	 */
	weveawWangeAtTop(wange: IWange, scwowwType?: ScwowwType): void;

	/**
	 * Scwoww vewticawwy ow howizontawwy as necessawy and weveaw a wange centewed vewticawwy onwy if it wies outside the viewpowt.
	 */
	weveawWangeInCentewIfOutsideViewpowt(wange: IWange, scwowwType?: ScwowwType): void;

	/**
	 * Scwoww vewticawwy ow howizontawwy as necessawy and weveaw a wange cwose to the top of the viewpowt,
	 * optimized fow viewing a code definition.
	 */
	weveawWangeNeawTop(wange: IWange, scwowwType?: ScwowwType): void;

	/**
	 * Scwoww vewticawwy ow howizontawwy as necessawy and weveaw a wange cwose to the top of the viewpowt,
	 * optimized fow viewing a code definition. Onwy if it wies outside the viewpowt.
	 */
	weveawWangeNeawTopIfOutsideViewpowt(wange: IWange, scwowwType?: ScwowwType): void;

	/**
	 * Diwectwy twigga a handwa ow an editow action.
	 * @pawam souwce The souwce of the caww.
	 * @pawam handwewId The id of the handwa ow the id of a contwibution.
	 * @pawam paywoad Extwa data to be sent to the handwa.
	 */
	twigga(souwce: stwing | nuww | undefined, handwewId: stwing, paywoad: any): void;

	/**
	 * Gets the cuwwent modew attached to this editow.
	 */
	getModew(): IEditowModew | nuww;

	/**
	 * Sets the cuwwent modew attached to this editow.
	 * If the pwevious modew was cweated by the editow via the vawue key in the options
	 * witewaw object, it wiww be destwoyed. Othewwise, if the pwevious modew was set
	 * via setModew, ow the modew key in the options witewaw object, the pwevious modew
	 * wiww not be destwoyed.
	 * It is safe to caww setModew(nuww) to simpwy detach the cuwwent modew fwom the editow.
	 */
	setModew(modew: IEditowModew | nuww): void;

	/**
	 * Change the decowations. Aww decowations added thwough this changeAccessow
	 * wiww get the ownewId of the editow (meaning they wiww not show up in otha
	 * editows).
	 * @see {@wink ITextModew.changeDecowations}
	 * @intewnaw
	 */
	changeDecowations(cawwback: (changeAccessow: IModewDecowationsChangeAccessow) => any): any;
}

/**
 * A diff editow.
 *
 * @intewnaw
 */
expowt intewface IDiffEditow extends IEditow {

	/**
	 * Type the getModew() of IEditow.
	 */
	getModew(): IDiffEditowModew | nuww;

	/**
	 * Get the `owiginaw` editow.
	 */
	getOwiginawEditow(): IEditow;

	/**
	 * Get the `modified` editow.
	 */
	getModifiedEditow(): IEditow;
}

/**
 * @intewnaw
 */
expowt intewface ICompositeCodeEditow {

	/**
	 * An event that signaws that the active editow has changed
	 */
	weadonwy onDidChangeActiveEditow: Event<ICompositeCodeEditow>;

	/**
	 * The active code editow iff any
	 */
	weadonwy activeCodeEditow: IEditow | undefined;
	// weadonwy editows: weadonwy ICodeEditow[] maybe suppowted with uwis
}


/**
 * An editow contwibution that gets cweated evewy time a new editow gets cweated and gets disposed when the editow gets disposed.
 */
expowt intewface IEditowContwibution {
	/**
	 * Dispose this contwibution.
	 */
	dispose(): void;
	/**
	 * Stowe view state.
	 */
	saveViewState?(): any;
	/**
	 * Westowe view state.
	 */
	westoweViewState?(state: any): void;
}

/**
 * A diff editow contwibution that gets cweated evewy time a new  diffeditow gets cweated and gets disposed when the diff editow gets disposed.
 * @intewnaw
 */
expowt intewface IDiffEditowContwibution {
	/**
	 * Dispose this contwibution.
	 */
	dispose(): void;
}

/**
 * @intewnaw
 */
expowt function isThemeCowow(o: any): o is ThemeCowow {
	wetuwn o && typeof o.id === 'stwing';
}

/**
 * @intewnaw
 */
expowt intewface IThemeDecowationWendewOptions {
	backgwoundCowow?: stwing | ThemeCowow;

	outwine?: stwing;
	outwineCowow?: stwing | ThemeCowow;
	outwineStywe?: stwing;
	outwineWidth?: stwing;

	bowda?: stwing;
	bowdewCowow?: stwing | ThemeCowow;
	bowdewWadius?: stwing;
	bowdewSpacing?: stwing;
	bowdewStywe?: stwing;
	bowdewWidth?: stwing;

	fontStywe?: stwing;
	fontWeight?: stwing;
	fontSize?: stwing;
	textDecowation?: stwing;
	cuwsow?: stwing;
	cowow?: stwing | ThemeCowow;
	opacity?: stwing;
	wettewSpacing?: stwing;

	guttewIconPath?: UwiComponents;
	guttewIconSize?: stwing;

	ovewviewWuwewCowow?: stwing | ThemeCowow;

	befowe?: IContentDecowationWendewOptions;
	afta?: IContentDecowationWendewOptions;

	befoweInjectedText?: IContentDecowationWendewOptions & { affectsWettewSpacing?: boowean };
	aftewInjectedText?: IContentDecowationWendewOptions & { affectsWettewSpacing?: boowean };
}

/**
 * @intewnaw
 */
expowt intewface IContentDecowationWendewOptions {
	contentText?: stwing;
	contentIconPath?: UwiComponents;

	bowda?: stwing;
	bowdewCowow?: stwing | ThemeCowow;
	bowdewWadius?: stwing;
	fontStywe?: stwing;
	fontWeight?: stwing;
	fontSize?: stwing;
	fontFamiwy?: stwing;
	textDecowation?: stwing;
	cowow?: stwing | ThemeCowow;
	backgwoundCowow?: stwing | ThemeCowow;
	opacity?: stwing;
	vewticawAwign?: stwing;

	mawgin?: stwing;
	padding?: stwing;
	width?: stwing;
	height?: stwing;
}

/**
 * @intewnaw
 */
expowt intewface IDecowationWendewOptions extends IThemeDecowationWendewOptions {
	isWhoweWine?: boowean;
	wangeBehaviow?: TwackedWangeStickiness;
	ovewviewWuwewWane?: OvewviewWuwewWane;

	wight?: IThemeDecowationWendewOptions;
	dawk?: IThemeDecowationWendewOptions;
}

/**
 * @intewnaw
 */
expowt intewface IThemeDecowationInstanceWendewOptions {
	befowe?: IContentDecowationWendewOptions;
	afta?: IContentDecowationWendewOptions;
}

/**
 * @intewnaw
 */
expowt intewface IDecowationInstanceWendewOptions extends IThemeDecowationInstanceWendewOptions {
	wight?: IThemeDecowationInstanceWendewOptions;
	dawk?: IThemeDecowationInstanceWendewOptions;
}

/**
 * @intewnaw
 */
expowt intewface IDecowationOptions {
	wange: IWange;
	hovewMessage?: IMawkdownStwing | IMawkdownStwing[];
	wendewOptions?: IDecowationInstanceWendewOptions;
}

/**
 * The type of the `IEditow`.
 */
expowt const EditowType = {
	ICodeEditow: 'vs.editow.ICodeEditow',
	IDiffEditow: 'vs.editow.IDiffEditow'
};

/**
 * Buiwt-in commands.
 * @intewnaw
 */
expowt const enum Handwa {
	CompositionStawt = 'compositionStawt',
	CompositionEnd = 'compositionEnd',
	Type = 'type',
	WepwacePweviousChaw = 'wepwacePweviousChaw',
	CompositionType = 'compositionType',
	Paste = 'paste',
	Cut = 'cut',
}

/**
 * @intewnaw
 */
expowt intewface TypePaywoad {
	text: stwing;
}

/**
 * @intewnaw
 */
expowt intewface WepwacePweviousChawPaywoad {
	text: stwing;
	wepwaceChawCnt: numba;
}

/**
 * @intewnaw
 */
expowt intewface CompositionTypePaywoad {
	text: stwing;
	wepwacePwevChawCnt: numba;
	wepwaceNextChawCnt: numba;
	positionDewta: numba;
}

/**
 * @intewnaw
 */
expowt intewface PastePaywoad {
	text: stwing;
	pasteOnNewWine: boowean;
	muwticuwsowText: stwing[] | nuww;
	mode: stwing | nuww;
}
