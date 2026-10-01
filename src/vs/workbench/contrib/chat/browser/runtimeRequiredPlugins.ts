/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Delayer, SequencerByKey } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IAgentHostConnectionsService } from '../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { supportsAgentHostEnsureRequiredPlugins } from '../../../../platform/agentHost/common/meta/agentHostRepositoryPluginsMeta.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { ChatConfiguration } from '../common/constants.js';
import { IExtraMarketplaceObjectEntry, readConfiguredMarketplaces } from '../common/plugins/marketplaceReference.js';
import { IRuntimeRepositoryPluginService } from '../common/plugins/runtimeRepositoryPluginService.js';
import { IRuntimeRequiredPluginService } from '../common/plugins/runtimeRequiredPluginService.js';
import { IWorkspacePluginSettingsService } from '../common/plugins/workspacePluginSettingsService.js';

export class RuntimeRequiredPluginService extends Disposable implements IRuntimeRequiredPluginService {
	declare readonly _serviceBrand: undefined;

	private readonly _ensureDelayer = this._register(new Delayer<void>(100));
	private readonly _ensureSequencer = new SequencerByKey<string>();
	private readonly _retainedWorkingDirectories = new Map<string, { readonly uri: URI; count: number }>();

	constructor(
		@IAgentHostConnectionsService private readonly _connectionsService: IAgentHostConnectionsService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IWorkspaceTrustManagementService private readonly _workspaceTrustService: IWorkspaceTrustManagementService,
		@IWorkspacePluginSettingsService private readonly _workspacePluginSettingsService: IWorkspacePluginSettingsService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IRuntimeRepositoryPluginService private readonly _runtimeRepositoryPluginService: IRuntimeRepositoryPluginService,
		@IChatEntitlementService private readonly _chatEntitlementService: IChatEntitlementService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._register(Event.any(
			this._workspaceContextService.onDidChangeWorkspaceFolders,
			this._workspaceTrustService.onDidChangeTrust,
			this._connectionsService.onDidChangeConnections,
			this._chatEntitlementService.onDidChangeSentiment,
			Event.filter(this._configurationService.onDidChangeConfiguration, event =>
				event.affectsConfiguration(ChatConfiguration.PluginsEnabled)
				|| event.affectsConfiguration(ChatConfiguration.EnabledPlugins)
				|| event.affectsConfiguration(ChatConfiguration.ExtraMarketplaces)
				|| event.affectsConfiguration(ChatConfiguration.StrictMarketplaces)),
		)(() => this._requestEnsure()));
		this._register(autorun(reader => {
			this._workspacePluginSettingsService.enabledPlugins.read(reader);
			this._workspacePluginSettingsService.extraMarketplaces.read(reader);
			this._connectionsService.ambientConnection.initializeResult.read(reader);
			this._requestEnsure();
		}));
	}

	private _requestEnsure(): void {
		this._ensureDelayer.trigger(() => this.ensure()).catch(error => {
			this._logService.error('[RuntimeRequiredPlugins] Required plugin enforcement failed', error);
		});
	}

	async ensure(workingDirectories?: readonly URI[]): Promise<void> {
		const directories = workingDirectories ?? this._getTrackedWorkingDirectories();
		if (!workingDirectories) {
			this._runtimeRepositoryPluginService.retainWorkingDirectories(directories);
		}
		if (directories.length === 0
			|| this._chatEntitlementService.sentiment.hidden
			|| !this._configurationService.getValue<boolean>(ChatConfiguration.PluginsEnabled)) {
			this._runtimeRepositoryPluginService.removeSnapshots(directories);
			this._logService.debug('[RuntimeRequiredPlugins] Skipping: no eligible workspace context');
			return;
		}

		if (!this._workspaceTrustService.isWorkspaceTrusted()) {
			this._runtimeRepositoryPluginService.removeSnapshots(directories);
			this._logService.debug('[RuntimeRequiredPlugins] Skipping: workspace is not trusted');
			return;
		}

		const connection = this._connectionsService.ambientConnection;
		if (!connection.ensureRequiredPlugins
			|| !supportsAgentHostEnsureRequiredPlugins(connection.initializeResult.get())) {
			this._runtimeRepositoryPluginService.removeSnapshots(directories);
			if (this._hasRequiredPlugins()) {
				throw new Error('The Agent Host does not support required plugin enforcement.');
			}
			this._logService.debug('[RuntimeRequiredPlugins] Skipping: Agent Host capability unavailable');
			return;
		}

		const managedSettings = this._managedSettings();

		await Promise.all(directories.map(workingDirectory =>
			this._ensureSequencer.queue(this._uriIdentityService.extUri.getComparisonKey(workingDirectory), async () => {
				try {
					this._logService.debug(`[RuntimeRequiredPlugins] Ensuring requirements for ${workingDirectory.toString()}`);
					const result = await connection.ensureRequiredPlugins!({
						workingDirectory: workingDirectory.toString(),
						managedSettings,
					});
					this._logService.debug(`[RuntimeRequiredPlugins] Ensured ${result.plugins.length} workspace plugin projection(s) for ${workingDirectory.toString()}`);
					this._runtimeRepositoryPluginService.setSnapshot(workingDirectory, result);
					for (const warning of result.warnings) {
						this._logService.warn(`[RuntimeRequiredPlugins] ${warning}`);
					}
				} catch (error) {
					this._runtimeRepositoryPluginService.removeSnapshots([workingDirectory]);
					throw error;
				}
			})
		));
	}

	whenDiscoverySettled(): Promise<void> {
		return this._runtimeRepositoryPluginService.whenDiscoverySettled();
	}

	retainWorkingDirectories(workingDirectories: readonly URI[]): IDisposable {
		for (const workingDirectory of workingDirectories) {
			const key = this._uriIdentityService.extUri.getComparisonKey(workingDirectory);
			const retained = this._retainedWorkingDirectories.get(key);
			if (retained) {
				retained.count++;
			} else {
				this._retainedWorkingDirectories.set(key, { uri: workingDirectory, count: 1 });
			}
		}
		this._retainSnapshots();
		return toDisposable(() => {
			for (const workingDirectory of workingDirectories) {
				const key = this._uriIdentityService.extUri.getComparisonKey(workingDirectory);
				const retained = this._retainedWorkingDirectories.get(key);
				if (!retained) {
					continue;
				}
				if (retained.count === 1) {
					this._retainedWorkingDirectories.delete(key);
				} else {
					retained.count--;
				}
			}
			this._retainSnapshots();
		});
	}

	private _getTrackedWorkingDirectories(): readonly URI[] {
		const workspaceDirectories = this._workspaceContextService.getWorkspace().folders.map(folder => folder.uri);
		const retained = new Map<string, URI>();
		for (const workingDirectory of [...workspaceDirectories, ...[...this._retainedWorkingDirectories.values()].map(entry => entry.uri)]) {
			retained.set(this._uriIdentityService.extUri.getComparisonKey(workingDirectory), workingDirectory);
		}
		return [...retained.values()];
	}

	private _retainSnapshots(): void {
		this._runtimeRepositoryPluginService.retainWorkingDirectories(this._getTrackedWorkingDirectories());
	}

	private _managedSettings(): Record<string, unknown> | undefined {
		const enabledPlugins = this._configurationService.inspect<Record<string, boolean>>(ChatConfiguration.EnabledPlugins).policyValue;
		const strictKnownMarketplaces = this._configurationService.inspect<readonly unknown[]>(ChatConfiguration.StrictMarketplaces).policyValue;
		const extraKnownMarketplaces = this._managedMarketplaces();
		if (!enabledPlugins && !strictKnownMarketplaces && !extraKnownMarketplaces) {
			return undefined;
		}
		return {
			...(enabledPlugins ? { enabledPlugins } : {}),
			...(strictKnownMarketplaces ? { strictKnownMarketplaces } : {}),
			...(extraKnownMarketplaces ? { extraKnownMarketplaces } : {}),
		};
	}

	private _hasRequiredPlugins(): boolean {
		if ([...this._workspacePluginSettingsService.enabledPlugins.get().values()].some(enabled => enabled)) {
			return true;
		}
		const managedEnabledPlugins = this._configurationService.inspect<Record<string, boolean>>(ChatConfiguration.EnabledPlugins).policyValue;
		return Object.values(managedEnabledPlugins ?? {}).some(enabled => enabled);
	}

	private _managedMarketplaces(): Record<string, Omit<IExtraMarketplaceObjectEntry, 'name'>> | undefined {
		const result: Record<string, Omit<IExtraMarketplaceObjectEntry, 'name'>> = {};
		for (const value of readConfiguredMarketplaces(this._configurationService).extraValues) {
			if (!isNamedMarketplaceEntry(value)) {
				continue;
			}
			const { name, ...entry } = value;
			result[name] = entry;
		}
		return Object.keys(result).length > 0 ? result : undefined;
	}
}

export class RuntimeRequiredPluginsContribution implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.runtimeRequiredPlugins';

	constructor(
		@IRuntimeRequiredPluginService _requiredPluginService: IRuntimeRequiredPluginService,
	) { }
}

function isNamedMarketplaceEntry(value: unknown): value is IExtraMarketplaceObjectEntry & { readonly name: string } {
	return !!value && typeof value === 'object' && 'name' in value && typeof value.name === 'string';
}
