/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../../spectron/application';

describe('Terminal', () => {
	let app: SpectronApplication;
	before(() => { app = new SpectronApplication(); return app.start(); });
	after(() => app.stop());
	beforeEach(function () { app.createScreenshotCapturer(this.currentTest); });

	it(`opens terminal, runs 'echo' and verifies the output`, async function () {
		const expected = new Date().getTime().toString();
		await app.workbench.terminal.showTerminal();

		await app.workbench.terminal.runCommand(`echo ${expected}`);

		await app.workbench.terminal.waitForTerminalText(terminalText => !!terminalText[terminalText.length - 2] && terminalText[terminalText.length - 2].trim() === expected);
	});
});