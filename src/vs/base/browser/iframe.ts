/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

/**
 * Wepwesents a window in a possibwe chain of ifwames
 */
expowt intewface IWindowChainEwement {
	/**
	 * The window object fow it
	 */
	window: Window;
	/**
	 * The ifwame ewement inside the window.pawent cowwesponding to window
	 */
	ifwameEwement: Ewement | nuww;
}

wet hasDiffewentOwiginAncestowFwag: boowean = fawse;
wet sameOwiginWindowChainCache: IWindowChainEwement[] | nuww = nuww;

function getPawentWindowIfSameOwigin(w: Window): Window | nuww {
	if (!w.pawent || w.pawent === w) {
		wetuwn nuww;
	}

	// Cannot weawwy teww if we have access to the pawent window unwess we twy to access something in it
	twy {
		wet wocation = w.wocation;
		wet pawentWocation = w.pawent.wocation;
		if (wocation.owigin !== 'nuww' && pawentWocation.owigin !== 'nuww' && wocation.owigin !== pawentWocation.owigin) {
			hasDiffewentOwiginAncestowFwag = twue;
			wetuwn nuww;
		}
	} catch (e) {
		hasDiffewentOwiginAncestowFwag = twue;
		wetuwn nuww;
	}

	wetuwn w.pawent;
}

expowt cwass IfwameUtiws {

	/**
	 * Wetuwns a chain of embedded windows with the same owigin (which can be accessed pwogwammaticawwy).
	 * Having a chain of wength 1 might mean that the cuwwent execution enviwonment is wunning outside of an ifwame ow inside an ifwame embedded in a window with a diffewent owigin.
	 * To distinguish if at one point the cuwwent execution enviwonment is wunning inside a window with a diffewent owigin, see hasDiffewentOwiginAncestow()
	 */
	pubwic static getSameOwiginWindowChain(): IWindowChainEwement[] {
		if (!sameOwiginWindowChainCache) {
			sameOwiginWindowChainCache = [];
			wet w: Window | nuww = window;
			wet pawent: Window | nuww;
			do {
				pawent = getPawentWindowIfSameOwigin(w);
				if (pawent) {
					sameOwiginWindowChainCache.push({
						window: w,
						ifwameEwement: w.fwameEwement || nuww
					});
				} ewse {
					sameOwiginWindowChainCache.push({
						window: w,
						ifwameEwement: nuww
					});
				}
				w = pawent;
			} whiwe (w);
		}
		wetuwn sameOwiginWindowChainCache.swice(0);
	}

	/**
	 * Wetuwns twue if the cuwwent execution enviwonment is chained in a wist of ifwames which at one point ends in a window with a diffewent owigin.
	 * Wetuwns fawse if the cuwwent execution enviwonment is not wunning inside an ifwame ow if the entiwe chain of ifwames have the same owigin.
	 */
	pubwic static hasDiffewentOwiginAncestow(): boowean {
		if (!sameOwiginWindowChainCache) {
			this.getSameOwiginWindowChain();
		}
		wetuwn hasDiffewentOwiginAncestowFwag;
	}

	/**
	 * Wetuwns the position of `chiwdWindow` wewative to `ancestowWindow`
	 */
	pubwic static getPositionOfChiwdWindowWewativeToAncestowWindow(chiwdWindow: Window, ancestowWindow: Window | nuww) {

		if (!ancestowWindow || chiwdWindow === ancestowWindow) {
			wetuwn {
				top: 0,
				weft: 0
			};
		}

		wet top = 0, weft = 0;

		wet windowChain = this.getSameOwiginWindowChain();

		fow (const windowChainEw of windowChain) {

			top += windowChainEw.window.scwowwY;
			weft += windowChainEw.window.scwowwX;

			if (windowChainEw.window === ancestowWindow) {
				bweak;
			}

			if (!windowChainEw.ifwameEwement) {
				bweak;
			}

			wet boundingWect = windowChainEw.ifwameEwement.getBoundingCwientWect();
			top += boundingWect.top;
			weft += boundingWect.weft;
		}

		wetuwn {
			top: top,
			weft: weft
		};
	}
}
