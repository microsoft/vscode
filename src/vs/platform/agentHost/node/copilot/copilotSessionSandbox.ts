/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AttributedPermissionResult, CopilotClient, CopilotSession, PermissionRequest, PermissionRequestResult } from '@github/copilot-sdk';
import { Sequencer } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { getErrorMessage } from '../../../../base/common/errors.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { OperatingSystem } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../log/common/log.js';
import { normalizeSandboxFileSystemPath } from '../../../sandbox/common/settings.js';
import type { IAgentPermissionResponseContext } from '../../common/agent.js';
import { measureAgentProviderOperation } from '../../common/agentHostProviderTiming.js';
import type { IAgentProviderSendStageRecorder } from '../../common/agentHostTelemetry.js';
import { CopilotCliConfigKey, copilotCliConfigSchema } from '../../common/copilotCliConfig.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { AgentHostSandboxConfigKey, AgentHostSandboxKey, sandboxConfigSchema } from '../../common/sandboxConfigSchema.js';
import type { ISandboxPathGrant } from '../../common/sandboxPathGrant.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { getVSCodeSandboxReadRoots } from '../../common/vscodeSandboxPaths.js';
import { IAgentConfigurationService, type IAgentChatConfigurationTarget } from '../agentConfigurationService.js';
import { getSessionSandboxConfig } from '../sessionSandbox.js';
import type { ActionOrigin } from '../../common/state/sessionActions.js';
import { attributePermissionResult } from './copilotPermissionAttribution.js';
import { CopilotSandboxDiagnostics } from './copilotSandboxDiagnostics.js';
import { applySandboxConfig } from './copilotSessionLauncher.js';
import type { ShellManager } from './copilotShellTools.js';
import { buildSandboxConfigForSdk, type SandboxConfig } from './sandboxConfigForSdk.js';

/** A config change of the chat this SDK session runs. */
interface ISandboxConfigChange {
	readonly config: Record<string, unknown>;
	readonly origin: ActionOrigin | undefined;
}

interface ICopilotSessionSandboxOptions {
	readonly sessionId: string;
	/** The owner the SDK session was launched for; it configures the running process until the relaunch. */
	readonly ownerSession: URI;
	/** The chat this SDK session runs; the sandbox selection and applied state are the chat's. */
	readonly chat: URI;
	/** Where a rejected selection is written back: the chat under its current owner, where the change came from. */
	readonly getConfigWriteTarget: () => IAgentChatConfigurationTarget;
	readonly platform: NodeJS.Platform;
	readonly getSession: () => CopilotSession;
	readonly getHostSupport: () => ReturnType<CopilotClient['rpc']['sandbox']['getHostSupport']>;
	readonly getShellInitDirectory: () => URI | undefined;
	readonly shellManager: ShellManager | undefined;
}

/** Owns sandbox configuration, request-bound approvals, and diagnostics for one SDK session. */
export class CopilotSessionSandbox extends Disposable {
	private readonly _requests = new Map<string, string>();
	private readonly _pendingPathGrants = new Map<string, ISandboxPathGrant>();
	private readonly _configSequencer = new Sequencer();
	private readonly _diagnostics: CopilotSandboxDiagnostics;
	private _configUpdateDeferred = false;
	private _disabledForSession = false;

	constructor(
		private readonly _options: ICopilotSessionSandboxOptions,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._diagnostics = this._register(instantiationService.createInstance(CopilotSandboxDiagnostics, _options.ownerSession.toString(), _options.getHostSupport));
	}

	setPendingRequest(toolCallId: string, requestId: string): void {
		this._requests.set(toolCallId, requestId);
	}

	getPendingRequestId(toolCallId: string): string | undefined {
		return this._requests.get(toolCallId);
	}

	completePendingRequest(toolCallId: string, requestId: string | undefined): void {
		if (this._requests.get(toolCallId) === requestId) {
			this._requests.delete(toolCallId);
		}
	}

	clearPendingRequests(): void {
		this._requests.clear();
	}

	beginPathGrant(toolCallId: string, request: PermissionRequest): ISandboxPathGrant | undefined {
		const grant = request.managedApprovalRequired !== true && (request.kind === 'read' || request.kind === 'write' || request.kind === 'shell')
			? request.sandboxPathGrant
			: undefined;
		if (grant) {
			this._pendingPathGrants.set(toolCallId, grant);
		}
		return grant;
	}

	/** Returns whether the caller needs to synchronize configuration deferred by this permission request. */
	finishPermissionRequest(toolCallId: string | undefined, requestId: string | undefined, grant: ISandboxPathGrant | undefined): boolean {
		if (toolCallId) {
			this.completePendingRequest(toolCallId, requestId);
			if (grant && this._pendingPathGrants.get(toolCallId) === grant) {
				this._pendingPathGrants.delete(toolCallId);
			}
		}
		if (!this._pendingPathGrants.size && this._configUpdateDeferred && !this._store.isDisposed) {
			this._configUpdateDeferred = false;
			return true;
		}
		return false;
	}

	/** Includes settings spellings normalized by the host before they reached the SDK. */
	pathGrantForSettings(grant: ISandboxPathGrant): ISandboxPathGrant {
		if (!grant.removedReadonlyPaths?.length) {
			return grant;
		}
		const removed = new Set(grant.removedReadonlyPaths);
		const paths = this._configurationService.getRootValue(sandboxConfigSchema, AgentHostSandboxConfigKey.Sandbox)?.[AgentHostSandboxKey.UserConfiguredPaths]?.readonlyPaths ?? [];
		const os = this._options.platform === 'win32' ? OperatingSystem.Windows : this._options.platform === 'darwin' ? OperatingSystem.Macintosh : OperatingSystem.Linux;
		return { ...grant, removedReadonlyPaths: [...removed, ...paths.filter(path => removed.has(normalizeSandboxFileSystemPath(path, os)))] };
	}

	async grantPathForPendingRequest(toolCallId: string, requestId: string | undefined, grant: ISandboxPathGrant | undefined, context: IAgentPermissionResponseContext, token: CancellationToken): Promise<PermissionRequestResult | AttributedPermissionResult> {
		try {
			return await this._configSequencer.queue(async () => {
				if (!context.sandboxPathGrantSaved) {
					throw new Error(localize('copilot.permission.grant.unsupportedClient', "This client did not save the sandbox path grant. Update VS Code and retry."));
				}
				if (token.isCancellationRequested || !requestId || !grant || this._requests.get(toolCallId) !== requestId) {
					throw new Error(localize('copilot.permission.grant.expired', "The sandbox permission request is no longer pending."));
				}
				const attributed = attributePermissionResult({ kind: 'approve-once' }, context.decisionSource);
				const result = await this._options.getSession().rpc.sandbox.grantPathForRequest({
					requestId,
					...(attributed.kind === 'attributed' ? { decisionContext: attributed.decisionContext } : {}),
				});
				if (!result.success) {
					throw new Error(localize('copilot.permission.grant.rejected', "The SDK did not grant sandbox access for this request."));
				}
				return { kind: 'no-result' };
			});
		} catch (error) {
			this._logService.error(error, `[Copilot:${this._options.sessionId}] Failed to grant sandbox path access`);
			const message = context.sandboxPathGrantSaved
				? localize('copilot.permission.grant.savedButFailed', "The path was saved to your sandbox settings, but this request could not be retried. {0}", getErrorMessage(error))
				: getErrorMessage(error);
			if (context.origin) {
				const target = this._target();
				this._configurationService.setChatSandboxEnabled(target, this._configurationService.getChatSandboxEnabled(target) ?? true, { ...context.origin, message });
			}
			return attributePermissionResult({ kind: 'reject' }, 'unattended_fallback');
		}
	}

	/** Whether the Agent Host's own shell tools replace the SDK's built-in shell. */
	isCustomTerminalToolEnabled(): boolean {
		return this._options.platform !== 'win32' && this._configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.EnableCustomTerminalTool) === true;
	}

	/** Callers must exclude commands explicitly requesting a sandbox bypass. */
	async isShellSandboxedByDefault(): Promise<boolean> {
		if (this.isCustomTerminalToolEnabled()) {
			return this._options.shellManager ? this._options.shellManager.getOrCreateSandboxEngine().isEnabled() : false;
		}
		return this._computeConfig() !== undefined;
	}

	private _target(): IAgentChatConfigurationTarget {
		return { session: this._options.ownerSession.toString(), chat: this._options.chat.toString() };
	}

	private _computeConfig(): SandboxConfig | undefined {
		const target = this._target();
		const sandbox = getSessionSandboxConfig(this._configurationService, target, this._options.platform);
		const policy = this._configurationService.getSessionSandboxPolicy(target.session);
		const readonlyPaths = getVSCodeSandboxReadRoots({
			sessionDataDirectory: this._sessionDataService.getSessionDataDir(this._options.ownerSession),
			shellInitDirectory: this._options.getShellInitDirectory(),
		}).map(root => root.fsPath);
		return buildSandboxConfigForSdk(this._options.platform, sandbox, readonlyPaths, policy);
	}

	updateDiagnostics(config?: SandboxConfig): Promise<void> {
		return this._diagnostics.update(this.isCustomTerminalToolEnabled() ? { enabled: false } : config ?? this._computeConfig() ?? { enabled: false });
	}

	/** Serializes configuration pushes with request-bound grants and session opt-outs. */
	applyConfig(failOnError = true, requestedSelection?: 'on' | 'off' | 'default', recorder?: IAgentProviderSendStageRecorder): Promise<void> {
		return measureAgentProviderOperation(recorder, 'sandbox', () => this._updateConfig(failOnError, requestedSelection, recorder), this._configSequencer);
	}

	/** Captures request attribution before permission synchronization can yield. */
	prepareConfigChange(event?: ISandboxConfigChange) {
		const values = this._configurationService.getChatConfigValues(this._options.getConfigWriteTarget());
		const selection = event?.origin ? event.config[SessionConfigKey.SandboxEnabled] : undefined;
		const requestedSelection = selection === 'on' || selection === 'off' || selection === 'default' ? selection : undefined;
		const sessionCommand = requestedSelection !== undefined && this._requiresSessionCommand();
		return {
			sessionCommand,
			apply: async (): Promise<void> => {
				try {
					await this.applyConfig(true, requestedSelection);
				} catch (error) {
					if (!sessionCommand) {
						throw error;
					}
					this._logService.error(error, `[Copilot:${this._options.sessionId}] Failed to apply sandbox session change`);
					if (!this._store.isDisposed) {
						this._rejectConfigChange(event, values, error);
					}
				}
			},
			reject: (error: unknown): void => this._rejectConfigChange(event, values, error),
		};
	}

	private _rejectConfigChange(event: ISandboxConfigChange | undefined, values: Record<string, unknown> | undefined, error: unknown): void {
		if (event?.origin && Object.hasOwn(event.config, SessionConfigKey.SandboxEnabled)) {
			const message = getErrorMessage(error);
			this._configurationService.rejectChatSandboxChange(this._options.getConfigWriteTarget(), values, event.origin,
				message.includes('Command /sandbox cannot run while the agent is active.')
					? localize('copilot.sandbox.agentActive', "Wait for the agent to finish executing, then try again.")
					: message);
		}
	}

	private _requiresSessionCommand(): boolean {
		const policy = this._configurationService.getSessionSandboxPolicy(this._options.ownerSession.toString());
		return (policy?.enabled === true && policy.allowBypass === true) || this._disabledForSession;
	}

	private async _updateConfig(failOnError: boolean, requestedSelection: 'on' | 'off' | 'default' | undefined, recorder?: IAgentProviderSendStageRecorder): Promise<void> {
		// Saving settings must not replace the live policy before the runtime accepts the pending grant.
		if (this._pendingPathGrants.size && requestedSelection === undefined) {
			this._configUpdateDeferred = true;
			return;
		}
		const base = this._computeConfig();
		const target = this._target();
		const policy = this._configurationService.getSessionSandboxPolicy(target.session);
		if (requestedSelection !== undefined && this._requiresSessionCommand()) {
			const enabled = requestedSelection === 'on' || (requestedSelection === 'default' && base?.enabled === true);
			const result = await measureAgentProviderOperation(recorder, 'sandboxRpc', () => this._options.getSession().rpc.commands.invoke({ name: 'sandbox', input: `${enabled ? 'enable' : 'disable'} session` }));
			if (result.kind !== 'text' || result.sandboxSessionChange !== (enabled ? 'restored' : 'disabled')) {
				throw new Error(result.kind === 'text' && result.text.trim() ? result.text : localize('copilot.sandbox.changeRejected', "Copilot SDK did not confirm the sandbox change for this session."));
			}
			this._disabledForSession = !enabled;
			this._configurationService.setChatSandboxEnabled(target, enabled);
			await measureAgentProviderOperation(recorder, 'sandboxDiagnostics', () => this.updateDiagnostics(enabled ? base : { enabled: false }));
			return;
		}
		if (!base && this._disabledForSession) {
			// A bare disabled options.update does not preserve the runtime's managed sandbox floor.
			return;
		}
		const sandboxConfig: SandboxConfig = requestedSelection === 'off' && policy?.failClosed
			? { enabled: false }
			: base ?? { enabled: false };
		try {
			if (await measureAgentProviderOperation(recorder, 'sandboxRpc', () => applySandboxConfig(this._options.getSession(), sandboxConfig, this._options.sessionId, this._logService, requestedSelection !== undefined))) {
				this._disabledForSession = false;
				this._configurationService.setChatSandboxEnabled(target, sandboxConfig.enabled);
				await measureAgentProviderOperation(recorder, 'sandboxDiagnostics', () => this.updateDiagnostics(sandboxConfig));
			}
		} catch (err) {
			if (failOnError) {
				throw err;
			}
			this._logService.warn(`[Copilot:${this._options.sessionId}] Failed to update sandbox config for request`, err);
		}
	}
}
