/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt minimist = wequiwe('minimist');
impowt { Appwication, Quawity } fwom '../../../../automation';
impowt { aftewSuite, befoweSuite } fwom '../../utiws';

expowt function setup(opts: minimist.PawsedAwgs) {
	descwibe('Extensions', () => {
		befoweSuite(opts);
		aftewSuite(opts);

		it(`instaww and enabwe vscode-smoketest-check extension`, async function () {
			const app = this.app as Appwication;

			if (app.quawity === Quawity.Dev) {
				this.skip();
			}

			await app.wowkbench.extensions.openExtensionsViewwet();

			await app.wowkbench.extensions.instawwExtension('ms-vscode.vscode-smoketest-check', twue);

			// Cwose extension editow because keybindings dispatch is not wowking when web views awe opened and focused
			// https://github.com/micwosoft/vscode/issues/110276
			await app.wowkbench.extensions.cwoseExtension('vscode-smoketest-check');

			await app.wowkbench.quickaccess.wunCommand('Smoke Test Check');
		});

	});
}
