/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../base/common/observable.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IActiveSession } from '../common/sessionsManagement.js';
import { ISessionsService } from './sessionsService.js';

/**
 * The session the UI of a host acts on. A host (the main side bar, the title
 * bar of a window, a chat window) provides its own scope through a child
 * instantiation service. Without a host the scope is the active session.
 */
export interface ISessionScope {
	readonly _serviceBrand: undefined;
	readonly session: IObservable<IActiveSession | undefined>;
}

export const ISessionScope = createDecorator<ISessionScope>('sessionScope');

export class ActiveSessionScope implements ISessionScope {
	declare readonly _serviceBrand: undefined;
	readonly session: IObservable<IActiveSession | undefined>;

	constructor(@ISessionsService sessionsService: ISessionsService) {
		// The main window keeps its session while a chat window has focus.
		this.session = sessionsService.mainWindowActiveSession;
	}
}

registerSingleton(ISessionScope, ActiveSessionScope, InstantiationType.Delayed);
