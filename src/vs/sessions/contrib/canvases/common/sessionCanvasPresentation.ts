/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { autorun, derived, observableValue, transaction } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import type { IBrowserViewModel } from '../../../../workbench/contrib/browserView/common/browserView.js';
import { canvasIdentityEquals, CanvasAvailabilityStatus, CanvasTrustStatus, type CanvasEntry, type CanvasState, type ISessionCanvases } from '../../../services/sessions/common/sessionCanvases.js';

export type SessionCanvasPresentationStatus = 'loading' | 'attached' | 'empty' | 'unavailable' | 'unsupported' | 'pendingTrust' | 'blocked' | 'failed' | 'closed';

/** A single mounted presentation. Disposing it releases native resources, never logical membership. */
export class SessionCanvasPresentation extends Disposable {
	readonly model = observableValue<IBrowserViewModel | undefined>(this, undefined);
	readonly status = observableValue<SessionCanvasPresentationStatus>(this, 'loading');
	readonly entry = observableValue<CanvasEntry | undefined>(this, undefined);
	readonly liveState = observableValue<CanvasState | undefined>(this, undefined);
	private readonly nativeLifetime = this._register(new DisposableStore());
	private readonly mounts = new Sequencer();
	private readonly subscriptionGeneration = observableValue(this, 0);
	private pullSequence = 0;
	private observed: { generation: number; incarnation: string; revision: number } | undefined;
	private presented: { generation: number; entry: CanvasEntry; url: string } | undefined;

	constructor(
		private readonly canvases: ISessionCanvases,
		readonly resource: string,
		private readonly createModel: (url: string) => Promise<IBrowserViewModel>,
	) {
		super();
		const subscription = derived(this, reader => {
			this.subscriptionGeneration.read(reader);
			return reader.store.add(canvases.observeCanvas(resource)).object;
		});
		this._register(autorun(reader => {
			const generation = canvases.generation.read(reader);
			const availability = canvases.availability.read(reader);
			const initialized = canvases.initialized.read(reader);
			const entry = canvases.entries.read(reader).find(entry => entry.resource === resource);
			const currentSubscription = subscription.read(reader);
			const state = currentSubscription.state.read(reader);
			const error = currentSubscription.error.read(reader);
			transaction(tx => {
				this.entry.set(entry, tx);
				this.liveState.set(state, tx);
			});
			if (availability !== 'available') {
				this.invalidate(availability === 'unsupported' ? 'unsupported' : 'unavailable');
			} else if (!entry) {
				this.invalidate(initialized ? 'closed' : 'loading');
			} else if (entry.trust.status !== CanvasTrustStatus.Trusted) {
				this.invalidate(entry.trust.status === CanvasTrustStatus.Pending ? 'pendingTrust' : 'blocked');
			} else if (entry.availability !== CanvasAvailabilityStatus.Ready && entry.availability !== CanvasAvailabilityStatus.Empty) {
				this.invalidate(entry.availability === CanvasAvailabilityStatus.Loading ? 'loading'
					: entry.availability === CanvasAvailabilityStatus.Unsupported ? 'unsupported'
						: entry.availability === CanvasAvailabilityStatus.Failed ? 'failed' : 'unavailable');
			} else if (error) {
				this.invalidate('failed');
			} else if (!state || state.resource !== entry.resource || !canvasIdentityEquals(state.identity, entry.identity)
				|| state.identity.incarnation !== entry.identity.incarnation || state.revision !== entry.revision || state.availability.status !== entry.availability) {
				this.pullSequence++;
				this.observed = undefined;
				// The two channels can deliver a metadata revision separately. Keep an
				// already authorized page, but never reuse a pull from the older revision.
				if (!this.hasCurrentModel(entry, generation) || !state || state.resource !== entry.resource
					|| !canvasIdentityEquals(state.identity, entry.identity) || state.identity.incarnation !== entry.identity.incarnation
					|| state.trust.status !== CanvasTrustStatus.Trusted || state.availability.status !== entry.availability) {
					this.retireModel();
				}
				this.status.set('loading', undefined);
			} else if (state.trust.status !== CanvasTrustStatus.Trusted) {
				this.invalidate(state.trust.status === CanvasTrustStatus.Pending ? 'pendingTrust' : 'blocked');
			} else if (this.observed?.generation !== generation || this.observed.incarnation !== entry.identity.incarnation || this.observed.revision !== entry.revision) {
				this.observed = { generation, incarnation: entry.identity.incarnation, revision: entry.revision };
				void this.pull(entry, generation);
			}
		}));
	}

	private retireModel(): void {
		this.nativeLifetime.clear();
		this.presented = undefined;
		this.model.set(undefined, undefined);
	}

	private hasCurrentModel(entry: CanvasEntry, generation: number): boolean {
		return !!this.model.get() && this.presented?.generation === generation
			&& this.presented.entry.resource === entry.resource && canvasIdentityEquals(this.presented.entry.identity, entry.identity)
			&& this.presented.entry.identity.incarnation === entry.identity.incarnation;
	}

	private invalidate(status: SessionCanvasPresentationStatus): void {
		this.pullSequence++;
		this.observed = undefined;
		this.retireModel();
		this.status.set(status, undefined);
	}

	private isCurrent(entry: CanvasEntry, generation: number, sequence: number): boolean {
		const current = this.entry.get();
		return !this._store.isDisposed && sequence === this.pullSequence && generation === this.canvases.generation.get()
			&& this.canvases.availability.get() === 'available' && current?.resource === entry.resource
			&& canvasIdentityEquals(current.identity, entry.identity)
			&& current.identity.incarnation === entry.identity.incarnation && current.revision === entry.revision
			&& current.trust.status === CanvasTrustStatus.Trusted;
	}

	private async pull(entry: CanvasEntry, generation: number): Promise<void> {
		const sequence = ++this.pullSequence;
		if (!this.hasCurrentModel(entry, generation)) {
			this.retireModel();
		}
		this.status.set('loading', undefined);
		try {
			const result = await this.canvases.resolveSource(entry);
			if (!this.isCurrent(entry, generation, sequence)) {
				return;
			}
			if (result.incarnation !== entry.identity.incarnation || result.revision !== entry.revision) {
				this.retireModel();
				this.status.set('unavailable', undefined);
				return;
			}
			if (!result.source || (result.availability !== CanvasAvailabilityStatus.Ready && result.availability !== CanvasAvailabilityStatus.Empty)) {
				this.retireModel();
				this.status.set(result.availability === CanvasAvailabilityStatus.Loading ? 'loading'
					: result.availability === CanvasAvailabilityStatus.Empty ? 'empty'
						: result.availability === CanvasAvailabilityStatus.Unsupported ? 'unsupported'
							: result.availability === CanvasAvailabilityStatus.Failed ? 'failed' : 'unavailable', undefined);
				return;
			}
			const url = validateCanvasPresentationUrl(result.source.url);
			if (result.source.expiresAt && (!Number.isFinite(Date.parse(result.source.expiresAt)) || Date.parse(result.source.expiresAt) <= Date.now())) {
				this.retireModel();
				this.status.set('unavailable', undefined);
				return;
			}
			if (this.hasCurrentModel(entry, generation) && this.presented?.url === url) {
				this.presented = { generation, entry, url };
				this.status.set(result.availability === CanvasAvailabilityStatus.Empty ? 'empty' : 'attached', undefined);
				return;
			}
			await this.mounts.queue(async () => {
				if (!this.isCurrent(entry, generation, sequence)) {
					return;
				}
				this.retireModel();
				const model = await this.createModel(url);
				if (!this.isCurrent(entry, generation, sequence)) {
					model.dispose();
					return;
				}
				this.nativeLifetime.add(model);
				this.nativeLifetime.add(Event.once(model.onWillDispose)(() => {
					this.presented = undefined;
					this.model.set(undefined, undefined);
					this.status.set('unavailable', undefined);
				}));
				this.presented = { generation, entry, url };
				this.model.set(model, undefined);
				this.status.set(result.availability === CanvasAvailabilityStatus.Empty ? 'empty' : 'attached', undefined);
			});
		} catch {
			if (this.isCurrent(entry, generation, sequence)) {
				this.retireModel();
				this.status.set('failed', undefined);
			}
		}
	}

	/** A fresh source pull and page load, without restarting a provider or repeating an open/action. */
	reload(): void {
		this.retireModel();
		const entry = this.entry.get();
		if (entry && this.observed && entry.trust.status === CanvasTrustStatus.Trusted) {
			void this.pull(entry, this.canvases.generation.get());
		} else {
			this.subscriptionGeneration.set(this.subscriptionGeneration.get() + 1, undefined);
		}
	}

	override dispose(): void {
		this.pullSequence++;
		this.retireModel();
		super.dispose();
	}
}

export function validateCanvasPresentationUrl(value: string): string {
	const uri = URI.parse(value, true);
	if (![Schemas.http, Schemas.https, Schemas.file].includes(uri.scheme) || uri.authority.includes('@')
		|| ((uri.scheme === Schemas.http || uri.scheme === Schemas.https) && !uri.authority)) {
		throw new Error(localize('canvas.invalidSource', "The canvas source is not a supported HTTP, HTTPS, or trusted file resource."));
	}
	return value;
}
