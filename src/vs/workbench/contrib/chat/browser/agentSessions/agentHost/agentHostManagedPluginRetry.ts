/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from '../../../../../../base/common/errorMessage.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import type { IAgentManagedPluginRetryEntry } from '../../../../../../platform/agentHost/common/agent.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService, Severity } from '../../../../../../platform/notification/common/notification.js';
import { NotificationTelemetryId } from '../../../../../../platform/notification/common/notificationTelemetry.js';
import { IProgressService, ProgressLocation } from '../../../../../../platform/progress/common/progress.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';

export const AGENT_HOST_RETRY_MANAGED_PLUGINS_COMMAND_ID = 'workbench.action.chat.agentHost.retryManagedPlugins';

/**
 * The chat whose plugin preparation failed, carried as the argument of the
 * Retry link. The session and chat are the host's opaque backend resources.
 */
export interface IAgentHostManagedPluginRetryTarget {
	readonly provider: string;
	readonly session: string;
	readonly chat: string;
}

function isManagedPluginRetryTarget(value: unknown): value is IAgentHostManagedPluginRetryTarget {
	const target = value as Partial<IAgentHostManagedPluginRetryTarget> | undefined;
	return typeof target === 'object' && target !== null
		&& typeof target.provider === 'string' && typeof target.session === 'string' && typeof target.chat === 'string';
}

/**
 * Describes the outcome of a retry. A failed plugin makes the outcome a
 * warning that lists each failure as `spec: error`. A deferred plugin is not a
 * failure: the runtime prepares it again before the next message.
 */
function describeManagedPluginRetry(plugins: readonly IAgentManagedPluginRetryEntry[]): { readonly severity: Severity; readonly message: string } {
	const failed = plugins.filter(plugin => plugin.status === 'failed');
	if (failed.length > 0) {
		const details = failed.map(plugin => plugin.error ? `${plugin.spec}: ${plugin.error}` : plugin.spec).join('; ');
		return {
			severity: Severity.Warning,
			message: localize('agentHost.managedPluginRetry.failed', "Some plugins required by your organization admin could not be prepared. {0}", details),
		};
	}
	if (plugins.some(plugin => plugin.status === 'deferred')) {
		return {
			severity: Severity.Info,
			message: localize('agentHost.managedPluginRetry.deferred', "Some plugins required by your organization admin will be prepared before your next message."),
		};
	}
	return {
		severity: Severity.Info,
		message: localize('agentHost.managedPluginRetry.ready', "Plugins required by your organization admin are ready."),
	};
}

registerAction2(class RetryManagedPluginsAction extends Action2 {
	constructor() {
		super({
			id: AGENT_HOST_RETRY_MANAGED_PLUGINS_COMMAND_ID,
			title: localize2('agentHost.managedPluginRetry.title', "Retry Plugins Required by Your Organization"),
			f1: false,
			precondition: ChatContextKeys.enabled,
		});
	}

	async run(accessor: ServicesAccessor, target: unknown): Promise<void> {
		const agentHostService = accessor.get(IAgentHostService);
		const contextKeyService = accessor.get(IContextKeyService);
		const progressService = accessor.get(IProgressService);
		const notificationService = accessor.get(INotificationService);
		const logService = accessor.get(ILogService);
		// Commands run from links do not check the precondition.
		if (!contextKeyService.contextMatchesRules(ChatContextKeys.enabled) || !isManagedPluginRetryTarget(target)) {
			return;
		}

		let plugins: readonly IAgentManagedPluginRetryEntry[];
		try {
			if (!agentHostService.retryManagedPlugins) {
				throw new Error(localize('agentHost.managedPluginRetry.unsupported', "This agent host does not support retrying plugins."));
			}
			plugins = await progressService.withProgress({
				location: ProgressLocation.Notification,
				telemetry: NotificationTelemetryId.PluginManagedRetry,
				title: localize('agentHost.managedPluginRetry.progress', "Preparing plugins required by your organization admin..."),
			}, () => agentHostService.retryManagedPlugins!(target.provider, URI.parse(target.session), URI.parse(target.chat)));
		} catch (error) {
			logService.error('[AgentHost] Retrying managed plugins failed', error);
			notificationService.notify({
				severity: Severity.Error,
				telemetry: NotificationTelemetryId.PluginManagedRetryError,
				message: localize('agentHost.managedPluginRetry.error', "Could not retry plugins required by your organization admin: {0}", toErrorMessage(error)),
			});
			return;
		}

		notificationService.notify({
			...describeManagedPluginRetry(plugins),
			telemetry: NotificationTelemetryId.PluginManagedRetryComplete,
		});
	}
});
