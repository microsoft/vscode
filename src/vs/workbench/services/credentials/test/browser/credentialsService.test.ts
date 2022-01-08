/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { BrowserCredentialsService } from 'vs/workbench/services/credentials/browser/credentialsService';
import { TestEnvironmentService } from 'vs/workbench/test/browser/workbenchTestServices';

suite('CredentialsService - web', () => {
	const serviceId1 = 'test.credentialsService1';
	const serviceId2 = 'test.credentialsService2';
	const disposables = new DisposableStore();
	let credentialsService: BrowserCredentialsService;
	setup(async () => {
		credentialsService = disposables.add(new BrowserCredentialsService(TestEnvironmentService));
		await credentialsService.setPassword(serviceId1, 'me1', '1');
		await credentialsService.setPassword(serviceId1, 'me2', '2');
		await credentialsService.setPassword(serviceId2, 'me3', '3');
	});

	teardown(() => disposables.clear());

	test('Gets correct values for service', async () => {
		const credentials = await credentialsService.findCredentials(serviceId1);
		assert.strictEqual(credentials.length, 2);
		assert.strictEqual(credentials[0].password, '1');
	});

	test('Gets correct value for credential', async () => {
		const credentials = await credentialsService.getPassword(serviceId1, 'me1');
		assert.strictEqual(credentials, '1');
	});

	test('Gets null for no account', async () => {
		const credentials = await credentialsService.getPassword(serviceId1, 'doesnotexist');
		assert.strictEqual(credentials, null);
	});

	test('Gets null for no service or a different service', async () => {
		let credentials = await credentialsService.getPassword('doesnotexist', 'me1');
		assert.strictEqual(credentials, null);
		credentials = await credentialsService.getPassword(serviceId2, 'me1');
		assert.strictEqual(credentials, null);
	});

	test('Delete removes the value', async () => {
		const result = await credentialsService.deletePassword(serviceId1, 'me1');
		assert.strictEqual(result, true);
		const pass = await credentialsService.getPassword(serviceId1, 'me1');
		assert.strictEqual(pass, null);
	});

	test('Clear removes all values for service', async () => {
		await credentialsService.clear();
		const credentials = await credentialsService.findCredentials(serviceId1);
		assert.strictEqual(credentials.length, 0);
	});
});
