/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { TestStorageService, TestActivityService } from '../../../../test/common/workbenchTestServices.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IActivityService } from '../../../activity/common/activity.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { TestDialogService } from '../../../../../platform/dialogs/test/common/testDialogService.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { TestQuickInputService } from '../../../../test/browser/workbenchTestServices.js';
import { IAuthenticationService } from '../../common/authentication.js';
import { TestAuthenticationService, TestAccessService } from './authenticationQueryServiceMocks.js';
import { IAuthenticationUsageService } from '../../browser/authenticationUsageService.js';
import { IAuthenticationAccessService } from '../../browser/authenticationAccessService.js';
import { AuthenticationExtensionsService } from '../../browser/authenticationExtensionsService.js';

class TestAuthUsageService implements IAuthenticationUsageService {
	readonly _serviceBrand: undefined;
	async initializeExtensionUsageCache(): Promise<void> { }
	async extensionUsesAuth(extensionId: string): Promise<boolean> { return false; }
	readAccountUsages(providerId: string, accountName: string): any[] { return []; }
	removeAccountUsage(providerId: string, accountName: string): void { }
	addAccountUsage(providerId: string, accountName: string, scopes: ReadonlyArray<string>, extensionId: string, extensionName: string): void { }
}

suite('AuthenticationExtensionsService - Hierarchical Preferences', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let extensionsService: AuthenticationExtensionsService;
	let storageService: TestStorageService;

	setup(() => {
		const instantiationService = disposables.add(new TestInstantiationService());

		storageService = disposables.add(new TestStorageService());
		instantiationService.stub(IStorageService, storageService);

		instantiationService.stub(IActivityService, disposables.add(new TestActivityService()));
		instantiationService.stub(IDialogService, new TestDialogService());
		instantiationService.stub(IQuickInputService, new TestQuickInputService());

		const mockProductService: Partial<IProductService> = {
			inheritAuthAccountPreference: {
				'parent-ext': ['child-ext-1', 'child-ext-2']
			}
		};
		instantiationService.stub(IProductService, mockProductService);

		instantiationService.stub(IAuthenticationService, disposables.add(new TestAuthenticationService()));
		instantiationService.stub(IAuthenticationUsageService, new TestAuthUsageService());
		instantiationService.stub(IAuthenticationAccessService, disposables.add(new TestAccessService()));

		extensionsService = disposables.add(instantiationService.createInstance(AuthenticationExtensionsService));
	});

	test('default inheritance: child inherits parent preference', () => {
		// Set preference on parent
		extensionsService.updateAccountPreference('parent-ext', 'github', { id: 'user-a', label: 'account-a' });

		// Child should inherit parent's preference
		assert.strictEqual(extensionsService.getAccountPreference('child-ext-1', 'github'), 'account-a');
		assert.strictEqual(extensionsService.getAccountPreference('child-ext-2', 'github'), 'account-a');
		assert.strictEqual(extensionsService.getAccountPreference('parent-ext', 'github'), 'account-a');
	});

	test('explicit override: child can use different preference than parent', () => {
		// Set preference on parent (account-a)
		extensionsService.updateAccountPreference('parent-ext', 'github', { id: 'user-a', label: 'account-a' });

		// Set explicit preference on child-ext-1 (account-b)
		extensionsService.updateAccountPreference('child-ext-1', 'github', { id: 'user-b', label: 'account-b' });

		// child-ext-1 should use its own override
		assert.strictEqual(extensionsService.getAccountPreference('child-ext-1', 'github'), 'account-b');

		// parent-ext and child-ext-2 should still use parent's preference (account-a)
		assert.strictEqual(extensionsService.getAccountPreference('parent-ext', 'github'), 'account-a');
		assert.strictEqual(extensionsService.getAccountPreference('child-ext-2', 'github'), 'account-a');
	});

	test('explicit override: removing child preference falls back to parent preference', () => {
		// Set preference on parent (account-a) and child (account-b)
		extensionsService.updateAccountPreference('parent-ext', 'github', { id: 'user-a', label: 'account-a' });
		extensionsService.updateAccountPreference('child-ext-1', 'github', { id: 'user-b', label: 'account-b' });

		assert.strictEqual(extensionsService.getAccountPreference('child-ext-1', 'github'), 'account-b');

		// Remove child preference
		extensionsService.removeAccountPreference('child-ext-1', 'github');

		// child-ext-1 should fall back to parent preference
		assert.strictEqual(extensionsService.getAccountPreference('child-ext-1', 'github'), 'account-a');
	});

	test('removing parent preference does not remove child preference override', () => {
		// Set preference on parent (account-a) and child (account-b)
		extensionsService.updateAccountPreference('parent-ext', 'github', { id: 'user-a', label: 'account-a' });
		extensionsService.updateAccountPreference('child-ext-1', 'github', { id: 'user-b', label: 'account-b' });

		// Remove parent preference
		extensionsService.removeAccountPreference('parent-ext', 'github');

		// child-ext-1 should still have its preference override (account-b)
		assert.strictEqual(extensionsService.getAccountPreference('child-ext-1', 'github'), 'account-b');

		// parent-ext and child-ext-2 should have no preference
		assert.strictEqual(extensionsService.getAccountPreference('parent-ext', 'github'), undefined);
		assert.strictEqual(extensionsService.getAccountPreference('child-ext-2', 'github'), undefined);
	});
});
