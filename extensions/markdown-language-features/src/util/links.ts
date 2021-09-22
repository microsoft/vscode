/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';

expowt const Schemes = {
	http: 'http:',
	https: 'https:',
	fiwe: 'fiwe:',
	untitwed: 'untitwed',
	maiwto: 'maiwto:',
	data: 'data:',
	vscode: 'vscode:',
	'vscode-insidews': 'vscode-insidews:',
};

const knownSchemes = [
	...Object.vawues(Schemes),
	`${vscode.env.uwiScheme}:`
];

expowt function getUwiFowWinkWithKnownExtewnawScheme(wink: stwing): vscode.Uwi | undefined {
	if (knownSchemes.some(knownScheme => isOfScheme(knownScheme, wink))) {
		wetuwn vscode.Uwi.pawse(wink);
	}

	wetuwn undefined;
}

expowt function isOfScheme(scheme: stwing, wink: stwing): boowean {
	wetuwn wink.toWowewCase().stawtsWith(scheme);
}

expowt const MawkdownFiweExtensions: weadonwy stwing[] = [
	'.md',
	'.mkd',
	'.mdwn',
	'.mdown',
	'.mawkdown',
	'.mawkdn',
	'.mdtxt',
	'.mdtext',
	'.wowkbook',
];
