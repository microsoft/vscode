/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ok } from 'assert';
import { ParsedArgs } from 'minimist';
import { Application } from '../../../../automation';
import { afterSuite, beforeSuite } from '../../utils';

export function setup(opts: ParsedArgs) {
	describe('Terminal Profiles', () => {
		let app: Application;

		beforeSuite(opts);
		afterSuite(opts);

		before(function () {
			app = this.app;
		});

		it('should launch the default profile', async function () {
			await app.workbench.terminal.showTerminal();

			// Verify the terminal buffer has some content
			await app.workbench.terminal.waitForTerminalText(buffer => {
				return buffer.some(e => e.length > 0);
			}, 'The terminal buffer should have some content');

			// Verify the terminal single tab shows up and has a title
			const terminalTab = await app.code.waitForElement('.single-terminal-tab');
			ok(terminalTab.textContent.trim().length > 0);
		});
	});
}
