/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IReference, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, observableFromEvent, observableValueOpts } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { getAgentHostArtifactIntegrationsCapability } from '../../../../../platform/agentHost/common/meta/agentHostArtifactIntegrationMeta.js';
import { LocalArtifactIntegrationHost } from '../../../../../platform/artifactIntegrations/browser/localArtifactIntegrationHost.js';
import { IArtifactModel } from '../../../../../platform/artifactIntegrations/common/artifactIntegration.js';
import { ArtifactIntegrationClient } from '../../../../../platform/artifactIntegrations/common/artifactIntegrationProtocol.js';
import { ArtifactIntegrationRegistry, IArtifactIntegrationRegistry } from '../../../../../platform/artifactIntegrations/common/artifactIntegrationRegistry.js';
import { selectArtifactCoordinator } from '../../../../../platform/artifactIntegrations/common/artifactRuntime.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IUserDataProfileService } from '../../../../../workbench/services/userDataProfile/common/userDataProfile.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { createClientArtifactRuntime } from '../../../../services/artifactIntegrations/browser/clientArtifactRuntime.js';

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

	async acquireArtifact(session: string, artifactId: string): Promise<IReference<IArtifactModel>> {
		const access = this.client.value ?? this.fallback.value?.client;
		if (this.reason || !access) {
			throw new Error(this.reason ?? localize('artifactCoordinatorPending', "Waiting for artifact integration capabilities."));
		}
		return access.acquireArtifact(session, artifactId);
	}
}
