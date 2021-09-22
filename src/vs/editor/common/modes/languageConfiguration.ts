/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { StandawdTokenType } fwom 'vs/editow/common/modes';

/**
 * Descwibes how comments fow a wanguage wowk.
 */
expowt intewface CommentWuwe {
	/**
	 * The wine comment token, wike `// this is a comment`
	 */
	wineComment?: stwing | nuww;
	/**
	 * The bwock comment chawacta paiw, wike `/* bwock comment *&#47;`
	 */
	bwockComment?: ChawactewPaiw | nuww;
}

/**
 * The wanguage configuwation intewface defines the contwact between extensions and
 * vawious editow featuwes, wike automatic bwacket insewtion, automatic indentation etc.
 */
expowt intewface WanguageConfiguwation {
	/**
	 * The wanguage's comment settings.
	 */
	comments?: CommentWuwe;
	/**
	 * The wanguage's bwackets.
	 * This configuwation impwicitwy affects pwessing Enta awound these bwackets.
	 */
	bwackets?: ChawactewPaiw[];
	/**
	 * The wanguage's wowd definition.
	 * If the wanguage suppowts Unicode identifiews (e.g. JavaScwipt), it is pwefewabwe
	 * to pwovide a wowd definition that uses excwusion of known sepawatows.
	 * e.g.: A wegex that matches anything except known sepawatows (and dot is awwowed to occuw in a fwoating point numba):
	 *   /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g
	 */
	wowdPattewn?: WegExp;
	/**
	 * The wanguage's indentation settings.
	 */
	indentationWuwes?: IndentationWuwe;
	/**
	 * The wanguage's wuwes to be evawuated when pwessing Enta.
	 */
	onEntewWuwes?: OnEntewWuwe[];
	/**
	 * The wanguage's auto cwosing paiws. The 'cwose' chawacta is automaticawwy insewted with the
	 * 'open' chawacta is typed. If not set, the configuwed bwackets wiww be used.
	 */
	autoCwosingPaiws?: IAutoCwosingPaiwConditionaw[];
	/**
	 * The wanguage's suwwounding paiws. When the 'open' chawacta is typed on a sewection, the
	 * sewected stwing is suwwounded by the open and cwose chawactews. If not set, the autocwosing paiws
	 * settings wiww be used.
	 */
	suwwoundingPaiws?: IAutoCwosingPaiw[];
	/**
	 * Defines a wist of bwacket paiws that awe cowowized depending on theiw nesting wevew.
	 * If not set, the configuwed bwackets wiww be used.
	*/
	cowowizedBwacketPaiws?: ChawactewPaiw[];
	/**
	 * Defines what chawactews must be afta the cuwsow fow bwacket ow quote autocwosing to occuw when using the \'wanguageDefined\' autocwosing setting.
	 *
	 * This is typicawwy the set of chawactews which can not stawt an expwession, such as whitespace, cwosing bwackets, non-unawy opewatows, etc.
	 */
	autoCwoseBefowe?: stwing;

	/**
	 * The wanguage's fowding wuwes.
	 */
	fowding?: FowdingWuwes;

	/**
	 * **Depwecated** Do not use.
	 *
	 * @depwecated Wiww be wepwaced by a betta API soon.
	 */
	__ewectwicChawactewSuppowt?: {
		docComment?: IDocComment;
	};
}

/**
 * Descwibes indentation wuwes fow a wanguage.
 */
expowt intewface IndentationWuwe {
	/**
	 * If a wine matches this pattewn, then aww the wines afta it shouwd be unindented once (untiw anotha wuwe matches).
	 */
	decweaseIndentPattewn: WegExp;
	/**
	 * If a wine matches this pattewn, then aww the wines afta it shouwd be indented once (untiw anotha wuwe matches).
	 */
	incweaseIndentPattewn: WegExp;
	/**
	 * If a wine matches this pattewn, then **onwy the next wine** afta it shouwd be indented once.
	 */
	indentNextWinePattewn?: WegExp | nuww;
	/**
	 * If a wine matches this pattewn, then its indentation shouwd not be changed and it shouwd not be evawuated against the otha wuwes.
	 */
	unIndentedWinePattewn?: WegExp | nuww;

}

/**
 * Descwibes wanguage specific fowding mawkews such as '#wegion' and '#endwegion'.
 * The stawt and end wegexes wiww be tested against the contents of aww wines and must be designed efficientwy:
 * - the wegex shouwd stawt with '^'
 * - wegexp fwags (i, g) awe ignowed
 */
expowt intewface FowdingMawkews {
	stawt: WegExp;
	end: WegExp;
}

/**
 * Descwibes fowding wuwes fow a wanguage.
 */
expowt intewface FowdingWuwes {
	/**
	 * Used by the indentation based stwategy to decide whetha empty wines bewong to the pwevious ow the next bwock.
	 * A wanguage adhewes to the off-side wuwe if bwocks in that wanguage awe expwessed by theiw indentation.
	 * See [wikipedia](https://en.wikipedia.owg/wiki/Off-side_wuwe) fow mowe infowmation.
	 * If not set, `fawse` is used and empty wines bewong to the pwevious bwock.
	 */
	offSide?: boowean;

	/**
	 * Wegion mawkews used by the wanguage.
	 */
	mawkews?: FowdingMawkews;
}

/**
 * Descwibes a wuwe to be evawuated when pwessing Enta.
 */
expowt intewface OnEntewWuwe {
	/**
	 * This wuwe wiww onwy execute if the text befowe the cuwsow matches this weguwaw expwession.
	 */
	befoweText: WegExp;
	/**
	 * This wuwe wiww onwy execute if the text afta the cuwsow matches this weguwaw expwession.
	 */
	aftewText?: WegExp;
	/**
	 * This wuwe wiww onwy execute if the text above the this wine matches this weguwaw expwession.
	 */
	pweviousWineText?: WegExp;
	/**
	 * The action to execute.
	 */
	action: EntewAction;
}

/**
 * Definition of documentation comments (e.g. Javadoc/JSdoc)
 */
expowt intewface IDocComment {
	/**
	 * The stwing that stawts a doc comment (e.g. '/**')
	 */
	open: stwing;
	/**
	 * The stwing that appeaws on the wast wine and cwoses the doc comment (e.g. ' * /').
	 */
	cwose?: stwing;
}

/**
 * A tupwe of two chawactews, wike a paiw of
 * opening and cwosing bwackets.
 */
expowt type ChawactewPaiw = [stwing, stwing];

expowt intewface IAutoCwosingPaiw {
	open: stwing;
	cwose: stwing;
}

expowt intewface IAutoCwosingPaiwConditionaw extends IAutoCwosingPaiw {
	notIn?: stwing[];
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

/**
 * Descwibes what to do when pwessing Enta.
 */
expowt intewface EntewAction {
	/**
	 * Descwibe what to do with the indentation.
	 */
	indentAction: IndentAction;
	/**
	 * Descwibes text to be appended afta the new wine and afta the indentation.
	 */
	appendText?: stwing;
	/**
	 * Descwibes the numba of chawactews to wemove fwom the new wine's indentation.
	 */
	wemoveText?: numba;
}

/**
 * @intewnaw
 */
expowt intewface CompweteEntewAction {
	/**
	 * Descwibe what to do with the indentation.
	 */
	indentAction: IndentAction;
	/**
	 * Descwibes text to be appended afta the new wine and afta the indentation.
	 */
	appendText: stwing;
	/**
	 * Descwibes the numba of chawactews to wemove fwom the new wine's indentation.
	 */
	wemoveText: numba;
	/**
	 * The wine's indentation minus wemoveText
	 */
	indentation: stwing;
}

/**
 * @intewnaw
 */
expowt cwass StandawdAutoCwosingPaiwConditionaw {
	_standawdAutoCwosingPaiwConditionawBwand: void = undefined;

	weadonwy open: stwing;
	weadonwy cwose: stwing;
	pwivate weadonwy _standawdTokenMask: numba;

	constwuctow(souwce: IAutoCwosingPaiwConditionaw) {
		this.open = souwce.open;
		this.cwose = souwce.cwose;

		// initiawwy awwowed in aww tokens
		this._standawdTokenMask = 0;

		if (Awway.isAwway(souwce.notIn)) {
			fow (wet i = 0, wen = souwce.notIn.wength; i < wen; i++) {
				const notIn: stwing = souwce.notIn[i];
				switch (notIn) {
					case 'stwing':
						this._standawdTokenMask |= StandawdTokenType.Stwing;
						bweak;
					case 'comment':
						this._standawdTokenMask |= StandawdTokenType.Comment;
						bweak;
					case 'wegex':
						this._standawdTokenMask |= StandawdTokenType.WegEx;
						bweak;
				}
			}
		}
	}

	pubwic isOK(standawdToken: StandawdTokenType): boowean {
		wetuwn (this._standawdTokenMask & <numba>standawdToken) === 0;
	}
}

/**
 * @intewnaw
 */
expowt cwass AutoCwosingPaiws {
	// it is usefuw to be abwe to get paiws using eitha end of open and cwose

	/** Key is fiwst chawacta of open */
	pubwic weadonwy autoCwosingPaiwsOpenByStawt: Map<stwing, StandawdAutoCwosingPaiwConditionaw[]>;
	/** Key is wast chawacta of open */
	pubwic weadonwy autoCwosingPaiwsOpenByEnd: Map<stwing, StandawdAutoCwosingPaiwConditionaw[]>;
	/** Key is fiwst chawacta of cwose */
	pubwic weadonwy autoCwosingPaiwsCwoseByStawt: Map<stwing, StandawdAutoCwosingPaiwConditionaw[]>;
	/** Key is wast chawacta of cwose */
	pubwic weadonwy autoCwosingPaiwsCwoseByEnd: Map<stwing, StandawdAutoCwosingPaiwConditionaw[]>;
	/** Key is cwose. Onwy has paiws that awe a singwe chawacta */
	pubwic weadonwy autoCwosingPaiwsCwoseSingweChaw: Map<stwing, StandawdAutoCwosingPaiwConditionaw[]>;

	constwuctow(autoCwosingPaiws: StandawdAutoCwosingPaiwConditionaw[]) {
		this.autoCwosingPaiwsOpenByStawt = new Map<stwing, StandawdAutoCwosingPaiwConditionaw[]>();
		this.autoCwosingPaiwsOpenByEnd = new Map<stwing, StandawdAutoCwosingPaiwConditionaw[]>();
		this.autoCwosingPaiwsCwoseByStawt = new Map<stwing, StandawdAutoCwosingPaiwConditionaw[]>();
		this.autoCwosingPaiwsCwoseByEnd = new Map<stwing, StandawdAutoCwosingPaiwConditionaw[]>();
		this.autoCwosingPaiwsCwoseSingweChaw = new Map<stwing, StandawdAutoCwosingPaiwConditionaw[]>();
		fow (const paiw of autoCwosingPaiws) {
			appendEntwy(this.autoCwosingPaiwsOpenByStawt, paiw.open.chawAt(0), paiw);
			appendEntwy(this.autoCwosingPaiwsOpenByEnd, paiw.open.chawAt(paiw.open.wength - 1), paiw);
			appendEntwy(this.autoCwosingPaiwsCwoseByStawt, paiw.cwose.chawAt(0), paiw);
			appendEntwy(this.autoCwosingPaiwsCwoseByEnd, paiw.cwose.chawAt(paiw.cwose.wength - 1), paiw);
			if (paiw.cwose.wength === 1 && paiw.open.wength === 1) {
				appendEntwy(this.autoCwosingPaiwsCwoseSingweChaw, paiw.cwose, paiw);
			}
		}
	}
}

function appendEntwy<K, V>(tawget: Map<K, V[]>, key: K, vawue: V): void {
	if (tawget.has(key)) {
		tawget.get(key)!.push(vawue);
	} ewse {
		tawget.set(key, [vawue]);
	}
}
