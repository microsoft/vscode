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
			return await app.stop();
		});

		it('turns off editor line numbers and verifies the live change', async function () {
			await common.newUntitledFile();
			await app.wait();
			let elementsCount = await configView.getEditorLineNumbers();
			assert.equal(elementsCount, 1, 'Line numbers are not present in the editor before disabling them.');
			await common.addSetting('editor.lineNumbers', 'off');
			await app.wait();
			elementsCount = await configView.getEditorLineNumbers();
			assert.equal(elementsCount, 0, 'Line numbers are still present in the editor after disabling them.');
		});

		it(`changes 'workbench.action.toggleSidebarPosition' command key binding and verifies it`, async function () {
			await configView.enterKeybindingsView();
			await common.type('workbench.action.toggleSidebarPosition');
			await app.wait();
			await configView.selectFirstKeybindingsMatch();
			await configView.changeKeybinding();
			await configView.enterBinding(['Control', 'u', 'NULL']);
			await common.enter();
			let html = await configView.getActivityBar(ActivityBarPosition.RIGHT);
			assert.equal(html, undefined, 'Activity bar is positioned on the right, whereas should not be.');
			await app.wait();
			await configView.toggleActivityBarPosition();
			html = await configView.getActivityBar(ActivityBarPosition.RIGHT);
			assert.ok(html, 'Activity bar was not moved to right after toggling its position.');
		});
	});
}