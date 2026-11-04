/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { constObservable, IObservable } from '../../../../base/common/observable.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IActiveSession } from '../common/sessionsManagement.js';
import { getWindowHost, hasActiveSessionSource, ISessionHost } from './sessionHost.js';

/**
 * The session the UI of a host acts on. A host (the main side bar, the title
 * bar of a window, a chat window) provides its own scope through a child
 * instantiation service. Without a host the scope is the main window's. An alias of the window {@link ISessionHost}.
 */
export interface ISessionScope {
	readonly _serviceBrand: undefined;
	readonly session: IObservable<IActiveSession | undefined>;
}

export const ISessionScope = createDecorator<ISessionScope>('sessionScope');

/** The session of the window host: the main window's at root, which it keeps while a chat window has focus. */
export class ActiveSessionScope implements ISessionScope {
	declare readonly _serviceBrand: undefined;
	readonly session: IObservable<IActiveSession | undefined>;

	constructor(@ISessionHost host: ISessionHost) {
		const windowHost = getWindowHost(host);
		this.session = hasActiveSessionSource(windowHost) ? windowHost.activeSession : constObservable(undefined);
	}
}

registerSingleton(ISessionScope, ActiveSessionScope, InstantiationType.Delayed);
