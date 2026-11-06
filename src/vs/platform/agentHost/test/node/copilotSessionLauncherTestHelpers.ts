/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { stub } from 'sinon';
import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import type { IFileService } from '../../../files/common/files.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { type ITelemetryService, TelemetryLevel } from '../../../telemetry/common/telemetry.js';
import type { IAgentHostManagedSettingsPermissions } from '../../common/agentHostManagedSettings.js';
import type { IAgentHostOTelService } from '../../common/otel/agentHostOTelService.js';
import { buildDefaultChatUri } from '../../common/state/sessionState.js';
import type { IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import type { IAgentHostManagedSettingsService } from '../../node/agentHostManagedSettingsService.js';
import type { IAgentHostSessionOpenTelemetry } from '../../node/agentHostSessionOpenTelemetry.js';
import type { IAgentHostTerminalManager } from '../../node/agentHostTerminalManager.js';
import { ByokLmBridgeRegistry } from '../../node/byokLmBridgeRegistry.js';
import { CopilotSessionLauncher, type ICopilotSessionRuntime } from '../../node/copilot/copilotSessionLauncher.js';

export const testRuntime: ICopilotSessionRuntime = {
	chatUri: URI.parse(buildDefaultChatUri('copilot:/sess-1')),
	launchOwner: URI.parse('copilot:/sess-1'),
	getLaunchSandboxConfig: () => undefined,
	applyLaunchSandbox: async session => { await session.rpc.options.update({ sandboxConfig: { enabled: false } }); },
	handlePermissionRequest: async () => { throw new Error('Unexpected permission request'); },
	handleExitPlanModeRequest: async () => { throw new Error('Unexpected exit plan mode request'); },
	handleUserInputRequest: async () => { throw new Error('Unexpected user input request'); },
	handleElicitationRequest: async () => { throw new Error('Unexpected elicitation request'); },
	adoptLaunchConnectorReconcile: () => { },
	handleMcpAuthRequest: async () => { throw new Error('Unexpected MCP auth request'); },
	requestUnsandboxedCommandConfirmation: async () => false,
	handlePreToolUse: async () => { },
	handlePostToolUse: async () => undefined,
	handlePostToolUseFailure: () => undefined,
	handleUserPromptSubmitted: () => undefined,
	createClientSdkTools: () => [],
	createServerSdkTools: () => [],
	reloadExtensions: async () => { },
};

export const noopSessionOpenTelemetry: IAgentHostSessionOpenTelemetry = {
	_serviceBrand: undefined,
	withSubscription: async (_resource, operation) => operation({
		servedFromMemory: undefined,
		setServedFromMemory: () => { },
		restoreStarted: () => { },
		restoreCompleted: () => { },
		setSession: () => { },
	}),
	withSdkResume: async (_resource, operation) => operation(),
	sdkResumeFallbackCreated: () => { },
};

export function createTestLauncher(managedSettingsPermissions?: IAgentHostManagedSettingsPermissions, rootValues: Record<string, unknown> = {}, logService: ILogService = new NullLogService(), sessionOpenTelemetry: IAgentHostSessionOpenTelemetry = noopSessionOpenTelemetry, configuration?: IAgentConfigurationService, telemetryService?: ITelemetryService, fileService: IFileService = upcastPartial<IFileService>({})): CopilotSessionLauncher {
	const configurationService = configuration ?? upcastPartial<IAgentConfigurationService>({
		getRootValue: stub().callsFake((_schema: unknown, key: string) => rootValues[key]),
		getRootConfigValues: () => rootValues,
		getSessionConfigValues: () => undefined,
		getChatConfigValues: () => undefined,
		resolveConfigurationOwner: (session: string) => session,
		getSessionSandboxPolicy: () => undefined,
		getSessionSandboxEnabled: () => undefined,
		getChatSandboxEnabled: () => undefined,
		setSessionSandboxPolicy: () => { },
		setChatSandboxEnabled: () => { },
		rejectChatSandboxChange: () => { },
	});
	return new CopilotSessionLauncher(
		configurationService,
		upcastPartial<IAgentHostManagedSettingsService>({ permissions: managedSettingsPermissions ?? {} }),
		upcastPartial<IAgentHostTerminalManager>({}),
		logService,
		fileService,
		{ _serviceBrand: undefined, onDidCapTools: Event.None, start: async () => { throw new Error('Unexpected proxy start'); }, dispose: () => { } },
		new ByokLmBridgeRegistry(),
		upcastPartial<IAgentHostOTelService>({
			_serviceBrand: undefined,
			getSessionTraceContext: () => undefined,
			releaseSessionTraceContext: () => { },
			withTraceContext: (_context, fn) => fn(),
		}),
		sessionOpenTelemetry,
		telemetryService ?? upcastPartial<ITelemetryService>({ telemetryLevel: TelemetryLevel.USAGE }),
	);
}
