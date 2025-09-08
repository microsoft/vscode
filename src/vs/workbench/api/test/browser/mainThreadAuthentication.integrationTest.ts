/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { TestDialogService } from '../../../../platform/dialogs/test/common/testDialogService.js';
import { TestInstantiationService } from '../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../platform/notification/test/common/testNotificationService.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../platform/telemetry/common/telemetryUtils.js';
import { MainThreadAuthentication } from '../../browser/mainThreadAuthentication.js';
import { ExtHostContext, MainContext } from '../../common/extHost.protocol.js';
import { IActivityService } from '../../../services/activity/common/activity.js';
import { AuthenticationService } from '../../../services/authentication/browser/authenticationService.js';
import { IAuthenticationExtensionsService, IAuthenticationService } from '../../../services/authentication/common/authentication.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
import { TestRPCProtocol } from '../common/testRPCProtocol.js';
import { TestEnvironmentService, TestHostService, TestQuickInputService, TestRemoteAgentService } from '../../../test/browser/workbenchTestServices.js';
import { TestActivityService, TestExtensionService, TestProductService, TestStorageService } from '../../../test/common/workbenchTestServices.js';
import { IBrowserWorkbenchEnvironmentService } from '../../../services/environment/browser/environmentService.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { AuthenticationAccessService, IAuthenticationAccessService } from '../../../services/authentication/browser/authenticationAccessService.js';
import { IAccountUsage, IAuthenticationUsageService } from '../../../services/authentication/browser/authenticationUsageService.js';
import { AuthenticationExtensionsService } from '../../../services/authentication/browser/authenticationExtensionsService.js';
import { ILogService, NullLogService } from '../../../../platform/log/common/log.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IUserActivityService, UserActivityService } from '../../../services/userActivity/common/userActivityService.js';
import { ISecretStorageService } from '../../../../platform/secrets/common/secrets.js';
import { TestSecretStorageService } from '../../../../platform/secrets/test/common/testSecretStorageService.js';
import { IDynamicAuthenticationProviderStorageService } from '../../../services/authentication/common/dynamicAuthenticationProviderStorage.js';
import { DynamicAuthenticationProviderStorageService } from '../../../services/authentication/browser/dynamicAuthenticationProviderStorageService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';

class TestAuthUsageService implements IAuthenticationUsageService {
	_serviceBrand: undefined;
	initializeExtensionUsageCache(): Promise<void> { return Promise.resolve(); }
	extensionUsesAuth(extensionId: string): Promise<boolean> { return Promise.resolve(false); }
	readAccountUsages(providerId: string, accountName: string): IAccountUsage[] { return []; }
	removeAccountUsage(providerId: string, accountName: string): void { }
	addAccountUsage(providerId: string, accountName: string, scopes: ReadonlyArray<string>, extensionId: string, extensionName: string): void { }
}

suite('MainThreadAuthentication', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let mainThreadAuthentication: MainThreadAuthentication;
	let instantiationService: TestInstantiationService;
	let rpcProtocol: TestRPCProtocol;

	setup(async () => {
		// services
		const services = new ServiceCollection();
		services.set(ILogService, new SyncDescriptor(NullLogService));
		services.set(IDialogService, new SyncDescriptor(TestDialogService, [{ confirmed: true }]));
		services.set(IStorageService, new SyncDescriptor(TestStorageService));
		services.set(ISecretStorageService, new SyncDescriptor(TestSecretStorageService));
		services.set(IDynamicAuthenticationProviderStorageService, new SyncDescriptor(DynamicAuthenticationProviderStorageService));
		services.set(IQuickInputService, new SyncDescriptor(TestQuickInputService));
		services.set(IExtensionService, new SyncDescriptor(TestExtensionService));
		services.set(IActivityService, new SyncDescriptor(TestActivityService));
		services.set(IRemoteAgentService, new SyncDescriptor(TestRemoteAgentService));
		services.set(INotificationService, new SyncDescriptor(TestNotificationService));
		services.set(IHostService, new SyncDescriptor(TestHostService));
		services.set(IUserActivityService, new SyncDescriptor(UserActivityService));
		services.set(IAuthenticationAccessService, new SyncDescriptor(AuthenticationAccessService));
		services.set(IAuthenticationService, new SyncDescriptor(AuthenticationService));
		services.set(IAuthenticationUsageService, new SyncDescriptor(TestAuthUsageService));
		services.set(IAuthenticationExtensionsService, new SyncDescriptor(AuthenticationExtensionsService));
		instantiationService = disposables.add(new TestInstantiationService(services, undefined, undefined, true));

		// stubs
		// eslint-disable-next-line local/code-no-dangerous-type-assertions
		instantiationService.stub(IOpenerService, {} as Partial<IOpenerService>);
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IBrowserWorkbenchEnvironmentService, TestEnvironmentService);
		instantiationService.stub(IProductService, TestProductService);

		rpcProtocol = disposables.add(new TestRPCProtocol());
		mainThreadAuthentication = disposables.add(instantiationService.createInstance(MainThreadAuthentication, rpcProtocol));
		rpcProtocol.set(MainContext.MainThreadAuthentication, mainThreadAuthentication);
	});

	test('provider registration completes without errors', async () => {
		// Test basic registration - this should complete without throwing
		await mainThreadAuthentication.$registerAuthenticationProvider('test-provider', 'Test Provider', false);

		// Test unregistration - this should also complete without throwing
		await mainThreadAuthentication.$unregisterAuthenticationProvider('test-provider');

		// Success if we reach here without timeout
		assert.ok(true, 'Registration and unregistration completed successfully');
	});

	test('event suppression during explicit unregistration', async () => {
		let unregisterEventFired = false;
		let eventProviderId: string | undefined;

		// Mock the ext host to capture unregister events
		const mockExtHost = {
			$onDidUnregisterAuthenticationProvider: (id: string) => {
				unregisterEventFired = true;
				eventProviderId = id;
				return Promise.resolve();
			},
			$getSessions: () => Promise.resolve([]),
			$createSession: () => Promise.resolve({} as any),
			$removeSession: () => Promise.resolve(),
			$onDidChangeAuthenticationSessions: () => Promise.resolve(),
			$registerDynamicAuthProvider: () => Promise.resolve('test'),
			$onDidChangeDynamicAuthProviderTokens: () => Promise.resolve(),
			$getSessionsFromChallenges: () => Promise.resolve([]),
			$createSessionFromChallenges: () => Promise.resolve({} as any),
		};
		rpcProtocol.set(ExtHostContext.ExtHostAuthentication, mockExtHost);

		// Register a provider
		await mainThreadAuthentication.$registerAuthenticationProvider('test-suppress', 'Test Suppress', false);

		// Reset the flag
		unregisterEventFired = false;
		eventProviderId = undefined;

		// Unregister the provider - this should NOT fire the event due to suppression
		await mainThreadAuthentication.$unregisterAuthenticationProvider('test-suppress');

		// Verify the event was suppressed
		assert.strictEqual(unregisterEventFired, false, 'Unregister event should be suppressed during explicit unregistration');
		assert.strictEqual(eventProviderId, undefined, 'No provider ID should be captured from suppressed event');
	});

	test('concurrent provider registrations complete without errors', async () => {
		// Register multiple providers simultaneously
		const registrationPromises = [
			mainThreadAuthentication.$registerAuthenticationProvider('concurrent-1', 'Concurrent 1', false),
			mainThreadAuthentication.$registerAuthenticationProvider('concurrent-2', 'Concurrent 2', false),
			mainThreadAuthentication.$registerAuthenticationProvider('concurrent-3', 'Concurrent 3', false)
		];

		await Promise.all(registrationPromises);

		// Unregister all providers
		const unregistrationPromises = [
			mainThreadAuthentication.$unregisterAuthenticationProvider('concurrent-1'),
			mainThreadAuthentication.$unregisterAuthenticationProvider('concurrent-2'),
			mainThreadAuthentication.$unregisterAuthenticationProvider('concurrent-3')
		];

		await Promise.all(unregistrationPromises);

		// Success if we reach here without timeout
		assert.ok(true, 'Concurrent registrations and unregistrations completed successfully');
	});
});
