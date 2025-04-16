/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IReference } from '../../../../base/common/lifecycle.js';
import { IObservable, ISettableObservable, observableValue } from '../../../../base/common/observable.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IProgress, IProgressStep } from '../../../../platform/progress/common/progress.js';

export const ILanguageModelToolProgressService = createDecorator<ILanguageModelToolProgressService>('languageModelToolProgressService');

export interface ILanguageModelToolProgressService {
	_serviceBrand: undefined;

	listenForProgress(callId: string): IReference<IObservable<{ message: string | undefined; total: number; done: number }>>;

	handleProgress<P extends Promise<R>, R = unknown>(callId: string, callback: (progress: IProgress<IProgressStep>) => P): P;
}

export interface ILanguageModelToolProgressDelegate {
	onDidCancel: Event<void>;
	update(step: IProgressStep): void;
	dispose?(): void;
}

export class LanguageModelToolProgressService implements ILanguageModelToolProgressService {
	declare readonly _serviceBrand: undefined;

	private readonly progress = new Map<string, {
		value: ISettableObservable<{ message: string | undefined; total: number; done: number }>;
		rc: number;
	}>();

	listenForProgress(callId: string): IReference<IObservable<{ message: string | undefined; total: number; done: number }>> {
		let rec = this.progress.get(callId);
		if (!rec) {
			rec = { value: observableValue(this, { message: undefined, total: 0, done: 0 }), rc: 0 };
			this.progress.set(callId, rec);
		}
		rec.rc++;

		return {
			object: rec.value,
			dispose: () => {
				if (!--rec.rc) {
					this.progress.delete(callId);
				}
			}
		};
	}

	handleProgress<P extends Promise<R>, R = unknown>(callId: string, callback: (progress: IProgress<IProgressStep>) => P): P {
		let rec = this.progress.get(callId);
		if (!rec) {
			rec = { value: observableValue(this, { message: undefined, total: 0, done: 0 }), rc: 0 };
			this.progress.set(callId, rec);
		}

		rec.rc++;

		let last = 0;
		const promise = callback({
			report: update => {
				if (update.increment) {
					last += update.increment;
				}
				rec.value.set({ message: update.message, total: update.total || 100, done: last }, undefined);
			},
		});
		promise.finally(() => {
			if (!--rec.rc) {
				this.progress.delete(callId);
			}
		});

		return promise;
	}
}

registerSingleton(ILanguageModelToolProgressService, LanguageModelToolProgressService, InstantiationType.Delayed);
