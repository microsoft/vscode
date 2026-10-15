/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { stub, restore } from 'sinon';
import { renderMarkdown } from '../../../../../../base/browser/markdownRenderer.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { isMarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { isWeb } from '../../../../../../base/common/platform.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService, IAgentHostSessionResolution } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentHostEnablementService } from '../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IAgentConnection, IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { agentSandboxDiagnosticsMetaKey } from '../../../../../../platform/agentHost/common/meta/agentSandboxDiagnostics.js';
import { withSessionSandboxPolicy } from '../../../../../../platform/agentHost/common/meta/agentSandboxPolicyMeta.js';
import { withChatSandboxState, withSessionSandboxState } from '../../../../../../platform/agentHost/common/meta/agentSandboxStateMeta.js';
import { SessionConfigKey } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { createSessionState, SessionState, SessionStatus, StateComponents, type ChatState, type ComponentToState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { AgentSandboxEnabledValue, AgentSandboxSettingId } from '../../../../../../platform/sandbox/common/settings.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { AgentHostSandboxNotification } from '../../../browser/agentSessions/agentHost/agentHostSandboxNotification.js';
import { ChatInputNotificationSeverity, IChatInputNotification, IChatInputNotificationService } from '../../../browser/widget/input/chatInputNotificationService.js';

suite('AgentHostSandboxNotification', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const resource = URI.parse('vscode-chat-session://remote-provider/session-a');
	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let resolution: IAgentHostSessionResolution | undefined;
	let dispatched: Parameters<IAgentConnection['dispatch']>[];
	let localHost: IAgentHostService;
	let remoteAuthority: string | undefined;
	const managedSandboxEnforced = observableValue('managedSandboxEnforced', false);
	const managedSandboxAllowsBypass = observableValue('managedSandboxAllowsBypass', false);

	setup(() => {
		managedSandboxEnforced.set(false, undefined);
		managedSandboxAllowsBypass.set(false, undefined);
		configurationService = new TestConfigurationService();
		instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configurationService);
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
			},
		};
		instantiationService.stub(IAgentHostConnectionsService, new class extends mock<IAgentHostConnectionsService>() {
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

	function createNotification(resource: URI, subscription: TestSubscription, service: NotificationService): AgentHostSandboxNotification {
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
