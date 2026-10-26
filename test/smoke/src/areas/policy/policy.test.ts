/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { Application, ApplicationOptions, Logger } from '../../../../automation';
import { installAllHandlers } from '../../utils';
import { NativePolicyFixture, nativePolicyFixture } from './nativePolicy';

const SETTING_KEY = 'extensions.autoUpdate';
const SETTING_SELECTOR = `.settings-editor .setting-item-contents[data-key="${SETTING_KEY}"]`;

export function setup(logger: Logger) {
	for (const testCase of [
		{ name: 'without policy', policyValue: undefined, expectedValue: 'on' },
		{ name: 'with policy', policyValue: 'off', expectedValue: 'off' },
	]) {
		describe(`Policy Plumbing (${testCase.name})`, () => {
			let createdPolicy = false;
			let fixture: NativePolicyFixture;
			installAllHandlers(logger, options => {
				fixture = nativePolicyFixture(options);
				if (testCase.policyValue !== undefined) {
					fixture.set();
					createdPolicy = true;
				}
				return configurePolicyTest(options);
			});
			after(() => {
				if (createdPolicy) {
					fixture.clear();
				}
			});

			it('applies the expected setting value', async function () {
				const app = this.app as Application;

				await app.workbench.settingsEditor.searchSettingsUI(`@id:${SETTING_KEY}`);
				await app.code.waitForTextContent(
					`${SETTING_SELECTOR} .setting-item-control select option:checked`,
					testCase.expectedValue
				);
				await app.code.waitForElement(
					`${SETTING_SELECTOR} .setting-item-control select:${testCase.policyValue === undefined ? 'enabled' : 'disabled'}`
				);

				const indicatorSelector = `${SETTING_SELECTOR} .setting-indicators-container .setting-indicator`;
				await app.code.waitForElements(
					indicatorSelector,
					false,
					elements => elements.some(element => element.textContent.includes('Managed by organization'))
						=== (testCase.policyValue !== undefined)
				);
			});
		});
	}
}

function configurePolicyTest(options: ApplicationOptions): ApplicationOptions {
	assert.ok(options.userDataDir);

	const userSettingsPath = path.join(options.userDataDir, 'User', 'settings.json');
	fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
	fs.writeFileSync(userSettingsPath, JSON.stringify({ [SETTING_KEY]: 'on' }));

	return options;
}
