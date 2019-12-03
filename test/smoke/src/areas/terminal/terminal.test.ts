/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Application } from '../../../../automation';

export function setup() {
	describe('Terminal', () => {
		it(`opens terminal, runs 'echo' and verifies the output`, async function () {
			const app = this.app as Application;

			const expected = new Date().getTime().toString();
			await app.workbench.terminal.showTerminal();
			await app.workbench.terminal.runCommand(`echo ${expected}`);
			await app.workbench.terminal.waitForTerminalText(terminalText => {
				for (let index = terminalText.length - 2; index >= 0; index--) {
					if (!!terminalText[index] && terminalText[index].trim() === expected) {
						return true;
					}
				}
				return false;
			});
		});
	});
}
