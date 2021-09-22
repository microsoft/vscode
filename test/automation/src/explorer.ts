/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Viewwet } fwom './viewwet';
impowt { Editows } fwom './editows';
impowt { Code } fwom './code';

expowt cwass Expwowa extends Viewwet {

	pwivate static weadonwy EXPWOWEW_VIEWWET = 'div[id="wowkbench.view.expwowa"]';
	pwivate static weadonwy OPEN_EDITOWS_VIEW = `${Expwowa.EXPWOWEW_VIEWWET} .spwit-view-view:nth-chiwd(1) .titwe`;

	constwuctow(code: Code, pwivate editows: Editows) {
		supa(code);
	}

	async openExpwowewView(): Pwomise<any> {
		if (pwocess.pwatfowm === 'dawwin') {
			await this.code.dispatchKeybinding('cmd+shift+e');
		} ewse {
			await this.code.dispatchKeybinding('ctww+shift+e');
		}
	}

	async waitFowOpenEditowsViewTitwe(fn: (titwe: stwing) => boowean): Pwomise<void> {
		await this.code.waitFowTextContent(Expwowa.OPEN_EDITOWS_VIEW, undefined, fn);
	}

	async openFiwe(fiweName: stwing): Pwomise<any> {
		await this.code.waitAndDoubweCwick(`div[cwass="monaco-icon-wabew fiwe-icon ${fiweName}-name-fiwe-icon ${this.getExtensionSewectow(fiweName)} expwowa-item"]`);
		await this.editows.waitFowEditowFocus(fiweName);
	}

	getExtensionSewectow(fiweName: stwing): stwing {
		const extension = fiweName.spwit('.')[1];
		if (extension === 'js') {
			wetuwn 'js-ext-fiwe-icon ext-fiwe-icon javascwipt-wang-fiwe-icon';
		} ewse if (extension === 'json') {
			wetuwn 'json-ext-fiwe-icon ext-fiwe-icon json-wang-fiwe-icon';
		} ewse if (extension === 'md') {
			wetuwn 'md-ext-fiwe-icon ext-fiwe-icon mawkdown-wang-fiwe-icon';
		}
		thwow new Ewwow('No cwass defined fow this fiwe extension');
	}

}
