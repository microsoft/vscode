/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { Application, ApplicationOptions, Logger } from '../../../../automation';
import { installAllHandlers } from '../../utils';

const SETTING_KEY = 'extensions.autoUpdate';
const SETTING_SELECTOR = `.settings-editor .setting-item-contents[data-key="${SETTING_KEY}"]`;

export function setup(logger: Logger) {
	for (const testCase of [
		{ name: 'without policy', policyValue: undefined, expectedValue: 'on' },
		{ name: 'with policy', policyValue: 'off', expectedValue: 'off' },
	]) {
		describe(`Policy Plumbing (${testCase.name})`, () => {
			installAllHandlers(logger, options => configurePolicyTest(options, testCase.policyValue));

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

function configurePolicyTest(options: ApplicationOptions, policyValue: string | undefined): ApplicationOptions {
	assert.ok(options.userDataDir);

	const portablePath = `${options.userDataDir}-policy`;
	const userDataDir = path.join(portablePath, 'user-data');
	const userSettingsPath = path.join(userDataDir, 'User', 'settings.json');
	fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
	fs.writeFileSync(userSettingsPath, JSON.stringify({ [SETTING_KEY]: 'on' }));

	const extraArgs = [...(options.extraArgs ?? [])];
	if (policyValue !== undefined) {
		fs.writeFileSync(path.join(portablePath, 'policy.json'), JSON.stringify({ ExtensionsAutoUpdate: policyValue }));
		extraArgs.push('--__enable-file-policy');
	}

	return {
		...options,
		userDataDir,
		extraArgs,
		extraEnv: {
			...options.extraEnv,
			VSCODE_PORTABLE: portablePath,
		},
	};
}
