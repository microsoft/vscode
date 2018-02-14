/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/notificationActions';
import { INotificationViewItem } from 'vs/workbench/common/notifications';
import { localize } from 'vs/nls';
import { Action, IAction } from 'vs/base/common/actions';
import { TPromise } from 'vs/base/common/winjs.base';

export class CloseNotificationAction extends Action {

	public static readonly ID = 'workbench.action.closeNotification';
	public static readonly LABEL = localize('closeNotification', "Close Notification");

	constructor(
		id: string,
		label: string
	) {
		super(id, label, 'close-notification-action');
	}

	public run(notification: INotificationViewItem): TPromise<any> {
		notification.dispose();

		return TPromise.as(void 0);
	}
}

export class ExpandNotificationAction extends Action {

	public static readonly ID = 'workbench.action.expandNotification';
	public static readonly LABEL = localize('expandNotification', "Expand Notification");

	constructor(
		id: string,
		label: string
	) {
		super(id, label, 'expand-notification-action');
	}

	public run(notification: INotificationViewItem): TPromise<any> {
		notification.expand();

		return TPromise.as(void 0);
	}
}

export class CollapseNotificationAction extends Action {

	public static readonly ID = 'workbench.action.collapseNotification';
	public static readonly LABEL = localize('collapseNotification', "Collapse Notification");

	constructor(
		id: string,
		label: string
	) {
		super(id, label, 'collapse-notification-action');
	}

	public run(notification: INotificationViewItem): TPromise<any> {
		notification.collapse();

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