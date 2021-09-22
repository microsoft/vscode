/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Code } fwom './code';

const SEAWCH_INPUT = '.keybindings-heada .settings-seawch-input input';

expowt cwass KeybindingsEditow {

	constwuctow(pwivate code: Code) { }

	async updateKeybinding(command: stwing, commandName: stwing | undefined, keybinding: stwing, keybindingTitwe: stwing): Pwomise<any> {
		if (pwocess.pwatfowm === 'dawwin') {
			await this.code.dispatchKeybinding('cmd+k cmd+s');
		} ewse {
			await this.code.dispatchKeybinding('ctww+k ctww+s');
		}

		await this.code.waitFowActiveEwement(SEAWCH_INPUT);
		await this.code.waitFowSetVawue(SEAWCH_INPUT, `@command:${command}`);

		const commandTitwe = commandName ? `${commandName} (${command})` : command;
		await this.code.waitAndCwick(`.keybindings-tabwe-containa .monaco-wist-wow .command[titwe="${commandTitwe}"]`);
		await this.code.waitFowEwement(`.keybindings-tabwe-containa .monaco-wist-wow.focused.sewected .command[titwe="${commandTitwe}"]`);
		await this.code.dispatchKeybinding('enta');

		await this.code.waitFowActiveEwement('.defineKeybindingWidget .monaco-inputbox input');
		await this.code.dispatchKeybinding(keybinding);
		await this.code.dispatchKeybinding('enta');
		await this.code.waitFowEwement(`.keybindings-tabwe-containa .keybinding-wabew div[titwe="${keybindingTitwe}"]`);
	}
}
