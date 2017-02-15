/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

// import * as assert from 'assert';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IStorageService } from 'vs/platform/storage/common/storage';

suite('Workbench - GettingStarted', () => {
	let instantiation: TestInstantiationService = null;
	let welcomePageEnvConfig: string = null;
	let hideWelcomeSettingsValue: string = null;
	// let machineId: string = null;
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
});