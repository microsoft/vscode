/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Sequencer } from '../../../base/common/async.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, IReference, toDisposable } from '../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableValue } from '../../../base/common/observable.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { ILogService } from '../../log/common/log.js';
import { localize } from '../../../nls.js';
import { ArtifactDetails, ArtifactRun, ArtifactSnapshot, IArtifactDetailsModel, IArtifactIntegrationAccess, IArtifactModel } from './artifactIntegration.js';
import { isArtifactAutomationOption, isArtifactConfiguration, isArtifactRecord, isArtifactRun } from './artifactIntegrationStore.js';

export type ArtifactIntegrationRequest =
	| { readonly kind: 'acquire'; readonly subscription: string; readonly session: string; readonly artifactId: string }
	| { readonly kind: 'release'; readonly subscription: string }
	| { readonly kind: 'configure'; readonly subscription: string; readonly integrationId: string; readonly revision: number; readonly values: Readonly<Record<string, boolean | string>> }
	| { readonly kind: 'invoke'; readonly subscription: string; readonly integrationId: string; readonly actionId: string; readonly chat: string; readonly requestId: string }
	| { readonly kind: 'cancel' | 'reconcile'; readonly subscription: string; readonly runId: string }
	| { readonly kind: 'history'; readonly subscription: string; readonly before?: string; readonly limit?: number }
	| { readonly kind: 'details'; readonly subscription: string; readonly parent: string; readonly integrationId: string; readonly detailsId: string }
	| { readonly kind: 'loadMore'; readonly subscription: string };

export type ArtifactIntegrationUpdate = { readonly subscription: string; readonly revision: number } & (
	| { readonly kind: 'artifact'; readonly snapshot: ArtifactSnapshot }
	| { readonly kind: 'details'; readonly details: ArtifactDetails; readonly canLoadMore: boolean }
);

export type ArtifactIntegrationResponse = ArtifactIntegrationUpdate | { readonly kind: 'ok' } | { readonly kind: 'run'; readonly run: ArtifactRun }
	| { readonly kind: 'history'; readonly runs: readonly ArtifactRun[]; readonly next?: string };

export interface IArtifactIntegrationTransport {
	readonly onDidUpdate: Event<ArtifactIntegrationUpdate>;
	readonly onDidReset?: Event<void>;
	readonly available?: IObservable<boolean>;
	request(request: ArtifactIntegrationRequest): Promise<ArtifactIntegrationResponse>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

function strings(value: Record<string, unknown>, ...keys: string[]): boolean {
	return keys.every(key => typeof value[key] === 'string' && value[key].length > 0);
}

export function isArtifactIntegrationRequest(value: unknown): value is ArtifactIntegrationRequest {
	if (!isRecord(value) || !strings(value, 'subscription')) {
		return false;
	}
	switch (value.kind) {
		case 'acquire': return strings(value, 'session', 'artifactId');
		case 'release': case 'loadMore': return true;
		case 'details': return strings(value, 'parent', 'integrationId', 'detailsId');
		case 'invoke': return strings(value, 'integrationId', 'actionId', 'chat', 'requestId');
		case 'cancel': case 'reconcile': return strings(value, 'runId');
		case 'history': return (value.before === undefined || strings(value, 'before'))
			&& (value.limit === undefined || (typeof value.limit === 'number' && Number.isSafeInteger(value.limit) && value.limit > 0 && value.limit <= 200));
		case 'configure': return strings(value, 'integrationId') && typeof value.revision === 'number' && Number.isSafeInteger(value.revision) && value.revision >= 0
			&& isRecord(value.values) && Object.entries(value.values).every(([key, item]) => !['__proto__', 'constructor', 'prototype'].includes(key) && (typeof item === 'string' || typeof item === 'boolean'));
		default: return false;
	}
}

function isAvailability(value: unknown): boolean {
	return isRecord(value) && (value.kind === 'loading' || value.kind === 'available'
		|| (['stale', 'authenticationRequired', 'unavailable', 'error'].includes(String(value.kind)) && typeof value.reason === 'string'))
		&& (value.observedAt === undefined || (typeof value.observedAt === 'number' && Number.isFinite(value.observedAt)));
}

function isIcon(value: unknown): boolean {
	return isRecord(value) && typeof value.id === 'string' && /^[a-zA-Z0-9-]+$/.test(value.id)
		&& (value.colorId === undefined || (typeof value.colorId === 'string' && /^[a-zA-Z0-9.-]+$/.test(value.colorId)));
}

function isPart(value: unknown): boolean {
	return isRecord(value) && isIcon(value.icon) && strings(value, 'label', 'detailsId');
}

export function isArtifactDetails(value: unknown): value is ArtifactDetails {
	return isRecord(value) && isAvailability(value.availability) && typeof value.title === 'string'
		&& (value.description === undefined || typeof value.description === 'string')
		&& (value.completeness === 'complete' || value.completeness === 'partial')
		&& (value.facts === undefined || (Array.isArray(value.facts) && value.facts.every(fact => isRecord(fact) && strings(fact, 'id', 'label') && typeof fact.value === 'string')))
		&& Array.isArray(value.links) && value.links.every(link => isRecord(link) && (link.kind === 'action' ? strings(link, 'actionId') : link.kind === 'automation' && strings(link, 'optionId')))
		&& Array.isArray(value.items) && value.items.length <= 200 && value.items.every(item => isRecord(item) && strings(item, 'id', 'label', 'resource') && isIcon(item.icon) && (item.description === undefined || typeof item.description === 'string'))
		&& new Set(value.items.map(item => item.id)).size === value.items.length;
}

export function isArtifactSnapshot(value: unknown): value is ArtifactSnapshot {
	return isRecord(value) && isRecord(value.authority) && strings(value.authority, 'id', 'targetHost')
		&& (value.authority.location === 'host' || value.authority.location === 'client') && strings(value, 'session') && isArtifactRecord(value.artifact)
		&& (value.mainIntegrationId === undefined || typeof value.mainIntegrationId === 'string')
		&& Array.isArray(value.runs) && value.runs.every(isArtifactRun)
		&& Array.isArray(value.contributions) && value.contributions.every(contribution =>
			isRecord(contribution) && strings(contribution, 'integrationId', 'label') && isArtifactConfiguration(contribution.configuration)
			&& Array.isArray(contribution.options) && contribution.options.every(isArtifactAutomationOption)
			&& Array.isArray(contribution.actions) && contribution.actions.every(action => isRecord(action) && strings(action, 'id', 'iconId', 'label') && (action.kind === 'code' || action.kind === 'prompt'))
			&& isRecord(contribution.view) && isAvailability(contribution.view.availability)
			&& (contribution.view.main === undefined || isPart(contribution.view.main))
			&& Array.isArray(contribution.view.sections) && contribution.view.sections.every(section => isRecord(section) && strings(section, 'id') && isPart(section))
			&& [contribution.view.stateActions, contribution.view.generalActions].every(actions => Array.isArray(actions) && actions.every(action =>
				isRecord(action) && strings(action, 'id') && typeof action.enabled === 'boolean' && (action.disabledReason === undefined || typeof action.disabledReason === 'string')))
			&& Array.isArray(contribution.view.automationAvailability) && contribution.view.automationAvailability.every(option => isRecord(option) && strings(option, 'id') && typeof option.available === 'boolean'
				&& (option.unavailableReason === undefined || typeof option.unavailableReason === 'string')));
}

export function isArtifactIntegrationUpdate(value: unknown): value is ArtifactIntegrationUpdate {
	return isRecord(value) && strings(value, 'subscription') && typeof value.revision === 'number' && Number.isSafeInteger(value.revision) && value.revision >= 0
		&& (value.kind === 'artifact' ? isArtifactSnapshot(value.snapshot) : value.kind === 'details' && isArtifactDetails(value.details) && typeof value.canLoadMore === 'boolean');
}

export function isArtifactIntegrationResponse(value: unknown): value is ArtifactIntegrationResponse {
	return isRecord(value) && (value.kind === 'ok' || (value.kind === 'run' && isArtifactRun(value.run)) || isArtifactIntegrationUpdate(value)
		|| (value.kind === 'history' && Array.isArray(value.runs) && value.runs.every(isArtifactRun) && (value.next === undefined || typeof value.next === 'string')));
}

/** One endpoint per connection; disposal releases that connection's subscriptions, not its automations. */
export class ArtifactIntegrationServer extends Disposable implements IArtifactIntegrationTransport {
	private readonly subscriptions = this._register(new DisposableMap<string, DisposableStore>());
	private readonly artifacts = new Map<string, IArtifactModel>();
	private readonly details = new Map<string, IArtifactDetailsModel>();
	private readonly updates = this._register(new Emitter<ArtifactIntegrationUpdate>());
	readonly onDidUpdate = this.updates.event;

	constructor(private readonly access: IArtifactIntegrationAccess) {
		super();
	}

	async request(request: ArtifactIntegrationRequest): Promise<ArtifactIntegrationResponse> {
		if (!isArtifactIntegrationRequest(request) || this._store.isDisposed) {
			throw new Error('Invalid artifact integration request or disposed connection');
		}
		if (request.kind === 'acquire' || request.kind === 'details') {
			if (this.subscriptions.has(request.subscription)) {
				throw new Error('Duplicate artifact subscription');
			}
			const store = new DisposableStore();
			this.subscriptions.set(request.subscription, store);
			let revision = 0;
			try {
				if (request.kind === 'acquire') {
					const reference = store.add(await this.access.acquireArtifact(request.session, request.artifactId));
					if (store.isDisposed) {
						throw new Error('Artifact subscription was released during acquisition');
					}
					this.artifacts.set(request.subscription, reference.object);
					store.add(toDisposable(() => this.artifacts.delete(request.subscription)));
					store.add(autorun(reader => {
						const snapshot = reference.object.snapshot.read(reader);
						this.updates.fire({ kind: 'artifact', subscription: request.subscription, revision: ++revision, snapshot });
					}));
					return { kind: 'artifact', subscription: request.subscription, revision, snapshot: reference.object.snapshot.get() };
				}
				const parent = this.requireArtifact(request.parent);
				const details = store.add(await parent.acquireDetails(request.integrationId, request.detailsId));
				if (store.isDisposed) {
					throw new Error('Artifact details were released during acquisition');
				}
				this.details.set(request.subscription, details);
				store.add(toDisposable(() => this.details.delete(request.subscription)));
				store.add(autorun(reader => {
					this.updates.fire({ kind: 'details', subscription: request.subscription, revision: ++revision, details: details.details.read(reader), canLoadMore: !!details.loadMore });
				}));
				return { kind: 'details', subscription: request.subscription, revision, details: details.details.get(), canLoadMore: !!details.loadMore };
			} catch (error) {
				this.subscriptions.deleteAndDispose(request.subscription);
				throw error;
			}
		}
		switch (request.kind) {
			case 'release':
				this.subscriptions.deleteAndDispose(request.subscription);
				break;
			case 'loadMore': {
				const model = this.details.get(request.subscription);
				if (!model?.loadMore) {
					throw new Error('Artifact details do not offer more items');
				}
				await model.loadMore(CancellationToken.None);
				break;
			}
			case 'configure':
				await this.requireArtifact(request.subscription).configure(request.integrationId, request.revision, request.values);
				break;
			case 'invoke':
				return { kind: 'run', run: await this.requireArtifact(request.subscription).invoke(request.integrationId, request.actionId, request.chat, request.requestId) };
			case 'cancel':
				await this.requireArtifact(request.subscription).cancel(request.runId);
				break;
			case 'reconcile':
				await this.requireArtifact(request.subscription).reconcile(request.runId);
				break;
			case 'history':
				return { kind: 'history', ...await this.requireArtifact(request.subscription).getRuns(request.before, request.limit) };
		}
		return { kind: 'ok' };
	}

	private requireArtifact(subscription: string): IArtifactModel {
		const artifact = this.artifacts.get(subscription);
		if (!artifact) {
			throw new Error('Artifact subscription not found');
		}
		return artifact;
	}
}

export class ArtifactIntegrationClient extends Disposable implements IArtifactIntegrationAccess {
	private readonly leases = this._register(new DisposableMap<string, DisposableStore>());
	private readonly restorers = new Map<string, { readonly details: boolean; readonly restore: () => Promise<void> }>();
	private readonly referenceCounts = new Map<string, number>();
	private readonly restoring = new Sequencer();
	private readonly disposed = observableValue(this, false);

	constructor(private readonly transport: IArtifactIntegrationTransport, private readonly logService: ILogService) {
		super();
		if (transport.onDidReset) {
			this._register(transport.onDidReset(() => {
				void this.restoring.queue(async () => {
					for (const [, restorer] of [...this.restorers].sort((a, b) => Number(a[1].details) - Number(b[1].details))) {
						try {
							await restorer.restore();
						} catch (error) {
							this.logService.error('[ArtifactIntegrations] Could not restore subscription', error);
						}
					}
				});
			}));
		}
	}

	async acquireArtifact(session: string, artifactId: string): Promise<IReference<IArtifactModel>> {
		const subscription = generateUuid();
		const store = this.createLease(subscription);
		const value = observableValue<ArtifactSnapshot | undefined>(this, undefined);
		const restoring = observableValue(this, false);
		let revision = -1;
		const accept = (update: ArtifactIntegrationUpdate) => {
			if (!store.isDisposed && isArtifactIntegrationUpdate(update) && update.subscription === subscription && update.kind === 'artifact' && update.revision > revision) {
				revision = update.revision;
				value.set(update.snapshot, undefined);
			}
		};
		store.add(this.transport.onDidUpdate(accept));
		try {
			const response = await this.request({ kind: 'acquire', subscription, session, artifactId });
			if (response.kind !== 'artifact' || response.subscription !== subscription || store.isDisposed) {
				throw new Error('Invalid artifact subscription response');
			}
			accept(response);
			this.restorers.set(subscription, {
				details: false,
				restore: async () => {
					if (store.isDisposed) {
						return;
					}
					restoring.set(true, undefined);
					revision = -1;
					const response = await this.request({ kind: 'acquire', subscription, session, artifactId });
					if (response.kind !== 'artifact' || response.subscription !== subscription) {
						throw new Error('Invalid restored artifact subscription');
					}
					accept(response);
					restoring.set(false, undefined);
				},
			});
			const snapshot = derived(this, reader => {
				const current = value.read(reader);
				if (!current) {
					throw new Error('Artifact subscription is not initialized');
				}
				if (this.disposed.read(reader) || restoring.read(reader) || this.transport.available?.read(reader) === false) {
					const reason = localize('artifactTransportUnavailable', "The artifact coordinator is unavailable or restoring its subscriptions.");
					return {
						...current,
						contributions: current.contributions.map(contribution => ({
							...contribution,
							view: {
								...contribution.view, availability: { kind: 'unavailable' as const, reason },
								stateActions: contribution.view.stateActions.map(action => ({ ...action, enabled: false, disabledReason: reason })),
								generalActions: contribution.view.generalActions.map(action => ({ ...action, enabled: false, disabledReason: reason })),
								automationAvailability: contribution.view.automationAvailability.map(option => ({ ...option, available: false, unavailableReason: reason })),
							},
						})),
					};
				}
				return current;
			});
			const object: IArtifactModel = {
				snapshot,
				configure: (integrationId, revision, values) => this.requestAcknowledgement({ kind: 'configure', subscription, integrationId, revision, values }),
				invoke: async (integrationId, actionId, chat, requestId) => {
					const result = await this.request({ kind: 'invoke', subscription, integrationId, actionId, chat, requestId });
					if (result.kind !== 'run') {
						throw new Error('Invalid artifact action response');
					}
					return result.run;
				},
				cancel: runId => this.requestAcknowledgement({ kind: 'cancel', subscription, runId }),
				reconcile: runId => this.requestAcknowledgement({ kind: 'reconcile', subscription, runId }),
				getRuns: async (before, limit) => {
					const result = await this.request({ kind: 'history', subscription, before, limit });
					if (result.kind !== 'history') {
						throw new Error('Invalid artifact history response');
					}
					return result;
				},
				acquireDetails: (integrationId, detailsId) => this.acquireDetails(subscription, integrationId, detailsId),
			};
			const lease = toDisposable(() => this.releaseLease(subscription));
			return { object, dispose: () => lease.dispose() };
		} catch (error) {
			this.leases.deleteAndDispose(subscription);
			throw error;
		}
	}

	private async acquireDetails(parent: string, integrationId: string, detailsId: string): Promise<IArtifactDetailsModel> {
		const parentCount = this.referenceCounts.get(parent);
		if (parentCount === undefined || !this.leases.has(parent)) {
			throw new Error('The parent artifact subscription is closed');
		}
		const subscription = generateUuid();
		const store = this.createLease(subscription);
		this.referenceCounts.set(parent, parentCount + 1);
		store.add(toDisposable(() => this.releaseLease(parent)));
		const value = observableValue<ArtifactDetails | undefined>(this, undefined);
		let revision = -1;
		const accept = (update: ArtifactIntegrationUpdate) => {
			if (!store.isDisposed && isArtifactIntegrationUpdate(update) && update.subscription === subscription && update.kind === 'details' && update.revision > revision) {
				revision = update.revision;
				value.set(update.details, undefined);
			}
		};
		store.add(this.transport.onDidUpdate(accept));
		try {
			const response = await this.request({ kind: 'details', subscription, parent, integrationId, detailsId });
			if (response.kind !== 'details' || response.subscription !== subscription || store.isDisposed) {
				throw new Error('Invalid artifact details response');
			}
			accept(response);
			this.restorers.set(subscription, {
				details: true,
				restore: async () => {
					if (store.isDisposed) {
						return;
					}
					revision = -1;
					const response = await this.request({ kind: 'details', subscription, parent, integrationId, detailsId });
					if (response.kind !== 'details' || response.subscription !== subscription) {
						throw new Error('Invalid restored artifact details subscription');
					}
					accept(response);
				},
			});
			const lease = toDisposable(() => this.releaseLease(subscription));
			return {
				details: value.map(value => {
					if (!value) {
						throw new Error('Artifact details are not initialized');
					}
					return value;
				}),
				loadMore: response.canLoadMore ? () => this.requestAcknowledgement({ kind: 'loadMore', subscription }) : undefined,
				dispose: () => lease.dispose(),
			};
		} catch (error) {
			this.leases.deleteAndDispose(subscription);
			throw error;
		}
	}

	private createLease(subscription: string): DisposableStore {
		if (this._store.isDisposed) {
			throw new Error('Artifact integration client is disposed');
		}
		const store = new DisposableStore();
		this.leases.set(subscription, store);
		this.referenceCounts.set(subscription, 1);
		store.add(toDisposable(() => {
			this.restorers.delete(subscription);
			this.referenceCounts.delete(subscription);
			void this.transport.request({ kind: 'release', subscription }).catch(error => this.logService.warn('[ArtifactIntegrations] Subscription release failed', error));
		}));
		return store;
	}

	private releaseLease(subscription: string): void {
		const references = this.referenceCounts.get(subscription);
		if (references === undefined) {
			return;
		}
		if (references === 1) {
			this.leases.deleteAndDispose(subscription);
		} else {
			this.referenceCounts.set(subscription, references - 1);
		}

		private async request(request: ArtifactIntegrationRequest): Promise<ArtifactIntegrationResponse> {
			if (this._store.isDisposed || this.transport.available?.get() === false) {
				throw new Error('The artifact coordinator is unavailable; the request was not sent');
			}
			const response = await this.transport.request(request);
			if (!isArtifactIntegrationResponse(response)) {
				throw new Error('Invalid artifact integration response');
			}
			return response;
		}

		private async requestAcknowledgement(request: ArtifactIntegrationRequest): Promise<void> {
			const response = await this.request(request);
			if (response.kind !== 'ok') {
				throw new Error('The artifact coordinator did not acknowledge the operation');
			}
		}

		override dispose(): void {
			this.disposed.set(true, undefined);
			super.dispose();
		}
	}
}
