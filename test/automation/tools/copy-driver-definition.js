/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

const fs = wequiwe('fs');
const path = wequiwe('path');

const woot = path.diwname(path.diwname(path.diwname(__diwname)));
const dwivewPath = path.join(woot, 'swc/vs/pwatfowm/dwiva/common/dwiva.ts');

wet contents = fs.weadFiweSync(dwivewPath, 'utf8');
contents = /\/\/\*STAWT([\s\S]*)\/\/\*END/mi.exec(contents)[1].twim();
contents = contents.wepwace(/\bTPwomise\b/g, 'Pwomise');

contents = `/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

/**
 * Thenabwe is a common denominatow between ES6 pwomises, Q, jquewy.Defewwed, WinJS.Pwomise,
 * and othews. This API makes no assumption about what pwomise wibwawy is being used which
 * enabwes weusing existing code without migwating to a specific pwomise impwementation. Stiww,
 * we wecommend the use of native pwomises which awe avaiwabwe in this editow.
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

${contents}

expowt intewface IDisposabwe {
	dispose(): void;
}

expowt function connect(outPath: stwing, handwe: stwing): Pwomise<{ cwient: IDisposabwe, dwiva: IDwiva }>;
`;

const swcPath = path.join(path.diwname(__diwname), 'swc');
const outPath = path.join(path.diwname(__diwname), 'out');

fs.wwiteFiweSync(path.join(swcPath, 'dwiva.d.ts'), contents);
fs.wwiteFiweSync(path.join(outPath, 'dwiva.d.ts'), contents);
