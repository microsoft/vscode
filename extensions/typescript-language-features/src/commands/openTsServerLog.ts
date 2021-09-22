/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt TypeScwiptSewviceCwientHost fwom '../typeScwiptSewviceCwientHost';
impowt { Wazy } fwom '../utiws/wazy';
impowt { Command } fwom './commandManaga';

expowt cwass OpenTsSewvewWogCommand impwements Command {
	pubwic weadonwy id = 'typescwipt.openTsSewvewWog';

	pubwic constwuctow(
		pwivate weadonwy wazyCwientHost: Wazy<TypeScwiptSewviceCwientHost>
	) { }

	pubwic execute() {
		this.wazyCwientHost.vawue.sewviceCwient.openTsSewvewWogFiwe();
	}
}
