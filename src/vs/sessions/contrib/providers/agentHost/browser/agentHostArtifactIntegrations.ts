/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IReference, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableFromEvent, observableSignal, observableSignalFromEvent, observableValueOpts } from '../../../../../base/common/observable.js';
import { structuralEquals } from '../../../../../base/common/equals.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { getAgentHostArtifactIntegrationsCapability } from '../../../../../platform/agentHost/common/meta/agentHostArtifactIntegrationMeta.js';
import { gitHubPullRequestArtifactIntegrationId, gitHubPullRequestArtifactWorkspaceSettingsKey, gitHubPullRequestMarkReadyIgnoredChecksSetting } from '../../../../../platform/agentHost/common/githubPullRequestArtifact.js';
import { ActionType } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import { LocalArtifactIntegrationHost } from '../../../../../platform/artifactIntegrations/browser/localArtifactIntegrationHost.js';
import { IArtifactModel } from '../../../../../platform/artifactIntegrations/common/artifactIntegration.js';
import { ArtifactIntegrationClient } from '../../../../../platform/artifactIntegrations/common/artifactIntegrationProtocol.js';
import { ArtifactIntegrationRegistry, IArtifactIntegrationRegistry } from '../../../../../platform/artifactIntegrations/common/artifactIntegrationRegistry.js';
import { selectArtifactCoordinator } from '../../../../../platform/artifactIntegrations/common/artifactRuntime.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IUserDataProfileService } from '../../../../../workbench/services/userDataProfile/common/userDataProfile.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { createClientArtifactRuntime } from '../../../../services/artifactIntegrations/browser/clientArtifactRuntime.js';

export interface IArtifactWorkspaceConfigurationContext {
	readonly chat: string;
	readonly workingDirectory: string;
	readonly resource: URI;
}

export class AgentHostArtifactIntegrations extends Disposable {
	// A local connection wrapper can acquire its real observables without changing identity.
	private readonly connection = observableValueOpts<IAgentConnection | undefined>({ owner: this, equalsFn: () => false }, undefined);
	private readonly client = this._register(new MutableDisposable<ArtifactIntegrationClient>());
	private readonly fallback = this._register(new MutableDisposable<LocalArtifactIntegrationHost>());
	private readonly permitted;
	private current: IAgentConnection | undefined;
	private selected: 'host' | 'client' | undefined;
	private reason: string | undefined;
	private scope: string;
	private selectionKey: string;

	constructor(
		targetHost: string,
		@IArtifactIntegrationRegistry private readonly registry: ArtifactIntegrationRegistry,
		@ILogService private readonly logService: ILogService,
		@IStorageService private readonly storageService: IStorageService,
		@IUserDataProfileService profileService: IUserDataProfileService,
		@IChatEntitlementService entitlementService: IChatEntitlementService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
		this.scope = JSON.stringify([profileService.currentProfile.id, targetHost]);
		this.selectionKey = `artifactIntegrations.authority.${this.scope}`;
		const previous = storageService.get(this.selectionKey, StorageScope.APPLICATION);
		this.selected = previous === 'host' || previous === 'client' ? previous : undefined;
		this.permitted = observableFromEvent(this, entitlementService.onDidChangeSentiment, () => !entitlementService.sentiment.hidden);
		const profile = observableFromEvent(this, profileService.onDidChangeCurrentProfile, () => profileService.currentProfile.id);
		this._register(autorun(reader => {
			const scope = JSON.stringify([profile.read(reader), targetHost]);
			if (scope !== this.scope) {
				this.client.clear();
				this.fallback.clear();
				this.current = undefined;
				this.scope = scope;
				this.selectionKey = `artifactIntegrations.authority.${scope}`;
				const previous = this.storageService.get(this.selectionKey, StorageScope.APPLICATION);
				this.selected = previous === 'host' || previous === 'client' ? previous : undefined;
			}
			const connection = this.connection.read(reader);
			const capability = getAgentHostArtifactIntegrationsCapability(connection?.initializeResult.read(reader));
			const selection = selectArtifactCoordinator(capability, connection?.connectionAvailable?.read(reader) === true, this.permitted.read(reader), this.selected);
			if (selection.kind === 'unavailable') {
				this.reason = selection.reason === 'authorityChanged'
					? localize('artifactAuthorityChanged', "The artifact coordinator changed. Existing local automations remain paused; they are not migrated automatically.")
					: localize('artifactCoordinatorUnavailable', "The artifact integration coordinator is unavailable.");
				return;
			}
			this.reason = undefined;
			if (!connection || this.current === connection) {
				return;
			}
			this.client.clear();
			this.fallback.clear();
			this.current = connection;
			this.selected = selection.kind;
			this.storageService.store(this.selectionKey, selection.kind, StorageScope.APPLICATION, StorageTarget.MACHINE);
			if (selection.kind === 'host') {
				if (!connection.artifactIntegrationRequest || !connection.onDidArtifactIntegrationUpdate) {
					this.reason = localize('artifactTransportUnavailable', "The host advertises artifact integrations, but this connection cannot access them.");
					return;
				}
				this.client.value = new ArtifactIntegrationClient({
					onDidUpdate: connection.onDidArtifactIntegrationUpdate,
					onDidReset: connection.onDidArtifactIntegrationReset,
					available: derived(reader => this.permitted.read(reader) && this.connection.read(reader) === connection && connection.connectionAvailable?.read(reader) === true && getAgentHostArtifactIntegrationsCapability(connection.initializeResult.read(reader)) === 'supported'),
					request: request => connection.artifactIntegrationRequest!(request),
				}, this.logService);
			} else {
				try {
					this.fallback.value = new LocalArtifactIntegrationHost(this.scope,
						(authority, storage, isOwner) => createClientArtifactRuntime(authority, targetHost, storage, isOwner, connection, this.permitted, this.registry, this.logService), this.logService);
				} catch (error) {
					this.current = undefined;
					this.reason = localize('artifactLocalRuntimeUnavailable', "Local artifact integrations could not be started.");
					this.logService.error('[ArtifactIntegrations] Could not start client runtime', error);
				}
			}
		}));
	}

	setConnection(connection: IAgentConnection | undefined): void {
		this.connection.set(connection, undefined);
	}

	async acquireArtifact(session: string, artifactId: string, workspace?: IObservable<IArtifactWorkspaceConfigurationContext | undefined>): Promise<IReference<IArtifactModel>> {
		const access = this.client.value ?? this.fallback.value?.client;
		if (this.reason || !access) {
			throw new Error(this.reason ?? localize('artifactCoordinatorPending', "Waiting for artifact integration capabilities."));
		}
		const store = new DisposableStore();
		try {
			const reference = store.add(await access.acquireArtifact(session, artifactId));
			if (workspace && this.client.value) {
				const settingsChanged = observableSignalFromEvent(store, this.configurationService.onDidChangeConfiguration);
				let lastValue: { readonly chat: string; readonly workingDirectory: string; readonly ignoredChecks: unknown } | null | undefined;
				let lastConnection: IAgentConnection | undefined;
				const settingsKey = gitHubPullRequestArtifactWorkspaceSettingsKey(artifactId);
				const resync = observableSignal(store);
				store.add(autorun(reader => {
					const connection = this.connection.read(reader);
					if (connection) {
						reader.store.add(connection.onDidAction(envelope => {
							if (!envelope.rejectionReason && envelope.channel === session && envelope.action.type === ActionType.SessionConfigChanged
								&& envelope.action.replace && !Object.hasOwn(envelope.action.config, settingsKey)) {
								lastValue = undefined;
								resync.trigger(undefined);
							}
						}));
					}
				}));
				store.add(autorun(reader => {
					settingsChanged.read(reader);
					resync.read(reader);
					const connection = this.connection.read(reader);
					const context = workspace.read(reader);
					const integrated = reference.object.snapshot.read(reader).contributions.some(contribution => contribution.integrationId === gitHubPullRequestArtifactIntegrationId);
					if (this.selected !== 'host' || connection?.connectionAvailable?.read(reader) !== true || !integrated) {
						lastValue = undefined;
						return;
					}
					if (connection !== lastConnection) {
						lastConnection = connection;
						lastValue = undefined;
					}
					const inspected = context ? this.configurationService.inspect<readonly string[]>(gitHubPullRequestMarkReadyIgnoredChecksSetting, { resource: context.resource }) : undefined;
					const ignoredChecks = inspected?.workspaceFolderValue ?? inspected?.workspaceValue;
					const value = context && ignoredChecks !== undefined ? { chat: context.chat, workingDirectory: context.workingDirectory, ignoredChecks } : null;
					if (!structuralEquals(value, lastValue)) {
						lastValue = value;
						connection.dispatch(session, {
							type: ActionType.SessionConfigChanged,
							config: { [settingsKey]: value },
						});
					}
				}));
			}
			return { object: reference.object, dispose: () => store.dispose() };
		} catch (error) {
			store.dispose();
			throw error;
		}
	}
}
