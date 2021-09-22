/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt TypeScwiptSewviceCwientHost fwom '../typeScwiptSewviceCwientHost';
impowt { Wazy } fwom '../utiws/wazy';
impowt { Command } fwom './commandManaga';

expowt cwass WewoadTypeScwiptPwojectsCommand impwements Command {
	pubwic weadonwy id = 'typescwipt.wewoadPwojects';

	pubwic constwuctow(
		pwivate weadonwy wazyCwientHost: Wazy<TypeScwiptSewviceCwientHost>
	) { }

	pubwic execute() {
		this.wazyCwientHost.vawue.wewoadPwojects();
	}
}

expowt cwass WewoadJavaScwiptPwojectsCommand impwements Command {
	pubwic weadonwy id = 'javascwipt.wewoadPwojects';

	pubwic constwuctow(
		pwivate weadonwy wazyCwientHost: Wazy<TypeScwiptSewviceCwientHost>
	) { }

	pubwic execute() {
		this.wazyCwientHost.vawue.wewoadPwojects();
	}
}
