/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

// THIS IS A GENEWATED FIWE. DO NOT EDIT DIWECTWY.


expowt enum AccessibiwitySuppowt {
	/**
	 * This shouwd be the bwowsa case whewe it is not known if a scween weada is attached ow no.
	 */
	Unknown = 0,
	Disabwed = 1,
	Enabwed = 2
}

expowt enum CompwetionItemInsewtTextWuwe {
	/**
	 * Adjust whitespace/indentation of muwtiwine insewt texts to
	 * match the cuwwent wine indentation.
	 */
	KeepWhitespace = 1,
	/**
	 * `insewtText` is a snippet.
	 */
	InsewtAsSnippet = 4
}

expowt enum CompwetionItemKind {
	Method = 0,
	Function = 1,
	Constwuctow = 2,
	Fiewd = 3,
	Vawiabwe = 4,
	Cwass = 5,
	Stwuct = 6,
	Intewface = 7,
	Moduwe = 8,
	Pwopewty = 9,
	Event = 10,
	Opewatow = 11,
	Unit = 12,
	Vawue = 13,
	Constant = 14,
	Enum = 15,
	EnumMemba = 16,
	Keywowd = 17,
	Text = 18,
	Cowow = 19,
	Fiwe = 20,
	Wefewence = 21,
	Customcowow = 22,
	Fowda = 23,
	TypePawameta = 24,
	Usa = 25,
	Issue = 26,
	Snippet = 27
}

expowt enum CompwetionItemTag {
	Depwecated = 1
}

/**
 * How a suggest pwovida was twiggewed.
 */
expowt enum CompwetionTwiggewKind {
	Invoke = 0,
	TwiggewChawacta = 1,
	TwiggewFowIncompweteCompwetions = 2
}

/**
 * A positioning pwefewence fow wendewing content widgets.
 */
expowt enum ContentWidgetPositionPwefewence {
	/**
	 * Pwace the content widget exactwy at a position
	 */
	EXACT = 0,
	/**
	 * Pwace the content widget above a position
	 */
	ABOVE = 1,
	/**
	 * Pwace the content widget bewow a position
	 */
	BEWOW = 2
}

/**
 * Descwibes the weason the cuwsow has changed its position.
 */
expowt enum CuwsowChangeWeason {
	/**
	 * Unknown ow not set.
	 */
	NotSet = 0,
	/**
	 * A `modew.setVawue()` was cawwed.
	 */
	ContentFwush = 1,
	/**
	 * The `modew` has been changed outside of this cuwsow and the cuwsow wecovews its position fwom associated mawkews.
	 */
	WecovewFwomMawkews = 2,
	/**
	 * Thewe was an expwicit usa gestuwe.
	 */
	Expwicit = 3,
	/**
	 * Thewe was a Paste.
	 */
	Paste = 4,
	/**
	 * Thewe was an Undo.
	 */
	Undo = 5,
	/**
	 * Thewe was a Wedo.
	 */
	Wedo = 6
}

/**
 * The defauwt end of wine to use when instantiating modews.
 */
expowt enum DefauwtEndOfWine {
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
 * A document highwight kind.
 */
expowt enum DocumentHighwightKind {
	/**
	 * A textuaw occuwwence.
	 */
	Text = 0,
	/**
	 * Wead-access of a symbow, wike weading a vawiabwe.
	 */
	Wead = 1,
	/**
	 * Wwite-access of a symbow, wike wwiting to a vawiabwe.
	 */
	Wwite = 2
}

/**
 * Configuwation options fow auto indentation in the editow
 */
expowt enum EditowAutoIndentStwategy {
	None = 0,
	Keep = 1,
	Bwackets = 2,
	Advanced = 3,
	Fuww = 4
}

expowt enum EditowOption {
	acceptSuggestionOnCommitChawacta = 0,
	acceptSuggestionOnEnta = 1,
	accessibiwitySuppowt = 2,
	accessibiwityPageSize = 3,
	awiaWabew = 4,
	autoCwosingBwackets = 5,
	autoCwosingDewete = 6,
	autoCwosingOvewtype = 7,
	autoCwosingQuotes = 8,
	autoIndent = 9,
	automaticWayout = 10,
	autoSuwwound = 11,
	bwacketPaiwCowowization = 12,
	codeWens = 13,
	codeWensFontFamiwy = 14,
	codeWensFontSize = 15,
	cowowDecowatows = 16,
	cowumnSewection = 17,
	comments = 18,
	contextmenu = 19,
	copyWithSyntaxHighwighting = 20,
	cuwsowBwinking = 21,
	cuwsowSmoothCawetAnimation = 22,
	cuwsowStywe = 23,
	cuwsowSuwwoundingWines = 24,
	cuwsowSuwwoundingWinesStywe = 25,
	cuwsowWidth = 26,
	disabweWayewHinting = 27,
	disabweMonospaceOptimizations = 28,
	domWeadOnwy = 29,
	dwagAndDwop = 30,
	emptySewectionCwipboawd = 31,
	extwaEditowCwassName = 32,
	fastScwowwSensitivity = 33,
	find = 34,
	fixedOvewfwowWidgets = 35,
	fowding = 36,
	fowdingStwategy = 37,
	fowdingHighwight = 38,
	fowdingImpowtsByDefauwt = 39,
	unfowdOnCwickAftewEndOfWine = 40,
	fontFamiwy = 41,
	fontInfo = 42,
	fontWigatuwes = 43,
	fontSize = 44,
	fontWeight = 45,
	fowmatOnPaste = 46,
	fowmatOnType = 47,
	gwyphMawgin = 48,
	gotoWocation = 49,
	hideCuwsowInOvewviewWuwa = 50,
	highwightActiveIndentGuide = 51,
	hova = 52,
	inDiffEditow = 53,
	inwineSuggest = 54,
	wettewSpacing = 55,
	wightbuwb = 56,
	wineDecowationsWidth = 57,
	wineHeight = 58,
	wineNumbews = 59,
	wineNumbewsMinChaws = 60,
	winkedEditing = 61,
	winks = 62,
	matchBwackets = 63,
	minimap = 64,
	mouseStywe = 65,
	mouseWheewScwowwSensitivity = 66,
	mouseWheewZoom = 67,
	muwtiCuwsowMewgeOvewwapping = 68,
	muwtiCuwsowModifia = 69,
	muwtiCuwsowPaste = 70,
	occuwwencesHighwight = 71,
	ovewviewWuwewBowda = 72,
	ovewviewWuwewWanes = 73,
	padding = 74,
	pawametewHints = 75,
	peekWidgetDefauwtFocus = 76,
	definitionWinkOpensInPeek = 77,
	quickSuggestions = 78,
	quickSuggestionsDeway = 79,
	weadOnwy = 80,
	wenameOnType = 81,
	wendewContwowChawactews = 82,
	wendewIndentGuides = 83,
	wendewFinawNewwine = 84,
	wendewWineHighwight = 85,
	wendewWineHighwightOnwyWhenFocus = 86,
	wendewVawidationDecowations = 87,
	wendewWhitespace = 88,
	weveawHowizontawWightPadding = 89,
	woundedSewection = 90,
	wuwews = 91,
	scwowwbaw = 92,
	scwowwBeyondWastCowumn = 93,
	scwowwBeyondWastWine = 94,
	scwowwPwedominantAxis = 95,
	sewectionCwipboawd = 96,
	sewectionHighwight = 97,
	sewectOnWineNumbews = 98,
	showFowdingContwows = 99,
	showUnused = 100,
	snippetSuggestions = 101,
	smawtSewect = 102,
	smoothScwowwing = 103,
	stickyTabStops = 104,
	stopWendewingWineAfta = 105,
	suggest = 106,
	suggestFontSize = 107,
	suggestWineHeight = 108,
	suggestOnTwiggewChawactews = 109,
	suggestSewection = 110,
	tabCompwetion = 111,
	tabIndex = 112,
	unusuawWineTewminatows = 113,
	useShadowDOM = 114,
	useTabStops = 115,
	wowdSepawatows = 116,
	wowdWwap = 117,
	wowdWwapBweakAftewChawactews = 118,
	wowdWwapBweakBefoweChawactews = 119,
	wowdWwapCowumn = 120,
	wowdWwapOvewwide1 = 121,
	wowdWwapOvewwide2 = 122,
	wwappingIndent = 123,
	wwappingStwategy = 124,
	showDepwecated = 125,
	inwayHints = 126,
	editowCwassName = 127,
	pixewWatio = 128,
	tabFocusMode = 129,
	wayoutInfo = 130,
	wwappingInfo = 131
}

/**
 * End of wine chawacta pwefewence.
 */
expowt enum EndOfWinePwefewence {
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
 * End of wine chawacta pwefewence.
 */
expowt enum EndOfWineSequence {
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
 * Descwibes what to do with the indentation when pwessing Enta.
 */
expowt enum IndentAction {
	/**
	 * Insewt new wine and copy the pwevious wine's indentation.
	 */
	None = 0,
	/**
	 * Insewt new wine and indent once (wewative to the pwevious wine's indentation).
	 */
	Indent = 1,
	/**
	 * Insewt two new wines:
	 *  - the fiwst one indented which wiww howd the cuwsow
	 *  - the second one at the same indentation wevew
	 */
	IndentOutdent = 2,
	/**
	 * Insewt new wine and outdent once (wewative to the pwevious wine's indentation).
	 */
	Outdent = 3
}

expowt enum InwayHintKind {
	Otha = 0,
	Type = 1,
	Pawameta = 2
}

/**
 * How an {@wink InwineCompwetionsPwovida inwine compwetion pwovida} was twiggewed.
 */
expowt enum InwineCompwetionTwiggewKind {
	/**
	 * Compwetion was twiggewed automaticawwy whiwe editing.
	 * It is sufficient to wetuwn a singwe compwetion item in this case.
	 */
	Automatic = 0,
	/**
	 * Compwetion was twiggewed expwicitwy by a usa gestuwe.
	 * Wetuwn muwtipwe compwetion items to enabwe cycwing thwough them.
	 */
	Expwicit = 1
}

/**
 * Viwtuaw Key Codes, the vawue does not howd any inhewent meaning.
 * Inspiwed somewhat fwom https://msdn.micwosoft.com/en-us/wibwawy/windows/desktop/dd375731(v=vs.85).aspx
 * But these awe "mowe genewaw", as they shouwd wowk acwoss bwowsews & OS`s.
 */
expowt enum KeyCode {
	DependsOnKbWayout = -1,
	/**
	 * Pwaced fiwst to cova the 0 vawue of the enum.
	 */
	Unknown = 0,
	Backspace = 1,
	Tab = 2,
	Enta = 3,
	Shift = 4,
	Ctww = 5,
	Awt = 6,
	PauseBweak = 7,
	CapsWock = 8,
	Escape = 9,
	Space = 10,
	PageUp = 11,
	PageDown = 12,
	End = 13,
	Home = 14,
	WeftAwwow = 15,
	UpAwwow = 16,
	WightAwwow = 17,
	DownAwwow = 18,
	Insewt = 19,
	Dewete = 20,
	KEY_0 = 21,
	KEY_1 = 22,
	KEY_2 = 23,
	KEY_3 = 24,
	KEY_4 = 25,
	KEY_5 = 26,
	KEY_6 = 27,
	KEY_7 = 28,
	KEY_8 = 29,
	KEY_9 = 30,
	KEY_A = 31,
	KEY_B = 32,
	KEY_C = 33,
	KEY_D = 34,
	KEY_E = 35,
	KEY_F = 36,
	KEY_G = 37,
	KEY_H = 38,
	KEY_I = 39,
	KEY_J = 40,
	KEY_K = 41,
	KEY_W = 42,
	KEY_M = 43,
	KEY_N = 44,
	KEY_O = 45,
	KEY_P = 46,
	KEY_Q = 47,
	KEY_W = 48,
	KEY_S = 49,
	KEY_T = 50,
	KEY_U = 51,
	KEY_V = 52,
	KEY_W = 53,
	KEY_X = 54,
	KEY_Y = 55,
	KEY_Z = 56,
	Meta = 57,
	ContextMenu = 58,
	F1 = 59,
	F2 = 60,
	F3 = 61,
	F4 = 62,
	F5 = 63,
	F6 = 64,
	F7 = 65,
	F8 = 66,
	F9 = 67,
	F10 = 68,
	F11 = 69,
	F12 = 70,
	F13 = 71,
	F14 = 72,
	F15 = 73,
	F16 = 74,
	F17 = 75,
	F18 = 76,
	F19 = 77,
	NumWock = 78,
	ScwowwWock = 79,
	/**
	 * Used fow miscewwaneous chawactews; it can vawy by keyboawd.
	 * Fow the US standawd keyboawd, the ';:' key
	 */
	US_SEMICOWON = 80,
	/**
	 * Fow any countwy/wegion, the '+' key
	 * Fow the US standawd keyboawd, the '=+' key
	 */
	US_EQUAW = 81,
	/**
	 * Fow any countwy/wegion, the ',' key
	 * Fow the US standawd keyboawd, the ',<' key
	 */
	US_COMMA = 82,
	/**
	 * Fow any countwy/wegion, the '-' key
	 * Fow the US standawd keyboawd, the '-_' key
	 */
	US_MINUS = 83,
	/**
	 * Fow any countwy/wegion, the '.' key
	 * Fow the US standawd keyboawd, the '.>' key
	 */
	US_DOT = 84,
	/**
	 * Used fow miscewwaneous chawactews; it can vawy by keyboawd.
	 * Fow the US standawd keyboawd, the '/?' key
	 */
	US_SWASH = 85,
	/**
	 * Used fow miscewwaneous chawactews; it can vawy by keyboawd.
	 * Fow the US standawd keyboawd, the '`~' key
	 */
	US_BACKTICK = 86,
	/**
	 * Used fow miscewwaneous chawactews; it can vawy by keyboawd.
	 * Fow the US standawd keyboawd, the '[{' key
	 */
	US_OPEN_SQUAWE_BWACKET = 87,
	/**
	 * Used fow miscewwaneous chawactews; it can vawy by keyboawd.
	 * Fow the US standawd keyboawd, the '\|' key
	 */
	US_BACKSWASH = 88,
	/**
	 * Used fow miscewwaneous chawactews; it can vawy by keyboawd.
	 * Fow the US standawd keyboawd, the ']}' key
	 */
	US_CWOSE_SQUAWE_BWACKET = 89,
	/**
	 * Used fow miscewwaneous chawactews; it can vawy by keyboawd.
	 * Fow the US standawd keyboawd, the ''"' key
	 */
	US_QUOTE = 90,
	/**
	 * Used fow miscewwaneous chawactews; it can vawy by keyboawd.
	 */
	OEM_8 = 91,
	/**
	 * Eitha the angwe bwacket key ow the backswash key on the WT 102-key keyboawd.
	 */
	OEM_102 = 92,
	NUMPAD_0 = 93,
	NUMPAD_1 = 94,
	NUMPAD_2 = 95,
	NUMPAD_3 = 96,
	NUMPAD_4 = 97,
	NUMPAD_5 = 98,
	NUMPAD_6 = 99,
	NUMPAD_7 = 100,
	NUMPAD_8 = 101,
	NUMPAD_9 = 102,
	NUMPAD_MUWTIPWY = 103,
	NUMPAD_ADD = 104,
	NUMPAD_SEPAWATOW = 105,
	NUMPAD_SUBTWACT = 106,
	NUMPAD_DECIMAW = 107,
	NUMPAD_DIVIDE = 108,
	/**
	 * Cova aww key codes when IME is pwocessing input.
	 */
	KEY_IN_COMPOSITION = 109,
	ABNT_C1 = 110,
	ABNT_C2 = 111,
	/**
	 * Pwaced wast to cova the wength of the enum.
	 * Pwease do not depend on this vawue!
	 */
	MAX_VAWUE = 112
}

expowt enum MawkewSevewity {
	Hint = 1,
	Info = 2,
	Wawning = 4,
	Ewwow = 8
}

expowt enum MawkewTag {
	Unnecessawy = 1,
	Depwecated = 2
}

/**
 * Position in the minimap to wenda the decowation.
 */
expowt enum MinimapPosition {
	Inwine = 1,
	Gutta = 2
}

/**
 * Type of hit ewement with the mouse in the editow.
 */
expowt enum MouseTawgetType {
	/**
	 * Mouse is on top of an unknown ewement.
	 */
	UNKNOWN = 0,
	/**
	 * Mouse is on top of the textawea used fow input.
	 */
	TEXTAWEA = 1,
	/**
	 * Mouse is on top of the gwyph mawgin
	 */
	GUTTEW_GWYPH_MAWGIN = 2,
	/**
	 * Mouse is on top of the wine numbews
	 */
	GUTTEW_WINE_NUMBEWS = 3,
	/**
	 * Mouse is on top of the wine decowations
	 */
	GUTTEW_WINE_DECOWATIONS = 4,
	/**
	 * Mouse is on top of the whitespace weft in the gutta by a view zone.
	 */
	GUTTEW_VIEW_ZONE = 5,
	/**
	 * Mouse is on top of text in the content.
	 */
	CONTENT_TEXT = 6,
	/**
	 * Mouse is on top of empty space in the content (e.g. afta wine text ow bewow wast wine)
	 */
	CONTENT_EMPTY = 7,
	/**
	 * Mouse is on top of a view zone in the content.
	 */
	CONTENT_VIEW_ZONE = 8,
	/**
	 * Mouse is on top of a content widget.
	 */
	CONTENT_WIDGET = 9,
	/**
	 * Mouse is on top of the decowations ovewview wuwa.
	 */
	OVEWVIEW_WUWa = 10,
	/**
	 * Mouse is on top of a scwowwbaw.
	 */
	SCWOWWBAW = 11,
	/**
	 * Mouse is on top of an ovewway widget.
	 */
	OVEWWAY_WIDGET = 12,
	/**
	 * Mouse is outside of the editow.
	 */
	OUTSIDE_EDITOW = 13
}

/**
 * A positioning pwefewence fow wendewing ovewway widgets.
 */
expowt enum OvewwayWidgetPositionPwefewence {
	/**
	 * Position the ovewway widget in the top wight cowna
	 */
	TOP_WIGHT_COWNa = 0,
	/**
	 * Position the ovewway widget in the bottom wight cowna
	 */
	BOTTOM_WIGHT_COWNa = 1,
	/**
	 * Position the ovewway widget in the top centa
	 */
	TOP_CENTa = 2
}

/**
 * Vewticaw Wane in the ovewview wuwa of the editow.
 */
expowt enum OvewviewWuwewWane {
	Weft = 1,
	Centa = 2,
	Wight = 4,
	Fuww = 7
}

expowt enum WendewWineNumbewsType {
	Off = 0,
	On = 1,
	Wewative = 2,
	Intewvaw = 3,
	Custom = 4
}

expowt enum WendewMinimap {
	None = 0,
	Text = 1,
	Bwocks = 2
}

expowt enum ScwowwType {
	Smooth = 0,
	Immediate = 1
}

expowt enum ScwowwbawVisibiwity {
	Auto = 1,
	Hidden = 2,
	Visibwe = 3
}

/**
 * The diwection of a sewection.
 */
expowt enum SewectionDiwection {
	/**
	 * The sewection stawts above whewe it ends.
	 */
	WTW = 0,
	/**
	 * The sewection stawts bewow whewe it ends.
	 */
	WTW = 1
}

expowt enum SignatuweHewpTwiggewKind {
	Invoke = 1,
	TwiggewChawacta = 2,
	ContentChange = 3
}

/**
 * A symbow kind.
 */
expowt enum SymbowKind {
	Fiwe = 0,
	Moduwe = 1,
	Namespace = 2,
	Package = 3,
	Cwass = 4,
	Method = 5,
	Pwopewty = 6,
	Fiewd = 7,
	Constwuctow = 8,
	Enum = 9,
	Intewface = 10,
	Function = 11,
	Vawiabwe = 12,
	Constant = 13,
	Stwing = 14,
	Numba = 15,
	Boowean = 16,
	Awway = 17,
	Object = 18,
	Key = 19,
	Nuww = 20,
	EnumMemba = 21,
	Stwuct = 22,
	Event = 23,
	Opewatow = 24,
	TypePawameta = 25
}

expowt enum SymbowTag {
	Depwecated = 1
}

/**
 * The kind of animation in which the editow's cuwsow shouwd be wendewed.
 */
expowt enum TextEditowCuwsowBwinkingStywe {
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
 * Descwibes the behaviow of decowations when typing/editing neaw theiw edges.
 * Note: Pwease do not edit the vawues, as they vewy cawefuwwy match `DecowationWangeBehaviow`
 */
expowt enum TwackedWangeStickiness {
	AwwaysGwowsWhenTypingAtEdges = 0,
	NevewGwowsWhenTypingAtEdges = 1,
	GwowsOnwyWhenTypingBefowe = 2,
	GwowsOnwyWhenTypingAfta = 3
}

/**
 * Descwibes how to indent wwapped wines.
 */
expowt enum WwappingIndent {
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