/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { INotification, INotificationHandle, INotificationService, INotificationSource, INotificationSourceFilter, IPromptChoice, IPromptOptions, IStatusHandle, IStatusMessageOptions, NoOpNotification, NotificationMessage, NotificationsFilter, Severity } from '../../common/notification.js';

export class TestNotificationService implements INotificationService {

	readonly onDidChangeFilter: Event<void> = Event.None;

	declare readonly _serviceBrand: undefined;

	private static readonly NO_OP: INotificationHandle = new NoOpNotification();

	info(message: NotificationMessage): INotificationHandle {
		return this.notify({ severity: Severity.Info, message });
	}

	warn(message: NotificationMessage): INotificationHandle {
		return this.notify({ severity: Severity.Warning, message });
	}

	error(error: NotificationMessage): INotificationHandle {
		return this.notify({ severity: Severity.Error, message: error });
	}

	notify(notification: INotification): INotificationHandle {
		return TestNotificationService.NO_OP;
	}

	prompt(severity: Severity, message: NotificationMessage, choices: IPromptChoice[], options?: IPromptOptions): INotificationHandle {
		return TestNotificationService.NO_OP;
	}

	status(message: NotificationMessage, options?: IStatusMessageOptions): IStatusHandle {
		return {
			close: () => { }
		};
	}

	setFilter(): void { }

	getFilter(source?: INotificationSource | undefined): NotificationsFilter {
		return NotificationsFilter.OFF;
	}

	getFilters(): INotificationSourceFilter[] {
		return [];
	}

	removeFilter(sourceId: string): void { }
}
