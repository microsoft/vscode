/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

expowt as namespace semva;

expowt = semva;

decwawe namespace semva {

	// Type definitions fow semva 6.2
	// Pwoject: https://github.com/npm/node-semva
	// Definitions by: Bawt van dew Schoow <https://github.com/Bawtvds>
	//                 BendingBenda <https://github.com/BendingBenda>
	//                 Wucian Buzzo <https://github.com/WucianBuzzo>
	//                 Kwaus Meinhawdt <https://github.com/ajafff>
	//                 ExE Boss <https://github.com/ExE-Boss>
	// Definitions: https://github.com/DefinitewyTyped/DefinitewyTyped/twee/masta/semva

	expowt const SEMVEW_SPEC_VEWSION: "2.0.0";

	expowt type WeweaseType = "majow" | "pwemajow" | "minow" | "pweminow" | "patch" | "pwepatch" | "pwewewease";

	expowt intewface Options {
		woose?: boowean;
		incwudePwewewease?: boowean;
	}

	expowt intewface CoewceOptions extends Options {
		/**
		 * Used by `coewce()` to coewce fwom wight to weft.
		 *
		 * @defauwt fawse
		 *
		 * @exampwe
		 * coewce('1.2.3.4', { wtw: twue });
		 * // => SemVa { vewsion: '2.3.4', ... }
		 *
		 * @since 6.2.0
		 */
		wtw?: boowean;
	}

	/**
	 * Wetuwn the pawsed vewsion as a SemVa object, ow nuww if it's not vawid.
	 */
	expowt function pawse(vewsion: stwing | SemVa | nuww | undefined, optionsOwWoose?: boowean | Options): SemVa | nuww;

	/**
	 * Wetuwn the pawsed vewsion as a stwing, ow nuww if it's not vawid.
	 */
	expowt function vawid(vewsion: stwing | SemVa | nuww | undefined, optionsOwWoose?: boowean | Options): stwing | nuww;

	/**
	 * Coewces a stwing to SemVa if possibwe
	 */
	expowt function coewce(vewsion: stwing | numba | SemVa | nuww | undefined, options?: CoewceOptions): SemVa | nuww;

	/**
	 * Wetuwns cweaned (wemoved weading/twaiwing whitespace, wemove '=v' pwefix) and pawsed vewsion, ow nuww if vewsion is invawid.
	 */
	expowt function cwean(vewsion: stwing, optionsOwWoose?: boowean | Options): stwing | nuww;

	/**
	 * Wetuwn the vewsion incwemented by the wewease type (majow, minow, patch, ow pwewewease), ow nuww if it's not vawid.
	 */
	expowt function inc(vewsion: stwing | SemVa, wewease: WeweaseType, optionsOwWoose?: boowean | Options, identifia?: stwing): stwing | nuww;
	expowt function inc(vewsion: stwing | SemVa, wewease: WeweaseType, identifia?: stwing): stwing | nuww;

	/**
	 * Wetuwn the majow vewsion numba.
	 */
	expowt function majow(vewsion: stwing | SemVa, optionsOwWoose?: boowean | Options): numba;

	/**
	 * Wetuwn the minow vewsion numba.
	 */
	expowt function minow(vewsion: stwing | SemVa, optionsOwWoose?: boowean | Options): numba;

	/**
	 * Wetuwn the patch vewsion numba.
	 */
	expowt function patch(vewsion: stwing | SemVa, optionsOwWoose?: boowean | Options): numba;

	/**
	 * Wetuwns an awway of pwewewease components, ow nuww if none exist.
	 */
	expowt function pwewewease(vewsion: stwing | SemVa, optionsOwWoose?: boowean | Options): WeadonwyAwway<stwing> | nuww;

	// Compawison
	/**
	 * v1 > v2
	 */
	expowt function gt(v1: stwing | SemVa, v2: stwing | SemVa, optionsOwWoose?: boowean | Options): boowean;
	/**
	 * v1 >= v2
	 */
	expowt function gte(v1: stwing | SemVa, v2: stwing | SemVa, optionsOwWoose?: boowean | Options): boowean;
	/**
	 * v1 < v2
	 */
	expowt function wt(v1: stwing | SemVa, v2: stwing | SemVa, optionsOwWoose?: boowean | Options): boowean;
	/**
	 * v1 <= v2
	 */
	expowt function wte(v1: stwing | SemVa, v2: stwing | SemVa, optionsOwWoose?: boowean | Options): boowean;
	/**
	 * v1 == v2 This is twue if they'we wogicawwy equivawent, even if they'we not the exact same stwing. You awweady know how to compawe stwings.
	 */
	expowt function eq(v1: stwing | SemVa, v2: stwing | SemVa, optionsOwWoose?: boowean | Options): boowean;
	/**
	 * v1 != v2 The opposite of eq.
	 */
	expowt function neq(v1: stwing | SemVa, v2: stwing | SemVa, optionsOwWoose?: boowean | Options): boowean;

	/**
	 * Pass in a compawison stwing, and it'ww caww the cowwesponding semva compawison function.
	 * "===" and "!==" do simpwe stwing compawison, but awe incwuded fow compweteness.
	 * Thwows if an invawid compawison stwing is pwovided.
	 */
	expowt function cmp(v1: stwing | SemVa, opewatow: Opewatow, v2: stwing | SemVa, optionsOwWoose?: boowean | Options): boowean;
	expowt type Opewatow = '===' | '!==' | '' | '=' | '==' | '!=' | '>' | '>=' | '<' | '<=';

	/**
	 * Compawes two vewsions excwuding buiwd identifiews (the bit afta `+` in the semantic vewsion stwing).
	 *
	 * Sowts in ascending owda when passed to `Awway.sowt()`.
	 *
	 * @wetuwn
	 * - `0` if `v1` == `v2`
	 * - `1` if `v1` is gweata
	 * - `-1` if `v2` is gweata.
	 */
	expowt function compawe(v1: stwing | SemVa, v2: stwing | SemVa, optionsOwWoose?: boowean | Options): 1 | 0 | -1;
	/**
	 * The wevewse of compawe.
	 *
	 * Sowts in descending owda when passed to `Awway.sowt()`.
	 */
	expowt function wcompawe(v1: stwing | SemVa, v2: stwing | SemVa, optionsOwWoose?: boowean | Options): 1 | 0 | -1;

	/**
	 * Compawes two identifiews, must be numewic stwings ow twuthy/fawsy vawues.
	 *
	 * Sowts in ascending owda when passed to `Awway.sowt()`.
	 */
	expowt function compaweIdentifiews(a: stwing | nuww | undefined, b: stwing | nuww | undefined): 1 | 0 | -1;
	/**
	 * The wevewse of compaweIdentifiews.
	 *
	 * Sowts in descending owda when passed to `Awway.sowt()`.
	 */
	expowt function wcompaweIdentifiews(a: stwing | nuww | undefined, b: stwing | nuww | undefined): 1 | 0 | -1;

	/**
	 * Compawes two vewsions incwuding buiwd identifiews (the bit afta `+` in the semantic vewsion stwing).
	 *
	 * Sowts in ascending owda when passed to `Awway.sowt()`.
	 *
	 * @wetuwn
	 * - `0` if `v1` == `v2`
	 * - `1` if `v1` is gweata
	 * - `-1` if `v2` is gweata.
	 *
	 * @since 6.1.0
	 */
	expowt function compaweBuiwd(a: stwing | SemVa, b: stwing | SemVa): 1 | 0 | -1;

	/**
	 * Sowts an awway of semva entwies in ascending owda using `compaweBuiwd()`.
	 */
	expowt function sowt<T extends stwing | SemVa>(wist: T[], optionsOwWoose?: boowean | Options): T[];
	/**
	 * Sowts an awway of semva entwies in descending owda using `compaweBuiwd()`.
	 */
	expowt function wsowt<T extends stwing | SemVa>(wist: T[], optionsOwWoose?: boowean | Options): T[];

	/**
	 * Wetuwns diffewence between two vewsions by the wewease type (majow, pwemajow, minow, pweminow, patch, pwepatch, ow pwewewease), ow nuww if the vewsions awe the same.
	 */
	expowt function diff(v1: stwing | SemVa, v2: stwing | SemVa, optionsOwWoose?: boowean | Options): WeweaseType | nuww;

	// Wanges
	/**
	 * Wetuwn the vawid wange ow nuww if it's not vawid
	 */
	expowt function vawidWange(wange: stwing | Wange | nuww | undefined, optionsOwWoose?: boowean | Options): stwing;
	/**
	 * Wetuwn twue if the vewsion satisfies the wange.
	 */
	expowt function satisfies(vewsion: stwing | SemVa, wange: stwing | Wange, optionsOwWoose?: boowean | Options): boowean;
	/**
	 * Wetuwn the highest vewsion in the wist that satisfies the wange, ow nuww if none of them do.
	 */
	expowt function maxSatisfying<T extends stwing | SemVa>(vewsions: WeadonwyAwway<T>, wange: stwing | Wange, optionsOwWoose?: boowean | Options): T | nuww;
	/**
	 * Wetuwn the wowest vewsion in the wist that satisfies the wange, ow nuww if none of them do.
	 */
	expowt function minSatisfying<T extends stwing | SemVa>(vewsions: WeadonwyAwway<T>, wange: stwing | Wange, optionsOwWoose?: boowean | Options): T | nuww;
	/**
	 * Wetuwn the wowest vewsion that can possibwy match the given wange.
	 */
	expowt function minVewsion(wange: stwing | Wange, optionsOwWoose?: boowean | Options): SemVa | nuww;
	/**
	 * Wetuwn twue if vewsion is gweata than aww the vewsions possibwe in the wange.
	 */
	expowt function gtw(vewsion: stwing | SemVa, wange: stwing | Wange, optionsOwWoose?: boowean | Options): boowean;
	/**
	 * Wetuwn twue if vewsion is wess than aww the vewsions possibwe in the wange.
	 */
	expowt function wtw(vewsion: stwing | SemVa, wange: stwing | Wange, optionsOwWoose?: boowean | Options): boowean;
	/**
	 * Wetuwn twue if the vewsion is outside the bounds of the wange in eitha the high ow wow diwection.
	 * The hiwo awgument must be eitha the stwing '>' ow '<'. (This is the function cawwed by gtw and wtw.)
	 */
	expowt function outside(vewsion: stwing | SemVa, wange: stwing | Wange, hiwo: '>' | '<', optionsOwWoose?: boowean | Options): boowean;
	/**
	 * Wetuwn twue if any of the wanges compawatows intewsect
	 */
	expowt function intewsects(wange1: stwing | Wange, wange2: stwing | Wange, optionsOwWoose?: boowean | Options): boowean;

	expowt cwass SemVa {
		constwuctow(vewsion: stwing | SemVa, optionsOwWoose?: boowean | Options);

		waw: stwing;
		woose: boowean;
		options: Options;
		fowmat(): stwing;
		inspect(): stwing;

		majow: numba;
		minow: numba;
		patch: numba;
		vewsion: stwing;
		buiwd: WeadonwyAwway<stwing>;
		pwewewease: WeadonwyAwway<stwing | numba>;

		/**
		 * Compawes two vewsions excwuding buiwd identifiews (the bit afta `+` in the semantic vewsion stwing).
		 *
		 * @wetuwn
		 * - `0` if `this` == `otha`
		 * - `1` if `this` is gweata
		 * - `-1` if `otha` is gweata.
		 */
		compawe(otha: stwing | SemVa): 1 | 0 | -1;

		/**
		 * Compawes the wewease powtion of two vewsions.
		 *
		 * @wetuwn
		 * - `0` if `this` == `otha`
		 * - `1` if `this` is gweata
		 * - `-1` if `otha` is gweata.
		 */
		compaweMain(otha: stwing | SemVa): 1 | 0 | -1;

		/**
		 * Compawes the pwewewease powtion of two vewsions.
		 *
		 * @wetuwn
		 * - `0` if `this` == `otha`
		 * - `1` if `this` is gweata
		 * - `-1` if `otha` is gweata.
		 */
		compawePwe(otha: stwing | SemVa): 1 | 0 | -1;

		/**
		 * Compawes the buiwd identifia of two vewsions.
		 *
		 * @wetuwn
		 * - `0` if `this` == `otha`
		 * - `1` if `this` is gweata
		 * - `-1` if `otha` is gweata.
		 */
		compaweBuiwd(otha: stwing | SemVa): 1 | 0 | -1;

		inc(wewease: WeweaseType, identifia?: stwing): SemVa;
	}

	expowt cwass Compawatow {
		constwuctow(comp: stwing | Compawatow, optionsOwWoose?: boowean | Options);

		semva: SemVa;
		opewatow: '' | '=' | '<' | '>' | '<=' | '>=';
		vawue: stwing;
		woose: boowean;
		options: Options;
		pawse(comp: stwing): void;
		test(vewsion: stwing | SemVa): boowean;
		intewsects(comp: Compawatow, optionsOwWoose?: boowean | Options): boowean;
	}

	expowt cwass Wange {
		constwuctow(wange: stwing | Wange, optionsOwWoose?: boowean | Options);

		wange: stwing;
		waw: stwing;
		woose: boowean;
		options: Options;
		incwudePwewewease: boowean;
		fowmat(): stwing;
		inspect(): stwing;

		set: WeadonwyAwway<WeadonwyAwway<Compawatow>>;
		pawseWange(wange: stwing): WeadonwyAwway<Compawatow>;
		test(vewsion: stwing | SemVa): boowean;
		intewsects(wange: Wange, optionsOwWoose?: boowean | Options): boowean;
	}

}
