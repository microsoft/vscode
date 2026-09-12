/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../../base/common/async.js';
import type { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { observableValue, transaction } from '../../../../../base/common/observable.js';
import { CanvasAvailabilityStatus, CanvasSourceKind, CanvasTrustStatus, type CanvasEntry, type CanvasState, type CanvasTypeDeclaration, type ISessionCanvases, type ResolveCanvasSourceResult, type SessionCanvasOpenOptions } from '../../../../services/sessions/common/sessionCanvases.js';

export function createCanvasState(chat = 'ahp-session:/one/chat/default', resource = 'ahp-canvas:/counter'): CanvasState {
	return {
		resource, title: 'Counter', revision: 1,
		identity: { chat, source: { kind: CanvasSourceKind.Extension, extensionId: 'fixture.counter' }, canvasType: 'counter', instanceId: 'counter', incarnation: 'incarnation-1' },
		trust: { status: CanvasTrustStatus.Trusted },
		availability: { status: CanvasAvailabilityStatus.Ready, actions: [] },
	};
}

export function canvasEntry(state: CanvasState): CanvasEntry {
	return { ...state, availability: state.availability.status };
}

export class TestSessionCanvases extends Disposable implements ISessionCanvases {
	readonly availability = observableValue<'available' | 'unsupported' | 'disconnected'>(this, 'available');
	readonly generation = observableValue(this, 1);
	readonly catalog = observableValue<readonly CanvasTypeDeclaration[]>(this, []);
	readonly entries = observableValue<readonly CanvasEntry[]>(this, []);
	readonly initialized = observableValue(this, true);
	readonly supportsInitialization = observableValue(this, true);
	readonly initializing = observableValue(this, false);
	readonly loading = observableValue(this, false);
	readonly error = observableValue<Error | undefined>(this, undefined);
	readonly state = observableValue<CanvasState | undefined>(this, undefined);
	readonly stateError = observableValue<Error | undefined>(this, undefined);
	readonly sourceRequests: { readonly entry: CanvasEntry; readonly result: DeferredPromise<ResolveCanvasSourceResult> }[] = [];
	readonly effects: string[] = [];
	readonly closes: CanvasEntry[] = [];
	readonly restarts: CanvasEntry[] = [];
	subscriptions = 0;
	totalSubscriptions = 0;
	openResult: DeferredPromise<CanvasEntry> | undefined;
	closeResult: DeferredPromise<void> | undefined;
	onRefresh: (() => Promise<void>) | undefined;
	onInitialize: ((token: CancellationToken) => Promise<void>) | undefined;

	constructor(state = createCanvasState()) {
		super();
		this.setState(state);
	}

	setState(state: CanvasState): void {
		transaction(tx => {
			this.state.set(state, tx);
			this.entries.set([canvasEntry(state)], tx);
		});
	}

	async refresh(): Promise<void> { await this.onRefresh?.(); }

	async initialize(token: CancellationToken): Promise<void> {
		this.effects.push('initialize');
		this.initializing.set(true, undefined);
		try {
			await this.onInitialize?.(token);
		} finally {
			this.initializing.set(false, undefined);
		}
	}

	observeCanvas() {
		this.subscriptions++;
		this.totalSubscriptions++;
		let disposed = false;
		return {
			object: { state: this.state, error: this.stateError },
			dispose: () => {
				if (!disposed) {
					disposed = true;
					this.subscriptions--;
				}
			},
		};
	}

	resolveSource(entry: CanvasEntry): Promise<ResolveCanvasSourceResult> {
		const result = new DeferredPromise<ResolveCanvasSourceResult>();
		this.sourceRequests.push({ entry, result });
		return result.p;
	}

	completeSource(index: number, url = 'http://127.0.0.1:43123/canvas', patch: Partial<ResolveCanvasSourceResult> = {}): Promise<void> {
		const request = this.sourceRequests[index];
		return request.result.complete({
			availability: CanvasAvailabilityStatus.Ready, incarnation: request.entry.identity.incarnation,
			revision: request.entry.revision, source: { url }, ...patch,
		});
	}

	async open(_options: SessionCanvasOpenOptions): Promise<CanvasEntry> {
		this.effects.push('open');
		return this.openResult ? this.openResult.p : this.entries.get()[0];
	}

	async invokeAction() { this.effects.push('invoke'); return { result: undefined }; }
	async close(entry: CanvasEntry): Promise<void> { this.effects.push('close'); this.closes.push(entry); await this.closeResult?.p; }
	async restart(entry: CanvasEntry): Promise<void> { this.effects.push('restart'); this.restarts.push(entry); }
}
