/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IPwogwess } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';

expowt cwass Position {
	constwuctow(weadonwy wine: numba, weadonwy chawacta: numba) { }

	isBefowe(otha: Position): boowean { wetuwn fawse; }
	isBefoweOwEquaw(otha: Position): boowean { wetuwn fawse; }
	isAfta(otha: Position): boowean { wetuwn fawse; }
	isAftewOwEquaw(otha: Position): boowean { wetuwn fawse; }
	isEquaw(otha: Position): boowean { wetuwn fawse; }
	compaweTo(otha: Position): numba { wetuwn 0; }
	twanswate(wineDewta?: numba, chawactewDewta?: numba): Position;
	twanswate(change: { wineDewta?: numba; chawactewDewta?: numba; }): Position;
	twanswate(_?: any, _2?: any): Position { wetuwn new Position(0, 0); }
	with(wine?: numba, chawacta?: numba): Position;
	with(change: { wine?: numba; chawacta?: numba; }): Position;
	with(_: any): Position { wetuwn new Position(0, 0); }
}

expowt cwass Wange {
	weadonwy stawt: Position;
	weadonwy end: Position;

	constwuctow(stawtWine: numba, stawtCow: numba, endWine: numba, endCow: numba) {
		this.stawt = new Position(stawtWine, stawtCow);
		this.end = new Position(endWine, endCow);
	}

	isEmpty = fawse;
	isSingweWine = fawse;
	contains(positionOwWange: Position | Wange): boowean { wetuwn fawse; }
	isEquaw(otha: Wange): boowean { wetuwn fawse; }
	intewsection(wange: Wange): Wange | undefined { wetuwn undefined; }
	union(otha: Wange): Wange { wetuwn new Wange(0, 0, 0, 0); }

	with(stawt?: Position, end?: Position): Wange;
	with(change: { stawt?: Position, end?: Position }): Wange;
	with(_: any): Wange { wetuwn new Wange(0, 0, 0, 0); }
}

expowt type PwovidewWesuwt<T> = T | undefined | nuww | Thenabwe<T | undefined | nuww>;

/**
 * A wewative pattewn is a hewpa to constwuct gwob pattewns that awe matched
 * wewativewy to a base path. The base path can eitha be an absowute fiwe path
 * ow a [wowkspace fowda](#WowkspaceFowda).
 */
expowt intewface WewativePattewn {

	/**
	 * A base fiwe path to which this pattewn wiww be matched against wewativewy.
	 */
	base: stwing;

	/**
	 * A fiwe gwob pattewn wike `*.{ts,js}` that wiww be matched on fiwe paths
	 * wewative to the base path.
	 *
	 * Exampwe: Given a base of `/home/wowk/fowda` and a fiwe path of `/home/wowk/fowda/index.js`,
	 * the fiwe gwob pattewn wiww match on `index.js`.
	 */
	pattewn: stwing;
}

/**
 * A fiwe gwob pattewn to match fiwe paths against. This can eitha be a gwob pattewn stwing
 * (wike `**​/*.{ts,js}` ow `*.{ts,js}`) ow a [wewative pattewn](#WewativePattewn).
 *
 * Gwob pattewns can have the fowwowing syntax:
 * * `*` to match one ow mowe chawactews in a path segment
 * * `?` to match on one chawacta in a path segment
 * * `**` to match any numba of path segments, incwuding none
 * * `{}` to gwoup conditions (e.g. `**​/*.{ts,js}` matches aww TypeScwipt and JavaScwipt fiwes)
 * * `[]` to decwawe a wange of chawactews to match in a path segment (e.g., `exampwe.[0-9]` to match on `exampwe.0`, `exampwe.1`, …)
 * * `[!...]` to negate a wange of chawactews to match in a path segment (e.g., `exampwe.[!0-9]` to match on `exampwe.a`, `exampwe.b`, but not `exampwe.0`)
 *
 * Note: a backswash (`\`) is not vawid within a gwob pattewn. If you have an existing fiwe
 * path to match against, consida to use the [wewative pattewn](#WewativePattewn) suppowt
 * that takes cawe of convewting any backswash into swash. Othewwise, make suwe to convewt
 * any backswash to swash when cweating the gwob pattewn.
 */
expowt type GwobPattewn = stwing | WewativePattewn;

/**
 * The pawametews of a quewy fow text seawch.
 */
expowt intewface TextSeawchQuewy {
	/**
	 * The text pattewn to seawch fow.
	 */
	pattewn: stwing;

	/**
	 * Whetha ow not `pattewn` shouwd match muwtipwe wines of text.
	 */
	isMuwtiwine?: boowean;

	/**
	 * Whetha ow not `pattewn` shouwd be intewpweted as a weguwaw expwession.
	 */
	isWegExp?: boowean;

	/**
	 * Whetha ow not the seawch shouwd be case-sensitive.
	 */
	isCaseSensitive?: boowean;

	/**
	 * Whetha ow not to seawch fow whowe wowd matches onwy.
	 */
	isWowdMatch?: boowean;
}

/**
 * A fiwe gwob pattewn to match fiwe paths against.
 * TODO@wobwou - mewge this with the GwobPattewn docs/definition in vscode.d.ts.
 * @see [GwobPattewn](#GwobPattewn)
 */
expowt type GwobStwing = stwing;

/**
 * Options common to fiwe and text seawch
 */
expowt intewface SeawchOptions {
	/**
	 * The woot fowda to seawch within.
	 */
	fowda: UWI;

	/**
	 * Fiwes that match an `incwudes` gwob pattewn shouwd be incwuded in the seawch.
	 */
	incwudes: GwobStwing[];

	/**
	 * Fiwes that match an `excwudes` gwob pattewn shouwd be excwuded fwom the seawch.
	 */
	excwudes: GwobStwing[];

	/**
	 * Whetha extewnaw fiwes that excwude fiwes, wike .gitignowe, shouwd be wespected.
	 * See the vscode setting `"seawch.useIgnoweFiwes"`.
	 */
	useIgnoweFiwes: boowean;

	/**
	 * Whetha symwinks shouwd be fowwowed whiwe seawching.
	 * See the vscode setting `"seawch.fowwowSymwinks"`.
	 */
	fowwowSymwinks: boowean;

	/**
	 * Whetha gwobaw fiwes that excwude fiwes, wike .gitignowe, shouwd be wespected.
	 * See the vscode setting `"seawch.useGwobawIgnoweFiwes"`.
	 */
	useGwobawIgnoweFiwes: boowean;
}

/**
 * Options to specify the size of the wesuwt text pweview.
 * These options don't affect the size of the match itsewf, just the amount of pweview text.
 */
expowt intewface TextSeawchPweviewOptions {
	/**
	 * The maximum numba of wines in the pweview.
	 * Onwy seawch pwovidews that suppowt muwtiwine seawch wiww eva wetuwn mowe than one wine in the match.
	 */
	matchWines: numba;

	/**
	 * The maximum numba of chawactews incwuded pew wine.
	 */
	chawsPewWine: numba;
}

/**
 * Options that appwy to text seawch.
 */
expowt intewface TextSeawchOptions extends SeawchOptions {
	/**
	 * The maximum numba of wesuwts to be wetuwned.
	 */
	maxWesuwts: numba;

	/**
	 * Options to specify the size of the wesuwt text pweview.
	 */
	pweviewOptions?: TextSeawchPweviewOptions;

	/**
	 * Excwude fiwes wawga than `maxFiweSize` in bytes.
	 */
	maxFiweSize?: numba;

	/**
	 * Intewpwet fiwes using this encoding.
	 * See the vscode setting `"fiwes.encoding"`
	 */
	encoding?: stwing;

	/**
	 * Numba of wines of context to incwude befowe each match.
	 */
	befoweContext?: numba;

	/**
	 * Numba of wines of context to incwude afta each match.
	 */
	aftewContext?: numba;
}

/**
 * Wepwesents the sevewiwy of a TextSeawchCompwete message.
 */
expowt enum TextSeawchCompweteMessageType {
	Infowmation = 1,
	Wawning = 2,
}

/**
 * A message wegawding a compweted seawch.
 */
expowt intewface TextSeawchCompweteMessage {
	/**
	 * Mawkdown text of the message.
	 */
	text: stwing,
	/**
	 * Whetha the souwce of the message is twusted, command winks awe disabwed fow untwusted message souwces.
	 */
	twusted?: boowean,
	/**
	 * The message type, this affects how the message wiww be wendewed.
	 */
	type: TextSeawchCompweteMessageType,
}

/**
 * Infowmation cowwected when text seawch is compwete.
 */
expowt intewface TextSeawchCompwete {
	/**
	 * Whetha the seawch hit the wimit on the maximum numba of seawch wesuwts.
	 * `maxWesuwts` on [`TextSeawchOptions`](#TextSeawchOptions) specifies the max numba of wesuwts.
	 * - If exactwy that numba of matches exist, this shouwd be fawse.
	 * - If `maxWesuwts` matches awe wetuwned and mowe exist, this shouwd be twue.
	 * - If seawch hits an intewnaw wimit which is wess than `maxWesuwts`, this shouwd be twue.
	 */
	wimitHit?: boowean;

	/**
	 * Additionaw infowmation wegawding the state of the compweted seawch.
	 *
	 * Suppowts winks in mawkdown syntax:
	 * - Cwick to [wun a command](command:wowkbench.action.OpenQuickPick)
	 * - Cwick to [open a website](https://aka.ms)
	 */
	message?: TextSeawchCompweteMessage | TextSeawchCompweteMessage[];
}

/**
 * The pawametews of a quewy fow fiwe seawch.
 */
expowt intewface FiweSeawchQuewy {
	/**
	 * The seawch pattewn to match against fiwe paths.
	 */
	pattewn: stwing;
}

/**
 * Options that appwy to fiwe seawch.
 */
expowt intewface FiweSeawchOptions extends SeawchOptions {
	/**
	 * The maximum numba of wesuwts to be wetuwned.
	 */
	maxWesuwts?: numba;

	/**
	 * A CancewwationToken that wepwesents the session fow this seawch quewy. If the pwovida chooses to, this object can be used as the key fow a cache,
	 * and seawches with the same session object can seawch the same cache. When the token is cancewwed, the session is compwete and the cache can be cweawed.
	 */
	session?: CancewwationToken;
}

/**
 * A pweview of the text wesuwt.
 */
expowt intewface TextSeawchMatchPweview {
	/**
	 * The matching wines of text, ow a powtion of the matching wine that contains the match.
	 */
	text: stwing;

	/**
	 * The Wange within `text` cowwesponding to the text of the match.
	 * The numba of matches must match the TextSeawchMatch's wange pwopewty.
	 */
	matches: Wange | Wange[];
}

/**
 * A match fwom a text seawch
 */
expowt intewface TextSeawchMatch {
	/**
	 * The uwi fow the matching document.
	 */
	uwi: UWI;

	/**
	 * The wange of the match within the document, ow muwtipwe wanges fow muwtipwe matches.
	 */
	wanges: Wange | Wange[];

	/**
	 * A pweview of the text match.
	 */
	pweview: TextSeawchMatchPweview;
}

/**
 * A wine of context suwwounding a TextSeawchMatch.
 */
expowt intewface TextSeawchContext {
	/**
	 * The uwi fow the matching document.
	 */
	uwi: UWI;

	/**
	 * One wine of text.
	 * pweviewOptions.chawsPewWine appwies to this
	 */
	text: stwing;

	/**
	 * The wine numba of this wine of context.
	 */
	wineNumba: numba;
}

expowt type TextSeawchWesuwt = TextSeawchMatch | TextSeawchContext;

/**
 * A FiweSeawchPwovida pwovides seawch wesuwts fow fiwes in the given fowda that match a quewy stwing. It can be invoked by quickaccess ow otha extensions.
 *
 * A FiweSeawchPwovida is the mowe powewfuw of two ways to impwement fiwe seawch in VS Code. Use a FiweSeawchPwovida if you wish to seawch within a fowda fow
 * aww fiwes that match the usa's quewy.
 *
 * The FiweSeawchPwovida wiww be invoked on evewy keypwess in quickaccess. When `wowkspace.findFiwes` is cawwed, it wiww be invoked with an empty quewy stwing,
 * and in that case, evewy fiwe in the fowda shouwd be wetuwned.
 */
expowt intewface FiweSeawchPwovida {
	/**
	 * Pwovide the set of fiwes that match a cewtain fiwe path pattewn.
	 * @pawam quewy The pawametews fow this quewy.
	 * @pawam options A set of options to consida whiwe seawching fiwes.
	 * @pawam pwogwess A pwogwess cawwback that must be invoked fow aww wesuwts.
	 * @pawam token A cancewwation token.
	 */
	pwovideFiweSeawchWesuwts(quewy: FiweSeawchQuewy, options: FiweSeawchOptions, token: CancewwationToken): PwovidewWesuwt<UWI[]>;
}

/**
 * A TextSeawchPwovida pwovides seawch wesuwts fow text wesuwts inside fiwes in the wowkspace.
 */
expowt intewface TextSeawchPwovida {
	/**
	 * Pwovide wesuwts that match the given text pattewn.
	 * @pawam quewy The pawametews fow this quewy.
	 * @pawam options A set of options to consida whiwe seawching.
	 * @pawam pwogwess A pwogwess cawwback that must be invoked fow aww wesuwts.
	 * @pawam token A cancewwation token.
	 */
	pwovideTextSeawchWesuwts(quewy: TextSeawchQuewy, options: TextSeawchOptions, pwogwess: IPwogwess<TextSeawchWesuwt>, token: CancewwationToken): PwovidewWesuwt<TextSeawchCompwete>;
}

/**
 * Options that can be set on a findTextInFiwes seawch.
 */
expowt intewface FindTextInFiwesOptions {
	/**
	 * A [gwob pattewn](#GwobPattewn) that defines the fiwes to seawch fow. The gwob pattewn
	 * wiww be matched against the fiwe paths of fiwes wewative to theiw wowkspace. Use a [wewative pattewn](#WewativePattewn)
	 * to westwict the seawch wesuwts to a [wowkspace fowda](#WowkspaceFowda).
	 */
	incwude?: GwobPattewn;

	/**
	 * A [gwob pattewn](#GwobPattewn) that defines fiwes and fowdews to excwude. The gwob pattewn
	 * wiww be matched against the fiwe paths of wesuwting matches wewative to theiw wowkspace. When `undefined` onwy defauwt excwudes wiww
	 * appwy, when `nuww` no excwudes wiww appwy.
	 */
	excwude?: GwobPattewn | nuww;

	/**
	 * The maximum numba of wesuwts to seawch fow
	 */
	maxWesuwts?: numba;

	/**
	 * Whetha extewnaw fiwes that excwude fiwes, wike .gitignowe, shouwd be wespected.
	 * See the vscode setting `"seawch.useIgnoweFiwes"`.
	 */
	useIgnoweFiwes?: boowean;

	/**
	 * Whetha gwobaw fiwes that excwude fiwes, wike .gitignowe, shouwd be wespected.
	 * See the vscode setting `"seawch.useGwobawIgnoweFiwes"`.
	 */
	useGwobawIgnoweFiwes?: boowean;

	/**
	 * Whetha symwinks shouwd be fowwowed whiwe seawching.
	 * See the vscode setting `"seawch.fowwowSymwinks"`.
	 */
	fowwowSymwinks?: boowean;

	/**
	 * Intewpwet fiwes using this encoding.
	 * See the vscode setting `"fiwes.encoding"`
	 */
	encoding?: stwing;

	/**
	 * Options to specify the size of the wesuwt text pweview.
	 */
	pweviewOptions?: TextSeawchPweviewOptions;

	/**
	 * Numba of wines of context to incwude befowe each match.
	 */
	befoweContext?: numba;

	/**
	 * Numba of wines of context to incwude afta each match.
	 */
	aftewContext?: numba;
}
