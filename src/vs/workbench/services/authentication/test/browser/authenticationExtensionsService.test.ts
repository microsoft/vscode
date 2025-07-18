/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { scopesMatch } from '../../../../../base/common/oauth.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AuthenticationExtensionsService } from '../../browser/authenticationExtensionsService.js';
import { AuthenticationService } from '../../browser/authenticationService.js';
import { AuthenticationAccessService } from '../../browser/authenticationAccessService.js';
import { AuthenticationUsageService } from '../../browser/authenticationUsageService.js';
import { AuthenticationSessionsChangeEvent, IAuthenticationProvider, AuthenticationSession } from '../../common/authentication.js';
import { TestEnvironmentService } from '../../../../test/browser/workbenchTestServices.js';
import { TestExtensionService, TestProductService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { TestDialogService } from '../../../../../platform/dialogs/test/common/testDialogService.js';
import { TestQuickInputService } from '../../../../../platform/quickinput/test/common/testQuickInputService.js';
import { IActivity, IActivityService } from '../../../activity/common/activity.js';

class TestActivityService implements IActivityService {
	_serviceBrand: undefined;
	onDidChangeActivity = Event.None;

	private activities = new Map<string, IActivity>();

	getViewContainerActivities(viewContainerId: string): IActivity[] {
		return [];
	}
	
	getActivity(id: string): IActivity[] {
		const activity = this.activities.get(id);
		return activity ? [activity] : [];
	}
	
	showViewContainerActivity(viewContainerId: string, badge: IActivity): IDisposable {
		this.activities.set(viewContainerId, badge);
		return { dispose: () => this.activities.delete(viewContainerId) };
	}
	
	showViewActivity(viewId: string, badge: IActivity): IDisposable {
		this.activities.set(viewId, badge);
		return { dispose: () => this.activities.delete(viewId) };
	}
	
	showAccountsActivity(activity: IActivity): IDisposable {
		this.activities.set('accounts', activity);
		return { dispose: () => this.activities.delete('accounts') };
	}
	
	showGlobalActivity(activity: IActivity): IDisposable {
		this.activities.set('global', activity);
		return { dispose: () => this.activities.delete('global') };
	}
}

function createSession(id: string = 'session1', scopes: string[] = ['test']): AuthenticationSession {
	return { id, accessToken: 'token1', account: { id: 'account', label: 'Account' }, scopes };
}

function createProvider(overrides: Partial<IAuthenticationProvider> = {}): IAuthenticationProvider {
	const emitter = new Emitter<AuthenticationSessionsChangeEvent>();
	return {
		supportsMultipleAccounts: false,
		onDidChangeSessions: emitter.event,
		id: 'test',
		label: 'Test',
		getSessions: async () => [],
		createSession: async () => createSession(),
		removeSession: async () => { },
		...overrides
	};
}

suite('AuthenticationExtensionsService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let authenticationService: AuthenticationService;
	let authenticationExtensionsService: AuthenticationExtensionsService;
	let activityService: TestActivityService;

	setup(() => {
		const storageService = disposables.add(new TestStorageService());
		const authenticationAccessService = disposables.add(new AuthenticationAccessService(storageService, TestProductService));
		const authenticationUsageService = disposables.add(new AuthenticationUsageService(storageService, TestProductService));
		authenticationService = disposables.add(new AuthenticationService(new TestExtensionService(), authenticationAccessService, TestEnvironmentService, new NullLogService()));
		activityService = disposables.add(new TestActivityService());
		
		authenticationExtensionsService = disposables.add(new AuthenticationExtensionsService(
			activityService,
			storageService,
			new TestDialogService(),
			new TestQuickInputService(),
			TestProductService,
			authenticationService,
			authenticationUsageService,
			authenticationAccessService
		));
	});

	teardown(() => {
		// Dispose services after each test
		authenticationExtensionsService.dispose();
		authenticationService.dispose();
	});

	test('badge is removed when session is created with matching scopes', async () => {
		const providerId = 'microsoft';
		const scopes = ['6f1cc985-85e8-487e-b0dd-aa633302a731/.default', 'VSCODE_TENANT:organizations'];
		const extensionId = 'testExtension';
		const extensionName = 'Test Extension';

		const emitter = new Emitter<AuthenticationSessionsChangeEvent>();
		const provider = createProvider({
			id: providerId,
			label: 'Microsoft',
			onDidChangeSessions: emitter.event
		});

		authenticationService.registerAuthenticationProvider(providerId, provider);

		// Request new session - this should create a badge
		await authenticationExtensionsService.requestNewSession(providerId, scopes, extensionId, extensionName);

		// Verify badge was created
		const accountActivity = activityService.getActivity('accounts')[0];
		assert.ok(accountActivity);
		assert.equal((accountActivity.badge as any).number, 1);

		// Create a session with the same scopes
		const session = createSession('session123', scopes);
		
		// Fire the session added event - this should remove the badge
		emitter.fire({ added: [session], removed: [], changed: [] });

		// Wait a bit for async processing
		await new Promise(resolve => setTimeout(resolve, 10));

		// Verify badge was removed
		assert.equal(activityService.getActivity('accounts').length, 0);
	});

	test('badge is removed when session is created with scopes in different order', async () => {
		const providerId = 'microsoft';
		const requestedScopes = ['6f1cc985-85e8-487e-b0dd-aa633302a731/.default', 'VSCODE_TENANT:organizations'];
		const sessionScopes = ['VSCODE_TENANT:organizations', '6f1cc985-85e8-487e-b0dd-aa633302a731/.default']; // Different order
		const extensionId = 'testExtension';
		const extensionName = 'Test Extension';

		const emitter = new Emitter<AuthenticationSessionsChangeEvent>();
		const provider = createProvider({
			id: providerId,
			label: 'Microsoft',
			onDidChangeSessions: emitter.event
		});

		authenticationService.registerAuthenticationProvider(providerId, provider);

		// Request new session - this should create a badge
		await authenticationExtensionsService.requestNewSession(providerId, requestedScopes, extensionId, extensionName);

		// Verify badge was created
		const accountActivity = activityService.getActivity('accounts')[0];
		assert.ok(accountActivity);
		assert.equal((accountActivity.badge as any).number, 1);

		// Create a session with the same scopes but in different order
		const session = createSession('session123', sessionScopes);
		
		// Fire the session added event - this should remove the badge
		emitter.fire({ added: [session], removed: [], changed: [] });

		// Wait a bit for async processing
		await new Promise(resolve => setTimeout(resolve, 10));

		// Verify badge was removed - this test should fail with the current implementation
		assert.equal(activityService.getActivity('accounts').length, 0);
	});

	test('badge remains when session is created with different scopes', async () => {
		const providerId = 'microsoft';
		const requestedScopes = ['6f1cc985-85e8-487e-b0dd-aa633302a731/.default', 'VSCODE_TENANT:organizations'];
		const sessionScopes = ['different-scope']; 
		const extensionId = 'testExtension';
		const extensionName = 'Test Extension';

		const emitter = new Emitter<AuthenticationSessionsChangeEvent>();
		const provider = createProvider({
			id: providerId,
			label: 'Microsoft',
			onDidChangeSessions: emitter.event
		});

		authenticationService.registerAuthenticationProvider(providerId, provider);

		// Request new session - this should create a badge
		await authenticationExtensionsService.requestNewSession(providerId, requestedScopes, extensionId, extensionName);

		// Verify badge was created
		const accountActivity = activityService.getActivity('accounts')[0];
		assert.ok(accountActivity);
		assert.equal((accountActivity.badge as any).number, 1);

		// Create a session with different scopes
		const session = createSession('session123', sessionScopes);
		
		// Fire the session added event - badge should remain
		emitter.fire({ added: [session], removed: [], changed: [] });

		// Wait a bit for async processing
		await new Promise(resolve => setTimeout(resolve, 10));

		// Verify badge still exists
		const remainingActivity = activityService.getActivity('accounts')[0];
		assert.ok(remainingActivity);
		assert.equal((remainingActivity.badge as any).number, 1);
	});
});