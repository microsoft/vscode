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
import { getAttachedLocalPaths } from '../../common/attachedLocalPaths.js';
import type { IAgentSandboxCertificateStatus } from '../../common/meta/agentSandboxCertificate.js';
import { measureAgentProviderOperation } from '../../common/agentHostProviderTiming.js';
import type { IAgentProviderSendStageRecorder } from '../../common/agentHostTelemetry.js';
import { CopilotCliConfigKey, copilotCliConfigSchema } from '../../common/copilotCliConfig.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import type { MessageAttachment } from '../../common/state/protocol/state.js';
import { AgentHostSandboxConfigKey, AgentHostSandboxKey, sandboxConfigSchema } from '../../common/sandboxConfigSchema.js';
import type { ISandboxPathGrant } from '../../common/sandboxPathGrant.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { getVSCodeSandboxReadRoots } from '../../common/vscodeSandboxPaths.js';
import { IAgentConfigurationService, type IAgentChatConfigurationTarget } from '../agentConfigurationService.js';
import { getSessionSandboxConfig } from '../sessionSandbox.js';
import type { ActionOrigin } from '../../common/state/sessionActions.js';
import { attributePermissionResult } from './copilotPermissionAttribution.js';
import { CopilotSandboxDiagnostics } from './copilotSandboxDiagnostics.js';
import { CopilotSandboxCertificateDiagnostics } from './copilotSandboxCertificateDiagnostics.js';
import { applySandboxConfig } from './copilotSessionLauncher.js';
import type { ShellManager } from './copilotShellTools.js';
import { buildSandboxConfigForSdk, resolveAttachedPathGrants, toSandboxFileSystemPath, type ISandboxAttachedPathGrants, type ISandboxAttachedPaths, type SandboxConfig } from './sandboxConfigForSdk.js';

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
	readonly storage: URI;
	/** Where a rejected selection is written back: the chat under its current owner, where the change came from. */
	readonly getConfigWriteTarget: () => IAgentChatConfigurationTarget;
	readonly platform: NodeJS.Platform;
	readonly getSession: () => CopilotSession | undefined;
	readonly isSessionClosed?: (session?: CopilotSession) => boolean;
	readonly getHostSupport: () => ReturnType<CopilotClient['rpc']['sandbox']['getHostSupport']>;
	readonly getCertificateStatus: (config: SandboxConfig) => Promise<IAgentSandboxCertificateStatus | undefined>;
	readonly installCertificate: (getConfig: () => SandboxConfig, scopeId: string) => Promise<void>;
	readonly rotateCertificate: (getConfig: () => SandboxConfig, scopeId: string) => Promise<void>;
	readonly removeCertificate: (scopeId: string, validate: () => void) => Promise<void>;
	readonly getShellInitDirectory: () => URI | undefined;
	readonly getAppliedPluginDirectories: () => readonly URI[];
	/** The working directory the runtime grants when `addCurrentWorkingDirectory` is on. */
	readonly getWorkingDirectory: () => URI | undefined;
	/** Further working directories the SDK session was launched with; the runtime grants them read/write. */
	readonly getAdditionalWorkingDirectories: () => readonly URI[];
	readonly shellManager: ShellManager | undefined;
	readonly onDidChangeRuntimeConfig?: () => void;
}

/** Owns sandbox configuration, request-bound approvals, and diagnostics for one SDK session. */
export class CopilotSessionSandbox extends Disposable {
	private readonly _requests = new Map<string, string>();
	private readonly _pendingPathGrants = new Map<string, ISandboxPathGrant>();
	/** Local files and folders the user attached to this chat, by URI; read-only for the life of the SDK session, never saved to settings. */
	private readonly _attachedPaths = new Map<string, URI>();
	private readonly _configSequencer = new Sequencer();
	private readonly _diagnostics: CopilotSandboxDiagnostics;
	private readonly _certificateDiagnostics: CopilotSandboxCertificateDiagnostics;
	private _configUpdateDeferred = false;
	private _disabledForSession = false;
	private _launchSession: CopilotSession | undefined;
	private _pendingSelection: 'on' | 'off' | 'default' | undefined;
	/** Serialized config the SDK session last accepted; re-sending it can restart pending MCP servers. */
	private _appliedConfig: string | undefined;

	constructor(
		private readonly _options: ICopilotSessionSandboxOptions,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._diagnostics = this._register(instantiationService.createInstance(CopilotSandboxDiagnostics, _options.ownerSession.toString(), _options.getHostSupport, _options.platform));
		this._certificateDiagnostics = this._register(instantiationService.createInstance(CopilotSandboxCertificateDiagnostics, _options.getConfigWriteTarget, _options.getCertificateStatus));
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
				// The SDK session stops being available once it starts disconnecting.
				const session = this._options.getSession();
				if (token.isCancellationRequested || !requestId || !grant || this._requests.get(toolCallId) !== requestId || !session) {
					throw new Error(localize('copilot.permission.grant.expired', "The sandbox permission request is no longer pending."));
				}
				const attributed = attributePermissionResult({ kind: 'approve-once' }, context.decisionSource);
				// The grant changes the runtime's live policy outside `options.update`.
				this._appliedConfig = undefined;
				const result = await session.rpc.sandbox.grantPathForRequest({
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

	/**
	 * Records the local files and folders of a user message so the next applied
	 * config grants them read-only. Returns whether the message attaches any
	 * local path, new or not: a caller that sends before the next turn must then
	 * await {@link applyConfig}, which also waits for an update still in flight.
	 */
	addAttachments(attachments: readonly MessageAttachment[] | undefined): boolean {
		const uris = getAttachedLocalPaths(attachments);
		for (const uri of uris) {
			this._attachedPaths.set(uri.toString(), uri);
		}
		return uris.length > 0;
	}

	/** The local attachments the sandbox can't make readable: those the effective policy blocks, and folders containing a writable folder. */
	getUnreadableAttachments(attachments: readonly MessageAttachment[] | undefined): Pick<ISandboxAttachedPathGrants, 'blocked' | 'containsWritable'> {
		const paths = getAttachedLocalPaths(attachments);
		if (!paths.length || this._disabledForSession) {
			return { blocked: [], containsWritable: [] };
		}
		const target = this._target();
		const sandbox = getSessionSandboxConfig(this._configurationService, target, this._options.platform);
		const policy = this._configurationService.getSessionSandboxPolicy(target.session);
		const { blocked, containsWritable } = resolveAttachedPathGrants(this._options.platform, sandbox, policy, this._attachedPathsFor(paths));
		return { blocked, containsWritable };
	}

	/** Uses the session's platform rather than `URI.fsPath`, whose syntax follows the OS of the current process. */
	private _attachedPathsFor(uris: readonly URI[]): ISandboxAttachedPaths {
		const workingDirectory = this._options.getWorkingDirectory();
		return {
			paths: uris.map(uri => toSandboxFileSystemPath(uri, this._options.platform)),
			...(workingDirectory ? { workingDirectory: toSandboxFileSystemPath(workingDirectory, this._options.platform) } : {}),
			additionalWorkingDirectories: this._options.getAdditionalWorkingDirectories().map(uri => toSandboxFileSystemPath(uri, this._options.platform)),
		};
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

	private _getLaunchSelection(isResume: boolean): 'on' | 'off' | 'default' | undefined {
		if (this._pendingSelection !== undefined || !isResume) {
			return this._pendingSelection;
		}
		const target = this._target();
		const policy = this._configurationService.getSessionSandboxPolicy(target.session);
		return policy?.enabled && policy.allowBypass === true
			&& this._configurationService.getChatSandboxEnabled(target) === false
			&& this._configurationService.getChatConfigValues(target)?.[SessionConfigKey.SandboxEnabled] === 'off'
			? 'off' : undefined;
	}

	applyLaunchConfig(session: CopilotSession, isResume = false): Promise<void> {
		return this._configSequencer.queue(async () => {
			this._launchSession = session;
			const requestedSelection = this._getLaunchSelection(isResume);
			this._pendingSelection = undefined;
			this._appliedConfig = undefined;
			if (isResume) {
				this._disabledForSession = false;
			}
			try {
				await this._updateConfig(true, requestedSelection, undefined, session, false, isResume);
			} catch (error) {
				this._launchSession = undefined;
				throw error;
			}
		});
	}

	/** The config {@link applyLaunchConfig} pushes, so it can also be applied when the SDK session opens; `undefined` when the launch uses the session command or pushes nothing. */
	getLaunchConfig(isResume = false): SandboxConfig | undefined {
		return this._configForUpdate(this._getLaunchSelection(isResume), this._computeConfig(), isResume);
	}

	private _configForUpdate(requestedSelection: 'on' | 'off' | 'default' | undefined, base: SandboxConfig | undefined, isResume = false): SandboxConfig | undefined {
		if (requestedSelection !== undefined && this._requiresSessionCommand()) {
			return undefined;
		}
		if (!base && this._disabledForSession && !isResume) {
			// A bare disabled options.update does not preserve the runtime's managed sandbox floor.
			return undefined;
		}
		const policy = this._configurationService.getSessionSandboxPolicy(this._target().session);
		return requestedSelection === 'off' && policy?.failClosed ? { enabled: false } : base ?? { enabled: false };
	}

	private _computeConfig(): SandboxConfig | undefined {
		const target = this._target();
		const sandbox = getSessionSandboxConfig(this._configurationService, target, this._options.platform);
		const policy = this._configurationService.getSessionSandboxPolicy(target.session);
		const readonlyPaths = [...getVSCodeSandboxReadRoots({
			sessionDataDirectories: [this._options.ownerSession.toString(), this._options.storage.toString(), ...this._configurationService.getChatAttachmentScopes(target)]
				.filter((scope, index, scopes) => scopes.indexOf(scope) === index)
				.map(scope => this._sessionDataService.getSessionDataDir(URI.parse(scope))),
			shellInitDirectory: this._options.getShellInitDirectory(),
		}), ...this._options.getAppliedPluginDirectories()].map(root => root.fsPath);
		return buildSandboxConfigForSdk(this._options.platform, sandbox, readonlyPaths, policy, this._attachedPathsFor([...this._attachedPaths.values()]));
	}

	updateDiagnostics(config?: SandboxConfig): Promise<void> {
		const effectiveConfig = this.isCustomTerminalToolEnabled() ? { enabled: false } : config ?? this._computeConfig() ?? { enabled: false };
		this._certificateDiagnostics.update(effectiveConfig);
		return this._diagnostics.update(effectiveConfig);
	}

	/** Resolves the live chat's effective configuration when its queued certificate operation starts. */
	installCertificate(scopeId: string): Promise<void> {
		return this._options.installCertificate(() => this._certificateConfig(), scopeId);
	}

	rotateCertificate(scopeId: string): Promise<void> {
		return this._options.rotateCertificate(() => this._certificateConfig(), scopeId);
	}

	removeCertificate(scopeId: string): Promise<void> {
		return this._options.removeCertificate(scopeId, () => this._requireLiveCertificateSession());
	}

	private _requireLiveCertificateSession(): void {
		if (this._store.isDisposed) {
			throw new Error(localize('copilot.sandboxCertificate.chatUnavailable', "The chat is no longer running. Reopen it before changing sandbox certificate trust."));
		}
	}

	private _certificateConfig(): SandboxConfig {
		this._requireLiveCertificateSession();
		return this.isCustomTerminalToolEnabled() || this._disabledForSession ? { enabled: false } : this._computeConfig() ?? { enabled: false };
	}

	refreshCertificateDiagnostics(): Promise<void> {
		const config = this.isCustomTerminalToolEnabled() || this._disabledForSession ? { enabled: false } : this._computeConfig() ?? { enabled: false };
		return this._certificateDiagnostics.update(config);
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

	private async _updateConfig(failOnError: boolean, requestedSelection: 'on' | 'off' | 'default' | undefined, recorder?: IAgentProviderSendStageRecorder, session = this._options.getSession() ?? this._launchSession, reportMutation = true, isResume = false): Promise<void> {
		if (this._store.isDisposed || this._options.isSessionClosed?.(session)) {
			return;
		}
		if (!session) {
			if (requestedSelection !== undefined) {
				this._pendingSelection = requestedSelection;
			}
			return;
		}
		// Saving settings must not replace the live policy before the runtime accepts the pending grant.
		if (this._pendingPathGrants.size && requestedSelection === undefined && !isResume) {
			this._configUpdateDeferred = true;
			return;
		}
		const base = this._computeConfig();
		const target = this._target();
		const writeTarget = this._options.getConfigWriteTarget();
		const values = this._configurationService.getChatConfigValues(writeTarget);
		if (requestedSelection !== undefined && this._requiresSessionCommand()) {
			const enabled = requestedSelection === 'on' || (requestedSelection === 'default' && base?.enabled === true);
			this._options.onDidChangeRuntimeConfig?.();
			const result = await measureAgentProviderOperation(recorder, 'sandboxRpc', () => session.rpc.commands.invoke({ name: 'sandbox', input: `${enabled ? 'enable' : 'disable'} session` }));
			if (result.kind !== 'text' || result.sandboxSessionChange !== (enabled ? 'restored' : 'disabled')) {
				throw new Error(result.kind === 'text' && result.text.trim() ? result.text : localize('copilot.sandbox.changeRejected', "Copilot SDK did not confirm the sandbox change for this session."));
			}
			this._disabledForSession = !enabled;
			this._appliedConfig = undefined;
			this._configurationService.setChatSandboxEnabled(target, enabled);
			await measureAgentProviderOperation(recorder, 'sandboxDiagnostics', () => this.updateDiagnostics(enabled ? base : { enabled: false }));
			return;
		}
		const sandboxConfig = this._configForUpdate(requestedSelection, base, isResume);
		if (!sandboxConfig) {
			return;
		}
		const serialized = JSON.stringify(sandboxConfig);
		try {
			const unchanged = requestedSelection === undefined && serialized === this._appliedConfig;
			if (!unchanged && reportMutation) {
				this._options.onDidChangeRuntimeConfig?.();
			}
			if (!unchanged) {
				const result = await measureAgentProviderOperation(recorder, 'sandboxRpc', () => applySandboxConfig(session, sandboxConfig, this._options.sessionId, this._logService, isResume || requestedSelection !== undefined, () => !!this._options.isSessionClosed?.(session)));
				if (this._store.isDisposed || this._options.isSessionClosed?.(session)) {
					return;
				}
				if (!result.applied) {
					this._configurationService.reportChatSandboxConflict(target, result.message);
					return;
				}
			}
			this._appliedConfig = serialized;
			this._disabledForSession = false;
			this._configurationService.setChatSandboxEnabled(target, sandboxConfig.enabled);
			if (isResume && requestedSelection === undefined && sandboxConfig.enabled
				&& values?.[SessionConfigKey.SandboxEnabled] === 'off'
				&& this._configurationService.getChatConfigValues(writeTarget) === values) {
				this._configurationService.updateChatConfig(writeTarget, { [SessionConfigKey.SandboxEnabled]: 'on' });
			}
			await measureAgentProviderOperation(recorder, 'sandboxDiagnostics', () => this.updateDiagnostics(sandboxConfig));
		} catch (err) {
			if (this._store.isDisposed || this._options.isSessionClosed?.(session)) {
				return;
			}
			if (failOnError) {
				throw err;
			}
			this._logService.warn(`[Copilot:${this._options.sessionId}] Failed to update sandbox config for request`, err);
		}
	}
}

