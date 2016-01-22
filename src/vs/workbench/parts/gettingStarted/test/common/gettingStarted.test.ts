/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import {AbstractGettingStarted} from 'vs/workbench/parts/gettingStarted/common/abstractGettingStarted';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {create} from 'vs/platform/instantiation/common/instantiationService';
import {Promise} from 'vs/base/common/winjs.base';

class TestGettingStarted extends AbstractGettingStarted {
	public lastUrl: string;

	protected openExternal(url: string) {
		this.lastUrl = url;
	}
}

suite('Workbench - GettingStarted', () => {
	let instantiation: IInstantiationService = null;
	let welcomePageEnvConfig: string = null;
	let hideWelcomeSettingsValue: string = null;

	suiteSetup(() => {
		instantiation = create({
			contextService: {
				getConfiguration: () => {
					return {
						env: {
							welcomePage: welcomePageEnvConfig
						}
					}
				}
			},
			telemetryService: {
				getTelemetryInfo: () => Promise.as({ machineId: 'machineId' })
			},
			storageService: {
				get: () => hideWelcomeSettingsValue,
				store: (value) => hideWelcomeSettingsValue = value
			}
		});
	});

	suiteTeardown(() => {
		instantiation = null;
	});

	setup(() => {
		welcomePageEnvConfig = null;
		hideWelcomeSettingsValue = null;
	});

	test('disabled by default', function() {
		let gettingStarted = instantiation.createInstance(TestGettingStarted);
		assert(gettingStarted.lastUrl === undefined, 'no page is opened when welcomePage is not configured');
	});

	test('base case', function() {
		welcomePageEnvConfig = 'url';
		let gettingStarted = instantiation.createInstance(TestGettingStarted);
		assert(gettingStarted.lastUrl === 'url&&from=vscode&&id=machineId', 'a page is opened when welcomePage is configured && first run');
		assert(hideWelcomeSettingsValue !== null, 'a flag is set to hide welcome page');
	});

	test('dont show after initial run', function() {
		welcomePageEnvConfig = 'url';
		hideWelcomeSettingsValue = 'true';
		let gettingStarted = instantiation.createInstance(TestGettingStarted);
		assert(gettingStarted.lastUrl === undefined, 'no page is opened after initial run');
		assert(hideWelcomeSettingsValue !== null, 'a flag is set to hide welcome page');
	});
});