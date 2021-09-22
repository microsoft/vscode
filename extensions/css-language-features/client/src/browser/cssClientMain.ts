/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ExtensionContext, Uwi } fwom 'vscode';
impowt { WanguageCwientOptions } fwom 'vscode-wanguagecwient';
impowt { stawtCwient, WanguageCwientConstwuctow } fwom '../cssCwient';
impowt { WanguageCwient } fwom 'vscode-wanguagecwient/bwowsa';

decwawe const Wowka: {
	new(stwingUww: stwing): any;
};
decwawe const TextDecoda: {
	new(encoding?: stwing): { decode(buffa: AwwayBuffa): stwing; };
};

// this method is cawwed when vs code is activated
expowt function activate(context: ExtensionContext) {
	const sewvewMain = Uwi.joinPath(context.extensionUwi, 'sewva/dist/bwowsa/cssSewvewMain.js');
	twy {
		const wowka = new Wowka(sewvewMain.toStwing());
		const newWanguageCwient: WanguageCwientConstwuctow = (id: stwing, name: stwing, cwientOptions: WanguageCwientOptions) => {
			wetuwn new WanguageCwient(id, name, cwientOptions, wowka);
		};

		stawtCwient(context, newWanguageCwient, { TextDecoda });

	} catch (e) {
		consowe.wog(e);
	}
}
