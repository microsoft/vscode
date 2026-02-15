/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Disposable, DisposableResourceMap, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorunDelta, autorunIterableDelta } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { FocusMode } from '../../../../platform/native/common/native.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IChatModel, IChatRequestNeedsInputInfo } from '../common/model/chatModel.js';
import { IChatService } from '../common/chatService/chatService.js';
import { IChatWidgetService } from './chat.js';
import { AcceptToolConfirmationActionId, IToolConfirmationActionContext } from './actions/chatToolActions.js';

/**
 * Observes all live chat models and triggers OS notifications when any model
 * transitions to needing input (confirmation/elicitation).
 */
export class ChatWindowNotifier extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatWindowNotifier';

	private readonly _activeNotifications = this._register(new DisposableResourceMap());

	constructor(
		@IChatService private readonly _chatService: IChatService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IHostService private readonly _hostService: IHostService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ICommandService private readonly _commandService: ICommandService,
	) {
		super();

		const modelTrackers = this._register(new DisposableResourceMap());

		this._register(autorunIterableDelta(
			reader => this._chatService.chatModels.read(reader),
			({ addedValues, removedValues }) => {
				for (const model of addedValues) {
					modelTrackers.set(model.sessionResource, this._trackModel(model));
				}
				for (const model of removedValues) {
					modelTrackers.deleteAndDispose(model.sessionResource);
				}
			}
		));
	}

	private _trackModel(model: IChatModel) {
		return autorunDelta(model.requestNeedsInput, ({ lastValue, newValue }) => {
			const currentNeedsInput = !!newValue;
			const previousNeedsInput = !!lastValue;

			// Only notify on transition from false -> true
			if (!previousNeedsInput && currentNeedsInput && newValue) {
				this._notifyIfNeeded(model.sessionResource, newValue);
			} else if (previousNeedsInput && !currentNeedsInput) {
				// Clear any active notification for this session when input is no longer needed
				this._clearNotification(model.sessionResource);
			}
		});
	}

	private async _notifyIfNeeded(sessionResource: URI, info: IChatRequestNeedsInputInfo): Promise<void> {
		// Check configuration
		if (!this._configurationService.getValue<boolean>('chat.notifyWindowOnConfirmation')) {
			return;
		}

		// Find the widget to determine the target window
		const widget = this._chatWidgetService.getWidgetBySessionResource(sessionResource);
		const targetWindow = widget ? dom.getWindow(widget.domNode) : mainWindow;

		// Only notify if window doesn't have focus
		if (targetWindow.document.hasFocus()) {
			return;
		}

		// Clear any existing notification for this session
		this._clearNotification(sessionResource);

		// Focus window in notify mode (flash taskbar/dock)
		await this._hostService.focus(targetWindow, { mode: FocusMode.Notify });

		// Create OS notification
		const notificationTitle = info.title ? localize('chatTitle', "Chat: {0}", info.title) : localize('chat.untitledChat', "Untitled Chat");

		const cts = new CancellationTokenSource();
		this._activeNotifications.set(sessionResource, toDisposable(() => cts.dispose(true)));

		try {
			const result = await this._hostService.showToast({
				title: this._sanitizeOSToastText(notificationTitle),
				body: info.detail ? this._sanitizeOSToastText(info.detail) : localize('notificationDetail', "Approval needed to continue."),
				actions: [localize('allowAction', "Allow")],
			}, cts.token);

			if (result.clicked || typeof result.actionIndex === 'number') {
				await this._hostService.focus(targetWindow, { mode: FocusMode.Force });

				const widget = await this._chatWidgetService.openSession(sessionResource);
				widget?.focusInput();

				if (result.actionIndex === 0 /* Allow */) {
					await this._commandService.executeCommand(AcceptToolConfirmationActionId, { sessionResource } satisfies IToolConfirmationActionContext);
				}
			}
		} finally {
			this._clearNotification(sessionResource);
		}
	}

	private _sanitizeOSToastText(text: string): string {
		return text.replace(/`/g, '\''); // convert backticks to single quotes
	}

	private _clearNotification(sessionResource: URI): void {
		this._activeNotifications.deleteAndDispose(sessionResource);
	}
}
