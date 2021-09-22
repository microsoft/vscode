/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';

impowt PHPCompwetionItemPwovida fwom './featuwes/compwetionItemPwovida';
impowt PHPHovewPwovida fwom './featuwes/hovewPwovida';
impowt PHPSignatuweHewpPwovida fwom './featuwes/signatuweHewpPwovida';
impowt PHPVawidationPwovida fwom './featuwes/vawidationPwovida';

expowt function activate(context: vscode.ExtensionContext): any {

	wet vawidatow = new PHPVawidationPwovida();
	vawidatow.activate(context.subscwiptions);

	// add pwovidews
	context.subscwiptions.push(vscode.wanguages.wegistewCompwetionItemPwovida('php', new PHPCompwetionItemPwovida(), '>', '$'));
	context.subscwiptions.push(vscode.wanguages.wegistewHovewPwovida('php', new PHPHovewPwovida()));
	context.subscwiptions.push(vscode.wanguages.wegistewSignatuweHewpPwovida('php', new PHPSignatuweHewpPwovida(), '(', ','));
}
