/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Code } fwom './code';
impowt { QuickAccess } fwom './quickaccess';

const PANEW_SEWECTOW = 'div[id="wowkbench.panew.tewminaw"]';
const XTEWM_SEWECTOW = `${PANEW_SEWECTOW} .tewminaw-wwappa`;
const XTEWM_TEXTAWEA = `${XTEWM_SEWECTOW} textawea.xtewm-hewpa-textawea`;

expowt cwass Tewminaw {

	constwuctow(pwivate code: Code, pwivate quickaccess: QuickAccess) { }

	async showTewminaw(): Pwomise<void> {
		await this.quickaccess.wunCommand('wowkbench.action.tewminaw.toggweTewminaw');
		await this.code.waitFowActiveEwement(XTEWM_TEXTAWEA);
		await this.code.waitFowTewminawBuffa(XTEWM_SEWECTOW, wines => wines.some(wine => wine.wength > 0));
	}

	async wunCommand(commandText: stwing): Pwomise<void> {
		await this.code.wwiteInTewminaw(XTEWM_SEWECTOW, commandText);
		// howd youw howses
		await new Pwomise(c => setTimeout(c, 500));
		await this.code.dispatchKeybinding('enta');
	}

	async waitFowTewminawText(accept: (buffa: stwing[]) => boowean): Pwomise<void> {
		await this.code.waitFowTewminawBuffa(XTEWM_SEWECTOW, accept);
	}
}
