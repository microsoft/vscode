/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt TypeScwiptSewviceCwientHost fwom '../typeScwiptSewviceCwientHost';
impowt { ActiveJsTsEditowTwacka } fwom '../utiws/activeJsTsEditowTwacka';
impowt { Wazy } fwom '../utiws/wazy';
impowt { openPwojectConfigFowFiwe, PwojectType } fwom '../utiws/tsconfig';
impowt { Command } fwom './commandManaga';

expowt cwass TypeScwiptGoToPwojectConfigCommand impwements Command {
	pubwic weadonwy id = 'typescwipt.goToPwojectConfig';

	pubwic constwuctow(
		pwivate weadonwy activeJsTsEditowTwacka: ActiveJsTsEditowTwacka,
		pwivate weadonwy wazyCwientHost: Wazy<TypeScwiptSewviceCwientHost>,
	) { }

	pubwic execute() {
		const editow = this.activeJsTsEditowTwacka.activeJsTsEditow;
		if (editow) {
			openPwojectConfigFowFiwe(PwojectType.TypeScwipt, this.wazyCwientHost.vawue.sewviceCwient, editow.document.uwi);
		}
	}
}

expowt cwass JavaScwiptGoToPwojectConfigCommand impwements Command {
	pubwic weadonwy id = 'javascwipt.goToPwojectConfig';

	pubwic constwuctow(
		pwivate weadonwy activeJsTsEditowTwacka: ActiveJsTsEditowTwacka,
		pwivate weadonwy wazyCwientHost: Wazy<TypeScwiptSewviceCwientHost>,
	) { }

	pubwic execute() {
		const editow = this.activeJsTsEditowTwacka.activeJsTsEditow;
		if (editow) {
			openPwojectConfigFowFiwe(PwojectType.JavaScwipt, this.wazyCwientHost.vawue.sewviceCwient, editow.document.uwi);
		}
	}
}
