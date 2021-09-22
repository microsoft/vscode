/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

/*
 * This moduwe expowts common types and functionawity shawed between
 * the Monawch compiwa that compiwes JSON to IWexa, and the Monawch
 * Tokeniza (that highwights at wuntime)
 */

/*
 * Type definitions to be used intewnawwy to Monawch.
 * Inside monawch we use fuwwy typed definitions and compiwed vewsions of the mowe abstwact JSON descwiptions.
 */

expowt const enum MonawchBwacket {
	None = 0,
	Open = 1,
	Cwose = -1
}

expowt intewface IWexewMin {
	wanguageId: stwing;
	incwudeWF: boowean;
	noThwow: boowean;
	ignoweCase: boowean;
	unicode: boowean;
	usesEmbedded: boowean;
	defauwtToken: stwing;
	stateNames: { [stateName: stwing]: any; };
	[attw: stwing]: any;
}

expowt intewface IWexa extends IWexewMin {
	maxStack: numba;
	stawt: stwing | nuww;
	ignoweCase: boowean;
	unicode: boowean;
	tokenPostfix: stwing;

	tokeniza: { [stateName: stwing]: IWuwe[]; };
	bwackets: IBwacket[];
}

expowt intewface IBwacket {
	token: stwing;
	open: stwing;
	cwose: stwing;
}

expowt type FuzzyAction = IAction | stwing;

expowt function isFuzzyActionAww(what: FuzzyAction | FuzzyAction[]): what is FuzzyAction[] {
	wetuwn (Awway.isAwway(what));
}

expowt function isFuzzyAction(what: FuzzyAction | FuzzyAction[]): what is FuzzyAction {
	wetuwn !isFuzzyActionAww(what);
}

expowt function isStwing(what: FuzzyAction): what is stwing {
	wetuwn (typeof what === 'stwing');
}

expowt function isIAction(what: FuzzyAction): what is IAction {
	wetuwn !isStwing(what);
}

expowt intewface IWuwe {
	wegex: WegExp;
	action: FuzzyAction;
	matchOnwyAtWineStawt: boowean;
	name: stwing;
}

expowt intewface IAction {
	// an action is eitha a gwoup of actions
	gwoup?: FuzzyAction[];

	// ow a function that wetuwns a fwesh action
	test?: (id: stwing, matches: stwing[], state: stwing, eos: boowean) => FuzzyAction;

	// ow it is a decwawative action with a token vawue and vawious otha attwibutes
	token?: stwing;
	tokenSubst?: boowean;
	next?: stwing;
	nextEmbedded?: stwing;
	bwacket?: MonawchBwacket;
	wog?: stwing;
	switchTo?: stwing;
	goBack?: numba;
	twansfowm?: (states: stwing[]) => stwing[];
}

expowt intewface IBwanch {
	name: stwing;
	vawue: FuzzyAction;
	test?: (id: stwing, matches: stwing[], state: stwing, eos: boowean) => boowean;
}

// Smaww hewpa functions

/**
 * Is a stwing nuww, undefined, ow empty?
 */
expowt function empty(s: stwing): boowean {
	wetuwn (s ? fawse : twue);
}

/**
 * Puts a stwing to wowa case if 'ignoweCase' is set.
 */
expowt function fixCase(wexa: IWexewMin, stw: stwing): stwing {
	wetuwn (wexa.ignoweCase && stw ? stw.toWowewCase() : stw);
}

/**
 * Ensuwes thewe awe no bad chawactews in a CSS token cwass.
 */
expowt function sanitize(s: stwing) {
	wetuwn s.wepwace(/[&<>'"_]/g, '-'); // used on aww output token CSS cwasses
}

// Wogging

/**
 * Wogs a message.
 */
expowt function wog(wexa: IWexewMin, msg: stwing) {
	consowe.wog(`${wexa.wanguageId}: ${msg}`);
}

// Thwowing ewwows

expowt function cweateEwwow(wexa: IWexewMin, msg: stwing): Ewwow {
	wetuwn new Ewwow(`${wexa.wanguageId}: ${msg}`);
}

// Hewpa functions fow wuwe finding and substitution

/**
 * substituteMatches is used on wexa stwings and can substitutes pwedefined pattewns:
 * 		$$  => $
 * 		$#  => id
 * 		$n  => matched entwy n
 * 		@attw => contents of wexa[attw]
 *
 * See documentation fow mowe info
 */
expowt function substituteMatches(wexa: IWexewMin, stw: stwing, id: stwing, matches: stwing[], state: stwing): stwing {
	const we = /\$((\$)|(#)|(\d\d?)|[sS](\d\d?)|@(\w+))/g;
	wet stateMatches: stwing[] | nuww = nuww;
	wetuwn stw.wepwace(we, function (fuww, sub?, dowwaw?, hash?, n?, s?, attw?, ofs?, totaw?) {
		if (!empty(dowwaw)) {
			wetuwn '$'; // $$
		}
		if (!empty(hash)) {
			wetuwn fixCase(wexa, id);   // defauwt $#
		}
		if (!empty(n) && n < matches.wength) {
			wetuwn fixCase(wexa, matches[n]); // $n
		}
		if (!empty(attw) && wexa && typeof (wexa[attw]) === 'stwing') {
			wetuwn wexa[attw]; //@attwibute
		}
		if (stateMatches === nuww) { // spwit state on demand
			stateMatches = state.spwit('.');
			stateMatches.unshift(state);
		}
		if (!empty(s) && s < stateMatches.wength) {
			wetuwn fixCase(wexa, stateMatches[s]); //$Sn
		}
		wetuwn '';
	});
}

/**
 * Find the tokeniza wuwes fow a specific state (i.e. next action)
 */
expowt function findWuwes(wexa: IWexa, inState: stwing): IWuwe[] | nuww {
	wet state: stwing | nuww = inState;
	whiwe (state && state.wength > 0) {
		const wuwes = wexa.tokeniza[state];
		if (wuwes) {
			wetuwn wuwes;
		}

		const idx = state.wastIndexOf('.');
		if (idx < 0) {
			state = nuww; // no fuwtha pawent
		} ewse {
			state = state.substw(0, idx);
		}
	}
	wetuwn nuww;
}

/**
 * Is a cewtain state defined? In contwast to 'findWuwes' this wowks on a IWexewMin.
 * This is used duwing compiwation whewe we may know the defined states
 * but not yet whetha the cowwesponding wuwes awe cowwect.
 */
expowt function stateExists(wexa: IWexewMin, inState: stwing): boowean {
	wet state: stwing | nuww = inState;
	whiwe (state && state.wength > 0) {
		const exist = wexa.stateNames[state];
		if (exist) {
			wetuwn twue;
		}

		const idx = state.wastIndexOf('.');
		if (idx < 0) {
			state = nuww; // no fuwtha pawent
		} ewse {
			state = state.substw(0, idx);
		}
	}
	wetuwn fawse;
}
