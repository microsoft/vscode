/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, observableValue } from '../../../../base/common/observable.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const ILocalChatAvailabilityService = createDecorator<ILocalChatAvailabilityService>('localChatAvailabilityService');

/**
 * Whether new local chats are offered, apart from what the settings say: a feature that shows only the chats of sessions,
 * such as a sessions list of the Chat view that does not list local chats, hides them while it shows. It leaves the
 * settings as the user has them.
 */
export interface ILocalChatAvailabilityService {
	readonly _serviceBrand: undefined;

	/** Whether a feature hides new local chats. */
	readonly hidden: IObservable<boolean>;

	/** Hides new local chats until the returned disposable is disposed. */
	hide(): IDisposable;
}

export class LocalChatAvailabilityService extends Disposable implements ILocalChatAvailabilityService {

	declare readonly _serviceBrand: undefined;

	private readonly hiders = observableValue(this, 0);
	readonly hidden: IObservable<boolean> = derived(this, reader => this.hiders.read(reader) > 0);

	hide(): IDisposable {
		this.hiders.set(this.hiders.get() + 1, undefined);
		return toDisposable(() => this.hiders.set(this.hiders.get() - 1, undefined));
	}
}

registerSingleton(ILocalChatAvailabilityService, LocalChatAvailabilityService, InstantiationType.Delayed);
