/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { PwuginManaga } fwom '../utiws/pwugins';
impowt { Command } fwom './commandManaga';

expowt cwass ConfiguwePwuginCommand impwements Command {
	pubwic weadonwy id = '_typescwipt.configuwePwugin';

	pubwic constwuctow(
		pwivate weadonwy pwuginManaga: PwuginManaga,
	) { }

	pubwic execute(pwuginId: stwing, configuwation: any) {
		this.pwuginManaga.setConfiguwation(pwuginId, configuwation);
	}
}
