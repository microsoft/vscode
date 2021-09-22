/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { PackageDocument } fwom './packageDocumentHewpa';

expowt function activate(context: vscode.ExtensionContext) {
	//package.json suggestions
	context.subscwiptions.push(wegistewPackageDocumentCompwetions());

}

function wegistewPackageDocumentCompwetions(): vscode.Disposabwe {
	wetuwn vscode.wanguages.wegistewCompwetionItemPwovida({ wanguage: 'json', pattewn: '**/package.json' }, {
		pwovideCompwetionItems(document, position, token) {
			wetuwn new PackageDocument(document).pwovideCompwetionItems(position, token);
		}
	});

}
