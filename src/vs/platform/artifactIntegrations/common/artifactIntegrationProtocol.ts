/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Sequencer } from '../../../base/common/async.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { CancellationError } from '../../../base/common/errors.js';
import { Disposable, DisposableMap, DisposableStore, IReference, toDisposable } from '../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableValue } from '../../../base/common/observable.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { ILogService } from '../../log/common/log.js';
import { localize } from '../../../nls.js';
import { ArtifactActor, ArtifactAuthenticationRequest, ArtifactDetails, ArtifactRun, ArtifactSnapshot, IArtifactDetailsModel, IArtifactIntegrationAccess, IArtifactModel } from './artifactIntegration.js';
import { isArtifactActor, isArtifactAuthenticationRequest, isArtifactRun, isArtifactSnapshot } from './artifactIntegrationValidation.js';
import { isArtifactDetails } from './artifactPresentationValidation.js';
import { ArtifactAutomationNotice } from './artifactRuntime.js';

export type ArtifactIntegrationRequest =
	| { readonly kind: 'acquire'; readonly subscription: string; readonly session: string; readonly artifactId: string }
	| { readonly kind: 'release'; readonly subscription: string }
	| { readonly kind: 'authenticate'; readonly subscription: string; readonly integrationId: string }
	| { readonly kind: 'configure'; readonly subscription: string; readonly integrationId: string; readonly revision: number; readonly values: Readonly<Record<string, boolean | string>>; readonly actor?: ArtifactActor }
	| { readonly kind: 'notice'; readonly subscription: string; readonly notice: Pick<ArtifactAutomationNotice, 'kind' | 'content' | 'iconId'> }
	| { readonly kind: 'invoke'; readonly subscription: string; readonly integrationId: string; readonly actionId: string; readonly chat: string; readonly requestId: string; readonly actor?: ArtifactActor }
	| { readonly kind: 'cancel' | 'reconcile'; readonly subscription: string; readonly runId: string }
	| { readonly kind: 'history'; readonly subscription: string; readonly before?: string; readonly limit?: number }
	| { readonly kind: 'details'; readonly subscription: string; readonly parent: string; readonly integrationId: string; readonly detailsId: string }
	| { readonly kind: 'loadMore'; readonly subscription: string };

export type ArtifactIntegrationUpdate = { readonly subscription: string; readonly revision: number } & (
	| { readonly kind: 'artifact'; readonly snapshot: ArtifactSnapshot }
	| { readonly kind: 'details'; readonly details: ArtifactDetails; readonly canLoadMore: boolean }
);

export type ArtifactIntegrationResponse = ArtifactIntegrationUpdate | { readonly kind: 'ok' } | { readonly kind: 'run'; readonly run: ArtifactRun }
	| { readonly kind: 'authentication'; readonly request: ArtifactAuthenticationRequest }
	| { readonly kind: 'history'; readonly runs: readonly ArtifactRun[]; readonly next?: string };

export type ArtifactAuthenticationHandler = (request: ArtifactAuthenticationRequest, isCurrent: () => boolean) => Promise<void>;

export interface IArtifactIntegrationTransport {
	readonly onDidUpdate: Event<ArtifactIntegrationUpdate>;
	readonly onDidReset?: Event<void>;
	readonly available?: IObservable<boolean>;
	readonly authenticate?: ArtifactAuthenticationHandler;
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
		case 'authenticate': return strings(value, 'integrationId');
		case 'details': return strings(value, 'parent', 'integrationId', 'detailsId');
		case 'invoke': return strings(value, 'integrationId', 'actionId', 'chat', 'requestId') && (value.actor === undefined || isArtifactActor(value.actor));
		case 'cancel': case 'reconcile': return strings(value, 'runId');
		case 'history': return (value.before === undefined || strings(value, 'before'))
			&& (value.limit === undefined || (typeof value.limit === 'number' && Number.isSafeInteger(value.limit) && value.limit > 0 && value.limit <= 200));
		case 'notice': return isRecord(value.notice) && ['enabled', 'changed', 'disabled'].includes(String(value.notice.kind))
			&& strings(value.notice, 'content') && String(value.notice.content).length <= 64_000
			&& (value.notice.iconId === undefined || (typeof value.notice.iconId === 'string' && /^[a-zA-Z0-9-]+$/.test(value.notice.iconId)));
		case 'configure': return strings(value, 'integrationId') && typeof value.revision === 'number' && Number.isSafeInteger(value.revision) && value.revision >= 0
			&& isRecord(value.values) && Object.entries(value.values).every(([key, item]) => !['__proto__', 'constructor', 'prototype'].includes(key) && (typeof item === 'string' || typeof item === 'boolean'))
			&& (value.actor === undefined || isArtifactActor(value.actor));
		default: return false;
	}
}

export function isArtifactIntegrationUpdate(value: unknown): value is ArtifactIntegrationUpdate {
	return isRecord(value) && strings(value, 'subscription') && typeof value.revision === 'number' && Number.isSafeInteger(value.revision) && value.revision >= 0
		&& (value.kind === 'artifact' ? isArtifactSnapshot(value.snapshot) : value.kind === 'details' && isArtifactDetails(value.details) && typeof value.canLoadMore === 'boolean');
}

export function isArtifactIntegrationResponse(value: unknown): value is ArtifactIntegrationResponse {
	return isRecord(value) && (value.kind === 'ok' || (value.kind === 'run' && isArtifactRun(value.run)) || isArtifactIntegrationUpdate(value)
		|| (value.kind === 'authentication' && isArtifactAuthenticationRequest(value.request))
		|| (value.kind === 'history' && Array.isArray(value.runs) && value.runs.every(isArtifactRun) && (value.next === undefined || typeof value.next === 'string')));
}

/** One endpoint per connection; disposal releases that connection's subscriptions, not its automations. */
export class ArtifactIntegrationServer extends Disposable implements IArtifactIntegrationTransport {
	private readonly subscriptions = this._register(new DisposableMap<string, DisposableStore>());
	private readonly artifacts = new Map<string, IArtifactModel>();
	private readonly details = new Map<string, IArtifactDetailsModel>();
	private readonly updates = this._register(new Emitter<ArtifactIntegrationUpdate>());
	readonly onDidUpdate = this.updates.event;

	constructor(
		private readonly access: IArtifactIntegrationAccess,
		private readonly postNotice?: (notice: ArtifactAutomationNotice) => Promise<void>,
	) {
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
				await this.requireArtifact(request.subscription).configure(request.integrationId, request.revision, request.values, request.actor);
				break;
			case 'notice': {
				if (!this.postNotice) {
					throw new Error('This artifact coordinator does not support client automation notices');
				}
				const { session, artifact } = this.requireArtifact(request.subscription).snapshot.get();
				const { kind, content, iconId } = request.notice;
				await this.postNotice({ session, artifact, kind, content, iconId });
				break;
			}
			case 'authenticate': {
				const challenge = await this.requireArtifact(request.subscription).requestAuthentication(request.integrationId);
				// Without a challenge, the integration signed in within its own runtime.
				return challenge ? { kind: 'authentication', request: challenge } : { kind: 'ok' };
			}
			case 'invoke':
				return { kind: 'run', run: await this.requireArtifact(request.subscription).invoke(request.integrationId, request.actionId, request.chat, request.requestId, request.actor) };
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
	private epoch = 0;

	constructor(private readonly transport: IArtifactIntegrationTransport, private readonly logService: ILogService) {
		super();
		this._register(autorun(reader => {
			if (transport.available?.read(reader) === false) {
				this.epoch++;
			}
		}));
		if (transport.onDidReset) {
			this._register(transport.onDidReset(() => {
				this.epoch++;
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
		const authenticationRequests = new Map<string, Promise<ArtifactAuthenticationRequest | undefined>>();
		const authenticating = observableValue<ReadonlySet<string>>(this, new Set());
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
							authentication: contribution.authentication ? { ...contribution.authentication, enabled: false, disabledReason: reason } : undefined,
							view: {
								...contribution.view, availability: { kind: 'unavailable' as const, reason },
								stateActions: contribution.view.stateActions.map(action => ({ ...action, enabled: false, disabledReason: reason })),
								generalActions: contribution.view.generalActions.map(action => ({ ...action, enabled: false, disabledReason: reason })),
								automationAvailability: contribution.view.automationAvailability.map(option => ({ ...option, available: false, unavailableReason: reason })),
							},
						})),
					};
				}
				const pending = authenticating.read(reader);
				return {
					...current,
					contributions: current.contributions.map(contribution => {
						// Integrations that sign in within their own runtime need no client handler.
						const unsupported = !contribution.authentication?.handledByIntegration && !this.transport.authenticate;
						return contribution.authentication && (unsupported || pending.has(contribution.integrationId)) ? {
							...contribution,
							authentication: {
								...contribution.authentication,
								enabled: false,
								disabledReason: unsupported
									? localize('artifactSignInUnsupported', "This client does not support signing in for artifacts.")
									: localize('artifactSignInPending', "Sign-in is already in progress."),
							},
						} : contribution;
					}),
				};
			});
			const object: IArtifactModel = {
				snapshot,
				requestAuthentication: integrationId => {
					const pending = authenticationRequests.get(integrationId);
					if (pending) {
						return pending;
					}
					const run = async (): Promise<ArtifactAuthenticationRequest | undefined> => {
						const authentication = snapshot.get().contributions.find(contribution => contribution.integrationId === integrationId)?.authentication;
						const authenticate = this.transport.authenticate;
						if (!authentication?.enabled || (!authentication.handledByIntegration && !authenticate)) {
							throw new Error(localize('artifactAuthenticationUnavailable', "Sign-in is not available for this artifact."));
						}
						const epoch = this.epoch;
						const isCurrent = () => !store.isDisposed && !this.disposed.get() && epoch === this.epoch
							&& this.transport.available?.get() !== false && !restoring.get()
							&& snapshot.get().contributions.some(contribution => contribution.integrationId === integrationId);
						authenticating.set(new Set([...authenticating.get(), integrationId]), undefined);
						try {
							const response = await this.request({ kind: 'authenticate', subscription, integrationId });
							if (authentication.handledByIntegration) {
								// The integration already signed in within its own runtime.
								if (response.kind !== 'ok') {
									throw new Error('Invalid artifact authentication response');
								}
								return undefined;
							}
							if (!isCurrent()) {
								throw new CancellationError();
							}
							if (response.kind !== 'authentication' || !authenticate) {
								throw new Error('Invalid artifact authentication response');
							}
							await authenticate(response.request, isCurrent);
							if (!isCurrent()) {
								throw new CancellationError();
							}
							return response.request;
						} finally {
							authenticating.set(new Set([...authenticating.get()].filter(id => id !== integrationId)), undefined);
						}
					};
					const request = run().finally(() => authenticationRequests.delete(integrationId));
					authenticationRequests.set(integrationId, request);
					return request;
				},
				configure: (integrationId, revision, values, actor) => this.requestAcknowledgement({ kind: 'configure', subscription, integrationId, revision, values, ...(actor ? { actor } : {}) }),
				invoke: async (integrationId, actionId, chat, requestId, actor) => {
					const result = await this.request({ kind: 'invoke', subscription, integrationId, actionId, chat, requestId, ...(actor ? { actor } : {}) });
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
