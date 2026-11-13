/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, raceTimeout, Sequencer } from '../../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Lazy } from '../../../../../../base/common/lazy.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IDefaultAccount } from '../../../../../../base/common/defaultAccount.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { AuthenticateParams } from '../../../../../../platform/agentHost/common/agent.js';
import { copilotEntraClientId, copilotEntraDiscoveryResource, copilotEntraM365Audience, copilotEntraEmuAudience, copilotEntraResources } from '../../../../../../platform/agentHost/common/copilotEntraAuthentication.js';
import { ProtectedResourceMetadata } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { AuthRequiredReason, INotification, NotificationType } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { ROOT_STATE_URI, RootState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { AgentHostCopilotM365EnabledSettingId } from '../../../../../../platform/chat/common/chatSettings.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { IProgressOptions, IProgressService } from '../../../../../../platform/progress/common/progress.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../../platform/quickinput/common/quickInput.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from '../../../../../../platform/workspace/common/workspaceTrust.js';
import { IActivityService } from '../../../../../services/activity/common/activity.js';
import { AuthenticationSession, IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';
import { ChatEntitlement, ChatEntitlementContext, ChatEntitlementRequests } from '../../../../../services/chat/common/chatEntitlementService.js';
import { ILifecycleService } from '../../../../../services/lifecycle/common/lifecycle.js';
import { TestStorageService } from '../../../../../test/common/workbenchTestServices.js';
import { IExtensionsWorkbenchService } from '../../../../extensions/common/extensions.js';
import { gitHubEnterpriseUrisSetting } from '../../../../../services/accounts/common/githubEnterprise.js';
import { ChatSetupController } from '../../../browser/chatSetup/chatSetupController.js';
import { ChatSetupStep, ChatSetupStrategy } from '../../../browser/chatSetup/chatSetup.js';
import { ChatSetup } from '../../../browser/chatSetup/chatSetupRunner.js';

suite('Microsoft Copilot resource setup UI', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const discovery: ProtectedResourceMetadata = {
		resource: copilotEntraDiscoveryResource, authorization_servers: ['https://login.microsoftonline.com/organizations'],
		scopes_supported: ['User.Read'], required: false,
	};
	const services: readonly ProtectedResourceMetadata[] = [
		{ resource: copilotEntraResources.get(copilotEntraEmuAudience)!, resource_name: 'GitHub Copilot', authorization_servers: discovery.authorization_servers, scopes_supported: [`${copilotEntraEmuAudience}/user_impersonation`], required: false },
		{ resource: copilotEntraResources.get(copilotEntraM365Audience)!, resource_name: 'Microsoft 365 Copilot', authorization_servers: discovery.authorization_servers, scopes_supported: [`${copilotEntraM365Audience}/.default`], required: false },
	];
	const unrelated: ProtectedResourceMetadata = { resource: 'https://other.example', scopes_supported: ['unrelated'] };
	/** A credential the host asks for, which unlike a service it offers carries no name. */
	const requirement: ProtectedResourceMetadata = { resource: services[0].resource, authorization_servers: services[0].authorization_servers, scopes_supported: services[0].scopes_supported, required: false };

	function fixture() {
		const changed = store.add(new Emitter<RootState>());
		const exited = store.add(new Emitter<number>());
		const notifications = store.add(new Emitter<INotification>());
		const available = observableValue('connectionAvailable', true);
		let root: RootState | Error = { agents: [] };
		const calls: string[] = [];
		const deliveries: AuthenticateParams[] = [];
		const account = { id: 'opaque-account', label: 'Microsoft Account' };
		const state = {
			offered: services, pick: undefined as number | undefined, sessions: [] as AuthenticationSession[],
			credentialAccount: account, credentialScopes: undefined as readonly string[] | undefined,
			silentCredential: true, needsServiceConsent: false, rejectResource: undefined as string | undefined,
			signIn: undefined as Promise<void> | undefined, publication: undefined as Promise<void> | undefined,
			activation: undefined as Promise<void> | undefined, retry: false,
			discovery: undefined as DeferredPromise<void> | undefined,
			challenge: undefined as ProtectedResourceMetadata | undefined, challengeBeforePublication: false, challengeSatisfiedElsewhere: false,
			leftover: undefined as ProtectedResourceMetadata | undefined,
			refused: undefined as ProtectedResourceMetadata | undefined,
			consentError: undefined as Error | undefined, finishDiscoveryOnCredential: false, progress: false,
			cancelProgress: undefined as (() => void) | undefined,
			picks: [] as (readonly IQuickPickItem[])[],
		};
		const publish = (resources: readonly ProtectedResourceMetadata[]) => {
			root = { agents: [{ provider: 'different-advertised-copilot-id', displayName: 'Agent', description: '', models: [], protectedResources: [...resources] }] };
			changed.fire(root);
		};
		publish([unrelated, discovery]);
		const subscription = { get value() { return root; }, get verifiedValue() { return root instanceof Error ? undefined : root; }, onDidChange: changed.event, onDidError: Event.None, onWillApplyAction: Event.None, onDidApplyAction: Event.None };
		const signInStarted = new DeferredPromise<void>();
		const discoveryDelivered = new DeferredPromise<void>();
		const activationStarted = new DeferredPromise<void>();
		const retryShown = new DeferredPromise<void>();
		const challengeAnswered = new DeferredPromise<void>();
		const consentFailed = new DeferredPromise<void>();
		const isRefused = (scopes: readonly string[]) => !!state.refused?.scopes_supported?.every(scope => scopes.includes(scope));
		const host = upcastPartial<IAgentHostService>({
			connectionAvailable: available, rootState: subscription, onAgentHostExit: exited.event, onDidNotification: notifications.event,
			startAgentHost() { },
			authenticate: async request => {
				deliveries.push(request);
				if (!request.token) {
					publish([unrelated, discovery]);
					return { authenticated: true };
				}
				if (state.rejectResource === request.resource) {
					return { authenticated: false };
				}
				if (request.resource === discovery.resource) {
					const pending = state.discovery;
					if (state.challenge) {
						const challenge: INotification = { type: NotificationType.AuthRequired, channel: ROOT_STATE_URI, resource: state.challenge, reason: AuthRequiredReason.Required };
						if (state.challengeBeforePublication) {
							notifications.fire(challenge);
						}
						publish([discovery, state.challenge]);
						if (!state.challengeBeforePublication) {
							notifications.fire(challenge);
						}
						if (state.challengeSatisfiedElsewhere) {
							publish([discovery]);
						}
					}
					void discoveryDelivered.complete();
					await pending?.p;
					// Like the real host, keep advertising a requirement that was never given a credential.
					const challenged = state.challenge;
					const outstanding = [
						...(state.leftover ? [state.leftover] : []),
						...(challenged && !state.challengeSatisfiedElsewhere && !state.offered.some(offered => offered.resource === challenged.resource)
							&& !deliveries.some(delivery => delivery.resource === challenged.resource) ? [challenged] : []),
					];
					if (state.publication) {
						publish([discovery, ...outstanding]);
						void state.publication.then(() => publish([discovery, ...outstanding, ...state.offered]));
					} else {
						publish([discovery, ...outstanding, ...state.offered]);
					}
				} else {
					if (request.resource === state.challenge?.resource) {
						void challengeAnswered.complete();
						if (state.finishDiscoveryOnCredential) {
							void state.discovery?.complete();
						}
					}
					void activationStarted.complete();
					await state.activation;
				}
				return { authenticated: true };
			},
		});
		const configuration = new TestConfigurationService({ [AgentHostCopilotM365EnabledSettingId]: true });
		const context = store.add(new ChatEntitlementContext(store.add(new MockContextKeyService()), store.add(new TestStorageService()), new NullLogService(), configuration, NullTelemetryService));
		const instantiation = store.add(new TestInstantiationService());
		instantiation.stub(IAgentHostService, host);
		instantiation.stub(IConfigurationService, configuration);
		instantiation.stub(ITelemetryService, NullTelemetryService);
		instantiation.stub(ILogService, new NullLogService());
		instantiation.stub(IProductService, { quality: 'stable' });
		instantiation.stub(IActivityService, { showViewContainerActivity: () => Disposable.None });
		instantiation.stub(IProgressService, {
			withProgress: async (options: IProgressOptions & { readonly command?: string }, task, onDidCancel) => {
				state.progress = true;
				state.cancelProgress = options.cancellable && !options.command ? onDidCancel : undefined;
				try {
					return await task({ report() { } });
				} finally {
					state.progress = false;
					state.cancelProgress = undefined;
				}
			}
		});
		instantiation.stub(IExtensionsWorkbenchService, { local: [], install: async () => { calls.push('install'); return undefined!; } });
		instantiation.stub(ILifecycleService, { willShutdown: false });
		instantiation.stub(IDefaultAccountService, { getDefaultAccountAuthenticationProvider: () => ({ id: 'github', name: 'GitHub', enterprise: false }) });
		instantiation.stub(IWorkspaceTrustManagementService, { isWorkspaceTrusted: () => true });
		instantiation.stub(IWorkspaceTrustRequestService, { requestWorkspaceTrust: async () => true });
		instantiation.stub(IDialogService, {
			confirm: async () => {
				calls.push('retry');
				void retryShown.complete();
				const confirmed = state.retry;
				state.retry = false;
				state.rejectResource = undefined;
				return { confirmed };
			}
		});
		instantiation.stub(IQuickInputService, {
			pick: async items => {
				const choices = (await items).filter((item): item is typeof item & IQuickPickItem => item.type !== 'separator');
				state.picks.push(choices);
				return state.pick === undefined ? undefined : choices[state.pick];
			}
		});
		const credential = (scopes: readonly string[]): AuthenticationSession => ({ id: 'microsoft-session', account: state.credentialAccount, scopes: state.credentialScopes ?? scopes, accessToken: 'synthetic', expiresAfter: 120000 });
		instantiation.stub(IAuthenticationService, {
			getSessions: async (provider, scopes, options) => {
				assert.strictEqual(provider, 'microsoft');
				if (!scopes) {
					return state.sessions;
				}
				assert.deepStrictEqual([options?.clientId, options?.authorizationServer?.toString(), options?.account?.id], [copilotEntraClientId, discovery.authorization_servers![0], account.id]);
				assert.ok(Array.isArray(scopes));
				const granted = state.sessions.some(session => scopes.every(scope => session.scopes.includes(scope)));
				return state.silentCredential && !isRefused(scopes) && (!state.needsServiceConsent || scopes.includes('User.Read') || granted) ? [credential(scopes)] : [];
			},
			createSession: async (_provider, scopes, options) => {
				calls.push('signIn');
				assert.deepStrictEqual([options?.clientId, options?.authorizationServer?.toString()], [copilotEntraClientId, discovery.authorization_servers![0]]);
				void signInStarted.complete();
				await state.signIn;
				assert.ok(Array.isArray(scopes));
				if (state.consentError && (!state.refused || isRefused(scopes))) {
					void consentFailed.complete();
					throw state.consentError;
				}
				const session = credential(scopes);
				state.sessions = [session];
				return session;
			},
		});
		const requests = upcastPartial<ChatEntitlementRequests>({ signIn: async () => { calls.push('legacy'); return {}; } });
		const controller = store.add(instantiation.createInstance(ChatSetupController, context, requests));
		const runner = instantiation.createInstance(ChatSetup, context, new Lazy(() => controller));
		const run = (cancellationToken?: CancellationTokenSource['token']) => runner.run({ setupStrategy: ChatSetupStrategy.SetupWithMicrosoftProvider, disableChatViewReveal: true, cancellationToken });
		return {
			host, publish, available, state, calls, deliveries, context, configuration, controller, requests, instantiation, run, account, credential, signInStarted, discoveryDelivered, activationStarted, notifications, retryShown, challengeAnswered, consentFailed,
			disconnect: () => { available.set(false, undefined); exited.fire(0); }
		};
	}

	for (const beforePublication of [false, true]) {
		test(`answers nested consent while discovery is still pending${beforePublication ? ' when the challenge precedes its resource' : ''}`, async () => {
			const f = fixture();
			const discovery = new DeferredPromise<void>();
			f.state.discovery = discovery;
			f.state.sessions = [f.credential(['User.Read'])];
			f.state.offered = [services[0]];
			f.state.challenge = services[0];
			f.state.challengeBeforePublication = beforePublication;
			f.state.needsServiceConsent = true;
			f.state.finishDiscoveryOnCredential = true;
			const cancellation = store.add(new CancellationTokenSource());
			const pending = f.run(cancellation.token);
			try {
				const result = await raceTimeout(pending, 500);
				assert.deepStrictEqual({ success: result?.success, answered: f.challengeAnswered.isResolved, calls: f.calls, resources: f.deliveries.map(request => request.resource), scopes: f.state.sessions.map(session => session.scopes) }, {
					success: true, answered: true, calls: ['signIn', 'install'], resources: [copilotEntraDiscoveryResource, services[0].resource, services[0].resource], scopes: [services[0].scopes_supported],
				});
			} finally {
				cancellation.cancel();
				await discovery.complete();
				await pending;
			}
		});
	}

	test('a requirement satisfied elsewhere before its prompt starts does not fail choosing that service', async () => {
		const f = fixture();
		const pendingDiscovery = new DeferredPromise<void>();
		f.state.discovery = pendingDiscovery;
		f.state.sessions = [f.credential(['User.Read'])];
		f.state.offered = [services[0]];
		f.state.challenge = services[0];
		f.state.challengeSatisfiedElsewhere = true;
		const cancellation = store.add(new CancellationTokenSource());
		const pending = f.run(cancellation.token);
		try {
			await f.discoveryDelivered.p;
			const returnedBeforeHostResult = await raceTimeout(pending, 50) !== undefined;
			await pendingDiscovery.complete();
			const result = await raceTimeout(pending, 500);
			assert.deepStrictEqual({ returnedBeforeHostResult, success: result?.success, calls: f.calls, delivered: f.deliveries.map(request => request.resource) }, {
				returnedBeforeHostResult: false, success: true, calls: ['install'], delivered: [discovery.resource, services[0].resource],
			});
		} finally {
			cancellation.cancel();
			await pendingDiscovery.complete();
			await pending;
		}
	});

	test('a queued requirement satisfied elsewhere does not fail the service already chosen', async () => {
		const f = fixture();
		const pendingDiscovery = new DeferredPromise<void>();
		const prompt = new DeferredPromise<void>();
		f.state.discovery = pendingDiscovery;
		f.state.sessions = [f.credential(['User.Read'])];
		f.state.offered = [services[1]];
		f.state.challenge = requirement;
		f.state.refused = services[0];
		f.state.consentError = new CancellationError();
		f.state.signIn = prompt.p;
		const cancellation = store.add(new CancellationTokenSource());
		const pending = f.run(cancellation.token);
		try {
			await raceTimeout(f.signInStarted.p, 500);
			const requirement: ProtectedResourceMetadata = { resource: services[1].resource, authorization_servers: services[1].authorization_servers, scopes_supported: services[1].scopes_supported, required: false };
			f.publish([discovery, services[0], requirement]);
			f.notifications.fire({ type: NotificationType.AuthRequired, channel: ROOT_STATE_URI, resource: requirement, reason: AuthRequiredReason.Required });
			await pendingDiscovery.complete();
			const returnedBehindOpenPrompt = await raceTimeout(pending, 50) !== undefined;
			await prompt.complete();
			const result = await raceTimeout(pending, 500);
			assert.deepStrictEqual({ returnedBehindOpenPrompt, success: result?.success, calls: f.calls, delivered: f.deliveries.map(request => request.resource) }, {
				returnedBehindOpenPrompt: false, success: true, calls: ['signIn', 'install'], delivered: [discovery.resource, services[1].resource],
			});
		} finally {
			cancellation.cancel();
			await prompt.complete();
			await pendingDiscovery.complete();
			await pending;
		}
	});

	for (const [kind, consentError] of [['refused', new Error('access_denied')], ['declined', new CancellationError()]] as const) {
		test(`a ${kind} permission for one service does not fail setup when the host offers another`, async () => {
			const f = fixture();
			const pendingDiscovery = new DeferredPromise<void>();
			f.state.discovery = pendingDiscovery;
			f.state.sessions = [f.credential(['User.Read'])];
			f.state.offered = [services[1]];
			f.state.challenge = requirement;
			f.state.refused = services[0];
			f.state.consentError = consentError;
			const cancellation = store.add(new CancellationTokenSource());
			const pending = f.run(cancellation.token);
			try {
				await raceTimeout(f.consentFailed.p, 500);
				f.notifications.fire({ type: NotificationType.AuthRequired, channel: ROOT_STATE_URI, resource: requirement, reason: AuthRequiredReason.Required });
				const beforeHostResult = { returned: await raceTimeout(pending, 50) !== undefined, failureShown: f.retryShown.isSettled };
				await pendingDiscovery.complete();
				const result = await raceTimeout(pending, 500);
				assert.deepStrictEqual({ beforeHostResult, success: result?.success, choices: f.state.picks.length, calls: f.calls, delivered: f.deliveries.map(request => request.resource) }, {
					beforeHostResult: { returned: false, failureShown: false }, success: true, choices: 0, calls: ['signIn', 'install'], delivered: [discovery.resource, services[1].resource],
				});
			} finally {
				cancellation.cancel();
				await pendingDiscovery.complete();
				await pending;
			}
		});
	}

	test('a requirement left advertised by an earlier attempt is not offered as a service', async () => {
		const f = fixture();
		f.state.sessions = [f.credential(['User.Read'])];
		f.state.offered = [services[1]];
		f.state.leftover = requirement;
		f.publish([discovery, requirement, services[1]]);
		const result = await raceTimeout(f.run(), 500);
		assert.deepStrictEqual({ success: result?.success, choices: f.state.picks.length, delivered: f.deliveries.map(request => request.resource) }, {
			success: true, choices: 0, delivered: [discovery.resource, services[1].resource],
		});
	});

	test('a requirement the host is still asking for is not mistaken for a published service', async () => {
		const f = fixture();
		const publication = new DeferredPromise<void>();
		f.state.publication = publication.p;
		f.state.sessions = [f.credential(['User.Read'])];
		f.state.offered = [services[1]];
		f.state.challenge = requirement;
		f.state.refused = services[0];
		f.state.consentError = new Error('access_denied');
		const pending = f.run();
		await raceTimeout(f.consentFailed.p, 500);
		const beforePublication = { returned: await raceTimeout(pending, 50) !== undefined, failureShown: f.retryShown.isSettled, choices: f.state.picks.length };
		await publication.complete();
		const result = await raceTimeout(pending, 500);
		assert.deepStrictEqual({ beforePublication, success: result?.success, choices: f.state.picks.length, delivered: f.deliveries.map(request => request.resource) }, {
			beforePublication: { returned: false, failureShown: false, choices: 0 }, success: true, choices: 0, delivered: [discovery.resource, services[1].resource],
		});
	});

	test('a declined permission leaves the outcome to the host, and Cancel after its failure retains sign-in', async () => {
		const f = fixture();
		const pendingDiscovery = new DeferredPromise<void>();
		f.state.discovery = pendingDiscovery;
		f.state.sessions = [f.credential(['User.Read'])];
		f.state.challenge = services[0];
		f.state.refused = services[0];
		f.state.consentError = new CancellationError();
		const cancellation = store.add(new CancellationTokenSource());
		const pending = f.run(cancellation.token);
		try {
			await raceTimeout(f.consentFailed.p, 500);
			const failureShownBeforeHostResult = await raceTimeout(pending, 50) !== undefined || f.retryShown.isSettled;
			await pendingDiscovery.error(new Error('No usable service'));
			const result = await raceTimeout(pending, 500);
			assert.deepStrictEqual({
				failureShownBeforeHostResult, success: result?.success, handled: result?.errorAlreadyHandled,
				calls: f.calls, revoked: f.deliveries.filter(request => !request.token).map(request => request.resource),
				signedIn: f.state.sessions.length,
			}, {
				failureShownBeforeHostResult: false, success: false, handled: true, calls: ['signIn', 'retry'],
				revoked: [discovery.resource], signedIn: 1,
			});
		} finally {
			cancellation.cancel();
			await pendingDiscovery.complete();
			await pending;
		}
	});

	test('a provider sign-in failure does not revoke a binding setup never started', async () => {
		const f = fixture();
		f.state.consentError = new Error('Provider sign-in failed');
		const result = await f.run();
		assert.deepStrictEqual({ success: result.success, calls: f.calls, deliveries: f.deliveries }, {
			success: false, calls: ['signIn', 'retry'], deliveries: [],
		});
	});

	test('a repeated answered challenge fails without prompting again', async () => {
		const f = fixture();
		const pendingDiscovery = new DeferredPromise<void>();
		f.state.discovery = pendingDiscovery;
		f.state.sessions = [f.credential(['User.Read'])];
		f.state.challenge = services[0];
		f.state.needsServiceConsent = true;
		const cancellation = store.add(new CancellationTokenSource());
		const pending = f.run(cancellation.token);
		try {
			await raceTimeout(f.challengeAnswered.p, 500);
			f.notifications.fire({ type: NotificationType.AuthRequired, channel: ROOT_STATE_URI, resource: services[0], reason: AuthRequiredReason.Required });
			const result = await raceTimeout(pending, 500);
			assert.deepStrictEqual({ answered: f.challengeAnswered.isResolved, success: result?.success, calls: f.calls, revoked: f.deliveries.filter(request => !request.token).length }, {
				answered: true, success: false, calls: ['signIn', 'retry'], revoked: 1,
			});
		} finally {
			cancellation.cancel();
			await pendingDiscovery.complete();
			await pending;
		}
	});

	for (const cancelRetry of [false, true]) {
		test(`Retry after an early failure stays in progress behind the old request${cancelRetry ? ' and can be cancelled' : ''}`, async () => {
			const f = fixture();
			const oldDiscovery = new DeferredPromise<void>();
			const newDiscovery = new DeferredPromise<void>();
			const queued = new DeferredPromise<void>();
			const requests: AuthenticateParams[] = [];
			const sequence = new Sequencer();
			const authenticate = f.host.authenticate;
			f.host.authenticate = request => {
				if (request.resource !== discovery.resource || !request.token) {
					return authenticate(request);
				}
				requests.push(request);
				if (requests.length === 2) {
					void queued.complete();
				}
				return sequence.queue(() => authenticate(request));
			};
			f.state.discovery = oldDiscovery;
			f.state.sessions = [f.credential(['User.Read'])];
			f.state.offered = [services[0]];
			f.state.challenge = services[0];
			f.state.needsServiceConsent = true;
			f.state.retry = true;
			const cancellation = store.add(new CancellationTokenSource());
			const pending = f.run(cancellation.token);
			try {
				await raceTimeout(f.challengeAnswered.p, 500);
				f.notifications.fire({ type: NotificationType.AuthRequired, channel: ROOT_STATE_URI, resource: services[0], reason: AuthRequiredReason.Required });
				await raceTimeout(f.retryShown.p, 500);
				f.state.discovery = newDiscovery;
				f.state.finishDiscoveryOnCredential = true;
				await raceTimeout(queued.p, 500);
				const waiting = { queued: queued.isResolved, step: f.controller.step, progress: f.state.progress, oldPending: !oldDiscovery.isSettled };
				if (cancelRetry) {
					f.state.cancelProgress?.();
				} else {
					await oldDiscovery.error(new Error('Old discovery timed out'));
				}
				const result = await raceTimeout(pending, 500);
				assert.deepStrictEqual({
					waiting, returned: result !== undefined, success: result?.success,
					retries: f.calls.filter(call => call === 'retry').length, installed: f.calls.includes('install'),
					revoked: f.deliveries.filter(request => !request.token).length,
				}, {
					waiting: { queued: true, step: ChatSetupStep.SigningIn, progress: true, oldPending: true },
					returned: true, success: cancelRetry ? undefined : true, retries: 1, installed: !cancelRetry, revoked: cancelRetry ? 1 : 0,
				});
			} finally {
				cancellation.cancel();
				await oldDiscovery.complete();
				await newDiscovery.complete();
				await pending;
			}
		});
	}

	for (const lateError of [false, true]) {
		test(`a late discovery ${lateError ? 'error' : 'result'} after Cancel cannot overwrite a newer setup or reopen failure UI`, async () => {
			const f = fixture();
			const oldDiscovery = new DeferredPromise<void>();
			f.state.discovery = oldDiscovery;
			f.state.sessions = [f.credential(['User.Read'])];
			f.state.challenge = services[0];
			f.state.needsServiceConsent = true;
			const cancellation = store.add(new CancellationTokenSource());
			const pending = f.run(cancellation.token);
			try {
				await raceTimeout(f.challengeAnswered.p, 500);
				f.notifications.fire({ type: NotificationType.AuthRequired, channel: ROOT_STATE_URI, resource: services[0], reason: AuthRequiredReason.Required });
				const failed = await raceTimeout(pending, 500);
				f.state.discovery = undefined;
				f.state.challenge = undefined;
				f.state.offered = [services[1]];
				const fresh = await f.run();
				if (lateError) {
					await oldDiscovery.error(new Error('Late native failure'));
				} else {
					await oldDiscovery.complete();
				}
				f.notifications.fire({ type: NotificationType.AuthRequired, channel: ROOT_STATE_URI, resource: services[0], reason: AuthRequiredReason.Required });
				await pending;
				assert.deepStrictEqual({
					failed: failed?.success, fresh: fresh.success, completed: f.context.state.completed, step: f.controller.step,
					retries: f.calls.filter(call => call === 'retry').length, installs: f.calls.filter(call => call === 'install').length,
				}, { failed: false, fresh: true, completed: true, step: ChatSetupStep.Initial, retries: 1, installs: 1 });
			} finally {
				cancellation.cancel();
				await oldDiscovery.complete();
				await pending;
			}
		});
	}

	for (const pick of [0, 1]) {
		test(`ordinary discovery authentication offers two resources and authenticates only choice ${pick}`, async () => {
			const f = fixture();
			f.state.pick = pick;
			const result = await f.run();
			assert.deepStrictEqual({
				success: result.success, completed: f.context.state.completed, calls: f.calls,
				choices: f.state.picks.map(items => items.map(item => item.label)), delivered: f.deliveries,
			}, {
				success: true, completed: true, calls: ['signIn', 'install'], choices: [['GitHub Copilot', 'Microsoft 365 Copilot']],
				delivered: [discovery, services[pick]].map(resource => ({
					resource: resource.resource, scopes: resource.scopes_supported, token: 'synthetic', expiresIn: 120,
					_meta: { 'vscode.authentication.account': { providerId: 'microsoft', accountId: f.account.id, label: f.account.label } },
				})),
			});
		});
	}

	test('waits for resource publication after the accepted discovery response', async () => {
		const f = fixture();
		const publication = new DeferredPromise<void>();
		f.state.publication = publication.p;
		f.state.offered = [services[1]];
		const pending = f.run();
		await f.discoveryDelivered.p;
		const before = { choices: f.state.picks.length, delivered: f.deliveries.length, completed: f.context.state.completed };
		await publication.complete();
		const result = await pending;
		assert.deepStrictEqual({ before, success: result.success, choices: f.state.picks.length, resources: f.deliveries.map(request => request.resource) }, {
			before: { choices: 0, delivered: 1, completed: undefined }, success: true, choices: 0, resources: [discovery.resource, services[1].resource],
		});
	});

	test('chooser cancellation retains sign-in and resume offers both services again', async () => {
		const f = fixture();
		const first = await f.run();
		const canceled = { result: first.success, resources: f.deliveries.map(request => request.resource), completed: f.context.state.completed };
		f.state.pick = 1;
		const second = await f.run();
		assert.deepStrictEqual({ canceled, resumed: second.success, choices: f.state.picks.length, signIns: f.calls.filter(call => call === 'signIn').length }, {
			canceled: { result: undefined, resources: [discovery.resource], completed: undefined }, resumed: true, choices: 2, signIns: 1,
		});
	});

	for (const rejected of [discovery, services[1]]) {
		test(`rejected authentication for ${rejected.resource} cannot complete setup`, async () => {
			const f = fixture();
			f.state.offered = [services[1]];
			f.state.rejectResource = rejected.resource;
			const result = await f.run();
			assert.deepStrictEqual({ success: result.success, handled: result.errorAlreadyHandled, calls: f.calls, completed: f.context.state.completed }, {
				success: false, handled: true, calls: ['signIn', 'retry'], completed: undefined,
			});
		});
	}

	test('retry reuses Microsoft sign-in after a discovery failure', async () => {
		const f = fixture();
		f.state.offered = [services[1]];
		f.state.rejectResource = discovery.resource;
		f.state.retry = true;
		assert.deepStrictEqual({ result: (await f.run()).success, calls: f.calls }, { result: true, calls: ['signIn', 'retry', 'install'] });
	});

	test('concurrent callers share the same handled authentication failure', async () => {
		const f = fixture();
		f.state.rejectResource = discovery.resource;
		const results = await Promise.all([f.run(), f.run()]);
		assert.deepStrictEqual({ sameResult: results[0] === results[1], success: results[0].success, handled: results[0].errorAlreadyHandled, calls: f.calls, delivered: f.deliveries.length }, {
			sameResult: true, success: false, handled: true, calls: ['signIn', 'retry'], delivered: 2,
		});
	});

	test('a cold host is started before waiting for connection availability', async () => {
		const f = fixture();
		f.state.offered = [services[1]];
		f.available.set(false, undefined);
		f.host.startAgentHost = () => {
			f.calls.push('start');
			f.available.set(true, undefined);
		};
		assert.deepStrictEqual({ success: (await f.run()).success, calls: f.calls }, { success: true, calls: ['start', 'signIn', 'install'] });
	});

	test('cancelling native sign-in releases the shared runner and ignores late credentials', async () => {
		const f = fixture();
		const signIn = new DeferredPromise<void>();
		f.state.signIn = signIn.p;
		const cancellation = store.add(new CancellationTokenSource());
		const pending = f.run(cancellation.token);
		await f.signInStarted.p;
		cancellation.cancel();
		const canceled = await raceTimeout(pending, 100);
		await signIn.complete();
		await pending;
		const deliveredBeforeResume = f.deliveries.length;
		f.state.offered = [services[1]];
		assert.deepStrictEqual({ canceled: canceled?.success, returned: canceled !== undefined, deliveredBeforeResume, resumed: (await f.run()).success, signIns: f.calls.filter(call => call === 'signIn').length }, {
			canceled: undefined, returned: true, deliveredBeforeResume: 0, resumed: true, signIns: 1,
		});
	});

	test('cancelled publication wait cannot continue from a later resource update', async () => {
		const f = fixture();
		const publication = new DeferredPromise<void>();
		f.state.publication = publication.p;
		const cancellation = store.add(new CancellationTokenSource());
		const pending = f.run(cancellation.token);
		await f.discoveryDelivered.p;
		cancellation.cancel();
		const result = await pending;
		await publication.complete();
		assert.deepStrictEqual({ result: result.success, choices: f.state.picks.length, resources: f.deliveries.map(request => request.resource), installed: f.calls.includes('install') }, {
			result: undefined, choices: 0, resources: [discovery.resource, discovery.resource], installed: false,
		});
	});

	test('a target withdrawn during consent is not authenticated', async () => {
		const f = fixture();
		f.state.sessions = [f.credential(['User.Read'])];
		f.state.offered = [services[1]];
		const consent = new DeferredPromise<void>();
		f.state.needsServiceConsent = true;
		f.state.signIn = consent.p;
		const pending = f.run();
		await f.signInStarted.p;
		f.publish([discovery]);
		await consent.complete();
		const result = await pending;
		assert.deepStrictEqual({ success: result.success, deliveredTargets: f.deliveries.filter(request => request.resource !== discovery.resource).length, installed: f.calls.includes('install') }, {
			success: false, deliveredTargets: 0, installed: false,
		});
	});

	test('disconnection with a retained resource snapshot cannot install or complete setup', async () => {
		const f = fixture();
		f.state.offered = [services[1]];
		const activation = new DeferredPromise<void>();
		f.state.activation = activation.p;
		const pending = f.run();
		await f.activationStarted.p;
		f.disconnect();
		await activation.complete();
		const result = await pending;
		assert.deepStrictEqual({ success: result.success, installed: f.calls.includes('install'), completed: f.context.state.completed }, {
			success: false, installed: false, completed: undefined,
		});
	});

	test('Microsoft credentials must match the selected identity', async () => {
		const f = fixture();
		f.state.sessions = [f.credential(['User.Read'])];
		f.state.credentialAccount = { ...f.account, id: 'different-account' };
		f.state.silentCredential = false;
		const result = await f.run();
		assert.deepStrictEqual({ success: result.success, calls: f.calls, delivered: f.deliveries }, { success: false, calls: ['signIn', 'retry'], delivered: [] });
	});

	test('an account-only session cannot substitute for Copilot-client consent', async () => {
		const f = fixture();
		f.state.sessions = [f.credential([])];
		f.state.silentCredential = false;
		f.state.credentialScopes = [];
		const result = await f.run();
		assert.deepStrictEqual({ success: result.success, calls: f.calls, delivered: f.deliveries }, { success: false, calls: ['signIn', 'retry'], delivered: [] });
	});

	test('Microsoft setup fails on a host that does not offer it and, like GitHub, is not refused when AI features are off', async () => {
		const outcomes = [];
		for (const condition of ['unsupported', 'hidden', 'admin'] as const) {
			const f = fixture();
			f.state.offered = [services[1]];
			if (condition === 'unsupported') {
				f.publish([]);
			} else {
				await f.configuration.setUserConfiguration(condition === 'hidden' ? 'chat.disableAIFeatures' : 'chat.agent.enabled', condition === 'hidden');
			}
			const result = await f.run();
			outcomes.push({ condition, success: result.success, calls: f.calls, delivered: f.deliveries.length });
		}
		assert.deepStrictEqual(outcomes, [
			{ condition: 'unsupported', success: false, calls: ['retry'], delivered: 0 },
			...['hidden', 'admin'].map(condition => ({ condition, success: true, calls: ['signIn', 'install'], delivered: 2 })),
		]);
	});

	test('GitHub and GHE follow the ordinary sign-in path with the gate on or off', async () => {
		const observed = [];
		for (const enabled of [false, true]) {
			for (const provider of ['github', 'github-enterprise', 'google', 'apple', ...(!enabled ? ['microsoft'] : [])]) {
				const f = fixture();
				await f.configuration.setUserConfiguration(AgentHostCopilotM365EnabledSettingId, enabled);
				await f.configuration.setUserConfiguration(gitHubEnterpriseUrisSetting, ['https://contoso.ghe.com']);
				const account: IDefaultAccount = { sessionId: 'chosen', accountName: 'GitHub', authenticationProvider: { id: 'github', name: 'GitHub', enterprise: false }, enterprise: false };
				f.requests.signIn = async () => { f.calls.push(provider); return { defaultAccount: account, entitlements: { entitlement: ChatEntitlement.Pro } }; };
				const result = await f.controller.setupWithProvider({ useEnterpriseProvider: provider === 'github-enterprise', useSocialProvider: ['github', 'github-enterprise'].includes(provider) ? undefined : provider });
				observed.push({ enabled, provider, result, calls: f.calls, delivered: f.deliveries });
			}
		}
		assert.deepStrictEqual(observed, [false, true].flatMap(enabled => ['github', 'github-enterprise', 'google', 'apple', ...(!enabled ? ['microsoft'] : [])].map(provider => ({
			enabled, provider, result: true, calls: [provider, 'install'], delivered: [],
		}))));
	});
});
