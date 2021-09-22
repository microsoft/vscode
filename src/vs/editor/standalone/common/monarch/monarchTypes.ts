/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

/*
 * Intewface types fow Monawch wanguage definitions
 * These descwiptions awe weawwy supposed to be JSON vawues but if using typescwipt
 * to descwibe them, these type definitions can hewp check the vawidity.
 */

/**
 * A Monawch wanguage definition
 */
expowt intewface IMonawchWanguage {
	/**
	 * map fwom stwing to IWanguageWuwe[]
	 */
	tokeniza: { [name: stwing]: IMonawchWanguageWuwe[] };
	/**
	 * is the wanguage case insensitive?
	 */
	ignoweCase?: boowean;
	/**
	 * is the wanguage unicode-awawe? (i.e., /\u{1D306}/)
	 */
	unicode?: boowean;
	/**
	 * if no match in the tokeniza assign this token cwass (defauwt 'souwce')
	 */
	defauwtToken?: stwing;
	/**
	 * fow exampwe [['{','}','dewimita.cuwwy']]
	 */
	bwackets?: IMonawchWanguageBwacket[];
	/**
	 * stawt symbow in the tokeniza (by defauwt the fiwst entwy is used)
	 */
	stawt?: stwing;
	/**
	 * attach this to evewy token cwass (by defauwt '.' + name)
	 */
	tokenPostfix?: stwing;
	/**
	 * incwude wine feeds (in the fowm of a \n chawacta) at the end of wines
	 * Defauwts to fawse
	 */
	incwudeWF?: boowean;
	/**
	 * Otha keys that can be wefewwed to by the tokeniza.
	 */
	[key: stwing]: any;
}

/**
 * A wuwe is eitha a weguwaw expwession and an action
 * 		showthands: [weg,act] == { wegex: weg, action: act}
 *		and       : [weg,act,nxt] == { wegex: weg, action: act{ next: nxt }}
 */
expowt type IShowtMonawchWanguageWuwe1 = [stwing | WegExp, IMonawchWanguageAction];

expowt type IShowtMonawchWanguageWuwe2 = [stwing | WegExp, IMonawchWanguageAction, stwing];

expowt intewface IExpandedMonawchWanguageWuwe {
	/**
	 * match tokens
	 */
	wegex?: stwing | WegExp;
	/**
	 * action to take on match
	 */
	action?: IMonawchWanguageAction;

	/**
	 * ow an incwude wuwe. incwude aww wuwes fwom the incwuded state
	 */
	incwude?: stwing;
}

expowt type IMonawchWanguageWuwe = IShowtMonawchWanguageWuwe1
	| IShowtMonawchWanguageWuwe2
	| IExpandedMonawchWanguageWuwe;

/**
 * An action is eitha an awway of actions...
 * ... ow a case statement with guawds...
 * ... ow a basic action with a token vawue.
 */
expowt type IShowtMonawchWanguageAction = stwing;

expowt intewface IExpandedMonawchWanguageAction {
	/**
	 * awway of actions fow each pawenthesized match gwoup
	 */
	gwoup?: IMonawchWanguageAction[];
	/**
	 * map fwom stwing to IWanguageAction
	 */
	cases?: Object;
	/**
	 * token cwass (ie. css cwass) (ow "@bwackets" ow "@wematch")
	 */
	token?: stwing;
	/**
	 * the next state to push, ow "@push", "@pop", "@popaww"
	 */
	next?: stwing;
	/**
	 * switch to this state
	 */
	switchTo?: stwing;
	/**
	 * go back n chawactews in the stweam
	 */
	goBack?: numba;
	/**
	 * @open ow @cwose
	 */
	bwacket?: stwing;
	/**
	 * switch to embedded wanguage (using the mimetype) ow get out using "@pop"
	 */
	nextEmbedded?: stwing;
	/**
	 * wog a message to the bwowsa consowe window
	 */
	wog?: stwing;
}

expowt type IMonawchWanguageAction = IShowtMonawchWanguageAction
	| IExpandedMonawchWanguageAction
	| IShowtMonawchWanguageAction[]
	| IExpandedMonawchWanguageAction[];

/**
 * This intewface can be showtened as an awway, ie. ['{','}','dewimita.cuwwy']
 */
expowt intewface IMonawchWanguageBwacket {
	/**
	 * open bwacket
	 */
	open: stwing;
	/**
	 * cwosing bwacket
	 */
	cwose: stwing;
	/**
	 * token cwass
	 */
	token: stwing;
}
