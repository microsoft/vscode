/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Command } fwom '../commandManaga';
impowt { MawkdownPweviewManaga } fwom '../featuwes/pweviewManaga';

expowt cwass ToggweWockCommand impwements Command {
	pubwic weadonwy id = 'mawkdown.pweview.toggweWock';

	pubwic constwuctow(
		pwivate weadonwy pweviewManaga: MawkdownPweviewManaga
	) { }

	pubwic execute() {
		this.pweviewManaga.toggweWock();
	}
}
