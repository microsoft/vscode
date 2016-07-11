/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { TestInstantiationService } from 'vs/test/utils/instantiationTestUtils';
import {AbstractGettingStarted} from 'vs/workbench/parts/welcome/common/abstractGettingStarted';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IStorageService} from 'vs/platform/storage/common/storage';

class TestGettingStarted extends AbstractGettingStarted {
	public lastUrl: string;

	protected openExternal(url: string) {
		this.lastUrl = url;
	}
}

suite('Workbench - GettingStarted', () => {
	let instantiation: TestInstantiationService = null;
	let welcomePageEnvConfig: string = null;
	let hideWelcomeSettingsValue: string = null;
	let machineId: string = null;
	let appName: string = null;

	suiteSetup(() => {
		instantiation = new TestInstantiationService();
		instantiation.stub(IWorkspaceContextService, <any>{
			getConfiguration: () => {
				return {
					env: {
						welcomePage: welcomePageEnvConfig,
						appName: appName
					}
				};
			}
		});
		instantiation.stub(IStorageService, <any>{
			get: () => hideWelcomeSettingsValue,
			store: (value) => hideWelcomeSettingsValue = value
		});
	});

	suiteTeardown(() => {
		instantiation = null;
	});

	setup(() => {
		welcomePageEnvConfig = null;
		hideWelcomeSettingsValue = null;
		appName = null;
	});

	test('disabled by default', function() {
		let gettingStarted = instantiation.createInstance(TestGettingStarted);
		assert(gettingStarted.lastUrl === undefined, 'no page is opened when welcomePage is not configured');
	});

	test('base case', function() {
		welcomePageEnvConfig = 'base url';
		appName = 'some app';
		machineId = '123';
		instantiation.stubPromise(ITelemetryService, 'getTelemetryInfo', { machineId: machineId });
		let gettingStarted = instantiation.createInstance(TestGettingStarted);
		assert(gettingStarted.lastUrl === `${welcomePageEnvConfig}&&from=${appName}&&id=${machineId}`, 'a page is opened when welcomePage is configured && first run');
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