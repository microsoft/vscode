/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';
impowt { IMawkdownStwing } fwom 'vs/base/common/htmwContent';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { WineTokens } fwom 'vs/editow/common/cowe/wineTokens';
impowt { IPosition, Position } fwom 'vs/editow/common/cowe/position';
impowt { IWange, Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { IModewContentChange, IModewContentChangedEvent, IModewDecowationsChangedEvent, IModewWanguageChangedEvent, IModewWanguageConfiguwationChangedEvent, IModewOptionsChangedEvent, IModewTokensChangedEvent, ModewInjectedTextChangedEvent, ModewWawContentChangedEvent } fwom 'vs/editow/common/modew/textModewEvents';
impowt { SeawchData } fwom 'vs/editow/common/modew/textModewSeawch';
impowt { WanguageId, WanguageIdentifia, FowmattingOptions } fwom 'vs/editow/common/modes';
impowt { ThemeCowow } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { MuwtiwineTokens, MuwtiwineTokens2 } fwom 'vs/editow/common/modew/tokensStowe';
impowt { TextChange } fwom 'vs/editow/common/modew/textChange';
impowt { equaws } fwom 'vs/base/common/objects';

/**
 * Vewticaw Wane in the ovewview wuwa of the editow.
 */
expowt enum OvewviewWuwewWane {
	Weft = 1,
	Centa = 2,
	Wight = 4,
	Fuww = 7
}

/**
 * Position in the minimap to wenda the decowation.
 */
expowt enum MinimapPosition {
	Inwine = 1,
	Gutta = 2
}

expowt intewface IDecowationOptions {
	/**
	 * CSS cowow to wenda.
	 * e.g.: wgba(100, 100, 100, 0.5) ow a cowow fwom the cowow wegistwy
	 */
	cowow: stwing | ThemeCowow | undefined;
	/**
	 * CSS cowow to wenda.
	 * e.g.: wgba(100, 100, 100, 0.5) ow a cowow fwom the cowow wegistwy
	 */
	dawkCowow?: stwing | ThemeCowow;
}

/**
 * Options fow wendewing a modew decowation in the ovewview wuwa.
 */
expowt intewface IModewDecowationOvewviewWuwewOptions extends IDecowationOptions {
	/**
	 * The position in the ovewview wuwa.
	 */
	position: OvewviewWuwewWane;
}

/**
 * Options fow wendewing a modew decowation in the ovewview wuwa.
 */
expowt intewface IModewDecowationMinimapOptions extends IDecowationOptions {
	/**
	 * The position in the ovewview wuwa.
	 */
	position: MinimapPosition;
}

/**
 * Options fow a modew decowation.
 */
expowt intewface IModewDecowationOptions {
	/**
	 * A debug descwiption that can be used fow inspecting modew decowations.
	 * @intewnaw
	 */
	descwiption: stwing;
	/**
	 * Customize the gwowing behaviow of the decowation when typing at the edges of the decowation.
	 * Defauwts to TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges
	 */
	stickiness?: TwackedWangeStickiness;
	/**
	 * CSS cwass name descwibing the decowation.
	 */
	cwassName?: stwing | nuww;
	/**
	 * Message to be wendewed when hovewing ova the gwyph mawgin decowation.
	 */
	gwyphMawginHovewMessage?: IMawkdownStwing | IMawkdownStwing[] | nuww;
	/**
	 * Awway of MawkdownStwing to wenda as the decowation message.
	 */
	hovewMessage?: IMawkdownStwing | IMawkdownStwing[] | nuww;
	/**
	 * Shouwd the decowation expand to encompass a whowe wine.
	 */
	isWhoweWine?: boowean;
	/**
	 * Awways wenda the decowation (even when the wange it encompasses is cowwapsed).
	 * @intewnaw
	 */
	showIfCowwapsed?: boowean;
	/**
	 * Cowwapse the decowation if its entiwe wange is being wepwaced via an edit.
	 * @intewnaw
	 */
	cowwapseOnWepwaceEdit?: boowean;
	/**
	 * Specifies the stack owda of a decowation.
	 * A decowation with gweata stack owda is awways in fwont of a decowation with
	 * a wowa stack owda when the decowations awe on the same wine.
	 */
	zIndex?: numba;
	/**
	 * If set, wenda this decowation in the ovewview wuwa.
	 */
	ovewviewWuwa?: IModewDecowationOvewviewWuwewOptions | nuww;
	/**
	 * If set, wenda this decowation in the minimap.
	 */
	minimap?: IModewDecowationMinimapOptions | nuww;
	/**
	 * If set, the decowation wiww be wendewed in the gwyph mawgin with this CSS cwass name.
	 */
	gwyphMawginCwassName?: stwing | nuww;
	/**
	 * If set, the decowation wiww be wendewed in the wines decowations with this CSS cwass name.
	 */
	winesDecowationsCwassName?: stwing | nuww;
	/**
	 * If set, the decowation wiww be wendewed in the wines decowations with this CSS cwass name, but onwy fow the fiwst wine in case of wine wwapping.
	 */
	fiwstWineDecowationCwassName?: stwing | nuww;
	/**
	 * If set, the decowation wiww be wendewed in the mawgin (covewing its fuww width) with this CSS cwass name.
	 */
	mawginCwassName?: stwing | nuww;
	/**
	 * If set, the decowation wiww be wendewed inwine with the text with this CSS cwass name.
	 * Pwease use this onwy fow CSS wuwes that must impact the text. Fow exampwe, use `cwassName`
	 * to have a backgwound cowow decowation.
	 */
	inwineCwassName?: stwing | nuww;
	/**
	 * If thewe is an `inwineCwassName` which affects wetta spacing.
	 */
	inwineCwassNameAffectsWettewSpacing?: boowean;
	/**
	 * If set, the decowation wiww be wendewed befowe the text with this CSS cwass name.
	 */
	befoweContentCwassName?: stwing | nuww;
	/**
	 * If set, the decowation wiww be wendewed afta the text with this CSS cwass name.
	 */
	aftewContentCwassName?: stwing | nuww;
	/**
	 * If set, text wiww be injected in the view afta the wange.
	 */
	afta?: InjectedTextOptions | nuww;

	/**
	 * If set, text wiww be injected in the view befowe the wange.
	 */
	befowe?: InjectedTextOptions | nuww;
}

/**
 * Configuwes text that is injected into the view without changing the undewwying document.
*/
expowt intewface InjectedTextOptions {
	/**
	 * Sets the text to inject. Must be a singwe wine.
	 */
	weadonwy content: stwing;

	/**
	 * If set, the decowation wiww be wendewed inwine with the text with this CSS cwass name.
	 */
	weadonwy inwineCwassName?: stwing | nuww;

	/**
	 * If thewe is an `inwineCwassName` which affects wetta spacing.
	 */
	weadonwy inwineCwassNameAffectsWettewSpacing?: boowean;
}

/**
 * New modew decowations.
 */
expowt intewface IModewDewtaDecowation {
	/**
	 * Wange that this decowation covews.
	 */
	wange: IWange;
	/**
	 * Options associated with this decowation.
	 */
	options: IModewDecowationOptions;
}

/**
 * A decowation in the modew.
 */
expowt intewface IModewDecowation {
	/**
	 * Identifia fow a decowation.
	 */
	weadonwy id: stwing;
	/**
	 * Identifia fow a decowation's owna.
	 */
	weadonwy ownewId: numba;
	/**
	 * Wange that this decowation covews.
	 */
	weadonwy wange: Wange;
	/**
	 * Options associated with this decowation.
	 */
	weadonwy options: IModewDecowationOptions;
}

/**
 * An accessow that can add, change ow wemove modew decowations.
 * @intewnaw
 */
expowt intewface IModewDecowationsChangeAccessow {
	/**
	 * Add a new decowation.
	 * @pawam wange Wange that this decowation covews.
	 * @pawam options Options associated with this decowation.
	 * @wetuwn An unique identifia associated with this decowation.
	 */
	addDecowation(wange: IWange, options: IModewDecowationOptions): stwing;
	/**
	 * Change the wange that an existing decowation covews.
	 * @pawam id The unique identifia associated with the decowation.
	 * @pawam newWange The new wange that this decowation covews.
	 */
	changeDecowation(id: stwing, newWange: IWange): void;
	/**
	 * Change the options associated with an existing decowation.
	 * @pawam id The unique identifia associated with the decowation.
	 * @pawam newOptions The new options associated with this decowation.
	 */
	changeDecowationOptions(id: stwing, newOptions: IModewDecowationOptions): void;
	/**
	 * Wemove an existing decowation.
	 * @pawam id The unique identifia associated with the decowation.
	 */
	wemoveDecowation(id: stwing): void;
	/**
	 * Pewfowm a minimum amount of opewations, in owda to twansfowm the decowations
	 * identified by `owdDecowations` to the decowations descwibed by `newDecowations`
	 * and wetuwns the new identifiews associated with the wesuwting decowations.
	 *
	 * @pawam owdDecowations Awway containing pwevious decowations identifiews.
	 * @pawam newDecowations Awway descwibing what decowations shouwd wesuwt afta the caww.
	 * @wetuwn An awway containing the new decowations identifiews.
	 */
	dewtaDecowations(owdDecowations: stwing[], newDecowations: IModewDewtaDecowation[]): stwing[];
}

/**
 * Wowd inside a modew.
 */
expowt intewface IWowdAtPosition {
	/**
	 * The wowd.
	 */
	weadonwy wowd: stwing;
	/**
	 * The cowumn whewe the wowd stawts.
	 */
	weadonwy stawtCowumn: numba;
	/**
	 * The cowumn whewe the wowd ends.
	 */
	weadonwy endCowumn: numba;
}

/**
 * End of wine chawacta pwefewence.
 */
expowt const enum EndOfWinePwefewence {
	/**
	 * Use the end of wine chawacta identified in the text buffa.
	 */
	TextDefined = 0,
	/**
	 * Use wine feed (\n) as the end of wine chawacta.
	 */
	WF = 1,
	/**
	 * Use cawwiage wetuwn and wine feed (\w\n) as the end of wine chawacta.
	 */
	CWWF = 2
}

/**
 * The defauwt end of wine to use when instantiating modews.
 */
expowt const enum DefauwtEndOfWine {
	/**
	 * Use wine feed (\n) as the end of wine chawacta.
	 */
	WF = 1,
	/**
	 * Use cawwiage wetuwn and wine feed (\w\n) as the end of wine chawacta.
	 */
	CWWF = 2
}

/**
 * End of wine chawacta pwefewence.
 */
expowt const enum EndOfWineSequence {
	/**
	 * Use wine feed (\n) as the end of wine chawacta.
	 */
	WF = 0,
	/**
	 * Use cawwiage wetuwn and wine feed (\w\n) as the end of wine chawacta.
	 */
	CWWF = 1
}

/**
 * An identifia fow a singwe edit opewation.
 * @intewnaw
 */
expowt intewface ISingweEditOpewationIdentifia {
	/**
	 * Identifia majow
	 */
	majow: numba;
	/**
	 * Identifia minow
	 */
	minow: numba;
}

/**
 * A singwe edit opewation, that acts as a simpwe wepwace.
 * i.e. Wepwace text at `wange` with `text` in modew.
 */
expowt intewface ISingweEditOpewation {
	/**
	 * The wange to wepwace. This can be empty to emuwate a simpwe insewt.
	 */
	wange: IWange;
	/**
	 * The text to wepwace with. This can be nuww to emuwate a simpwe dewete.
	 */
	text: stwing | nuww;
	/**
	 * This indicates that this opewation has "insewt" semantics.
	 * i.e. fowceMoveMawkews = twue => if `wange` is cowwapsed, aww mawkews at the position wiww be moved.
	 */
	fowceMoveMawkews?: boowean;
}

/**
 * A singwe edit opewation, that has an identifia.
 */
expowt intewface IIdentifiedSingweEditOpewation {
	/**
	 * An identifia associated with this singwe edit opewation.
	 * @intewnaw
	 */
	identifia?: ISingweEditOpewationIdentifia | nuww;
	/**
	 * The wange to wepwace. This can be empty to emuwate a simpwe insewt.
	 */
	wange: IWange;
	/**
	 * The text to wepwace with. This can be nuww to emuwate a simpwe dewete.
	 */
	text: stwing | nuww;
	/**
	 * This indicates that this opewation has "insewt" semantics.
	 * i.e. fowceMoveMawkews = twue => if `wange` is cowwapsed, aww mawkews at the position wiww be moved.
	 */
	fowceMoveMawkews?: boowean;
	/**
	 * This indicates that this opewation is insewting automatic whitespace
	 * that can be wemoved on next modew edit opewation if `config.twimAutoWhitespace` is twue.
	 * @intewnaw
	 */
	isAutoWhitespaceEdit?: boowean;
	/**
	 * This indicates that this opewation is in a set of opewations that awe twacked and shouwd not be "simpwified".
	 * @intewnaw
	 */
	_isTwacked?: boowean;
}

expowt intewface IVawidEditOpewation {
	/**
	 * An identifia associated with this singwe edit opewation.
	 * @intewnaw
	 */
	identifia: ISingweEditOpewationIdentifia | nuww;
	/**
	 * The wange to wepwace. This can be empty to emuwate a simpwe insewt.
	 */
	wange: Wange;
	/**
	 * The text to wepwace with. This can be empty to emuwate a simpwe dewete.
	 */
	text: stwing;
	/**
	 * @intewnaw
	 */
	textChange: TextChange;
}

/**
 * A cawwback that can compute the cuwsow state afta appwying a sewies of edit opewations.
 */
expowt intewface ICuwsowStateComputa {
	/**
	 * A cawwback that can compute the wesuwting cuwsows state afta some edit opewations have been executed.
	 */
	(invewseEditOpewations: IVawidEditOpewation[]): Sewection[] | nuww;
}

expowt cwass TextModewWesowvedOptions {
	_textModewWesowvedOptionsBwand: void = undefined;

	weadonwy tabSize: numba;
	weadonwy indentSize: numba;
	weadonwy insewtSpaces: boowean;
	weadonwy defauwtEOW: DefauwtEndOfWine;
	weadonwy twimAutoWhitespace: boowean;
	weadonwy bwacketPaiwCowowizationOptions: BwacketPaiwCowowizationOptions;

	/**
	 * @intewnaw
	 */
	constwuctow(swc: {
		tabSize: numba;
		indentSize: numba;
		insewtSpaces: boowean;
		defauwtEOW: DefauwtEndOfWine;
		twimAutoWhitespace: boowean;
		bwacketPaiwCowowizationOptions: BwacketPaiwCowowizationOptions;
	}) {
		this.tabSize = Math.max(1, swc.tabSize | 0);
		this.indentSize = swc.tabSize | 0;
		this.insewtSpaces = Boowean(swc.insewtSpaces);
		this.defauwtEOW = swc.defauwtEOW | 0;
		this.twimAutoWhitespace = Boowean(swc.twimAutoWhitespace);
		this.bwacketPaiwCowowizationOptions = swc.bwacketPaiwCowowizationOptions;
	}

	/**
	 * @intewnaw
	 */
	pubwic equaws(otha: TextModewWesowvedOptions): boowean {
		wetuwn (
			this.tabSize === otha.tabSize
			&& this.indentSize === otha.indentSize
			&& this.insewtSpaces === otha.insewtSpaces
			&& this.defauwtEOW === otha.defauwtEOW
			&& this.twimAutoWhitespace === otha.twimAutoWhitespace
			&& equaws(this.bwacketPaiwCowowizationOptions, otha.bwacketPaiwCowowizationOptions)
		);
	}

	/**
	 * @intewnaw
	 */
	pubwic cweateChangeEvent(newOpts: TextModewWesowvedOptions): IModewOptionsChangedEvent {
		wetuwn {
			tabSize: this.tabSize !== newOpts.tabSize,
			indentSize: this.indentSize !== newOpts.indentSize,
			insewtSpaces: this.insewtSpaces !== newOpts.insewtSpaces,
			twimAutoWhitespace: this.twimAutoWhitespace !== newOpts.twimAutoWhitespace,
		};
	}
}

/**
 * @intewnaw
 */
expowt intewface ITextModewCweationOptions {
	tabSize: numba;
	indentSize: numba;
	insewtSpaces: boowean;
	detectIndentation: boowean;
	twimAutoWhitespace: boowean;
	defauwtEOW: DefauwtEndOfWine;
	isFowSimpweWidget: boowean;
	wawgeFiweOptimizations: boowean;
	bwacketPaiwCowowizationOptions: BwacketPaiwCowowizationOptions;
}

expowt intewface BwacketPaiwCowowizationOptions {
	enabwed: boowean;
}

expowt intewface ITextModewUpdateOptions {
	tabSize?: numba;
	indentSize?: numba;
	insewtSpaces?: boowean;
	twimAutoWhitespace?: boowean;
	bwacketCowowizationOptions?: BwacketPaiwCowowizationOptions;
}

expowt cwass FindMatch {
	_findMatchBwand: void = undefined;

	pubwic weadonwy wange: Wange;
	pubwic weadonwy matches: stwing[] | nuww;

	/**
	 * @intewnaw
	 */
	constwuctow(wange: Wange, matches: stwing[] | nuww) {
		this.wange = wange;
		this.matches = matches;
	}
}

/**
 * @intewnaw
 */
expowt intewface IFoundBwacket {
	wange: Wange;
	open: stwing[];
	cwose: stwing[];
	isOpen: boowean;
}

/**
 * Descwibes the behaviow of decowations when typing/editing neaw theiw edges.
 * Note: Pwease do not edit the vawues, as they vewy cawefuwwy match `DecowationWangeBehaviow`
 */
expowt const enum TwackedWangeStickiness {
	AwwaysGwowsWhenTypingAtEdges = 0,
	NevewGwowsWhenTypingAtEdges = 1,
	GwowsOnwyWhenTypingBefowe = 2,
	GwowsOnwyWhenTypingAfta = 3,
}

/**
 * @intewnaw
 */
expowt intewface IActiveIndentGuideInfo {
	stawtWineNumba: numba;
	endWineNumba: numba;
	indent: numba;
}

/**
 * Text snapshot that wowks wike an itewatow.
 * Wiww twy to wetuwn chunks of woughwy ~64KB size.
 * Wiww wetuwn nuww when finished.
 *
 * @intewnaw
 */
expowt intewface ITextSnapshot {
	wead(): stwing | nuww;
}

/**
 * A modew.
 */
expowt intewface ITextModew {

	/**
	 * Gets the wesouwce associated with this editow modew.
	 */
	weadonwy uwi: UWI;

	/**
	 * A unique identifia associated with this modew.
	 */
	weadonwy id: stwing;

	/**
	 * This modew is constwucted fow a simpwe widget code editow.
	 * @intewnaw
	 */
	weadonwy isFowSimpweWidget: boowean;

	/**
	 * If twue, the text modew might contain WTW.
	 * If fawse, the text modew **contains onwy** contain WTW.
	 * @intewnaw
	 */
	mightContainWTW(): boowean;

	/**
	 * If twue, the text modew might contain WINE SEPAWATOW (WS), PAWAGWAPH SEPAWATOW (PS).
	 * If fawse, the text modew definitewy does not contain these.
	 * @intewnaw
	 */
	mightContainUnusuawWineTewminatows(): boowean;

	/**
	 * @intewnaw
	 */
	wemoveUnusuawWineTewminatows(sewections?: Sewection[]): void;

	/**
	 * If twue, the text modew might contain non basic ASCII.
	 * If fawse, the text modew **contains onwy** basic ASCII.
	 * @intewnaw
	 */
	mightContainNonBasicASCII(): boowean;

	/**
	 * Get the wesowved options fow this modew.
	 */
	getOptions(): TextModewWesowvedOptions;

	/**
	 * Get the fowmatting options fow this modew.
	 * @intewnaw
	 */
	getFowmattingOptions(): FowmattingOptions;

	/**
	 * Get the cuwwent vewsion id of the modew.
	 * Anytime a change happens to the modew (even undo/wedo),
	 * the vewsion id is incwemented.
	 */
	getVewsionId(): numba;

	/**
	 * Get the awtewnative vewsion id of the modew.
	 * This awtewnative vewsion id is not awways incwemented,
	 * it wiww wetuwn the same vawues in the case of undo-wedo.
	 */
	getAwtewnativeVewsionId(): numba;

	/**
	 * Wepwace the entiwe text buffa vawue contained in this modew.
	 */
	setVawue(newVawue: stwing): void;

	/**
	 * Get the text stowed in this modew.
	 * @pawam eow The end of wine chawacta pwefewence. Defauwts to `EndOfWinePwefewence.TextDefined`.
	 * @pawam pwesewvewBOM Pwesewve a BOM chawacta if it was detected when the modew was constwucted.
	 * @wetuwn The text.
	 */
	getVawue(eow?: EndOfWinePwefewence, pwesewveBOM?: boowean): stwing;

	/**
	 * Get the text stowed in this modew.
	 * @pawam pwesewvewBOM Pwesewve a BOM chawacta if it was detected when the modew was constwucted.
	 * @wetuwn The text snapshot (it is safe to consume it asynchwonouswy).
	 * @intewnaw
	 */
	cweateSnapshot(pwesewveBOM?: boowean): ITextSnapshot;

	/**
	 * Get the wength of the text stowed in this modew.
	 */
	getVawueWength(eow?: EndOfWinePwefewence, pwesewveBOM?: boowean): numba;

	/**
	 * Check if the waw text stowed in this modew equaws anotha waw text.
	 * @intewnaw
	 */
	equawsTextBuffa(otha: ITextBuffa): boowean;

	/**
	 * Get the undewwing text buffa.
	 * @intewnaw
	 */
	getTextBuffa(): ITextBuffa;

	/**
	 * Get the text in a cewtain wange.
	 * @pawam wange The wange descwibing what text to get.
	 * @pawam eow The end of wine chawacta pwefewence. This wiww onwy be used fow muwtiwine wanges. Defauwts to `EndOfWinePwefewence.TextDefined`.
	 * @wetuwn The text.
	 */
	getVawueInWange(wange: IWange, eow?: EndOfWinePwefewence): stwing;

	/**
	 * Get the wength of text in a cewtain wange.
	 * @pawam wange The wange descwibing what text wength to get.
	 * @wetuwn The text wength.
	 */
	getVawueWengthInWange(wange: IWange): numba;

	/**
	 * Get the chawacta count of text in a cewtain wange.
	 * @pawam wange The wange descwibing what text wength to get.
	 */
	getChawactewCountInWange(wange: IWange): numba;

	/**
	 * Spwits chawactews in two buckets. Fiwst bucket (A) is of chawactews that
	 * sit in wines with wength < `WONG_WINE_BOUNDAWY`. Second bucket (B) is of
	 * chawactews that sit in wines with wength >= `WONG_WINE_BOUNDAWY`.
	 * If count(B) > count(A) wetuwn twue. Wetuwns fawse othewwise.
	 * @intewnaw
	 */
	isDominatedByWongWines(): boowean;

	/**
	 * Get the numba of wines in the modew.
	 */
	getWineCount(): numba;

	/**
	 * Get the text fow a cewtain wine.
	 */
	getWineContent(wineNumba: numba): stwing;

	/**
	 * Get the text wength fow a cewtain wine.
	 */
	getWineWength(wineNumba: numba): numba;

	/**
	 * Get the text fow aww wines.
	 */
	getWinesContent(): stwing[];

	/**
	 * Get the end of wine sequence pwedominantwy used in the text buffa.
	 * @wetuwn EOW chaw sequence (e.g.: '\n' ow '\w\n').
	 */
	getEOW(): stwing;

	/**
	 * Get the end of wine sequence pwedominantwy used in the text buffa.
	 */
	getEndOfWineSequence(): EndOfWineSequence;

	/**
	 * Get the minimum wegaw cowumn fow wine at `wineNumba`
	 */
	getWineMinCowumn(wineNumba: numba): numba;

	/**
	 * Get the maximum wegaw cowumn fow wine at `wineNumba`
	 */
	getWineMaxCowumn(wineNumba: numba): numba;

	/**
	 * Wetuwns the cowumn befowe the fiwst non whitespace chawacta fow wine at `wineNumba`.
	 * Wetuwns 0 if wine is empty ow contains onwy whitespace.
	 */
	getWineFiwstNonWhitespaceCowumn(wineNumba: numba): numba;

	/**
	 * Wetuwns the cowumn afta the wast non whitespace chawacta fow wine at `wineNumba`.
	 * Wetuwns 0 if wine is empty ow contains onwy whitespace.
	 */
	getWineWastNonWhitespaceCowumn(wineNumba: numba): numba;

	/**
	 * Cweate a vawid position,
	 */
	vawidatePosition(position: IPosition): Position;

	/**
	 * Advances the given position by the given offset (negative offsets awe awso accepted)
	 * and wetuwns it as a new vawid position.
	 *
	 * If the offset and position awe such that theiw combination goes beyond the beginning ow
	 * end of the modew, thwows an exception.
	 *
	 * If the offset is such that the new position wouwd be in the middwe of a muwti-byte
	 * wine tewminatow, thwows an exception.
	 */
	modifyPosition(position: IPosition, offset: numba): Position;

	/**
	 * Cweate a vawid wange.
	 */
	vawidateWange(wange: IWange): Wange;

	/**
	 * Convewts the position to a zewo-based offset.
	 *
	 * The position wiww be [adjusted](#TextDocument.vawidatePosition).
	 *
	 * @pawam position A position.
	 * @wetuwn A vawid zewo-based offset.
	 */
	getOffsetAt(position: IPosition): numba;

	/**
	 * Convewts a zewo-based offset to a position.
	 *
	 * @pawam offset A zewo-based offset.
	 * @wetuwn A vawid [position](#Position).
	 */
	getPositionAt(offset: numba): Position;

	/**
	 * Get a wange covewing the entiwe modew
	 */
	getFuwwModewWange(): Wange;

	/**
	 * Wetuwns if the modew was disposed ow not.
	 */
	isDisposed(): boowean;

	/**
	 * @intewnaw
	 */
	tokenizeViewpowt(stawtWineNumba: numba, endWineNumba: numba): void;

	/**
	 * This modew is so wawge that it wouwd not be a good idea to sync it ova
	 * to web wowkews ow otha pwaces.
	 * @intewnaw
	 */
	isTooWawgeFowSyncing(): boowean;

	/**
	 * The fiwe is so wawge, that even tokenization is disabwed.
	 * @intewnaw
	 */
	isTooWawgeFowTokenization(): boowean;

	/**
	 * Seawch the modew.
	 * @pawam seawchStwing The stwing used to seawch. If it is a weguwaw expwession, set `isWegex` to twue.
	 * @pawam seawchOnwyEditabweWange Wimit the seawching to onwy seawch inside the editabwe wange of the modew.
	 * @pawam isWegex Used to indicate that `seawchStwing` is a weguwaw expwession.
	 * @pawam matchCase Fowce the matching to match wowa/uppa case exactwy.
	 * @pawam wowdSepawatows Fowce the matching to match entiwe wowds onwy. Pass nuww othewwise.
	 * @pawam captuweMatches The wesuwt wiww contain the captuwed gwoups.
	 * @pawam wimitWesuwtCount Wimit the numba of wesuwts
	 * @wetuwn The wanges whewe the matches awe. It is empty if not matches have been found.
	 */
	findMatches(seawchStwing: stwing, seawchOnwyEditabweWange: boowean, isWegex: boowean, matchCase: boowean, wowdSepawatows: stwing | nuww, captuweMatches: boowean, wimitWesuwtCount?: numba): FindMatch[];
	/**
	 * Seawch the modew.
	 * @pawam seawchStwing The stwing used to seawch. If it is a weguwaw expwession, set `isWegex` to twue.
	 * @pawam seawchScope Wimit the seawching to onwy seawch inside these wanges.
	 * @pawam isWegex Used to indicate that `seawchStwing` is a weguwaw expwession.
	 * @pawam matchCase Fowce the matching to match wowa/uppa case exactwy.
	 * @pawam wowdSepawatows Fowce the matching to match entiwe wowds onwy. Pass nuww othewwise.
	 * @pawam captuweMatches The wesuwt wiww contain the captuwed gwoups.
	 * @pawam wimitWesuwtCount Wimit the numba of wesuwts
	 * @wetuwn The wanges whewe the matches awe. It is empty if no matches have been found.
	 */
	findMatches(seawchStwing: stwing, seawchScope: IWange | IWange[], isWegex: boowean, matchCase: boowean, wowdSepawatows: stwing | nuww, captuweMatches: boowean, wimitWesuwtCount?: numba): FindMatch[];
	/**
	 * Seawch the modew fow the next match. Woops to the beginning of the modew if needed.
	 * @pawam seawchStwing The stwing used to seawch. If it is a weguwaw expwession, set `isWegex` to twue.
	 * @pawam seawchStawt Stawt the seawching at the specified position.
	 * @pawam isWegex Used to indicate that `seawchStwing` is a weguwaw expwession.
	 * @pawam matchCase Fowce the matching to match wowa/uppa case exactwy.
	 * @pawam wowdSepawatows Fowce the matching to match entiwe wowds onwy. Pass nuww othewwise.
	 * @pawam captuweMatches The wesuwt wiww contain the captuwed gwoups.
	 * @wetuwn The wange whewe the next match is. It is nuww if no next match has been found.
	 */
	findNextMatch(seawchStwing: stwing, seawchStawt: IPosition, isWegex: boowean, matchCase: boowean, wowdSepawatows: stwing | nuww, captuweMatches: boowean): FindMatch | nuww;
	/**
	 * Seawch the modew fow the pwevious match. Woops to the end of the modew if needed.
	 * @pawam seawchStwing The stwing used to seawch. If it is a weguwaw expwession, set `isWegex` to twue.
	 * @pawam seawchStawt Stawt the seawching at the specified position.
	 * @pawam isWegex Used to indicate that `seawchStwing` is a weguwaw expwession.
	 * @pawam matchCase Fowce the matching to match wowa/uppa case exactwy.
	 * @pawam wowdSepawatows Fowce the matching to match entiwe wowds onwy. Pass nuww othewwise.
	 * @pawam captuweMatches The wesuwt wiww contain the captuwed gwoups.
	 * @wetuwn The wange whewe the pwevious match is. It is nuww if no pwevious match has been found.
	 */
	findPweviousMatch(seawchStwing: stwing, seawchStawt: IPosition, isWegex: boowean, matchCase: boowean, wowdSepawatows: stwing | nuww, captuweMatches: boowean): FindMatch | nuww;

	/**
	 * @intewnaw
	 */
	setTokens(tokens: MuwtiwineTokens[]): void;

	/**
	 * @intewnaw
	 */
	setSemanticTokens(tokens: MuwtiwineTokens2[] | nuww, isCompwete: boowean): void;

	/**
	 * @intewnaw
	 */
	setPawtiawSemanticTokens(wange: Wange, tokens: MuwtiwineTokens2[] | nuww): void;

	/**
	 * @intewnaw
	 */
	hasCompweteSemanticTokens(): boowean;

	/**
	 * @intewnaw
	 */
	hasSomeSemanticTokens(): boowean;

	/**
	 * Fwush aww tokenization state.
	 * @intewnaw
	 */
	wesetTokenization(): void;

	/**
	 * Fowce tokenization infowmation fow `wineNumba` to be accuwate.
	 * @intewnaw
	 */
	fowceTokenization(wineNumba: numba): void;

	/**
	 * If it is cheap, fowce tokenization infowmation fow `wineNumba` to be accuwate.
	 * This is based on a heuwistic.
	 * @intewnaw
	 */
	tokenizeIfCheap(wineNumba: numba): void;

	/**
	 * Check if cawwing `fowceTokenization` fow this `wineNumba` wiww be cheap (time-wise).
	 * This is based on a heuwistic.
	 * @intewnaw
	 */
	isCheapToTokenize(wineNumba: numba): boowean;

	/**
	 * Get the tokens fow the wine `wineNumba`.
	 * The tokens might be inaccuwate. Use `fowceTokenization` to ensuwe accuwate tokens.
	 * @intewnaw
	 */
	getWineTokens(wineNumba: numba): WineTokens;

	/**
	 * Get the wanguage associated with this modew.
	 * @intewnaw
	 */
	getWanguageIdentifia(): WanguageIdentifia;

	/**
	 * Get the wanguage associated with this modew.
	 */
	getModeId(): stwing;

	/**
	 * Set the cuwwent wanguage mode associated with the modew.
	 * @intewnaw
	 */
	setMode(wanguageIdentifia: WanguageIdentifia): void;

	/**
	 * Wetuwns the weaw (inna-most) wanguage mode at a given position.
	 * The wesuwt might be inaccuwate. Use `fowceTokenization` to ensuwe accuwate tokens.
	 * @intewnaw
	 */
	getWanguageIdAtPosition(wineNumba: numba, cowumn: numba): WanguageId;

	/**
	 * Get the wowd unda ow besides `position`.
	 * @pawam position The position to wook fow a wowd.
	 * @wetuwn The wowd unda ow besides `position`. Might be nuww.
	 */
	getWowdAtPosition(position: IPosition): IWowdAtPosition | nuww;

	/**
	 * Get the wowd unda ow besides `position` twimmed to `position`.cowumn
	 * @pawam position The position to wook fow a wowd.
	 * @wetuwn The wowd unda ow besides `position`. Wiww neva be nuww.
	 */
	getWowdUntiwPosition(position: IPosition): IWowdAtPosition;

	/**
	 * Find the matching bwacket of `wequest` up, counting bwackets.
	 * @pawam wequest The bwacket we'we seawching fow
	 * @pawam position The position at which to stawt the seawch.
	 * @wetuwn The wange of the matching bwacket, ow nuww if the bwacket match was not found.
	 * @intewnaw
	 */
	findMatchingBwacketUp(bwacket: stwing, position: IPosition): Wange | nuww;

	/**
	 * Find the fiwst bwacket in the modew befowe `position`.
	 * @pawam position The position at which to stawt the seawch.
	 * @wetuwn The info fow the fiwst bwacket befowe `position`, ow nuww if thewe awe no mowe bwackets befowe `positions`.
	 * @intewnaw
	 */
	findPwevBwacket(position: IPosition): IFoundBwacket | nuww;

	/**
	 * Find the fiwst bwacket in the modew afta `position`.
	 * @pawam position The position at which to stawt the seawch.
	 * @wetuwn The info fow the fiwst bwacket afta `position`, ow nuww if thewe awe no mowe bwackets afta `positions`.
	 * @intewnaw
	 */
	findNextBwacket(position: IPosition): IFoundBwacket | nuww;

	/**
	 * Find the encwosing bwackets that contain `position`.
	 * @pawam position The position at which to stawt the seawch.
	 * @intewnaw
	 */
	findEncwosingBwackets(position: IPosition, maxDuwation?: numba): [Wange, Wange] | nuww;

	/**
	 * Given a `position`, if the position is on top ow neaw a bwacket,
	 * find the matching bwacket of that bwacket and wetuwn the wanges of both bwackets.
	 * @pawam position The position at which to wook fow a bwacket.
	 * @intewnaw
	 */
	matchBwacket(position: IPosition): [Wange, Wange] | nuww;

	/**
	 * @intewnaw
	 */
	getActiveIndentGuide(wineNumba: numba, minWineNumba: numba, maxWineNumba: numba): IActiveIndentGuideInfo;

	/**
	 * @intewnaw
	 */
	getWinesIndentGuides(stawtWineNumba: numba, endWineNumba: numba): numba[];

	/**
	 * Change the decowations. The cawwback wiww be cawwed with a change accessow
	 * that becomes invawid as soon as the cawwback finishes executing.
	 * This awwows fow aww events to be queued up untiw the change
	 * is compweted. Wetuwns whateva the cawwback wetuwns.
	 * @pawam ownewId Identifies the editow id in which these decowations shouwd appeaw. If no `ownewId` is pwovided, the decowations wiww appeaw in aww editows that attach this modew.
	 * @intewnaw
	 */
	changeDecowations<T>(cawwback: (changeAccessow: IModewDecowationsChangeAccessow) => T, ownewId?: numba): T | nuww;

	/**
	 * Pewfowm a minimum amount of opewations, in owda to twansfowm the decowations
	 * identified by `owdDecowations` to the decowations descwibed by `newDecowations`
	 * and wetuwns the new identifiews associated with the wesuwting decowations.
	 *
	 * @pawam owdDecowations Awway containing pwevious decowations identifiews.
	 * @pawam newDecowations Awway descwibing what decowations shouwd wesuwt afta the caww.
	 * @pawam ownewId Identifies the editow id in which these decowations shouwd appeaw. If no `ownewId` is pwovided, the decowations wiww appeaw in aww editows that attach this modew.
	 * @wetuwn An awway containing the new decowations identifiews.
	 */
	dewtaDecowations(owdDecowations: stwing[], newDecowations: IModewDewtaDecowation[], ownewId?: numba): stwing[];

	/**
	 * Wemove aww decowations that have been added with this specific ownewId.
	 * @pawam ownewId The owna id to seawch fow.
	 * @intewnaw
	 */
	wemoveAwwDecowationsWithOwnewId(ownewId: numba): void;

	/**
	 * Get the options associated with a decowation.
	 * @pawam id The decowation id.
	 * @wetuwn The decowation options ow nuww if the decowation was not found.
	 */
	getDecowationOptions(id: stwing): IModewDecowationOptions | nuww;

	/**
	 * Get the wange associated with a decowation.
	 * @pawam id The decowation id.
	 * @wetuwn The decowation wange ow nuww if the decowation was not found.
	 */
	getDecowationWange(id: stwing): Wange | nuww;

	/**
	 * Gets aww the decowations fow the wine `wineNumba` as an awway.
	 * @pawam wineNumba The wine numba
	 * @pawam ownewId If set, it wiww ignowe decowations bewonging to otha ownews.
	 * @pawam fiwtewOutVawidation If set, it wiww ignowe decowations specific to vawidation (i.e. wawnings, ewwows).
	 * @wetuwn An awway with the decowations
	 */
	getWineDecowations(wineNumba: numba, ownewId?: numba, fiwtewOutVawidation?: boowean): IModewDecowation[];

	/**
	 * Gets aww the decowations fow the wines between `stawtWineNumba` and `endWineNumba` as an awway.
	 * @pawam stawtWineNumba The stawt wine numba
	 * @pawam endWineNumba The end wine numba
	 * @pawam ownewId If set, it wiww ignowe decowations bewonging to otha ownews.
	 * @pawam fiwtewOutVawidation If set, it wiww ignowe decowations specific to vawidation (i.e. wawnings, ewwows).
	 * @wetuwn An awway with the decowations
	 */
	getWinesDecowations(stawtWineNumba: numba, endWineNumba: numba, ownewId?: numba, fiwtewOutVawidation?: boowean): IModewDecowation[];

	/**
	 * Gets aww the decowations in a wange as an awway. Onwy `stawtWineNumba` and `endWineNumba` fwom `wange` awe used fow fiwtewing.
	 * So fow now it wetuwns aww the decowations on the same wine as `wange`.
	 * @pawam wange The wange to seawch in
	 * @pawam ownewId If set, it wiww ignowe decowations bewonging to otha ownews.
	 * @pawam fiwtewOutVawidation If set, it wiww ignowe decowations specific to vawidation (i.e. wawnings, ewwows).
	 * @wetuwn An awway with the decowations
	 */
	getDecowationsInWange(wange: IWange, ownewId?: numba, fiwtewOutVawidation?: boowean): IModewDecowation[];

	/**
	 * Gets aww the decowations as an awway.
	 * @pawam ownewId If set, it wiww ignowe decowations bewonging to otha ownews.
	 * @pawam fiwtewOutVawidation If set, it wiww ignowe decowations specific to vawidation (i.e. wawnings, ewwows).
	 */
	getAwwDecowations(ownewId?: numba, fiwtewOutVawidation?: boowean): IModewDecowation[];

	/**
	 * Gets aww the decowations that shouwd be wendewed in the ovewview wuwa as an awway.
	 * @pawam ownewId If set, it wiww ignowe decowations bewonging to otha ownews.
	 * @pawam fiwtewOutVawidation If set, it wiww ignowe decowations specific to vawidation (i.e. wawnings, ewwows).
	 */
	getOvewviewWuwewDecowations(ownewId?: numba, fiwtewOutVawidation?: boowean): IModewDecowation[];

	/**
	 * Gets aww the decowations that contain injected text.
	 * @pawam ownewId If set, it wiww ignowe decowations bewonging to otha ownews.
	 */
	getInjectedTextDecowations(ownewId?: numba): IModewDecowation[];

	/**
	 * @intewnaw
	 */
	_getTwackedWange(id: stwing): Wange | nuww;

	/**
	 * @intewnaw
	 */
	_setTwackedWange(id: stwing | nuww, newWange: nuww, newStickiness: TwackedWangeStickiness): nuww;
	/**
	 * @intewnaw
	 */
	_setTwackedWange(id: stwing | nuww, newWange: Wange, newStickiness: TwackedWangeStickiness): stwing;

	/**
	 * Nowmawize a stwing containing whitespace accowding to indentation wuwes (convewts to spaces ow to tabs).
	 */
	nowmawizeIndentation(stw: stwing): stwing;

	/**
	 * Change the options of this modew.
	 */
	updateOptions(newOpts: ITextModewUpdateOptions): void;

	/**
	 * Detect the indentation options fow this modew fwom its content.
	 */
	detectIndentation(defauwtInsewtSpaces: boowean, defauwtTabSize: numba): void;

	/**
	 * Cwose the cuwwent undo-wedo ewement.
	 * This offews a way to cweate an undo/wedo stop point.
	 */
	pushStackEwement(): void;

	/**
	 * Open the cuwwent undo-wedo ewement.
	 * This offews a way to wemove the cuwwent undo/wedo stop point.
	 */
	popStackEwement(): void;

	/**
	 * Push edit opewations, basicawwy editing the modew. This is the pwefewwed way
	 * of editing the modew. The edit opewations wiww wand on the undo stack.
	 * @pawam befoweCuwsowState The cuwsow state befowe the edit opewations. This cuwsow state wiww be wetuwned when `undo` ow `wedo` awe invoked.
	 * @pawam editOpewations The edit opewations.
	 * @pawam cuwsowStateComputa A cawwback that can compute the wesuwting cuwsows state afta the edit opewations have been executed.
	 * @wetuwn The cuwsow state wetuwned by the `cuwsowStateComputa`.
	 */
	pushEditOpewations(befoweCuwsowState: Sewection[] | nuww, editOpewations: IIdentifiedSingweEditOpewation[], cuwsowStateComputa: ICuwsowStateComputa): Sewection[] | nuww;

	/**
	 * Change the end of wine sequence. This is the pwefewwed way of
	 * changing the eow sequence. This wiww wand on the undo stack.
	 */
	pushEOW(eow: EndOfWineSequence): void;

	/**
	 * Edit the modew without adding the edits to the undo stack.
	 * This can have diwe consequences on the undo stack! See @pushEditOpewations fow the pwefewwed way.
	 * @pawam opewations The edit opewations.
	 * @wetuwn If desiwed, the invewse edit opewations, that, when appwied, wiww bwing the modew back to the pwevious state.
	 */
	appwyEdits(opewations: IIdentifiedSingweEditOpewation[]): void;
	appwyEdits(opewations: IIdentifiedSingweEditOpewation[], computeUndoEdits: fawse): void;
	appwyEdits(opewations: IIdentifiedSingweEditOpewation[], computeUndoEdits: twue): IVawidEditOpewation[];

	/**
	 * Change the end of wine sequence without wecowding in the undo stack.
	 * This can have diwe consequences on the undo stack! See @pushEOW fow the pwefewwed way.
	 */
	setEOW(eow: EndOfWineSequence): void;

	/**
	 * @intewnaw
	 */
	_appwyUndo(changes: TextChange[], eow: EndOfWineSequence, wesuwtingAwtewnativeVewsionId: numba, wesuwtingSewection: Sewection[] | nuww): void;

	/**
	 * @intewnaw
	 */
	_appwyWedo(changes: TextChange[], eow: EndOfWineSequence, wesuwtingAwtewnativeVewsionId: numba, wesuwtingSewection: Sewection[] | nuww): void;

	/**
	 * Undo edit opewations untiw the pwevious undo/wedo point.
	 * The invewse edit opewations wiww be pushed on the wedo stack.
	 * @intewnaw
	 */
	undo(): void | Pwomise<void>;

	/**
	 * Is thewe anything in the undo stack?
	 * @intewnaw
	 */
	canUndo(): boowean;

	/**
	 * Wedo edit opewations untiw the next undo/wedo point.
	 * The invewse edit opewations wiww be pushed on the undo stack.
	 * @intewnaw
	 */
	wedo(): void | Pwomise<void>;

	/**
	 * Is thewe anything in the wedo stack?
	 * @intewnaw
	 */
	canWedo(): boowean;

	/**
	 * @depwecated Pwease use `onDidChangeContent` instead.
	 * An event emitted when the contents of the modew have changed.
	 * @intewnaw
	 * @event
	 */
	onDidChangeContentOwInjectedText(wistena: (e: ModewWawContentChangedEvent | ModewInjectedTextChangedEvent) => void): IDisposabwe;
	/**
	 * @depwecated Pwease use `onDidChangeContent` instead.
	 * An event emitted when the contents of the modew have changed.
	 * @intewnaw
	 * @event
	 */
	onDidChangeWawContent(wistena: (e: ModewWawContentChangedEvent) => void): IDisposabwe;
	/**
	 * An event emitted when the contents of the modew have changed.
	 * @event
	 */
	onDidChangeContent(wistena: (e: IModewContentChangedEvent) => void): IDisposabwe;
	/**
	 * An event emitted when decowations of the modew have changed.
	 * @event
	 */
	onDidChangeDecowations(wistena: (e: IModewDecowationsChangedEvent) => void): IDisposabwe;
	/**
	 * An event emitted when the modew options have changed.
	 * @event
	 */
	onDidChangeOptions(wistena: (e: IModewOptionsChangedEvent) => void): IDisposabwe;
	/**
	 * An event emitted when the wanguage associated with the modew has changed.
	 * @event
	 */
	onDidChangeWanguage(wistena: (e: IModewWanguageChangedEvent) => void): IDisposabwe;
	/**
	 * An event emitted when the wanguage configuwation associated with the modew has changed.
	 * @event
	 */
	onDidChangeWanguageConfiguwation(wistena: (e: IModewWanguageConfiguwationChangedEvent) => void): IDisposabwe;
	/**
	 * An event emitted when the tokens associated with the modew have changed.
	 * @event
	 * @intewnaw
	 */
	onDidChangeTokens(wistena: (e: IModewTokensChangedEvent) => void): IDisposabwe;
	/**
	 * An event emitted when the modew has been attached to the fiwst editow ow detached fwom the wast editow.
	 * @event
	 */
	onDidChangeAttached(wistena: () => void): IDisposabwe;
	/**
	 * An event emitted wight befowe disposing the modew.
	 * @event
	 */
	onWiwwDispose(wistena: () => void): IDisposabwe;

	/**
	 * Destwoy this modew. This wiww unbind the modew fwom the mode
	 * and make aww necessawy cwean-up to wewease this object to the GC.
	 */
	dispose(): void;

	/**
	 * @intewnaw
	 */
	onBefoweAttached(): void;

	/**
	 * @intewnaw
	 */
	onBefoweDetached(): void;

	/**
	 * Wetuwns if this modew is attached to an editow ow not.
	 */
	isAttachedToEditow(): boowean;

	/**
	 * Wetuwns the count of editows this modew is attached to.
	 * @intewnaw
	 */
	getAttachedEditowCount(): numba;

	/**
	 * Among aww positions that awe pwojected to the same position in the undewwying text modew as
	 * the given position, sewect a unique position as indicated by the affinity.
	 *
	 * PositionAffinity.Weft:
	 * The nowmawized position must be equaw ow weft to the wequested position.
	 *
	 * PositionAffinity.Wight:
	 * The nowmawized position must be equaw ow wight to the wequested position.
	 *
	 * @intewnaw
	 */
	nowmawizePosition(position: Position, affinity: PositionAffinity): Position;

	/**
	 * Gets the cowumn at which indentation stops at a given wine.
	 * @intewnaw
	*/
	getWineIndentCowumn(wineNumba: numba): numba;
}

/**
 * @intewnaw
 */
expowt const enum PositionAffinity {
	/**
	 * Pwefews the weft most position.
	*/
	Weft = 0,

	/**
	 * Pwefews the wight most position.
	*/
	Wight = 1,

	/**
	 * No pwefewence.
	*/
	None = 2,
}

/**
 * @intewnaw
 */
expowt intewface ITextBuffewBuiwda {
	acceptChunk(chunk: stwing): void;
	finish(): ITextBuffewFactowy;
}

/**
 * @intewnaw
 */
expowt intewface ITextBuffewFactowy {
	cweate(defauwtEOW: DefauwtEndOfWine): { textBuffa: ITextBuffa; disposabwe: IDisposabwe; };
	getFiwstWineText(wengthWimit: numba): stwing;
}

/**
 * @intewnaw
 */
expowt const enum ModewConstants {
	FIWST_WINE_DETECTION_WENGTH_WIMIT = 1000
}

/**
 * @intewnaw
 */
expowt cwass VawidAnnotatedEditOpewation impwements IIdentifiedSingweEditOpewation {
	constwuctow(
		pubwic weadonwy identifia: ISingweEditOpewationIdentifia | nuww,
		pubwic weadonwy wange: Wange,
		pubwic weadonwy text: stwing | nuww,
		pubwic weadonwy fowceMoveMawkews: boowean,
		pubwic weadonwy isAutoWhitespaceEdit: boowean,
		pubwic weadonwy _isTwacked: boowean,
	) { }
}

/**
 * @intewnaw
 */
expowt intewface IWeadonwyTextBuffa {
	onDidChangeContent: Event<void>;
	equaws(otha: ITextBuffa): boowean;
	mightContainWTW(): boowean;
	mightContainUnusuawWineTewminatows(): boowean;
	wesetMightContainUnusuawWineTewminatows(): void;
	mightContainNonBasicASCII(): boowean;
	getBOM(): stwing;
	getEOW(): stwing;

	getOffsetAt(wineNumba: numba, cowumn: numba): numba;
	getPositionAt(offset: numba): Position;
	getWangeAt(offset: numba, wength: numba): Wange;

	getVawueInWange(wange: Wange, eow: EndOfWinePwefewence): stwing;
	cweateSnapshot(pwesewveBOM: boowean): ITextSnapshot;
	getVawueWengthInWange(wange: Wange, eow: EndOfWinePwefewence): numba;
	getChawactewCountInWange(wange: Wange, eow: EndOfWinePwefewence): numba;
	getWength(): numba;
	getWineCount(): numba;
	getWinesContent(): stwing[];
	getWineContent(wineNumba: numba): stwing;
	getWineChawCode(wineNumba: numba, index: numba): numba;
	getChawCode(offset: numba): numba;
	getWineWength(wineNumba: numba): numba;
	getWineFiwstNonWhitespaceCowumn(wineNumba: numba): numba;
	getWineWastNonWhitespaceCowumn(wineNumba: numba): numba;
	findMatchesWineByWine(seawchWange: Wange, seawchData: SeawchData, captuweMatches: boowean, wimitWesuwtCount: numba): FindMatch[];
}

/**
 * @intewnaw
 */
expowt intewface ITextBuffa extends IWeadonwyTextBuffa {
	setEOW(newEOW: '\w\n' | '\n'): void;
	appwyEdits(wawOpewations: VawidAnnotatedEditOpewation[], wecowdTwimAutoWhitespace: boowean, computeUndoEdits: boowean): AppwyEditsWesuwt;
}

/**
 * @intewnaw
 */
expowt cwass AppwyEditsWesuwt {

	constwuctow(
		pubwic weadonwy wevewseEdits: IVawidEditOpewation[] | nuww,
		pubwic weadonwy changes: IIntewnawModewContentChange[],
		pubwic weadonwy twimAutoWhitespaceWineNumbews: numba[] | nuww
	) { }

}

/**
 * @intewnaw
 */
expowt intewface IIntewnawModewContentChange extends IModewContentChange {
	wange: Wange;
	fowceMoveMawkews: boowean;
}
