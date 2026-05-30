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
import { TestAuthenticationService, TestMcpAccessService } from './authenticationQueryServiceMocks.js';
import { IAuthenticationMcpUsageService } from '../../browser/authenticationMcpUsageService.js';
import { IAuthenticationMcpAccessService } from '../../browser/authenticationMcpAccessService.js';
import { AuthenticationMcpService } from '../../browser/authenticationMcpService.js';

class TestMcpUsageService implements IAuthenticationMcpUsageService {
	readonly _serviceBrand: undefined;
	async initializeUsageCache(): Promise<void> { }
	async hasUsedAuth(mcpServerId: string): Promise<boolean> { return false; }
	readAccountUsages(providerId: string, accountName: string): any[] { return []; }
	removeAccountUsage(providerId: string, accountName: string): void { }
	addAccountUsage(providerId: string, accountName: string, scopes: ReadonlyArray<string>, mcpServerId: string, mcpServerName: string): void { }
}

suite('AuthenticationMcpService - Hierarchical Preferences', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let mcpService: AuthenticationMcpService;
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
				'parent-mcp': ['child-mcp-1', 'child-mcp-2']
			}
		};
		instantiationService.stub(IProductService, mockProductService);

		instantiationService.stub(IAuthenticationService, disposables.add(new TestAuthenticationService()));
		instantiationService.stub(IAuthenticationMcpUsageService, new TestMcpUsageService());
		instantiationService.stub(IAuthenticationMcpAccessService, disposables.add(new TestMcpAccessService()));

		mcpService = disposables.add(instantiationService.createInstance(AuthenticationMcpService));
	});

	test('default inheritance: child inherits parent preference', () => {
		// Set preference on parent
		mcpService.updateAccountPreference('parent-mcp', 'github', { id: 'user-a', label: 'account-a' });

		// Child should inherit parent's preference
		assert.strictEqual(mcpService.getAccountPreference('child-mcp-1', 'github'), 'account-a');
		assert.strictEqual(mcpService.getAccountPreference('child-mcp-2', 'github'), 'account-a');
		assert.strictEqual(mcpService.getAccountPreference('parent-mcp', 'github'), 'account-a');
	});

	test('explicit override: child can use different preference than parent', () => {
		// Set preference on parent (account-a)
		mcpService.updateAccountPreference('parent-mcp', 'github', { id: 'user-a', label: 'account-a' });

		// Set explicit preference on child-mcp-1 (account-b)
		mcpService.updateAccountPreference('child-mcp-1', 'github', { id: 'user-b', label: 'account-b' });

		// child-mcp-1 should use its own override
		assert.strictEqual(mcpService.getAccountPreference('child-mcp-1', 'github'), 'account-b');

		// parent-mcp and child-mcp-2 should still use parent's preference (account-a)
		assert.strictEqual(mcpService.getAccountPreference('parent-mcp', 'github'), 'account-a');
		assert.strictEqual(mcpService.getAccountPreference('child-mcp-2', 'github'), 'account-a');
	});

	test('explicit override: removing child preference falls back to parent preference', () => {
		// Set preference on parent (account-a) and child (account-b)
		mcpService.updateAccountPreference('parent-mcp', 'github', { id: 'user-a', label: 'account-a' });
		mcpService.updateAccountPreference('child-mcp-1', 'github', { id: 'user-b', label: 'account-b' });

		assert.strictEqual(mcpService.getAccountPreference('child-mcp-1', 'github'), 'account-b');

		// Remove child preference
		mcpService.removeAccountPreference('child-mcp-1', 'github');

		// child-mcp-1 should fall back to parent preference
		assert.strictEqual(mcpService.getAccountPreference('child-mcp-1', 'github'), 'account-a');
	});

	test('removing parent preference does not remove child preference override', () => {
		// Set preference on parent (account-a) and child (account-b)
		mcpService.updateAccountPreference('parent-mcp', 'github', { id: 'user-a', label: 'account-a' });
		mcpService.updateAccountPreference('child-mcp-1', 'github', { id: 'user-b', label: 'account-b' });

		// Remove parent preference
		mcpService.removeAccountPreference('parent-mcp', 'github');

		// child-mcp-1 should still have its preference override (account-b)
		assert.strictEqual(mcpService.getAccountPreference('child-mcp-1', 'github'), 'account-b');

		// parent-mcp and child-mcp-2 should have no preference
		assert.strictEqual(mcpService.getAccountPreference('parent-mcp', 'github'), undefined);
		assert.strictEqual(mcpService.getAccountPreference('child-mcp-2', 'github'), undefined);
	});
});
