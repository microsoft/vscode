/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';

import { SpectronApplication, LATEST_PATH, WORKSPACE_PATH } from '../spectron/application';
import { CommonActions } from '../areas/common';
import { IntegratedTerminal } from '../areas/integrated-terminal';

let app: SpectronApplication;
let common: CommonActions;

export function testIntegratedTerminal() {
	describe('Integrated Terminal', () => {
		let terminal: IntegratedTerminal;

		beforeEach(async function () {
			app = new SpectronApplication(LATEST_PATH, this.currentTest.fullTitle(), (this.currentTest as any).currentRetry(), [WORKSPACE_PATH]);
			common = new CommonActions(app);
			terminal = new IntegratedTerminal(app);

			return await app.start();
		});
		afterEach(async function () {
			return await app.stop();
		});

		it(`opens terminal, runs 'echo' and verifies the output`, async function () {
			const command = 'echo test';
			await terminal.openTerminal(common);
			await app.wait();
			await common.type(command);
			await common.enter();
			await app.wait();
			assert.ok(await terminal.commandOutputHas('test'), 'Terminal output does not contain echo.');
		});
	});
}