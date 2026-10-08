/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationChangeEvent } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { ChatInputNotificationActionKind, ChatInputNotificationSeverity, IChatInputNotification, IChatInputNotificationContext, IChatInputNotificationService } from '../../../../../../workbench/contrib/chat/browser/widget/input/chatInputNotificationService.js';
import { DevContainerGitCredentialForwardingSettingId } from '../../../../../common/devContainerAgentHostService.js';
import { DevContainerGitCredentialForwarding } from '../../browser/devContainerGitCredentialForwarding.js';

suite('Dev Container Git credential forwarding consent', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const workspace = URI.file('/project');
	const containerKey = ':devcontainer:first';
	const address = 'devcontainer:connection';

	function setup(mode: 'off' | 'prompt' | 'on' | undefined, answers: boolean[] = []) {
		const configuration = new TestConfigurationService({ [DevContainerGitCredentialForwardingSettingId]: mode });
		store.add(configuration.onDidChangeConfigurationEmitter);
		const instantiationService = store.add(new TestInstantiationService());
		const notices: IChatInputNotification[] = [];
		const active = new Map<string, IChatInputNotification>();
		const resolutionChanged = store.add(new Emitter<void>());
		let resourcesResolved = true;
		let refreshes = 0;
		const respond = (notification: IChatInputNotification, allowed: boolean) => {
			const action = notification.actions[allowed ? 0 : 1];
			assert.strictEqual(action.kind, ChatInputNotificationActionKind.Command);
			if (action.kind !== ChatInputNotificationActionKind.Command) {
				assert.fail('Expected an approval command');
			}
			const command = CommandsRegistry.getCommand(action.commandId);
			assert.ok(command);
			instantiationService.invokeFunction(command.handler);
		};
		const notifications = new class extends mock<IChatInputNotificationService>() {
			override setNotification(notification: IChatInputNotification): void {
				notices.push(notification);
				active.set(notification.id, notification);
				const answer = answers.shift();
				if (answer !== undefined) { respond(notification, answer); }
			}
			override deleteNotification(id: string): void { active.delete(id); }
			override refresh(): void { refreshes++; }
		}();
		const connections = new class extends mock<IAgentHostConnectionsService>() {
			override readonly onDidChangeSessionResolution = resolutionChanged.event;
			override resolveSessionResourceIdentity(resource: URI) {
				return resourcesResolved && resource.scheme === 'opaque-chat' ? {
					connectionAuthority: 'container',
					connectionAddress: resource.path === '/other' ? 'devcontainer:another' : address,
					backendSession: URI.parse('ahp-session:/opaque'),
				} : undefined;
			}
		}();
		const forwarding = store.add(new DevContainerGitCredentialForwarding(configuration, notifications, connections, new NullLogService()));
		const request = (key = containerKey, token = CancellationToken.None, connectionAddress = address) => forwarding.request(workspace, key, connectionAddress, token);
		return {
			configuration, notices, active, forwarding, request, respond, resolutionChanged,
			setResourcesResolved: (resolved: boolean) => { resourcesResolved = resolved; },
			getRefreshes: () => refreshes,
		};
	}

	async function changeMode(configuration: TestConfigurationService, mode: 'off' | 'prompt' | 'on'): Promise<void> {
		await configuration.setUserConfiguration(DevContainerGitCredentialForwardingSettingId, mode);
		configuration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration(key: string): boolean { return key === DevContainerGitCredentialForwardingSettingId; }
		}());
	}

	test('starting and reconnecting installs a gated helper without showing an approval', async () => {
		const { notices, forwarding, request } = setup(undefined, [true]);
		const states: boolean[] = [];
		const first = store.add(await forwarding.registerConnection(async enabled => { states.push(enabled); }));
		const startupNotices = notices.length;
		const allowed = await request();
		first.dispose();
		store.add(await forwarding.registerConnection(async enabled => { states.push(enabled); }));
		const reconnected = await request();
		assert.deepStrictEqual({
			startupNotices, allowed, reconnected, states, notices: notices.length,
			disclosure: typeof notices[0].description === 'string' && notices[0].description.includes('all sessions and processes'),
			dismissible: notices[0].dismissible,
			autoDismissOnMessage: notices[0].autoDismissOnMessage,
			primaryActions: notices[0].actions.map(action => action.primary),
			severity: notices[0].severity,
		}, {
			startupNotices: 0, allowed: true, reconnected: true, states: [true, true], notices: 1,
			disclosure: true, dismissible: false, autoDismissOnMessage: false,
			primaryActions: [true, false],
			severity: ChatInputNotificationSeverity.Info,
		});
	});

	test('approval appears only in chats belonging to the requesting container connection', async () => {
		const { notices, request, respond } = setup('prompt');
		const pending = request();
		const notice = notices[0];
		const matches = [URI.parse('opaque-chat:/requested'), URI.parse('opaque-chat:/other'), URI.parse('unrelated:/requested')].map(resource =>
			notice.when?.(new class extends mock<IChatInputNotificationContext>() { override readonly sessionResource = resource; }()));
		respond(notice, false);
		await pending;
		assert.deepStrictEqual(matches, [true, false, false]);
	});

	test('pending approvals refresh when the session owning connection becomes available', async () => {
		const { notices, request, respond, resolutionChanged, setResourcesResolved, getRefreshes } = setup('prompt');
		setResourcesResolved(false);
		const pending = request();
		const context = new class extends mock<IChatInputNotificationContext>() { override readonly sessionResource = URI.parse('opaque-chat:/requested'); }();
		const before = notices[0].when?.(context);
		setResourcesResolved(true);
		resolutionChanged.fire();
		const after = notices[0].when?.(context);
		respond(notices[0], false);
		await pending;
		resolutionChanged.fire();
		assert.deepStrictEqual({ before, after, refreshes: getRefreshes() }, { before: false, after: true, refreshes: 1 });
	});

	test('off and on never show approvals and select the corresponding helper and access state', async () => {
		const results = [];
		for (const mode of ['off', 'on'] as const) {
			const { notices, forwarding, request } = setup(mode);
			const states: boolean[] = [];
			store.add(await forwarding.registerConnection(async enabled => { states.push(enabled); }));
			const allowed = await request();
			results.push({ mode, notices: notices.length, states, allowed });
		}
		assert.deepStrictEqual(results, [
			{ mode: 'off', notices: 0, states: [false], allowed: false },
			{ mode: 'on', notices: 0, states: [true], allowed: true },
		]);
	});

	test('a denial is remembered for subsequent lookups and removes the approval', async () => {
		const { notices, active, request } = setup('prompt', [false]);
		const decisions = [];
		for (let i = 0; i < 3; i++) { decisions.push(await request()); }
		assert.deepStrictEqual({ decisions, notices: notices.length, active: active.size }, { decisions: [false, false, false], notices: 1, active: 0 });
	});

	test('decisions are specific to source host and actual container, and are not persisted', async () => {
		const { request, notices } = setup('prompt', [true, false, false]);
		const decisions = [
			await request('host-one:devcontainer:first'),
			await request('host-two:devcontainer:first'),
			await request('host-one:devcontainer:replacement'),
		];
		const restored = setup('prompt', [false]);
		decisions.push(await restored.request('host-one:devcontainer:first'));
		assert.deepStrictEqual({ notices: notices.length + restored.notices.length, decisions }, { notices: 4, decisions: [true, false, false, false] });
	});

	test('switching off revokes a grant and switching back to prompt defers new consent until a lookup', async () => {
		const { forwarding, configuration, notices, request } = setup('prompt', [true, false]);
		const states: boolean[] = [];
		const off = new DeferredPromise<void>();
		store.add(await forwarding.registerConnection(async enabled => {
			states.push(enabled);
			if (!enabled) { void off.complete(); }
		}));
		await request();
		await changeMode(configuration, 'off');
		await off.p;
		const deniedWhileOff = await request();
		await changeMode(configuration, 'prompt');
		const noticesBeforeLookup = notices.length;
		const allowed = await request();
		assert.deepStrictEqual({ states, deniedWhileOff, allowed, noticesBeforeLookup, notices: notices.length }, {
			states: [true, false, true], deniedWhileOff: false, allowed: false, noticesBeforeLookup: 1, notices: 2,
		});
	});

	test('concurrent lookups share one approval and wait for its answer', async () => {
		const { notices, request, respond } = setup('prompt');
		let approved = 0;
		const lookups = [1, 2].map(() => request().then(allowed => {
			if (allowed) { approved++; }
			return allowed;
		}));
		const before = { notices: notices.length, approved };
		respond(notices[0], true);
		const decisions = await Promise.all(lookups);
		assert.deepStrictEqual({ before, notices: notices.length, approved, decisions }, {
			before: { notices: 1, approved: 0 }, notices: 1, approved: 2, decisions: [true, true],
		});
	});

	test('canceling the first lookup does not cancel another live waiter', async () => {
		const { notices, active, request, respond } = setup('prompt');
		const tokenSource = store.add(new CancellationTokenSource());
		const first = request(containerKey, tokenSource.token);
		const second = request();
		const rejected = assert.rejects(first, /Canceled/);
		tokenSource.cancel();
		await rejected;
		const visibleBeforeApproval = active.size;
		respond(notices[0], true);
		assert.deepStrictEqual({ visibleBeforeApproval, allowed: await second, notices: notices.length, active: active.size }, {
			visibleBeforeApproval: 1, allowed: true, notices: 1, active: 0,
		});
	});

	test('canceling all waiters removes the approval and its commands without granting access', async () => {
		const { notices, active, request } = setup('prompt', []);
		const tokenSource = store.add(new CancellationTokenSource());
		const pending = request(containerKey, tokenSource.token);
		const rejected = assert.rejects(pending, /Canceled/);
		const commandIds = notices[0].actions.map(action => {
			if (action.kind !== ChatInputNotificationActionKind.Command) { assert.fail('Expected a command'); }
			return action.commandId;
		});
		tokenSource.cancel();
		await rejected;
		assert.deepStrictEqual({ active: active.size, commands: commandIds.map(id => CommandsRegistry.getCommand(id)) }, {
			active: 0, commands: [undefined, undefined],
		});
	});

	test('revocation removes a pending approval and requires a new decision on the next lookup', async () => {
		const { notices, active, request, configuration, respond } = setup('prompt');
		const pending = request();
		await changeMode(configuration, 'off');
		const revoked = await pending;
		const activeAfterRevocation = active.size;
		await changeMode(configuration, 'prompt');
		const next = request();
		respond(notices[1], false);
		assert.deepStrictEqual({ revoked, activeAfterRevocation, allowed: await next, notices: notices.length }, {
			revoked: false, activeAfterRevocation: 0, allowed: false, notices: 2,
		});
	});
});
