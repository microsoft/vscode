/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { stub, restore } from 'sinon';
import { renderMarkdown } from '../../../../../../base/browser/markdownRenderer.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { isMarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { isWeb } from '../../../../../../base/common/platform.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService, IAgentHostSessionResolution } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentHostEnablementService } from '../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IAgentConnection, IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { withAgentSandboxCertificate, type IAgentSandboxCertificateStatus } from '../../../../../../platform/agentHost/common/meta/agentSandboxCertificate.js';
import { agentSandboxDiagnosticsMetaKey, agentSandboxLocalNetworkRequiredMetaKey } from '../../../../../../platform/agentHost/common/meta/agentSandboxDiagnostics.js';
import { withSessionSandboxPolicy } from '../../../../../../platform/agentHost/common/meta/agentSandboxPolicyMeta.js';
import { withChatSandboxState, withSessionSandboxState } from '../../../../../../platform/agentHost/common/meta/agentSandboxStateMeta.js';
import { SessionConfigKey } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import type { InitializeResult } from '../../../../../../platform/agentHost/common/state/protocol/common/commands.js';
import { createSessionState, SessionState, SessionStatus, StateComponents, type ChatState, type ComponentToState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { Context } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { getSingletonServiceDescriptors } from '../../../../../../platform/instantiation/common/extensions.js';
import { registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { AgentSandboxEnabledValue, AgentSandboxSettingId } from '../../../../../../platform/sandbox/common/settings.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { AgentHostSandboxNotification } from '../../../browser/agentSessions/agentHost/agentHostSandboxNotification.js';
import { InstallTrustedCAAction, ManageTrustedCAAction, RemoveTrustedCAAction, RotateTrustedCAAction } from '../../../browser/actions/chatDeveloperActions.js';
import { IPickOptions, IQuickInputService, IQuickPickItem, QuickPickInput } from '../../../../../../platform/quickinput/common/quickInput.js';
import { IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { ChatInputNotificationSeverity, IChatInputNotification, IChatInputNotificationService } from '../../../browser/widget/input/chatInputNotificationService.js';
import { ChatInputNotificationWidget } from '../../../browser/widget/input/chatInputNotificationWidget.js';

suite('AgentHostSandboxNotification', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const resource = URI.parse('vscode-chat-session://remote-provider/session-a');
	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let resolution: IAgentHostSessionResolution | undefined;
	let dispatched: Parameters<IAgentConnection['dispatch']>[];
	let localHost: IAgentHostService;
	let remoteAuthority: string | undefined;
	let focusedWidget: IChatWidget | undefined;
	let focusedSessionChanged: Emitter<void>;
	let sentimentChanged: Emitter<void>;
	let hiddenAI: boolean;
	let confirmation: Promise<{ confirmed: boolean }> | undefined;
	let confirmations: Parameters<IDialogService['confirm']>[0][];
	let installationErrors: string[];
	let installationInformation: string[];
	const managedSandboxEnforced = observableValue('managedSandboxEnforced', false);
	const managedSandboxAllowsBypass = observableValue('managedSandboxAllowsBypass', false);

	setup(() => {
		managedSandboxEnforced.set(false, undefined);
		managedSandboxAllowsBypass.set(false, undefined);
		focusedWidget = undefined;
		hiddenAI = false;
		confirmation = undefined;
		confirmations = [];
		installationErrors = [];
		installationInformation = [];
		focusedSessionChanged = store.add(new Emitter<void>());
		sentimentChanged = store.add(new Emitter<void>());
		configurationService = new TestConfigurationService();
		instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IDialogService, {
			confirm: async options => {
				confirmations.push(options);
				return confirmation ?? { confirmed: true };
			},
			error: async (message, detail) => { installationErrors.push(`${message}: ${detail}`); },
			info: async message => { installationInformation.push(message); },
		});
		instantiationService.stub(IChatWidgetService, {
			get lastFocusedWidget() { return focusedWidget; },
			onDidChangeFocusedSession: focusedSessionChanged.event,
			onDidChangeWidgetVisibility: Event.None,
		});
		instantiationService.stub(IChatEntitlementService, {
			get sentiment() { return { hidden: hiddenAI }; },
			onDidChangeSentiment: sentimentChanged.event,
		});
		dispatched = [];
		localHost = new class extends mock<IAgentHostService>() {
			override dispatch(...args: Parameters<IAgentConnection['dispatch']>): void {
				dispatched.push(args);
			}
		};
		remoteAuthority = undefined;
		instantiationService.stub(IAgentHostService, localHost);
		instantiationService.stub(IWorkbenchEnvironmentService, { get remoteAuthority() { return remoteAuthority; } });
		resolution = {
			connectionAuthority: 'custom-host',
			backendSession: URI.parse('custom-host://opaque/session'),
			connection: new class extends mock<IAgentConnection>() {
				override dispatch(...args: Parameters<IAgentConnection['dispatch']>): void {
					dispatched.push(args);
				}
				override getSubscriptionUnmanaged(): undefined {
					return undefined;
				}
			},
		};
		instantiationService.stub(IAgentHostConnectionsService, new class extends mock<IAgentHostConnectionsService>() {
			override readonly connections = [];
			override resolveSessionResource(sessionResource: URI): IAgentHostSessionResolution | undefined {
				return sessionResource.toString() === resource.toString() ? resolution : undefined;
			}
		});
		instantiationService.stub(IAgentHostEnablementService, new class extends mock<IAgentHostEnablementService>() {
			override readonly managedSandboxEnforced = managedSandboxEnforced;
			override readonly managedSandboxAllowsBypass = managedSandboxAllowsBypass;
		});
	});
	teardown(() => restore());

	function createNotification(resource: URI, subscription: TestSubscription, service: IChatInputNotificationService): AgentHostSandboxNotification {
		instantiationService.stub(IChatInputNotificationService, service);
		return store.add(instantiationService.createInstance(AgentHostSandboxNotification, resource, subscription));
	}

	class TestSubscription extends Disposable implements IAgentSubscription<SessionState> {
		private readonly _onDidChange = this._register(new Emitter<SessionState>());
		private readonly _onDidError = this._register(new Emitter<Error>());
		readonly onDidChange = this._onDidChange.event;
		readonly onDidError = this._onDidError.event;
		readonly onWillApplyAction = Event.None;
		readonly onDidApplyAction = Event.None;
		value: SessionState | Error | undefined;
		get verifiedValue(): SessionState {
			assert.ok(this.value && !(this.value instanceof Error));
			return this.value;
		}
		setValue(reasons?: readonly string[], managed?: boolean, allowBypass?: boolean, failClosed?: boolean): void {
			this.value = createSessionState({
				resource: 'custom-host://opaque/session',
				provider: 'custom-provider',
				title: 'Session',
				status: SessionStatus.Idle,
				createdAt: '2026-09-25T00:00:00.000Z',
				modifiedAt: '2026-09-25T00:00:00.000Z',
				_meta: withSessionSandboxPolicy({ [agentSandboxDiagnosticsMetaKey]: reasons }, managed === undefined ? undefined : { enabled: managed, allowBypass, failClosed }),
			});
			this._onDidChange.fire(this.value);
		}
		setError(): void {
			this.value = new Error('Disconnected');
			this._onDidError.fire(this.value);
		}
		setCertificate(certificate: IAgentSandboxCertificateStatus | undefined, chat = 'conversation://opaque/certificate?revision%3D3#entry'): void {
			this.value = {
				...this.verifiedValue,
				defaultChat: this.verifiedValue.defaultChat ?? chat,
				_meta: withAgentSandboxCertificate(this.verifiedValue._meta, chat, certificate),
			};
			this._onDidChange.fire(this.value);
		}
		setLocalNetworkRequired(required: boolean, managed = false): void {
			this.value = {
				...this.verifiedValue,
				_meta: withSessionSandboxPolicy({
					...this.verifiedValue._meta,
					[agentSandboxLocalNetworkRequiredMetaKey]: required,
				}, managed ? { enabled: true, allowLocalNetwork: false } : undefined),
			};
			this._onDidChange.fire(this.value);
		}
		setSandboxConfig(value?: string, confirmedEnabled?: boolean, readOnly = false): void {
			this.value = {
				...this.verifiedValue,
				config: {
					schema: { type: 'object', properties: { [SessionConfigKey.SandboxEnabled]: { title: 'Sandboxing', type: 'string', enum: ['on', 'off'], sessionMutable: true, readOnly } } },
					values: value === undefined ? {} : { [SessionConfigKey.SandboxEnabled]: value },
				},
				_meta: withSessionSandboxState(this.verifiedValue._meta, confirmedEnabled === undefined ? undefined : { enabled: confirmedEnabled }),
			};
			this._onDidChange.fire(this.verifiedValue);
		}
	}

	class NotificationService extends mock<IChatInputNotificationService>() {
		readonly notifications = new Map<string, IChatInputNotification>();
		updates = 0;
		override setNotification(notification: IChatInputNotification): void {
			this.updates++;
			this.notifications.set(notification.id, notification);
		}
		override deleteNotification(id: string): void {
			this.notifications.delete(id);
		}
		override dismissNotification(id: string): void {
			this.notifications.get(id)?.onDismiss?.();
			this.notifications.delete(id);
		}
	}

	suite('sandbox certificate', () => {
		const certificate: IAgentSandboxCertificateStatus = {
			scopeId: 'host-runtime', state: 'notInstalled', canInstall: true, requiresRotation: false,
		};
		const id = `agentHost.sandboxCertificate.${resource.toString()}`;
		const inputUri = URI.parse('test-input:/certificate');

		function focus(sessionResource: URI | undefined, uri = inputUri): void {
			focusedWidget = sessionResource ? upcastPartial<IChatWidget>({
				visible: true,
				input: upcastPartial<IChatWidget['input']>({ inputUri: uri }),
				viewModel: upcastPartial<NonNullable<IChatWidget['viewModel']>>({ sessionResource }),
			}) : undefined;
			focusedSessionChanged.fire();
		}

		function enableInstallation(install: (chat: string, scopeId: string) => Promise<void>, supported = true): void {
			assert.ok(resolution);
			resolution = {
				...resolution,
				connection: new class extends mock<IAgentConnection>() {
					override readonly initializeResult = constObservable(upcastPartial<InitializeResult>({ _meta: { 'vscode.sandboxCertificate.install': supported } }));
					override readonly sandboxCertificateInstallationSupported = constObservable(supported);
					override installSandboxCertificate = install;
					override getSubscriptionUnmanaged(): undefined { return undefined; }
				},
			};
		}

		function installCommand(service: NotificationService) {
			const description = service.notifications.get(id)?.description;
			assert.ok(isMarkdownString(description) && typeof description.isTrusted === 'object');
			assert.strictEqual(description.isTrusted.enabledCommands.length, 1);
			const command = CommandsRegistry.getCommand(description.isTrusted.enabledCommands[0]);
			assert.ok(command);
			return command;
		}

		function hasInstallLink(service: NotificationService): boolean {
			const description = service.notifications.get(id)?.description;
			return isMarkdownString(description) && typeof description.isTrusted === 'object' && description.isTrusted.enabledCommands.length === 1;
		}

		function runDeveloperCommand(service: NotificationService): Promise<void> {
			instantiationService.stub(IChatInputNotificationService, service);
			return instantiationService.invokeFunction(accessor => new InstallTrustedCAAction().run(accessor));
		}

		function enableRemoval(remove: (chat: string, scopeId: string) => Promise<void>, supported = true): void {
			assert.ok(resolution);
			resolution = {
				...resolution,
				connection: new class extends mock<IAgentConnection>() {
					override readonly sandboxCertificateRemovalSupported = constObservable(supported);
					override readonly sandboxCertificateInstallationSupported = constObservable(true);
					override removeSandboxCertificate = remove;
					override installSandboxCertificate = async () => { assert.fail('Removal must not install'); };
					override getSubscriptionUnmanaged(): undefined { return undefined; }
				},
			};
		}

		function runRemovalCommand(service: NotificationService): Promise<void> {
			instantiationService.stub(IChatInputNotificationService, service);
			return instantiationService.invokeFunction(accessor => new RemoveTrustedCAAction().run(accessor));
		}

		function enableRotation(rotate: (chat: string, scopeId: string) => Promise<void>, supported = true): void {
			assert.ok(resolution);
			resolution = {
				...resolution,
				connection: new class extends mock<IAgentConnection>() {
					override readonly sandboxCertificateRotationSupported = constObservable(supported);
					override readonly sandboxCertificateInstallationSupported = constObservable(true);
					override rotateSandboxCertificate = rotate;
					override installSandboxCertificate = async () => { assert.fail('Rotation must not invoke installation'); };
					override getSubscriptionUnmanaged(): undefined { return undefined; }
				},
			};
		}

		function runRotationCommand(service: NotificationService): Promise<void> {
			instantiationService.stub(IChatInputNotificationService, service);
			return instantiationService.invokeFunction(accessor => new RotateTrustedCAAction().run(accessor));
		}

		class CertificateQuickInputService extends mock<IQuickInputService>() {
			labels: (string | undefined)[] = [];
			title: string | undefined;
			selected: string | undefined;
			onPick: (() => void) | undefined;

			override async pick<T extends IQuickPickItem>(items: QuickPickInput<T>[], options?: IPickOptions<T>): Promise<T | undefined> {
				this.labels = items.map(item => item.label);
				this.title = options?.title;
				this.onPick?.();
				return items.find((item): item is T => item.type !== 'separator' && item.label === this.selected);
			}
		}

		test('Manage Trusted CA is the only CA Command Palette entry and respects agent-host enablement', () => {
			const actions = [new ManageTrustedCAAction(), new InstallTrustedCAAction(), new RotateTrustedCAAction(), new RemoveTrustedCAAction()];
			const context = new Context(0, null);
			context.setValue('chatIsEnabled', false);
			context.setValue('agentHostEnabled', true);
			const enabled = actions[0].desc.precondition?.evaluate(context);
			context.setValue('agentHostEnabled', false);
			assert.deepStrictEqual({
				palette: actions.filter(action => action.desc.f1).map(action => ({ id: action.desc.id, title: action.desc.title, category: action.desc.category })),
				enabled, disabled: actions[0].desc.precondition?.evaluate(context),
			}, {
				palette: [{
					id: 'workbench.action.chat.manageTrustedCA',
					title: { value: 'Manage Trusted CA', original: 'Manage Trusted CA' },
					category: { value: 'Sandbox', original: 'Sandbox' },
				}],
				enabled: true, disabled: false,
			});
		});

		for (const selected of ['Install', 'Rotate', 'Remove', undefined]) {
			test(`Manage Trusted CA routes ${selected ?? 'cancellation'} through the existing confirmation flow`, async () => {
				store.add(registerAction2(ManageTrustedCAAction));
				const subscription = store.add(new TestSubscription());
				subscription.setValue();
				const chat = 'conversation://opaque/a%2Fb?revision%3D3#entry';
				subscription.setCertificate({ ...certificate, state: selected === 'Install' ? 'notInstalled' : 'installed' }, chat);
				const service = new NotificationService();
				const calls: [string, string][] = [];
				const run = async (chat: string, scopeId: string) => { calls.push([chat, scopeId]); };
				if (selected === 'Install') {
					enableInstallation(run);
				} else if (selected === 'Rotate') {
					enableRotation(run);
				} else {
					enableRemoval(run);
				}
				const picker = new CertificateQuickInputService();
				picker.selected = selected;
				picker.onPick = () => focus(URI.parse('test-session:/other'));
				instantiationService.stub(IQuickInputService, picker);
				focus(resource);
				createNotification(resource, subscription, service);
				const command = CommandsRegistry.getCommand('workbench.action.chat.manageTrustedCA');
				assert.ok(command);
				await instantiationService.invokeFunction(command.handler);
				assert.deepStrictEqual({
					title: picker.title, labels: picker.labels, calls,
					confirmations: confirmations.length, errors: installationErrors,
				}, {
					title: 'Manage Trusted CA', labels: ['Install', 'Rotate', 'Remove'],
					calls: selected ? [[chat, 'host-runtime']] : [],
					confirmations: selected ? 1 : 0, errors: [],
				});
			});
		}

		for (const change of ['disconnect', 'dispose'] as const) {
			test(`Manage Trusted CA rechecks the target after picker ${change}`, async () => {
				const subscription = store.add(new TestSubscription());
				subscription.setValue();
				subscription.setCertificate({ ...certificate, state: 'installed' });
				const service = new NotificationService();
				enableRotation(async () => { assert.fail('Target no longer available'); });
				focus(resource);
				const controller = createNotification(resource, subscription, service);
				const picker = new CertificateQuickInputService();
				picker.selected = 'Rotate';
				picker.onPick = () => {
					if (change === 'disconnect') {
						resolution = undefined;
					} else {
						controller.dispose();
					}
				};
				instantiationService.stub(IQuickInputService, picker);
				await instantiationService.invokeFunction(accessor => new ManageTrustedCAAction().run(accessor));
				assert.deepStrictEqual({ information: installationInformation, confirmations, errors: installationErrors }, {
					information: ['No agent host detected.'], confirmations: [], errors: [],
				});
			});
		}

		test('Rotate Trusted CA is registered, confirms replacement, and shows progress without an idle missing notice', async () => {
			store.add(registerAction2(RotateTrustedCAAction));
			const subscription = store.add(new TestSubscription());
			subscription.setValue();
			subscription.setCertificate({ ...certificate, state: 'installed' });
			const service = new NotificationService();
			const calls: [string, string][] = [];
			let progress: IChatInputNotification['message'] | undefined;
			enableRotation(async (chat, scopeId) => {
				calls.push([chat.toString(), scopeId]);
				const notice = service.notifications.get(id);
				progress = notice?.progress ? notice.message : undefined;
				subscription.setCertificate({ ...certificate, state: 'installed' });
			});
			focus(resource);
			createNotification(resource, subscription, service);
			const idleNotices = service.notifications.size;
			instantiationService.stub(IChatInputNotificationService, service);
			const command = CommandsRegistry.getCommand('workbench.action.chat.rotateTrustedCA');
			assert.ok(command);
			await instantiationService.invokeFunction(command.handler);
			const detail = confirmations[0]?.detail;
			assert.ok(typeof detail === 'string');
			assert.deepStrictEqual({
				calls, progress, idleNotices, remaining: service.notifications.size,
				host: confirmations[0]?.message.includes('custom-host'),
				replacement: detail.includes('Replaces the shared sandbox CA and private key and trusts the new CA.'),
				restart: detail.includes('tools may need to restart'),
				information: installationInformation, errors: installationErrors,
			}, {
				calls: [['conversation://opaque/certificate?revision%3D3#entry', 'host-runtime']],
				progress: 'Rotating sandbox certificate', idleNotices: 0, remaining: 0,
				host: true, replacement: true, restart: true,
				information: ['The sandbox certificate was rotated and trusted. Running sandboxed tools may need to restart.'], errors: [],
			});
		});

		test('Rotate Trusted CA is named and gated consistently with other CA commands', () => {
			const context = new Context(0, null);
			context.setValue('chatIsEnabled', false);
			context.setValue('agentHostEnabled', true);
			const { title, category, precondition, f1 } = new RotateTrustedCAAction().desc;
			const enabled = precondition?.evaluate(context);
			context.setValue('agentHostEnabled', false);
			assert.deepStrictEqual({ title, category, f1, enabled, disabled: precondition?.evaluate(context) }, {
				title: { value: 'Rotate Trusted CA', original: 'Rotate Trusted CA' },
				category: { value: 'Sandbox', original: 'Sandbox' }, f1: false, enabled: true, disabled: false,
			});
		});

		for (const outcome of ['cancel', 'stale scope', 'disposed'] as const) {
			test(`rotation rejects ${outcome} during confirmation and shares its busy guard`, async () => {
				const subscription = store.add(new TestSubscription());
				subscription.setValue();
				subscription.setCertificate({ ...certificate, state: 'installed' });
				const service = new NotificationService();
				enableRotation(async () => { assert.fail('Must not mutate'); });
				const pending = new DeferredPromise<{ confirmed: boolean }>();
				confirmation = pending.p;
				focus(resource);
				const controller = createNotification(resource, subscription, service);
				const rotating = runRotationCommand(service);
				await runRotationCommand(service);
				await runDeveloperCommand(service);
				await runRemovalCommand(service);
				if (outcome === 'stale scope') {
					subscription.setCertificate({ ...certificate, state: 'installed', scopeId: 'replacement' });
				} else if (outcome === 'disposed') {
					controller.dispose();
				}
				pending.complete({ confirmed: outcome !== 'cancel' });
				await rotating;
				assert.deepStrictEqual({
					confirmations: confirmations.length, information: installationInformation,
					errors: installationErrors.length, stale: installationErrors[0]?.includes('target changed'),
				}, {
					confirmations: 1, information: [], errors: outcome === 'stale scope' ? 1 : 0,
					stale: outcome === 'stale scope' ? true : undefined,
				});
			});
		}

		for (const unavailable of ['unsupported host', 'hidden AI', 'sandbox disabled', 'not installed'] as const) {
			test(`rotation cannot bypass ${unavailable}`, async () => {
				const subscription = store.add(new TestSubscription());
				subscription.setValue();
				subscription.setCertificate({ ...certificate, state: unavailable === 'not installed' ? 'notInstalled' : 'installed' });
				const service = new NotificationService();
				enableRotation(async () => { assert.fail('Must not rotate'); }, unavailable !== 'unsupported host');
				hiddenAI = unavailable === 'hidden AI';
				if (unavailable === 'sandbox disabled') {
					subscription.setSandboxConfig('off', false);
				}
				focus(resource);
				createNotification(resource, subscription, service);
				await runRotationCommand(service);
				assert.deepStrictEqual({ confirmations: confirmations.length, rejected: installationErrors[0]?.includes('rotation is no longer available') }, {
					confirmations: 0, rejected: true,
				});
			});
		}

		test('rotation failures are explicit and can be retried', async () => {
			const subscription = store.add(new TestSubscription());
			subscription.setValue();
			subscription.setCertificate({ ...certificate, state: 'installed' });
			const service = new NotificationService();
			let calls = 0;
			enableRotation(async () => { calls++; throw new Error('OS authorization denied'); });
			focus(resource);
			createNotification(resource, subscription, service);
			await runRotationCommand(service);
			await runRotationCommand(service);
			assert.deepStrictEqual({ calls, information: installationInformation, errors: installationErrors, notices: service.notifications.size }, {
				calls: 2, information: [], notices: 0,
				errors: Array(2).fill('Could not rotate the sandbox certificate: OS authorization denied'),
			});
		});

		test('Remove Trusted CA is registered, confirms the host and retained CA, and shows progress and completion', async () => {
			store.add(registerAction2(RemoveTrustedCAAction));
			const subscription = store.add(new TestSubscription());
			subscription.setValue();
			subscription.setCertificate({ ...certificate, state: 'installed' });
			const service = new NotificationService();
			const calls: [string, string][] = [];
			let progress: IChatInputNotification['message'] | undefined;
			enableRemoval(async (chat, scopeId) => {
				calls.push([chat.toString(), scopeId]);
				progress = service.notifications.get(id)?.progress ? service.notifications.get(id)?.message : undefined;
				subscription.setCertificate(certificate);
			});
			focus(resource);
			createNotification(resource, subscription, service);
			instantiationService.stub(IChatInputNotificationService, service);
			const command = CommandsRegistry.getCommand('workbench.action.chat.removeTrustedCA');
			assert.ok(command);
			await instantiationService.invokeFunction(command.handler);
			const detail = confirmations[0]?.detail;
			assert.ok(typeof detail === 'string');
			assert.deepStrictEqual({
				calls, progress, host: confirmations[0]?.message.includes('custom-host'),
				retention: detail.includes('keeps its certificate and private key'),
				impact: detail.includes('Tools relying on OS trust may stop working.'),
				information: installationInformation, errors: installationErrors, installOffered: hasInstallLink(service),
			}, {
				calls: [['conversation://opaque/certificate?revision%3D3#entry', 'host-runtime']],
				progress: 'Removing sandbox certificate trust', host: true, retention: true, impact: true,
				information: ['The sandbox certificate was removed from OS trust. The stored certificate authority was kept.'],
				errors: [], installOffered: true,
			});
		});

		test('Remove Trusted CA is named and gated consistently with Install Trusted CA', () => {
			const context = new Context(0, null);
			context.setValue('chatIsEnabled', false);
			context.setValue('agentHostEnabled', true);
			const { title, category, precondition, f1 } = new RemoveTrustedCAAction().desc;
			const enabled = precondition?.evaluate(context);
			context.setValue('agentHostEnabled', false);
			assert.deepStrictEqual({ title, category, f1, enabled, disabled: precondition?.evaluate(context) }, {
				title: { value: 'Remove Trusted CA', original: 'Remove Trusted CA' },
				category: { value: 'Sandbox', original: 'Sandbox' },
				f1: false, enabled: true, disabled: false,
			});
		});

		test('cancelling removal does not mutate the CA', async () => {
			const subscription = store.add(new TestSubscription());
			subscription.setValue();
			subscription.setCertificate({ ...certificate, state: 'installed' });
			const service = new NotificationService();
			enableRemoval(async () => { assert.fail('Cancelled'); });
			confirmation = Promise.resolve({ confirmed: false });
			focus(resource);
			createNotification(resource, subscription, service);
			await runRemovalCommand(service);
			assert.deepStrictEqual({ confirmations: confirmations.length, information: installationInformation, errors: installationErrors, notices: service.notifications.size }, {
				confirmations: 1, information: [], errors: [], notices: 0,
			});
		});

		test('removal and installation share a busy guard throughout OS authorization', async () => {
			const subscription = store.add(new TestSubscription());
			subscription.setValue();
			subscription.setCertificate({ ...certificate, state: 'installed' });
			const service = new NotificationService();
			const started = new DeferredPromise<void>();
			const pending = new DeferredPromise<void>();
			let calls = 0;
			enableRemoval(async () => {
				calls++;
				started.complete();
				await pending.p;
				subscription.setCertificate(certificate);
			});
			focus(resource);
			createNotification(resource, subscription, service);
			const removing = runRemovalCommand(service);
			await started.p;
			await runDeveloperCommand(service);
			await runRemovalCommand(service);
			pending.complete();
			await removing;
			assert.deepStrictEqual({ calls, confirmations: confirmations.length, information: installationInformation.length, errors: installationErrors }, {
				calls: 1, confirmations: 1, information: 1, errors: [],
			});
		});

		for (const unavailable of ['unsupported host', 'hidden AI', 'missing status'] as const) {
			test(`removal does not bypass ${unavailable} or fall back to installation`, async () => {
				const subscription = store.add(new TestSubscription());
				subscription.setValue();
				subscription.setCertificate(unavailable === 'missing status' ? undefined : { ...certificate, state: 'installed' });
				const service = new NotificationService();
				enableRemoval(async () => { assert.fail('Unavailable'); }, unavailable !== 'unsupported host');
				hiddenAI = unavailable === 'hidden AI';
				focus(resource);
				createNotification(resource, subscription, service);
				await runRemovalCommand(service);
				assert.deepStrictEqual({ confirmations: confirmations.length, rejected: installationErrors[0]?.includes('removal is no longer available') }, {
					confirmations: 0, rejected: true,
				});
			});
		}

		test('removal revalidates the runtime after confirmation', async () => {
			const subscription = store.add(new TestSubscription());
			subscription.setValue();
			subscription.setCertificate({ ...certificate, state: 'installed' });
			const service = new NotificationService();
			enableRemoval(async () => { assert.fail('Stale target'); });
			const pending = new DeferredPromise<{ confirmed: boolean }>();
			confirmation = pending.p;
			focus(resource);
			createNotification(resource, subscription, service);
			const removing = runRemovalCommand(service);
			subscription.setCertificate({ ...certificate, state: 'installed', scopeId: 'replacement' });
			pending.complete({ confirmed: true });
			await removing;
			assert.deepStrictEqual({ confirmations: confirmations.length, rejected: installationErrors[0]?.includes('target changed'), information: installationInformation }, {
				confirmations: 1, rejected: true, information: [],
			});
		});

		test('removal failures are explicit and can be retried', async () => {
			const subscription = store.add(new TestSubscription());
			subscription.setValue();
			subscription.setCertificate({ ...certificate, state: 'installed' });
			const service = new NotificationService();
			let calls = 0;
			enableRemoval(async () => { calls++; throw new Error('OS authorization denied'); });
			focus(resource);
			createNotification(resource, subscription, service);
			await runRemovalCommand(service);
			await runRemovalCommand(service);
			assert.deepStrictEqual({ calls, information: installationInformation, errors: installationErrors, notices: service.notifications.size }, {
				calls: 2, information: [],
				errors: Array(2).fill('Could not remove sandbox certificate trust: OS authorization denied'), notices: 0,
			});
		});

		test('Install confirms the target host, displays progress and responds to the trusted status', async () => {
			const subscription = store.add(new TestSubscription());
			subscription.setValue();
			subscription.setCertificate(certificate);
			const service = new NotificationService();
			const calls: [string, string][] = [];
			let progress: boolean | undefined;
			let linkWhileInstalling: boolean | undefined;
			enableInstallation(async (chat, scopeId) => {
				calls.push([chat.toString(), scopeId]);
				progress = !!service.notifications.get(id)?.progress;
				linkWhileInstalling = hasInstallLink(service);
				subscription.setCertificate({ ...certificate, state: 'installed' });
			});
			focus(resource);
			createNotification(resource, subscription, service);
			await instantiationService.invokeFunction(installCommand(service).handler);
			assert.deepStrictEqual({
				calls, progress, linkWhileInstalling, targetNamed: confirmations[0]?.message.includes('custom-host'),
				trustExplained: typeof confirmations[0]?.detail === 'string' && confirmations[0].detail.includes('OS trust store'),
				remaining: service.notifications.size, installationErrors,
			}, {
				calls: [['conversation://opaque/certificate?revision%3D3#entry', 'host-runtime']], progress: true, linkWhileInstalling: false,
				targetNamed: true, trustExplained: true, remaining: 0, installationErrors: [],
			});
		});

		test('cancelling the confirmation never sends an installation request', async () => {
			const subscription = store.add(new TestSubscription());
			subscription.setValue();
			subscription.setCertificate(certificate);
			const service = new NotificationService();
			let calls = 0;
			enableInstallation(async () => { calls++; });
			confirmation = Promise.resolve({ confirmed: false });
			focus(resource);
			createNotification(resource, subscription, service);
			await instantiationService.invokeFunction(installCommand(service).handler);
			assert.deepStrictEqual({ calls, errors: installationErrors, hasInstallLink: hasInstallLink(service) }, { calls: 0, errors: [], hasInstallLink: true });
		});

		test('duplicate clicks share confirmation and a changed runtime is rejected afterward', async () => {
			const subscription = store.add(new TestSubscription());
			subscription.setValue();
			subscription.setCertificate(certificate);
			const service = new NotificationService();
			let calls = 0;
			enableInstallation(async () => { calls++; });
			const pending = new DeferredPromise<{ confirmed: boolean }>();
			confirmation = pending.p;
			focus(resource);
			createNotification(resource, subscription, service);
			const command = installCommand(service);
			const installing = instantiationService.invokeFunction(command.handler);
			await instantiationService.invokeFunction(command.handler);
			subscription.setCertificate({ ...certificate, scopeId: 'replacement-runtime' });
			await pending.complete({ confirmed: true });
			await installing;
			assert.deepStrictEqual({ calls, confirmations: confirmations.length, rejected: installationErrors[0]?.includes('target changed') }, { calls: 0, confirmations: 1, rejected: true });
		});

		test('installation failures are visible and the action is available to retry', async () => {
			const subscription = store.add(new TestSubscription());
			subscription.setValue();
			subscription.setCertificate(certificate);
			const service = new NotificationService();
			enableInstallation(async () => { throw new Error('OS authorization denied'); });
			focus(resource);
			createNotification(resource, subscription, service);
			await instantiationService.invokeFunction(installCommand(service).handler);
			assert.deepStrictEqual({
				errors: installationErrors, hasInstallLink: hasInstallLink(service), progress: service.notifications.get(id)?.progress,
			}, {
				errors: ['Could not install the sandbox certificate: OS authorization denied'], hasInstallLink: true, progress: undefined,
			});
		});

		test('a host without the capability keeps the informational notice but has no Install action', () => {
			const subscription = store.add(new TestSubscription());
			subscription.setValue();
			subscription.setCertificate(certificate);
			const service = new NotificationService();
			enableInstallation(async () => { assert.fail('must not install'); }, false);
			focus(resource);
			createNotification(resource, subscription, service);
			assert.deepStrictEqual({ hasInstallLink: hasInstallLink(service), actions: service.notifications.get(id)?.actions }, { hasInstallLink: false, actions: [] });
		});

		test('renders a trusted Install link in the description and clicking it initiates confirmation', async () => {
			const subscription = store.add(new TestSubscription());
			subscription.setValue();
			subscription.setCertificate({ ...certificate, detail: '[untrusted](command:evil)' });
			const service = new NotificationService();
			let calls = 0;
			enableInstallation(async () => { calls++; });
			focus(resource);
			createNotification(resource, subscription, service);
			const description = service.notifications.get(id)?.description;
			assert.ok(isMarkdownString(description));
			let installing: Promise<void> | undefined;
			const rendered = store.add(renderMarkdown(description, {
				actionHandler: url => {
					const command = CommandsRegistry.getCommand(URI.parse(url).path);
					assert.ok(command);
					installing = Promise.resolve(instantiationService.invokeFunction(command.handler));
					return installing;
				},
			}));
			const links = [...rendered.element.querySelectorAll('a')];
			links[0]?.click();
			await installing;
			assert.deepStrictEqual({
				links: links.map(link => link.textContent), calls, confirmations: confirmations.length,
				optionalSentence: rendered.element.textContent?.replace(/\u00a0/g, ' ').includes('Certificate installation is optional'),
				untrustedContent: rendered.element.textContent?.includes('untrusted'),
			}, { links: ['Install'], calls: 1, confirmations: 1, optionalSentence: false, untrustedContent: false });
		});

		test('Developer command installs for the last-focused chat after dismissing the notice', async () => {
			store.add(registerAction2(InstallTrustedCAAction));
			const subscription = store.add(new TestSubscription());
			subscription.setValue();
			subscription.setCertificate(certificate);
			const service = new NotificationService();
			const calls: [string, string][] = [];
			let progress: boolean | undefined;
			enableInstallation(async (chat, scopeId) => {
				calls.push([chat.toString(), scopeId]);
				progress = !!service.notifications.get(id)?.progress;
				subscription.setCertificate({ ...certificate, state: 'installed' });
			});
			focus(resource);
			createNotification(resource, subscription, service);
			service.dismissNotification(id);
			instantiationService.stub(IChatInputNotificationService, service);
			const command = CommandsRegistry.getCommand('workbench.action.chat.installTrustedCA');
			assert.ok(command);
			await instantiationService.invokeFunction(command.handler);
			assert.deepStrictEqual({ calls, progress, confirmations: confirmations.length, remaining: service.notifications.size }, {
				calls: [['conversation://opaque/certificate?revision%3D3#entry', 'host-runtime']], progress: true, confirmations: 1, remaining: 0,
			});
		});

		test('Developer command reports an already trusted CA without confirming or mutating', async () => {
			const subscription = store.add(new TestSubscription());
			subscription.setValue();
			subscription.setCertificate({ ...certificate, state: 'installed' });
			const service = new NotificationService();
			enableInstallation(async () => { assert.fail('Already installed'); });
			focus(resource);
			createNotification(resource, subscription, service);
			await runDeveloperCommand(service);
			assert.deepStrictEqual({ confirmations, installationInformation, installationErrors }, {
				confirmations: [], installationInformation: ['The sandbox certificate is already trusted for this chat.'], installationErrors: [],
			});
		});

		test('Developer command is available for agent-host-only chat and hidden when agent-host AI is disabled', () => {
			const context = new Context(0, null);
			context.setValue('chatIsEnabled', false);
			context.setValue('agentHostEnabled', true);
			const action = new InstallTrustedCAAction();
			const enabled = action.desc.precondition?.evaluate(context);
			context.setValue('agentHostEnabled', false);
			assert.deepStrictEqual({ enabled, disabled: action.desc.precondition?.evaluate(context) }, { enabled: true, disabled: false });
		});

		test('uses Sandbox: Install Trusted CA as the Command Palette title', () => {
			const { category, title } = new InstallTrustedCAAction().desc;
			assert.deepStrictEqual({ category, title }, {
				category: { value: 'Sandbox', original: 'Sandbox' },
				title: { value: 'Install Trusted CA', original: 'Install Trusted CA' },
			});
		});

		test('offers Install for an incompatible CA and explains replacement and tool restarts', async () => {
			const subscription = store.add(new TestSubscription());
			subscription.setValue();
			subscription.setCertificate({ ...certificate, requiresRotation: true });
			const service = new NotificationService();
			let calls = 0;
			enableInstallation(async () => { calls++; });
			focus(resource);
			createNotification(resource, subscription, service);
			await instantiationService.invokeFunction(installCommand(service).handler);
			const detail = confirmations[0]?.detail;
			assert.deepStrictEqual({
				calls,
				replacement: typeof detail === 'string' && detail.includes('replacing it if needed'),
				restart: typeof detail === 'string' && detail.includes('Running tools may need to restart'),
			}, { calls: 1, replacement: true, restart: true });
		});

		for (const fails of [false, true]) {
			test(`Install shows progress for an installed incompatible CA until ${fails ? 'failure' : 'completion'}, but stays hidden while idle`, async () => {
				const subscription = store.add(new TestSubscription());
				subscription.setValue();
				subscription.setCertificate({ ...certificate, state: 'installed', requiresRotation: true });
				const service = new NotificationService();
				const started = new DeferredPromise<void>();
				const authorization = new DeferredPromise<void>();
				enableInstallation(async () => {
					await started.complete();
					await authorization.p;
					if (fails) {
						throw new Error('OS authorization denied');
					}
					subscription.setCertificate({ ...certificate, state: 'installed' });
				});
				focus(resource);
				createNotification(resource, subscription, service);
				const idleNotices = service.notifications.size;

				const installing = runDeveloperCommand(service);
				await started.p;
				const notice = service.notifications.get(id);
				const pending = {
					message: notice?.message,
					progress: !!notice?.progress,
					installLink: hasInstallLink(service),
					inputUri: notice?.inputUri,
				};
				await authorization.complete();
				await installing;

				assert.deepStrictEqual({ idleNotices, pending, remaining: service.notifications.size, errors: installationErrors }, {
					idleNotices: 0,
					pending: { message: 'Installing sandbox certificate', progress: true, installLink: false, inputUri },
					remaining: 0,
					errors: fails ? ['Could not install the sandbox certificate: OS authorization denied'] : [],
				});
			});
		}

		test('uses connection-level installation support when the local AHP handshake omits it', async () => {
			const subscription = store.add(new TestSubscription());
			subscription.setValue();
			subscription.setCertificate(certificate);
			const service = new NotificationService();
			let calls = 0;
			assert.ok(resolution);
			resolution = {
				...resolution,
				connection: new class extends mock<IAgentConnection>() {
					override readonly initializeResult = constObservable(upcastPartial<InitializeResult>({}));
					override readonly sandboxCertificateInstallationSupported = constObservable(true);
					override installSandboxCertificate = async () => { calls++; };
					override getSubscriptionUnmanaged(): undefined { return undefined; }
				},
			};
			focus(resource);
			createNotification(resource, subscription, service);
			await instantiationService.invokeFunction(installCommand(service).handler);
			assert.strictEqual(calls, 1);
		});

		test('Developer command shares the pending confirmation with the Install link', async () => {
			const subscription = store.add(new TestSubscription());
			subscription.setValue();
			subscription.setCertificate(certificate);
			const service = new NotificationService();
			let calls = 0;
			enableInstallation(async () => { calls++; });
			const pending = new DeferredPromise<{ confirmed: boolean }>();
			confirmation = pending.p;
			focus(resource);
			createNotification(resource, subscription, service);
			const installing = instantiationService.invokeFunction(installCommand(service).handler);
			await runDeveloperCommand(service);
			await pending.complete({ confirmed: true });
			await installing;
			assert.deepStrictEqual({ calls, confirmations: confirmations.length }, { calls: 1, confirmations: 1 });
		});

		for (const Action of [ManageTrustedCAAction, InstallTrustedCAAction, RotateTrustedCAAction, RemoveTrustedCAAction]) {
			for (const target of ['no focused chat', 'non-agent-host chat', 'missing connection', 'missing controller', 'disposed controller'] as const) {
				test(`${new Action().desc.id} reports No agent host detected for ${target}`, async () => {
					const service = new NotificationService();
					if (target === 'non-agent-host chat') {
						focus(URI.parse('test-session:/unrelated'));
					} else if (target === 'missing controller') {
						focus(resource);
					} else if (target === 'missing connection' || target === 'disposed controller') {
						const subscription = store.add(new TestSubscription());
						subscription.setValue();
						subscription.setCertificate({ ...certificate, state: 'installed' });
						focus(resource);
						const controller = createNotification(resource, subscription, service);
						if (target === 'disposed controller') {
							controller.dispose();
						} else {
							resolution = undefined;
						}
					}
					instantiationService.stub(IChatInputNotificationService, service);
					await instantiationService.invokeFunction(accessor => new Action().run(accessor));
					assert.deepStrictEqual({ information: installationInformation, errors: installationErrors, confirmations, dispatched }, {
						information: ['No agent host detected.'], errors: [], confirmations: [], dispatched: [],
					});
				});
			}
		}

		for (const unavailable of ['unsupported host', 'hidden AI', 'sandbox disabled'] as const) {
			test(`Developer command cannot bypass ${unavailable}`, async () => {
				const subscription = store.add(new TestSubscription());
				subscription.setValue();
				subscription.setCertificate(certificate);
				const service = new NotificationService();
				enableInstallation(async () => { assert.fail('Must not install'); }, unavailable !== 'unsupported host');
				hiddenAI = unavailable === 'hidden AI';
				if (unavailable === 'sandbox disabled') {
					subscription.setSandboxConfig('off', false);
				}
				focus(resource);
				createNotification(resource, subscription, service);
				await runDeveloperCommand(service);
				assert.deepStrictEqual({ confirmations: confirmations.length, rejected: installationErrors[0]?.includes('no longer available') }, { confirmations: 0, rejected: true });
			});
		}

		test('closing the chat during confirmation prevents installation', async () => {
			const subscription = store.add(new TestSubscription());
			subscription.setValue();
			subscription.setCertificate(certificate);
			const service = new NotificationService();
			let calls = 0;
			enableInstallation(async () => { calls++; });
			const pending = new DeferredPromise<{ confirmed: boolean }>();
			confirmation = pending.p;
			focus(resource);
			const notification = createNotification(resource, subscription, service);
			const installing = instantiationService.invokeFunction(installCommand(service).handler);
			notification.dispose();
			await pending.complete({ confirmed: true });
			await installing;
			assert.deepStrictEqual({ calls, remaining: service.notifications.size, errors: installationErrors }, { calls: 0, remaining: 0, errors: [] });
		});

		test('shows a nonblocking informational notice when the asynchronous status arrives', () => {
			const subscription = store.add(new TestSubscription());
			subscription.setValue();
			const service = new NotificationService();
			focus(resource);
			createNotification(resource, subscription, service);
			const before = service.notifications.size;
			subscription.setCertificate({ ...certificate, detail: '[Install](command:evil)' });
			const notice = service.notifications.get(id);
			assert.ok(notice);
			const { onDismiss, description, ...body } = notice;
			assert.ok(isMarkdownString(description));
			const rendered = store.add(renderMarkdown(description));
			assert.deepStrictEqual({ before, body: { ...body, description: rendered.element.textContent?.replace(/\u00a0/g, ' ') }, dismissible: typeof onDismiss, dispatched }, {
				before: 0,
				body: {
					id, inputUri,
					severity: ChatInputNotificationSeverity.Info,
					message: 'Sandbox trusted CA is not installed',
					description: 'Some tools running in this session\'s sandbox may need a trusted certificate on the agent host.',
					actions: [], dismissible: true, autoDismissOnMessage: false, sessionResources: [resource],
				},
				dismissible: 'function',
				dispatched: [],
			});
		});

		for (const status of ['installed', 'notRequired', 'unsupported', 'error'] as const) {
			test(`hides ${status} status without interpreting it as missing`, () => {
				const subscription = store.add(new TestSubscription());
				subscription.setValue();
				subscription.setCertificate({ ...certificate, state: status });
				const service = new NotificationService();
				focus(resource);
				createNotification(resource, subscription, service);
				assert.strictEqual(service.notifications.size, 0);
			});
		}

		test('removes the notice for unavailable installation, sandboxing off, hidden AI and disconnects', () => {
			const subscription = store.add(new TestSubscription());
			subscription.setValue();
			const service = new NotificationService();
			focus(resource);
			createNotification(resource, subscription, service);
			const sizes: number[] = [];
			const sample = () => sizes.push(service.notifications.size);
			subscription.setCertificate(certificate);
			sample();
			subscription.setCertificate({ ...certificate, canInstall: false });
			sample();
			subscription.setCertificate(certificate);
			hiddenAI = true;
			sentimentChanged.fire();
			sample();
			hiddenAI = false;
			sentimentChanged.fire();
			sample();
			subscription.setSandboxConfig('off', false);
			sample();
			subscription.setSandboxConfig('on', true);
			sample();
			subscription.setError();
			sample();
			assert.deepStrictEqual(sizes, [1, 0, 0, 1, 0, 1, 0]);
		});

		test('does not republish identical status and clears it when installed or removed', () => {
			const subscription = store.add(new TestSubscription());
			subscription.setValue();
			subscription.setCertificate(certificate);
			const service = new NotificationService();
			focus(resource);
			createNotification(resource, subscription, service);
			subscription.setCertificate({ ...certificate });
			const updates = service.updates;
			subscription.setCertificate({ ...certificate, state: 'installed' });
			const installed = service.notifications.size;
			subscription.setCertificate(certificate);
			subscription.setCertificate(undefined);
			assert.deepStrictEqual({ updates, installed, removed: service.notifications.size }, { updates: 1, installed: 0, removed: 0 });
		});

		test('reads only the selected opaque chat and not a peer certificate', () => {
			const subscription = store.add(new TestSubscription());
			subscription.setValue();
			subscription.setCertificate(undefined);
			subscription.setCertificate(certificate, 'conversation://opaque/unrelated-peer');
			const service = new NotificationService();
			focus(resource);
			createNotification(resource, subscription, service);
			const before = service.notifications.size;
			subscription.setCertificate(certificate);
			assert.deepStrictEqual([before, service.notifications.size], [0, 1]);
		});

		test('keeps dependency warnings higher priority and their dismissals independent', () => {
			enableInstallation(async () => { assert.fail('Rendering must not install'); });
			const subscription = store.add(new TestSubscription());
			subscription.setValue(['Install bubblewrap.']);
			subscription.setCertificate(certificate);
			instantiationService.stub(ILogService, new NullLogService());
			const descriptor = getSingletonServiceDescriptors().find(([id]) => id === IChatInputNotificationService)?.[1];
			assert.ok(descriptor);
			const service = store.add(instantiationService.createInstance<IChatInputNotificationService & IDisposable>(descriptor));
			focus(resource);
			createNotification(resource, subscription, service);
			const widgetInstantiationService = store.add(workbenchInstantiationService(undefined, store));
			widgetInstantiationService.stub(IChatInputNotificationService, service);
			const widget = store.add(widgetInstantiationService.createInstance(ChatInputNotificationWidget, {
				inputUri,
				hostVisible: constObservable(true),
				modelTargetChatSessionType: constObservable('agent-host-copilot'),
				sessionResource: constObservable(resource),
			}));
			const warningRendered = widget.domNode.textContent?.includes('Sandboxing might not work as expected');
			const warning = service.getActiveNotification();
			assert.ok(warning);
			service.dismissNotification(warning.id);
			const info = service.getActiveNotification();
			assert.ok(info);
			const certificateRendered = widget.domNode.textContent?.includes('Sandbox trusted CA is not installed');
			const installSeparatorRendered = widget.domNode.textContent?.replace(/\u00a0/g, ' ').includes('agent host. Install');
			const installLink = [...widget.domNode.querySelectorAll('a')].find(link => link.textContent === 'Install');
			const renderedLink = { label: installLink?.textContent, tabIndex: installLink?.tabIndex };
			service.dismissNotification(info.id);
			subscription.setCertificate(certificate);
			assert.deepStrictEqual({
				warning: warning.severity, info: info.severity, id: info.id, remaining: service.getActiveNotification(), warningRendered, certificateRendered, installSeparatorRendered, renderedLink, dispatched,
			}, {
				warning: ChatInputNotificationSeverity.Warning, info: ChatInputNotificationSeverity.Info, id, remaining: undefined, warningRendered: true, certificateRendered: true, installSeparatorRendered: true, renderedLink: { label: 'Install', tabIndex: 0 }, dispatched: [],
			});
		});

		test('shows the selected peer chat using its advertised URI', () => {
			const subscription = store.add(new TestSubscription());
			subscription.setValue();
			subscription.setCertificate({ ...certificate, state: 'installed' });
			const peer = 'conversation://other-host/peer?version%3D2#entry';
			const peerResource = resource.with({ fragment: peer });
			subscription.value = {
				...subscription.verifiedValue,
				chats: [{ resource: peer, title: 'Peer', status: SessionStatus.Idle, modifiedAt: '2026-10-15T00:00:00.000Z' }],
			};
			subscription.setCertificate(certificate, peer);
			const service = new NotificationService();
			instantiationService.stub(IAgentHostConnectionsService, { resolveSessionResource: () => resolution });
			focus(peerResource);
			createNotification(peerResource, subscription, service);
			assert.deepStrictEqual([...service.notifications.values()].map(n => n.sessionResources), [[peerResource]]);
		});

		test('clearing or dismissing the certificate leaves a dependency warning intact', () => {
			const subscription = store.add(new TestSubscription());
			subscription.setValue(['Install bubblewrap.']);
			subscription.setCertificate(certificate);
			const service = new NotificationService();
			focus(resource);
			createNotification(resource, subscription, service);
			subscription.setCertificate(undefined);
			const afterClear = [...service.notifications.keys()];
			subscription.setCertificate(certificate);
			service.dismissNotification(id);
			assert.deepStrictEqual([afterClear, [...service.notifications.keys()]], Array(2).fill([`agentHost.sandboxUnsupported.${resource.toString()}`]));
		});

		test('shows only in the focused input and preserves host-scoped dismissal across sessions', () => {
			const subscription = store.add(new TestSubscription());
			subscription.setValue();
			subscription.setCertificate(certificate);
			const other = resource.with({ path: '/session-b' });
			const otherInput = URI.parse('test-input:/other');
			const service = new NotificationService();
			instantiationService.stub(IAgentHostConnectionsService, { resolveSessionResource: () => resolution });
			createNotification(resource, subscription, service);
			createNotification(other, subscription, service);
			focus(resource);
			const first = [...service.notifications.values()].map(n => n.inputUri);
			focus(other, otherInput);
			const second = [...service.notifications.values()].map(n => n.inputUri);
			service.dismissNotification(`agentHost.sandboxCertificate.${other.toString()}`);
			focus(resource);
			const dismissed = service.notifications.size;
			subscription.setCertificate({ ...certificate, scopeId: 'replacement-runtime' });
			const newRuntime = service.notifications.size;
			focus(undefined);
			assert.deepStrictEqual({ first, second, dismissed, newRuntime, unfocused: service.notifications.size }, {
				first: [inputUri], second: [otherInput], dismissed: 0, newRuntime: 1, unfocused: 0,
			});
		});

		test('disposal removes the notice and reopening retains dismissal until a new window', () => {
			const subscription = store.add(new TestSubscription());
			subscription.setValue();
			subscription.setCertificate(certificate);
			const service = new NotificationService();
			focus(resource);
			const notification = createNotification(resource, subscription, service);
			service.dismissNotification(id);
			notification.dispose();
			createNotification(resource, subscription, service);
			const reopened = service.notifications.size;
			const newWindow = new NotificationService();
			const other = createNotification(resource, subscription, newWindow);
			const shown = newWindow.notifications.size;
			other.dispose();
			subscription.setCertificate(certificate);
			assert.deepStrictEqual([reopened, shown, newWindow.notifications.size], [0, 1, 0]);
		});
	});

	test('shows host-reported local network guidance as information with a trusted settings link', () => {
		const subscription = store.add(new TestSubscription());
		subscription.setValue();
		subscription.setLocalNetworkRequired(true);
		const service = new NotificationService();
		createNotification(resource, subscription, service);
		const notification = [...service.notifications.values()][0];
		const message = notification.message;
		assert.ok(isMarkdownString(message));
		const invoked: { command: string; args: string[] }[] = [];
		const rendered = store.add(renderMarkdown(message, {
			actionHandler: url => {
				const uri = URI.parse(url);
				invoked.push({ command: uri.path, args: JSON.parse(decodeURIComponent(uri.query)) });
			},
		}));
		const links = [...rendered.element.querySelectorAll('a')];
		links[0].click();

		assert.deepStrictEqual({
			severity: notification.severity,
			description: notification.description,
			text: rendered.element.textContent?.replace(/\u00a0/g, ' '),
			links: links.map(link => link.textContent),
			trust: message.isTrusted,
			invoked,
			dismissible: notification.dismissible,
			autoDismissOnMessage: notification.autoDismissOnMessage,
			sessionResources: notification.sessionResources,
			dispatched,
		}, {
			severity: ChatInputNotificationSeverity.Info,
			description: undefined,
			text: 'Sandboxing requires access to local network. Allow',
			links: ['Allow'],
			trust: { enabledCommands: ['workbench.action.openSettings'] },
			invoked: [{ command: 'workbench.action.openSettings', args: [`@id:${AgentSandboxSettingId.AgentSandboxAllowLocalNetwork}`] }],
			dismissible: true,
			autoDismissOnMessage: false,
			sessionResources: [resource],
			dispatched: [],
		});
	});

	test('clears local network guidance when the host resolves it or disconnects', () => {
		const subscription = store.add(new TestSubscription());
		subscription.setValue();
		const service = new NotificationService();
		createNotification(resource, subscription, service);
		const snapshots = [service.notifications.size];
		subscription.setLocalNetworkRequired(true);
		snapshots.push(service.notifications.size);
		subscription.setLocalNetworkRequired(false);
		snapshots.push(service.notifications.size);
		subscription.setLocalNetworkRequired(true);
		snapshots.push(service.notifications.size);
		subscription.setError();
		snapshots.push(service.notifications.size);

		assert.deepStrictEqual(snapshots, [0, 1, 0, 1, 0]);
	});

	test('does not republish unchanged local network guidance and retains dismissal on recreation', () => {
		const subscription = store.add(new TestSubscription());
		subscription.setValue();
		subscription.setLocalNetworkRequired(true);
		const service = new NotificationService();
		const notification = createNotification(resource, subscription, service);
		subscription.setLocalNetworkRequired(true);
		service.dismissNotification([...service.notifications.keys()][0]);
		notification.dispose();
		createNotification(resource, subscription, service);

		assert.deepStrictEqual({ updates: service.updates, notifications: service.notifications.size }, { updates: 1, notifications: 0 });
	});

	test('explains managed local network denial without offering to disable sandboxing', () => {
		const subscription = store.add(new TestSubscription());
		subscription.setValue();
		subscription.setLocalNetworkRequired(true);
		const service = new NotificationService();
		createNotification(resource, subscription, service);
		subscription.setLocalNetworkRequired(true, true);
		const notification = [...service.notifications.values()][0];
		assert.ok(isMarkdownString(notification.message));
		const rendered = store.add(renderMarkdown(notification.message));

		assert.deepStrictEqual({
			severity: notification.severity,
			text: rendered.element.textContent?.replace(/\u00a0/g, ' '),
			links: [...rendered.element.querySelectorAll('a')].map(link => link.textContent),
		}, {
			severity: ChatInputNotificationSeverity.Info,
			text: 'Your organization disables local network access, which some sandboxing features need. Allow',
			links: ['Allow'],
		});
	});

	test('dependency warnings take precedence over local network guidance', () => {
		const subscription = store.add(new TestSubscription());
		subscription.setValue(['Missing dependencies.']);
		subscription.setLocalNetworkRequired(true);
		const service = new NotificationService();
		createNotification(resource, subscription, service);
		const notification = [...service.notifications.values()][0];
		assert.ok(isMarkdownString(notification.description));
		const rendered = store.add(renderMarkdown(notification.description));

		assert.deepStrictEqual({
			severity: notification.severity,
			links: [...rendered.element.querySelectorAll('a')].map(link => link.textContent),
		}, {
			severity: ChatInputNotificationSeverity.Warning,
			links: ['Troubleshooting Guide', 'Disable Sandboxing'],
		});
	});

	test('shows only the first diagnostic in a dismissible session-scoped warning', () => {
		const subscription = store.add(new TestSubscription());
		subscription.setValue(['Install bubblewrap.', '[not a command](command:evil)']);
		const service = new NotificationService();
		createNotification(resource, subscription, service);

		assert.deepStrictEqual([...service.notifications.values()].map(({ onDismiss, description, ...notification }) => ({
			...notification,
			hasDismissHandler: typeof onDismiss === 'function',
		})), [{
			id: `agentHost.sandboxUnsupported.${resource.toString()}`,
			severity: ChatInputNotificationSeverity.Warning,
			message: 'Sandboxing might not work as expected',
			actions: [],
			dismissible: true,
			hasDismissHandler: true,
			autoDismissOnMessage: false,
			sessionResources: [resource],
		}]);
	});

	test('adds only trusted guidance links without interpreting host diagnostic markup', () => {
		const subscription = store.add(new TestSubscription());
		subscription.setValue([
			'[not a command](command:evil) <b>literal</b>',
			'Second capability must not be shown.',
		]);
		const service = new NotificationService();
		createNotification(resource, subscription, service);
		const description = [...service.notifications.values()][0].description;
		assert.ok(isMarkdownString(description));
		const rendered = store.add(renderMarkdown(description));
		const links = [...rendered.element.querySelectorAll('a')];
		assert.deepStrictEqual({
			links: links.map(link => link.textContent),
			breaks: rendered.element.querySelectorAll('br').length,
			boldElements: rendered.element.querySelectorAll('b').length,
			showsSecondCapability: rendered.element.textContent?.includes('Second capability'),
			trustedCommandCount: typeof description.isTrusted === 'object' ? description.isTrusted.enabledCommands.length : 0,
		}, {
			links: ['Troubleshooting Guide', 'Disable Sandboxing'],
			breaks: 0,
			boldElements: 0,
			showsSecondCapability: false,
			trustedCommandCount: 1,
		});
	});

	test('updates and removes the notice as host diagnostics change', () => {
		const subscription = store.add(new TestSubscription());
		subscription.setValue();
		const service = new NotificationService();
		createNotification(resource, subscription, service);
		const snapshots = [service.notifications.size];
		subscription.setValue(['Install bubblewrap.']);
		snapshots.push(service.notifications.size);
		subscription.setValue();
		snapshots.push(service.notifications.size);
		assert.deepStrictEqual(snapshots, [0, 1, 0]);
	});

	test('deduplicated reasons do not republish the warning', () => {
		const subscription = store.add(new TestSubscription());
		subscription.setValue(['Install iptables.', 'Install iptables.', 'Install bubblewrap.']);
		const service = new NotificationService();
		createNotification(resource, subscription, service);
		subscription.setValue(['Install iptables.', 'Install bubblewrap.', 'Install iptables.', 'Install iptables.']);
		assert.strictEqual(service.updates, 1);
	});

	function getDisableCommand(service: NotificationService): string {
		const description = [...service.notifications.values()][0].description;
		assert.ok(isMarkdownString(description) && typeof description.isTrusted === 'object');
		return description.isTrusted.enabledCommands[0];
	}

	test('disable link updates the sandbox setting to off and is removed on disposal', async () => {
		const subscription = store.add(new TestSubscription());
		subscription.setValue(['Missing dependencies.']);
		const service = new NotificationService();
		const update = stub(configurationService, 'updateValue').resolves();
		const notification = createNotification(resource, subscription, service);
		const commandId = getDisableCommand(service);
		const description = [...service.notifications.values()][0].description;
		assert.ok(isMarkdownString(description));
		const invoked: string[] = [];
		let pending: Promise<void> | undefined;
		const rendered = store.add(renderMarkdown(description, {
			actionHandler: async url => {
				const uri = URI.parse(url);
				invoked.push(uri.scheme, uri.path);
				const command = CommandsRegistry.getCommand(uri.path)!;
				pending = Promise.resolve(instantiationService.invokeFunction(command.handler));
				await pending;
			}
		}));
		const links = [...rendered.element.querySelectorAll('a')];
		links.find(link => link.textContent === 'Disable Sandboxing')!.click();
		await pending;
		notification.dispose();
		assert.deepStrictEqual({
			invoked,
			writes: update.args,
			command: CommandsRegistry.getCommand(commandId),
		}, {
			invoked: ['command', commandId],
			writes: [[AgentSandboxSettingId.AgentSandboxEnabled, AgentSandboxEnabledValue.Off]],
			command: undefined,
		});
	});

	test('updates links when host policy changes and rechecks policy before changing settings', async () => {
		const subscription = store.add(new TestSubscription());
		subscription.setValue(['Missing dependencies.'], false);
		const service = new NotificationService();
		const update = stub(configurationService, 'updateValue').resolves();
		createNotification(resource, subscription, service);
		const command = CommandsRegistry.getCommand(getDisableCommand(service))!;
		subscription.setValue(['Missing dependencies.'], true);
		await assert.rejects(async () => instantiationService.invokeFunction(command.handler), /required by your organization/);
		assert.deepStrictEqual({
			command: getDisableCommand(service),
			writes: update.args,
			updates: service.updates,
		}, { command: undefined, writes: [], updates: 2 });
	});

	for (const { value, confirmedEnabled } of [
		{ value: 'on', confirmedEnabled: undefined },
		{ value: undefined, confirmedEnabled: true },
	]) {
		test(`disables session sandboxing when settings are already off (value=${value}, applied=${confirmedEnabled})`, async () => {
			await configurationService.setUserConfiguration(AgentSandboxSettingId.AgentSandboxEnabled, AgentSandboxEnabledValue.Off);
			const subscription = store.add(new TestSubscription());
			subscription.setValue(['Missing dependencies.']);
			subscription.setSandboxConfig(value, confirmedEnabled);
			const service = new NotificationService();
			const update = stub(configurationService, 'updateValue').resolves();
			createNotification(resource, subscription, service);
			const command = CommandsRegistry.getCommand(getDisableCommand(service))!;
			await instantiationService.invokeFunction(command.handler);
			assert.deepStrictEqual({ dispatched, writes: update.args }, {
				dispatched: [['custom-host://opaque/session', {
					type: ActionType.SessionConfigChanged,
					config: { [SessionConfigKey.SandboxEnabled]: AgentSandboxEnabledValue.Off },
				}]],
				writes: [[AgentSandboxSettingId.AgentSandboxEnabled, AgentSandboxEnabledValue.Off]],
			});
		});
	}

	test('turns off the sandboxing of its chat, which the chat set for itself', async () => {
		await configurationService.setUserConfiguration(AgentSandboxSettingId.AgentSandboxEnabled, AgentSandboxEnabledValue.Off);
		const chat = 'ahp-chat://default/opaque';
		const subscription = store.add(new TestSubscription());
		subscription.setValue(['Missing dependencies.']);
		subscription.setSandboxConfig('off', false);
		// The session's sandboxing is off; the chat turned its own on and the host applied it.
		const session = subscription.verifiedValue;
		subscription.value = {
			...session,
			defaultChat: chat,
			config: { ...session.config!, schema: { ...session.config!.schema, properties: { [SessionConfigKey.SandboxEnabled]: { ...session.config!.schema.properties[SessionConfigKey.SandboxEnabled], chatMutable: true } } } },
			_meta: withChatSandboxState(session._meta, chat, { enabled: true }),
		};
		const chatState: ChatState = { resource: chat, title: 'Session', status: SessionStatus.Idle, modifiedAt: '2026-09-25T00:00:00.000Z', turns: [], config: { values: { [SessionConfigKey.SandboxEnabled]: AgentSandboxEnabledValue.On } } };
		resolution = {
			...resolution!,
			connection: new class extends mock<IAgentConnection>() {
				override dispatch(...args: Parameters<IAgentConnection['dispatch']>): void {
					dispatched.push(args);
				}
				override getSubscriptionUnmanaged<T extends StateComponents>(_kind: T, uri: URI): IAgentSubscription<ComponentToState[T]> | undefined {
					const value = (uri.toString() === chat ? chatState : undefined) as ComponentToState[T] | undefined;
					return { value, verifiedValue: value, onDidChange: Event.None, onWillApplyAction: Event.None, onDidApplyAction: Event.None };
				}
			},
		};
		const service = new NotificationService();
		stub(configurationService, 'updateValue').resolves();
		createNotification(resource, subscription, service);
		await instantiationService.invokeFunction(CommandsRegistry.getCommand(getDisableCommand(service))!.handler);

		assert.deepStrictEqual(dispatched, [[chat, { type: ActionType.ChatConfigChanged, config: { [SessionConfigKey.SandboxEnabled]: AgentSandboxEnabledValue.Off } }]]);
	});

	test('does not send a redundant session update when sandboxing is already off', async () => {
		const subscription = store.add(new TestSubscription());
		subscription.setValue(['Missing dependencies.']);
		subscription.setSandboxConfig('off', false);
		const service = new NotificationService();
		const update = stub(configurationService, 'updateValue').resolves();
		createNotification(resource, subscription, service);
		await instantiationService.invokeFunction(CommandsRegistry.getCommand(getDisableCommand(service))!.handler);
		assert.deepStrictEqual({ dispatched, writes: update.args }, {
			dispatched: [],
			writes: [[AgentSandboxSettingId.AgentSandboxEnabled, AgentSandboxEnabledValue.Off]],
		});
	});

	for (const readOnly of [false, true]) {
		test(`reports unavailable session updates without changing settings (readOnly=${readOnly})`, async () => {
			const subscription = store.add(new TestSubscription());
			subscription.setValue(['Missing dependencies.']);
			subscription.setSandboxConfig('on', true, readOnly);
			if (!readOnly) {
				resolution = undefined;
			}
			const service = new NotificationService();
			const update = stub(configurationService, 'updateValue').resolves();
			createNotification(resource, subscription, service);
			await assert.rejects(async () => instantiationService.invokeFunction(CommandsRegistry.getCommand(getDisableCommand(service))!.handler),
				readOnly ? /cannot be changed/ : /connection or configuration is unavailable/);
			assert.deepStrictEqual({ dispatched, writes: update.args }, { dispatched: [], writes: [] });
		});
	}

	test('uses renderer policy only for the local desktop ambient host and honors explicit host policy', () => {
		assert.ok(resolution);
		resolution = { ...resolution, connection: localHost };
		const subscription = store.add(new TestSubscription());
		subscription.setValue(['Missing dependencies.']);
		const service = new NotificationService();
		createNotification(resource, subscription, service);
		const initial = !!getDisableCommand(service);
		managedSandboxEnforced.set(true, undefined);
		const managed = !!getDisableCommand(service);
		subscription.setValue(['Missing dependencies.'], false);
		assert.deepStrictEqual([initial, managed, !!getDisableCommand(service)], [true, isWeb, true]);
	});

	for (const scenario of [
		{ name: 'remote host', ambient: false, remoteAuthority: undefined },
		{ name: 'remote workbench ambient host', ambient: true, remoteAuthority: 'ssh-remote+test' },
	]) {
		test(`does not apply renderer policy to a ${scenario.name} without host metadata`, async () => {
			assert.ok(resolution);
			if (scenario.ambient) {
				resolution = { ...resolution, connection: localHost };
			}
			remoteAuthority = scenario.remoteAuthority;
			managedSandboxEnforced.set(true, undefined);
			const subscription = store.add(new TestSubscription());
			subscription.setValue(['Missing dependencies.']);
			subscription.setSandboxConfig('on', true);
			const service = new NotificationService();
			const update = stub(configurationService, 'updateValue').resolves();
			createNotification(resource, subscription, service);
			await instantiationService.invokeFunction(CommandsRegistry.getCommand(getDisableCommand(service))!.handler);
			assert.deepStrictEqual({ dispatched, writes: update.args }, {
				dispatched: [['custom-host://opaque/session', { type: ActionType.SessionConfigChanged, config: { [SessionConfigKey.SandboxEnabled]: 'off' } }]],
				writes: [[AgentSandboxSettingId.AgentSandboxEnabled, AgentSandboxEnabledValue.Off]],
			});
		});
	}

	for (const scenario of [
		{ name: 'bypass is disallowed', allowBypass: false, value: 'on', confirmed: true },
		{ name: 'bypass has been revoked', allowBypass: false, value: 'off', confirmed: false },
	]) {
		test(`blocks a managed disable when ${scenario.name}`, async () => {
			const subscription = store.add(new TestSubscription());
			subscription.setValue(['Missing dependencies.'], false);
			const service = new NotificationService();
			const update = stub(configurationService, 'updateValue').resolves();
			createNotification(resource, subscription, service);
			const command = CommandsRegistry.getCommand(getDisableCommand(service))!;
			subscription.setValue(['Missing dependencies.'], true, scenario.allowBypass);
			subscription.setSandboxConfig(scenario.value, scenario.confirmed);
			await assert.rejects(async () => instantiationService.invokeFunction(command.handler), /required by your organization/);
			assert.deepStrictEqual({ hasLink: !!getDisableCommand(service), dispatched, writes: update.args }, {
				hasLink: false, dispatched: [], writes: [],
			});
		});
	}

	test('permits requesting a managed session bypass before runtime confirmation', async () => {
		const subscription = store.add(new TestSubscription());
		subscription.setValue(['Missing dependencies.'], true, true);
		subscription.setSandboxConfig('on', true);
		const service = new NotificationService();
		const update = stub(configurationService, 'updateValue').resolves();
		createNotification(resource, subscription, service);
		await instantiationService.invokeFunction(CommandsRegistry.getCommand(getDisableCommand(service))!.handler);
		assert.deepStrictEqual({ dispatched, writes: update.args }, {
			dispatched: [['custom-host://opaque/session', { type: ActionType.SessionConfigChanged, config: { [SessionConfigKey.SandboxEnabled]: 'off' } }]],
			writes: [[AgentSandboxSettingId.AgentSandboxEnabled, AgentSandboxEnabledValue.Off]],
		});
	});

	test('permits saving Off after an approved managed session opt-out', async () => {
		const subscription = store.add(new TestSubscription());
		subscription.setValue(['Missing dependencies.'], true, true);
		subscription.setSandboxConfig('off', false);
		const service = new NotificationService();
		const update = stub(configurationService, 'updateValue').resolves();
		createNotification(resource, subscription, service);
		const command = CommandsRegistry.getCommand(getDisableCommand(service))!;
		await instantiationService.invokeFunction(command.handler);
		assert.deepStrictEqual({ dispatched, writes: update.args }, {
			dispatched: [],
			writes: [[AgentSandboxSettingId.AgentSandboxEnabled, AgentSandboxEnabledValue.Off]],
		});
	});

	test('allows a fail-closed policy retry for the runtime to decide', async () => {
		const subscription = store.add(new TestSubscription());
		subscription.setValue(['Missing dependencies.'], true, false, true);
		subscription.setSandboxConfig('on', true);
		const service = new NotificationService();
		const update = stub(configurationService, 'updateValue').resolves();
		createNotification(resource, subscription, service);
		await instantiationService.invokeFunction(CommandsRegistry.getCommand(getDisableCommand(service))!.handler);
		assert.deepStrictEqual({ dispatched, writes: update.args }, {
			dispatched: [['custom-host://opaque/session', { type: ActionType.SessionConfigChanged, config: { [SessionConfigKey.SandboxEnabled]: 'off' } }]],
			writes: [[AgentSandboxSettingId.AgentSandboxEnabled, AgentSandboxEnabledValue.Off]],
		});
	});

	test('local bypass permission unlocks session opt-out', () => {
		assert.ok(resolution);
		resolution = { ...resolution, connection: localHost };
		managedSandboxEnforced.set(true, undefined);
		const subscription = store.add(new TestSubscription());
		subscription.setValue(['Missing dependencies.']);
		const service = new NotificationService();
		createNotification(resource, subscription, service);
		const initial = !!getDisableCommand(service);
		managedSandboxAllowsBypass.set(true, undefined);
		const allowed = !!getDisableCommand(service);
		subscription.setSandboxConfig('off', false);
		const confirmed = !!getDisableCommand(service);
		managedSandboxAllowsBypass.set(false, undefined);
		assert.deepStrictEqual([initial, allowed, confirmed, !!getDisableCommand(service)], [isWeb, true, true, isWeb]);
	});

	test('surfaces configuration update failures', async () => {
		const subscription = store.add(new TestSubscription());
		subscription.setValue(['Missing dependencies.']);
		const service = new NotificationService();
		stub(configurationService, 'updateValue').rejects(new Error('Settings are read-only'));
		createNotification(resource, subscription, service);
		const command = CommandsRegistry.getCommand(getDisableCommand(service))!;
		await assert.rejects(async () => instantiationService.invokeFunction(command.handler), /Settings are read-only/);
	});

	test('hides the disable link for a policy-controlled setting', () => {
		const subscription = store.add(new TestSubscription());
		subscription.setValue(['Missing dependencies.']);
		const service = new NotificationService();
		stub(configurationService, 'inspect').returns({
			policyValue: AgentSandboxEnabledValue.On,
		});
		createNotification(resource, subscription, service);
		assert.strictEqual(getDisableCommand(service), undefined);
	});

	test('disposal removes only this session notification and stops tracking', () => {
		const subscription = store.add(new TestSubscription());
		subscription.setValue(['Unsupported.']);
		const service = new NotificationService();
		const notification = createNotification(resource, subscription, service);
		const otherResource = URI.parse('vscode-chat-session://another-host/session-b');
		createNotification(otherResource, subscription, service);
		notification.dispose();
		subscription.setValue(['Still unsupported.']);
		assert.deepStrictEqual([...service.notifications.values()].map(value => value.sessionResources), [[otherResource]]);
	});

	test('unrelated session updates do not republish the notice', () => {
		const subscription = store.add(new TestSubscription());
		subscription.setValue(['Unsupported.']);
		const service = new NotificationService();
		createNotification(resource, subscription, service);
		subscription.setValue(['Unsupported.']);
		assert.strictEqual(service.updates, 1);
	});

	test('dismissed warnings stay hidden when diagnostics change, sandboxing toggles, or the connection recovers', () => {
		const subscription = store.add(new TestSubscription());
		subscription.setValue(['Install bubblewrap.']);
		const service = new NotificationService();
		createNotification(resource, subscription, service);
		service.dismissNotification(`agentHost.sandboxUnsupported.${resource.toString()}`);
		subscription.setValue(['Install bubblewrap.']);
		subscription.setValue(['Bubblewrap cannot create a namespace.']);
		subscription.setValue();
		subscription.setValue(['Install bubblewrap.']);
		subscription.setError();
		subscription.setValue(['Install bubblewrap.']);
		assert.deepStrictEqual({
			remaining: service.notifications.size,
			updates: service.updates,
		}, {
			remaining: 0,
			updates: 1,
		});
	});

	test('dismissal survives reopening a chat without suppressing other sessions', () => {
		const subscription = store.add(new TestSubscription());
		subscription.setValue(['Unsupported.']);
		const service = new NotificationService();
		const notification = createNotification(resource, subscription, service);
		service.dismissNotification(`agentHost.sandboxUnsupported.${resource.toString()}`);
		notification.dispose();
		createNotification(resource, subscription, service);
		const otherResource = URI.parse('vscode-chat-session://remote-provider/session-b');
		createNotification(otherResource, subscription, service);
		assert.deepStrictEqual([...service.notifications.values()].map(notification => notification.sessionResources), [[otherResource]]);
	});

	test('a new window notification service can show a previously dismissed session', () => {
		const subscription = store.add(new TestSubscription());
		subscription.setValue(['Unsupported.']);
		const service = new NotificationService();
		const notification = createNotification(resource, subscription, service);
		service.dismissNotification(`agentHost.sandboxUnsupported.${resource.toString()}`);
		notification.dispose();
		const reloadedService = new NotificationService();
		createNotification(resource, subscription, reloadedService);
		assert.deepStrictEqual([...reloadedService.notifications.values()].map(notification => notification.sessionResources), [[resource]]);
	});

	test('clears the notice on subscription failure and restores it after reconnect', () => {
		const subscription = store.add(new TestSubscription());
		subscription.setValue(['Unsupported.']);
		const service = new NotificationService();
		createNotification(resource, subscription, service);
		subscription.setError();
		const afterError = service.notifications.size;
		subscription.setValue(['Unsupported.']);
		assert.deepStrictEqual([afterError, service.notifications.size], [0, 1]);
	});
});
