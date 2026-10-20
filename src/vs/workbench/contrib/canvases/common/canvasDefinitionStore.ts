/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Delayer, ThrottlerByKey } from '../../../../base/common/async.js';
import { structuralEquals } from '../../../../base/common/equals.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, derivedOpts, IObservable, IReaderWithStore, observableValue } from '../../../../base/common/observable.js';
import { MicrotaskDelay } from '../../../../base/common/symbols.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { canvasOwnerKey, compareCanvasDefinitions, ICanvasDefinition, ICanvasOwner, isOpenableExtensionCanvasDefinition } from './canvas.js';

/** The chat whose registered canvas types a {@link CanvasDefinitionStore} lists. */
export interface ICanvasDefinitionSource {
	readonly owner: ICanvasOwner;
	listCanvases(): Promise<readonly ICanvasDefinition[]>;
}

interface ICanvasDefinitionRequest {
	readonly ownerKey: string;
	readonly source: ICanvasDefinitionSource;
}

interface ILoadedCanvasDefinitions {
	readonly ownerKey: string;
	readonly definitions: readonly ICanvasDefinition[];
}

/**
 * Lists the openable canvas types registered for one chat at a time, refreshing whenever `source` re-evaluates.
 * Refreshes keep the current list so commands built from it stay registered; only an owner change or an unavailable source clears it.
 */
export class CanvasDefinitionStore extends Disposable {

	/** The current owner's openable definitions in menu order, empty until a listing for that owner succeeds. */
	readonly definitions: IObservable<readonly ICanvasDefinition[]>;

	private readonly loaded = observableValue<ILoadedCanvasDefinitions | undefined>(this, undefined);
	/** Coalesces synchronous bursts of invalidations into one refresh. */
	private readonly refreshDelayer = this._register(new Delayer<void>(MicrotaskDelay));
	private readonly refreshes = this._register(new ThrottlerByKey<string>());
	private ownerKey: string | undefined;

	constructor(
		source: (reader: IReaderWithStore) => ICanvasDefinitionSource | undefined,
		private readonly logPrefix: string,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		const request = derived<ICanvasDefinitionRequest | undefined>(this, reader => {
			const current = source(reader);
			return current && { ownerKey: canvasOwnerKey(current.owner), source: current };
		});
		this.definitions = derivedOpts<readonly ICanvasDefinition[]>({ owner: this, equalsFn: structuralEquals }, reader => {
			const ownerKey = request.read(reader)?.ownerKey;
			const loaded = this.loaded.read(reader);
			// Derived from the requested owner so readers never pair it with another owner's definitions.
			return ownerKey !== undefined && loaded?.ownerKey === ownerKey ? loaded.definitions : [];
		});
		this._register(autorun(reader => {
			const next = request.read(reader);
			if (next?.ownerKey !== this.ownerKey) {
				this.ownerKey = next?.ownerKey;
				this.loaded.set(undefined, undefined);
			}
			if (next) {
				this.refreshDelayer.trigger(() => this.refreshes.queue(next.ownerKey, () => this.refresh(next))).catch(error => {
					if (!isCancellationError(error)) {
						this.logService.error(`${this.logPrefix} Failed to schedule registered canvas refresh`, error);
					}
				});
			}
		}));
	}

	private async refresh(request: ICanvasDefinitionRequest): Promise<void> {
		if (!this.isCurrent(request)) {
			return;
		}
		try {
			const definitions = await request.source.listCanvases();
			if (this.isCurrent(request)) {
				this.loaded.set({ ownerKey: request.ownerKey, definitions: definitions.filter(isOpenableExtensionCanvasDefinition).sort(compareCanvasDefinitions) }, undefined);
			}
		} catch (error) {
			if (this.isCurrent(request)) {
				this.logService.error(`${this.logPrefix} Failed to list registered canvases`, error);
			}
		}
	}

	private isCurrent(request: ICanvasDefinitionRequest): boolean {
		return !this._store.isDisposed && request.ownerKey === this.ownerKey;
	}
}
