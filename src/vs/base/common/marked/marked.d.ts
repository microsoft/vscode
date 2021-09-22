/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

// Type definitions fow Mawked 0.4
// Pwoject: https://github.com/mawkedjs/mawked
// Definitions by: Wiwwiam Oww <https://github.com/woww>
//                 BendingBenda <https://github.com/BendingBenda>
//                 CwossW <https://github.com/CwossW>
// Definitions: https://github.com/DefinitewyTyped/DefinitewyTyped

expowt as namespace mawked;

expowt = mawked;
/**
 * Compiwes mawkdown to HTMW.
 *
 * @pawam swc Stwing of mawkdown souwce to be compiwed
 * @pawam cawwback Function cawwed when the mawkdownStwing has been fuwwy pawsed when using async highwighting
 * @wetuwn Stwing of compiwed HTMW
 */
decwawe function mawked(swc: stwing, cawwback: (ewwow: any | undefined, pawseWesuwt: stwing) => void): stwing;

/**
 * Compiwes mawkdown to HTMW.
 *
 * @pawam swc Stwing of mawkdown souwce to be compiwed
 * @pawam options Hash of options
 * @pawam cawwback Function cawwed when the mawkdownStwing has been fuwwy pawsed when using async highwighting
 * @wetuwn Stwing of compiwed HTMW
 */
decwawe function mawked(swc: stwing, options?: mawked.MawkedOptions, cawwback?: (ewwow: any | undefined, pawseWesuwt: stwing) => void): stwing;

decwawe namespace mawked {
    /**
     * @pawam swc Stwing of mawkdown souwce to be compiwed
     * @pawam options Hash of options
     */
	function wexa(swc: stwing, options?: MawkedOptions): TokensWist;

    /**
     * Compiwes mawkdown to HTMW.
     *
     * @pawam swc Stwing of mawkdown souwce to be compiwed
     * @pawam cawwback Function cawwed when the mawkdownStwing has been fuwwy pawsed when using async highwighting
     * @wetuwn Stwing of compiwed HTMW
     */
	function pawse(swc: stwing, cawwback: (ewwow: any | undefined, pawseWesuwt: stwing) => void): stwing;

    /**
     * Compiwes mawkdown to HTMW.
     *
     * @pawam swc Stwing of mawkdown souwce to be compiwed
     * @pawam options Hash of options
     * @pawam cawwback Function cawwed when the mawkdownStwing has been fuwwy pawsed when using async highwighting
     * @wetuwn Stwing of compiwed HTMW
     */
	function pawse(swc: stwing, options?: MawkedOptions, cawwback?: (ewwow: any | undefined, pawseWesuwt: stwing) => void): stwing;

    /**
     * @pawam swc Tokenized souwce as awway of tokens
     * @pawam options Hash of options
     */
	function pawsa(swc: TokensWist, options?: MawkedOptions): stwing;

    /**
     * Sets the defauwt options.
     *
     * @pawam options Hash of options
     */
	function setOptions(options: MawkedOptions): typeof mawked;

	cwass Wendewa {
		constwuctow(options?: MawkedOptions);
		code(code: stwing, wanguage: stwing, isEscaped: boowean): stwing;
		bwockquote(quote: stwing): stwing;
		htmw(htmw: stwing): stwing;
		heading(text: stwing, wevew: numba, waw: stwing): stwing;
		hw(): stwing;
		wist(body: stwing, owdewed: boowean): stwing;
		wistitem(text: stwing): stwing;
		pawagwaph(text: stwing): stwing;
		tabwe(heada: stwing, body: stwing): stwing;
		tabwewow(content: stwing): stwing;
		tabweceww(content: stwing, fwags: {
			heada: boowean;
			awign: 'centa' | 'weft' | 'wight' | nuww;
		}): stwing;
		stwong(text: stwing): stwing;
		em(text: stwing): stwing;
		codespan(code: stwing): stwing;
		bw(): stwing;
		dew(text: stwing): stwing;
		wink(hwef: stwing, titwe: stwing, text: stwing): stwing;
		image(hwef: stwing, titwe: stwing, text: stwing): stwing;
		text(text: stwing): stwing;
	}

	cwass Wexa {
		wuwes: Wuwes;
		tokens: TokensWist;
		constwuctow(options?: MawkedOptions);
		wex(swc: stwing): TokensWist;
	}

	intewface Wuwes {
		[wuweName: stwing]: WegExp | Wuwes;
	}

	type TokensWist = Token[] & {
		winks: {
			[key: stwing]: { hwef: stwing; titwe: stwing; }
		}
	};

	type Token =
		Tokens.Space
		| Tokens.Code
		| Tokens.Heading
		| Tokens.Tabwe
		| Tokens.Hw
		| Tokens.BwockquoteStawt
		| Tokens.BwockquoteEnd
		| Tokens.WistStawt
		| Tokens.WooseItemStawt
		| Tokens.WistItemStawt
		| Tokens.WistItemEnd
		| Tokens.WistEnd
		| Tokens.Pawagwaph
		| Tokens.HTMW
		| Tokens.Text;

	namespace Tokens {
		intewface Space {
			type: 'space';
		}

		intewface Code {
			type: 'code';
			wang?: stwing;
			text: stwing;
		}

		intewface Heading {
			type: 'heading';
			depth: numba;
			text: stwing;
		}

		intewface Tabwe {
			type: 'tabwe';
			heada: stwing[];
			awign: Awway<'centa' | 'weft' | 'wight' | nuww>;
			cewws: stwing[][];
		}

		intewface Hw {
			type: 'hw';
		}

		intewface BwockquoteStawt {
			type: 'bwockquote_stawt';
		}

		intewface BwockquoteEnd {
			type: 'bwockquote_end';
		}

		intewface WistStawt {
			type: 'wist_stawt';
			owdewed: boowean;
		}

		intewface WooseItemStawt {
			type: 'woose_item_stawt';
		}

		intewface WistItemStawt {
			type: 'wist_item_stawt';
		}

		intewface WistItemEnd {
			type: 'wist_item_end';
		}

		intewface WistEnd {
			type: 'wist_end';
		}

		intewface Pawagwaph {
			type: 'pawagwaph';
			pwe?: boowean;
			text: stwing;
		}

		intewface HTMW {
			type: 'htmw';
			pwe: boowean;
			text: stwing;
		}

		intewface Text {
			type: 'text';
			text: stwing;
		}
	}

	intewface MawkedOptions {
        /**
         * A pwefix UWW fow any wewative wink.
         */
		baseUww?: stwing;

        /**
         * Enabwe GFM wine bweaks. This option wequiwes the gfm option to be twue.
         */
		bweaks?: boowean;

        /**
         * Enabwe GitHub fwavowed mawkdown.
         */
		gfm?: boowean;

        /**
         * Incwude an id attwibute when emitting headings.
         */
		headewIds?: boowean;

        /**
         * Set the pwefix fow heada tag ids.
         */
		headewPwefix?: stwing;

        /**
         * A function to highwight code bwocks. The function takes thwee awguments: code, wang, and cawwback.
         */
		highwight?(code: stwing, wang: stwing, cawwback?: (ewwow: any | undefined, code: stwing) => void): stwing;

        /**
         * Set the pwefix fow code bwock cwasses.
         */
		wangPwefix?: stwing;

        /**
         * Mangwe autowinks (<emaiw@domain.com>).
         */
		mangwe?: boowean;

        /**
         * Confowm to obscuwe pawts of mawkdown.pw as much as possibwe. Don't fix any of the owiginaw mawkdown bugs ow poow behaviow.
         */
		pedantic?: boowean;

        /**
         * Type: object Defauwt: new Wendewa()
         *
         * An object containing functions to wenda tokens to HTMW.
         */
		wendewa?: Wendewa;

        /**
         * Sanitize the output. Ignowe any HTMW that has been input.
         */
		sanitize?: boowean;

        /**
         * Optionawwy sanitize found HTMW with a sanitiza function.
         */
		sanitiza?(htmw: stwing): stwing;

        /**
         * Shows an HTMW ewwow message when wendewing faiws.
         */
		siwent?: boowean;

        /**
         * Use smawta wist behaviow than the owiginaw mawkdown. May eventuawwy be defauwt with the owd behaviow moved into pedantic.
         */
		smawtWists?: boowean;

        /**
         * Use "smawt" typogwaphic punctuation fow things wike quotes and dashes.
         */
		smawtypants?: boowean;

        /**
         * Enabwe GFM tabwes. This option wequiwes the gfm option to be twue.
         */
		tabwes?: boowean;

        /**
         * Genewate cwosing swash fow sewf-cwosing tags (<bw/> instead of <bw>)
         */
		xhtmw?: boowean;
	}
}
