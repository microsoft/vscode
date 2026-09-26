/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError } from '../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { CancellationError } from '../../../base/common/errors.js';
import { Disposable, DisposableStore, IDisposable, IReference, toDisposable } from '../../../base/common/lifecycle.js';
import { observableValue } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ArtifactAutomationOption, ArtifactResourceMatch, IArtifactBindingContext, IArtifactIntegration, IArtifactIntegrationBinding, IArtifactResourceContext } from './artifactIntegration.js';
import { validateArtifactOptions } from './artifactIntegrationStore.js';

export const IArtifactIntegrationRegistry = createDecorator<ArtifactIntegrationRegistry>('artifactIntegrationRegistry');

export interface IRegisteredArtifactIntegration {
	readonly id: string;
	readonly label: string;
	readonly runtimeId: string;
	readonly options: readonly ArtifactAutomationOption[];
	readonly presentationPriority: number;
	isActive(): boolean;
	create(context: IArtifactBindingContext, resourceContext: IArtifactResourceContext, token: CancellationToken): Promise<IReference<{ readonly binding: IArtifactIntegrationBinding; readonly match: ArtifactResourceMatch }> | undefined>;
}

class ArtifactResourcePool<T extends IDisposable> extends Disposable {
	private readonly entries = new Map<string, { readonly promise: Promise<T>; readonly token: CancellationTokenSource; references: number }>();

	constructor(private readonly integration: IArtifactIntegration<T>) {
		super();
	}

	async acquire(match: ArtifactResourceMatch, context: IArtifactResourceContext, token: CancellationToken): Promise<IReference<T>> {
		if (this._store.isDisposed || token.isCancellationRequested) {
			throw new CancellationError();
		}
		const key = JSON.stringify([context.authority.id, context.authority.targetHost, context.runtimeId, match.key, match.credentialScope]);
		let entry = this.entries.get(key);
		if (!entry) {
			const source = new CancellationTokenSource();
			entry = { promise: Promise.resolve().then(() => this.integration.createResource(match, context, source.token)), token: source, references: 0 };
			this.entries.set(key, entry);
		}
		entry.references++;
		const current = entry;
		const release = toDisposable(() => {
			if (--current.references === 0) {
				this.entries.delete(key);
				current.token.dispose(true);
				void current.promise.then(resource => resource.dispose(), () => { /* The acquire operation reports factory failures. */ });
			}
		});
		try {
			const object = await raceCancellationError(raceCancellationError(current.promise, current.token.token), token);
			return { object, dispose: () => release.dispose() };
		} catch (error) {
			release.dispose();
			throw error;
		}
	}

	override dispose(): void {
		for (const entry of this.entries.values()) {
			entry.token.cancel();
		}
		super.dispose();
	}
}

export class ArtifactIntegrationRegistry extends Disposable {
	declare readonly _serviceBrand: undefined;
	private readonly registrations = new Map<string, IDisposable>();
	private readonly integrationsValue = observableValue<readonly IRegisteredArtifactIntegration[]>(this, []);
	readonly integrations = this.integrationsValue;

	register<T extends IDisposable>(integration: IArtifactIntegration<T>, runtimeId: string): IDisposable {
		if (!integration.id.trim() || !runtimeId.trim() || this.registrations.has(integration.id) || !Number.isFinite(integration.presentationPriority ?? 0)) {
			throw new Error(`Invalid or duplicate artifact integration: ${integration.id}`);
		}
		validateArtifactOptions(integration.automationOptions);
		const store = new DisposableStore();
		const pool = store.add(new ArtifactResourcePool(integration));
		const registration: IRegisteredArtifactIntegration = {
			id: integration.id,
			label: integration.label,
			runtimeId,
			options: integration.automationOptions,
			presentationPriority: integration.presentationPriority ?? 0,
			isActive: () => !store.isDisposed,
			create: async (context, resourceContext, token) => {
				if (store.isDisposed) {
					throw new CancellationError();
				}
				const match = await integration.match(URI.parse(context.artifact.resource, true), token);
				if (!match) {
					return undefined;
				}
				const reference = await pool.acquire(match, resourceContext, token);
				try {
					const binding = integration.createBinding(reference.object, context);
					const lifetime = new DisposableStore();
					lifetime.add(reference);
					lifetime.add(binding);
					return { object: { binding, match }, dispose: () => lifetime.dispose() };
				} catch (error) {
					reference.dispose();
					throw error;
				}
			},
		};
		const result = toDisposable(() => {
			this.integrationsValue.set(this.integrationsValue.get().filter(candidate => candidate !== registration), undefined);
			this.registrations.delete(integration.id);
			store.dispose();
		});
		this.registrations.set(integration.id, result);
		this.integrationsValue.set([...this.integrationsValue.get(), registration].sort((a, b) => b.presentationPriority - a.presentationPriority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)), undefined);
		return result;
	}

	override dispose(): void {
		for (const registration of [...this.registrations.values()]) {
			registration.dispose();
		}
		super.dispose();
	}
}
