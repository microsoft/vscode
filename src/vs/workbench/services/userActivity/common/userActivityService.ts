/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout, RunOnceScheduler, runWhenGlobalIdle } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService, createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { userActivityRegistry } from './userActivityRegistry.js';

export interface IMarkActiveOptions {
	whenHeldFor?: number;
	/**
	 * Only consider this progress if the state is already active. Used to avoid
	 * background work from incorrectly marking the user as active (#237386)
	 */
	extendOnly?: boolean;
}

/**
 * Service that observes user activity in the window.
 */
export interface IUserActivityService {
	_serviceBrand: undefined;

	/**
	 * Whether the user is currently active.
	 */
	readonly isActive: boolean;

	/**
	 * Fires when the activity state changes.
	 */
	readonly onDidChangeIsActive: Event<boolean>;

	/**
	 * Marks the user as being active until the Disposable is disposed of.
	 * Multiple consumers call this method; the user will only be considered
	 * inactive once all consumers have disposed of their Disposables.
	 */
	markActive(opts?: IMarkActiveOptions): IDisposable;
}

const MARK_INACTIVE_DEBOUNCE = 10_000;

export const IUserActivityService = createDecorator<IUserActivityService>('IUserActivityService');

export class UserActivityService extends Disposable implements IUserActivityService {
	declare readonly _serviceBrand: undefined;
	private readonly markInactive = this._register(new RunOnceScheduler(() => {
		this.isActive = false;
		this.changeEmitter.fire(false);
	}, MARK_INACTIVE_DEBOUNCE));

	private readonly changeEmitter = this._register(new Emitter<boolean>);
	private active = 0;

	/**
	 * @inheritdoc
	 *
	 * Note: initialized to true, since the user just did something to open the
	 * window. The bundled DomActivityTracker will initially assume activity
	 * as well in order to unset this if the window gets abandoned.
	 */
	public isActive = true;

	/** @inheritdoc */
	readonly onDidChangeIsActive: Event<boolean> = this.changeEmitter.event;

	constructor(@IInstantiationService instantiationService: IInstantiationService) {
		super();
		this._register(runWhenGlobalIdle(() => userActivityRegistry.take(this, instantiationService)));
	}

	/** @inheritdoc */
	markActive(opts?: IMarkActiveOptions): IDisposable {
		if (opts?.extendOnly && !this.isActive) {
			return Disposable.None;
		}

		if (opts?.whenHeldFor) {
			const store = new DisposableStore();
			store.add(disposableTimeout(() => store.add(this.markActive()), opts.whenHeldFor));
			return store;
		}

		if (++this.active === 1) {
			this.isActive = true;
			this.changeEmitter.fire(true);
			this.markInactive.cancel();
		}

		return toDisposable(() => {
			if (--this.active === 0) {
				this.markInactive.schedule();
			}
		});
	}
}

registerSingleton(IUserActivityService, UserActivityService, InstantiationType.Delayed);
