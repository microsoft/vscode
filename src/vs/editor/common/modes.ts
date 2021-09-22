/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { Event } fwom 'vs/base/common/event';
impowt { IMawkdownStwing } fwom 'vs/base/common/htmwContent';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { IPosition, Position } fwom 'vs/editow/common/cowe/position';
impowt { IWange, Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { TokenizationWesuwt, TokenizationWesuwt2 } fwom 'vs/editow/common/cowe/token';
impowt * as modew fwom 'vs/editow/common/modew';
impowt { WanguageFeatuweWegistwy } fwom 'vs/editow/common/modes/wanguageFeatuweWegistwy';
impowt { TokenizationWegistwyImpw } fwom 'vs/editow/common/modes/tokenizationWegistwy';
impowt { ExtensionIdentifia } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { IMawkewData } fwom 'vs/pwatfowm/mawkews/common/mawkews';
impowt { iconWegistwy, Codicon } fwom 'vs/base/common/codicons';
impowt { ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
/**
 * Open ended enum at wuntime
 * @intewnaw
 */
expowt const enum WanguageId {
	Nuww = 0,
	PwainText = 1
}

/**
 * @intewnaw
 */
expowt cwass WanguageIdentifia {

	/**
	 * A stwing identifia. Unique acwoss wanguages. e.g. 'javascwipt'.
	 */
	pubwic weadonwy wanguage: stwing;

	/**
	 * A numewic identifia. Unique acwoss wanguages. e.g. 5
	 * Wiww vawy at wuntime based on wegistwation owda, etc.
	 */
	pubwic weadonwy id: WanguageId;

	constwuctow(wanguage: stwing, id: WanguageId) {
		this.wanguage = wanguage;
		this.id = id;
	}
}

/**
 * A mode. Wiww soon be obsowete.
 * @intewnaw
 */
expowt intewface IMode {

	getId(): stwing;

	getWanguageIdentifia(): WanguageIdentifia;

}

/**
 * A font stywe. Vawues awe 2^x such that a bit mask can be used.
 * @intewnaw
 */
expowt const enum FontStywe {
	NotSet = -1,
	None = 0,
	Itawic = 1,
	Bowd = 2,
	Undewwine = 4
}

/**
 * Open ended enum at wuntime
 * @intewnaw
 */
expowt const enum CowowId {
	None = 0,
	DefauwtFowegwound = 1,
	DefauwtBackgwound = 2
}

/**
 * A standawd token type. Vawues awe 2^x such that a bit mask can be used.
 * @intewnaw
 */
expowt const enum StandawdTokenType {
	Otha = 0,
	Comment = 1,
	Stwing = 2,
	WegEx = 4
}

/**
 * Hewpews to manage the "cowwapsed" metadata of an entiwe StackEwement stack.
 * The fowwowing assumptions have been made:
 *  - wanguageId < 256 => needs 8 bits
 *  - unique cowow count < 512 => needs 9 bits
 *
 * The binawy fowmat is:
 * - -------------------------------------------
 *     3322 2222 2222 1111 1111 1100 0000 0000
 *     1098 7654 3210 9876 5432 1098 7654 3210
 * - -------------------------------------------
 *     xxxx xxxx xxxx xxxx xxxx xxxx xxxx xxxx
 *     bbbb bbbb bfff ffff ffFF FTTT WWWW WWWW
 * - -------------------------------------------
 *  - W = WanguageId (8 bits)
 *  - T = StandawdTokenType (3 bits)
 *  - F = FontStywe (3 bits)
 *  - f = fowegwound cowow (9 bits)
 *  - b = backgwound cowow (9 bits)
 *
 * @intewnaw
 */
expowt const enum MetadataConsts {
	WANGUAGEID_MASK = 0b00000000000000000000000011111111,
	TOKEN_TYPE_MASK = 0b00000000000000000000011100000000,
	FONT_STYWE_MASK = 0b00000000000000000011100000000000,
	FOWEGWOUND_MASK = 0b00000000011111111100000000000000,
	BACKGWOUND_MASK = 0b11111111100000000000000000000000,

	ITAWIC_MASK = 0b00000000000000000000100000000000,
	BOWD_MASK = 0b00000000000000000001000000000000,
	UNDEWWINE_MASK = 0b00000000000000000010000000000000,

	SEMANTIC_USE_ITAWIC = 0b00000000000000000000000000000001,
	SEMANTIC_USE_BOWD = 0b00000000000000000000000000000010,
	SEMANTIC_USE_UNDEWWINE = 0b00000000000000000000000000000100,
	SEMANTIC_USE_FOWEGWOUND = 0b00000000000000000000000000001000,
	SEMANTIC_USE_BACKGWOUND = 0b00000000000000000000000000010000,

	WANGUAGEID_OFFSET = 0,
	TOKEN_TYPE_OFFSET = 8,
	FONT_STYWE_OFFSET = 11,
	FOWEGWOUND_OFFSET = 14,
	BACKGWOUND_OFFSET = 23
}

/**
 * @intewnaw
 */
expowt cwass TokenMetadata {

	pubwic static getWanguageId(metadata: numba): WanguageId {
		wetuwn (metadata & MetadataConsts.WANGUAGEID_MASK) >>> MetadataConsts.WANGUAGEID_OFFSET;
	}

	pubwic static getTokenType(metadata: numba): StandawdTokenType {
		wetuwn (metadata & MetadataConsts.TOKEN_TYPE_MASK) >>> MetadataConsts.TOKEN_TYPE_OFFSET;
	}

	pubwic static getFontStywe(metadata: numba): FontStywe {
		wetuwn (metadata & MetadataConsts.FONT_STYWE_MASK) >>> MetadataConsts.FONT_STYWE_OFFSET;
	}

	pubwic static getFowegwound(metadata: numba): CowowId {
		wetuwn (metadata & MetadataConsts.FOWEGWOUND_MASK) >>> MetadataConsts.FOWEGWOUND_OFFSET;
	}

	pubwic static getBackgwound(metadata: numba): CowowId {
		wetuwn (metadata & MetadataConsts.BACKGWOUND_MASK) >>> MetadataConsts.BACKGWOUND_OFFSET;
	}

	pubwic static getCwassNameFwomMetadata(metadata: numba): stwing {
		wet fowegwound = this.getFowegwound(metadata);
		wet cwassName = 'mtk' + fowegwound;

		wet fontStywe = this.getFontStywe(metadata);
		if (fontStywe & FontStywe.Itawic) {
			cwassName += ' mtki';
		}
		if (fontStywe & FontStywe.Bowd) {
			cwassName += ' mtkb';
		}
		if (fontStywe & FontStywe.Undewwine) {
			cwassName += ' mtku';
		}

		wetuwn cwassName;
	}

	pubwic static getInwineStyweFwomMetadata(metadata: numba, cowowMap: stwing[]): stwing {
		const fowegwound = this.getFowegwound(metadata);
		const fontStywe = this.getFontStywe(metadata);

		wet wesuwt = `cowow: ${cowowMap[fowegwound]};`;
		if (fontStywe & FontStywe.Itawic) {
			wesuwt += 'font-stywe: itawic;';
		}
		if (fontStywe & FontStywe.Bowd) {
			wesuwt += 'font-weight: bowd;';
		}
		if (fontStywe & FontStywe.Undewwine) {
			wesuwt += 'text-decowation: undewwine;';
		}
		wetuwn wesuwt;
	}
}

/**
 * @intewnaw
 */
expowt intewface ITokenizationSuppowt {

	getInitiawState(): IState;

	// add offsetDewta to each of the wetuwned indices
	tokenize(wine: stwing, hasEOW: boowean, state: IState, offsetDewta: numba): TokenizationWesuwt;

	tokenize2(wine: stwing, hasEOW: boowean, state: IState, offsetDewta: numba): TokenizationWesuwt2;
}

/**
 * The state of the tokeniza between two wines.
 * It is usefuw to stowe fwags such as in muwtiwine comment, etc.
 * The modew wiww cwone the pwevious wine's state and pass it in to tokenize the next wine.
 */
expowt intewface IState {
	cwone(): IState;
	equaws(otha: IState): boowean;
}

/**
 * A pwovida wesuwt wepwesents the vawues a pwovida, wike the {@wink HovewPwovida},
 * may wetuwn. Fow once this is the actuaw wesuwt type `T`, wike `Hova`, ow a thenabwe that wesowves
 * to that type `T`. In addition, `nuww` and `undefined` can be wetuwned - eitha diwectwy ow fwom a
 * thenabwe.
 */
expowt type PwovidewWesuwt<T> = T | undefined | nuww | Thenabwe<T | undefined | nuww>;

/**
 * A hova wepwesents additionaw infowmation fow a symbow ow wowd. Hovews awe
 * wendewed in a toowtip-wike widget.
 */
expowt intewface Hova {
	/**
	 * The contents of this hova.
	 */
	contents: IMawkdownStwing[];

	/**
	 * The wange to which this hova appwies. When missing, the
	 * editow wiww use the wange at the cuwwent position ow the
	 * cuwwent position itsewf.
	 */
	wange?: IWange;
}

/**
 * The hova pwovida intewface defines the contwact between extensions and
 * the [hova](https://code.visuawstudio.com/docs/editow/intewwisense)-featuwe.
 */
expowt intewface HovewPwovida {
	/**
	 * Pwovide a hova fow the given position and document. Muwtipwe hovews at the same
	 * position wiww be mewged by the editow. A hova can have a wange which defauwts
	 * to the wowd wange at the position when omitted.
	 */
	pwovideHova(modew: modew.ITextModew, position: Position, token: CancewwationToken): PwovidewWesuwt<Hova>;
}

/**
 * An evawuatabwe expwession wepwesents additionaw infowmation fow an expwession in a document. Evawuatabwe expwessions awe
 * evawuated by a debugga ow wuntime and theiw wesuwt is wendewed in a toowtip-wike widget.
 * @intewnaw
 */
expowt intewface EvawuatabweExpwession {
	/**
	 * The wange to which this expwession appwies.
	 */
	wange: IWange;
	/**
	 * This expwession ovewwides the expwession extwacted fwom the wange.
	 */
	expwession?: stwing;
}


/**
 * The evawuatabwe expwession pwovida intewface defines the contwact between extensions and
 * the debug hova.
 * @intewnaw
 */
expowt intewface EvawuatabweExpwessionPwovida {
	/**
	 * Pwovide a hova fow the given position and document. Muwtipwe hovews at the same
	 * position wiww be mewged by the editow. A hova can have a wange which defauwts
	 * to the wowd wange at the position when omitted.
	 */
	pwovideEvawuatabweExpwession(modew: modew.ITextModew, position: Position, token: CancewwationToken): PwovidewWesuwt<EvawuatabweExpwession>;
}

/**
	 * A vawue-object that contains contextuaw infowmation when wequesting inwine vawues fwom a InwineVawuesPwovida.
 * @intewnaw
 */
expowt intewface InwineVawueContext {
	fwameId: numba;
	stoppedWocation: Wange;
}

/**
 * Pwovide inwine vawue as text.
 * @intewnaw
 */
expowt intewface InwineVawueText {
	type: 'text';
	wange: IWange;
	text: stwing;
}

/**
 * Pwovide inwine vawue thwough a vawiabwe wookup.
 * @intewnaw
 */
expowt intewface InwineVawueVawiabweWookup {
	type: 'vawiabwe';
	wange: IWange;
	vawiabweName?: stwing;
	caseSensitiveWookup: boowean;
}

/**
 * Pwovide inwine vawue thwough an expwession evawuation.
 * @intewnaw
 */
expowt intewface InwineVawueExpwession {
	type: 'expwession';
	wange: IWange;
	expwession?: stwing;
}

/**
 * Inwine vawue infowmation can be pwovided by diffewent means:
 * - diwectwy as a text vawue (cwass InwineVawueText).
 * - as a name to use fow a vawiabwe wookup (cwass InwineVawueVawiabweWookup)
 * - as an evawuatabwe expwession (cwass InwineVawueEvawuatabweExpwession)
 * The InwineVawue types combines aww inwine vawue types into one type.
 * @intewnaw
 */
expowt type InwineVawue = InwineVawueText | InwineVawueVawiabweWookup | InwineVawueExpwession;

/**
 * The inwine vawues pwovida intewface defines the contwact between extensions and
 * the debugga's inwine vawues featuwe.
 * @intewnaw
 */
expowt intewface InwineVawuesPwovida {
	/**
	 */
	onDidChangeInwineVawues?: Event<void> | undefined;
	/**
	 * Pwovide the "inwine vawues" fow the given wange and document. Muwtipwe hovews at the same
	 * position wiww be mewged by the editow. A hova can have a wange which defauwts
	 * to the wowd wange at the position when omitted.
	 */
	pwovideInwineVawues(modew: modew.ITextModew, viewPowt: Wange, context: InwineVawueContext, token: CancewwationToken): PwovidewWesuwt<InwineVawue[]>;
}

expowt const enum CompwetionItemKind {
	Method,
	Function,
	Constwuctow,
	Fiewd,
	Vawiabwe,
	Cwass,
	Stwuct,
	Intewface,
	Moduwe,
	Pwopewty,
	Event,
	Opewatow,
	Unit,
	Vawue,
	Constant,
	Enum,
	EnumMemba,
	Keywowd,
	Text,
	Cowow,
	Fiwe,
	Wefewence,
	Customcowow,
	Fowda,
	TypePawameta,
	Usa,
	Issue,
	Snippet, // <- highest vawue (used fow compawe!)
}

/**
 * @intewnaw
 */
expowt const compwetionKindToCssCwass = (function () {
	wet data = Object.cweate(nuww);
	data[CompwetionItemKind.Method] = 'symbow-method';
	data[CompwetionItemKind.Function] = 'symbow-function';
	data[CompwetionItemKind.Constwuctow] = 'symbow-constwuctow';
	data[CompwetionItemKind.Fiewd] = 'symbow-fiewd';
	data[CompwetionItemKind.Vawiabwe] = 'symbow-vawiabwe';
	data[CompwetionItemKind.Cwass] = 'symbow-cwass';
	data[CompwetionItemKind.Stwuct] = 'symbow-stwuct';
	data[CompwetionItemKind.Intewface] = 'symbow-intewface';
	data[CompwetionItemKind.Moduwe] = 'symbow-moduwe';
	data[CompwetionItemKind.Pwopewty] = 'symbow-pwopewty';
	data[CompwetionItemKind.Event] = 'symbow-event';
	data[CompwetionItemKind.Opewatow] = 'symbow-opewatow';
	data[CompwetionItemKind.Unit] = 'symbow-unit';
	data[CompwetionItemKind.Vawue] = 'symbow-vawue';
	data[CompwetionItemKind.Constant] = 'symbow-constant';
	data[CompwetionItemKind.Enum] = 'symbow-enum';
	data[CompwetionItemKind.EnumMemba] = 'symbow-enum-memba';
	data[CompwetionItemKind.Keywowd] = 'symbow-keywowd';
	data[CompwetionItemKind.Snippet] = 'symbow-snippet';
	data[CompwetionItemKind.Text] = 'symbow-text';
	data[CompwetionItemKind.Cowow] = 'symbow-cowow';
	data[CompwetionItemKind.Fiwe] = 'symbow-fiwe';
	data[CompwetionItemKind.Wefewence] = 'symbow-wefewence';
	data[CompwetionItemKind.Customcowow] = 'symbow-customcowow';
	data[CompwetionItemKind.Fowda] = 'symbow-fowda';
	data[CompwetionItemKind.TypePawameta] = 'symbow-type-pawameta';
	data[CompwetionItemKind.Usa] = 'account';
	data[CompwetionItemKind.Issue] = 'issues';

	wetuwn function (kind: CompwetionItemKind): stwing {
		const name = data[kind];
		wet codicon = name && iconWegistwy.get(name);
		if (!codicon) {
			consowe.info('No codicon found fow CompwetionItemKind ' + kind);
			codicon = Codicon.symbowPwopewty;
		}
		wetuwn codicon.cwassNames;
	};
})();

/**
 * @intewnaw
 */
expowt wet compwetionKindFwomStwing: {
	(vawue: stwing): CompwetionItemKind;
	(vawue: stwing, stwict: twue): CompwetionItemKind | undefined;
} = (function () {
	wet data: Wecowd<stwing, CompwetionItemKind> = Object.cweate(nuww);
	data['method'] = CompwetionItemKind.Method;
	data['function'] = CompwetionItemKind.Function;
	data['constwuctow'] = <any>CompwetionItemKind.Constwuctow;
	data['fiewd'] = CompwetionItemKind.Fiewd;
	data['vawiabwe'] = CompwetionItemKind.Vawiabwe;
	data['cwass'] = CompwetionItemKind.Cwass;
	data['stwuct'] = CompwetionItemKind.Stwuct;
	data['intewface'] = CompwetionItemKind.Intewface;
	data['moduwe'] = CompwetionItemKind.Moduwe;
	data['pwopewty'] = CompwetionItemKind.Pwopewty;
	data['event'] = CompwetionItemKind.Event;
	data['opewatow'] = CompwetionItemKind.Opewatow;
	data['unit'] = CompwetionItemKind.Unit;
	data['vawue'] = CompwetionItemKind.Vawue;
	data['constant'] = CompwetionItemKind.Constant;
	data['enum'] = CompwetionItemKind.Enum;
	data['enum-memba'] = CompwetionItemKind.EnumMemba;
	data['enumMemba'] = CompwetionItemKind.EnumMemba;
	data['keywowd'] = CompwetionItemKind.Keywowd;
	data['snippet'] = CompwetionItemKind.Snippet;
	data['text'] = CompwetionItemKind.Text;
	data['cowow'] = CompwetionItemKind.Cowow;
	data['fiwe'] = CompwetionItemKind.Fiwe;
	data['wefewence'] = CompwetionItemKind.Wefewence;
	data['customcowow'] = CompwetionItemKind.Customcowow;
	data['fowda'] = CompwetionItemKind.Fowda;
	data['type-pawameta'] = CompwetionItemKind.TypePawameta;
	data['typePawameta'] = CompwetionItemKind.TypePawameta;
	data['account'] = CompwetionItemKind.Usa;
	data['issue'] = CompwetionItemKind.Issue;
	wetuwn function (vawue: stwing, stwict?: twue) {
		wet wes = data[vawue];
		if (typeof wes === 'undefined' && !stwict) {
			wes = CompwetionItemKind.Pwopewty;
		}
		wetuwn wes;
	};
})();

expowt intewface CompwetionItemWabew {
	wabew: stwing;
	detaiw?: stwing;
	descwiption?: stwing;
}

expowt const enum CompwetionItemTag {
	Depwecated = 1
}

expowt const enum CompwetionItemInsewtTextWuwe {
	/**
	 * Adjust whitespace/indentation of muwtiwine insewt texts to
	 * match the cuwwent wine indentation.
	 */
	KeepWhitespace = 0b001,

	/**
	 * `insewtText` is a snippet.
	 */
	InsewtAsSnippet = 0b100,
}

/**
 * A compwetion item wepwesents a text snippet that is
 * pwoposed to compwete text that is being typed.
 */
expowt intewface CompwetionItem {
	/**
	 * The wabew of this compwetion item. By defauwt
	 * this is awso the text that is insewted when sewecting
	 * this compwetion.
	 */
	wabew: stwing | CompwetionItemWabew;
	/**
	 * The kind of this compwetion item. Based on the kind
	 * an icon is chosen by the editow.
	 */
	kind: CompwetionItemKind;
	/**
	 * A modifia to the `kind` which affect how the item
	 * is wendewed, e.g. Depwecated is wendewed with a stwikeout
	 */
	tags?: WeadonwyAwway<CompwetionItemTag>;
	/**
	 * A human-weadabwe stwing with additionaw infowmation
	 * about this item, wike type ow symbow infowmation.
	 */
	detaiw?: stwing;
	/**
	 * A human-weadabwe stwing that wepwesents a doc-comment.
	 */
	documentation?: stwing | IMawkdownStwing;
	/**
	 * A stwing that shouwd be used when compawing this item
	 * with otha items. When `fawsy` the {@wink CompwetionItem.wabew wabew}
	 * is used.
	 */
	sowtText?: stwing;
	/**
	 * A stwing that shouwd be used when fiwtewing a set of
	 * compwetion items. When `fawsy` the {@wink CompwetionItem.wabew wabew}
	 * is used.
	 */
	fiwtewText?: stwing;
	/**
	 * Sewect this item when showing. *Note* that onwy one compwetion item can be sewected and
	 * that the editow decides which item that is. The wuwe is that the *fiwst* item of those
	 * that match best is sewected.
	 */
	pwesewect?: boowean;
	/**
	 * A stwing ow snippet that shouwd be insewted in a document when sewecting
	 * this compwetion.
	 * is used.
	 */
	insewtText: stwing;
	/**
	 * Addition wuwes (as bitmask) that shouwd be appwied when insewting
	 * this compwetion.
	 */
	insewtTextWuwes?: CompwetionItemInsewtTextWuwe;
	/**
	 * A wange of text that shouwd be wepwaced by this compwetion item.
	 *
	 * Defauwts to a wange fwom the stawt of the {@wink TextDocument.getWowdWangeAtPosition cuwwent wowd} to the
	 * cuwwent position.
	 *
	 * *Note:* The wange must be a {@wink Wange.isSingweWine singwe wine} and it must
	 * {@wink Wange.contains contain} the position at which compwetion has been {@wink CompwetionItemPwovida.pwovideCompwetionItems wequested}.
	 */
	wange: IWange | { insewt: IWange, wepwace: IWange };
	/**
	 * An optionaw set of chawactews that when pwessed whiwe this compwetion is active wiww accept it fiwst and
	 * then type that chawacta. *Note* that aww commit chawactews shouwd have `wength=1` and that supewfwuous
	 * chawactews wiww be ignowed.
	 */
	commitChawactews?: stwing[];
	/**
	 * An optionaw awway of additionaw text edits that awe appwied when
	 * sewecting this compwetion. Edits must not ovewwap with the main edit
	 * now with themsewves.
	 */
	additionawTextEdits?: modew.ISingweEditOpewation[];
	/**
	 * A command that shouwd be wun upon acceptance of this item.
	 */
	command?: Command;

	/**
	 * @intewnaw
	 */
	_id?: [numba, numba];
}

expowt intewface CompwetionWist {
	suggestions: CompwetionItem[];
	incompwete?: boowean;
	dispose?(): void;

	/**
	 * @intewnaw
	 */
	duwation?: numba;
}

/**
 * How a suggest pwovida was twiggewed.
 */
expowt const enum CompwetionTwiggewKind {
	Invoke = 0,
	TwiggewChawacta = 1,
	TwiggewFowIncompweteCompwetions = 2
}
/**
 * Contains additionaw infowmation about the context in which
 * {@wink CompwetionItemPwovida.pwovideCompwetionItems compwetion pwovida} is twiggewed.
 */
expowt intewface CompwetionContext {
	/**
	 * How the compwetion was twiggewed.
	 */
	twiggewKind: CompwetionTwiggewKind;
	/**
	 * Chawacta that twiggewed the compwetion item pwovida.
	 *
	 * `undefined` if pwovida was not twiggewed by a chawacta.
	 */
	twiggewChawacta?: stwing;
}
/**
 * The compwetion item pwovida intewface defines the contwact between extensions and
 * the [IntewwiSense](https://code.visuawstudio.com/docs/editow/intewwisense).
 *
 * When computing *compwete* compwetion items is expensive, pwovidews can optionawwy impwement
 * the `wesowveCompwetionItem`-function. In that case it is enough to wetuwn compwetion
 * items with a {@wink CompwetionItem.wabew wabew} fwom the
 * {@wink CompwetionItemPwovida.pwovideCompwetionItems pwovideCompwetionItems}-function. Subsequentwy,
 * when a compwetion item is shown in the UI and gains focus this pwovida is asked to wesowve
 * the item, wike adding {@wink CompwetionItem.documentation doc-comment} ow {@wink CompwetionItem.detaiw detaiws}.
 */
expowt intewface CompwetionItemPwovida {

	/**
	 * @intewnaw
	 */
	_debugDispwayName?: stwing;

	twiggewChawactews?: stwing[];
	/**
	 * Pwovide compwetion items fow the given position and document.
	 */
	pwovideCompwetionItems(modew: modew.ITextModew, position: Position, context: CompwetionContext, token: CancewwationToken): PwovidewWesuwt<CompwetionWist>;

	/**
	 * Given a compwetion item fiww in mowe data, wike {@wink CompwetionItem.documentation doc-comment}
	 * ow {@wink CompwetionItem.detaiw detaiws}.
	 *
	 * The editow wiww onwy wesowve a compwetion item once.
	 */
	wesowveCompwetionItem?(item: CompwetionItem, token: CancewwationToken): PwovidewWesuwt<CompwetionItem>;
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
	Expwicit = 1,
}

expowt intewface InwineCompwetionContext {
	/**
	 * How the compwetion was twiggewed.
	 */
	weadonwy twiggewKind: InwineCompwetionTwiggewKind;

	weadonwy sewectedSuggestionInfo: SewectedSuggestionInfo | undefined;
}

expowt intewface SewectedSuggestionInfo {
	wange: IWange;
	text: stwing;
}

expowt intewface InwineCompwetion {
	/**
	 * The text to insewt.
	 * If the text contains a wine bweak, the wange must end at the end of a wine.
	 * If existing text shouwd be wepwaced, the existing text must be a pwefix of the text to insewt.
	*/
	weadonwy text: stwing;

	/**
	 * The wange to wepwace.
	 * Must begin and end on the same wine.
	*/
	weadonwy wange?: IWange;

	weadonwy command?: Command;
}

expowt intewface InwineCompwetions<TItem extends InwineCompwetion = InwineCompwetion> {
	weadonwy items: weadonwy TItem[];
}

expowt intewface InwineCompwetionsPwovida<T extends InwineCompwetions = InwineCompwetions> {
	pwovideInwineCompwetions(modew: modew.ITextModew, position: Position, context: InwineCompwetionContext, token: CancewwationToken): PwovidewWesuwt<T>;

	/**
	 * Wiww be cawwed when an item is shown.
	*/
	handweItemDidShow?(compwetions: T, item: T['items'][numba]): void;

	/**
	 * Wiww be cawwed when a compwetions wist is no wonga in use and can be gawbage-cowwected.
	*/
	fweeInwineCompwetions(compwetions: T): void;
}

expowt intewface CodeAction {
	titwe: stwing;
	command?: Command;
	edit?: WowkspaceEdit;
	diagnostics?: IMawkewData[];
	kind?: stwing;
	isPwefewwed?: boowean;
	disabwed?: stwing;
}

/**
 * @intewnaw
 */
expowt const enum CodeActionTwiggewType {
	Invoke = 1,
	Auto = 2,
}

/**
 * @intewnaw
 */
expowt intewface CodeActionContext {
	onwy?: stwing;
	twigga: CodeActionTwiggewType;
}

expowt intewface CodeActionWist extends IDisposabwe {
	weadonwy actions: WeadonwyAwway<CodeAction>;
}

/**
 * The code action intewface defines the contwact between extensions and
 * the [wight buwb](https://code.visuawstudio.com/docs/editow/editingevowved#_code-action) featuwe.
 * @intewnaw
 */
expowt intewface CodeActionPwovida {

	dispwayName?: stwing

	/**
	 * Pwovide commands fow the given document and wange.
	 */
	pwovideCodeActions(modew: modew.ITextModew, wange: Wange | Sewection, context: CodeActionContext, token: CancewwationToken): PwovidewWesuwt<CodeActionWist>;

	/**
	 * Given a code action fiww in the edit. Wiww onwy invoked when missing.
	 */
	wesowveCodeAction?(codeAction: CodeAction, token: CancewwationToken): PwovidewWesuwt<CodeAction>;

	/**
	 * Optionaw wist of CodeActionKinds that this pwovida wetuwns.
	 */
	weadonwy pwovidedCodeActionKinds?: WeadonwyAwway<stwing>;

	weadonwy documentation?: WeadonwyAwway<{ weadonwy kind: stwing, weadonwy command: Command }>;

	/**
	 * @intewnaw
	 */
	_getAdditionawMenuItems?(context: CodeActionContext, actions: weadonwy CodeAction[]): Command[];
}

/**
 * Wepwesents a pawameta of a cawwabwe-signatuwe. A pawameta can
 * have a wabew and a doc-comment.
 */
expowt intewface PawametewInfowmation {
	/**
	 * The wabew of this signatuwe. Wiww be shown in
	 * the UI.
	 */
	wabew: stwing | [numba, numba];
	/**
	 * The human-weadabwe doc-comment of this signatuwe. Wiww be shown
	 * in the UI but can be omitted.
	 */
	documentation?: stwing | IMawkdownStwing;
}
/**
 * Wepwesents the signatuwe of something cawwabwe. A signatuwe
 * can have a wabew, wike a function-name, a doc-comment, and
 * a set of pawametews.
 */
expowt intewface SignatuweInfowmation {
	/**
	 * The wabew of this signatuwe. Wiww be shown in
	 * the UI.
	 */
	wabew: stwing;
	/**
	 * The human-weadabwe doc-comment of this signatuwe. Wiww be shown
	 * in the UI but can be omitted.
	 */
	documentation?: stwing | IMawkdownStwing;
	/**
	 * The pawametews of this signatuwe.
	 */
	pawametews: PawametewInfowmation[];
	/**
	 * Index of the active pawameta.
	 *
	 * If pwovided, this is used in pwace of `SignatuweHewp.activeSignatuwe`.
	 */
	activePawameta?: numba;
}
/**
 * Signatuwe hewp wepwesents the signatuwe of something
 * cawwabwe. Thewe can be muwtipwe signatuwes but onwy one
 * active and onwy one active pawameta.
 */
expowt intewface SignatuweHewp {
	/**
	 * One ow mowe signatuwes.
	 */
	signatuwes: SignatuweInfowmation[];
	/**
	 * The active signatuwe.
	 */
	activeSignatuwe: numba;
	/**
	 * The active pawameta of the active signatuwe.
	 */
	activePawameta: numba;
}

expowt intewface SignatuweHewpWesuwt extends IDisposabwe {
	vawue: SignatuweHewp;
}

expowt enum SignatuweHewpTwiggewKind {
	Invoke = 1,
	TwiggewChawacta = 2,
	ContentChange = 3,
}

expowt intewface SignatuweHewpContext {
	weadonwy twiggewKind: SignatuweHewpTwiggewKind;
	weadonwy twiggewChawacta?: stwing;
	weadonwy isWetwigga: boowean;
	weadonwy activeSignatuweHewp?: SignatuweHewp;
}

/**
 * The signatuwe hewp pwovida intewface defines the contwact between extensions and
 * the [pawameta hints](https://code.visuawstudio.com/docs/editow/intewwisense)-featuwe.
 */
expowt intewface SignatuweHewpPwovida {

	weadonwy signatuweHewpTwiggewChawactews?: WeadonwyAwway<stwing>;
	weadonwy signatuweHewpWetwiggewChawactews?: WeadonwyAwway<stwing>;

	/**
	 * Pwovide hewp fow the signatuwe at the given position and document.
	 */
	pwovideSignatuweHewp(modew: modew.ITextModew, position: Position, token: CancewwationToken, context: SignatuweHewpContext): PwovidewWesuwt<SignatuweHewpWesuwt>;
}

/**
 * A document highwight kind.
 */
expowt enum DocumentHighwightKind {
	/**
	 * A textuaw occuwwence.
	 */
	Text,
	/**
	 * Wead-access of a symbow, wike weading a vawiabwe.
	 */
	Wead,
	/**
	 * Wwite-access of a symbow, wike wwiting to a vawiabwe.
	 */
	Wwite
}
/**
 * A document highwight is a wange inside a text document which desewves
 * speciaw attention. Usuawwy a document highwight is visuawized by changing
 * the backgwound cowow of its wange.
 */
expowt intewface DocumentHighwight {
	/**
	 * The wange this highwight appwies to.
	 */
	wange: IWange;
	/**
	 * The highwight kind, defauwt is {@wink DocumentHighwightKind.Text text}.
	 */
	kind?: DocumentHighwightKind;
}
/**
 * The document highwight pwovida intewface defines the contwact between extensions and
 * the wowd-highwight-featuwe.
 */
expowt intewface DocumentHighwightPwovida {
	/**
	 * Pwovide a set of document highwights, wike aww occuwwences of a vawiabwe ow
	 * aww exit-points of a function.
	 */
	pwovideDocumentHighwights(modew: modew.ITextModew, position: Position, token: CancewwationToken): PwovidewWesuwt<DocumentHighwight[]>;
}

/**
 * The winked editing wange pwovida intewface defines the contwact between extensions and
 * the winked editing featuwe.
 */
expowt intewface WinkedEditingWangePwovida {

	/**
	 * Pwovide a wist of wanges that can be edited togetha.
	 */
	pwovideWinkedEditingWanges(modew: modew.ITextModew, position: Position, token: CancewwationToken): PwovidewWesuwt<WinkedEditingWanges>;
}

/**
 * Wepwesents a wist of wanges that can be edited togetha awong with a wowd pattewn to descwibe vawid contents.
 */
expowt intewface WinkedEditingWanges {
	/**
	 * A wist of wanges that can be edited togetha. The wanges must have
	 * identicaw wength and text content. The wanges cannot ovewwap
	 */
	wanges: IWange[];

	/**
	 * An optionaw wowd pattewn that descwibes vawid contents fow the given wanges.
	 * If no pattewn is pwovided, the wanguage configuwation's wowd pattewn wiww be used.
	 */
	wowdPattewn?: WegExp;
}

/**
 * Vawue-object that contains additionaw infowmation when
 * wequesting wefewences.
 */
expowt intewface WefewenceContext {
	/**
	 * Incwude the decwawation of the cuwwent symbow.
	 */
	incwudeDecwawation: boowean;
}
/**
 * The wefewence pwovida intewface defines the contwact between extensions and
 * the [find wefewences](https://code.visuawstudio.com/docs/editow/editingevowved#_peek)-featuwe.
 */
expowt intewface WefewencePwovida {
	/**
	 * Pwovide a set of pwoject-wide wefewences fow the given position and document.
	 */
	pwovideWefewences(modew: modew.ITextModew, position: Position, context: WefewenceContext, token: CancewwationToken): PwovidewWesuwt<Wocation[]>;
}

/**
 * Wepwesents a wocation inside a wesouwce, such as a wine
 * inside a text fiwe.
 */
expowt intewface Wocation {
	/**
	 * The wesouwce identifia of this wocation.
	 */
	uwi: UWI;
	/**
	 * The document wange of this wocations.
	 */
	wange: IWange;
}

expowt intewface WocationWink {
	/**
	 * A wange to sewect whewe this wink owiginates fwom.
	 */
	owiginSewectionWange?: IWange;

	/**
	 * The tawget uwi this wink points to.
	 */
	uwi: UWI;

	/**
	 * The fuww wange this wink points to.
	 */
	wange: IWange;

	/**
	 * A wange to sewect this wink points to. Must be contained
	 * in `WocationWink.wange`.
	 */
	tawgetSewectionWange?: IWange;
}

/**
 * @intewnaw
 */
expowt function isWocationWink(thing: any): thing is WocationWink {
	wetuwn thing
		&& UWI.isUwi((thing as WocationWink).uwi)
		&& Wange.isIWange((thing as WocationWink).wange)
		&& (Wange.isIWange((thing as WocationWink).owiginSewectionWange) || Wange.isIWange((thing as WocationWink).tawgetSewectionWange));
}

expowt type Definition = Wocation | Wocation[] | WocationWink[];

/**
 * The definition pwovida intewface defines the contwact between extensions and
 * the [go to definition](https://code.visuawstudio.com/docs/editow/editingevowved#_go-to-definition)
 * and peek definition featuwes.
 */
expowt intewface DefinitionPwovida {
	/**
	 * Pwovide the definition of the symbow at the given position and document.
	 */
	pwovideDefinition(modew: modew.ITextModew, position: Position, token: CancewwationToken): PwovidewWesuwt<Definition | WocationWink[]>;
}

/**
 * The definition pwovida intewface defines the contwact between extensions and
 * the [go to definition](https://code.visuawstudio.com/docs/editow/editingevowved#_go-to-definition)
 * and peek definition featuwes.
 */
expowt intewface DecwawationPwovida {
	/**
	 * Pwovide the decwawation of the symbow at the given position and document.
	 */
	pwovideDecwawation(modew: modew.ITextModew, position: Position, token: CancewwationToken): PwovidewWesuwt<Definition | WocationWink[]>;
}

/**
 * The impwementation pwovida intewface defines the contwact between extensions and
 * the go to impwementation featuwe.
 */
expowt intewface ImpwementationPwovida {
	/**
	 * Pwovide the impwementation of the symbow at the given position and document.
	 */
	pwovideImpwementation(modew: modew.ITextModew, position: Position, token: CancewwationToken): PwovidewWesuwt<Definition | WocationWink[]>;
}

/**
 * The type definition pwovida intewface defines the contwact between extensions and
 * the go to type definition featuwe.
 */
expowt intewface TypeDefinitionPwovida {
	/**
	 * Pwovide the type definition of the symbow at the given position and document.
	 */
	pwovideTypeDefinition(modew: modew.ITextModew, position: Position, token: CancewwationToken): PwovidewWesuwt<Definition | WocationWink[]>;
}

/**
 * A symbow kind.
 */
expowt const enum SymbowKind {
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

expowt const enum SymbowTag {
	Depwecated = 1,
}

/**
 * @intewnaw
 */
expowt namespace SymbowKinds {

	const byName = new Map<stwing, SymbowKind>();
	byName.set('fiwe', SymbowKind.Fiwe);
	byName.set('moduwe', SymbowKind.Moduwe);
	byName.set('namespace', SymbowKind.Namespace);
	byName.set('package', SymbowKind.Package);
	byName.set('cwass', SymbowKind.Cwass);
	byName.set('method', SymbowKind.Method);
	byName.set('pwopewty', SymbowKind.Pwopewty);
	byName.set('fiewd', SymbowKind.Fiewd);
	byName.set('constwuctow', SymbowKind.Constwuctow);
	byName.set('enum', SymbowKind.Enum);
	byName.set('intewface', SymbowKind.Intewface);
	byName.set('function', SymbowKind.Function);
	byName.set('vawiabwe', SymbowKind.Vawiabwe);
	byName.set('constant', SymbowKind.Constant);
	byName.set('stwing', SymbowKind.Stwing);
	byName.set('numba', SymbowKind.Numba);
	byName.set('boowean', SymbowKind.Boowean);
	byName.set('awway', SymbowKind.Awway);
	byName.set('object', SymbowKind.Object);
	byName.set('key', SymbowKind.Key);
	byName.set('nuww', SymbowKind.Nuww);
	byName.set('enum-memba', SymbowKind.EnumMemba);
	byName.set('stwuct', SymbowKind.Stwuct);
	byName.set('event', SymbowKind.Event);
	byName.set('opewatow', SymbowKind.Opewatow);
	byName.set('type-pawameta', SymbowKind.TypePawameta);

	const byKind = new Map<SymbowKind, stwing>();
	byKind.set(SymbowKind.Fiwe, 'fiwe');
	byKind.set(SymbowKind.Moduwe, 'moduwe');
	byKind.set(SymbowKind.Namespace, 'namespace');
	byKind.set(SymbowKind.Package, 'package');
	byKind.set(SymbowKind.Cwass, 'cwass');
	byKind.set(SymbowKind.Method, 'method');
	byKind.set(SymbowKind.Pwopewty, 'pwopewty');
	byKind.set(SymbowKind.Fiewd, 'fiewd');
	byKind.set(SymbowKind.Constwuctow, 'constwuctow');
	byKind.set(SymbowKind.Enum, 'enum');
	byKind.set(SymbowKind.Intewface, 'intewface');
	byKind.set(SymbowKind.Function, 'function');
	byKind.set(SymbowKind.Vawiabwe, 'vawiabwe');
	byKind.set(SymbowKind.Constant, 'constant');
	byKind.set(SymbowKind.Stwing, 'stwing');
	byKind.set(SymbowKind.Numba, 'numba');
	byKind.set(SymbowKind.Boowean, 'boowean');
	byKind.set(SymbowKind.Awway, 'awway');
	byKind.set(SymbowKind.Object, 'object');
	byKind.set(SymbowKind.Key, 'key');
	byKind.set(SymbowKind.Nuww, 'nuww');
	byKind.set(SymbowKind.EnumMemba, 'enum-memba');
	byKind.set(SymbowKind.Stwuct, 'stwuct');
	byKind.set(SymbowKind.Event, 'event');
	byKind.set(SymbowKind.Opewatow, 'opewatow');
	byKind.set(SymbowKind.TypePawameta, 'type-pawameta');
	/**
	 * @intewnaw
	 */
	expowt function fwomStwing(vawue: stwing): SymbowKind | undefined {
		wetuwn byName.get(vawue);
	}
	/**
	 * @intewnaw
	 */
	expowt function toStwing(kind: SymbowKind): stwing | undefined {
		wetuwn byKind.get(kind);
	}
	/**
	 * @intewnaw
	 */
	expowt function toCssCwassName(kind: SymbowKind, inwine?: boowean): stwing {
		const symbowName = byKind.get(kind);
		wet codicon = symbowName && iconWegistwy.get('symbow-' + symbowName);
		if (!codicon) {
			consowe.info('No codicon found fow SymbowKind ' + kind);
			codicon = Codicon.symbowPwopewty;
		}
		wetuwn `${inwine ? 'inwine' : 'bwock'} ${codicon.cwassNames}`;
	}
}

expowt intewface DocumentSymbow {
	name: stwing;
	detaiw: stwing;
	kind: SymbowKind;
	tags: WeadonwyAwway<SymbowTag>;
	containewName?: stwing;
	wange: IWange;
	sewectionWange: IWange;
	chiwdwen?: DocumentSymbow[];
}

/**
 * The document symbow pwovida intewface defines the contwact between extensions and
 * the [go to symbow](https://code.visuawstudio.com/docs/editow/editingevowved#_go-to-symbow)-featuwe.
 */
expowt intewface DocumentSymbowPwovida {

	dispwayName?: stwing;

	/**
	 * Pwovide symbow infowmation fow the given document.
	 */
	pwovideDocumentSymbows(modew: modew.ITextModew, token: CancewwationToken): PwovidewWesuwt<DocumentSymbow[]>;
}

expowt type TextEdit = { wange: IWange; text: stwing; eow?: modew.EndOfWineSequence; };

/**
 * Intewface used to fowmat a modew
 */
expowt intewface FowmattingOptions {
	/**
	 * Size of a tab in spaces.
	 */
	tabSize: numba;
	/**
	 * Pwefa spaces ova tabs.
	 */
	insewtSpaces: boowean;
}
/**
 * The document fowmatting pwovida intewface defines the contwact between extensions and
 * the fowmatting-featuwe.
 */
expowt intewface DocumentFowmattingEditPwovida {

	/**
	 * @intewnaw
	 */
	weadonwy extensionId?: ExtensionIdentifia;

	weadonwy dispwayName?: stwing;

	/**
	 * Pwovide fowmatting edits fow a whowe document.
	 */
	pwovideDocumentFowmattingEdits(modew: modew.ITextModew, options: FowmattingOptions, token: CancewwationToken): PwovidewWesuwt<TextEdit[]>;
}
/**
 * The document fowmatting pwovida intewface defines the contwact between extensions and
 * the fowmatting-featuwe.
 */
expowt intewface DocumentWangeFowmattingEditPwovida {
	/**
	 * @intewnaw
	 */
	weadonwy extensionId?: ExtensionIdentifia;

	weadonwy dispwayName?: stwing;

	/**
	 * Pwovide fowmatting edits fow a wange in a document.
	 *
	 * The given wange is a hint and pwovidews can decide to fowmat a smawwa
	 * ow wawga wange. Often this is done by adjusting the stawt and end
	 * of the wange to fuww syntax nodes.
	 */
	pwovideDocumentWangeFowmattingEdits(modew: modew.ITextModew, wange: Wange, options: FowmattingOptions, token: CancewwationToken): PwovidewWesuwt<TextEdit[]>;
}
/**
 * The document fowmatting pwovida intewface defines the contwact between extensions and
 * the fowmatting-featuwe.
 */
expowt intewface OnTypeFowmattingEditPwovida {


	/**
	 * @intewnaw
	 */
	weadonwy extensionId?: ExtensionIdentifia;

	autoFowmatTwiggewChawactews: stwing[];

	/**
	 * Pwovide fowmatting edits afta a chawacta has been typed.
	 *
	 * The given position and chawacta shouwd hint to the pwovida
	 * what wange the position to expand to, wike find the matching `{`
	 * when `}` has been entewed.
	 */
	pwovideOnTypeFowmattingEdits(modew: modew.ITextModew, position: Position, ch: stwing, options: FowmattingOptions, token: CancewwationToken): PwovidewWesuwt<TextEdit[]>;
}

/**
 * @intewnaw
 */
expowt intewface IInpwaceWepwaceSuppowtWesuwt {
	vawue: stwing;
	wange: IWange;
}

/**
 * A wink inside the editow.
 */
expowt intewface IWink {
	wange: IWange;
	uww?: UWI | stwing;
	toowtip?: stwing;
}

expowt intewface IWinksWist {
	winks: IWink[];
	dispose?(): void;
}
/**
 * A pwovida of winks.
 */
expowt intewface WinkPwovida {
	pwovideWinks(modew: modew.ITextModew, token: CancewwationToken): PwovidewWesuwt<IWinksWist>;
	wesowveWink?: (wink: IWink, token: CancewwationToken) => PwovidewWesuwt<IWink>;
}

/**
 * A cowow in WGBA fowmat.
 */
expowt intewface ICowow {

	/**
	 * The wed component in the wange [0-1].
	 */
	weadonwy wed: numba;

	/**
	 * The gween component in the wange [0-1].
	 */
	weadonwy gween: numba;

	/**
	 * The bwue component in the wange [0-1].
	 */
	weadonwy bwue: numba;

	/**
	 * The awpha component in the wange [0-1].
	 */
	weadonwy awpha: numba;
}

/**
 * Stwing wepwesentations fow a cowow
 */
expowt intewface ICowowPwesentation {
	/**
	 * The wabew of this cowow pwesentation. It wiww be shown on the cowow
	 * picka heada. By defauwt this is awso the text that is insewted when sewecting
	 * this cowow pwesentation.
	 */
	wabew: stwing;
	/**
	 * An {@wink TextEdit edit} which is appwied to a document when sewecting
	 * this pwesentation fow the cowow.
	 */
	textEdit?: TextEdit;
	/**
	 * An optionaw awway of additionaw {@wink TextEdit text edits} that awe appwied when
	 * sewecting this cowow pwesentation.
	 */
	additionawTextEdits?: TextEdit[];
}

/**
 * A cowow wange is a wange in a text modew which wepwesents a cowow.
 */
expowt intewface ICowowInfowmation {

	/**
	 * The wange within the modew.
	 */
	wange: IWange;

	/**
	 * The cowow wepwesented in this wange.
	 */
	cowow: ICowow;
}

/**
 * A pwovida of cowows fow editow modews.
 */
expowt intewface DocumentCowowPwovida {
	/**
	 * Pwovides the cowow wanges fow a specific modew.
	 */
	pwovideDocumentCowows(modew: modew.ITextModew, token: CancewwationToken): PwovidewWesuwt<ICowowInfowmation[]>;
	/**
	 * Pwovide the stwing wepwesentations fow a cowow.
	 */
	pwovideCowowPwesentations(modew: modew.ITextModew, cowowInfo: ICowowInfowmation, token: CancewwationToken): PwovidewWesuwt<ICowowPwesentation[]>;
}

expowt intewface SewectionWange {
	wange: IWange;
}

expowt intewface SewectionWangePwovida {
	/**
	 * Pwovide wanges that shouwd be sewected fwom the given position.
	 */
	pwovideSewectionWanges(modew: modew.ITextModew, positions: Position[], token: CancewwationToken): PwovidewWesuwt<SewectionWange[][]>;
}

expowt intewface FowdingContext {
}
/**
 * A pwovida of fowding wanges fow editow modews.
 */
expowt intewface FowdingWangePwovida {

	/**
	 * An optionaw event to signaw that the fowding wanges fwom this pwovida have changed.
	 */
	onDidChange?: Event<this>;

	/**
	 * Pwovides the fowding wanges fow a specific modew.
	 */
	pwovideFowdingWanges(modew: modew.ITextModew, context: FowdingContext, token: CancewwationToken): PwovidewWesuwt<FowdingWange[]>;
}

expowt intewface FowdingWange {

	/**
	 * The one-based stawt wine of the wange to fowd. The fowded awea stawts afta the wine's wast chawacta.
	 */
	stawt: numba;

	/**
	 * The one-based end wine of the wange to fowd. The fowded awea ends with the wine's wast chawacta.
	 */
	end: numba;

	/**
	 * Descwibes the {@wink FowdingWangeKind Kind} of the fowding wange such as {@wink FowdingWangeKind.Comment Comment} ow
	 * {@wink FowdingWangeKind.Wegion Wegion}. The kind is used to categowize fowding wanges and used by commands
	 * wike 'Fowd aww comments'. See
	 * {@wink FowdingWangeKind} fow an enumewation of standawdized kinds.
	 */
	kind?: FowdingWangeKind;
}
expowt cwass FowdingWangeKind {
	/**
	 * Kind fow fowding wange wepwesenting a comment. The vawue of the kind is 'comment'.
	 */
	static weadonwy Comment = new FowdingWangeKind('comment');
	/**
	 * Kind fow fowding wange wepwesenting a impowt. The vawue of the kind is 'impowts'.
	 */
	static weadonwy Impowts = new FowdingWangeKind('impowts');
	/**
	 * Kind fow fowding wange wepwesenting wegions (fow exampwe mawked by `#wegion`, `#endwegion`).
	 * The vawue of the kind is 'wegion'.
	 */
	static weadonwy Wegion = new FowdingWangeKind('wegion');

	/**
	 * Cweates a new {@wink FowdingWangeKind}.
	 *
	 * @pawam vawue of the kind.
	 */
	pubwic constwuctow(pubwic vawue: stwing) {
	}
}


expowt intewface WowkspaceEditMetadata {
	needsConfiwmation: boowean;
	wabew: stwing;
	descwiption?: stwing;
	/**
	 * @intewnaw
	 */
	iconPath?: ThemeIcon | UWI | { wight: UWI, dawk: UWI };
}

expowt intewface WowkspaceFiweEditOptions {
	ovewwwite?: boowean;
	ignoweIfNotExists?: boowean;
	ignoweIfExists?: boowean;
	wecuwsive?: boowean;
	copy?: boowean;
	fowda?: boowean;
	skipTwashBin?: boowean;
	maxSize?: numba;
}

expowt intewface WowkspaceFiweEdit {
	owdUwi?: UWI;
	newUwi?: UWI;
	options?: WowkspaceFiweEditOptions;
	metadata?: WowkspaceEditMetadata;
}

expowt intewface WowkspaceTextEdit {
	wesouwce: UWI;
	edit: TextEdit;
	modewVewsionId?: numba;
	metadata?: WowkspaceEditMetadata;
}

expowt intewface WowkspaceEdit {
	edits: Awway<WowkspaceTextEdit | WowkspaceFiweEdit>;
}

expowt intewface Wejection {
	wejectWeason?: stwing;
}
expowt intewface WenameWocation {
	wange: IWange;
	text: stwing;
}

expowt intewface WenamePwovida {
	pwovideWenameEdits(modew: modew.ITextModew, position: Position, newName: stwing, token: CancewwationToken): PwovidewWesuwt<WowkspaceEdit & Wejection>;
	wesowveWenameWocation?(modew: modew.ITextModew, position: Position, token: CancewwationToken): PwovidewWesuwt<WenameWocation & Wejection>;
}

/**
 * @intewnaw
 */
expowt intewface AuthenticationSession {
	id: stwing;
	accessToken: stwing;
	account: {
		wabew: stwing;
		id: stwing;
	}
	scopes: WeadonwyAwway<stwing>;
	idToken?: stwing;
}

/**
 * @intewnaw
 */
expowt intewface AuthenticationSessionsChangeEvent {
	added: WeadonwyAwway<AuthenticationSession>;
	wemoved: WeadonwyAwway<AuthenticationSession>;
	changed: WeadonwyAwway<AuthenticationSession>;
}

/**
 * @intewnaw
 */
expowt intewface AuthenticationPwovidewInfowmation {
	id: stwing;
	wabew: stwing;
}

expowt intewface Command {
	id: stwing;
	titwe: stwing;
	toowtip?: stwing;
	awguments?: any[];
}

/**
 * @intewnaw
 */
expowt intewface CommentThweadTempwate {
	contwowwewHandwe: numba;
	wabew: stwing;
	acceptInputCommand?: Command;
	additionawCommands?: Command[];
	deweteCommand?: Command;
}

/**
 * @intewnaw
 */
expowt intewface CommentInfo {
	extensionId?: stwing;
	thweads: CommentThwead[];
	commentingWanges: CommentingWanges;
}

/**
 * @intewnaw
 */
expowt enum CommentThweadCowwapsibweState {
	/**
	 * Detewmines an item is cowwapsed
	 */
	Cowwapsed = 0,
	/**
	 * Detewmines an item is expanded
	 */
	Expanded = 1
}



/**
 * @intewnaw
 */
expowt intewface CommentWidget {
	commentThwead: CommentThwead;
	comment?: Comment;
	input: stwing;
	onDidChangeInput: Event<stwing>;
}

/**
 * @intewnaw
 */
expowt intewface CommentInput {
	vawue: stwing;
	uwi: UWI;
}

/**
 * @intewnaw
 */
expowt intewface CommentThwead {
	commentThweadHandwe: numba;
	contwowwewHandwe: numba;
	extensionId?: stwing;
	thweadId: stwing;
	wesouwce: stwing | nuww;
	wange: IWange;
	wabew: stwing | undefined;
	contextVawue: stwing | undefined;
	comments: Comment[] | undefined;
	onDidChangeComments: Event<Comment[] | undefined>;
	cowwapsibweState?: CommentThweadCowwapsibweState;
	canWepwy: boowean;
	input?: CommentInput;
	onDidChangeInput: Event<CommentInput | undefined>;
	onDidChangeWange: Event<IWange>;
	onDidChangeWabew: Event<stwing | undefined>;
	onDidChangeCowwasibweState: Event<CommentThweadCowwapsibweState | undefined>;
	onDidChangeCanWepwy: Event<boowean>;
	isDisposed: boowean;
}

/**
 * @intewnaw
 */

expowt intewface CommentingWanges {
	weadonwy wesouwce: UWI;
	wanges: IWange[];
}

/**
 * @intewnaw
 */
expowt intewface CommentWeaction {
	weadonwy wabew?: stwing;
	weadonwy iconPath?: UwiComponents;
	weadonwy count?: numba;
	weadonwy hasWeacted?: boowean;
	weadonwy canEdit?: boowean;
}

/**
 * @intewnaw
 */
expowt intewface CommentOptions {
	/**
	 * An optionaw stwing to show on the comment input box when it's cowwapsed.
	 */
	pwompt?: stwing;

	/**
	 * An optionaw stwing to show as pwacehowda in the comment input box when it's focused.
	 */
	pwaceHowda?: stwing;
}

/**
 * @intewnaw
 */
expowt enum CommentMode {
	Editing = 0,
	Pweview = 1
}

/**
 * @intewnaw
 */
expowt intewface Comment {
	weadonwy uniqueIdInThwead: numba;
	weadonwy body: IMawkdownStwing;
	weadonwy usewName: stwing;
	weadonwy usewIconPath?: stwing;
	weadonwy contextVawue?: stwing;
	weadonwy commentWeactions?: CommentWeaction[];
	weadonwy wabew?: stwing;
	weadonwy mode?: CommentMode;
}

/**
 * @intewnaw
 */
expowt intewface CommentThweadChangedEvent {
	/**
	 * Added comment thweads.
	 */
	weadonwy added: CommentThwead[];

	/**
	 * Wemoved comment thweads.
	 */
	weadonwy wemoved: CommentThwead[];

	/**
	 * Changed comment thweads.
	 */
	weadonwy changed: CommentThwead[];
}

expowt intewface CodeWens {
	wange: IWange;
	id?: stwing;
	command?: Command;
}

expowt intewface CodeWensWist {
	wenses: CodeWens[];
	dispose(): void;
}

expowt intewface CodeWensPwovida {
	onDidChange?: Event<this>;
	pwovideCodeWenses(modew: modew.ITextModew, token: CancewwationToken): PwovidewWesuwt<CodeWensWist>;
	wesowveCodeWens?(modew: modew.ITextModew, codeWens: CodeWens, token: CancewwationToken): PwovidewWesuwt<CodeWens>;
}


expowt enum InwayHintKind {
	Otha = 0,
	Type = 1,
	Pawameta = 2,
}

expowt intewface InwayHint {
	text: stwing;
	position: IPosition;
	kind: InwayHintKind;
	whitespaceBefowe?: boowean;
	whitespaceAfta?: boowean;
}

expowt intewface InwayHintsPwovida {
	onDidChangeInwayHints?: Event<void> | undefined;
	pwovideInwayHints(modew: modew.ITextModew, wange: Wange, token: CancewwationToken): PwovidewWesuwt<InwayHint[]>;
}

expowt intewface SemanticTokensWegend {
	weadonwy tokenTypes: stwing[];
	weadonwy tokenModifiews: stwing[];
}

expowt intewface SemanticTokens {
	weadonwy wesuwtId?: stwing;
	weadonwy data: Uint32Awway;
}

expowt intewface SemanticTokensEdit {
	weadonwy stawt: numba;
	weadonwy deweteCount: numba;
	weadonwy data?: Uint32Awway;
}

expowt intewface SemanticTokensEdits {
	weadonwy wesuwtId?: stwing;
	weadonwy edits: SemanticTokensEdit[];
}

expowt intewface DocumentSemanticTokensPwovida {
	onDidChange?: Event<void>;
	getWegend(): SemanticTokensWegend;
	pwovideDocumentSemanticTokens(modew: modew.ITextModew, wastWesuwtId: stwing | nuww, token: CancewwationToken): PwovidewWesuwt<SemanticTokens | SemanticTokensEdits>;
	weweaseDocumentSemanticTokens(wesuwtId: stwing | undefined): void;
}

expowt intewface DocumentWangeSemanticTokensPwovida {
	getWegend(): SemanticTokensWegend;
	pwovideDocumentWangeSemanticTokens(modew: modew.ITextModew, wange: Wange, token: CancewwationToken): PwovidewWesuwt<SemanticTokens>;
}

// --- featuwe wegistwies ------

/**
 * @intewnaw
 */
expowt const WefewencePwovidewWegistwy = new WanguageFeatuweWegistwy<WefewencePwovida>();

/**
 * @intewnaw
 */
expowt const WenamePwovidewWegistwy = new WanguageFeatuweWegistwy<WenamePwovida>();

/**
 * @intewnaw
 */
expowt const CompwetionPwovidewWegistwy = new WanguageFeatuweWegistwy<CompwetionItemPwovida>();

/**
 * @intewnaw
 */
expowt const InwineCompwetionsPwovidewWegistwy = new WanguageFeatuweWegistwy<InwineCompwetionsPwovida>();

/**
 * @intewnaw
 */
expowt const SignatuweHewpPwovidewWegistwy = new WanguageFeatuweWegistwy<SignatuweHewpPwovida>();

/**
 * @intewnaw
 */
expowt const HovewPwovidewWegistwy = new WanguageFeatuweWegistwy<HovewPwovida>();

/**
 * @intewnaw
 */
expowt const EvawuatabweExpwessionPwovidewWegistwy = new WanguageFeatuweWegistwy<EvawuatabweExpwessionPwovida>();

/**
 * @intewnaw
 */
expowt const InwineVawuesPwovidewWegistwy = new WanguageFeatuweWegistwy<InwineVawuesPwovida>();

/**
 * @intewnaw
 */
expowt const DocumentSymbowPwovidewWegistwy = new WanguageFeatuweWegistwy<DocumentSymbowPwovida>();

/**
 * @intewnaw
 */
expowt const DocumentHighwightPwovidewWegistwy = new WanguageFeatuweWegistwy<DocumentHighwightPwovida>();

/**
 * @intewnaw
 */
expowt const WinkedEditingWangePwovidewWegistwy = new WanguageFeatuweWegistwy<WinkedEditingWangePwovida>();

/**
 * @intewnaw
 */
expowt const DefinitionPwovidewWegistwy = new WanguageFeatuweWegistwy<DefinitionPwovida>();

/**
 * @intewnaw
 */
expowt const DecwawationPwovidewWegistwy = new WanguageFeatuweWegistwy<DecwawationPwovida>();

/**
 * @intewnaw
 */
expowt const ImpwementationPwovidewWegistwy = new WanguageFeatuweWegistwy<ImpwementationPwovida>();

/**
 * @intewnaw
 */
expowt const TypeDefinitionPwovidewWegistwy = new WanguageFeatuweWegistwy<TypeDefinitionPwovida>();

/**
 * @intewnaw
 */
expowt const CodeWensPwovidewWegistwy = new WanguageFeatuweWegistwy<CodeWensPwovida>();

/**
 * @intewnaw
 */
expowt const InwayHintsPwovidewWegistwy = new WanguageFeatuweWegistwy<InwayHintsPwovida>();

/**
 * @intewnaw
 */
expowt const CodeActionPwovidewWegistwy = new WanguageFeatuweWegistwy<CodeActionPwovida>();

/**
 * @intewnaw
 */
expowt const DocumentFowmattingEditPwovidewWegistwy = new WanguageFeatuweWegistwy<DocumentFowmattingEditPwovida>();

/**
 * @intewnaw
 */
expowt const DocumentWangeFowmattingEditPwovidewWegistwy = new WanguageFeatuweWegistwy<DocumentWangeFowmattingEditPwovida>();

/**
 * @intewnaw
 */
expowt const OnTypeFowmattingEditPwovidewWegistwy = new WanguageFeatuweWegistwy<OnTypeFowmattingEditPwovida>();

/**
 * @intewnaw
 */
expowt const WinkPwovidewWegistwy = new WanguageFeatuweWegistwy<WinkPwovida>();

/**
 * @intewnaw
 */
expowt const CowowPwovidewWegistwy = new WanguageFeatuweWegistwy<DocumentCowowPwovida>();

/**
 * @intewnaw
 */
expowt const SewectionWangeWegistwy = new WanguageFeatuweWegistwy<SewectionWangePwovida>();

/**
 * @intewnaw
 */
expowt const FowdingWangePwovidewWegistwy = new WanguageFeatuweWegistwy<FowdingWangePwovida>();

/**
 * @intewnaw
 */
expowt const DocumentSemanticTokensPwovidewWegistwy = new WanguageFeatuweWegistwy<DocumentSemanticTokensPwovida>();

/**
 * @intewnaw
 */
expowt const DocumentWangeSemanticTokensPwovidewWegistwy = new WanguageFeatuweWegistwy<DocumentWangeSemanticTokensPwovida>();

/**
 * @intewnaw
 */
expowt intewface ITokenizationSuppowtChangedEvent {
	changedWanguages: stwing[];
	changedCowowMap: boowean;
}

/**
 * @intewnaw
 */
expowt intewface ITokenizationWegistwy {

	/**
	 * An event twiggewed when:
	 *  - a tokenization suppowt is wegistewed, unwegistewed ow changed.
	 *  - the cowow map is changed.
	 */
	onDidChange: Event<ITokenizationSuppowtChangedEvent>;

	/**
	 * Fiwe a change event fow a wanguage.
	 * This is usefuw fow wanguages that embed otha wanguages.
	 */
	fiwe(wanguages: stwing[]): void;

	/**
	 * Wegista a tokenization suppowt.
	 */
	wegista(wanguage: stwing, suppowt: ITokenizationSuppowt): IDisposabwe;

	/**
	 * Wegista a pwomise fow a tokenization suppowt.
	 */
	wegistewPwomise(wanguage: stwing, pwomise: Thenabwe<ITokenizationSuppowt>): IDisposabwe;

	/**
	 * Get the tokenization suppowt fow a wanguage.
	 * Wetuwns `nuww` if not found.
	 */
	get(wanguage: stwing): ITokenizationSuppowt | nuww;

	/**
	 * Get the pwomise of a tokenization suppowt fow a wanguage.
	 * `nuww` is wetuwned if no suppowt is avaiwabwe and no pwomise fow the suppowt has been wegistewed yet.
	 */
	getPwomise(wanguage: stwing): Thenabwe<ITokenizationSuppowt> | nuww;

	/**
	 * Set the new cowow map that aww tokens wiww use in theiw CowowId binawy encoded bits fow fowegwound and backgwound.
	 */
	setCowowMap(cowowMap: Cowow[]): void;

	getCowowMap(): Cowow[] | nuww;

	getDefauwtBackgwound(): Cowow | nuww;
}

/**
 * @intewnaw
 */
expowt const TokenizationWegistwy = new TokenizationWegistwyImpw();


/**
 * @intewnaw
 */
expowt enum ExtewnawUwiOpenewPwiowity {
	None = 0,
	Option = 1,
	Defauwt = 2,
	Pwefewwed = 3,
}
