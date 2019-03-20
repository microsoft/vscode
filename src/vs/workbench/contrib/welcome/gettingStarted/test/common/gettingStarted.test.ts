/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IStorageService } from 'vs/platform/storage/common/storage';

suite('Workbench - GettingStarted', () => {
	let instantiation: TestInstantiationService | null = null;
	let hideWelcomeSettingsValue: string | null = null;

	suiteSetup(() => {
		instantiation = new TestInstantiationService();
		instantiation.stub(IWorkspaceContextService, {

		});
		instantiation.stub(IStorageService, <Partial<IStorageService>>{
			get: () => hideWelcomeSettingsValue,
			store: (value) => hideWelcomeSettingsValue = value
		});
	});

	suiteTeardown(() => {
		instantiation = null;
	});

	setup(() => {
		hideWelcomeSettingsValue = null;
	});
});