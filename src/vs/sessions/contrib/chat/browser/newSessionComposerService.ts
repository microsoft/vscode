/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export interface INewSessionComposer {
	animatePrompt(text: string, durationMs: number, placeholder: string, token: CancellationToken): Promise<boolean>;
}

export const INewSessionComposerService = createDecorator<INewSessionComposerService>('newSessionComposerService');

export interface INewSessionComposerService {
	readonly _serviceBrand: undefined;
	readonly activeComposer: IObservable<INewSessionComposer | undefined>;
	registerComposer(composer: INewSessionComposer): IDisposable;
}

export class NewSessionComposerService extends Disposable implements INewSessionComposerService {
	declare readonly _serviceBrand: undefined;

	private readonly _composers = new Set<INewSessionComposer>();
	private readonly _activeComposer = observableValue<INewSessionComposer | undefined>(this, undefined);
	readonly activeComposer: IObservable<INewSessionComposer | undefined> = this._activeComposer;

	registerComposer(composer: INewSessionComposer): IDisposable {
		this._composers.add(composer);
		this._activeComposer.set(composer, undefined);
		return toDisposable(() => {
			this._composers.delete(composer);
			if (this._activeComposer.get() === composer) {
				this._activeComposer.set(Array.from(this._composers).at(-1), undefined);
			}
		});
	}
}

registerSingleton(INewSessionComposerService, NewSessionComposerService, InstantiationType.Delayed);
