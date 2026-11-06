/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable } from '../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import type { IChatPillSection } from '../../../browser/chatPills.js';
import { CanvasesPillControl } from '../../canvases/browser/canvasesPillControl.js';
import type { ICanvasContext } from '../../canvases/common/canvas.js';
import { IChat, ISession } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../common/sessionsManagement.js';

/** Supplies the canvases pill of the active chat in the Agents window chat input. */
export class SessionCanvasesControl extends Disposable {

	readonly sections: IObservable<readonly IChatPillSection[]>;

	constructor(
		session: IObservable<ISession | undefined>,
		chat: IObservable<IChat | undefined>,
		enabled: IObservable<boolean>,
		@IInstantiationService instantiationService: IInstantiationService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
	) {
		super();

		const context = derived<ICanvasContext | undefined>(this, reader => {
			const currentSession = session.read(reader);
			const currentChat = chat.read(reader);
			if (!enabled.read(reader) || currentSession?.capabilities.read(reader).supportsCanvases !== true || !currentChat?.canvases) {
				return undefined;
			}
			return {
				owner: { providerId: currentSession.providerId, session: currentSession.resource, chat: currentChat.resource },
				canvases: currentChat.canvases,
				closeCanvas: canvas => sessionsManagementService.closeCanvas(currentSession, currentChat, canvas),
			};
		});
		const control = this._register(instantiationService.createInstance(CanvasesPillControl, context));
		this.sections = control.sections;
	}
}
