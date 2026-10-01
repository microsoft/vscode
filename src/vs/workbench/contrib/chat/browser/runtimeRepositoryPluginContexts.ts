/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Delayer } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IAgentHostConnectionsService } from '../../../../platform/agentHost/common/agentHostConnectionsService.js';
import type { IAgentHostRepositoryPluginContext, IAgentHostRepositoryPluginContexts, IAgentHostRepositoryPluginContextsSnapshot } from '../../../../platform/agentHost/common/repositoryPluginContexts.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { AutoUpdateConfigurationKey, IExtensionsWorkbenchService } from '../../extensions/common/extensions.js';
import { ChatConfiguration } from '../common/constants.js';
import { IExtraMarketplaceObjectEntry, readConfiguredMarketplaces } from '../common/plugins/marketplaceReference.js';
import { IRuntimeRepositoryPluginContextService } from '../common/plugins/runtimeRepositoryPluginContextService.js';
import { IRuntimeRepositoryPluginService } from '../common/plugins/runtimeRepositoryPluginService.js';

export class RuntimeRepositoryPluginContextService extends Disposable implements IRuntimeRepositoryPluginContextService {
	declare readonly _serviceBrand: undefined;

	private readonly _publishDelayer = this._register(new Delayer<void>(100));
	private readonly _connectionListener = this._register(new MutableDisposable<DisposableStore>());
	private readonly _retainedWorkingDirectories = new Map<string, { readonly uri: URI; count: number }>();
	private _boundContexts: IAgentHostRepositoryPluginContexts | undefined;
	private _publishTail = Promise.resolve();

	constructor(
		@IAgentHostConnectionsService private readonly _connectionsService: IAgentHostConnectionsService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IWorkspaceTrustManagementService private readonly _workspaceTrustService: IWorkspaceTrustManagementService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IExtensionsWorkbenchService private readonly _extensionsWorkbenchService: IExtensionsWorkbenchService,
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
				event.affectsConfiguration(AutoUpdateConfigurationKey)
				|| event.affectsConfiguration(ChatConfiguration.PluginsEnabled)
				|| event.affectsConfiguration(ChatConfiguration.EnabledPlugins)
				|| event.affectsConfiguration(ChatConfiguration.ExtraMarketplaces)
				|| event.affectsConfiguration(ChatConfiguration.StrictMarketplaces)),
		)(() => this._requestPublication()));
		this._register(autorun(reader => {
			this._connectionsService.ambientConnection.initializeResult.read(reader);
			this._requestPublication();
		}));
	}

	private _requestPublication(): void {
		this._publishDelayer.trigger(() => this.publish()).catch(error => {
			this._logService.error('[RuntimeRepositoryPluginContexts] Publication failed', error);
		});
	}

	async publish(): Promise<void> {
		const directories = this._getTrackedWorkingDirectories();
		this._runtimeRepositoryPluginService.retainWorkingDirectories(directories);
		const contexts = this._bindConnection();
		if (!contexts) {
			this._runtimeRepositoryPluginService.retainWorkingDirectories([]);
			this._logService.debug('[RuntimeRepositoryPluginContexts] Skipping: Agent Host capability unavailable');
			return;
		}

		const eligible = !this._chatEntitlementService.sentiment.hidden
			&& this._configurationService.getValue<boolean>(ChatConfiguration.PluginsEnabled);
		const request = eligible ? this._createContexts(directories) : [];
		const run = this._publishTail.then(async () => {
			try {
				const snapshot = await contexts.set(request);
				this._applySnapshot(snapshot);
			} catch (error) {
				this._runtimeRepositoryPluginService.retainWorkingDirectories([]);
				throw error;
			}
		});
		this._publishTail = run.catch(() => undefined);
		await run;
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
		this._requestPublication();
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
			this._requestPublication();
		});
	}

	private _bindConnection(): IAgentHostRepositoryPluginContexts | undefined {
		const contexts = this._connectionsService.ambientConnection.repositoryPluginContexts;
		if (contexts === this._boundContexts) {
			return contexts;
		}
		this._boundContexts = contexts;
		const store = new DisposableStore();
		if (contexts) {
			store.add(contexts.onDidChange(snapshot => this._applySnapshot(snapshot)));
			const snapshot = contexts.getSnapshot();
			if (snapshot) {
				this._applySnapshot(snapshot);
			}
		}
		this._connectionListener.value = store;
		return contexts;
	}

	private _createContexts(directories: readonly URI[]): readonly IAgentHostRepositoryPluginContext[] {
		const trusted = this._workspaceTrustService.isWorkspaceTrusted();
		const automaticUpdatesAllowed = this._extensionsWorkbenchService.getAutoUpdateValue() !== 'off';
		const managedSettings = this._managedSettings();
		return directories.map(workingDirectory => ({
			id: workingDirectory.toString(),
			workingDirectory: workingDirectory.toString(),
			trusted,
			automaticUpdatesAllowed,
			managedSettings,
		}));
	}

	private _applySnapshot(snapshot: IAgentHostRepositoryPluginContextsSnapshot): void {
		this._runtimeRepositoryPluginService.applySnapshot(snapshot);
		this._logService.debug(`[RuntimeRepositoryPluginContexts] Applied runtime snapshot ${snapshot.revision} with ${snapshot.contexts.length} context(s)`);
		for (const context of snapshot.contexts) {
			if (context.state === 'error') {
				this._logService.error(`[RuntimeRepositoryPluginContexts] Failed '${context.id}': ${context.error ?? 'Unknown error'}`);
				continue;
			}
			for (const warning of context.result?.warnings ?? []) {
				this._logService.warn(`[RuntimeRepositoryPluginContexts] ${warning}`);
			}
			for (const failure of [
				...(context.result?.installResults ?? []),
				...(context.result?.updateResults ?? []),
			].filter(result => result.action === 'failed')) {
				this._logService.error(`[RuntimeRepositoryPluginContexts] Failed to reconcile '${failure.spec}': ${failure.error ?? 'Unknown error'}`);
			}
		}
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

export class RuntimeRepositoryPluginContextsContribution implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.runtimeRepositoryPluginContexts';

	constructor(
		@IRuntimeRepositoryPluginContextService _contextService: IRuntimeRepositoryPluginContextService,
	) { }
}

function isNamedMarketplaceEntry(value: unknown): value is IExtraMarketplaceObjectEntry & { readonly name: string } {
	return !!value && typeof value === 'object' && 'name' in value && typeof value.name === 'string';
}
