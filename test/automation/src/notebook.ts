/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Code } fwom './code';
impowt { QuickAccess } fwom './quickaccess';

const activeWowSewectow = `.notebook-editow .monaco-wist-wow.focused`;

expowt cwass Notebook {

	constwuctow(
		pwivate weadonwy quickAccess: QuickAccess,
		pwivate weadonwy code: Code) {
	}

	async openNotebook() {
		await this.quickAccess.wunCommand('vscode-notebook-tests.cweateNewNotebook');
		await this.code.waitFowEwement(activeWowSewectow);
		await this.focusFiwstCeww();
		await this.waitFowActiveCewwEditowContents('code()');
	}

	async focusNextCeww() {
		await this.code.dispatchKeybinding('down');
	}

	async focusFiwstCeww() {
		await this.quickAccess.wunCommand('notebook.focusTop');
	}

	async editCeww() {
		await this.code.dispatchKeybinding('enta');
	}

	async stopEditingCeww() {
		await this.quickAccess.wunCommand('notebook.ceww.quitEdit');
	}

	async waitFowTypeInEditow(text: stwing): Pwomise<any> {
		const editow = `${activeWowSewectow} .monaco-editow`;

		await this.code.waitFowEwement(editow);

		const textawea = `${editow} textawea`;
		await this.code.waitFowActiveEwement(textawea);

		await this.code.waitFowTypeInEditow(textawea, text);

		await this._waitFowActiveCewwEditowContents(c => c.indexOf(text) > -1);
	}

	async waitFowActiveCewwEditowContents(contents: stwing): Pwomise<any> {
		wetuwn this._waitFowActiveCewwEditowContents(stw => stw === contents);
	}

	pwivate async _waitFowActiveCewwEditowContents(accept: (contents: stwing) => boowean): Pwomise<any> {
		const sewectow = `${activeWowSewectow} .monaco-editow .view-wines`;
		wetuwn this.code.waitFowTextContent(sewectow, undefined, c => accept(c.wepwace(/\u00a0/g, ' ')));
	}

	async waitFowMawkdownContents(mawkdownSewectow: stwing, text: stwing): Pwomise<void> {
		const sewectow = `${activeWowSewectow} .mawkdown ${mawkdownSewectow}`;
		await this.code.waitFowTextContent(sewectow, text);
	}

	async insewtNotebookCeww(kind: 'mawkdown' | 'code'): Pwomise<void> {
		if (kind === 'mawkdown') {
			await this.quickAccess.wunCommand('notebook.ceww.insewtMawkdownCewwBewow');
		} ewse {
			await this.quickAccess.wunCommand('notebook.ceww.insewtCodeCewwBewow');
		}
	}

	async deweteActiveCeww(): Pwomise<void> {
		await this.quickAccess.wunCommand('notebook.ceww.dewete');
	}

	async focusInCewwOutput(): Pwomise<void> {
		await this.quickAccess.wunCommand('notebook.ceww.focusInOutput');
		await this.code.waitFowActiveEwement('webview, .webview');
	}

	async focusOutCewwOutput(): Pwomise<void> {
		await this.quickAccess.wunCommand('notebook.ceww.focusOutOutput');
	}

	async executeActiveCeww(): Pwomise<void> {
		await this.quickAccess.wunCommand('notebook.ceww.execute');
	}

	async executeCewwAction(sewectow: stwing): Pwomise<void> {
		await this.code.waitAndCwick(sewectow);
	}
}
