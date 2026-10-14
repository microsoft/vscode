/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { RemoteAgentHostConnectionStatus } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IAgentHostConnectProgress, IAgentHostSessionsProvider } from '../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { MANAGE_REMOTE_AGENT_HOSTS_COMMAND_ID, SHOW_CONNECTION_DIAGNOSTICS_COMMAND_ID } from '../../../../common/sessionCommands.js';
import { ProjectBoardRemoteRecovery } from '../../browser/projectBoardRemoteRecovery.js';

suite('ProjectBoardRemoteRecovery', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function create() {
		const connection = observableValue<RemoteAgentHostConnectionStatus>('connection', RemoteAgentHostConnectionStatus.disconnected);
		const progress = store.add(new Emitter<IAgentHostConnectProgress>());
		const state = {
			connects: 0, reconnects: 0, gate: undefined as DeferredPromise<void> | undefined,
			error: undefined as Error | undefined, commandError: undefined as Error | undefined, stayOffline: false,
			errors: [] as string[], warnings: [] as string[], logs: [] as unknown[], commands: [] as string[],
		};
		const started = new DeferredPromise<void>();
		const provider = new class extends mock<IAgentHostSessionsProvider>() {
			override readonly id = 'agenthost-owned';
			override readonly label = 'Owned tunnel';
			override readonly remoteAddress = 'tunnel:owned';
			override readonly connectionStatus = connection;
			override readonly onDidReportConnectProgress = progress.event;
			override async connect(): Promise<void> {
				state.connects++;
				await started.complete();
				await state.gate?.p;
				if (state.error) {
					throw state.error;
				}
				if (!state.stayOffline) {
					connection.set(RemoteAgentHostConnectionStatus.connected, undefined);
				}
			}
			override reconnectNow(): void { state.reconnects++; }
		}();
		const current: { provider: ISessionsProvider | undefined } = { provider };
		const recovery = store.add(new ProjectBoardRemoteRecovery(
			new class extends mock<ISessionsProvidersService>() {
				override readonly onDidChangeProviders = Event.None;
				override getProvider<T extends ISessionsProvider>(id: string): T | undefined {
					return id === current.provider?.id ? current.provider as T : undefined;
				}
			}(),
			new class extends mock<ICommandService>() {
				override async executeCommand<T>(id: string): Promise<T | undefined> {
					state.commands.push(id);
					if (state.commandError) {
						throw state.commandError;
					}
					return undefined;
				}
			}(),
			new class extends mock<INotificationService>() {
				override error(message: string | Error): void { state.errors.push(String(message)); }
				override warn(message: string): void { state.warnings.push(message); }
			}(),
			new class extends NullLogService {
				override error(message: string | Error): void { state.logs.push(message); }
			}(),
		));
		return { provider, current, recovery, connection, progress, state, started };
	}

	test('shares one attempt across callers and ignores another host progress', async () => {
		const h = create();
		h.state.gate = new DeferredPromise<void>();
		const first = h.recovery.resolve(h.provider.id);
		const second = h.recovery.resolve(h.provider.id);
		assert.strictEqual(first, second);
		await h.started.p;
		const initial = h.recovery.progress.get().get(h.provider.id);
		h.progress.fire({ connectionKey: 'tunnel:other', message: 'Wrong host' });
		assert.strictEqual(h.recovery.progress.get().get(h.provider.id), initial);
		h.progress.fire({ connectionKey: h.provider.remoteAddress, message: 'Authenticating with existing account' });
		assert.strictEqual(h.recovery.progress.get().get(h.provider.id), 'Authenticating with existing account');
		await h.state.gate.complete();
		await Promise.all([first, second]);
		assert.deepStrictEqual({ calls: h.state.connects, state: h.connection.get().kind, pending: h.recovery.progress.get().size, commands: h.state.commands }, {
			calls: 1, state: 'connected', pending: 0, commands: [],
		});
	});

	test('failure is explicit and retryable, and fulfilment while disconnected is not recovery', async () => {
		const h = create();
		h.state.error = new Error('Tunnel host is offline');
		await h.recovery.resolve(h.provider.id);
		assert.ok(h.state.errors[0].includes('Tunnel host is offline'));
		assert.strictEqual(h.state.logs.length, 1);
		assert.strictEqual(h.recovery.progress.get().size, 0);
		h.state.error = undefined;
		h.state.stayOffline = true;
		await h.recovery.resolve(h.provider.id);
		assert.match(h.state.warnings[0], /still unavailable/);
		h.state.stayOffline = false;
		await h.recovery.resolve(h.provider.id);
		assert.deepStrictEqual({ calls: h.state.connects, state: h.connection.get().kind, pending: h.recovery.progress.get().size }, {
			calls: 3, state: 'connected', pending: 0,
		});
	});

	test('does not tear down an already connecting or reconnecting host', async () => {
		const h = create();
		h.connection.set(RemoteAgentHostConnectionStatus.connecting, undefined);
		await h.recovery.resolve(h.provider.id);
		h.connection.set(RemoteAgentHostConnectionStatus.reconnecting, undefined);
		await h.recovery.resolve(h.provider.id);
		assert.deepStrictEqual({ connects: h.state.connects, retries: h.state.reconnects, commands: h.state.commands }, { connects: 0, retries: 1, commands: [] });
	});

	test('missing, incompatible and healthy hosts use native management instead of reconnecting', async () => {
		const h = create();
		h.connection.set(RemoteAgentHostConnectionStatus.connected, undefined);
		await h.recovery.resolve(h.provider.id);
		h.connection.set({ kind: 'incompatible', message: 'Old protocol', supportedByClient: ['1'] }, undefined);
		await h.recovery.resolve(h.provider.id);
		h.current.provider = undefined;
		await h.recovery.resolve(h.provider.id);
		assert.deepStrictEqual({ connects: h.state.connects, commands: h.state.commands }, {
			connects: 0, commands: [MANAGE_REMOTE_AGENT_HOSTS_COMMAND_ID, MANAGE_REMOTE_AGENT_HOSTS_COMMAND_ID, MANAGE_REMOTE_AGENT_HOSTS_COMMAND_ID],
		});
	});

	test('diagnostics errors are reported and cancellation permits another attempt', async () => {
		const h = create();
		await h.recovery.showDetails();
		h.state.commandError = new Error('Diagnostics failed');
		await h.recovery.showDetails();
		h.state.error = new CancellationError();
		await h.recovery.resolve(h.provider.id);
		assert.deepStrictEqual({ commands: h.state.commands, errors: h.state.errors.length, pending: h.recovery.progress.get().size }, {
			commands: [SHOW_CONNECTION_DIAGNOSTICS_COMMAND_ID, SHOW_CONNECTION_DIAGNOSTICS_COMMAND_ID], errors: 1, pending: 0,
		});
	});

	test('disposal releases listeners and suppresses late connection failure UI', async () => {
		const h = create();
		h.state.gate = new DeferredPromise<void>();
		h.state.error = new Error('Late failure');
		const attempt = h.recovery.resolve(h.provider.id);
		await h.started.p;
		assert.strictEqual(h.progress.hasListeners(), true);
		h.recovery.dispose();
		assert.strictEqual(h.progress.hasListeners(), false, 'Disposal must release progress listeners even while the native connect is pending');
		await h.state.gate.complete();
		await attempt;
		assert.deepStrictEqual(h.state.errors, []);
	});
});
