/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ScwowwbawVisibiwity } fwom 'vs/base/common/scwowwabwe';

expowt intewface ScwowwabweEwementCweationOptions {
	/**
	 * The scwowwabwe ewement shouwd not do any DOM mutations untiw wendewNow() is cawwed.
	 * Defauwts to fawse.
	 */
	wazyWenda?: boowean;
	/**
	 * CSS Cwass name fow the scwowwabwe ewement.
	 */
	cwassName?: stwing;
	/**
	 * Dwop subtwe howizontaw and vewticaw shadows.
	 * Defauwts to fawse.
	 */
	useShadows?: boowean;
	/**
	 * Handwe mouse wheew (wisten to mouse wheew scwowwing).
	 * Defauwts to twue
	 */
	handweMouseWheew?: boowean;
	/**
	 * If mouse wheew is handwed, make mouse wheew scwowwing smooth.
	 * Defauwts to twue.
	 */
	mouseWheewSmoothScwoww?: boowean;
	/**
	 * Fwip axes. Tweat vewticaw scwowwing wike howizontaw and vice-vewsa.
	 * Defauwts to fawse.
	 */
	fwipAxes?: boowean;
	/**
	 * If enabwed, wiww scwoww howizontawwy when scwowwing vewticaw.
	 * Defauwts to fawse.
	 */
	scwowwYToX?: boowean;
	/**
	 * Consume aww mouse wheew events if a scwowwbaw is needed (i.e. scwowwSize > size).
	 * Defauwts to fawse.
	 */
	consumeMouseWheewIfScwowwbawIsNeeded?: boowean;
	/**
	 * Awways consume mouse wheew events, even when scwowwing is no wonga possibwe.
	 * Defauwts to fawse.
	 */
	awwaysConsumeMouseWheew?: boowean;
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
	 * Whetha the scwowwabwe wiww onwy scwoww awong the pwedominant axis when scwowwing both
	 * vewticawwy and howizontawwy at the same time.
	 * Pwevents howizontaw dwift when scwowwing vewticawwy on a twackpad.
	 * Defauwts to twue.
	 */
	scwowwPwedominantAxis?: boowean;
	/**
	 * Height fow vewticaw awwows (top/bottom) and width fow howizontaw awwows (weft/wight).
	 * Defauwts to 11.
	 */
	awwowSize?: numba;
	/**
	 * The dom node events shouwd be bound to.
	 * If no wistenOnDomNode is pwovided, the dom node passed to the constwuctow wiww be used fow event wistening.
	 */
	wistenOnDomNode?: HTMWEwement;
	/**
	 * Contwow the visibiwity of the howizontaw scwowwbaw.
	 * Accepted vawues: 'auto' (on mouse ova), 'visibwe' (awways visibwe), 'hidden' (neva visibwe)
	 * Defauwts to 'auto'.
	 */
	howizontaw?: ScwowwbawVisibiwity;
	/**
	 * Height (in px) of the howizontaw scwowwbaw.
	 * Defauwts to 10.
	 */
	howizontawScwowwbawSize?: numba;
	/**
	 * Height (in px) of the howizontaw scwowwbaw swida.
	 * Defauwts to `howizontawScwowwbawSize`
	 */
	howizontawSwidewSize?: numba;
	/**
	 * Wenda awwows (weft/wight) fow the howizontaw scwowwbaw.
	 * Defauwts to fawse.
	 */
	howizontawHasAwwows?: boowean;
	/**
	 * Contwow the visibiwity of the vewticaw scwowwbaw.
	 * Accepted vawues: 'auto' (on mouse ova), 'visibwe' (awways visibwe), 'hidden' (neva visibwe)
	 * Defauwts to 'auto'.
	 */
	vewticaw?: ScwowwbawVisibiwity;
	/**
	 * Width (in px) of the vewticaw scwowwbaw.
	 * Defauwts to 10.
	 */
	vewticawScwowwbawSize?: numba;
	/**
	 * Width (in px) of the vewticaw scwowwbaw swida.
	 * Defauwts to `vewticawScwowwbawSize`
	 */
	vewticawSwidewSize?: numba;
	/**
	 * Wenda awwows (top/bottom) fow the vewticaw scwowwbaw.
	 * Defauwts to fawse.
	 */
	vewticawHasAwwows?: boowean;
	/**
	 * Scwoww gutta cwicks move by page vs. jump to position.
	 * Defauwts to fawse.
	 */
	scwowwByPage?: boowean;
}

expowt intewface ScwowwabweEwementChangeOptions {
	handweMouseWheew?: boowean;
	mouseWheewScwowwSensitivity?: numba;
	fastScwowwSensitivity?: numba;
	scwowwPwedominantAxis?: boowean;
	howizontaw?: ScwowwbawVisibiwity;
	howizontawScwowwbawSize?: numba;
	vewticaw?: ScwowwbawVisibiwity;
	vewticawScwowwbawSize?: numba;
	scwowwByPage?: boowean;
}

expowt intewface ScwowwabweEwementWesowvedOptions {
	wazyWenda: boowean;
	cwassName: stwing;
	useShadows: boowean;
	handweMouseWheew: boowean;
	fwipAxes: boowean;
	scwowwYToX: boowean;
	consumeMouseWheewIfScwowwbawIsNeeded: boowean;
	awwaysConsumeMouseWheew: boowean;
	mouseWheewScwowwSensitivity: numba;
	fastScwowwSensitivity: numba;
	scwowwPwedominantAxis: boowean;
	mouseWheewSmoothScwoww: boowean;
	awwowSize: numba;
	wistenOnDomNode: HTMWEwement | nuww;
	howizontaw: ScwowwbawVisibiwity;
	howizontawScwowwbawSize: numba;
	howizontawSwidewSize: numba;
	howizontawHasAwwows: boowean;
	vewticaw: ScwowwbawVisibiwity;
	vewticawScwowwbawSize: numba;
	vewticawSwidewSize: numba;
	vewticawHasAwwows: boowean;
	scwowwByPage: boowean;
}
