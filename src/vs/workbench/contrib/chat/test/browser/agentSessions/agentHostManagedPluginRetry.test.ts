/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import type { IAgentManagedPluginRetryEntry } from '../../../../../../platform/agentHost/common/agent.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { INotification, INotificationService, Severity } from '../../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../../platform/notification/test/common/testNotificationService.js';
import { IProgressOptions, IProgressService } from '../../../../../../platform/progress/common/progress.js';
import { AGENT_HOST_RETRY_MANAGED_PLUGINS_COMMAND_ID } from '../../../browser/agentSessions/agentHost/agentHostManagedPluginRetry.js';

suite('AgentHostManagedPluginRetry', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const target = { provider: 'copilotcli', session: 'copilotcli:/owner', chat: 'copilotcli:/owner#peer' };

	async function retry(outcome: readonly IAgentManagedPluginRetryEntry[] | Error, args: unknown = target, chatEnabled = true) {
		const requests: unknown[] = [];
		const progress: unknown[] = [];
		const notifications: unknown[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IAgentHostService, upcastPartial<IAgentHostService>({
			retryManagedPlugins: async (provider, session, chat) => {
				requests.push([provider, session.toString(), chat?.toString()]);
				if (outcome instanceof Error) {
					throw outcome;
				}
				return outcome;
			},
		}));
		instantiationService.stub(IContextKeyService, upcastPartial<IContextKeyService>({ contextMatchesRules: () => chatEnabled }));
		instantiationService.stub(IProgressService, upcastPartial<IProgressService>({
			withProgress: async (options: IProgressOptions, task) => {
				progress.push({ telemetry: options.telemetry, title: options.title });
				return task({ report() { } });
			},
		}));
		instantiationService.stub(INotificationService, new class extends TestNotificationService {
			override notify(notification: INotification) {
				notifications.push({ severity: notification.severity, telemetry: notification.telemetry, message: notification.message });
				return super.notify(notification);
			}
		}());
		instantiationService.stub(ILogService, new NullLogService());
		const command = CommandsRegistry.getCommand(AGENT_HOST_RETRY_MANAGED_PLUGINS_COMMAND_ID);
		assert.ok(command);
		await instantiationService.invokeFunction(accessor => command.handler(accessor, args));
		return { requests, progress, notifications };
	}

	const progress = [{ telemetry: 'plugins.managed.retry', title: 'Preparing plugins required by your organization admin...' }];
	const request = [['copilotcli', 'copilotcli:/owner', 'copilotcli:/owner#peer']];

	test('reports the failed plugins with their errors as a warning', async () => {
		assert.deepStrictEqual(await retry([
			{ spec: 'security-guard@contoso', status: 'installed' },
			{ spec: 'linter@contoso', status: 'failed', error: 'network error' },
			{ spec: 'docs@contoso', status: 'deferred', error: 'Another session is changing plugins' },
			{ spec: 'audit@contoso', status: 'failed' },
		]), {
			requests: request,
			progress,
			notifications: [{
				severity: Severity.Warning,
				telemetry: 'plugins.managed.retry.complete',
				message: 'Some plugins required by your organization admin could not be prepared. linter@contoso: network error; audit@contoso',
			}],
		});
	});

	test('reports deferred and ready plugins as information', async () => {
		const deferred = await retry([{ spec: 'docs@contoso', status: 'deferred', error: 'Another session is changing plugins' }, { spec: 'linter@contoso', status: 'updated' }]);
		const ready = await retry([{ spec: 'linter@contoso', status: 'already_present' }, { spec: 'old@contoso', status: 'not_required' }]);
		assert.deepStrictEqual({ deferred: deferred.notifications, ready: ready.notifications }, {
			deferred: [{ severity: Severity.Info, telemetry: 'plugins.managed.retry.complete', message: 'Some plugins required by your organization admin will be prepared before your next message.' }],
			ready: [{ severity: Severity.Info, telemetry: 'plugins.managed.retry.complete', message: 'Plugins required by your organization admin are ready.' }],
		});
	});

	test('reports a retry error without throwing', async () => {
		assert.deepStrictEqual(await retry(new Error('Managed plugins are not prepared for this session')), {
			requests: request,
			progress,
			notifications: [{
				severity: Severity.Error,
				telemetry: 'plugins.managed.retry.error',
				message: 'Could not retry plugins required by your organization admin: Managed plugins are not prepared for this session',
			}],
		});
	});

	test('ignores malformed arguments and disabled chat', async () => {
		const malformed = await retry([], { provider: 'copilotcli', session: 'copilotcli:/owner' });
		const disabled = await retry([], target, false);
		assert.deepStrictEqual({ malformed, disabled }, {
			malformed: { requests: [], progress: [], notifications: [] },
			disabled: { requests: [], progress: [], notifications: [] },
		});
	});
});
