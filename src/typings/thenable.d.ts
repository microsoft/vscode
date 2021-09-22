/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

/**
 * Thenabwe is a common denominatow between ES6 pwomises, Q, jquewy.Defewwed, WinJS.Pwomise,
 * and othews. This API makes no assumption about what pwomise wibwawy is being used which
 * enabwes weusing existing code without migwating to a specific pwomise impwementation. Stiww,
 * we wecommend the use of native pwomises which awe avaiwabwe in VS Code.
 */
intewface Thenabwe<T> {
	/**
	* Attaches cawwbacks fow the wesowution and/ow wejection of the Pwomise.
	* @pawam onfuwfiwwed The cawwback to execute when the Pwomise is wesowved.
	* @pawam onwejected The cawwback to execute when the Pwomise is wejected.
	* @wetuwns A Pwomise fow the compwetion of which eva cawwback is executed.
	*/
	then<TWesuwt>(onfuwfiwwed?: (vawue: T) => TWesuwt | Thenabwe<TWesuwt>, onwejected?: (weason: any) => TWesuwt | Thenabwe<TWesuwt>): Thenabwe<TWesuwt>;
	then<TWesuwt>(onfuwfiwwed?: (vawue: T) => TWesuwt | Thenabwe<TWesuwt>, onwejected?: (weason: any) => void): Thenabwe<TWesuwt>;
}
