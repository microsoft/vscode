/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable, IReference, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { autorun, derived, IObservable, observableFromEvent, observableValue, observableValueOpts } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { getAgentHostArtifactIntegrationsCapability } from '../../../../../platform/agentHost/common/meta/agentHostArtifactIntegrationMeta.js';
import { AuthRequiredReason } from '../../../../../platform/agentHost/common/state/protocol/notifications.js';
import { LocalArtifactIntegrationHost } from '../../../../../platform/artifactIntegrations/browser/localArtifactIntegrationHost.js';
import { ArtifactActionView, ArtifactIntegrationsSettingId, ArtifactRun, IArtifactIntegrationAccess, IArtifactModel, toArtifactIntegrationDescriptor } from '../../../../../platform/artifactIntegrations/common/artifactIntegration.js';
import { ArtifactAuthenticationHandler, ArtifactIntegrationClient, ArtifactIntegrationServer } from '../../../../../platform/artifactIntegrations/common/artifactIntegrationProtocol.js';
import { IArtifactIntegrationRegistry } from '../../../../../platform/artifactIntegrations/common/artifactIntegrationRegistry.js';
import { CompositeArtifactModel } from '../../../../../platform/artifactIntegrations/common/compositeArtifactModel.js';
import { selectArtifactCoordinator } from '../../../../../platform/artifactIntegrations/common/artifactRuntime.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IUserDataProfileService } from '../../../../../workbench/services/userDataProfile/common/userDataProfile.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IExtensionService } from '../../../../../workbench/services/extensions/common/extensions.js';
import { createClientArtifactRuntime } from '../../../../services/artifactIntegrations/browser/clientArtifactRuntime.js';
import { AgentHostInteractiveAuthentication } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostAuth.js';
import { authenticateWithConnectionCustomization, IRemoteAgentHostConnectionCustomizationService } from '../../../../../workbench/contrib/chat/browser/remoteAgentHost/remoteAgentHostConnectionCustomization.js';

export interface IArtifactWorkspaceConfigurationContext {
	readonly chat: string;
	readonly workingDirectory: string;
	readonly resource: URI;
}

export type ArtifactWorkspaceConfigurationSynchronizer = (
	store: DisposableStore,
	connection: IObservable<IAgentConnection | undefined>,
	isHostSelected: () => boolean,
	session: string,
	artifactId: string,
	workspace: IObservable<IArtifactWorkspaceConfigurationContext | undefined>,
	model: IArtifactModel,
) => void;

/** Adapts advertised chat identifiers without changing execution, history cursors, or run ownership. */
export function mapArtifactModelChats(
	model: IArtifactModel,
	chats: IObservable<readonly { readonly client: URI; readonly backend: string | undefined }[]>,
	isEqual: (first: URI, second: URI) => boolean,
): IArtifactModel {
	const mapRun = (run: ArtifactRun, mapping = chats.get()): ArtifactRun => run.chat
		? { ...run, chat: mapping.find(chat => chat.backend === run.chat)?.client.toString() }
		: run;
	return {
		snapshot: derived(reader => {
			const snapshot = model.snapshot.read(reader);
			const mapping = chats.read(reader);
			const mapAction = (action: ArtifactActionView): ArtifactActionView => !action.chatAvailability ? action : {
				...action,
				chatAvailability: Object.fromEntries(mapping.flatMap(chat => {
					const availability = chat.backend && action.chatAvailability?.[chat.backend];
					return availability ? [[chat.client.toString(), availability]] : [];
				})),
			};
			return {
				...snapshot,
				contributions: snapshot.contributions.map(contribution => ({
					...contribution,
					view: { ...contribution.view, stateActions: contribution.view.stateActions.map(mapAction), generalActions: contribution.view.generalActions.map(mapAction) },
				})),
				runs: snapshot.runs.map(run => mapRun(run, mapping)),
			};
		}),
		requestAuthentication: integrationId => model.requestAuthentication(integrationId),
		configure: (integrationId, revision, values, actor) => model.configure(integrationId, revision, values, actor),
		invoke: async (integrationId, actionId, chat, requestId, actor) => {
			const resource = URI.parse(chat, true);
			const target = chats.get().find(chat => isEqual(chat.client, resource));
			if (!target) {
				throw new Error('Artifact action chat does not belong to the invoking session');
			}
			if (!target.backend) {
				throw new Error(localize('artifactInvokingChatMissing', "The invoking chat has not been resolved on the agent host."));
			}
			return mapRun(await model.invoke(integrationId, actionId, target.backend, requestId, actor));
		},
		cancel: runId => model.cancel(runId),
		reconcile: runId => model.reconcile(runId),
		getRuns: async (before, limit) => {
			const page = await model.getRuns(before, limit);
			return { ...page, runs: page.runs.map(run => mapRun(run)) };
		},
		acquireDetails: (integrationId, detailsId) => model.acquireDetails(integrationId, detailsId),
	};
}

/**
 * Narrows the integrations this client serves to what the host's agent tools need: the host can observe artifacts and
 * run their native actions, but cannot start a sign-in, post automation notices, or submit prompts through this client.
 */
export function createHostFacingArtifactAccess(access: IArtifactIntegrationAccess): IArtifactIntegrationAccess {
	return {
		acquireArtifact: async (...args) => {
			const reference = await access.acquireArtifact(...args);
			return { object: createHostFacingArtifactModel(reference.object), dispose: () => reference.dispose() };
		},
	};
}

function createHostFacingArtifactModel(model: IArtifactModel): IArtifactModel {
	return {
		snapshot: model.snapshot,
		requestAuthentication: async () => {
			throw new Error(localize('artifactHostSignInUnsupported', "Sign in from the Agents window instead."));
		},
		configure: (...args) => model.configure(...args),
		invoke: async (...args) => {
			const [integrationId, actionId] = args;
			const action = model.snapshot.get().contributions.find(contribution => contribution.integrationId === integrationId)?.actions.find(candidate => candidate.id === actionId);
			if (action?.kind !== 'code') {
				throw new Error(localize('artifactHostPromptActionUnsupported', "The agent host can only run native artifact actions."));
			}
			return model.invoke(...args);
		},
		cancel: (...args) => model.cancel(...args),
		reconcile: (...args) => model.reconcile(...args),
		getRuns: (...args) => model.getRuns(...args),
		acquireDetails: (...args) => model.acquireDetails(...args),
	};
}

interface IClientArtifactHost extends IDisposable {
	readonly client: IArtifactIntegrationAccess;
}

export class AgentHostArtifactIntegrations extends Disposable {
	// A local connection wrapper can acquire its real observables without changing identity.
	private readonly connection = observableValueOpts<IAgentConnection | undefined>({ owner: this, equalsFn: () => false }, undefined);
	private readonly client = this._register(new MutableDisposable<ArtifactIntegrationClient>());
	private readonly bridge = this._register(new MutableDisposable());
	private readonly fallback = this._register(new MutableDisposable<IClientArtifactHost>());
	private readonly permitted;
	private current: IAgentConnection | undefined;
	private selected: 'host' | 'client' | undefined;
	private reason: string | undefined;
	private scope: string;
	private selectionKey: string;

	constructor(
		targetHost: string,
		remoteAddress: string | undefined,
		createLocalHost: (...args: ConstructorParameters<typeof LocalArtifactIntegrationHost>) => IClientArtifactHost = (...args) => new LocalArtifactIntegrationHost(...args),
		private readonly synchronizeWorkspaceConfiguration: ArtifactWorkspaceConfigurationSynchronizer | undefined,
		@IArtifactIntegrationRegistry private readonly registry: IArtifactIntegrationRegistry,
		@ILogService private readonly logService: ILogService,
		@IStorageService private readonly storageService: IStorageService,
		@IUserDataProfileService profileService: IUserDataProfileService,
		@IChatEntitlementService entitlementService: IChatEntitlementService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IRemoteAgentHostConnectionCustomizationService connectionCustomizations: IRemoteAgentHostConnectionCustomizationService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();
		const authentication = instantiationService.createInstance(AgentHostInteractiveAuthentication);
		this.scope = JSON.stringify([profileService.currentProfile.id, targetHost]);
		this.selectionKey = `artifactIntegrations.authority.${this.scope}`;
		const previous = storageService.get(this.selectionKey, StorageScope.APPLICATION);
		this.selected = previous === 'host' || previous === 'client' ? previous : undefined;
		const enabled = observableConfigValue(ArtifactIntegrationsSettingId, false, configurationService);
		const aiEnabled = observableFromEvent(this, entitlementService.onDidChangeSentiment, () => !entitlementService.sentiment.hidden);
		this.permitted = derived(this, reader => enabled.read(reader) && aiEnabled.read(reader));
		const profile = observableFromEvent(this, profileService.onDidChangeCurrentProfile, () => profileService.currentProfile.id);
		this._register(autorun(reader => {
			const scope = JSON.stringify([profile.read(reader), targetHost]);
			if (scope !== this.scope) {
				this.bridge.clear();
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
				if (!this.permitted.read(reader)) {
					this.bridge.clear();
				}
				this.reason = selection.reason === 'authorityChanged'
					? localize('artifactAuthorityChanged', "The artifact coordinator changed. Existing local automations remain paused; they are not migrated automatically.")
					: localize('artifactCoordinatorUnavailable', "The artifact integration coordinator is unavailable.");
				return;
			}
			this.reason = undefined;
			if (!connection) {
				return;
			}
			if (this.current === connection) {
				if (!this.bridge.value && selection.kind === 'host' && connection.serveArtifactIntegrations && this.fallback.value) {
					this.bridge.value = this.serveClientIntegrations(connection, this.fallback.value.client);
				}
				return;
			}
			this.bridge.clear();
			this.client.clear();
			this.fallback.clear();
			this.current = connection;
			this.selected = selection.kind;
			this.storageService.store(this.selectionKey, selection.kind, StorageScope.APPLICATION, StorageTarget.MACHINE);
			const authenticate: ArtifactAuthenticationHandler = async (request, clientIsCurrent) => {
				const isCurrent = () => clientIsCurrent() && this.current === connection && this.scope === scope
					&& this.permitted.read(undefined) && connection.connectionAvailable?.read(undefined) === true;
				if (!isCurrent()) {
					throw new CancellationError();
				}
				const customization = remoteAddress ? connectionCustomizations.get(remoteAddress) : undefined;
				await authentication.request({
					resource: request.resource,
					authorization_servers: request.authorizationServers ? [...request.authorizationServers] : undefined,
					scopes_supported: request.scopes ? [...request.scopes] : undefined,
				}, {
					logPrefix: '[ArtifactIntegrations]',
					isCurrent,
					authenticate: async credential => {
						const result = await authenticateWithConnectionCustomization(connection, credential, customization, isCurrent, AuthRequiredReason.Required);
						if (!result.authenticated) {
							throw new Error(localize('artifactSignInRejected', "The agent host did not accept the sign-in. Try an account with access to this resource."));
						}
						return result;
					},
				});
			};
			if (selection.kind === 'host') {
				const transport = connection.artifactIntegrationTransport;
				if (!transport) {
					this.reason = localize('artifactTransportUnavailable', "The host advertises artifact integrations, but this connection cannot access them.");
					return;
				}
				this.client.value = new ArtifactIntegrationClient({
					onDidUpdate: transport.onDidUpdate,
					onDidReset: transport.onDidReset,
					available: derived(reader => this.permitted.read(reader) && this.connection.read(reader) === connection && transport.available?.read(reader) !== false && getAgentHostArtifactIntegrationsCapability(connection.initializeResult.read(reader)) === 'supported'),
					authenticate,
					request: request => transport.request(request),
				}, this.logService);
			}
			try {
				const permitted = derived(reader => this.connection.read(reader) === connection && selectArtifactCoordinator(
					getAgentHostArtifactIntegrationsCapability(connection.initializeResult.read(reader)),
					connection.connectionAvailable?.read(reader) === true,
					this.permitted.read(reader),
					selection.kind,
				).kind !== 'unavailable');
				// Integrations coordinated here sign in within their own runtime; only host integrations hand credentials to the host.
				this.fallback.value = createLocalHost(this.scope,
					(authority, storage, isOwner) => createClientArtifactRuntime(authority, targetHost, storage, isOwner, connection, permitted, this.permitted, this.registry, this.logService,
						() => this.extensionService.activateByEvent('onChatArtifactIntegration')), this.logService);
				if (selection.kind === 'host' && connection.serveArtifactIntegrations) {
					this.bridge.value = this.serveClientIntegrations(connection, this.fallback.value.client);
				}
			} catch (error) {
				if (!this.client.value) {
					this.current = undefined;
					this.reason = localize('artifactLocalRuntimeUnavailable', "Local artifact integrations could not be started.");
				}
				this.logService.error('[ArtifactIntegrations] Could not start client runtime', error);
			}
		}));
	}

	setConnection(connection: IAgentConnection | undefined): void {
		this.connection.set(connection, undefined);
	}

	/** Lets the host's agents use integrations that this client coordinates, such as extension integrations. */
	private serveClientIntegrations(connection: IAgentConnection, access: IArtifactIntegrationAccess): IDisposable {
		const store = new DisposableStore();
		const hostAccess = createHostFacingArtifactAccess(access);
		const integrations = derived(reader => this.registry.integrations.read(reader).map(toArtifactIntegrationDescriptor));
		store.add(connection.serveArtifactIntegrations!(() => new ArtifactIntegrationServer(hostAccess), integrations));
		// Extensions register lazily; activate them so agents learn which artifacts they support before any is recorded.
		this.extensionService.activateByEvent('onChatArtifactIntegration').catch(error => this.logService.error('[ArtifactIntegrations] Could not activate integration extensions', error));
		return store;
	}

	async acquireArtifact(session: string, artifactId: string, workspace?: IObservable<IArtifactWorkspaceConfigurationContext | undefined>): Promise<IReference<IArtifactModel>> {
		const access = this.client.value ?? this.fallback.value?.client;
		if (this.reason || !access) {
			throw new Error(this.reason ?? localize('artifactCoordinatorPending', "Waiting for artifact integration capabilities."));
		}
		const localAccess = this.client.value ? this.fallback.value?.client : undefined;
		const store = new DisposableStore();
		try {
			const reference = store.add(await access.acquireArtifact(session, artifactId));
			let model = reference.object;
			if (localAccess) {
				const local = observableValue<IArtifactModel | undefined>(this, undefined);
				model = new CompositeArtifactModel(reference.object, local);
				void localAccess.acquireArtifact(session, artifactId).then(reference => {
					if (store.isDisposed) {
						reference.dispose();
					} else {
						store.add(reference);
						local.set(reference.object, undefined);
					}
				}).catch(error => this.logService.error('[ArtifactIntegrations] Could not acquire client integration', error));
			}
			if (workspace && this.client.value) {
				this.synchronizeWorkspaceConfiguration?.(store, this.connection, () => this.selected === 'host', session, artifactId, workspace, reference.object);
			}
			return { object: model, dispose: () => store.dispose() };
		} catch (error) {
			store.dispose();
			throw error;
		}
	}
}
