/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, derived, observableValue, transaction } from '../../../../base/common/observable.js';
import { DeferredPromise } from '../../../../base/common/async.js';
import { ISessionsWelcomeService, ISessionsWelcomeStep } from '../common/sessionsWelcomeService.js';

export class SessionsWelcomeService extends Disposable implements ISessionsWelcomeService {

	declare readonly _serviceBrand: undefined;

	private readonly _steps = observableValue<readonly ISessionsWelcomeStep[]>(this, []);
	private readonly _initializedDeferred = new DeferredPromise<void>();

	readonly steps: IObservable<readonly ISessionsWelcomeStep[]> = this._steps;

	readonly isComplete: IObservable<boolean> = derived(this, reader => {
		const steps = this._steps.read(reader);
		if (steps.length === 0) {
			return true;
		}
		return steps.every(step => step.isSatisfied.read(reader));
	});

	readonly whenInitialized: Promise<void> = this._initializedDeferred.p;

	readonly currentStep: IObservable<ISessionsWelcomeStep | undefined> = derived(this, reader => {
		const steps = this._steps.read(reader);
		return steps.find(step => !step.isSatisfied.read(reader));
	});

	registerStep(step: ISessionsWelcomeStep) {
		transaction(tx => {
			const current = this._steps.get();
			const updated = [...current, step].sort((a, b) => a.order - b.order);
			this._steps.set(updated, tx);
		});

		return toDisposable(() => {
			transaction(tx => {
				const current = this._steps.get();
				this._steps.set(current.filter(s => s !== step), tx);
			});
		});
	}

	/**
	 * Wait for all currently registered steps to finish their async initialization,
	 * then mark the service as initialized.
	 */
	async initialize(): Promise<void> {
		const steps = this._steps.get();
		await Promise.all(steps.map(s => s.initialized));
		this._initializedDeferred.complete();
	}
}
