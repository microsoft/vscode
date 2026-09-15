/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { encodeBase64 } from '../../../base/common/buffer.js';
import { CancellationError } from '../../../base/common/errors.js';
import { Event } from '../../../base/common/event.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../base/common/map.js';
import { Schemas } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { ConfigurationTarget, ConfigurationTargetToString, IConfigurationService } from '../../configuration/common/configuration.js';
import { FileSystemProviderErrorCode, toFileSystemProviderErrorCode } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { COPILOT_REMOTE_AGENT_HOSTS_ENABLED_KEY, IManagedSettingsService } from '../../policy/common/copilotManagedSettings.js';
import { ITelemetryService, TelemetryLevel, TELEMETRY_CRASH_REPORTER_SETTING_ID, TELEMETRY_OLD_SETTING_ID, TELEMETRY_SETTING_ID } from '../../telemetry/common/telemetry.js';
import { getTelemetryLevel } from '../../telemetry/common/telemetryUtils.js';
import { IWorkspaceTrustEnablementService, IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from '../../workspace/common/workspaceTrust.js';
import type { IAgentCreateSessionConfig } from '../common/agent.js';
import { formatAgentHostConfigurationSyncValueForLog, getAgentHostConfigurationSyncEntries, getAgentHostConfigurationSyncTarget, resolveAgentHostConfigurationSyncPatch, resolveAgentHostConfigurationSyncValue } from '../common/agentHostConfigurationSync.js';
import { AMBIENT_AGENT_HOST_AUTHORITY } from '../common/agentHostConnectionsService.js';
import { RequestAgentHostWorkspaceTrustExtensionMethod, SetClientRemoteAgentHostsPolicyExtensionMethod, type IAgentHostExtensionServerCommandMap } from '../common/agentHostExtensionProtocol.js';
import { managedPermissionsConfigurationIds, resolveManagedSettingsPermissions, type IAgentHostManagedSettingsPermissions } from '../common/agentHostManagedSettings.js';
import { AgentHostProtocolClientCore, AgentHostClientState, InitialAuthenticationError, type IAgentHostProtocolClientOptions } from '../common/agentHostProtocolClient.js';
import { AgentHostAutoApprovePolicyRestrictedConfigKey, AgentHostTelemetryLevelConfigKey, AgentHostTerminalAutoApproveEnabledConfigKey, AgentHostTerminalAutoApproveRulesConfigKey, AgentHostDisableRepoInfoTelemetryConfigKey, AgentHostWorkspaceTrustConfigKey, getAgentHostTerminalAutoApproveRulesConfig, GLOBAL_AUTO_APPROVE_SETTING_ID, TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID, TERMINAL_AUTO_APPROVE_SETTING_ID, TERMINAL_IGNORE_DEFAULT_AUTO_APPROVE_RULES_SETTING_ID, DISABLE_REPO_INFO_TELEMETRY_SETTING_ID, telemetryLevelToAgentHostConfigValue } from '../common/agentHostSchema.js';
import { toAgentHostClientMeta } from '../common/agentHostTelemetry.js';
import { AGENT_HOST_SCHEME, agentHostAuthority, createAgentHostResourceUriMapper, identityAgentHostResourceUriMapper } from '../common/agentHostUri.js';
import { AgentHostResourceIdentity, AgentHostResourcePermissionError, IAgentHostResourceService, LOCAL_AGENT_HOST_RESOURCE_IDENTITY } from '../common/agentHostResourceService.js';
import type { IRemoteAgentHostProtocolClient } from '../common/remoteAgentHostService.js';
import { ActionType, type ChatAction, type ClientAnnotationsAction, type ClientAutomationAction, type ClientAutomationRunAction, type ClientChangesetAction, type IRootConfigChangedAction, type SessionAction, type TerminalAction } from '../common/state/sessionActions.js';
import { MessageAttachmentKind, type ClientPluginCustomization, type Message } from '../common/state/sessionState.js';
import { ContentEncoding, type ResourceRequestParams } from '../common/state/protocol/commands.js';
import { AhpErrorCodes } from '../common/state/protocol/errors.js';
import type { JsonRpcErrorResponse } from '../common/state/protocol/messages.js';
import type { IProtocolTransport } from '../common/state/sessionTransport.js';
import { isWorktreeUnderRepository } from '../common/worktreePaths.js';

export { AgentHostClientState, InitialAuthenticationError };
export type { IAgentHostProtocolClientOptions };

interface IRemoteAgentHostExtensionNotificationMap {
	'setClientManagedSettingsPermissions': { params: { permissions: IAgentHostManagedSettingsPermissions } };
	[SetClientRemoteAgentHostsPolicyExtensionMethod]: { params: { enabled: boolean } };
}

/**
 * Workbench adapter for the browser-independent AHP client core.
 */
export class AgentHostProtocolClient extends AgentHostProtocolClientCore implements IRemoteAgentHostProtocolClient {

	private readonly _resourceIdentity: AgentHostResourceIdentity;
	private readonly _connectionAuthority: string;
	private readonly _grantedImplicitReadUris = new ResourceSet();
	private readonly _implicitReadGrants = this._register(new DisposableStore());

	constructor(
		identity: AgentHostResourceIdentity,
		transportOrFactory: IProtocolTransport | (() => IProtocolTransport),
		options: IAgentHostProtocolClientOptions | undefined,
		@ILogService logService: ILogService,
		@IAgentHostResourceService private readonly _resourceService: IAgentHostResourceService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IWorkspaceTrustEnablementService private readonly _workspaceTrustEnablementService: IWorkspaceTrustEnablementService,
		@IWorkspaceTrustManagementService private readonly _workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IWorkspaceTrustRequestService private readonly _workspaceTrustRequestService: IWorkspaceTrustRequestService,
		@IManagedSettingsService private readonly _managedSettingsService: IManagedSettingsService,
	) {
		const address = identity === LOCAL_AGENT_HOST_RESOURCE_IDENTITY ? AMBIENT_AGENT_HOST_AUTHORITY : identity;
		const connectionAuthority = identity === LOCAL_AGENT_HOST_RESOURCE_IDENTITY ? AMBIENT_AGENT_HOST_AUTHORITY : agentHostAuthority(identity);
		const resourceUris = identity === LOCAL_AGENT_HOST_RESOURCE_IDENTITY
			? identityAgentHostResourceUriMapper
			: createAgentHostResourceUriMapper(connectionAuthority);
		super(address, transportOrFactory, { ...options, resourceUris }, logService);
		this._resourceIdentity = identity;
		this._connectionAuthority = connectionAuthority;

		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (this.connectionState !== AgentHostClientState.Connected) {
				return;
			}
			const patch: Record<string, unknown> = {};
			const mirrored: string[] = [];
			if (e.source !== ConfigurationTarget.WORKSPACE && e.source !== ConfigurationTarget.WORKSPACE_FOLDER && e.source !== ConfigurationTarget.MEMORY) {
				for (const entry of getAgentHostConfigurationSyncEntries(getAgentHostConfigurationSyncTarget(this._resourceIdentity))) {
					if (!e.affectsConfiguration(entry.settingId)) {
						continue;
					}
					const value = resolveAgentHostConfigurationSyncValue(this._configurationService, entry);
					if (value !== undefined) {
						patch[entry.sync.key] = value;
						mirrored.push(`${entry.sync.key}=${formatAgentHostConfigurationSyncValueForLog(entry.settingId, value)} (${entry.settingId})`);
					}
				}
			}
			if (Object.keys(patch).length) {
				this._logService.info(`[RemoteAgentHostProtocol] Mirroring configuration to host root config from ${ConfigurationTargetToString(e.source)}: ${mirrored.join(', ')}`);
				this._dispatchRootConfig(patch);
			}
			if (e.affectsConfiguration(GLOBAL_AUTO_APPROVE_SETTING_ID)) {
				this._updateAutoApprovePolicyRestriction();
			}
			if (e.affectsConfiguration(TELEMETRY_SETTING_ID) || e.affectsConfiguration(TELEMETRY_OLD_SETTING_ID) || e.affectsConfiguration(TELEMETRY_CRASH_REPORTER_SETTING_ID)) {
				this._updateTelemetryLevel();
			}
			if (e.affectsConfiguration(TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID)) {
				this._updateTerminalAutoApproveEnabled();
			}
			if (e.affectsConfiguration(TERMINAL_AUTO_APPROVE_SETTING_ID) || e.affectsConfiguration(TERMINAL_IGNORE_DEFAULT_AUTO_APPROVE_RULES_SETTING_ID)) {
				this._updateTerminalAutoApproveRules();
			}
			if (e.affectsConfiguration(DISABLE_REPO_INFO_TELEMETRY_SETTING_ID)) {
				this._updateDisableRepoInfoTelemetry();
			}
			if (managedPermissionsConfigurationIds.some(settingId => e.affectsConfiguration(settingId))) {
				this._updateManagedSettingsPermissions();
			}
		}));

		this._register(Event.any(this._workspaceTrustManagementService.onDidChangeTrustedFolders, this._workspaceTrustManagementService.onDidChangeTrust)(() => {
			if (this.connectionState === AgentHostClientState.Connected) {
				this._updateWorkspaceTrust();
			}
		}));
		this._register(this._managedSettingsService.onDidChangeManagedSettings(() => {
			if (this.connectionState === AgentHostClientState.Connected) {
				this._updateRemoteAgentHostsPolicy();
			}
		}));
	}

	protected override _clientMeta(): Record<string, unknown> {
		const telemetryLevel = this._effectiveTelemetryLevel();
		const sendIdentity = telemetryLevel >= TelemetryLevel.USAGE;
		return toAgentHostClientMeta(
			this._clientConnectionKind,
			telemetryLevel,
			sendIdentity ? this._telemetryService.machineId : undefined,
			sendIdentity ? this._telemetryService.devDeviceId : undefined,
		);
	}

	protected override _forwardClientConfig(includeManagedSettings = true): void {
		this._updateRemoteAgentHostsPolicy(!includeManagedSettings);
		this._dispatchRootConfig(resolveAgentHostConfigurationSyncPatch(this._configurationService, getAgentHostConfigurationSyncTarget(this._resourceIdentity)));
		this._updateTelemetryLevel();
		this._updateTerminalAutoApproveEnabled();
		this._updateTerminalAutoApproveRules();
		this._updateAutoApprovePolicyRestriction();
		this._updateWorkspaceTrust();
		this._updateDisableRepoInfoTelemetry();
		if (includeManagedSettings) {
			this._updateManagedSettingsPermissions();
		}
	}

	private _updateRemoteAgentHostsPolicy(sendDuringReconnect = false): void {
		if (!this._managedSettingsService.isManagedSettingsResolved) {
			return;
		}
		const managedValue = this._managedSettingsService.getManagedSettingValue(COPILOT_REMOTE_AGENT_HOSTS_ENABLED_KEY);
		this._sendExtensionNotification(SetClientRemoteAgentHostsPolicyExtensionMethod, { enabled: managedValue !== false }, sendDuringReconnect);
	}

	protected override _updateManagedSettingsPermissions(sendDuringReconnect = false): void {
		const permissions = this._resourceIdentity === LOCAL_AGENT_HOST_RESOURCE_IDENTITY
			? resolveManagedSettingsPermissions(this._configurationService)
			: {};
		this._sendExtensionNotification('setClientManagedSettingsPermissions', { permissions }, sendDuringReconnect);
	}

	protected override _prepareOutgoingAction(action: SessionAction | ChatAction | TerminalAction | ClientChangesetAction | ClientAnnotationsAction | ClientAutomationAction | ClientAutomationRunAction | IRootConfigChangedAction): void {
		switch (action.type) {
			case ActionType.SessionActiveClientSet:
				if (action.activeClient.customizations) {
					this._grantImplicitReadsForCustomizations(action.activeClient.customizations);
				}
				break;
			case ActionType.ChatTurnStarted:
			case ActionType.ChatPendingMessageSet:
				this._grantImplicitReadsForMessage(action.message);
				break;
		}
	}

	protected override _prepareCreateSession(config: IAgentCreateSessionConfig | undefined): void {
		if (config?.activeClient?.customizations) {
			this._grantImplicitReadsForCustomizations(config.activeClient.customizations);
		}
	}

	protected override _clearConnectionResources(connectionClosed: boolean): void {
		this._grantedImplicitReadUris.clear();
		this._implicitReadGrants.clear();
		if (connectionClosed) {
			this._resourceService.connectionClosed(this._resourceIdentity);
		}
	}

	protected override async _handleServerRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
		const identity = this._resourceIdentity;
		switch (method) {
			case RequestAgentHostWorkspaceTrustExtensionMethod: {
				if (typeof params.workspace !== 'string') {
					throw new Error('Missing workspace');
				}
				const hostWorkspace = URI.parse(params.workspace, true);
				if (hostWorkspace.scheme !== Schemas.file || !hostWorkspace.path.startsWith('/')) {
					throw new Error('Workspace must be an absolute file URI');
				}
				const workspace = this.resourceUris.fromAgentHost(hostWorkspace);
				if (params.trustedParent !== undefined) {
					if (typeof params.trustedParent !== 'string') {
						throw new Error('Invalid trustedParent');
					}
					const hostParent = URI.parse(params.trustedParent, true);
					if (hostParent.scheme !== Schemas.file || !hostParent.path.startsWith('/')) {
						throw new Error('Trusted parent must be an absolute file URI');
					}
					if (!isWorktreeUnderRepository(hostWorkspace, hostParent)) {
						throw new Error('Workspace is not a managed worktree under the trusted parent');
					}
					const parent = this.resourceUris.fromAgentHost(hostParent);
					const parentTrust = await this._workspaceTrustManagementService.getUriTrustInfo(parent);
					if (parentTrust.trusted) {
						const workspaceTrust = await this._workspaceTrustManagementService.getUriTrustInfo(workspace);
						if (!workspaceTrust.trusted) {
							await this._workspaceTrustManagementService.setUrisTrust([workspace], true);
						}
						return { trusted: true } satisfies IAgentHostExtensionServerCommandMap[typeof RequestAgentHostWorkspaceTrustExtensionMethod]['result'];
					}
				}
				const trusted = await this._workspaceTrustRequestService.requestResourcesTrust({
					uri: workspace,
					message: localize('agentHost.trustWorkspaceMessage', "An agent session will be able to read files, run commands, and make changes in this folder."),
				});
				return { trusted: trusted === true } satisfies IAgentHostExtensionServerCommandMap[typeof RequestAgentHostWorkspaceTrustExtensionMethod]['result'];
			}
			case 'resourceList': {
				if (!params.uri) { throw new Error('Missing uri'); }
				const result = await this._resourceService.list(identity, URI.parse(params.uri as string));
				return { entries: result.entries };
			}
			case 'resourceRead': {
				if (!params.uri) { throw new Error('Missing uri'); }
				const result = await this._resourceService.read(identity, URI.parse(params.uri as string));
				return { data: encodeBase64(result.bytes), encoding: ContentEncoding.Base64 };
			}
			case 'resourceWrite':
				if (!params.uri || params.data === undefined) { throw new Error('Missing uri or data'); }
				await this._resourceService.write(identity, params as unknown as Parameters<typeof this._resourceService.write>[1]);
				return {};
			case 'resourceDelete':
				if (!params.uri) { throw new Error('Missing uri'); }
				await this._resourceService.del(identity, params as unknown as Parameters<typeof this._resourceService.del>[1]);
				return {};
			case 'resourceMove':
				if (!params.source || !params.destination) { throw new Error('Missing source or destination'); }
				await this._resourceService.move(identity, params as unknown as Parameters<typeof this._resourceService.move>[1]);
				return {};
			case 'resourceCopy':
				if (!params.source || !params.destination) { throw new Error('Missing source or destination'); }
				await this._resourceService.copy(identity, params as unknown as Parameters<typeof this._resourceService.copy>[1]);
				return {};
			case 'resourceResolve':
				if (!params.uri) { throw new Error('Missing uri'); }
				return this._resourceService.resolve(identity, params as unknown as Parameters<typeof this._resourceService.resolve>[1]);
			case 'resourceMkdir':
				if (!params.uri) { throw new Error('Missing uri'); }
				await this._resourceService.mkdir(identity, params as unknown as Parameters<typeof this._resourceService.mkdir>[1]);
				return {};
			case 'resourceRequest':
				try {
					await this._resourceService.request(identity, params as unknown as ResourceRequestParams);
					return {};
				} catch (error) {
					if (error instanceof CancellationError) {
						throw new AgentHostResourcePermissionError(undefined);
					}
					throw error;
				}
			default:
				return super._handleServerRequest(method, params);
		}
	}

	protected override _toReverseRequestError(error: unknown): JsonRpcErrorResponse['error'] {
		if (error instanceof AgentHostResourcePermissionError) {
			return {
				code: AhpErrorCodes.PermissionDenied,
				message: error.message,
				data: error.request ? { request: error.request } : undefined,
			};
		}
		const fsCode = toFileSystemProviderErrorCode(error instanceof Error ? error : undefined);
		let code = -32000;
		switch (fsCode) {
			case FileSystemProviderErrorCode.FileNotFound: code = AhpErrorCodes.NotFound; break;
			case FileSystemProviderErrorCode.NoPermissions: code = AhpErrorCodes.PermissionDenied; break;
			case FileSystemProviderErrorCode.FileExists: code = AhpErrorCodes.AlreadyExists; break;
		}
		return { code, message: error instanceof Error ? error.message : String(error) };
	}

	private _sendExtensionNotification<M extends keyof IRemoteAgentHostExtensionNotificationMap>(method: M, params: IRemoteAgentHostExtensionNotificationMap[M]['params'], sendDuringReconnect = false): void {
		this._sendNotificationMessage(method, params, sendDuringReconnect);
	}

	private _effectiveTelemetryLevel(): TelemetryLevel {
		return Math.min(getTelemetryLevel(this._configurationService), this._telemetryService.telemetryLevel);
	}

	private _updateTelemetryLevel(): void {
		this._dispatchRootConfig({ [AgentHostTelemetryLevelConfigKey]: telemetryLevelToAgentHostConfigValue(this._effectiveTelemetryLevel()) });
	}

	private _updateAutoApprovePolicyRestriction(): void {
		const policyRestricted = this._configurationService.inspect<boolean>(GLOBAL_AUTO_APPROVE_SETTING_ID)?.policyValue === false;
		this._dispatchRootConfig({ [AgentHostAutoApprovePolicyRestrictedConfigKey]: policyRestricted });
	}

	private _updateWorkspaceTrust(): void {
		const remoteAuthority = typeof this._resourceIdentity === 'string' && this._resourceIdentity.startsWith(`${Schemas.vscodeRemote}://`)
			? URI.parse(this._resourceIdentity).authority : undefined;
		const trustedUris = this._workspaceTrustManagementService.getTrustedUris()
			.filter(uri => this._resourceIdentity === LOCAL_AGENT_HOST_RESOURCE_IDENTITY
				? uri.scheme === Schemas.file
				: (uri.scheme === AGENT_HOST_SCHEME && uri.authority === this._connectionAuthority)
				|| (remoteAuthority !== undefined && uri.scheme === Schemas.vscodeRemote && uri.authority === remoteAuthority))
			.map(uri => uri.scheme === Schemas.vscodeRemote ? uri.with({ scheme: Schemas.file, authority: '' }) : this.resourceUris.toAgentHost(uri))
			.filter(uri => uri.scheme === Schemas.file)
			.map(uri => uri.toString());
		this._dispatchRootConfig({
			[AgentHostWorkspaceTrustConfigKey]: {
				enabled: this._workspaceTrustEnablementService.isWorkspaceTrustEnabled(),
				trustedUris,
			},
		});
	}

	private _updateDisableRepoInfoTelemetry(): void {
		const disabled = this._configurationService.getValue<boolean>(DISABLE_REPO_INFO_TELEMETRY_SETTING_ID) === true;
		this._dispatchRootConfig({ [AgentHostDisableRepoInfoTelemetryConfigKey]: disabled });
	}

	private _updateTerminalAutoApproveEnabled(): void {
		// Keep this workspace-aware: resolving only the global restricted setting could re-enable auto-approval for a workspace that disabled it.
		const enabled = this._configurationService.getValue<boolean>(TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID) !== false;
		this._dispatchRootConfig({ [AgentHostTerminalAutoApproveEnabledConfigKey]: enabled });
	}

	private _updateTerminalAutoApproveRules(): void {
		this._dispatchRootConfig({ [AgentHostTerminalAutoApproveRulesConfigKey]: getAgentHostTerminalAutoApproveRulesConfig(this._configurationService) });
	}

	private _grantImplicitReadsForMessage(message: Message): void {
		for (const attachment of message.attachments ?? []) {
			if (attachment.type !== MessageAttachmentKind.Resource) {
				continue;
			}
			try {
				this._grantImplicitRead(URI.parse(attachment.uri));
			} catch {
				continue;
			}
		}
	}

	private _grantImplicitReadsForCustomizations(refs: readonly ClientPluginCustomization[]): void {
		for (const ref of refs) {
			try {
				this._grantImplicitRead(URI.parse(ref.uri));
			} catch {
				continue;
			}
		}
	}

	private _grantImplicitRead(uri: URI): void {
		if (this._grantedImplicitReadUris.has(uri)) {
			return;
		}
		this._grantedImplicitReadUris.add(uri);
		this._implicitReadGrants.add(this._resourceService.grantImplicitRead(this._resourceIdentity, uri));
	}
}
