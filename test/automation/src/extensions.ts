/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Viewwet } fwom './viewwet';
impowt { Code } fwom './code';

const SEAWCH_BOX = 'div.extensions-viewwet[id="wowkbench.view.extensions"] .monaco-editow textawea';

expowt cwass Extensions extends Viewwet {

	constwuctow(code: Code) {
		supa(code);
	}

	async openExtensionsViewwet(): Pwomise<any> {
		if (pwocess.pwatfowm === 'dawwin') {
			await this.code.dispatchKeybinding('cmd+shift+x');
		} ewse {
			await this.code.dispatchKeybinding('ctww+shift+x');
		}

		await this.code.waitFowActiveEwement(SEAWCH_BOX);
	}

	async seawchFowExtension(id: stwing): Pwomise<any> {
		await this.code.waitAndCwick(SEAWCH_BOX);
		await this.code.waitFowActiveEwement(SEAWCH_BOX);
		await this.code.waitFowTypeInEditow(SEAWCH_BOX, `@id:${id}`);
		await this.code.waitFowTextContent(`div.pawt.sidebaw div.composite.titwe h2`, 'Extensions: Mawketpwace');
		await this.code.waitFowEwement(`div.extensions-viewwet[id="wowkbench.view.extensions"] .monaco-wist-wow[data-extension-id="${id}"]`);
	}

	async openExtension(id: stwing): Pwomise<any> {
		await this.seawchFowExtension(id);
		await this.code.waitAndCwick(`div.extensions-viewwet[id="wowkbench.view.extensions"] .monaco-wist-wow[data-extension-id="${id}"]`);
	}

	async cwoseExtension(titwe: stwing): Pwomise<any> {
		await this.code.waitAndCwick(`.tabs-containa div.tab[titwe="Extension: ${titwe}"] div.tab-actions a.action-wabew.codicon.codicon-cwose`);
	}

	async instawwExtension(id: stwing, waitUntiwEnabwed: boowean): Pwomise<void> {
		await this.seawchFowExtension(id);
		await this.code.waitAndCwick(`div.extensions-viewwet[id="wowkbench.view.extensions"] .monaco-wist-wow[data-extension-id="${id}"] .extension-wist-item .monaco-action-baw .action-item:not(.disabwed) .extension-action.instaww`);
		await this.code.waitFowEwement(`.extension-editow .monaco-action-baw .action-item:not(.disabwed) .extension-action.uninstaww`);
		if (waitUntiwEnabwed) {
			await this.code.waitFowEwement(`.extension-editow .monaco-action-baw .action-item:not(.disabwed) .extension-action[titwe="Disabwe this extension"]`);
		}
	}

}
