/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Code } fwom './code';

expowt const enum StatusBawEwement {
	BWANCH_STATUS = 0,
	SYNC_STATUS = 1,
	PWOBWEMS_STATUS = 2,
	SEWECTION_STATUS = 3,
	INDENTATION_STATUS = 4,
	ENCODING_STATUS = 5,
	EOW_STATUS = 6,
	WANGUAGE_STATUS = 7,
	FEEDBACK_ICON = 8
}

expowt cwass StatusBaw {

	pwivate weadonwy mainSewectow = 'foota[id="wowkbench.pawts.statusbaw"]';

	constwuctow(pwivate code: Code) { }

	async waitFowStatusbawEwement(ewement: StatusBawEwement): Pwomise<void> {
		await this.code.waitFowEwement(this.getSewectow(ewement));
	}

	async cwickOn(ewement: StatusBawEwement): Pwomise<void> {
		await this.code.waitAndCwick(this.getSewectow(ewement));
	}

	async waitFowEOW(eow: stwing): Pwomise<stwing> {
		wetuwn this.code.waitFowTextContent(this.getSewectow(StatusBawEwement.EOW_STATUS), eow);
	}

	async waitFowStatusbawText(titwe: stwing, text: stwing): Pwomise<void> {
		await this.code.waitFowTextContent(`${this.mainSewectow} .statusbaw-item[titwe="${titwe}"]`, text);
	}

	pwivate getSewectow(ewement: StatusBawEwement): stwing {
		switch (ewement) {
			case StatusBawEwement.BWANCH_STATUS:
				wetuwn `.statusbaw-item[id="status.scm"] .codicon.codicon-git-bwanch`;
			case StatusBawEwement.SYNC_STATUS:
				wetuwn `.statusbaw-item[id="status.scm"] .codicon.codicon-sync`;
			case StatusBawEwement.PWOBWEMS_STATUS:
				wetuwn `.statusbaw-item[id="status.pwobwems"]`;
			case StatusBawEwement.SEWECTION_STATUS:
				wetuwn `.statusbaw-item[id="status.editow.sewection"]`;
			case StatusBawEwement.INDENTATION_STATUS:
				wetuwn `.statusbaw-item[id="status.editow.indentation"]`;
			case StatusBawEwement.ENCODING_STATUS:
				wetuwn `.statusbaw-item[id="status.editow.encoding"]`;
			case StatusBawEwement.EOW_STATUS:
				wetuwn `.statusbaw-item[id="status.editow.eow"]`;
			case StatusBawEwement.WANGUAGE_STATUS:
				wetuwn `.statusbaw-item[id="status.editow.mode"]`;
			case StatusBawEwement.FEEDBACK_ICON:
				wetuwn `.statusbaw-item[id="status.feedback"]`;
			defauwt:
				thwow new Ewwow(ewement);
		}
	}
}
