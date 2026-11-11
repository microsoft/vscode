/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable, IReference, toDisposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, observableValue } from '../../../../base/common/observable.js';
import { raceTimeout } from '../../../../base/common/async.js';
import { ArtifactIntegrationDescriptor, IArtifactIntegrationAccess, IArtifactModel, toArtifactIntegrationDescriptor } from '../../../artifactIntegrations/common/artifactIntegration.js';
import type { IClientArtifactIntegrations, IClientArtifactIntegrationRegistry } from '../../common/clientArtifactIntegrations.js';
import { IArtifactIntegrationRegistry } from '../../../artifactIntegrations/common/artifactIntegrationRegistry.js';
import { CompositeArtifactModel } from '../../../artifactIntegrations/common/compositeArtifactModel.js';
import { createDecorator } from '../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../log/common/log.js';

export const IAgentHostArtifactIntegrationDirectory = createDecorator<IAgentHostArtifactIntegrationDirectory>('agentHostArtifactIntegrationDirectory');

/** The integrations agents can use on recorded artifacts, and the connected clients that coordinate some of them. */
export interface IAgentHostArtifactIntegrationDirectory extends IClientArtifactIntegrationRegistry {
	readonly _serviceBrand: undefined;
	/** Host integrations first, then integrations only connected clients provide. */
	readonly integrations: IObservable<readonly ArtifactIntegrationDescriptor[]>;
	/**
	 * The client whose integrations are composed with the host's: the client that started the turn, or else the
	 * most recently registered one. Only the client that started the turn may have its integrations changed.
	 */
	getClient(preferredClientId: string | undefined): IClientArtifactIntegrationSelection | undefined;
}

export interface IClientArtifactIntegrationSelection {
	readonly integrations: IClientArtifactIntegrations;
	/** Whether this client started the turn, rather than being the fallback for a turn started elsewhere. */
	readonly startedTurn: boolean;
}

interface IClientEntry {
	readonly clientId: string;
	readonly integrations: IClientArtifactIntegrations;
}

export class AgentHostArtifactIntegrationDirectory extends Disposable implements IAgentHostArtifactIntegrationDirectory {
	declare readonly _serviceBrand: undefined;
	private readonly clients = observableValue<readonly IClientEntry[]>(this, []);
	readonly integrations: IObservable<readonly ArtifactIntegrationDescriptor[]>;

	constructor(@IArtifactIntegrationRegistry registry: IArtifactIntegrationRegistry) {
		super();
		this.integrations = derived(this, reader => {
			const integrations = new Map<string, ArtifactIntegrationDescriptor>();
			for (const integration of registry.integrations.read(reader)) {
				integrations.set(integration.id, toArtifactIntegrationDescriptor(integration));
			}
			for (const client of this.clients.read(reader)) {
				for (const integration of client.integrations.integrations.read(reader)) {
					if (!integrations.has(integration.id)) {
						integrations.set(integration.id, integration);
					}
				}
			}
			return [...integrations.values()];
		});
	}

	register(clientId: string, integrations: IClientArtifactIntegrations): IDisposable {
		const entry: IClientEntry = { clientId, integrations };
		// A reconnecting client can briefly hold two connections; its newest offer wins.
		this.clients.set([...this.clients.get().filter(client => client.clientId !== clientId), entry], undefined);
		return toDisposable(() => this.clients.set(this.clients.get().filter(client => client !== entry), undefined));
	}

	getClient(preferredClientId: string | undefined): IClientArtifactIntegrationSelection | undefined {
		const clients = this.clients.get();
		const preferred = clients.find(client => client.clientId === preferredClientId);
		const selected = preferred ?? clients.at(-1);
		return selected && { integrations: selected.integrations, startedTurn: selected === preferred };
	}
}

const CLIENT_ACQUISITION_TIMEOUT = 10_000;

/** A recorded artifact with host integrations and, when a client offers them, that client's integrations. */
export interface IComposedArtifact {
	readonly model: IArtifactModel;
	/** Whether the composed client integrations belong to the client that started the turn. */
	readonly clientStartedTurn: boolean;
}

/**
 * Acquires a recorded artifact with host integrations and, when a client offers
 * them, that client's integrations. Each integration keeps its own authority.
 */
export async function acquireComposedArtifact(host: IArtifactIntegrationAccess, client: { readonly access: IArtifactIntegrationAccess; readonly startedTurn: boolean } | undefined, session: string, artifactId: string, logService: ILogService): Promise<IReference<IComposedArtifact>> {
	const store = new DisposableStore();
	try {
		const primary = store.add(await host.acquireArtifact(session, artifactId));
		if (!client) {
			return { object: { model: primary.object, clientStartedTurn: false }, dispose: () => store.dispose() };
		}
		const secondary = observableValue<IArtifactModel | undefined>('clientArtifact', undefined);
		const pending = client.access.acquireArtifact(session, artifactId);
		const settled = await raceTimeout(pending.then(
			reference => ({ kind: 'acquired' as const, reference }),
			error => ({ kind: 'failed' as const, error }),
		), CLIENT_ACQUISITION_TIMEOUT);
		if (!settled) {
			// Release a late subscription instead of leaking it on the client.
			pending.then(reference => reference.dispose(), () => { /* The client already failed. */ });
			logService.warn('[ArtifactIntegrations] Timed out acquiring client artifact integrations');
		} else if (settled.kind === 'failed') {
			logService.warn('[ArtifactIntegrations] Could not acquire client artifact integrations', settled.error);
		} else {
			store.add(settled.reference);
			secondary.set(settled.reference.object, undefined);
		}
		return { object: { model: new CompositeArtifactModel(primary.object, secondary), clientStartedTurn: client.startedTurn }, dispose: () => store.dispose() };
	} catch (error) {
		store.dispose();
		throw error;
	}
}
