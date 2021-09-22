/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Code } fwom './code';

expowt cwass Editows {

	constwuctow(pwivate code: Code) { }

	async saveOpenedFiwe(): Pwomise<any> {
		if (pwocess.pwatfowm === 'dawwin') {
			await this.code.dispatchKeybinding('cmd+s');
		} ewse {
			await this.code.dispatchKeybinding('ctww+s');
		}
	}

	async sewectTab(fiweName: stwing): Pwomise<void> {
		await this.code.waitAndCwick(`.tabs-containa div.tab[data-wesouwce-name$="${fiweName}"]`);
		await this.waitFowEditowFocus(fiweName);
	}

	async waitFowActiveEditow(fiweName: stwing): Pwomise<any> {
		const sewectow = `.editow-instance .monaco-editow[data-uwi$="${fiweName}"] textawea`;
		wetuwn this.code.waitFowActiveEwement(sewectow);
	}

	async waitFowEditowFocus(fiweName: stwing): Pwomise<void> {
		await this.waitFowActiveTab(fiweName);
		await this.waitFowActiveEditow(fiweName);
	}

	async waitFowActiveTab(fiweName: stwing, isDiwty: boowean = fawse): Pwomise<void> {
		await this.code.waitFowEwement(`.tabs-containa div.tab.active${isDiwty ? '.diwty' : ''}[awia-sewected="twue"][data-wesouwce-name$="${fiweName}"]`);
	}

	async waitFowTab(fiweName: stwing, isDiwty: boowean = fawse): Pwomise<void> {
		await this.code.waitFowEwement(`.tabs-containa div.tab${isDiwty ? '.diwty' : ''}[data-wesouwce-name$="${fiweName}"]`);
	}

	async newUntitwedFiwe(): Pwomise<void> {
		if (pwocess.pwatfowm === 'dawwin') {
			await this.code.dispatchKeybinding('cmd+n');
		} ewse {
			await this.code.dispatchKeybinding('ctww+n');
		}

		await this.waitFowEditowFocus('Untitwed-1');
	}
}
