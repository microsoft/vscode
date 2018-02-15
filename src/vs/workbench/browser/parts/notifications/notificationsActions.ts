/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/notificationsActions';
import { INotificationViewItem } from 'vs/workbench/common/notifications';
import { localize } from 'vs/nls';
import { Action, IAction, ActionRunner } from 'vs/base/common/actions';
import { TPromise } from 'vs/base/common/winjs.base';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { CLEAR_NOTFICATION, EXPAND_NOTIFICATION, COLLAPSE_NOTIFICATION } from 'vs/workbench/browser/parts/notifications/notificationCommands';
import { ICommandService } from 'vs/platform/commands/common/commands';

export class ClearNotificationAction extends Action {

	public static readonly ID = CLEAR_NOTFICATION;
	public static readonly LABEL = localize('closeNotification', "Close Notification");

	constructor(
		id: string,
		label: string,
		@ICommandService private commandService: ICommandService
	) {
		super(id, label, 'clear-notification-action');
	}

	public run(notification: INotificationViewItem): TPromise<any> {
		this.commandService.executeCommand(CLEAR_NOTFICATION, notification);

		return TPromise.as(void 0);
	}
}

export class ExpandNotificationAction extends Action {

	public static readonly ID = EXPAND_NOTIFICATION;
	public static readonly LABEL = localize('expandNotification', "Expand Notification");

	constructor(
		id: string,
		label: string,
		@ICommandService private commandService: ICommandService
	) {
		super(id, label, 'expand-notification-action');
	}

	public run(notification: INotificationViewItem): TPromise<any> {
		this.commandService.executeCommand(EXPAND_NOTIFICATION, notification);

		return TPromise.as(void 0);
	}
}

export class CollapseNotificationAction extends Action {

	public static readonly ID = COLLAPSE_NOTIFICATION;
	public static readonly LABEL = localize('collapseNotification', "Collapse Notification");

	constructor(
		id: string,
		label: string,
		@ICommandService private commandService: ICommandService
	) {
		super(id, label, 'collapse-notification-action');
	}

	public run(notification: INotificationViewItem): TPromise<any> {
		this.commandService.executeCommand(COLLAPSE_NOTIFICATION, notification);

		return TPromise.as(void 0);
	}
}

export class ConfigureNotificationAction extends Action {

	public static readonly ID = 'workbench.action.configureNotification';
	public static readonly LABEL = localize('configureNotification', "Configure Notification");

	constructor(
		id: string,
		label: string,
		private _configurationActions: IAction[]
	) {
		super(id, label, 'configure-notification-action');
	}

	public get configurationActions(): IAction[] {
		return this._configurationActions;
	}
}

export class DoNotShowNotificationAgainAction extends Action {

	public static readonly ID = 'workbench.action.doNotShowNotificationAgain';
	public static readonly LABEL = localize('dontShowNotificationAgain', "Don't Show Again");

	constructor(
		id: string,
		label: string
	) {
		super(id, label);
	}

	public run(notification: INotificationViewItem): TPromise<any> {
		return TPromise.as(void 0); // TODO@notification
	}
}

export class NotificationActionRunner extends ActionRunner {

	constructor(
		@ITelemetryService private telemetryService: ITelemetryService,
		@INotificationService private notificationService: INotificationService
	) {
		super();
	}

	protected runAction(action: IAction, context?: any): TPromise<any> {

		// Telemetry
		/* __GDPR__
			"workbenchActionExecuted" : {
				"id" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"from": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
			}
		*/
		this.telemetryService.publicLog('workbenchActionExecuted', { id: action.id, from: 'message' });

		// Run and make sure to notify on any error again
		super.runAction(action, context).done(null, error => this.notificationService.error(error));

		return TPromise.as(void 0);
	}
}