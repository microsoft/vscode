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
import { IAuthenticationUsageService } from '../../../services/authentication/browser/authenticationUsageService.js';
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
class TestAuthUsageService {
    initializeExtensionUsageCache() { return Promise.resolve(); }
    extensionUsesAuth(extensionId) { return Promise.resolve(false); }
    readAccountUsages(providerId, accountName) { return []; }
    removeAccountUsage(providerId, accountName) { }
    addAccountUsage(providerId, accountName, scopes, extensionId, extensionName) { }
}
suite('MainThreadAuthentication', () => {
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    let mainThreadAuthentication;
    let instantiationService;
    let rpcProtocol;
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
        instantiationService.stub(IOpenerService, {});
        instantiationService.stub(ITelemetryService, NullTelemetryService);
        instantiationService.stub(IBrowserWorkbenchEnvironmentService, TestEnvironmentService);
        instantiationService.stub(IProductService, TestProductService);
        rpcProtocol = disposables.add(new TestRPCProtocol());
        mainThreadAuthentication = disposables.add(instantiationService.createInstance(MainThreadAuthentication, rpcProtocol));
        rpcProtocol.set(MainContext.MainThreadAuthentication, mainThreadAuthentication);
    });
    test('provider registration completes without errors', async () => {
        // Test basic registration - this should complete without throwing
        await mainThreadAuthentication.$registerAuthenticationProvider({
            id: 'test-provider',
            label: 'Test Provider',
            supportsMultipleAccounts: false
        });
        // Test unregistration - this should also complete without throwing
        await mainThreadAuthentication.$unregisterAuthenticationProvider('test-provider');
        // Success if we reach here without timeout
        assert.ok(true, 'Registration and unregistration completed successfully');
    });
    test('event suppression during explicit unregistration', async () => {
        let unregisterEventFired = false;
        let eventProviderId;
        // Mock the ext host to capture unregister events
        const mockExtHost = {
            $onDidUnregisterAuthenticationProvider: (id) => {
                unregisterEventFired = true;
                eventProviderId = id;
                return Promise.resolve();
            },
            $getSessions: () => Promise.resolve([]),
            // eslint-disable-next-line local/code-no-any-casts
            $createSession: () => Promise.resolve({}),
            $removeSession: () => Promise.resolve(),
            $onDidChangeAuthenticationSessions: () => Promise.resolve(),
            $registerDynamicAuthProvider: () => Promise.resolve('test'),
            $onDidChangeDynamicAuthProviderTokens: () => Promise.resolve(),
            $getSessionsFromChallenges: () => Promise.resolve([]),
            // eslint-disable-next-line local/code-no-any-casts
            $createSessionFromChallenges: () => Promise.resolve({}),
        };
        rpcProtocol.set(ExtHostContext.ExtHostAuthentication, mockExtHost);
        // Register a provider
        await mainThreadAuthentication.$registerAuthenticationProvider({
            id: 'test-suppress',
            label: 'Test Suppress',
            supportsMultipleAccounts: false
        });
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
            mainThreadAuthentication.$registerAuthenticationProvider({
                id: 'concurrent-1',
                label: 'Concurrent 1',
                supportsMultipleAccounts: false
            }),
            mainThreadAuthentication.$registerAuthenticationProvider({
                id: 'concurrent-2',
                label: 'Concurrent 2',
                supportsMultipleAccounts: false
            }),
            mainThreadAuthentication.$registerAuthenticationProvider({
                id: 'concurrent-3',
                label: 'Concurrent 3',
                supportsMultipleAccounts: false
            })
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZEF1dGhlbnRpY2F0aW9uLmludGVncmF0aW9uVGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvdGVzdC9icm93c2VyL21haW5UaHJlYWRBdXRoZW50aWNhdGlvbi5pbnRlZ3JhdGlvblRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNoRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUNsRyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSw0RUFBNEUsQ0FBQztBQUN0SCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUNoRyxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSwwRUFBMEUsQ0FBQztBQUNuSCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMxRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDakYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDdkYsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDL0YsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDckYsT0FBTyxFQUFFLGNBQWMsRUFBRSxXQUFXLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMvRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUNqRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxtRUFBbUUsQ0FBQztBQUMxRyxPQUFPLEVBQUUsZ0NBQWdDLEVBQUUsc0JBQXNC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