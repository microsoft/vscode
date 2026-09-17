/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { IReader } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ISessionReviewService } from '../../../services/sessions/browser/sessionReviewService.js';
import { ChatInteractivity, IChat, ISession, isActiveSessionStatus } from '../../../services/sessions/common/session.js';

export function canStopSessionResponse(session: ISession, chat: IChat, reader?: IReader): boolean {
	return !session.isArchived.read(reader) && chat.interactivity.read(reader) === ChatInteractivity.Full && isActiveSessionStatus(chat.status.read(reader));
}

export class SessionResponseStopAction extends Action {
	constructor(
		private readonly getTarget: () => { readonly session: ISession; readonly chat: IChat } | undefined,
		@ISessionReviewService private readonly reviewService: ISessionReviewService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super('sessions.work.stopResponse', localize('sessionWork.stopResponse', "Stop Response"), ThemeIcon.asClassName(Codicon.debugStop));
	}

	override async run(): Promise<void> {
		if (!this.enabled) { return; }
		const target = this.getTarget();
		if (!target) {
			this.notificationService.error(localize('sessionWork.stopUnavailable', "This conversation is no longer available."));
			return;
		}
		if (!canStopSessionResponse(target.session, target.chat)) {
			this.notificationService.info(localize('sessionWork.noActiveResponse', "This conversation no longer has an active response."));
			return;
		}
		this.enabled = false;
		try {
			await this.reviewService.stop(target.session, target.chat);
		} catch (error) {
			this.notificationService.error(error);
		} finally {
			if (!this._store.isDisposed) { this.enabled = true; }
		}
	}
}
