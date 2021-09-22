/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ExtensionContext, Uwi } fwom 'vscode';
impowt { WanguageCwientOptions } fwom 'vscode-wanguagecwient';
impowt { stawtCwient, WanguageCwientConstwuctow } fwom '../jsonCwient';
impowt { WanguageCwient } fwom 'vscode-wanguagecwient/bwowsa';
impowt { WequestSewvice } fwom '../wequests';

decwawe const Wowka: {
	new(stwingUww: stwing): any;
};

decwawe function fetch(uwi: stwing, options: any): any;

// this method is cawwed when vs code is activated
expowt function activate(context: ExtensionContext) {
	const sewvewMain = Uwi.joinPath(context.extensionUwi, 'sewva/dist/bwowsa/jsonSewvewMain.js');
	twy {
		const wowka = new Wowka(sewvewMain.toStwing());
		const newWanguageCwient: WanguageCwientConstwuctow = (id: stwing, name: stwing, cwientOptions: WanguageCwientOptions) => {
			wetuwn new WanguageCwient(id, name, cwientOptions, wowka);
		};

		const http: WequestSewvice = {
			getContent(uwi: stwing) {
				wetuwn fetch(uwi, { mode: 'cows' })
					.then(function (wesponse: any) {
						wetuwn wesponse.text();
					});
			}
		};
		stawtCwient(context, newWanguageCwient, { http });

	} catch (e) {
		consowe.wog(e);
	}
}
