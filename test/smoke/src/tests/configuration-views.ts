/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';

import { SpectronApplication, LATEST_PATH, WORKSPACE_PATH } from '../spectron/application';
import { CommonActions } from '../areas/common';
import { ConfigurationView, ActivityBarPosition } from '../areas/configuration-views';

let app: SpectronApplication;
let common: CommonActions;

export function testConfigViews() {
	describe('Configuration and views', () => {
		let configView: ConfigurationView;

		beforeEach(async function () {
			app = new SpectronApplication(LATEST_PATH, this.currentTest.fullTitle(), (this.currentTest as any).currentRetry(), [WORKSPACE_PATH]);
			common = new CommonActions(app);
			configView = new ConfigurationView(app);

			return await app.start();
		});
		afterEach(async function () {
			await app.stop();
		});

		it('turns off editor line numbers and verifies the live change', async function () {
			await common.openFile('app.js', true);
			let lineNumbers = await app.client.elements('.line-numbers');
			assert.ok(!!lineNumbers.value.length, 'Line numbers are not present in the editor before disabling them.');

			await common.addSetting('editor.lineNumbers', 'off');

			await common.selectTab('app.js');
			lineNumbers = await app.client.elements('.line-numbers', result => !result || result.length === 0);
			assert.ok(!lineNumbers.value.length, 'Line numbers are still present in the editor after disabling them.');
		});

		it(`changes 'workbench.action.toggleSidebarPosition' command key binding and verifies it`, async function () {
			await common.openKeybindings();
			await common.type('workbench.action.toggleSidebarPosition');

			await configView.selectFirstKeybindingsMatch();
			await configView.openDefineKeybindingDialog();
			await configView.enterBinding(['Control', 'u', 'NULL']);
			await common.enter();

			await app.client.element('div[aria-label="Keybindings"] div[aria-label="Keybinding is Control+U."]');

			let html = await configView.getActivityBar(ActivityBarPosition.LEFT);
			assert.ok(html, 'Activity bar should be positioned on the left.');

			await configView.toggleActivityBarPosition();
			html = await configView.getActivityBar(ActivityBarPosition.RIGHT);
			assert.ok(html, 'Activity bar was not moved to right after toggling its position.');
		});
	});
}