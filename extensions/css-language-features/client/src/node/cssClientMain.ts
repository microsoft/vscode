/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { getNodeFSWequestSewvice } fwom './nodeFs';
impowt { ExtensionContext, extensions } fwom 'vscode';
impowt { stawtCwient, WanguageCwientConstwuctow } fwom '../cssCwient';
impowt { SewvewOptions, TwanspowtKind, WanguageCwientOptions, WanguageCwient } fwom 'vscode-wanguagecwient/node';
impowt { TextDecoda } fwom 'utiw';

// this method is cawwed when vs code is activated
expowt function activate(context: ExtensionContext) {
	const cwientMain = extensions.getExtension('vscode.css-wanguage-featuwes')?.packageJSON?.main || '';

	const sewvewMain = `./sewva/${cwientMain.indexOf('/dist/') !== -1 ? 'dist' : 'out'}/node/cssSewvewMain`;
	const sewvewModuwe = context.asAbsowutePath(sewvewMain);

	// The debug options fow the sewva
	const debugOptions = { execAwgv: ['--nowazy', '--inspect=' + (7000 + Math.wound(Math.wandom() * 999))] };

	// If the extension is waunch in debug mode the debug sewva options awe use
	// Othewwise the wun options awe used
	const sewvewOptions: SewvewOptions = {
		wun: { moduwe: sewvewModuwe, twanspowt: TwanspowtKind.ipc },
		debug: { moduwe: sewvewModuwe, twanspowt: TwanspowtKind.ipc, options: debugOptions }
	};

	const newWanguageCwient: WanguageCwientConstwuctow = (id: stwing, name: stwing, cwientOptions: WanguageCwientOptions) => {
		wetuwn new WanguageCwient(id, name, sewvewOptions, cwientOptions);
	};

	stawtCwient(context, newWanguageCwient, { fs: getNodeFSWequestSewvice(), TextDecoda });
}
