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
import { IQuickInputService, QuickInputHideReason } from '../../../../platform/quickinput/common/quickInput.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../platform/telemetry/common/telemetryUtils.js';
import { MainThreadAuthentication } from '../../browser/mainThreadAuthentication.js';
import { ExtHostContext, MainContext } from '../../common/extHost.protocol.js';
import { ExtHostAuthentication } from '../../common/extHostAuthentication.js';
import { IActivityService } from '../../../services/activity/common/activity.js';
import { AuthenticationService } from '../../../services/authentication/browser/authenticationService.js';
import { IAuthenticationExtensionsService, IAuthenticationService } from '../../../services/authentication/common/authentication.js';
import { IExtensionService, nullExtensionDescription as extensionDescription } from '../../../services/extensions/common/extensions.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
import { TestRPCProtocol } from '../common/testRPCProtocol.js';
import { TestEnvironmentService, TestHostService, TestQuickInputService, TestRemoteAgentService } from '../../../test/browser/workbenchTestServices.js';
import { TestActivityService, TestExtensionService, TestLoggerService, TestProductService, TestStorageService } from '../../../test/common/workbenchTestServices.js';
import { IBrowserWorkbenchEnvironmentService } from '../../../services/environment/browser/environmentService.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { AuthenticationAccessService, IAuthenticationAccessService } from '../../../services/authentication/browser/authenticationAccessService.js';
import { IAuthenticationUsageService } from '../../../services/authentication/browser/authenticationUsageService.js';
import { AuthenticationExtensionsService } from '../../../services/authentication/browser/authenticationExtensionsService.js';
import { ILogService, NullLogService } from '../../../../platform/log/common/log.js';
import { ExtHostWindow } from '../../common/extHostWindow.js';
import { MainThreadWindow } from '../../browser/mainThreadWindow.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IUserActivityService, UserActivityService } from '../../../services/userActivity/common/userActivityService.js';
import { ExtHostUrls } from '../../common/extHostUrls.js';
import { ISecretStorageService } from '../../../../platform/secrets/common/secrets.js';
import { TestSecretStorageService } from '../../../../platform/secrets/test/common/testSecretStorageService.js';
import { IDynamicAuthenticationProviderStorageService } from '../../../services/authentication/common/dynamicAuthenticationProviderStorage.js';
import { DynamicAuthenticationProviderStorageService } from '../../../services/authentication/browser/dynamicAuthenticationProviderStorageService.js';
import { ExtHostProgress } from '../../common/extHostProgress.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
class AuthQuickPick {
    constructor() {
        this.items = [];
    }
    get selectedItems() {
        return this.items;
    }
    onDidAccept(listener) {
        this.accept = listener;
    }
    onDidHide(listener) {
        this.hide = listener;
    }
    dispose() {
    }
    show() {
        this.accept?.({ inBackground: false });
        this.hide?.({ reason: QuickInputHideReason.Other });
    }
}
class AuthTestQuickInputService extends TestQuickInputService {
    createQuickPick() {
        // eslint-disable-next-line local/code-no-any-casts
        return new AuthQuickPick();
    }
}
class TestAuthUsageService {
    initializeExtensionUsageCache() { return Promise.resolve(); }
    extensionUsesAuth(extensionId) { return Promise.resolve(false); }
    readAccountUsages(providerId, accountName) { return []; }
    removeAccountUsage(providerId, accountName) { }
    addAccountUsage(providerId, accountName, scopes, extensionId, extensionName) { }
}
class TestAuthProvider {
    constructor(authProviderName) {
        this.authProviderName = authProviderName;
        this.id = 1;
        this.sessions = new Map();
        this.onDidChangeSessions = () => { return { dispose() { } }; };
    }
    async getSessions(scopes) {
        if (!scopes) {
            return [...this.sessions.values()];
        }
        if (scopes[0] === 'return multiple') {
            return [...this.sessions.values()];
        }
        const sessions = this.sessions.get(scopes.join(' '));
        return sessions ? [sessions] : [];
    }
    async createSession(scopes) {
        const scopesStr = scopes.join(' ');
        const session = {
            scopes,
            id: `${this.id}`,
            account: {
                label: this.authProviderName,
                id: `${this.id}`,
            },
            accessToken: Math.random() + '',
        };
        this.sessions.set(scopesStr, session);
        this.id++;
        return session;
    }
    async removeSession(sessionId) {
        this.sessions.delete(sessionId);
    }
}
suite('ExtHostAuthentication', () => {
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    let extHostAuthentication;
    let mainInstantiationService;
    setup(async () => {
        // services
        const services = new ServiceCollection();
        services.set(ILogService, new SyncDescriptor(NullLogService));
        services.set(IDialogService, new SyncDescriptor(TestDialogService, [{ confirmed: true }]));
        services.set(IStorageService, new SyncDescriptor(TestStorageService));
        services.set(ISecretStorageService, new SyncDescriptor(TestSecretStorageService));
        services.set(IDynamicAuthenticationProviderStorageService, new SyncDescriptor(DynamicAuthenticationProviderStorageService));
        services.set(IQuickInputService, new SyncDescriptor(AuthTestQuickInputService));
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
        mainInstantiationService = disposables.add(new TestInstantiationService(services, undefined, undefined, true));
        // stubs
        // eslint-disable-next-line local/code-no-dangerous-type-assertions
        mainInstantiationService.stub(IOpenerService, {});
        mainInstantiationService.stub(ITelemetryService, NullTelemetryService);
        mainInstantiationService.stub(IBrowserWorkbenchEnvironmentService, TestEnvironmentService);
        mainInstantiationService.stub(IProductService, TestProductService);
        const rpcProtocol = disposables.add(new TestRPCProtocol());
        rpcProtocol.set(MainContext.MainThreadAuthentication, disposables.add(mainInstantiationService.createInstance(MainThreadAuthentication, rpcProtocol)));
        rpcProtocol.set(MainContext.MainThreadWindow, disposables.add(mainInstantiationService.createInstance(MainThreadWindow, rpcProtocol)));
        // eslint-disable-next-line local/code-no-any-casts
        const initData = {
            environment: {
                appUriScheme: 'test',
                appName: 'Test'
            }
        };
        extHostAuthentication = new ExtHostAuthentication(rpcProtocol, 
        // eslint-disable-next-line local/code-no-any-casts
        {
            environment: {
                appUriScheme: 'test',
                appName: 'Test'
            }
        }, new ExtHostWindow(initData, rpcProtocol), new ExtHostUrls(rpcProtocol), new ExtHostProgress(rpcProtocol), disposables.add(new TestLoggerService()), new NullLogService());
        rpcProtocol.set(ExtHostContext.ExtHostAuthentication, extHostAuthentication);
        disposables.add(extHostAuthentication.registerAuthenticationProvider('test', 'test provider', new TestAuthProvider('test')));
        disposables.add(extHostAuthentication.registerAuthenticationProvider('test-multiple', 'test multiple provider', new TestAuthProvider('test-multiple'), { supportsMultipleAccounts: true }));
    });
    test('createIfNone - true', async () => {
        const scopes = ['foo'];
        const session = await extHostAuthentication.getSession(extensionDescription, 'test', scopes, {
            createIfNone: true
        });
        assert.strictEqual(session?.id, '1');
        assert.strictEqual(session?.scopes[0], 'foo');
    });
    test('createIfNone - false', async () => {
        const scopes = ['foo'];
        const nosession = await extHostAuthentication.getSession(extensionDescription, 'test', scopes, {});
        assert.strictEqual(nosession, undefined);
        // Now create the session
        const session = await extHostAuthentication.getSession(extensionDescription, 'test', scopes, {
            createIfNone: true
        });
        assert.strictEqual(session?.id, '1');
        assert.strictEqual(session?.scopes[0], 'foo');
        const session2 = await extHostAuthentication.getSession(extensionDescription, 'test', scopes, {});
        assert.strictEqual(session2?.id, session.id);
        assert.strictEqual(session2?.scopes[0], session.scopes[0]);
        assert.strictEqual(session2?.accessToken, session.accessToken);
    });
    // should behave the same as createIfNone: false
    test('silent - true', async () => {
        const scopes = ['foo'];
        const nosession = await extHostAuthentication.getSession(extensionDescription, 'test', scopes, {
            silent: true
        });
        assert.strictEqual(nosession, undefined);
        // Now create the session
        const session = await extHostAuthentication.getSession(extensionDescription, 'test', scopes, {
            createIfNone: true
        });
        assert.strictEqual(session?.id, '1');
        assert.strictEqual(session?.scopes[0], 'foo');
        const session2 = await extHostAuthentication.getSession(extensionDescription, 'test', scopes, {
            silent: true
        });
        assert.strictEqual(session.id, session2?.id);
        assert.strictEqual(session.scopes[0], session2?.scopes[0]);
    });
    test('forceNewSession - true - existing session', async () => {
        const scopes = ['foo'];
        const session1 = await extHostAuthentication.getSession(extensionDescription, 'test', scopes, {
            createIfNone: true
        });
        // Now create the session
        const session2 = await extHostAuthentication.getSession(extensionDescription, 'test', scopes, {
            forceNewSession: true
        });
        assert.strictEqual(session2?.id, '2');
        assert.strictEqual(session2?.scopes[0], 'foo');
        assert.notStrictEqual(session1.accessToken, session2?.accessToken);
    });
    // Should behave like createIfNone: true
    test('forceNewSession - true - no existing session', async () => {
        const scopes = ['foo'];
        const session = await extHostAuthentication.getSession(extensionDescription, 'test', scopes, {
            forceNewSession: true
        });
        assert.strictEqual(session?.id, '1');
        assert.strictEqual(session?.scopes[0], 'foo');
    });
    test('forceNewSession - detail', async () => {
        const scopes = ['foo'];
        const session1 = await extHostAuthentication.getSession(extensionDescription, 'test', scopes, {
            createIfNone: true
        });
        // Now create the session
        const session2 = await extHostAuthentication.getSession(extensionDescription, 'test', scopes, {
            forceNewSession: { detail: 'bar' }
        });
        assert.strictEqual(session2?.id, '2');
        assert.strictEqual(session2?.scopes[0], 'foo');
        assert.notStrictEqual(session1.accessToken, session2?.accessToken);
    });
    //#region Multi-Account AuthProvider
    test('clearSessionPreference - true', async () => {
        const scopes = ['foo'];
        // Now create the session
        const session = await extHostAuthentication.getSession(extensionDescription, 'test-multiple', scopes, {
            createIfNone: true
        });
        assert.strictEqual(session?.id, '1');
        assert.strictEqual(session?.scopes[0], scopes[0]);
        const scopes2 = ['bar'];
        const session2 = await extHostAuthentication.getSession(extensionDescription, 'test-multiple', scopes2, {
            createIfNone: true
        });
        assert.strictEqual(session2?.id, '2');
        assert.strictEqual(session2?.scopes[0], scopes2[0]);
        const session3 = await extHostAuthentication.getSession(extensionDescription, 'test-multiple', ['return multiple'], {
            clearSessionPreference: true,
            createIfNone: true
        });
        // clearing session preference causes us to get the first session
        // because it would normally show a quick pick for the user to choose
        assert.strictEqual(session3?.id, session.id);
        assert.strictEqual(session3?.scopes[0], session.scopes[0]);
        assert.strictEqual(session3?.accessToken, session.accessToken);
    });
    test('silently getting session should return a session (if any) regardless of preference - fixes #137819', async () => {
        const scopes = ['foo'];
        // Now create the session
        const session = await extHostAuthentication.getSession(extensionDescription, 'test-multiple', scopes, {
            createIfNone: true
        });
        assert.strictEqual(session?.id, '1');
        assert.strictEqual(session?.scopes[0], scopes[0]);
        const scopes2 = ['bar'];
        const session2 = await extHostAuthentication.getSession(extensionDescription, 'test-multiple', scopes2, {
            createIfNone: true
        });
        assert.strictEqual(session2?.id, '2');
        assert.strictEqual(session2?.scopes[0], scopes2[0]);
        const shouldBeSession1 = await extHostAuthentication.getSession(extensionDescription, 'test-multiple', scopes, {});
        assert.strictEqual(shouldBeSession1?.id, session.id);
        assert.strictEqual(shouldBeSession1?.scopes[0], session.scopes[0]);
        assert.strictEqual(shouldBeSession1?.accessToken, session.accessToken);
        const shouldBeSession2 = await extHostAuthentication.getSession(extensionDescription, 'test-multiple', scopes2, {});
        assert.strictEqual(shouldBeSession2?.id, session2.id);
        assert.strictEqual(shouldBeSession2?.scopes[0], session2.scopes[0]);
        assert.strictEqual(shouldBeSession2?.accessToken, session2.accessToken);
    });
    //#endregion
    //#region error cases
    test('createIfNone and forceNewSession', async () => {
        try {
            await extHostAuthentication.getSession(extensionDescription, 'test', ['foo'], {
                createIfNone: true,
                forceNewSession: true
            });
            assert.fail('should have thrown an Error.');
        }
        catch (e) {
            assert.ok(e);
        }
    });
    test('forceNewSession and silent', async () => {
        try {
            await extHostAuthentication.getSession(extensionDescription, 'test', ['foo'], {
                forceNewSession: true,
                silent: true
            });
            assert.fail('should have thrown an Error.');
        }
        catch (e) {
            assert.ok(e);
        }
    });
    test('createIfNone and silent', async () => {
        try {
            await extHostAuthentication.getSession(extensionDescription, 'test', ['foo'], {
                createIfNone: true,
                silent: true
            });
            assert.fail('should have thrown an Error.');
        }
        catch (e) {
            assert.ok(e);
        }
    });
    test('Can get multiple sessions (with different scopes) in one extension', async () => {
        let session = await extHostAuthentication.getSession(extensionDescription, 'test-multiple', ['foo'], {
            createIfNone: true
        });
        session = await extHostAuthentication.getSession(extensionDescription, 'test-multiple', ['bar'], {
            createIfNone: true
        });
        assert.strictEqual(session?.id, '2');
        assert.strictEqual(session?.scopes[0], 'bar');
        session = await extHostAuthentication.getSession(extensionDescription, 'test-multiple', ['foo'], {
            createIfNone: false
        });
        assert.strictEqual(session?.id, '1');
        assert.strictEqual(session?.scopes[0], 'foo');
    });
    test('Can get multiple sessions (from different providers) in one extension', async () => {
        let session = await extHostAuthentication.getSession(extensionDescription, 'test-multiple', ['foo'], {
            createIfNone: true
        });
        session = await extHostAuthentication.getSession(extensionDescription, 'test', ['foo'], {
            createIfNone: true
        });
        assert.strictEqual(session?.id, '1');
        assert.strictEqual(session?.scopes[0], 'foo');
        assert.strictEqual(session?.account.label, 'test');
        const session2 = await extHostAuthentication.getSession(extensionDescription, 'test-multiple', ['foo'], {
            createIfNone: false
        });
        assert.strictEqual(session2?.id, '1');
        assert.strictEqual(session2?.scopes[0], 'foo');
        assert.strictEqual(session2?.account.label, 'test-multiple');
    });
    test('Can get multiple sessions (from different providers) in one extension at the same time', async () => {
        const sessionP = extHostAuthentication.getSession(extensionDescription, 'test', ['foo'], {
            createIfNone: true
        });
        const session2P = extHostAuthentication.getSession(extensionDescription, 'test-multiple', ['foo'], {
            createIfNone: true
        });
        const session = await sessionP;
        assert.strictEqual(session?.id, '1');
        assert.strictEqual(session?.scopes[0], 'foo');
        assert.strictEqual(session?.account.label, 'test');
        const session2 = await session2P;
        assert.strictEqual(session2?.id, '1');
        assert.strictEqual(session2?.scopes[0], 'foo');
        assert.strictEqual(session2?.account.label, 'test-multiple');
    });
    //#endregion
    //#region Race Condition and Sequencing Tests
    test('concurrent operations on same provider are serialized', async () => {
        const provider = new TestAuthProvider('concurrent-test');
        const operationOrder = [];
        // Mock the provider methods to track operation order
        const originalCreateSession = provider.createSession.bind(provider);
        const originalGetSessions = provider.getSessions.bind(provider);
        provider.createSession = async (scopes) => {
            operationOrder.push(`create-start-${scopes[0]}`);
            await new Promise(resolve => setTimeout(resolve, 20)); // Simulate async work
            const result = await originalCreateSession(scopes);
            operationOrder.push(`create-end-${scopes[0]}`);
            return result;
        };
        provider.getSessions = async (scopes) => {
            const scopeKey = scopes ? scopes[0] : 'all';
            operationOrder.push(`get-start-${scopeKey}`);
            await new Promise(resolve => setTimeout(resolve, 10)); // Simulate async work
            const result = await originalGetSessions(scopes);
            operationOrder.push(`get-end-${scopeKey}`);
            return result;
        };
        const disposable = extHostAuthentication.registerAuthenticationProvider('concurrent-test', 'Concurrent Test', provider);
        disposables.add(disposable);
        // Start multiple operations simultaneously on the same provider
        const promises = [
            extHostAuthentication.getSession(extensionDescription, 'concurrent-test', ['scope1'], { createIfNone: true }),
            extHostAuthentication.getSession(extensionDescription, 'concurrent-test', ['scope2'], { createIfNone: true }),
            extHostAuthentication.getSession(extensionDescription, 'concurrent-test', ['scope1'], {}) // This should get the existing session
        ];
        await Promise.all(promises);
        // Verify that operations were serialized - no overlapping operations
        // Build a map of operation starts to their corresponding ends
        const operationPairs = [];
        for (let i = 0; i < operationOrder.length; i++) {
            const current = operationOrder[i];
            if (current.includes('-start-')) {
                const scope = current.split('-start-')[1];
                const operationType = current.split('-start-')[0];
                const endOperation = `${operationType}-end-${scope}`;
                const endIndex = operationOrder.indexOf(endOperation, i + 1);
                if (endIndex !== -1) {
                    operationPairs.push({
                        start: i,
                        end: endIndex,
                        operation: `${operationType}-${scope}`
                    });
                }
            }
        }
        // Verify no operations overlap (serialization)
        for (let i = 0; i < operationPairs.length; i++) {
            for (let j = i + 1; j < operationPairs.length; j++) {
                const op1 = operationPairs[i];
                const op2 = operationPairs[j];
                // Operations should not overlap - one should completely finish before the other starts
                const op1EndsBeforeOp2Starts = op1.end < op2.start;
                const op2EndsBeforeOp1Starts = op2.end < op1.start;
                assert.ok(op1EndsBeforeOp2Starts || op2EndsBeforeOp1Starts, `Operations ${op1.operation} and ${op2.operation} should not overlap. ` +
                    `Op1: ${op1.start}-${op1.end}, Op2: ${op2.start}-${op2.end}. ` +
                    `Order: [${operationOrder.join(', ')}]`);
            }
        }
        // Verify we have the expected operations
        assert.ok(operationOrder.includes('create-start-scope1'), 'Should have created session for scope1');
        assert.ok(operationOrder.includes('create-end-scope1'), 'Should have completed creating session for scope1');
        assert.ok(operationOrder.includes('create-start-scope2'), 'Should have created session for scope2');
        assert.ok(operationOrder.includes('create-end-scope2'), 'Should have completed creating session for scope2');
        // The third call should use getSessions to find the existing scope1 session
        assert.ok(operationOrder.includes('get-start-scope1'), 'Should have called getSessions for existing scope1 session');
        assert.ok(operationOrder.includes('get-end-scope1'), 'Should have completed getSessions for existing scope1 session');
    });
    test('provider registration and immediate disposal race condition', async () => {
        const provider = new TestAuthProvider('race-test');
        // Register and immediately dispose
        const disposable = extHostAuthentication.registerAuthenticationProvider('race-test', 'Race Test', provider);
        disposable.dispose();
        // Try to use the provider after disposal - should fail gracefully
        try {
            await extHostAuthentication.getSession(extensionDescription, 'race-test', ['scope'], { createIfNone: true });
            assert.fail('Should have thrown an error for non-existent provider');
        }
        catch (error) {
            // Expected - provider should be unavailable
            assert.ok(error);
        }
    });
    test('provider re-registration after proper disposal', async () => {
        const provider1 = new TestAuthProvider('reregister-test-1');
        const provider2 = new TestAuthProvider('reregister-test-2');
        // First registration
        const disposable1 = extHostAuthentication.registerAuthenticationProvider('reregister-test', 'Provider 1', provider1);
        // Create a session with first provider
        const session1 = await extHostAuthentication.getSession(extensionDescription, 'reregister-test', ['scope'], { createIfNone: true });
        assert.strictEqual(session1?.account.label, 'reregister-test-1');
        // Dispose first provider
        disposable1.dispose();
        // Re-register with different provider
        const disposable2 = extHostAuthentication.registerAuthenticationProvider('reregister-test', 'Provider 2', provider2);
        disposables.add(disposable2);
        // Create session with second provider
        const session2 = await extHostAuthentication.getSession(extensionDescription, 'reregister-test', ['scope'], { createIfNone: true });
        assert.strictEqual(session2?.account.label, 'reregister-test-2');
        assert.notStrictEqual(session1?.accessToken, session2?.accessToken);
    });
    test('operations on different providers run concurrently', async () => {
        const provider1 = new TestAuthProvider('concurrent-1');
        const provider2 = new TestAuthProvider('concurrent-2');
        let provider1Started = false;
        let provider2Started = false;
        let provider1Finished = false;
        let provider2Finished = false;
        let concurrencyVerified = false;
        // Override createSession to track timing
        const originalCreate1 = provider1.createSession.bind(provider1);
        const originalCreate2 = provider2.createSession.bind(provider2);
        provider1.createSession = async (scopes) => {
            provider1Started = true;
            await new Promise(resolve => setTimeout(resolve, 20));
            const result = await originalCreate1(scopes);
            provider1Finished = true;
            return result;
        };
        provider2.createSession = async (scopes) => {
            provider2Started = true;
            // Provider 2 should start before provider 1 finishes (concurrent execution)
            if (provider1Started && !provider1Finished) {
                concurrencyVerified = true;
            }
            await new Promise(resolve => setTimeout(resolve, 10));
            const result = await originalCreate2(scopes);
            provider2Finished = true;
            return result;
        };
        const disposable1 = extHostAuthentication.registerAuthenticationProvider('concurrent-1', 'Concurrent 1', provider1);
        const disposable2 = extHostAuthentication.registerAuthenticationProvider('concurrent-2', 'Concurrent 2', provider2);
        disposables.add(disposable1);
        disposables.add(disposable2);
        // Start operations on both providers simultaneously
        const [session1, session2] = await Promise.all([
            extHostAuthentication.getSession(extensionDescription, 'concurrent-1', ['scope'], { createIfNone: true }),
            extHostAuthentication.getSession(extensionDescription, 'concurrent-2', ['scope'], { createIfNone: true })
        ]);
        // Verify both operations completed successfully
        assert.ok(session1);
        assert.ok(session2);
        assert.ok(provider1Started, 'Provider 1 should have started');
        assert.ok(provider2Started, 'Provider 2 should have started');
        assert.ok(provider1Finished, 'Provider 1 should have finished');
        assert.ok(provider2Finished, 'Provider 2 should have finished');
        assert.strictEqual(session1.account.label, 'concurrent-1');
        assert.strictEqual(session2.account.label, 'concurrent-2');
        // Verify that operations ran concurrently (provider 2 started while provider 1 was still running)
        assert.ok(concurrencyVerified, 'Operations should have run concurrently - provider 2 should start while provider 1 is still running');
    });
    //#endregion
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdEF1dGhlbnRpY2F0aW9uLmludGVncmF0aW9uVGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvdGVzdC9icm93c2VyL2V4dEhvc3RBdXRoZW50aWNhdGlvbi5pbnRlZ3JhdGlvblRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNoRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUNsRyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSw0RUFBNEUsQ0FBQztBQUN0SCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUNoRyxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSwwRUFBMEUsQ0FBQztBQUNuSCxPQUFPLEVBQXdCLGtCQUFrQixFQUE0QyxvQkFBb0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ2hMLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNqRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUN2RixPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMvRixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNyRixPQUFPLEVBQUUsY0FBYyxFQUFFLFdBQVcsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxxQkFBcUIsRUFB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