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
import { IQuickInputHideEvent, IQuickInputService, IQuickPickDidAcceptEvent, IQuickPickItem, QuickInputHideReason } from '../../../../platform/quickinput/common/quickInput.js';
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
import type { AuthenticationProvider, AuthenticationSession } from 'vscode';
import { IBrowserWorkbenchEnvironmentService } from '../../../services/environment/browser/environmentService.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { AuthenticationAccessService, IAuthenticationAccessService } from '../../../services/authentication/browser/authenticationAccessService.js';
import { IAccountUsage, IAuthenticationUsageService } from '../../../services/authentication/browser/authenticationUsageService.js';
import { AuthenticationExtensionsService } from '../../../services/authentication/browser/authenticationExtensionsService.js';
import { ILogService, NullLogService } from '../../../../platform/log/common/log.js';
import { IExtHostInitDataService } from '../../common/extHostInitDataService.js';
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
	private accept: ((e: IQuickPickDidAcceptEvent) => any) | undefined;
	private hide: ((e: IQuickInputHideEvent) => any) | undefined;
	public items = [];
	public get selectedItems(): IQuickPickItem[] {
		return this.items;
	}

	onDidAccept(listener: (e: IQuickPickDidAcceptEvent) => any) {
		this.accept = listener;
	}
	onDidHide(listener: (e: IQuickInputHideEvent) => any) {
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
	override createQuickPick() {
		// eslint-disable-next-line local/code-no-any-casts
		return <any>new AuthQuickPick();
	}
}

class TestAuthUsageService implements IAuthenticationUsageService {
	_serviceBrand: undefined;
	initializeExtensionUsageCache(): Promise<void> { return Promise.resolve(); }
	extensionUsesAuth(extensionId: string): Promise<boolean> { return Promise.resolve(false); }
	readAccountUsages(providerId: string, accountName: string): IAccountUsage[] { return []; }
	removeAccountUsage(providerId: string, accountName: string): void { }
	addAccountUsage(providerId: string, accountName: string, scopes: ReadonlyArray<string>, extensionId: string, extensionName: string): void { }
}

class TestAuthProvider implements AuthenticationProvider {
	private id = 1;
	private sessions = new Map<string, AuthenticationSession>();
	onDidChangeSessions = () => { return { dispose() { } }; };
	constructor(private readonly authProviderName: string) { }
	async getSessions(scopes?: readonly string[]): Promise<AuthenticationSession[]> {
		if (!scopes) {
			return [...this.sessions.values()];
		}

		if (scopes[0] === 'return multiple') {
			return [...this.sessions.values()];
		}
		const sessions = this.sessions.get(scopes.join(' '));
		return sessions ? [sessions] : [];
	}
	async createSession(scopes: readonly string[]): Promise<AuthenticationSession> {
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
	async removeSession(sessionId: string): Promise<void> {
		this.sessions.delete(sessionId);
	}

}

suite('ExtHostAuthentication', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let extHostAuthentication: ExtHostAuthentication;
	let mainInstantiationService: TestInstantiationService;

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
		mainInstantiationService.stub(IOpenerService, {} as Partial<IOpenerService>);
		mainInstantiationService.stub(ITelemetryService, NullTelemetryService);
		mainInstantiationService.stub(IBrowserWorkbenchEnvironmentService, TestEnvironmentService);
		mainInstantiationService.stub(IProductService, TestProductService);

		const rpcProtocol = disposables.add(new TestRPCProtocol());

		rpcProtocol.set(MainContext.MainThreadAuthentication, disposables.add(mainInstantiationService.createInstance(MainThreadAuthentication, rpcProtocol)));
		rpcProtocol.set(MainContext.MainThreadWindow, disposables.add(mainInstantiationService.createInstance(MainThreadWindow, rpcProtocol)));
		// eslint-disable-next-line local/code-no-any-casts
		const initData: IExtHostInitDataService = {
			environment: {
				appUriScheme: 'test',
				appName: 'Test'
			}
		} as any;
		extHostAuthentication = new ExtHostAuthentication(
			rpcProtocol,
			// eslint-disable-next-line local/code-no-any-casts
			{
				environment: {
					appUriScheme: 'test',
					appName: 'Test'
				}
			} as any,
			new ExtHostWindow(initData, rpcProtocol),
			new ExtHostUrls(rpcProtocol),
			new ExtHostProgress(rpcProtocol),
			disposables.add(new TestLoggerService()),
			new NullLogService()
		);
		rpcProtocol.set(ExtHostContext.ExtHostAuthentication, extHostAuthentication);
		disposables.add(extHostAuthentication.registerAuthenticationProvider('test', 'test provider', new TestAuthProvider('test')));
		disposables.add(extHostAuthentication.registerAuthenticationProvider(
			'test-multiple',
			'test multiple provider',
			new TestAuthProvider('test-multiple'),
			{ supportsMultipleAccounts: true }));
	});

	test('createIfNone - true', async () => {
		const scopes = ['foo'];
		const session = await extHostAuthentication.getSession(
			extensionDescription,
			'test',
			scopes,
			{
				createIfNone: true
			});
		assert.strictEqual(session?.id, '1');
		assert.strictEqual(session?.scopes[0], 'foo');
	});

	test('createIfNone - false', async () => {
		const scopes = ['foo'];
		const nosession = await extHostAuthentication.getSession(
			extensionDescription,
			'test',
			scopes,
			{});
		assert.strictEqual(nosession, undefined);

		// Now create the session
		const session = await extHostAuthentication.getSession(
			extensionDescription,
			'test',
			scopes,
			{
				createIfNone: true
			});

		assert.strictEqual(session?.id, '1');
		assert.strictEqual(session?.scopes[0], 'foo');

		const session2 = await extHostAuthentication.getSession(
			extensionDescription,
			'test',
			scopes,
			{});

		assert.strictEqual(session2?.id, session.id);
		assert.strictEqual(session2?.scopes[0], session.scopes[0]);
		assert.strictEqual(session2?.accessToken, session.accessToken);
	});

	// should behave the same as createIfNone: false
	test('silent - true', async () => {
		const scopes = ['foo'];
		const nosession = await extHostAuthentication.getSession(
			extensionDescription,
			'test',
			scopes,
			{
				silent: true
			});
		assert.strictEqual(nosession, undefined);

		// Now create the session
		const session = await extHostAuthentication.getSession(
			extensionDescription,
			'test',
			scopes,
			{
				createIfNone: true
			});

		assert.strictEqual(session?.id, '1');
		assert.strictEqual(session?.scopes[0], 'foo');

		const session2 = await extHostAuthentication.getSession(
			extensionDescription,
			'test',
			scopes,
			{
				silent: true
			});

		assert.strictEqual(session.id, session2?.id);
		assert.strictEqual(session.scopes[0], session2?.scopes[0]);
	});

	test('forceNewSession - true - existing session', async () => {
		const scopes = ['foo'];
		const session1 = await extHostAuthentication.getSession(
			extensionDescription,
			'test',
			scopes,
			{
				createIfNone: true
			});

		// Now create the session
		const session2 = await extHostAuthentication.getSession(
			extensionDescription,
			'test',
			scopes,
			{
				forceNewSession: true
			});

		assert.strictEqual(session2?.id, '2');
		assert.strictEqual(session2?.scopes[0], 'foo');
		assert.notStrictEqual(session1.accessToken, session2?.accessToken);
	});

	// Should behave like createIfNone: true
	test('forceNewSession - true - no existing session', async () => {
		const scopes = ['foo'];
		const session = await extHostAuthentication.getSession(
			extensionDescription,
			'test',
			scopes,
			{
				forceNewSession: true
			});
		assert.strictEqual(session?.id, '1');
		assert.strictEqual(session?.scopes[0], 'foo');
	});

	test('forceNewSession - detail', async () => {
		const scopes = ['foo'];
		const session1 = await extHostAuthentication.getSession(
			extensionDescription,
			'test',
			scopes,
			{
				createIfNone: true
			});

		// Now create the session
		const session2 = await extHostAuthentication.getSession(
			extensionDescription,
			'test',
			scopes,
			{
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
		const session = await extHostAuthentication.getSession(
			extensionDescription,
			'test-multiple',
			scopes,
			{
				createIfNone: true
			});

		assert.strictEqual(session?.id, '1');
		assert.strictEqual(session?.scopes[0], scopes[0]);

		const scopes2 = ['bar'];
		const session2 = await extHostAuthentication.getSession(
			extensionDescription,
			'test-multiple',
			scopes2,
			{
				createIfNone: true
			});
		assert.strictEqual(session2?.id, '2');
		assert.strictEqual(session2?.scopes[0], scopes2[0]);

		const session3 = await extHostAuthentication.getSession(
			extensionDescription,
			'test-multiple',
			['return multiple'],
			{
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
		const session = await extHostAuthentication.getSession(
			extensionDescription,
			'test-multiple',
			scopes,
			{
				createIfNone: true
			});

		assert.strictEqual(session?.id, '1');
		assert.strictEqual(session?.scopes[0], scopes[0]);

		const scopes2 = ['bar'];
		const session2 = await extHostAuthentication.getSession(
			extensionDescription,
			'test-multiple',
			scopes2,
			{
				createIfNone: true
			});
		assert.strictEqual(session2?.id, '2');
		assert.strictEqual(session2?.scopes[0], scopes2[0]);

		const shouldBeSession1 = await extHostAuthentication.getSession(
			extensionDescription,
			'test-multiple',
			scopes,
			{});
		assert.strictEqual(shouldBeSession1?.id, session.id);
		assert.strictEqual(shouldBeSession1?.scopes[0], session.scopes[0]);
		assert.strictEqual(shouldBeSession1?.accessToken, session.accessToken);

		const shouldBeSession2 = await extHostAuthentication.getSession(
			extensionDescription,
			'test-multiple',
			scopes2,
			{});
		assert.strictEqual(shouldBeSession2?.id, session2.id);
		assert.strictEqual(shouldBeSession2?.scopes[0], session2.scopes[0]);
		assert.strictEqual(shouldBeSession2?.accessToken, session2.accessToken);
	});

	//#endregion

	//#region error cases

	test('createIfNone and forceNewSession', async () => {
		try {
			await extHostAuthentication.getSession(
				extensionDescription,
				'test',
				['foo'],
				{
					createIfNone: true,
					forceNewSession: true
				});
			assert.fail('should have thrown an Error.');
		} catch (e) {
			assert.ok(e);
		}
	});

	test('forceNewSession and silent', async () => {
		try {
			await extHostAuthentication.getSession(
				extensionDescription,
				'test',
				['foo'],
				{
					forceNewSession: true,
					silent: true
				});
			assert.fail('should have thrown an Error.');
		} catch (e) {
			assert.ok(e);
		}
	});

	test('createIfNone and silent', async () => {
		try {
			await extHostAuthentication.getSession(
				extensionDescription,
				'test',
				['foo'],
				{
					createIfNone: true,
					silent: true
				});
			assert.fail('should have thrown an Error.');
		} catch (e) {
			assert.ok(e);
		}
	});

	test('Can get multiple sessions (with different scopes) in one extension', async () => {
		let session: AuthenticationSession | undefined = await extHostAuthentication.getSession(
			extensionDescription,
			'test-multiple',
			['foo'],
			{
				createIfNone: true
			});
		session = await extHostAuthentication.getSession(
			extensionDescription,
			'test-multiple',
			['bar'],
			{
				createIfNone: true
			});
		assert.strictEqual(session?.id, '2');
		assert.strictEqual(session?.scopes[0], 'bar');

		session = await extHostAuthentication.getSession(
			extensionDescription,
			'test-multiple',
			['foo'],
			{
				createIfNone: false
			});
		assert.strictEqual(session?.id, '1');
		assert.strictEqual(session?.scopes[0], 'foo');
	});

	test('Can get multiple sessions (from different providers) in one extension', async () => {
		let session: AuthenticationSession | undefined = await extHostAuthentication.getSession(
			extensionDescription,
			'test-multiple',
			['foo'],
			{
				createIfNone: true
			});
		session = await extHostAuthentication.getSession(
			extensionDescription,
			'test',
			['foo'],
			{
				createIfNone: true
			});
		assert.strictEqual(session?.id, '1');
		assert.strictEqual(session?.scopes[0], 'foo');
		assert.strictEqual(session?.account.label, 'test');

		const session2 = await extHostAuthentication.getSession(
			extensionDescription,
			'test-multiple',
			['foo'],
			{
				createIfNone: false
			});
		assert.strictEqual(session2?.id, '1');
		assert.strictEqual(session2?.scopes[0], 'foo');
		assert.strictEqual(session2?.account.label, 'test-multiple');
	});

	test('Can get multiple sessions (from different providers) in one extension at the same time', async () => {
		const sessionP: Promise<AuthenticationSession | undefined> = extHostAuthentication.getSession(
			extensionDescription,
			'test',
			['foo'],
			{
				createIfNone: true
			});
		const session2P: Promise<AuthenticationSession | undefined> = extHostAuthentication.getSession(
			extensionDescription,
			'test-multiple',
			['foo'],
			{
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
		const operationOrder: string[] = [];

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
		const operationPairs: Array<{ start: number; end: number; operation: string }> = [];

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

				assert.ok(op1EndsBeforeOp2Starts || op2EndsBeforeOp1Starts,
					`Operations ${op1.operation} and ${op2.operation} should not overlap. ` +
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
		} catch (error) {
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

	test('session operations during provider lifecycle changes', async () => {
		const provider = new TestAuthProvider('lifecycle-test');
		const disposable = extHostAuthentication.registerAuthenticationProvider('lifecycle-test', 'Lifecycle Test', provider);

		// Start a session creation
		const sessionPromise = extHostAuthentication.getSession(extensionDescription, 'lifecycle-test', ['scope'], { createIfNone: true });

		// Don't dispose immediately - let the session creation start
		await new Promise(resolve => setTimeout(resolve, 5));

		// Dispose the provider while the session creation is likely still in progress
		disposable.dispose();

		// The session creation should complete successfully even if we dispose during the operation
		const session = await sessionPromise;
		assert.ok(session);
		assert.strictEqual(session.account.label, 'lifecycle-test');
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
