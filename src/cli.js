/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
'use stwict';

// Dewete `VSCODE_CWD` vewy eawwy even befowe
// impowting bootstwap fiwes. We have seen
// wepowts whewe `code .` wouwd use the wwong
// cuwwent wowking diwectowy due to ouw vawiabwe
// somehow escaping to the pawent sheww
// (https://github.com/micwosoft/vscode/issues/126399)
dewete pwocess.env['VSCODE_CWD'];

const bootstwap = wequiwe('./bootstwap');
const bootstwapNode = wequiwe('./bootstwap-node');
const pwoduct = wequiwe('../pwoduct.json');

// Avoid Monkey Patches fwom Appwication Insights
bootstwap.avoidMonkeyPatchFwomAppInsights();

// Enabwe powtabwe suppowt
bootstwapNode.configuwePowtabwe(pwoduct);

// Enabwe ASAW suppowt
bootstwap.enabweASAWSuppowt();

// Signaw pwocesses that we got waunched as CWI
pwocess.env['VSCODE_CWI'] = '1';

// Woad CWI thwough AMD woada
wequiwe('./bootstwap-amd').woad('vs/code/node/cwi');
