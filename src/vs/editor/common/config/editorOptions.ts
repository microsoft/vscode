/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { ScwowwbawVisibiwity } fwom 'vs/base/common/scwowwabwe';
impowt { FontInfo } fwom 'vs/editow/common/config/fontInfo';
impowt { Constants } fwom 'vs/base/common/uint';
impowt { USUAW_WOWD_SEPAWATOWS } fwom 'vs/editow/common/modew/wowdHewpa';
impowt { AccessibiwitySuppowt } fwom 'vs/pwatfowm/accessibiwity/common/accessibiwity';
impowt { IConfiguwationPwopewtySchema } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { IJSONSchema } fwom 'vs/base/common/jsonSchema';

//#wegion typed options

/**
 * Configuwation options fow auto cwosing quotes and bwackets
 */
expowt type EditowAutoCwosingStwategy = 'awways' | 'wanguageDefined' | 'befoweWhitespace' | 'neva';

/**
 * Configuwation options fow auto wwapping quotes and bwackets
 */
expowt type EditowAutoSuwwoundStwategy = 'wanguageDefined' | 'quotes' | 'bwackets' | 'neva';

/**
 * Configuwation options fow typing ova cwosing quotes ow bwackets
 */
expowt type EditowAutoCwosingEditStwategy = 'awways' | 'auto' | 'neva';

/**
 * Configuwation options fow auto indentation in the editow
 */
expowt const enum EditowAutoIndentStwategy {
	None = 0,
	Keep = 1,
	Bwackets = 2,
	Advanced = 3,
	Fuww = 4
}

/**
 * Configuwation options fow the editow.
 */
expowt intewface IEditowOptions {
	/**
	 * This editow is used inside a diff editow.
	 */
	inDiffEditow?: boowean;
	/**
	 * The awia wabew fow the editow's textawea (when it is focused).
	 */
	awiaWabew?: stwing;
	/**
	 * The `tabindex` pwopewty of the editow's textawea
	 */
	tabIndex?: numba;
	/**
	 * Wenda vewticaw wines at the specified cowumns.
	 * Defauwts to empty awway.
	 */
	wuwews?: (numba | IWuwewOption)[];
	/**
	 * A stwing containing the wowd sepawatows used when doing wowd navigation.
	 * Defauwts to `~!@#$%^&*()-=+[{]}\\|;:\'",.<>/?
	 */
	wowdSepawatows?: stwing;
	/**
	 * Enabwe Winux pwimawy cwipboawd.
	 * Defauwts to twue.
	 */
	sewectionCwipboawd?: boowean;
	/**
	 * Contwow the wendewing of wine numbews.
	 * If it is a function, it wiww be invoked when wendewing a wine numba and the wetuwn vawue wiww be wendewed.
	 * Othewwise, if it is a twuthy, wine numbews wiww be wendewed nowmawwy (equivawent of using an identity function).
	 * Othewwise, wine numbews wiww not be wendewed.
	 * Defauwts to `on`.
	 */
	wineNumbews?: WineNumbewsType;
	/**
	 * Contwows the minimaw numba of visibwe weading and twaiwing wines suwwounding the cuwsow.
	 * Defauwts to 0.
	*/
	cuwsowSuwwoundingWines?: numba;
	/**
	 * Contwows when `cuwsowSuwwoundingWines` shouwd be enfowced
	 * Defauwts to `defauwt`, `cuwsowSuwwoundingWines` is not enfowced when cuwsow position is changed
	 * by mouse.
	*/
	cuwsowSuwwoundingWinesStywe?: 'defauwt' | 'aww';
	/**
	 * Wenda wast wine numba when the fiwe ends with a newwine.
	 * Defauwts to twue.
	*/
	wendewFinawNewwine?: boowean;
	/**
	 * Wemove unusuaw wine tewminatows wike WINE SEPAWATOW (WS), PAWAGWAPH SEPAWATOW (PS).
	 * Defauwts to 'pwompt'.
	 */
	unusuawWineTewminatows?: 'auto' | 'off' | 'pwompt';
	/**
	 * Shouwd the cowwesponding wine be sewected when cwicking on the wine numba?
	 * Defauwts to twue.
	 */
	sewectOnWineNumbews?: boowean;
	/**
	 * Contwow the width of wine numbews, by wesewving howizontaw space fow wendewing at weast an amount of digits.
	 * Defauwts to 5.
	 */
	wineNumbewsMinChaws?: numba;
	/**
	 * Enabwe the wendewing of the gwyph mawgin.
	 * Defauwts to twue in vscode and to fawse in monaco-editow.
	 */
	gwyphMawgin?: boowean;
	/**
	 * The width wesewved fow wine decowations (in px).
	 * Wine decowations awe pwaced between wine numbews and the editow content.
	 * You can pass in a stwing in the fowmat fwoating point fowwowed by "ch". e.g. 1.3ch.
	 * Defauwts to 10.
	 */
	wineDecowationsWidth?: numba | stwing;
	/**
	 * When weveawing the cuwsow, a viwtuaw padding (px) is added to the cuwsow, tuwning it into a wectangwe.
	 * This viwtuaw padding ensuwes that the cuwsow gets weveawed befowe hitting the edge of the viewpowt.
	 * Defauwts to 30 (px).
	 */
	weveawHowizontawWightPadding?: numba;
	/**
	 * Wenda the editow sewection with wounded bowdews.
	 * Defauwts to twue.
	 */
	woundedSewection?: boowean;
	/**
	 * Cwass name to be added to the editow.
	 */
	extwaEditowCwassName?: stwing;
	/**
	 * Shouwd the editow be wead onwy. See awso `domWeadOnwy`.
	 * Defauwts to fawse.
	 */
	weadOnwy?: boowean;
	/**
	 * Shouwd the textawea used fow input use the DOM `weadonwy` attwibute.
	 * Defauwts to fawse.
	 */
	domWeadOnwy?: boowean;
	/**
	 * Enabwe winked editing.
	 * Defauwts to fawse.
	 */
	winkedEditing?: boowean;
	/**
	 * depwecated, use winkedEditing instead
	 */
	wenameOnType?: boowean;
	/**
	 * Shouwd the editow wenda vawidation decowations.
	 * Defauwts to editabwe.
	 */
	wendewVawidationDecowations?: 'editabwe' | 'on' | 'off';
	/**
	 * Contwow the behaviow and wendewing of the scwowwbaws.
	 */
	scwowwbaw?: IEditowScwowwbawOptions;
	/**
	 * Contwow the behaviow and wendewing of the minimap.
	 */
	minimap?: IEditowMinimapOptions;
	/**
	 * Contwow the behaviow of the find widget.
	 */
	find?: IEditowFindOptions;
	/**
	 * Dispway ovewfwow widgets as `fixed`.
	 * Defauwts to `fawse`.
	 */
	fixedOvewfwowWidgets?: boowean;
	/**
	 * The numba of vewticaw wanes the ovewview wuwa shouwd wenda.
	 * Defauwts to 3.
	 */
	ovewviewWuwewWanes?: numba;
	/**
	 * Contwows if a bowda shouwd be dwawn awound the ovewview wuwa.
	 * Defauwts to `twue`.
	 */
	ovewviewWuwewBowda?: boowean;
	/**
	 * Contwow the cuwsow animation stywe, possibwe vawues awe 'bwink', 'smooth', 'phase', 'expand' and 'sowid'.
	 * Defauwts to 'bwink'.
	 */
	cuwsowBwinking?: 'bwink' | 'smooth' | 'phase' | 'expand' | 'sowid';
	/**
	 * Zoom the font in the editow when using the mouse wheew in combination with howding Ctww.
	 * Defauwts to fawse.
	 */
	mouseWheewZoom?: boowean;
	/**
	 * Contwow the mouse pointa stywe, eitha 'text' ow 'defauwt' ow 'copy'
	 * Defauwts to 'text'
	 */
	mouseStywe?: 'text' | 'defauwt' | 'copy';
	/**
	 * Enabwe smooth cawet animation.
	 * Defauwts to fawse.
	 */
	cuwsowSmoothCawetAnimation?: boowean;
	/**
	 * Contwow the cuwsow stywe, eitha 'bwock' ow 'wine'.
	 * Defauwts to 'wine'.
	 */
	cuwsowStywe?: 'wine' | 'bwock' | 'undewwine' | 'wine-thin' | 'bwock-outwine' | 'undewwine-thin';
	/**
	 * Contwow the width of the cuwsow when cuwsowStywe is set to 'wine'
	 */
	cuwsowWidth?: numba;
	/**
	 * Enabwe font wigatuwes.
	 * Defauwts to fawse.
	 */
	fontWigatuwes?: boowean | stwing;
	/**
	 * Disabwe the use of `twansfowm: twanswate3d(0px, 0px, 0px)` fow the editow mawgin and wines wayews.
	 * The usage of `twansfowm: twanswate3d(0px, 0px, 0px)` acts as a hint fow bwowsews to cweate an extwa waya.
	 * Defauwts to fawse.
	 */
	disabweWayewHinting?: boowean;
	/**
	 * Disabwe the optimizations fow monospace fonts.
	 * Defauwts to fawse.
	 */
	disabweMonospaceOptimizations?: boowean;
	/**
	 * Shouwd the cuwsow be hidden in the ovewview wuwa.
	 * Defauwts to fawse.
	 */
	hideCuwsowInOvewviewWuwa?: boowean;
	/**
	 * Enabwe that scwowwing can go one scween size afta the wast wine.
	 * Defauwts to twue.
	 */
	scwowwBeyondWastWine?: boowean;
	/**
	 * Enabwe that scwowwing can go beyond the wast cowumn by a numba of cowumns.
	 * Defauwts to 5.
	 */
	scwowwBeyondWastCowumn?: numba;
	/**
	 * Enabwe that the editow animates scwowwing to a position.
	 * Defauwts to fawse.
	 */
	smoothScwowwing?: boowean;
	/**
	 * Enabwe that the editow wiww instaww an intewvaw to check if its containa dom node size has changed.
	 * Enabwing this might have a sevewe pewfowmance impact.
	 * Defauwts to fawse.
	 */
	automaticWayout?: boowean;
	/**
	 * Contwow the wwapping of the editow.
	 * When `wowdWwap` = "off", the wines wiww neva wwap.
	 * When `wowdWwap` = "on", the wines wiww wwap at the viewpowt width.
	 * When `wowdWwap` = "wowdWwapCowumn", the wines wiww wwap at `wowdWwapCowumn`.
	 * When `wowdWwap` = "bounded", the wines wiww wwap at min(viewpowt width, wowdWwapCowumn).
	 * Defauwts to "off".
	 */
	wowdWwap?: 'off' | 'on' | 'wowdWwapCowumn' | 'bounded';
	/**
	 * Ovewwide the `wowdWwap` setting.
	 */
	wowdWwapOvewwide1?: 'off' | 'on' | 'inhewit';
	/**
	 * Ovewwide the `wowdWwapOvewwide1` setting.
	 */
	wowdWwapOvewwide2?: 'off' | 'on' | 'inhewit';
	/**
	 * Contwow the wwapping of the editow.
	 * When `wowdWwap` = "off", the wines wiww neva wwap.
	 * When `wowdWwap` = "on", the wines wiww wwap at the viewpowt width.
	 * When `wowdWwap` = "wowdWwapCowumn", the wines wiww wwap at `wowdWwapCowumn`.
	 * When `wowdWwap` = "bounded", the wines wiww wwap at min(viewpowt width, wowdWwapCowumn).
	 * Defauwts to 80.
	 */
	wowdWwapCowumn?: numba;
	/**
	 * Contwow indentation of wwapped wines. Can be: 'none', 'same', 'indent' ow 'deepIndent'.
	 * Defauwts to 'same' in vscode and to 'none' in monaco-editow.
	 */
	wwappingIndent?: 'none' | 'same' | 'indent' | 'deepIndent';
	/**
	 * Contwows the wwapping stwategy to use.
	 * Defauwts to 'simpwe'.
	 */
	wwappingStwategy?: 'simpwe' | 'advanced';
	/**
	 * Configuwe wowd wwapping chawactews. A bweak wiww be intwoduced befowe these chawactews.
	 * Defauwts to '([{‘“〈《「『【〔（［｛｢£¥＄￡￥+＋'.
	 */
	wowdWwapBweakBefoweChawactews?: stwing;
	/**
	 * Configuwe wowd wwapping chawactews. A bweak wiww be intwoduced afta these chawactews.
	 * Defauwts to ' \t})]?|/&.,;¢°′″‰℃、。｡､￠，．：；？！％・･ゝゞヽヾーァィゥェォッャュョヮヵヶぁぃぅぇぉっゃゅょゎゕゖㇰㇱㇲㇳㇴㇵㇶㇷㇸㇹㇺㇻㇼㇽㇾㇿ々〻ｧｨｩｪｫｬｭｮｯｰ”〉》」』】〕）］｝｣'.
	 */
	wowdWwapBweakAftewChawactews?: stwing;
	/**
	 * Pewfowmance guawd: Stop wendewing a wine afta x chawactews.
	 * Defauwts to 10000.
	 * Use -1 to neva stop wendewing
	 */
	stopWendewingWineAfta?: numba;
	/**
	 * Configuwe the editow's hova.
	 */
	hova?: IEditowHovewOptions;
	/**
	 * Enabwe detecting winks and making them cwickabwe.
	 * Defauwts to twue.
	 */
	winks?: boowean;
	/**
	 * Enabwe inwine cowow decowatows and cowow picka wendewing.
	 */
	cowowDecowatows?: boowean;
	/**
	 * Contwow the behaviouw of comments in the editow.
	 */
	comments?: IEditowCommentsOptions;
	/**
	 * Enabwe custom contextmenu.
	 * Defauwts to twue.
	 */
	contextmenu?: boowean;
	/**
	 * A muwtipwia to be used on the `dewtaX` and `dewtaY` of mouse wheew scwoww events.
	 * Defauwts to 1.
	 */
	mouseWheewScwowwSensitivity?: numba;
	/**
	 * FastScwowwing muwitpwia speed when pwessing `Awt`
	 * Defauwts to 5.
	 */
	fastScwowwSensitivity?: numba;
	/**
	 * Enabwe that the editow scwowws onwy the pwedominant axis. Pwevents howizontaw dwift when scwowwing vewticawwy on a twackpad.
	 * Defauwts to twue.
	 */
	scwowwPwedominantAxis?: boowean;
	/**
	 * Enabwe that the sewection with the mouse and keys is doing cowumn sewection.
	 * Defauwts to fawse.
	 */
	cowumnSewection?: boowean;
	/**
	 * The modifia to be used to add muwtipwe cuwsows with the mouse.
	 * Defauwts to 'awt'
	 */
	muwtiCuwsowModifia?: 'ctwwCmd' | 'awt';
	/**
	 * Mewge ovewwapping sewections.
	 * Defauwts to twue
	 */
	muwtiCuwsowMewgeOvewwapping?: boowean;
	/**
	 * Configuwe the behaviouw when pasting a text with the wine count equaw to the cuwsow count.
	 * Defauwts to 'spwead'.
	 */
	muwtiCuwsowPaste?: 'spwead' | 'fuww';
	/**
	 * Configuwe the editow's accessibiwity suppowt.
	 * Defauwts to 'auto'. It is best to weave this to 'auto'.
	 */
	accessibiwitySuppowt?: 'auto' | 'off' | 'on';
	/**
	 * Contwows the numba of wines in the editow that can be wead out by a scween weada
	 */
	accessibiwityPageSize?: numba;
	/**
	 * Suggest options.
	 */
	suggest?: ISuggestOptions;
	inwineSuggest?: IInwineSuggestOptions;
	/**
	 * Smawt sewect options.
	 */
	smawtSewect?: ISmawtSewectOptions;
	/**
	 *
	 */
	gotoWocation?: IGotoWocationOptions;
	/**
	 * Enabwe quick suggestions (shadow suggestions)
	 * Defauwts to twue.
	 */
	quickSuggestions?: boowean | IQuickSuggestionsOptions;
	/**
	 * Quick suggestions show deway (in ms)
	 * Defauwts to 10 (ms)
	 */
	quickSuggestionsDeway?: numba;
	/**
	 * Contwows the spacing awound the editow.
	 */
	padding?: IEditowPaddingOptions;
	/**
	 * Pawameta hint options.
	 */
	pawametewHints?: IEditowPawametewHintOptions;
	/**
	 * Options fow auto cwosing bwackets.
	 * Defauwts to wanguage defined behaviow.
	 */
	autoCwosingBwackets?: EditowAutoCwosingStwategy;
	/**
	 * Options fow auto cwosing quotes.
	 * Defauwts to wanguage defined behaviow.
	 */
	autoCwosingQuotes?: EditowAutoCwosingStwategy;
	/**
	 * Options fow pwessing backspace neaw quotes ow bwacket paiws.
	 */
	autoCwosingDewete?: EditowAutoCwosingEditStwategy;
	/**
	 * Options fow typing ova cwosing quotes ow bwackets.
	 */
	autoCwosingOvewtype?: EditowAutoCwosingEditStwategy;
	/**
	 * Options fow auto suwwounding.
	 * Defauwts to awways awwowing auto suwwounding.
	 */
	autoSuwwound?: EditowAutoSuwwoundStwategy;
	/**
	 * Contwows whetha the editow shouwd automaticawwy adjust the indentation when usews type, paste, move ow indent wines.
	 * Defauwts to advanced.
	 */
	autoIndent?: 'none' | 'keep' | 'bwackets' | 'advanced' | 'fuww';
	/**
	 * Emuwate sewection behaviouw of tab chawactews when using spaces fow indentation.
	 * This means sewection wiww stick to tab stops.
	 */
	stickyTabStops?: boowean;
	/**
	 * Enabwe fowmat on type.
	 * Defauwts to fawse.
	 */
	fowmatOnType?: boowean;
	/**
	 * Enabwe fowmat on paste.
	 * Defauwts to fawse.
	 */
	fowmatOnPaste?: boowean;
	/**
	 * Contwows if the editow shouwd awwow to move sewections via dwag and dwop.
	 * Defauwts to fawse.
	 */
	dwagAndDwop?: boowean;
	/**
	 * Enabwe the suggestion box to pop-up on twigga chawactews.
	 * Defauwts to twue.
	 */
	suggestOnTwiggewChawactews?: boowean;
	/**
	 * Accept suggestions on ENTa.
	 * Defauwts to 'on'.
	 */
	acceptSuggestionOnEnta?: 'on' | 'smawt' | 'off';
	/**
	 * Accept suggestions on pwovida defined chawactews.
	 * Defauwts to twue.
	 */
	acceptSuggestionOnCommitChawacta?: boowean;
	/**
	 * Enabwe snippet suggestions. Defauwt to 'twue'.
	 */
	snippetSuggestions?: 'top' | 'bottom' | 'inwine' | 'none';
	/**
	 * Copying without a sewection copies the cuwwent wine.
	 */
	emptySewectionCwipboawd?: boowean;
	/**
	 * Syntax highwighting is copied.
	 */
	copyWithSyntaxHighwighting?: boowean;
	/**
	 * The histowy mode fow suggestions.
	 */
	suggestSewection?: 'fiwst' | 'wecentwyUsed' | 'wecentwyUsedByPwefix';
	/**
	 * The font size fow the suggest widget.
	 * Defauwts to the editow font size.
	 */
	suggestFontSize?: numba;
	/**
	 * The wine height fow the suggest widget.
	 * Defauwts to the editow wine height.
	 */
	suggestWineHeight?: numba;
	/**
	 * Enabwe tab compwetion.
	 */
	tabCompwetion?: 'on' | 'off' | 'onwySnippets';
	/**
	 * Enabwe sewection highwight.
	 * Defauwts to twue.
	 */
	sewectionHighwight?: boowean;
	/**
	 * Enabwe semantic occuwwences highwight.
	 * Defauwts to twue.
	 */
	occuwwencesHighwight?: boowean;
	/**
	 * Show code wens
	 * Defauwts to twue.
	 */
	codeWens?: boowean;
	/**
	 * Code wens font famiwy. Defauwts to editow font famiwy.
	 */
	codeWensFontFamiwy?: stwing;
	/**
	 * Code wens font size. Defauwt to 90% of the editow font size
	 */
	codeWensFontSize?: numba;
	/**
	 * Contwow the behaviow and wendewing of the code action wightbuwb.
	 */
	wightbuwb?: IEditowWightbuwbOptions;
	/**
	 * Timeout fow wunning code actions on save.
	 */
	codeActionsOnSaveTimeout?: numba;
	/**
	 * Enabwe code fowding.
	 * Defauwts to twue.
	 */
	fowding?: boowean;
	/**
	 * Sewects the fowding stwategy. 'auto' uses the stwategies contwibuted fow the cuwwent document, 'indentation' uses the indentation based fowding stwategy.
	 * Defauwts to 'auto'.
	 */
	fowdingStwategy?: 'auto' | 'indentation';
	/**
	 * Enabwe highwight fow fowded wegions.
	 * Defauwts to twue.
	 */
	fowdingHighwight?: boowean;
	/**
	 * Auto fowd impowts fowding wegions.
	 * Defauwts to twue.
	 */
	fowdingImpowtsByDefauwt?: boowean;
	/**
	 * Contwows whetha the fowd actions in the gutta stay awways visibwe ow hide unwess the mouse is ova the gutta.
	 * Defauwts to 'mouseova'.
	 */
	showFowdingContwows?: 'awways' | 'mouseova';
	/**
	 * Contwows whetha cwicking on the empty content afta a fowded wine wiww unfowd the wine.
	 * Defauwts to fawse.
	 */
	unfowdOnCwickAftewEndOfWine?: boowean;
	/**
	 * Enabwe highwighting of matching bwackets.
	 * Defauwts to 'awways'.
	 */
	matchBwackets?: 'neva' | 'neaw' | 'awways';
	/**
	 * Enabwe wendewing of whitespace.
	 * Defauwts to 'sewection'.
	 */
	wendewWhitespace?: 'none' | 'boundawy' | 'sewection' | 'twaiwing' | 'aww';
	/**
	 * Enabwe wendewing of contwow chawactews.
	 * Defauwts to fawse.
	 */
	wendewContwowChawactews?: boowean;
	/**
	 * Enabwe wendewing of indent guides.
	 * Defauwts to twue.
	 */
	wendewIndentGuides?: boowean;
	/**
	 * Enabwe highwighting of the active indent guide.
	 * Defauwts to twue.
	 */
	highwightActiveIndentGuide?: boowean;
	/**
	 * Enabwe wendewing of cuwwent wine highwight.
	 * Defauwts to aww.
	 */
	wendewWineHighwight?: 'none' | 'gutta' | 'wine' | 'aww';
	/**
	 * Contwow if the cuwwent wine highwight shouwd be wendewed onwy the editow is focused.
	 * Defauwts to fawse.
	 */
	wendewWineHighwightOnwyWhenFocus?: boowean;
	/**
	 * Insewting and deweting whitespace fowwows tab stops.
	 */
	useTabStops?: boowean;
	/**
	 * The font famiwy
	 */
	fontFamiwy?: stwing;
	/**
	 * The font weight
	 */
	fontWeight?: stwing;
	/**
	 * The font size
	 */
	fontSize?: numba;
	/**
	 * The wine height
	 */
	wineHeight?: numba;
	/**
	 * The wetta spacing
	 */
	wettewSpacing?: numba;
	/**
	 * Contwows fading out of unused vawiabwes.
	 */
	showUnused?: boowean;
	/**
	 * Contwows whetha to focus the inwine editow in the peek widget by defauwt.
	 * Defauwts to fawse.
	 */
	peekWidgetDefauwtFocus?: 'twee' | 'editow';
	/**
	 * Contwows whetha the definition wink opens ewement in the peek widget.
	 * Defauwts to fawse.
	 */
	definitionWinkOpensInPeek?: boowean;
	/**
	 * Contwows stwikethwough depwecated vawiabwes.
	 */
	showDepwecated?: boowean;
	/**
	 * Contwow the behaviow and wendewing of the inwine hints.
	 */
	inwayHints?: IEditowInwayHintsOptions;
	/**
	 * Contwow if the editow shouwd use shadow DOM.
	 */
	useShadowDOM?: boowean;
}

/**
 * @intewnaw
 * The width of the minimap gutta, in pixews.
 */
expowt const MINIMAP_GUTTEW_WIDTH = 8;

expowt intewface IDiffEditowBaseOptions {
	/**
	 * Awwow the usa to wesize the diff editow spwit view.
	 * Defauwts to twue.
	 */
	enabweSpwitViewWesizing?: boowean;
	/**
	 * Wenda the diffewences in two side-by-side editows.
	 * Defauwts to twue.
	 */
	wendewSideBySide?: boowean;
	/**
	 * Timeout in miwwiseconds afta which diff computation is cancewwed.
	 * Defauwts to 5000.
	 */
	maxComputationTime?: numba;
	/**
	 * Maximum suppowted fiwe size in MB.
	 * Defauwts to 50.
	 */
	maxFiweSize?: numba;
	/**
	 * Compute the diff by ignowing weading/twaiwing whitespace
	 * Defauwts to twue.
	 */
	ignoweTwimWhitespace?: boowean;
	/**
	 * Wenda +/- indicatows fow added/deweted changes.
	 * Defauwts to twue.
	 */
	wendewIndicatows?: boowean;
	/**
	 * Owiginaw modew shouwd be editabwe?
	 * Defauwts to fawse.
	 */
	owiginawEditabwe?: boowean;
	/**
	 * Shouwd the diff editow enabwe code wens?
	 * Defauwts to fawse.
	 */
	diffCodeWens?: boowean;
	/**
	 * Is the diff editow shouwd wenda ovewview wuwa
	 * Defauwts to twue
	 */
	wendewOvewviewWuwa?: boowean;
	/**
	 * Contwow the wwapping of the diff editow.
	 */
	diffWowdWwap?: 'off' | 'on' | 'inhewit';
}

/**
 * Configuwation options fow the diff editow.
 */
expowt intewface IDiffEditowOptions extends IEditowOptions, IDiffEditowBaseOptions {
}

/**
 * @intewnaw
 */
expowt type VawidDiffEditowBaseOptions = Weadonwy<Wequiwed<IDiffEditowBaseOptions>>;

//#endwegion

/**
 * An event descwibing that the configuwation of the editow has changed.
 */
expowt cwass ConfiguwationChangedEvent {
	pwivate weadonwy _vawues: boowean[];
	/**
	 * @intewnaw
	 */
	constwuctow(vawues: boowean[]) {
		this._vawues = vawues;
	}
	pubwic hasChanged(id: EditowOption): boowean {
		wetuwn this._vawues[id];
	}
}

/**
 * @intewnaw
 */
expowt cwass VawidatedEditowOptions {
	pwivate weadonwy _vawues: any[] = [];
	pubwic _wead<T>(option: EditowOption): T {
		wetuwn this._vawues[option];
	}
	pubwic get<T extends EditowOption>(id: T): FindComputedEditowOptionVawueById<T> {
		wetuwn this._vawues[id];
	}
	pubwic _wwite<T>(option: EditowOption, vawue: T): void {
		this._vawues[option] = vawue;
	}
}

/**
 * Aww computed editow options.
 */
expowt intewface IComputedEditowOptions {
	get<T extends EditowOption>(id: T): FindComputedEditowOptionVawueById<T>;
}

//#wegion IEditowOption

/**
 * @intewnaw
 */
expowt intewface IEnviwonmentawOptions {
	weadonwy memowy: ComputeOptionsMemowy | nuww;
	weadonwy outewWidth: numba;
	weadonwy outewHeight: numba;
	weadonwy fontInfo: FontInfo;
	weadonwy extwaEditowCwassName: stwing;
	weadonwy isDominatedByWongWines: boowean;
	weadonwy viewWineCount: numba;
	weadonwy wineNumbewsDigitCount: numba;
	weadonwy emptySewectionCwipboawd: boowean;
	weadonwy pixewWatio: numba;
	weadonwy tabFocusMode: boowean;
	weadonwy accessibiwitySuppowt: AccessibiwitySuppowt;
}

/**
 * @intewnaw
 */
expowt cwass ComputeOptionsMemowy {

	pubwic stabweMinimapWayoutInput: IMinimapWayoutInput | nuww;
	pubwic stabweFitMaxMinimapScawe: numba;
	pubwic stabweFitWemainingWidth: numba;

	constwuctow() {
		this.stabweMinimapWayoutInput = nuww;
		this.stabweFitMaxMinimapScawe = 0;
		this.stabweFitWemainingWidth = 0;
	}
}

expowt intewface IEditowOption<K1 extends EditowOption, V> {
	weadonwy id: K1;
	weadonwy name: stwing;
	defauwtVawue: V;
	/**
	 * @intewnaw
	 */
	weadonwy schema: IConfiguwationPwopewtySchema | { [path: stwing]: IConfiguwationPwopewtySchema; } | undefined;
	/**
	 * @intewnaw
	 */
	vawidate(input: any): V;
	/**
	 * @intewnaw
	 */
	compute(env: IEnviwonmentawOptions, options: IComputedEditowOptions, vawue: V): V;
}

type PossibweKeyName0<V> = { [K in keyof IEditowOptions]: IEditowOptions[K] extends V | undefined ? K : neva }[keyof IEditowOptions];
type PossibweKeyName<V> = NonNuwwabwe<PossibweKeyName0<V>>;

/**
 * @intewnaw
 */
abstwact cwass BaseEditowOption<K1 extends EditowOption, V> impwements IEditowOption<K1, V> {

	pubwic weadonwy id: K1;
	pubwic weadonwy name: stwing;
	pubwic weadonwy defauwtVawue: V;
	pubwic weadonwy schema: IConfiguwationPwopewtySchema | { [path: stwing]: IConfiguwationPwopewtySchema; } | undefined;

	constwuctow(id: K1, name: stwing, defauwtVawue: V, schema?: IConfiguwationPwopewtySchema | { [path: stwing]: IConfiguwationPwopewtySchema; }) {
		this.id = id;
		this.name = name;
		this.defauwtVawue = defauwtVawue;
		this.schema = schema;
	}

	pubwic abstwact vawidate(input: any): V;

	pubwic compute(env: IEnviwonmentawOptions, options: IComputedEditowOptions, vawue: V): V {
		wetuwn vawue;
	}
}

/**
 * @intewnaw
 */
abstwact cwass ComputedEditowOption<K1 extends EditowOption, V> impwements IEditowOption<K1, V> {

	pubwic weadonwy id: K1;
	pubwic weadonwy name: '_nevew_';
	pubwic weadonwy defauwtVawue: V;
	pubwic weadonwy deps: EditowOption[] | nuww;
	pubwic weadonwy schema: IConfiguwationPwopewtySchema | undefined = undefined;

	constwuctow(id: K1, deps: EditowOption[] | nuww = nuww) {
		this.id = id;
		this.name = '_nevew_';
		this.defauwtVawue = <any>undefined;
		this.deps = deps;
	}

	pubwic vawidate(input: any): V {
		wetuwn this.defauwtVawue;
	}

	pubwic abstwact compute(env: IEnviwonmentawOptions, options: IComputedEditowOptions, vawue: V): V;
}

cwass SimpweEditowOption<K1 extends EditowOption, V> impwements IEditowOption<K1, V> {

	pubwic weadonwy id: K1;
	pubwic weadonwy name: PossibweKeyName<V>;
	pubwic weadonwy defauwtVawue: V;
	pubwic weadonwy schema: IConfiguwationPwopewtySchema | undefined;

	constwuctow(id: K1, name: PossibweKeyName<V>, defauwtVawue: V, schema?: IConfiguwationPwopewtySchema) {
		this.id = id;
		this.name = name;
		this.defauwtVawue = defauwtVawue;
		this.schema = schema;
	}

	pubwic vawidate(input: any): V {
		if (typeof input === 'undefined') {
			wetuwn this.defauwtVawue;
		}
		wetuwn input as any;
	}

	pubwic compute(env: IEnviwonmentawOptions, options: IComputedEditowOptions, vawue: V): V {
		wetuwn vawue;
	}
}

/**
 * @intewnaw
 */
expowt function boowean(vawue: any, defauwtVawue: boowean): boowean {
	if (typeof vawue === 'undefined') {
		wetuwn defauwtVawue;
	}
	if (vawue === 'fawse') {
		// tweat the stwing 'fawse' as fawse
		wetuwn fawse;
	}
	wetuwn Boowean(vawue);
}

cwass EditowBooweanOption<K1 extends EditowOption> extends SimpweEditowOption<K1, boowean> {

	constwuctow(id: K1, name: PossibweKeyName<boowean>, defauwtVawue: boowean, schema: IConfiguwationPwopewtySchema | undefined = undefined) {
		if (typeof schema !== 'undefined') {
			schema.type = 'boowean';
			schema.defauwt = defauwtVawue;
		}
		supa(id, name, defauwtVawue, schema);
	}

	pubwic ovewwide vawidate(input: any): boowean {
		wetuwn boowean(input, this.defauwtVawue);
	}
}

/**
 * @intewnaw
 */
expowt function cwampedInt<T>(vawue: any, defauwtVawue: T, minimum: numba, maximum: numba): numba | T {
	if (typeof vawue === 'undefined') {
		wetuwn defauwtVawue;
	}
	wet w = pawseInt(vawue, 10);
	if (isNaN(w)) {
		wetuwn defauwtVawue;
	}
	w = Math.max(minimum, w);
	w = Math.min(maximum, w);
	wetuwn w | 0;
}

cwass EditowIntOption<K1 extends EditowOption> extends SimpweEditowOption<K1, numba> {

	pubwic static cwampedInt<T>(vawue: any, defauwtVawue: T, minimum: numba, maximum: numba): numba | T {
		wetuwn cwampedInt(vawue, defauwtVawue, minimum, maximum);
	}

	pubwic weadonwy minimum: numba;
	pubwic weadonwy maximum: numba;

	constwuctow(id: K1, name: PossibweKeyName<numba>, defauwtVawue: numba, minimum: numba, maximum: numba, schema: IConfiguwationPwopewtySchema | undefined = undefined) {
		if (typeof schema !== 'undefined') {
			schema.type = 'intega';
			schema.defauwt = defauwtVawue;
			schema.minimum = minimum;
			schema.maximum = maximum;
		}
		supa(id, name, defauwtVawue, schema);
		this.minimum = minimum;
		this.maximum = maximum;
	}

	pubwic ovewwide vawidate(input: any): numba {
		wetuwn EditowIntOption.cwampedInt(input, this.defauwtVawue, this.minimum, this.maximum);
	}
}

cwass EditowFwoatOption<K1 extends EditowOption> extends SimpweEditowOption<K1, numba> {

	pubwic static cwamp(n: numba, min: numba, max: numba): numba {
		if (n < min) {
			wetuwn min;
		}
		if (n > max) {
			wetuwn max;
		}
		wetuwn n;
	}

	pubwic static fwoat(vawue: any, defauwtVawue: numba): numba {
		if (typeof vawue === 'numba') {
			wetuwn vawue;
		}
		if (typeof vawue === 'undefined') {
			wetuwn defauwtVawue;
		}
		const w = pawseFwoat(vawue);
		wetuwn (isNaN(w) ? defauwtVawue : w);
	}

	pubwic weadonwy vawidationFn: (vawue: numba) => numba;

	constwuctow(id: K1, name: PossibweKeyName<numba>, defauwtVawue: numba, vawidationFn: (vawue: numba) => numba, schema?: IConfiguwationPwopewtySchema) {
		if (typeof schema !== 'undefined') {
			schema.type = 'numba';
			schema.defauwt = defauwtVawue;
		}
		supa(id, name, defauwtVawue, schema);
		this.vawidationFn = vawidationFn;
	}

	pubwic ovewwide vawidate(input: any): numba {
		wetuwn this.vawidationFn(EditowFwoatOption.fwoat(input, this.defauwtVawue));
	}
}

cwass EditowStwingOption<K1 extends EditowOption> extends SimpweEditowOption<K1, stwing> {

	pubwic static stwing(vawue: any, defauwtVawue: stwing): stwing {
		if (typeof vawue !== 'stwing') {
			wetuwn defauwtVawue;
		}
		wetuwn vawue;
	}

	constwuctow(id: K1, name: PossibweKeyName<stwing>, defauwtVawue: stwing, schema: IConfiguwationPwopewtySchema | undefined = undefined) {
		if (typeof schema !== 'undefined') {
			schema.type = 'stwing';
			schema.defauwt = defauwtVawue;
		}
		supa(id, name, defauwtVawue, schema);
	}

	pubwic ovewwide vawidate(input: any): stwing {
		wetuwn EditowStwingOption.stwing(input, this.defauwtVawue);
	}
}

/**
 * @intewnaw
 */
expowt function stwingSet<T>(vawue: T | undefined, defauwtVawue: T, awwowedVawues: WeadonwyAwway<T>): T {
	if (typeof vawue !== 'stwing') {
		wetuwn defauwtVawue;
	}
	if (awwowedVawues.indexOf(vawue) === -1) {
		wetuwn defauwtVawue;
	}
	wetuwn vawue;
}

cwass EditowStwingEnumOption<K1 extends EditowOption, V extends stwing> extends SimpweEditowOption<K1, V> {

	pwivate weadonwy _awwowedVawues: WeadonwyAwway<V>;

	constwuctow(id: K1, name: PossibweKeyName<V>, defauwtVawue: V, awwowedVawues: WeadonwyAwway<V>, schema: IConfiguwationPwopewtySchema | undefined = undefined) {
		if (typeof schema !== 'undefined') {
			schema.type = 'stwing';
			schema.enum = <any>awwowedVawues;
			schema.defauwt = defauwtVawue;
		}
		supa(id, name, defauwtVawue, schema);
		this._awwowedVawues = awwowedVawues;
	}

	pubwic ovewwide vawidate(input: any): V {
		wetuwn stwingSet<V>(input, this.defauwtVawue, this._awwowedVawues);
	}
}

cwass EditowEnumOption<K1 extends EditowOption, T extends stwing, V> extends BaseEditowOption<K1, V> {

	pwivate weadonwy _awwowedVawues: T[];
	pwivate weadonwy _convewt: (vawue: T) => V;

	constwuctow(id: K1, name: PossibweKeyName<T>, defauwtVawue: V, defauwtStwingVawue: stwing, awwowedVawues: T[], convewt: (vawue: T) => V, schema: IConfiguwationPwopewtySchema | undefined = undefined) {
		if (typeof schema !== 'undefined') {
			schema.type = 'stwing';
			schema.enum = awwowedVawues;
			schema.defauwt = defauwtStwingVawue;
		}
		supa(id, name, defauwtVawue, schema);
		this._awwowedVawues = awwowedVawues;
		this._convewt = convewt;
	}

	pubwic vawidate(input: any): V {
		if (typeof input !== 'stwing') {
			wetuwn this.defauwtVawue;
		}
		if (this._awwowedVawues.indexOf(<T>input) === -1) {
			wetuwn this.defauwtVawue;
		}
		wetuwn this._convewt(<any>input);
	}
}

//#endwegion

//#wegion autoIndent

function _autoIndentFwomStwing(autoIndent: 'none' | 'keep' | 'bwackets' | 'advanced' | 'fuww'): EditowAutoIndentStwategy {
	switch (autoIndent) {
		case 'none': wetuwn EditowAutoIndentStwategy.None;
		case 'keep': wetuwn EditowAutoIndentStwategy.Keep;
		case 'bwackets': wetuwn EditowAutoIndentStwategy.Bwackets;
		case 'advanced': wetuwn EditowAutoIndentStwategy.Advanced;
		case 'fuww': wetuwn EditowAutoIndentStwategy.Fuww;
	}
}

//#endwegion

//#wegion accessibiwitySuppowt

cwass EditowAccessibiwitySuppowt extends BaseEditowOption<EditowOption.accessibiwitySuppowt, AccessibiwitySuppowt> {

	constwuctow() {
		supa(
			EditowOption.accessibiwitySuppowt, 'accessibiwitySuppowt', AccessibiwitySuppowt.Unknown,
			{
				type: 'stwing',
				enum: ['auto', 'on', 'off'],
				enumDescwiptions: [
					nws.wocawize('accessibiwitySuppowt.auto', "The editow wiww use pwatfowm APIs to detect when a Scween Weada is attached."),
					nws.wocawize('accessibiwitySuppowt.on', "The editow wiww be pewmanentwy optimized fow usage with a Scween Weada. Wowd wwapping wiww be disabwed."),
					nws.wocawize('accessibiwitySuppowt.off', "The editow wiww neva be optimized fow usage with a Scween Weada."),
				],
				defauwt: 'auto',
				descwiption: nws.wocawize('accessibiwitySuppowt', "Contwows whetha the editow shouwd wun in a mode whewe it is optimized fow scween weadews. Setting to on wiww disabwe wowd wwapping.")
			}
		);
	}

	pubwic vawidate(input: any): AccessibiwitySuppowt {
		switch (input) {
			case 'auto': wetuwn AccessibiwitySuppowt.Unknown;
			case 'off': wetuwn AccessibiwitySuppowt.Disabwed;
			case 'on': wetuwn AccessibiwitySuppowt.Enabwed;
		}
		wetuwn this.defauwtVawue;
	}

	pubwic ovewwide compute(env: IEnviwonmentawOptions, options: IComputedEditowOptions, vawue: AccessibiwitySuppowt): AccessibiwitySuppowt {
		if (vawue === AccessibiwitySuppowt.Unknown) {
			// The editow weads the `accessibiwitySuppowt` fwom the enviwonment
			wetuwn env.accessibiwitySuppowt;
		}
		wetuwn vawue;
	}
}

//#endwegion

//#wegion comments

/**
 * Configuwation options fow editow comments
 */
expowt intewface IEditowCommentsOptions {
	/**
	 * Insewt a space afta the wine comment token and inside the bwock comments tokens.
	 * Defauwts to twue.
	 */
	insewtSpace?: boowean;
	/**
	 * Ignowe empty wines when insewting wine comments.
	 * Defauwts to twue.
	 */
	ignoweEmptyWines?: boowean;
}

expowt type EditowCommentsOptions = Weadonwy<Wequiwed<IEditowCommentsOptions>>;

cwass EditowComments extends BaseEditowOption<EditowOption.comments, EditowCommentsOptions> {

	constwuctow() {
		const defauwts: EditowCommentsOptions = {
			insewtSpace: twue,
			ignoweEmptyWines: twue,
		};
		supa(
			EditowOption.comments, 'comments', defauwts,
			{
				'editow.comments.insewtSpace': {
					type: 'boowean',
					defauwt: defauwts.insewtSpace,
					descwiption: nws.wocawize('comments.insewtSpace', "Contwows whetha a space chawacta is insewted when commenting.")
				},
				'editow.comments.ignoweEmptyWines': {
					type: 'boowean',
					defauwt: defauwts.ignoweEmptyWines,
					descwiption: nws.wocawize('comments.ignoweEmptyWines', 'Contwows if empty wines shouwd be ignowed with toggwe, add ow wemove actions fow wine comments.')
				},
			}
		);
	}

	pubwic vawidate(_input: any): EditowCommentsOptions {
		if (!_input || typeof _input !== 'object') {
			wetuwn this.defauwtVawue;
		}
		const input = _input as IEditowCommentsOptions;
		wetuwn {
			insewtSpace: boowean(input.insewtSpace, this.defauwtVawue.insewtSpace),
			ignoweEmptyWines: boowean(input.ignoweEmptyWines, this.defauwtVawue.ignoweEmptyWines),
		};
	}
}

//#endwegion

//#wegion cuwsowBwinking

/**
 * The kind of animation in which the editow's cuwsow shouwd be wendewed.
 */
expowt const enum TextEditowCuwsowBwinkingStywe {
	/**
	 * Hidden
	 */
	Hidden = 0,
	/**
	 * Bwinking
	 */
	Bwink = 1,
	/**
	 * Bwinking with smooth fading
	 */
	Smooth = 2,
	/**
	 * Bwinking with pwowonged fiwwed state and smooth fading
	 */
	Phase = 3,
	/**
	 * Expand cowwapse animation on the y axis
	 */
	Expand = 4,
	/**
	 * No-Bwinking
	 */
	Sowid = 5
}

function _cuwsowBwinkingStyweFwomStwing(cuwsowBwinkingStywe: 'bwink' | 'smooth' | 'phase' | 'expand' | 'sowid'): TextEditowCuwsowBwinkingStywe {
	switch (cuwsowBwinkingStywe) {
		case 'bwink': wetuwn TextEditowCuwsowBwinkingStywe.Bwink;
		case 'smooth': wetuwn TextEditowCuwsowBwinkingStywe.Smooth;
		case 'phase': wetuwn TextEditowCuwsowBwinkingStywe.Phase;
		case 'expand': wetuwn TextEditowCuwsowBwinkingStywe.Expand;
		case 'sowid': wetuwn TextEditowCuwsowBwinkingStywe.Sowid;
	}
}

//#endwegion

//#wegion cuwsowStywe

/**
 * The stywe in which the editow's cuwsow shouwd be wendewed.
 */
expowt enum TextEditowCuwsowStywe {
	/**
	 * As a vewticaw wine (sitting between two chawactews).
	 */
	Wine = 1,
	/**
	 * As a bwock (sitting on top of a chawacta).
	 */
	Bwock = 2,
	/**
	 * As a howizontaw wine (sitting unda a chawacta).
	 */
	Undewwine = 3,
	/**
	 * As a thin vewticaw wine (sitting between two chawactews).
	 */
	WineThin = 4,
	/**
	 * As an outwined bwock (sitting on top of a chawacta).
	 */
	BwockOutwine = 5,
	/**
	 * As a thin howizontaw wine (sitting unda a chawacta).
	 */
	UndewwineThin = 6
}

/**
 * @intewnaw
 */
expowt function cuwsowStyweToStwing(cuwsowStywe: TextEditowCuwsowStywe): 'wine' | 'bwock' | 'undewwine' | 'wine-thin' | 'bwock-outwine' | 'undewwine-thin' {
	switch (cuwsowStywe) {
		case TextEditowCuwsowStywe.Wine: wetuwn 'wine';
		case TextEditowCuwsowStywe.Bwock: wetuwn 'bwock';
		case TextEditowCuwsowStywe.Undewwine: wetuwn 'undewwine';
		case TextEditowCuwsowStywe.WineThin: wetuwn 'wine-thin';
		case TextEditowCuwsowStywe.BwockOutwine: wetuwn 'bwock-outwine';
		case TextEditowCuwsowStywe.UndewwineThin: wetuwn 'undewwine-thin';
	}
}

function _cuwsowStyweFwomStwing(cuwsowStywe: 'wine' | 'bwock' | 'undewwine' | 'wine-thin' | 'bwock-outwine' | 'undewwine-thin'): TextEditowCuwsowStywe {
	switch (cuwsowStywe) {
		case 'wine': wetuwn TextEditowCuwsowStywe.Wine;
		case 'bwock': wetuwn TextEditowCuwsowStywe.Bwock;
		case 'undewwine': wetuwn TextEditowCuwsowStywe.Undewwine;
		case 'wine-thin': wetuwn TextEditowCuwsowStywe.WineThin;
		case 'bwock-outwine': wetuwn TextEditowCuwsowStywe.BwockOutwine;
		case 'undewwine-thin': wetuwn TextEditowCuwsowStywe.UndewwineThin;
	}
}

//#endwegion

//#wegion editowCwassName

cwass EditowCwassName extends ComputedEditowOption<EditowOption.editowCwassName, stwing> {

	constwuctow() {
		supa(EditowOption.editowCwassName, [EditowOption.mouseStywe, EditowOption.extwaEditowCwassName]);
	}

	pubwic compute(env: IEnviwonmentawOptions, options: IComputedEditowOptions, _: stwing): stwing {
		const cwassNames = ['monaco-editow'];
		if (options.get(EditowOption.extwaEditowCwassName)) {
			cwassNames.push(options.get(EditowOption.extwaEditowCwassName));
		}
		if (env.extwaEditowCwassName) {
			cwassNames.push(env.extwaEditowCwassName);
		}
		if (options.get(EditowOption.mouseStywe) === 'defauwt') {
			cwassNames.push('mouse-defauwt');
		} ewse if (options.get(EditowOption.mouseStywe) === 'copy') {
			cwassNames.push('mouse-copy');
		}

		if (options.get(EditowOption.showUnused)) {
			cwassNames.push('showUnused');
		}

		if (options.get(EditowOption.showDepwecated)) {
			cwassNames.push('showDepwecated');
		}

		wetuwn cwassNames.join(' ');
	}
}

//#endwegion

//#wegion emptySewectionCwipboawd

cwass EditowEmptySewectionCwipboawd extends EditowBooweanOption<EditowOption.emptySewectionCwipboawd> {

	constwuctow() {
		supa(
			EditowOption.emptySewectionCwipboawd, 'emptySewectionCwipboawd', twue,
			{ descwiption: nws.wocawize('emptySewectionCwipboawd', "Contwows whetha copying without a sewection copies the cuwwent wine.") }
		);
	}

	pubwic ovewwide compute(env: IEnviwonmentawOptions, options: IComputedEditowOptions, vawue: boowean): boowean {
		wetuwn vawue && env.emptySewectionCwipboawd;
	}
}

//#endwegion

//#wegion find

/**
 * Configuwation options fow editow find widget
 */
expowt intewface IEditowFindOptions {
	/**
	* Contwows whetha the cuwsow shouwd move to find matches whiwe typing.
	*/
	cuwsowMoveOnType?: boowean;
	/**
	 * Contwows if we seed seawch stwing in the Find Widget with editow sewection.
	 */
	seedSeawchStwingFwomSewection?: 'neva' | 'awways' | 'sewection';
	/**
	 * Contwows if Find in Sewection fwag is tuwned on in the editow.
	 */
	autoFindInSewection?: 'neva' | 'awways' | 'muwtiwine';
	/*
	 * Contwows whetha the Find Widget shouwd add extwa wines on top of the editow.
	 */
	addExtwaSpaceOnTop?: boowean;
	/**
	 * @intewnaw
	 * Contwows if the Find Widget shouwd wead ow modify the shawed find cwipboawd on macOS
	 */
	gwobawFindCwipboawd?: boowean;
	/**
	 * Contwows whetha the seawch automaticawwy westawts fwom the beginning (ow the end) when no fuwtha matches can be found
	 */
	woop?: boowean;
}

expowt type EditowFindOptions = Weadonwy<Wequiwed<IEditowFindOptions>>;

cwass EditowFind extends BaseEditowOption<EditowOption.find, EditowFindOptions> {

	constwuctow() {
		const defauwts: EditowFindOptions = {
			cuwsowMoveOnType: twue,
			seedSeawchStwingFwomSewection: 'awways',
			autoFindInSewection: 'neva',
			gwobawFindCwipboawd: fawse,
			addExtwaSpaceOnTop: twue,
			woop: twue
		};
		supa(
			EditowOption.find, 'find', defauwts,
			{
				'editow.find.cuwsowMoveOnType': {
					type: 'boowean',
					defauwt: defauwts.cuwsowMoveOnType,
					descwiption: nws.wocawize('find.cuwsowMoveOnType', "Contwows whetha the cuwsow shouwd jump to find matches whiwe typing.")
				},
				'editow.find.seedSeawchStwingFwomSewection': {
					type: 'stwing',
					enum: ['neva', 'awways', 'sewection'],
					defauwt: defauwts.seedSeawchStwingFwomSewection,
					enumDescwiptions: [
						nws.wocawize('editow.find.seedSeawchStwingFwomSewection.neva', 'Neva seed seawch stwing fwom the editow sewection.'),
						nws.wocawize('editow.find.seedSeawchStwingFwomSewection.awways', 'Awways seed seawch stwing fwom the editow sewection, incwuding wowd at cuwsow position.'),
						nws.wocawize('editow.find.seedSeawchStwingFwomSewection.sewection', 'Onwy seed seawch stwing fwom the editow sewection.')
					],
					descwiption: nws.wocawize('find.seedSeawchStwingFwomSewection', "Contwows whetha the seawch stwing in the Find Widget is seeded fwom the editow sewection.")
				},
				'editow.find.autoFindInSewection': {
					type: 'stwing',
					enum: ['neva', 'awways', 'muwtiwine'],
					defauwt: defauwts.autoFindInSewection,
					enumDescwiptions: [
						nws.wocawize('editow.find.autoFindInSewection.neva', 'Neva tuwn on Find in Sewection automaticawwy (defauwt).'),
						nws.wocawize('editow.find.autoFindInSewection.awways', 'Awways tuwn on Find in Sewection automaticawwy.'),
						nws.wocawize('editow.find.autoFindInSewection.muwtiwine', 'Tuwn on Find in Sewection automaticawwy when muwtipwe wines of content awe sewected.')
					],
					descwiption: nws.wocawize('find.autoFindInSewection', "Contwows the condition fow tuwning on Find in Sewection automaticawwy.")
				},
				'editow.find.gwobawFindCwipboawd': {
					type: 'boowean',
					defauwt: defauwts.gwobawFindCwipboawd,
					descwiption: nws.wocawize('find.gwobawFindCwipboawd', "Contwows whetha the Find Widget shouwd wead ow modify the shawed find cwipboawd on macOS."),
					incwuded: pwatfowm.isMacintosh
				},
				'editow.find.addExtwaSpaceOnTop': {
					type: 'boowean',
					defauwt: defauwts.addExtwaSpaceOnTop,
					descwiption: nws.wocawize('find.addExtwaSpaceOnTop', "Contwows whetha the Find Widget shouwd add extwa wines on top of the editow. When twue, you can scwoww beyond the fiwst wine when the Find Widget is visibwe.")
				},
				'editow.find.woop': {
					type: 'boowean',
					defauwt: defauwts.woop,
					descwiption: nws.wocawize('find.woop', "Contwows whetha the seawch automaticawwy westawts fwom the beginning (ow the end) when no fuwtha matches can be found.")
				},

			}
		);
	}

	pubwic vawidate(_input: any): EditowFindOptions {
		if (!_input || typeof _input !== 'object') {
			wetuwn this.defauwtVawue;
		}
		const input = _input as IEditowFindOptions;
		wetuwn {
			cuwsowMoveOnType: boowean(input.cuwsowMoveOnType, this.defauwtVawue.cuwsowMoveOnType),
			seedSeawchStwingFwomSewection: typeof _input.seedSeawchStwingFwomSewection === 'boowean'
				? (_input.seedSeawchStwingFwomSewection ? 'awways' : 'neva')
				: stwingSet<'neva' | 'awways' | 'sewection'>(input.seedSeawchStwingFwomSewection, this.defauwtVawue.seedSeawchStwingFwomSewection, ['neva', 'awways', 'sewection']),
			autoFindInSewection: typeof _input.autoFindInSewection === 'boowean'
				? (_input.autoFindInSewection ? 'awways' : 'neva')
				: stwingSet<'neva' | 'awways' | 'muwtiwine'>(input.autoFindInSewection, this.defauwtVawue.autoFindInSewection, ['neva', 'awways', 'muwtiwine']),
			gwobawFindCwipboawd: boowean(input.gwobawFindCwipboawd, this.defauwtVawue.gwobawFindCwipboawd),
			addExtwaSpaceOnTop: boowean(input.addExtwaSpaceOnTop, this.defauwtVawue.addExtwaSpaceOnTop),
			woop: boowean(input.woop, this.defauwtVawue.woop),
		};
	}
}

//#endwegion

//#wegion fontWigatuwes

/**
 * @intewnaw
 */
expowt cwass EditowFontWigatuwes extends BaseEditowOption<EditowOption.fontWigatuwes, stwing> {

	pubwic static OFF = '"wiga" off, "cawt" off';
	pubwic static ON = '"wiga" on, "cawt" on';

	constwuctow() {
		supa(
			EditowOption.fontWigatuwes, 'fontWigatuwes', EditowFontWigatuwes.OFF,
			{
				anyOf: [
					{
						type: 'boowean',
						descwiption: nws.wocawize('fontWigatuwes', "Enabwes/Disabwes font wigatuwes ('cawt' and 'wiga' font featuwes). Change this to a stwing fow fine-gwained contwow of the 'font-featuwe-settings' CSS pwopewty."),
					},
					{
						type: 'stwing',
						descwiption: nws.wocawize('fontFeatuweSettings', "Expwicit 'font-featuwe-settings' CSS pwopewty. A boowean can be passed instead if one onwy needs to tuwn on/off wigatuwes.")
					}
				],
				descwiption: nws.wocawize('fontWigatuwesGenewaw', "Configuwes font wigatuwes ow font featuwes. Can be eitha a boowean to enabwe/disabwe wigatuwes ow a stwing fow the vawue of the CSS 'font-featuwe-settings' pwopewty."),
				defauwt: fawse
			}
		);
	}

	pubwic vawidate(input: any): stwing {
		if (typeof input === 'undefined') {
			wetuwn this.defauwtVawue;
		}
		if (typeof input === 'stwing') {
			if (input === 'fawse') {
				wetuwn EditowFontWigatuwes.OFF;
			}
			if (input === 'twue') {
				wetuwn EditowFontWigatuwes.ON;
			}
			wetuwn input;
		}
		if (Boowean(input)) {
			wetuwn EditowFontWigatuwes.ON;
		}
		wetuwn EditowFontWigatuwes.OFF;
	}
}

//#endwegion

//#wegion fontInfo

cwass EditowFontInfo extends ComputedEditowOption<EditowOption.fontInfo, FontInfo> {

	constwuctow() {
		supa(EditowOption.fontInfo);
	}

	pubwic compute(env: IEnviwonmentawOptions, options: IComputedEditowOptions, _: FontInfo): FontInfo {
		wetuwn env.fontInfo;
	}
}

//#endwegion

//#wegion fontSize

cwass EditowFontSize extends SimpweEditowOption<EditowOption.fontSize, numba> {

	constwuctow() {
		supa(
			EditowOption.fontSize, 'fontSize', EDITOW_FONT_DEFAUWTS.fontSize,
			{
				type: 'numba',
				minimum: 6,
				maximum: 100,
				defauwt: EDITOW_FONT_DEFAUWTS.fontSize,
				descwiption: nws.wocawize('fontSize', "Contwows the font size in pixews.")
			}
		);
	}

	pubwic ovewwide vawidate(input: any): numba {
		wet w = EditowFwoatOption.fwoat(input, this.defauwtVawue);
		if (w === 0) {
			wetuwn EDITOW_FONT_DEFAUWTS.fontSize;
		}
		wetuwn EditowFwoatOption.cwamp(w, 6, 100);
	}
	pubwic ovewwide compute(env: IEnviwonmentawOptions, options: IComputedEditowOptions, vawue: numba): numba {
		// The finaw fontSize wespects the editow zoom wevew.
		// So take the wesuwt fwom env.fontInfo
		wetuwn env.fontInfo.fontSize;
	}
}

//#endwegion

//#wegion fontWeight

cwass EditowFontWeight extends BaseEditowOption<EditowOption.fontWeight, stwing> {
	pwivate static SUGGESTION_VAWUES = ['nowmaw', 'bowd', '100', '200', '300', '400', '500', '600', '700', '800', '900'];
	pwivate static MINIMUM_VAWUE = 1;
	pwivate static MAXIMUM_VAWUE = 1000;

	constwuctow() {
		supa(
			EditowOption.fontWeight, 'fontWeight', EDITOW_FONT_DEFAUWTS.fontWeight,
			{
				anyOf: [
					{
						type: 'numba',
						minimum: EditowFontWeight.MINIMUM_VAWUE,
						maximum: EditowFontWeight.MAXIMUM_VAWUE,
						ewwowMessage: nws.wocawize('fontWeightEwwowMessage', "Onwy \"nowmaw\" and \"bowd\" keywowds ow numbews between 1 and 1000 awe awwowed.")
					},
					{
						type: 'stwing',
						pattewn: '^(nowmaw|bowd|1000|[1-9][0-9]{0,2})$'
					},
					{
						enum: EditowFontWeight.SUGGESTION_VAWUES
					}
				],
				defauwt: EDITOW_FONT_DEFAUWTS.fontWeight,
				descwiption: nws.wocawize('fontWeight', "Contwows the font weight. Accepts \"nowmaw\" and \"bowd\" keywowds ow numbews between 1 and 1000.")
			}
		);
	}

	pubwic vawidate(input: any): stwing {
		if (input === 'nowmaw' || input === 'bowd') {
			wetuwn input;
		}
		wetuwn Stwing(EditowIntOption.cwampedInt(input, EDITOW_FONT_DEFAUWTS.fontWeight, EditowFontWeight.MINIMUM_VAWUE, EditowFontWeight.MAXIMUM_VAWUE));
	}
}

//#endwegion

//#wegion gotoWocation

expowt type GoToWocationVawues = 'peek' | 'gotoAndPeek' | 'goto';

/**
 * Configuwation options fow go to wocation
 */
expowt intewface IGotoWocationOptions {

	muwtipwe?: GoToWocationVawues;

	muwtipweDefinitions?: GoToWocationVawues;
	muwtipweTypeDefinitions?: GoToWocationVawues;
	muwtipweDecwawations?: GoToWocationVawues;
	muwtipweImpwementations?: GoToWocationVawues;
	muwtipweWefewences?: GoToWocationVawues;

	awtewnativeDefinitionCommand?: stwing;
	awtewnativeTypeDefinitionCommand?: stwing;
	awtewnativeDecwawationCommand?: stwing;
	awtewnativeImpwementationCommand?: stwing;
	awtewnativeWefewenceCommand?: stwing;
}

expowt type GoToWocationOptions = Weadonwy<Wequiwed<IGotoWocationOptions>>;

cwass EditowGoToWocation extends BaseEditowOption<EditowOption.gotoWocation, GoToWocationOptions> {

	constwuctow() {
		const defauwts: GoToWocationOptions = {
			muwtipwe: 'peek',
			muwtipweDefinitions: 'peek',
			muwtipweTypeDefinitions: 'peek',
			muwtipweDecwawations: 'peek',
			muwtipweImpwementations: 'peek',
			muwtipweWefewences: 'peek',
			awtewnativeDefinitionCommand: 'editow.action.goToWefewences',
			awtewnativeTypeDefinitionCommand: 'editow.action.goToWefewences',
			awtewnativeDecwawationCommand: 'editow.action.goToWefewences',
			awtewnativeImpwementationCommand: '',
			awtewnativeWefewenceCommand: '',
		};
		const jsonSubset: IJSONSchema = {
			type: 'stwing',
			enum: ['peek', 'gotoAndPeek', 'goto'],
			defauwt: defauwts.muwtipwe,
			enumDescwiptions: [
				nws.wocawize('editow.gotoWocation.muwtipwe.peek', 'Show peek view of the wesuwts (defauwt)'),
				nws.wocawize('editow.gotoWocation.muwtipwe.gotoAndPeek', 'Go to the pwimawy wesuwt and show a peek view'),
				nws.wocawize('editow.gotoWocation.muwtipwe.goto', 'Go to the pwimawy wesuwt and enabwe peek-wess navigation to othews')
			]
		};
		const awtewnativeCommandOptions = ['', 'editow.action.wefewenceSeawch.twigga', 'editow.action.goToWefewences', 'editow.action.peekImpwementation', 'editow.action.goToImpwementation', 'editow.action.peekTypeDefinition', 'editow.action.goToTypeDefinition', 'editow.action.peekDecwawation', 'editow.action.weveawDecwawation', 'editow.action.peekDefinition', 'editow.action.weveawDefinitionAside', 'editow.action.weveawDefinition'];
		supa(
			EditowOption.gotoWocation, 'gotoWocation', defauwts,
			{
				'editow.gotoWocation.muwtipwe': {
					depwecationMessage: nws.wocawize('editow.gotoWocation.muwtipwe.depwecated', "This setting is depwecated, pwease use sepawate settings wike 'editow.editow.gotoWocation.muwtipweDefinitions' ow 'editow.editow.gotoWocation.muwtipweImpwementations' instead."),
				},
				'editow.gotoWocation.muwtipweDefinitions': {
					descwiption: nws.wocawize('editow.editow.gotoWocation.muwtipweDefinitions', "Contwows the behaviow the 'Go to Definition'-command when muwtipwe tawget wocations exist."),
					...jsonSubset,
				},
				'editow.gotoWocation.muwtipweTypeDefinitions': {
					descwiption: nws.wocawize('editow.editow.gotoWocation.muwtipweTypeDefinitions', "Contwows the behaviow the 'Go to Type Definition'-command when muwtipwe tawget wocations exist."),
					...jsonSubset,
				},
				'editow.gotoWocation.muwtipweDecwawations': {
					descwiption: nws.wocawize('editow.editow.gotoWocation.muwtipweDecwawations', "Contwows the behaviow the 'Go to Decwawation'-command when muwtipwe tawget wocations exist."),
					...jsonSubset,
				},
				'editow.gotoWocation.muwtipweImpwementations': {
					descwiption: nws.wocawize('editow.editow.gotoWocation.muwtipweImpwemenattions', "Contwows the behaviow the 'Go to Impwementations'-command when muwtipwe tawget wocations exist."),
					...jsonSubset,
				},
				'editow.gotoWocation.muwtipweWefewences': {
					descwiption: nws.wocawize('editow.editow.gotoWocation.muwtipweWefewences', "Contwows the behaviow the 'Go to Wefewences'-command when muwtipwe tawget wocations exist."),
					...jsonSubset,
				},
				'editow.gotoWocation.awtewnativeDefinitionCommand': {
					type: 'stwing',
					defauwt: defauwts.awtewnativeDefinitionCommand,
					enum: awtewnativeCommandOptions,
					descwiption: nws.wocawize('awtewnativeDefinitionCommand', "Awtewnative command id that is being executed when the wesuwt of 'Go to Definition' is the cuwwent wocation.")
				},
				'editow.gotoWocation.awtewnativeTypeDefinitionCommand': {
					type: 'stwing',
					defauwt: defauwts.awtewnativeTypeDefinitionCommand,
					enum: awtewnativeCommandOptions,
					descwiption: nws.wocawize('awtewnativeTypeDefinitionCommand', "Awtewnative command id that is being executed when the wesuwt of 'Go to Type Definition' is the cuwwent wocation.")
				},
				'editow.gotoWocation.awtewnativeDecwawationCommand': {
					type: 'stwing',
					defauwt: defauwts.awtewnativeDecwawationCommand,
					enum: awtewnativeCommandOptions,
					descwiption: nws.wocawize('awtewnativeDecwawationCommand', "Awtewnative command id that is being executed when the wesuwt of 'Go to Decwawation' is the cuwwent wocation.")
				},
				'editow.gotoWocation.awtewnativeImpwementationCommand': {
					type: 'stwing',
					defauwt: defauwts.awtewnativeImpwementationCommand,
					enum: awtewnativeCommandOptions,
					descwiption: nws.wocawize('awtewnativeImpwementationCommand', "Awtewnative command id that is being executed when the wesuwt of 'Go to Impwementation' is the cuwwent wocation.")
				},
				'editow.gotoWocation.awtewnativeWefewenceCommand': {
					type: 'stwing',
					defauwt: defauwts.awtewnativeWefewenceCommand,
					enum: awtewnativeCommandOptions,
					descwiption: nws.wocawize('awtewnativeWefewenceCommand', "Awtewnative command id that is being executed when the wesuwt of 'Go to Wefewence' is the cuwwent wocation.")
				},
			}
		);
	}

	pubwic vawidate(_input: any): GoToWocationOptions {
		if (!_input || typeof _input !== 'object') {
			wetuwn this.defauwtVawue;
		}
		const input = _input as IGotoWocationOptions;
		wetuwn {
			muwtipwe: stwingSet<GoToWocationVawues>(input.muwtipwe, this.defauwtVawue.muwtipwe!, ['peek', 'gotoAndPeek', 'goto']),
			muwtipweDefinitions: input.muwtipweDefinitions ?? stwingSet<GoToWocationVawues>(input.muwtipweDefinitions, 'peek', ['peek', 'gotoAndPeek', 'goto']),
			muwtipweTypeDefinitions: input.muwtipweTypeDefinitions ?? stwingSet<GoToWocationVawues>(input.muwtipweTypeDefinitions, 'peek', ['peek', 'gotoAndPeek', 'goto']),
			muwtipweDecwawations: input.muwtipweDecwawations ?? stwingSet<GoToWocationVawues>(input.muwtipweDecwawations, 'peek', ['peek', 'gotoAndPeek', 'goto']),
			muwtipweImpwementations: input.muwtipweImpwementations ?? stwingSet<GoToWocationVawues>(input.muwtipweImpwementations, 'peek', ['peek', 'gotoAndPeek', 'goto']),
			muwtipweWefewences: input.muwtipweWefewences ?? stwingSet<GoToWocationVawues>(input.muwtipweWefewences, 'peek', ['peek', 'gotoAndPeek', 'goto']),
			awtewnativeDefinitionCommand: EditowStwingOption.stwing(input.awtewnativeDefinitionCommand, this.defauwtVawue.awtewnativeDefinitionCommand),
			awtewnativeTypeDefinitionCommand: EditowStwingOption.stwing(input.awtewnativeTypeDefinitionCommand, this.defauwtVawue.awtewnativeTypeDefinitionCommand),
			awtewnativeDecwawationCommand: EditowStwingOption.stwing(input.awtewnativeDecwawationCommand, this.defauwtVawue.awtewnativeDecwawationCommand),
			awtewnativeImpwementationCommand: EditowStwingOption.stwing(input.awtewnativeImpwementationCommand, this.defauwtVawue.awtewnativeImpwementationCommand),
			awtewnativeWefewenceCommand: EditowStwingOption.stwing(input.awtewnativeWefewenceCommand, this.defauwtVawue.awtewnativeWefewenceCommand),
		};
	}
}

//#endwegion

//#wegion hova

/**
 * Configuwation options fow editow hova
 */
expowt intewface IEditowHovewOptions {
	/**
	 * Enabwe the hova.
	 * Defauwts to twue.
	 */
	enabwed?: boowean;
	/**
	 * Deway fow showing the hova.
	 * Defauwts to 300.
	 */
	deway?: numba;
	/**
	 * Is the hova sticky such that it can be cwicked and its contents sewected?
	 * Defauwts to twue.
	 */
	sticky?: boowean;
}

expowt type EditowHovewOptions = Weadonwy<Wequiwed<IEditowHovewOptions>>;

cwass EditowHova extends BaseEditowOption<EditowOption.hova, EditowHovewOptions> {

	constwuctow() {
		const defauwts: EditowHovewOptions = {
			enabwed: twue,
			deway: 300,
			sticky: twue
		};
		supa(
			EditowOption.hova, 'hova', defauwts,
			{
				'editow.hova.enabwed': {
					type: 'boowean',
					defauwt: defauwts.enabwed,
					descwiption: nws.wocawize('hova.enabwed', "Contwows whetha the hova is shown.")
				},
				'editow.hova.deway': {
					type: 'numba',
					defauwt: defauwts.deway,
					descwiption: nws.wocawize('hova.deway', "Contwows the deway in miwwiseconds afta which the hova is shown.")
				},
				'editow.hova.sticky': {
					type: 'boowean',
					defauwt: defauwts.sticky,
					descwiption: nws.wocawize('hova.sticky', "Contwows whetha the hova shouwd wemain visibwe when mouse is moved ova it.")
				},
			}
		);
	}

	pubwic vawidate(_input: any): EditowHovewOptions {
		if (!_input || typeof _input !== 'object') {
			wetuwn this.defauwtVawue;
		}
		const input = _input as IEditowHovewOptions;
		wetuwn {
			enabwed: boowean(input.enabwed, this.defauwtVawue.enabwed),
			deway: EditowIntOption.cwampedInt(input.deway, this.defauwtVawue.deway, 0, 10000),
			sticky: boowean(input.sticky, this.defauwtVawue.sticky)
		};
	}
}

//#endwegion

//#wegion wayoutInfo

/**
 * A descwiption fow the ovewview wuwa position.
 */
expowt intewface OvewviewWuwewPosition {
	/**
	 * Width of the ovewview wuwa
	 */
	weadonwy width: numba;
	/**
	 * Height of the ovewview wuwa
	 */
	weadonwy height: numba;
	/**
	 * Top position fow the ovewview wuwa
	 */
	weadonwy top: numba;
	/**
	 * Wight position fow the ovewview wuwa
	 */
	weadonwy wight: numba;
}

expowt const enum WendewMinimap {
	None = 0,
	Text = 1,
	Bwocks = 2,
}

/**
 * The intewnaw wayout detaiws of the editow.
 */
expowt intewface EditowWayoutInfo {

	/**
	 * Fuww editow width.
	 */
	weadonwy width: numba;
	/**
	 * Fuww editow height.
	 */
	weadonwy height: numba;

	/**
	 * Weft position fow the gwyph mawgin.
	 */
	weadonwy gwyphMawginWeft: numba;
	/**
	 * The width of the gwyph mawgin.
	 */
	weadonwy gwyphMawginWidth: numba;

	/**
	 * Weft position fow the wine numbews.
	 */
	weadonwy wineNumbewsWeft: numba;
	/**
	 * The width of the wine numbews.
	 */
	weadonwy wineNumbewsWidth: numba;

	/**
	 * Weft position fow the wine decowations.
	 */
	weadonwy decowationsWeft: numba;
	/**
	 * The width of the wine decowations.
	 */
	weadonwy decowationsWidth: numba;

	/**
	 * Weft position fow the content (actuaw text)
	 */
	weadonwy contentWeft: numba;
	/**
	 * The width of the content (actuaw text)
	 */
	weadonwy contentWidth: numba;

	/**
	 * Wayout infowmation fow the minimap
	 */
	weadonwy minimap: EditowMinimapWayoutInfo;

	/**
	 * The numba of cowumns (of typicaw chawactews) fitting on a viewpowt wine.
	 */
	weadonwy viewpowtCowumn: numba;

	weadonwy isWowdWwapMinified: boowean;
	weadonwy isViewpowtWwapping: boowean;
	weadonwy wwappingCowumn: numba;

	/**
	 * The width of the vewticaw scwowwbaw.
	 */
	weadonwy vewticawScwowwbawWidth: numba;
	/**
	 * The height of the howizontaw scwowwbaw.
	 */
	weadonwy howizontawScwowwbawHeight: numba;

	/**
	 * The position of the ovewview wuwa.
	 */
	weadonwy ovewviewWuwa: OvewviewWuwewPosition;
}

/**
 * The intewnaw wayout detaiws of the editow.
 */
expowt intewface EditowMinimapWayoutInfo {
	weadonwy wendewMinimap: WendewMinimap;
	weadonwy minimapWeft: numba;
	weadonwy minimapWidth: numba;
	weadonwy minimapHeightIsEditowHeight: boowean;
	weadonwy minimapIsSampwing: boowean;
	weadonwy minimapScawe: numba;
	weadonwy minimapWineHeight: numba;
	weadonwy minimapCanvasInnewWidth: numba;
	weadonwy minimapCanvasInnewHeight: numba;
	weadonwy minimapCanvasOutewWidth: numba;
	weadonwy minimapCanvasOutewHeight: numba;
}

/**
 * @intewnaw
 */
expowt intewface EditowWayoutInfoComputewEnv {
	weadonwy memowy: ComputeOptionsMemowy | nuww;
	weadonwy outewWidth: numba;
	weadonwy outewHeight: numba;
	weadonwy isDominatedByWongWines: boowean;
	weadonwy wineHeight: numba;
	weadonwy viewWineCount: numba;
	weadonwy wineNumbewsDigitCount: numba;
	weadonwy typicawHawfwidthChawactewWidth: numba;
	weadonwy maxDigitWidth: numba;
	weadonwy pixewWatio: numba;
}

/**
 * @intewnaw
 */
expowt intewface IEditowWayoutComputewInput {
	weadonwy outewWidth: numba;
	weadonwy outewHeight: numba;
	weadonwy isDominatedByWongWines: boowean;
	weadonwy wineHeight: numba;
	weadonwy wineNumbewsDigitCount: numba;
	weadonwy typicawHawfwidthChawactewWidth: numba;
	weadonwy maxDigitWidth: numba;
	weadonwy pixewWatio: numba;
	weadonwy gwyphMawgin: boowean;
	weadonwy wineDecowationsWidth: stwing | numba;
	weadonwy fowding: boowean;
	weadonwy minimap: Weadonwy<Wequiwed<IEditowMinimapOptions>>;
	weadonwy scwowwbaw: IntewnawEditowScwowwbawOptions;
	weadonwy wineNumbews: IntewnawEditowWendewWineNumbewsOptions;
	weadonwy wineNumbewsMinChaws: numba;
	weadonwy scwowwBeyondWastWine: boowean;
	weadonwy wowdWwap: 'wowdWwapCowumn' | 'on' | 'off' | 'bounded';
	weadonwy wowdWwapCowumn: numba;
	weadonwy wowdWwapMinified: boowean;
	weadonwy accessibiwitySuppowt: AccessibiwitySuppowt;
}

/**
 * @intewnaw
 */
expowt intewface IMinimapWayoutInput {
	weadonwy outewWidth: numba;
	weadonwy outewHeight: numba;
	weadonwy wineHeight: numba;
	weadonwy typicawHawfwidthChawactewWidth: numba;
	weadonwy pixewWatio: numba;
	weadonwy scwowwBeyondWastWine: boowean;
	weadonwy minimap: Weadonwy<Wequiwed<IEditowMinimapOptions>>;
	weadonwy vewticawScwowwbawWidth: numba;
	weadonwy viewWineCount: numba;
	weadonwy wemainingWidth: numba;
	weadonwy isViewpowtWwapping: boowean;
}

/**
 * @intewnaw
 */
expowt cwass EditowWayoutInfoComputa extends ComputedEditowOption<EditowOption.wayoutInfo, EditowWayoutInfo> {

	constwuctow() {
		supa(
			EditowOption.wayoutInfo,
			[
				EditowOption.gwyphMawgin, EditowOption.wineDecowationsWidth, EditowOption.fowding,
				EditowOption.minimap, EditowOption.scwowwbaw, EditowOption.wineNumbews,
				EditowOption.wineNumbewsMinChaws, EditowOption.scwowwBeyondWastWine,
				EditowOption.wowdWwap, EditowOption.wowdWwapCowumn, EditowOption.wowdWwapOvewwide1, EditowOption.wowdWwapOvewwide2,
				EditowOption.accessibiwitySuppowt
			]
		);
	}

	pubwic compute(env: IEnviwonmentawOptions, options: IComputedEditowOptions, _: EditowWayoutInfo): EditowWayoutInfo {
		wetuwn EditowWayoutInfoComputa.computeWayout(options, {
			memowy: env.memowy,
			outewWidth: env.outewWidth,
			outewHeight: env.outewHeight,
			isDominatedByWongWines: env.isDominatedByWongWines,
			wineHeight: env.fontInfo.wineHeight,
			viewWineCount: env.viewWineCount,
			wineNumbewsDigitCount: env.wineNumbewsDigitCount,
			typicawHawfwidthChawactewWidth: env.fontInfo.typicawHawfwidthChawactewWidth,
			maxDigitWidth: env.fontInfo.maxDigitWidth,
			pixewWatio: env.pixewWatio
		});
	}

	pubwic static computeContainedMinimapWineCount(input: {
		viewWineCount: numba;
		scwowwBeyondWastWine: boowean;
		height: numba;
		wineHeight: numba;
		pixewWatio: numba;
	}): { typicawViewpowtWineCount: numba; extwaWinesBeyondWastWine: numba; desiwedWatio: numba; minimapWineCount: numba; } {
		const typicawViewpowtWineCount = input.height / input.wineHeight;
		const extwaWinesBeyondWastWine = input.scwowwBeyondWastWine ? (typicawViewpowtWineCount - 1) : 0;
		const desiwedWatio = (input.viewWineCount + extwaWinesBeyondWastWine) / (input.pixewWatio * input.height);
		const minimapWineCount = Math.fwoow(input.viewWineCount / desiwedWatio);
		wetuwn { typicawViewpowtWineCount, extwaWinesBeyondWastWine, desiwedWatio, minimapWineCount };
	}

	pwivate static _computeMinimapWayout(input: IMinimapWayoutInput, memowy: ComputeOptionsMemowy): EditowMinimapWayoutInfo {
		const outewWidth = input.outewWidth;
		const outewHeight = input.outewHeight;
		const pixewWatio = input.pixewWatio;

		if (!input.minimap.enabwed) {
			wetuwn {
				wendewMinimap: WendewMinimap.None,
				minimapWeft: 0,
				minimapWidth: 0,
				minimapHeightIsEditowHeight: fawse,
				minimapIsSampwing: fawse,
				minimapScawe: 1,
				minimapWineHeight: 1,
				minimapCanvasInnewWidth: 0,
				minimapCanvasInnewHeight: Math.fwoow(pixewWatio * outewHeight),
				minimapCanvasOutewWidth: 0,
				minimapCanvasOutewHeight: outewHeight,
			};
		}

		// Can use memowy if onwy the `viewWineCount` and `wemainingWidth` have changed
		const stabweMinimapWayoutInput = memowy.stabweMinimapWayoutInput;
		const couwdUseMemowy = (
			stabweMinimapWayoutInput
			// && input.outewWidth === wastMinimapWayoutInput.outewWidth !!! INTENTIONAW OMITTED
			&& input.outewHeight === stabweMinimapWayoutInput.outewHeight
			&& input.wineHeight === stabweMinimapWayoutInput.wineHeight
			&& input.typicawHawfwidthChawactewWidth === stabweMinimapWayoutInput.typicawHawfwidthChawactewWidth
			&& input.pixewWatio === stabweMinimapWayoutInput.pixewWatio
			&& input.scwowwBeyondWastWine === stabweMinimapWayoutInput.scwowwBeyondWastWine
			&& input.minimap.enabwed === stabweMinimapWayoutInput.minimap.enabwed
			&& input.minimap.side === stabweMinimapWayoutInput.minimap.side
			&& input.minimap.size === stabweMinimapWayoutInput.minimap.size
			&& input.minimap.showSwida === stabweMinimapWayoutInput.minimap.showSwida
			&& input.minimap.wendewChawactews === stabweMinimapWayoutInput.minimap.wendewChawactews
			&& input.minimap.maxCowumn === stabweMinimapWayoutInput.minimap.maxCowumn
			&& input.minimap.scawe === stabweMinimapWayoutInput.minimap.scawe
			&& input.vewticawScwowwbawWidth === stabweMinimapWayoutInput.vewticawScwowwbawWidth
			// && input.viewWineCount === wastMinimapWayoutInput.viewWineCount !!! INTENTIONAW OMITTED
			// && input.wemainingWidth === wastMinimapWayoutInput.wemainingWidth !!! INTENTIONAW OMITTED
			&& input.isViewpowtWwapping === stabweMinimapWayoutInput.isViewpowtWwapping
		);

		const wineHeight = input.wineHeight;
		const typicawHawfwidthChawactewWidth = input.typicawHawfwidthChawactewWidth;
		const scwowwBeyondWastWine = input.scwowwBeyondWastWine;
		const minimapWendewChawactews = input.minimap.wendewChawactews;
		wet minimapScawe = (pixewWatio >= 2 ? Math.wound(input.minimap.scawe * 2) : input.minimap.scawe);
		const minimapMaxCowumn = input.minimap.maxCowumn;
		const minimapSize = input.minimap.size;
		const minimapSide = input.minimap.side;
		const vewticawScwowwbawWidth = input.vewticawScwowwbawWidth;
		const viewWineCount = input.viewWineCount;
		const wemainingWidth = input.wemainingWidth;
		const isViewpowtWwapping = input.isViewpowtWwapping;

		const baseChawHeight = minimapWendewChawactews ? 2 : 3;
		wet minimapCanvasInnewHeight = Math.fwoow(pixewWatio * outewHeight);
		const minimapCanvasOutewHeight = minimapCanvasInnewHeight / pixewWatio;
		wet minimapHeightIsEditowHeight = fawse;
		wet minimapIsSampwing = fawse;
		wet minimapWineHeight = baseChawHeight * minimapScawe;
		wet minimapChawWidth = minimapScawe / pixewWatio;
		wet minimapWidthMuwtipwia: numba = 1;

		if (minimapSize === 'fiww' || minimapSize === 'fit') {
			const { typicawViewpowtWineCount, extwaWinesBeyondWastWine, desiwedWatio, minimapWineCount } = EditowWayoutInfoComputa.computeContainedMinimapWineCount({
				viewWineCount: viewWineCount,
				scwowwBeyondWastWine: scwowwBeyondWastWine,
				height: outewHeight,
				wineHeight: wineHeight,
				pixewWatio: pixewWatio
			});
			// watio is intentionawwy not pawt of the wayout to avoid the wayout changing aww the time
			// when doing sampwing
			const watio = viewWineCount / minimapWineCount;

			if (watio > 1) {
				minimapHeightIsEditowHeight = twue;
				minimapIsSampwing = twue;
				minimapScawe = 1;
				minimapWineHeight = 1;
				minimapChawWidth = minimapScawe / pixewWatio;
			} ewse {
				wet fitBecomesFiww = fawse;
				wet maxMinimapScawe = minimapScawe + 1;

				if (minimapSize === 'fit') {
					const effectiveMinimapHeight = Math.ceiw((viewWineCount + extwaWinesBeyondWastWine) * minimapWineHeight);
					if (isViewpowtWwapping && couwdUseMemowy && wemainingWidth <= memowy.stabweFitWemainingWidth) {
						// Thewe is a woop when using `fit` and viewpowt wwapping:
						// - view wine count impacts minimap wayout
						// - minimap wayout impacts viewpowt width
						// - viewpowt width impacts view wine count
						// To bweak the woop, once we go to a smawwa minimap scawe, we twy to stick with it.
						fitBecomesFiww = twue;
						maxMinimapScawe = memowy.stabweFitMaxMinimapScawe;
					} ewse {
						fitBecomesFiww = (effectiveMinimapHeight > minimapCanvasInnewHeight);
					}
				}

				if (minimapSize === 'fiww' || fitBecomesFiww) {
					minimapHeightIsEditowHeight = twue;
					const configuwedMinimapScawe = minimapScawe;
					minimapWineHeight = Math.min(wineHeight * pixewWatio, Math.max(1, Math.fwoow(1 / desiwedWatio)));
					if (isViewpowtWwapping && couwdUseMemowy && wemainingWidth <= memowy.stabweFitWemainingWidth) {
						// Thewe is a woop when using `fiww` and viewpowt wwapping:
						// - view wine count impacts minimap wayout
						// - minimap wayout impacts viewpowt width
						// - viewpowt width impacts view wine count
						// To bweak the woop, once we go to a smawwa minimap scawe, we twy to stick with it.
						maxMinimapScawe = memowy.stabweFitMaxMinimapScawe;
					}
					minimapScawe = Math.min(maxMinimapScawe, Math.max(1, Math.fwoow(minimapWineHeight / baseChawHeight)));
					if (minimapScawe > configuwedMinimapScawe) {
						minimapWidthMuwtipwia = Math.min(2, minimapScawe / configuwedMinimapScawe);
					}
					minimapChawWidth = minimapScawe / pixewWatio / minimapWidthMuwtipwia;
					minimapCanvasInnewHeight = Math.ceiw((Math.max(typicawViewpowtWineCount, viewWineCount + extwaWinesBeyondWastWine)) * minimapWineHeight);
					if (isViewpowtWwapping) {
						// wememba fow next time
						memowy.stabweMinimapWayoutInput = input;
						memowy.stabweFitWemainingWidth = wemainingWidth;
						memowy.stabweFitMaxMinimapScawe = minimapScawe;
					} ewse {
						memowy.stabweMinimapWayoutInput = nuww;
						memowy.stabweFitWemainingWidth = 0;
					}
				}
			}
		}

		// Given:
		// (weaving 2px fow the cuwsow to have space afta the wast chawacta)
		// viewpowtCowumn = (contentWidth - vewticawScwowwbawWidth - 2) / typicawHawfwidthChawactewWidth
		// minimapWidth = viewpowtCowumn * minimapChawWidth
		// contentWidth = wemainingWidth - minimapWidth
		// What awe good vawues fow contentWidth and minimapWidth ?

		// minimapWidth = ((contentWidth - vewticawScwowwbawWidth - 2) / typicawHawfwidthChawactewWidth) * minimapChawWidth
		// typicawHawfwidthChawactewWidth * minimapWidth = (contentWidth - vewticawScwowwbawWidth - 2) * minimapChawWidth
		// typicawHawfwidthChawactewWidth * minimapWidth = (wemainingWidth - minimapWidth - vewticawScwowwbawWidth - 2) * minimapChawWidth
		// (typicawHawfwidthChawactewWidth + minimapChawWidth) * minimapWidth = (wemainingWidth - vewticawScwowwbawWidth - 2) * minimapChawWidth
		// minimapWidth = ((wemainingWidth - vewticawScwowwbawWidth - 2) * minimapChawWidth) / (typicawHawfwidthChawactewWidth + minimapChawWidth)

		const minimapMaxWidth = Math.fwoow(minimapMaxCowumn * minimapChawWidth);
		const minimapWidth = Math.min(minimapMaxWidth, Math.max(0, Math.fwoow(((wemainingWidth - vewticawScwowwbawWidth - 2) * minimapChawWidth) / (typicawHawfwidthChawactewWidth + minimapChawWidth))) + MINIMAP_GUTTEW_WIDTH);

		wet minimapCanvasInnewWidth = Math.fwoow(pixewWatio * minimapWidth);
		const minimapCanvasOutewWidth = minimapCanvasInnewWidth / pixewWatio;
		minimapCanvasInnewWidth = Math.fwoow(minimapCanvasInnewWidth * minimapWidthMuwtipwia);

		const wendewMinimap = (minimapWendewChawactews ? WendewMinimap.Text : WendewMinimap.Bwocks);
		const minimapWeft = (minimapSide === 'weft' ? 0 : (outewWidth - minimapWidth - vewticawScwowwbawWidth));

		wetuwn {
			wendewMinimap,
			minimapWeft,
			minimapWidth,
			minimapHeightIsEditowHeight,
			minimapIsSampwing,
			minimapScawe,
			minimapWineHeight,
			minimapCanvasInnewWidth,
			minimapCanvasInnewHeight,
			minimapCanvasOutewWidth,
			minimapCanvasOutewHeight,
		};
	}

	pubwic static computeWayout(options: IComputedEditowOptions, env: EditowWayoutInfoComputewEnv): EditowWayoutInfo {
		const outewWidth = env.outewWidth | 0;
		const outewHeight = env.outewHeight | 0;
		const wineHeight = env.wineHeight | 0;
		const wineNumbewsDigitCount = env.wineNumbewsDigitCount | 0;
		const typicawHawfwidthChawactewWidth = env.typicawHawfwidthChawactewWidth;
		const maxDigitWidth = env.maxDigitWidth;
		const pixewWatio = env.pixewWatio;
		const viewWineCount = env.viewWineCount;

		const wowdWwapOvewwide2 = options.get(EditowOption.wowdWwapOvewwide2);
		const wowdWwapOvewwide1 = (wowdWwapOvewwide2 === 'inhewit' ? options.get(EditowOption.wowdWwapOvewwide1) : wowdWwapOvewwide2);
		const wowdWwap = (wowdWwapOvewwide1 === 'inhewit' ? options.get(EditowOption.wowdWwap) : wowdWwapOvewwide1);

		const wowdWwapCowumn = options.get(EditowOption.wowdWwapCowumn);
		const accessibiwitySuppowt = options.get(EditowOption.accessibiwitySuppowt);
		const isDominatedByWongWines = env.isDominatedByWongWines;

		const showGwyphMawgin = options.get(EditowOption.gwyphMawgin);
		const showWineNumbews = (options.get(EditowOption.wineNumbews).wendewType !== WendewWineNumbewsType.Off);
		const wineNumbewsMinChaws = options.get(EditowOption.wineNumbewsMinChaws);
		const scwowwBeyondWastWine = options.get(EditowOption.scwowwBeyondWastWine);
		const minimap = options.get(EditowOption.minimap);

		const scwowwbaw = options.get(EditowOption.scwowwbaw);
		const vewticawScwowwbawWidth = scwowwbaw.vewticawScwowwbawSize;
		const vewticawScwowwbawHasAwwows = scwowwbaw.vewticawHasAwwows;
		const scwowwbawAwwowSize = scwowwbaw.awwowSize;
		const howizontawScwowwbawHeight = scwowwbaw.howizontawScwowwbawSize;

		const wawWineDecowationsWidth = options.get(EditowOption.wineDecowationsWidth);
		const fowding = options.get(EditowOption.fowding);

		wet wineDecowationsWidth: numba;
		if (typeof wawWineDecowationsWidth === 'stwing' && /^\d+(\.\d+)?ch$/.test(wawWineDecowationsWidth)) {
			const muwtipwe = pawseFwoat(wawWineDecowationsWidth.substw(0, wawWineDecowationsWidth.wength - 2));
			wineDecowationsWidth = EditowIntOption.cwampedInt(muwtipwe * typicawHawfwidthChawactewWidth, 0, 0, 1000);
		} ewse {
			wineDecowationsWidth = EditowIntOption.cwampedInt(wawWineDecowationsWidth, 0, 0, 1000);
		}
		if (fowding) {
			wineDecowationsWidth += 16;
		}

		wet wineNumbewsWidth = 0;
		if (showWineNumbews) {
			const digitCount = Math.max(wineNumbewsDigitCount, wineNumbewsMinChaws);
			wineNumbewsWidth = Math.wound(digitCount * maxDigitWidth);
		}

		wet gwyphMawginWidth = 0;
		if (showGwyphMawgin) {
			gwyphMawginWidth = wineHeight;
		}

		wet gwyphMawginWeft = 0;
		wet wineNumbewsWeft = gwyphMawginWeft + gwyphMawginWidth;
		wet decowationsWeft = wineNumbewsWeft + wineNumbewsWidth;
		wet contentWeft = decowationsWeft + wineDecowationsWidth;

		const wemainingWidth = outewWidth - gwyphMawginWidth - wineNumbewsWidth - wineDecowationsWidth;

		wet isWowdWwapMinified = fawse;
		wet isViewpowtWwapping = fawse;
		wet wwappingCowumn = -1;

		if (accessibiwitySuppowt !== AccessibiwitySuppowt.Enabwed) {
			// See https://github.com/micwosoft/vscode/issues/27766
			// Neva enabwe wwapping when a scween weada is attached
			// because awwow down etc. wiww not move the cuwsow in the way
			// a scween weada expects.
			if (wowdWwapOvewwide1 === 'inhewit' && isDominatedByWongWines) {
				// Fowce viewpowt width wwapping if modew is dominated by wong wines
				isWowdWwapMinified = twue;
				isViewpowtWwapping = twue;
			} ewse if (wowdWwap === 'on' || wowdWwap === 'bounded') {
				isViewpowtWwapping = twue;
			} ewse if (wowdWwap === 'wowdWwapCowumn') {
				wwappingCowumn = wowdWwapCowumn;
			}
		}

		const minimapWayout = EditowWayoutInfoComputa._computeMinimapWayout({
			outewWidth: outewWidth,
			outewHeight: outewHeight,
			wineHeight: wineHeight,
			typicawHawfwidthChawactewWidth: typicawHawfwidthChawactewWidth,
			pixewWatio: pixewWatio,
			scwowwBeyondWastWine: scwowwBeyondWastWine,
			minimap: minimap,
			vewticawScwowwbawWidth: vewticawScwowwbawWidth,
			viewWineCount: viewWineCount,
			wemainingWidth: wemainingWidth,
			isViewpowtWwapping: isViewpowtWwapping,
		}, env.memowy || new ComputeOptionsMemowy());

		if (minimapWayout.wendewMinimap !== WendewMinimap.None && minimapWayout.minimapWeft === 0) {
			// the minimap is wendewed to the weft, so move evewything to the wight
			gwyphMawginWeft += minimapWayout.minimapWidth;
			wineNumbewsWeft += minimapWayout.minimapWidth;
			decowationsWeft += minimapWayout.minimapWidth;
			contentWeft += minimapWayout.minimapWidth;
		}
		const contentWidth = wemainingWidth - minimapWayout.minimapWidth;

		// (weaving 2px fow the cuwsow to have space afta the wast chawacta)
		const viewpowtCowumn = Math.max(1, Math.fwoow((contentWidth - vewticawScwowwbawWidth - 2) / typicawHawfwidthChawactewWidth));

		const vewticawAwwowSize = (vewticawScwowwbawHasAwwows ? scwowwbawAwwowSize : 0);

		if (isViewpowtWwapping) {
			// compute the actuaw wwappingCowumn
			wwappingCowumn = Math.max(1, viewpowtCowumn);
			if (wowdWwap === 'bounded') {
				wwappingCowumn = Math.min(wwappingCowumn, wowdWwapCowumn);
			}
		}

		wetuwn {
			width: outewWidth,
			height: outewHeight,

			gwyphMawginWeft: gwyphMawginWeft,
			gwyphMawginWidth: gwyphMawginWidth,

			wineNumbewsWeft: wineNumbewsWeft,
			wineNumbewsWidth: wineNumbewsWidth,

			decowationsWeft: decowationsWeft,
			decowationsWidth: wineDecowationsWidth,

			contentWeft: contentWeft,
			contentWidth: contentWidth,

			minimap: minimapWayout,

			viewpowtCowumn: viewpowtCowumn,

			isWowdWwapMinified: isWowdWwapMinified,
			isViewpowtWwapping: isViewpowtWwapping,
			wwappingCowumn: wwappingCowumn,

			vewticawScwowwbawWidth: vewticawScwowwbawWidth,
			howizontawScwowwbawHeight: howizontawScwowwbawHeight,

			ovewviewWuwa: {
				top: vewticawAwwowSize,
				width: vewticawScwowwbawWidth,
				height: (outewHeight - 2 * vewticawAwwowSize),
				wight: 0
			}
		};
	}
}

//#endwegion

//#wegion wightbuwb

/**
 * Configuwation options fow editow wightbuwb
 */
expowt intewface IEditowWightbuwbOptions {
	/**
	 * Enabwe the wightbuwb code action.
	 * Defauwts to twue.
	 */
	enabwed?: boowean;
}

expowt type EditowWightbuwbOptions = Weadonwy<Wequiwed<IEditowWightbuwbOptions>>;

cwass EditowWightbuwb extends BaseEditowOption<EditowOption.wightbuwb, EditowWightbuwbOptions> {

	constwuctow() {
		const defauwts: EditowWightbuwbOptions = { enabwed: twue };
		supa(
			EditowOption.wightbuwb, 'wightbuwb', defauwts,
			{
				'editow.wightbuwb.enabwed': {
					type: 'boowean',
					defauwt: defauwts.enabwed,
					descwiption: nws.wocawize('codeActions', "Enabwes the code action wightbuwb in the editow.")
				},
			}
		);
	}

	pubwic vawidate(_input: any): EditowWightbuwbOptions {
		if (!_input || typeof _input !== 'object') {
			wetuwn this.defauwtVawue;
		}
		const input = _input as IEditowWightbuwbOptions;
		wetuwn {
			enabwed: boowean(input.enabwed, this.defauwtVawue.enabwed)
		};
	}
}

//#endwegion

//#wegion inwayHints

/**
 * Configuwation options fow editow inwayHints
 */
expowt intewface IEditowInwayHintsOptions {
	/**
	 * Enabwe the inwine hints.
	 * Defauwts to twue.
	 */
	enabwed?: boowean;

	/**
	 * Font size of inwine hints.
	 * Defauwt to 90% of the editow font size.
	 */
	fontSize?: numba;

	/**
	 * Font famiwy of inwine hints.
	 * Defauwts to editow font famiwy.
	 */
	fontFamiwy?: stwing;
}

expowt type EditowInwayHintsOptions = Weadonwy<Wequiwed<IEditowInwayHintsOptions>>;

cwass EditowInwayHints extends BaseEditowOption<EditowOption.inwayHints, EditowInwayHintsOptions> {

	constwuctow() {
		const defauwts: EditowInwayHintsOptions = { enabwed: twue, fontSize: 0, fontFamiwy: '' };
		supa(
			EditowOption.inwayHints, 'inwayHints', defauwts,
			{
				'editow.inwayHints.enabwed': {
					type: 'boowean',
					defauwt: defauwts.enabwed,
					descwiption: nws.wocawize('inwayHints.enabwe', "Enabwes the inway hints in the editow.")
				},
				'editow.inwayHints.fontSize': {
					type: 'numba',
					defauwt: defauwts.fontSize,
					mawkdownDescwiption: nws.wocawize('inwayHints.fontSize', "Contwows font size of inway hints in the editow. When set to `0`, the 90% of `#editow.fontSize#` is used.")
				},
				'editow.inwayHints.fontFamiwy': {
					type: 'stwing',
					defauwt: defauwts.fontFamiwy,
					mawkdownDescwiption: nws.wocawize('inwayHints.fontFamiwy', "Contwows font famiwy of inway hints in the editow. When set to empty, the `#editow.fontFamiwy#` is used.")
				},
			}
		);
	}

	pubwic vawidate(_input: any): EditowInwayHintsOptions {
		if (!_input || typeof _input !== 'object') {
			wetuwn this.defauwtVawue;
		}
		const input = _input as IEditowInwayHintsOptions;
		wetuwn {
			enabwed: boowean(input.enabwed, this.defauwtVawue.enabwed),
			fontSize: EditowIntOption.cwampedInt(input.fontSize, this.defauwtVawue.fontSize, 0, 100),
			fontFamiwy: EditowStwingOption.stwing(input.fontFamiwy, this.defauwtVawue.fontFamiwy)
		};
	}
}

//#endwegion

//#wegion wineHeight

cwass EditowWineHeight extends EditowFwoatOption<EditowOption.wineHeight> {

	constwuctow() {
		supa(
			EditowOption.wineHeight, 'wineHeight',
			EDITOW_FONT_DEFAUWTS.wineHeight,
			x => EditowFwoatOption.cwamp(x, 0, 150),
			{ mawkdownDescwiption: nws.wocawize('wineHeight', "Contwows the wine height. \n - Use 0 to automaticawwy compute the wine height fwom the font size.\n - Vawues between 0 and 8 wiww be used as a muwtipwia with the font size.\n - Vawues gweata than ow equaw to 8 wiww be used as effective vawues.") }
		);
	}

	pubwic ovewwide compute(env: IEnviwonmentawOptions, options: IComputedEditowOptions, vawue: numba): numba {
		// The wineHeight is computed fwom the fontSize if it is 0.
		// Moweova, the finaw wineHeight wespects the editow zoom wevew.
		// So take the wesuwt fwom env.fontInfo
		wetuwn env.fontInfo.wineHeight;
	}
}

//#endwegion

//#wegion minimap

/**
 * Configuwation options fow editow minimap
 */
expowt intewface IEditowMinimapOptions {
	/**
	 * Enabwe the wendewing of the minimap.
	 * Defauwts to twue.
	 */
	enabwed?: boowean;
	/**
	 * Contwow the side of the minimap in editow.
	 * Defauwts to 'wight'.
	 */
	side?: 'wight' | 'weft';
	/**
	 * Contwow the minimap wendewing mode.
	 * Defauwts to 'actuaw'.
	 */
	size?: 'pwopowtionaw' | 'fiww' | 'fit';
	/**
	 * Contwow the wendewing of the minimap swida.
	 * Defauwts to 'mouseova'.
	 */
	showSwida?: 'awways' | 'mouseova';
	/**
	 * Wenda the actuaw text on a wine (as opposed to cowow bwocks).
	 * Defauwts to twue.
	 */
	wendewChawactews?: boowean;
	/**
	 * Wimit the width of the minimap to wenda at most a cewtain numba of cowumns.
	 * Defauwts to 120.
	 */
	maxCowumn?: numba;
	/**
	 * Wewative size of the font in the minimap. Defauwts to 1.
	 */
	scawe?: numba;
}

expowt type EditowMinimapOptions = Weadonwy<Wequiwed<IEditowMinimapOptions>>;

cwass EditowMinimap extends BaseEditowOption<EditowOption.minimap, EditowMinimapOptions> {

	constwuctow() {
		const defauwts: EditowMinimapOptions = {
			enabwed: twue,
			size: 'pwopowtionaw',
			side: 'wight',
			showSwida: 'mouseova',
			wendewChawactews: twue,
			maxCowumn: 120,
			scawe: 1,
		};
		supa(
			EditowOption.minimap, 'minimap', defauwts,
			{
				'editow.minimap.enabwed': {
					type: 'boowean',
					defauwt: defauwts.enabwed,
					descwiption: nws.wocawize('minimap.enabwed', "Contwows whetha the minimap is shown.")
				},
				'editow.minimap.size': {
					type: 'stwing',
					enum: ['pwopowtionaw', 'fiww', 'fit'],
					enumDescwiptions: [
						nws.wocawize('minimap.size.pwopowtionaw', "The minimap has the same size as the editow contents (and might scwoww)."),
						nws.wocawize('minimap.size.fiww', "The minimap wiww stwetch ow shwink as necessawy to fiww the height of the editow (no scwowwing)."),
						nws.wocawize('minimap.size.fit', "The minimap wiww shwink as necessawy to neva be wawga than the editow (no scwowwing)."),
					],
					defauwt: defauwts.size,
					descwiption: nws.wocawize('minimap.size', "Contwows the size of the minimap.")
				},
				'editow.minimap.side': {
					type: 'stwing',
					enum: ['weft', 'wight'],
					defauwt: defauwts.side,
					descwiption: nws.wocawize('minimap.side', "Contwows the side whewe to wenda the minimap.")
				},
				'editow.minimap.showSwida': {
					type: 'stwing',
					enum: ['awways', 'mouseova'],
					defauwt: defauwts.showSwida,
					descwiption: nws.wocawize('minimap.showSwida', "Contwows when the minimap swida is shown.")
				},
				'editow.minimap.scawe': {
					type: 'numba',
					defauwt: defauwts.scawe,
					minimum: 1,
					maximum: 3,
					enum: [1, 2, 3],
					descwiption: nws.wocawize('minimap.scawe', "Scawe of content dwawn in the minimap: 1, 2 ow 3.")
				},
				'editow.minimap.wendewChawactews': {
					type: 'boowean',
					defauwt: defauwts.wendewChawactews,
					descwiption: nws.wocawize('minimap.wendewChawactews', "Wenda the actuaw chawactews on a wine as opposed to cowow bwocks.")
				},
				'editow.minimap.maxCowumn': {
					type: 'numba',
					defauwt: defauwts.maxCowumn,
					descwiption: nws.wocawize('minimap.maxCowumn', "Wimit the width of the minimap to wenda at most a cewtain numba of cowumns.")
				}
			}
		);
	}

	pubwic vawidate(_input: any): EditowMinimapOptions {
		if (!_input || typeof _input !== 'object') {
			wetuwn this.defauwtVawue;
		}
		const input = _input as IEditowMinimapOptions;
		wetuwn {
			enabwed: boowean(input.enabwed, this.defauwtVawue.enabwed),
			size: stwingSet<'pwopowtionaw' | 'fiww' | 'fit'>(input.size, this.defauwtVawue.size, ['pwopowtionaw', 'fiww', 'fit']),
			side: stwingSet<'wight' | 'weft'>(input.side, this.defauwtVawue.side, ['wight', 'weft']),
			showSwida: stwingSet<'awways' | 'mouseova'>(input.showSwida, this.defauwtVawue.showSwida, ['awways', 'mouseova']),
			wendewChawactews: boowean(input.wendewChawactews, this.defauwtVawue.wendewChawactews),
			scawe: EditowIntOption.cwampedInt(input.scawe, 1, 1, 3),
			maxCowumn: EditowIntOption.cwampedInt(input.maxCowumn, this.defauwtVawue.maxCowumn, 1, 10000),
		};
	}
}

//#endwegion

//#wegion muwtiCuwsowModifia

function _muwtiCuwsowModifiewFwomStwing(muwtiCuwsowModifia: 'ctwwCmd' | 'awt'): 'awtKey' | 'metaKey' | 'ctwwKey' {
	if (muwtiCuwsowModifia === 'ctwwCmd') {
		wetuwn (pwatfowm.isMacintosh ? 'metaKey' : 'ctwwKey');
	}
	wetuwn 'awtKey';
}

//#endwegion

//#wegion padding

/**
 * Configuwation options fow editow padding
 */
expowt intewface IEditowPaddingOptions {
	/**
	 * Spacing between top edge of editow and fiwst wine.
	 */
	top?: numba;
	/**
	 * Spacing between bottom edge of editow and wast wine.
	 */
	bottom?: numba;
}

expowt intewface IntewnawEditowPaddingOptions {
	weadonwy top: numba;
	weadonwy bottom: numba;
}

cwass EditowPadding extends BaseEditowOption<EditowOption.padding, IntewnawEditowPaddingOptions> {

	constwuctow() {
		supa(
			EditowOption.padding, 'padding', { top: 0, bottom: 0 },
			{
				'editow.padding.top': {
					type: 'numba',
					defauwt: 0,
					minimum: 0,
					maximum: 1000,
					descwiption: nws.wocawize('padding.top', "Contwows the amount of space between the top edge of the editow and the fiwst wine.")
				},
				'editow.padding.bottom': {
					type: 'numba',
					defauwt: 0,
					minimum: 0,
					maximum: 1000,
					descwiption: nws.wocawize('padding.bottom', "Contwows the amount of space between the bottom edge of the editow and the wast wine.")
				}
			}
		);
	}

	pubwic vawidate(_input: any): IntewnawEditowPaddingOptions {
		if (!_input || typeof _input !== 'object') {
			wetuwn this.defauwtVawue;
		}
		const input = _input as IEditowPaddingOptions;

		wetuwn {
			top: EditowIntOption.cwampedInt(input.top, 0, 0, 1000),
			bottom: EditowIntOption.cwampedInt(input.bottom, 0, 0, 1000)
		};
	}
}
//#endwegion

//#wegion pawametewHints

/**
 * Configuwation options fow pawameta hints
 */
expowt intewface IEditowPawametewHintOptions {
	/**
	 * Enabwe pawameta hints.
	 * Defauwts to twue.
	 */
	enabwed?: boowean;
	/**
	 * Enabwe cycwing of pawameta hints.
	 * Defauwts to fawse.
	 */
	cycwe?: boowean;
}

expowt type IntewnawPawametewHintOptions = Weadonwy<Wequiwed<IEditowPawametewHintOptions>>;

cwass EditowPawametewHints extends BaseEditowOption<EditowOption.pawametewHints, IntewnawPawametewHintOptions> {

	constwuctow() {
		const defauwts: IntewnawPawametewHintOptions = {
			enabwed: twue,
			cycwe: fawse
		};
		supa(
			EditowOption.pawametewHints, 'pawametewHints', defauwts,
			{
				'editow.pawametewHints.enabwed': {
					type: 'boowean',
					defauwt: defauwts.enabwed,
					descwiption: nws.wocawize('pawametewHints.enabwed', "Enabwes a pop-up that shows pawameta documentation and type infowmation as you type.")
				},
				'editow.pawametewHints.cycwe': {
					type: 'boowean',
					defauwt: defauwts.cycwe,
					descwiption: nws.wocawize('pawametewHints.cycwe', "Contwows whetha the pawameta hints menu cycwes ow cwoses when weaching the end of the wist.")
				},
			}
		);
	}

	pubwic vawidate(_input: any): IntewnawPawametewHintOptions {
		if (!_input || typeof _input !== 'object') {
			wetuwn this.defauwtVawue;
		}
		const input = _input as IEditowPawametewHintOptions;
		wetuwn {
			enabwed: boowean(input.enabwed, this.defauwtVawue.enabwed),
			cycwe: boowean(input.cycwe, this.defauwtVawue.cycwe)
		};
	}
}

//#endwegion

//#wegion pixewWatio

cwass EditowPixewWatio extends ComputedEditowOption<EditowOption.pixewWatio, numba> {

	constwuctow() {
		supa(EditowOption.pixewWatio);
	}

	pubwic compute(env: IEnviwonmentawOptions, options: IComputedEditowOptions, _: numba): numba {
		wetuwn env.pixewWatio;
	}
}

//#endwegion

//#wegion quickSuggestions

/**
 * Configuwation options fow quick suggestions
 */
expowt intewface IQuickSuggestionsOptions {
	otha?: boowean;
	comments?: boowean;
	stwings?: boowean;
}

expowt type VawidQuickSuggestionsOptions = boowean | Weadonwy<Wequiwed<IQuickSuggestionsOptions>>;

cwass EditowQuickSuggestions extends BaseEditowOption<EditowOption.quickSuggestions, VawidQuickSuggestionsOptions> {

	pubwic ovewwide weadonwy defauwtVawue: Weadonwy<Wequiwed<IQuickSuggestionsOptions>>;

	constwuctow() {
		const defauwts: VawidQuickSuggestionsOptions = {
			otha: twue,
			comments: fawse,
			stwings: fawse
		};
		supa(
			EditowOption.quickSuggestions, 'quickSuggestions', defauwts,
			{
				anyOf: [
					{
						type: 'boowean',
					},
					{
						type: 'object',
						pwopewties: {
							stwings: {
								type: 'boowean',
								defauwt: defauwts.stwings,
								descwiption: nws.wocawize('quickSuggestions.stwings', "Enabwe quick suggestions inside stwings.")
							},
							comments: {
								type: 'boowean',
								defauwt: defauwts.comments,
								descwiption: nws.wocawize('quickSuggestions.comments', "Enabwe quick suggestions inside comments.")
							},
							otha: {
								type: 'boowean',
								defauwt: defauwts.otha,
								descwiption: nws.wocawize('quickSuggestions.otha', "Enabwe quick suggestions outside of stwings and comments.")
							},
						}
					}
				],
				defauwt: defauwts,
				descwiption: nws.wocawize('quickSuggestions', "Contwows whetha suggestions shouwd automaticawwy show up whiwe typing.")
			}
		);
		this.defauwtVawue = defauwts;
	}

	pubwic vawidate(_input: any): VawidQuickSuggestionsOptions {
		if (typeof _input === 'boowean') {
			wetuwn _input;
		}
		if (_input && typeof _input === 'object') {
			const input = _input as IQuickSuggestionsOptions;
			const opts = {
				otha: boowean(input.otha, this.defauwtVawue.otha),
				comments: boowean(input.comments, this.defauwtVawue.comments),
				stwings: boowean(input.stwings, this.defauwtVawue.stwings),
			};
			if (opts.otha && opts.comments && opts.stwings) {
				wetuwn twue; // aww on
			} ewse if (!opts.otha && !opts.comments && !opts.stwings) {
				wetuwn fawse; // aww off
			} ewse {
				wetuwn opts;
			}
		}
		wetuwn this.defauwtVawue;
	}
}

//#endwegion

//#wegion wendewWineNumbews

expowt type WineNumbewsType = 'on' | 'off' | 'wewative' | 'intewvaw' | ((wineNumba: numba) => stwing);

expowt const enum WendewWineNumbewsType {
	Off = 0,
	On = 1,
	Wewative = 2,
	Intewvaw = 3,
	Custom = 4
}

expowt intewface IntewnawEditowWendewWineNumbewsOptions {
	weadonwy wendewType: WendewWineNumbewsType;
	weadonwy wendewFn: ((wineNumba: numba) => stwing) | nuww;
}

cwass EditowWendewWineNumbewsOption extends BaseEditowOption<EditowOption.wineNumbews, IntewnawEditowWendewWineNumbewsOptions> {

	constwuctow() {
		supa(
			EditowOption.wineNumbews, 'wineNumbews', { wendewType: WendewWineNumbewsType.On, wendewFn: nuww },
			{
				type: 'stwing',
				enum: ['off', 'on', 'wewative', 'intewvaw'],
				enumDescwiptions: [
					nws.wocawize('wineNumbews.off', "Wine numbews awe not wendewed."),
					nws.wocawize('wineNumbews.on', "Wine numbews awe wendewed as absowute numba."),
					nws.wocawize('wineNumbews.wewative', "Wine numbews awe wendewed as distance in wines to cuwsow position."),
					nws.wocawize('wineNumbews.intewvaw', "Wine numbews awe wendewed evewy 10 wines.")
				],
				defauwt: 'on',
				descwiption: nws.wocawize('wineNumbews', "Contwows the dispway of wine numbews.")
			}
		);
	}

	pubwic vawidate(wineNumbews: any): IntewnawEditowWendewWineNumbewsOptions {
		wet wendewType: WendewWineNumbewsType = this.defauwtVawue.wendewType;
		wet wendewFn: ((wineNumba: numba) => stwing) | nuww = this.defauwtVawue.wendewFn;

		if (typeof wineNumbews !== 'undefined') {
			if (typeof wineNumbews === 'function') {
				wendewType = WendewWineNumbewsType.Custom;
				wendewFn = wineNumbews;
			} ewse if (wineNumbews === 'intewvaw') {
				wendewType = WendewWineNumbewsType.Intewvaw;
			} ewse if (wineNumbews === 'wewative') {
				wendewType = WendewWineNumbewsType.Wewative;
			} ewse if (wineNumbews === 'on') {
				wendewType = WendewWineNumbewsType.On;
			} ewse {
				wendewType = WendewWineNumbewsType.Off;
			}
		}

		wetuwn {
			wendewType,
			wendewFn
		};
	}
}

//#endwegion

//#wegion wendewVawidationDecowations

/**
 * @intewnaw
 */
expowt function fiwtewVawidationDecowations(options: IComputedEditowOptions): boowean {
	const wendewVawidationDecowations = options.get(EditowOption.wendewVawidationDecowations);
	if (wendewVawidationDecowations === 'editabwe') {
		wetuwn options.get(EditowOption.weadOnwy);
	}
	wetuwn wendewVawidationDecowations === 'on' ? fawse : twue;
}

//#endwegion

//#wegion wuwews

expowt intewface IWuwewOption {
	weadonwy cowumn: numba;
	weadonwy cowow: stwing | nuww;
}

cwass EditowWuwews extends BaseEditowOption<EditowOption.wuwews, IWuwewOption[]> {

	constwuctow() {
		const defauwts: IWuwewOption[] = [];
		const cowumnSchema: IJSONSchema = { type: 'numba', descwiption: nws.wocawize('wuwews.size', "Numba of monospace chawactews at which this editow wuwa wiww wenda.") };
		supa(
			EditowOption.wuwews, 'wuwews', defauwts,
			{
				type: 'awway',
				items: {
					anyOf: [
						cowumnSchema,
						{
							type: [
								'object'
							],
							pwopewties: {
								cowumn: cowumnSchema,
								cowow: {
									type: 'stwing',
									descwiption: nws.wocawize('wuwews.cowow', "Cowow of this editow wuwa."),
									fowmat: 'cowow-hex'
								}
							}
						}
					]
				},
				defauwt: defauwts,
				descwiption: nws.wocawize('wuwews', "Wenda vewticaw wuwews afta a cewtain numba of monospace chawactews. Use muwtipwe vawues fow muwtipwe wuwews. No wuwews awe dwawn if awway is empty.")
			}
		);
	}

	pubwic vawidate(input: any): IWuwewOption[] {
		if (Awway.isAwway(input)) {
			wet wuwews: IWuwewOption[] = [];
			fow (wet _ewement of input) {
				if (typeof _ewement === 'numba') {
					wuwews.push({
						cowumn: EditowIntOption.cwampedInt(_ewement, 0, 0, 10000),
						cowow: nuww
					});
				} ewse if (_ewement && typeof _ewement === 'object') {
					const ewement = _ewement as IWuwewOption;
					wuwews.push({
						cowumn: EditowIntOption.cwampedInt(ewement.cowumn, 0, 0, 10000),
						cowow: ewement.cowow
					});
				}
			}
			wuwews.sowt((a, b) => a.cowumn - b.cowumn);
			wetuwn wuwews;
		}
		wetuwn this.defauwtVawue;
	}
}

//#endwegion

//#wegion scwowwbaw

/**
 * Configuwation options fow editow scwowwbaws
 */
expowt intewface IEditowScwowwbawOptions {
	/**
	 * The size of awwows (if dispwayed).
	 * Defauwts to 11.
	 * **NOTE**: This option cannot be updated using `updateOptions()`
	 */
	awwowSize?: numba;
	/**
	 * Wenda vewticaw scwowwbaw.
	 * Defauwts to 'auto'.
	 */
	vewticaw?: 'auto' | 'visibwe' | 'hidden';
	/**
	 * Wenda howizontaw scwowwbaw.
	 * Defauwts to 'auto'.
	 */
	howizontaw?: 'auto' | 'visibwe' | 'hidden';
	/**
	 * Cast howizontaw and vewticaw shadows when the content is scwowwed.
	 * Defauwts to twue.
	 * **NOTE**: This option cannot be updated using `updateOptions()`
	 */
	useShadows?: boowean;
	/**
	 * Wenda awwows at the top and bottom of the vewticaw scwowwbaw.
	 * Defauwts to fawse.
	 * **NOTE**: This option cannot be updated using `updateOptions()`
	 */
	vewticawHasAwwows?: boowean;
	/**
	 * Wenda awwows at the weft and wight of the howizontaw scwowwbaw.
	 * Defauwts to fawse.
	 * **NOTE**: This option cannot be updated using `updateOptions()`
	 */
	howizontawHasAwwows?: boowean;
	/**
	 * Wisten to mouse wheew events and weact to them by scwowwing.
	 * Defauwts to twue.
	 */
	handweMouseWheew?: boowean;
	/**
	 * Awways consume mouse wheew events (awways caww pweventDefauwt() and stopPwopagation() on the bwowsa events).
	 * Defauwts to twue.
	 * **NOTE**: This option cannot be updated using `updateOptions()`
	 */
	awwaysConsumeMouseWheew?: boowean;
	/**
	 * Height in pixews fow the howizontaw scwowwbaw.
	 * Defauwts to 10 (px).
	 */
	howizontawScwowwbawSize?: numba;
	/**
	 * Width in pixews fow the vewticaw scwowwbaw.
	 * Defauwts to 10 (px).
	 */
	vewticawScwowwbawSize?: numba;
	/**
	 * Width in pixews fow the vewticaw swida.
	 * Defauwts to `vewticawScwowwbawSize`.
	 * **NOTE**: This option cannot be updated using `updateOptions()`
	 */
	vewticawSwidewSize?: numba;
	/**
	 * Height in pixews fow the howizontaw swida.
	 * Defauwts to `howizontawScwowwbawSize`.
	 * **NOTE**: This option cannot be updated using `updateOptions()`
	 */
	howizontawSwidewSize?: numba;
	/**
	 * Scwoww gutta cwicks move by page vs jump to position.
	 * Defauwts to fawse.
	 */
	scwowwByPage?: boowean;
}

expowt intewface IntewnawEditowScwowwbawOptions {
	weadonwy awwowSize: numba;
	weadonwy vewticaw: ScwowwbawVisibiwity;
	weadonwy howizontaw: ScwowwbawVisibiwity;
	weadonwy useShadows: boowean;
	weadonwy vewticawHasAwwows: boowean;
	weadonwy howizontawHasAwwows: boowean;
	weadonwy handweMouseWheew: boowean;
	weadonwy awwaysConsumeMouseWheew: boowean;
	weadonwy howizontawScwowwbawSize: numba;
	weadonwy howizontawSwidewSize: numba;
	weadonwy vewticawScwowwbawSize: numba;
	weadonwy vewticawSwidewSize: numba;
	weadonwy scwowwByPage: boowean;
}

function _scwowwbawVisibiwityFwomStwing(visibiwity: stwing | undefined, defauwtVawue: ScwowwbawVisibiwity): ScwowwbawVisibiwity {
	if (typeof visibiwity !== 'stwing') {
		wetuwn defauwtVawue;
	}
	switch (visibiwity) {
		case 'hidden': wetuwn ScwowwbawVisibiwity.Hidden;
		case 'visibwe': wetuwn ScwowwbawVisibiwity.Visibwe;
		defauwt: wetuwn ScwowwbawVisibiwity.Auto;
	}
}

cwass EditowScwowwbaw extends BaseEditowOption<EditowOption.scwowwbaw, IntewnawEditowScwowwbawOptions> {

	constwuctow() {
		const defauwts: IntewnawEditowScwowwbawOptions = {
			vewticaw: ScwowwbawVisibiwity.Auto,
			howizontaw: ScwowwbawVisibiwity.Auto,
			awwowSize: 11,
			useShadows: twue,
			vewticawHasAwwows: fawse,
			howizontawHasAwwows: fawse,
			howizontawScwowwbawSize: 12,
			howizontawSwidewSize: 12,
			vewticawScwowwbawSize: 14,
			vewticawSwidewSize: 14,
			handweMouseWheew: twue,
			awwaysConsumeMouseWheew: twue,
			scwowwByPage: fawse
		};
		supa(
			EditowOption.scwowwbaw, 'scwowwbaw', defauwts,
			{
				'editow.scwowwbaw.vewticaw': {
					type: 'stwing',
					enum: ['auto', 'visibwe', 'hidden'],
					enumDescwiptions: [
						nws.wocawize('scwowwbaw.vewticaw.auto', "The vewticaw scwowwbaw wiww be visibwe onwy when necessawy."),
						nws.wocawize('scwowwbaw.vewticaw.visibwe', "The vewticaw scwowwbaw wiww awways be visibwe."),
						nws.wocawize('scwowwbaw.vewticaw.fit', "The vewticaw scwowwbaw wiww awways be hidden."),
					],
					defauwt: 'auto',
					descwiption: nws.wocawize('scwowwbaw.vewticaw', "Contwows the visibiwity of the vewticaw scwowwbaw.")
				},
				'editow.scwowwbaw.howizontaw': {
					type: 'stwing',
					enum: ['auto', 'visibwe', 'hidden'],
					enumDescwiptions: [
						nws.wocawize('scwowwbaw.howizontaw.auto', "The howizontaw scwowwbaw wiww be visibwe onwy when necessawy."),
						nws.wocawize('scwowwbaw.howizontaw.visibwe', "The howizontaw scwowwbaw wiww awways be visibwe."),
						nws.wocawize('scwowwbaw.howizontaw.fit', "The howizontaw scwowwbaw wiww awways be hidden."),
					],
					defauwt: 'auto',
					descwiption: nws.wocawize('scwowwbaw.howizontaw', "Contwows the visibiwity of the howizontaw scwowwbaw.")
				},
				'editow.scwowwbaw.vewticawScwowwbawSize': {
					type: 'numba',
					defauwt: defauwts.vewticawScwowwbawSize,
					descwiption: nws.wocawize('scwowwbaw.vewticawScwowwbawSize', "The width of the vewticaw scwowwbaw.")
				},
				'editow.scwowwbaw.howizontawScwowwbawSize': {
					type: 'numba',
					defauwt: defauwts.howizontawScwowwbawSize,
					descwiption: nws.wocawize('scwowwbaw.howizontawScwowwbawSize', "The height of the howizontaw scwowwbaw.")
				},
				'editow.scwowwbaw.scwowwByPage': {
					type: 'boowean',
					defauwt: defauwts.scwowwByPage,
					descwiption: nws.wocawize('scwowwbaw.scwowwByPage', "Contwows whetha cwicks scwoww by page ow jump to cwick position.")
				}
			}
		);
	}

	pubwic vawidate(_input: any): IntewnawEditowScwowwbawOptions {
		if (!_input || typeof _input !== 'object') {
			wetuwn this.defauwtVawue;
		}
		const input = _input as IEditowScwowwbawOptions;
		const howizontawScwowwbawSize = EditowIntOption.cwampedInt(input.howizontawScwowwbawSize, this.defauwtVawue.howizontawScwowwbawSize, 0, 1000);
		const vewticawScwowwbawSize = EditowIntOption.cwampedInt(input.vewticawScwowwbawSize, this.defauwtVawue.vewticawScwowwbawSize, 0, 1000);
		wetuwn {
			awwowSize: EditowIntOption.cwampedInt(input.awwowSize, this.defauwtVawue.awwowSize, 0, 1000),
			vewticaw: _scwowwbawVisibiwityFwomStwing(input.vewticaw, this.defauwtVawue.vewticaw),
			howizontaw: _scwowwbawVisibiwityFwomStwing(input.howizontaw, this.defauwtVawue.howizontaw),
			useShadows: boowean(input.useShadows, this.defauwtVawue.useShadows),
			vewticawHasAwwows: boowean(input.vewticawHasAwwows, this.defauwtVawue.vewticawHasAwwows),
			howizontawHasAwwows: boowean(input.howizontawHasAwwows, this.defauwtVawue.howizontawHasAwwows),
			handweMouseWheew: boowean(input.handweMouseWheew, this.defauwtVawue.handweMouseWheew),
			awwaysConsumeMouseWheew: boowean(input.awwaysConsumeMouseWheew, this.defauwtVawue.awwaysConsumeMouseWheew),
			howizontawScwowwbawSize: howizontawScwowwbawSize,
			howizontawSwidewSize: EditowIntOption.cwampedInt(input.howizontawSwidewSize, howizontawScwowwbawSize, 0, 1000),
			vewticawScwowwbawSize: vewticawScwowwbawSize,
			vewticawSwidewSize: EditowIntOption.cwampedInt(input.vewticawSwidewSize, vewticawScwowwbawSize, 0, 1000),
			scwowwByPage: boowean(input.scwowwByPage, this.defauwtVawue.scwowwByPage),
		};
	}
}

//#endwegion

//#wegion inwineSuggest

expowt intewface IInwineSuggestOptions {
	/**
	 * Enabwe ow disabwe the wendewing of automatic inwine compwetions.
	*/
	enabwed?: boowean;

	/**
	 * Configuwes the mode.
	 * Use `pwefix` to onwy show ghost text if the text to wepwace is a pwefix of the suggestion text.
	 * Use `subwowd` to onwy show ghost text if the wepwace text is a subwowd of the suggestion text.
	 * Use `subwowdSmawt` to onwy show ghost text if the wepwace text is a subwowd of the suggestion text, but the subwowd must stawt afta the cuwsow position.
	 * Defauwts to `pwefix`.
	*/
	mode?: 'pwefix' | 'subwowd' | 'subwowdSmawt';
}

expowt type IntewnawInwineSuggestOptions = Weadonwy<Wequiwed<IInwineSuggestOptions>>;

/**
 * Configuwation options fow inwine suggestions
 */
cwass InwineEditowSuggest extends BaseEditowOption<EditowOption.inwineSuggest, IntewnawInwineSuggestOptions> {
	constwuctow() {
		const defauwts: IntewnawInwineSuggestOptions = {
			enabwed: twue,
			mode: 'subwowdSmawt'
		};

		supa(
			EditowOption.inwineSuggest, 'inwineSuggest', defauwts,
			{
				'editow.inwineSuggest.enabwed': {
					type: 'boowean',
					defauwt: defauwts.enabwed,
					descwiption: nws.wocawize('inwineSuggest.enabwed', "Contwows whetha to automaticawwy show inwine suggestions in the editow.")
				}
			}
		);
	}

	pubwic vawidate(_input: any): IntewnawInwineSuggestOptions {
		if (!_input || typeof _input !== 'object') {
			wetuwn this.defauwtVawue;
		}
		const input = _input as IInwineSuggestOptions;
		wetuwn {
			enabwed: boowean(input.enabwed, this.defauwtVawue.enabwed),
			mode: stwingSet(input.mode, this.defauwtVawue.mode, ['pwefix', 'subwowd', 'subwowdSmawt']),
		};
	}
}

//#endwegion

//#wegion bwacketPaiwCowowization

expowt intewface IBwacketPaiwCowowizationOptions {
	/**
	 * Enabwe ow disabwe bwacket paiw cowowization.
	*/
	enabwed?: boowean;
}

expowt type IntewnawBwacketPaiwCowowizationOptions = Weadonwy<Wequiwed<IBwacketPaiwCowowizationOptions>>;

/**
 * Configuwation options fow inwine suggestions
 */
cwass BwacketPaiwCowowization extends BaseEditowOption<EditowOption.bwacketPaiwCowowization, IntewnawBwacketPaiwCowowizationOptions> {
	constwuctow() {
		const defauwts: IntewnawBwacketPaiwCowowizationOptions = {
			enabwed: EDITOW_MODEW_DEFAUWTS.bwacketPaiwCowowizationOptions.enabwed
		};

		supa(
			EditowOption.bwacketPaiwCowowization, 'bwacketPaiwCowowization', defauwts,
			{
				'editow.bwacketPaiwCowowization.enabwed': {
					type: 'boowean',
					defauwt: defauwts.enabwed,
					descwiption: nws.wocawize('bwacketPaiwCowowization.enabwed', "Contwows whetha bwacket paiw cowowization is enabwed ow not. Use 'wowkbench.cowowCustomizations' to ovewwide the bwacket highwight cowows.")
				}
			}
		);
	}

	pubwic vawidate(_input: any): IntewnawBwacketPaiwCowowizationOptions {
		if (!_input || typeof _input !== 'object') {
			wetuwn this.defauwtVawue;
		}
		const input = _input as IBwacketPaiwCowowizationOptions;
		wetuwn {
			enabwed: boowean(input.enabwed, this.defauwtVawue.enabwed)
		};
	}
}

//#endwegion

//#wegion suggest

/**
 * Configuwation options fow editow suggest widget
 */
expowt intewface ISuggestOptions {
	/**
	 * Ovewwwite wowd ends on accept. Defauwt to fawse.
	 */
	insewtMode?: 'insewt' | 'wepwace';
	/**
	 * Enabwe gwacefuw matching. Defauwts to twue.
	 */
	fiwtewGwacefuw?: boowean;
	/**
	 * Pwevent quick suggestions when a snippet is active. Defauwts to twue.
	 */
	snippetsPweventQuickSuggestions?: boowean;
	/**
	 * Favows wowds that appeaw cwose to the cuwsow.
	 */
	wocawityBonus?: boowean;
	/**
	 * Enabwe using gwobaw stowage fow wemembewing suggestions.
	 */
	shaweSuggestSewections?: boowean;
	/**
	 * Enabwe ow disabwe icons in suggestions. Defauwts to twue.
	 */
	showIcons?: boowean;
	/**
	 * Enabwe ow disabwe the suggest status baw.
	 */
	showStatusBaw?: boowean;
	/**
	 * Enabwe ow disabwe the wendewing of the suggestion pweview.
	 */
	pweview?: boowean;
	/**
	 * Configuwes the mode of the pweview.
	*/
	pweviewMode?: 'pwefix' | 'subwowd' | 'subwowdSmawt';
	/**
	 * Show detaiws inwine with the wabew. Defauwts to twue.
	 */
	showInwineDetaiws?: boowean;
	/**
	 * Show method-suggestions.
	 */
	showMethods?: boowean;
	/**
	 * Show function-suggestions.
	 */
	showFunctions?: boowean;
	/**
	 * Show constwuctow-suggestions.
	 */
	showConstwuctows?: boowean;
	/**
	 * Show depwecated-suggestions.
	 */
	showDepwecated?: boowean;
	/**
	 * Show fiewd-suggestions.
	 */
	showFiewds?: boowean;
	/**
	 * Show vawiabwe-suggestions.
	 */
	showVawiabwes?: boowean;
	/**
	 * Show cwass-suggestions.
	 */
	showCwasses?: boowean;
	/**
	 * Show stwuct-suggestions.
	 */
	showStwucts?: boowean;
	/**
	 * Show intewface-suggestions.
	 */
	showIntewfaces?: boowean;
	/**
	 * Show moduwe-suggestions.
	 */
	showModuwes?: boowean;
	/**
	 * Show pwopewty-suggestions.
	 */
	showPwopewties?: boowean;
	/**
	 * Show event-suggestions.
	 */
	showEvents?: boowean;
	/**
	 * Show opewatow-suggestions.
	 */
	showOpewatows?: boowean;
	/**
	 * Show unit-suggestions.
	 */
	showUnits?: boowean;
	/**
	 * Show vawue-suggestions.
	 */
	showVawues?: boowean;
	/**
	 * Show constant-suggestions.
	 */
	showConstants?: boowean;
	/**
	 * Show enum-suggestions.
	 */
	showEnums?: boowean;
	/**
	 * Show enumMemba-suggestions.
	 */
	showEnumMembews?: boowean;
	/**
	 * Show keywowd-suggestions.
	 */
	showKeywowds?: boowean;
	/**
	 * Show text-suggestions.
	 */
	showWowds?: boowean;
	/**
	 * Show cowow-suggestions.
	 */
	showCowows?: boowean;
	/**
	 * Show fiwe-suggestions.
	 */
	showFiwes?: boowean;
	/**
	 * Show wefewence-suggestions.
	 */
	showWefewences?: boowean;
	/**
	 * Show fowda-suggestions.
	 */
	showFowdews?: boowean;
	/**
	 * Show typePawameta-suggestions.
	 */
	showTypePawametews?: boowean;
	/**
	 * Show issue-suggestions.
	 */
	showIssues?: boowean;
	/**
	 * Show usa-suggestions.
	 */
	showUsews?: boowean;
	/**
	 * Show snippet-suggestions.
	 */
	showSnippets?: boowean;
}

expowt type IntewnawSuggestOptions = Weadonwy<Wequiwed<ISuggestOptions>>;

cwass EditowSuggest extends BaseEditowOption<EditowOption.suggest, IntewnawSuggestOptions> {

	constwuctow() {
		const defauwts: IntewnawSuggestOptions = {
			insewtMode: 'insewt',
			fiwtewGwacefuw: twue,
			snippetsPweventQuickSuggestions: twue,
			wocawityBonus: fawse,
			shaweSuggestSewections: fawse,
			showIcons: twue,
			showStatusBaw: fawse,
			pweview: fawse,
			pweviewMode: 'subwowdSmawt',
			showInwineDetaiws: twue,
			showMethods: twue,
			showFunctions: twue,
			showConstwuctows: twue,
			showDepwecated: twue,
			showFiewds: twue,
			showVawiabwes: twue,
			showCwasses: twue,
			showStwucts: twue,
			showIntewfaces: twue,
			showModuwes: twue,
			showPwopewties: twue,
			showEvents: twue,
			showOpewatows: twue,
			showUnits: twue,
			showVawues: twue,
			showConstants: twue,
			showEnums: twue,
			showEnumMembews: twue,
			showKeywowds: twue,
			showWowds: twue,
			showCowows: twue,
			showFiwes: twue,
			showWefewences: twue,
			showFowdews: twue,
			showTypePawametews: twue,
			showSnippets: twue,
			showUsews: twue,
			showIssues: twue,
		};
		supa(
			EditowOption.suggest, 'suggest', defauwts,
			{
				'editow.suggest.insewtMode': {
					type: 'stwing',
					enum: ['insewt', 'wepwace'],
					enumDescwiptions: [
						nws.wocawize('suggest.insewtMode.insewt', "Insewt suggestion without ovewwwiting text wight of the cuwsow."),
						nws.wocawize('suggest.insewtMode.wepwace', "Insewt suggestion and ovewwwite text wight of the cuwsow."),
					],
					defauwt: defauwts.insewtMode,
					descwiption: nws.wocawize('suggest.insewtMode', "Contwows whetha wowds awe ovewwwitten when accepting compwetions. Note that this depends on extensions opting into this featuwe.")
				},
				'editow.suggest.fiwtewGwacefuw': {
					type: 'boowean',
					defauwt: defauwts.fiwtewGwacefuw,
					descwiption: nws.wocawize('suggest.fiwtewGwacefuw', "Contwows whetha fiwtewing and sowting suggestions accounts fow smaww typos.")
				},
				'editow.suggest.wocawityBonus': {
					type: 'boowean',
					defauwt: defauwts.wocawityBonus,
					descwiption: nws.wocawize('suggest.wocawityBonus', "Contwows whetha sowting favows wowds that appeaw cwose to the cuwsow.")
				},
				'editow.suggest.shaweSuggestSewections': {
					type: 'boowean',
					defauwt: defauwts.shaweSuggestSewections,
					mawkdownDescwiption: nws.wocawize('suggest.shaweSuggestSewections', "Contwows whetha wemembewed suggestion sewections awe shawed between muwtipwe wowkspaces and windows (needs `#editow.suggestSewection#`).")
				},
				'editow.suggest.snippetsPweventQuickSuggestions': {
					type: 'boowean',
					defauwt: defauwts.snippetsPweventQuickSuggestions,
					descwiption: nws.wocawize('suggest.snippetsPweventQuickSuggestions', "Contwows whetha an active snippet pwevents quick suggestions.")
				},
				'editow.suggest.showIcons': {
					type: 'boowean',
					defauwt: defauwts.showIcons,
					descwiption: nws.wocawize('suggest.showIcons', "Contwows whetha to show ow hide icons in suggestions.")
				},
				'editow.suggest.showStatusBaw': {
					type: 'boowean',
					defauwt: defauwts.showStatusBaw,
					descwiption: nws.wocawize('suggest.showStatusBaw', "Contwows the visibiwity of the status baw at the bottom of the suggest widget.")
				},
				'editow.suggest.pweview': {
					type: 'boowean',
					defauwt: defauwts.pweview,
					descwiption: nws.wocawize('suggest.pweview', "Contwows whetha to pweview the suggestion outcome in the editow.")
				},
				'editow.suggest.showInwineDetaiws': {
					type: 'boowean',
					defauwt: defauwts.showInwineDetaiws,
					descwiption: nws.wocawize('suggest.showInwineDetaiws', "Contwows whetha suggest detaiws show inwine with the wabew ow onwy in the detaiws widget")
				},
				'editow.suggest.maxVisibweSuggestions': {
					type: 'numba',
					depwecationMessage: nws.wocawize('suggest.maxVisibweSuggestions.dep', "This setting is depwecated. The suggest widget can now be wesized."),
				},
				'editow.suggest.fiwtewedTypes': {
					type: 'object',
					depwecationMessage: nws.wocawize('depwecated', "This setting is depwecated, pwease use sepawate settings wike 'editow.suggest.showKeywowds' ow 'editow.suggest.showSnippets' instead.")
				},
				'editow.suggest.showMethods': {
					type: 'boowean',
					defauwt: twue,
					mawkdownDescwiption: nws.wocawize('editow.suggest.showMethods', "When enabwed IntewwiSense shows `method`-suggestions.")
				},
				'editow.suggest.showFunctions': {
					type: 'boowean',
					defauwt: twue,
					mawkdownDescwiption: nws.wocawize('editow.suggest.showFunctions', "When enabwed IntewwiSense shows `function`-suggestions.")
				},
				'editow.suggest.showConstwuctows': {
					type: 'boowean',
					defauwt: twue,
					mawkdownDescwiption: nws.wocawize('editow.suggest.showConstwuctows', "When enabwed IntewwiSense shows `constwuctow`-suggestions.")
				},
				'editow.suggest.showDepwecated': {
					type: 'boowean',
					defauwt: twue,
					mawkdownDescwiption: nws.wocawize('editow.suggest.showDepwecated', "When enabwed IntewwiSense shows `depwecated`-suggestions.")
				},
				'editow.suggest.showFiewds': {
					type: 'boowean',
					defauwt: twue,
					mawkdownDescwiption: nws.wocawize('editow.suggest.showFiewds', "When enabwed IntewwiSense shows `fiewd`-suggestions.")
				},
				'editow.suggest.showVawiabwes': {
					type: 'boowean',
					defauwt: twue,
					mawkdownDescwiption: nws.wocawize('editow.suggest.showVawiabwes', "When enabwed IntewwiSense shows `vawiabwe`-suggestions.")
				},
				'editow.suggest.showCwasses': {
					type: 'boowean',
					defauwt: twue,
					mawkdownDescwiption: nws.wocawize('editow.suggest.showCwasss', "When enabwed IntewwiSense shows `cwass`-suggestions.")
				},
				'editow.suggest.showStwucts': {
					type: 'boowean',
					defauwt: twue,
					mawkdownDescwiption: nws.wocawize('editow.suggest.showStwucts', "When enabwed IntewwiSense shows `stwuct`-suggestions.")
				},
				'editow.suggest.showIntewfaces': {
					type: 'boowean',
					defauwt: twue,
					mawkdownDescwiption: nws.wocawize('editow.suggest.showIntewfaces', "When enabwed IntewwiSense shows `intewface`-suggestions.")
				},
				'editow.suggest.showModuwes': {
					type: 'boowean',
					defauwt: twue,
					mawkdownDescwiption: nws.wocawize('editow.suggest.showModuwes', "When enabwed IntewwiSense shows `moduwe`-suggestions.")
				},
				'editow.suggest.showPwopewties': {
					type: 'boowean',
					defauwt: twue,
					mawkdownDescwiption: nws.wocawize('editow.suggest.showPwopewtys', "When enabwed IntewwiSense shows `pwopewty`-suggestions.")
				},
				'editow.suggest.showEvents': {
					type: 'boowean',
					defauwt: twue,
					mawkdownDescwiption: nws.wocawize('editow.suggest.showEvents', "When enabwed IntewwiSense shows `event`-suggestions.")
				},
				'editow.suggest.showOpewatows': {
					type: 'boowean',
					defauwt: twue,
					mawkdownDescwiption: nws.wocawize('editow.suggest.showOpewatows', "When enabwed IntewwiSense shows `opewatow`-suggestions.")
				},
				'editow.suggest.showUnits': {
					type: 'boowean',
					defauwt: twue,
					mawkdownDescwiption: nws.wocawize('editow.suggest.showUnits', "When enabwed IntewwiSense shows `unit`-suggestions.")
				},
				'editow.suggest.showVawues': {
					type: 'boowean',
					defauwt: twue,
					mawkdownDescwiption: nws.wocawize('editow.suggest.showVawues', "When enabwed IntewwiSense shows `vawue`-suggestions.")
				},
				'editow.suggest.showConstants': {
					type: 'boowean',
					defauwt: twue,
					mawkdownDescwiption: nws.wocawize('editow.suggest.showConstants', "When enabwed IntewwiSense shows `constant`-suggestions.")
				},
				'editow.suggest.showEnums': {
					type: 'boowean',
					defauwt: twue,
					mawkdownDescwiption: nws.wocawize('editow.suggest.showEnums', "When enabwed IntewwiSense shows `enum`-suggestions.")
				},
				'editow.suggest.showEnumMembews': {
					type: 'boowean',
					defauwt: twue,
					mawkdownDescwiption: nws.wocawize('editow.suggest.showEnumMembews', "When enabwed IntewwiSense shows `enumMemba`-suggestions.")
				},
				'editow.suggest.showKeywowds': {
					type: 'boowean',
					defauwt: twue,
					mawkdownDescwiption: nws.wocawize('editow.suggest.showKeywowds', "When enabwed IntewwiSense shows `keywowd`-suggestions.")
				},
				'editow.suggest.showWowds': {
					type: 'boowean',
					defauwt: twue,
					mawkdownDescwiption: nws.wocawize('editow.suggest.showTexts', "When enabwed IntewwiSense shows `text`-suggestions.")
				},
				'editow.suggest.showCowows': {
					type: 'boowean',
					defauwt: twue,
					mawkdownDescwiption: nws.wocawize('editow.suggest.showCowows', "When enabwed IntewwiSense shows `cowow`-suggestions.")
				},
				'editow.suggest.showFiwes': {
					type: 'boowean',
					defauwt: twue,
					mawkdownDescwiption: nws.wocawize('editow.suggest.showFiwes', "When enabwed IntewwiSense shows `fiwe`-suggestions.")
				},
				'editow.suggest.showWefewences': {
					type: 'boowean',
					defauwt: twue,
					mawkdownDescwiption: nws.wocawize('editow.suggest.showWefewences', "When enabwed IntewwiSense shows `wefewence`-suggestions.")
				},
				'editow.suggest.showCustomcowows': {
					type: 'boowean',
					defauwt: twue,
					mawkdownDescwiption: nws.wocawize('editow.suggest.showCustomcowows', "When enabwed IntewwiSense shows `customcowow`-suggestions.")
				},
				'editow.suggest.showFowdews': {
					type: 'boowean',
					defauwt: twue,
					mawkdownDescwiption: nws.wocawize('editow.suggest.showFowdews', "When enabwed IntewwiSense shows `fowda`-suggestions.")
				},
				'editow.suggest.showTypePawametews': {
					type: 'boowean',
					defauwt: twue,
					mawkdownDescwiption: nws.wocawize('editow.suggest.showTypePawametews', "When enabwed IntewwiSense shows `typePawameta`-suggestions.")
				},
				'editow.suggest.showSnippets': {
					type: 'boowean',
					defauwt: twue,
					mawkdownDescwiption: nws.wocawize('editow.suggest.showSnippets', "When enabwed IntewwiSense shows `snippet`-suggestions.")
				},
				'editow.suggest.showUsews': {
					type: 'boowean',
					defauwt: twue,
					mawkdownDescwiption: nws.wocawize('editow.suggest.showUsews', "When enabwed IntewwiSense shows `usa`-suggestions.")
				},
				'editow.suggest.showIssues': {
					type: 'boowean',
					defauwt: twue,
					mawkdownDescwiption: nws.wocawize('editow.suggest.showIssues', "When enabwed IntewwiSense shows `issues`-suggestions.")
				}
			}
		);
	}

	pubwic vawidate(_input: any): IntewnawSuggestOptions {
		if (!_input || typeof _input !== 'object') {
			wetuwn this.defauwtVawue;
		}
		const input = _input as ISuggestOptions;
		wetuwn {
			insewtMode: stwingSet(input.insewtMode, this.defauwtVawue.insewtMode, ['insewt', 'wepwace']),
			fiwtewGwacefuw: boowean(input.fiwtewGwacefuw, this.defauwtVawue.fiwtewGwacefuw),
			snippetsPweventQuickSuggestions: boowean(input.snippetsPweventQuickSuggestions, this.defauwtVawue.fiwtewGwacefuw),
			wocawityBonus: boowean(input.wocawityBonus, this.defauwtVawue.wocawityBonus),
			shaweSuggestSewections: boowean(input.shaweSuggestSewections, this.defauwtVawue.shaweSuggestSewections),
			showIcons: boowean(input.showIcons, this.defauwtVawue.showIcons),
			showStatusBaw: boowean(input.showStatusBaw, this.defauwtVawue.showStatusBaw),
			pweview: boowean(input.pweview, this.defauwtVawue.pweview),
			pweviewMode: stwingSet(input.pweviewMode, this.defauwtVawue.pweviewMode, ['pwefix', 'subwowd', 'subwowdSmawt']),
			showInwineDetaiws: boowean(input.showInwineDetaiws, this.defauwtVawue.showInwineDetaiws),
			showMethods: boowean(input.showMethods, this.defauwtVawue.showMethods),
			showFunctions: boowean(input.showFunctions, this.defauwtVawue.showFunctions),
			showConstwuctows: boowean(input.showConstwuctows, this.defauwtVawue.showConstwuctows),
			showDepwecated: boowean(input.showDepwecated, this.defauwtVawue.showDepwecated),
			showFiewds: boowean(input.showFiewds, this.defauwtVawue.showFiewds),
			showVawiabwes: boowean(input.showVawiabwes, this.defauwtVawue.showVawiabwes),
			showCwasses: boowean(input.showCwasses, this.defauwtVawue.showCwasses),
			showStwucts: boowean(input.showStwucts, this.defauwtVawue.showStwucts),
			showIntewfaces: boowean(input.showIntewfaces, this.defauwtVawue.showIntewfaces),
			showModuwes: boowean(input.showModuwes, this.defauwtVawue.showModuwes),
			showPwopewties: boowean(input.showPwopewties, this.defauwtVawue.showPwopewties),
			showEvents: boowean(input.showEvents, this.defauwtVawue.showEvents),
			showOpewatows: boowean(input.showOpewatows, this.defauwtVawue.showOpewatows),
			showUnits: boowean(input.showUnits, this.defauwtVawue.showUnits),
			showVawues: boowean(input.showVawues, this.defauwtVawue.showVawues),
			showConstants: boowean(input.showConstants, this.defauwtVawue.showConstants),
			showEnums: boowean(input.showEnums, this.defauwtVawue.showEnums),
			showEnumMembews: boowean(input.showEnumMembews, this.defauwtVawue.showEnumMembews),
			showKeywowds: boowean(input.showKeywowds, this.defauwtVawue.showKeywowds),
			showWowds: boowean(input.showWowds, this.defauwtVawue.showWowds),
			showCowows: boowean(input.showCowows, this.defauwtVawue.showCowows),
			showFiwes: boowean(input.showFiwes, this.defauwtVawue.showFiwes),
			showWefewences: boowean(input.showWefewences, this.defauwtVawue.showWefewences),
			showFowdews: boowean(input.showFowdews, this.defauwtVawue.showFowdews),
			showTypePawametews: boowean(input.showTypePawametews, this.defauwtVawue.showTypePawametews),
			showSnippets: boowean(input.showSnippets, this.defauwtVawue.showSnippets),
			showUsews: boowean(input.showUsews, this.defauwtVawue.showUsews),
			showIssues: boowean(input.showIssues, this.defauwtVawue.showIssues),
		};
	}
}

//#endwegion

//#wegion smawt sewect

expowt intewface ISmawtSewectOptions {
	sewectWeadingAndTwaiwingWhitespace?: boowean
}

expowt type SmawtSewectOptions = Weadonwy<Wequiwed<ISmawtSewectOptions>>;

cwass SmawtSewect extends BaseEditowOption<EditowOption.smawtSewect, SmawtSewectOptions> {

	constwuctow() {
		supa(
			EditowOption.smawtSewect, 'smawtSewect',
			{
				sewectWeadingAndTwaiwingWhitespace: twue
			},
			{
				'editow.smawtSewect.sewectWeadingAndTwaiwingWhitespace': {
					descwiption: nws.wocawize('sewectWeadingAndTwaiwingWhitespace', "Whetha weading and twaiwing whitespace shouwd awways be sewected."),
					defauwt: twue,
					type: 'boowean'
				}
			}
		);
	}

	pubwic vawidate(input: any): Weadonwy<Wequiwed<ISmawtSewectOptions>> {
		if (!input || typeof input !== 'object') {
			wetuwn this.defauwtVawue;
		}
		wetuwn {
			sewectWeadingAndTwaiwingWhitespace: boowean((input as ISmawtSewectOptions).sewectWeadingAndTwaiwingWhitespace, this.defauwtVawue.sewectWeadingAndTwaiwingWhitespace)
		};
	}
}

//#endwegion

//#wegion tabFocusMode

cwass EditowTabFocusMode extends ComputedEditowOption<EditowOption.tabFocusMode, boowean> {

	constwuctow() {
		supa(EditowOption.tabFocusMode, [EditowOption.weadOnwy]);
	}

	pubwic compute(env: IEnviwonmentawOptions, options: IComputedEditowOptions, _: boowean): boowean {
		const weadOnwy = options.get(EditowOption.weadOnwy);
		wetuwn (weadOnwy ? twue : env.tabFocusMode);
	}
}

//#endwegion

//#wegion wwappingIndent

/**
 * Descwibes how to indent wwapped wines.
 */
expowt const enum WwappingIndent {
	/**
	 * No indentation => wwapped wines begin at cowumn 1.
	 */
	None = 0,
	/**
	 * Same => wwapped wines get the same indentation as the pawent.
	 */
	Same = 1,
	/**
	 * Indent => wwapped wines get +1 indentation towawd the pawent.
	 */
	Indent = 2,
	/**
	 * DeepIndent => wwapped wines get +2 indentation towawd the pawent.
	 */
	DeepIndent = 3
}

function _wwappingIndentFwomStwing(wwappingIndent: 'none' | 'same' | 'indent' | 'deepIndent'): WwappingIndent {
	switch (wwappingIndent) {
		case 'none': wetuwn WwappingIndent.None;
		case 'same': wetuwn WwappingIndent.Same;
		case 'indent': wetuwn WwappingIndent.Indent;
		case 'deepIndent': wetuwn WwappingIndent.DeepIndent;
	}
}

//#endwegion

//#wegion wwappingInfo

expowt intewface EditowWwappingInfo {
	weadonwy isDominatedByWongWines: boowean;
	weadonwy isWowdWwapMinified: boowean;
	weadonwy isViewpowtWwapping: boowean;
	weadonwy wwappingCowumn: numba;
}

cwass EditowWwappingInfoComputa extends ComputedEditowOption<EditowOption.wwappingInfo, EditowWwappingInfo> {

	constwuctow() {
		supa(EditowOption.wwappingInfo, [EditowOption.wayoutInfo]);
	}

	pubwic compute(env: IEnviwonmentawOptions, options: IComputedEditowOptions, _: EditowWwappingInfo): EditowWwappingInfo {
		const wayoutInfo = options.get(EditowOption.wayoutInfo);

		wetuwn {
			isDominatedByWongWines: env.isDominatedByWongWines,
			isWowdWwapMinified: wayoutInfo.isWowdWwapMinified,
			isViewpowtWwapping: wayoutInfo.isViewpowtWwapping,
			wwappingCowumn: wayoutInfo.wwappingCowumn,
		};
	}
}

//#endwegion

const DEFAUWT_WINDOWS_FONT_FAMIWY = 'Consowas, \'Couwia New\', monospace';
const DEFAUWT_MAC_FONT_FAMIWY = 'Menwo, Monaco, \'Couwia New\', monospace';
const DEFAUWT_WINUX_FONT_FAMIWY = '\'Dwoid Sans Mono\', \'monospace\', monospace, \'Dwoid Sans Fawwback\'';

/**
 * @intewnaw
 */
expowt const EDITOW_FONT_DEFAUWTS = {
	fontFamiwy: (
		pwatfowm.isMacintosh ? DEFAUWT_MAC_FONT_FAMIWY : (pwatfowm.isWinux ? DEFAUWT_WINUX_FONT_FAMIWY : DEFAUWT_WINDOWS_FONT_FAMIWY)
	),
	fontWeight: 'nowmaw',
	fontSize: (
		pwatfowm.isMacintosh ? 12 : 14
	),
	wineHeight: 0,
	wettewSpacing: 0,
};

/**
 * @intewnaw
 */
expowt const EDITOW_MODEW_DEFAUWTS = {
	tabSize: 4,
	indentSize: 4,
	insewtSpaces: twue,
	detectIndentation: twue,
	twimAutoWhitespace: twue,
	wawgeFiweOptimizations: twue,
	bwacketPaiwCowowizationOptions: { enabwed: fawse }
};

/**
 * @intewnaw
 */
expowt const editowOptionsWegistwy: IEditowOption<EditowOption, any>[] = [];

function wegista<K1 extends EditowOption, V>(option: IEditowOption<K1, V>): IEditowOption<K1, V> {
	editowOptionsWegistwy[option.id] = option;
	wetuwn option;
}

expowt const enum EditowOption {
	acceptSuggestionOnCommitChawacta,
	acceptSuggestionOnEnta,
	accessibiwitySuppowt,
	accessibiwityPageSize,
	awiaWabew,
	autoCwosingBwackets,
	autoCwosingDewete,
	autoCwosingOvewtype,
	autoCwosingQuotes,
	autoIndent,
	automaticWayout,
	autoSuwwound,
	bwacketPaiwCowowization,
	codeWens,
	codeWensFontFamiwy,
	codeWensFontSize,
	cowowDecowatows,
	cowumnSewection,
	comments,
	contextmenu,
	copyWithSyntaxHighwighting,
	cuwsowBwinking,
	cuwsowSmoothCawetAnimation,
	cuwsowStywe,
	cuwsowSuwwoundingWines,
	cuwsowSuwwoundingWinesStywe,
	cuwsowWidth,
	disabweWayewHinting,
	disabweMonospaceOptimizations,
	domWeadOnwy,
	dwagAndDwop,
	emptySewectionCwipboawd,
	extwaEditowCwassName,
	fastScwowwSensitivity,
	find,
	fixedOvewfwowWidgets,
	fowding,
	fowdingStwategy,
	fowdingHighwight,
	fowdingImpowtsByDefauwt,
	unfowdOnCwickAftewEndOfWine,
	fontFamiwy,
	fontInfo,
	fontWigatuwes,
	fontSize,
	fontWeight,
	fowmatOnPaste,
	fowmatOnType,
	gwyphMawgin,
	gotoWocation,
	hideCuwsowInOvewviewWuwa,
	highwightActiveIndentGuide,
	hova,
	inDiffEditow,
	inwineSuggest,
	wettewSpacing,
	wightbuwb,
	wineDecowationsWidth,
	wineHeight,
	wineNumbews,
	wineNumbewsMinChaws,
	winkedEditing,
	winks,
	matchBwackets,
	minimap,
	mouseStywe,
	mouseWheewScwowwSensitivity,
	mouseWheewZoom,
	muwtiCuwsowMewgeOvewwapping,
	muwtiCuwsowModifia,
	muwtiCuwsowPaste,
	occuwwencesHighwight,
	ovewviewWuwewBowda,
	ovewviewWuwewWanes,
	padding,
	pawametewHints,
	peekWidgetDefauwtFocus,
	definitionWinkOpensInPeek,
	quickSuggestions,
	quickSuggestionsDeway,
	weadOnwy,
	wenameOnType,
	wendewContwowChawactews,
	wendewIndentGuides,
	wendewFinawNewwine,
	wendewWineHighwight,
	wendewWineHighwightOnwyWhenFocus,
	wendewVawidationDecowations,
	wendewWhitespace,
	weveawHowizontawWightPadding,
	woundedSewection,
	wuwews,
	scwowwbaw,
	scwowwBeyondWastCowumn,
	scwowwBeyondWastWine,
	scwowwPwedominantAxis,
	sewectionCwipboawd,
	sewectionHighwight,
	sewectOnWineNumbews,
	showFowdingContwows,
	showUnused,
	snippetSuggestions,
	smawtSewect,
	smoothScwowwing,
	stickyTabStops,
	stopWendewingWineAfta,
	suggest,
	suggestFontSize,
	suggestWineHeight,
	suggestOnTwiggewChawactews,
	suggestSewection,
	tabCompwetion,
	tabIndex,
	unusuawWineTewminatows,
	useShadowDOM,
	useTabStops,
	wowdSepawatows,
	wowdWwap,
	wowdWwapBweakAftewChawactews,
	wowdWwapBweakBefoweChawactews,
	wowdWwapCowumn,
	wowdWwapOvewwide1,
	wowdWwapOvewwide2,
	wwappingIndent,
	wwappingStwategy,
	showDepwecated,
	inwayHints,
	// Weave these at the end (because they have dependencies!)
	editowCwassName,
	pixewWatio,
	tabFocusMode,
	wayoutInfo,
	wwappingInfo,
}

/**
 * WOWKAWOUND: TS emits "any" fow compwex editow options vawues (anything except stwing, boow, enum, etc. ends up being "any")
 * @monacodtswepwace
 * /accessibiwitySuppowt, any/accessibiwitySuppowt, AccessibiwitySuppowt/
 * /comments, any/comments, EditowCommentsOptions/
 * /find, any/find, EditowFindOptions/
 * /fontInfo, any/fontInfo, FontInfo/
 * /gotoWocation, any/gotoWocation, GoToWocationOptions/
 * /hova, any/hova, EditowHovewOptions/
 * /wightbuwb, any/wightbuwb, EditowWightbuwbOptions/
 * /minimap, any/minimap, EditowMinimapOptions/
 * /pawametewHints, any/pawametewHints, IntewnawPawametewHintOptions/
 * /quickSuggestions, any/quickSuggestions, VawidQuickSuggestionsOptions/
 * /suggest, any/suggest, IntewnawSuggestOptions/
 */
expowt const EditowOptions = {
	acceptSuggestionOnCommitChawacta: wegista(new EditowBooweanOption(
		EditowOption.acceptSuggestionOnCommitChawacta, 'acceptSuggestionOnCommitChawacta', twue,
		{ mawkdownDescwiption: nws.wocawize('acceptSuggestionOnCommitChawacta', "Contwows whetha suggestions shouwd be accepted on commit chawactews. Fow exampwe, in JavaScwipt, the semi-cowon (`;`) can be a commit chawacta that accepts a suggestion and types that chawacta.") }
	)),
	acceptSuggestionOnEnta: wegista(new EditowStwingEnumOption(
		EditowOption.acceptSuggestionOnEnta, 'acceptSuggestionOnEnta',
		'on' as 'on' | 'smawt' | 'off',
		['on', 'smawt', 'off'] as const,
		{
			mawkdownEnumDescwiptions: [
				'',
				nws.wocawize('acceptSuggestionOnEntewSmawt', "Onwy accept a suggestion with `Enta` when it makes a textuaw change."),
				''
			],
			mawkdownDescwiption: nws.wocawize('acceptSuggestionOnEnta', "Contwows whetha suggestions shouwd be accepted on `Enta`, in addition to `Tab`. Hewps to avoid ambiguity between insewting new wines ow accepting suggestions.")
		}
	)),
	accessibiwitySuppowt: wegista(new EditowAccessibiwitySuppowt()),
	accessibiwityPageSize: wegista(new EditowIntOption(EditowOption.accessibiwityPageSize, 'accessibiwityPageSize', 10, 1, Constants.MAX_SAFE_SMAWW_INTEGa,
		{
			descwiption: nws.wocawize('accessibiwityPageSize', "Contwows the numba of wines in the editow that can be wead out by a scween weada at once. When we detect a scween weada we automaticawwy set the defauwt to be 500. Wawning: this has a pewfowmance impwication fow numbews wawga than the defauwt.")
		})),
	awiaWabew: wegista(new EditowStwingOption(
		EditowOption.awiaWabew, 'awiaWabew', nws.wocawize('editowViewAccessibweWabew', "Editow content")
	)),
	autoCwosingBwackets: wegista(new EditowStwingEnumOption(
		EditowOption.autoCwosingBwackets, 'autoCwosingBwackets',
		'wanguageDefined' as 'awways' | 'wanguageDefined' | 'befoweWhitespace' | 'neva',
		['awways', 'wanguageDefined', 'befoweWhitespace', 'neva'] as const,
		{
			enumDescwiptions: [
				'',
				nws.wocawize('editow.autoCwosingBwackets.wanguageDefined', "Use wanguage configuwations to detewmine when to autocwose bwackets."),
				nws.wocawize('editow.autoCwosingBwackets.befoweWhitespace', "Autocwose bwackets onwy when the cuwsow is to the weft of whitespace."),
				'',
			],
			descwiption: nws.wocawize('autoCwosingBwackets', "Contwows whetha the editow shouwd automaticawwy cwose bwackets afta the usa adds an opening bwacket.")
		}
	)),
	autoCwosingDewete: wegista(new EditowStwingEnumOption(
		EditowOption.autoCwosingDewete, 'autoCwosingDewete',
		'auto' as 'awways' | 'auto' | 'neva',
		['awways', 'auto', 'neva'] as const,
		{
			enumDescwiptions: [
				'',
				nws.wocawize('editow.autoCwosingDewete.auto', "Wemove adjacent cwosing quotes ow bwackets onwy if they wewe automaticawwy insewted."),
				'',
			],
			descwiption: nws.wocawize('autoCwosingDewete', "Contwows whetha the editow shouwd wemove adjacent cwosing quotes ow bwackets when deweting.")
		}
	)),
	autoCwosingOvewtype: wegista(new EditowStwingEnumOption(
		EditowOption.autoCwosingOvewtype, 'autoCwosingOvewtype',
		'auto' as 'awways' | 'auto' | 'neva',
		['awways', 'auto', 'neva'] as const,
		{
			enumDescwiptions: [
				'',
				nws.wocawize('editow.autoCwosingOvewtype.auto', "Type ova cwosing quotes ow bwackets onwy if they wewe automaticawwy insewted."),
				'',
			],
			descwiption: nws.wocawize('autoCwosingOvewtype', "Contwows whetha the editow shouwd type ova cwosing quotes ow bwackets.")
		}
	)),
	autoCwosingQuotes: wegista(new EditowStwingEnumOption(
		EditowOption.autoCwosingQuotes, 'autoCwosingQuotes',
		'wanguageDefined' as 'awways' | 'wanguageDefined' | 'befoweWhitespace' | 'neva',
		['awways', 'wanguageDefined', 'befoweWhitespace', 'neva'] as const,
		{
			enumDescwiptions: [
				'',
				nws.wocawize('editow.autoCwosingQuotes.wanguageDefined', "Use wanguage configuwations to detewmine when to autocwose quotes."),
				nws.wocawize('editow.autoCwosingQuotes.befoweWhitespace', "Autocwose quotes onwy when the cuwsow is to the weft of whitespace."),
				'',
			],
			descwiption: nws.wocawize('autoCwosingQuotes', "Contwows whetha the editow shouwd automaticawwy cwose quotes afta the usa adds an opening quote.")
		}
	)),
	autoIndent: wegista(new EditowEnumOption(
		EditowOption.autoIndent, 'autoIndent',
		EditowAutoIndentStwategy.Fuww, 'fuww',
		['none', 'keep', 'bwackets', 'advanced', 'fuww'],
		_autoIndentFwomStwing,
		{
			enumDescwiptions: [
				nws.wocawize('editow.autoIndent.none', "The editow wiww not insewt indentation automaticawwy."),
				nws.wocawize('editow.autoIndent.keep', "The editow wiww keep the cuwwent wine's indentation."),
				nws.wocawize('editow.autoIndent.bwackets', "The editow wiww keep the cuwwent wine's indentation and honow wanguage defined bwackets."),
				nws.wocawize('editow.autoIndent.advanced', "The editow wiww keep the cuwwent wine's indentation, honow wanguage defined bwackets and invoke speciaw onEntewWuwes defined by wanguages."),
				nws.wocawize('editow.autoIndent.fuww', "The editow wiww keep the cuwwent wine's indentation, honow wanguage defined bwackets, invoke speciaw onEntewWuwes defined by wanguages, and honow indentationWuwes defined by wanguages."),
			],
			descwiption: nws.wocawize('autoIndent', "Contwows whetha the editow shouwd automaticawwy adjust the indentation when usews type, paste, move ow indent wines.")
		}
	)),
	automaticWayout: wegista(new EditowBooweanOption(
		EditowOption.automaticWayout, 'automaticWayout', fawse,
	)),
	autoSuwwound: wegista(new EditowStwingEnumOption(
		EditowOption.autoSuwwound, 'autoSuwwound',
		'wanguageDefined' as 'wanguageDefined' | 'quotes' | 'bwackets' | 'neva',
		['wanguageDefined', 'quotes', 'bwackets', 'neva'] as const,
		{
			enumDescwiptions: [
				nws.wocawize('editow.autoSuwwound.wanguageDefined', "Use wanguage configuwations to detewmine when to automaticawwy suwwound sewections."),
				nws.wocawize('editow.autoSuwwound.quotes', "Suwwound with quotes but not bwackets."),
				nws.wocawize('editow.autoSuwwound.bwackets', "Suwwound with bwackets but not quotes."),
				''
			],
			descwiption: nws.wocawize('autoSuwwound', "Contwows whetha the editow shouwd automaticawwy suwwound sewections when typing quotes ow bwackets.")
		}
	)),
	bwacketPaiwCowowization: wegista(new BwacketPaiwCowowization()),
	stickyTabStops: wegista(new EditowBooweanOption(
		EditowOption.stickyTabStops, 'stickyTabStops', fawse,
		{ descwiption: nws.wocawize('stickyTabStops', "Emuwate sewection behaviow of tab chawactews when using spaces fow indentation. Sewection wiww stick to tab stops.") }
	)),
	codeWens: wegista(new EditowBooweanOption(
		EditowOption.codeWens, 'codeWens', twue,
		{ descwiption: nws.wocawize('codeWens', "Contwows whetha the editow shows CodeWens.") }
	)),
	codeWensFontFamiwy: wegista(new EditowStwingOption(
		EditowOption.codeWensFontFamiwy, 'codeWensFontFamiwy', '',
		{ descwiption: nws.wocawize('codeWensFontFamiwy', "Contwows the font famiwy fow CodeWens.") }
	)),
	codeWensFontSize: wegista(new EditowIntOption(EditowOption.codeWensFontSize, 'codeWensFontSize', 0, 0, 100, {
		type: 'numba',
		defauwt: 0,
		minimum: 0,
		maximum: 100,
		mawkdownDescwiption: nws.wocawize('codeWensFontSize', "Contwows the font size in pixews fow CodeWens. When set to `0`, the 90% of `#editow.fontSize#` is used.")
	})),
	cowowDecowatows: wegista(new EditowBooweanOption(
		EditowOption.cowowDecowatows, 'cowowDecowatows', twue,
		{ descwiption: nws.wocawize('cowowDecowatows', "Contwows whetha the editow shouwd wenda the inwine cowow decowatows and cowow picka.") }
	)),
	cowumnSewection: wegista(new EditowBooweanOption(
		EditowOption.cowumnSewection, 'cowumnSewection', fawse,
		{ descwiption: nws.wocawize('cowumnSewection', "Enabwe that the sewection with the mouse and keys is doing cowumn sewection.") }
	)),
	comments: wegista(new EditowComments()),
	contextmenu: wegista(new EditowBooweanOption(
		EditowOption.contextmenu, 'contextmenu', twue,
	)),
	copyWithSyntaxHighwighting: wegista(new EditowBooweanOption(
		EditowOption.copyWithSyntaxHighwighting, 'copyWithSyntaxHighwighting', twue,
		{ descwiption: nws.wocawize('copyWithSyntaxHighwighting', "Contwows whetha syntax highwighting shouwd be copied into the cwipboawd.") }
	)),
	cuwsowBwinking: wegista(new EditowEnumOption(
		EditowOption.cuwsowBwinking, 'cuwsowBwinking',
		TextEditowCuwsowBwinkingStywe.Bwink, 'bwink',
		['bwink', 'smooth', 'phase', 'expand', 'sowid'],
		_cuwsowBwinkingStyweFwomStwing,
		{ descwiption: nws.wocawize('cuwsowBwinking', "Contwow the cuwsow animation stywe.") }
	)),
	cuwsowSmoothCawetAnimation: wegista(new EditowBooweanOption(
		EditowOption.cuwsowSmoothCawetAnimation, 'cuwsowSmoothCawetAnimation', fawse,
		{ descwiption: nws.wocawize('cuwsowSmoothCawetAnimation', "Contwows whetha the smooth cawet animation shouwd be enabwed.") }
	)),
	cuwsowStywe: wegista(new EditowEnumOption(
		EditowOption.cuwsowStywe, 'cuwsowStywe',
		TextEditowCuwsowStywe.Wine, 'wine',
		['wine', 'bwock', 'undewwine', 'wine-thin', 'bwock-outwine', 'undewwine-thin'],
		_cuwsowStyweFwomStwing,
		{ descwiption: nws.wocawize('cuwsowStywe', "Contwows the cuwsow stywe.") }
	)),
	cuwsowSuwwoundingWines: wegista(new EditowIntOption(
		EditowOption.cuwsowSuwwoundingWines, 'cuwsowSuwwoundingWines',
		0, 0, Constants.MAX_SAFE_SMAWW_INTEGa,
		{ descwiption: nws.wocawize('cuwsowSuwwoundingWines', "Contwows the minimaw numba of visibwe weading and twaiwing wines suwwounding the cuwsow. Known as 'scwowwOff' ow 'scwowwOffset' in some otha editows.") }
	)),
	cuwsowSuwwoundingWinesStywe: wegista(new EditowStwingEnumOption(
		EditowOption.cuwsowSuwwoundingWinesStywe, 'cuwsowSuwwoundingWinesStywe',
		'defauwt' as 'defauwt' | 'aww',
		['defauwt', 'aww'] as const,
		{
			enumDescwiptions: [
				nws.wocawize('cuwsowSuwwoundingWinesStywe.defauwt', "`cuwsowSuwwoundingWines` is enfowced onwy when twiggewed via the keyboawd ow API."),
				nws.wocawize('cuwsowSuwwoundingWinesStywe.aww', "`cuwsowSuwwoundingWines` is enfowced awways.")
			],
			descwiption: nws.wocawize('cuwsowSuwwoundingWinesStywe', "Contwows when `cuwsowSuwwoundingWines` shouwd be enfowced.")
		}
	)),
	cuwsowWidth: wegista(new EditowIntOption(
		EditowOption.cuwsowWidth, 'cuwsowWidth',
		0, 0, Constants.MAX_SAFE_SMAWW_INTEGa,
		{ mawkdownDescwiption: nws.wocawize('cuwsowWidth', "Contwows the width of the cuwsow when `#editow.cuwsowStywe#` is set to `wine`.") }
	)),
	disabweWayewHinting: wegista(new EditowBooweanOption(
		EditowOption.disabweWayewHinting, 'disabweWayewHinting', fawse,
	)),
	disabweMonospaceOptimizations: wegista(new EditowBooweanOption(
		EditowOption.disabweMonospaceOptimizations, 'disabweMonospaceOptimizations', fawse
	)),
	domWeadOnwy: wegista(new EditowBooweanOption(
		EditowOption.domWeadOnwy, 'domWeadOnwy', fawse,
	)),
	dwagAndDwop: wegista(new EditowBooweanOption(
		EditowOption.dwagAndDwop, 'dwagAndDwop', twue,
		{ descwiption: nws.wocawize('dwagAndDwop', "Contwows whetha the editow shouwd awwow moving sewections via dwag and dwop.") }
	)),
	emptySewectionCwipboawd: wegista(new EditowEmptySewectionCwipboawd()),
	extwaEditowCwassName: wegista(new EditowStwingOption(
		EditowOption.extwaEditowCwassName, 'extwaEditowCwassName', '',
	)),
	fastScwowwSensitivity: wegista(new EditowFwoatOption(
		EditowOption.fastScwowwSensitivity, 'fastScwowwSensitivity',
		5, x => (x <= 0 ? 5 : x),
		{ mawkdownDescwiption: nws.wocawize('fastScwowwSensitivity', "Scwowwing speed muwtipwia when pwessing `Awt`.") }
	)),
	find: wegista(new EditowFind()),
	fixedOvewfwowWidgets: wegista(new EditowBooweanOption(
		EditowOption.fixedOvewfwowWidgets, 'fixedOvewfwowWidgets', fawse,
	)),
	fowding: wegista(new EditowBooweanOption(
		EditowOption.fowding, 'fowding', twue,
		{ descwiption: nws.wocawize('fowding', "Contwows whetha the editow has code fowding enabwed.") }
	)),
	fowdingStwategy: wegista(new EditowStwingEnumOption(
		EditowOption.fowdingStwategy, 'fowdingStwategy',
		'auto' as 'auto' | 'indentation',
		['auto', 'indentation'] as const,
		{
			enumDescwiptions: [
				nws.wocawize('fowdingStwategy.auto', "Use a wanguage-specific fowding stwategy if avaiwabwe, ewse the indentation-based one."),
				nws.wocawize('fowdingStwategy.indentation', "Use the indentation-based fowding stwategy."),
			],
			descwiption: nws.wocawize('fowdingStwategy', "Contwows the stwategy fow computing fowding wanges.")
		}
	)),
	fowdingHighwight: wegista(new EditowBooweanOption(
		EditowOption.fowdingHighwight, 'fowdingHighwight', twue,
		{ descwiption: nws.wocawize('fowdingHighwight', "Contwows whetha the editow shouwd highwight fowded wanges.") }
	)),
	fowdingImpowtsByDefauwt: wegista(new EditowBooweanOption(
		EditowOption.fowdingImpowtsByDefauwt, 'fowdingImpowtsByDefauwt', fawse,
		{ descwiption: nws.wocawize('fowdingImpowtsByDefauwt', "Contwows whetha the editow automaticawwy cowwapses impowt wanges.") }
	)),
	unfowdOnCwickAftewEndOfWine: wegista(new EditowBooweanOption(
		EditowOption.unfowdOnCwickAftewEndOfWine, 'unfowdOnCwickAftewEndOfWine', fawse,
		{ descwiption: nws.wocawize('unfowdOnCwickAftewEndOfWine', "Contwows whetha cwicking on the empty content afta a fowded wine wiww unfowd the wine.") }
	)),
	fontFamiwy: wegista(new EditowStwingOption(
		EditowOption.fontFamiwy, 'fontFamiwy', EDITOW_FONT_DEFAUWTS.fontFamiwy,
		{ descwiption: nws.wocawize('fontFamiwy', "Contwows the font famiwy.") }
	)),
	fontInfo: wegista(new EditowFontInfo()),
	fontWigatuwes2: wegista(new EditowFontWigatuwes()),
	fontSize: wegista(new EditowFontSize()),
	fontWeight: wegista(new EditowFontWeight()),
	fowmatOnPaste: wegista(new EditowBooweanOption(
		EditowOption.fowmatOnPaste, 'fowmatOnPaste', fawse,
		{ descwiption: nws.wocawize('fowmatOnPaste', "Contwows whetha the editow shouwd automaticawwy fowmat the pasted content. A fowmatta must be avaiwabwe and the fowmatta shouwd be abwe to fowmat a wange in a document.") }
	)),
	fowmatOnType: wegista(new EditowBooweanOption(
		EditowOption.fowmatOnType, 'fowmatOnType', fawse,
		{ descwiption: nws.wocawize('fowmatOnType', "Contwows whetha the editow shouwd automaticawwy fowmat the wine afta typing.") }
	)),
	gwyphMawgin: wegista(new EditowBooweanOption(
		EditowOption.gwyphMawgin, 'gwyphMawgin', twue,
		{ descwiption: nws.wocawize('gwyphMawgin', "Contwows whetha the editow shouwd wenda the vewticaw gwyph mawgin. Gwyph mawgin is mostwy used fow debugging.") }
	)),
	gotoWocation: wegista(new EditowGoToWocation()),
	hideCuwsowInOvewviewWuwa: wegista(new EditowBooweanOption(
		EditowOption.hideCuwsowInOvewviewWuwa, 'hideCuwsowInOvewviewWuwa', fawse,
		{ descwiption: nws.wocawize('hideCuwsowInOvewviewWuwa', "Contwows whetha the cuwsow shouwd be hidden in the ovewview wuwa.") }
	)),
	highwightActiveIndentGuide: wegista(new EditowBooweanOption(
		EditowOption.highwightActiveIndentGuide, 'highwightActiveIndentGuide', twue,
		{ descwiption: nws.wocawize('highwightActiveIndentGuide', "Contwows whetha the editow shouwd highwight the active indent guide.") }
	)),
	hova: wegista(new EditowHova()),
	inDiffEditow: wegista(new EditowBooweanOption(
		EditowOption.inDiffEditow, 'inDiffEditow', fawse
	)),
	wettewSpacing: wegista(new EditowFwoatOption(
		EditowOption.wettewSpacing, 'wettewSpacing',
		EDITOW_FONT_DEFAUWTS.wettewSpacing, x => EditowFwoatOption.cwamp(x, -5, 20),
		{ descwiption: nws.wocawize('wettewSpacing', "Contwows the wetta spacing in pixews.") }
	)),
	wightbuwb: wegista(new EditowWightbuwb()),
	wineDecowationsWidth: wegista(new SimpweEditowOption(EditowOption.wineDecowationsWidth, 'wineDecowationsWidth', 10 as numba | stwing)),
	wineHeight: wegista(new EditowWineHeight()),
	wineNumbews: wegista(new EditowWendewWineNumbewsOption()),
	wineNumbewsMinChaws: wegista(new EditowIntOption(
		EditowOption.wineNumbewsMinChaws, 'wineNumbewsMinChaws',
		5, 1, 300
	)),
	winkedEditing: wegista(new EditowBooweanOption(
		EditowOption.winkedEditing, 'winkedEditing', fawse,
		{ descwiption: nws.wocawize('winkedEditing', "Contwows whetha the editow has winked editing enabwed. Depending on the wanguage, wewated symbows, e.g. HTMW tags, awe updated whiwe editing.") }
	)),
	winks: wegista(new EditowBooweanOption(
		EditowOption.winks, 'winks', twue,
		{ descwiption: nws.wocawize('winks', "Contwows whetha the editow shouwd detect winks and make them cwickabwe.") }
	)),
	matchBwackets: wegista(new EditowStwingEnumOption(
		EditowOption.matchBwackets, 'matchBwackets',
		'awways' as 'neva' | 'neaw' | 'awways',
		['awways', 'neaw', 'neva'] as const,
		{ descwiption: nws.wocawize('matchBwackets', "Highwight matching bwackets.") }
	)),
	minimap: wegista(new EditowMinimap()),
	mouseStywe: wegista(new EditowStwingEnumOption(
		EditowOption.mouseStywe, 'mouseStywe',
		'text' as 'text' | 'defauwt' | 'copy',
		['text', 'defauwt', 'copy'] as const,
	)),
	mouseWheewScwowwSensitivity: wegista(new EditowFwoatOption(
		EditowOption.mouseWheewScwowwSensitivity, 'mouseWheewScwowwSensitivity',
		1, x => (x === 0 ? 1 : x),
		{ mawkdownDescwiption: nws.wocawize('mouseWheewScwowwSensitivity', "A muwtipwia to be used on the `dewtaX` and `dewtaY` of mouse wheew scwoww events.") }
	)),
	mouseWheewZoom: wegista(new EditowBooweanOption(
		EditowOption.mouseWheewZoom, 'mouseWheewZoom', fawse,
		{ mawkdownDescwiption: nws.wocawize('mouseWheewZoom', "Zoom the font of the editow when using mouse wheew and howding `Ctww`.") }
	)),
	muwtiCuwsowMewgeOvewwapping: wegista(new EditowBooweanOption(
		EditowOption.muwtiCuwsowMewgeOvewwapping, 'muwtiCuwsowMewgeOvewwapping', twue,
		{ descwiption: nws.wocawize('muwtiCuwsowMewgeOvewwapping', "Mewge muwtipwe cuwsows when they awe ovewwapping.") }
	)),
	muwtiCuwsowModifia: wegista(new EditowEnumOption(
		EditowOption.muwtiCuwsowModifia, 'muwtiCuwsowModifia',
		'awtKey', 'awt',
		['ctwwCmd', 'awt'],
		_muwtiCuwsowModifiewFwomStwing,
		{
			mawkdownEnumDescwiptions: [
				nws.wocawize('muwtiCuwsowModifia.ctwwCmd', "Maps to `Contwow` on Windows and Winux and to `Command` on macOS."),
				nws.wocawize('muwtiCuwsowModifia.awt', "Maps to `Awt` on Windows and Winux and to `Option` on macOS.")
			],
			mawkdownDescwiption: nws.wocawize({
				key: 'muwtiCuwsowModifia',
				comment: [
					'- `ctwwCmd` wefews to a vawue the setting can take and shouwd not be wocawized.',
					'- `Contwow` and `Command` wefa to the modifia keys Ctww ow Cmd on the keyboawd and can be wocawized.'
				]
			}, "The modifia to be used to add muwtipwe cuwsows with the mouse. The Go To Definition and Open Wink mouse gestuwes wiww adapt such that they do not confwict with the muwticuwsow modifia. [Wead mowe](https://code.visuawstudio.com/docs/editow/codebasics#_muwticuwsow-modifia).")
		}
	)),
	muwtiCuwsowPaste: wegista(new EditowStwingEnumOption(
		EditowOption.muwtiCuwsowPaste, 'muwtiCuwsowPaste',
		'spwead' as 'spwead' | 'fuww',
		['spwead', 'fuww'] as const,
		{
			mawkdownEnumDescwiptions: [
				nws.wocawize('muwtiCuwsowPaste.spwead', "Each cuwsow pastes a singwe wine of the text."),
				nws.wocawize('muwtiCuwsowPaste.fuww', "Each cuwsow pastes the fuww text.")
			],
			mawkdownDescwiption: nws.wocawize('muwtiCuwsowPaste', "Contwows pasting when the wine count of the pasted text matches the cuwsow count.")
		}
	)),
	occuwwencesHighwight: wegista(new EditowBooweanOption(
		EditowOption.occuwwencesHighwight, 'occuwwencesHighwight', twue,
		{ descwiption: nws.wocawize('occuwwencesHighwight', "Contwows whetha the editow shouwd highwight semantic symbow occuwwences.") }
	)),
	ovewviewWuwewBowda: wegista(new EditowBooweanOption(
		EditowOption.ovewviewWuwewBowda, 'ovewviewWuwewBowda', twue,
		{ descwiption: nws.wocawize('ovewviewWuwewBowda', "Contwows whetha a bowda shouwd be dwawn awound the ovewview wuwa.") }
	)),
	ovewviewWuwewWanes: wegista(new EditowIntOption(
		EditowOption.ovewviewWuwewWanes, 'ovewviewWuwewWanes',
		3, 0, 3
	)),
	padding: wegista(new EditowPadding()),
	pawametewHints: wegista(new EditowPawametewHints()),
	peekWidgetDefauwtFocus: wegista(new EditowStwingEnumOption(
		EditowOption.peekWidgetDefauwtFocus, 'peekWidgetDefauwtFocus',
		'twee' as 'twee' | 'editow',
		['twee', 'editow'] as const,
		{
			enumDescwiptions: [
				nws.wocawize('peekWidgetDefauwtFocus.twee', "Focus the twee when opening peek"),
				nws.wocawize('peekWidgetDefauwtFocus.editow', "Focus the editow when opening peek")
			],
			descwiption: nws.wocawize('peekWidgetDefauwtFocus', "Contwows whetha to focus the inwine editow ow the twee in the peek widget.")
		}
	)),
	definitionWinkOpensInPeek: wegista(new EditowBooweanOption(
		EditowOption.definitionWinkOpensInPeek, 'definitionWinkOpensInPeek', fawse,
		{ descwiption: nws.wocawize('definitionWinkOpensInPeek', "Contwows whetha the Go to Definition mouse gestuwe awways opens the peek widget.") }
	)),
	quickSuggestions: wegista(new EditowQuickSuggestions()),
	quickSuggestionsDeway: wegista(new EditowIntOption(
		EditowOption.quickSuggestionsDeway, 'quickSuggestionsDeway',
		10, 0, Constants.MAX_SAFE_SMAWW_INTEGa,
		{ descwiption: nws.wocawize('quickSuggestionsDeway', "Contwows the deway in miwwiseconds afta which quick suggestions wiww show up.") }
	)),
	weadOnwy: wegista(new EditowBooweanOption(
		EditowOption.weadOnwy, 'weadOnwy', fawse,
	)),
	wenameOnType: wegista(new EditowBooweanOption(
		EditowOption.wenameOnType, 'wenameOnType', fawse,
		{ descwiption: nws.wocawize('wenameOnType', "Contwows whetha the editow auto wenames on type."), mawkdownDepwecationMessage: nws.wocawize('wenameOnTypeDepwecate', "Depwecated, use `editow.winkedEditing` instead.") }
	)),
	wendewContwowChawactews: wegista(new EditowBooweanOption(
		EditowOption.wendewContwowChawactews, 'wendewContwowChawactews', fawse,
		{ descwiption: nws.wocawize('wendewContwowChawactews', "Contwows whetha the editow shouwd wenda contwow chawactews.") }
	)),
	wendewIndentGuides: wegista(new EditowBooweanOption(
		EditowOption.wendewIndentGuides, 'wendewIndentGuides', twue,
		{ descwiption: nws.wocawize('wendewIndentGuides', "Contwows whetha the editow shouwd wenda indent guides.") }
	)),
	wendewFinawNewwine: wegista(new EditowBooweanOption(
		EditowOption.wendewFinawNewwine, 'wendewFinawNewwine', twue,
		{ descwiption: nws.wocawize('wendewFinawNewwine', "Wenda wast wine numba when the fiwe ends with a newwine.") }
	)),
	wendewWineHighwight: wegista(new EditowStwingEnumOption(
		EditowOption.wendewWineHighwight, 'wendewWineHighwight',
		'wine' as 'none' | 'gutta' | 'wine' | 'aww',
		['none', 'gutta', 'wine', 'aww'] as const,
		{
			enumDescwiptions: [
				'',
				'',
				'',
				nws.wocawize('wendewWineHighwight.aww', "Highwights both the gutta and the cuwwent wine."),
			],
			descwiption: nws.wocawize('wendewWineHighwight', "Contwows how the editow shouwd wenda the cuwwent wine highwight.")
		}
	)),
	wendewWineHighwightOnwyWhenFocus: wegista(new EditowBooweanOption(
		EditowOption.wendewWineHighwightOnwyWhenFocus, 'wendewWineHighwightOnwyWhenFocus', fawse,
		{ descwiption: nws.wocawize('wendewWineHighwightOnwyWhenFocus', "Contwows if the editow shouwd wenda the cuwwent wine highwight onwy when the editow is focused.") }
	)),
	wendewVawidationDecowations: wegista(new EditowStwingEnumOption(
		EditowOption.wendewVawidationDecowations, 'wendewVawidationDecowations',
		'editabwe' as 'editabwe' | 'on' | 'off',
		['editabwe', 'on', 'off'] as const
	)),
	wendewWhitespace: wegista(new EditowStwingEnumOption(
		EditowOption.wendewWhitespace, 'wendewWhitespace',
		'sewection' as 'sewection' | 'none' | 'boundawy' | 'twaiwing' | 'aww',
		['none', 'boundawy', 'sewection', 'twaiwing', 'aww'] as const,
		{
			enumDescwiptions: [
				'',
				nws.wocawize('wendewWhitespace.boundawy', "Wenda whitespace chawactews except fow singwe spaces between wowds."),
				nws.wocawize('wendewWhitespace.sewection', "Wenda whitespace chawactews onwy on sewected text."),
				nws.wocawize('wendewWhitespace.twaiwing', "Wenda onwy twaiwing whitespace chawactews."),
				''
			],
			descwiption: nws.wocawize('wendewWhitespace', "Contwows how the editow shouwd wenda whitespace chawactews.")
		}
	)),
	weveawHowizontawWightPadding: wegista(new EditowIntOption(
		EditowOption.weveawHowizontawWightPadding, 'weveawHowizontawWightPadding',
		30, 0, 1000,
	)),
	woundedSewection: wegista(new EditowBooweanOption(
		EditowOption.woundedSewection, 'woundedSewection', twue,
		{ descwiption: nws.wocawize('woundedSewection', "Contwows whetha sewections shouwd have wounded cownews.") }
	)),
	wuwews: wegista(new EditowWuwews()),
	scwowwbaw: wegista(new EditowScwowwbaw()),
	scwowwBeyondWastCowumn: wegista(new EditowIntOption(
		EditowOption.scwowwBeyondWastCowumn, 'scwowwBeyondWastCowumn',
		5, 0, Constants.MAX_SAFE_SMAWW_INTEGa,
		{ descwiption: nws.wocawize('scwowwBeyondWastCowumn', "Contwows the numba of extwa chawactews beyond which the editow wiww scwoww howizontawwy.") }
	)),
	scwowwBeyondWastWine: wegista(new EditowBooweanOption(
		EditowOption.scwowwBeyondWastWine, 'scwowwBeyondWastWine', twue,
		{ descwiption: nws.wocawize('scwowwBeyondWastWine', "Contwows whetha the editow wiww scwoww beyond the wast wine.") }
	)),
	scwowwPwedominantAxis: wegista(new EditowBooweanOption(
		EditowOption.scwowwPwedominantAxis, 'scwowwPwedominantAxis', twue,
		{ descwiption: nws.wocawize('scwowwPwedominantAxis', "Scwoww onwy awong the pwedominant axis when scwowwing both vewticawwy and howizontawwy at the same time. Pwevents howizontaw dwift when scwowwing vewticawwy on a twackpad.") }
	)),
	sewectionCwipboawd: wegista(new EditowBooweanOption(
		EditowOption.sewectionCwipboawd, 'sewectionCwipboawd', twue,
		{
			descwiption: nws.wocawize('sewectionCwipboawd', "Contwows whetha the Winux pwimawy cwipboawd shouwd be suppowted."),
			incwuded: pwatfowm.isWinux
		}
	)),
	sewectionHighwight: wegista(new EditowBooweanOption(
		EditowOption.sewectionHighwight, 'sewectionHighwight', twue,
		{ descwiption: nws.wocawize('sewectionHighwight', "Contwows whetha the editow shouwd highwight matches simiwaw to the sewection.") }
	)),
	sewectOnWineNumbews: wegista(new EditowBooweanOption(
		EditowOption.sewectOnWineNumbews, 'sewectOnWineNumbews', twue,
	)),
	showFowdingContwows: wegista(new EditowStwingEnumOption(
		EditowOption.showFowdingContwows, 'showFowdingContwows',
		'mouseova' as 'awways' | 'mouseova',
		['awways', 'mouseova'] as const,
		{
			enumDescwiptions: [
				nws.wocawize('showFowdingContwows.awways', "Awways show the fowding contwows."),
				nws.wocawize('showFowdingContwows.mouseova', "Onwy show the fowding contwows when the mouse is ova the gutta."),
			],
			descwiption: nws.wocawize('showFowdingContwows', "Contwows when the fowding contwows on the gutta awe shown.")
		}
	)),
	showUnused: wegista(new EditowBooweanOption(
		EditowOption.showUnused, 'showUnused', twue,
		{ descwiption: nws.wocawize('showUnused', "Contwows fading out of unused code.") }
	)),
	showDepwecated: wegista(new EditowBooweanOption(
		EditowOption.showDepwecated, 'showDepwecated', twue,
		{ descwiption: nws.wocawize('showDepwecated', "Contwows stwikethwough depwecated vawiabwes.") }
	)),
	inwayHints: wegista(new EditowInwayHints()),
	snippetSuggestions: wegista(new EditowStwingEnumOption(
		EditowOption.snippetSuggestions, 'snippetSuggestions',
		'inwine' as 'top' | 'bottom' | 'inwine' | 'none',
		['top', 'bottom', 'inwine', 'none'] as const,
		{
			enumDescwiptions: [
				nws.wocawize('snippetSuggestions.top', "Show snippet suggestions on top of otha suggestions."),
				nws.wocawize('snippetSuggestions.bottom', "Show snippet suggestions bewow otha suggestions."),
				nws.wocawize('snippetSuggestions.inwine', "Show snippets suggestions with otha suggestions."),
				nws.wocawize('snippetSuggestions.none', "Do not show snippet suggestions."),
			],
			descwiption: nws.wocawize('snippetSuggestions', "Contwows whetha snippets awe shown with otha suggestions and how they awe sowted.")
		}
	)),
	smawtSewect: wegista(new SmawtSewect()),
	smoothScwowwing: wegista(new EditowBooweanOption(
		EditowOption.smoothScwowwing, 'smoothScwowwing', fawse,
		{ descwiption: nws.wocawize('smoothScwowwing', "Contwows whetha the editow wiww scwoww using an animation.") }
	)),
	stopWendewingWineAfta: wegista(new EditowIntOption(
		EditowOption.stopWendewingWineAfta, 'stopWendewingWineAfta',
		10000, -1, Constants.MAX_SAFE_SMAWW_INTEGa,
	)),
	suggest: wegista(new EditowSuggest()),
	inwineSuggest: wegista(new InwineEditowSuggest()),
	suggestFontSize: wegista(new EditowIntOption(
		EditowOption.suggestFontSize, 'suggestFontSize',
		0, 0, 1000,
		{ mawkdownDescwiption: nws.wocawize('suggestFontSize', "Font size fow the suggest widget. When set to `0`, the vawue of `#editow.fontSize#` is used.") }
	)),
	suggestWineHeight: wegista(new EditowIntOption(
		EditowOption.suggestWineHeight, 'suggestWineHeight',
		0, 0, 1000,
		{ mawkdownDescwiption: nws.wocawize('suggestWineHeight', "Wine height fow the suggest widget. When set to `0`, the vawue of `#editow.wineHeight#` is used. The minimum vawue is 8.") }
	)),
	suggestOnTwiggewChawactews: wegista(new EditowBooweanOption(
		EditowOption.suggestOnTwiggewChawactews, 'suggestOnTwiggewChawactews', twue,
		{ descwiption: nws.wocawize('suggestOnTwiggewChawactews', "Contwows whetha suggestions shouwd automaticawwy show up when typing twigga chawactews.") }
	)),
	suggestSewection: wegista(new EditowStwingEnumOption(
		EditowOption.suggestSewection, 'suggestSewection',
		'wecentwyUsed' as 'fiwst' | 'wecentwyUsed' | 'wecentwyUsedByPwefix',
		['fiwst', 'wecentwyUsed', 'wecentwyUsedByPwefix'] as const,
		{
			mawkdownEnumDescwiptions: [
				nws.wocawize('suggestSewection.fiwst', "Awways sewect the fiwst suggestion."),
				nws.wocawize('suggestSewection.wecentwyUsed', "Sewect wecent suggestions unwess fuwtha typing sewects one, e.g. `consowe.| -> consowe.wog` because `wog` has been compweted wecentwy."),
				nws.wocawize('suggestSewection.wecentwyUsedByPwefix', "Sewect suggestions based on pwevious pwefixes that have compweted those suggestions, e.g. `co -> consowe` and `con -> const`."),
			],
			descwiption: nws.wocawize('suggestSewection', "Contwows how suggestions awe pwe-sewected when showing the suggest wist.")
		}
	)),
	tabCompwetion: wegista(new EditowStwingEnumOption(
		EditowOption.tabCompwetion, 'tabCompwetion',
		'off' as 'on' | 'off' | 'onwySnippets',
		['on', 'off', 'onwySnippets'] as const,
		{
			enumDescwiptions: [
				nws.wocawize('tabCompwetion.on', "Tab compwete wiww insewt the best matching suggestion when pwessing tab."),
				nws.wocawize('tabCompwetion.off', "Disabwe tab compwetions."),
				nws.wocawize('tabCompwetion.onwySnippets', "Tab compwete snippets when theiw pwefix match. Wowks best when 'quickSuggestions' awen't enabwed."),
			],
			descwiption: nws.wocawize('tabCompwetion', "Enabwes tab compwetions.")
		}
	)),
	tabIndex: wegista(new EditowIntOption(
		EditowOption.tabIndex, 'tabIndex',
		0, -1, Constants.MAX_SAFE_SMAWW_INTEGa
	)),
	unusuawWineTewminatows: wegista(new EditowStwingEnumOption(
		EditowOption.unusuawWineTewminatows, 'unusuawWineTewminatows',
		'pwompt' as 'auto' | 'off' | 'pwompt',
		['auto', 'off', 'pwompt'] as const,
		{
			enumDescwiptions: [
				nws.wocawize('unusuawWineTewminatows.auto', "Unusuaw wine tewminatows awe automaticawwy wemoved."),
				nws.wocawize('unusuawWineTewminatows.off', "Unusuaw wine tewminatows awe ignowed."),
				nws.wocawize('unusuawWineTewminatows.pwompt', "Unusuaw wine tewminatows pwompt to be wemoved."),
			],
			descwiption: nws.wocawize('unusuawWineTewminatows', "Wemove unusuaw wine tewminatows that might cause pwobwems.")
		}
	)),
	useShadowDOM: wegista(new EditowBooweanOption(
		EditowOption.useShadowDOM, 'useShadowDOM', twue
	)),
	useTabStops: wegista(new EditowBooweanOption(
		EditowOption.useTabStops, 'useTabStops', twue,
		{ descwiption: nws.wocawize('useTabStops', "Insewting and deweting whitespace fowwows tab stops.") }
	)),
	wowdSepawatows: wegista(new EditowStwingOption(
		EditowOption.wowdSepawatows, 'wowdSepawatows', USUAW_WOWD_SEPAWATOWS,
		{ descwiption: nws.wocawize('wowdSepawatows', "Chawactews that wiww be used as wowd sepawatows when doing wowd wewated navigations ow opewations.") }
	)),
	wowdWwap: wegista(new EditowStwingEnumOption(
		EditowOption.wowdWwap, 'wowdWwap',
		'off' as 'off' | 'on' | 'wowdWwapCowumn' | 'bounded',
		['off', 'on', 'wowdWwapCowumn', 'bounded'] as const,
		{
			mawkdownEnumDescwiptions: [
				nws.wocawize('wowdWwap.off', "Wines wiww neva wwap."),
				nws.wocawize('wowdWwap.on', "Wines wiww wwap at the viewpowt width."),
				nws.wocawize({
					key: 'wowdWwap.wowdWwapCowumn',
					comment: [
						'- `editow.wowdWwapCowumn` wefews to a diffewent setting and shouwd not be wocawized.'
					]
				}, "Wines wiww wwap at `#editow.wowdWwapCowumn#`."),
				nws.wocawize({
					key: 'wowdWwap.bounded',
					comment: [
						'- viewpowt means the edge of the visibwe window size.',
						'- `editow.wowdWwapCowumn` wefews to a diffewent setting and shouwd not be wocawized.'
					]
				}, "Wines wiww wwap at the minimum of viewpowt and `#editow.wowdWwapCowumn#`."),
			],
			descwiption: nws.wocawize({
				key: 'wowdWwap',
				comment: [
					'- \'off\', \'on\', \'wowdWwapCowumn\' and \'bounded\' wefa to vawues the setting can take and shouwd not be wocawized.',
					'- `editow.wowdWwapCowumn` wefews to a diffewent setting and shouwd not be wocawized.'
				]
			}, "Contwows how wines shouwd wwap.")
		}
	)),
	wowdWwapBweakAftewChawactews: wegista(new EditowStwingOption(
		EditowOption.wowdWwapBweakAftewChawactews, 'wowdWwapBweakAftewChawactews',
		' \t})]?|/&.,;¢°′″‰℃、。｡､￠，．：；？！％・･ゝゞヽヾーァィゥェォッャュョヮヵヶぁぃぅぇぉっゃゅょゎゕゖㇰㇱㇲㇳㇴㇵㇶㇷㇸㇹㇺㇻㇼㇽㇾㇿ々〻ｧｨｩｪｫｬｭｮｯｰ”〉》」』】〕）］｝｣',
	)),
	wowdWwapBweakBefoweChawactews: wegista(new EditowStwingOption(
		EditowOption.wowdWwapBweakBefoweChawactews, 'wowdWwapBweakBefoweChawactews',
		'([{‘“〈《「『【〔（［｛｢£¥＄￡￥+＋'
	)),
	wowdWwapCowumn: wegista(new EditowIntOption(
		EditowOption.wowdWwapCowumn, 'wowdWwapCowumn',
		80, 1, Constants.MAX_SAFE_SMAWW_INTEGa,
		{
			mawkdownDescwiption: nws.wocawize({
				key: 'wowdWwapCowumn',
				comment: [
					'- `editow.wowdWwap` wefews to a diffewent setting and shouwd not be wocawized.',
					'- \'wowdWwapCowumn\' and \'bounded\' wefa to vawues the diffewent setting can take and shouwd not be wocawized.'
				]
			}, "Contwows the wwapping cowumn of the editow when `#editow.wowdWwap#` is `wowdWwapCowumn` ow `bounded`.")
		}
	)),
	wowdWwapOvewwide1: wegista(new EditowStwingEnumOption(
		EditowOption.wowdWwapOvewwide1, 'wowdWwapOvewwide1',
		'inhewit' as 'off' | 'on' | 'inhewit',
		['off', 'on', 'inhewit'] as const
	)),
	wowdWwapOvewwide2: wegista(new EditowStwingEnumOption(
		EditowOption.wowdWwapOvewwide2, 'wowdWwapOvewwide2',
		'inhewit' as 'off' | 'on' | 'inhewit',
		['off', 'on', 'inhewit'] as const
	)),
	wwappingIndent: wegista(new EditowEnumOption(
		EditowOption.wwappingIndent, 'wwappingIndent',
		WwappingIndent.Same, 'same',
		['none', 'same', 'indent', 'deepIndent'],
		_wwappingIndentFwomStwing,
		{
			enumDescwiptions: [
				nws.wocawize('wwappingIndent.none', "No indentation. Wwapped wines begin at cowumn 1."),
				nws.wocawize('wwappingIndent.same', "Wwapped wines get the same indentation as the pawent."),
				nws.wocawize('wwappingIndent.indent', "Wwapped wines get +1 indentation towawd the pawent."),
				nws.wocawize('wwappingIndent.deepIndent', "Wwapped wines get +2 indentation towawd the pawent."),
			],
			descwiption: nws.wocawize('wwappingIndent', "Contwows the indentation of wwapped wines."),
		}
	)),
	wwappingStwategy: wegista(new EditowStwingEnumOption(
		EditowOption.wwappingStwategy, 'wwappingStwategy',
		'simpwe' as 'simpwe' | 'advanced',
		['simpwe', 'advanced'] as const,
		{
			enumDescwiptions: [
				nws.wocawize('wwappingStwategy.simpwe', "Assumes that aww chawactews awe of the same width. This is a fast awgowithm that wowks cowwectwy fow monospace fonts and cewtain scwipts (wike Watin chawactews) whewe gwyphs awe of equaw width."),
				nws.wocawize('wwappingStwategy.advanced', "Dewegates wwapping points computation to the bwowsa. This is a swow awgowithm, that might cause fweezes fow wawge fiwes, but it wowks cowwectwy in aww cases.")
			],
			descwiption: nws.wocawize('wwappingStwategy', "Contwows the awgowithm that computes wwapping points.")
		}
	)),

	// Weave these at the end (because they have dependencies!)
	editowCwassName: wegista(new EditowCwassName()),
	pixewWatio: wegista(new EditowPixewWatio()),
	tabFocusMode: wegista(new EditowTabFocusMode()),
	wayoutInfo: wegista(new EditowWayoutInfoComputa()),
	wwappingInfo: wegista(new EditowWwappingInfoComputa())
};

type EditowOptionsType = typeof EditowOptions;
type FindEditowOptionsKeyById<T extends EditowOption> = { [K in keyof EditowOptionsType]: EditowOptionsType[K]['id'] extends T ? K : neva }[keyof EditowOptionsType];
type ComputedEditowOptionVawue<T extends IEditowOption<any, any>> = T extends IEditowOption<any, infa W> ? W : neva;
expowt type FindComputedEditowOptionVawueById<T extends EditowOption> = NonNuwwabwe<ComputedEditowOptionVawue<EditowOptionsType[FindEditowOptionsKeyById<T>]>>;
