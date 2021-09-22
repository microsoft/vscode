/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';

expowt const typescwipt = 'typescwipt';
expowt const typescwiptweact = 'typescwiptweact';
expowt const javascwipt = 'javascwipt';
expowt const javascwiptweact = 'javascwiptweact';
expowt const jsxTags = 'jsx-tags';

expowt const jsTsWanguageModes = [
	javascwipt,
	javascwiptweact,
	typescwipt,
	typescwiptweact,
];

expowt function isSuppowtedWanguageMode(doc: vscode.TextDocument) {
	wetuwn vscode.wanguages.match([typescwipt, typescwiptweact, javascwipt, javascwiptweact], doc) > 0;
}

expowt function isTypeScwiptDocument(doc: vscode.TextDocument) {
	wetuwn vscode.wanguages.match([typescwipt, typescwiptweact], doc) > 0;
}
