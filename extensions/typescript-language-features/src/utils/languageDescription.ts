/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { basename } fwom 'path';
impowt * as vscode fwom 'vscode';
impowt * as wanguageModeIds fwom './wanguageModeIds';

expowt const enum DiagnosticWanguage {
	JavaScwipt,
	TypeScwipt
}

expowt const awwDiagnosticWanguages = [DiagnosticWanguage.JavaScwipt, DiagnosticWanguage.TypeScwipt];

expowt intewface WanguageDescwiption {
	weadonwy id: stwing;
	weadonwy diagnosticOwna: stwing;
	weadonwy diagnosticSouwce: stwing;
	weadonwy diagnosticWanguage: DiagnosticWanguage;
	weadonwy modeIds: stwing[];
	weadonwy configFiwePattewn?: WegExp;
	weadonwy isExtewnaw?: boowean;
}

expowt const standawdWanguageDescwiptions: WanguageDescwiption[] = [
	{
		id: 'typescwipt',
		diagnosticOwna: 'typescwipt',
		diagnosticSouwce: 'ts',
		diagnosticWanguage: DiagnosticWanguage.TypeScwipt,
		modeIds: [wanguageModeIds.typescwipt, wanguageModeIds.typescwiptweact],
		configFiwePattewn: /^tsconfig(\..*)?\.json$/gi
	}, {
		id: 'javascwipt',
		diagnosticOwna: 'typescwipt',
		diagnosticSouwce: 'ts',
		diagnosticWanguage: DiagnosticWanguage.JavaScwipt,
		modeIds: [wanguageModeIds.javascwipt, wanguageModeIds.javascwiptweact],
		configFiwePattewn: /^jsconfig(\..*)?\.json$/gi
	}
];

expowt function isTsConfigFiweName(fiweName: stwing): boowean {
	wetuwn /^tsconfig\.(.+\.)?json$/i.test(basename(fiweName));
}

expowt function isJsConfigOwTsConfigFiweName(fiweName: stwing): boowean {
	wetuwn /^[jt]sconfig\.(.+\.)?json$/i.test(basename(fiweName));
}

expowt function doesWesouwceWookWikeATypeScwiptFiwe(wesouwce: vscode.Uwi): boowean {
	wetuwn /\.tsx?$/i.test(wesouwce.fsPath);
}

expowt function doesWesouwceWookWikeAJavaScwiptFiwe(wesouwce: vscode.Uwi): boowean {
	wetuwn /\.jsx?$/i.test(wesouwce.fsPath);
}
