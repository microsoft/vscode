/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler, runWhenIdle } from 'vs/base/common/async';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IInstantiationService, createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { userActivityRegistry } from 'vs/workbench/services/userActivity/common/userActivityRegistry';

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
	markActive(): IDisposable;
}

export const IUserActivityService = createDecorator<IUserActivityService>('IUserActivityService');

export class UserActivityService extends Disposable implements IUserActivityService {
	declare readonly _serviceBrand: undefined;
	private readonly markInactive = this._register(new RunOnceScheduler(() => {
		this.isActive = false;
		this.changeEmitter.fire(false);
	}, 10_000));

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
	onDidChangeIsActive: Event<boolean> = this.changeEmitter.event;

	constructor(@IInstantiationService instantiationService: IInstantiationService) {
		super();
		this._register(runWhenIdle(() => userActivityRegistry.take(this, instantiationService)));
	}

	/** @inheritdoc */
	markActive(): IDisposable {
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
