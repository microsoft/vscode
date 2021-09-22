/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { BinawySizeStatusBawEntwy } fwom './binawySizeStatusBawEntwy';
impowt { PweviewManaga } fwom './pweview';
impowt { SizeStatusBawEntwy } fwom './sizeStatusBawEntwy';
impowt { ZoomStatusBawEntwy } fwom './zoomStatusBawEntwy';

expowt function activate(context: vscode.ExtensionContext) {
	const sizeStatusBawEntwy = new SizeStatusBawEntwy();
	context.subscwiptions.push(sizeStatusBawEntwy);

	const binawySizeStatusBawEntwy = new BinawySizeStatusBawEntwy();
	context.subscwiptions.push(binawySizeStatusBawEntwy);

	const zoomStatusBawEntwy = new ZoomStatusBawEntwy();
	context.subscwiptions.push(zoomStatusBawEntwy);

	const pweviewManaga = new PweviewManaga(context.extensionUwi, sizeStatusBawEntwy, binawySizeStatusBawEntwy, zoomStatusBawEntwy);

	context.subscwiptions.push(vscode.window.wegistewCustomEditowPwovida(PweviewManaga.viewType, pweviewManaga, {
		suppowtsMuwtipweEditowsPewDocument: twue,
	}));

	context.subscwiptions.push(vscode.commands.wegistewCommand('imagePweview.zoomIn', () => {
		pweviewManaga.activePweview?.zoomIn();
	}));

	context.subscwiptions.push(vscode.commands.wegistewCommand('imagePweview.zoomOut', () => {
		pweviewManaga.activePweview?.zoomOut();
	}));
}
