/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from '../../../../../../../base/common/errorMessage.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { localize } from '../../../../../../../nls.js';
import { INotificationService } from '../../../../../../../platform/notification/common/notification.js';
import { IChatSideChatService } from '../../../../common/chatSideChatService.js';
import { IChatConfirmationButton } from '../chatConfirmationWidget.js';

export class ChatTerminalToolExplanation extends Disposable {
	private isExplaining = false;
	private readonly onDidChangeDisablement = this._register(new Emitter<boolean>());

	constructor(
		private readonly sessionResource: URI,
		private readonly sourceTurnId: string | undefined,
		private readonly getCommand: () => string,
		@IChatSideChatService private readonly sideChatService: IChatSideChatService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
	}

	get button(): Omit<IChatConfirmationButton<() => Promise<void>>, 'moreActions'> | undefined {
		if (!this.sideChatService.canAskInSideChat(this.sessionResource)) {
			return undefined;
		}
		return {
			label: localize('tool.explain', "Explain"),
			tooltip: localize('tool.explain.detail', "Explain this command in a side chat"),
			data: () => this.explain(),
			isSecondary: true,
			disabled: this.isExplaining,
			onDidChangeDisablement: this.onDidChangeDisablement.event,
		};
	}

	async explain(): Promise<void> {
		if (this.isExplaining || this._store.isDisposed) {
			return;
		}
		this.isExplaining = true;
		this.onDidChangeDisablement.fire(true);
		try {
			await this.sideChatService.askInSideChat(
				this.sessionResource,
				localize('tool.explain.query', "Explain what this terminal command will do."),
				{ text: this.getCommand().trim() },
				{ sourceTurnId: this.sourceTurnId },
			);
		} catch (error) {
			this.notificationService.error(localize('tool.explain.failed', "The side chat could not be started: {0}", toErrorMessage(error)));
		} finally {
			this.isExplaining = false;
			if (!this._store.isDisposed) {
				this.onDidChangeDisablement.fire(false);
			}
		}
	}
}
